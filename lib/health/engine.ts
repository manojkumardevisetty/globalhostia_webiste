// Domain health alerts: server wiring. Builds the domain list from WHMCS (GetClientsDomains, GetClientsProducts) and
// the hosting panels (addon / alias domains as the account's own user), probes each due domain (lib/health/probe.ts),
// keeps the state in domain_health and sends alerts through the reminders delivery (WHMCS SendEmail or SMTP, quiet
// hours, caps, unsubscribe tokens, reminders_log idempotency; WhatsApp to opted-in customers for critical problems;
// web push). The decisions themselves are pure: lib/health/core.ts.
// Called by /api/cron/health (Vercel daily), the WHMCS cron tick (/api/reminders/webhook), the admin page and the portal.
import 'server-only';
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured } from '../whmcs';
import { getClientsDetails, getService } from '../portal/api';
import { getSettings } from '../settings';
import { loadServers } from '../hosting/servers';
import { serverFor } from '../hosting/match';
import { providerFor } from '../hosting/providers';
import { panelUser } from '../hosting/validate';
import { ourNameservers } from '../hosting/dns-plan';
import { serverIpFor } from '../hosting/health-probe';
import type { ServerConfig } from '../hosting/types';
import * as rstore from '../reminders/store';
import { sendableNow, withinCaps, spacedEnough, toE164, signUnsub } from '../reminders/core';
import { sendEmail, transportReady } from '../reminders/send';
import { sendTemplate } from '../reminders/whatsapp';
import { sendToClient } from '../portal/push';
import { createId } from '../id';
import {
  normalizeHealth, runCycle, buildTargets, HOSTING_MODULE, checkRow, evaluate, issueCopy, fixFor, markOf, alertStage, waWorthy, worst, firstSeen, factsSummary, nsKind, SEV_RANK,
  type HealthConfig, type Target, type HealthRow, type IssueMap, type MarkMap, type PlannedAlert, type RunResult, type Lang, type IssueKey, type SvcPanel, type Source,
} from './core';
import { probeDomain, type ProbeOptions } from './probe';
import { healthEmail, type AlertLine } from './email';

const CFG_KEY = 'health_config', STATE_KEY = 'health_state', LOCK_KEY = 'health_lock', INV_KEY = 'health_inventory';
const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const lc = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

