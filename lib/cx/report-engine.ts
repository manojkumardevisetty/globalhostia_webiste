// Monthly "Your site report": server wiring. Gathers each customer's facts (our domain health checks and their daily
// history, the hosting panel's usage and backups list, WHMCS services / domains / renewal amounts, real catalog prices
// for product tips), builds the report (lib/cx/report-core.ts), stores it (site_reports, shown again in the portal)
// and emails it through the reminders delivery: WHMCS SendEmail or SMTP, quiet hours in the customer's country, the
// shared frequency caps, unsubscribe scope "report", and a reminders_log row (kind "report", cycle = month) so a
// customer never gets the same month twice. Runs from the WHMCS cron tick and /api/cron/feedback during the window.
import 'server-only';
import { and, asc, between, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured } from '../whmcs';
import { getClientsDetails, getClientsProducts, getClientsDomains } from '../portal/api';
import { buildRenewals } from '../portal/renewal-plan';
import { getSettings } from '../settings';
import { loadServers } from '../hosting/servers';
import { serverFor } from '../hosting/match';
import { providerFor } from '../hosting/providers';
import { panelUser } from '../hosting/validate';
import type { ServerConfig } from '../hosting/types';
import { rowsFor } from '../health/engine';
import { issueCopy, type IssueKey, type Lang as HLang } from '../health/core';
import * as rstore from '../reminders/store';
import { sendableNow, withinCaps, spacedEnough, signUnsub } from '../reminders/core';
import { sendEmail, transportReady } from '../reminders/send';
import { money, type Currency } from '../reminders/email';
import { supportSettings } from '../support-notify';
import { createId } from '../id';
import {
  normalizeReport, buildReport, isEmpty, windowMonth, dueAt, monthOf, monthRange, MONTH_RE,
  type ReportConfig, type ReportData, type HealthFact, type DayFact, type ServiceFact, type RenewalFact, type ProductOffer, type Lang,
} from './report-core';
import { reportEmail } from './report-email';

const CFG_KEY = 'cx_report', STATE_KEY = 'cx_report_state', LOCK_KEY = 'cx_report_lock';
const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const lc = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');

