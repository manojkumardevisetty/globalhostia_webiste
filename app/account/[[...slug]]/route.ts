// Customer portal ("My account"): our own control panel, powered by the billing API on the server.
// GET renders pages, POST handles actions. Every object fetched by id is checked against the session's client.
import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { whmcsBase } from '@/lib/theme/data';
import {
  CLIENT_COOKIE, MAX_FAILS, auditClient, clientIp, cookieOpts, csrfFor, csrfOk, readClient, recentFailures, sameOrigin, signClient, type ClientSession,
} from '@/lib/portal/session';
import * as api from '@/lib/portal/api';
import { frame, guestFrame, type Viewer } from '@/lib/portal/views/frame';
import { loginView, forgotView, type LoginState } from '@/lib/portal/views/guest';
import { dashboardView } from '@/lib/portal/views/dashboard';
import { servicesView, serviceDetailView } from '@/lib/portal/views/services';
import { domainsView, domainDetailView, validateNameservers } from '@/lib/portal/views/domains';
import { invoicesView, invoiceDetailView, INVOICE_FILTERS } from '@/lib/portal/views/invoices';
import { ticketsView, newTicketView, ticketView, type TicketForm } from '@/lib/portal/views/support';
import { profileView, validateProfile } from '@/lib/portal/views/profile';
import { renewalCentreView } from '@/lib/portal/views/renewal-centre';
import { buildRenewals, parseSelection } from '@/lib/portal/renewal-plan';
import { limiter } from '@/lib/agents/http';
import { card, empty, errorBox, esc, btn, ssoButton, pill } from '@/lib/portal/views/kit';
import { DNS_OK, type DnsView, type DnsForm } from '@/lib/portal/views/dns';
import { DnsError, dnsState, dnsWriteLimit, enableZone, resolveZone, zoneProvider, nsFor } from '@/lib/portal/dns';
import { templatePlan, type TemplateKey } from '@/lib/hosting/dns-plan';
import { dnsRecord, InputError } from '@/lib/hosting/validate';
import { PanelError } from '@/lib/hosting/types';
import { loadServers } from '@/lib/hosting/servers';
import { serverFor } from '@/lib/hosting/match';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ slug?: string[] }> };

const SECURITY_HEADERS = {
  'cache-control': 'private, no-store',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
};
const html = (body: string, status = 200) => new NextResponse(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } });
const go = (req: NextRequest, to: string) => {
  const r = NextResponse.redirect(new URL(to, req.url), 303);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
};
/** Non-HttpOnly "signed in" hint for /hp/theme.js: it calls /account/me only when gh_in=1 exists (no request for guests). */
const FLAG = 'gh_in';
const flagOpts = { httpOnly: false, secure: true, sameSite: 'lax' as const, path: '/', maxAge: cookieOpts.maxAge };
const setFlag = (res: NextResponse, on: boolean) => { res.cookies.set(FLAG, on ? '1' : '', on ? flagOpts : { ...flagOpts, maxAge: 0 }); return res; };

const idOf = (s?: string) => (s && /^\d{1,10}$/.test(s) ? Number(s) : null);
const safeNext = (n: unknown) => (typeof n === 'string' && /^\/account(\/[A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&_-]*)?$/.test(n) ? n : '');
/** Auto-renew switches: 20 changes per client per 10 minutes (per server instance). */
const autoRenewLimit = limiter(20, 10 * 60_000);
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,253}\.[a-z]{2,63}$/i;

async function secureBase() {
  try { return whmcsBase(await getSettings()); } catch { return whmcsBase({}); }
}

const viewerOf = (s: ClientSession): Viewer => ({ name: s.name, email: s.email, clientId: s.clientId, csrf: csrfFor(s.jti) });

/* =========================================================== GET */
export async function GET(req: NextRequest, ctx: Ctx) {
  const res = await handleGet(req, ctx);
  // keep the hint in sync for sessions that predate it (or that expired)
  const signedIn = !!(await readClient(req));
  if (signedIn !== (req.cookies.get(FLAG)?.value === '1')) setFlag(res, signedIn);
  return res;
}