async function readKey<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}
async function writeKey(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}
export async function loadHealthConfig(): Promise<HealthConfig> { return normalizeHealth(await readKey(CFG_KEY).catch(() => undefined)); }
export async function saveHealthConfig(c: HealthConfig) { await writeKey(CFG_KEY, normalizeHealth(c)); }
export type HealthState = { lastRun?: string; lastResult?: unknown; lastTick?: string };
export async function healthState(): Promise<HealthState> { return (await readKey<HealthState>(STATE_KEY).catch(() => undefined)) || {}; }
async function patchState(p: Partial<HealthState>) {
  await db.execute(sql`insert into settings (key, value) values (${STATE_KEY}, ${JSON.stringify(p)}::jsonb) on conflict (key) do update set value = settings.value || excluded.value`).catch(() => {});
}
async function acquire(leaseSec: number): Promise<boolean> {
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

/* ================================================================ inventory */
async function all(action: string, key: string, sub: string, extra: Record<string, string | number> = {}, max = 10000) {
  const out: any[] = [];
  for (let start = 0; start < max; start += 250) {
    const r = await whmcs(action, { limitstart: start, limitnum: 250, ...extra });
    const page = arr(r[key]?.[sub]);
    out.push(...page);
    if (page.length < 250 || out.length >= Number(r.totalresults || 0)) break;
  }
  return out;
}
type InvCache = Record<string, SvcPanel & { at: number }>;
const INV_TTL = 24 * 3600_000;

/** Every customer domain: registered domains, hosting service domains, and addon / alias domains on managed panels. */
export async function inventory(cfg: HealthConfig, o: { panelBudget?: number; deadline?: number } = {}): Promise<Target[]> {
  const [domains, products, servers] = await Promise.all([all('GetClientsDomains', 'domains', 'domain'), all('GetClientsProducts', 'products', 'product'), loadServers().catch(() => [] as ServerConfig[])]);
  const now = Date.now();
  const cache: InvCache = (await readKey<InvCache>(INV_KEY).catch(() => undefined)) || {};
  let budget = o.panelBudget ?? 25, cacheChanged = false;
  // refresh the panel's domain list (addon + alias domains) for managed hosting accounts, at most daily, bounded per run
  for (const p of products) {
    if (!/^active$/i.test(String(p.status)) || !p.domain) continue;
    const server = serverFor(p, servers), sid = String(p.id);
    if (!server || budget <= 0 || (o.deadline && Date.now() > o.deadline)) continue;
    if (cache[sid] && now - cache[sid].at < INV_TTL && cache[sid].serverId === server.id) continue;
    budget--;
    try {
      const user = panelUser(p.username);
      const prov = providerFor({ server, username: user, domain: lc(p.domain) });
      const doms = (await prov.domains()).map(lc);
      const aliases: string[] = [];
      if (cfg.sources.alias && prov.aliases) for (const d of doms.slice(0, 10)) aliases.push(...(await prov.aliases.list(d).catch(() => [])).map((a) => lc(a.name)));
      const ip = (await serverIpFor(`${server.id}|${user}`, server.url, prov.usage ? async () => (await prov.usage!()).ip : undefined).catch(() => undefined)) || '';
      cache[sid] = { at: now, serverId: server.id, domains: doms.slice(0, 200), aliases: aliases.slice(0, 200), ip, ssl: !!prov.ssl && (prov.caps.ssl || []).includes('issue') };
      cacheChanged = true;
    } catch { /* panel unreachable: keep the cached list, or the service domain only */ }
  }
  if (cacheChanged) {
    for (const k of Object.keys(cache)) if (now - cache[k].at > 7 * INV_TTL) delete cache[k];
    await writeKey(INV_KEY, cache).catch(() => {});
  }
  return buildTargets(domains, products, {
    now, addon: cfg.sources.addon, alias: cfg.sources.alias,
    managed: (p) => !!serverFor(p, servers) || HOSTING_MODULE.test(String(p.module || '')),
    panel: (p) => { const server = serverFor(p, servers); const c = server ? cache[String(p.id)] : undefined; return c && c.serverId === server!.id ? c : null; },
  });
}

/* ================================================================ store (domain_health) */
type DbRow = typeof schema.domainHealth.$inferSelect;
const toRow = (r: DbRow): HealthRow => ({
  id: r.id, domain: r.domain, clientId: r.clientId, active: r.active, external: r.external, status: r.status,
  issues: (r.issues || {}) as IssueMap, marks: (r.lastAlerted || {}) as MarkMap, lastChecked: r.lastChecked ? r.lastChecked.getTime() : null,
  target: { domain: r.domain, clientId: r.clientId, sources: (r.sources || []) as Source[], whmcsDomainId: r.whmcsDomainId, serviceId: r.serviceId, serverId: r.serverId || null, serverIp: r.serverIp || null, sslIssue: r.sslIssue, reg: (r.reg as any) || null },
});
export const dbStore = {
  async sync(targets: Target[]) {
    const existing = await db.select({ id: schema.domainHealth.id, domain: schema.domainHealth.domain, clientId: schema.domainHealth.clientId, active: schema.domainHealth.active }).from(schema.domainHealth);
    const seen = new Set(targets.map((t) => `${t.clientId}|${t.domain}`));
    const had = new Set(existing.map((r) => `${r.clientId}|${r.domain}`));
    for (let i = 0; i < targets.length; i += 200) {
      const rows = targets.slice(i, i + 200).map((t) => ({ id: createId(), domain: t.domain, clientId: t.clientId, sources: t.sources, whmcsDomainId: t.whmcsDomainId ?? null, serviceId: t.serviceId ?? null,
        serverId: t.serverId || '', serverIp: t.serverIp || '', sslIssue: !!t.sslIssue, reg: (t.reg ?? null) as any, active: true, updatedAt: new Date() }));
      await db.insert(schema.domainHealth).values(rows).onConflictDoUpdate({ target: [schema.domainHealth.domain, schema.domainHealth.clientId], set: {
        sources: sql`excluded.sources`, whmcsDomainId: sql`excluded.whmcs_domain_id`, serviceId: sql`excluded.service_id`, serverId: sql`excluded.server_id`, serverIp: sql`excluded.server_ip`,
        sslIssue: sql`excluded.ssl_issue`, reg: sql`excluded.reg`, active: sql`true`, updatedAt: sql`now()`,
      } });
    }
    const gone = existing.filter((r) => r.active && !seen.has(`${r.clientId}|${r.domain}`)).map((r) => r.id);
    for (let i = 0; i < gone.length; i += 500) await db.update(schema.domainHealth).set({ active: false, updatedAt: new Date() }).where(inArray(schema.domainHealth.id, gone.slice(i, i + 500)));
    return { added: targets.filter((t) => !had.has(`${t.clientId}|${t.domain}`)).length, removed: gone.length };
  },
  async due(limit: number, olderThanMs: number) {
    const rows = await db.select().from(schema.domainHealth).where(and(eq(schema.domainHealth.active, true), or(isNull(schema.domainHealth.lastChecked), lt(schema.domainHealth.lastChecked, new Date(Date.now() - olderThanMs)))))
      .orderBy(sql`${schema.domainHealth.lastChecked} asc nulls first`).limit(limit);
    return rows.map(toRow);
  },
  async saveCheck(id: string, p: { issues: IssueMap; status: string; checks: unknown; firstSeen: string | null; checkedAt: number }) {
    await db.update(schema.domainHealth).set({ issues: p.issues as any, status: p.status, checks: p.checks as any, firstSeenIssue: p.firstSeen ? new Date(p.firstSeen) : null, lastChecked: new Date(p.checkedAt), updatedAt: new Date() }).where(eq(schema.domainHealth.id, id));
    await recordDay(id, p.status, Object.keys(p.issues || {}), p.checkedAt); // monthly site report history (lib/cx)
  },
  async saveMarks(id: string, marks: MarkMap) { await db.update(schema.domainHealth).set({ lastAlerted: marks as any, updatedAt: new Date() }).where(eq(schema.domainHealth.id, id)); },
};

/** Daily history for the monthly site report (health_days, patch 041-cx): checks that day, worst status, union of issue
 *  keys, per Dubai calendar day. Never fails the check itself (table missing before the patch ran: ignored). */
async function recordDay(id: string, status: string, keys: string[], at: number) {
  const day = new Date(at + 4 * 3600_000).toISOString().slice(0, 10);
  await db.execute(sql`insert into health_days (row_id, day, client_id, domain, checks, status, issues)
    select id, ${day}, client_id, domain, 1, ${status}, ${JSON.stringify(keys.slice(0, 40))}::jsonb from domain_health where id = ${id}
    on conflict (row_id, day) do update set checks = health_days.checks + 1,
      status = case when (array_position(array['ok','unknown','info','warning','critical'], excluded.status)) > coalesce(array_position(array['ok','unknown','info','warning','critical'], health_days.status), 0) then excluded.status else health_days.status end,
      issues = (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(health_days.issues || excluded.issues) x)`).catch(() => {});
}

/* ================================================================ probe */
export function probeFor(cfg: HealthConfig) {
  return (t: Target, o: { mailNeeded: boolean }) => {
    const hostingHere = t.sources.some((s) => s !== 'registered');
    const opts: ProbeOptions = {
      timeouts: cfg.timeouts, mail: o.mailNeeded, web: cfg.checks.https, tlsCheck: cfg.checks.ssl,
      dkimSelectors: cfg.checks.dkim && hostingHere ? ['x', 'default'] : [], forceDoh: process.env.HEALTH_FORCE_DOH === '1',
    };
    return probeDomain(t.domain, opts);
  };
}

/* ================================================================ customer choices */
export async function healthPrefs(clientId: number): Promise<{ alerts: boolean }> {
  const [r] = await db.select().from(schema.healthPrefs).where(eq(schema.healthPrefs.clientId, clientId)).catch(() => []);
  return { alerts: r ? r.alerts : true };
}
/** Portal / unsubscribe: turning alerts back on lifts an earlier "health" unsubscribe (and an "all" one, keeping the other choices). */
export async function setHealthPrefs(clientId: number, email: string, alerts: boolean) {
  const v = { clientId, email: email.toLowerCase().slice(0, 254), alerts, updatedAt: new Date() };
  await db.insert(schema.healthPrefs).values(v).onConflictDoUpdate({ target: schema.healthPrefs.clientId, set: v });
  if (alerts && email) {
    const e = email.toLowerCase();
    await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, e), eq(schema.reminderSuppress.scope, 'health')));
    const sup = await rstore.suppressedScopes(e);
    if (sup.has('all')) {
      const p = await rstore.prefsFor(clientId).catch(() => rstore.DEFAULT_PREFS);
      await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, e), eq(schema.reminderSuppress.scope, 'all')));
      if (!p.cartEmail) await rstore.suppress(e, 'cart', 'portal');
      if (!p.renewalEmail) await rstore.suppress(e, 'renewal', 'portal');
    }
  }
}

