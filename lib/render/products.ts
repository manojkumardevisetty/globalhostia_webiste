// Renders "products" sections on the real site. Adaptive by product count:
//   1 → featured (wide card)   2–4 → pricing cards (aligned rows)   5–12 → grid + sort/filter   13+ → searchable list with pages
// Cards use CSS subgrid so name / price / button / features line up across every card in a row,
// whatever each product's text length is. Server products (template "server-row") use the spec list.
import { chooseLayout } from './layout';
import { esc } from './util';
import { deriveSpecs, SPEC_LABEL } from './specs';
import { money, CYCLE_LABEL, CYCLE_MONTHS, type PriceRow } from '../pricing';

export interface RProduct {
  id: string; slug: string; name: string; tagline: string; description: string; features: string[]; attributes: Record<string, string>;
  badge: string; badgeColor: string; featured: boolean; displayCycle: string; orderUrl: string; whmcsPid: number | null; categoryId: string | null;
  prices: PriceRow[];
}
export interface RCategory { id: string; slug: string; name: string; layout: string; cardTemplate: string }
interface Ctx { currency: string; defaultCycle: string; orderLabel: string; cartBase: string; sectionId?: string }

const CHECK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SHORT: Record<string, string> = { monthly: '/mo', quarterly: '/3 mo', semiannually: '/6 mo', annually: '/yr', biennially: '/2 yrs', triennially: '/3 yrs', onetime: ' one-time', free: '' };

export const orderUrl = (p: RProduct, cartBase: string, cycle?: string) =>
  p.orderUrl || (p.whmcsPid ? `${cartBase}/cart.php?a=add&pid=${p.whmcsPid}${cycle && !['auto', 'free', 'onetime'].includes(cycle) ? `&billingcycle=${cycle}` : ''}` : '#');

/** All cycles for the display currency, cheapest first by monthly equivalent. */
export function cycles(p: RProduct, currency: string) {
  return p.prices.filter((x) => x.currency === currency).map((x) => {
    const v = parseFloat(String(x.price)), m = CYCLE_MONTHS[x.cycle] || 0;
    return { cycle: x.cycle, price: v, perMonth: m ? v / m : v, setup: parseFloat(String(x.setupFee)) || 0, prefix: x.prefix || '$' };
  }).sort((a, b) => (CYCLE_MONTHS[a.cycle] || 99) - (CYCLE_MONTHS[b.cycle] || 99));
}

/** The price block shown for one cycle ("view" = monthly | yearly). */
function priceBlock(p: RProduct, ctx: Ctx, view: 'monthly' | 'yearly') {
  const cs = cycles(p, ctx.currency);
  if (!cs.length) return { html: `<div class="gh-price"><span class="gh-amt gh-amt-sm">Price on request</span></div><p class="gh-note">Contact sales for a quote</p>`, cycle: '', sort: 1e9 };
  const mo = cs.find((c) => c.cycle === 'monthly'), yr = cs.find((c) => c.cycle === 'annually');
  let c = view === 'yearly' ? yr || mo || cs[0] : mo || yr || cs[0];
  if (ctx.defaultCycle !== 'auto' && view === 'monthly') c = cs.find((x) => x.cycle === ctx.defaultCycle) || c;
  if (p.displayCycle !== 'auto' && view === 'monthly') c = cs.find((x) => x.cycle === p.displayCycle) || c;
  const free = c.cycle === 'free' || c.price === 0;
  const showPerMonth = view === 'yearly' && c.cycle === 'annually' && mo; // compare like-for-like with monthly
  const amount = free ? 'Free' : money(showPerMonth ? c.perMonth : c.price, c.prefix);
  const unit = free ? '' : showPerMonth ? '/mo' : SHORT[c.cycle] ?? '';
  const save = showPerMonth && mo ? Math.round((1 - c.perMonth / mo.price) * 100) : 0;
  const notes: string[] = [];
  if (showPerMonth) notes.push(`${money(c.price, c.prefix)} billed yearly${save > 0 ? ` · save ${save}%` : ''}`);
  else if (c.cycle === 'annually' && !mo) notes.push(`Billed yearly (≈ ${money(c.perMonth, c.prefix)}/mo)`);
  else if (c.cycle === 'monthly') notes.push('Billed monthly, cancel anytime');
  else if (CYCLE_LABEL[c.cycle]) notes.push(`Billed ${CYCLE_LABEL[c.cycle].toLowerCase()}`);
  if (c.setup > 0) notes.push(`+ ${money(c.setup, c.prefix)} setup`);
  return {
    html: `<div class="gh-price"><span class="gh-amt">${amount}</span><span class="gh-per">${unit}</span></div><p class="gh-note">${esc(notes.join(' · '))}</p>`,
    cycle: c.cycle, sort: c.perMonth,
  };
}

