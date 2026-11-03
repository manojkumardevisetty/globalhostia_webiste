// Renewal centre (/account/renewals): every service and domain that renews, as a timeline grouped into
// Overdue / Next 30 days / 31–90 days / Later, with per-group totals, checkboxes and a sticky selection bar.
// Paying and renewing always happen in the secure client area via single sign-on (mass pay, domain renewal
// cart, service renewal page, invoice). The only change made here is the per-domain auto-renew switch.
import { buildRenewals, defaultSelected, groupRenewals, relDays, selectionTotals, type Group, type RenewalRow, type TldRenewPrices } from '../renewal-plan';
import { card, empty, errorBox, esc, fmtDate, icon, money, pill, ssoButton, btn } from './kit';
import type { RenewalInvoices } from '../api';

type R<T> = { ok: true; v: T } | { ok: false };

const TONE: Record<string, string> = { overdue: 'bad', soon: 'warn', next: 'muted', later: 'muted' };

function amountHtml(r: RenewalRow, cur: string) {
  if (r.amount === null) return '<span class="ac-muted">Price on renewal</span>';
  if (r.amount === 0) return '<span class="ac-muted">No charge</span>';
  return `<b class="num">${esc(money(r.amount, cur))}</b>${r.priceFrom === 'tld' ? '<small class="ac-muted">Current price</small>' : ''}`;
}

function actionHtml(r: RenewalRow, csrf: string) {
  if (r.invoiceId) return ssoButton(csrf, 'invoice', r.invoiceId, 'Pay', { variant: 'brand', sm: true, ic: 'card' });
  if (r.kind === 'domain') return ssoButton(csrf, 'domain_renew', r.id, 'Renew', { sm: true, ic: 'refresh' });
  if (/^active$/i.test(r.status)) return ssoButton(csrf, 'service_renew', r.id, r.days < 0 ? 'Renew & pay' : 'Renew early', { variant: r.days < 0 ? 'brand' : undefined, sm: true, ic: 'refresh' });
  return btn('Get help', `/account/support/new?service=${r.id}`, { sm: true });
}

function autoRenewHtml(r: RenewalRow, csrf: string) {
  if (r.kind !== 'domain') return '';
  const on = !!r.autoRenew;
  return `<form method="post" action="/account/renewals" class="ac-inline ac-rwr__ar">
    <input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="op" value="autorenew"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="on" value="${on ? '0' : '1'}">
    <button type="submit" class="ac-switch${on ? ' is-on' : ''}" role="switch" aria-checked="${on}" aria-label="Auto-renew for ${esc(r.name)}: ${on ? 'on' : 'off'}. Turn ${on ? 'off' : 'on'}" title="Turn auto-renew ${on ? 'off' : 'on'}"><i aria-hidden="true"></i><span>Auto-renew ${on ? 'on' : 'off'}</span></button>
  </form>`;
}

function rowHtml(r: RenewalRow, g: Group['key'], csrf: string, cur: string) {
  const href = r.kind === 'service' ? `/account/services/${r.id}` : `/account/domains/${r.id}`;
  const sel = defaultSelected(r);
  const inv = r.invoiceId ? `<span class="ac-rwr__inv">${icon('card')}Invoice #${esc(r.invoiceId)} unpaid</span>` : '';
  const st = /^active$/i.test(r.status) ? '' : pill(r.status);
  return `<li class="ac-rwr" id="rw-${esc(r.key.replace(':', '-'))}" data-k="${r.kind === 'domain' ? 'd' : 's'}" data-amt="${r.amount ?? ''}"${r.invoiceId ? ' data-inv="1"' : ''}>
    <label class="ac-rwr__cb"><input type="checkbox" name="sel" value="${esc(r.key)}" form="ac-rw-form"${sel ? ' checked' : ''} aria-label="Select ${esc(r.name)}"></label>
    <span class="ac-rn__ic" aria-hidden="true">${icon(r.kind === 'domain' ? 'globe' : 'server')}</span>
    <div class="ac-rwr__main"><a href="${esc(href)}" class="${r.kind === 'domain' ? 'ac-mono' : ''}">${esc(r.name)}</a>
      <small>${r.kind === 'service' && r.product ? `<span class="ac-mono">${esc(r.product)}</span>` : esc(r.product)}${st ? ` ${st}` : ''}</small></div>
    <div class="ac-rwr__date"><b class="num">${esc(fmtDate(r.date))}</b><small class="ac-rwr__rel ac-rwr__rel--${TONE[g]}">${esc(relDays(r.days, r.kind))}</small></div>
    <div class="ac-rwr__amt">${amountHtml(r, cur)}<small>${esc(r.cycle)}</small></div>
    <div class="ac-rwr__st">${inv}${autoRenewHtml(r, csrf)}</div>
    <div class="ac-rwr__act">${actionHtml(r, csrf)}</div>
  </li>`;
}

