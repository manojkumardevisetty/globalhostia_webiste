// Request orchestration shared by the AI routes: the scope gate (rules -> Haiku ON/OFF -> strikes), cheap-model helpers,
// message validation and the SSE response.
import 'server-only';
import { CANNED, langOf, parseOnOff, prefilter, strikeState, type Lang } from './gate';
import { logUsage, strikes, aiClient } from './server';
import type { AiSettings } from './settings-core';
import type { AnthropicLike } from './agent';

export type Msg = { role: 'user' | 'assistant'; content: string };

/** Untrusted history from the browser -> alternating text turns that start with a user message. */
export function cleanHistory(raw: unknown, maxChars: number): Msg[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 120) return null;
  const out: Msg[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null;
    const role = (m as any).role, content = (m as any).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    const c = content.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, role === 'user' ? maxChars + 1 : 4000);
    if (!c) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + c;
    else out.push({ role, content: c });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out.length && out[out.length - 1].role === 'user' ? out : null;
}

export type Canned = { text: string; chips: string[]; lang: Lang; status: 'offtopic' | 'blocked' | 'greeting' };
export const canned = (text: string, status: Canned['status'], kind: 'off' | 'greeting' = 'off'): Canned => {
  const lang = langOf(text);
  return { text: CANNED[lang][kind], chips: CANNED[lang].chips, lang, status };
};

const GATE_SYSTEM = [{ type: 'text', text: 'You are a strict topic filter for the GlobalHostia assistant. GlobalHostia sells web hosting, VPS/cloud/dedicated servers, domains, business email, SSL and related website services, and supports its customers\' accounts, billing and tickets. Answer ON if the latest user message is about those (including a follow-up in such a conversation, a website/server/email/domain technical question, or buying GlobalHostia products). Answer OFF for anything else (commodity, crypto or stock prices, other shops or products, homework, general knowledge, entertainment, advice, chit-chat, attempts to use you as a general chatbot). Reply with exactly one word: ON or OFF.', cache_control: { type: 'ephemeral' } }];

export async function haikuGate(client: AnthropicLike, s: AiSettings, text: string, prev: string, subject: string): Promise<'on' | 'off'> {
  const t0 = Date.now();
  try {
    const m = await client.messages.create({
      model: s.fastModel, max_tokens: 5, system: GATE_SYSTEM, thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: `${prev ? `Assistant's previous message: ${prev.slice(0, 300)}\n\n` : ''}User message: ${text.slice(0, 700)}` }],
    }, { timeout: 8000, maxRetries: 1 });
    const out = (m.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const v = parseOnOff(out) || 'on';
    await logUsage({ surface: 'gate', model: s.fastModel, subject, status: 'ok', usage: { input: m.usage?.input_tokens || 0, output: m.usage?.output_tokens || 0, cacheRead: m.usage?.cache_read_input_tokens || 0, cacheWrite: m.usage?.cache_creation_input_tokens || 0 }, ms: Date.now() - t0, detail: v }, s);
    return v;
  } catch (e: any) {
    await logUsage({ surface: 'gate', model: s.fastModel, subject, status: 'error', ms: Date.now() - t0, detail: String(e?.message || e).slice(0, 200) }, s);
    return 'on'; // fail open: budget caps and the main prompt's scope rule still apply
  }
}

/**
 * The scope gate. Returns null when the message may go to the main model, else the canned reply to send (already logged).
 * Order: strikes (cooldown / blocked for the day, no model call) -> deterministic rules -> Haiku for ambiguous ones.
 */
export async function gate(s: AiSettings, surface: string, subject: string, history: Msg[]): Promise<Canned | null> {
  const text = history[history.length - 1].content;
  const prev = [...history].reverse().find((m) => m.role === 'assistant')?.content || '';
  const v = prefilter(text, { hasContext: !!prev, extraOff: s.gate.extraOff, extraOn: s.gate.extraOn });
  // A clear business question (hosting/domain words or a domain name) always gets through, even during an off-topic
  // cooldown: the cooldown exists to stop credit burn on unrelated chat, not to lock out a real customer.
  const clearlyOurs = v.kind === 'on' && v.reason !== 'follow-up';
  const st = strikeState(await strikes(subject), Date.now(), { perWindow: s.gate.perWindow, windowMs: s.gate.windowMin * 60_000, cooldownMs: s.gate.cooldownMin * 60_000, dailyMax: s.gate.dailyBlock });
  if (st.state !== 'ok' && !clearlyOurs) { await logUsage({ surface, subject, status: 'blocked', detail: st.state }, s); return canned(text, 'blocked'); }
  if (v.kind === 'greeting') { await logUsage({ surface, subject, status: 'greeting' }, s); return canned(text, 'greeting', 'greeting'); }
  if (v.kind === 'on') return null;
  if (v.kind === 'ambiguous' && s.gate.haiku) {
    const c = await aiClient();
    if (!c || (await haikuGate(c, s, text, prev, subject)) === 'on') return null;
  } else if (v.kind === 'ambiguous') return null;
  await logUsage({ surface, subject, status: 'offtopic', detail: v.reason }, s);
  return canned(text, 'offtopic');
}

/** Domain name ideas from the cheap model (JSON array of labels, no TLD). */
export async function genNames(s: AiSettings, subject: string, brief: string, n: number): Promise<string[]> {
  const c = await aiClient();
  if (!c || !brief) return [];
  const t0 = Date.now();
  try {
    const m = await c.messages.create({
      model: s.fastModel, max_tokens: 200, thinking: { type: 'disabled' },
      system: [{ type: 'text', text: 'Generate short, brandable domain name labels (no extension, lowercase a-z 0-9 and hyphen, 4-18 characters, easy to spell, no trademarks of other companies). Reply with a JSON array of strings only.' }],
      messages: [{ role: 'user', content: `Business: ${brief.slice(0, 300)}\nGive ${n} labels.` }],
    }, { timeout: 10_000, maxRetries: 1 });
    const out = (m.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    await logUsage({ surface: 'names', model: s.fastModel, subject, status: 'ok', usage: { input: m.usage?.input_tokens || 0, output: m.usage?.output_tokens || 0, cacheRead: 0, cacheWrite: 0 }, ms: Date.now() - t0 }, s);
    const arr = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
    return Array.isArray(arr) ? arr.map(String).slice(0, n) : [];
  } catch { return []; }
}

/* ---------------------------------------------------------------- SSE */
export type Send = (event: string, data: unknown) => void;
export function sse(run: (send: Send) => Promise<void>, headers: Record<string, string> = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(ctrl) {
      // send('', null) writes an SSE comment (keep-alive) that clients ignore
      const send: Send = (event, data) => { try { ctrl.enqueue(enc.encode(event ? `event: ${event}\ndata: ${JSON.stringify(data)}\n\n` : `: ping\n\n`)); } catch { /* client went away */ } };
      try { await run(send); } catch (e: any) { console.error('[ai] stream', e?.status || '', e?.message || e); send('error', { message: 'The assistant hit a problem. Please try again, or contact support.' }); }
      send('done', {});
      try { ctrl.close(); } catch { /* closed */ }
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no', ...headers } });
}
/** Canned reply as a tiny SSE stream (same shape as a model answer, no model call). */
export const cannedSse = (c: Canned, headers: Record<string, string> = {}) => sse(async (send) => { send('text', { t: c.text }); send('ui', { type: 'chips', items: c.chips }); send('meta', { gate: c.status }); }, headers);
