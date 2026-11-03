// Account dashboard: greeting + key numbers, Next renewals, My Products, invoices due, hosting usage, recent tickets.
import { renewalsCard, usageCard } from './renewals';
import type { RenewalInvoices } from '../api';
import { hexIcon, card, daysUntil, empty, errorBox, esc, fmtDate, icon, ipList, money, pill, productIcon, ssoButton, btn, cycleLabel, t } from './kit';
import { tn } from '../i18n';

type R<T> = { ok: true; v: T } | { ok: false };

export function productRow(p: any, csrf: string, cur: string) {
  const d = daysUntil(p.nextduedate);
  const host = p.domain || p.serverhostname || ipList(p)[0] || '';
  const soon = d !== null && d >= 0 && d <= 30 && /active/i.test(p.status);
  const due = d === null ? `<span class="ac-muted">${esc(t('No renewal'))}</span>` : `<b class="num">${esc(fmtDate(p.nextduedate))}</b><small class="${soon ? 'is-soon' : ''}">${esc(d < 0 ? tn(-d, '{n} day overdue', '{n} days overdue') : d === 0 ? t('Due today') : tn(d, 'in {n} day', 'in {n} days'))}</small>`;
  return `<li class="ac-prow">
    ${hexIcon(productIcon(p))}
    <div class="ac-prow__main"><a class="ac-prow__name" href="/account/services/${esc(p.id)}">${esc(p.translated_name || p.name || t('Service'))}</a>
      <span class="ac-prow__meta">${host ? `<span class="ac-mono">${esc(host)}</span>` : ''}${p.groupname ? `<span>${esc(p.translated_groupname || p.groupname)}</span>` : ''}</span></div>
    <div class="ac-prow__st">${pill(p.status)}</div>
    <div class="ac-prow__due"><small class="ac-k">${esc(t('Renews'))}</small>${due}${p.recurringamount && parseFloat(p.recurringamount) > 0 ? `<small class="num ac-muted">${esc(money(p.recurringamount, cur))} · ${esc(cycleLabel(p.billingcycle))}</small>` : ''}</div>
    <div class="ac-prow__act">${soon ? ssoButton(csrf, 'service', p.id, t('Renew'), { sm: true }) : ''}<a class="hp-btn hp-btn--ghost ac-sm" href="/account/services/${esc(p.id)}">${esc(t('Manage'))}</a></div>
  </li>`;
}