const featureList = (f: string[], limit = 8) => {
  const li = (x: string) => x.startsWith('-')
    ? `<li class="is-off">${CROSS}<span>${esc(x.replace(/^-\s*/, ''))}</span></li>`
    : `<li>${CHECK}<span>${esc(x)}</span></li>`;
  if (f.length <= limit) return `<ul class="gh-feat">${f.map(li).join('')}</ul>`;
  return `<ul class="gh-feat">${f.slice(0, limit).map(li).join('')}</ul><details class="gh-more"><summary>Show all ${f.length} features</summary><ul class="gh-feat">${f.slice(limit).map(li).join('')}</ul></details>`;
};

const dataAttrs = (p: RProduct, specs: Record<string, string>, sort: number) =>
  ` data-name="${esc(p.name.toLowerCase())}" data-price="${sort < 1e9 ? sort.toFixed(4) : ''}"` +
  Object.entries(specs).map(([k, v]) => ` data-attr-${esc(k.replace(/[^a-z0-9]+/g, '-'))}="${esc(v)}"`).join('');

function card(p: RProduct, ctx: Ctx, opts: { highlight: boolean; hasYearly: boolean }) {
  const specs = deriveSpecs(p.features, p.attributes);
  const m = priceBlock(p, ctx, 'monthly'), y = opts.hasYearly ? priceBlock(p, ctx, 'yearly') : null;
  const badge = p.badge || (opts.highlight ? 'Most popular' : '');
  return `<article class="gh-card gh-item${opts.highlight ? ' is-hl' : ''}"${dataAttrs(p, specs, m.sort)}>
  <header class="gh-card-head">${badge ? `<span class="gh-ribbon">${esc(badge)}</span>` : ''}<h3 class="gh-card-name">${esc(p.name)}</h3>${p.tagline ? `<p class="gh-card-tag">${esc(p.tagline)}</p>` : ''}</header>
  <div class="gh-card-price"><div data-view="monthly">${m.html}</div>${y ? `<div data-view="yearly" hidden>${y.html}</div>` : ''}</div>
  <div class="gh-card-cta"><a class="gh-btn${opts.highlight ? ' gh-btn-solid' : ''}" href="${esc(orderUrl(p, ctx.cartBase, m.cycle))}" data-monthly="${esc(orderUrl(p, ctx.cartBase, m.cycle))}"${y ? ` data-yearly="${esc(orderUrl(p, ctx.cartBase, y.cycle))}"` : ''}>${esc(ctx.orderLabel)}</a><a class="gh-link" href="/p/${esc(p.slug)}">View details</a></div>
  <div class="gh-card-body">${featureList(p.features)}</div>
</article>`;
}