async function readKey<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}
async function writeKey(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}
export async function loadReportConfig(): Promise<ReportConfig> { return normalizeReport(await readKey(CFG_KEY).catch(() => undefined)); }
export async function saveReportConfig(c: ReportConfig) { await writeKey(CFG_KEY, normalizeReport(c)); }
export type ReportState = { lastRun?: string; lastResult?: unknown; queue?: { month: string; ids: number[]; builtAt: string } };
export async function reportState(): Promise<ReportState> { return (await readKey<ReportState>(STATE_KEY).catch(() => undefined)) || {}; }
async function patchState(p: Partial<ReportState>) {
  await db.execute(sql`insert into settings (key, value) values (${STATE_KEY}, ${JSON.stringify(p)}::jsonb) on conflict (key) do update set value = settings.value || excluded.value`).catch(() => {});
}
async function acquire(leaseSec: number) {
  const value = JSON.stringify({ until: new Date(Date.now() + leaseSec * 1000).toISOString() });
  const got = await db.execute(sql`insert into settings (key, value) values (${LOCK_KEY}, ${value}::jsonb) on conflict (key) do update set value = excluded.value
    where coalesce((settings.value->>'until')::timestamptz, 'epoch'::timestamptz) < now() returning key`);
  return (got as any).length > 0;
}
async function release() { await db.execute(sql`update settings set value = jsonb_build_object('until', (now() - interval '1 second')::text) where key = ${LOCK_KEY}`).catch(() => {}); }
export async function siteUrl() {
  const s = await getSettings().catch(() => ({} as any));
  return String(s.site_url && /^https:\/\//.test(s.site_url) ? s.site_url : 'https://globalhostia.com').replace(/\/$/, '');
}
export const langOf = (c: any): Lang => (/^(arabic|ar)/i.test(String(c?.language || '')) ? 'ar' : 'en');
const firstName = (c: any) => String(c?.firstname || '').trim() || String(c?.fullname || '').split(' ')[0] || '';
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/* ================================================================ labels */
const TITLE_OVERRIDE: Partial<Record<IssueKey, Record<Lang, string>>> = {
  ssl_expiring: { en: 'SSL certificate close to expiry', ar: 'شهادة SSL قاربت على الانتهاء' },
  site_error: { en: 'Website showed a server error', ar: 'عرض الموقع خطأ في الخادم' },
  reg_expiring: { en: 'Domain registration close to expiry', ar: 'تسجيل النطاق قارب على الانتهاء' },
};
export const issueTitle = (lang: Lang) => (key: string) => TITLE_OVERRIDE[key as IssueKey]?.[lang] || issueCopy(key as IssueKey, { domain: '', reason: '', names: '', ns: '', days: '', date: '', code: '' }, lang as HLang).title;

/* ================================================================ facts */
type Ctx = { currencies: Map<number, Currency>; defaultCur: number; servers: ServerConfig[] | null; site: string };
async function makeCtx(): Promise<Ctx> {
  const currencies = new Map<number, Currency>();
  let defaultCur = 1;
  try {
    const r = await whmcs('GetCurrencies');
    for (const c of arr(r.currencies?.currency)) { currencies.set(Number(c.id), { code: String(c.code), prefix: String(c.prefix || ''), suffix: String(c.suffix || '') }); if (Number(c.default) === 1) defaultCur = Number(c.id); }
  } catch { /* amounts then show with the currency code only */ }
  return { currencies, defaultCur, servers: null, site: await siteUrl() };
}
const curOf = (ctx: Ctx, id: unknown): Currency => ctx.currencies.get(Number(id) || ctx.defaultCur) || ctx.currencies.get(ctx.defaultCur) || { code: 'USD', prefix: '$', suffix: ' USD' };

/** Usage + backups of one hosting service from its panel (bounded). WHMCS's own disk / bandwidth figures as fallback. */
async function serviceFacts(ctx: Ctx, p: any): Promise<ServiceFact> {
  const f: ServiceFact = { id: Number(p.id), domain: lc(p.domain), product: String(p.translated_name || p.name || p.groupname || ''), pid: Number(p.pid) || null, status: String(p.status || ''), usage: null, backups: null };
  if (!/^active$/i.test(f.status)) return f;
  if (!ctx.servers) ctx.servers = await loadServers().catch(() => []);
  const server = serverFor(p, ctx.servers!);
  if (server && p.username && f.domain) {
    try {
      const prov = providerFor({ server, username: panelUser(p.username), domain: f.domain });
      if (prov.usage) {
        const u = await withTimeout(prov.usage(), 12_000).catch(() => null);
        const disk = u?.items.find((i) => i.key === 'quota'), bw = u?.items.find((i) => i.key === 'bandwidth');
        if (disk || bw) f.usage = { ...(disk ? { disk: { used: disk.used, limit: disk.limit } } : {}), ...(bw ? { bw: { used: bw.used, limit: bw.limit } } : {}) };
      }
      if (prov.backups && (prov.caps.backups || []).includes('list')) {
        const list = await withTimeout(prov.backups.list(), 12_000).catch(() => null);
        if (list) {
          const dates = list.map((b) => String(b.created || '')).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d) || !Number.isNaN(Date.parse(d))).map((d) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10))).sort();
          f.backups = { count: list.length, latest: dates.length ? dates[dates.length - 1] : null };
        }
      }
    } catch { /* panel unreachable or account not on it: the panel sections are left out */ }
  }
  // WHMCS usage stats (updated by its cron from the server module) when the panel gave nothing
  if (!f.usage && /^\d{4}-\d{2}-\d{2}/.test(String(p.lastupdate || '')) && !/^0000/.test(String(p.lastupdate))) {
    const du = Number(p.diskusage), dl = Number(p.disklimit), bu = Number(p.bwusage), bl = Number(p.bwlimit);
    const o: NonNullable<ServiceFact['usage']> = {};
    if (Number.isFinite(du) && du >= 0) o.disk = { used: du, limit: dl > 0 ? dl : null };
    if (Number.isFinite(bu) && bu >= 0) o.bw = { used: bu, limit: bl > 0 ? bl : null };
    if (o.disk || o.bw) f.usage = o;
  }
  return f;
}

const isHostingProduct = (p: any) => !/ssl|certificate|email|domain/i.test(`${p.groupname || ''} ${p.module || ''}`) || /cpanel|directadmin|plesk/i.test(String(p.module || ''));

