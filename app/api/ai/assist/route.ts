// Customer assistant API for the account dashboard and the hosting panel (UI: public/hp/ai-assist.js, docs/ai/INTEGRATION.md).
// POST {messages, context?: {domain?}} -> text/event-stream (text, ui {type: 'proposal' | 'plans' | ...}, tool, meta, error, done).
// Auth: hosting-panel token or portal session (lib/ai/assist-auth.ts). Read tools are ownership-checked; changes come back
// as proposals the customer confirms, which the UI sends to the existing authenticated endpoints.
import type { NextRequest } from 'next/server';
import { aiClient, aiKeyPresent, aiSettings, budgetOk, burst, dailyCalls, logUsage, reqIp } from '@/lib/ai/server';
import { cleanHistory, gate, sse } from '@/lib/ai/run';
import { runAgent, trimHistory, type AiTool } from '@/lib/ai/agent';
import { assistSystem } from '@/lib/ai/prompts';
import { customerTools, type CustomerCtx } from '@/lib/ai/tools/customer-core';
import { publicTools } from '@/lib/ai/tools/public';
import { assistAuth } from '@/lib/ai/assist-auth';
import { cors } from '@/lib/hosting/context';
import { hashKey } from '@/lib/ai/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHOP = ['recommend_plan', 'browse_category', 'get_product', 'check_domain', 'get_policies'];

export function OPTIONS(req: NextRequest) { return new Response(null, { status: 204, headers: cors(req) }); }

export async function POST(req: NextRequest) {
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
  if (blocked) return sse(async (send) => { send('text', { t: blocked.text }); send('meta', { gate: blocked.status }); }, H);
  if ((await dailyCalls(subject)) >= s.assist.clientDailyCalls) return j({ error: 'limit', message: "You've reached today's assistant limit. Open a ticket and our team will help." }, 429);

  const client = (await aiClient())!;
  const ctxDomain = typeof body.context?.domain === 'string' ? body.context.domain.toLowerCase().slice(0, 253).replace(/[^a-z0-9.-]/g, '') : '';
  const ctx: CustomerCtx & Record<string, unknown> = {
    surface: 'assist', scopes: ['customer', 'public'], clientId: who.cid, via: who.via, deps: who.deps,
    ip: reqIp(req), convKey: hashKey(subject), maxNameChecks: 10, currency: undefined,
  };
  const tools = [...customerTools, ...publicTools.filter((t) => SHOP.includes(t.name))] as AiTool<any>[];
  const dyn = `Today: ${new Date().toISOString().slice(0, 10)}. Signed in via ${who.via === 'hosting' ? 'the hosting panel (one hosting account; DNS, mailbox and SSL proposals available)' : 'the account dashboard (DNS proposals for domains managed here; mailboxes and SSL are in Manage hosting)'}.${ctxDomain ? ` The customer is looking at ${ctxDomain}.` : ''}`;
  return sse(async (send) => {
    const t0 = Date.now();
    let status = 'ok', err = '';
    let r: Awaited<ReturnType<typeof runAgent>> | null = null;
    try {
      r = await runAgent({
        client, model: s.chatModel, system: await assistSystem(s, dyn), tools, messages: trimHistory(hist, s.assist.historyTurns), ctx, maxTokens: s.assist.maxTokens, effort: s.effort,
        maxIterations: 5, timeoutMs: 40_000, signal: req.signal, onText: (t) => send('text', { t }), onUi: (e) => send('ui', e), onTool: (name) => send('tool', { name }),
      });
    } catch (e: any) { status = 'error'; err = `${e?.status || ''} ${e?.message || e}`; send('error', { message: 'The assistant hit a problem. Please try again, or open a ticket.' }); }
    await logUsage({ surface: 'assist', model: s.chatModel, subject, status, usage: r?.usage, ms: Date.now() - t0, tools: r?.tools, detail: err }, s);
  }, H);
}
