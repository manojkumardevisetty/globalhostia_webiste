// Products & Services: list and detail. Passwords are never shown; login details open in the secure client area.
import { productRow } from './dashboard';
import { usageDetailCard } from './renewals';
import { hexIcon, card, configOptions, cycleLabel, daysUntil, dl, empty, esc, fmtDate, icon, ipList, isServer, money, pill, productIcon, ssoButton, btn } from './kit';

export function servicesView(o: { csrf: string; products: any[]; cur: string; filter: string }) {
  const all = o.products;
  const isActive = (p: any) => /active|pending|suspended/i.test(p.status);
  const groups: [string, string, any[]][] = [
    ['active', 'Current', all.filter(isActive)],
    ['all', 'All', all],
  ];
  const f = groups.find((g) => g[0] === o.filter) ? o.filter : 'active';
  const list = groups.find((g) => g[0] === f)![2].sort((a, b) => String(a.nextduedate).localeCompare(String(b.nextduedate)));
  const seg = `<nav class="hp-seg ac-seg" aria-label="Filter services">${groups.map(([k, l, xs]) => `<a href="/account/services?status=${k}"${k === f ? ' aria-current="true" class="is-on"' : ''}>${l}<span class="num">${xs.length}</span></a>`).join('')}</nav>`;
  const body = list.length ? `<ul class="ac-plist">${list.map((p) => productRow(p, o.csrf, o.cur)).join('')}</ul>`
    : empty(all.length ? 'Nothing to show with this filter' : 'No products yet', all.length ? 'Switch to "All" to see cancelled and expired services.' : 'Hosting, VPS and dedicated servers you order appear here.', btn('Browse hosting', '/web-hosting', { variant: 'brand' }));
  return `${seg}${card(`${f === 'all' ? 'All services' : 'Current services'}`, body, { id: 'ac-svc-h', flush: true })}`;
}

const copyBtn = (v: string, label: string) => `<button type="button" class="ac-copy" data-copy="${esc(v)}" aria-label="Copy ${esc(label)}">${icon('copy')}<span>Copy</span></button>`;

