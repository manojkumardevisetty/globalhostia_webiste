// Account dashboard: greeting + key numbers, Next renewals, My Products, invoices due, hosting usage, recent tickets.
import { renewalsCard, usageCard } from './renewals';
import type { RenewalInvoices } from '../api';
import { hexIcon, card, daysUntil, empty, errorBox, esc, fmtDate, icon, ipList, money, pill, productIcon, ssoButton, btn } from './kit';

type R<T> = { ok: true; v: T } | { ok: false };

export function productRow(p: any, csrf: string, cur: string) {
  const d = daysUntil(p.nextduedate);
  const host = p.domain || p.serverhostname || ipList(p)[0] || '';
  const soon = d !== null && d >= 0 && d <= 30 && /active/i.test(p.status);
  const due = d === null ? '<span class="ac-muted">No renewal</span>' : `<b class="num">${esc(fmtDate(p.nextduedate))}</b><small class="${soon ? 'is-soon' : ''}">${d < 0 ? `${-d} days overdue` : d === 0 ? 'Due today' : `in ${d} day${d === 1 ? '' : 's'}`}</small>`;
  return `<li class="ac-prow">
    ${hexIcon(productIcon(p))}
    <div class="ac-prow__main"><a class="ac-prow__name" href="/account/services/${esc(p.id)}">${esc(p.translated_name || p.name || 'Service')}</a>
      <span class="ac-prow__meta">${host ? `<span class="ac-mono">${esc(host)}</span>` : ''}${p.groupname ? `<span>${esc(p.translated_groupname || p.groupname)}</span>` : ''}</span></div>
    <div class="ac-prow__st">${pill(p.status)}</div>
    <div class="ac-prow__due"><small class="ac-k">Renews</small>${due}${p.recurringamount && parseFloat(p.recurringamount) > 0 ? `<small class="num ac-muted">${esc(money(p.recurringamount, cur))} ${esc(String(p.billingcycle || '').toLowerCase())}</small>` : ''}</div>
    <div class="ac-prow__act">${soon ? ssoButton(csrf, 'service', p.id, 'Renew', { sm: true }) : ''}<a class="hp-btn hp-btn--dark ac-sm" href="/account/services/${esc(p.id)}">Manage</a></div>
  </li>`;
}

