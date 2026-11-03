// Website pre-sales chat (public/hp/ai-chat.js). POST {messages, page, currency, cart, conv, hp, typedMs, turnstile?, pass?}
// -> text/event-stream: text {t}, ui {type...}, tool {name}, meta {...}, error {message}, done.
// Guards, in order: same origin, kill switch, honeypot, burst limit, message caps, turn cap, typing time, Turnstile (optional),
// API key + budget, per-IP daily model calls, scope gate (rules -> Haiku -> strikes). Only then Sonnet with the shop tools.
import { createHmac } from 'node:crypto';
import { aiClient, aiKeyPresent, aiSettings, budgetOk, burst, dailyCalls, hashKey, ipSubject, logUsage, reqIp } from '@/lib/ai/server';
import { cannedSse, cleanHistory, gate, genNames, sse, canned } from '@/lib/ai/run';
import { runAgent, trimHistory } from '@/lib/ai/agent';
import { chatSystem } from '@/lib/ai/prompts';
import { publicTools, type ShopCtx } from '@/lib/ai/tools/public';
import { createHandoff } from '@/lib/ai/handoff';
import { json, offline, sameSite } from '@/lib/ai/http';
import { CANNED, langOf } from '@/lib/ai/gate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const passFor = (ip: string, exp: number) => `${exp}.${createHmac('sha256', process.env.AUTH_SECRET || 'gh').update(`ai-pass:${ip}:${exp}`).digest('base64url').slice(0, 32)}`;
const passOk = (ip: string, p: unknown) => { if (typeof p !== 'string') return false; const exp = Number(p.split('.')[0]); return exp > Date.now() / 1000 && passFor(ip, exp) === p; };
async function turnstileOk(secret: string, token: unknown, ip: string) {
  if (typeof token !== 'string' || token.length > 4096) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(6000) });
    return !!(await r.json())?.success;
  } catch { return false; }
}

