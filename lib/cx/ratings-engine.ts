// Ticket ratings: server wiring. Closed tickets are found by polling WHMCS (GetTickets status=Closed) from the WHMCS cron
// tick and /api/cron/feedback, so nothing new has to be uploaded to WHMCS. Each ticket gets one row in ticket_ratings (unique
// ticket id): tickets the spam filter closed or flagged (ai_spam_decisions, lib/ai/spam.ts), guests, excluded departments
// and tickets closed before the switch-on are stored as skipped and never asked. Requests go out through the reminders
// delivery (quiet hours, shared caps, unsubscribe scope "rating", reminders_log kind "rating"); a 1–2 star answer emails
// the owner at once with the ticket link. Ratings arrive on /account/rate (signed link, no login) or the portal ticket page.
import 'server-only';
import { and, desc, eq, gt, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured } from '../whmcs';
import { getClientsDetails } from '../portal/api';
import * as rstore from '../reminders/store';
import { sendableNow, withinCaps, spacedEnough, signUnsub } from '../reminders/core';
import { sendEmail, transportReady } from '../reminders/send';
import { supportSettings } from '../support-notify';
import { createId } from '../id';
import { siteUrl, langOf } from './report-engine';
import {
  normalizeRatings, triage, staffOf, isLow, signRate, summary, trend, perStaff, cleanComment,
  type RatingsConfig, type ClosedTicket, type RateClaims, type Lang,
} from './ratings-core';
import { ratingEmail, lowRatingAlert } from './ratings-email';

const CFG_KEY = 'cx_ratings', STATE_KEY = 'cx_ratings_state', LOCK_KEY = 'cx_ratings_lock';
const T = schema.ticketRatings;
const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const firstName = (c: any) => String(c?.firstname || '').trim() || String(c?.fullname || '').split(' ')[0] || '';

async function readKey<V>(key: string): Promise<V | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as V | undefined;
}
async function writeKey(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}
export async function loadRatingsConfig(): Promise<RatingsConfig> { return normalizeRatings(await readKey(CFG_KEY).catch(() => undefined)); }
export async function saveRatingsConfig(c: RatingsConfig) { await writeKey(CFG_KEY, normalizeRatings(c)); }
export type RatingsState = { lastRun?: string; lastResult?: unknown; lastPoll?: string };
export async function ratingsState(): Promise<RatingsState> { return (await readKey<RatingsState>(STATE_KEY).catch(() => undefined)) || {}; }
async function patchState(p: Partial<RatingsState>) {
  await db.execute(sql`insert into settings (key, value) values (${STATE_KEY}, ${JSON.stringify(p)}::jsonb) on conflict (key) do update set value = settings.value || excluded.value`).catch(() => {});
}
async function acquire(leaseSec: number) {
  const value = JSON.stringify({ until: new Date(Date.now() + leaseSec * 1000).toISOString() });
  const got = await db.execute(sql`insert into settings (key, value) values (${LOCK_KEY}, ${value}::jsonb) on conflict (key) do update set value = excluded.value
    where coalesce((settings.value->>'until')::timestamptz, 'epoch'::timestamptz) < now() returning key`);
  return (got as any).length > 0;
}
async function release() { await db.execute(sql`update settings set value = jsonb_build_object('until', (now() - interval '1 second')::text) where key = ${LOCK_KEY}`).catch(() => {}); }

/** Switching requests on starts the clock: tickets closed before now are never asked (no burst of old tickets). */
export async function setEnabled(on: boolean) {
  const c = await loadRatingsConfig();
  await saveRatingsConfig({ ...c, enabled: on, since: on && !c.enabled ? new Date().toISOString() : c.since });
}

/** Ticket the spam filter closed or flagged (and nobody restored): never asked for a rating. No table yet = not spam. */
async function spamMarked(ticketId: number): Promise<boolean> {
  try {
    const r = await db.execute(sql`select 1 from ai_spam_decisions where ticket_id = ${ticketId} and action in ('close', 'flag') and state <> 'restored' limit 1`);
    return (r as any).length > 0;
  } catch { return false; }
}

