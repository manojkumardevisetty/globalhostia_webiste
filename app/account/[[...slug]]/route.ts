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
import { domainsView, domainDetailView, validateNameservers, nsConfirmView, nsLabelHtml } from '@/lib/portal/views/domains';
import { invoicesView, invoiceDetailView, INVOICE_FILTERS } from '@/lib/portal/views/invoices';
import { ticketsView, newTicketView, ticketView, type TicketForm } from '@/lib/portal/views/support';
import { profileView, validateProfile } from '@/lib/portal/views/profile';
import { renewalCentreView } from '@/lib/portal/views/renewal-centre';
import { buildRenewals, parseSelection } from '@/lib/portal/renewal-plan';
import { limiter } from '@/lib/agents/http';
import { whmcs } from '@/lib/whmcs';
import { card, empty, errorBox, esc, btn, ssoButton, pill } from '@/lib/portal/views/kit';
import { DNS_OK, type DnsView, type DnsForm } from '@/lib/portal/views/dns';
import { DnsError, dnsState, dnsWriteLimit, enableZone, resolveZone, zoneProvider, nsFor } from '@/lib/portal/dns';
import { templatePlan, type TemplateKey } from '@/lib/hosting/dns-plan';
import { t, withLocale, parseLang, parseDigits, LANG_COOKIE, DIGITS_COOKIE, WHMCS_LANG, lang as curLang, digits as curDigits } from '@/lib/portal/i18n';
import { parseFilter, parseBulk, parseBulkResult, eligible, bulkQuery, toRows, matches, toCsv, idList, type BulkResult, type NsKind } from '@/lib/portal/portfolio';
import { dnsContext, dnsKind, lockStatus, setLock, nameservers, cachedNameservers, forgetNameservers, nsTarget, sslProbe, mapLimit, type DnsCtx } from '@/lib/portal/domain-tools';
import { teamView, type TeamForm } from '@/lib/portal/views/team';
import { listMembers, inviteUser, updatePermissions, removeUser } from '@/lib/portal/team';
import { EMAIL_RE, normalizeEmail, permsFromForm, viewerIsOwner } from '@/lib/portal/team-perms';
import { settingsView } from '@/lib/portal/views/settings';
import { remindersCard } from '@/lib/portal/views/reminders';
import { healthPanel, healthStrip, healthFlash } from '@/lib/portal/views/health';
import { rowsFor as healthRows, rowFor as healthRow, healthPrefs, setHealthPrefs } from '@/lib/health/engine';
import { prefsFor, setPrefs, loadConfig as reminderConfig } from '@/lib/reminders/store';
import { toE164 } from '@/lib/reminders/core';
import { vapid, subscriptions, saveSubscription, removeSubscription, setCategories, setLanguage, sendToClient, PushUnavailable } from '@/lib/portal/push';
import { parseSubscription, parseCategories, PUSH_CATEGORIES } from '@/lib/portal/push-crypto';
import { paletteItems, forgetPalette } from '@/lib/portal/palette';
import { dnsRecord, InputError } from '@/lib/hosting/validate';
import { PanelError } from '@/lib/hosting/types';
import { scrubMessage } from '@/lib/ux/errors';
import { loadServers } from '@/lib/hosting/servers';
import { serverFor } from '@/lib/hosting/match';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// bulk domain actions call the registry once per domain (up to 50)
export const maxDuration = 60;

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
/** Portfolio bulk actions (each up to 50 domains), lazy status / TLS lookups, team changes, push settings: per client. */
const bulkLimit = limiter(10, 10 * 60_000);
const lookupLimit = limiter(120, 60_000);
const teamLimit = limiter(20, 60 * 60_000);
const pushLimit = limiter(30, 10 * 60_000);
const json = (body: unknown, status = 200) => new NextResponse(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS } });
const YEAR = 365 * 24 * 3600;
const PUSH_MSG: Record<string, string> = {
  push_on: 'Notifications are on for this device.', push_off: 'Notifications are off for this device.', push_saved: 'Saved.', push_test: 'Test notification sent.',
  push_none: 'No device received the test. Turn notifications on for this device first.', push_bad: 'Something went wrong. Please try again.',
  push_unavailable: 'Notifications are not available yet. Please check back soon.', rate: 'Too many changes in a short time. Please wait a few minutes and try again.', failed: 'Something went wrong. Please try again.',
};
const localeOf = (req: NextRequest) => ({ lang: parseLang(req.cookies.get(LANG_COOKIE)?.value), digits: parseDigits(req.cookies.get(DIGITS_COOKIE)?.value) });
const setLangCookies = (res: NextResponse, l: string, d?: string) => {
  res.cookies.set(LANG_COOKIE, l, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: YEAR });
  // digits are read by account.js to format live totals the same way
  if (d) res.cookies.set(DIGITS_COOKIE, d, { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: YEAR });
  return res;
};
/** Session-scoped domain list for the lazy lookups (one billing call per minute, not one per batch). */
const domCache = new Map<string, { at: number; list: any[] }>();
async function myDomains(cid: number, jti: string) {
  const hit = domCache.get(jti);
  if (hit && Date.now() - hit.at < 60_000) return hit.list;
  const list = await api.getClientsDomains(cid);
  if (domCache.size > 2000) domCache.clear();
  domCache.set(jti, { at: Date.now(), list });
  return list;
}
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,253}\.[a-z]{2,63}$/i;

async function secureBase() {
  try { return whmcsBase(await getSettings()); } catch { return whmcsBase({}); }
}

const viewerOf = (s: ClientSession): Viewer => ({ name: s.name, email: s.email, clientId: s.clientId, csrf: csrfFor(s.jti) });