/* ================================================================ delivery */
const langOf = (c: any): Lang => (/^(arabic|ar)/i.test(String(c?.language || '')) ? 'ar' : 'en');
const firstName = (c: any) => String(c?.firstname || '').trim() || String(c?.fullname || '').split(' ')[0] || '';
const WHY: Record<Lang, string> = { en: 'You get this because these domains are on your GlobalHostia account.', ar: 'تصلك هذه الرسالة لأن هذه النطاقات مسجلة في حسابك لدى GlobalHostia.' };
const randomId = () => createId();

export function lineFor(a: PlannedAlert, l: Lang): AlertLine {
  const c = issueCopy(a.key, a.issue.params, l);
  const rec = a.fix.kind === 'help' && (a.key === 'spf_missing' || a.key === 'spf_server' || a.key === 'dmarc_missing') ? { name: a.key.startsWith('dmarc') ? '_dmarc' : '@', value: String(a.issue.params.value || '') } : null;
  return { domain: a.domain, sev: a.issue.sev, title: c.title, explain: c.explain, fix: { href: a.fix.href, label: a.fix.label[l] }, record: rec && rec.value ? rec : null };
}

function deliverFor(cfg: HealthConfig, site: string, secret: string, now: () => number) {
  return async (cid: number, alerts: PlannedAlert[], resolved: PlannedAlert[]) => {
    const rcfg = await rstore.loadConfig();
    const dropResolved = resolved.map((g) => `${g.rowId}:${g.key}:resolved`);
    if (!transportReady(rcfg)) return { delivered: [], skipped: `transport-not-ready:${rcfg.transport}` };
    const client = await getClientsDetails(cid).catch(() => null);
    if (!client?.email) return { delivered: [], skipped: 'client-lookup' };
    if (/^(closed|inactive)$/i.test(String(client.status || ''))) return { delivered: dropResolved, skipped: 'client-inactive' };
    const email = String(client.email), lang = langOf(client), name = firstName(client), country = client.countrycode || client.country;
    if (!(await healthPrefs(cid)).alerts) return { delivered: dropResolved, skipped: 'opted-out' };
    if (rstore.blocks(await rstore.suppressedScopes(email), 'health')) return { delivered: dropResolved, skipped: 'unsubscribed' };
    if (!sendableNow(now(), country, rcfg.quiet)) return { delivered: [], skipped: 'quiet-hours' };
    const sent = await rstore.recentSends(cid, email);
    if (!withinCaps(sent, now(), rcfg.caps) || !spacedEnough(sent, now())) return { delivered: [], skipped: 'cap' };

    const delivered: string[] = [];
    const messageId = randomId();
    const claimed: { a: PlannedAlert; id: string }[] = [], claimedFixed: { a: PlannedAlert; id: string }[] = [];
    for (const a of alerts) {
      const id = await rstore.claim({ kind: 'health', clientId: cid, email, item: `hd:${a.rowId}`, stage: alertStage(a.key, a.issue), channel: 'email', cycle: a.issue.first.slice(0, 19), messageId, detail: { domain: a.domain, key: a.key, sev: a.issue.sev } });
      if (id) claimed.push({ a, id }); else delivered.push(`${a.rowId}:${a.key}`); // already sent earlier (marks not saved then): repair
    }
    for (const g of resolved) {
      const id = await rstore.claim({ kind: 'health', clientId: cid, email, item: `hd:${g.rowId}`, stage: `${g.key}:resolved`, channel: 'email', cycle: g.issue.first.slice(0, 19), messageId, detail: { domain: g.domain, key: g.key, resolved: true } });
      if (id) claimedFixed.push({ a: g, id }); else delivered.push(`${g.rowId}:${g.key}:resolved`);
    }
    if (claimed.length || claimedFixed.length) {
      const t = signUnsub({ e: email, c: cid, s: 'health' }, secret);
      const unsubUrl = `${site}/account/unsubscribe?t=${t}`;
      const mail = healthEmail({ lang, name, alerts: claimed.map((x) => lineFor(x.a, lang)), fixed: claimedFixed.map((x) => ({ domain: x.a.domain, title: issueCopy(x.a.key, x.a.issue.params, lang).title })),
        footer: { unsubUrl, prefsUrl: `${site}/account/settings#reminders`, why: WHY[lang] }, panelUrl: `${site}/account/health` });
      const r = await sendEmail(rcfg, { clientId: cid, to: email, subject: mail.subject, html: mail.html, text: mail.text, unsubUrl, unsubPost: `${unsubUrl}&one-click=1`, lang });
      await rstore.finish([...claimed, ...claimedFixed].map((x) => x.id), r.ok, r.error);
      if (r.ok) { for (const x of claimed) delivered.push(`${x.a.rowId}:${x.a.key}`); for (const x of claimedFixed) delivered.push(`${x.a.rowId}:${x.a.key}:resolved`); }
    }
    // critical problems: WhatsApp (opted-in number) and web push, one message about the most urgent one
    const urgent = claimed.map((x) => x.a).filter((a) => waWorthy(a.key, a.issue))[0];
    if (urgent) {
      const c = issueCopy(urgent.key, urgent.issue.params, lang), link = `${site}/account/health?d=${encodeURIComponent(urgent.domain)}`;
      const rp = await rstore.prefsFor(cid).catch(() => rstore.DEFAULT_PREFS);
      const phone = rp.whatsapp ? toE164(client.phonenumberformatted || client.phonenumber, { country, cc: client.phonecc }) : null;
      const creds = cfg.whatsapp.enabled && cfg.whatsapp.template ? await rstore.waCreds() : null;
      if (phone && creds) {
        const id = await rstore.claim({ kind: 'health', clientId: cid, email, item: `hd:${urgent.rowId}`, stage: alertStage(urgent.key, urgent.issue), channel: 'whatsapp', cycle: urgent.issue.first.slice(0, 19), messageId, detail: { domain: urgent.domain, key: urgent.key } });
        if (id) { const r = await sendTemplate(creds, phone, cfg.whatsapp.template, rcfg.whatsapp.langs[lang], [name || '-', urgent.domain, c.title, link]); await rstore.finish([id], r.ok, r.ok ? '' : r.error); }
      }
      if (cfg.push) {
        const id = await rstore.claim({ kind: 'health', clientId: cid, email, item: `hd:${urgent.rowId}`, stage: alertStage(urgent.key, urgent.issue), channel: 'push', cycle: urgent.issue.first.slice(0, 19), messageId, detail: { domain: urgent.domain, key: urgent.key } });
        if (id) {
          const n = await sendToClient(cid, 'domains', () => ({ title: `${urgent.domain}: ${issueCopy(urgent.key, urgent.issue.params, lang).title}`, body: issueCopy(urgent.key, urgent.issue.params, lang).explain.slice(0, 180), url: `/account/health?d=${encodeURIComponent(urgent.domain)}`, tag: `health-${urgent.domain}` })).catch(() => 0);
          await rstore.finish([id], n > 0, n > 0 ? '' : 'no device');
        }
      }
    }
    return { delivered };
  };
}

