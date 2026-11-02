// Product detail page (/p/<slug>): category-aware hero visual, spec tiles, full "what's included",
// sticky buy box with real billing cycles, in-category comparison, related plans, FAQ and Product JSON-LD.
import type { PageCtx } from '../index';
import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '../../db';
import { esc } from '../../render/util';
import { CYCLE_MONTHS, money } from '../../pricing';
import { ROUTES } from '../routes';
import { getCatalog, productBySlug, categoryBySlug, cycles, orderUrl, deriveSpecs, SPEC_LABEL, fromPrice, type TProduct, type Catalog } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, planCards, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, ld, icon, hexIcon, available, type IconName,
} from '../ui';

type Kind = 'server' | 'ssl' | 'hosting' | 'email' | 'other';
type Cyc = ReturnType<typeof cycles>[number];

const CYCLE_NAME: Record<string, string> = { monthly: 'Monthly', quarterly: 'Every 3 months', semiannually: 'Every 6 months', annually: 'Yearly', biennially: 'Every 2 years', triennially: 'Every 3 years', onetime: 'One-time', free: 'Free' };
const UNIT: Record<string, string> = { monthly: '/ month', quarterly: '/ quarter', semiannually: '/ 6 months', annually: '/ year', biennially: '/ 2 years', triennially: '/ 3 years', onetime: 'one-time', free: '' };
const ISO: Record<string, string> = { monthly: 'P1M', quarterly: 'P3M', semiannually: 'P6M', annually: 'P1Y', biennially: 'P2Y', triennially: 'P3Y' };
const SPEC_ICON: Record<string, IconName> = { cpu: 'cpu', ram: 'memory', storage: 'hdd', bandwidth: 'wifi', ips: 'net', websites: 'globe', email: 'mail', location: 'pin', os: 'monitor' };

function kindOf(catSlug: string): Kind {
  if (/ssl/.test(catSlug)) return 'ssl';
  if (/dedicated|vps|forex|ai-llm|server|mcps/.test(catSlug)) return 'server';
  if (/email|workspace/.test(catSlug)) return 'email';
  if (/hosting|shared|wordpress|reseller|cpanel/.test(catSlug)) return 'hosting';
  return 'other';
}

/** Tidy WHMCS-style names ("Positivessl Dv" → "PositiveSSL DV"); fall back to the slug when the name has no letters. */
export function displayName(p: { name: string; slug: string }) {
  let n = p.name.trim();
  if (!/[a-z]{2}/i.test(n)) n = p.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return n
    .replace(/\b(dv|ov|ev|ssl|vps|pm|ai|llm|sg|usa|ip|os|cpu|ram|nvme|ssd)\b/gi, (m) => m.toUpperCase())
    .replace(/\bN8n\b/gi, 'n8n').replace(/ssl(?=\w)|(?<=\w)ssl\b/gi, 'SSL').replace(/\bGeotrust\b/i, 'GeoTrust').replace(/\bBusinessid\b/i, 'BusinessID')
    .replace(/\bThawte Ssl123\b/i, 'Thawte SSL123').replace(/\bEssentialSSL\b/, 'EssentialSSL').replace(/\bPositiveSSL\b/, 'PositiveSSL');
}

/** Load an unpublished product for admin preview (prices included). */
async function previewProduct(slug: string, cat: Catalog): Promise<TProduct | null> {
  const [r] = await db.select().from(schema.products).where(and(eq(schema.products.slug, slug), ne(schema.products.status, 'ARCHIVED'))).limit(1);
  if (!r) return null;
  const prices = await db.select().from(schema.productPrices).where(eq(schema.productPrices.productId, r.id));
  const c = cat.categories.find((x) => x.id === r.categoryId);
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, description: r.description, features: (r.features || []).filter((f) => typeof f === 'string' && f.trim()),
    attributes: r.attributes || {}, badge: r.badge, badgeColor: r.badgeColor, featured: r.featured, displayCycle: r.displayCycle, orderUrl: r.orderUrl,
    whmcsPid: r.whmcsPid, categoryId: r.categoryId, sortOrder: r.sortOrder, whmcsType: r.whmcsType, payType: r.payType, categorySlug: c?.slug || '', configOptions: r.configOptions || [],
    prices: prices.map((p) => ({ currency: p.currency, prefix: p.prefix, suffix: p.suffix, cycle: p.cycle, price: String(p.price), setupFee: String(p.setupFee) })),
  };
}

/** The listing page for a category: first route whose categories include it (prefers routes whose first category matches). */
function routeFor(catSlug: string) {
  const entries = Object.entries(ROUTES).filter(([, r]) => r.categories?.includes(catSlug));
  const best = entries.find(([, r]) => r.categories![0] === catSlug) || entries[0];
  return best ? { slug: best[0], title: best[1].title, categories: best[1].categories! } : null;
}