/* ================================================================ poll + send */
const toClosed = (t: any): ClosedTicket => ({ id: Number(t.id ?? t.ticketid), tid: String(t.tid || ''), userid: Number(t.userid || 0), deptid: Number(t.deptid || 0), subject: String(t.subject || '').slice(0, 300), status: String(t.status || ''), lastreply: String(t.lastreply || ''), date: String(t.date || '') });

async function poll(cfg: RatingsConfig, res: RatingsRun) {
  const r = await whmcs('GetTickets', { status: 'Closed', limitnum: 100 });
  const list = arr(r.tickets?.ticket).map(toClosed).filter((t) => t.id > 0);
  res.polled = list.length;
  if (!list.length) return;
  const known = new Set((await db.select({ id: T.ticketId }).from(T).where(inArray(T.ticketId, list.map((t) => t.id)))).map((x) => x.id));
  const now = Date.now();
  for (const t of list) {
    if (known.has(t.id)) continue;
    const d = triage(t, { cfg, now, spam: await spamMarked(t.id) });
    await db.insert(T).values({ id: createId(), ticketId: t.id, tid: t.tid, clientId: t.userid, subject: t.subject, deptId: t.deptid, status: d.ask ? 'pending' : 'skipped', reason: d.ask ? '' : d.reason })
      .onConflictDoNothing();
    if (d.ask) res.queued++; else res.skipped[d.reason] = (res.skipped[d.reason] || 0) + 1;
  }
}

const WHY: Record<Lang, string> = { en: 'You get this because you opened a support ticket with GlobalHostia. We ask once per ticket.', ar: 'تصلك هذه الرسالة لأنك فتحت تذكرة دعم لدى GlobalHostia. نسأل مرة واحدة لكل تذكرة.' };
export function requestMail(site: string, secret: string, o: { ticketId: number; clientId: number; tid: string; subject: string; staff: string; email: string; name: string; lang: Lang }) {
  // ticket 0 = the admin preview / test email: its score buttons open the rating page in demo mode (nothing is saved)
  const tok = o.ticketId > 0 ? signRate({ ticketId: o.ticketId, clientId: o.clientId }, secret) : 'demo';
  const u = signUnsub({ e: o.email, c: o.clientId, s: 'rating' }, secret);
  const unsubUrl = `${site}/account/unsubscribe?t=${u}`;
  const m = ratingEmail({ lang: o.lang, name: o.name, tid: o.tid, subject: o.subject, staff: o.staff, rateUrl: `${site}/account/rate?t=${tok}&lang=${o.lang}`, footer: { unsubUrl, prefsUrl: `${site}/account/settings#reminders`, why: WHY[o.lang] } });
  return { ...m, unsubUrl, unsubPost: `${unsubUrl}&one-click=1` };
}