/* ================================================================ entry points */
export async function runHealth(reason = 'manual', o: { deadlineMs?: number; limit?: number; sync?: boolean } = {}): Promise<RunResult & { ok: boolean; stopped?: string; ms?: number; error?: string }> {
  const t0 = Date.now();
  let cfg: HealthConfig;
  try { cfg = await loadHealthConfig(); } catch (e: any) { return { ...empty(), ok: false, error: `config: ${e?.message || e}` }; }
  if (!cfg.enabled) return { ...empty(), ok: true, stopped: 'disabled' };
  if (!whmcsConfigured()) return { ...empty(), ok: false, stopped: 'whmcs-not-configured' };
  const deadlineMs = o.deadlineMs ?? 240_000;
  if (!(await acquire(Math.ceil(deadlineMs / 1000) + 40).catch(() => false))) return { ...empty(), ok: true, stopped: 'busy' };
  try {
    const [site, servers] = await Promise.all([siteUrl(), loadServers().catch(() => [] as ServerConfig[])]);
    const deadline = t0 + deadlineMs;
    // the domain list is rebuilt at most every 6 hours (a big WHMCS call); probes stop at the deadline
    const st = await healthState();
    const lastSync = (st.lastResult as any)?.syncedAt ? Date.parse((st.lastResult as any).syncedAt) : 0;
    const sync = o.sync ?? Date.now() - lastSync > 6 * 3600_000;
    const r = await runCycle(cfg, {
      now: Date.now, deadline: deadline - 15_000, site, ourNs: ourNameservers(servers),
      inventory: () => inventory(cfg, { deadline: t0 + deadlineMs / 3 }), store: dbStore, probe: probeFor(cfg),
      deliver: deliverFor(cfg, site, rstore.linkSecret(), Date.now), log: (m) => console.warn('[health]', m),
    }, { sync, limit: o.limit });
    const out = { ok: true, ...r, ms: Date.now() - t0 };
    await patchState({ lastRun: new Date().toISOString(), lastResult: { reason, ...out, syncedAt: r.synced ? new Date().toISOString() : (st.lastResult as any)?.syncedAt } });
    return out;
  } finally { await release(); }
}
const empty = (): RunResult => ({ synced: null, checked: 0, errors: 0, issues: { critical: 0, warning: 0, info: 0 }, alerts: 0, resolved: 0, clients: 0, skipped: {}, deadline: false });

