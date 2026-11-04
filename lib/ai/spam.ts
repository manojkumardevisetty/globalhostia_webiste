// Ticket spam filter: server wiring for lib/ai/spam-core.ts (database store, Claude Haiku classifier, settings, the run
// over awaiting tickets, the weekly owner summary and the hold that keeps the AI auto-reply away from spam).
// Triggered by lib/support-notify.ts checkTickets() BEFORE the owner notification and the AI ticket assistant, so a ticket
// closed as spam is neither emailed to the owner nor answered. checkTickets runs on: the WHMCS AfterCronJob hook ("tick",
// /api/reminders/webhook), the client-area ping (/api/support/ping), portal ticket open / reply, Admin dashboard and Support
// page visits, and the daily /api/cron/sync. Docs: docs/ai/TICKET-SPAM.md.
import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { setSetting } from '../settings';
import { whmcs, whmcsConfigured } from '../whmcs';
import { aiClient, aiSettings, budgetOk, logUsage } from './server';
import {
  normalizeSpam, screenTicket, holdFrom, restoreDecision, confirmDecision, parseSpamVerdict, SPAM_SCHEMA, SPAM_SYSTEM, SPAM_KEY, SPAM_STATE_KEY,
  type Decision, type SenderRow, type SpamConfig, type SpamDeps, type SpamStore, type Verdict,
} from './spam-core';
import type { AiSettings } from './settings-core';

const D = schema.aiSpamDecisions, S = schema.aiSpamSenders;
const noTable = (e: any) => String(e?.code || e?.cause?.code || '') === '42P01' || /ai_spam_/.test(String(e?.message || e?.cause?.message || ''));

export async function spamConfig(): Promise<SpamConfig> {
  try { const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, SPAM_KEY)); return normalizeSpam(r?.value ?? null); }
  catch { return normalizeSpam(null); }
}
export async function saveSpamConfig(c: SpamConfig) { await setSetting(SPAM_KEY, normalizeSpam(c)); }

const toDecision = (r: typeof D.$inferSelect): Decision => ({ ...r, confidence: r.confidence === null ? null : Number(r.confidence) });

export const dbStore: SpamStore = {
  async claim(d) {
    const got = await db.insert(D).values({ ticketId: d.ticketId, tid: d.tid, activity: d.activity }).onConflictDoNothing().returning({ id: D.id });
    if (got.length) return got[0].id;
    // a run that crashed mid-way (pending 10+ minutes) may be retried
    const re = await db.update(D).set({ updatedAt: new Date() })
      .where(and(eq(D.ticketId, d.ticketId), eq(D.activity, d.activity), eq(D.action, 'pending'), sql`${D.updatedAt} < now() - interval '10 minutes'`)).returning({ id: D.id });
    return re[0]?.id || null;
  },
  async save(id, p) {
    const { id: _i, createdAt: _c, confidence, ...rest } = p as any;
    await db.update(D).set({ ...rest, ...(confidence !== undefined ? { confidence: confidence === null ? null : Number(confidence).toFixed(3) } : {}), updatedAt: new Date() }).where(eq(D.id, id));
  },
  async get(id) { const [r] = await db.select().from(D).where(eq(D.id, id)); return r ? toDecision(r) : null; },
  async confirmed(by, value) {
    const [r] = await db.select({ n: sql<number>`count(distinct ${D.ticketId})::int` }).from(D)
      .where(and(eq(by === 'email' ? D.email : D.domain, value), eq(D.action, 'close'), inArray(D.state, ['active', 'confirmed'])));
    return Number(r?.n || 0);
  },
  async senders() { return (await db.select().from(S).limit(5000)) as SenderRow[]; },
  async addSender(r) { await db.insert(S).values(r).onConflictDoNothing(); },
  async removeSender(value, list) { await db.delete(S).where(and(eq(S.value, value), eq(S.list, list))); },
};

/** Haiku only, short prompt, body already cut to ~2,000 characters by spamPrompt. */
export function haikuModel(s: AiSettings) { return /haiku/.test(s.fastModel) ? s.fastModel : 'claude-haiku-5-5'; }

