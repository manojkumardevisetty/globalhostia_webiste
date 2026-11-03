// I/O side of Site health and "Connect my domain": DNS lookups (node:dns/promises with timeouts), a bounded HTTPS
// fetch of the home page, the TLS probe and the RDAP registrar lookup. Only ever called for domains already verified
// to belong to the account. Results are cached in memory per server instance (LRU-ish, 5 minutes for health).
import 'server-only';
import { Resolver } from 'node:dns/promises';
import { probeSsl } from './ssl-probe';
import type { HealthFacts, WebFacts } from './health';
import { connectSteps, detectProvider, providerByName, rdapRegistrar, type ConnectFacts } from './connect';

const PUBLIC_DNS = ['1.1.1.1', '8.8.8.8', '1.0.0.1'];
const UA = 'GlobalHostia-SiteHealth/1.0 (+https://globalhostia.com)';
const MAX_BODY = 256 * 1024;

/* ---------------- small helpers ---------------- */
type R<T> = { v: T; err?: string };
const within = <T>(p: Promise<T>, ms: number, fb: T): Promise<R<T>> => new Promise((res) => {
  const t = setTimeout(() => res({ v: fb, err: 'timeout' }), ms);
  p.then((v) => { clearTimeout(t); res({ v }); }, (e: any) => { clearTimeout(t); res({ v: fb, err: e?.code === 'ETIMEOUT' ? 'timeout' : e?.code === 'ENOTFOUND' || e?.code === 'ENODATA' ? undefined : String(e?.code || 'error') }); });
});
function resolver(servers: string[]) { const r = new Resolver({ timeout: 2500, tries: 2 }); try { r.setServers(servers); } catch { r.setServers(PUBLIC_DNS); } return r; }
const pub = () => resolver(PUBLIC_DNS);