/** "30TB1Gbps" → "30TB, 1Gbps"; "Unmetered10Gbps" → "Unmetered 10Gbps". */
const pretty = (v: string) => v.replace(/(\d\s?[TG]B)(?=\d)/g, '$1, ').replace(/([a-z])(?=\d)/g, '$1 ').replace(/\bId's\b/g, 'IDs');
function specsOf(p: TProduct) { const s = deriveSpecs(p.features, p.attributes); for (const k of Object.keys(s)) s[k] = pretty(s[k]); return s; }

/* ------------------------------------------------------------------ hero visuals */
const short = (v: string, n = 26) => (v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : v);

function serverVisual(specs: Record<string, string>) {
  const slots: [string, string][] = (['cpu', 'ram', 'storage', 'bandwidth', 'ips', 'os'] as const).filter((k) => specs[k]).slice(0, 4).map((k) => [k, specs[k]]);
  const pos = ['tl', 'tr', 'bl', 'br'];
  // traces from chip pins to the four corners
  const traces = [
    'M150 118 V92 H96 V54', 'M170 118 V82 H226 V54',
    'M150 202 V228 H96 V266', 'M170 202 V238 H226 V266',
    'M118 150 H70 V128 H24', 'M202 150 H250 V128 H296', 'M118 170 H62 V196 H24', 'M202 170 H258 V196 H296',
  ];
  const pins = Array.from({ length: 7 }, (_, i) => 122 + i * 12.6);
  return `<div class="pd-vis pd-vis--server" aria-hidden="true">
  <svg class="pd-chip" viewBox="0 0 320 320">
    <defs><linearGradient id="pdg-chip" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c3d4c"/><stop offset="1" stop-color="#16212b"/></linearGradient></defs>
    <g class="pd-traces">${traces.map((d) => `<path d="${d}" class="pd-trace"/>`).join('')}</g>
    <g class="pd-pulses">${traces.map((d, i) => `<path d="${d}" class="pd-pulse" style="--d:${(i * 0.37).toFixed(2)}s"/>`).join('')}</g>
    <g class="pd-pins">${pins.map((x) => `<rect x="${x}" y="108" width="5" height="12" rx="1"/><rect x="${x}" y="200" width="5" height="12" rx="1"/><rect x="108" y="${x}" width="12" height="5" rx="1"/><rect x="200" y="${x}" width="12" height="5" rx="1"/>`).join('')}</g>
    <rect x="118" y="118" width="84" height="84" rx="10" fill="url(#pdg-chip)" stroke="rgba(255,255,255,.22)"/>
    <rect class="pd-core" x="132" y="132" width="56" height="56" rx="6"/>
    <path d="M160 140 182 152.5V177.5L160 190 138 177.5V152.5Z" fill="none" stroke="#fdd700" stroke-width="1.6"/>
    <circle cx="124" cy="124" r="2" fill="rgba(255,255,255,.5)"/>
  </svg>
  ${slots.map(([k, v], i) => `<div class="pd-tag pd-tag--${pos[i]}"><span class="pd-tag__i">${icon(SPEC_ICON[k] || 'check')}</span><span><small>${esc(SPEC_LABEL[k] || k)}</small><b>${esc(short(v))}</b></span></div>`).join('')}
</div>`;
}

function sslLevel(p: TProduct) {
  const inc = p.features.filter((f) => !f.trim().startsWith('-')).join(' ');
  const t = `${p.name} ${inc}`;
  const level = /extended validation|\bEV\b/i.test(t) ? 'Extended validation' : /organi[sz]ation|business ?id|\bOV\b/i.test(t) ? 'Organization validation' : 'Domain validation';
  const wildcard = /wildcard/i.test(p.name) || /wildcard/i.test(inc);
  return { level, wildcard, short: level.startsWith('Ext') ? 'EV' : level.startsWith('Org') ? 'OV' : 'DV' };
}

function sslVisual(p: TProduct) {
  const s = sslLevel(p);
  const host = s.wildcard ? '*.yourdomain.com' : 'yourdomain.com';
  const steps = [['Certificate authority', 'Trusted root'], [s.level, s.wildcard ? 'All first-level subdomains' : 'One domain'], [host, 'Encrypted with HTTPS']];
  return `<div class="pd-vis pd-vis--ssl" aria-hidden="true">
  <div class="pd-bar"><span class="pd-bar__dots"><i></i><i></i><i></i></span><span class="pd-bar__url">${icon('lock')}<b>https://</b>${esc(host)}</span></div>
  <div class="pd-lock">
    <svg viewBox="0 0 160 190"><path class="pd-shackle" d="M44 86V58a36 36 0 0 1 72 0v28" fill="none" stroke="#e9edf1" stroke-width="14" stroke-linecap="round"/>
    <rect x="18" y="82" width="124" height="98" rx="18" fill="#c5386f"/><rect x="18" y="82" width="124" height="98" rx="18" fill="url(#pdg-lock)"/>
    <defs><linearGradient id="pdg-lock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>
    <circle cx="80" cy="124" r="11" fill="#16212b"/><rect x="75" y="128" width="10" height="24" rx="4" fill="#16212b"/></svg>
    <span class="pd-lock__lvl">${esc(s.short)}</span>
  </div>
  <ol class="pd-chain">${steps.map(([a, b], i) => `<li style="--i:${i}"><span class="pd-chain__ok">${icon('check')}</span><span><b>${esc(a)}</b><small>${esc(b)}</small></span></li>`).join('')}</ol>
</div>`;
}

// approximate globe position of a location label (front hemisphere view centred on 40°E)
const LOC: Record<string, [number, number]> = { malaysia: [3, 101], singapore: [1.3, 103.8], usa: [39, -77], 'united states': [39, -77], uae: [25.2, 55.3], dubai: [25.2, 55.3], india: [19, 72.8], germany: [50, 8.6], uk: [51.5, 0], netherlands: [52.3, 4.9], brazil: [-23.5, -46.6], 'south africa': [-26.2, 28], russia: [55.7, 37.6], algeria: [36.7, 3.1] };
function globeVisual(specs: Record<string, string>, p: TProduct) {
  const loc = specs.location || (/\bMY\b/.test(p.name) ? 'Malaysia' : /\bSG\b/.test(p.name) ? 'Singapore' : /\bUSA?\b/.test(p.name) ? 'USA' : '');
  const ll = LOC[loc.toLowerCase()];
  // orthographic projection, centre lon chosen so the pin sits on the visible side
  const lon0 = ll ? ll[1] + 28 : 40, lat0 = 15;
  let pin = '';
  if (ll) {
    const r = 110, rad = Math.PI / 180, [la, lo] = ll;
    const x = r * Math.cos(la * rad) * Math.sin((lo - lon0) * rad);
    const y = r * (Math.cos(lat0 * rad) * Math.sin(la * rad) - Math.sin(lat0 * rad) * Math.cos(la * rad) * Math.cos((lo - lon0) * rad));
    pin = `<g class="pd-pin" transform="translate(${(150 + x).toFixed(1)} ${(150 - y).toFixed(1)})"><circle class="pd-ring" r="10"/><circle class="pd-ring pd-ring--2" r="10"/><circle r="6" fill="#fdd700"/><circle r="2.4" fill="#16212b"/></g>`;
  }
  const meridians = Array.from({ length: 12 }, (_, i) => `<ellipse cx="${150 + i * 40}" cy="150" rx="${18 + (i % 3) * 14}" ry="110"/>`).join('');
  const tiles = (['storage', 'websites', 'bandwidth', 'email'] as const).filter((k) => specs[k]).slice(0, 3);
  return `<div class="pd-vis pd-vis--globe" aria-hidden="true">
  <svg class="pd-globe" viewBox="0 0 300 300">
    <defs><clipPath id="pdc-globe"><circle cx="150" cy="150" r="110"/></clipPath><radialGradient id="pdg-globe" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#2f4252"/><stop offset="1" stop-color="#121c25"/></radialGradient></defs>
    <circle cx="150" cy="150" r="128" class="pd-orbit"/>
    <circle cx="150" cy="150" r="110" fill="url(#pdg-globe)"/>
    <g clip-path="url(#pdc-globe)" class="pd-grid"><g class="pd-spin">${meridians}</g>
      ${[-70, -35, 0, 35, 70].map((dy) => `<ellipse cx="150" cy="${150 + dy}" rx="${Math.sqrt(110 * 110 - dy * dy).toFixed(1)}" ry="${(8 + Math.abs(dy) / 10).toFixed(1)}"/>`).join('')}</g>
    <circle cx="150" cy="150" r="110" fill="none" stroke="rgba(255,255,255,.22)"/>
    ${pin}
    <circle class="pd-sat" cx="150" cy="22" r="4"/>
  </svg>
  ${loc ? `<div class="pd-loc">${icon('pin')}<span><small>Datacenter</small><b>${esc(loc)}</b></span></div>` : ''}
  ${tiles.length ? `<ul class="pd-meters">${tiles.map((k, i) => `<li style="--i:${i}">${icon(SPEC_ICON[k])}<span><small>${esc(SPEC_LABEL[k])}</small><b>${esc(short(specs[k], 22))}</b></span></li>`).join('')}</ul>` : ''}
</div>`;
}

function hexVisual(k: Kind, name: string) {
  const ic: IconName = k === 'email' ? 'mail' : 'box';
  const cells = [[0, 0], [1, 0], [-1, 0], [0.5, -0.86], [-0.5, -0.86], [0.5, 0.86], [-0.5, 0.86]];
  return `<div class="pd-vis pd-vis--hex" aria-hidden="true"><div class="pd-hexes">${cells.map(([x, y], i) => `<span class="pd-hx${i ? '' : ' is-core'}" style="--x:${x};--y:${y};--i:${i}">${i ? '' : icon(ic)}</span>`).join('')}</div><p class="pd-vis__name">${esc(name)}</p></div>`;
}

/* ------------------------------------------------------------------ configurator (WHMCS configurable options) */
/** OS / extra RAM, vCPU, disk… exactly as configured in WHMCS. Prices are the selling prices (after your margin) synced from WHMCS;
 *  the client recalculates the total per billing cycle and passes configoption[ID]=value to the WHMCS cart. */
function configurator(p: TProduct, cs: Cyc[]) {
  const opts = (p.configOptions || []).filter((o) => o.options.length);
  if (!opts.length) return '';
  const cur = p.prices.find((x) => x.cycle === cs[0]?.cycle)?.currency || 'USD';
  const priceMap = (c: { pricing: Record<string, Record<string, number>>; setup: Record<string, Record<string, number>> }) =>
    esc(JSON.stringify({ p: c.pricing[cur] || {}, s: c.setup[cur] || {} }));
  const isOS = (n: string) => /operating|os\b|system|template|image/i.test(n);
  const fields = opts.map((o) => {
    const fid = `pd-cfg-${o.id}`;
    if (o.type === 'quantity') {
      const c = o.options[0];
      const max = o.max && o.max > 0 ? o.max : 256;
      return `<div class="pd-cfg__row"><label for="${fid}">${esc(o.name)}</label>
        <div class="pd-step" data-step><button type="button" class="pd-step__b" data-d="-1" aria-label="Less ${esc(o.name)}">−</button>
        <input type="number" inputmode="numeric" id="${fid}" data-cfg="${o.id}" data-kind="qty" data-price="${priceMap(c)}" min="${o.min ?? 0}" max="${max}" step="1" value="${o.min ?? 0}">
        <button type="button" class="pd-step__b" data-d="1" aria-label="More ${esc(o.name)}">+</button></div>
        <small class="pd-cfg__unit" data-unitprice></small></div>`;
    }
    if (o.type === 'yesno') {
      const c = o.options[0];
      return `<div class="pd-cfg__row pd-cfg__row--check"><label><input type="checkbox" id="${fid}" data-cfg="${o.id}" data-kind="yesno" data-val="${c.id}" data-price="${priceMap(c)}"> ${esc(o.name)}</label></div>`;
    }
    return `<div class="pd-cfg__row${isOS(o.name) ? ' pd-cfg__row--os' : ''}"><label for="${fid}">${esc(o.name)}</label>
      <select id="${fid}" data-cfg="${o.id}" data-kind="select">${o.options.map((c) => `<option value="${c.id}" data-price="${priceMap(c)}">${esc(c.name)}</option>`).join('')}</select></div>`;
  }).join('');
  return `<fieldset class="pd-cfg" data-cfgbox><legend>Configure your server</legend>${fields}
    <p class="pd-cfg__note">Add-ons are billed with every renewal at the period you choose. Disk can only be increased later.</p></fieldset>`;
}

/* ------------------------------------------------------------------ buy box */
function buyBox(p: TProduct, name: string, cs: Cyc[], def: Cyc | null, base: string, kind: Kind) {
  const monthly = cs.find((c) => c.cycle === 'monthly');
  const trust: Record<Kind, string[]> = {
    hosting: ['Free SSL certificate', 'Daily and weekly backups', '24/7 support'],
    server: ['Full root or administrator access', '24/7 support', 'Login details sent by email'],
    ssl: ['Issued by a trusted certificate authority', 'Installation help from support'],
    email: ['Mailboxes on your own domain', '24/7 support'],
    other: ['24/7 support', 'Managed from your client area'],
  };
  if (!def) {
    return `<aside class="pd-buy" aria-labelledby="pd-buy-h"><h2 id="pd-buy-h">Order ${esc(name)}</h2>
    <p class="pd-buy__na">The price for this plan is confirmed live in our order form, where you can also choose the billing period.</p>
    <a class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" href="${esc(orderUrl(p, base))}">See price and order</a>
    <a class="hp-btn hp-btn--ghost hp-btn--block" href="/contact">Ask sales a question</a>
    <ul class="pd-buy__trust">${trust[kind].map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul></aside>`;
  }
  const opts = cs.map((c) => {
    const m = CYCLE_MONTHS[c.cycle] || 0;
    const save = monthly && m > 1 ? Math.round((1 - c.perMonth / monthly.price) * 100) : 0;
    const sub = [m > 1 ? `about ${money(c.perMonth, c.prefix)} a month` : c.cycle === 'monthly' ? 'Pay month to month' : '', c.setup > 0 ? `plus ${money(c.setup, c.prefix)} setup` : ''].filter(Boolean).join(', ');
    const id = `pd-c-${c.cycle}`;
    return `<label class="pd-opt" for="${id}"><input type="radio" name="pd-cycle" id="${id}" value="${esc(c.cycle)}"${c === def ? ' checked' : ''}
      data-href="${esc(orderUrl(p, base, c.cycle))}" data-price="${esc(money(c.price, c.prefix))}" data-unit="${esc(UNIT[c.cycle] || '')}" data-due="${esc(money(c.price + c.setup, c.prefix))}" data-setup="${c.setup > 0 ? esc(money(c.setup, c.prefix)) : ''}" data-amt="${c.price}" data-setupamt="${c.setup}" data-prefix="${esc(c.prefix)}">
      <span class="pd-opt__radio" aria-hidden="true"></span>
      <span class="pd-opt__txt"><b>${esc(CYCLE_NAME[c.cycle] || c.cycle)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="pd-opt__p num">${esc(money(c.price, c.prefix))}${save >= 3 ? `<em>Save ${save}%</em>` : ''}</span></label>`;
  }).join('');
  return `<aside class="pd-buy" aria-labelledby="pd-buy-h" data-buy>
  <h2 id="pd-buy-h">Order ${esc(name)}</h2>
  <div class="pd-buy__price num" aria-live="polite"><span data-buy-price>${esc(money(def.price, def.prefix))}</span><small data-buy-unit>${esc(UNIT[def.cycle] || '')}</small></div>
  ${cs.length > 1 ? `<fieldset class="pd-opts"><legend>Billing period</legend>${opts}</fieldset>` : `<div class="pd-opts pd-opts--one">${opts}</div>`}
  ${configurator(p, cs)}
  <dl class="pd-due"><div><dt>First invoice${def.setup > 0 || cs.some((c) => c.setup > 0) ? ', including setup' : ''}</dt><dd class="num" data-buy-due>${esc(money(def.price + def.setup, def.prefix))}</dd></div></dl>
  <a class="hp-btn hp-btn--brand hp-btn--block hp-btn--lg" href="${esc(orderUrl(p, base, def.cycle))}" data-buy-order>${icon('cart')}Order now</a>
  <p class="pd-buy__note">Prices in ${esc(cs[0] ? (p.prices.find((x) => x.cycle === cs[0].cycle)?.currency || 'USD') : 'USD')}, before any tax. You review the total in our secure order form before paying.</p>
  <ul class="pd-buy__trust">${trust[kind].map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>
</aside>`;
}

/* ------------------------------------------------------------------ compare */
const CMP_LABEL: Record<string, string> = { ...SPEC_LABEL, validation: 'Validation', coverage: 'Coverage' };
function compareTable(p: TProduct, peers: TProduct[], currency: string, kind: Kind) {
  if (peers.length < 2) return '';
  const specOf = new Map(peers.map((x) => [x.id, specsOf(x)]));
  if (kind === 'ssl') for (const x of peers) { const l = sslLevel(x); specOf.set(x.id, { validation: l.level, coverage: l.wildcard ? 'Domain and subdomains' : 'One domain' }); }
  const cols = ['validation', 'coverage', 'cpu', 'ram', 'storage', 'bandwidth', 'websites', 'email', 'location', 'os'].filter((k) => peers.filter((x) => specOf.get(x.id)![k]).length >= Math.ceil(peers.length / 2)).slice(0, 3);
  const price = (x: TProduct) => { const f = fromPrice(x, currency); return f ? `<span>${money(f.price, f.prefix)} <small>${esc(UNIT[f.cycle] || '')}</small></span>` : '<small>See price</small>'; };
  return `<div class="pd-cmp" data-reveal><table class="pd-cmp__t"><caption class="sr-only">Plans in this category</caption>
  <thead><tr><th scope="col">Plan</th>${cols.map((k) => `<th scope="col">${esc(CMP_LABEL[k] || k)}</th>`).join('')}<th scope="col">From</th></tr></thead>
  <tbody>${peers.map((x) => { const s = specOf.get(x.id)!; const me = x.id === p.id; return `<tr${me ? ' class="is-me" aria-current="true"' : ''}><th scope="row">${me ? `<span>${esc(displayName(x))}</span><em>This plan</em>` : `<a href="/p/${esc(x.slug)}">${esc(displayName(x))}</a>`}</th>${cols.map((k) => `<td data-label="${esc(CMP_LABEL[k] || k)}">${esc(s[k] || '—')}</td>`).join('')}<td class="num" data-label="From">${price(x)}</td></tr>`; }).join('')}</tbody></table></div>`;
}

/* ------------------------------------------------------------------ FAQ */
function faqFor(kind: Kind, p: TProduct, name: string, specs: Record<string, string>, cs: Cyc[]) {
  const billing = cs.length > 1 ? `${name} can be paid ${cs.map((c) => (CYCLE_NAME[c.cycle] || c.cycle).toLowerCase()).join(' or ')}. Longer periods cost less per month; the exact saving is shown next to each option.`
    : cs.length === 1 ? `${name} is billed ${(CYCLE_NAME[cs[0].cycle] || cs[0].cycle).toLowerCase()}. You can see and pay every invoice from your client area.`
    : 'The billing periods and prices for this plan are shown in our order form. You can see and pay every invoice from your client area.';
  const q: { q: string; a: string }[] = [];
  if (kind === 'server') {
    q.push({ q: 'What happens after I order?', a: 'Once your payment is confirmed the server is provisioned and the login details are sent to your email. You can follow the status of the order and open a ticket from your client area at any time.' });
    q.push({ q: 'Do I get full access to the server?', a: `Yes. You get root access on Linux or administrator access on Windows, so you can install the software and control panel you need.${specs.os ? ` This plan runs ${specs.os}.` : ''}` });
    if (specs.bandwidth) q.push({ q: 'How much traffic is included?', a: `This plan includes ${specs.bandwidth.replace(/(\d)(?=\d*Gbps)/, '$1')}. If you expect more, ask sales and we will suggest a plan with a larger allowance or a faster port.` });
    if (specs.ips) q.push({ q: 'How many IP addresses do I get?', a: `${specs.ips} are included with ${name}. Additional addresses can be requested through a support ticket.` });
    q.push({ q: 'Can I upgrade later?', a: 'Yes. Open a ticket or contact sales and our team will move you to a larger configuration and explain any difference in price before anything changes.' });
  } else if (kind === 'ssl') {
    const s = sslLevel(p);
    q.push({ q: 'What does the validation level mean?', a: s.short === 'DV' ? 'Domain validation proves you control the domain, usually by email, DNS record or file upload. It is the fastest certificate to issue and suits blogs, portfolios and most small business sites.' : s.short === 'OV' ? 'Organization validation checks that your business is real and registered, so the certificate carries your organization name. It suits companies that collect customer data.' : 'Extended validation is the most thorough check of your organization and suits banks, stores and companies handling sensitive data.' });
    q.push({ q: 'How long does issuance take?', a: s.short === 'DV' ? 'Domain-validated certificates are usually issued within minutes of completing the validation step.' : 'Business-validated certificates need the certificate authority to check your company documents, which can take a few working days.' });
    q.push({ q: 'Does it cover subdomains?', a: s.wildcard ? 'Yes. A wildcard certificate secures your domain and every first-level subdomain, such as shop., mail. and app.' : 'This certificate secures one domain name. If you need to cover several subdomains, choose a wildcard certificate.' });
    q.push({ q: 'Can you install it for me?', a: 'Yes. If your website is hosted with Globalhostia our support team can install the certificate for you. For other servers we send the files and step-by-step instructions.' });
  } else if (kind === 'hosting') {
    q.push({ q: 'Where will my website be hosted?', a: specs.location ? `${name} runs in our ${specs.location} datacenter. Pick the location closest to most of your visitors for the fastest page loads.` : 'You choose the datacenter when you order. Pick the location closest to most of your visitors.' });
    q.push({ q: 'Is an SSL certificate included?', a: 'Yes. Every hosting plan includes a free SSL certificate so your website loads over HTTPS from the first day.' });
    q.push({ q: 'Can you move my existing website?', a: 'Yes. Our team can migrate your files, databases and email from your current host. Open a ticket after ordering and tell us where your site is now.' });
    q.push({ q: 'What if I outgrow this plan?', a: 'You can upgrade to a larger plan from your client area or ask support. Your website, email and data stay where they are.' });
  } else {
    q.push({ q: `What is included with ${name}?`, a: 'Everything listed under "What is included" on this page. Items shown with a cross are not part of this plan.' });
    q.push({ q: 'How do I get started?', a: 'Choose a billing period and order. Your login details arrive by email and the service appears in your client area.' });
  }
  q.push({ q: 'How does billing work?', a: billing });
  return q.slice(0, 6);
}

/* ------------------------------------------------------------------ page */
export default async function render(ctx: PageCtx): Promise<string | null> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  let p: TProduct | null = productBySlug(cat, ctx.slug) || null;
  if (!p && ctx.preview) p = await previewProduct(ctx.slug, cat);
  if (!p) return null;

  const name = displayName(p);
  const catRow = categoryBySlug(cat, p.categorySlug);
  const kind = kindOf(p.categorySlug);
  const route = /binance|mcp|engine/i.test(`${p.name} ${p.slug}`) && ROUTES.binance ? { slug: 'binance', title: ROUTES.binance.title, categories: ROUTES.binance.categories! } : routeFor(p.categorySlug);
  const specs = specsOf(p);
  const cs = cycles(p, currency).filter((c) => Number.isFinite(c.price) && c.cycle !== 'onetime');
  const best = cs.length ? cs.reduce((a, b) => (b.perMonth < a.perMonth ? b : a)) : null;
  const def = (p.displayCycle && p.displayCycle !== 'auto' && cs.find((c) => c.cycle === p!.displayCycle)) || best;
  const catLabel = catRow?.name || route?.title || 'Plans';
  const crumbs = [{ label: 'Home', href: '/' }, ...(route ? [{ label: route.title, href: `/${route.slug}` }] : []), { label: name }];
  const lead = p.tagline && p.tagline !== name ? p.tagline : p.description || (route ? `${name} from our ${route.title} range.` : '');

  // peers in the same category (and sibling categories of the listing route), cheapest first
  const per = (x: TProduct) => fromPrice(x, currency)?.amount ?? 1e9;
  const pool0 = cat.products.filter((x) => (route ? route.categories.includes(x.categorySlug) : x.categorySlug === p!.categorySlug));
  const pool = available(pool0);
  // n8n servers and Binance MCP engines share one WHMCS group: never mix them in comparisons
  const mcpKind = (x: { name: string; slug: string }) => /binance|mcp|engine/i.test(`${x.name} ${x.slug}`);
  const poolK = pool.filter((x) => mcpKind(x) === mcpKind(p!));
  const sameCat = poolK.filter((x) => x.categorySlug === p!.categorySlug).sort((a, b) => per(a) - per(b) || a.sortOrder - b.sortOrder);
  if (!sameCat.some((x) => x.id === p!.id)) sameCat.unshift(p);
  // a window of up to 6 plans around this one
  const idx = sameCat.findIndex((x) => x.id === p!.id);
  const start = Math.max(0, Math.min(idx - 2, sameCat.length - 6));
  const peers = sameCat.slice(start, start + 6);
  const related = available(poolK.filter((x) => x.id !== p!.id))
    .sort((a, b) => Math.abs(per(a) - per(p!)) - Math.abs(per(b) - per(p!)) || (a.categorySlug === p!.categorySlug ? -1 : 1))
    .slice(0, 3).sort((a, b) => per(a) - per(b));

  /* hero */
  const visual = kind === 'server' ? serverVisual(specs) : kind === 'ssl' ? sslVisual(p) : kind === 'hosting' ? globeVisual(specs, p) : hexVisual(kind, name);
  const fromHtml = def ? `${def.cycle === 'monthly' ? '' : 'From '}<b class="num">${esc(money(def.price, def.prefix))}</b> ${esc(UNIT[def.cycle] || '')}${def.setup > 0 ? `, plus ${esc(money(def.setup, def.prefix))} setup` : ''}` : 'Price confirmed live in the order form';
  const hero = pageHero({
    crumbs, eyebrow: catLabel, title: name, lead, visualHtml: visual, fromHtml,
    ctas: [{ label: def ? 'Choose billing and order' : 'See price and order', href: '#buy', icon: 'cart' }, { label: 'Compare plans', href: '#compare', variant: 'ghost' }],
  });

  /* spec tiles */
  let tiles = Object.entries(specs).filter(([k]) => SPEC_LABEL[k]).map(([k, v]) => ({ ic: SPEC_ICON[k] || 'check', label: SPEC_LABEL[k], value: v }));
  if (kind === 'ssl') {
    const s = sslLevel(p);
    tiles = [{ ic: 'shield', label: 'Validation', value: s.level }, { ic: 'globe', label: 'Coverage', value: s.wildcard ? 'Domain and all subdomains' : 'One domain' }];
    const enc = p.features.find((f) => /bit/i.test(f) && !f.startsWith('-')); if (enc) tiles.push({ ic: 'lock', label: 'Encryption', value: enc });
    const iss = p.features.find((f) => /issu/i.test(f) && !f.startsWith('-')); if (iss) tiles.push({ ic: 'clock', label: 'Issuance', value: iss });
  }
  if (tiles.length < 2) tiles = p.features.filter((f) => !f.trim().startsWith('-')).slice(0, 4).map((f) => ({ ic: 'check', label: 'Included', value: f }));
  const tilesHtml = tiles.length ? `<section class="pd-tiles-wrap" aria-label="Key specifications"><div class="hp-container"><ul class="pd-tiles pd-tiles--${Math.min(tiles.length, 6)}" data-stagger>${tiles.slice(0, 6).map((t) => `<li data-reveal>${hexIcon(t.ic)}<span><small>${esc(t.label)}</small><b>${esc(t.value)}</b></span></li>`).join('')}</ul></div></section>` : '';

  /* included */
  const inc = p.features.filter((f) => !f.trim().startsWith('-')), off = p.features.filter((f) => f.trim().startsWith('-')).map((f) => f.trim().replace(/^-\s*/, ''));
  const desc = p.description && p.description !== p.tagline && p.description.length > 40 ? `<div class="hp-prose pd-desc">${p.description.split(/\n{2,}/).map((x) => `<p>${esc(x.trim())}</p>`).join('')}</div>` : '';
  const fit: Record<Kind, string> = {
    server: /vps/.test(p.categorySlug) ? 'A VPS gives you your own virtual server with dedicated vCPU and memory, full root access and the freedom to install any software: ideal for applications, staging sites and VPNs.'
      : /mcps|n8n/.test(p.categorySlug) ? 'A server sized for automation: run n8n workflows and tools on your own machine, with your data kept on your server.'
      : /forex/.test(p.categorySlug) ? 'An always-on server for MetaTrader terminals and trading bots, so your strategies keep running when your computer is off.'
      : /ai-llm/.test(p.categorySlug) ? 'A server sized for running open AI models privately, keeping prompts and data on hardware you control.'
      : 'A dedicated machine suits databases, busy online stores, game and application servers, and any workload that needs guaranteed CPU and memory.',
    hosting: 'Shared hosting suits company websites, blogs, portfolios and small online stores. Email, SSL and backups are handled for you.',
    ssl: 'An SSL certificate encrypts traffic between your visitors and your website, shows the padlock in the browser and is required for logins and payments.',
    email: 'Professional email on your own domain builds trust with customers and keeps company mail under your control.',
    other: '',
  };
  const included = `<div class="pd-inc" data-reveal>
    <h2 class="hp-hline" id="pd-inc-h">What is included</h2>
    ${fit[kind] ? `<p class="pd-fit">${esc(fit[kind])}</p>` : ''}
    ${desc}
    ${inc.length ? `<ul class="pd-list">${inc.map((f) => `<li>${icon('check')}<span>${esc(pretty(f))}</span></li>`).join('')}</ul>` : '<p class="hp-muted">The full feature list for this plan is shown in the order form.</p>'}
    ${off.length ? `<h3 class="pd-off-h">Not included in this plan</h3><ul class="pd-list pd-list--off">${off.map((f) => `<li>${icon('x')}<span><span class="sr-only">Not included: </span>${esc(f)}</span></li>`).join('')}</ul>${related.length ? `<p class="pd-off-note">Need one of these? <a href="#related">See the other plans</a> or <a href="/contact">ask sales</a>.</p>` : ''}` : ''}
  </div>`;
  const cmp = compareTable(p, peers, currency, kind);
  const main = `<section class="hp-section pd-main" aria-labelledby="pd-inc-h"><div class="hp-container pd-grid">
    <div class="pd-col">
      ${included}
      ${cmp ? `<div class="pd-cmp-wrap" id="compare"><h2 class="hp-hline">Compare with similar plans</h2><p class="pd-fit">The plans closest to ${esc(name)} in price. Prices are the lowest available billing period.</p>${cmp}${route ? `<p><a class="hp-link" href="/${esc(route.slug)}">See all ${esc(route.title.toLowerCase())}${icon('arrow')}</a></p>` : ''}</div>` : ''}
    </div>
    <div class="pd-side" id="buy">${buyBox(p, name, cs, def || null, base, kind)}</div>
  </div></section>`;

  /* related */
  const relatedHtml = related.length ? `<section class="hp-section hp-section--tint" id="related" aria-labelledby="pd-rel-h"><div class="hp-container">
    ${sectionHead({ id: 'pd-rel-h', title: 'Other plans to consider', lead: 'Similar plans from the same range, if you need a little more or a little less.' })}
    ${planCards(related.map((x) => ({ ...x, name: displayName(x) })), { currency, base, cycleSwitch: false, highlight: false, id: 'pd-related' })}
  </div></section>` : '';

  /* faq */
  const qs = faqFor(kind, p, name, specs, cs);
  const faqHtml = `<section class="hp-section" aria-labelledby="pd-faq-h"><div class="hp-container pd-faq">
    ${sectionHead({ id: 'pd-faq-h', title: `Questions about ${name}`, align: 'left', lead: 'Short answers to what customers ask before ordering. Our team is available around the clock for anything else.' })}
    ${faq(qs, { id: 'pd-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ title: def ? `Ready to order ${name}?` : `Get the price for ${name}`, text: 'Order online in a few minutes, or talk to our team first if you are unsure which plan fits.',
    primary: { label: def ? 'Order now' : 'See price and order', href: def ? orderUrl(p, base, def.cycle) : orderUrl(p, base) }, secondary: { label: 'Talk to sales', href: '/contact' } });

  /* JSON-LD */
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const product: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'Product', name, description: lead || `${name} by Globalhostia`, sku: p.whmcsPid ? String(p.whmcsPid) : p.slug,
    brand: { '@type': 'Brand', name: cat.settings.site_name || 'Globalhostia' }, category: catLabel, url: `${site}/p/${p.slug}`,
  };
  if (cs.length) product.offers = cs.map((c) => ({
    '@type': 'Offer', price: c.price.toFixed(2), priceCurrency: currency, availability: 'https://schema.org/InStock', url: orderUrl(p!, base, c.cycle),
    ...(ISO[c.cycle] ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: c.price.toFixed(2), priceCurrency: currency, billingDuration: ISO[c.cycle] } } : {}),
  }));

  return page({
    ctx, catalog: cat, path: `/p/${p.slug}`,
    title: `${name}${catRow ? ` | ${catRow.name}` : ''}`,
    description: (lead || `${name}: specifications, what is included and live pricing.`).slice(0, 300),
    css: ['product'], js: ['product'], noindex: !productBySlug(cat, ctx.slug),
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(qs), ld(product)],
    body: [hero, tilesHtml, main, relatedHtml, faqHtml, cta].join('\n'),
  });
}
