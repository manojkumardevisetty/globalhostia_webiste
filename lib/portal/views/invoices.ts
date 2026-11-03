// Billing: invoice list (filter) and invoice detail. Payment happens in the secure client area.
import { hexIcon, card, daysUntil, empty, esc, fmtDate, icon, money, pill, ssoButton, t } from './kit';
import { tn } from '../i18n';

export const INVOICE_FILTERS: [string, string][] = [['', 'All'], ['Unpaid', 'Unpaid'], ['Paid', 'Paid'], ['Cancelled', 'Cancelled']];

export function invoicesView(o: { csrf: string; list: any[]; status: string; cur: string; unpaidTotal: number | null; unpaidCount: number }) {
  const seg = `<nav class="hp-seg ac-seg" aria-label="${esc(t('Filter invoices'))}">${INVOICE_FILTERS.map(([k, l]) =>
    `<a href="/account/invoices${k ? `?status=${k}` : ''}"${k === o.status ? ' aria-current="true" class="is-on"' : ''}>${esc(t(l))}</a>`).join('')}</nav>`;
  const due = o.unpaidTotal !== null && o.unpaidCount ? `<div class="ac-due">
    ${hexIcon('card')}
    <div><small>${esc(t('Balance due'))}</small><b class="num">${esc(money(o.unpaidTotal, o.cur))}</b><span>${esc(tn(o.unpaidCount, '{n} unpaid invoice', '{n} unpaid invoices'))}</span></div>
    ${ssoButton(o.csrf, 'invoices', undefined, t('Pay now'), { variant: 'brand', ic: 'lock' })}
  </div>` : '';
  const rows = o.list.map((i) => {
    const d = daysUntil(i.duedate);
    const overdue = /unpaid/i.test(i.status) && d !== null && d < 0;
    return `<tr>
      <th scope="row"><a class="ac-strong" href="/account/invoices/${esc(i.id)}">#${esc(i.invoicenum || i.id)}</a></th>
      <td data-l="${esc(t('Date'))}" class="num">${esc(fmtDate(i.date))}</td>
      <td data-l="${esc(t('Due'))}" class="num">${esc(fmtDate(i.duedate))}${overdue ? ` <small class="is-bad">${esc(t('overdue'))}</small>` : ''}</td>
      <td data-l="${esc(t('Total'))}" class="num ac-strong">${esc(money(i.total, i.currencycode || o.cur))}</td>
      <td data-l="${esc(t('Status'))}">${overdue ? pill('Overdue') : pill(i.status)}</td>
      <td class="ac-td-act">${/unpaid/i.test(i.status) ? ssoButton(o.csrf, 'invoice', i.id, t('Pay'), { variant: 'brand', sm: true }) : ''}<a class="hp-btn hp-btn--ghost ac-sm" href="/account/invoices/${esc(i.id)}">${esc(t('View'))}</a></td></tr>`;
  }).join('');
  const body = o.list.length
    ? `<table class="ac-table ac-table--rows"><thead><tr><th scope="col">${esc(t('Invoice'))}</th><th scope="col">${esc(t('Date'))}</th><th scope="col">${esc(t('Due'))}</th><th scope="col">${esc(t('Total'))}</th><th scope="col">${esc(t('Status'))}</th><th scope="col"><span class="sr-only">${esc(t('Actions'))}</span></th></tr></thead><tbody>${rows}</tbody></table>`
    : empty(o.status ? t('No invoices with this status') : t('No invoices yet'), o.status === 'Unpaid' ? t("You're all paid up.") : t('Invoices for your orders and renewals appear here.'), '', 'card');
  return `${due}${seg}${card(t('Invoices'), body, { id: 'ac-inv-h', flush: true })}`;
}

