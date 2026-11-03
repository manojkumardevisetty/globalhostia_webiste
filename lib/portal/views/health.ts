// Domain health in the customer portal: badge per domain on /account/domains, the Health panel on a domain page,
// the /account/health page (every domain, details, fixes, "Re-check now"), and the dashboard strip for urgent problems.
// Issue texts come from lib/health/core.ts (English + Arabic, the same words as the alert email).
import { card, esc, icon, okMark, fmtDateTime, t } from './kit';
import { tn, lang } from '../i18n';
import { issueCopy, fixFor, SEV_RANK, type IssueKey, type IssueState, type Target } from '../../health/core';

export type HealthView = {
  id: string; domain: string; status: string; external: boolean; lastChecked: number | null; target: Target;
  issues: Partial<Record<IssueKey, IssueState>>; checks?: any;
};

export const HEALTH_CSS = `<style>
.ac-hb{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;border:1px solid transparent;white-space:nowrap;text-decoration:none}
.ac-hb i{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.ac-hb--critical{background:var(--ac-bad-bg,#fdecea);color:var(--ac-bad,#b42318);border-color:#f6cdc8}
.ac-hb--warning{background:var(--ac-warn-bg,#fff4dc);color:var(--ac-warn,#9a5b00);border-color:#f3e0b5}
.ac-hb--ok{background:var(--ac-ok-bg,#eaf6ee);color:var(--ac-ok,#15803d);border-color:#cde8d5}
.ac-hb--unknown{background:#f2f4f7;color:#5b6573;border-color:#e4e7ec}
.ac-pf__dom .ac-hb{margin-inline-start:8px;vertical-align:1px}
.ac-hx{list-style:none;margin:0;padding:0}
.ac-hx>li{display:grid;grid-template-columns:28px 1fr;gap:4px 12px;padding:16px 0;border-top:1px solid #eef0f3}
.ac-hx>li:first-child{border-top:0;padding-top:4px}
.ac-hx__ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center}
.ac-hx__ic .hp-ico{width:16px;height:16px}
.ac-hx--critical .ac-hx__ic{background:var(--ac-bad-bg,#fdecea);color:var(--ac-bad,#b42318)}
.ac-hx--warning .ac-hx__ic{background:var(--ac-warn-bg,#fff4dc);color:var(--ac-warn,#9a5b00)}
.ac-hx--info .ac-hx__ic{background:var(--ac-info-bg,#e8f1fa);color:var(--ac-info,#1f5f99)}
.ac-hx__b{min-width:0}
.ac-hx__b b{display:block;font-size:15px;line-height:1.35}
.ac-hx__b p{margin:4px 0 10px;color:#3d4653;line-height:1.55}
.ac-hx__a{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ac-hx__rec{margin:0 0 10px;padding:10px 12px;border:1px dashed #d0d5dd;border-radius:8px;background:#fafbfc;font:12.5px/1.5 ui-monospace,Menlo,Consolas,monospace;direction:ltr;text-align:left;word-break:break-all}
.ac-hx__rec span{display:block;color:#5b6573}
.ac-hx__target{outline:2px solid #111;outline-offset:6px;border-radius:10px}
.ac-hh{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between;margin:0 0 6px}
.ac-hh small{color:#5b6573}
.ac-hgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0 0;padding:0;list-style:none}
.ac-hgrid li{display:flex;gap:8px;align-items:center;font-size:13px;color:#3d4653;background:#f7f8fa;border-radius:8px;padding:8px 10px}
.ac-hgrid .hp-ico{width:15px;height:15px;color:var(--ac-ok,#15803d);flex:none}
.ac-hgrid li.is-off .hp-ico{color:#98a2b3}
.ac-hext{margin:14px 0 0;padding:12px 14px;border-radius:10px;background:#f7f8fa;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.ac-hext p{margin:0;font-size:13.5px;color:#3d4653;max-width:60ch}
.ac-htbl{width:100%;border-collapse:collapse}
.ac-htbl th,.ac-htbl td{text-align:start;padding:12px 10px;border-top:1px solid #eef0f3;vertical-align:middle}
.ac-htbl thead th{border-top:0;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5b6573}
.ac-htbl td small{display:block;color:#5b6573}
.ac-hstrip{display:flex;gap:14px;align-items:flex-start;margin:0 0 18px;padding:14px 18px;border-radius:14px;background:var(--ac-bad-bg,#fdecea);border:1px solid #f6cdc8;color:#7a1a12}
.ac-hstrip>.hp-ico{flex:none;width:22px;height:22px;margin-top:2px}
.ac-hstrip b{display:block}
.ac-hstrip ul{margin:4px 0 0;padding:0;list-style:none}
.ac-hstrip li{margin:2px 0}
.ac-hstrip a{color:inherit;font-weight:600}
@media (max-width:640px){.ac-htbl thead{display:none}.ac-htbl tr{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:12px 0;border-top:1px solid #eef0f3}.ac-htbl td,.ac-htbl th{border:0;padding:0}.ac-htbl td.ac-htbl__a{grid-column:1/-1;margin-top:8px}}
</style>`;