/** Product tips: the cheapest bigger plan in the same catalog category (per hosting service) and the cheapest hosting plan. Real synced prices only. */
async function offersFor(ctx: Ctx, services: any[], cur: Currency) {
  const upgrade = new Map<number, ProductOffer>();
  let hosting: ProductOffer | null = null;
  try {
    const all = await db.select({ id: schema.products.id, pid: schema.products.whmcsPid, name: schema.products.name, slug: schema.products.slug, categoryId: schema.products.categoryId, status: schema.products.status, type: schema.products.whmcsType, hidden: schema.products.whmcsHidden, retired: schema.products.whmcsRetired })
      .from(schema.products);
    const live = all.filter((p) => p.status === 'PUBLISHED' && !p.hidden && !p.retired);
    const prices = live.length ? await db.select().from(schema.productPrices).where(and(inArray(schema.productPrices.productId, live.map((p) => p.id)), eq(schema.productPrices.currency, cur.code))) : [];
    const priceOf = (id: string, cycle: string) => { const r = prices.find((x) => x.productId === id && x.cycle === cycle); const n = r ? Number(r.price) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
    const offer = (p: (typeof live)[number], cycle: string, n: number): ProductOffer => ({ name: p.name, url: `${ctx.site}/p/${p.slug}`, price: money(n, cur), cycle });
    for (const s of services) {
      const mine = all.find((p) => p.pid && p.pid === Number(s.pid));
      if (!mine?.categoryId) continue;
      const cycle = String(s.billingcycle || '').toLowerCase().replace(/[^a-z]/g, '') || 'monthly';
      const base = priceOf(mine.id, cycle);
      if (base === null) continue;
      const bigger = live.filter((p) => p.categoryId === mine.categoryId && p.id !== mine.id).map((p) => ({ p, n: priceOf(p.id, cycle) })).filter((x) => x.n !== null && x.n > base).sort((a, b) => a.n! - b.n!)[0];
      if (bigger) upgrade.set(Number(s.id), offer(bigger.p, cycle, bigger.n!));
    }
    const cheapest = live.filter((p) => /hostingaccount/i.test(p.type)).flatMap((p) => ['monthly', 'annually'].map((c) => ({ p, c, n: priceOf(p.id, c) }))).filter((x) => x.n !== null)
      .sort((a, b) => (a.c === b.c ? a.n! - b.n! : a.c === 'monthly' ? -1 : 1))[0];
    if (cheapest) hosting = offer(cheapest.p, cheapest.c, cheapest.n!);
  } catch { /* no product tips */ }
  return { upgrade, hosting };
}

/** Build one customer's report for `month` from live data (nothing stored, nothing sent). */
export async function buildFor(clientId: number, month: string, o: { ctx?: Ctx; client?: any; cfg?: ReportConfig } = {}): Promise<{ data: ReportData; client: any; lang: Lang }> {
  if (!MONTH_RE.test(month)) throw new Error('bad month');
  const ctx = o.ctx || await makeCtx();
  const cfg = o.cfg || await loadReportConfig();
  const client = o.client || await getClientsDetails(clientId);
  const [products, domains, rows] = await Promise.all([getClientsProducts(clientId).catch(() => []), getClientsDomains(clientId).catch(() => []), rowsFor(clientId).catch(() => [])]);
  const { from, to } = monthRange(month);
  const days = await db.select().from(schema.healthDays).where(and(eq(schema.healthDays.clientId, clientId), between(schema.healthDays.day, from, to))).catch(() => []);
  const hosting = products.filter((p: any) => /^active$/i.test(String(p.status)) && p.domain && isHostingProduct(p)).slice(0, 6);
  const services = await Promise.all(hosting.map((p: any) => serviceFacts(ctx, p)));
  const cur = curOf(ctx, client?.currency);
  const now = Date.now();
  const renewals: RenewalFact[] = buildRenewals(products, domains, { now })
    .filter((r) => r.days >= 0 && r.days <= 60 && !/^(cancelled|terminated|fraud|expired|transferred away)$/i.test(r.status))
    .map((r) => ({ kind: r.kind, name: r.name, date: r.date, days: r.days, price: r.amount === null ? null : money(r.amount, cur), auto: r.kind === 'domain' ? r.autoRenew !== false : null }));
  const health: HealthFact[] = rows.map((r) => ({ domain: r.domain, sources: r.target.sources, serviceId: r.target.serviceId ?? null, lastChecked: r.lastChecked, issues: r.issues as any, checks: r.checks || null }));
  const dayFacts: DayFact[] = days.map((d) => ({ domain: d.domain, day: d.day, checks: d.checks, status: d.status, issues: (d.issues || []) as string[] }));
  const offers = cfg.productTips ? await offersFor(ctx, hosting, cur) : undefined;
  const data = buildReport({ month, now, clientId, name: firstName(client), health, days: dayFacts, services, renewals, offers, productTips: cfg.productTips });
  return { data, client, lang: langOf(client) };
}

/* ================================================================ store */
export async function saveReport(clientId: number, month: string, lang: Lang, data: ReportData) {
  await db.insert(schema.siteReports).values({ id: createId(), clientId, month, lang, data: data as any })
    .onConflictDoUpdate({ target: [schema.siteReports.clientId, schema.siteReports.month], set: { data: data as any, lang, createdAt: new Date() } });
}
export async function storedReport(clientId: number, month: string): Promise<ReportData | null> {
  const [r] = await db.select().from(schema.siteReports).where(and(eq(schema.siteReports.clientId, clientId), eq(schema.siteReports.month, month))).catch(() => []);
  return r ? (r.data as ReportData) : null;
}
export async function storedMonths(clientId: number): Promise<string[]> {
  return (await db.select({ m: schema.siteReports.month }).from(schema.siteReports).where(eq(schema.siteReports.clientId, clientId)).orderBy(desc(schema.siteReports.month)).catch(() => [])).map((r) => r.m);
}
/** First day with health history for this customer (limits the months offered in the portal). */
export async function firstHistoryMonth(clientId: number): Promise<string | null> {
  const [r] = await db.select({ d: schema.healthDays.day }).from(schema.healthDays).where(eq(schema.healthDays.clientId, clientId)).orderBy(asc(schema.healthDays.day)).limit(1).catch(() => []);
  return r ? r.d.slice(0, 7) : null;
}
/** The portal: the stored (emailed) report for that month, else built now from what we have. */
export async function reportFor(clientId: number, month: string): Promise<{ data: ReportData; stored: boolean }> {
  const s = await storedReport(clientId, month);
  if (s) return { data: s, stored: true };
  return { data: (await buildFor(clientId, month)).data, stored: false };
}

/* ================================================================ prefs (unsubscribe scope "report") */
export async function reportOn(email: string) { return !rstore.blocks(await rstore.suppressedScopes(email).catch(() => new Set<string>()), 'report'); }
/** Portal switch. Turning it on lifts a "report" unsubscribe, and an "all" one while keeping the other choices. */
export async function setReportPref(clientId: number, email: string, on: boolean) {
  const e = email.toLowerCase();
  if (!on) { await rstore.suppress(e, 'report', 'portal'); return; }
  await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, e), eq(schema.reminderSuppress.scope, 'report')));
  const sup = await rstore.suppressedScopes(e);
  if (sup.has('all')) {
    await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, e), eq(schema.reminderSuppress.scope, 'all')));
    const p = await rstore.prefsFor(clientId).catch(() => rstore.DEFAULT_PREFS);
    if (!p.cartEmail) await rstore.suppress(e, 'cart', 'portal');
    if (!p.renewalEmail) await rstore.suppress(e, 'renewal', 'portal');
    for (const s of ['health', 'rating'] as const) await rstore.suppress(e, s, 'portal');
  }
}

