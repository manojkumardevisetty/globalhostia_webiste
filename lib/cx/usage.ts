// Hosting usage alerts + one-click upgrade: the I/O side. Reads usage from the hosting panel as the account's own user
// (lib/hosting providers, cached 6 hours in cx_usage; WHMCS usage sync as a fallback), sends at most one email per
// threshold crossing per month through the reminders delivery (WHMCS SendEmail or SMTP, quiet hours, caps, unsubscribe
// scope 'usage', reminders_log idempotency) plus an optional web push, and runs the WHMCS upgrade calls for the portal.
// Pure rules, copy and the WHMCS call shapes: lib/cx/usage-core.ts.
import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured } from '../whmcs';
import { getClientsDetails } from '../portal/api';
import { getSettings } from '../settings';
import { loadServers } from '../hosting/servers';
import { serverFor } from '../hosting/match';
import { providerFor } from '../hosting/providers';
import { panelUser } from '../hosting/validate';
import type { ServerConfig } from '../hosting/types';
import { isHostingService } from '../portal/views/renewals';
import * as rstore from '../reminders/store';
import { sendableNow, withinCaps, spacedEnough, signUnsub } from '../reminders/core';
import { sendEmail, transportReady } from '../reminders/send';
import { sendToClient } from '../portal/push';
import { createId } from '../id';
import {
  normalizeUsage, fromPanel, fromWhmcs, planAlerts, alertItem, monthKey, usageEmail, worstOf, METRIC_LABEL, upgradeOptions, quoteUpgrade, placeUpgrade,
  paymentMethodFor, paymentMethods, cycleKey, type UsageConfig, type Snapshot, type Metric, type Lang, type Call, type AlertLine,
} from './usage-core';

const CFG_KEY = 'usage_alerts', STATE_KEY = 'usage_state', LOCK_KEY = 'usage_lock';
export const USAGE_TTL_MS = 6 * 3600_000;
const call: Call = (action, params) => whmcs(action, params);
const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const lc = (s: unknown) => String(s ?? '').trim().toLowerCase();

