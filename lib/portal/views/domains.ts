// Domains: list and detail with nameserver editing.
import { RENEW_WINDOW, daysBadge, renewAllDomainsButton } from './renewals';
import { card, daysUntil, dl, empty, esc, fmtDate, icon, money, pill, ssoButton, btn, fieldErr, invalid } from './kit';

const autoRenew = (d: any) => !(d.donotrenew === true || d.donotrenew === 1 || d.donotrenew === '1');
const expiryNote = (d: any) => {
  const n = daysUntil(d.expirydate);
  if (n === null) return '';
  const cls = n <= 14 ? 'is-bad' : n <= 60 ? 'is-soon' : 'ac-muted';
  return `<small class="${cls}">${n < 0 ? `expired ${-n} days ago` : `in ${n} day${n === 1 ? '' : 's'}`}</small>`;
};

const renewable = (d: any) => /^(active|grace|redemption|expired)$/i.test(String(d.status || ''));

export function domainsView(o: { csrf: string; domains: any[]; cur: string; invoices?: Map<number, number> }) {
  if (!o.domains.length) return { headAction: '', body: card('Your domains', empty('No domains yet', 'Search for the perfect name, or transfer a domain you already own.', `${btn('Find a domain', '/domains-registration', { variant: 'brand', ic: 'search' })}`, 'globe'), { id: 'ac-dl-h' }) };
  const soon = (d: any) => { const n = daysUntil(d.expirydate); return renewable(d) && n !== null && n <= RENEW_WINDOW; };
  const toRenew = o.domains.filter((d) => soon(d) && !o.invoices?.has(Number(d.id))).length;
  const rows = [...o.domains].sort((a, b) => String(a.expirydate).localeCompare(String(b.expirydate))).map((d) => {
    const inv = o.invoices?.get(Number(d.id));
    const act = !soon(d) ? '' : inv ? ssoButton(o.csrf, 'invoice', inv, 'Pay invoice', { variant: 'brand', sm: true }) : ssoButton(o.csrf, 'domain_renew', d.id, 'Renew', { sm: true });
    return `<tr>
    <th scope="row"><a class="ac-mono ac-strong" href="/account/domains/${esc(d.id)}">${esc(d.domainname)}</a></th>
    <td data-l="Status">${pill(d.status)}</td>
    <td data-l="Expires"><span class="num">${esc(fmtDate(d.expirydate))}</span> ${soon(d) ? daysBadge(daysUntil(d.expirydate)) : expiryNote(d)}</td>
    <td data-l="Renewal"><span class="num">${parseFloat(d.recurringamount) > 0 ? esc(money(d.recurringamount, o.cur)) : '—'}</span></td>
    <td data-l="Auto-renew">${autoRenew(d) ? `<span class="ac-on">${icon('check')}On</span>` : '<span class="ac-off">Off</span>'}</td>
    <td class="ac-td-act"><div class="ac-td-btns">${act}<a class="hp-btn hp-btn--dark ac-sm" href="/account/domains/${esc(d.id)}">Manage</a></div></td></tr>`;
  }).join('');
  return {
    headAction: renewAllDomainsButton(o.csrf, toRenew),
    body: card(`Your domains`, `<table class="ac-table ac-table--rows"><thead><tr><th scope="col">Domain</th><th scope="col">Status</th><th scope="col">Expires</th><th scope="col">Renewal</th><th scope="col">Auto-renew</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table>`,
      { id: 'ac-dl-h', flush: true, action: `<a class="ac-more" href="/domains-registration">Register another${icon('right')}</a>` }),
  };
}