const SEV_IC: Record<string, string> = { critical: 'alert', warning: 'alert', info: 'info' };
const statusText = (s: string) => (s === 'critical' ? t('Urgent') : s === 'warning' ? t('Needs attention') : s === 'ok' ? t('Healthy') : t('Not checked yet'));
const sorted = (v: HealthView) => (Object.entries(v.issues) as [IssueKey, IssueState][]).filter(([, i]) => !!i).sort(([, a], [, b]) => SEV_RANK[b.sev] - SEV_RANK[a.sev]);
const healthHref = (domain: string) => `/account/health?d=${encodeURIComponent(domain)}`;

/** Result message after a POST to /account/health (also shown on the domain page). Fixed texts per key. */
export function healthFlash(key: string | null | undefined): { tone: 'ok' | 'err' | 'warn'; text: string } | null {
  switch (key) {
    case 'rechecked': return { tone: 'ok', text: t('Checked again just now. The results below are current.') };
    case 'recent': return { tone: 'warn', text: t('This domain was checked less than a minute ago. The results below are current.') };
    case 'rate': return { tone: 'warn', text: t('Too many checks in a short time. Please wait a few minutes and try again.') };
    case 'ssl': return { tone: 'ok', text: t('Free SSL requested. It is usually active within a few minutes; then choose Re-check now.') };
    case 'ssl_unavailable': return { tone: 'err', text: t('Free SSL cannot be issued for this domain from here. Open a ticket and we will do it.') };
    case 'ssl_failed': return { tone: 'err', text: t('The hosting panel could not issue the certificate right now. Make sure the domain points to your hosting, then try again or open a ticket.') };
    case 'external_on': return { tone: 'ok', text: t('Saved. We no longer flag the nameservers or address of this domain.') };
    case 'external_off': return { tone: 'ok', text: t('Saved. The next check looks at the nameservers and address again.') };
    case 'hfailed': return { tone: 'err', text: t('Something went wrong. Please try again.') };
    default: return null;
  }
}

/** Status badge (domains list, health table). `href` makes it a link to the details. */
export function healthBadge(v: Pick<HealthView, 'status' | 'issues' | 'domain'> | null | undefined, o: { href?: boolean } = {}) {
  if (!v) return '';
  const st = ['critical', 'warning', 'ok'].includes(v.status) ? v.status : 'unknown';
  const n = Object.values(v.issues || {}).filter((i) => i && i.sev !== 'info').length;
  const label = st === 'critical' || st === 'warning' ? tn(n, '{n} issue', '{n} issues') : statusText(st);
  const inner = `<i aria-hidden="true"></i>${esc(label)}`;
  const title = esc(t('Health: {s}', { s: statusText(st) }));
  return o.href ? `<a class="ac-hb ac-hb--${st}" href="${esc(healthHref(v.domain))}" title="${title}">${inner}</a>` : `<span class="ac-hb ac-hb--${st}" title="${title}">${inner}</span>`;
}

function issueItem(v: HealthView, k: IssueKey, i: IssueState, csrf: string, o: { fixTarget?: string; back: string }) {
  const l = lang();
  const c = issueCopy(k, i.params, l);
  const nsOurs = !!v.checks?.nsOurs;
  const fix = fixFor(k, i, v.target, { site: '', nsOurs });
  let action = '';
  if (fix.kind === 'ssl') {
    action = `<form method="post" action="/account/health" class="ac-inline" data-ac-busy${o.fixTarget === 'ssl' ? ' id="fix"' : ''}>
      <input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="op" value="ssl"><input type="hidden" name="d" value="${esc(v.domain)}"><input type="hidden" name="back" value="${esc(o.back)}">
      <button class="hp-btn hp-btn--brand ac-sm" type="submit">${icon('shield')}${esc(t('Issue free SSL'))}</button></form>`;
  } else if (fix.kind !== 'help') action = `<a class="hp-btn hp-btn--dark ac-sm" href="${esc(fix.href)}">${esc(fix.label[l])}</a>`;
  const rec = (k === 'spf_missing' || k === 'spf_server' || k === 'dmarc_missing') && i.params.value && fix.kind === 'help'
    ? `<div class="ac-hx__rec"><span>${esc(t('Add this TXT record where your DNS is managed'))}</span>${esc(k.startsWith('dmarc') ? '_dmarc' : '@')} &nbsp; ${esc(String(i.params.value))}</div>` : '';
  const ticket = k === 'site_down' || k === 'mx_broken' || k === 'ssl_chain' || (fix.kind === 'help' && k.startsWith('ssl'))
    ? `<a class="hp-btn hp-btn--ghost ac-sm" href="/account/support/new">${esc(t('Ask our team to fix it'))}</a>` : '';
  const since = i.first ? `<small class="ac-muted">${esc(t('First seen {d}', { d: fmtDateTime(i.first) }))}</small>` : '';
  return `<li class="ac-hx--${i.sev}${o.fixTarget && fix.kind === o.fixTarget ? ' ac-hx__target' : ''}" id="issue-${esc(k)}"><span class="ac-hx__ic">${icon(SEV_IC[i.sev] || 'info')}</span>
    <div class="ac-hx__b"><b>${esc(c.title)}</b><p>${esc(c.explain)}</p>${rec}<div class="ac-hx__a">${action}${ticket}${since}</div></div></li>`;
}

