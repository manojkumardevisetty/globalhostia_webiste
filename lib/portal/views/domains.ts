// Domains: the portfolio (/account/domains: every domain with status, expiry, auto-renew, registrar lock, nameservers,
// DNS location and TLS, filters, search, sort and bulk actions) and the domain detail page with nameserver editing.
// The table renders from the billing records; account.js fills lock / nameservers / DNS / SSL from /account/api/domains
// after load, filters and sorts in place, and drives the bulk bar. Without JavaScript the filter form and bulk forms
// still work (server-side filtering, confirmation page for nameserver changes).
import { RENEW_WINDOW, daysBadge, renewAllDomainsButton } from './renewals';
import { dnsSection, type DnsView } from './dns';
import { card, daysUntil, dl, empty, esc, fmtDate, icon, money, pill, ssoButton, btn, fieldErr, invalid, t } from './kit';
import { tn } from '../i18n';
import {
  expiryTone, filterQuery, isFiltered, matches, sortRows, summarize, toRows, eligible, BULK_MAX,
  type BulkResult, type Filter, type NsKind, type PortfolioRow, type FailReason, type BulkAction,
} from '../portfolio';

const autoRenew = (d: any) => !(d.donotrenew === true || d.donotrenew === 1 || d.donotrenew === '1');
const expiryNote = (d: any) => {
  const n = daysUntil(d.expirydate);
  if (n === null) return '';
  const cls = n <= 14 ? 'is-bad' : n <= 60 ? 'is-soon' : 'ac-muted';
  return `<small class="${cls}">${esc(n < 0 ? tn(-n, 'expired {n} day ago', 'expired {n} days ago') : tn(n, 'in {n} day', 'in {n} days'))}</small>`;
};

const renewable = (d: { group?: string; status?: string }) => /^(active|grace)$/.test(String(d.group || '')) || /^(active|grace|redemption|expired)$/i.test(String(d.status || ''));

/** Relative expiry text for a portfolio row. */
export function relExpiry(days: number | null) {
  if (days === null) return '';
  if (days === 0) return t('Expires today');
  if (days > 0) return tn(days, 'in {n} day', 'in {n} days');
  return tn(-days, 'expired {n} day ago', 'expired {n} days ago');
}

export const actionLabel = (a: BulkAction) => ({
  autorenew_on: t('Turn auto-renew on'), autorenew_off: t('Turn auto-renew off'), lock: t('Lock at the registry'), unlock: t('Unlock at the registry'), ns_ours: t('Use GlobalHostia nameservers'),
})[a];
export const reasonText = (r: FailReason) => ({
  state: t('not available for this domain status'), api: t('the registry or billing system refused the change'), notfound: t('not found on your account'),
  verify: t('the change did not apply'), nozone: t('no DNS zone here yet: turn on DNS on the domain page first'), rate: t('too many changes, try again later'),
})[r];

function bulkPanel(r: BulkResult, rows: PortfolioRow[]) {
  const name = (id: number) => rows.find((x) => x.id === id)?.name || `#${id}`;
  const list = (ids: number[]) => ids.map((id) => `<span class="ac-mono">${esc(name(id))}</span>`).join(', ');
  const tone = r.failed.length ? (r.done.length ? 'warn' : 'err') : 'ok';
  const lines = [
    r.done.length ? `<li>${icon('check')}<span><b>${esc(tn(r.done.length, '{n} domain updated', '{n} domains updated'))}:</b> ${list(r.done)}</span></li>` : '',
    r.skipped.length ? `<li>${icon('info')}<span><b>${esc(tn(r.skipped.length, '{n} already set', '{n} already set'))}:</b> ${list(r.skipped)}</span></li>` : '',
    ...r.failed.map((f) => `<li class="is-bad">${icon('alert')}<span><b class="ac-mono">${esc(name(f.id))}</b>: ${esc(reasonText(f.reason))}</span></li>`),
  ].join('');
  return `<div class="ac-alert ac-alert--${tone} ac-pf__res" role="${tone === 'ok' ? 'status' : 'alert'}"><div><b>${esc(actionLabel(r.action))}</b><ul>${lines}</ul></div></div>`;
}