async function sendPending(cfg: RatingsConfig, res: RatingsRun, deadline: number) {
  const rcfg = await rstore.loadConfig();
  if (!transportReady(rcfg)) { res.skipped['transport-not-ready'] = 1; return; }
  // pending past the retry window (quiet hours / caps kept them back): stop asking
  await db.update(T).set({ status: 'skipped', reason: 'expired', updatedAt: new Date() }).where(and(eq(T.status, 'pending'), lt(T.createdAt, new Date(Date.now() - cfg.maxAgeDays * 86400_000))));
  const rows = await db.select().from(T).where(eq(T.status, 'pending')).orderBy(T.createdAt).limit(40);
  const site = await siteUrl(), secret = rstore.linkSecret();
  const skip = (w: string) => { res.skipped[w] = (res.skipped[w] || 0) + 1; };
  const set = (id: string, v: Partial<typeof T.$inferInsert>) => db.update(T).set({ ...v, updatedAt: new Date() }).where(eq(T.id, id));
  for (const row of rows) {
    if (Date.now() > deadline || res.sent >= 25) { skip('deadline'); break; }
    const client = await getClientsDetails(row.clientId).catch(() => null);
    if (!client?.email) { skip('client-lookup'); continue; }
    const email = String(client.email), lang = langOf(client);
    if (/^(closed|inactive)$/i.test(String(client.status || ''))) { await set(row.id, { status: 'skipped', reason: 'client-inactive', email }); continue; }
    if (rstore.blocks(await rstore.suppressedScopes(email), 'rating')) { await set(row.id, { status: 'skipped', reason: 'unsubscribed', email }); skip('unsubscribed'); continue; }
    if (!sendableNow(Date.now(), client.countrycode || client.country, rcfg.quiet)) { skip('quiet-hours'); continue; }
    const recent = await rstore.recentSends(row.clientId, email);
    if (!withinCaps(recent, Date.now(), rcfg.caps) || !spacedEnough(recent, Date.now())) { skip('cap'); continue; }
    const tk = await whmcs('GetTicket', { ticketid: row.ticketId, repliessort: 'ASC' }).catch(() => null);
    if (!tk) { skip('ticket-lookup'); continue; }
    if (Number(tk.userid) !== row.clientId) { await set(row.id, { status: 'skipped', reason: 'owner-changed' }); continue; }
    if (!/^closed$/i.test(String(tk.status || ''))) { await set(row.id, { status: 'skipped', reason: 'reopened' }); skip('reopened'); continue; }
    if (await spamMarked(row.ticketId)) { await set(row.id, { status: 'skipped', reason: 'spam' }); skip('spam'); continue; }
    const staff = staffOf(arr(tk.replies?.reply));
    const mail = requestMail(site, secret, { ticketId: row.ticketId, clientId: row.clientId, tid: row.tid || String(tk.tid || row.ticketId), subject: row.subject || String(tk.subject || ''), staff, email, name: firstName(client), lang });
    const id = await rstore.claim({ kind: 'rating', clientId: row.clientId, email, item: `tk:${row.ticketId}`, stage: 'ask', channel: 'email', cycle: '', messageId: createId(), detail: { tid: row.tid, staff } });
    if (!id) { await set(row.id, { status: 'sent', email, staff, lang }); continue; } // already sent by an earlier run
    const r = await sendEmail(rcfg, { clientId: row.clientId, to: email, subject: mail.subject, html: mail.html, text: mail.text, unsubUrl: mail.unsubUrl, unsubPost: mail.unsubPost, lang });
    await rstore.finish([id], r.ok, r.error);
    await set(row.id, r.ok ? { status: 'sent', sentAt: new Date(), email, staff, lang } : { status: 'failed', reason: String(r.error || 'send failed').slice(0, 200), email, staff, lang });
    if (r.ok) res.sent++; else res.failed++;
  }
}

export type RatingsRun = { ok: boolean; stopped?: string; polled: number; queued: number; sent: number; failed: number; skipped: Record<string, number>; ms?: number; error?: string };
export async function runRatings(reason = 'manual', o: { deadlineMs?: number } = {}): Promise<RatingsRun> {
  const t0 = Date.now();
  const res: RatingsRun = { ok: true, polled: 0, queued: 0, sent: 0, failed: 0, skipped: {} };
  let cfg: RatingsConfig;
  try { cfg = await loadRatingsConfig(); } catch (e: any) { return { ...res, ok: false, error: `config: ${e?.message || e}` }; }
  if (!cfg.enabled) return { ...res, stopped: 'disabled' };
  if (!whmcsConfigured()) return { ...res, ok: false, stopped: 'whmcs-not-configured' };
  const deadlineMs = o.deadlineMs ?? 45_000;
  if (!(await acquire(Math.ceil(deadlineMs / 1000) + 30).catch(() => false))) return { ...res, stopped: 'busy' };
  try {
    await poll(cfg, res);
    await patchState({ lastPoll: new Date().toISOString() });
    await sendPending(cfg, res, t0 + deadlineMs - 5_000);
  } catch (e: any) { res.ok = false; res.error = String(e?.message || e).slice(0, 300); }
  finally { await release(); }
  res.ms = Date.now() - t0;
  await patchState({ lastRun: new Date().toISOString(), lastResult: { reason, ...res } });
  return res;
}