async function readKey<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}
async function writeKey(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}
export async function loadUsageConfig(): Promise<UsageConfig> { return normalizeUsage(await readKey(CFG_KEY).catch(() => undefined)); }
export async function saveUsageConfig(c: UsageConfig) { await writeKey(CFG_KEY, normalizeUsage(c)); }
export type UsageState = { lastRun?: string; lastResult?: unknown };
export async function usageState(): Promise<UsageState> { return (await readKey<UsageState>(STATE_KEY).catch(() => undefined)) || {}; }
async function patchState(p: Partial<UsageState>) {
  await db.execute(sql`insert into settings (key, value) values (${STATE_KEY}, ${JSON.stringify(p)}::jsonb) on conflict (key) do update set value = settings.value || excluded.value`).catch(() => {});
}
async function acquire(leaseSec: number) {
  const value = JSON.stringify({ until: new Date(Date.now() + leaseSec * 1000).toISOString() });
  const got = await db.execute(sql`insert into settings (key, value) values (${LOCK_KEY}, ${value}::jsonb) on conflict (key) do update set value = excluded.value
    where coalesce((settings.value->>'until')::timestamptz, 'epoch'::timestamptz) < now() returning key`);
  return (got as any).length > 0;
}
async function release() { await db.execute(sql`update settings set value = jsonb_build_object('until', (now() - interval '1 second')::text) where key = ${LOCK_KEY}`).catch(() => {}); }
async function siteUrl() {
  const s = await getSettings().catch(() => ({} as any));
  return String(s.site_url && /^https:\/\//.test(s.site_url) ? s.site_url : 'https://globalhostia.com').replace(/\/$/, '');
}
const within = <T>(p: Promise<T>, ms: number): Promise<T> => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

/* ================================================================ usage per service */
/** Hosting services that get meters and alerts: shared / WordPress / reseller / email hosting, active or suspended. */
export const tracked = (p: any) => isHostingService(p) && /^(active|suspended)$/i.test(String(p.status || ''));

/** Live read from the panel (as the account's own user), else the WHMCS figures. Never throws. */
async function measure(p: any, servers: ServerConfig[], timeoutMs: number): Promise<Snapshot & { error?: string }> {
  const at = new Date().toISOString();
  const server = /^active$/i.test(String(p.status)) ? serverFor(p, servers) : null;
  if (server && p.username) {
    try {
      const prov = providerFor({ server, username: panelUser(p.username), domain: lc(p.domain) });
      if (prov.usage) {
        const u = await within(prov.usage(), timeoutMs);
        const metrics = fromPanel(u.items);
        if (metrics.length) return { metrics, source: 'panel', at, plan: u.plan || '' };
      }
    } catch (e) {
      const w = fromWhmcs(p);
      return { metrics: w, source: 'whmcs', at, error: e instanceof Error ? e.message.slice(0, 200) : 'panel error' };
    }
  }
  return { metrics: fromWhmcs(p), source: 'whmcs', at };
}

/**
 * Usage for the given services of one client (cache first; stale or missing rows are read live, in parallel, within
 * `budgetMs`). Services that could not be read in time get their stale row, or the WHMCS figures.
 */
export async function usageFor(clientId: number, products: any[], o: { budgetMs?: number; fresh?: boolean } = {}): Promise<Map<number, Snapshot>> {
  const list = products.filter(tracked).slice(0, 12);
  const out = new Map<number, Snapshot>();
  if (!list.length) return out;
  const ids = list.map((p) => Number(p.id));
  const rows = await db.select().from(schema.cxUsage).where(and(eq(schema.cxUsage.clientId, clientId), inArray(schema.cxUsage.serviceId, ids))).catch(() => []);
  const cached = new Map(rows.map((r) => [r.serviceId, r]));
  const now = Date.now();
  const need = list.filter((p) => { const r = cached.get(Number(p.id)); return o.fresh || !r || now - new Date(r.at).getTime() > USAGE_TTL_MS || (r.source === 'whmcs' && now - new Date(r.at).getTime() > 30 * 60_000); });
  for (const p of list) { const r = cached.get(Number(p.id)); if (r) out.set(r.serviceId, { metrics: r.metrics as Metric[], source: r.source as Snapshot['source'], at: new Date(r.at).toISOString(), plan: r.plan }); }
  if (need.length) {
    const servers = await loadServers().catch(() => [] as ServerConfig[]);
    const budget = o.budgetMs ?? 3500;
    await Promise.all(need.map(async (p) => {
      const s = await measure(p, servers, budget);
      if (!s.metrics.length && out.has(Number(p.id))) return; // nothing new: keep the cached row
      out.set(Number(p.id), s);
      await saveSnapshot(Number(p.id), clientId, s);
    }));
  }
  for (const p of list) if (!out.has(Number(p.id))) { const w = fromWhmcs(p); if (w.length) out.set(Number(p.id), { metrics: w, source: 'whmcs', at: new Date().toISOString() }); }
  return out;
}
async function saveSnapshot(serviceId: number, clientId: number, s: Snapshot & { error?: string }) {
  const v = { serviceId, clientId, metrics: s.metrics as any, source: s.source, plan: s.plan || '', error: s.error || '', at: new Date(s.at) };
  await db.insert(schema.cxUsage).values(v).onConflictDoUpdate({ target: schema.cxUsage.serviceId, set: v }).catch(() => {});
}

/* ================================================================ customer choice (unsubscribe scope 'usage') */
export async function usageAlertsOn(email: string) {
  const sup = await rstore.suppressedScopes(email).catch(() => new Set<string>());
  return !(sup.has('all') || sup.has('usage'));
}
/** Portal switch. Turning alerts back on lifts an earlier "usage" unsubscribe, and an "all" one (keeping the other choices). */
export async function setUsageAlerts(clientId: number, email: string, on: boolean) {
  const e = email.toLowerCase();
  if (!e) return;
  if (!on) { await rstore.suppress(e, 'usage', 'portal'); return; }
  await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, e), eq(schema.reminderSuppress.scope, 'usage')));
  const sup = await rstore.suppressedScopes(e);
  if (sup.has('all')) {
    await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, e), eq(schema.reminderSuppress.scope, 'all')));
    // keep every other choice the "all" link stood for
    const p = await rstore.prefsFor(clientId).catch(() => rstore.DEFAULT_PREFS);
    for (const s of ['cart', 'renewal', 'health', 'report', 'rating'] as const) if (!(s === 'cart' && p.cartEmail) && !(s === 'renewal' && p.renewalEmail)) await rstore.suppress(e, s, 'portal');
  }
}