async function classifier(s: AiSettings): Promise<SpamDeps['classify']> {
  const c = await aiClient();
  if (!c || !(await budgetOk(s)).ok) return null;
  const model = haikuModel(s);
  return async (prompt, ticketId) => {
    // the budget can run out during a run
    if (!(await budgetOk(s)).ok) return { verdict: null, error: 'budget reached' };
    const t0 = Date.now();
    const params: any = {
      model, max_tokens: 120, thinking: { type: 'disabled' },
      system: [{ type: 'text', text: SPAM_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema: SPAM_SCHEMA } },
    };
    try {
      let m: any;
      try { m = await c.messages.create(params, { timeout: 20_000 }); }
      catch (e: any) {
        if (Number(e?.status) !== 400) throw e;
        const { output_config: _o, ...rest } = params;
        rest.system = [{ type: 'text', text: `${SPAM_SYSTEM}\nReply with JSON only: {"label": "legit|solicitation|scam|junk", "confidence": 0-1, "reason": "..."}` }];
        m = await c.messages.create(rest, { timeout: 20_000 });
      }
      await logUsage({ surface: 'tickets', model, subject: `ticket#${ticketId}`, status: 'ok', usage: { input: m.usage?.input_tokens || 0, output: m.usage?.output_tokens || 0, cacheRead: m.usage?.cache_read_input_tokens || 0, cacheWrite: m.usage?.cache_creation_input_tokens || 0 }, ms: Date.now() - t0, detail: 'spam' }, s);
      const text = (m.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      const verdict: Verdict | null = parseSpamVerdict(text);
      return verdict ? { verdict } : { verdict: null, error: 'invalid JSON from the model' };
    } catch (e: any) {
      await logUsage({ surface: 'tickets', model, subject: `ticket#${ticketId}`, status: 'error', ms: Date.now() - t0, detail: `spam ${e?.message || e}` }, s);
      return { verdict: null, error: String(e?.message || e) };
    }
  };
}

export async function spamDeps(withAi = true): Promise<SpamDeps> {
  const [cfg, s] = await Promise.all([spamConfig(), aiSettings(true)]);
  return {
    call: (a, p) => whmcs(a, p as any), store: dbStore, cfg,
    classify: withAi ? await classifier(s) : null,
    log: (m) => console.warn('[ai-spam]', m),
    saveCfg: saveSpamConfig,
  };
}

const whmcsTime = (s: string) => { const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return Number.isFinite(t) ? t : 0; };
export type AwaitingLite = { id: number; tid: string; userid?: number; date: string; lastreply: string; status: string };

/** Screens awaiting tickets that do not belong to a client account. Never throws. */
export async function screenAwaiting(list: AwaitingLite[], reason = 'notifier'): Promise<{ ran: number; results: string[] } | { skipped: string }> {
  try {
    if (!whmcsConfigured()) return { skipped: 'not-configured' };
    const d = await spamDeps();
    if (!d.cfg.enabled) return { skipped: 'off' };
    const since = Date.now() - d.cfg.maxAgeHours * 3600_000;
    const todo = list.filter((t) => !(Number(t.userid) > 0)) // client tickets: never screened (GetTicket re-checks)
      .filter((t) => { const w = whmcsTime(t.lastreply || t.date); return !w || w >= since; })
      .sort((a, b) => (a.lastreply || a.date).localeCompare(b.lastreply || b.date));
    const results: string[] = [];
    const until = Date.now() + (reason === 'cron' ? 45_000 : 25_000); // inside the notifier's 90s lock lease and the caller's time limit
    for (const t of todo) {
      if (results.filter((r) => r !== 'claimed').length >= d.cfg.perRun || Date.now() > until) break;
      results.push(await screenTicket(d, { id: t.id, tid: t.tid, activity: t.lastreply || t.date || t.status }));
    }
    if (results.some((r) => r !== 'claimed')) console.log(`[ai-spam] ${reason}: ${results.join(', ')}`);
    if (reason === 'cron') await weeklySummary().catch(() => {});
    return { ran: results.filter((r) => r !== 'claimed').length, results };
  } catch (e: any) {
    if (!noTable(e)) console.warn('[ai-spam]', e?.message || e);
    return { skipped: noTable(e) ? 'no-table' : 'error' };
  }
}

/**
 * For lib/ai/tickets.ts: true when the AI assistant must not draft or reply on this ticket activity: the spam filter is on,
 * the ticket has no client account, and it was flagged / closed as spam, or it has not been screened yet.
 */
export async function spamHold(t: { id: number; userid?: number }, activity: string): Promise<boolean> {
  if (Number(t.userid) > 0) return false;
  try {
    const cfg = await spamConfig();
    if (!cfg.enabled) return false;
    const rows = await db.select({ action: D.action, state: D.state, activity: D.activity }).from(D).where(eq(D.ticketId, t.id)).orderBy(desc(D.createdAt)).limit(20);
    return holdFrom(rows, activity, { enabled: true, userid: t.userid });
  } catch (e) { return !noTable(e); } // database trouble: hold (the assistant cannot record a run then anyway)
}

/* ------------------------------------------------------------------ admin */
export async function restoreSpam(id: string, who: string) { return restoreDecision(await spamDeps(false), id, who); }
export async function confirmSpam(id: string, who: string) { return confirmDecision(await spamDeps(false), id, who); }

export async function spamStats() {
  const q = async <T,>(p: Promise<unknown>, d: T): Promise<T> => { try { return (await p) as T; } catch { return d; } };
  const [days, week, queue] = await Promise.all([
    q<{ day: string; closed: number; flagged: number; screened: number }[]>(db.execute(sql`select to_char(date_trunc('day', created_at at time zone 'Asia/Dubai'), 'YYYY-MM-DD') as day,
      count(*) filter (where action = 'close')::int closed, count(*) filter (where action = 'flag')::int flagged, count(*) filter (where action <> 'pending')::int screened
      from ai_spam_decisions where created_at > now() - interval '14 days' group by 1 order by 1 desc`) as any, []),
    q<{ closed: number; flagged: number; restored: number; skipped: number; ai: number }[]>(db.execute(sql`select count(*) filter (where action = 'close')::int closed,
      count(*) filter (where action = 'flag')::int flagged, count(*) filter (where state = 'restored')::int restored, count(*) filter (where action = 'skip')::int skipped,
      count(*) filter (where source = 'ai')::int ai from ai_spam_decisions where created_at > now() - interval '7 days'`) as any, []),
    q<{ n: number }[]>(db.execute(sql`select count(*)::int n from ai_spam_decisions where action = 'flag' and state = 'active'`) as any, []),
  ]);
  return { days, week: week[0] || { closed: 0, flagged: 0, restored: 0, skipped: 0, ai: 0 }, queue: queue[0]?.n || 0 };
}

export async function spamLog(filter: 'all' | 'review' | 'closed' | 'flagged' = 'all', limit = 100): Promise<Decision[]> {
  const w = filter === 'review' ? and(eq(D.action, 'flag'), eq(D.state, 'active'))
    : filter === 'closed' ? eq(D.action, 'close') : filter === 'flagged' ? eq(D.action, 'flag') : sql`${D.action} <> 'pending'`;
  try { return (await db.select().from(D).where(w).orderBy(desc(D.createdAt)).limit(limit)).map(toDecision); } catch { return []; }
}
export async function spamSenders(): Promise<(SenderRow & { id: string; createdAt: Date })[]> {
  try { return (await db.select().from(S).orderBy(desc(S.createdAt)).limit(500)) as any; } catch { return []; }
}
export async function removeSpamSender(id: string) { await db.delete(S).where(eq(S.id, id)); }
export async function addSpamSender(r: SenderRow) { await dbStore.addSender(r); }
export async function spamTablesExist() { try { await db.execute(sql`select 1 from ai_spam_decisions limit 1`); return true; } catch { return false; } }

/* ------------------------------------------------------------------ weekly owner summary */
/** Once a week (from the daily cron run): one line to the owner, only when the filter did something or tickets wait for review. */
export async function weeklySummary(force = false) {
  const cfg = await spamConfig();
  if (!cfg.enabled || (!cfg.weeklyEmail && !force)) return { skipped: 'off' };
  const [st] = await db.select().from(schema.settings).where(eq(schema.settings.key, SPAM_STATE_KEY));
  const last = Date.parse(String((st?.value as any)?.weeklyAt || '')) || 0;
  if (!force && Date.now() - last < 6.5 * 86_400_000) return { skipped: 'recent' };
  const s = await spamStats();
  await setSetting(SPAM_STATE_KEY, { ...((st?.value as any) || {}), weeklyAt: new Date().toISOString() });
  if (!force && !s.week.closed && !s.week.flagged && !s.queue) return { skipped: 'nothing' };
  const { emailOwner, supportSettings } = await import('../support-notify');
  const site = (await supportSettings()).siteUrl;
  const line = `Ticket spam filter, last 7 days: ${s.week.closed} auto-closed, ${s.week.flagged} flagged, ${s.week.restored} restored as not spam; ${s.queue} waiting for your review.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#101828;max-width:560px">
<p style="margin:0 0 14px">${line}</p><p style="margin:0"><a href="${site}/admin/assistant/spam" style="color:#473bf0;font-weight:600">Review in GlobalHostia admin &rarr;</a></p></div>`;
  return emailOwner(`Ticket spam filter: ${s.week.closed} closed, ${s.queue} to review`, html);
}