export function invoiceDetailView(o: { csrf: string; inv: any; client: any }) {
  const i = o.inv, c = o.client || {};
  const cur = i.currencycode || c.currency_code || 'USD';
  const unpaid = /unpaid/i.test(i.status);
  const lines = i.items.map((it: any) => `<tr><td>${esc(String(it.description || '').replace(/\r?\n/g, ' — '))}</td><td class="num ac-r">${esc(money(it.amount, cur))}</td></tr>`).join('');
  const tot = (k: string, label: string, strong = false) => parseFloat(i[k]) || strong ? `<tr${strong ? ' class="is-total"' : ''}><th scope="row">${label}</th><td class="num ac-r">${esc(money(i[k], cur))}</td></tr>` : '';
  const addr = [c.companyname, `${c.firstname || ''} ${c.lastname || ''}`.trim(), c.address1, [c.city, c.state, c.postcode].filter(Boolean).join(', '), c.countryname || c.country].filter(Boolean);
  const doc = `<article class="ac-doc" aria-labelledby="ac-doc-h">
    <header class="ac-doc__head">
      <div><h2 id="ac-doc-h">${esc(t('Invoice #{n}', { n: i.invoicenum || i.invoiceid }))}</h2>${pill(i.status)}</div>
      <dl class="ac-doc__meta"><div><dt>${esc(t('Issued'))}</dt><dd class="num">${esc(fmtDate(i.date))}</dd></div><div><dt>${esc(t('Due'))}</dt><dd class="num">${esc(fmtDate(i.duedate))}</dd></div>${/paid/i.test(i.status) && !unpaid ? `<div><dt>${esc(t('Paid'))}</dt><dd class="num">${esc(fmtDate(i.datepaid))}</dd></div>` : ''}</dl>
    </header>
    ${addr.length ? `<div class="ac-doc__to"><small>${esc(t('Billed to'))}</small>${addr.map((l) => `<span>${esc(l)}</span>`).join('')}</div>` : ''}
    <table class="ac-table ac-table--lines"><thead><tr><th scope="col">${esc(t('Description'))}</th><th scope="col" class="ac-r">${esc(t('Amount'))}</th></tr></thead><tbody>${lines || `<tr><td colspan="2" class="ac-muted">${esc(t('No line items.'))}</td></tr>`}</tbody></table>
    <table class="ac-totals"><tbody>${tot('subtotal', esc(t('Subtotal')))}${tot('credit', esc(t('Credit applied')))}${tot('tax', `${esc(t('Tax'))}${i.taxrate && parseFloat(i.taxrate) ? ` (${esc(parseFloat(i.taxrate))}%)` : ''}`)}${tot('tax2', esc(t('Tax 2')))}${tot('total', esc(t('Total')), true)}${unpaid ? tot('balance', esc(t('Balance due')), true) : ''}</tbody></table>
  </article>`;
  const side = card(unpaid ? t('Pay this invoice') : t('Payment'), `${unpaid
    ? `<p class="ac-big num">${esc(money(i.balance ?? i.total, cur))}</p><p class="ac-muted">${esc(t('Pay securely by card or another supported method. Your card details are handled by our payment provider, never by this website.'))}</p>`
    : `<p class="ac-ok-line">${icon('check')}${esc(/paid/i.test(i.status) ? t('Paid on {d}', { d: fmtDate(i.datepaid) }) : t('This invoice is {s}.', { s: t(String(i.status || 'Unknown')) }))}</p>`}
    ${i.paymentmethod ? `<p class="ac-muted ac-small">${esc(t('Payment method: {m}', { m: i.paymentmethod }))}</p>` : ''}
    <div class="ac-card__foot ac-card__foot--stack">${unpaid ? ssoButton(o.csrf, 'invoice', i.invoiceid, t('Pay now'), { variant: 'brand', ic: 'lock', block: true }) : ''}${ssoButton(o.csrf, 'invoice_pdf', i.invoiceid, t('Download PDF'), { ic: 'download', block: true })}</div>`, { id: 'ac-pay-h' });
  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${doc}</div><div class="ac-col">${side}</div></div>`;
}