/* ================================================================ answers */
export class RateError extends Error { constructor(public code: 'not-found' | 'not-closed' | 'not-yours' | 'disabled', m: string = code) { super(m); } }
export async function ratingRow(ticketId: number) { return (await db.select().from(T).where(eq(T.ticketId, ticketId)).catch(() => []))[0] || null; }
export const tokenFor = (clientId: number, ticketId: number) => signRate({ ticketId, clientId }, rstore.linkSecret());

/** The row for this signed link, creating it for a closed ticket of this client that has none (portal, or closed before switch-on). */
async function rowFor(c: RateClaims) {
  const row = await ratingRow(c.k);
  if (row) { if (row.clientId !== c.c) throw new RateError('not-yours'); return row; }
  const tk = await whmcs('GetTicket', { ticketid: c.k, repliessort: 'ASC' }).catch(() => null);
  if (!tk) throw new RateError('not-found');
  if (Number(tk.userid) !== c.c) throw new RateError('not-yours');
  if (!/^closed$/i.test(String(tk.status || ''))) throw new RateError('not-closed');
  await db.insert(T).values({ id: createId(), ticketId: c.k, tid: String(tk.tid || ''), clientId: c.c, subject: String(tk.subject || '').slice(0, 300), deptId: Number(tk.deptid || 0), staff: staffOf(arr(tk.replies?.reply)), status: 'skipped', reason: 'rated-without-request' }).onConflictDoNothing();
  return (await ratingRow(c.k))!;
}
export async function viewFor(c: RateClaims) { return rowFor(c); }

async function alertOwner(row: typeof T.$inferSelect, score: number, comment: string, followUp: boolean) {
  const rcfg = await rstore.loadConfig();
  if (!transportReady(rcfg)) { console.warn('[cx-ratings] low rating alert: email transport not ready'); return false; }
  const s = await supportSettings();
  const owner = await getClientsDetails(s.clientId).catch(() => null);
  if (!owner?.email) { console.warn('[cx-ratings] low rating alert: owner client not found', s.clientId); return false; }
  const client = await getClientsDetails(row.clientId).catch(() => null);
  const m = lowRatingAlert({ score, tid: row.tid || String(row.ticketId), ticketId: row.ticketId, subject: row.subject, client: [client?.firstname, client?.lastname].filter(Boolean).join(' ') || client?.companyname || row.email, clientId: row.clientId, staff: row.staff, comment, adminUrl: `${s.siteUrl}/admin/support/${row.ticketId}`, followUp });
  // the owner's own alert: immediate (no quiet hours or caps), not logged as a customer reminder
  const r = await sendEmail(rcfg, { clientId: s.clientId, to: String(owner.email), subject: m.subject, html: m.html, text: m.text, unsubUrl: `${s.siteUrl}/admin/ratings`, unsubPost: `${s.siteUrl}/admin/ratings`, lang: 'en' });
  if (!r.ok) console.warn('[cx-ratings] low rating alert failed', r.error);
  return r.ok;
}

/** Record (or change) the score. The first low score of a ticket alerts the owner; changing it later does not alert again. */
export async function rate(c: RateClaims, score: number, source: 'email' | 'portal') {
  const row = await rowFor(c);
  const cfg = await loadRatingsConfig();
  await db.update(T).set({ score, ratedAt: new Date(), status: 'rated', source, updatedAt: new Date() }).where(eq(T.id, row.id));
  if (isLow(score, cfg) && !row.alertedAt) {
    const [claimed] = await db.update(T).set({ alertedAt: new Date() }).where(and(eq(T.id, row.id), sql`${T.alertedAt} is null`)).returning({ id: T.id });
    if (claimed && !(await alertOwner({ ...row, score }, score, row.comment, false))) await db.update(T).set({ alertedAt: null }).where(eq(T.id, row.id));
  }
  return { ...row, score, status: 'rated' };
}
/** Optional comment after the score. A comment on a low score is forwarded to the owner once. */
export async function comment(c: RateClaims, text: string) {
  const row = await rowFor(c);
  if (!row.score) throw new RateError('not-found', 'rate first');
  const v = cleanComment(text);
  await db.update(T).set({ comment: v, updatedAt: new Date() }).where(eq(T.id, row.id));
  const cfg = await loadRatingsConfig();
  if (v && isLow(row.score, cfg) && !row.commentAlertedAt) {
    const [claimed] = await db.update(T).set({ commentAlertedAt: new Date() }).where(and(eq(T.id, row.id), sql`${T.commentAlertedAt} is null`)).returning({ id: T.id });
    if (claimed) await alertOwner(row, row.score, v, true);
  }
  return { ...row, comment: v };
}

