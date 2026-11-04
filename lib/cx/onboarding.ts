// Welcome setup checklist: state per client (cx_onboarding) and auto-detection from real data, each check bounded:
//   domain  : nameservers are ours, or the domain's A record is the hosting server's address (public DNS)
//   ssl     : a trusted certificate is served for the domain (TLS probe)
//   email   : at least one mailbox on the domain (hosting panel, as the account's own user)
//   site    : the home page answers 200 with real content, not the panel's default page (bounded GET, public IPs only)
//   wordpress, backups : a WordPress install / a backup file exists (hosting panel)
//   team    : another user has access to the account (WHMCS users) · ai : an active Claude / ChatGPT connection (OAuth grants)
// Results are cached 10 minutes in the row; the dashboard shows the cached ones and account.js asks for a refresh.
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs } from '../whmcs';
import { loadServers } from '../hosting/servers';
import { serverFor } from '../hosting/match';
import { providerFor } from '../hosting/providers';
import { panelUser } from '../hosting/validate';
import { ourNameservers } from '../hosting/dns-plan';
import { lookupBasics, isPrivateIp, serverIpFor } from '../hosting/health-probe';
import { probeSsl } from '../hosting/ssl-probe';
import { membersFrom } from '../portal/team-perms';
import { customerGrants } from '../oauth/store';
import { isHostingService } from '../portal/views/renewals';
import type { ServerConfig } from '../hosting/types';
import {
  EMPTY_STATE, pickTarget, recentPurchases, shouldShow, buildSteps, progress, stale, siteLive,
  type ObState, type Target, type Detect, type StepId, type Manual, type StepView,
} from './onboarding-core';

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const within = <T>(p: Promise<T>, ms: number, fb: T): Promise<T> => new Promise((res) => { const t = setTimeout(() => res(fb), ms); p.then((v) => { clearTimeout(t); res(v); }, () => { clearTimeout(t); res(fb); }); });

export async function loadState(clientId: number): Promise<ObState> {
  const [r] = await db.select().from(schema.cxOnboarding).where(eq(schema.cxOnboarding.clientId, clientId)).catch(() => []);
  if (!r) return { ...EMPTY_STATE, manual: {}, detected: {} };
  return { startedAt: iso(r.startedAt), dismissedAt: iso(r.dismissedAt), completedAt: iso(r.completedAt), celebratedAt: iso(r.celebratedAt),
    manual: (r.manual || {}) as ObState['manual'], detected: (r.detected || {}) as ObState['detected'], detectedAt: iso(r.detectedAt), target: (r.target as Target) || null };
}
async function save(clientId: number, patch: Partial<typeof schema.cxOnboarding.$inferInsert>) {
  const v = { ...patch, clientId, updatedAt: new Date() };
  await db.insert(schema.cxOnboarding).values({ startedAt: new Date(), ...v }).onConflictDoUpdate({ target: schema.cxOnboarding.clientId, set: v });
}

/** Customer: mark a step done or skipped, or undo that (null). */
export async function setManual(clientId: number, step: StepId, value: Manual | null) {
  const st = await loadState(clientId);
  const manual = { ...st.manual };
  if (value) manual[step] = value; else delete manual[step];
  await save(clientId, { manual, ...(value ? {} : { completedAt: null, celebratedAt: null }) });
}
export async function dismiss(clientId: number) { await save(clientId, { dismissedAt: new Date() }); }

/* ---------------------------------------------------------------- detection */
const UA = 'GlobalHostia-Setup/1.0 (+https://globalhostia.com)';
/** Home page for "website live": public addresses only, same-site redirects (max 3), body capped at 128 KB, 7 s. */
export async function fetchHome(domain: string): Promise<{ status?: number; html: string }> {
  const b = await lookupBasics(domain).catch(() => ({ a: [] as string[], aaaa: [] as string[], ns: [] as string[] }));
  const ips = [...b.a, ...b.aaaa];
  if (!ips.length || ips.some(isPrivateIp)) return { html: '' };
  const signal = AbortSignal.timeout(7000);
  let url = `https://${domain}/`;
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const res = await fetch(url, { redirect: 'manual', signal, cache: 'no-store', headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8' } });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, url), h = next.hostname.toLowerCase();
        res.body?.cancel().catch(() => {});
        if (!/^https?:$/.test(next.protocol) || !(h === domain || h.endsWith('.' + domain)) || hop === 3) return { status: res.status, html: '' };
        url = next.toString(); continue;
      }
      let html = '';
      if (res.body) {
        const rd = res.body.getReader(), dec = new TextDecoder();
        try { for (;;) { const { done, value } = await rd.read(); if (done) break; html += dec.decode(value, { stream: true }); if (html.length > 131072) break; } } finally { rd.cancel().catch(() => {}); }
      }
      return { status: res.status, html };
    }
  } catch { /* not reachable */ }
  return { html: '' };
}