export function domainDetailView(o: { csrf: string; d: any; cur: string; ns: string[] | null; nsInput?: string[]; errs?: Record<string, string> }) {
  const d = o.d;
  const editable = /active/i.test(d.status);
  const vals = o.nsInput || o.ns || [];
  const fields = [0, 1, 2, 3, 4].map((i) => {
    const k = `ns${i + 1}`;
    return `<div class="ac-field"><label for="ac-${k}">Nameserver ${i + 1}${i < 2 ? '' : ' <span class="ac-muted">(optional)</span>'}</label>
      <input class="ac-input ac-mono" id="ac-${k}" name="${k}" value="${esc(vals[i] || '')}" autocomplete="off" spellcheck="false" autocapitalize="none" inputmode="url"${i < 2 ? ' required' : ''} placeholder="${i < 2 ? `ns${i + 1}.example.com` : ''}"${invalid(o.errs, k)}${editable ? '' : ' disabled'}>${fieldErr(o.errs, k)}</div>`;
  }).join('');
  const nsBody = o.ns === null && !o.nsInput
    ? `<div class="ac-alert ac-alert--warn" role="status">${icon('alert')}<span>We couldn't read the current nameservers from the registry. You can still set new ones below.</span></div>`
    : '';
  const nsForm = `${nsBody}${o.errs?.form ? `<div class="ac-alert ac-alert--err" role="alert">${icon('alert')}<span>${esc(o.errs.form)}</span></div>` : ''}
    <form method="post" action="/account/domains/${esc(d.id)}" class="ac-form ac-form--grid" novalidate data-ac-busy>
      <input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="action" value="nameservers">
      ${fields}
      <div class="ac-form__foot"><button class="hp-btn hp-btn--brand" type="submit"${editable ? '' : ' disabled'}>Save nameservers</button>
      <p class="ac-muted">${editable ? 'Changes usually take effect within a few hours, and up to 24 hours worldwide.' : 'Nameservers can be changed once the domain is active.'}</p></div>
    </form>`;

  const overview = card('Domain details', dl([
    ['Status', pill(d.status)],
    ['Registered', `<span class="num">${esc(fmtDate(d.regdate))}</span>`],
    ['Expires', `<span class="num">${esc(fmtDate(d.expirydate))}</span> ${expiryNote(d)}`],
    ['Auto-renew', autoRenew(d) ? `<span class="ac-on">${icon('check')}On</span>` : '<span class="ac-off">Off</span>'],
    ['Renewal price', `<span class="num">${esc(money(d.recurringamount, o.cur))}</span> <span class="ac-muted">/ ${esc(d.regperiod || 1)} yr</span>`],
    ...(d.idprotection !== undefined ? [['ID protection', d.idprotection && d.idprotection !== '0' ? `<span class="ac-on">${icon('check')}On</span>` : '<span class="ac-off">Off</span>'] as [string, string]] : []),
  ]) + `<div class="ac-card__foot ac-card__foot--stack">${ssoButton(o.csrf, 'domain_renew', d.id, 'Renew domain', { variant: 'brand', ic: 'refresh', block: true })}</div>`, { id: 'ac-dd-h' });

  const more = card('More settings', `<ul class="ac-actions">
    <li>${icon('database')}<div><b>DNS records</b><small>A, CNAME, MX and TXT records.</small></div>${ssoButton(o.csrf, 'domain_dns', d.id, 'Open', { sm: true })}</li>
    <li>${icon('users')}<div><b>Contact information</b><small>Registrant, admin and technical contacts.</small></div>${ssoButton(o.csrf, 'domain_contacts', d.id, 'Open', { sm: true })}</li>
    <li>${icon('key')}<div><b>Transfer code and lock</b><small>Get the EPP code or change the registrar lock.</small></div>${ssoButton(o.csrf, 'domain', d.id, 'Open', { sm: true })}</li>
  </ul>`, { id: 'ac-dm-h', flush: true });

  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${card('Nameservers', nsForm, { id: 'ac-ns-h' })}</div><div class="ac-col">${overview}${more}</div></div>`;
}

const HOST = /^(?=.{4,253}$)(?!-)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;
/** Validate nameserver hostnames: ns1 + ns2 required, valid hostnames, no duplicates. */
export function validateNameservers(raw: string[]) {
  const ns = raw.map((x) => String(x || '').trim().toLowerCase().replace(/\.$/, ''));
  const errs: Record<string, string> = {};
  ns.forEach((v, i) => {
    const k = `ns${i + 1}`;
    if (!v) { if (i < 2) errs[k] = 'Enter a nameserver. Domains need at least two.'; return; }
    if (!HOST.test(v)) errs[k] = 'Enter a hostname like ns1.example.com (no http:// or spaces).';
    else if (ns.indexOf(v) !== i) errs[k] = 'This nameserver is already listed above.';
  });
  const filled = ns.filter(Boolean);
  return { ns: filled, errs, ok: !Object.keys(errs).length && filled.length >= 2 };
}