function groupHtml(g: Group, csrf: string, cur: string, i: number) {
  const t = g.totals;
  const sum = `<span class="ac-rwg__sum"><small>${t.count} item${t.count === 1 ? '' : 's'}</small><b class="num">${esc(money(t.amount, cur))}</b>${t.unpriced ? `<small>+ ${t.unpriced} priced at renewal</small>` : ''}</span>`;
  const head = `<span class="ac-rwg__t"><input type="checkbox" class="ac-rwg__all" data-rw-all aria-label="Select all ${esc(g.label.toLowerCase())}" hidden><h2 class="hp-col-h" id="rw-${g.key}-h">${esc(g.label)}</h2></span>${sum}`;
  // overdue services with no invoice yet: one prominent renew-and-pay hand-off (the service renewal checkout)
  const due = g.key === 'overdue' ? g.rows.filter((r) => r.kind === 'service' && !r.invoiceId && /^active$/i.test(r.status)) : [];
  const dueAmt = due.reduce((x, r) => x + (r.amount || 0), 0);
  const cta = due.length ? `<div class="ac-rwg__cta"><p>${icon('alert')}<span><b>${due.length} service${due.length === 1 ? ' is' : 's are'} overdue</b> with no invoice yet${dueAmt ? ` (${esc(money(dueAmt, cur))})` : ''}. Renew now to avoid suspension.</span></p>${
    due.length === 1 ? ssoButton(csrf, 'service_renew', due[0].id, 'Renew & pay now', { variant: 'brand', ic: 'card' })
    : `<form method="post" action="/account/sso" class="ac-inline"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="to" value="service_renewals">${due.map((r) => `<input type="hidden" name="sel" value="${esc(r.key)}">`).join('')}<button type="submit" class="hp-btn hp-btn--brand">${icon('card')}Renew &amp; pay now</button></form>`}</div>` : '';
  const list = `${cta}<ul class="ac-rwlist">${g.rows.map((r) => rowHtml(r, g.key, csrf, cur)).join('')}</ul>`;
  const cls = `ac-card ac-rwg ac-rwg--${g.key}`;
  if (g.key === 'later') {
    return `<details class="${cls}" id="rw-${g.key}" data-reveal style="--i:${i}"><summary class="ac-card__head">${head}${icon('chev')}</summary>${list}</details>`;
  }
  return `<section class="${cls}" id="rw-${g.key}" aria-labelledby="rw-${g.key}-h" data-reveal style="--i:${i}"><header class="ac-card__head">${head}</header>${list}</section>`;
}