/* ================================================================ admin */
export async function dashboard(days = 90) {
  const since = new Date(Date.now() - days * 86400_000);
  const rated = await db.select({ score: T.score, ratedAt: T.ratedAt, staff: T.staff }).from(T).where(and(isNotNull(T.score), gt(T.ratedAt, since))).catch(() => []);
  const rows = rated.map((r) => ({ score: Number(r.score), ratedAt: r.ratedAt ? r.ratedAt.getTime() : 0, staff: r.staff }));
  const counts = Object.fromEntries([...(await db.execute(sql`select status, count(*)::int n from ticket_ratings where created_at > ${since.toISOString()}::timestamptz group by status`).catch(() => [] as any) as any)].map((x: any) => [x.status, x.n])) as Record<string, number>;
  const asked = await db.execute(sql`select count(*) filter (where sent_at is not null)::int asked, count(*) filter (where sent_at is not null and score is not null)::int answered from ticket_ratings where created_at > ${since.toISOString()}::timestamptz`).catch(() => [] as any);
  return { summary: summary(rows), trend: trend(rows, Date.now(), 12), staff: perStaff(rows), counts, asked: (asked as any)[0] || { asked: 0, answered: 0 } };
}
export async function latest(o: { filter?: 'all' | 'low' | 'comments'; limit?: number } = {}) {
  const conds = [isNotNull(T.score)];
  if (o.filter === 'low') conds.push(lt(T.score, 3));
  if (o.filter === 'comments') conds.push(sql`${T.comment} <> ''`);
  return db.select().from(T).where(and(...conds)).orderBy(desc(T.ratedAt)).limit(o.limit ?? 100).catch(() => []);
}
export async function requestLog(limit = 100) { return db.select().from(T).orderBy(desc(T.createdAt)).limit(limit).catch(() => []); }

/** Preview / test email with the owner's account details and an example ticket (labelled on the admin page). */
export async function previewRequest(lang: Lang) {
  const s = await supportSettings().catch(() => ({ clientId: 1, siteUrl: 'https://globalhostia.com' }) as any);
  const owner = await getClientsDetails(s.clientId).catch(() => null);
  const m = requestMail(s.siteUrl, rstore.linkSecret(), { ticketId: 0, clientId: s.clientId || 1, tid: 'GHX-123456', subject: lang === 'ar' ? 'لا يمكنني استلام البريد على نطاقي' : 'I cannot receive email on my domain', staff: 'Support team', email: String(owner?.email || 'support@globalhostia.com'), name: firstName(owner) || 'Manoj', lang });
  return m;
}
export async function sendTestRequest(lang: Lang) {
  const rcfg = await rstore.loadConfig();
  if (!transportReady(rcfg)) throw new Error(`Email transport not ready (${rcfg.transport})`);
  const s = await supportSettings();
  const owner = await getClientsDetails(s.clientId).catch(() => null);
  if (!owner?.email) throw new Error(`WHMCS client #${s.clientId} not found (Support → notify client ID)`);
  const m = await previewRequest(lang);
  const r = await sendEmail(rcfg, { clientId: s.clientId, to: String(owner.email), subject: `[Test] ${m.subject}`, html: m.html, text: m.text, unsubUrl: m.unsubUrl, unsubPost: m.unsubPost, lang });
  if (!r.ok) throw new Error(r.error || 'send failed');
  return { to: String(owner.email), via: r.via };
}