export function dashboardView(o: {
  csrf: string; client: R<any>; products: R<any[]>; domains: R<any[]>; unpaid: R<any[]>; tickets: R<any[]>; inv?: RenewalInvoices; cur?: string;
}) {
  const c = o.client.ok ? o.client.v : {};
  const cur = c.currency_code || o.cur || 'USD';
  const first = String(c.firstname || '').trim();
  const hour = new Date().getUTCHours() + 4; // Dubai (UTC+4) greeting
  const greet = (hour % 24) < 12 ? t('Good morning') : (hour % 24) < 18 ? t('Good afternoon') : t('Good evening');

  const prods = o.products.ok ? o.products.v : [];
  const active = prods.filter((p) => /active/i.test(p.status));
  const doms = o.domains.ok ? o.domains.v : [];
  const unpaid = o.unpaid.ok ? o.unpaid.v : [];
  const due = unpaid.reduce((s, i) => s + (parseFloat(i.balance ?? i.total) || 0), 0);
  // services past their due date with no invoice yet still count as money owed
  const overdue = active.filter((p) => { const n = daysUntil(p.nextduedate); return n !== null && n < 0 && (parseFloat(p.recurringamount) || 0) > 0; });
  const overdueAmt = unpaid.length ? 0 : overdue.reduce((s, p) => s + (parseFloat(p.recurringamount) || 0), 0);
  const owed = due + overdueAmt;
  const dueSub = !o.unpaid.ok ? '' : unpaid.length ? `${tn(unpaid.length, '{n} unpaid invoice', '{n} unpaid invoices')}${overdue.length ? ` · ${t('{n} overdue', { n: overdue.length })}` : ''}`
    : overdue.length ? tn(overdue.length, '{n} service overdue', '{n} services overdue') : t('All paid up');
  const tickets = o.tickets.ok ? o.tickets.v : [];
  const dash = (ok: boolean, v: string) => (ok ? v : '—');

  // Amount due lands where the customer can pay: unpaid invoices → pay all in one checkout (POST, single sign-on);
  // overdue services without an invoice → one service: its renew-and-pay page; several: the renewal centre.
  const overdueNoInv = overdue.filter((p) => !o.inv?.services.has(Number(p.id)));
  const amountDuePost: { to: string; id?: number } | null = !o.unpaid.ok ? null
    : unpaid.length ? (unpaid.length === 1 ? { to: 'invoice', id: Number(unpaid[0].id) } : { to: 'masspay' })
    : overdueNoInv.length === 1 ? { to: 'service_renew', id: Number(overdueNoInv[0].id) } : null;
  const amountDueHref = unpaid.length || !overdue.length ? '/account/invoices?status=Unpaid' : '/account/renewals#rw-overdue';
  const stats: [string, string, string, string, string?][] = [
    ['/account/services', t('Active services'), dash(o.products.ok, String(active.length)), 'server', prods.length > active.length ? t('{n} in total', { n: prods.length }) : ''],
    ['/account/domains', t('Domains'), dash(o.domains.ok, String(doms.length)), 'globe', ''],
    [amountDueHref, t('Amount due'), dash(o.unpaid.ok, money(owed, unpaid[0]?.currencycode || cur)), 'card', dueSub],
    ['/account/support', t('Open tickets'), dash(o.tickets.ok, String(tickets.length)), 'headset', ''],
  ];
  const attention = (unpaid.length ? 1 : 0) + overdue.length + doms.filter((d) => { const n = daysUntil(d.expirydate); return n !== null && n <= 30 && /active/i.test(d.status); }).length;
  const summary = !o.products.ok ? t('Here is your account at a glance.')
    : overdue.length ? tn(overdue.length, '{n} service is overdue — renew now to avoid suspension.', '{n} services are overdue — renew now to avoid suspension.')
    : attention ? tn(attention, 'You have {n} item that needs attention.', 'You have {n} items that need attention.')
    : prods.length ? t('Everything is running. Nothing needs your attention today.') : t('Your account is ready. Add your first service to get started.');

  const statsHtml = `<div class="hp-stats hp-stats--4 ac-stats">${stats.map(([h, l, v, ic, sub], i) => {
    const due = ic === 'card';
    const cls = `hp-stat${due && (overdue.length || unpaid.length) ? ' is-alert' : ''}`;
    const inner = `<span class="ac-stats__l">${icon(ic)}${l}</span><b class="num"${/\d/.test(v) && v !== '0' ? ' data-count' : ''}>${esc(v)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
    if (due && amountDuePost) {
      const label = amountDuePost.to === 'service_renew' ? t('Renew and pay now') : unpaid.length > 1 ? t('Pay all due now') : t('Pay now');
      return `<form method="post" action="/account/sso" class="ac-stat-f" data-reveal style="--i:${i}"><input type="hidden" name="csrf" value="${esc(o.csrf)}"><input type="hidden" name="to" value="${esc(amountDuePost.to)}">${amountDuePost.id ? `<input type="hidden" name="id" value="${esc(amountDuePost.id)}">` : ''}<button type="submit" class="${cls}">${inner}<em class="ac-stat-cta">${esc(label)}${icon('arrow')}</em></button></form>`;
    }
    return `<a class="${cls}" href="${h}" data-reveal style="--i:${i}">${inner}${due && overdue.length && !unpaid.length ? `<em class="ac-stat-cta">${esc(t('Renew and pay'))}${icon('arrow')}</em>` : ''}</a>`;
  }).join('')}</div>`;

  const order = (a: any, b: any) => Number(/active/i.test(b.status)) - Number(/active/i.test(a.status)) || String(a.nextduedate).localeCompare(String(b.nextduedate));
  const shown = [...prods].filter((p) => !/terminated|cancelled|fraud/i.test(p.status)).sort(order).slice(0, 6);
  const products = card(t('My Products'), !o.products.ok ? errorBox(t('your products'), '/account')
    : shown.length ? `<ul class="ac-plist">${shown.map((p) => productRow(p, o.csrf, cur)).join('')}</ul>`
    : empty(t('No products yet'), t('Hosting, servers and SSL certificates you order appear here with their status and renewal dates.'), btn(t('Browse hosting'), '/web-hosting', { variant: 'brand' }), 'box'),
  { id: 'ac-prod-h', flush: true, action: prods.length ? `<a class="ac-more" href="/account/services">${esc(prods.length > shown.length ? t('View all {n}', { n: prods.length }) : t('View all'))}${icon('right')}</a>` : '' });

  const inv = card(t('Invoices due'), !o.unpaid.ok ? errorBox(t('your invoices'), '/account')
    : unpaid.length ? `<ul class="ac-mini">${unpaid.slice(0, 4).map((i) => { const d = daysUntil(i.duedate); return `<li>
        <div><a href="/account/invoices/${esc(i.id)}">${esc(t('Invoice #{n}', { n: i.invoicenum || i.id }))}</a><small class="${d !== null && d < 0 ? 'is-bad' : ''}">${esc(d !== null && d < 0 ? t('Overdue since {d}', { d: fmtDate(i.duedate) }) : t('Due {d}', { d: fmtDate(i.duedate) }))}</small></div>
        <b class="num">${esc(money(i.balance ?? i.total, i.currencycode || cur))}</b>${ssoButton(o.csrf, 'invoice', i.id, t('Pay'), { sm: true })}</li>`; }).join('')}</ul>`
    : `<p class="ac-ok-line">${icon('check')}${esc(t("You're all paid up."))}</p>`,
  { id: 'ac-inv-h', i: 1, action: `<a class="ac-more" href="/account/invoices">${esc(t('Billing'))}${icon('right')}</a>` });

  const renewals = renewalsCard({ csrf: o.csrf, cur, products: o.products, domains: o.domains, unpaid: o.unpaid, inv: o.inv });
  const usage = usageCard({ csrf: o.csrf, products: o.products, i: 2 });

  const tix = card(t('Recent tickets'), !o.tickets.ok ? errorBox(t('your tickets'), '/account')
    : tickets.length ? `<ul class="ac-mini">${tickets.slice(0, 4).map((tk) => `<li>
        <div><a href="/account/support/${esc(tk.id)}">${esc(tk.subject || t('Ticket'))}</a><small>#${esc(tk.tid)} · ${esc(t('updated {d}', { d: fmtDate(tk.lastreply || tk.date) }))}</small></div>${pill(tk.status)}</li>`).join('')}</ul>`
    : `<p class="ac-ok-line">${icon('check')}${esc(t('No open tickets.'))}</p>`,
  { id: 'ac-tix-h', i: 3, action: `<a class="ac-more" href="/account/support/new">${esc(t('New ticket'))}${icon('right')}</a>` });

  const promo = `<aside class="ac-promo" aria-label="${esc(t('Add a service'))}" data-reveal style="--i:1">
    <div><b>${esc(t('Add a server or a domain'))}</b><p>${esc(t('VPS and dedicated servers, domains and SSL, all managed from this same account.'))}</p></div>
    <div class="ac-promo__a"><a class="hp-btn hp-btn--light ac-sm" href="/vps-hosting">${icon('cloud')}${esc(t('VPS servers'))}</a><a class="hp-btn hp-btn--outline ac-sm" href="/domains-registration">${icon('globe')}${esc(t('Find a domain'))}</a></div>
  </aside>`;

  // AI connector (lib/connector/promo.ts): manage this account from Claude or ChatGPT
  const ai = `<aside class="ac-aic" aria-label="${esc(t('Connected apps'))}" data-reveal style="--i:2">
    <img src="/icon-192.png" alt="" width="40" height="40" loading="lazy">
    <div><b>${esc(t('Connect GlobalHostia in Claude or ChatGPT to manage your account by chat.'))}</b><a class="ac-more" href="/account/apps">${esc(t('Connected apps'))}${icon('right')}</a></div>
    <div class="ac-aic__a"><a class="hp-btn hp-btn--brand ac-sm" href="/connectors#claude">${esc(t('Connect {a}', { a: 'Claude' }))}</a><a class="hp-btn hp-btn--ghost ac-sm" href="/connectors#chatgpt">${esc(t('Connect {a}', { a: 'ChatGPT' }))}</a></div>
  </aside>`;

  return { greeting: `${greet}${first ? `, ${first}` : ''}`, summary, alert: overdue.length > 0 || unpaid.length > 0, statsHtml, body: `<div class="ac-grid"><div class="ac-col">${renewals}${products}${promo}${ai}</div><div class="ac-col">${inv}${usage}${tix}</div></div>` };
}