function rowHtml(r: PortfolioRow, o: { csrf: string; cur: string; invoices?: Map<number, number>; ns?: Map<number, string[] | null>; nsKind?: Map<number, NsKind>; f: Filter }) {
  const tone = expiryTone(r.days);
  const soon = renewable(r) && r.days !== null && r.days <= RENEW_WINDOW;
  const inv = o.invoices?.get(r.id);
  const act = !soon ? '' : inv ? ssoButton(o.csrf, 'invoice', inv, t('Pay invoice'), { variant: 'brand', sm: true }) : ssoButton(o.csrf, 'domain_renew', r.id, t('Renew'), { sm: true });
  const canAr = eligible('autorenew_on', r.status);
  const ar = canAr ? `<form method="post" action="/account/domains" class="ac-inline">
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="bulk"><input type="hidden" name="sel" value="d:${r.id}"><input type="hidden" name="back" value="${esc(filterQuery(o.f))}">
      <button type="submit" name="action" value="${r.autoRenew ? 'autorenew_off' : 'autorenew_on'}" class="ac-switch${r.autoRenew ? ' is-on' : ''}" role="switch" aria-checked="${r.autoRenew}" aria-label="${esc(r.autoRenew ? t('Auto-renew for {d} is on. Turn off', { d: r.name }) : t('Auto-renew for {d} is off. Turn on', { d: r.name }))}"><i aria-hidden="true"></i><span>${esc(r.autoRenew ? t('On') : t('Off'))}</span></button></form>`
    : `<span class="ac-muted">—</span>`;
  const known = o.ns?.get(r.id);
  const kind = o.nsKind?.get(r.id);
  const hide = !matches(r, o.f, kind);
  const active = r.group === 'active';
  return `<tr class="ac-pf__row" data-pf-row data-id="${r.id}" data-name="${esc(r.name)}" data-group="${r.group}" data-days="${r.days ?? ''}" data-ar="${r.autoRenew ? 1 : 0}" data-ns="${kind || ''}" data-active="${active ? 1 : 0}"${hide ? ' hidden' : ''}>
    <td class="ac-pf__cb"><input type="checkbox" name="sel" value="d:${r.id}" form="ac-pf-bulk" aria-label="${esc(t('Select {x}', { x: r.name }))}"></td>
    <th scope="row" class="ac-pf__dom"><a class="ac-mono ac-strong" href="/account/domains/${r.id}">${esc(r.name)}</a><small class="ac-pf__dns" data-pf-dns>${active ? '' : ''}</small></th>
    <td data-l="${esc(t('Status'))}">${pill(r.status)}</td>
    <td data-l="${esc(t('Expires'))}" class="ac-pf__exp"><span class="num">${esc(fmtDate(r.expiry))}</span><small class="ac-pf__rel ac-pf__rel--${tone}">${esc(relExpiry(r.days))}</small></td>
    <td data-l="${esc(t('Auto-renew'))}">${ar}</td>
    <td data-l="${esc(t('Lock'))}"><span class="ac-pf__lz" data-pf-lock>${active ? '<i class="ac-pf__sk" aria-hidden="true"></i>' : '<span class="ac-muted">—</span>'}</span></td>
    <td data-l="${esc(t('Nameservers'))}"><span class="ac-pf__lz" data-pf-ns>${known ? nsLabelHtml(kind, known) : active ? '<i class="ac-pf__sk" aria-hidden="true"></i>' : '<span class="ac-muted">—</span>'}</span></td>
    <td data-l="${esc(t('SSL'))}"><span class="ac-pf__lz" data-pf-ssl>${active ? '<i class="ac-pf__sk" aria-hidden="true"></i>' : '<span class="ac-muted">—</span>'}</span></td>
    <td class="ac-td-act"><div class="ac-td-btns">${act}<a class="hp-btn hp-btn--dark ac-sm" href="/account/domains/${r.id}">${esc(t('Manage'))}</a></div></td></tr>`;
}

/** Nameserver cell text (shared with the JSON endpoint so the server and the lazy fill read the same). */
export function nsLabelHtml(kind: NsKind | undefined, ns: string[] | null, host?: string) {
  if (!ns || !ns.length || !kind || kind === 'unknown') return `<span class="ac-pf__tag ac-pf__tag--muted">${esc(t('Unknown'))}</span>`;
  const title = esc(ns.join(', '));
  if (kind === 'ours') return `<span class="ac-pf__tag ac-pf__tag--ok" title="${title}">${icon('check')}GlobalHostia</span>`;
  if (kind === 'mixed') return `<span class="ac-pf__tag ac-pf__tag--warn" title="${title}">${esc(t('Mixed'))}</span>`;
  return `<span class="ac-pf__tag" title="${title}">${esc(host && host !== 'another provider' ? host : t('External'))}</span>`;
}

