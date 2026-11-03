// Billing-system calls used by the customer portal. Everything is scoped to the signed-in client:
// list calls pass clientid/userid filters and every object fetched by id is re-checked for ownership.
// `whmcs()` retries only read actions (Get*, DomainGetNameservers); the write/auth actions used here
// (ValidateLogin, ResetPassword, CreateSsoToken, OpenTicket, AddTicketReply, UpdateClient,
// DomainUpdateNameservers) are sent exactly once.
import 'server-only';
import { whmcs, WhmcsError } from '../whmcs';
import { checkTicketsSoon } from '../support-notify';

const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const same = (a: unknown, b: number) => Number(a) === b;

/* ---------------- auth ---------------- */
export async function validateLogin(email: string, password: string) {
  try {
    const r = await whmcs<{ userid?: number | string; twoFactorEnabled?: boolean | string }>('ValidateLogin', { email, password2: password });
    const tfa = r.twoFactorEnabled === true || r.twoFactorEnabled === 'true' || r.twoFactorEnabled === '1';
    return { ok: true as const, userId: Number(r.userid) || undefined, twoFactor: tfa };
  } catch (e) {
    if (e instanceof WhmcsError && e.kind === 'api') return { ok: false as const };
    throw e; // network/config → caller shows "temporarily unavailable"
  }
}

/** Resolve the client account for a login email: exact email match on clients, then the user→client link (v8 users). */
export async function resolveClient(email: string): Promise<{ id: number; name: string } | null> {
  const want = email.trim().toLowerCase();
  const r = await whmcs('GetClients', { search: email, limitnum: 25 });
  const hit = arr(r.clients?.client).find((c) => String(c.email || '').toLowerCase() === want);
  if (hit) return { id: Number(hit.id), name: `${hit.firstname || ''} ${hit.lastname || ''}`.trim() || hit.companyname || '' };
  try {
    const u = await whmcs('GetUsers', { search: email, limitnum: 10 });
    const user = arr(u.users).find((x) => String(x.email || '').toLowerCase() === want);
    const clients = arr(user?.clients);
    const c = clients.find((x) => x.isOwner || x.isowner) || clients[0];
    if (c) return { id: Number(c.id), name: `${user.firstname || ''} ${user.lastname || ''}`.trim() };
  } catch { /* GetUsers unavailable on older versions */ }
  return null;
}

export async function resetPassword(email: string) {
  try { await whmcs('ResetPassword', { email }); } catch { /* neutral response either way */ }
}

/* ---------------- client ---------------- */
export async function getClientsDetails(clientId: number) {
  const r = await whmcs('GetClientsDetails', { clientid: clientId, stats: true });
  const c = r.client ?? r;
  if (!same(c.id ?? c.userid ?? clientId, clientId)) throw new WhmcsError('Client mismatch', 'GetClientsDetails');
  return { ...c, stats: r.stats ?? c.stats ?? {} };
}

export const PROFILE_FIELDS = ['firstname', 'lastname', 'companyname', 'phonenumber', 'address1', 'city', 'state', 'postcode', 'country'] as const;
export async function updateClient(clientId: number, f: Partial<Record<(typeof PROFILE_FIELDS)[number], string>>) {
  const params: Record<string, string | number> = { clientid: clientId };
  for (const k of PROFILE_FIELDS) if (f[k] !== undefined) params[k] = f[k]!;
  await whmcs('UpdateClient', params);
}

/* ---------------- services ---------------- */
const scrubService = (p: any) => { const { password: _pw, ...rest } = p || {}; return rest; };

export async function getClientsProducts(clientId: number) {
  const r = await whmcs('GetClientsProducts', { clientid: clientId, limitnum: 250 });
  return arr(r.products?.product).filter((p) => p.clientid === undefined || same(p.clientid, clientId)).map(scrubService);
}
export async function getService(clientId: number, id: number) {
  const r = await whmcs('GetClientsProducts', { clientid: clientId, serviceid: id });
  const p = arr(r.products?.product).find((x) => same(x.id, id));
  if (!p || (p.clientid !== undefined && !same(p.clientid, clientId))) return null;
  return scrubService(p);
}

/* ---------------- domains ---------------- */
export async function getClientsDomains(clientId: number) {
  const r = await whmcs('GetClientsDomains', { clientid: clientId, limitnum: 250 });
  return arr(r.domains?.domain).filter((d) => d.userid === undefined || same(d.userid, clientId));
}
export async function getDomain(clientId: number, id: number) {
  const r = await whmcs('GetClientsDomains', { clientid: clientId, domainid: id });
  const d = arr(r.domains?.domain).find((x) => same(x.id, id));
  if (!d || (d.userid !== undefined && !same(d.userid, clientId))) return null;
  return d;
}
export async function domainGetNameservers(domainId: number) {
  const r = await whmcs('DomainGetNameservers', { domainid: domainId });
  return [r.ns1, r.ns2, r.ns3, r.ns4, r.ns5].map((x) => String(x || '').trim()).filter(Boolean);
}
export async function domainUpdateNameservers(domainId: number, ns: string[]) {
  const p: Record<string, string | number> = { domainid: domainId };
  ns.slice(0, 5).forEach((n, i) => (p[`ns${i + 1}`] = n));
  await whmcs('DomainUpdateNameservers', p);
}