async function handleGet(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { slug: segs = [] } = await ctx.params;
  const path = '/account' + (segs.length ? '/' + segs.join('/') : '');
  const q = req.nextUrl.searchParams;
  const sess = await readClient(req);

  if (segs[0] === 'me') {
    return new NextResponse(JSON.stringify(sess ? { in: true, name: sess.name.split(' ')[0] || 'Account' } : { in: false }),
      { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
  }
  if (segs[0] === 'login') {
    if (sess) return go(req, '/account');
    const st: LoginState = { secureUrl: `${await secureBase()}/clientarea.php`, next: safeNext(q.get('next')) || undefined, reset: q.has('reset'), signedOut: q.has('out') };
    return html(await guestFrame({ path, query: q, title: 'Sign in', body: loginView(st) }));
  }
  if (segs[0] === 'forgot') return html(await guestFrame({ path, query: q, title: 'Reset your password', body: forgotView({}) }));
  if (!sess) {
    const next = safeNext(path + (req.nextUrl.search || ''));
    return go(req, `/account/login${next && next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`);
  }
  if (segs[0] === 'logout' || segs[0] === 'sso') return go(req, '/account');

  const v = viewerOf(sess);
  const cid = sess.clientId;
  const F = (o: Omit<Parameters<typeof frame>[0], 'viewer' | 'path' | 'query'>) => frame({ ...o, viewer: v, path, query: q });
  const notFound = async (what: string, back: string, active: Parameters<typeof frame>[0]['active']) =>
    html(await F({ title: 'Not found', active, body: card('Not found', empty(`We couldn't find that ${what}`, `It may have been removed, or it belongs to a different account.`, btn('Go back', back, { variant: 'dark' }), 'search'), { id: 'ac-nf-h' }) }), 404);
  const failed = async (title: string, what: string, active: Parameters<typeof frame>[0]['active']) =>
    html(await F({ title, active, body: errorBox(what, path + (req.nextUrl.search || '')) }), 503);

  const [a, b, c] = segs;
  if (c !== undefined && !(a === 'support' && b === 'new')) return notFound('page', '/account', 'dashboard');

  /* dashboard */
  if (!a) {
    const settle = async <T,>(p: Promise<T>) => { try { return { ok: true as const, v: await p }; } catch { return { ok: false as const }; } };
    const [client, products, domains, unpaid, tickets] = await Promise.all([
      settle(api.getClientsDetails(cid)), settle(api.getClientsProducts(cid)), settle(api.getClientsDomains(cid)),
      settle(api.getInvoices(cid, 'Unpaid').then((r) => r.list)), settle(api.getTickets(cid, 'All Active Tickets')),
    ]);
    const inv = unpaid.ok && unpaid.v.length ? await api.unpaidRenewalInvoices(cid, unpaid.v).catch(() => undefined) : undefined;
    const d = dashboardView({ csrf: v.csrf, client, products, domains, unpaid, tickets, inv, cur: sess.cur });
    return html(await F({ title: 'Dashboard', h1: d.greeting, sub: d.alert ? `<span class="ac-hero-alert" role="status">${esc(d.summary)}</span>` : esc(d.summary), active: 'dashboard', heroExtra: d.statsHtml, body: d.body }));
  }

  /* services */
  if (a === 'services') {
    if (!b) {
      try {
        const products = await api.getClientsProducts(cid);
        return html(await F({ title: 'Products & Services', sub: 'Hosting, servers and certificates on your account.', active: 'services', body: servicesView({ csrf: v.csrf, products, cur: sess.cur, filter: q.get('status') || 'active' }) }));
      } catch { return failed('Products & Services', 'your services', 'services'); }
    }
    const id = idOf(b);
    if (!id) return notFound('service', '/account/services', 'services');
    let p: any;
    try { p = await api.getService(cid, id); } catch { return failed('Service', 'this service', 'services'); }
    if (!p) return notFound('service', '/account/services', 'services');
    // hosting on a managed panel whose domain is registered with us: link to the in-portal DNS editor
    let dnsHref: string | undefined;
    if (/active/i.test(String(p.status)) && p.domain) {
      try {
        if (serverFor(p, await loadServers())) {
          const dom = (await api.getClientsDomains(cid)).find((x: any) => String(x.domainname || '').toLowerCase() === String(p.domain).toLowerCase());
          if (dom) dnsHref = `/account/domains/${Number(dom.id)}#dns`;
        }
      } catch { /* optional link */ }
    }
    return html(await F({
      title: p.translated_name || p.name || 'Service', sub: `${p.domain ? `<span class="ac-mono">${esc(p.domain)}</span> ` : ''}${pill(p.status)}`, active: 'services',
      crumbs: [{ label: 'Products & Services', href: '/account/services' }, { label: p.name || 'Service' }],
      headAction: ssoButton(v.csrf, 'service', p.id, 'Open control panel', { variant: 'outline', ic: 'external' }),
      body: serviceDetailView({ csrf: v.csrf, p, cur: sess.cur, dnsHref }),
    }));
  }

  /* domains */
  if (a === 'domains') {
    if (!b) {
      try {
        const [domains, unpaid] = await Promise.all([api.getClientsDomains(cid), api.getInvoices(cid, 'Unpaid').then((r) => r.list).catch(() => null)]);
        const inv = unpaid?.length ? await api.unpaidRenewalInvoices(cid, unpaid).catch(() => undefined) : undefined;
        const view = domainsView({ csrf: v.csrf, domains, cur: sess.cur, invoices: inv?.domains });
        return html(await F({ title: 'Domains', sub: 'Renewals, auto-renew and nameservers.', active: 'domains', headAction: view.headAction, body: view.body }));
      } catch { return failed('Domains', 'your domains', 'domains'); }
    }
    const id = idOf(b);
    if (!id) return notFound('domain', '/account/domains', 'domains');
    let d: any;
    try { d = await api.getDomain(cid, id); } catch { return failed('Domain', 'this domain', 'domains'); }
    if (!d) return notFound('domain', '/account/domains', 'domains');
    const okKey = q.get('ok') || '';
    return domainPage(F, v.csrf, sess.cur, cid, d, {
      ok: DNS_OK[okKey] ? okKey : undefined, edit: q.get('edit') || undefined, del: q.get('del') || undefined, add: q.has('add'), tpl: q.get('tpl') || undefined,
    });
  }

  /* renewal centre */
  if (a === 'renewals' && !b) {
    const settle = async <T,>(p: Promise<T>) => { try { return { ok: true as const, v: await p }; } catch { return { ok: false as const }; } };
    const [products, domains, unpaid] = await Promise.all([
      settle(api.getClientsProducts(cid)), settle(api.getClientsDomains(cid)), settle(api.getInvoices(cid, 'Unpaid').then((r) => r.list)),
    ]);
    const inv = unpaid.ok && unpaid.v.length ? await api.unpaidRenewalInvoices(cid, unpaid.v).catch(() => undefined) : undefined;
    // a domain without a recurring amount on record is priced from the current TLD renewal price (never estimated)
    const needTld = domains.ok && buildRenewals([], domains.v).some((r) => r.amount === null);
    const tld = needTld ? await api.tldRenewPrices(cid).catch(() => undefined) : undefined;
    const view = renewalCentreView({ csrf: v.csrf, cur: sess.cur, products, domains, unpaid, inv, tld });
    const status = !products.ok && !domains.ok ? 503 : 200;
    return html(await F({ title: 'Renewals', sub: 'Everything on your account that renews, with dates and amounts from your billing records.', active: 'renewals', headAction: view.headAction, heroExtra: view.statsHtml, body: view.body }), status);
  }

  /* billing */
  if (a === 'invoices') {
    if (!b) {
      const status = INVOICE_FILTERS.find(([k]) => k === q.get('status'))?.[0] || '';
      try {
        const [list, unpaid] = await Promise.all([api.getInvoices(cid, status || undefined), status === 'Unpaid' ? null : api.getInvoices(cid, 'Unpaid').catch(() => null)]);
        const u = status === 'Unpaid' ? list : unpaid;
        const total = u ? u.list.reduce((s, i) => s + (parseFloat(i.balance ?? i.total) || 0), 0) : null;
        return html(await F({ title: 'Billing', sub: 'Invoices, payments and receipts.', active: 'billing', body: invoicesView({ csrf: v.csrf, list: list.list, status, cur: u?.list[0]?.currencycode || sess.cur, unpaidTotal: total, unpaidCount: u?.list.length || 0 }) }));
      } catch { return failed('Billing', 'your invoices', 'billing'); }
    }
    const id = idOf(b);
    if (!id) return notFound('invoice', '/account/invoices', 'billing');
    let inv: any, client: any = null;
    try { [inv, client] = await Promise.all([api.getInvoice(cid, id), api.getClientsDetails(cid).catch(() => null)]); } catch { return failed('Invoice', 'this invoice', 'billing'); }
    if (!inv) return notFound('invoice', '/account/invoices', 'billing');
    return html(await F({ title: `Invoice #${inv.invoicenum || inv.invoiceid}`, active: 'billing', crumbs: [{ label: 'Billing', href: '/account/invoices' }, { label: `Invoice #${inv.invoicenum || inv.invoiceid}` }], body: invoiceDetailView({ csrf: v.csrf, inv, client }) }));
  }

  /* support */
  if (a === 'support') {
    if (!b) {
      const filter = q.get('status') === 'all' ? 'all' : 'open';
      try {
        const tickets = await api.getTickets(cid, filter === 'all' ? undefined : 'All Active Tickets');
        return html(await F({ title: 'Support', sub: 'Tickets with our engineers, answered around the clock.', active: 'support', headAction: btn('New ticket', '/account/support/new', { variant: 'outline', ic: 'plus' }), body: ticketsView({ tickets, filter }) }));
      } catch { return failed('Support', 'your tickets', 'support'); }
    }
    if (b === 'new') return renderNewTicket(req, F, v, cid, { priority: 'Medium', service: q.get('service') || '' });
    const id = idOf(b);
    if (!id) return notFound('ticket', '/account/support', 'support');
    let t: any;
    try { t = await api.getTicket(cid, id); } catch { return failed('Ticket', 'this ticket', 'support'); }
    if (!t) return notFound('ticket', '/account/support', 'support');
    return html(await F({ title: t.subject || 'Ticket', sub: `Ticket #${esc(t.tid)}`, active: 'support', crumbs: [{ label: 'Support', href: '/account/support' }, { label: `#${t.tid}` }], body: ticketView({ csrf: v.csrf, t, viewerName: v.name }) }));
  }

  /* profile */
  if (a === 'profile' && !b) {
    try {
      const cl = await api.getClientsDetails(cid);
      return html(await F({ title: 'Profile', sub: 'Your contact details and sign-in settings.', active: 'profile', body: profileView({ csrf: v.csrf, c: cl }) }));
    } catch { return failed('Profile', 'your profile', 'profile'); }
  }

  return notFound('page', '/account', 'dashboard');
}

/** Domain detail with its DNS section (nameservers read live from the registry, zone resolved per request). */
async function domainPage(F: (o: any) => Promise<string>, csrf: string, cur: string, cid: number, d: any, dns: Omit<DnsView, 'csrf' | 'd' | 'st'>, status = 200) {
  let ns: string[] | null = null;
  try { ns = await api.domainGetNameservers(Number(d.id)); } catch { ns = null; }
  const st = await dnsState(cid, d, ns);
  return html(await F({ title: d.domainname, active: 'domains', crumbs: [{ label: 'Domains', href: '/account/domains' }, { label: d.domainname }], body: domainDetailView({ csrf, d, cur, ns, dns: { ...dns, st } }) }), status);
}

async function renderNewTicket(req: NextRequest, F: (o: any) => Promise<string>, v: Viewer, cid: number, form: TicketForm, errs?: Record<string, string>, status = 200) {
  try {
    const [depts, services] = await Promise.all([api.getSupportDepartments(), api.getClientsProducts(cid).catch(() => [])]);
    const svc = services.filter((s: any) => !/terminated|cancelled|fraud/i.test(s.status));
    if (!form.deptid && depts.length === 1) form.deptid = String(depts[0].id);
    return html(await F({ title: 'Open a ticket', active: 'support', crumbs: [{ label: 'Support', href: '/account/support' }, { label: 'New ticket' }], body: newTicketView({ csrf: v.csrf, depts, services: svc, v: form, errs }) }), status);
  } catch {
    return html(await F({ title: 'Open a ticket', active: 'support', body: errorBox('the ticket form', '/account/support/new') }), 503);
  }
}

/* =========================================================== POST */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { slug: segs = [] } = await ctx.params;
  const path = '/account' + (segs.length ? '/' + segs.join('/') : '');
  const q = new URLSearchParams();
  const ip = clientIp(req);
  let fd: FormData;
  try { fd = await req.formData(); } catch { return html('Bad request', 400); }
  const str = (k: string, max = 20000) => { const x = fd.get(k); return typeof x === 'string' ? x.slice(0, max) : ''; };

  /* ---- sign in (no session yet: same-origin check guards against login CSRF) ---- */
  if (segs[0] === 'login' && segs.length === 1) {
    const email = str('email', 254).trim().toLowerCase();
    const password = str('password', 512);
    const next = safeNext(str('next', 300)) || '/account';
    const st: LoginState = { email, secureUrl: `${await secureBase()}/clientarea.php`, next: next !== '/account' ? next : undefined };
    const out = async (error: LoginState['error'], status: number) => html(await guestFrame({ path, query: q, title: 'Sign in', body: loginView({ ...st, error }) }), status);
    if (!sameOrigin(req)) return out('origin', 403);
    if (!EMAIL.test(email) || !password) return out('invalid', 400);
    if (await recentFailures('client_login_failed', ip, email) >= MAX_FAILS) { await auditClient('client_login_blocked', email, ip); return out('locked', 429); }
    let r: Awaited<ReturnType<typeof api.validateLogin>>;
    try { r = await api.validateLogin(email, password); } catch { return out('down', 503); }
    if (!r.ok) { await auditClient('client_login_failed', email, ip); return out('invalid', 401); }
    if (r.twoFactor) { await auditClient('client_login_2fa', email, ip); return out('tfa', 200); }
    let client: { id: number; name: string } | null, cur = 'USD', name = '';
    try {
      client = await api.resolveClient(email);
      if (client) { const d = await api.getClientsDetails(client.id); cur = d.currency_code || 'USD'; name = `${d.firstname || ''} ${d.lastname || ''}`.trim() || client.name; }
    } catch { return out('down', 503); }
    if (!client) { await auditClient('client_login_failed', email, ip, { reason: 'no_client' }); return out('noclient', 401); }
    const { token } = await signClient({ clientId: client.id, userId: r.userId, email, name, cur });
    await auditClient('client_login', email, ip, { clientId: client.id });
    const res = go(req, next);
    res.cookies.set(CLIENT_COOKIE, token, cookieOpts);
    return setFlag(res, true);
  }

  /* ---- forgot password: always the same neutral answer ---- */
  if (segs[0] === 'forgot' && segs.length === 1) {
    const email = str('email', 254).trim().toLowerCase();
    if (!sameOrigin(req)) return html(await guestFrame({ path, query: q, title: 'Reset your password', body: forgotView({ email, error: 'origin' }) }), 403);
    if (!EMAIL.test(email)) return html(await guestFrame({ path, query: q, title: 'Reset your password', body: forgotView({ email, error: 'invalid' }) }), 400);
    if (await recentFailures('client_reset', ip, email) < MAX_FAILS) {
      await auditClient('client_reset', email, ip);
      await api.resetPassword(email);
    }
    return html(await guestFrame({ path, query: q, title: 'Check your email', body: forgotView({ email, sent: true }) }));
  }

  /* ---- everything below needs a session, a same-origin request and a valid CSRF token ---- */
  const sess = await readClient(req);
  if (!sess) return go(req, '/account/login');
  if (!sameOrigin(req) || !csrfOk(sess.jti, fd.get('csrf'))) {
    await auditClient('client_csrf_rejected', sess.email, ip, { path });
    return go(req, `${segs[0] === 'logout' || segs[0] === 'sso' ? '/account' : path}?err=csrf`);
  }
  const cid = sess.clientId;
  const v = viewerOf(sess);
  const F = (o: any) => frame({ ...o, viewer: v, path, query: q });

  if (segs[0] === 'logout') {
    await auditClient('client_logout', sess.email, ip);
    const res = go(req, '/account/login?out=1');
    res.cookies.set(CLIENT_COOKIE, '', { ...cookieOpts, maxAge: 0 });
    return setFlag(res, false);
  }

  /* ---- secure hand-off to the full client area (allow-listed destinations only) ---- */
  if (segs[0] === 'sso') {
    const to = str('to', 40);
    const id = idOf(str('id', 12));
    const back = req.headers.get('referer') ? new URL(req.headers.get('referer')!).pathname : '/account';
    const fail = () => go(req, `${safeNext(back) || '/account'}?err=sso`);
    try {
      let dest: Parameters<typeof api.createSso>[1] | null = null;
      if (['service', 'upgrade', 'cancel'].includes(to)) {
        if (!id || !(await api.getService(cid, id))) return fail();
        dest = to === 'service' ? { destination: 'clientarea:product_details', service_id: id }
          : to === 'upgrade' ? { destination: 'sso:custom_redirect', path: `upgrade.php?type=package&id=${id}` }
          : { destination: 'sso:custom_redirect', path: `clientarea.php?action=cancel&id=${id}` };
      } else if (to === 'invoice' || to === 'invoice_pdf') {
        if (!id || !(await api.getInvoice(cid, id))) return fail();
        dest = { destination: 'sso:custom_redirect', path: to === 'invoice' ? `viewinvoice.php?id=${id}` : `dl.php?type=i&id=${id}` };
      } else if (to === 'domain_renew') {
        // the client area's own renewal cart for this one domain: the customer reviews and pays there (never DomainRenew)
        const d = id ? await api.getDomain(cid, id) : null;
        if (!d) return fail();
        const name = String(d.domainname || '').trim().toLowerCase();
        dest = { destination: 'sso:custom_redirect', path: /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name) ? `index.php?rp=/cart/domain/renew/${name}` : 'cart.php?gid=renewals' };
      } else if (to === 'service_renew') {
        // one service: its unpaid invoice if there is one, else the client area's service renewal page (on-demand renewals)
        if (!id || !(await api.getService(cid, id))) return fail();
        dest = { destination: 'sso:custom_redirect', path: 'index.php?rp=/cart/service/renew' };
      } else if (to === 'service_renewals' || to === 'domain_renew_selected') {
        // selection from the renewal centre: every id must belong to this client
        const sel = parseSelection(fd.getAll('sel'));
        if (to === 'service_renewals') {
          if (sel.services.length) {
            const own = new Set((await api.getClientsProducts(cid)).map((p: any) => Number(p.id)));
            if (sel.services.some((x) => !own.has(x))) return fail();
          }
          dest = { destination: 'sso:custom_redirect', path: 'index.php?rp=/cart/service/renew' };
        } else {
          if (!sel.domains.length) return go(req, '/account/renewals?err=nosel');
          const mine = await api.getClientsDomains(cid);
          const picked = sel.domains.map((x) => mine.find((d: any) => Number(d.id) === x));
          if (picked.some((d) => !d)) return fail();
          // WHMCS has no link that pre-fills several domains: one domain opens its own renewal, several open the renewals cart
          const name = picked.length === 1 ? String(picked[0].domainname || '').trim().toLowerCase() : '';
          dest = { destination: 'sso:custom_redirect', path: name && /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name) ? `index.php?rp=/cart/domain/renew/${name}` : 'cart.php?gid=renewals' };
        }
        await auditClient('client_renew_selection', sess.email, ip, { to, domains: sel.domains, services: sel.services });
      } else if (['domain', 'domain_dns', 'domain_contacts'].includes(to)) {
        if (!id || !(await api.getDomain(cid, id))) return fail();
        dest = { destination: to === 'domain_dns' ? 'clientarea:domain_dns' : to === 'domain_contacts' ? 'clientarea:domain_contacts' : 'clientarea:domain_details', domain_id: id };
      } else {
        const fixed: Record<string, Parameters<typeof api.createSso>[1]> = {
          home: { destination: 'clientarea:homepage' },
          invoices: { destination: 'clientarea:invoices' },
          // pay every unpaid invoice in one checkout, and the domain renewals cart (all renewable domains)
          masspay: { destination: 'sso:custom_redirect', path: 'clientarea.php?action=masspay&all=true' },
          domain_renewals: { destination: 'sso:custom_redirect', path: 'cart.php?gid=renewals' },
          password: { destination: 'sso:custom_redirect', path: 'index.php?rp=/user/password' },
          email: { destination: 'sso:custom_redirect', path: 'index.php?rp=/user/profile' },
          security: { destination: 'sso:custom_redirect', path: 'index.php?rp=/user/security' },
        };
        dest = fixed[to] || null;
      }
      if (!dest) return fail();
      // WHMCS refuses some named destinations (e.g. domain_dns when DNS management is off for that domain): fall back to the page path
      const FALLBACK: Record<string, string> = {
        service: `clientarea.php?action=productdetails&id=${id}`, domain: `clientarea.php?action=domaindetails&id=${id}`,
        domain_dns: `clientarea.php?action=domaindns&domainid=${id}`, domain_contacts: `clientarea.php?action=domaincontacts&domainid=${id}`,
        home: 'clientarea.php', invoices: 'clientarea.php?action=invoices',
      };
      const url = await api.createSso(cid, dest).catch(async (e) => {
        console.error('[sso] ' + to + ' failed: ' + (e instanceof Error ? e.message : String(e)));
        if (!FALLBACK[to]) throw e;
        return api.createSso(cid, { destination: 'sso:custom_redirect', path: FALLBACK[to] });
      });
      await auditClient('client_sso', sess.email, ip, { to, id });
      const r = NextResponse.redirect(url, 303);
      r.headers.set('cache-control', 'private, no-store');
      return setFlag(r, true);
    } catch (e) { console.error('[sso] ' + to + ' gave up: ' + (e instanceof Error ? e.message : String(e))); return fail(); }
  }

  /* ---- DNS records editor ---- */
  if (segs[0] === 'domains' && segs[2] === 'dns' && segs.length === 3) {
    const id = idOf(segs[1]);
    const d = id ? await api.getDomain(cid, id).catch(() => null) : null;
    if (!id || !d) return go(req, '/account/domains');
    const back = `/account/domains/${id}`;
    const op = str('op', 20);
    const zone = String(d.domainname || '').trim().toLowerCase();
    const form: DnsForm = { type: str('type', 10).toUpperCase(), name: str('name', 260), value: str('value', 4096), ttl: str('ttl', 10), priority: str('priority', 10), weight: str('weight', 10), port: str('port', 10) };
    const again = (msg: string, scope: NonNullable<DnsView['err']>['scope'], status: number, rid?: string, f?: DnsForm) =>
      domainPage(F, v.csrf, sess.cur, cid, d, { err: { msg, scope, id: rid, form: f } }, status);
    const audit = (action: string, detail: Record<string, unknown>) => auditClient(`client_dns_${action}`, sess.email, ip, { domainId: id, domain: zone, ...detail });
    if (!/^active$/i.test(String(d.status))) return again('DNS can be managed once the domain is active.', 'zone', 409);
    const wait = dnsWriteLimit(`c${cid}`);
    if (wait) return again(`Too many changes in a short time. Try again in ${wait} seconds.`, op === 'add' ? 'add' : 'zone', 429, undefined, form);

    let ns: string[] | null = null;
    try { ns = await api.domainGetNameservers(id); } catch { ns = null; }
    let plan: Awaited<ReturnType<typeof resolveZone>>['plan'];
    try { plan = (await resolveZone(cid, d, ns)).plan; } catch { return again('We could not reach the DNS server right now. Please try again.', 'zone', 503); }
    const fail = (e: unknown, scope: NonNullable<DnsView['err']>['scope'], rid?: string, f?: DnsForm) => {
      const msg = e instanceof InputError || e instanceof DnsError ? e.message
        : e instanceof PanelError ? (e.status === 400 ? `The DNS server refused the change: ${e.message}` : e.message)
        : 'That change could not be saved. Please try again.';
      if (!(e instanceof InputError)) console.error('[portal-dns]', op, zone, e instanceof Error ? e.message : e);
      return again(msg, scope, e instanceof InputError ? 422 : 502, rid, f);
    };

    /* turn on: create the zone on the DNS-only account */
    if (op === 'enable') {
      if (plan.kind === 'hosting' || plan.kind === 'dnsonly') return go(req, `${back}#dns`);
      if (plan.kind !== 'off' || !plan.canCreate) return again('DNS management cannot be turned on for this domain here. Please contact support.', 'zone', 409);
      try { await enableZone(cid, id, zone); } catch (e) { await audit('enable.failed', { error: e instanceof Error ? e.message : String(e) }); return fail(e, 'zone'); }
      await audit('enable', {});
      return go(req, `${back}?ok=dns_on#dns`);
    }

    /* switch nameservers to ours; never before the zone exists (that would take the domain offline) */
    if (op === 'use_ns') {
      let target: string[];
      try {
        if (plan.kind === 'hosting' || plan.kind === 'dnsonly') target = nsFor(plan.server);
        else if (plan.kind === 'external' && plan.canSwitch) { const z = await enableZone(cid, id, zone); target = nsFor(z.server); await audit('enable', { via: 'use_ns' }); }
        else return again('We cannot switch this domain to GlobalHostia DNS automatically. Please contact support.', 'zone', 409);
      } catch (e) { return fail(e, 'zone'); }
      try { await api.domainUpdateNameservers(id, target); }
      catch { return again('The registry did not accept the nameserver change. Your DNS zone is ready; please try again in a moment.', 'zone', 502); }
      await auditClient('client_ns_update', sess.email, ip, { domainId: id, ns: target, via: 'dns_editor' });
      return go(req, `${back}?ok=dns_ns#dns`);
    }

    if (plan.kind !== 'hosting' && plan.kind !== 'dnsonly') return again('DNS for this domain is not managed here yet.', 'zone', 409);
    const p = zoneProvider(plan, zone);
    if (!p.dns) return again('DNS editing is not available on this server.', 'zone', 409);
    const via = { via: plan.kind, server: plan.server.id, user: plan.username };
    const num = (x?: string) => (x === undefined || x === '' ? undefined : x);
    const input = (f: DnsForm) => ({ type: f.type, name: f.name, value: f.value, ttl: num(f.ttl), priority: num(f.priority), weight: num(f.weight), port: num(f.port) });

    if (op === 'add') {
      let r;
      try { r = dnsRecord(input(form), zone); } catch (e) { return fail(e, 'add', undefined, form); }
      try { await p.dns.add(zone, r); } catch (e) { await audit('add.failed', { record: r, ...via }); return fail(e, 'add', undefined, form); }
      await audit('add', { record: r, ...via });
      return go(req, `${back}?ok=dns_added#dns`);
    }
    if (op === 'edit' || op === 'delete') {
      const rid = str('id', 2000);
      let old;
      try { old = (await p.dns.list(zone)).find((x) => x.id === rid); } catch (e) { return fail(e, 'zone'); }
      if (!old) return again('That record no longer exists. The list below is up to date.', 'zone', 409);
      if (old.readonly) return again('Nameserver records are managed by GlobalHostia and cannot be changed here.', 'zone', 403);
      const oldInfo = { type: old.type, name: old.name, value: old.value };
      if (op === 'delete') {
        if (str('confirm', 5) !== 'yes') return go(req, `${back}?del=${encodeURIComponent(rid)}#dns`);
        try { await p.dns.remove(zone, old); } catch (e) { await audit('delete.failed', { old: oldInfo, ...via }); return fail(e, 'zone'); }
        await audit('delete', { old: oldInfo, ...via });
        return go(req, `${back}?ok=dns_deleted#dns`);
      }
      const f = { ...form, type: old.type };
      let r;
      try { r = dnsRecord(input(f), zone); } catch (e) { return fail(e, 'edit', rid, f); }
      try { await p.dns.edit(zone, old, r); } catch (e) { await audit('edit.failed', { old: oldInfo, record: r, ...via }); return fail(e, 'edit', rid, f); }
      await audit('edit', { old: oldInfo, record: r, ...via });
      return go(req, `${back}?ok=dns_updated#dns`);
    }
    if (op === 'template') {
      const key = str('template', 20) as TemplateKey;
      const tin = { ip: str('ip', 64), txt: str('txt', 2048), name: str('name', 260) };
      const tform = { value: key === 'ip' ? tin.ip : tin.txt, name: tin.name };
      let plan2: ReturnType<typeof templatePlan>, adds;
      try {
        plan2 = templatePlan(key, zone, tin, await p.dns.list(zone));
        adds = plan2.add.map((a) => dnsRecord(a, zone));
      } catch (e) { return fail(e instanceof InputError || e instanceof PanelError ? e : new InputError(e instanceof Error ? e.message : 'Invalid template'), 'tpl', key, tform); }
      // add first, then remove what it replaces: a failed step never leaves the name without records
      try {
        for (const r of adds) await p.dns.add(zone, r);
        for (const r of plan2.remove) await p.dns.remove(zone, r);
      } catch (e) { await audit('template.failed', { template: key, ...via }); return fail(e, 'tpl', key, tform); }
      await audit('template', { template: key, added: adds, removed: plan2.remove.map((r) => ({ type: r.type, name: r.name, value: r.value })), ...via });
      return go(req, `${back}?ok=dns_template#dns`);
    }
    return again('Unknown action.', 'zone', 400);
  }

  /* ---- renewal centre: domain auto-renew switch ---- */
  if (segs[0] === 'renewals' && segs.length === 1) {
    if (str('op', 20) !== 'autorenew') return go(req, '/account/renewals');
    const id = idOf(str('id', 12));
    const on = str('on', 1) === '1';
    const d = id ? await api.getDomain(cid, id).catch(() => null) : null;
    if (!id || !d) return go(req, '/account/renewals?err=failed');
    const anchor = `#rw-d-${id}`;
    if (!/^(active|grace|redemption)$/i.test(String(d.status || ''))) return go(req, `/account/renewals?err=autorenew_state${anchor}`);
    if (autoRenewLimit(`c${cid}`)) {
      await auditClient('client_domain_autorenew_limited', sess.email, ip, { domainId: id });
      return go(req, `/account/renewals?err=rate${anchor}`);
    }
    const detail = { domainId: id, domain: d.domainname, autoRenew: on };
    try {
      const ok = await api.setDomainAutoRenew(cid, id, on);
      if (!ok) throw new Error('not applied');
    } catch (e) {
      await auditClient('client_domain_autorenew_failed', sess.email, ip, { ...detail, error: e instanceof Error ? e.message : String(e) });
      return go(req, `/account/renewals?err=autorenew_failed${anchor}`);
    }
    await auditClient('client_domain_autorenew', sess.email, ip, detail);
    return go(req, `/account/renewals?ok=${on ? 'autorenew_on' : 'autorenew_off'}${anchor}`);
  }

  /* ---- nameservers ---- */
  if (segs[0] === 'domains' && segs.length === 2) {
    const id = idOf(segs[1]);
    const d = id ? await api.getDomain(cid, id).catch(() => null) : null;
    if (!id || !d) return go(req, '/account/domains');
    const raw = [1, 2, 3, 4, 5].map((i) => str(`ns${i}`, 260));
    const crumbs = [{ label: 'Domains', href: '/account/domains' }, { label: d.domainname }];
    const again = async (errs: Record<string, string>, status: number) =>
      html(await F({ title: d.domainname, active: 'domains', crumbs, body: domainDetailView({ csrf: v.csrf, d, cur: sess.cur, ns: [], nsInput: raw, errs }) }), status);
    if (!/active/i.test(d.status)) return again({ form: 'Nameservers can be changed once the domain is active.' }, 409);
    const val = validateNameservers(raw);
    if (!val.ok) return again(val.errs, 422);
    try { await api.domainUpdateNameservers(id, val.ns); }
    catch { return again({ form: 'The registry did not accept these nameservers. Check that each one exists and is spelled correctly, then try again.' }, 502); }
    await auditClient('client_ns_update', sess.email, ip, { domainId: id, ns: val.ns });
    return go(req, `/account/domains/${id}?ok=ns_saved`);
  }

  /* ---- new ticket ---- */
  if (segs[0] === 'support' && segs[1] === 'new' && segs.length === 2) {
    const form: TicketForm = { deptid: str('deptid', 12), subject: str('subject', 300).trim(), message: str('message').trim(), priority: str('priority', 10), service: str('service', 12) };
    const errs: Record<string, string> = {};
    let depts: { id: number; name: string }[] = [];
    try { depts = await api.getSupportDepartments(); } catch { errs.form = 'We could not open your ticket right now. Your message is kept below; try again in a moment.'; }
    if (!depts.some((d) => String(d.id) === form.deptid)) errs.deptid = 'Choose a department.';
    if ((form.subject || '').length < 3) errs.subject = 'Add a short subject (at least 3 characters).';
    else if (form.subject!.length > 150) errs.subject = 'Keep the subject under 150 characters.';
    if ((form.message || '').length < 10) errs.message = 'Describe the issue in a few words (at least 10 characters).';
    const priority = ['Low', 'Medium', 'High'].includes(form.priority || '') ? form.priority! : 'Medium';
    let serviceid: number | undefined;
    if (form.service) {
      const sid = idOf(form.service);
      if (!sid || !(await api.getService(cid, sid).catch(() => null))) errs.service = 'Choose one of your services.'; else serviceid = sid;
    }
    if (Object.keys(errs).length) return renderNewTicket(req, F, v, cid, form, errs, 422);
    try {
      const t = await api.openTicket(cid, { deptid: Number(form.deptid), subject: form.subject!, message: form.message!, priority, serviceid });
      await auditClient('client_ticket_open', sess.email, ip, { ticketId: t.id });
      return go(req, t.id ? `/account/support/${t.id}?ok=ticket_opened` : '/account/support?ok=ticket_opened');
    } catch {
      return renderNewTicket(req, F, v, cid, form, { form: 'We could not open your ticket right now. Your message is kept below; try again in a moment.' }, 502);
    }
  }

  /* ---- ticket reply ---- */
  if (segs[0] === 'support' && segs.length === 2) {
    const id = idOf(segs[1]);
    const t = id ? await api.getTicket(cid, id).catch(() => null) : null;
    if (!id || !t) return go(req, '/account/support');
    const message = str('message').trim();
    const crumbs = [{ label: 'Support', href: '/account/support' }, { label: `#${t.tid}` }];
    const again = async (errs: Record<string, string>, status: number) =>
      html(await F({ title: t.subject || 'Ticket', sub: `Ticket #${esc(t.tid)}`, active: 'support', crumbs, body: ticketView({ csrf: v.csrf, t, viewerName: v.name, reply: message, errs }) }), status);
    if (message.length < 2) return again({ message: 'Write a reply before sending.' }, 422);
    try { await api.addTicketReply(cid, id, message); }
    catch { return again({ form: 'Your reply could not be sent right now. It is kept below; try again in a moment.' }, 502); }
    await auditClient('client_ticket_reply', sess.email, ip, { ticketId: id });
    return go(req, `/account/support/${id}?ok=reply_sent#ac-rp-h`);
  }

  /* ---- profile ---- */
  if (segs[0] === 'profile' && segs.length === 1) {
    const val = validateProfile(Object.fromEntries(['firstname', 'lastname', 'companyname', 'phonenumber', 'address1', 'city', 'state', 'postcode', 'country'].map((k) => [k, str(k, 200)])));
    let cl: any;
    try { cl = await api.getClientsDetails(cid); } catch { cl = { email: sess.email }; }
    const again = async (errs: Record<string, string>, status: number) =>
      html(await F({ title: 'Profile', sub: 'Your contact details and sign-in settings.', active: 'profile', body: profileView({ csrf: v.csrf, c: cl, v: val.v, errs }) }), status);
    if (!val.ok) return again(val.errs, 422);
    try { await api.updateClient(cid, val.v); }
    catch { return again({ form: 'Your changes could not be saved right now. Please try again in a moment.' }, 502); }
    await auditClient('client_profile_update', sess.email, ip, { fields: Object.keys(val.v) });
    const res = go(req, '/account/profile?ok=profile_saved');
    const name = `${val.v.firstname} ${val.v.lastname}`.trim();
    if (name && name !== sess.name) {
      const { token } = await signClient({ clientId: cid, userId: sess.userId, email: sess.email, name, cur: sess.cur });
      res.cookies.set(CLIENT_COOKIE, token, cookieOpts);
    }
    return setFlag(res, true);
  }

  return html('Not found', 404);
}
