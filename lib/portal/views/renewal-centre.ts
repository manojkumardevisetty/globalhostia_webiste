// Renewal centre (/account/renewals): every service and domain that renews, as a timeline grouped into
// Overdue / Next 30 days / 31–90 days / Later, with per-group totals, checkboxes and a sticky selection bar.
// Paying and renewing always happen in the secure client area via single sign-on (mass pay, domain renewal
// cart, service renewal page, invoice). The only change made here is the per-domain auto-renew switch.
import { buildRenewals, defaultSelected, groupRenewals, selectionTotals, type Group, type RenewalRow, type TldRenewPrices } from '../renewal-plan';
import { card, empty, errorBox, esc, fmtDate, icon, money, pill, ssoButton, btn, t } from './kit';
import { tn } from '../i18n';
import type { RenewalInvoices } from '../api';

type R<T> = { ok: true; v: T } | { ok: false };

const cycleT = (c: string) => { const m = /^(\d+) years?$/.exec(c); return m ? tn(Number(m[1]), '{n} year', '{n} years') : t(c); };
const TONE: Record<string, string> = { overdue: 'bad', soon: 'warn', next: 'muted', later: 'muted' };
const GROUP_LABEL = (k: Group['key']) => ({ overdue: t('Overdue'), soon: t('Next 30 days'), next: t('31–90 days'), later: t('Later') })[k];

/** "in 12 days", "Today", "Tomorrow", "141 days overdue" (domains: "Expired 3 days ago"), localized. */
export function relDaysT(days: number, kind: 'service' | 'domain' = 'service') {
  if (days === 0) return kind === 'domain' ? t('Expires today') : t('Due today');
  if (days === 1) return t('Tomorrow');
  if (days > 0) return tn(days, 'in {n} day', 'in {n} days');
  return kind === 'domain' ? tn(-days, 'Expired {n} day ago', 'Expired {n} days ago') : tn(-days, '{n} day overdue', '{n} days overdue');
}

function amountHtml(r: RenewalRow, cur: string) {
  if (r.amount === null) return `<span class="ac-muted">${esc(t('Price on renewal'))}</span>`;
  if (r.amount === 0) return `<span class="ac-muted">${esc(t('No charge'))}</span>`;
  return `<b class="num">${esc(money(r.amount, cur))}</b>${r.priceFrom === 'tld' ? `<small class="ac-muted">${esc(t('Current price'))}</small>` : ''}`;
}

function actionHtml(r: RenewalRow, csrf: string) {
  if (r.invoiceId) return ssoButton(csrf, 'invoice', r.invoiceId, t('Pay'), { variant: 'brand', sm: true, ic: 'card' });
  if (r.kind === 'domain') return ssoButton(csrf, 'domain_renew', r.id, t('Renew'), { sm: true, ic: 'refresh' });
  if (/^active$/i.test(r.status)) return ssoButton(csrf, 'service_renew', r.id, r.days < 0 ? t('Renew & pay') : t('Renew early'), { variant: r.days < 0 ? 'brand' : undefined, sm: true, ic: 'refresh' });
  return btn(t('Get help'), `/account/support/new?service=${r.id}`, { sm: true });
}

function autoRenewHtml(r: RenewalRow, csrf: string) {
  if (r.kind !== 'domain') return '';
  const on = !!r.autoRenew;
  return `<form method="post" action="/account/renewals" class="ac-inline ac-rwr__ar">
    <input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="op" value="autorenew"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="on" value="${on ? '0' : '1'}">
    <button type="submit" class="ac-switch${on ? ' is-on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(on ? t('Auto-renew for {d} is on. Turn off', { d: r.name }) : t('Auto-renew for {d} is off. Turn on', { d: r.name }))}" title="${esc(on ? t('Turn auto-renew off') : t('Turn auto-renew on'))}"><i aria-hidden="true"></i><span>${esc(on ? t('Auto-renew on') : t('Auto-renew off'))}</span></button>
  </form>`;
}