/* ---------------- invoices ---------------- */
export async function getInvoices(clientId: number, status?: string) {
  const r = await whmcs('GetInvoices', { userid: clientId, status, limitnum: 100, orderby: 'duedate', order: 'desc' });
  return { total: Number(r.totalresults || 0), list: arr(r.invoices?.invoice).filter((i) => i.userid === undefined || same(i.userid, clientId)) };
}
export async function getInvoice(clientId: number, id: number) {
  try {
    const r = await whmcs('GetInvoice', { invoiceid: id });
    if (!same(r.userid, clientId) || !same(r.invoiceid ?? id, id)) return null;
    return { ...r, items: arr(r.items?.item), transactions: arr(r.transactions?.transaction) };
  } catch (e) { if (e instanceof WhmcsError && e.kind === 'api') return null; throw e; }
}

/**
 * Which services/domains already have an unpaid renewal invoice. GetInvoices has no line items, so the
 * newest unpaid invoices (max 10) are read with GetInvoice. Read-only and best-effort: failures give empty maps.
 */
export type RenewalInvoices = { services: Map<number, number>; domains: Map<number, number> };
export async function unpaidRenewalInvoices(clientId: number, unpaid: any[]): Promise<RenewalInvoices> {
  const out: RenewalInvoices = { services: new Map(), domains: new Map() };
  const ids = unpaid.map((i) => Number(i.id ?? i.invoiceid)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 10);
  const invs = await Promise.all(ids.map((id) => getInvoice(clientId, id).catch(() => null)));
  for (const inv of invs) {
    if (!inv || !/unpaid/i.test(String(inv.status || ''))) continue;
    for (const it of inv.items) {
      const rel = Number(it.relid);
      if (!rel) continue;
      if (/^hosting$/i.test(String(it.type || ''))) { if (!out.services.has(rel)) out.services.set(rel, Number(inv.invoiceid)); }
      else if (/^domain$/i.test(String(it.type || ''))) { if (!out.domains.has(rel)) out.domains.set(rel, Number(inv.invoiceid)); }
    }
  }
  return out;
}

/* ---------------- support ---------------- */
export async function getTickets(clientId: number, status?: string) {
  const r = await whmcs('GetTickets', { clientid: clientId, status, limitnum: 100 });
  return arr(r.tickets?.ticket).filter((t) => t.userid === undefined || same(t.userid, clientId));
}
export async function getTicket(clientId: number, id: number) {
  try {
    const r = await whmcs('GetTicket', { ticketid: id, repliessort: 'ASC' });
    if (!same(r.userid, clientId) || !same(r.ticketid ?? r.id, id)) return null;
    return { ...r, replies: arr(r.replies?.reply) };
  } catch (e) { if (e instanceof WhmcsError && e.kind === 'api') return null; throw e; }
}
export async function getSupportDepartments() {
  const r = await whmcs('GetSupportDepartments');
  return arr(r.departments?.department).map((d) => ({ id: Number(d.id), name: String(d.name || '') }));
}
export async function openTicket(clientId: number, t: { deptid: number; subject: string; message: string; priority: string; serviceid?: number }) {
  const r = await whmcs('OpenTicket', { clientid: clientId, deptid: t.deptid, subject: t.subject, message: t.message, priority: t.priority, serviceid: t.serviceid, markdown: false });
  checkTicketsSoon('portal-open'); // email the owner after the response is sent
  return { id: Number(r.id), tid: String(r.tid || '') };
}
export async function addTicketReply(clientId: number, ticketId: number, message: string) {
  await whmcs('AddTicketReply', { ticketid: ticketId, clientid: clientId, message, markdown: false });
  checkTicketsSoon('portal-reply');
}

/* ---------------- secure hand-off (single sign-on into the client area) ---------------- */
export async function createSso(clientId: number, o: { destination: string; service_id?: number; domain_id?: number; path?: string }) {
  const r = await whmcs<{ redirect_url?: string }>('CreateSsoToken', {
    client_id: clientId, destination: o.destination, service_id: o.service_id, domain_id: o.domain_id, sso_redirect_path: o.path,
  });
  const u = String(r.redirect_url || '');
  if (!/^https?:\/\//i.test(u)) throw new WhmcsError('No redirect URL returned', 'CreateSsoToken');
  return u;
}
