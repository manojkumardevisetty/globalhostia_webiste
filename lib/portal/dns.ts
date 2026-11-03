// Account portal DNS editor (server side): resolves where a client's domain zone lives (their hosting account, or our
// DNS-only DirectAdmin account recorded in dns_zones), lists records and creates zones. All panel calls go through the
// existing provider adapters (lib/hosting/providers), acting as the one panel user that owns the zone; keys never
// leave the server. The decision logic itself is pure: lib/hosting/dns-plan.ts.
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import * as api from './api';
import { dnsOnlyConfig, loadServers, type DnsOnlyConfig } from '../hosting/servers';
import { serverFor } from '../hosting/match';
import { providerFor } from '../hosting/providers';
import { panelUser } from '../hosting/validate';
import { OUR_NS, ourNameservers, planZone, type ZonePlan, type ZoneRow } from '../hosting/dns-plan';
import { PanelError, type DnsRecord, type HostingProvider, type ServerConfig } from '../hosting/types';
import { limiter } from '../agents/http';

/** Per client: page loads that query the panel, and record changes. */
export const dnsReadLimit = limiter(90, 60_000);
export const dnsWriteLimit = limiter(30, 60_000);

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');

/* account domain lists, cached 60s per server+user (same as the hosting panel) */
const cache = new Map<string, { list: string[]; until: number }>();
async function domainsOf(c: { server: ServerConfig; username: string }): Promise<string[]> {
  const k = `${c.server.id}|${c.username}`;
  const hit = cache.get(k);
  if (hit && hit.until > Date.now()) return hit.list;
  const list = (await providerFor({ server: c.server, username: c.username, domain: '' }).domains()).map(lc);
  if (cache.size > 2000) cache.clear();
  cache.set(k, { list, until: Date.now() + 60_000 });
  return list;
}
const bust = (serverId: string, user: string) => cache.delete(`${serverId}|${user}`);

/** dns_zones is created by db-setup patch '021-dns-zones'; until that ran, "no table" means "no rows". */
const noTable = (e: any) => String(e?.code || e?.cause?.code || '') === '42P01' || /relation "dns_zones" does not exist/.test(String(e?.message || e?.cause?.message || ''));
async function zoneRow(domain: string): Promise<(ZoneRow & { id: string }) | null> {
  const [r] = await db.select().from(schema.dnsZones).where(eq(schema.dnsZones.domain, lc(domain))).catch((e) => { if (noTable(e)) return []; throw e; });
  return r ? { id: r.id, clientId: r.clientId, serverId: r.serverId, daUser: r.daUser } : null;
}

export interface DnsState {
  plan: ZonePlan;
  /** nameservers that count as ours; `target` = the ones "Use GlobalHostia DNS" sets */
  ours: string[]; target: string[];
  records?: DnsRecord[]; listError?: string;
}

/** The nameservers to delegate to for a zone on `server` (its own list from admin, else ns1/ns2.globalhostia.com). */
export const nsFor = (server?: ServerConfig | null) => (server?.nameservers?.length ? server.nameservers.slice(0, 5) : OUR_NS);

export async function resolveZone(cid: number, d: { domainname: unknown; status: unknown }, ns: string[] | null): Promise<{ plan: ZonePlan; servers: ServerConfig[]; dnsOnly: DnsOnlyConfig | null }> {
  const [servers, dnsOnly] = await Promise.all([loadServers().catch(() => [] as ServerConfig[]), dnsOnlyConfig().catch(() => null)]);
  const plan = await planZone(
    { domain: lc(d.domainname), status: d.status, ns, cid, servers, dnsOnly, match: serverFor, user: panelUser },
    { products: () => api.getClientsProducts(cid), domainsOf, zoneRow },
  );
  return { plan, servers, dnsOnly };
}

export const zoneProvider = (plan: Extract<ZonePlan, { kind: 'hosting' | 'dnsonly' }>, domain: string): HostingProvider =>
  providerFor({ server: plan.server, username: plan.username, domain: lc(domain) });

