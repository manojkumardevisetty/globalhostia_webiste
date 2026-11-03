// Next renewals (services + domains due within 60 days, unpaid total, renew/pay hand-offs) and hosting usage meters.
// Payment always happens in the secure client area: we only hand off via single sign-on (invoice, mass pay,
// domain renewal cart). Nothing here renews or charges anything directly.
import { card, cycleLabel, daysUntil, errorBox, esc, fmtDate, icon, isServer, money, productIcon, ssoButton, validDate, t } from './kit';
import { tn } from '../i18n';

type R<T> = { ok: true; v: T } | { ok: false };
export const RENEW_WINDOW = 60;

/** Days-left badge: red under 7 days (and overdue), amber under 30, neutral otherwise. Text carries the meaning, not colour. */
export function daysBadge(n: number | null) {
  if (n === null) return '';
  const tone = n < 7 ? 'bad' : n < 30 ? 'warn' : 'muted';
  const label = n < 0 ? tn(-n, '{n} day overdue', '{n} days overdue') : n === 0 ? t('Due today') : tn(n, '{n} day left', '{n} days left');
  return `<span class="ac-days ac-days--${tone}">${esc(label)}</span>`;
}

const RENEWABLE_DOMAIN = /^(active|grace|redemption|expired)$/i;
const autoRenewOff = (d: any) => d.donotrenew === true || d.donotrenew === 1 || d.donotrenew === '1';
const noRecurring = (c: unknown) => /free|one ?time/i.test(String(c || ''));

export type RenewItem = {
  kind: 'service' | 'domain'; id: number; name: string; sub: string; date: string; days: number;
  amount: string; cycle: string; invoiceId?: number; note?: string;
};

export function renewalItems(products: any[], domains: any[], inv?: { services: Map<number, number>; domains: Map<number, number> }) {
  const items: RenewItem[] = [];
  for (const p of products) {
    if (!/^(active|suspended)$/i.test(String(p.status || '')) || noRecurring(p.billingcycle)) continue;
    const n = daysUntil(p.nextduedate);
    if (n === null || n > RENEW_WINDOW) continue;
    items.push({
      kind: 'service', id: Number(p.id), name: p.translated_name || p.name || t('Service'), sub: p.domain || p.translated_groupname || p.groupname || '',
      date: p.nextduedate, days: n, amount: p.recurringamount, cycle: cycleLabel(p.billingcycle), invoiceId: inv?.services.get(Number(p.id)),
    });
  }
  for (const d of domains) {
    if (!RENEWABLE_DOMAIN.test(String(d.status || ''))) continue;
    const date = validDate(d.expirydate) ? d.expirydate : d.nextduedate;
    const n = daysUntil(date);
    if (n === null || n > RENEW_WINDOW) continue;
    const yrs = Number(d.regperiod) || 1;
    items.push({
      kind: 'domain', id: Number(d.id), name: d.domainname, sub: t('Domain'), date, days: n, amount: d.recurringamount,
      cycle: tn(yrs, '{n} year', '{n} years'), invoiceId: inv?.domains.get(Number(d.id)), note: autoRenewOff(d) ? t('Auto-renew off') : '',
    });
  }
  return items.sort((a, b) => a.days - b.days);
}