/* ================================================================ alerts */
const langOf = (c: any): Lang => (/^(arabic|ar)/i.test(String(c?.language || '')) ? 'ar' : 'en');
const firstName = (c: any) => String(c?.firstname || '').trim() || String(c?.fullname || '').split(' ')[0] || '';

type Deliver = { delivered: number; skipped?: string };
async function deliver(cfg: UsageConfig, site: string, p: any, lines: AlertLine[], month: string): Promise<Deliver> {
  const cid = Number(p.clientid);
  const rcfg = await rstore.loadConfig();
  if (cfg.email && !transportReady(rcfg)) return { delivered: 0, skipped: `transport-not-ready:${rcfg.transport}` };
  const client = await getClientsDetails(cid).catch(() => null);
  if (!client?.email) return { delivered: 0, skipped: 'client-lookup' };
  if (/^(closed|inactive)$/i.test(String(client.status || ''))) return { delivered: 0, skipped: 'client-inactive' };
  const email = String(client.email), lang = langOf(client), country = client.countrycode || client.country;
  if (!(await usageAlertsOn(email))) return { delivered: 0, skipped: 'unsubscribed' };
  if (!sendableNow(Date.now(), country, rcfg.quiet)) return { delivered: 0, skipped: 'quiet-hours' };
  const sent = await rstore.recentSends(cid, email);
  if (!withinCaps(sent, Date.now(), rcfg.caps) || !spacedEnough(sent, Date.now())) return { delivered: 0, skipped: 'cap' };
  const messageId = createId();
  const sid = Number(p.id), service = String(p.translated_name || p.name || 'Hosting'), domain = lc(p.domain);
  let delivered = 0;
  if (cfg.email) {
    const claimed: { l: AlertLine; id: string }[] = [];
    for (const l of lines) {
      const id = await rstore.claim({ kind: 'usage', clientId: cid, email, item: alertItem(sid, l.metric), stage: l.level, channel: 'email', cycle: month, messageId, detail: { serviceId: sid, metric: l.metric, pct: l.pct } });
      if (id) claimed.push({ l, id });
    }
    if (claimed.length) {
      const t = signUnsub({ e: email, c: cid, s: 'usage' }, rstore.linkSecret());
      const unsubUrl = `${site}/account/unsubscribe?t=${t}`;
      const mail = usageEmail({ lang, name: firstName(client), service, domain, lines: claimed.map((x) => x.l), cfg, upgradeUrl: `${site}/account/services/${sid}/upgrade`, panelUrl: `${site}/account/services/${sid}`, unsubUrl, prefsUrl: `${site}/account/settings#reminders` });
      const r = await sendEmail(rcfg, { clientId: cid, to: email, subject: mail.subject, html: mail.html, text: mail.text, unsubUrl, unsubPost: `${unsubUrl}&one-click=1`, lang });
      await rstore.finish(claimed.map((x) => x.id), r.ok, r.error);
      if (r.ok) delivered += claimed.length;
    }
  }
  if (cfg.push && lines[0]) {
    const top = lines[0];
    const id = await rstore.claim({ kind: 'usage', clientId: cid, email, item: alertItem(sid, top.metric), stage: top.level, channel: 'push', cycle: month, messageId, detail: { serviceId: sid, metric: top.metric } });
    if (id) {
      const title = lang === 'ar' ? `${service}: ${Math.floor(top.pct)}% من ${METRIC_LABEL[top.metric].ar}` : `${service}: ${Math.floor(top.pct)}% of ${METRIC_LABEL[top.metric].en} used`;
      const body = lang === 'ar' ? 'اقتربت خطتك من حدها. حرّر بعض المساحة أو قم بالترقية بنقرة واحدة.' : 'Your plan is close to its limit. Free up space or upgrade in one click.';
      const n = await sendToClient(cid, 'services', () => ({ title, body, url: `/account/services/${sid}#ac-usage-h`, tag: `usage-${sid}` })).catch(() => 0);
      await rstore.finish([id], n > 0, n > 0 ? '' : 'no device');
    }
  }
  return { delivered };
}

async function all(action: string, key: string, sub: string, max = 5000) {
  const out: any[] = [];
  for (let start = 0; start < max; start += 250) {
    const r = await whmcs(action, { limitstart: start, limitnum: 250 });
    const page = arr(r[key]?.[sub]);
    out.push(...page);
    if (page.length < 250 || out.length >= Number(r.totalresults || 0)) break;
  }
  return out;
}