/** Gather every step's status for this target (about 8 s at most; anything that times out is "unknown"). */
export async function detect(clientId: number, t: Target, products: any[]): Promise<Partial<Record<StepId, Detect>>> {
  const out: Partial<Record<StepId, Detect>> = {};
  const servers = await loadServers().catch(() => [] as ServerConfig[]);
  const svc = t.serviceId ? products.find((p) => Number(p.id) === t.serviceId) : null;
  const server = svc ? serverFor(svc, servers) : null;
  const prov = server && svc?.username ? providerFor({ server, username: panelUser(svc.username), domain: t.domain }) : null;
  const ours = ourNameservers(servers);
  const B = 7500;

  const tasks: Promise<void>[] = [];
  tasks.push((async () => {
    const b = await within(lookupBasics(t.domain), B, null);
    if (!b) { out.domain = 'unknown'; return; }
    const nsOurs = b.ns.length > 0 && b.ns.every((n) => ours.includes(n));
    let ipOk = false;
    if (!nsOurs && server) {
      const ip = await within(serverIpFor(`${server.id}|${panelUser(svc.username)}`, server.url, prov?.usage ? async () => (await prov.usage!()).ip : undefined), 4000, undefined);
      ipOk = !!ip && b.a.includes(ip);
    }
    out.domain = nsOurs || ipOk ? 'done' : b.err === 'timeout' ? 'unknown' : 'todo';
  })());
  if (t.hosting) {
    tasks.push((async () => {
      const s = await within(probeSsl(t.domain, 6000), B, null);
      out.ssl = !s ? 'unknown' : s.https && (s.daysLeft ?? 0) > 0 ? 'done' : 'todo';
    })());
    tasks.push((async () => {
      const h = await within(fetchHome(t.domain), B + 500, { html: '' } as { status?: number; html: string });
      const v = siteLive(h.status, h.html);
      out.site = v === 'live' ? 'done' : 'todo';
    })());
    if (prov) {
      tasks.push(within(prov.email ? prov.email.list(t.domain).then((l) => { out.email = l.length ? 'done' : 'todo'; }) : Promise.resolve(void (out.email = 'unknown')), B, undefined).then(() => { if (!out.email) out.email = 'unknown'; }));
      tasks.push(within(prov.wordpress ? prov.wordpress.list().then((l) => { out.wordpress = l.some((w) => !w.staging) ? 'done' : 'todo'; }) : Promise.resolve(void (out.wordpress = 'unknown')), B, undefined).then(() => { if (!out.wordpress) out.wordpress = 'unknown'; }));
      tasks.push(within(prov.backups ? prov.backups.list().then((l) => { out.backups = l.length ? 'done' : 'todo'; }) : Promise.resolve(void (out.backups = 'unknown')), B, undefined).then(() => { if (!out.backups) out.backups = 'unknown'; }));
    } else { out.email = 'unknown'; out.wordpress = 'unknown'; out.backups = 'unknown'; }
  }
  tasks.push((async () => {
    const r = await within(whmcs('GetClientsDetails', { clientid: clientId, stats: false }), B, null);
    out.team = !r ? 'unknown' : membersFrom(r.client?.users ? r.client : r).length > 1 ? 'done' : 'todo';
  })());
  tasks.push((async () => {
    const g = await within(customerGrants(clientId), 3000, null);
    out.ai = g === null ? 'unknown' : g.length ? 'done' : 'todo';
  })());
  await Promise.all(tasks);
  return out;
}

export interface Card { show: boolean; target: Target | null; steps: StepView[]; prog: ReturnType<typeof progress>; stale: boolean; celebrate: boolean }
const hidden = (): Card => ({ show: false, target: null, steps: [], prog: { done: 0, total: 0, pct: 0, complete: false, next: null }, stale: false, celebrate: false });

/**
 * Dashboard: whether to show the card, and its steps from the stored state (cached detection). `fresh` runs the
 * detection now (the JSON refresh from account.js) and saves it; completion is recorded the first time it is reached.
 */
export async function checklist(clientId: number, products: any[], domains: any[], o: { fresh?: boolean; now?: number } = {}): Promise<Card> {
  const now = o.now ?? Date.now();
  const st = await loadState(clientId);
  const rec = recentPurchases(products, domains, now);
  if (!shouldShow(st, rec.any, now)) return hidden();
  const t = pickTarget(products, domains, now, isHostingService);
  if (!t) return hidden();
  let detected = st.detected, isStale = stale(st, now, t, st.target);
  if (isStale && st.target && (st.target.domain !== t.domain || st.target.serviceId !== t.serviceId)) detected = {}; // a different service now: start over
  if (o.fresh) {
    detected = await detect(clientId, t, products);
    isStale = false;
  }
  const steps = buildSteps(t, { manual: st.manual, detected });
  const prog = progress(steps);
  const patch: Partial<typeof schema.cxOnboarding.$inferInsert> = {};
  if (o.fresh) { patch.detected = detected as any; patch.detectedAt = new Date(now); patch.target = t as any; }
  if (!st.startedAt) patch.startedAt = new Date(now);
  if (prog.complete && !st.completedAt) patch.completedAt = new Date(now);
  // the celebration is shown once: the next visit no longer shows the card
  const celebrate = prog.complete && !st.celebratedAt;
  if (celebrate) patch.celebratedAt = new Date(now);
  if (Object.keys(patch).length) await save(clientId, patch).catch(() => {});
  return { show: true, target: t, steps, prog, stale: isStale && !prog.complete, celebrate };
}
