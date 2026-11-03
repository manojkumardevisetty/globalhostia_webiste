// Minimal A2A (Agent2Agent) server, JSON-RPC binding: https://a2a-protocol.org/latest/specification/
// Accepts SendMessage (v1.0) and message/send (v0.3). Stateless: every request returns a single agent Message
// (no tasks, streaming or push). The reply has a text part and a data part with the structured results.
// Skills: product questions and plan recommendations (via /ask), domain availability (check_domain), policies.
import { ask } from '@/lib/agents/ask';
import { checkDomain, domainLimit, validDomain } from '@/lib/agents/domain';
import { agentData } from '@/lib/agents/catalog';
import { policies } from '@/lib/agents/policies';
import { CORS, clientIp, limiter } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

const rpcLimit = limiter(30, 60_000);
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (id: unknown, code: number, message: string, status = 200) => out({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status);

function textOfParts(parts: any[]): string {
  return (Array.isArray(parts) ? parts : []).map((p) => (typeof p?.text === 'string' ? p.text : p?.kind === 'text' ? String(p.text || '') : '')).join(' ').trim().slice(0, 300);
}

async function reply(text: string, ip: string) {
  const m = text.match(/\b(?:is|check|available|availability|register)\b.*?\b([a-z0-9-]+\.[a-z.]{2,})\b/i);
  const dom = m ? validDomain(m[1]) : null;
  if (dom && !/globalhostia\.com$/.test(dom)) {
    if (domainLimit(ip)) return { text: 'Domain lookup rate limit reached; try again in a minute.', data: { error: 'rate_limited' } };
    const r = await checkDomain(dom);
    if (r.ok) return { text: r.available ? `${r.domain} is available: ${r.register !== null ? `${r.register.toFixed(2)} ${r.currency} first year` : 'price in cart'}${r.renew !== null ? `, renews ${r.renew.toFixed(2)} ${r.currency}/year` : ''}. Add to cart: ${r.addToCartUrl}` : `${r.domain} is already registered.`, data: r };
  }
  if (/\b(refund|money.?back|vat|tax|renewal|cancel)/i.test(text)) {
    const d = await agentData();
    const p = policies(d.cat.settings, d.site, d.cat.base);
    return { text: p.policies.map((x) => `${x.title}: ${x.summary}`).join('\n') + `\nSource: ${p.source}`, data: p };
  }
  const r = await ask(text, { limit: 5 });
  return {
    text: r.results.length ? `Results from GlobalHostia (prices in ${r.currency}):\n${r.results.map((x, i) => `${i + 1}. ${x.name}: ${x.description} ${x.url}`).join('\n')}` : 'Nothing matched. Try describing what you want to host, e.g. "WordPress hosting under 10 USD a month".',
    data: r,
  };
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const wait = rpcLimit(ip);
  if (wait) return err(null, -32000, `Rate limit exceeded; retry in ${wait}s`, 429);
  let m: any;
  try { const raw = await req.text(); if (raw.length > 32_768) return err(null, -32600, 'Request too large', 413); m = JSON.parse(raw); }
  catch { return err(null, -32700, 'Parse error', 400); }
  if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return err(m?.id, -32600, 'Invalid Request');
  const v1 = m.method === 'SendMessage';
  if (!v1 && m.method !== 'message/send') {
    if (/^(SendStreamingMessage|message\/stream)$/.test(m.method)) return err(m.id, -32004, 'Streaming is not supported by this agent (capabilities.streaming=false)');
    if (/^(GetTask|CancelTask|tasks\/get|tasks\/cancel|ListTasks)$/.test(m.method)) return err(m.id, -32001, 'Task not found: this agent answers synchronously and keeps no tasks');
    if (/PushNotification/i.test(m.method)) return err(m.id, -32003, 'Push notifications are not supported');
    return err(m.id, -32601, `Method not found: ${m.method}`);
  }
  const msg = m.params?.message;
  const text = textOfParts(msg?.parts);
  if (!text) return err(m.id, -32602, 'params.message.parts must contain a text part');
  let r: { text: string; data: unknown };
  try { r = await reply(text, ip); } catch { return err(m.id, -32603, 'The store is temporarily unavailable'); }
  const messageId = `gh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const contextId = typeof msg?.contextId === 'string' ? msg.contextId : undefined;
  const message = v1
    ? { messageId, role: 'ROLE_AGENT', ...(contextId ? { contextId } : {}), parts: [{ text: r.text }, { data: r.data, mediaType: 'application/json' }] }
    : { kind: 'message', messageId, role: 'agent', ...(contextId ? { contextId } : {}), parts: [{ kind: 'text', text: r.text }, { kind: 'data', data: r.data }] };
  return out({ jsonrpc: '2.0', id: m.id ?? null, result: v1 ? { message } : message });
}

export function GET() {
  return new Response(JSON.stringify({ a2a: true, agentCard: '/.well-known/agent-card.json', binding: 'JSONRPC', methods: ['SendMessage', 'message/send'] }), { headers: { ...CORS, 'content-type': 'application/json' } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