export function domainsView(o: { csrf: string; domains: any[]; cur: string; invoices?: Map<number, number>; f: Filter; bulk?: BulkResult | null; ns?: Map<number, string[] | null>; nsKind?: Map<number, NsKind> }) {
  if (!o.domains.length) return { headAction: '', statsHtml: '', body: card(t('Your domains'), empty(t('No domains yet'), t('Search for the perfect name, or transfer a domain you already own.'), `${btn(t('Find a domain'), '/domains-registration', { variant: 'brand', ic: 'search' })}`, 'globe'), { id: 'ac-dl-h' }) };
  const f = o.f;
  const all = toRows(o.domains);
  const rows = sortRows(all, f.sort);
  const sum = summarize(all);
  const toRenew = all.filter((r) => renewable(r) && r.days !== null && r.days <= RENEW_WINDOW && !o.invoices?.has(r.id)).length;
  const shown = rows.filter((r) => matches(r, f, o.nsKind?.get(r.id))).length;

  const stat = (href: string, label: string, ic: string, val: number, sub: string, alert = false) =>
    `<a class="hp-stat${alert ? ' is-alert' : ''}" href="${href}"><span class="ac-stats__l">${icon(ic)}${esc(label)}</span><b class="num">${esc(String(val))}</b><span>${esc(sub)}</span></a>`;
  const statsHtml = `<div class="hp-stats hp-stats--4 ac-stats">
    ${stat('/account/domains', t('Domains'), 'globe', sum.total, tn(sum.active, '{n} active', '{n} active'))}
    ${stat('/account/domains?exp=30', t('Expiring in 30 days'), 'clock', sum.exp30, sum.exp30 ? t('Renew to keep them') : t('Nothing urgent'), sum.exp30 > 0)}
    ${stat('/account/domains?exp=90', t('Expiring in 90 days'), 'calendar', sum.exp90, t('Including the next 30 days'))}
    ${stat('/account/domains?ar=off', t('Auto-renew off'), 'refresh', sum.arOff, sum.arOff ? t('Renew these yourself') : t('All renew automatically'))}
  </div>`;

  const opt = (v: string, l: string, cur: string) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const chip = (name: string, value: string, label: string, n: number | null, on: boolean) =>
    `<label class="ac-chipf"><input type="checkbox" name="${name}" value="${value}"${on ? ' checked' : ''} data-pf-chip><span>${esc(label)}${n !== null ? `<i class="num">${n}</i>` : ''}</span></label>`;
  const toolbar = `<form class="ac-pf__bar" method="get" action="/account/domains" role="search" data-pf-form>
    <div class="ac-pf__q"><label class="sr-only" for="ac-pf-q">${esc(t('Search domains'))}</label>${icon('search')}<input class="ac-input" id="ac-pf-q" type="search" name="q" value="${esc(f.q)}" placeholder="${esc(t('Search domains'))}" autocomplete="off" spellcheck="false" autocapitalize="none" data-pf-q></div>
    <div class="ac-pf__sel"><label class="sr-only" for="ac-pf-st">${esc(t('Status'))}</label><select class="ac-input" id="ac-pf-st" name="status" data-pf-status>
      ${opt('', t('All statuses'), f.status)}${opt('active', t('Active'), f.status)}${opt('grace', t('Grace / redemption'), f.status)}${opt('expired', t('Expired'), f.status)}${opt('pending', t('Pending'), f.status)}${opt('closed', t('Cancelled or transferred'), f.status)}</select></div>
    <div class="ac-pf__sel"><label class="sr-only" for="ac-pf-so">${esc(t('Sort by'))}</label><select class="ac-input" id="ac-pf-so" name="sort" data-pf-sort>
      ${opt('expiry', t('Expiry: soonest first'), f.sort)}${opt('expiry_desc', t('Expiry: latest first'), f.sort)}${opt('name', t('Name: A to Z'), f.sort)}${opt('status', t('Status'), f.sort)}</select></div>
    <div class="ac-pf__chips" role="group" aria-label="${esc(t('Quick filters'))}">
      ${chip('exp', '30', t('Expiring ≤ 30 days'), sum.exp30, f.exp === '30')}${chip('exp', '90', t('Expiring ≤ 90 days'), sum.exp90, f.exp === '90')}${chip('ar', 'off', t('Auto-renew off'), sum.arOff, f.ar === 'off')}${chip('ns', 'ext', t('External nameservers'), null, f.ns === 'ext')}
    </div>
    <div class="ac-pf__go"><button class="hp-btn hp-btn--dark ac-sm" type="submit" data-pf-apply>${esc(t('Apply'))}</button>${isFiltered(f) ? `<a class="ac-more" href="/account/domains${f.sort !== 'expiry' ? `?sort=${f.sort}` : ''}" data-pf-clear>${esc(t('Clear filters'))}</a>` : `<a class="ac-more" href="/account/domains" data-pf-clear hidden>${esc(t('Clear filters'))}</a>`}</div>
  </form>`;

  const head = `<thead><tr><th scope="col" class="ac-pf__cb"><input type="checkbox" data-pf-all aria-label="${esc(t('Select all shown domains'))}" hidden></th><th scope="col">${esc(t('Domain'))}</th><th scope="col">${esc(t('Status'))}</th><th scope="col">${esc(t('Expires'))}</th><th scope="col">${esc(t('Auto-renew'))}</th><th scope="col">${esc(t('Lock'))}</th><th scope="col">${esc(t('Nameservers'))}</th><th scope="col">${esc(t('SSL'))}</th><th scope="col"><span class="sr-only">${esc(t('Actions'))}</span></th></tr></thead>`;
  const body = rows.map((r) => rowHtml(r, { ...o, f })).join('');
  const none = `<div class="ac-pf__none" data-pf-empty${shown ? ' hidden' : ''}>${icon('search')}<span>${esc(t('No domains match these filters.'))}</span><a class="ac-more" href="/account/domains" data-pf-clear>${esc(t('Clear filters'))}</a></div>`;
  const exportAll = `<a class="ac-more" href="/account/domains/export${filterQuery(f)}" data-pf-exportall>${icon('download')}${esc(t('Export CSV'))}</a>`;
  const table = card(t('Your domains'), `${toolbar}<p class="ac-pf__count ac-muted" aria-live="polite" data-pf-count>${esc(tn(shown, '{n} domain shown', '{n} domains shown'))}${shown !== all.length ? ` · ${esc(t('{n} in total', { n: all.length }))}` : ''}</p>
    <div class="ac-pf__tw"><table class="ac-table ac-pf" data-pf>${head}<tbody>${body}</tbody></table></div>${none}`,
    { id: 'ac-dl-h', flush: true, cls: 'ac-pf__card', action: `<span class="ac-pf__acts">${exportAll}<a class="ac-more" href="/domains-registration">${esc(t('Register another'))}${icon('right')}</a></span>` });

  const bar = `<div class="ac-pfbar" role="region" aria-label="${esc(t('Bulk actions'))}" data-pf-bar>
    <form id="ac-pf-bulk" method="post" action="/account/domains" class="ac-rwbar__f"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="bulk"><input type="hidden" name="back" value="${esc(filterQuery(f))}"><input type="hidden" name="confirm" value="" data-pf-confirmed></form>
    <p class="ac-pfbar__sum" aria-live="polite"><b class="num" data-pf-n>0</b> <span>${esc(t('selected'))}</span><small>${esc(t('Up to {n} domains at a time.', { n: BULK_MAX }))}</small></p>
    <div class="ac-pfbar__a">
      <button type="submit" form="ac-pf-bulk" name="action" value="autorenew_on" class="hp-btn hp-btn--ghost ac-sm" data-pf-need>${icon('refresh')}${esc(t('Auto-renew on'))}</button>
      <button type="submit" form="ac-pf-bulk" name="action" value="autorenew_off" class="hp-btn hp-btn--ghost ac-sm" data-pf-need>${esc(t('Auto-renew off'))}</button>
      <button type="submit" form="ac-pf-bulk" name="action" value="lock" class="hp-btn hp-btn--ghost ac-sm" data-pf-need>${icon('lock')}${esc(t('Lock'))}</button>
      <button type="submit" form="ac-pf-bulk" name="action" value="unlock" class="hp-btn hp-btn--ghost ac-sm" data-pf-need>${icon('unlock')}${esc(t('Unlock'))}</button>
      <button type="submit" form="ac-pf-bulk" name="action" value="ns_ours" class="hp-btn hp-btn--ghost ac-sm" data-pf-need data-pf-ns-btn>${icon('server')}${esc(t('Use GlobalHostia nameservers'))}</button>
      <button type="submit" form="ac-pf-bulk" formaction="/account/sso" name="to" value="domain_renew_selected" class="hp-btn hp-btn--light ac-sm" data-pf-need>${icon('globe')}${esc(t('Renew selected'))}</button>
      <button type="button" class="hp-btn hp-btn--ghost ac-sm" data-pf-export hidden>${icon('download')}${esc(t('Export CSV'))}</button>
    </div>
  </div>
  <dialog class="ac-sheet ac-pf__dlg" id="ac-pf-dlg" aria-labelledby="ac-pf-dlg-h">
    <div class="ac-sheet__box">
      <h2 id="ac-pf-dlg-h" data-pf-dlg-h>${esc(t('Use GlobalHostia nameservers?'))}</h2>
      <p>${esc(t('We switch each selected domain to the GlobalHostia nameservers of the hosting account or DNS zone it already has here. Domains without a DNS zone here are skipped, so nothing stops resolving.'))}</p>
      <p class="ac-muted">${esc(t('Records kept at your current DNS host (for example email MX) are not copied. The change can take a few hours to reach every network.'))}</p>
      <ul class="ac-pf__dlgl" data-pf-dlg-list></ul>
      <div class="ac-sheet__a"><button type="button" class="hp-btn hp-btn--ghost" data-pf-dlg-no>${esc(t('Cancel'))}</button><button type="button" class="hp-btn hp-btn--brand" data-pf-dlg-yes>${esc(t('Switch nameservers'))}</button></div>
    </div>
  </dialog>`;

  return {
    headAction: renewAllDomainsButton(o.csrf, toRenew),
    statsHtml,
    body: `<div class="ac-pfw" data-pfw>${o.bulk ? bulkPanel(o.bulk, all) : ''}${table}${bar}</div>`,
  };
}

