// Renders a "products" section using the legacy theme's own markup (pricing-plan-two cards,
// servers-table rows) so dynamic content looks identical to the original site.
import { chooseLayout } from './layout';
import { esc } from './util';
import { pickPrice, money, CYCLE_LABEL, CYCLE_MONTHS, type PriceRow } from '../pricing';

export interface RProduct {
  id: string; slug: string; name: string; tagline: string; description: string; features: string[]; attributes: Record<string, string>;
  badge: string; badgeColor: string; featured: boolean; displayCycle: string; orderUrl: string; whmcsPid: number | null; categoryId: string | null;
  prices: PriceRow[];
}
export interface RCategory { id: string; slug: string; name: string; layout: string; cardTemplate: string }
interface Ctx { currency: string; defaultCycle: string; orderLabel: string; cartBase: string; sectionId: string }

const orderUrl = (p: RProduct, ctx: Ctx, cycle?: string) =>
  p.orderUrl || (p.whmcsPid ? `${ctx.cartBase}/cart.php?a=add&pid=${p.whmcsPid}${cycle && !['auto', 'free', 'onetime'].includes(cycle) ? `&billingcycle=${cycle}` : ''}` : '#');

function priceInfo(p: RProduct, ctx: Ctx) {
  const pr = pickPrice(p.prices, ctx.currency, p.displayCycle !== 'auto' ? p.displayCycle : ctx.defaultCycle);
  if (!pr) return { html: '', value: '', cycle: '', label: '' };
  const v = parseFloat(String(pr.price));
  const html = pr.cycle === 'free' || v === 0 ? 'Free' : money(v, pr.prefix || '$');
  const months = CYCLE_MONTHS[pr.cycle] || 0;
  const perMonth = months > 1 ? money(v / months, pr.prefix || '$') + '/mo' : '';
  return { html, value: String(v), cycle: pr.cycle, label: CYCLE_LABEL[pr.cycle] || pr.cycle, perMonth, setup: parseFloat(String(pr.setupFee)) > 0 ? money(pr.setupFee, pr.prefix || '$') : '' };
}

const featureLis = (f: string[], expandable: boolean) => {
  const li = (x: string) => x.startsWith('-')
    ? `<li class="disabled coodiv-text-9"><i class="icon icon-simple-remove"></i>${esc(x.slice(1).trim())}</li>`
    : `<li class="coodiv-text-9">${esc(x)}</li>`;
  if (!expandable || f.length <= 6) return f.map(li).join('');
  return f.slice(0, 6).map(li).join('') + `<details class="gh-more"><summary class="coodiv-text-11">+${f.length - 6} more features</summary>${f.slice(6).map(li).join('')}</details>`;
};

function planCard(p: RProduct, ctx: Ctx, col: string, expandable: boolean, featuredMode: boolean) {
  const pi = priceInfo(p, ctx);
  const badge = p.badge || p.name;
  const attrs = Object.entries(p.attributes || {}).map(([k, v]) => ` data-attr-${esc(k.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}="${esc(v)}"`).join('');
  const price = pi.html
    ? `<h2 class="price-of-plan coodiv-text-3 font-weight-bold text-blackish-blue line-spacing-none mb-2 mt-8">${pi.html}<span class="payment-type-m">${esc(pi.label)}</span></h2>
       ${pi.perMonth ? `<p class="coodiv-text-12 mb-0 coodiv-color-blackish-blue-opacity-7">${pi.perMonth}</p>` : ''}${pi.setup ? `<p class="coodiv-text-12 mb-0 coodiv-color-blackish-blue-opacity-7">+ ${pi.setup} setup</p>` : ''}`
    : `<h2 class="price-of-plan coodiv-text-6 font-weight-bold text-blackish-blue mb-2 mt-8">See pricing</h2>`;
  const feats = featuredMode
    ? `<ul class="card-list list-style-check pl-0 mt-7 row text-left">${p.features.map((x) => `<li class="col-md-6 coodiv-text-9${x.startsWith('-') ? ' disabled' : ''}">${esc(x.replace(/^-\s*/, ''))}</li>`).join('')}</ul>`
    : `<ul class="card-list list-style-check pl-0 mt-7 mt-lg-11 justify-content-center-li">${featureLis(p.features, expandable)}</ul>`;
  return `<div class="${col} mb-9 gh-item" data-name="${esc(p.name.toLowerCase())}" data-price="${pi.value}" data-sort="${p.featured ? 0 : 1}"${attrs}>
  <div class="pricing-plan-two coodiv-hover-shadow-1 bg-white border rounded-10 text-center pt-9 pr-6 pl-6 pb-9 h-100${p.featured ? ' gh-featured' : ''}">
    <span class="badge coodiv-badge badge-${esc(p.badgeColor || 'primary')} rounded-pill coodiv-text-12 text-uppercase">${esc(badge)}</span>
    ${price}
    ${p.tagline ? `<p class="coodiv-text-11 mb-7 mb-lg-11 coodiv-color-blackish-blue-opacity-7 pr-lg-13 pl-lg-13">${esc(p.tagline)}</p>` : ''}
    ${feats}
    <a href="${esc(orderUrl(p, ctx, pi.cycle))}" class="btn-order"><span>${esc(ctx.orderLabel)}</span></a>
  </div>
</div>`;
}