function rowHtml(r: RenewalRow, g: Group['key'], csrf: string, cur: string) {
  const href = r.kind === 'service' ? `/account/services/${r.id}` : `/account/domains/${r.id}`;
  const sel = defaultSelected(r);
  const inv = r.invoiceId ? `<span class="ac-rwr__inv">${icon('card')}${esc(t('Invoice #{n} unpaid', { n: r.invoiceId }))}</span>` : '';
  const st = /^active$/i.test(r.status) ? '' : pill(r.status);
  return `<li class="ac-rwr" id="rw-${esc(r.key.replace(':', '-'))}" data-k="${r.kind === 'domain' ? 'd' : 's'}" data-amt="${r.amount ?? ''}"${r.invoiceId ? ' data-inv="1"' : ''}>
    <label class="ac-rwr__cb"><input type="checkbox" name="sel" value="${esc(r.key)}" form="ac-rw-form"${sel ? ' checked' : ''} aria-label="${esc(t('Select {x}', { x: r.name }))}"></label>
    <span class="ac-rn__ic" aria-hidden="true">${icon(r.kind === 'domain' ? 'globe' : 'server')}</span>
    <div class="ac-rwr__main"><a href="${esc(href)}" class="${r.kind === 'domain' ? 'ac-mono' : ''}">${esc(r.name)}</a>
      <small>${r.kind === 'service' && r.product ? `<span class="ac-mono">${esc(r.product)}</span>` : esc(t(r.product))}${st ? ` ${st}` : ''}</small></div>
    <div class="ac-rwr__date"><b class="num">${esc(fmtDate(r.date))}</b><small class="ac-rwr__rel ac-rwr__rel--${TONE[g]}">${esc(relDaysT(r.days, r.kind))}</small></div>
    <div class="ac-rwr__amt">${amountHtml(r, cur)}<small>${esc(cycleT(r.cycle))}</small></div>
    <div class="ac-rwr__st">${inv}${autoRenewHtml(r, csrf)}</div>
    <div class="ac-rwr__act">${actionHtml(r, csrf)}</div>
  </li>`;
}

function groupHtml(g: Group, csrf: string, cur: string, i: number) {
  const tt = g.totals;
  const sum = `<span class="ac-rwg__sum"><small>${esc(tn(tt.count, '{n} item', '{n} items'))}</small><b class="num">${esc(money(tt.amount, cur))}</b>${tt.unpriced ? `<small>${esc(t('+ {n} priced at renewal', { n: tt.unpriced }))}</small>` : ''}</span>`;
  const all = `<input type="checkbox" class="ac-rwg__all" data-rw-all aria-label="${esc(t('Select all: {x}', { x: GROUP_LABEL(g.key) }))}" hidden>`;
  // a collapsible group keeps its select-all outside <summary>: a control inside a summary is a nested interactive (WCAG 4.1.2)
  const head = (box: boolean) => `<span class="ac-rwg__t">${box ? all : ''}<h2 class="hp-col-h" id="rw-${g.key}-h">${esc(GROUP_LABEL(g.key))}</h2></span>${sum}`;
  // overdue services with no invoice yet: one prominent renew-and-pay hand-off (the service renewal checkout)
  const due = g.key === 'overdue' ? g.rows.filter((r) => r.kind === 'service' && !r.invoiceId && /^active$/i.test(r.status)) : [];
  const dueAmt = due.reduce((x, r) => x + (r.amount || 0), 0);
  const cta = due.length ? `<div class="ac-rwg__cta"><p>${icon('alert')}<span><b>${esc(tn(due.length, '{n} service is overdue', '{n} services are overdue'))}</b> ${esc(t('with no invoice yet'))}${dueAmt ? ` (${esc(money(dueAmt, cur))})` : ''}. ${esc(t('Renew now to avoid suspension.'))}</span></p>${
    due.length === 1 ? ssoButton(csrf, 'service_renew', due[0].id, t('Renew & pay now'), { variant: 'brand', ic: 'card' })
    : `<form method="post" action="/account/sso" class="ac-inline"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="to" value="service_renewals">${due.map((r) => `<input type="hidden" name="sel" value="${esc(r.key)}">`).join('')}<button type="submit" class="hp-btn hp-btn--brand">${icon('card')}${esc(t('Renew & pay now'))}</button></form>`}</div>` : '';
  const list = `${cta}<ul class="ac-rwlist">${g.rows.map((r) => rowHtml(r, g.key, csrf, cur)).join('')}</ul>`;
  const cls = `ac-card ac-rwg ac-rwg--${g.key}`;
  if (g.key === 'later') {
    return `<details class="${cls}" id="rw-${g.key}" data-reveal style="--i:${i}"><summary class="ac-card__head">${head(false)}${icon('chev')}</summary><label class="ac-rwg__allrow">${all}<span>${esc(t('Select all'))}</span></label>${list}</details>`;
  }
  return `<section class="${cls}" id="rw-${g.key}" aria-labelledby="rw-${g.key}-h" data-reveal style="--i:${i}"><header class="ac-card__head">${head(true)}</header>${list}</section>`;
}