/** WHMCS cron tick (every few minutes): a short run, at most every 10 minutes. */
export async function tickHealth() {
  const st = await healthState();
  if (st.lastTick && Date.now() - Date.parse(st.lastTick) < 10 * 60_000) return { ...empty(), ok: true, stopped: 'recent' };
  await patchState({ lastTick: new Date().toISOString() });
  return runHealth('whmcs-cron', { deadlineMs: 45_000, limit: 60 });
}

/* ================================================================ portal */
export async function rowsFor(clientId: number) {
  return (await db.select().from(schema.domainHealth).where(and(eq(schema.domainHealth.clientId, clientId), eq(schema.domainHealth.active, true))).orderBy(asc(schema.domainHealth.domain)).catch(() => [])).map((r) => ({ ...toRow(r), checks: r.checks as any }));
}
export async function rowFor(clientId: number, domain: string) {
  const [r] = await db.select().from(schema.domainHealth).where(and(eq(schema.domainHealth.clientId, clientId), eq(schema.domainHealth.domain, lc(domain)), eq(schema.domainHealth.active, true))).catch(() => []);
  return r ? { ...toRow(r), checks: r.checks as any } : null;
}
/** Re-check now (customer): fresh probe, state saved; what the customer now sees on screen is not emailed again. */
export async function recheck(clientId: number, domain: string) {
  const row = await rowFor(clientId, domain);
  if (!row) return null;
  const cfg = await loadHealthConfig();
  const servers = await loadServers().catch(() => [] as ServerConfig[]);
  const r = await checkRow(row, cfg, { probe: probeFor(cfg), ourNs: ourNameservers(servers), now: Date.now });
  await dbStore.saveCheck(row.id, { issues: r.issues, status: r.status, checks: r.checks, firstSeen: r.firstSeen, checkedAt: Date.now() });
  const marks: MarkMap = {};
  for (const [k, i] of Object.entries(r.issues)) if (i && SEV_RANK[i.sev] >= 1) marks[k as IssueKey] = row.marks[k as IssueKey] && row.marks[k as IssueKey]!.first === i.first && SEV_RANK[row.marks[k as IssueKey]!.sev] >= SEV_RANK[i.sev] ? row.marks[k as IssueKey] : markOf(i, r.at);
  await dbStore.saveMarks(row.id, marks);
  return rowFor(clientId, domain);
}
/** "DNS / website elsewhere on purpose": stops the nameserver and A-record notes for this domain. */
export async function setExternal(clientId: number, domain: string, on: boolean) {
  const row = await rowFor(clientId, domain);
  if (!row) return false;
  const issues = { ...row.issues }, marks = { ...row.marks };
  if (on) for (const k of ['ns_external', 'a_mismatch'] as IssueKey[]) { delete issues[k]; delete marks[k]; }
  await db.update(schema.domainHealth).set({ external: on, issues: issues as any, lastAlerted: marks as any, status: Object.keys(issues).length ? worst(Object.values(issues) as any) : row.lastChecked ? 'ok' : row.status, firstSeenIssue: firstSeen(issues) ? new Date(firstSeen(issues)!) : null, updatedAt: new Date() }).where(eq(schema.domainHealth.id, row.id));
  return true;
}
export class SslUnavailable extends Error {}
/** Issue a free SSL certificate through the hosting panel (same adapter path as the connector's issue_ssl tool). */
export async function issueSslFor(clientId: number, domain: string): Promise<string> {
  const row = await rowFor(clientId, domain);
  if (!row || !row.target.serviceId || !row.target.sslIssue) throw new SslUnavailable('Free SSL cannot be issued for this domain from here. Open a ticket and we will do it.');
  const svc = await getService(clientId, row.target.serviceId);
  if (!svc || !/^active$/i.test(String(svc.status))) throw new SslUnavailable('The hosting service for this domain is not active.');
  const server = serverFor(svc, await loadServers());
  if (!server) throw new SslUnavailable('This hosting service is not on a server that can be managed here.');
  const p = providerFor({ server, username: panelUser(svc.username), domain: lc(svc.domain) });
  if (!p.ssl || !(p.caps.ssl || []).includes('issue')) throw new SslUnavailable('Free SSL cannot be issued on this hosting plan from here. Open a ticket and we will do it.');
  const doms = (await p.domains()).map(lc);
  if (!doms.includes(lc(domain))) throw new SslUnavailable('This domain is not on your hosting account any more.');
  return p.ssl.issue(lc(domain), true);
}