function passedGrid(v: HealthView) {
  const c = v.checks || {}, items: [boolean, string][] = [];
  const tl = c.tls;
  if (tl?.connected && tl.validTo) items.push([true, t('SSL valid until {d}', { d: fmtDateTime(tl.validTo).replace(/,? \d\d:\d\d UTC$/, '') })]);
  if (c.dns?.ok) items.push([true, t('Domain resolves')]);
  if (c.web?.https?.status && c.web.https.status < 500) items.push([true, t('Website answers over HTTPS')]);
  if (c.mail?.spf?.length === 1) items.push([true, 'SPF']);
  if (c.mail?.dmarc?.length) items.push([true, 'DMARC']);
  if (c.mail?.dkim) items.push([true, 'DKIM']);
  if (!items.length) return '';
  return `<ul class="ac-hgrid">${items.map(([ok, s]) => `<li${ok ? '' : ' class="is-off"'}>${icon(ok ? 'check' : 'minus')}<span>${esc(s)}</span></li>`).join('')}</ul>`;
}

/** The Health panel body (domain page and /account/health). */
export function healthBody(v: HealthView, csrf: string, o: { back: string; fixTarget?: string; flash?: { tone: 'ok' | 'err' | 'warn'; text: string } | null; canRecheck?: boolean }) {
  const list = sorted(v);
  const recheck = `<form method="post" action="/account/health" class="ac-inline" data-ac-busy>
    <input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="op" value="recheck"><input type="hidden" name="d" value="${esc(v.domain)}"><input type="hidden" name="back" value="${esc(o.back)}">
    <button class="hp-btn hp-btn--ghost ac-sm" type="submit"${o.canRecheck === false ? ' disabled' : ''}>${icon('refresh')}${esc(t('Re-check now'))}</button></form>`;
  const head = `<div class="ac-hh"><div>${healthBadge(v)} <small>${esc(v.lastChecked ? t('Last checked {d}', { d: fmtDateTime(new Date(v.lastChecked).toISOString()) }) : t('Not checked yet. The first check runs within a day.'))}</small></div>${recheck}</div>`;
  const flash = o.flash ? `<div class="ac-alert ac-alert--${o.flash.tone}" role="${o.flash.tone === 'ok' ? 'status' : 'alert'}">${o.flash.tone === 'ok' ? okMark() : icon('alert')}<span>${esc(o.flash.text)}</span></div>` : '';
  const body = list.length
    ? `<ul class="ac-hx">${list.map(([k, i]) => issueItem(v, k, i, csrf, o)).join('')}</ul>`
    : v.lastChecked ? `<p class="ac-ok-line">${icon('check')}${esc(t('All checks passed. We check this domain every day and email you if something goes wrong.'))}</p>` : '';
  const extOffered = v.external || list.some(([k]) => k === 'ns_external' || k === 'a_mismatch');
  const ext = extOffered ? `<form method="post" action="/account/health" class="ac-hext">
      <input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="op" value="external"><input type="hidden" name="d" value="${esc(v.domain)}"><input type="hidden" name="back" value="${esc(o.back)}"><input type="hidden" name="on" value="${v.external ? '0' : '1'}">
      <p>${esc(v.external ? t('You told us the DNS or website for this domain is managed elsewhere on purpose, so we do not flag it.') : t('Is the DNS or the website for this domain managed elsewhere on purpose? Tell us and we stop flagging it.'))}</p>
      <button class="hp-btn hp-btn--ghost ac-sm" type="submit">${esc(v.external ? t('Check it again') : t('Yes, this is on purpose'))}</button></form>` : '';
  return `${flash}${head}${body}${list.length ? '' : passedGrid(v)}${ext}`;
}