export async function POST(req: Request) {
  if (!sameSite(req)) return json({ error: 'forbidden' }, 403);
  const s = await aiSettings();
  if (!s.surfaces.chat) return offline('disabled');
  let body: any;
  try { const raw = await req.text(); if (raw.length > 64_000) return json({ error: 'too_large' }, 413); body = JSON.parse(raw); } catch { return json({ error: 'bad_request' }, 400); }
  const ip = reqIp(req), subject = ipSubject(req), ipHash = subject.slice(3);

  // bots: honeypot filled -> pretend all is well, spend nothing
  if (typeof body.hp === 'string' && body.hp.trim()) return cannedSse(canned('', 'offtopic'));
  const wait = burst(`chat:${ipHash}`, s.chat.burstPerMin);
  if (wait) return json({ error: 'rate_limited', message: `You're sending messages quickly. Try again in ${wait}s.` }, 429);

  const hist = cleanHistory(body.messages, s.chat.maxChars);
  if (!hist) return json({ error: 'bad_request' }, 400);
  const last = hist[hist.length - 1].content;
  if (last.length > s.chat.maxChars) return json({ error: 'too_long', message: `Please keep messages under ${s.chat.maxChars} characters.` }, 413);
  const lang = langOf(last);
  const turns = hist.filter((m) => m.role === 'user').length;
  if (turns > s.chat.maxTurns) {
    await logUsage({ surface: 'chat', subject, status: 'limited', detail: 'turns' }, s);
    return cannedSse({ text: lang === 'ar' ? 'وصلت هذه المحادثة إلى الحد الأقصى. ابدأ محادثة جديدة أو تحدث مع فريقنا.' : 'This chat has reached its limit. Start a new chat or talk to our team.', chips: [CANNED[lang].chips[2]], lang, status: 'blocked' });
  }
  if (turns === 1 && Number(body.typedMs) >= 0 && Number(body.typedMs) < s.chat.minTypingMs) return json({ error: 'slow_down', message: 'Please try again.' }, 429);

  // optional Cloudflare Turnstile: verified once, then a signed 1-hour pass rides along with each message
  let pass: string | null = null;
  if (s.chat.turnstileSiteKey && s.chat.turnstileSecret && !passOk(ip, body.pass)) {
    if (!(await turnstileOk(s.chat.turnstileSecret, body.turnstile, ip))) return json({ error: 'challenge', siteKey: s.chat.turnstileSiteKey }, 401);
    pass = passFor(ip, Math.floor(Date.now() / 1000) + 3600);
  }

  if (!aiKeyPresent() && process.env.AI_MOCK !== '1') return offline('no_key');
  const b = await budgetOk(s);
  if (!b.ok) { await logUsage({ surface: 'chat', subject, status: 'budget', detail: b.reason }, s); return offline('budget'); }

  const blocked = await gate(s, 'chat', subject, hist);
  if (blocked) return cannedSseWithPass(blocked, pass);
  if ((await dailyCalls(subject)) >= s.chat.ipDailyCalls) {
    await logUsage({ surface: 'chat', subject, status: 'limited', detail: 'daily' }, s);
    return cannedSseWithPass({ text: lang === 'ar' ? 'وصلت إلى حد المحادثة اليومي. فريقنا جاهز للمساعدة.' : "You've reached today's chat limit. Our team is happy to help.", chips: [CANNED[lang].chips[2]], lang, status: 'blocked' }, pass);
  }

  const client = (await aiClient())!;
  const conv = typeof body.conv === 'string' && /^[\w-]{6,64}$/.test(body.conv) ? body.conv : 'anon';
  const cart = (Array.isArray(body.cart) ? body.cart : []).slice(0, 20).map((x: any) => String(x?.key || '')).filter((k: string) => /^(p:[a-z0-9-]{1,121}:[a-z]{3,14}|d:[a-z0-9.-]{3,253})$/.test(k));
  const page = typeof body.page === 'string' ? body.page.slice(0, 200).replace(/[^\w\-/.?=&%]/g, '') : '/';
  const country = (req.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : undefined;
  const history = trimHistory(hist, s.chat.historyTurns);
  const ctx: ShopCtx = {
    surface: 'chat', scopes: ['public'], ip, currency, country, convKey: hashKey(`${ipHash}:${conv}`), maxNameChecks: s.chat.nameChecksPerConversation, cartSlugs: cart.filter((k: string) => k.startsWith('p:')).map((k: string) => k.split(':')[1]),
    genNames: (brief, n) => genNames(s, subject, brief, n),
    handoff: (i) => createHandoff(s, { ...i, transcript: hist, page, ipHash, country }),
  };
  const dyn = `Today: ${new Date().toISOString().slice(0, 10)}. Visitor currency: ${currency || 'site default'}. Visitor country: ${country || 'unknown'}. Page: ${page}. Chat cart: ${cart.length ? cart.join(', ') : 'empty'}. Language of the last message: ${lang === 'ar' ? 'Arabic' : 'detect from the message'}.`;

  return sse(async (send) => {
    if (pass) send('meta', { pass });
    const t0 = Date.now();
    let status = 'ok', err = '';
    let r: Awaited<ReturnType<typeof runAgent>> | null = null;
    try {
      r = await runAgent({
        client, model: s.chatModel, system: await chatSystem(s, dyn), tools: publicTools, messages: history, ctx, maxTokens: s.chat.maxTokens, effort: s.effort, maxIterations: 4, timeoutMs: 40_000, signal: req.signal,
        onText: (t) => send('text', { t }), onUi: (e) => send('ui', e), onTool: (name) => send('tool', { name }),
      });
    } catch (e: any) { status = 'error'; err = `${e?.status || ''} ${e?.message || e}`; send('error', { message: 'The assistant hit a problem. Please try again in a moment, or talk to our team.' }); }
    await logUsage({ surface: 'chat', model: s.chatModel, subject, status, usage: r?.usage, ms: Date.now() - t0, tools: r?.tools, detail: err }, s);
  });
}

function cannedSseWithPass(c: Parameters<typeof cannedSse>[0], pass: string | null) {
  return sse(async (send) => { if (pass) send('meta', { pass }); send('text', { t: c.text }); send('ui', { type: 'chips', items: c.chips }); send('meta', { gate: c.status }); });
}