/* ================================================================ send */
const WHY: Record<Lang, string> = { en: 'You get this monthly report because you have hosting or domains at GlobalHostia.', ar: 'تصلك هذه الرسالة الشهرية لأن لديك استضافة أو نطاقات لدى GlobalHostia.' };
export function mailFor(site: string, secret: string, clientId: number, email: string, lang: Lang, data: ReportData) {
  const t = signUnsub({ e: email, c: clientId, s: 'report' }, secret);
  const unsubUrl = `${site}/account/unsubscribe?t=${t}`;
  const m = reportEmail({ lang, data, site, issueTitle: issueTitle(lang), footer: { unsubUrl, prefsUrl: `${site}/account/settings#reminders`, why: WHY[lang] } });
  return { ...m, unsubUrl, unsubPost: `${unsubUrl}&one-click=1` };
}
async function logSkip(clientId: number, email: string, month: string, reason: string) {
  await db.execute(sql`insert into reminders_log (id, kind, client_id, email, item, stage, channel, cycle, status, message_id, error)
    values (${createId()}, 'report', ${clientId}, ${email.toLowerCase()}, ${`rep:${clientId}`}, 'monthly', 'email', ${month}, 'skipped', '', ${reason})
    on conflict (kind, item, stage, channel, cycle) do nothing`).catch(() => {});
}
async function doneFor(month: string): Promise<Set<number>> {
  const rows = await db.select({ c: schema.remindersLog.clientId, s: schema.remindersLog.status, a: schema.remindersLog.attempts }).from(schema.remindersLog)
    .where(and(eq(schema.remindersLog.kind, 'report'), eq(schema.remindersLog.cycle, month)));
  return new Set(rows.filter((r) => r.s !== 'failed' || Number(r.a) >= 3).map((r) => Number(r.c)));
}
async function all(action: string, key: string, sub: string) {
  const out: any[] = [];
  for (let start = 0; start < 20000; start += 250) {
    const r = await whmcs(action, { limitstart: start, limitnum: 250 });
    const page = arr(r[key]?.[sub]);
    out.push(...page);
    if (page.length < 250 || out.length >= Number(r.totalresults || 0)) break;
  }
  return out;
}
/** Everyone with an active hosting service or an active domain (built once per report month). */
async function queueFor(month: string): Promise<number[]> {
  const st = await reportState();
  if (st.queue?.month === month && Array.isArray(st.queue.ids)) return st.queue.ids;
  const [products, domains] = await Promise.all([all('GetClientsProducts', 'products', 'product'), all('GetClientsDomains', 'domains', 'domain')]);
  const ids = new Set<number>();
  for (const p of products) if (/^active$/i.test(String(p.status)) && Number(p.clientid) > 0) ids.add(Number(p.clientid));
  for (const d of domains) if (/^(active|grace)$/i.test(String(d.status)) && Number(d.userid) > 0) ids.add(Number(d.userid));
  const list = [...ids].sort((a, b) => a - b);
  await patchState({ queue: { month, ids: list, builtAt: new Date().toISOString() } });
  return list;
}