export function dashboardView(o: {
  csrf: string; client: R<any>; products: R<any[]>; domains: R<any[]>; unpaid: R<any[]>; tickets: R<any[]>; inv?: RenewalInvoices; cur?: string;
}) {
  const c = o.client.ok ? o.client.v : {};
  const cur = c.currency_code || o.cur || 'USD';
  const first = String(c.firstname || '').trim();
  const hour = new Date().getUTCHours() + 4; // Dubai (UTC+4) greeting
  const greet = (hour % 24) < 12 ? 'Good morning' : (hour % 24) < 18 ? 'Good afternoon' : 'Good evening';

  const prods = o.products.ok ? o.products.v : [];
  const active = prods.filter((p) => /active/i.test(p.status));
  const doms = o.domains.ok ? o.domains.v : [];
  const unpaid = o.unpaid.ok ? o.unpaid.v : [];
  const due = unpaid.reduce((s, i) => s + (parseFloat(i.balance ?? i.total) || 0), 0);
  const tickets = o.tickets.ok ? o.tickets.v : [];
  const dash = (ok: boolean, v: string) => (ok ? v : '—');

  const stats: [string, string, string, string, string?][] = [
    ['/account/services', 'Active services', dash(o.products.ok, String(active.length)), 'server', prods.length > active.length ? `${prods.length} in total` : ''],
    ['/account/domains', 'Domains', dash(o.domains.ok, String(doms.length)), 'globe', ''],
    ['/account/invoices?status=Unpaid', 'Amount due', dash(o.unpaid.ok, money(due, unpaid[0]?.currencycode || cur)), 'card', o.unpaid.ok ? (unpaid.length ? `${unpaid.length} unpaid invoice${unpaid.length === 1 ? '' : 's'}` : 'All paid up') : ''],
    ['/account/support', 'Open tickets', dash(o.tickets.ok, String(tickets.length)), 'headset', ''],
  ];
  const attention = (unpaid.length ? 1 : 0) + doms.filter((d) => { const n = daysUntil(d.expirydate); return n !== null && n <= 30 && /active/i.test(d.status); }).length;
  const summary = !o.products.ok ? 'Here is your account at a glance.'
    : attention ? `You have ${attention} item${attention === 1 ? '' : 's'} that need${attention === 1 ? 's' : ''} attention.`
    : prods.length ? 'Everything is running. Nothing needs your attention today.' : 'Your account is ready. Add your first service to get started.';

  const statsHtml = `<div class="hp-stats hp-stats--4 ac-stats">${stats.map(([h, l, v, ic, sub], i) => `<a class="hp-stat" href="${h}" data-reveal style="--i:${i}"><span class="ac-stats__l">${icon(ic)}${l}</span><b class="num"${/\d/.test(v) && v !== '0' ? ' data-count' : ''}>${esc(v)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</a>`).join('')}</div>`;

  const order = (a: any, b: any) => Number(/active/i.test(b.status)) - Number(/active/i.test(a.status)) || String(a.nextduedate).localeCompare(String(b.nextduedate));
  const shown = [...prods].filter((p) => !/terminated|cancelled|fraud/i.test(p.status)).sort(order).slice(0, 6);
  const products = card('My Products', !o.products.ok ? errorBox('your products', '/account')
    : shown.length ? `<ul class="ac-plist">${shown.map((p) => productRow(p, o.csrf, cur)).join('')}</ul>`
    : empty('No products yet', 'Hosting, servers and SSL certificates you order appear here with their status and renewal dates.', btn('Browse hosting', '/web-hosting', { variant: 'brand' }), 'box'),
  { id: 'ac-prod-h', flush: true, action: prods.length ? `<a class="ac-more" href="/account/services">View all${prods.length > shown.length ? ` ${prods.length}` : ''}${icon('right')}</a>` : '' });

  const inv = card('Invoices due', !o.unpaid.ok ? errorBox('your invoices', '/account')
    : unpaid.length ? `<ul class="ac-mini">${unpaid.slice(0, 4).map((i) => { const d = daysUntil(i.duedate); return `<li>
        <div><a href="/account/invoices/${esc(i.id)}">Invoice #${esc(i.invoicenum || i.id)}</a><small class="${d !== null && d < 0 ? 'is-bad' : ''}">${d !== null && d < 0 ? `Overdue since ${esc(fmtDate(i.duedate))}` : `Due ${esc(fmtDate(i.duedate))}`}</small></div>
        <b class="num">${esc(money(i.balance ?? i.total, i.currencycode || cur))}</b>${ssoButton(o.csrf, 'invoice', i.id, 'Pay', { variant: 'brand', sm: true })}</li>`; }).join('')}</ul>`
    : `<p class="ac-ok-line">${icon('check')}You're all paid up.</p>`,
  { id: 'ac-inv-h', i: 1, action: `<a class="ac-more" href="/account/invoices">Billing${icon('right')}</a>` });

  const renewals = renewalsCard({ csrf: o.csrf, cur, products: o.products, domains: o.domains, unpaid: o.unpaid, inv: o.inv });
  const usage = usageCard({ csrf: o.csrf, products: o.products, i: 2 });

  const tix = card('Recent tickets', !o.tickets.ok ? errorBox('your tickets', '/account')
    : tickets.length ? `<ul class="ac-mini">${tickets.slice(0, 4).map((t) => `<li>
        <div><a href="/account/support/${esc(t.id)}">${esc(t.subject || 'Ticket')}</a><small>#${esc(t.tid)} · updated ${esc(fmtDate(t.lastreply || t.date))}</small></div>${pill(t.status)}</li>`).join('')}</ul>`
    : `<p class="ac-ok-line">${icon('check')}No open tickets.</p>`,
  { id: 'ac-tix-h', i: 3, action: `<a class="ac-more" href="/account/support/new">New ticket${icon('right')}</a>` });

  const promo = `<aside class="ac-promo" aria-label="Add a service" data-reveal style="--i:1">
    <div><b>Add a server or a domain</b><p>VPS and dedicated servers, domains and SSL, all managed from this same account.</p></div>
    <div class="ac-promo__a"><a class="hp-btn hp-btn--light ac-sm" href="/vps-hosting">${icon('cloud')}VPS servers</a><a class="hp-btn hp-btn--outline ac-sm" href="/domains-registration">${icon('globe')}Find a domain</a></div>
  </aside>`;

  return { greeting: `${greet}${first ? `, ${first}` : ''}`, summary, statsHtml, body: `<div class="ac-grid"><div class="ac-col">${renewals}${products}${promo}</div><div class="ac-col">${inv}${usage}${tix}</div></div>` };
}