export type RunResult = { ok: boolean; stopped?: string; services: number; measured: number; alerts: number; skipped: Record<string, number>; deadline: boolean; ms?: number; error?: string };
/** Daily run (Vercel Cron /api/cron/usage): refresh stale usage for every hosting service, email new threshold crossings. */
export async function runUsageAlerts(reason = 'manual', o: { deadlineMs?: number; limit?: number; dry?: boolean } = {}): Promise<RunResult> {
  const t0 = Date.now();
  const res: RunResult = { ok: true, services: 0, measured: 0, alerts: 0, skipped: {}, deadline: false };
  const skip = (w: string) => { res.skipped[w] = (res.skipped[w] || 0) + 1; };
  const cfg = await loadUsageConfig().catch(() => null);
  if (!cfg) return { ...res, ok: false, error: 'config' };
  if (!cfg.enabled) return { ...res, stopped: 'disabled' };
  if (!whmcsConfigured()) return { ...res, ok: false, stopped: 'whmcs-not-configured' };
  const deadlineMs = o.deadlineMs ?? 240_000;
  if (!(await acquire(Math.ceil(deadlineMs / 1000) + 30).catch(() => false))) return { ...res, stopped: 'busy' };
  try {
    const [products, servers, site] = await Promise.all([all('GetClientsProducts', 'products', 'product'), loadServers().catch(() => [] as ServerConfig[]), siteUrl()]);
    const list = products.filter((p) => tracked(p) && /^active$/i.test(String(p.status))).slice(0, o.limit ?? 5000);
    res.services = list.length;
    const ids = list.map((p) => Number(p.id));
    const rows = ids.length ? await db.select().from(schema.cxUsage).where(inArray(schema.cxUsage.serviceId, ids)).catch(() => []) : [];
    const cached = new Map(rows.map((r) => [r.serviceId, r]));
    const month = monthKey(Date.now());
    const deadline = t0 + deadlineMs - 10_000;
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        if (Date.now() > deadline) { res.deadline = true; return; }
        const p = list[i++];
        const sid = Number(p.id), cid = Number(p.clientid);
        let snap: Snapshot | null = null;
        const r = cached.get(sid);
        if (r && Date.now() - new Date(r.at).getTime() < USAGE_TTL_MS) snap = { metrics: r.metrics as Metric[], source: r.source as Snapshot['source'], at: new Date(r.at).toISOString() };
        else { snap = await measure(p, servers, 8000); res.measured++; await saveSnapshot(sid, cid, snap); }
        if (!snap.metrics.length) { skip('no-data'); continue; }
        if (worstOf(snap.metrics, cfg).level === 'ok') continue;
        const items = snap.metrics.map((m) => alertItem(sid, m.key));
        const done = new Map<string, string[]>();
        for (const ch of cfg.email ? ['email'] : ['push']) {
          const got = await rstore.sentStages('usage', items, ch);
          for (const [k, v] of got) done.set(k, [...(done.get(k) || []), ...v.filter((x) => x.cycle === month).map((x) => x.stage)]);
        }
        const lines = planAlerts(sid, snap.metrics, cfg, done);
        if (!lines.length) { skip('already-sent'); continue; }
        if (o.dry) { res.alerts += lines.length; continue; }
        const d = await deliver(cfg, site, p, lines, month).catch((e) => ({ delivered: 0, skipped: `error:${e instanceof Error ? e.message.slice(0, 60) : 'x'}` }));
        res.alerts += d.delivered;
        if (d.skipped) skip(d.skipped);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    res.ms = Date.now() - t0;
    await patchState({ lastRun: new Date().toISOString(), lastResult: { reason, ...res } });
    return res;
  } catch (e) {
    return { ...res, ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally { await release(); }
}

/** Admin: sent / failed usage alerts in the last 30 days. */
export async function usageLog(limit = 100) { return rstore.logPage({ kind: 'usage', limit }); }
export function previewUsageEmail(lang: Lang, cfg: UsageConfig, site = 'https://globalhostia.com') {
  return usageEmail({ lang, name: lang === 'ar' ? 'سارة' : 'Sara', service: 'Hostia Ultra', domain: 'example.com', cfg,
    lines: [{ metric: 'disk', level: 'critical', pct: 96.4, used: 9871, limit: 10240, unit: 'MB' }, { metric: 'inodes', level: 'warn', pct: 82, used: 205000, limit: 250000, unit: '' }],
    upgradeUrl: `${site}/account/services/1/upgrade`, panelUrl: `${site}/account/services/1`, unsubUrl: `${site}/account/unsubscribe?t=preview`, prefsUrl: `${site}/account/settings#reminders` });
}

/* ================================================================ upgrade */
const optCache = new Map<string, { at: number; v: Awaited<ReturnType<typeof upgradeOptions>> }>();
/** Next plans (catalog prices from WHMCS, cached 10 minutes per product + currency + cycle) for one service. */
export async function plansFor(p: any, currency: string) {
  const k = `${p.pid}|${currency}|${cycleKey(p.billingcycle)}`;
  const hit = optCache.get(k);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  const v = await upgradeOptions(call, p, currency);
  if (optCache.size > 500) optCache.clear();
  optCache.set(k, { at: Date.now(), v });
  return v;
}
/** The method the order is paid with: client default → service's method → first active gateway. */
export async function payMethodFor(clientId: number, p: any) {
  const [client, methods] = await Promise.all([getClientsDetails(clientId).catch(() => null), paymentMethods(call).catch(() => [])]);
  return paymentMethodFor(client, p, methods);
}
export async function quotesFor(p: any, plans: { pid: number; cycle: string }[], paymentmethod: string) {
  return Promise.all(plans.map((x) => quoteUpgrade(call, { serviceId: Number(p.id), pid: x.pid, cycle: x.cycle, paymentmethod }).then((q) => ({ ok: true as const, q: { ...q, pid: x.pid } }), (e) => ({ ok: false as const, pid: x.pid, error: e instanceof Error ? e.message : String(e) }))));
}

export class UpgradeError extends Error { constructor(message: string, public code: 'plan' | 'busy' | 'billing' | 'state') { super(message); } }
/**
 * Customer-confirmed upgrade. The idempotency key (from the confirm form) is claimed first: a double submit gets the
 * first order's invoice back instead of a second order. The plan is re-checked against the current options.
 */
export async function orderUpgrade(o: { clientId: number; p: any; pid: number; key: string; currency: string }) {
  const p = o.p;
  if (!/^active$/i.test(String(p.status))) throw new UpgradeError('Only active services can be upgraded here.', 'state');
  const plans = await upgradeOptions(call, p, o.currency);
  const plan = plans.options.find((x) => x.pid === o.pid);
  if (!plan) throw new UpgradeError('That plan is not available for this service.', 'plan');
  const ins = await db.insert(schema.cxUpgrades).values({ key: o.key, clientId: o.clientId, serviceId: Number(p.id), pid: o.pid, cycle: plan.cycle }).onConflictDoNothing().returning({ key: schema.cxUpgrades.key });
  if (!ins.length) {
    const [prev] = await db.select().from(schema.cxUpgrades).where(eq(schema.cxUpgrades.key, o.key));
    if (prev && prev.clientId === o.clientId && prev.status === 'ordered') return { orderId: prev.orderId || 0, invoiceId: prev.invoiceId || 0, repeat: true };
    throw new UpgradeError('This upgrade is already being processed. Check your invoices in a moment.', 'busy');
  }
  const pm = await payMethodFor(o.clientId, p);
  if (!pm) { await db.update(schema.cxUpgrades).set({ status: 'failed', error: 'no payment method' }).where(eq(schema.cxUpgrades.key, o.key)); throw new UpgradeError('No payment method is available for this order.', 'billing'); }
  try {
    const r = await placeUpgrade(call, { serviceId: Number(p.id), pid: o.pid, cycle: plan.cycle, paymentmethod: pm });
    await db.update(schema.cxUpgrades).set({ status: 'ordered', orderId: r.orderId || null, invoiceId: r.invoiceId || null }).where(eq(schema.cxUpgrades.key, o.key));
    return { ...r, repeat: false, plan };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(schema.cxUpgrades).set({ status: 'failed', error: msg.slice(0, 500) }).where(eq(schema.cxUpgrades.key, o.key));
    throw new UpgradeError(msg, 'billing');
  }
}
