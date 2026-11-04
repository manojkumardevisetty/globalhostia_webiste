// Products & Services: list and detail. Passwords are never shown; login details open in the secure client area.
import { productRow } from './dashboard';
import { usageDetailCard } from './renewals';
import { hexIcon, card, configOptions, cycleLabel, daysUntil, dl, empty, esc, fmtDate, icon, ipList, isServer, money, pill, productIcon, ssoButton, btn, t } from './kit';
import { tn } from '../i18n';

export function servicesView(o: { csrf: string; products: any[]; cur: string; filter: string }) {
  const all = o.products;
  const isActive = (p: any) => /active|pending|suspended/i.test(p.status);
  const groups: [string, string, any[]][] = [
    ['active', t('Current'), all.filter(isActive)],
    ['all', t('All'), all],
  ];
  const f = groups.find((g) => g[0] === o.filter) ? o.filter : 'active';
  const list = groups.find((g) => g[0] === f)![2].sort((a, b) => String(a.nextduedate).localeCompare(String(b.nextduedate)));
  const seg = `<nav class="hp-seg ac-seg" aria-label="${esc(t('Filter services'))}">${groups.map(([k, l, xs]) => `<a href="/account/services?status=${k}"${k === f ? ' aria-current="true" class="is-on"' : ''}>${l}<span class="num">${xs.length}</span></a>`).join('')}</nav>`;
  const body = list.length ? `<ul class="ac-plist">${list.map((p) => productRow(p, o.csrf, o.cur)).join('')}</ul>`
    : empty(all.length ? t('Nothing to show with this filter') : t('No products yet'), all.length ? t('Switch to "All" to see cancelled and expired services.') : t('Hosting, VPS and dedicated servers you order appear here.'), btn(t('Browse hosting'), '/web-hosting', { variant: 'brand' }));
  return `${seg}${card(f === 'all' ? t('All services') : t('Current services'), body, { id: 'ac-svc-h', flush: true })}`;
}

const copyBtn = (v: string, label: string) => `<button type="button" class="ac-copy" data-copy="${esc(v)}" aria-label="${esc(t('Copy {x}', { x: label }))}">${icon('copy')}<span>${esc(t('Copy'))}</span></button>`;