/* ================================================================ admin */
export async function adminList(o: { status?: string; q?: string; limit?: number; offset?: number } = {}) {
  const conds = [eq(schema.domainHealth.active, true)];
  if (o.status && ['critical', 'warning', 'ok', 'unknown'].includes(o.status)) conds.push(eq(schema.domainHealth.status, o.status));
  if (o.status === 'unchecked') conds.push(isNull(schema.domainHealth.lastChecked));
  if (o.q) conds.push(sql`${schema.domainHealth.domain} ilike ${'%' + o.q.replace(/[%_\\]/g, '') + '%'}`);
  return db.select().from(schema.domainHealth).where(and(...conds))
    .orderBy(sql`case ${schema.domainHealth.status} when 'critical' then 0 when 'warning' then 1 when 'unknown' then 2 else 3 end`, asc(schema.domainHealth.domain)).limit(o.limit ?? 200).offset(o.offset ?? 0);
}
export async function adminCounts() {
  const r = await db.execute(sql`select status, count(*)::int n, count(*) filter (where last_checked is null or last_checked < now() - interval '24 hours')::int stale from domain_health where active group by status`);
  const out: Record<string, number> = { total: 0, stale: 0 };
  for (const x of r as any) { out[x.status] = x.n; out.total += x.n; out.stale += x.stale; }
  return out;
}
export async function alertLog(limit = 100) {
  return db.select().from(schema.remindersLog).where(eq(schema.remindersLog.kind, 'health')).orderBy(desc(schema.remindersLog.createdAt)).limit(limit);
}
/** Admin single-domain test: a fresh probe + evaluation, nothing saved, nothing sent. */
export async function testDomain(domain: string) {
  const d = lc(domain);
  if (!DOMAIN_RE.test(d)) throw new Error('Enter a domain name like example.com');
  const cfg = await loadHealthConfig();
  const servers = await loadServers().catch(() => [] as ServerConfig[]);
  const [r] = await db.select().from(schema.domainHealth).where(eq(schema.domainHealth.domain, d)).limit(1).catch(() => []);
  const row = r ? toRow(r) : null;
  const target: Target = row?.target || { domain: d, clientId: 0, sources: ['registered'] };
  const t0 = Date.now();
  const facts = await probeFor({ ...cfg, checks: { ...cfg.checks } })(target, { mailNeeded: true });
  const ours = ourNameservers(servers);
  const issues = evaluate(target, facts, { cfg, ourNs: ours, external: row?.external, now: Date.now() });
  const site = await siteUrl();
  const nsOurs = nsKind(facts.dns.ns, ours) === 'ours';
  return { domain: d, known: !!row, target, ms: Date.now() - t0, facts: factsSummary(facts), issues: issues.map((i) => ({ ...i, copy: issueCopy(i.key, i.params, 'en'), fix: fixFor(i.key, i, target, { site, nsOurs }) })) };
}
/** Alerts switched on: treat what is already open as told, so customers only hear about problems from now on. */
export async function baseline() {
  const rows = await db.select({ id: schema.domainHealth.id, issues: schema.domainHealth.issues, marks: schema.domainHealth.lastAlerted }).from(schema.domainHealth).where(eq(schema.domainHealth.active, true));
  const at = new Date().toISOString();
  let n = 0;
  for (const r of rows) {
    const issues = (r.issues || {}) as IssueMap, marks = { ...((r.marks || {}) as MarkMap) };
    let ch = false;
    for (const [k, i] of Object.entries(issues)) if (i && !marks[k as IssueKey]) { marks[k as IssueKey] = markOf(i, at); ch = true; n++; }
    if (ch) await dbStore.saveMarks(r.id, marks);
  }
  return n;
}
/** Preview of the alert email for the admin page (example problems, real copy and links). */
export function previewEmail(lang: Lang, site = 'https://globalhostia.com') {
  const t: Target = { domain: 'yourbrand.com', clientId: 1, sources: ['registered', 'service'], whmcsDomainId: 301, serviceId: 102, serverIp: '216.158.237.114', sslIssue: true };
  const mk = (key: IssueKey, sev: 'critical' | 'warning', params: Record<string, string | number>, stage = 0): PlannedAlert => ({ rowId: 'x', domain: t.domain, key, target: t, issue: { sev, stage, first: '', last: '', params: { domain: t.domain, ...params }, check: 'ssl' }, fix: fixFor(key, { params }, t, { site, nsOurs: true }) });
  const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const alerts = [mk('ssl_expiring', 'critical', { days: 2, date: day(2) }, 2), mk('dmarc_missing', 'warning', { value: 'v=DMARC1; p=none; rua=mailto:postmaster@yourbrand.com' })];
  return healthEmail({ lang, name: lang === 'ar' ? 'منوج' : 'Manoj', alerts: alerts.map((a) => lineFor(a, lang)), fixed: [{ domain: 'yourbrand.shop', title: issueCopy('site_down', { domain: 'yourbrand.shop', reason: 'timeout' }, lang).title }],
    footer: { unsubUrl: `${site}/account/unsubscribe?t=preview`, prefsUrl: `${site}/account/settings#reminders`, why: WHY[lang] }, panelUrl: `${site}/account/health` });
}