function renewRow(it: RenewItem, csrf: string, cur: string) {
  const href = it.kind === 'service' ? `/account/services/${it.id}` : `/account/domains/${it.id}`;
  const amt = parseFloat(it.amount) > 0 ? `<b class="num">${esc(money(it.amount, cur))}</b><small>${esc(it.cycle)}</small>` : `<small class="ac-muted">${esc(t('No charge'))}</small>`;
  const act = it.invoiceId
    ? ssoButton(csrf, 'invoice', it.invoiceId, t('Pay invoice'), { variant: 'brand', sm: true })
    : it.kind === 'domain'
      ? ssoButton(csrf, 'domain_renew', it.id, t('Renew'), { sm: true })
      : `<span class="ac-rn__wait">${esc(t('Invoice issued before the due date'))}</span>`;
  return `<li class="ac-rn">
    <span class="ac-rn__ic" aria-hidden="true">${icon(it.kind === 'domain' ? 'globe' : 'server')}</span>
    <div class="ac-rn__main"><a href="${esc(href)}" class="${it.kind === 'domain' ? 'ac-mono' : ''}">${esc(it.name)}</a>
      <small>${it.sub && it.kind === 'service' ? `<span class="ac-mono">${esc(it.sub)}</span> · ` : ''}${esc(it.days < 0 ? t('Was due {d}', { d: fmtDate(it.date) }) : it.kind === 'domain' ? t('Expires {d}', { d: fmtDate(it.date) }) : t('Renews {d}', { d: fmtDate(it.date) }))}${it.note ? ` · ${esc(it.note)}` : ''}${it.invoiceId ? ` · ${esc(t('Invoice #{n} unpaid', { n: it.invoiceId }))}` : ''}</small></div>
    <div class="ac-rn__days">${daysBadge(it.days)}</div>
    <div class="ac-rn__amt">${amt}</div>
    <div class="ac-rn__act">${act}</div>
  </li>`;
}

/** Dashboard card: upcoming renewals + unpaid total with Pay now / Pay all due / Renew all. */
export function renewalsCard(o: {
  csrf: string; cur: string; products: R<any[]>; domains: R<any[]>; unpaid: R<any[]>;
  inv?: { services: Map<number, number>; domains: Map<number, number> }; i?: number;
}) {
  const opts = { id: 'ac-rn-h', i: o.i ?? 0, flush: true, cls: 'ac-card--rn' };
  if (!o.products.ok && !o.domains.ok) return card(t('Next renewals'), errorBox(t('your renewals'), '/account'), opts);

  const items = renewalItems(o.products.ok ? o.products.v : [], o.domains.ok ? o.domains.v : [], o.inv);
  const partial = !o.products.ok || !o.domains.ok
    ? `<div class="ac-alert ac-alert--warn ac-rn__partial" role="status">${icon('alert')}<span>${esc(!o.products.ok ? t("We couldn't load your services right now, so they are not listed here.") : t("We couldn't load your domains right now, so they are not listed here."))} <a href="/account">${esc(t('Try again'))}</a></span></div>` : '';

  // unpaid invoices strip
  let pay = '';
  if (!o.unpaid.ok) {
    pay = `<div class="ac-alert ac-alert--warn ac-rn__partial" role="status">${icon('alert')}<span>${esc(t("We couldn't check for unpaid invoices."))} <a href="/account/invoices?status=Unpaid">${esc(t('Open billing'))}</a></span></div>`;
  } else if (o.unpaid.v.length) {
    const list = o.unpaid.v;
    const total = list.reduce((s, i) => s + (parseFloat(i.balance ?? i.total) || 0), 0);
    const overdue = list.some((i) => { const d = daysUntil(i.duedate); return d !== null && d < 0; });
    const payBtn = list.length === 1
      ? ssoButton(o.csrf, 'invoice', list[0].id, t('Pay now'), { variant: 'brand', ic: 'card' })
      : ssoButton(o.csrf, 'masspay', undefined, t('Pay all due'), { variant: 'brand', ic: 'card' });
    pay = `<div class="ac-rn__due${overdue ? ' is-overdue' : ''}">
      <div><small class="ac-k">${esc(t('Unpaid invoices'))}</small><b class="num">${esc(money(total, list[0]?.currencycode || o.cur))}</b>
      <small>${esc(tn(list.length, '{n} invoice', '{n} invoices'))}${overdue ? ` · <span class="is-bad">${esc(t('overdue'))}</span>` : ''}</small></div>
      ${payBtn}
    </div>`;
  }

  const body = items.length
    ? `<ul class="ac-rnlist">${items.slice(0, 8).map((it) => renewRow(it, o.csrf, o.cur)).join('')}</ul>${items.length > 8 ? `<p class="ac-rn__more ac-muted">${esc(t('{n} more renew in the next {d} days.', { n: items.length - 8, d: RENEW_WINDOW }))}</p>` : ''}`
    : `<p class="ac-ok-line ac-rn__none">${icon('check')}${esc(t('Nothing renews in the next {d} days.', { d: RENEW_WINDOW }))}</p>`;

  // One-click "Renew all": every expiring domain without an open invoice goes to the renewals cart in one hand-off.
  // Services cannot be renewed early; their renewal invoices are paid with "Pay all due" above.
  const domainsToRenew = items.filter((x) => x.kind === 'domain' && !x.invoiceId).length;
  const foot = domainsToRenew > 1
    ? `<div class="ac-rn__foot">${ssoButton(o.csrf, 'domain_renewals', undefined, t('Renew all domains ({n})', { n: domainsToRenew }), { variant: 'dark', ic: 'refresh', sm: true })}<span class="ac-muted">${esc(t('You review the cart and pay in the secure checkout.'))}</span></div>`
    : '';

  const totalAmt = items.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const sum = items.length && totalAmt > 0 ? `<span class="ac-rn__sum"><small>${esc(t('Next {d} days', { d: RENEW_WINDOW }))}</small> <b class="num">${esc(money(totalAmt, o.cur))}</b></span>` : '';
  const action = `<span class="ac-rn__hd">${sum}<a class="ac-more" href="/account/renewals">${esc(t('View all'))}${icon('right')}</a></span>`;
  return card(t('Next renewals'), `${pay}${partial}${body}${foot}`, { ...opts, action });
}

