import 'server-only';
import { domainWhois, domainCartUrl, whmcsConfigured } from '../whmcs';
import { esc } from './util';
import { money } from '../pricing';
import type { Tld } from '../schema';

const hits = new Map<string, { n: number; t: number }>();
export function rateLimited(ip: string, max = 20, windowMs = 60_000) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.t > windowMs) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++; return h.n > max;
}

export function normalizeQuery(q: string) {
  const s = q.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/[^a-z0-9.-]/g, '');
  const m = s.match(/^([a-z0-9][a-z0-9-]{0,61}[a-z0-9]?)(\.[a-z0-9.-]+)?$/);
  if (!m) return null;
  return { sld: m[1], tld: m[2] || '' };
}

export function domainSearchForm(action: string, data: Record<string, any>, q = '') {
  return `<div class="${esc(data.wrapperClass || 'pt-13 pb-10')}"><div class="container">
  ${data.title ? `<h2 class="coodiv-text-4 font-weight-bold text-center mb-8">${esc(data.title)}</h2>` : ''}
  <form class="gh-domain-form" method="get" action="${esc(action)}" role="search">
    <input name="domain" value="${esc(q)}" placeholder="${esc(data.placeholder || 'Find your perfect domain name…')}" aria-label="Domain name" required maxlength="80">
    <button class="btn btn-primary" type="submit">${esc(data.button || 'Search')}</button>
  </form></div></div>`;
}

export async function domainResults(q: string, tlds: Tld[], suggest: string[], ip: string, data: Record<string, any>) {
  const wrap = (inner: string) => `<div class="${esc(data.wrapperClass || 'pb-15')} gh-domain-results"><div class="container" style="max-width:860px">${inner}</div></div>`;
  if (!q) return '';
  const n = normalizeQuery(q);
  if (!n) return wrap(`<p class="text-center coodiv-text-9">“${esc(q)}” isn’t a valid domain name.</p>`);
  if (rateLimited(ip)) return wrap(`<p class="text-center coodiv-text-9">Too many searches — please wait a minute.</p>`);
  const byTld = new Map(tlds.filter((t) => t.visible).map((t) => [t.tld, t]));
  const exact = n.tld && byTld.has(n.tld) ? n.tld : n.tld ? null : '.com';
  const list = [...new Set([exact, ...suggest].filter((t): t is string => !!t && byTld.has(t)))].slice(0, 8);
  if (n.tld && !byTld.has(n.tld)) {
    return wrap(`<p class="text-center coodiv-text-9">We don’t offer <b>${esc(n.tld)}</b> yet.</p>`);
  }
  if (!whmcsConfigured() || !list.length) return wrap(`<p class="text-center coodiv-text-9">Domain search is temporarily unavailable.</p>`);
  const checks = await Promise.all(list.map(async (t) => {
    const name = n.sld + t;
    try { return { t, name, ok: await domainWhois(name), err: false }; } catch { return { t, name, ok: false, err: true }; }
  }));
  const rows = checks.map((c) => {
    const tl = byTld.get(c.t)!;
    const price = tl.register ? money(tl.register) + '/yr' : '';
    const renew = tl.renew ? `renews ${money(tl.renew)}/yr` : '';
    return `<div class="row-item${c.t === exact ? ' exact' : ''}">
      <div><span class="coodiv-text-8 font-weight-bold ${c.ok ? '' : 'taken'}">${esc(c.name)}</span>
        ${c.err ? '<span class="gh-tag off">check failed</span>' : c.ok ? '<span class="gh-tag">Available</span>' : '<span class="gh-tag off">Taken</span>'}
        ${tl.promo ? `<span class="gh-tag">${esc(tl.promo)}</span>` : ''}</div>
      <div class="text-right">${c.ok ? `<span class="coodiv-text-8 font-weight-bold mr-4">${price}</span><small class="d-none d-md-inline mr-4 text-muted">${renew}</small>
        <a class="btn btn-primary btn-sm" href="${esc(domainCartUrl(c.name))}">Add to cart</a>`
        : !c.err ? `<a class="btn btn-outline-secondary btn-sm" href="${esc(domainCartUrl(c.name, 'transfer'))}">Transfer</a>
        <a class="btn btn-link btn-sm" href="/domain-broker?domain=${esc(encodeURIComponent(c.name))}" title="Domain taken? Our brokers can get it">Want this domain? Our broker can try to buy it &rarr;</a>` : ''}</div></div>`;
  });
  return wrap(`<h3 class="coodiv-text-6 font-weight-bold mb-6">Results for “${esc(n.sld + (n.tld || ''))}”</h3>${rows.join('')}`);
}

export function tldTable(tlds: Tld[], data: Record<string, any>) {
  const list = tlds.filter((t) => t.visible && t.register).sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder || a.tld.localeCompare(b.tld)).slice(0, data.limit || 60);
  if (!list.length) return '';
  return `<div class="${esc(data.wrapperClass || 'pt-10 pb-15')}"><div class="container">
  ${data.title ? `<h2 class="coodiv-text-4 font-weight-bold text-center mb-8">${esc(data.title)}</h2>` : ''}
  <div class="table-responsive"><table class="table bg-white border rounded-10 coodiv-text-10"><thead><tr><th>Extension</th><th>Register</th><th>Transfer</th><th>Renew</th></tr></thead>
  <tbody>${list.map((t) => `<tr><td class="font-weight-bold">${esc(t.tld)}${t.promo ? ` <span class="gh-tag">${esc(t.promo)}</span>` : ''}</td><td>${t.register ? money(t.register) : '—'}</td><td>${t.transfer ? money(t.transfer) : '—'}</td><td>${t.renew ? money(t.renew) : '—'}</td></tr>`).join('')}</tbody></table></div>
  <p class="coodiv-text-12 text-muted">Prices per year in ${esc(list[0].currency)}, synced from our billing system.</p></div></div>`;
}

export function faq(data: Record<string, any>) {
  const items: { q: string; a: string }[] = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return '';
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) };
  return `<div class="${esc(data.wrapperClass || 'pt-13 pb-13')} gh-faq"><div class="container" style="max-width:900px">
  ${data.title ? `<h2 class="coodiv-text-4 font-weight-bold text-center mb-10">${esc(data.title)}</h2>` : ''}
  ${items.map((i) => `<details><summary class="coodiv-text-9">${esc(i.q)}</summary><div class="coodiv-text-10 mt-4">${esc(i.a)}</div></details>`).join('')}
  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script></div></div>`;
}
