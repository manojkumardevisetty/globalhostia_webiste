// Domain health probes: DNS (node:dns over UDP with timeouts, DNS-over-HTTPS fallback when UDP is blocked or times
// out, e.g. on some serverless networks), the TLS certificate served with SNI (expiry, names, chain, trust), and a
// bounded HTTPS / HTTP request. Only Node built-ins: tests point it at a local DNS stub, DoH stub and TLS server.
// Never follows a domain to a private / loopback address (no requests into our own network).
import { Resolver } from 'node:dns/promises';
import tls from 'node:tls';
import https from 'node:https';
import http from 'node:http';
import type { DomainFacts } from './core';

export interface ProbeOptions {
  timeouts: { dns: number; tls: number; http: number };
  /** UDP resolvers ("ip" or "ip:port"); default public resolvers */
  dnsServers?: string[];
  /** DoH JSON endpoints (application/dns-json); default Cloudflare, then Google */
  doh?: string[];
  /** skip UDP entirely (tests, or when an earlier probe found UDP blocked) */
  forceDoh?: boolean;
  /** a name that must resolve (A): proves the DNS path works before NXDOMAIN answers are trusted */
  canary?: string;
  /** gather MX / SPF / DMARC / DKIM */
  mail?: boolean;
  /** DKIM selectors to look up (DirectAdmin signs with "x") */
  dkimSelectors?: string[];
  /** which parts to run */
  web?: boolean; tlsCheck?: boolean;
  /** tests: connect here instead of the resolved address, and allow loopback */
  connect?: (domain: string) => { host: string; tlsPort: number; httpPort: number };
  allowPrivate?: boolean;
  ca?: string | Buffer;
  /** overall cap per domain */
  budgetMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const PUBLIC = ['1.1.1.1', '8.8.8.8', '9.9.9.9'];
const DOH = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'];
const UA = 'GlobalHostia-DomainHealth/1.0 (+https://globalhostia.com)';
const TYPE = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 } as const;
type RType = keyof typeof TYPE;
type Ans = { ok: boolean; nx?: boolean; values: string[]; mx?: { exchange: string; priority: number }[]; error?: string; via: 'udp' | 'doh' };
const host = (s: string) => String(s || '').toLowerCase().replace(/\.+$/, '');

/* UDP is marked broken for this instance after a network-class failure, so later lookups go straight to DoH.
   Before any answer is trusted, a canary name that must exist is resolved (some networks answer NXDOMAIN for
   everything when outbound DNS is blocked): UDP failing it → DoH; DoH failing it too → DNS "down", every lookup
   reports ok:false and the domain is "unknown" (never an alert caused by our own network). Re-tested every 5 minutes. */
let udpBrokenUntil = 0;
let mode: { v: 'udp' | 'doh' | 'down'; until: number; p?: Promise<'udp' | 'doh' | 'down'> } = { v: 'udp', until: 0 };
export const udpState = () => ({ brokenUntil: udpBrokenUntil, mode: mode.v });
export const resetUdpState = () => { udpBrokenUntil = 0; mode = { v: 'udp', until: 0 }; };
const CANARY = 'cloudflare.com';
async function dnsMode(o: ProbeOptions): Promise<'udp' | 'doh' | 'down'> {
  const now = (o.now || Date.now)();
  if (now < mode.until) return mode.v;
  if (mode.p) return mode.p;
  mode.p = (async () => {
    const name = o.canary || CANARY;
    let v: 'udp' | 'doh' | 'down' = 'down';
    if (!o.forceDoh && udpBrokenUntil < now) { try { if ((await udp(name, 'A', o)).values.length) v = 'udp'; } catch { /* network */ } }
    if (v === 'down') { try { if ((await doh(name, 'A', o)).values.length) v = 'doh'; } catch { /* network */ } }
    if (v === 'doh') udpBrokenUntil = now + 10 * 60_000;
    mode = { v, until: (o.now || Date.now)() + (v === 'down' ? 60_000 : 5 * 60_000) };
    return v;
  })().finally(() => { mode.p = undefined; });
  return mode.p;
}
const NET = /ETIMEOUT|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ECANCELLED|timeout/i;
// no records, or the domain's own DNS is broken (SERVFAIL / REFUSED from a public resolver): an answer, not our failure
const NODATA = /ENODATA|ENOTFOUND|ENOTIMP|NXDOMAIN|ESERVFAIL|EREFUSED/;

function timeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(Object.assign(new Error(label), { code: 'ETIMEOUT' })), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });
}

async function udp(name: string, type: RType, o: ProbeOptions): Promise<Ans> {
  const r = new Resolver({ timeout: Math.max(500, Math.floor(o.timeouts.dns / 2)), tries: 2 });
  r.setServers(o.dnsServers?.length ? o.dnsServers : PUBLIC);
  try {
    const run = (): Promise<Ans> => {
      switch (type) {
        case 'A': return r.resolve4(name).then((v) => ({ ok: true, values: v, via: 'udp' as const }));
        case 'AAAA': return r.resolve6(name).then((v) => ({ ok: true, values: v, via: 'udp' as const }));
        case 'NS': return r.resolveNs(name).then((v) => ({ ok: true, values: v.map(host), via: 'udp' as const }));
        case 'MX': return r.resolveMx(name).then((v) => ({ ok: true, values: v.map((x) => host(x.exchange)), mx: v.map((x) => ({ exchange: host(x.exchange), priority: x.priority })), via: 'udp' as const }));
        case 'TXT': return r.resolveTxt(name).then((v) => ({ ok: true, values: v.map((c) => c.join('')), via: 'udp' as const }));
        default: return r.resolveCname(name).then((v) => ({ ok: true, values: v.map(host), via: 'udp' as const }));
      }
    };
    return await timeout(run(), o.timeouts.dns + 500);
  } catch (e: any) {
    const code = String(e?.code || e?.message || '');
    if (code === 'ENOTFOUND') return { ok: true, nx: true, values: [], via: 'udp' };
    if (NODATA.test(code)) return { ok: true, values: [], via: 'udp' };
    throw Object.assign(new Error(code || 'dns error'), { code, net: NET.test(code) });
  } finally { try { r.cancel(); } catch { /* */ } }
}