/* ------------------------------------------------------------------ usage */

type Meter = { used: number; limit: number | null } | null; // limit null = unlimited; meter null = not reported
const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };
const unlimited = (v: unknown) => /unlimited/i.test(String(v ?? '')) || num(v) === 0 || (num(v) ?? 0) < 0;

/** Shared/reseller/WordPress/email hosting with cPanel-style usage figures. VPS, dedicated and SSL are excluded. */
export const isHostingService = (p: any) => !isServer(p) && ['layers', 'wp', 'users', 'mail'].includes(productIcon(p)) && !/ssl/i.test(String(p.module || ''));

export function usageOf(p: any): { disk: Meter; bw: Meter; updated: string } {
  const m = (u: unknown, l: unknown): Meter => {
    const used = num(u);
    if (used === null && (l === undefined || l === null || l === '')) return null;
    return { used: Math.max(0, used ?? 0), limit: unlimited(l) ? null : num(l) };
  };
  let disk = m(p.diskusage, p.disklimit), bw = m(p.bwusage, p.bwlimit);
  // WHMCS reports zeros everywhere until the first usage sync from the server: treat that as "not reported"
  if (!validDate(p.lastupdate) && (!disk || (disk.used === 0 && disk.limit === null)) && (!bw || (bw.used === 0 && bw.limit === null))) { disk = null; bw = null; }
  return { disk, bw, updated: validDate(p.lastupdate) ? p.lastupdate : '' };
}