export function serviceDetailView(o: { csrf: string; p: any; cur: string }) {
  const p = o.p, cur = o.cur;
  const ips = ipList(p);
  const opts = configOptions(p);
  const server = isServer(p);
  const active = /active/i.test(p.status);
  const d = daysUntil(p.nextduedate);
  const findOpt = (r: RegExp) => opts.find((x) => r.test(x.label))?.value || '';
  const os = findOpt(/operating|^os\b|os template|image/i), loc = findOpt(/location|region|data ?cent/i);

  const serverCard = server ? `<section class="ac-srv" aria-labelledby="ac-srv-h">
    <div class="ac-srv__head">
      ${hexIcon(productIcon(p))}
      <div><h2 id="ac-srv-h">${esc(p.domain || p.serverhostname || 'Your server')}</h2>
      <p class="ac-srv__state"><i class="${active ? 'is-ok' : /suspend/i.test(p.status) ? 'is-bad' : 'is-warn'}" aria-hidden="true"></i>${active ? 'Provisioned and active' : `Service ${esc(String(p.status || '').toLowerCase())}`}</p></div>
    </div>
    <dl class="ac-srv__facts">
      <div><dt>IP address</dt><dd>${ips[0] ? `<span class="ac-mono">${esc(ips[0])}</span>${copyBtn(ips[0], 'IP address')}` : '<span class="ac-muted">Assigned at setup</span>'}</dd></div>
      ${os ? `<div><dt>Operating system</dt><dd>${esc(os)}</dd></div>` : ''}
      ${loc ? `<div><dt>Location</dt><dd>${esc(loc)}</dd></div>` : ''}
      ${p.username ? `<div><dt>Username</dt><dd><span class="ac-mono">${esc(p.username)}</span></dd></div>` : ''}
    </dl>
    <div class="ac-srv__power" role="group" aria-label="Power controls">
      ${ssoButton(o.csrf, 'service', p.id, 'Start', { ic: 'bolt', sm: true, variant: 'quiet' })}
      ${ssoButton(o.csrf, 'service', p.id, 'Reboot', { ic: 'refresh', sm: true, variant: 'quiet' })}
      ${ssoButton(o.csrf, 'service', p.id, 'Shut down', { ic: 'power', sm: true, variant: 'quiet' })}
      ${ssoButton(o.csrf, 'service', p.id, 'Open console', { ic: 'term', sm: true, variant: 'light' })}
    </div>
    <p class="ac-srv__note">${icon('info')}Power actions and the live console open in your secure server console, where you confirm each action.</p>
  </section>` : '';

  const overview = card('Overview', dl([
    ['Product', `${esc(p.translated_name || p.name)}${p.groupname ? ` <span class="ac-muted">· ${esc(p.translated_groupname || p.groupname)}</span>` : ''}`],
    ...(p.domain ? [['Domain / hostname', `<span class="ac-mono">${esc(p.domain)}</span>`] as [string, string]] : []),
    ...(p.dedicatedip ? [['Dedicated IP', `<span class="ac-mono">${esc(p.dedicatedip)}</span>${copyBtn(p.dedicatedip, 'dedicated IP')}`] as [string, string]] : []),
    ...(ips.length > 1 ? [['Assigned IPs', ips.slice(p.dedicatedip ? 1 : 0).map((x) => `<span class="ac-mono ac-chip">${esc(x)}</span>`).join(' ')] as [string, string]] : []),
    ...(p.username ? [['Username', `<span class="ac-mono">${esc(p.username)}</span>${copyBtn(p.username, 'username')}`] as [string, string]] : []),
    ['Password', `<span class="ac-muted">Hidden for your security</span>`],
    ['Ordered on', esc(fmtDate(p.regdate))],
  ]) + `<div class="ac-card__foot">${ssoButton(o.csrf, 'service', p.id, 'Show login details', { ic: 'lock', sm: true })}<span class="ac-muted">Opens in your secure client area.</span></div>`, { id: 'ac-ov-h' });

  const config = opts.length ? card('Configuration', `<table class="ac-table ac-table--kv"><tbody>${opts.map((x) => `<tr><th scope="row">${esc(x.label)}</th><td>${esc(x.value)}</td></tr>`).join('')}</tbody></table>`, { id: 'ac-cfg-h', flush: true }) : '';

  const billing = card('Billing', dl([
    ['Status', pill(p.status)],
    ['Billing cycle', esc(cycleLabel(p.billingcycle))],
    ['Recurring amount', `<span class="num">${esc(money(p.recurringamount, cur))}</span>`],
    ['First payment', `<span class="num">${esc(money(p.firstpaymentamount, cur))}</span>`],
    ['Next due date', `<span class="num">${esc(fmtDate(p.nextduedate))}</span>${d !== null ? `<small class="${d <= 14 ? 'is-soon' : 'ac-muted'}"> ${d < 0 ? `${-d} days overdue` : `in ${d} days`}</small>` : ''}`],
    ...(p.paymentmethodname ? [['Payment method', esc(p.paymentmethodname)] as [string, string]] : []),
  ]) + `<div class="ac-card__foot ac-card__foot--stack">${ssoButton(o.csrf, 'invoices', undefined, 'Renew or pay', { variant: 'brand', ic: 'card', block: true })}</div>`, { id: 'ac-bill-h' });

  const manage = card('Manage', `<ul class="ac-actions">
    <li>${icon('trend')}<div><b>Upgrade or downgrade</b><small>Change plan and pay only the difference.</small></div>${ssoButton(o.csrf, 'upgrade', p.id, 'Change plan', { sm: true })}</li>
    <li>${icon('headset')}<div><b>Get help with this service</b><small>Opens a ticket linked to it.</small></div><a class="hp-btn hp-btn--ghost ac-sm" href="/account/support/new?service=${esc(p.id)}">New ticket</a></li>
    <li class="ac-actions__danger">${icon('x')}<div><b>Request cancellation</b><small>Choose immediate or end-of-term cancellation.</small></div>${ssoButton(o.csrf, 'cancel', p.id, 'Request', { sm: true })}</li>
  </ul>`, { id: 'ac-man-h', flush: true });

  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${serverCard}${usageDetailCard(p, o.csrf)}${overview}${config}</div><div class="ac-col">${billing}${manage}</div></div>`;
}