class Lru<V> {
  private m = new Map<string, { v: V; until: number }>();
  constructor(private max: number) {}
  get(k: string): V | undefined { const h = this.m.get(k); if (!h) return; if (h.until < Date.now()) { this.m.delete(k); return; } this.m.delete(k); this.m.set(k, h); return h.v; }
  set(k: string, v: V, ttl: number) { this.m.delete(k); this.m.set(k, { v, until: Date.now() + ttl }); while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string); }
  del(k: string) { this.m.delete(k); }
}

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.'); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Bounded pool: run fn over items with at most `n` in flight. */
export async function pool<T, U>(items: T[], n: number, fn: (x: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

/* ---------------- DNS ---------------- */
const nsIpCache = new Lru<string[]>(50);
/** Resolver that asks our own authoritative servers (no caching delay after an in-panel fix). */
async function authResolver(ns: string[]): Promise<Resolver> {
  const key = ns.join(',');
  let ips = nsIpCache.get(key);
  if (!ips) {
    const r = pub();
    ips = (await Promise.all(ns.slice(0, 3).map((n) => within(r.resolve4(n), 3000, [] as string[])))).flatMap((x) => x.v);
    if (ips.length) nsIpCache.set(key, ips, 3600_000);
  }
  return ips.length ? resolver(ips) : pub();
}
const txt = (r: Resolver, name: string) => within(r.resolveTxt(name).then((rows) => rows.map((c) => c.join(''))), 5000, [] as string[]);
const host = (s: string) => s.toLowerCase().replace(/\.$/, '');

export async function lookupBasics(domain: string): Promise<{ ns: string[]; a: string[]; aaaa: string[]; err?: string }> {
  const r = pub();
  const [ns, a, aaaa] = await Promise.all([within(r.resolveNs(domain), 5000, [] as string[]), within(r.resolve4(domain), 5000, [] as string[]), within(r.resolve6(domain), 5000, [] as string[])]);
  return { ns: ns.v.map(host).sort(), a: a.v, aaaa: aaaa.v, err: a.err === 'timeout' && ns.err === 'timeout' ? 'timeout' : undefined };
}

/* ---------------- website ---------------- */
function netError(e: any): string {
  const c = String(e?.cause?.code || e?.code || '');
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'No answer within 8 seconds';
  if (/CERT_HAS_EXPIRED/.test(c)) return 'The SSL certificate has expired';
  if (/ALTNAME/.test(c)) return 'The SSL certificate is for a different name';
  if (/SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(c)) return 'The SSL certificate is not trusted';
  if (/ECONNREFUSED/.test(c)) return 'The server refused the connection';
  if (/ENOTFOUND|EAI_AGAIN/.test(c)) return 'The address does not resolve';
  if (/ECONNRESET|EPIPE|UND_ERR_SOCKET/.test(c)) return 'The connection was dropped';
  return 'Could not connect';
}

/** GET with manual redirects (max 3, same domain only), body capped at 256 KB, 8 s overall. */
export async function fetchSite(start: string, domain: string, totalMs = 8000): Promise<WebFacts & { firstStatus?: number; firstLocation?: string }> {
  const signal = AbortSignal.timeout(totalMs);
  let url = start, firstStatus: number | undefined, firstLocation: string | undefined;
  const t0 = Date.now();
  try {
    for (let hop = 0; hop <= 3; hop++) {
      const res = await fetch(url, { redirect: 'manual', signal, cache: 'no-store', headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8' } });
      const loc = res.headers.get('location');
      if (hop === 0) { firstStatus = res.status; firstLocation = loc || undefined; }
      if (res.body) { // drain at most 256 KB so keep-alive sockets are released, then stop
        const rd = res.body.getReader(); let n = 0;
        try { for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.byteLength; if (n > MAX_BODY) break; } } finally { rd.cancel().catch(() => {}); }
      }
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, url);
        const h = next.hostname.toLowerCase();
        if (!/^https?:$/.test(next.protocol) || !(h === domain || h.endsWith('.' + domain)) || hop === 3) return { ok: true, status: res.status, ms: Date.now() - t0, finalUrl: next.toString(), firstStatus, firstLocation };
        url = next.toString(); continue;
      }
      return { ok: res.status < 400, status: res.status, ms: Date.now() - t0, finalUrl: url, firstStatus, firstLocation };
    }
  } catch (e) { return { ok: false, error: netError(e), ms: Date.now() - t0, firstStatus, firstLocation }; }
  return { ok: false, error: 'Too many redirects' };
}

async function websiteFacts(domain: string, a: string[]): Promise<HealthFacts['web']> {
  if (!a.length) return undefined;
  if (a.some(isPrivateIp)) return { ok: false, skipped: `${domain} points to a private network address (${a.find(isPrivateIp)}), so it cannot be reached from the internet.` };
  const [main, plain, www] = await Promise.all([
    fetchSite(`https://${domain}/`, domain),
    fetchSite(`http://${domain}/`, domain, 6000),
    within(pub().resolve4('www.' + domain), 4000, [] as string[]).then((r) => r.v.length ? (r.v.some(isPrivateIp) ? { ok: false, error: 'www points to a private address' } : fetchSite(`https://www.${domain}/`, domain, 6000)) : { ok: false, error: 'www does not resolve' }),
  ]);
  const httpsRedirect = plain.firstStatus === undefined ? null : !!(plain.firstStatus >= 300 && plain.firstStatus < 400 && plain.firstLocation && /^https:/i.test(new URL(plain.firstLocation, `http://${domain}/`).protocol));
  const { firstStatus: _f, firstLocation: _l, ...web } = main;
  return { ...web, httpsRedirect, www: { ok: www.ok, status: www.status, error: www.error } };
}

/* ---------------- health ---------------- */
const healthCache = new Lru<HealthFacts>(500);
export const HEALTH_TTL = 5 * 60_000;

export interface ProbeEnv { serverId: string; serverIp?: string; ourNs: string[]; usage?: HealthFacts['usage'] }

export function cachedHealth(env: ProbeEnv, domain: string): HealthFacts | undefined { return healthCache.get(`${env.serverId}|${domain}`); }

export async function gatherHealth(env: ProbeEnv, domain: string, fresh = false): Promise<HealthFacts> {
  const key = `${env.serverId}|${domain}`;
  if (!fresh) { const c = healthCache.get(key); if (c) return { ...c, usage: env.usage ?? c.usage }; }
  const basics = await lookupBasics(domain);
  const ours = basics.ns.length > 0 && basics.ns.every((n) => env.ourNs.includes(n));
  const r = ours ? await authResolver(basics.ns) : pub();
  const [web, ssl, mx, root, dkim, dmarc] = await Promise.all([
    websiteFacts(domain, basics.a),
    basics.a.length || basics.aaaa.length ? probeSsl(domain, 6000) : Promise.resolve(undefined),
    within(r.resolveMx(domain), 5000, [] as { exchange: string; priority: number }[]),
    txt(r, domain), txt(r, `x._domainkey.${domain}`), txt(r, `_dmarc.${domain}`),
  ]);
  const mxs = await Promise.all(mx.v.sort((x, y) => x.priority - y.priority).slice(0, 3).map(async (m) => ({ exchange: host(m.exchange), priority: m.priority, ips: (await within(pub().resolve4(m.exchange), 3000, [] as string[])).v })));
  const facts: HealthFacts = {
    domain, serverIp: env.serverIp, ourNs: env.ourNs,
    dns: { a: basics.a, aaaa: basics.aaaa, ns: basics.ns, error: basics.err },
    web, ssl: ssl ? { https: ssl.https, issuer: ssl.issuer, daysLeft: ssl.daysLeft, names: ssl.names, error: ssl.error } : undefined,
    mail: { mx: mxs, spf: root.v.filter((t) => /^v=spf1(\s|$)/i.test(t.trim())), dkim: dkim.v.filter((t) => /(^|;)\s*p=\S/i.test(t)), dmarc: dmarc.v.filter((t) => /^v=DMARC1/i.test(t.trim())) },
    usage: env.usage, checkedAt: new Date().toISOString(),
  };
  healthCache.set(key, facts, HEALTH_TTL);
  return facts;
}

/* ---------------- connect wizard ---------------- */
const rdapCache = new Lru<string>(500);
async function registrar(domain: string): Promise<string> {
  const c = rdapCache.get(domain); if (c !== undefined) return c;
  let name = '';
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(4000), headers: { accept: 'application/rdap+json, application/json', 'user-agent': UA } });
    if (res.ok) name = rdapRegistrar(await res.json());
  } catch { /* optional */ }
  rdapCache.set(domain, name, 3600_000);
  return name;
}

