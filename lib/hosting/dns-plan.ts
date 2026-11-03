// Pure logic behind the account portal DNS editor (/account/domains/<id>#dns): where a domain's zone lives, how its
// nameservers are delegated, and the quick templates. No runtime imports (only types), so tests/dns-plan.test.mts can
// load it directly; the I/O (billing API, panel calls, database) is injected by lib/portal/dns.ts.
import type { DnsRecord, ServerConfig } from './types';
import type { DnsInput, DnsType } from './validate';

/** Our public nameservers (live on "Sonic USA"). Admin can add more per server (ServerConfig.nameservers). */
export const OUR_NS = ['ns1.globalhostia.com', 'ns2.globalhostia.com'];

const host = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');

/** Every nameserver host name that counts as "ours": the defaults plus those listed for enabled servers. */
export function ourNameservers(servers: Pick<ServerConfig, 'enabled' | 'nameservers'>[]): string[] {
  const out = new Set(OUR_NS);
  for (const s of servers) if (s.enabled) for (const n of s.nameservers || []) if (host(n)) out.add(host(n));
  return [...out];
}

export type Delegation = 'ours' | 'mixed' | 'external' | 'unknown';

/** How the domain is delegated today: all ours, some ours, none ours, or unknown (registry lookup failed / empty). */
export function delegation(current: string[] | null | undefined, ours: string[]): Delegation {
  const list = (current || []).map(host).filter(Boolean);
  if (!list.length) return 'unknown';
  const set = new Set(ours.map(host));
  const n = list.filter((x) => set.has(x)).length;
  return n === list.length ? 'ours' : n ? 'mixed' : 'external';
}

export interface Candidate { serviceId: number; server: ServerConfig; username: string; primary: string }
type Match = (svc: any, servers: ServerConfig[]) => ServerConfig | null;
type User = (u: unknown) => string;

/**
 * The client's Active hosting services on a configured panel server, as login-as candidates. Services whose primary
 * domain is the domain asked about come first (one panel call usually settles it). Capped to keep page loads bounded.
 */