/* =========================================================== GET */
export async function GET(req: NextRequest, ctx: Ctx) {
  return withLocale(localeOf(req), () => getLocalized(req, ctx));
}
async function getLocalized(req: NextRequest, ctx: Ctx) {
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
  /* language preference from the signed-out pages (cookie only; signed-in users switch with a CSRF POST that also updates billing) */
  if (segs[0] === 'lang' && segs.length === 1) {
    const l = parseLang(q.get('set'));
    return setLangCookies(go(req, safeNext(q.get('next')) || '/account/login'), l);
  }
  if (segs[0] === 'login') {
    if (sess) return go(req, '/account');
    const st: LoginState = { secureUrl: `${await secureBase()}/clientarea.php`, next: safeNext(q.get('next')) || undefined, reset: q.has('reset'), signedOut: q.has('out') };
    return html(await guestFrame({ path, query: q, title: t('Sign in'), body: loginView(st) }));
  }
  if (segs[0] === 'forgot') return html(await guestFrame({ path, query: q, title: t('Reset your password'), body: forgotView({}) }));
  if (!sess) {
    const next = safeNext(path + (req.nextUrl.search || ''));
    return go(req, `/account/login${next && next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`);
  }
  if (segs[0] === 'logout' || segs[0] === 'sso') return go(req, '/account');

  const v = viewerOf(sess);
  const cid = sess.clientId;
  const F = (o: Omit<Parameters<typeof frame>[0], 'viewer' | 'path' | 'query'>) => frame({ ...o, viewer: v, path, query: q });
  const notFound = async (what: string, back: string, active: Parameters<typeof frame>[0]['active']) =>
    html(await F({ title: t('Not found'), active, body: card(t('Not found'), empty(t("We couldn't find that {x}", { x: t(what) }), t('It may have been removed, or it belongs to a different account.'), btn(t('Go back'), back, { variant: 'dark' }), 'search'), { id: 'ac-nf-h' }) }), 404);
  const failed = async (title: string, what: string, active: Parameters<typeof frame>[0]['active']) =>
    html(await F({ title, active, body: errorBox(t(what), path + (req.nextUrl.search || '')) }), 503);

  const [a, b, c] = segs;

  /* JSON for account.js: lazy domain lookups and the command palette index */
  if (a === 'api' && !c) {
    const wait = lookupLimit(`c${cid}`);
    if (wait) return json({ error: 'rate_limited', retry: wait }, 429);
    if (b === 'palette') {
      const r = await paletteItems(cid, sess.jti, curLang(), sess.cur);
      return json(r);
    }
    if (b === 'domains') {
      const ids = idList(q.get('ids'), 25);
      let mine: any[];
      try { mine = await myDomains(cid, sess.jti); } catch { return json({ error: 'unavailable' }, 503); }
      const own = ids.map((id) => mine.find((d: any) => Number(d.id) === id)).filter((d) => d && /^active$/i.test(String(d.status)));
      const items: Record<string, unknown> = {};
      if (q.get('f') === 'ssl') {
        await mapLimit(own, 5, async (d: any) => {
          const s = await sslProbe(String(d.domainname));
          const label = s.state === 'valid' ? t('Valid') : s.state === 'expiring' ? t('Expires in {n} days', { n: s.days ?? 0 }) : s.state === 'expired' ? t('Expired')
            : s.state === 'invalid' ? t('Not trusted') : s.state === 'none' ? t('No certificate') : t('Not checked');
          const tone = s.state === 'valid' ? 'ok' : s.state === 'expiring' ? 'warn' : s.state === 'unknown' ? 'muted' : 'bad';
          items[d.id] = { state: s.state, tone, label, title: s.expires ? t('Expires {d}', { d: s.expires }) + (s.issuer ? ` · ${s.issuer}` : '') : '' };
        });
        return json({ items });
      }
      const dctx = await dnsContext(cid);
      await mapLimit(own, 6, async (d: any) => {
        const [ns, lock] = await Promise.all([nameservers(Number(d.id)), lockStatus(Number(d.id))]);
        const k = dnsKind(dctx, String(d.domainname), ns);
        const dnsLabel = { hosting: t('Hosting account'), managed: t('Managed by us'), ours: t('Managed by us'), external: k.host && k.host !== 'another provider' ? k.host : t('External'), mixed: t('Mixed'), unknown: t('Unknown') }[k.kind];
        items[d.id] = {
          nsKind: k.deleg, nsHtml: nsLabelHtml(k.deleg, ns, k.host), dns: { kind: k.kind, label: `${t('DNS')}: ${dnsLabel}` },
          lock: { state: lock, label: lock === 'locked' ? t('Locked') : lock === 'unlocked' ? t('Unlocked') : t('Unknown') },
        };
      });
      return json({ items });
    }
    return json({ error: 'not_found' }, 404);
  }

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
    const strip = healthStrip(await healthRows(cid).catch(() => [])); // urgent domain health problems (lib/health)
    return html(await F({ title: 'Dashboard', h1: d.greeting, sub: d.alert ? `<span class="ac-hero-alert" role="status">${esc(d.summary)}</span>` : esc(d.summary), active: 'dashboard', heroExtra: d.statsHtml, body: strip + d.body }));
  }

  /* services */
  if (a === 'services') {
    if (!b) {
      try {
        const products = await api.getClientsProducts(cid);
        return html(await F({ title: t('Products & Services'), sub: esc(t('Hosting, servers and certificates on your account.')), active: 'services', body: servicesView({ csrf: v.csrf, products, cur: sess.cur, filter: q.get('status') || 'active' }) }));
      } catch { return failed(t('Products & Services'), 'your services', 'services'); }
    }
    const id = idOf(b);
    if (!id) return notFound('service', '/account/services', 'services');
    let p: any;
    try { p = await api.getService(cid, id); } catch { return failed(t('Service'), 'this service', 'services'); }
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
      title: p.translated_name || p.name || t('Service'), sub: `${p.domain ? `<span class="ac-mono">${esc(p.domain)}</span> ` : ''}${pill(p.status)}`, active: 'services',
      crumbs: [{ label: t('Products & Services'), href: '/account/services' }, { label: p.name || t('Service') }],
      headAction: ssoButton(v.csrf, 'service', p.id, t('Open control panel'), { variant: 'outline', ic: 'external' }),
      ai: { serviceId: Number(p.id), domain: p.domain ? String(p.domain).toLowerCase() : undefined },
      body: serviceDetailView({ csrf: v.csrf, p, cur: sess.cur, dnsHref }),
    }));
  }

  /* domains */
  if (a === 'domains') {
    if (!b) {
      try {
        const [domains, unpaid] = await Promise.all([api.getClientsDomains(cid), api.getInvoices(cid, 'Unpaid').then((r) => r.list).catch(() => null)]);
        const inv = unpaid?.length ? await api.unpaidRenewalInvoices(cid, unpaid).catch(() => undefined) : undefined;
        const f = parseFilter(q);
        // nameservers already looked up (cache) are shown straight away; the "external" filter without JavaScript looks them up now
        const ns = new Map<number, string[] | null>(), nsKind = new Map<number, NsKind>();
        const active = domains.filter((d: any) => /^active$/i.test(String(d.status)));
        const dctx = active.length ? await dnsContext(cid).catch(() => null) : null;
        const fill = async (d: any) => {
          const id = Number(d.id);
          const list = f.ns === 'ext' ? await nameservers(id) : cachedNameservers(id);
          if (!list || !dctx) return;
          ns.set(id, list);
          nsKind.set(id, dnsKind(dctx, String(d.domainname), list).deleg);
        };
        await mapLimit(active.slice(0, f.ns === 'ext' ? 60 : 250), 6, fill);
        const health = new Map((await healthRows(cid).catch(() => [])).filter((h) => h.target.whmcsDomainId).map((h) => [Number(h.target.whmcsDomainId), h]));
        const view = domainsView({ csrf: v.csrf, domains, cur: sess.cur, invoices: inv?.domains, f, bulk: parseBulkResult(q), ns, nsKind, health });
        return html(await F({ title: t('Domains'), sub: esc(t('Your domain portfolio: renewals, auto-renew, registrar lock, nameservers and SSL.')), active: 'domains', headAction: view.headAction, heroExtra: view.statsHtml, body: view.body }));
      } catch { return failed(t('Domains'), 'your domains', 'domains'); }
    }
    if (b === 'export') {
      let domains: any[];
      try { domains = await api.getClientsDomains(cid); } catch { return failed(t('Domains'), 'your domains', 'domains'); }
      const sel = idList(q.getAll('sel'), 250);
      const f = parseFilter(q);
      const rows = toRows(domains).filter((r) => (sel.length ? sel.includes(r.id) : f.ns === 'ext' ? true : matches(r, f)));
      const nsMap = new Map<number, string[]>();
      for (const r of rows) { const n = cachedNameservers(r.id); if (n) nsMap.set(r.id, n); }
      await auditClient('client_domain_export', sess.email, clientIp(req), { count: rows.length, selected: sel.length });
      return new NextResponse(toCsv(rows, { currency: sess.cur, ns: nsMap }), { headers: {
        ...SECURITY_HEADERS, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="globalhostia-domains-${new Date().toISOString().slice(0, 10)}.csv"`,
      } });
    }
    const id = idOf(b);
    if (!id) return notFound('domain', '/account/domains', 'domains');
    let d: any;
    try { d = await api.getDomain(cid, id); } catch { return failed(t('Domain'), 'this domain', 'domains'); }
    if (!d) return notFound('domain', '/account/domains', 'domains');
    const okKey = q.get('ok') || '';
    return domainPage(F, v.csrf, sess.cur, cid, d, {
      ok: DNS_OK[okKey] ? okKey : undefined, edit: q.get('edit') || undefined, del: q.get('del') || undefined, add: q.has('add'), tpl: q.get('tpl') || undefined,
      pre: q.has('add') ? { type: (q.get('type') || '').slice(0, 10).toUpperCase() || undefined, name: (q.get('name') || '').slice(0, 260) || undefined, value: (q.get('value') || '').slice(0, 1024) || undefined } : undefined,
    }, 200, q.get('ok') || q.get('err'));
  }

  /* team access */
  if (a === 'team' && !b) {
    const view = await teamPage(v, sess, cid, { edit: idOf(q.get('edit') || undefined) ?? undefined, del: idOf(q.get('del') || undefined) ?? undefined });
    return html(await F({ title: t('Team access'), sub: esc(t('People who can sign in to this account, and what each of them can do.')), active: 'team', body: view }));
  }

  /* app & notifications */
  if (a === 'settings' && !b) {
    const [keys, subs, rp, rcfg, cl, hp] = await Promise.all([vapid(), subscriptions(cid).catch(() => []), prefsFor(cid).catch(() => null), reminderConfig().catch(() => null), api.getClientsDetails(cid).catch(() => null), healthPrefs(cid).catch(() => null)]);
    const cats = subs.length ? [...new Set(subs.flatMap((s) => (Array.isArray(s.categories) ? s.categories : []) as string[]))] : [...PUSH_CATEGORIES];
    // reminder choices: WhatsApp is offered only once the owner switched it on for at least one account reminder
    const waOffered = !!rcfg && rcfg.whatsapp.enabled && (rcfg.renewal.channels.whatsapp || rcfg.overdue.channels.whatsapp || rcfg.domain.channels.whatsapp);
    const reminders = rp ? remindersCard({ csrf: v.csrf, cartEmail: rp.cartEmail, renewalEmail: rp.renewalEmail, whatsapp: rp.whatsapp, whatsappAt: rp.whatsappAt ? rp.whatsappAt.toISOString() : null,
      phone: cl ? toE164(cl.phonenumberformatted || cl.phonenumber, { country: cl.countrycode || cl.country, cc: cl.phonecc }) : null, waOffered, saved: q.get('ok') === 'reminders_saved', health: hp ? hp.alerts : undefined }) : '';
    return html(await F({
      title: t('App & notifications'), sub: esc(t('Install GlobalHostia as an app, choose notifications and set your language.')), active: 'settings',
      body: settingsView({ csrf: v.csrf, publicKey: keys?.publicKey || null, available: !!keys, devices: subs.length, cats: parseCategories(cats), lang: curLang(), digits: curDigits(), reminders }),
    }));
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
    return html(await F({ title: t('Renewals'), sub: esc(t('Everything on your account that renews, with dates and amounts from your billing records.')), active: 'renewals', headAction: view.headAction, heroExtra: view.statsHtml, body: view.body }), status);
  }

  /* billing */
  if (a === 'invoices') {
    if (!b) {
      const status = INVOICE_FILTERS.find(([k]) => k === q.get('status'))?.[0] || '';
      try {
        const [list, unpaid] = await Promise.all([api.getInvoices(cid, status || undefined), status === 'Unpaid' ? null : api.getInvoices(cid, 'Unpaid').catch(() => null)]);
        const u = status === 'Unpaid' ? list : unpaid;
        const total = u ? u.list.reduce((s, i) => s + (parseFloat(i.balance ?? i.total) || 0), 0) : null;
        return html(await F({ title: t('Billing'), sub: esc(t('Invoices, payments and receipts.')), active: 'billing', body: invoicesView({ csrf: v.csrf, list: list.list, status, cur: u?.list[0]?.currencycode || sess.cur, unpaidTotal: total, unpaidCount: u?.list.length || 0 }) }));
      } catch { return failed(t('Billing'), 'your invoices', 'billing'); }
    }
    const id = idOf(b);
    if (!id) return notFound('invoice', '/account/invoices', 'billing');
    let inv: any, client: any = null;
    try { [inv, client] = await Promise.all([api.getInvoice(cid, id), api.getClientsDetails(cid).catch(() => null)]); } catch { return failed(t('Invoice'), 'this invoice', 'billing'); }
    if (!inv) return notFound('invoice', '/account/invoices', 'billing');
    return html(await F({ title: t('Invoice #{n}', { n: inv.invoicenum || inv.invoiceid }), active: 'billing', crumbs: [{ label: t('Billing'), href: '/account/invoices' }, { label: t('Invoice #{n}', { n: inv.invoicenum || inv.invoiceid }) }], body: invoiceDetailView({ csrf: v.csrf, inv, client }) }));
  }

  /* support */
  if (a === 'support') {
    if (!b) {
      const filter = q.get('status') === 'all' ? 'all' : 'open';
      try {
        const tickets = await api.getTickets(cid, filter === 'all' ? undefined : 'All Active Tickets');
        return html(await F({ title: t('Support'), sub: esc(t('Tickets with our engineers, answered around the clock.')), active: 'support', headAction: btn(t('New ticket'), '/account/support/new', { variant: 'outline', ic: 'plus' }), body: ticketsView({ tickets, filter }) }));
      } catch { return failed(t('Support'), 'your tickets', 'support'); }
    }
    if (b === 'new') return renderNewTicket(req, F, v, cid, { priority: 'Medium', service: q.get('service') || '' });
    const id = idOf(b);
    if (!id) return notFound('ticket', '/account/support', 'support');
    let tk: any;
    try { tk = await api.getTicket(cid, id); } catch { return failed(t('Ticket'), 'this ticket', 'support'); }
    if (!tk) return notFound('ticket', '/account/support', 'support');
    return html(await F({ title: tk.subject || t('Ticket'), sub: esc(t('Ticket #{n}', { n: tk.tid })), active: 'support', crumbs: [{ label: t('Support'), href: '/account/support' }, { label: `#${tk.tid}` }], body: ticketView({ csrf: v.csrf, t: tk, viewerName: v.name }) }));
  }

  /* profile */
  if (a === 'profile' && !b) {
    try {
      const cl = await api.getClientsDetails(cid);
      return html(await F({ title: t('Profile'), sub: esc(t('Your contact details and sign-in settings.')), active: 'profile', body: profileView({ csrf: v.csrf, c: cl }) }));
    } catch { return failed(t('Profile'), 'your profile', 'profile'); }
  }

  return notFound('page', '/account', 'dashboard');
}

/** Domain detail with its DNS section (nameservers read live from the registry, zone resolved per request). */
async function domainPage(F: (o: any) => Promise<string>, csrf: string, cur: string, cid: number, d: any, dns: Omit<DnsView, 'csrf' | 'd' | 'st'>, status = 200, healthKey?: string | null) {
  let ns: string[] | null = null;
  try { ns = await api.domainGetNameservers(Number(d.id)); } catch { ns = null; }
  const [st, hv] = await Promise.all([dnsState(cid, d, ns), healthRow(cid, String(d.domainname || '')).catch(() => null)]);
  const health = healthPanel(hv, csrf, { back: `/account/domains/${Number(d.id)}#health`, flash: healthFlash(healthKey) });
  return html(await F({ title: d.domainname, active: 'domains', crumbs: [{ label: t('Domains'), href: '/account/domains' }, { label: d.domainname }], ai: { domainId: Number(d.id), domain: String(d.domainname || '').toLowerCase() }, body: domainDetailView({ csrf, d, cur, ns, dns: { ...dns, st }, health }) }), status);
}

/** Team page: members + permissions (owner can manage). Never throws: a billing-API failure shows the fallback card. */
async function teamPage(v: Viewer, sess: ClientSession, cid: number, o: { form?: TeamForm; errs?: Record<string, string>; edit?: number; del?: number } = {}) {
  try {
    const { members, clientEmail, permsReadable } = await listMembers(cid);
    const owner = viewerIsOwner(members, { userId: sess.userId, email: sess.email }, clientEmail);
    return teamView({ csrf: v.csrf, members, owner, me: { userId: sess.userId, email: sess.email }, permsReadable, ...o });
  } catch (e) {
    console.error('[team] list', e instanceof Error ? e.message : e);
    return teamView({ csrf: v.csrf, members: [], owner: false, me: { userId: sess.userId, email: sess.email }, permsReadable: false, failed: true });
  }
}

async function renderNewTicket(req: NextRequest, F: (o: any) => Promise<string>, v: Viewer, cid: number, form: TicketForm, errs?: Record<string, string>, status = 200) {
  try {
    const [depts, services] = await Promise.all([api.getSupportDepartments(), api.getClientsProducts(cid).catch(() => [])]);
    const svc = services.filter((s: any) => !/terminated|cancelled|fraud/i.test(s.status));
    if (!form.deptid && depts.length === 1) form.deptid = String(depts[0].id);
    return html(await F({ title: t('Open a ticket'), active: 'support', crumbs: [{ label: t('Support'), href: '/account/support' }, { label: t('New ticket') }], body: newTicketView({ csrf: v.csrf, depts, services: svc, v: form, errs }) }), status);
  } catch {
    return html(await F({ title: t('Open a ticket'), active: 'support', body: errorBox(t('the ticket form'), '/account/support/new') }), 503);
  }
}

/* =========================================================== POST */
export async function POST(req: NextRequest, ctx: Ctx) {
  return withLocale(localeOf(req), () => handlePost(req, ctx));
}
async function handlePost(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
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
    const out = async (error: LoginState['error'], status: number) => html(await guestFrame({ path, query: q, title: t('Sign in'), body: loginView({ ...st, error }) }), status);
    if (!sameOrigin(req)) return out('origin', 403);
    if (!EMAIL.test(email) || !password) return out('invalid', 400);
    if (await recentFailures('client_login_failed', ip, email) >= MAX_FAILS) { await auditClient('client_login_blocked', email, ip); return out('locked', 429); }
    let r: Awaited<ReturnType<typeof api.validateLogin>>;
    try { r = await api.validateLogin(email, password); } catch { return out('down', 503); }
    if (!r.ok) { await auditClient('client_login_failed', email, ip); return out('invalid', 401); }
    if (r.twoFactor) { await auditClient('client_login_2fa', email, ip); return out('tfa', 200); }
    let client: { id: number; name: string } | null, cur = 'USD', name = '', billingLang = '';
    try {
      client = await api.resolveClient(email);
      if (client) { const d = await api.getClientsDetails(client.id); cur = d.currency_code || 'USD'; name = `${d.firstname || ''} ${d.lastname || ''}`.trim() || client.name; billingLang = String(d.language || '').toLowerCase(); }
    } catch { return out('down', 503); }
    if (!client) { await auditClient('client_login_failed', email, ip, { reason: 'no_client' }); return out('noclient', 401); }
    const { token } = await signClient({ clientId: client.id, userId: r.userId, email, name, cur });
    await auditClient('client_login', email, ip, { clientId: client.id });
    const res = go(req, next);
    res.cookies.set(CLIENT_COOKIE, token, cookieOpts);
    // no language chosen on this device yet: follow the billing profile (Arabic set in the client area carries over)
    if (!req.cookies.get(LANG_COOKIE)?.value && billingLang === WHMCS_LANG.ar) setLangCookies(res, 'ar');
    return setFlag(res, true);
  }

  /* ---- forgot password: always the same neutral answer ---- */
  if (segs[0] === 'forgot' && segs.length === 1) {
    const email = str('email', 254).trim().toLowerCase();
    if (!sameOrigin(req)) return html(await guestFrame({ path, query: q, title: t('Reset your password'), body: forgotView({ email, error: 'origin' }) }), 403);
    if (!EMAIL.test(email)) return html(await guestFrame({ path, query: q, title: t('Reset your password'), body: forgotView({ email, error: 'invalid' }) }), 400);
    if (await recentFailures('client_reset', ip, email) < MAX_FAILS) {
      await auditClient('client_reset', email, ip);
      await api.resetPassword(email);
    }
    return html(await guestFrame({ path, query: q, title: t('Check your email'), body: forgotView({ email, sent: true }) }));
  }

  /* ---- everything below needs a session, a same-origin request and a valid CSRF token ---- */
  const sess = await readClient(req);
  if (!sess) return go(req, '/account/login');
  const wantsJson = req.headers.get('x-ac-fetch') === '1';
  if (!sameOrigin(req) || !csrfOk(sess.jti, fd.get('csrf'))) {
    await auditClient('client_csrf_rejected', sess.email, ip, { path });
    if (wantsJson) return json({ ok: false, error: 'csrf' }, 403);
    return go(req, `${segs[0] === 'logout' || segs[0] === 'sso' ? '/account' : path}?err=csrf`);
  }
  const cid = sess.clientId;
  const v = viewerOf(sess);
  const F = (o: any) => frame({ ...o, viewer: v, path, query: q });

  if (segs[0] === 'logout') {
    await auditClient('client_logout', sess.email, ip);
    forgetPalette(sess.jti);
    domCache.delete(sess.jti);
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
          // WHMCS 8 user management (invitations that the API cannot list)
          users: { destination: 'sso:custom_redirect', path: 'index.php?rp=/account/users' },
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

  /* ---- language (and digits): cookie for this device + the billing profile language ---- */
  if (segs[0] === 'lang' && segs.length === 1) {
    const l = parseLang(str('lang', 5));
    const dRaw = str('digits', 5);
    const next = safeNext(str('next', 300)) || '/account';
    const res = setLangCookies(go(req, `${next}${next.includes('?') ? '&' : '?'}ok=lang_saved`), l, dRaw ? parseDigits(dRaw) : undefined);
    let synced = false;
    try { await whmcs('UpdateClient', { clientid: cid, language: WHMCS_LANG[l] }); synced = true; } catch (e) { console.warn('[lang] billing sync', e instanceof Error ? e.message : e); }
    await setLanguage(cid, l).catch(() => {});
    forgetPalette(sess.jti);
    await auditClient('client_language', sess.email, ip, { lang: l, digits: dRaw || undefined, billingSynced: synced });
    return res;
  }

  /* ---- domain portfolio: bulk actions (auto-renew, registrar lock, nameservers) ---- */
  if (segs[0] === 'domains' && segs.length === 1 && str('op', 10) === 'bulk') {
    const backRaw = str('back', 300);
    const back = /^\?[A-Za-z0-9=&_.%-]{0,290}$/.test(backRaw) ? backRaw : '';
    const to = (qs: string) => go(req, `/account/domains${back}${back ? '&' : '?'}${qs}`);
    const parsed = parseBulk(str('action', 20), fd.getAll('sel'));
    if (!parsed.ok) return to(parsed.error === 'nosel' ? 'err=bulk_nosel' : 'err=failed');
    let mine: any[];
    try { mine = await api.getClientsDomains(cid); } catch { return to('err=failed'); }
    const byId = new Map(mine.map((d: any) => [Number(d.id), d]));
    const { action, ids } = parsed;
    if (action === 'ns_ours' && str('confirm', 5) !== 'yes') {
      const rows = toRows(ids.map((id) => byId.get(id)).filter(Boolean));
      return html(await F({ title: t('Domains'), active: 'domains', crumbs: [{ label: t('Domains'), href: '/account/domains' }, { label: t('Use GlobalHostia nameservers') }], body: nsConfirmView({ csrf: v.csrf, rows, back }) }));
    }
    if (bulkLimit(`c${cid}`)) { await auditClient('client_domain_bulk_limited', sess.email, ip, { action, count: ids.length }); return to('err=rate'); }
    const res: BulkResult = { action, done: [], skipped: [], failed: [] };
    const dctx: DnsCtx | null = action === 'ns_ours' ? await dnsContext(cid) : null;
    const isOff = (d: any) => d.donotrenew === true || d.donotrenew === 1 || d.donotrenew === '1' || d.donotrenew === 'true';
    const pendingVerify: number[] = [];
    await mapLimit(ids, 4, async (id) => {
      const d = byId.get(id);
      if (!d) { res.failed.push({ id, reason: 'notfound' }); return; }
      if (!eligible(action, d.status)) { res.failed.push({ id, reason: 'state' }); return; }
      try {
        if (action === 'autorenew_on' || action === 'autorenew_off') {
          const on = action === 'autorenew_on';
          if (!isOff(d) === on) { res.skipped.push(id); return; }
          await whmcs('UpdateClientDomain', { domainid: id, donotrenew: on ? 0 : 1 });
          pendingVerify.push(id);
        } else if (action === 'lock' || action === 'unlock') {
          await setLock(id, action === 'lock');
          res.done.push(id);
        } else {
          const target = nsTarget(dctx!, String(d.domainname));
          if (!target) { res.failed.push({ id, reason: 'nozone' }); return; }
          const cur = (await nameservers(id)) || [];
          if (cur.length === target.length && target.every((n) => cur.includes(n.toLowerCase()))) { res.skipped.push(id); return; }
          await api.domainUpdateNameservers(id, target);
          forgetNameservers(id);
          res.done.push(id);
        }
      } catch (e) {
        res.failed.push({ id, reason: 'api' });
        console.warn('[domains-bulk]', action, id, e instanceof Error ? e.message : e);
      }
    });
    // auto-renew: read the domains back once and report any the billing system ignored
    if (pendingVerify.length) {
      const after = await api.getClientsDomains(cid).catch(() => null);
      for (const id of pendingVerify) {
        const d = after?.find((x: any) => Number(x.id) === id);
        const ok = d && (action === 'autorenew_on' ? !isOff(d) : isOff(d));
        if (ok || !after) res.done.push(id); else res.failed.push({ id, reason: 'verify' });
      }
    }
    domCache.delete(sess.jti);
    forgetPalette(sess.jti);
    const names = (xs: number[]) => xs.map((id) => String(byId.get(id)?.domainname || id));
    await auditClient('client_domain_bulk', sess.email, ip, { action, done: names(res.done), skipped: names(res.skipped), failed: res.failed.map((f) => ({ domain: String(byId.get(f.id)?.domainname || f.id), reason: f.reason })) });
    return to(bulkQuery(res));
  }

  /* ---- team access (owner only; every request re-checks) ---- */
  if (segs[0] === 'team' && segs.length === 1) {
    const op = str('op', 10);
    const again = async (o: { form?: TeamForm; errs?: Record<string, string> }, status: number) =>
      html(await F({ title: t('Team access'), sub: esc(t('People who can sign in to this account, and what each of them can do.')), active: 'team', body: await teamPage(v, sess, cid, o) }), status);
    let list: Awaited<ReturnType<typeof listMembers>>;
    try { list = await listMembers(cid); } catch { return again({ errs: { form: t('Team access could not be changed right now. Please try again in a moment.') } }, 503); }
    if (!viewerIsOwner(list.members, { userId: sess.userId, email: sess.email }, list.clientEmail)) {
      await auditClient('client_team_denied', sess.email, ip, { op });
      return go(req, '/account/team?err=owner_only');
    }
    if (teamLimit(`c${cid}`)) { await auditClient('client_team_limited', sess.email, ip, { op }); return go(req, '/account/team?err=rate'); }
    if (op === 'invite') {
      const email = normalizeEmail(str('email', 254));
      const perms = permsFromForm(str('preset', 20), fd.getAll('perm'));
      const form: TeamForm = { email, preset: str('preset', 20), perms: fd.getAll('perm').map(String) };
      const errs: Record<string, string> = {};
      if (!EMAIL_RE.test(email)) errs.email = t('Enter a valid email address.');
      else if (list.members.some((m) => m.email === email)) errs.email = t('This person already has access to your account.');
      if (!perms.ok) errs.perms = perms.error === 'empty' ? t('Choose at least one permission.') : t('Choose an access level.');
      if (Object.keys(errs).length || !perms.ok) return again({ form, errs }, 422);
      try { await inviteUser(cid, email, perms.perms); }
      catch (e) {
        await auditClient('client_team_invite_failed', sess.email, ip, { email, perms: perms.perms, error: e instanceof Error ? e.message : String(e) });
        return again({ form, errs: { form: t('The invitation could not be sent. The person may already have a pending invitation. Please try again or manage invitations in the client area.') } }, 502);
      }
      await auditClient('client_team_invite', sess.email, ip, { email, perms: perms.perms, preset: perms.preset });
      return go(req, '/account/team?ok=invited');
    }
    const uid = idOf(str('uid', 12));
    const m = uid ? list.members.find((x) => x.id === uid) : undefined;
    const self = m && (sess.userId ? m.id === sess.userId : m.email === sess.email.toLowerCase());
    if (!uid || !m || m.owner || self) { await auditClient('client_team_denied', sess.email, ip, { op, uid }); return go(req, '/account/team?err=failed'); }
    if (op === 'perms') {
      const perms = permsFromForm(str('preset', 20), fd.getAll('perm'));
      if (!perms.ok) return again({ errs: { _scope: 'perms', _id: String(uid), perms: perms.error === 'empty' ? t('Choose at least one permission.') : t('Choose an access level.') } }, 422);
      try { await updatePermissions(cid, uid, perms.perms); }
      catch (e) { await auditClient('client_team_perms_failed', sess.email, ip, { uid, email: m.email, error: e instanceof Error ? e.message : String(e) }); return go(req, '/account/team?err=failed'); }
      await auditClient('client_team_perms', sess.email, ip, { uid, email: m.email, before: m.perms, after: perms.perms });
      return go(req, `/account/team?ok=perms_saved#tm-${uid}`);
    }
    if (op === 'remove') {
      if (str('confirm', 5) !== 'yes') return go(req, `/account/team?del=${uid}#tm-${uid}`);
      try { await removeUser(cid, uid); }
      catch (e) { await auditClient('client_team_remove_failed', sess.email, ip, { uid, email: m.email, error: e instanceof Error ? e.message : String(e) }); return go(req, '/account/team?err=failed'); }
      await auditClient('client_team_remove', sess.email, ip, { uid, email: m.email, perms: m.perms });
      return go(req, '/account/team?ok=removed');
    }
    return go(req, '/account/team');
  }

  /* ---- app & notifications: push subscription (JSON from account.js), categories, test ---- */
  if (segs[0] === 'settings' && segs.length === 1) {
    const op = str('op', 20);
    const reply = (ok: boolean, key: string, status = ok ? 200 : 400) => (wantsJson ? json({ ok, key, message: t(PUSH_MSG[key] || key) }, status) : go(req, `/account/settings?${ok ? 'ok' : 'err'}=${key}`));
    if (pushLimit(`c${cid}`)) return reply(false, 'rate', 429);
    if (op === 'reminder_prefs') {
      // unticked boxes are absent from the form: absent = off. WhatsApp stays off unless ticked (explicit opt-in).
      const next: { cartEmail: boolean; renewalEmail: boolean; whatsapp?: boolean } = { cartEmail: fd.get('cart') === '1', renewalEmail: fd.get('renewal') === '1' };
      if (fd.get('wa_shown') === '1') next.whatsapp = fd.get('whatsapp') === '1'; // WhatsApp row not shown: keep the earlier choice
      try {
        await setPrefs(cid, sess.email, next, 'portal');
        if (fd.get('health_shown') === '1') await setHealthPrefs(cid, sess.email, fd.get('health') === '1'); // domain health alerts (lib/health)
      } catch { return go(req, '/account/settings?err=failed#reminders'); }
      await auditClient('client_reminder_prefs', sess.email, ip, next);
      return go(req, '/account/settings?ok=reminders_saved#reminders');
    }
    if (op === 'push_subscribe') {
      const sub = parseSubscription(str('sub', 4096));
      if (!sub) return reply(false, 'push_bad');
      const existing = await subscriptions(cid).catch(() => []);
      const cats = parseCategories(existing.length ? existing.flatMap((x) => (Array.isArray(x.categories) ? x.categories : []) as string[]) : [...PUSH_CATEGORIES]);
      try { await saveSubscription({ clientId: cid, userId: sess.userId, ...sub, categories: cats, lang: curLang(), ua: req.headers.get('user-agent') || '' }); }
      catch (e) { if (e instanceof PushUnavailable) return reply(false, 'push_unavailable', 503); throw e; }
      await auditClient('client_push_subscribe', sess.email, ip, { host: new URL(sub.endpoint).host });
      return reply(true, 'push_on');
    }
    if (op === 'push_unsubscribe') {
      const endpoint = str('endpoint', 2048);
      await removeSubscription(cid, endpoint);
      await auditClient('client_push_unsubscribe', sess.email, ip, {});
      return reply(true, 'push_off');
    }
    if (op === 'push_prefs') {
      const cats = parseCategories(fd.getAll('cat'));
      await setCategories(cid, cats);
      await auditClient('client_push_prefs', sess.email, ip, { categories: cats });
      return reply(true, 'push_saved');
    }
    if (op === 'push_test') {
      const n = await sendToClient(cid, 'test', () => ({ title: t('GlobalHostia notifications are on'), body: t('This is a test. You will be notified like this about the topics you chose.'), url: '/account/settings', tag: 'test' })).catch(() => 0);
      await auditClient('client_push_test', sess.email, ip, { delivered: n });
      return reply(n > 0, n > 0 ? 'push_test' : 'push_none');
    }
    return reply(false, 'failed');
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
    if (!/^active$/i.test(String(d.status))) return again(t('DNS can be managed once the domain is active.'), 'zone', 409);
    const wait = dnsWriteLimit(`c${cid}`);
    if (wait) return again(t('Too many changes in a short time. Try again in {n} seconds.', { n: wait }), op === 'add' ? 'add' : 'zone', 429, undefined, form);

    let ns: string[] | null = null;
    try { ns = await api.domainGetNameservers(id); } catch { ns = null; }
    let plan: Awaited<ReturnType<typeof resolveZone>>['plan'];
    try { plan = (await resolveZone(cid, d, ns)).plan; } catch { return again(t('We could not reach the DNS server right now. Please try again.'), 'zone', 503); }
    const fail = (e: unknown, scope: NonNullable<DnsView['err']>['scope'], rid?: string, f?: DnsForm) => {
      const msg = e instanceof InputError || e instanceof DnsError ? e.message
        : e instanceof PanelError ? (e.status === 504 || e.status === 408 ? t('The DNS server took too long to answer. Please try again in a moment.')
          : e.status >= 500 && e.status !== 501 ? t('We could not reach the DNS server right now. Please try again.')
          : t('The DNS server refused the change: {m}', { m: scrubMessage(e.message) || t('check the values and try again') }))
        : t('That change could not be saved. Please try again.');
      if (!(e instanceof InputError)) console.error('[portal-dns]', op, zone, e instanceof Error ? e.message : e);
      return again(msg, scope, e instanceof InputError ? 422 : 502, rid, f);
    };

    /* turn on: create the zone on the DNS-only account */
    if (op === 'enable') {
      if (plan.kind === 'hosting' || plan.kind === 'dnsonly') return go(req, `${back}#dns`);
      if (plan.kind !== 'off' || !plan.canCreate) return again(t('DNS management cannot be turned on for this domain here. Please contact support.'), 'zone', 409);
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
        else return again(t('We cannot switch this domain to GlobalHostia DNS automatically. Please contact support.'), 'zone', 409);
      } catch (e) { return fail(e, 'zone'); }
      try { await api.domainUpdateNameservers(id, target); }
      catch { return again(t('The registry did not accept the nameserver change. Your DNS zone is ready; please try again in a moment.'), 'zone', 502); }
      await auditClient('client_ns_update', sess.email, ip, { domainId: id, ns: target, via: 'dns_editor' });
      return go(req, `${back}?ok=dns_ns#dns`);
    }

    if (plan.kind !== 'hosting' && plan.kind !== 'dnsonly') return again(t('DNS for this domain is not managed here yet.'), 'zone', 409);
    const p = zoneProvider(plan, zone);
    if (!p.dns) return again(t('DNS editing is not available on this server.'), 'zone', 409);
    const via = { via: plan.kind, server: plan.server.id, user: plan.username };
    const num = (x?: string) => (x === undefined || x === '' ? undefined : x);
    const input = (f: DnsForm) => ({ type: f.type, name: f.name, value: f.value, ttl: num(f.ttl), priority: num(f.priority), weight: num(f.weight), port: num(f.port) });

    if (op === 'add') {
      let r;
      try { r = dnsRecord(input(form), zone); } catch (e) { return fail(e, 'add', undefined, form); }
      try { await p.dns.add(zone, r); } catch (e) { await audit('add.failed', { record: r, ...via }); return fail(e, 'add', undefined, form); }
      await audit('add', { record: r, ...via });
      return go(req, `${back}?ok=dns_added&hl=${encodeURIComponent(`${r.type}:${r.name}`)}#dns`);
    }
    if (op === 'edit' || op === 'delete') {
      const rid = str('id', 2000);
      let old;
      try { old = (await p.dns.list(zone)).find((x) => x.id === rid); } catch (e) { return fail(e, 'zone'); }
      if (!old) return again(t('That record no longer exists. The list below is up to date.'), 'zone', 409);
      if (old.readonly) return again(t('Nameserver records are managed by GlobalHostia and cannot be changed here.'), 'zone', 403);
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
      return go(req, `${back}?ok=dns_updated&hl=${encodeURIComponent(`${r.type}:${r.name}`)}#dns`);
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
    return again(t('Unknown action.'), 'zone', 400);
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
    const crumbs = [{ label: t('Domains'), href: '/account/domains' }, { label: d.domainname }];
    const again = async (errs: Record<string, string>, status: number) =>
      html(await F({ title: d.domainname, active: 'domains', crumbs, body: domainDetailView({ csrf: v.csrf, d, cur: sess.cur, ns: [], nsInput: raw, errs }) }), status);
    if (!/active/i.test(d.status)) return again({ form: t('Nameservers can be changed once the domain is active.') }, 409);
    const val = validateNameservers(raw);
    if (!val.ok) return again(val.errs, 422);
    try { await api.domainUpdateNameservers(id, val.ns); }
    catch { return again({ form: t('The registry did not accept these nameservers. Check that each one exists and is spelled correctly, then try again.') }, 502); }
    await auditClient('client_ns_update', sess.email, ip, { domainId: id, ns: val.ns });
    return go(req, `/account/domains/${id}?ok=ns_saved`);
  }

  /* ---- new ticket ---- */
  if (segs[0] === 'support' && segs[1] === 'new' && segs.length === 2) {
    const form: TicketForm = { deptid: str('deptid', 12), subject: str('subject', 300).trim(), message: str('message').trim(), priority: str('priority', 10), service: str('service', 12) };
    const errs: Record<string, string> = {};
    let depts: { id: number; name: string }[] = [];
    try { depts = await api.getSupportDepartments(); } catch { errs.form = t('We could not open your ticket right now. Your message is kept below; try again in a moment.'); }
    if (!depts.some((d) => String(d.id) === form.deptid)) errs.deptid = t('Choose a department.');
    if ((form.subject || '').length < 3) errs.subject = t('Add a short subject (at least 3 characters).');
    else if (form.subject!.length > 150) errs.subject = t('Keep the subject under 150 characters.');
    if ((form.message || '').length < 10) errs.message = t('Describe the issue in a few words (at least 10 characters).');
    const priority = ['Low', 'Medium', 'High'].includes(form.priority || '') ? form.priority! : 'Medium';
    let serviceid: number | undefined;
    if (form.service) {
      const sid = idOf(form.service);
      if (!sid || !(await api.getService(cid, sid).catch(() => null))) errs.service = t('Choose one of your services.'); else serviceid = sid;
    }
    if (Object.keys(errs).length) return renderNewTicket(req, F, v, cid, form, errs, 422);
    try {
      const t = await api.openTicket(cid, { deptid: Number(form.deptid), subject: form.subject!, message: form.message!, priority, serviceid });
      await auditClient('client_ticket_open', sess.email, ip, { ticketId: t.id });
      return go(req, t.id ? `/account/support/${t.id}?ok=ticket_opened` : '/account/support?ok=ticket_opened');
    } catch {
      return renderNewTicket(req, F, v, cid, form, { form: t('We could not open your ticket right now. Your message is kept below; try again in a moment.') }, 502);
    }
  }

  /* ---- ticket reply ---- */
  if (segs[0] === 'support' && segs.length === 2) {
    const id = idOf(segs[1]);
    const tk = id ? await api.getTicket(cid, id).catch(() => null) : null;
    if (!id || !tk) return go(req, '/account/support');
    const message = str('message').trim();
    const crumbs = [{ label: t('Support'), href: '/account/support' }, { label: `#${tk.tid}` }];
    const again = async (errs: Record<string, string>, status: number) =>
      html(await F({ title: tk.subject || t('Ticket'), sub: esc(t('Ticket #{n}', { n: tk.tid })), active: 'support', crumbs, body: ticketView({ csrf: v.csrf, t: tk, viewerName: v.name, reply: message, errs }) }), status);
    if (message.length < 2) return again({ message: t('Write a reply before sending.') }, 422);
    try { await api.addTicketReply(cid, id, message); }
    catch { return again({ form: t('Your reply could not be sent right now. It is kept below; try again in a moment.') }, 502); }
    await auditClient('client_ticket_reply', sess.email, ip, { ticketId: id });
    return go(req, `/account/support/${id}?ok=reply_sent#ac-rp-h`);
  }

  /* ---- profile ---- */
  if (segs[0] === 'profile' && segs.length === 1) {
    const val = validateProfile(Object.fromEntries(['firstname', 'lastname', 'companyname', 'phonenumber', 'address1', 'city', 'state', 'postcode', 'country'].map((k) => [k, str(k, 200)])));
    let cl: any;
    try { cl = await api.getClientsDetails(cid); } catch { cl = { email: sess.email }; }
    const again = async (errs: Record<string, string>, status: number) =>
      html(await F({ title: t('Profile'), sub: esc(t('Your contact details and sign-in settings.')), active: 'profile', body: profileView({ csrf: v.csrf, c: cl, v: val.v, errs }) }), status);
    if (!val.ok) return again(val.errs, 422);
    try { await api.updateClient(cid, val.v); }
    catch { return again({ form: t('Your changes could not be saved right now. Please try again in a moment.') }, 502); }
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