/** No-JS confirmation step for "Use GlobalHostia nameservers" (the JS dialog posts confirm=yes directly). */
export function nsConfirmView(o: { csrf: string; rows: PortfolioRow[]; back: string }) {
  return card(t('Use GlobalHostia nameservers?'), `<p>${esc(t('We switch each selected domain to the GlobalHostia nameservers of the hosting account or DNS zone it already has here. Domains without a DNS zone here are skipped, so nothing stops resolving.'))}</p>
    <ul class="ac-pf__dlgl">${o.rows.map((r) => `<li class="ac-mono">${esc(r.name)}</li>`).join('')}</ul>
    <p class="ac-muted">${esc(t('Records kept at your current DNS host (for example email MX) are not copied. The change can take a few hours to reach every network.'))}</p>
    <form method="post" action="/account/domains" class="ac-form__foot"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="op" value="bulk"><input type="hidden" name="action" value="ns_ours"><input type="hidden" name="confirm" value="yes"><input type="hidden" name="back" value="${esc(o.back)}">
      ${o.rows.map((r) => `<input type="hidden" name="sel" value="d:${r.id}">`).join('')}
      <button class="hp-btn hp-btn--brand" type="submit">${esc(t('Switch nameservers'))}</button><a class="hp-btn hp-btn--ghost" href="/account/domains${esc(o.back)}">${esc(t('Cancel'))}</a></form>`, { id: 'ac-nsc-h' });
}

