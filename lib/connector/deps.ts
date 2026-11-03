// Production wiring for the connector tools: WHMCS through lib/portal/api.ts (every call scoped to the client id from the
// access token), DNS through the portal zone resolver (lib/portal/dns.ts), mailboxes / SSL / usage through the hosting
// provider adapters acting as the account's own panel user, catalog tools through lib/agents. Errors are turned into
// customer-safe ToolFail messages; panel wording is scrubbed (lib/ux/errors.ts).
import 'server-only';
import { randomBytes } from 'node:crypto';
import { db, schema } from '../db';
import * as api from '../portal/api';
import { DnsError, resolveZone, zoneProvider } from '../portal/dns';
import { validateNameservers } from '../portal/views/domains';
import { buildRenewals } from '../portal/renewal-plan';
import { loadServers, serverFor } from '../hosting/servers';
import { providerFor } from '../hosting/providers';
import { InputError, domainName, dnsRecord, mailUser, panelUser, quotaMb } from '../hosting/validate';
import { PanelError, type HostingProvider, type ServerConfig } from '../hosting/types';
import { publicPanelError } from '../ux/errors';
import { limiter } from '../agents/http';
import { callTool } from '../agents/mcp';
import { checkDomain } from '../agents/domain';
import { agentData, pickCurrency } from '../agents/catalog';
import { cartLinkFor } from '../agents/shop';
import { getSettings } from '../settings';
import { whmcsBase } from '../theme/data';
import { portalDeps } from '../ai/tools/customer';
import { ToolFail, type ConnectorDeps } from './tools';

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');
const limits = { read: limiter(120, 60_000), write: limiter(30, 60_000), domain: limiter(10, 60_000) };

/** Panel / DNS / validation errors → messages the customer may read. */
export function friendly(e: unknown): ToolFail | null {
  if (e instanceof ToolFail) return e;
  if (e instanceof InputError || e instanceof DnsError) return new ToolFail(e.message);
  if (e instanceof PanelError) {
    const p = publicPanelError(e.status, e.message);
    if (e.status >= 500) console.error('[connector] panel', e.status, e.message);
    return new ToolFail(p.message, p.status >= 500 ? 'unavailable' : 'invalid');
  }
  return null;
}

/** The hosting account (panel provider) that holds a domain for this client, or a clear reason why there is none. */
async function hostingFor(cid: number, domain: string): Promise<{ p: HostingProvider; serviceId: number }> {
  const [svcs, servers] = await Promise.all([api.getClientsProducts(cid), loadServers().catch(() => [] as ServerConfig[])]);
  const active = svcs.filter((s) => /^active$/i.test(String(s.status)) && s.username);
  const ordered = [...active.filter((s) => lc(s.domain) === domain), ...active.filter((s) => lc(s.domain) !== domain)];
  for (const s of ordered.slice(0, 10)) {
    const server = serverFor(s, servers);
    if (!server) continue;
    let user: string;
    try { user = panelUser(s.username); } catch { continue; }
    const p = providerFor({ server, username: user, domain: lc(s.domain) });
    const doms = lc(s.domain) === domain ? [domain] : (await p.domains().catch(() => [] as string[])).map(lc);
    if (doms.includes(domain)) return { p, serviceId: Number(s.id) };
  }
  throw new ToolFail(`${domain} is not on a GlobalHostia hosting plan that can be managed here, so mailboxes and SSL for it are managed where it is hosted.`, 'unavailable');
}

async function zoneFor(cid: number, domain: string) {
  const row = (await api.getClientsDomains(cid)).find((d) => lc(d.domainname) === domain) || null;
  if (row && !/^active$/i.test(String(row.status))) return { row, plan: null as any, note: `DNS for ${domain} can be managed once the domain is active (it is ${row.status}).` };
  let ns: string[] | null = null;
  if (row) { try { ns = await api.domainGetNameservers(Number(row.id)); } catch { ns = null; } }
  const { plan } = await resolveZone(cid, row || { domainname: domain, status: 'Active' }, ns);
  if (plan.kind === 'hosting' || plan.kind === 'dnsonly') return { row, plan, note: undefined };
  const note = plan.kind === 'external' ? `DNS for ${domain} is hosted elsewhere (nameservers ${(ns || []).join(', ') || 'unknown'}), so records are changed there.`
    : plan.kind === 'off' ? `DNS management for ${domain} is not turned on yet. Turn it on in the account (Domains → ${domain} → DNS) or open a ticket.`
    : 'message' in plan ? String((plan as any).message) : `DNS for ${domain} is not managed at GlobalHostia.`;
  return { row, plan: null as any, note };
}
async function zoneProviderFor(cid: number, domain: string) {
  const z = await zoneFor(cid, domain);
  if (!z.plan) throw new ToolFail(z.note || `DNS for ${domain} is not managed at GlobalHostia.`, 'unavailable');
  const p = zoneProvider(z.plan, domain);
  if (!p.dns) throw new ToolFail('DNS editing is not available on this server.', 'unavailable');
  return p.dns;
}