export const pctOf = (m: Meter) => (m && m.limit ? Math.round((m.used / m.limit) * 100) : null);
const fmtMB = (mb: number) => (mb >= 1024 * 1024 ? `${+(mb / 1048576).toFixed(1)} TB` : mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

function meter(label: string, m: Meter) {
  if (!m) return `<div class="ac-meter ac-meter--na"><div class="ac-meter__top"><span>${esc(label)}</span><b>${esc(t('Not reported'))}</b></div></div>`;
  if (m.limit === null) {
    return `<div class="ac-meter ac-meter--unl"><div class="ac-meter__top"><span>${esc(label)}</span><b class="num">${esc(fmtMB(m.used))} <small>${esc(t('used · Unlimited'))}</small></b></div>
      <div class="ac-meter__bar" aria-hidden="true"><i></i></div></div>`;
  }
  const pct = pctOf(m)!;
  const tone = pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'ok';
  const word = pct >= 100 ? t('Limit reached') : pct >= 90 ? t('Almost full') : pct >= 70 ? t('Getting full') : t('Healthy');
  const text = t('{u} of {l} used ({p}%)', { u: fmtMB(m.used), l: fmtMB(m.limit), p: pct });
  return `<div class="ac-meter ac-meter--${tone}">
    <div class="ac-meter__top"><span>${esc(label)}</span><b class="num">${esc(fmtMB(m.used))} <small>${esc(t('of {l}', { l: fmtMB(m.limit) }))}</small></b></div>
    <div class="ac-meter__bar" role="meter" aria-label="${esc(t('{x} used', { x: label }))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pct, 100)}" aria-valuetext="${esc(text)}"><i style="width:${Math.min(pct, 100)}%"></i></div>
    <small class="ac-meter__st">${pct}% · ${word}</small>
  </div>`;
}

/** Disk + bandwidth meters for one service, with an Upgrade hand-off at 80%+. */
export function usageBlock(p: any, csrf: string, o: { title?: boolean } = {}) {
  const u = usageOf(p);
  const hi = Math.max(pctOf(u.disk) ?? 0, pctOf(u.bw) ?? 0);
  const canUpgrade = hi >= 80 && /active/i.test(String(p.status || ''));
  const head = o.title ? `<div class="ac-usage__head"><a href="/account/services/${esc(p.id)}">${esc(p.translated_name || p.name || t('Hosting'))}</a>${p.domain ? `<small class="ac-mono">${esc(p.domain)}</small>` : ''}</div>` : '';
  if (!u.disk && !u.bw) {
    return `<div class="ac-usage">${head}<p class="ac-usage__na">${icon('info')}${esc(t('Usage figures appear after the first daily sync from the server.'))}</p></div>`;
  }
  return `<div class="ac-usage">${head}
    <div class="ac-usage__m">${meter(t('Disk space'), u.disk)}${meter(t('Bandwidth'), u.bw)}</div>
    ${canUpgrade ? `<div class="ac-usage__up"><p>${icon('trend')}<span>${esc(hi >= 100 ? t('You have reached a plan limit.') : t('You are using {p}% of a plan limit.', { p: hi }))} ${esc(t('Upgrade to keep your site fast and online.'))}</span></p>${ssoButton(csrf, 'upgrade', p.id, t('Upgrade'), { variant: 'brand', sm: true })}</div>` : ''}
    ${u.updated ? `<small class="ac-usage__t">${esc(t('Updated {d}', { d: fmtDate(u.updated) }))}</small>` : ''}
  </div>`;
}

/** Dashboard card: usage for each active hosting service (hidden if the account has none). */
export function usageCard(o: { csrf: string; products: R<any[]>; i?: number }) {
  if (!o.products.ok) return '';
  const list = o.products.v.filter((p) => isHostingService(p) && /^(active|suspended)$/i.test(String(p.status || '')));
  if (!list.length) return '';
  const order = (p: any) => { const u = usageOf(p); return -Math.max(pctOf(u.disk) ?? -1, pctOf(u.bw) ?? -1); };
  const shown = [...list].sort((a, b) => order(a) - order(b)).slice(0, 4);
  return card(t('Hosting usage'), `<div class="ac-usage-list">${shown.map((p) => usageBlock(p, o.csrf, { title: true })).join('')}</div>`,
    { id: 'ac-use-h', i: o.i ?? 0, action: list.length > shown.length ? `<a class="ac-more" href="/account/services">${esc(t('All {n}', { n: list.length }))}${icon('right')}</a>` : '' });
}

/** Service detail card. Only for hosting services; servers have their own status card. */
export function usageDetailCard(p: any, csrf: string) {
  if (!isHostingService(p)) return '';
  return card(t('Usage'), usageBlock(p, csrf), { id: 'ac-usage-h' });
}

/** Domains page head action + empty helper. */
export const renewAllDomainsButton = (csrf: string, n: number) =>
  n ? ssoButton(csrf, 'domain_renewals', undefined, t('Renew all expiring ({n})', { n }), { variant: 'brand', ic: 'refresh', sm: true }) : '';