export function renewalCentreView(o: {
  csrf: string; cur: string; products: R<any[]>; domains: R<any[]>; unpaid: R<any[]>; inv?: RenewalInvoices; tld?: TldRenewPrices; now?: number;
}) {
  const cur = o.cur;
  const failedBoth = !o.products.ok && !o.domains.ok;
  if (failedBoth) return { statsHtml: '', headAction: '', body: card(t('Renewals'), errorBox(t('your renewals'), '/account/renewals'), { id: 'ac-rw-h' }) };

  const rows = buildRenewals(o.products.ok ? o.products.v : [], o.domains.ok ? o.domains.v : [], { inv: o.inv, tld: o.tld, now: o.now });
  const groups = groupRenewals(rows);
  const by = Object.fromEntries(groups.map((g) => [g.key, g])) as Record<Group['key'], Group>;
  const unpaid = o.unpaid.ok ? o.unpaid.v : [];
  const unpaidTotal = unpaid.reduce((s, i) => s + (parseFloat(i.balance ?? i.total) || 0), 0);
  const unpaidCur = unpaid[0]?.currencycode || cur;

  // hero key numbers (same component as the dashboard)
  const stat = (href: string, label: string, ic: string, val: string, sub: string, alert = false) =>
    `<a class="hp-stat${alert ? ' is-alert' : ''}" href="${href}"><span class="ac-stats__l">${icon(ic)}${esc(label)}</span><b class="num">${esc(val)}</b><span>${esc(sub)}</span></a>`;
  const n = (g: Group) => tn(g.totals.count, '{n} item', '{n} items');
  const statsHtml = `<div class="hp-stats hp-stats--4 ac-stats">
    ${stat('#rw-overdue', t('Overdue'), 'alert', money(by.overdue.totals.amount, cur), n(by.overdue), by.overdue.totals.count > 0)}
    ${stat('#rw-soon', t('Next 30 days'), 'clock', money(by.soon.totals.amount, cur), n(by.soon))}
    ${stat('#rw-next', t('31–90 days'), 'refresh', money(by.next.totals.amount, cur), n(by.next))}
    ${stat('/account/invoices?status=Unpaid', t('Unpaid invoices'), 'card', o.unpaid.ok ? money(unpaidTotal, unpaidCur) : '—', o.unpaid.ok ? tn(unpaid.length, '{n} invoice', '{n} invoices') : t('Could not check'), unpaid.length > 0)}
  </div>`;

  // the one "pay everything" button lives in the page header (frame headAction); the band below only explains it
  const payAll = unpaid.length ? ssoButton(o.csrf, 'masspay', undefined, t('Pay all unpaid invoices'), { variant: 'brand', ic: 'card' }) : '';

  const alerts: string[] = [];
  if (!o.products.ok || !o.domains.ok) alerts.push(`<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>${esc(!o.products.ok ? t("We couldn't load your services right now, so they are not listed here.") : t("We couldn't load your domains right now, so they are not listed here."))} <a href="/account/renewals">${esc(t('Try again'))}</a></span></div>`);
  if (!o.unpaid.ok) alerts.push(`<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>${esc(t("We couldn't check for unpaid invoices, so open invoices may not be shown."))} <a href="/account/invoices?status=Unpaid">${esc(t('Open billing'))}</a></span></div>`);
  if (unpaid.length) {
    alerts.push(`<div class="ac-rn__due ac-rw__due${unpaid.some((i) => /\d/.test(String(i.duedate)) && Date.parse(String(i.duedate).slice(0, 10)) < Date.now() - 86400000) ? ' is-overdue' : ''}">
      <div><small class="ac-k">${esc(t('Unpaid invoices'))}</small><b class="num">${esc(money(unpaidTotal, unpaidCur))}</b><small>${esc(tn(unpaid.length, '{n} invoice', '{n} invoices'))} · ${esc(t('paid together in one secure checkout'))}</small></div></div>`);
  }

  const shown = groups.filter((g) => g.rows.length);
  const near = by.overdue.rows.length + by.soon.rows.length + by.next.rows.length;
  const emptyNear = near ? '' : `<section class="ac-card" data-reveal>${empty(t('Nothing to renew in the next 90 days'), rows.length ? t('Your next renewals are further out. You can see them under Later below.') : t('Services and domains you order appear here with their renewal dates and amounts.'), rows.length ? '' : btn(t('Find a domain'), '/domains-registration', { variant: 'brand', ic: 'search' }), 'check')}</section>`;

  // selection bar: server renders the default selection; account.js keeps it in sync with the checkboxes
  const selected = rows.filter(defaultSelected);
  const st = selectionTotals(rows, selected.map((r) => r.key));
  const selDomains = selected.filter((r) => r.kind === 'domain' && !r.invoiceId).length;
  const selServices = selected.filter((r) => r.kind === 'service' && !r.invoiceId && /^active$/i.test(r.status)).length;
  const bar = rows.length ? `<div class="ac-rwbar" role="region" aria-label="${esc(t('Selected renewals'))}" data-rw-bar>
    <form id="ac-rw-form" method="post" action="/account/sso" class="ac-rwbar__f"><input type="hidden" name="csrf" value="${esc(o.csrf)}"></form>
    <p class="ac-rwbar__sum" aria-live="polite">${esc(t('Selected:'))} <b class="num" data-rw-n>${st.count}</b> <span data-rw-items data-one="${esc(t('item'))}" data-many="${esc(t('items'))}">${esc(st.count === 1 ? t('item') : t('items'))}</span> · <b class="num" data-rw-sum data-cur="${esc(cur)}">${esc(money(st.amount, cur))}</b><small data-rw-unpriced${st.unpriced ? '' : ' hidden'}>+ <span>${st.unpriced}</span> ${esc(t('priced at renewal'))}</small></p>
    <div class="ac-rwbar__a">
      <button type="submit" form="ac-rw-form" name="to" value="domain_renew_selected" class="hp-btn hp-btn--dark ac-sm" data-rw-dom${selDomains ? '' : ' disabled'}>${icon('globe')}<span>${esc(t('Renew'))} <i class="ac-rwbar__lg">${esc(t('selected'))} </i>${esc(t('domains'))} (<b data-n>${selDomains}</b>)</span></button>
      <button type="submit" form="ac-rw-form" name="to" value="service_renewals" class="hp-btn hp-btn--ghost ac-sm" data-rw-svc${selServices ? '' : ' disabled'}>${icon('server')}<span>${esc(t('Renew services'))}<i class="ac-rwbar__lg"> ${esc(t('early'))}</i> (<b data-n>${selServices}</b>)</span></button>
      ${unpaid.length ? `<button type="submit" form="ac-rw-form" name="to" value="masspay" class="hp-btn hp-btn--brand ac-sm">${icon('card')}${esc(t('Pay all unpaid'))}</button>` : ''}
    </div>
    <p class="ac-rwbar__note">${esc(selDomains > 1 || !selDomains ? t('Several domains open the renewal cart, which lists every renewable domain: keep the ones you selected and check out.') : t('You review the renewal and pay in the secure checkout.'))} ${esc(t('Early service renewal is offered for eligible plans only.'))}</p>
  </div>` : '';

  const body = `<div class="ac-rw" data-rw>${alerts.join('')}${emptyNear}${shown.map((g, i) => groupHtml(g, o.csrf, cur, i)).join('')}${bar}</div>`;
  return { statsHtml, headAction: payAll, body };
}