export function serviceDetailView(o: { csrf: string; p: any; cur: string; dnsHref?: string; usageHtml?: string; upgradeHref?: string }) {
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
      <div><h2 id="ac-srv-h">${esc(p.domain || p.serverhostname || t('Your server'))}</h2>
      <p class="ac-srv__state"><i class="${active ? 'is-ok' : /suspend/i.test(p.status) ? 'is-bad' : 'is-warn'}" aria-hidden="true"></i>${esc(active ? t('Provisioned and active') : t('Service status: {s}', { s: t(String(p.status || 'Unknown')) }))}</p></div>
    </div>
    <dl class="ac-srv__facts">
      <div><dt>${esc(t('IP address'))}</dt><dd>${ips[0] ? `<span class="ac-mono">${esc(ips[0])}</span>${copyBtn(ips[0], t('IP address'))}` : `<span class="ac-muted">${esc(t('Assigned at setup'))}</span>`}</dd></div>
      ${os ? `<div><dt>${esc(t('Operating system'))}</dt><dd>${esc(os)}</dd></div>` : ''}
      ${loc ? `<div><dt>${esc(t('Location'))}</dt><dd>${esc(loc)}</dd></div>` : ''}
      ${p.username ? `<div><dt>${esc(t('Username'))}</dt><dd><span class="ac-mono">${esc(p.username)}</span></dd></div>` : ''}
    </dl>
    <div class="ac-srv__power" role="group" aria-label="${esc(t('Power controls'))}">
      ${ssoButton(o.csrf, 'service', p.id, t('Start'), { ic: 'bolt', sm: true, variant: 'quiet' })}
      ${ssoButton(o.csrf, 'service', p.id, t('Reboot'), { ic: 'refresh', sm: true, variant: 'quiet' })}
      ${ssoButton(o.csrf, 'service', p.id, t('Shut down'), { ic: 'power', sm: true, variant: 'quiet' })}
      ${ssoButton(o.csrf, 'service', p.id, t('Open console'), { ic: 'term', sm: true, variant: 'light' })}
    </div>
    <p class="ac-srv__note">${icon('info')}${esc(t('Power actions and the live console open in your secure server console, where you confirm each action.'))}</p>
  </section>` : '';

  const overview = card(t('Overview'), dl([
    [t('Product'), `${esc(p.translated_name || p.name)}${p.groupname ? ` <span class="ac-muted">· ${esc(p.translated_groupname || p.groupname)}</span>` : ''}`],
    ...(p.domain ? [[t('Domain / hostname'), `<span class="ac-mono">${esc(p.domain)}</span>`] as [string, string]] : []),
    ...(p.dedicatedip ? [[t('Dedicated IP'), `<span class="ac-mono">${esc(p.dedicatedip)}</span>${copyBtn(p.dedicatedip, t('Dedicated IP'))}`] as [string, string]] : []),
    ...(ips.length > 1 ? [[t('Assigned IPs'), ips.slice(p.dedicatedip ? 1 : 0).map((x) => `<span class="ac-mono ac-chip">${esc(x)}</span>`).join(' ')] as [string, string]] : []),
    ...(p.username ? [[t('Username'), `<span class="ac-mono">${esc(p.username)}</span>${copyBtn(p.username, t('Username'))}`] as [string, string]] : []),
    [t('Password'), `<span class="ac-muted">${esc(t('Hidden for your security'))}</span>`],
    [t('Ordered on'), esc(fmtDate(p.regdate))],
  ]) + `<div class="ac-card__foot">${ssoButton(o.csrf, 'service', p.id, t('Show login details'), { ic: 'lock', sm: true })}<span class="ac-muted">${esc(t('Opens in your secure client area.'))}</span></div>`, { id: 'ac-ov-h' });

  const config = opts.length ? card(t('Configuration'), `<table class="ac-table ac-table--kv"><tbody>${opts.map((x) => `<tr><th scope="row">${esc(x.label)}</th><td>${esc(x.value)}</td></tr>`).join('')}</tbody></table>`, { id: 'ac-cfg-h', flush: true }) : '';

  const billing = card(t('Billing'), dl([
    [t('Status'), pill(p.status)],
    [t('Billing cycle'), esc(cycleLabel(p.billingcycle))],
    [t('Recurring amount'), `<span class="num">${esc(money(p.recurringamount, cur))}</span>`],
    [t('First payment'), `<span class="num">${esc(money(p.firstpaymentamount, cur))}</span>`],
    [t('Next due date'), `<span class="num">${esc(fmtDate(p.nextduedate))}</span>${d !== null ? `<small class="${d <= 14 ? 'is-soon' : 'ac-muted'}"> ${esc(d < 0 ? tn(-d, '{n} day overdue', '{n} days overdue') : tn(d, 'in {n} day', 'in {n} days'))}</small>` : ''}`],
    ...(p.paymentmethodname ? [[t('Payment method'), esc(p.paymentmethodname)] as [string, string]] : []),
  ]) + `<div class="ac-card__foot ac-card__foot--stack">${ssoButton(o.csrf, 'invoices', undefined, t('Renew or pay'), { variant: 'brand', ic: 'card', block: true })}</div>`, { id: 'ac-bill-h' });

  const manage = card(t('Manage'), `<ul class="ac-actions">
    <li>${icon('trend')}<div><b>${esc(t('Upgrade or downgrade'))}</b><small>${esc(t('Change plan and pay only the difference.'))}</small></div>${o.upgradeHref ? `<a class="hp-btn hp-btn--ghost ac-sm" href="${esc(o.upgradeHref)}" data-ac-upgrade>${esc(t('Change plan'))}</a>` : ssoButton(o.csrf, 'upgrade', p.id, t('Change plan'), { sm: true })}</li>
    ${o.dnsHref ? `<li>${icon('database')}<div><b>${esc(t('DNS records'))}</b><small>${esc(t('Edit records for {d}.', { d: p.domain }))}</small></div><a class="hp-btn hp-btn--ghost ac-sm" href="${esc(o.dnsHref)}">${esc(t('Manage DNS'))}</a></li>` : ''}
    <li>${icon('headset')}<div><b>${esc(t('Get help with this service'))}</b><small>${esc(t('Opens a ticket linked to it.'))}</small></div><a class="hp-btn hp-btn--ghost ac-sm" href="/account/support/new?service=${esc(p.id)}">${esc(t('New ticket'))}</a></li>
    <li class="ac-actions__danger">${icon('x')}<div><b>${esc(t('Request cancellation'))}</b><small>${esc(t('Choose immediate or end-of-term cancellation.'))}</small></div>${ssoButton(o.csrf, 'cancel', p.id, t('Request'), { sm: true })}</li>
  </ul>`, { id: 'ac-man-h', flush: true });

  return `<div class="ac-grid ac-grid--detail"><div class="ac-col">${serverCard}${o.usageHtml ?? usageDetailCard(p, o.csrf)}${overview}${config}</div><div class="ac-col">${billing}${manage}</div></div>`;
}