export function domainDetailView(o: { csrf: string; d: any; cur: string; ns: string[] | null; nsInput?: string[]; errs?: Record<string, string>; dns?: Omit<DnsView, 'csrf' | 'd'> }) {
  const d = o.d;
  const editable = /active/i.test(d.status);
  const vals = o.nsInput || o.ns || [];
  const fields = [0, 1, 2, 3, 4].map((i) => {
    const k = `ns${i + 1}`;
    return `<div class="ac-field"><label for="ac-${k}">${esc(t('Nameserver {n}', { n: i + 1 }))}${i < 2 ? '' : ` <span class="ac-muted">${esc(t('(optional)'))}</span>`}</label>
      <input class="ac-input ac-mono" id="ac-${k}" name="${k}" value="${esc(vals[i] || '')}" autocomplete="off" spellcheck="false" autocapitalize="none" inputmode="url"${i < 2 ? ' required' : ''} placeholder="${i < 2 ? `ns${i + 1}.example.com` : ''}"${invalid(o.errs, k)}${editable ? '' : ' disabled'}>${fieldErr(o.errs, k)}</div>`;
  }).join('');
  const nsBody = o.ns === null && !o.nsInput
    ? `<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>${esc(t("We couldn't read the current nameservers from the registry. You can still set new ones below."))}</span></div>`
    : '';
  const nsForm = `${nsBody}${o.errs?.form ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(o.errs.form)}</span></div>` : ''}
    <form method="post" action="/account/domains/${esc(d.id)}" class="ac-form ac-form--grid" novalidate data-ac-busy>
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="action" value="nameservers">
      ${fields}
      <div class="ac-form__foot"><button class="hp-btn hp-btn--brand" type="submit"${editable ? '' : ' disabled'}>${esc(t('Save nameservers'))}</button>
      <p class="ac-muted">${esc(editable ? t('Changes usually take effect within a few hours, and up to 24 hours worldwide.') : t('Nameservers can be changed once the domain is active.'))}</p></div>
    </form>`;

  const onOff = (on: boolean) => (on ? `<span class="ac-on">${icon('check')}${esc(t('On'))}</span>` : `<span class="ac-off">${esc(t('Off'))}</span>`);
  const overview = card(t('Domain details'), dl([
    [t('Status'), pill(d.status)],
    [t('Registered'), `<span class="num">${esc(fmtDate(d.regdate))}</span>`],
    [t('Expires'), `<span class="num">${esc(fmtDate(d.expirydate))}</span> ${expiryNote(d)}`],
    [t('Auto-renew'), onOff(autoRenew(d))],
    [t('Renewal price'), `<span class="num">${esc(money(d.recurringamount, o.cur))}</span> <span class="ac-muted">/ ${esc(tn(Number(d.regperiod) || 1, '{n} yr', '{n} yrs'))}</span>`],
    ...(d.idprotection !== undefined ? [[t('ID protection'), onOff(!!d.idprotection && d.idprotection !== '0')] as [string, string]] : []),
  ]) + `<div class="ac-card__foot ac-card__foot--stack">${ssoButton(o.csrf, 'domain_renew', d.id, t('Renew domain'), { variant: 'brand', ic: 'refresh', block: true })}</div>`, { id: 'ac-dd-h' });

  const more = card(t('More settings'), `<ul class="ac-actions">
    <li>${icon('database')}<div><b>${esc(t('DNS records'))}</b><small>${esc(t('A, AAAA, CNAME, MX, TXT and SRV records.'))}</small></div><a class="hp-btn hp-btn--ghost ac-sm" href="#dns">${esc(t('Manage'))}</a></li>
    <li>${icon('users')}<div><b>${esc(t('Contact information'))}</b><small>${esc(t('Registrant, admin and technical contacts.'))}</small></div>${ssoButton(o.csrf, 'domain_contacts', d.id, t('View'), { sm: true })}</li>
    <li>${icon('key')}<div><b>${esc(t('Transfer code and lock'))}</b><small>${esc(t('Get the EPP code or change the registrar lock.'))}</small></div>${ssoButton(o.csrf, 'domain', d.id, t('View'), { sm: true })}</li>
  </ul>`, { id: 'ac-dm-h', flush: true });

  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${card(t('Nameservers'), nsForm, { id: 'ac-ns-h' })}</div><div class="ac-col">${overview}${more}</div></div>${o.dns ? dnsSection({ ...o.dns, csrf: o.csrf, d }) : ''}`;
}

const HOST = /^(?=.{4,253}$)(?!-)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;
/** Validate nameserver hostnames: ns1 + ns2 required, valid hostnames, no duplicates. */
export function validateNameservers(raw: string[]) {
  const ns = raw.map((x) => String(x || '').trim().toLowerCase().replace(/\.$/, ''));
  const errs: Record<string, string> = {};
  ns.forEach((v, i) => {
    const k = `ns${i + 1}`;
    if (!v) { if (i < 2) errs[k] = t('Enter a nameserver. Domains need at least two.'); return; }
    if (!HOST.test(v)) errs[k] = t('Enter a hostname like ns1.example.com (no http:// or spaces).');
    else if (ns.indexOf(v) !== i) errs[k] = t('This nameserver is already listed above.');
  });
  const filled = ns.filter(Boolean);
  return { ns: filled, errs, ok: !Object.keys(errs).length && filled.length >= 2 };
}