/** Health card on /account/domains/<id> (anchor #health). */
export function healthPanel(v: HealthView | null, csrf: string, o: { back: string; flash?: { tone: 'ok' | 'err' | 'warn'; text: string } | null }) {
  const body = v ? healthBody(v, csrf, { back: o.back, flash: o.flash })
    : `<p class="ac-muted">${esc(t('Not checked yet. The first check runs within a day.'))}</p>`;
  return `${HEALTH_CSS}<div id="health">${card(t('Health'), body, { id: 'ac-hp-h', action: v ? `<a class="ac-more" href="${esc(healthHref(v.domain))}">${esc(t('All domains'))}${icon('right')}</a>` : '' })}</div>`;
}

/** /account/health: every domain with its status, and the selected one in full. */
export function healthPage(rows: HealthView[], csrf: string, o: { selected?: HealthView | null; fixTarget?: string; flash?: { tone: 'ok' | 'err' | 'warn'; text: string } | null; prefsOff?: boolean }) {
  const crit = rows.filter((r) => r.status === 'critical').length, warn = rows.filter((r) => r.status === 'warning').length;
  const intro = `<p class="ac-muted">${esc(t('We check every domain on your account once a day: SSL certificate, website, DNS, nameservers and email authentication. You get an email only when something new goes wrong or gets worse.'))}${o.prefsOff ? ` <a href="/account/settings#reminders">${esc(t('Health alert emails are off'))}</a>` : ''}</p>`;
  const sel = o.selected ? card(o.selected.domain, healthBody(o.selected, csrf, { back: healthHref(o.selected.domain), fixTarget: o.fixTarget, flash: o.flash }), { id: 'ac-hs-h', cls: 'ac-hsel' }) : '';
  const table = rows.length ? `<div class="ac-pf__tw"><table class="ac-htbl"><thead><tr><th scope="col">${esc(t('Domain'))}</th><th scope="col">${esc(t('Status'))}</th><th scope="col">${esc(t('Last checked'))}</th><th scope="col"><span class="sr-only">${esc(t('Actions'))}</span></th></tr></thead><tbody>
    ${rows.map((r) => { const top = sorted(r)[0]; return `<tr><th scope="row"><a class="ac-mono ac-strong" href="${esc(healthHref(r.domain))}">${esc(r.domain)}</a>${top ? `<small>${esc(issueCopy(top[0], top[1].params, lang()).title)}</small>` : ''}</th>
      <td>${healthBadge(r)}</td><td><small>${esc(r.lastChecked ? fmtDateTime(new Date(r.lastChecked).toISOString()) : t('Not checked yet'))}</small></td>
      <td class="ac-htbl__a"><a class="hp-btn hp-btn--ghost ac-sm" href="${esc(healthHref(r.domain))}">${esc(t('Details'))}</a></td></tr>`; }).join('')}</tbody></table></div>`
    : `<p class="ac-muted">${esc(t('No domains to check yet.'))}</p>`;
  return { sub: rows.length ? (crit ? tn(crit, '{n} domain needs urgent attention', '{n} domains need urgent attention') : warn ? tn(warn, '{n} domain needs attention', '{n} domains need attention') : t('All your domains look healthy.')) : t('Daily checks of your domains.'),
    body: `${HEALTH_CSS}${o.flash && !o.selected ? `<div class="ac-alert ac-alert--${o.flash.tone}" role="status">${icon('alert')}<span>${esc(o.flash.text)}</span></div>` : ''}${sel}${card(t('Your domains'), intro + table, { id: 'ac-hx-h', flush: false })}` };
}

/** Dashboard strip: urgent problems only (nothing when all is well). */
export function healthStrip(rows: HealthView[]) {
  const crit = rows.filter((r) => r.status === 'critical');
  if (!crit.length) return '';
  const l = lang();
  const items = crit.slice(0, 3).map((r) => { const top = sorted(r)[0]; return `<li><a class="ac-mono" href="${esc(healthHref(r.domain))}">${esc(r.domain)}</a>: ${esc(top ? issueCopy(top[0], top[1].params, l).title : '')}</li>`; }).join('');
  return `${HEALTH_CSS}<div class="ac-hstrip" role="alert">${icon('alert')}<div><b>${esc(tn(crit.length, '{n} domain needs urgent attention', '{n} domains need urgent attention'))}</b><ul>${items}</ul>${crit.length > 3 ? `<a href="/account/health">${esc(t('See all'))}</a>` : ''}</div></div>`;
}