export type ReportRun = { ok: boolean; stopped?: string; month?: string; queued?: number; due?: number; sent: number; failed: number; skipped: Record<string, number>; ms?: number; error?: string };

export async function runReports(reason = 'manual', o: { deadlineMs?: number } = {}): Promise<ReportRun> {
  const t0 = Date.now();
  const res: ReportRun = { ok: true, sent: 0, failed: 0, skipped: {} };
  const skip = (w: string) => { res.skipped[w] = (res.skipped[w] || 0) + 1; };
  let cfg: ReportConfig;
  try { cfg = await loadReportConfig(); } catch (e: any) { return { ...res, ok: false, error: `config: ${e?.message || e}` }; }
  if (!cfg.enabled) return { ...res, stopped: 'disabled' };
  const month = windowMonth(t0, cfg);
  if (!month) return { ...res, stopped: 'outside-window' };
  if (!whmcsConfigured()) return { ...res, ok: false, stopped: 'whmcs-not-configured' };
  const rcfg = await rstore.loadConfig();
  if (!transportReady(rcfg)) return { ...res, ok: false, stopped: `transport-not-ready:${rcfg.transport}` };
  const deadlineMs = o.deadlineMs ?? 50_000;
  if (!(await acquire(Math.ceil(deadlineMs / 1000) + 30).catch(() => false))) return { ...res, stopped: 'busy' };
  res.month = month;
  try {
    const ids = await queueFor(month);
    const done = await doneFor(month);
    const due = ids.filter((id) => !done.has(id) && dueAt(id, month, cfg) <= t0).sort((a, b) => dueAt(a, month, cfg) - dueAt(b, month, cfg));
    res.queued = ids.length; res.due = due.length;
    const ctx = await makeCtx();
    const secret = rstore.linkSecret();
    for (const cid of due) {
      if (Date.now() - t0 > deadlineMs - 8_000) { skip('deadline'); break; }
      if (res.sent >= cfg.perRun) { skip('run-budget'); break; }
      const client = await getClientsDetails(cid).catch(() => null);
      if (!client?.email) { skip('client-lookup'); continue; }
      const email = String(client.email);
      if (/^(closed|inactive)$/i.test(String(client.status || ''))) { await logSkip(cid, email, month, 'client-inactive'); skip('client-inactive'); continue; }
      if (!(await reportOn(email))) { await logSkip(cid, email, month, 'unsubscribed'); skip('unsubscribed'); continue; }
      if (!sendableNow(Date.now(), client.countrycode || client.country, rcfg.quiet)) { skip('quiet-hours'); continue; }
      const sent = await rstore.recentSends(cid, email);
      if (!withinCaps(sent, Date.now(), rcfg.caps) || !spacedEnough(sent, Date.now())) { skip('cap'); continue; }
      let built: Awaited<ReturnType<typeof buildFor>>;
      try { built = await buildFor(cid, month, { ctx, client, cfg }); } catch (e: any) { skip('build-failed'); console.warn('[cx-report] build', cid, e?.message || e); continue; }
      if (isEmpty(built.data)) { await logSkip(cid, email, month, 'nothing-to-report'); skip('empty'); continue; }
      await saveReport(cid, month, built.lang, built.data).catch(() => {});
      const mail = mailFor(ctx.site, secret, cid, email, built.lang, built.data);
      const id = await rstore.claim({ kind: 'report', clientId: cid, email, item: `rep:${cid}`, stage: 'monthly', channel: 'email', cycle: month, messageId: createId(), detail: { sites: built.data.sites.length, renewals: built.data.renewals.length, tips: built.data.tips.map((t) => t.key) } });
      if (!id) { skip('already'); continue; }
      const r = await sendEmail(rcfg, { clientId: cid, to: email, subject: mail.subject, html: mail.html, text: mail.text, unsubUrl: mail.unsubUrl, unsubPost: mail.unsubPost, lang: built.lang });
      await rstore.finish([id], r.ok, r.error);
      if (r.ok) res.sent++; else res.failed++;
    }
  } catch (e: any) { res.ok = false; res.error = String(e?.message || e).slice(0, 300); }
  finally { await release(); }
  res.ms = Date.now() - t0;
  await patchState({ lastRun: new Date().toISOString(), lastResult: { reason, ...res } });
  return res;
}

