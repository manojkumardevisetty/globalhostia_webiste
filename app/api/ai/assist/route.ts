// Customer assistant API for the account dashboard and the hosting panel (UI: public/hp/ai-assist.js, docs/ai/INTEGRATION.md).
// POST {messages, context?: {page, domain?, domainId?, serviceId?, invoiceId?, tab?, lang?}} -> text/event-stream
// (text, ui {type: 'proposal' | 'chips' | ...}, tool, meta, error, done). The context is re-resolved against the client's
// own domains / services (lib/ai/assist-context.ts) before it reaches the prompt.
// Auth: hosting-panel token or portal session (lib/ai/assist-auth.ts). Read tools are ownership-checked; changes come back
// as proposals the customer confirms, which the UI sends to the existing authenticated endpoints.
import type { NextRequest } from 'next/server';
import { aiClient, aiKeyPresent, aiSettings, budgetOk, burst, dailyCalls, logUsage, reqIp } from '@/lib/ai/server';
import { cannedSse, cleanHistory, gate, sse } from '@/lib/ai/run';
import { contextLine, parseAssistContext, resolveAssistContext } from '@/lib/ai/assist-context';
import { runAgent, trimHistory, type AiTool } from '@/lib/ai/agent';
import { assistSystem } from '@/lib/ai/prompts';
import { customerTools, type CustomerCtx } from '@/lib/ai/tools/customer-core';
import { publicTools } from '@/lib/ai/tools/public';
import { assistAuth } from '@/lib/ai/assist-auth';
import { cors } from '@/lib/hosting/context';
import { hashKey } from '@/lib/ai/server';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOP = ['recommend_plan', 'browse_category', 'get_product', 'check_domain', 'get_policies'];

export function OPTIONS(req: NextRequest) { return new Response(null, { status: 204, headers: cors(req) }); }

export async function POST(req: NextRequest) {
  { const blocked = await guard(req, 'ai'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const a = await assistAuth(req);
  if (!a.ok) return a.res;
  const { who } = a;
  const H = who.headers;
  const j = (b: unknown, status: number) => Response.json(b, { status, headers: H });
  const s = await aiSettings();
  if (!s.surfaces.assist || (!aiKeyPresent() && process.env.AI_MOCK !== '1')) return j({ error: 'offline', message: 'The assistant is offline right now. Open a ticket and our team will help.' }, 503);
  const subject = `client#${who.cid}`;
  const wait = burst(`assist:${who.cid}`, s.assist.burstPerMin);
  if (wait) return j({ error: 'rate_limited', message: `Too many messages. Try again in ${wait}s.` }, 429);
  let body: any;
  try { const raw = await req.text(); if (raw.length > 96_000) return j({ error: 'too_large' }, 413); body = JSON.parse(raw); } catch { return j({ error: 'bad_request' }, 400); }
  const hist = cleanHistory(body.messages, s.assist.maxChars);
  if (!hist) return j({ error: 'bad_request' }, 400);
  if (hist[hist.length - 1].content.length > s.assist.maxChars) return j({ error: 'too_long', message: `Please keep messages under ${s.assist.maxChars} characters.` }, 413);
  if (hist.filter((m) => m.role === 'user').length > s.assist.maxTurns) return j({ error: 'limit', message: 'This conversation is long; start a new one.' }, 429);
  const b = await budgetOk(s);
  if (!b.ok) { await logUsage({ surface: 'assist', subject, status: 'budget' }, s); return j({ error: 'offline', message: 'The assistant is offline right now. Open a ticket and our team will help.' }, 503); }
  const blocked = await gate(s, 'assist', subject, hist);
  // same as the website chat: the fixed line plus three chips, no model call
  if (blocked) return cannedSse(blocked, H);
  if ((await dailyCalls(subject)) >= s.assist.clientDailyCalls) return j({ error: 'limit', message: "You've reached today's assistant limit. Open a ticket and our team will help." }, 429);

  const client = (await aiClient())!;
  const raw = parseAssistContext(body.context);
  const [doms, svcs, owned] = await Promise.all([
    who.deps.domains(who.cid).catch(() => []), who.deps.services(who.cid).catch(() => []),
    who.deps.owned({ surface: 'assist', scopes: ['customer'], clientId: who.cid, via: who.via, deps: who.deps } as CustomerCtx).catch(() => [] as string[]),
  ]);
  const pc = resolveAssistContext(raw, { via: who.via, domains: doms, services: svcs, owned, tokenServiceId: who.hosting?.claims.sid });
  const ctx: CustomerCtx & Record<string, unknown> = {
    surface: 'assist', scopes: ['customer', 'public'], clientId: who.cid, via: who.via, deps: who.deps, serviceId: pc.serviceId,
    ip: reqIp(req), convKey: hashKey(subject), maxNameChecks: 10, currency: undefined,
  };
  const tools = [...customerTools, ...publicTools.filter((t) => SHOP.includes(t.name))] as AiTool<any>[];
  const dyn = `Today: ${new Date().toISOString().slice(0, 10)}. Signed in via ${who.via === 'hosting' ? 'the hosting panel (one hosting account; DNS, mailbox and SSL proposals available)' : 'the account dashboard (DNS proposals for domains managed here; mailboxes and SSL are in Manage hosting)'}. ${contextLine(pc)}`;
  return sse(async (send) => {
    const t0 = Date.now();
    const ping = setInterval(() => send('', null), 10_000); // SSE keep-alive comment
    let status = 'ok', err = '';
    let r: Awaited<ReturnType<typeof runAgent>> | null = null;
    try {
      r = await runAgent({
        client, model: s.chatModel, system: await assistSystem(s, dyn), tools, messages: trimHistory(hist, s.assist.historyTurns), ctx, maxTokens: s.assist.maxTokens, effort: s.effort,
        maxIterations: 5, timeoutMs: 40_000, signal: req.signal, deadline: t0 + (maxDuration - 8) * 1000, onText: (t) => send('text', { t }), onUi: (e) => send('ui', e), onTool: (name) => send('tool', { name }),
      });
    } catch (e: any) { status = 'error'; err = `${e?.status || ''} ${e?.message || e}`; console.warn('[ai] assist', err.slice(0, 200)); send('error', { message: 'The assistant hit a problem. Please try again, or open a ticket.' }); }
    finally { clearInterval(ping); }
    if (r && !r.text && r.stop === 'deadline') send('error', { message: 'That took longer than it should. Please try again, or open a ticket.' });
    await logUsage({ surface: 'assist', model: s.chatModel, subject, status, usage: r?.usage, ms: Date.now() - t0, tools: r?.tools, detail: err }, s);
  }, H);
}