/** Everything the domain page needs for its DNS section. Never throws. */
export async function dnsState(cid: number, d: { domainname: unknown; status: unknown }, ns: string[] | null): Promise<DnsState> {
  const domain = lc(d.domainname);
  if (dnsReadLimit(`c${cid}`)) return { plan: { kind: 'error', message: 'Too many requests. Wait a minute and reload the page.' }, ours: OUR_NS, target: OUR_NS };
  try {
    const { plan, servers, dnsOnly } = await resolveZone(cid, d, ns);
    const ours = ourNameservers(servers);
    const zoneServer = plan.kind === 'hosting' || plan.kind === 'dnsonly' ? plan.server : servers.find((s) => s.id === dnsOnly?.serverId);
    const st: DnsState = { plan, ours, target: nsFor(zoneServer) };
    if (plan.kind === 'hosting' || plan.kind === 'dnsonly') {
      const p = zoneProvider(plan, domain);
      if (!p.dns) st.listError = 'DNS editing is not available on this server.';
      else {
        try { st.records = await p.dns.list(domain); }
        catch (e) { st.listError = e instanceof PanelError ? e.message : 'We could not read the DNS records right now.'; console.error('[portal-dns] list', domain, e instanceof Error ? e.message : e); }
      }
    }
    return st;
  } catch (e) {
    console.error('[portal-dns] resolve', domain, e instanceof Error ? e.message : e);
    return { plan: { kind: 'error', message: 'We could not load your DNS settings right now.' }, ours: OUR_NS, target: OUR_NS };
  }
}

export class DnsError extends Error {}

/**
 * Create (or adopt) the zone on the DNS-only account for a client's domain and record ownership in dns_zones.
 * Adopts a zone that already exists on that account without an owner (created by staff); refuses one owned by
 * another client. Returns the zone location.
 */
export async function enableZone(cid: number, domainId: number, domainName: string): Promise<Extract<ZonePlan, { kind: 'dnsonly' }>> {
  const domain = lc(domainName);
  const cfg = await dnsOnlyConfig();
  if (!cfg || !cfg.allowCreate) throw new DnsError('DNS management cannot be turned on here yet. Our team can do it for you: open a ticket.');
  const server = (await loadServers()).find((s) => s.id === cfg.serverId && s.enabled && s.secret);
  if (!server || server.panel !== 'directadmin') throw new DnsError('The DNS server is not available right now. Please try again later.');
  const user = panelUser(cfg.daUser);
  const existing = await zoneRow(domain);
  if (existing && existing.clientId !== cid) throw new DnsError('This domain’s DNS is linked to another account. Please contact support.');
  if (!existing) {
    const p = providerFor({ server, username: user, domain });
    bust(server.id, user);
    const has = (await domainsOf({ server, username: user })).includes(domain);
    if (!has) {
      try { await p.zones!.create(domain); }
      catch (e) {
        bust(server.id, user);
        // two clicks racing: the first request created it
        if (!(await domainsOf({ server, username: user }).catch(() => [] as string[])).includes(domain)) {
          const msg = e instanceof PanelError ? e.message : '';
          if (/exist|already|taken|owned/i.test(msg)) throw new DnsError('This domain already exists on our DNS server under another account. Please contact support so we can link it to you.');
          throw new DnsError(msg ? `The DNS server refused to create the zone: ${msg}` : 'The DNS server could not create the zone. Please try again.');
        }
      }
      bust(server.id, user);
    }
    await db.insert(schema.dnsZones).values({ domain, whmcsDomainId: domainId, clientId: cid, serverId: server.id, daUser: user }).onConflictDoNothing();
    const row = await zoneRow(domain);
    if (!row || row.clientId !== cid) throw new DnsError('This domain’s DNS is linked to another account. Please contact support.');
    return { kind: 'dnsonly', server, username: row.daUser, deleg: 'unknown' };
  }
  return { kind: 'dnsonly', server, username: existing.daUser, deleg: 'unknown' };
}

/* ---------------- admin ---------------- */
export async function listZones() {
  return db.select().from(schema.dnsZones).orderBy(schema.dnsZones.domain).catch((e) => { if (noTable(e)) return []; throw e; });
}

/** Admin: delete the domain from the DNS-only account (removes its zone) and forget the owner. */
export async function removeZone(domain: string): Promise<void> {
  const row = await zoneRow(domain);
  if (!row) throw new DnsError('Zone not found');
  const server = (await loadServers()).find((s) => s.id === row.serverId);
  if (server && server.secret) {
    const p = providerFor({ server, username: row.daUser, domain: lc(domain) });
    const has = (await domainsOf({ server, username: row.daUser })).includes(lc(domain));
    if (has) await p.zones!.remove(lc(domain));
    bust(server.id, row.daUser);
  }
  await db.delete(schema.dnsZones).where(eq(schema.dnsZones.id, row.id));
}

/** Admin: check the DNS-only user answers through login-as. */
export async function testDnsOnly(): Promise<string> {
  const cfg = await dnsOnlyConfig();
  if (!cfg) throw new DnsError('Not configured');
  const server = (await loadServers()).find((s) => s.id === cfg.serverId);
  if (!server || !server.secret) throw new DnsError('Server not found or its key cannot be decrypted');
  bust(server.id, cfg.daUser);
  const list = await domainsOf({ server, username: panelUser(cfg.daUser) });
  return `${cfg.daUser} on ${server.name} answered: ${list.length} domain${list.length === 1 ? '' : 's'}`;
}