/* ================================================================ admin */
export async function reportLog(limit = 150) {
  return db.select().from(schema.remindersLog).where(eq(schema.remindersLog.kind, 'report')).orderBy(desc(schema.remindersLog.createdAt)).limit(limit).catch(() => []);
}
export async function reportStats(month: string) {
  const r = await db.execute(sql`select status, count(*)::int n from reminders_log where kind = 'report' and cycle = ${month} group by status`).catch(() => [] as any);
  return Object.fromEntries([...(r as any)].map((x: any) => [x.status, x.n])) as Record<string, number>;
}
/** Preview of any customer's report (built live; nothing stored or sent). */
export async function previewFor(clientId: number, month: string, lang?: Lang) {
  const ctx = await makeCtx();
  const b = await buildFor(clientId, month, { ctx });
  const l = lang || b.lang;
  return { ...mailFor(ctx.site, rstore.linkSecret(), clientId, String(b.client?.email || 'preview@example.com'), l, b.data), data: b.data, client: b.client, lang: l };
}
/** Send a customer's report (built live) to the owner's own WHMCS client account, subject marked [Test]. */
export async function sendTest(clientId: number, month: string, lang?: Lang) {
  const rcfg = await rstore.loadConfig();
  if (!transportReady(rcfg)) throw new Error(`Email transport not ready (${rcfg.transport})`);
  const owner = (await supportSettings()).clientId;
  const ownerClient = await getClientsDetails(owner).catch(() => null);
  if (!ownerClient?.email) throw new Error(`WHMCS client #${owner} not found (Support → notify client ID)`);
  const m = await previewFor(clientId, month, lang);
  const r = await sendEmail(rcfg, { clientId: owner, to: String(ownerClient.email), subject: `[Test] ${m.subject}${clientId !== owner ? ` (client #${clientId})` : ''}`, html: m.html, text: m.text, unsubUrl: m.unsubUrl, unsubPost: m.unsubPost, lang: m.lang });
  if (!r.ok) throw new Error(r.error || 'send failed');
  return { to: String(ownerClient.email), via: r.via, owner };
}
export const currentMonth = () => monthOf(Date.now());
