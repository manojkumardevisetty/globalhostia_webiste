// Domain portfolio I/O: nameservers, registrar lock, a lightweight DNS location and a TLS probe per domain, plus the
// bulk actions. Live lookups are cached in memory per server instance (nameservers / lock 10 minutes, TLS 1 hour) and
// fetched lazily by the page (/account/api/domains), so the portfolio renders from the billing records alone.
import 'server-only';
import tls from 'node:tls';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs } from '../whmcs';
import * as api from './api';
import { loadServers } from '../hosting/servers';
import { serverFor } from '../hosting/match';
import { OUR_NS, delegation, dnsHostName, ourNameservers } from '../hosting/dns-plan';
import type { ServerConfig } from '../hosting/types';
import { isHostname, type NsKind } from './portfolio';

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');

/* ------------------------------------------------------------------ tiny TTL cache */
function ttlCache<T>(ttlMs: number, max = 5000) {
  const m = new Map<string, { v: T; until: number }>();
  return {
    get(k: string) { const h = m.get(k); if (h && h.until > Date.now()) return h.v; if (h) m.delete(k); return undefined; },
    set(k: string, v: T) { if (m.size > max) m.clear(); m.set(k, { v, until: Date.now() + ttlMs }); },
    del(k: string) { m.delete(k); },
  };
}
const nsCache = ttlCache<string[] | null>(10 * 60_000);
const lockCache = ttlCache<LockState>(10 * 60_000);
const sslCache = ttlCache<SslInfo>(60 * 60_000);

/** Run `fn` over `items` with at most `n` in flight. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

/* ------------------------------------------------------------------ nameservers */
export async function nameservers(domainId: number): Promise<string[] | null> {
  const k = String(domainId);
  const hit = nsCache.get(k);
  if (hit !== undefined) return hit;
  let ns: string[] | null;
  try { ns = (await api.domainGetNameservers(domainId)).map(lc); } catch { ns = null; }
  nsCache.set(k, ns);
  return ns;
}
export const forgetNameservers = (domainId: number) => nsCache.del(String(domainId));
export const cachedNameservers = (domainId: number) => nsCache.get(String(domainId)) ?? null;

/* ------------------------------------------------------------------ registrar lock */
export type LockState = 'locked' | 'unlocked' | 'unknown';
/** DomainGetLockingStatus → lockstatus ("Locked" / "Unlocked"; registrars without lock support return an error or another word). */
export async function lockStatus(domainId: number): Promise<LockState> {
  const k = String(domainId);
  const hit = lockCache.get(k);
  if (hit) return hit;
  let st: LockState = 'unknown';
  try {
    const r = await whmcs<{ lockstatus?: string }>('DomainGetLockingStatus', { domainid: domainId });
    const v = String(r.lockstatus ?? '').trim().toLowerCase();
    st = v === 'locked' || v === '1' || v === 'true' ? 'locked' : v === 'unlocked' || v === '0' || v === 'false' ? 'unlocked' : 'unknown';
  } catch { st = 'unknown'; }
  lockCache.set(k, st);
  return st;
}
/** DomainUpdateLockingStatus (sent once; not retried). */
export async function setLock(domainId: number, on: boolean) {
  await whmcs('DomainUpdateLockingStatus', { domainid: domainId, lockstatus: on ? 1 : 0 });
  lockCache.set(String(domainId), on ? 'locked' : 'unlocked');
}

/* ------------------------------------------------------------------ DNS location (lightweight) */
export type DnsKind = 'hosting' | 'managed' | 'ours' | 'external' | 'mixed' | 'unknown';
export interface DnsCtx { servers: ServerConfig[]; ours: string[]; products: any[]; zones: Map<string, { serverId: string }> }

const noTable = (e: any) => String(e?.code || e?.cause?.code || '') === '42P01' || /does not exist/.test(String(e?.message || e?.cause?.message || ''));

/** Everything the lightweight DNS check needs, loaded once per request (no panel calls). */
export async function dnsContext(cid: number): Promise<DnsCtx> {
  const [servers, products, zones] = await Promise.all([
    loadServers().catch(() => [] as ServerConfig[]),
    api.getClientsProducts(cid).catch(() => [] as any[]),
    db.select({ domain: schema.dnsZones.domain, serverId: schema.dnsZones.serverId }).from(schema.dnsZones).where(eq(schema.dnsZones.clientId, cid))
      .catch((e) => { if (noTable(e)) return [] as { domain: string; serverId: string }[]; return [] as { domain: string; serverId: string }[]; }),
  ]);
  return { servers, ours: ourNameservers(servers), products, zones: new Map(zones.map((z) => [lc(z.domain), { serverId: z.serverId }])) };
}