/** Parse a DoH JSON TXT data field: one or more quoted chunks ("v=spf1 ..." "more") → joined text. */
export function txtData(s: string): string {
  const parts = [...String(s).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
  return parts.length ? parts.join('') : String(s);
}
async function doh(name: string, type: RType, o: ProbeOptions): Promise<Ans> {
  const f = o.fetchImpl || fetch;
  let last = 'doh failed';
  for (const base of o.doh?.length ? o.doh : DOH) {
    try {
      const res = await f(`${base}?${new URLSearchParams({ name, type })}`, { headers: { accept: 'application/dns-json', 'user-agent': UA }, signal: AbortSignal.timeout(o.timeouts.dns + 1500), cache: 'no-store' } as RequestInit);
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      const j: any = await res.json();
      if (j.Status === 3) return { ok: true, nx: true, values: [], via: 'doh' };
      if (j.Status !== 0) return { ok: true, values: [], via: 'doh' };
      const rows = (Array.isArray(j.Answer) ? j.Answer : []).filter((a: any) => Number(a.type) === TYPE[type]);
      if (type === 'MX') {
        const mx = rows.map((a: any) => { const [p, h] = String(a.data).trim().split(/\s+/); return { priority: Number(p), exchange: host(h) }; });
        return { ok: true, values: mx.map((x: any) => x.exchange), mx, via: 'doh' };
      }
      return { ok: true, values: rows.map((a: any) => (type === 'TXT' ? txtData(a.data) : type === 'NS' || type === 'CNAME' ? host(a.data) : String(a.data))), via: 'doh' };
    } catch (e: any) { last = e?.name === 'TimeoutError' ? 'timeout' : String(e?.message || e); }
  }
  throw Object.assign(new Error(last), { code: 'EDOH' });
}

/** One lookup: UDP first (unless known broken), DoH when UDP fails at the network level. */
export async function lookup(name: string, type: RType, o: ProbeOptions): Promise<Ans> {
  const now = (o.now || Date.now)();
  const m = await dnsMode(o);
  if (m === 'down') return { ok: false, values: [], error: 'dns unavailable', via: 'doh' };
  if (m === 'udp' && !o.forceDoh && udpBrokenUntil < now) {
    try { return await udp(name, type, o); }
    catch (e: any) {
      if (!e?.net) return { ok: false, values: [], error: String(e?.code || e?.message), via: 'udp' }; // SERVFAIL etc.: an answer about the domain
      udpBrokenUntil = now + 10 * 60_000;
    }
  }
  try { return await doh(name, type, o); }
  catch (e: any) { return { ok: false, values: [], error: String(e?.message || 'dns failed'), via: 'doh' }; }
}

/* ---------------------------------------------------------------- TLS */
export type TlsFacts = NonNullable<DomainFacts['tls']>;
const netCode = (e: any) => {
  const c = String(e?.code || '');
  if (/ECONNREFUSED/.test(c)) return 'refused';
  if (/ECONNRESET|EPIPE/.test(c)) return 'reset';
  if (/ETIMEDOUT|ETIMEOUT/.test(c) || e?.message === 'timeout') return 'timeout';
  if (/EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN/.test(c)) return 'unreachable';
  if (/EPROTO|ERR_SSL|WRONG_VERSION|HANDSHAKE/i.test(c + ' ' + String(e?.message || ''))) return 'handshake';
  return 'unreachable';
};
export function probeTls(domain: string, addr: string, port: number, o: Pick<ProbeOptions, 'timeouts' | 'ca' | 'now'>): Promise<TlsFacts> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: TlsFacts) => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch { /* */ } resolve(v); };
    const timer = setTimeout(() => finish({ connected: false, error: 'timeout' }), o.timeouts.tls);
    const sock = tls.connect({ host: addr, port, servername: domain, rejectUnauthorized: false, ca: o.ca, ALPNProtocols: ['http/1.1'] }, () => {
      const c = sock.getPeerCertificate(true);
      if (!c || !c.valid_to) return finish({ connected: true, authorized: false, authError: 'NO_CERTIFICATE', names: [] });
      const names = String(c.subjectaltname || '').split(',').map((x) => x.trim()).filter((x) => /^DNS:/i.test(x)).map((x) => x.slice(4).toLowerCase());
      const validTo = new Date(c.valid_to);
      const now = (o.now || Date.now)();
      const nameOk = tls.checkServerIdentity(domain, c) === undefined;
      const auth = sock.authorizationError ? String((sock.authorizationError as any).code || sock.authorizationError) : '';
      finish({
        connected: true, authorized: sock.authorized, authError: auth || undefined, validTo: validTo.toISOString(), daysLeft: Math.floor((validTo.getTime() - now) / 86400_000),
        names: names.slice(0, 20), issuer: String((c.issuer as any)?.O || (c.issuer as any)?.CN || ''), nameOk,
      });
    });
    sock.on('error', (e) => finish({ connected: false, error: netCode(e) }));
  });
}

/* ---------------------------------------------------------------- HTTP(S) */
function request(mod: typeof https | typeof http, o: { addr: string; port: number; domain: string; ms: number; ca?: string | Buffer }): Promise<{ status?: number; error?: string; ms: number }> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { status?: number; error?: string }) => { if (done) return; done = true; clearTimeout(timer); try { req.destroy(); } catch { /* */ } resolve({ ...v, ms: Date.now() - t0 }); };
    const timer = setTimeout(() => finish({ error: 'timeout' }), o.ms);
    const opts: https.RequestOptions = { host: o.addr, port: o.port, path: '/', method: 'GET', agent: false, headers: { host: o.domain, 'user-agent': UA, accept: 'text/html,*/*;q=0.8' } };
    if (mod === https) Object.assign(opts, { servername: o.domain, rejectUnauthorized: false, ca: o.ca });
    const req = mod.request(opts, (res) => { finish({ status: res.statusCode }); res.resume(); });
    req.on('error', (e) => finish({ error: netCode(e) }));
    req.end();
  });
}