export function hostingCandidates(products: any[], servers: ServerConfig[], match: Match, user: User, domain: string, max = 12): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const p of products || []) {
    if (String(p?.status) !== 'Active') continue;
    const server = match(p, servers);
    if (!server) continue;
    let username: string;
    try { username = user(p.username); } catch { continue; }
    const k = `${server.id}|${username}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ serviceId: Number(p.id), server, username, primary: host(p.domain) });
  }
  const d = host(domain);
  return out.sort((a, b) => Number(b.primary === d) - Number(a.primary === d)).slice(0, max);
}

export interface DnsOnly { serverId: string; daUser: string; allowCreate: boolean }
export interface ZoneRow { clientId: number; serverId: string; daUser: string }

export type ZonePlan =
  | { kind: 'inactive' }
  /** zone is on the customer's own hosting account */
  | { kind: 'hosting'; server: ServerConfig; username: string; serviceId: number; deleg: Delegation }
  /** zone is on our DNS-only account, recorded for this client in dns_zones */
  | { kind: 'dnsonly'; server: ServerConfig; username: string; deleg: Delegation }
  /** no zone yet; nameservers are ours (or unknown). canCreate: the DNS-only account is configured and creation is on */
  | { kind: 'off'; canCreate: boolean; deleg: Delegation }
  /** no zone; nameservers point elsewhere. canSwitch: we can create the zone first, so switching never breaks resolution */
  | { kind: 'external'; ns: string[]; canSwitch: boolean }
  /** dns_zones says another client owns this zone (e.g. the domain moved accounts) */
  | { kind: 'taken' }
  | { kind: 'error'; message: string };

export interface PlanDeps {
  products(): Promise<any[]>;
  domainsOf(c: { server: ServerConfig; username: string }): Promise<string[]>;
  zoneRow(domain: string): Promise<ZoneRow | null>;
}

export interface PlanInput {
  domain: string; status: unknown; ns: string[] | null; cid: number;
  servers: ServerConfig[]; dnsOnly: DnsOnly | null; match: Match; user: User;
}

/**
 * Decide where the zone for a client's domain is managed:
 *   1. the client's own hosting account that has the domain (CMD_API_SHOW_DOMAINS as that user)
 *   2. our DNS-only account, when dns_zones records it for this client
 *   3. otherwise by delegation: ours/unknown -> "turn on" (create on the DNS-only account); elsewhere -> external card.
 * A panel that cannot be reached is an error, never a reason to offer creating a duplicate zone.
 */
export async function planZone(i: PlanInput, deps: PlanDeps): Promise<ZonePlan> {
  if (!/^active$/i.test(String(i.status || ''))) return { kind: 'inactive' };
  const domain = host(i.domain);
  const live = i.servers.filter((s) => s.enabled && s.secret);
  const ours = ourNameservers(i.servers);
  const deleg = delegation(i.ns, ours);

  let products: any[];
  try { products = await deps.products(); } catch { return { kind: 'error', message: 'We could not load your hosting services right now.' }; }
  let unreachable = false;
  for (const c of hostingCandidates(products, live, i.match, i.user, domain)) {
    try {
      const list = (await deps.domainsOf(c)).map(host);
      if (list.includes(domain)) return { kind: 'hosting', server: c.server, username: c.username, serviceId: c.serviceId, deleg };
    } catch { unreachable = true; }
  }

  let row: ZoneRow | null;
  try { row = await deps.zoneRow(domain); } catch { return { kind: 'error', message: 'We could not check your DNS settings right now.' }; }
  if (row) {
    if (row.clientId !== i.cid) return { kind: 'taken' };
    const server = live.find((s) => s.id === row!.serverId);
    if (!server) return { kind: 'error', message: 'The DNS server for this domain is not available right now.' };
    return { kind: 'dnsonly', server, username: row.daUser, deleg };
  }
  if (unreachable) return { kind: 'error', message: 'We could not reach your hosting server to find this domain.' };

  const d = i.dnsOnly;
  const canCreate = !!(d && d.allowCreate && d.daUser && live.some((s) => s.id === d.serverId && s.panel === 'directadmin'));
  if (deleg === 'external') return { kind: 'external', ns: (i.ns || []).map(host).filter(Boolean), canSwitch: canCreate };
  return { kind: 'off', canCreate, deleg };
}

/* ------------------------------------------------------------------ quick templates */

export type TemplateKey = 'google' | 'microsoft' | 'ip' | 'verify';
export const TEMPLATES: { key: TemplateKey; label: string; desc: string; ic: string; input?: 'ip' | 'txt' }[] = [
  { key: 'google', label: 'Google Workspace', desc: 'Gmail MX record and SPF for your domain.', ic: 'mail' },
  { key: 'microsoft', label: 'Microsoft 365', desc: 'Outlook MX, SPF and Autodiscover.', ic: 'mail' },
  { key: 'ip', label: 'Point to an IP', desc: 'Your domain and www to a server address.', ic: 'server', input: 'ip' },
  { key: 'verify', label: 'Verification TXT', desc: 'Prove ownership to Google, Microsoft, Meta and others.', ic: 'shield', input: 'txt' },
];

/** A record before validation (lib/hosting/validate.ts dnsRecord checks every one before it reaches the panel). */
export type RawInput = { type: DnsType; name: string; value: string; ttl: number; priority?: number };

const valueKey = (type: string, v: string) => (['MX', 'CNAME', 'SRV', 'NS'].includes(type) ? host(v) : String(v).trim());
/** Same record (type, name, value, MX priority), ignoring case and trailing dots on host names. */
export const sameRecord = (a: Pick<DnsInput, 'type' | 'name' | 'value' | 'priority'>, b: Pick<DnsInput, 'type' | 'name' | 'value' | 'priority'>) =>
  a.type === b.type && host(a.name) === host(b.name) && valueKey(a.type, a.value) === valueKey(b.type, b.value) && (a.type !== 'MX' || Number(a.priority) === Number(b.priority));

const isSpf = (r: DnsRecord) => r.type === 'TXT' && /^v=spf1\b/i.test(r.value);

/**
 * What a template changes: records to add and existing records it replaces. Never touches read-only (NS) records.
 * Records that would be removed and re-added identically are left alone.
 */
export function templatePlan(key: TemplateKey, zone: string, input: { ip?: string; txt?: string; name?: string }, existing: DnsRecord[]): { add: RawInput[]; remove: DnsRecord[] } {
  const z = host(zone);
  const at = (r: DnsRecord, name: string) => host(r.name) === name;
  let add: RawInput[] = [];
  let remove: DnsRecord[] = [];
  if (key === 'google') {
    add = [{ type: 'MX', name: '@', value: 'smtp.google.com', priority: 1, ttl: 3600 }, { type: 'TXT', name: '@', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 }];
    remove = existing.filter((r) => at(r, '@') && (r.type === 'MX' || isSpf(r)));
  } else if (key === 'microsoft') {
    add = [
      { type: 'MX', name: '@', value: `${z.replace(/\./g, '-')}.mail.protection.outlook.com`, priority: 0, ttl: 3600 },
      { type: 'TXT', name: '@', value: 'v=spf1 include:spf.protection.outlook.com -all', ttl: 3600 },
      { type: 'CNAME', name: 'autodiscover', value: 'autodiscover.outlook.com', ttl: 3600 },
    ];
    remove = existing.filter((r) => (at(r, '@') && (r.type === 'MX' || isSpf(r))) || at(r, 'autodiscover'));
  } else if (key === 'ip') {
    const ip = String(input.ip || '').trim();
    if (!ip) throw new Error('Enter the IP address of your server.');
    const type: DnsType = ip.includes(':') ? 'AAAA' : 'A';
    add = [{ type, name: '@', value: ip, ttl: 3600 }, { type, name: 'www', value: ip, ttl: 3600 }];
    remove = existing.filter((r) => (at(r, '@') && (r.type === 'A' || r.type === 'AAAA')) || (at(r, 'www') && ['A', 'AAAA', 'CNAME'].includes(r.type)));
  } else if (key === 'verify') {
    const txt = String(input.txt || '').trim().replace(/^"(.*)"$/s, '$1');
    if (!txt) throw new Error('Paste the verification value you were given.');
    add = [{ type: 'TXT', name: String(input.name || '').trim() || '@', value: txt, ttl: 3600 }];
  } else throw new Error('Unknown template');
  remove = remove.filter((r) => !r.readonly && !add.some((a) => sameRecord(a, r)));
  add = add.filter((a) => !existing.some((r) => sameRecord(a, r)));
  return { add, remove };
}

/* ------------------------------------------------------------------ external DNS host name */
const KNOWN: [RegExp, string][] = [
  [/\.ns\.cloudflare\.com$/, 'Cloudflare'], [/\.domaincontrol\.com$/, 'GoDaddy'], [/\.registrar-servers\.com$/, 'Namecheap'],
  [/\.awsdns-[\w-]+\./, 'Amazon Route 53'], [/\.googledomains\.com$|\.google\.com$/, 'Google'], [/\.azure-dns\./, 'Azure DNS'],
  [/\.digitalocean\.com$/, 'DigitalOcean'], [/\.dns-parking\.com$|\.hostinger\./, 'Hostinger'], [/\.wixdns\.net$/, 'Wix'],
  [/\.squarespacedns\.com$/, 'Squarespace'], [/\.shopify\.com$/, 'Shopify'], [/\.vercel-dns\.com$/, 'Vercel'], [/\.netlify\.com$/, 'Netlify'],
  [/\.ionos\.|\.ui-dns\./, 'IONOS'], [/\.bluehost\.com$/, 'Bluehost'], [/\.hostgator\.com$/, 'HostGator'], [/\.siteground\.net$/, 'SiteGround'],
];
/** A readable name for whoever runs the domain's DNS: a known provider, else the nameserver's parent domain. */
export function dnsHostName(ns: string[]): string {
  const first = (ns || []).map(host).filter(Boolean)[0];
  if (!first) return 'another provider';
  const k = KNOWN.find(([r]) => r.test(first));
  if (k) return k[1];
  const parts = first.split('.');
  return parts.length > 2 ? parts.slice(1).join('.') : first;
}