/** The active hosting service whose primary domain is this domain, on a configured panel server. */
function hostingFor(ctx: DnsCtx, domain: string) {
  for (const p of ctx.products) {
    if (String(p?.status) !== 'Active' || lc(p.domain) !== domain) continue;
    const server = serverFor(p, ctx.servers.filter((s) => s.enabled));
    if (server) return { service: p, server };
  }
  return null;
}

/**
 * Where a domain's DNS is answered, without calling any panel: its own hosting service (primary domain), our DNS-only
 * account (dns_zones), our nameservers (zone location not checked here), or another provider. The domain page runs the
 * full resolution (lib/portal/dns.ts) before anything is changed.
 */
export function dnsKind(ctx: DnsCtx, domain: string, ns: string[] | null): { kind: DnsKind; deleg: NsKind; host?: string } {
  const d = lc(domain);
  const deleg = delegation(ns, ctx.ours) as NsKind;
  if (deleg === 'external') return { kind: 'external', deleg, host: dnsHostName(ns || []) };
  if (deleg === 'mixed') return { kind: 'mixed', deleg };
  if (hostingFor(ctx, d)) return { kind: 'hosting', deleg };
  if (ctx.zones.has(d)) return { kind: 'managed', deleg };
  return { kind: deleg === 'ours' ? 'ours' : 'unknown', deleg };
}

/** Target nameservers for "Use GlobalHostia nameservers": only when the zone already exists here (never breaks resolution). */
export function nsTarget(ctx: DnsCtx, domain: string): string[] | null {
  const d = lc(domain);
  const h = hostingFor(ctx, d);
  if (h) return h.server.nameservers?.length ? h.server.nameservers.slice(0, 5) : OUR_NS;
  const z = ctx.zones.get(d);
  if (z) { const s = ctx.servers.find((x) => x.id === z.serverId); return s?.nameservers?.length ? s.nameservers.slice(0, 5) : OUR_NS; }
  return null;
}

/* ------------------------------------------------------------------ TLS probe */
export interface SslInfo { state: 'valid' | 'expiring' | 'expired' | 'invalid' | 'none' | 'unknown'; days?: number; expires?: string; issuer?: string }

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(10|127|192\.168)\./i];
const isPrivate = (ip: string) => PRIVATE.some((r) => r.test(ip));

/**
 * TLS handshake with the domain on port 443 (SNI = the domain), 4 s budget, certificate read only (no HTTP request).
 * Domains that resolve to private or loopback addresses are not probed. Cached for an hour.
 */
export async function sslProbe(host: string, timeoutMs = 4000): Promise<SslInfo> {
  const h = lc(host);
  if (!isHostname(h)) return { state: 'unknown' };
  const hit = sslCache.get(h);
  if (hit) return hit;
  let info: SslInfo;
  try {
    const addrs = await Promise.race([lookup(h, { all: true }), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dns timeout')), timeoutMs))]);
    const ip = addrs.find((a) => isIP(a.address))?.address;
    if (!ip) info = { state: 'none' };
    else if (addrs.some((a) => isPrivate(a.address))) info = { state: 'unknown' };
    else info = await handshake(h, ip, timeoutMs);
  } catch (e: any) {
    info = /ENOTFOUND|ENODATA|NXDOMAIN/.test(String(e?.code || e?.message)) ? { state: 'none' } : { state: 'unknown' };
  }
  sslCache.set(h, info);
  return info;
}

function handshake(host: string, ip: string, timeoutMs: number): Promise<SslInfo> {
  return new Promise((resolve) => {
    let done = false;
    const sock = tls.connect({ host: ip, port: 443, servername: host, rejectUnauthorized: false, ALPNProtocols: ['http/1.1'] });
    const fin = (v: SslInfo) => { if (done) return; done = true; clearTimeout(timer); sock.destroy(); resolve(v); };
    const timer = setTimeout(() => fin({ state: 'unknown' }), timeoutMs);
    sock.once('secureConnect', () => {
      const c = sock.getPeerCertificate();
      if (!c || !c.valid_to) return fin({ state: 'none' });
      const exp = Date.parse(c.valid_to);
      const days = Math.floor((exp - Date.now()) / 86400000);
      const issuer = String((c.issuer as any)?.O || (c.issuer as any)?.CN || '').slice(0, 80) || undefined;
      const expires = Number.isFinite(exp) ? new Date(exp).toISOString().slice(0, 10) : undefined;
      // authorized = chain trusted and the name matches (servername); a self-signed / wrong-name certificate is "invalid"
      const state: SslInfo['state'] = days < 0 ? 'expired' : !sock.authorized ? 'invalid' : days <= 14 ? 'expiring' : 'valid';
      fin({ state, days, expires, issuer });
    });
    sock.once('error', (e: any) => fin(/ECONNREFUSED|EHOSTUNREACH|ECONNRESET/.test(String(e?.code)) ? { state: 'none' } : { state: 'unknown' }));
  });
}