function featuredCard(p: RProduct, ctx: Ctx, hasYearly: boolean) {
  const m = priceBlock(p, ctx, 'monthly'), y = hasYearly ? priceBlock(p, ctx, 'yearly') : null;
  const specs = deriveSpecs(p.features, p.attributes);
  const specRows = Object.entries(specs).filter(([k]) => SPEC_LABEL[k]).slice(0, 6);
  return `<article class="gh-feature gh-item"${dataAttrs(p, specs, m.sort)}>
  <div class="gh-feature-main">
    ${p.badge ? `<span class="gh-ribbon">${esc(p.badge)}</span>` : ''}<h3 class="gh-card-name">${esc(p.name)}</h3>${p.tagline ? `<p class="gh-card-tag">${esc(p.tagline)}</p>` : ''}
    <div class="gh-card-price"><div data-view="monthly">${m.html}</div>${y ? `<div data-view="yearly" hidden>${y.html}</div>` : ''}</div>
    <div class="gh-card-cta"><a class="gh-btn gh-btn-solid" href="${esc(orderUrl(p, ctx.cartBase, m.cycle))}" data-monthly="${esc(orderUrl(p, ctx.cartBase, m.cycle))}"${y ? ` data-yearly="${esc(orderUrl(p, ctx.cartBase, y.cycle))}"` : ''}>${esc(ctx.orderLabel)}</a><a class="gh-link" href="/p/${esc(p.slug)}">View details</a></div>
  </div>
  <div class="gh-feature-side">
    ${specRows.length ? `<dl class="gh-specs">${specRows.map(([k, v]) => `<div><dt>${esc(SPEC_LABEL[k])}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${featureList(p.features.filter((f) => !specRows.some(([, v]) => v === f)), 12)}
  </div>
</article>`;
}

function row(p: RProduct, ctx: Ctx, cols: string[], hasYearly: boolean) {
  const specs = deriveSpecs(p.features, p.attributes);
  const m = priceBlock(p, ctx, 'monthly'), y = hasYearly ? priceBlock(p, ctx, 'yearly') : null;
  return `<div class="gh-row gh-item" role="row"${dataAttrs(p, specs, m.sort)}>
  <div class="gh-row-name" role="cell"><a href="/p/${esc(p.slug)}">${esc(p.name)}</a>${p.tagline ? `<span>${esc(p.tagline)}</span>` : ''}${p.badge ? `<em class="gh-ribbon">${esc(p.badge)}</em>` : ''}</div>
  ${cols.map((c) => `<div class="gh-row-spec" role="cell" data-label="${esc(SPEC_LABEL[c] || c)}">${esc(specs[c] || '—')}</div>`).join('')}
  <div class="gh-row-price" role="cell"><div data-view="monthly">${m.html.replace('Billed monthly, cancel anytime', '')}</div>${y ? `<div data-view="yearly" hidden>${y.html}</div>` : ''}</div>
  <div class="gh-row-cta" role="cell"><a class="gh-btn gh-btn-solid" href="${esc(orderUrl(p, ctx.cartBase, m.cycle))}" data-monthly="${esc(orderUrl(p, ctx.cartBase, m.cycle))}"${y ? ` data-yearly="${esc(orderUrl(p, ctx.cartBase, y.cycle))}"` : ''}>${esc(ctx.orderLabel === 'Order Now' ? 'Buy now' : ctx.orderLabel)}</a></div>
</div>`;
}

function compareTable(items: RProduct[], ctx: Ctx) {
  const lines = new Map<string, string[]>();
  items.forEach((p, i) => {
    const specs = deriveSpecs(p.features, p.attributes);
    for (const [k, v] of Object.entries(specs)) { const key = SPEC_LABEL[k] || k; if (!lines.has(key)) lines.set(key, Array(items.length).fill('—')); lines.get(key)![i] = esc(v); }
    for (const f of p.features) {
      const key = f.replace(/^-\s*/, '');
      if ([...Object.values(specs)].includes(key)) continue;
      if (!lines.has(key)) lines.set(key, Array(items.length).fill('<span class="gh-no">—</span>'));
      lines.get(key)![i] = f.startsWith('-') ? `<span class="gh-no">${CROSS}</span>` : `<span class="gh-yes">${CHECK}</span>`;
    }
  });
  if (lines.size < 2) return '';
  return `<details class="gh-compare"><summary>Compare all features</summary><div class="gh-compare-scroll"><table>
  <thead><tr><th scope="col"><span class="gh-sr">Feature</span></th>${items.map((p) => `<th scope="col">${esc(p.name)}<small>${priceBlock(p, ctx, 'monthly').html.replace(/<p class="gh-note">.*?<\/p>/, '').replace(/<[^>]+>/g, '')}</small></th>`).join('')}</tr></thead>
  <tbody>${[...lines.entries()].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}

function toolbar(target: string, search: boolean, filterKeys: string[]) {
  return `<div class="gh-toolbar" data-target="${target}">
  ${search ? `<label class="gh-field"><span class="gh-sr">Search plans</span><input type="search" placeholder="Search plans" data-gh="search"></label>` : ''}
  <label class="gh-field"><span class="gh-sr">Sort</span><select data-gh="sort"><option value="">Recommended</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name</option></select></label>
  ${filterKeys.map((k) => `<label class="gh-field"><span class="gh-sr">${esc(SPEC_LABEL[k] || k)}</span><select data-gh="filter" data-attr="${esc(k)}"><option value="">All ${esc((SPEC_LABEL[k] || k).toLowerCase())}</option></select></label>`).join('')}
  <span class="gh-count" aria-live="polite"></span>
</div>`;
}

export function renderProducts(data: Record<string, any>, sectionId: string, cats: RCategory[], all: RProduct[], ctx0: Ctx): string | null {
  const ctx = { ...ctx0, sectionId };
  const groups = cats.map((c) => ({ cat: c, items: all.filter((p) => p.categoryId === c.id) })).filter((g) => g.items.length);
  if (!groups.length) return null; // caller falls back to the original HTML
  const sid = `ghp-${sectionId.slice(-8)}`;
  const hasYearly = groups.some((g) => g.items.some((p) => { const cs = cycles(p, ctx.currency); return cs.some((c) => c.cycle === 'monthly') && cs.some((c) => c.cycle === 'annually'); }));
  const maxSave = Math.max(0, ...groups.flatMap((g) => g.items.map((p) => { const cs = cycles(p, ctx.currency); const m = cs.find((c) => c.cycle === 'monthly'), y = cs.find((c) => c.cycle === 'annually'); return m && y ? Math.round((1 - y.perMonth / m.price) * 100) : 0; })));

  const panes = groups.map((g, gi) => {
    const items = g.items;
    const template = data.template || g.cat.cardTemplate || 'plan-card';
    const L = chooseLayout({ count: items.length, override: data.layout && data.layout !== 'auto' ? data.layout : g.cat.layout, template });
    const pid = `${sid}-${gi}`;
    const specKeys = (() => {
      const counts = new Map<string, number>();
      items.forEach((p) => Object.keys(deriveSpecs(p.features, p.attributes)).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
      return [...counts.entries()].filter(([k, n]) => SPEC_LABEL[k] && n >= Math.max(1, items.length / 2)).map(([k]) => k);
    })();
    const filterKeys = specKeys.filter((k) => ['location', 'cpu', 'ram', 'storage'].includes(k)).slice(0, 2);
    const listView = template === 'server-row' || L.mode === 'catalog';
    let body: string;
    if (L.mode === 'featured' && !listView) {
      body = `<div class="gh-items gh-featured-wrap" id="${pid}">${items.map((p) => featuredCard(p, ctx, hasYearly)).join('')}</div>`;
    } else if (listView) {
      const has = (k: string) => items.some((p) => !!deriveSpecs(p.features, p.attributes)[k]);
      const cols = (template === 'server-row' ? ['cpu', 'ram', 'storage', 'os', 'bandwidth', 'ips', 'location'] : specKeys).filter(has).slice(0, 5);
      body = `${items.length > 4 ? toolbar(pid, items.length > 8, filterKeys) : ''}
      <div class="gh-list" role="table" style="--gh-cols:${cols.length}">
        <div class="gh-row gh-row-head" role="row"><div role="columnheader">Plan</div>${cols.map((c) => `<div role="columnheader">${esc(SPEC_LABEL[c] || c)}</div>`).join('')}<div role="columnheader">Price</div><div role="columnheader"><span class="gh-sr">Order</span></div></div>
        <div class="gh-items" id="${pid}" data-page-size="${items.length > 15 ? 15 : 0}">${items.map((p) => row(p, ctx, cols, hasYearly)).join('')}</div>
      </div>${items.length > 15 ? `<nav class="gh-pager" data-target="${pid}" aria-label="Pages"></nav>` : ''}`;
    } else {
      const highlightIdx = items.findIndex((p) => p.featured) >= 0 ? items.findIndex((p) => p.featured) : items.length === 3 ? 1 : -1;
      body = `${L.toolbar ? toolbar(pid, L.search, filterKeys) : ''}
      <div class="gh-cards gh-items" id="${pid}" style="--gh-n:${Math.min(items.length, L.mode === 'cards' ? 4 : 4)}" data-page-size="${L.pageSize}">${items.map((p, i) => card(p, ctx, { highlight: i === highlightIdx, hasYearly })).join('')}</div>
      ${L.pageSize ? `<nav class="gh-pager" data-target="${pid}" aria-label="Pages"></nav>` : ''}${L.mode === 'cards' && items.length > 1 ? compareTable(items, ctx) : ''}`;
    }
    return { g, pid, body, mode: listView ? 'list' : L.mode };
  });

  const toggle = hasYearly ? `<div class="gh-cycle" role="group" aria-label="Billing period"><button type="button" aria-pressed="true" data-cycle="monthly">Monthly</button><button type="button" aria-pressed="false" data-cycle="yearly">Yearly${maxSave > 0 ? ` <span>save up to ${maxSave}%</span>` : ''}</button></div>` : '';
  const tabs = panes.length > 1
    ? `<div class="gh-tabs" role="tablist" aria-label="Choose a category">${panes.map((p, i) => `<button type="button" role="tab" id="${p.pid}-t" aria-controls="${p.pid}-p" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(p.g.cat.name)} <span>${p.g.items.length}</span></button>`).join('')}</div>`
    : '';
  const inner = panes.map((p, i) => `<div class="gh-pane" role="${panes.length > 1 ? 'tabpanel' : 'region'}" id="${p.pid}-p" aria-labelledby="${p.pid}-t"${i ? ' hidden' : ''} data-mode="${p.mode}">${p.body}</div>`).join('');

  // keep theme background classes, drop theme spacing/negative margins (they caused overlap with heroes)
  const wrap = String(data.wrapperClass || '').split(/\s+/).filter((c) => c && !/^(m|p)[tbxylr]?(-(sm|md|lg|xl))?-n?\d+$|^mtm-|^mt-n|^mt-\w+-n|^position-|^px-|^py-/.test(c)).join(' ');
  return `<section class="gh-products ${esc(wrap)}" data-layout="${panes.map((p) => p.mode).join(',')}" data-section="${esc(sectionId)}">
  <div class="gh-wrap">
    ${data.title || data.subtitle ? `<div class="gh-head">${data.title ? `<h2>${esc(data.title)}</h2>` : ''}${data.subtitle ? `<p>${esc(data.subtitle)}</p>` : ''}</div>` : ''}
    ${tabs || toggle ? `<div class="gh-controls">${tabs}${toggle}</div>` : ''}
    ${inner}
  </div>
</section>`;
}