export function renewalCentreView(o: {
  csrf: string; cur: string; products: R<any[]>; domains: R<any[]>; unpaid: R<any[]>; inv?: RenewalInvoices; tld?: TldRenewPrices; now?: number;
}) {
  const cur = o.cur;
  const failedBoth = !o.products.ok && !o.domains.ok;
  if (failedBoth) return { statsHtml: '', headAction: '', body: card('Renewals', errorBox('your renewals', '/account/renewals'), { id: 'ac-rw-h' }) };

  const rows = buildRenewals(o.products.ok ? o.products.v : [], o.domains.ok ? o.domains.v : [], { inv: o.inv, tld: o.tld, now: o.now });
  const groups = groupRenewals(rows);
  const by = Object.fromEntries(groups.map((g) => [g.key, g])) as Record<Group['key'], Group>;
  const unpaid = o.unpaid.ok ? o.unpaid.v : [];
  const unpaidTotal = unpaid.reduce((s, i) => s + (parseFloat(i.balance ?? i.total) || 0), 0);
  const unpaidCur = unpaid[0]?.currencycode || cur;

  // hero key numbers (same component as the dashboard)
  const stat = (href: string, label: string, ic: string, val: string, sub: string, alert = false) =>
    `<a class="hp-stat${alert ? ' is-alert' : ''}" href="${href}"><span class="ac-stats__l">${icon(ic)}${label}</span><b class="num">${esc(val)}</b><span>${esc(sub)}</span></a>`;
  const n = (g: Group) => `${g.totals.count} item${g.totals.count === 1 ? '' : 's'}`;
  const statsHtml = `<div class="hp-stats hp-stats--4 ac-stats">
    ${stat('#rw-overdue', 'Overdue', 'alert', money(by.overdue.totals.amount, cur), n(by.overdue), by.overdue.totals.count > 0)}
    ${stat('#rw-soon', 'Next 30 days', 'clock', money(by.soon.totals.amount, cur), n(by.soon))}
    ${stat('#rw-next', '31–90 days', 'refresh', money(by.next.totals.amount, cur), n(by.next))}
    ${stat('/account/invoices?status=Unpaid', 'Unpaid invoices', 'card', o.unpaid.ok ? money(unpaidTotal, unpaidCur) : '—', o.unpaid.ok ? `${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'}` : 'Could not check', unpaid.length > 0)}
  </div>`;

  const payAll = unpaid.length ? ssoButton(o.csrf, 'masspay', undefined, `Pay all unpaid invoices`, { variant: 'brand', ic: 'card' }) : '';

  const alerts: string[] = [];
  if (!o.products.ok || !o.domains.ok) alerts.push(`<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>We couldn't load your ${!o.products.ok ? 'services' : 'domains'} right now, so they are not listed here. <a href="/account/renewals">Try again</a></span></div>`);
  if (!o.unpaid.ok) alerts.push(`<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>We couldn't check for unpaid invoices, so open invoices may not be shown. <a href="/account/invoices?status=Unpaid">Open billing</a></span></div>`);
  if (unpaid.length) {
    alerts.push(`<div class="ac-rn__due ac-rw__due${unpaid.some((i) => /\d/.test(String(i.duedate)) && Date.parse(String(i.duedate).slice(0, 10)) < Date.now() - 86400000) ? ' is-overdue' : ''}">
      <div><small class="ac-k">Unpaid invoices</small><b class="num">${esc(money(unpaidTotal, unpaidCur))}</b><small>${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'} · paid together in one secure checkout</small></div>
      ${payAll}</div>`);
  }

  const shown = groups.filter((g) => g.rows.length);
  const near = by.overdue.rows.length + by.soon.rows.length + by.next.rows.length;
  const emptyNear = near ? '' : `<section class="ac-card" data-reveal>${empty('Nothing to renew in the next 90 days', rows.length ? 'Your next renewals are further out. You can see them under Later below.' : 'Services and domains you order appear here with their renewal dates and amounts.', rows.length ? '' : btn('Find a domain', '/domains-registration', { variant: 'brand', ic: 'search' }), 'check')}</section>`;

  // selection bar: server renders the default selection; account.js keeps it in sync with the checkboxes
  const selected = rows.filter(defaultSelected);
  const st = selectionTotals(rows, selected.map((r) => r.key));
  const selDomains = selected.filter((r) => r.kind === 'domain' && !r.invoiceId).length;
  const selServices = selected.filter((r) => r.kind === 'service' && !r.invoiceId && /^active$/i.test(r.status)).length;
  const bar = rows.length ? `<div class="ac-rwbar" role="region" aria-label="Selected renewals" data-rw-bar>
    <form id="ac-rw-form" method="post" action="/account/sso" class="ac-rwbar__f"><input type="hidden" name="csrf" value="${esc(o.csrf)}"></form>
    <p class="ac-rwbar__sum" aria-live="polite">Selected: <b class="num" data-rw-n>${st.count}</b> <span data-rw-items>item${st.count === 1 ? '' : 's'}</span> · <b class="num" data-rw-sum data-cur="${esc(cur)}">${esc(money(st.amount, cur))}</b><small data-rw-unpriced${st.unpriced ? '' : ' hidden'}>+ <span>${st.unpriced}</span> priced at renewal</small></p>
    <div class="ac-rwbar__a">
      <button type="submit" form="ac-rw-form" name="to" value="domain_renew_selected" class="hp-btn hp-btn--dark ac-sm" data-rw-dom${selDomains ? '' : ' disabled'}>${icon('globe')}<span>Renew <i class="ac-rwbar__lg">selected </i>domains (<b data-n>${selDomains}</b>)</span></button>
      <button type="submit" form="ac-rw-form" name="to" value="service_renewals" class="hp-btn hp-btn--ghost ac-sm" data-rw-svc${selServices ? '' : ' disabled'}>${icon('server')}<span>Renew services<i class="ac-rwbar__lg"> early</i> (<b data-n>${selServices}</b>)</span></button>
      ${unpaid.length ? `<button type="submit" form="ac-rw-form" name="to" value="masspay" class="hp-btn hp-btn--brand ac-sm">${icon('card')}Pay all unpaid</button>` : ''}
    </div>
    <p class="ac-rwbar__note">${selDomains > 1 || !selDomains ? 'Several domains open the renewal cart, which lists every renewable domain: keep the ones you selected and check out.' : 'You review the renewal and pay in the secure checkout.'} Early service renewal is offered for eligible plans only.</p>
  </div>` : '';

  const body = `<div class="ac-rw" data-rw>${alerts.join('')}${emptyNear}${shown.map((g, i) => groupHtml(g, o.csrf, cur, i)).join('')}${bar}</div>`;
  return { statsHtml, headAction: payAll, body };
}