const connectCache = new Lru<any>(500);
export async function connectStatus(env: ProbeEnv, domain: string) {
  const key = `${env.serverId}|${domain}`;
  const hit = connectCache.get(key); if (hit) return hit;
  const r = pub();
  const [b, www, wwwC, ssl, reg] = await Promise.all([
    lookupBasics(domain), within(r.resolve4('www.' + domain), 4000, [] as string[]), within(r.resolveCname('www.' + domain), 4000, [] as string[]),
    probeSsl(domain, 5000), registrar(domain),
  ]);
  const facts: ConnectFacts = { domain, serverIp: env.serverIp, ourNs: env.ourNs, ns: b.ns, a: b.a, www: www.v, wwwCname: wwwC.v, https: { ok: ssl.https && (ssl.daysLeft ?? 0) > 0, error: ssl.error } };
  const st = connectSteps(facts);
  const dnsHost = detectProvider(b.ns);
  const regProv = reg ? providerByName(reg) : null;
  const out = { domain, serverIp: env.serverIp || null, nameservers: env.ourNs.slice(0, 2), current: { ns: b.ns, a: b.a, www: www.v }, provider: dnsHost, registrar: reg || null,
    registrarProvider: regProv && regProv.id !== dnsHost.id ? regProv : null, ...st, checkedAt: new Date().toISOString() };
  connectCache.set(key, out, 15_000);
  return out;
}

const scanCache = new Lru<{ domain: string; connected: boolean; ns: string[]; a: string[] }>(1000);
/** Cheap NS + A check of every domain, for the Overview banner. */
export async function scanDomains(env: ProbeEnv, domains: string[]) {
  return pool(domains.slice(0, 30), 6, async (d) => {
    const key = `${env.serverId}|${d}`;
    const c = scanCache.get(key); if (c) return c;
    const b = await lookupBasics(d);
    const ours = b.ns.length > 0 && b.ns.every((n) => env.ourNs.includes(n));
    const v = { domain: d, connected: ours || (!!env.serverIp && b.a.includes(env.serverIp)) || (!env.serverIp), ns: b.ns, a: b.a };
    scanCache.set(key, v, HEALTH_TTL);
    return v;
  });
}

/** Server IP for an account: the account IP from the panel, else the panel host's own address. */
const ipCache = new Lru<string>(500);
export async function serverIpFor(key: string, panelUrl: string, fromPanel?: () => Promise<string | undefined>): Promise<string | undefined> {
  const c = ipCache.get(key); if (c) return c;
  let ip: string | undefined;
  if (fromPanel) ip = await fromPanel().catch(() => undefined);
  if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const h = new URL(panelUrl).hostname;
    ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ? h : (await within(pub().resolve4(h), 4000, [] as string[])).v[0];
  }
  if (ip) ipCache.set(key, ip, 10 * 60_000);
  return ip;
}
export function forgetHealth(serverId: string, domain: string) { healthCache.del(`${serverId}|${domain}`); connectCache.del(`${serverId}|${domain}`); scanCache.del(`${serverId}|${domain}`); }