/* ---------------------------------------------------------------- one domain */
export async function probeDomain(domain: string, o: ProbeOptions): Promise<DomainFacts> {
  const d = host(domain);
  const checkedAt = new Date((o.now || Date.now)()).toISOString();
  const work = async (): Promise<DomainFacts> => {
    const [ns, a, aaaa] = await Promise.all([lookup(d, 'NS', o), lookup(d, 'A', o), lookup(d, 'AAAA', o)]);
    const ok = ns.ok || a.ok;
    const via = [ns, a, aaaa].some((x) => x.via === 'doh') ? 'doh' : 'udp';
    const facts: DomainFacts = { domain: d, checkedAt, dns: { ok, via: ok ? via : 'none', error: ok ? undefined : a.error || ns.error, nx: !!(ns.nx && a.nx), ns: ns.values.sort(), a: a.values, aaaa: aaaa.values } };
    if (!ok || facts.dns.nx) return facts;
    const tasks: Promise<void>[] = [];
    const target = o.connect ? o.connect(d) : { host: a.values[0] || aaaa.values[0], tlsPort: 443, httpPort: 80 };
    if ((o.web !== false || o.tlsCheck !== false) && target.host) {
      if (!o.allowPrivate && isPrivate(target.host)) facts.skipped = 'private-address';
      else tasks.push((async () => {
        const t = o.tlsCheck === false ? null : await probeTls(d, target.host, target.tlsPort, o);
        facts.tls = t;
        if (o.web === false) return;
        const web: NonNullable<DomainFacts['web']> = {};
        if (!t || t.connected) web.https = await request(https, { addr: target.host, port: target.tlsPort, domain: d, ms: o.timeouts.http, ca: o.ca });
        if (!t?.connected || !web.https?.status) web.http = await request(http, { addr: target.host, port: target.httpPort, domain: d, ms: Math.min(o.timeouts.http, 6000) });
        facts.web = web;
      })());
    }
    if (o.mail) tasks.push((async () => {
      const sels = (o.dkimSelectors || []).slice(0, 3);
      const [mx, txt, dmarc, ...dk] = await Promise.all([lookup(d, 'MX', o), lookup(d, 'TXT', o), lookup(`_dmarc.${d}`, 'TXT', o), ...sels.map((s) => lookup(`${s}._domainkey.${d}`, 'TXT', o))]);
      const list = (mx.mx || []).sort((x, y) => x.priority - y.priority).slice(0, 3);
      const hosts = await Promise.all(list.map(async (m) => ({ host: m.exchange, pri: m.priority, ips: m.exchange ? (await lookup(m.exchange, 'A', o)).values : [] })));
      facts.mail = {
        mx: hosts, spf: txt.values.filter((x) => /^v=spf1(\s|$)/i.test(x.trim())), dmarc: dmarc.values.filter((x) => /^v=DMARC1/i.test(x.trim())),
        dkim: dk.flatMap((x) => x.values).filter((x) => /(^|;)\s*p=[A-Za-z0-9+/]/.test(x)),
      };
    })());
    await Promise.all(tasks);
    return facts;
  };
  const budget = o.budgetMs ?? o.timeouts.dns * 4 + o.timeouts.tls + o.timeouts.http * 2 + 2000;
  try { return await timeout(work(), budget, 'probe budget'); }
  catch { return { domain: d, checkedAt, dns: { ok: false, via: 'none', error: 'probe budget exceeded', ns: [], a: [], aaaa: [] } }; }
}

function isPrivate(ip: string): boolean {
  if (!/^[\d.]+$/.test(ip) && !ip.includes(':')) return false; // a host name (tests only)
  if (ip.includes(':')) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:'); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