function serverRow(p: RProduct, ctx: Ctx) {
  const pi = priceInfo(p, ctx);
  const a = Object.fromEntries(Object.entries(p.attributes || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const num = (s?: string) => (s?.match(/\d+/) || [''])[0];
  return `<tr class="gh-item" data-name="${esc(p.name.toLowerCase())}" data-price="${pi.value}" data-ram="${esc(num(a.ram))}" data-cores="${esc(num(a.cpu || a.cores))}" data-storage="${esc((a.storage || '').toLowerCase().includes('nvme') ? 'nvme' : (a.storage || '').toLowerCase().includes('hdd') ? 'hdd' : 'ssd')}">
  <td><div class="package-name">${esc(p.tagline || p.name)}</div><small style="color:#6c757d;">${esc(p.name)}</small>${p.badge ? `<span class="package-badge">${esc(p.badge)}</span>` : ''}</td>
  <td><span class="processor-info">${esc(a.cpu || a.processor || '—')}</span></td>
  <td><span class="ram-info">${esc(a.ram || '—')}</span></td>
  <td><span class="storage-info">${esc(a.storage || '—')}</span></td>
  <td>${esc(a.ips || a.ip || '—')}</td>
  <td>${esc(a.bandwidth || 'Unmetered')}${a.port ? `<br><small>${esc(a.port)}</small>` : ''}</td>
  <td class="price-cell"><span class="price-current">${pi.html ? pi.html.replace(/^([^\d]+)/, '<sup>$1</sup>') : '—'}</span>${pi.label && pi.cycle !== 'monthly' ? `<br><small>${esc(pi.label)}</small>` : ''}</td>
  <td class="action-cell"><a href="${esc(orderUrl(p, ctx, pi.cycle))}" class="btn-buy">${esc(ctx.orderLabel === 'Order Now' ? 'Buy Now' : ctx.orderLabel)}</a></td>
</tr>`;
}

function compareTable(items: RProduct[], ctx: Ctx) {
  const rows = new Map<string, string[]>();
  items.forEach((p, i) => {
    for (const f of p.features) {
      const key = f.replace(/^-\s*/, '').replace(/^[\d.,]+\s*(GB|TB|MB)?\s*/i, '').trim() || f;
      if (!rows.has(key)) rows.set(key, Array(items.length).fill('—'));
      rows.get(key)![i] = f.startsWith('-') ? '✕' : esc(f);
    }
    for (const [k, v] of Object.entries(p.attributes || {})) {
      if (!rows.has(k)) rows.set(k, Array(items.length).fill('—'));
      rows.get(k)![i] = esc(v);
    }
  });
  if (rows.size < 2) return '';
  return `<details class="gh-compare mt-6"><summary class="coodiv-text-9 font-weight-bold text-center">Compare plans</summary>
<div class="table-responsive mt-6"><table class="table table-bordered bg-white coodiv-text-11"><thead><tr><th></th>${items.map((p) => `<th class="text-center">${esc(p.name)}<br><small>${priceInfo(p, ctx).html}</small></th>`).join('')}</tr></thead>
<tbody>${[...rows.entries()].map(([k, v]) => `<tr><th>${esc(k)}</th>${v.map((x) => `<td class="text-center">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

function toolbar(sid: string, search: boolean, attrKeys: string[]) {
  return `<div class="gh-toolbar d-flex flex-wrap justify-content-center mb-9" data-target="${sid}">
  ${search ? `<input type="search" class="form-control mr-3 mb-3" style="max-width:260px" placeholder="Search plans…" data-gh="search" aria-label="Search plans">` : ''}
  <select class="form-control mr-3 mb-3" style="max-width:200px" data-gh="sort" aria-label="Sort"><option value="">Recommended</option><option value="price-asc">Price: low → high</option><option value="price-desc">Price: high → low</option><option value="name">Name A–Z</option></select>
  ${attrKeys.slice(0, 2).map((k) => `<select class="form-control mr-3 mb-3" style="max-width:200px" data-gh="filter" data-attr="${esc(k)}" aria-label="${esc(k)}"><option value="">All ${esc(k)}</option></select>`).join('')}
</div>`;
}

export function renderProducts(data: Record<string, any>, sectionId: string, cats: RCategory[], all: RProduct[], ctx0: Omit<Ctx, 'sectionId'>): string | null {
  const ctx = { ...ctx0, sectionId };
  const groups = cats.map((c) => ({ cat: c, items: all.filter((p) => p.categoryId === c.id) })).filter((g) => g.items.length);
  if (!groups.length) return null; // caller falls back to legacy HTML
  const template = data.template || groups[0].cat.cardTemplate || 'plan-card';
  const sid = `ghp-${sectionId.slice(-8)}`;
  const heading = data.title ? `<div class="row justify-content-center"><div class="col-xl-8 col-lg-10 text-center mb-11">
    <h2 class="coodiv-text-4 font-weight-bold mb-5">${esc(data.title)}</h2>${data.subtitle ? `<p class="coodiv-text-9 mb-0">${esc(data.subtitle)}</p>` : ''}</div></div>` : '';

  const panes = groups.map((g, gi) => {
    const items = [...g.items];
    const L = chooseLayout({ count: items.length, override: data.layout !== 'auto' ? data.layout : g.cat.layout, template,
      maxFeatures: Math.max(...items.map((p) => p.features.length)), maxDescLen: Math.max(...items.map((p) => p.description.length)) });
    const attrKeys = [...new Set(items.flatMap((p) => Object.keys(p.attributes || {})))];
    const pid = `${sid}-${gi}`;
    let body: string;
    if (template === 'server-row') {
      body = `${L.toolbar ? toolbar(pid, L.search, []) : ''}<div class="servers-table-container"><table class="servers-table"><thead><tr><th>Package</th><th>Processor</th><th>RAM</th><th>Storage</th><th>IPs</th><th>Bandwidth</th><th>Price</th><th></th></tr></thead>
        <tbody id="${pid}" class="gh-items">${items.map((p) => serverRow(p, ctx)).join('')}</tbody></table></div>`;
    } else {
      body = `${L.toolbar ? toolbar(pid, L.search, attrKeys) : ''}<div class="row justify-content-center gh-items" id="${pid}" data-page-size="${L.pageSize}">${items.map((p) => planCard(p, ctx, L.colClass, L.expandable, L.mode === 'featured')).join('')}</div>
        ${L.pageSize ? `<nav class="gh-pager text-center mt-6" data-target="${pid}"></nav>` : ''}${L.compare ? compareTable(items, ctx) : ''}`;
    }
    return { g, pid, body, L };
  });

  const inner = panes.length === 1
    ? panes[0].body
    : `<ul class="nav nav-pills justify-content-center mb-11 gh-tabs" role="tablist">${panes.map((p, i) => `<li class="nav-item"><a class="nav-link${i ? '' : ' active'}" data-toggle="pill" href="#${p.pid}-tab" role="tab">${esc(p.g.cat.name)}</a></li>`).join('')}</ul>
       <div class="tab-content">${panes.map((p, i) => `<div class="tab-pane fade${i ? '' : ' show active'}" id="${p.pid}-tab" role="tabpanel">${p.body}</div>`).join('')}</div>`;

  return `<div class="${esc(data.wrapperClass || 'pt-13 pb-13')} gh-products" data-layout="${panes.map((p) => p.L.mode).join(',')}" data-section="${esc(sectionId)}">
  <div class="${template === 'server-row' ? 'container-fluid px-lg-15' : 'container'}">${heading}${inner}</div>
</div>`;
}
