// Billing: invoice list (filter) and invoice detail. Payment happens in the secure client area.
import { hexIcon, card, daysUntil, empty, esc, fmtDate, icon, money, pill, ssoButton } from './kit';

export const INVOICE_FILTERS: [string, string][] = [['', 'All'], ['Unpaid', 'Unpaid'], ['Paid', 'Paid'], ['Cancelled', 'Cancelled']];

export function invoicesView(o: { csrf: string; list: any[]; status: string; cur: string; unpaidTotal: number | null; unpaidCount: number }) {
  const seg = `<nav class="hp-seg ac-seg" aria-label="Filter invoices">${INVOICE_FILTERS.map(([k, l]) =>
    `<a href="/account/invoices${k ? `?status=${k}` : ''}"${k === o.status ? ' aria-current="true" class="is-on"' : ''}>${l}</a>`).join('')}</nav>`;
  const due = o.unpaidTotal !== null && o.unpaidCount ? `<div class="ac-due">
    ${hexIcon('card')}
    <div><small>Balance due</small><b class="num">${esc(money(o.unpaidTotal, o.cur))}</b><span>${o.unpaidCount} unpaid invoice${o.unpaidCount === 1 ? '' : 's'}</span></div>
    ${ssoButton(o.csrf, 'invoices', undefined, 'Pay now', { variant: 'brand', ic: 'lock' })}
  </div>` : '';
  const rows = o.list.map((i) => {
    const d = daysUntil(i.duedate);
    const overdue = /unpaid/i.test(i.status) && d !== null && d < 0;
    return `<tr>
      <th scope="row"><a class="ac-strong" href="/account/invoices/${esc(i.id)}">#${esc(i.invoicenum || i.id)}</a></th>
      <td data-l="Date" class="num">${esc(fmtDate(i.date))}</td>
      <td data-l="Due" class="num">${esc(fmtDate(i.duedate))}${overdue ? ' <small class="is-bad">overdue</small>' : ''}</td>
      <td data-l="Total" class="num ac-strong">${esc(money(i.total, i.currencycode || o.cur))}</td>
      <td data-l="Status">${overdue ? pill('Overdue') : pill(i.status)}</td>
      <td class="ac-td-act">${/unpaid/i.test(i.status) ? ssoButton(o.csrf, 'invoice', i.id, 'Pay', { variant: 'brand', sm: true }) : ''}<a class="hp-btn hp-btn--ghost ac-sm" href="/account/invoices/${esc(i.id)}">View</a></td></tr>`;
  }).join('');
  const body = o.list.length
    ? `<table class="ac-table ac-table--rows"><thead><tr><th scope="col">Invoice</th><th scope="col">Date</th><th scope="col">Due</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table>`
    : empty(o.status ? `No ${o.status.toLowerCase()} invoices` : 'No invoices yet', o.status === 'Unpaid' ? "You're all paid up." : 'Invoices for your orders and renewals appear here.', '', 'card');
  return `${due}${seg}${card('Invoices', body, { id: 'ac-inv-h', flush: true })}`;
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
      <div><h2 id="ac-doc-h">Invoice #${esc(i.invoicenum || i.invoiceid)}</h2>${pill(i.status)}</div>
      <dl class="ac-doc__meta"><div><dt>Issued</dt><dd class="num">${esc(fmtDate(i.date))}</dd></div><div><dt>Due</dt><dd class="num">${esc(fmtDate(i.duedate))}</dd></div>${/paid/i.test(i.status) && !unpaid ? `<div><dt>Paid</dt><dd class="num">${esc(fmtDate(i.datepaid))}</dd></div>` : ''}</dl>
    </header>
    ${addr.length ? `<div class="ac-doc__to"><small>Billed to</small>${addr.map((l) => `<span>${esc(l)}</span>`).join('')}</div>` : ''}
    <table class="ac-table ac-table--lines"><thead><tr><th scope="col">Description</th><th scope="col" class="ac-r">Amount</th></tr></thead><tbody>${lines || `<tr><td colspan="2" class="ac-muted">No line items.</td></tr>`}</tbody></table>
    <table class="ac-totals"><tbody>${tot('subtotal', 'Subtotal')}${tot('credit', 'Credit applied')}${tot('tax', `Tax${i.taxrate && parseFloat(i.taxrate) ? ` (${esc(parseFloat(i.taxrate))}%)` : ''}`)}${tot('tax2', 'Tax 2')}${tot('total', 'Total', true)}${unpaid ? tot('balance', 'Balance due', true) : ''}</tbody></table>
  </article>`;
  const side = card(unpaid ? 'Pay this invoice' : 'Payment', `${unpaid
    ? `<p class="ac-big num">${esc(money(i.balance ?? i.total, cur))}</p><p class="ac-muted">Pay securely by card or another supported method. Your card details are handled by our payment provider, never by this website.</p>`
    : `<p class="ac-ok-line">${icon('check')}${/paid/i.test(i.status) ? `Paid on ${esc(fmtDate(i.datepaid))}` : `This invoice is ${esc(String(i.status).toLowerCase())}.`}</p>`}
    ${i.paymentmethod ? `<p class="ac-muted ac-small">Payment method: ${esc(i.paymentmethod)}</p>` : ''}
    <div class="ac-card__foot ac-card__foot--stack">${unpaid ? ssoButton(o.csrf, 'invoice', i.invoiceid, 'Pay now', { variant: 'brand', ic: 'lock', block: true }) : ''}${ssoButton(o.csrf, 'invoice_pdf', i.invoiceid, 'Download PDF', { ic: 'download', block: true })}</div>`, { id: 'ac-pay-h' });
  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${doc}</div><div class="ac-col">${side}</div></div>`;
}