const randomPassword = () => `${randomBytes(18).toString('base64url')}Aa7`;

export async function connectorDeps(o: { base: string; ip: string; currency?: string }): Promise<ConnectorDeps> {
  const settings = await getSettings().catch(() => ({} as any));
  const clientArea = whmcsBase(settings);
  const portal = portalDeps();
  const fake = (cid: number) => ({ clientId: cid } as any);
  const fromAgent = async (tool: string, a: Record<string, unknown>) => {
    const r: any = await callTool(tool, a, o.ip, () => 0);
    if (r.isError) throw new ToolFail(String(r.content?.[0]?.text || 'That request could not be completed.').split('\n')[0]);
    return r.structuredContent as Record<string, unknown>;
  };
  return {
    v: {
      domainName, dnsRecord: (v, zone) => dnsRecord(v, zone), mailUser, quotaMb,
      nameservers: (list) => { const r = validateNameservers(list.slice(0, 5)); return r.ok ? { ok: true, ns: r.ns } : { ok: false, error: Object.values(r.errs)[0] || 'Give 2 to 5 nameserver host names such as ns1.example.com' }; },
    },
    limit: (key, kind) => limits[kind](key),
    async audit(e) {
      await db.insert(schema.auditLogs).values({
        userEmail: (e.access.email || `client#${e.access.cid}`).slice(0, 254), action: `connector.${e.tool}${e.ok ? '' : '.failed'}`, entity: 'connector', entityId: e.access.grantId,
        detail: { clientId: e.access.cid, app: e.access.clientId, platform: e.access.platform, ip: e.ip, ...e.detail } as any,
      }).catch(() => {});
    },
    searchPlans: (a) => fromAgent('search_products', Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined))),
    recommendPlan: (a) => fromAgent('recommend_plan', a),
    policies: (topic) => fromAgent('get_policies', topic ? { topic } : {}),
    async cartLink(a) {
      const base = await agentData();
      const cur = pickCurrency(a.currency, base.currencies, base.defaultCurrency);
      if (!cur) return { ok: false, message: `Unsupported currency. Use one of: ${base.currencies.join(', ')}` };
      const d = cur === base.currency ? base : await agentData(cur);
      const p = d.products.find((x) => x.slug === a.slug);
      const cycle = a.cycle || p?.prices.find((x) => x.cycle === 'monthly')?.cycle || p?.prices[0]?.cycle || 'monthly';
      return cartLinkFor(d, a.slug, cycle, a.domain) as any;
    },
    checkDomain: (d, cur) => checkDomain(d, cur) as any,
    client: (cid) => api.getClientsDetails(cid),
    services: (cid) => api.getClientsProducts(cid),
    service: (cid, id) => api.getService(cid, id),
    async serviceUsage(_cid, svc) {
      if (!/^active$/i.test(String(svc.status)) || !svc.username) return null;
      const server = serverFor(svc, await loadServers().catch(() => []));
      if (!server) return null;
      const p = providerFor({ server, username: panelUser(svc.username), domain: lc(svc.domain) });
      if (!p.usage || !(p.caps.overview || []).includes('usage')) return null;
      const u = await p.usage();
      return { items: u.items.map((i) => ({ label: i.label, used: i.used, limit: i.limit, unit: i.unit || undefined })), plan: u.plan, suspended: u.suspended };
    },
    domains: (cid) => api.getClientsDomains(cid),
    nameservers: (id) => api.domainGetNameservers(id),
    async dnsStatus(cid, row, ns) {
      const { plan } = await resolveZone(cid, row, ns);
      if (plan.kind === 'hosting') return { managed: true, where: 'GlobalHostia hosting' };
      if (plan.kind === 'dnsonly') return { managed: true, where: 'GlobalHostia DNS' };
      if (plan.kind === 'external') return { managed: false, where: 'elsewhere', note: `Nameservers point to another provider (${(ns || []).join(', ')}).` };
      if (plan.kind === 'off') return { managed: false, where: 'not turned on', note: 'DNS management can be turned on in the account.' };
      return { managed: false, where: 'unknown' };
    },
    setAutoRenew: (cid, id, on) => api.setDomainAutoRenew(cid, id, on),
    setNameservers: (id, ns) => api.domainUpdateNameservers(id, ns),
    invoices: async (cid, status) => (await api.getInvoices(cid, status)).list,
    invoice: (cid, id) => api.getInvoice(cid, id),
    tickets: (cid, status) => api.getTickets(cid, status),
    ticket: (cid, id) => api.getTicket(cid, id),
    departments: () => api.getSupportDepartments(),
    openTicket: (cid, t) => api.openTicket(cid, t),
    replyTicket: (cid, id, m) => api.addTicketReply(cid, id, m),
    async dnsList(cid, domain) {
      const z = await zoneFor(cid, domain);
      if (!z.plan) return { records: [], editable: false, note: z.note };
      const p = zoneProvider(z.plan, domain);
      if (!p.dns) return { records: [], editable: false, note: 'DNS editing is not available on this server.' };
      return { records: (await p.dns.list(domain)) as any, editable: true };
    },
    async dnsAdd(cid, domain, rec) { await (await zoneProviderFor(cid, domain)).add(domain, rec as any); },
    async dnsEdit(cid, domain, old, rec) { await (await zoneProviderFor(cid, domain)).edit(domain, old as any, rec as any); },
    async dnsDelete(cid, domain, old) { await (await zoneProviderFor(cid, domain)).remove(domain, old as any); },
    async mailboxes(cid, domain) {
      const h = await hostingFor(cid, domain).catch(() => null);
      if (!h || !h.p.email || !(h.p.caps.email || []).includes('list')) return null;
      return (await h.p.email.list(domain)).map((b) => ({ email: b.email, quotaMb: b.quotaMb, usedMb: b.usedMb }));
    },
    async createMailbox(cid, domain, user, quota) {
      const h = await hostingFor(cid, domain);
      if (!h.p.email || !(h.p.caps.email || []).includes('create')) throw new ToolFail('Mailboxes cannot be created on this hosting plan from here.', 'unavailable');
      await h.p.email.create(domain, user, randomPassword(), quota);
      return { manageUrl: `${clientArea}/clientarea.php?action=productdetails&id=${h.serviceId}` };
    },
    async deleteMailbox(cid, domain, user) {
      const h = await hostingFor(cid, domain);
      if (!h.p.email || !(h.p.caps.email || []).includes('delete')) throw new ToolFail('Mailboxes cannot be deleted on this hosting plan from here.', 'unavailable');
      await h.p.email.remove(domain, user);
    },
    async issueSsl(cid, domain, www) {
      const h = await hostingFor(cid, domain);
      if (!h.p.ssl || !(h.p.caps.ssl || []).includes('issue')) throw new ToolFail('Free SSL cannot be issued on this hosting plan from here. Open a ticket and we will do it.', 'unavailable');
      return h.p.ssl.issue(domain, www);
    },
    health: (cid, domain) => portal.health(fake(cid), domain),
    mailSettings: (cid, domain) => portal.mail(fake(cid), domain),
    async renewals(cid) {
      const [products, domains, unpaid] = await Promise.all([api.getClientsProducts(cid), api.getClientsDomains(cid), api.getInvoices(cid, 'Unpaid').then((r) => r.list).catch(() => [])]);
      const inv = unpaid.length ? await api.unpaidRenewalInvoices(cid, unpaid).catch(() => undefined) : undefined;
      const tld = buildRenewals([], domains).some((r) => r.amount === null) ? await api.tldRenewPrices(cid).catch(() => undefined) : undefined;
      return buildRenewals(products, domains, { inv, tld });
    },
    urls: { site: o.base, clientArea },
  };
}
