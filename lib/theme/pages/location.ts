// /locations/<loc>: every product type orderable in one location, grouped (shared, VPS, dedicated, RDP), real prices.
// /<type>/<loc> (/vps/germany, /dedicated-servers/france, /windows-rdp/usa, /web-hosting/usa): one type in one
// location, generated only when ≥2 such plans exist and the location also offers other types (lib/theme/pseo.ts).
// Location copy is plain geography: who is nearby, never invented latency figures.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { fitDescription } from '../../seo';
import { getCatalog, minFrom, fromPrice, type Catalog, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, planCards, specTable, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, icon, hexIcon, link, fromText } from '../ui';
import { trustStrip } from '../growth';
import { productsLd } from './vps';
import {
  FAMILIES, TYPE_LOC, TYPE_LOC_EXISTING, familyOf, inTypeLoc, locationGroups, typeLocPages, specOf, siteOf, andList,
  type LocGroup, type LocInfo,
} from '../pseo';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fromStr = (ps: TProduct[], cat: Catalog) => { const p = cheapestOf(ps, cat); return p ? fromText(p, cat.currency) : ''; };
function cheapestOf(ps: TProduct[], cat: Catalog) {
  const f = minFrom(ps, cat.currency);
  return f ? ps.find((p) => fromPrice(p, cat.currency)?.amount === f.amount) : undefined;
}
const rangeTxt = (xs: number[], unit: string) => {
  const v = xs.filter((x) => x > 0);
  if (!v.length) return '';
  const lo = Math.min(...v), hi = Math.max(...v), f = (n: number) => (unit === ' GB' && n >= 1024 ? `${+(n / 1024).toFixed(1)} TB` : `${+n.toFixed(1)}${unit}`);
  return lo === hi ? f(lo) : `${f(lo)} to ${f(hi)}`;
};

export default async function render(ctx: PageCtx): Promise<string | null> {
  const [prefix, slug] = ctx.slug.split('/');
  const cat = await getCatalog();
  const groups = locationGroups(cat);
  const g = groups.find((x) => x.loc.slug === slug);
  if (!g) return null;
  if (prefix === 'locations') return renderLocation(ctx, cat, g, groups);
  const tl = typeLocPages(cat, groups).find((x) => x.prefix === prefix && x.loc.slug === slug);
  if (!tl) return null;
  return renderTypeLoc(ctx, cat, prefix, g, tl.products, groups);
}

/** "Who should host here": nearby audiences + honest note + link to the browser speed test. */
function whoSection(loc: LocInfo, id: string, tint = false) {
  const near = loc.near.length ? loc.near : [loc.name];
  return `<section class="hp-section${tint ? ' hp-section--tint' : ''}" aria-labelledby="${id}"><div class="hp-container ps-two">
    <div data-reveal>
      <h2 id="${id}" class="hp-hline hp-h2">Who should host in ${esc(loc.the)}?</h2>
      <p class="hp-lead">Choose ${esc(loc.the)} when most of your visitors or users are in ${esc(andList(near.slice(0, 3)))}. Data travels a shorter distance, so pages and remote sessions respond sooner.</p>
      ${loc.note ? `<p class="ps-p">${esc(loc.note)}</p>` : ''}
    </div>
    <div class="ps-card" data-reveal>
      <h3>${icon('users')}Closest audiences</h3>
      <ul class="ps-chips">${near.map((n) => `<li>${esc(cap(n.replace(/^the /, 'the ')))}</li>`).join('')}</ul>
      <p class="ps-small">${icon('info')}<span>Real speed also depends on your visitors’ own networks. We do not publish estimated latency; <a href="/data-centers#speed">test the connection from your browser</a> instead.</span></p>
    </div>
  </div></section>`;
}

function otherLocations(cur: LocGroup, groups: LocGroup[], cat: Catalog, filter?: (p: TProduct) => boolean, hrefOf?: (g: LocGroup) => string) {
  const rows = groups.filter((x) => x.loc.slug !== cur.loc.slug).map((x) => ({ x, ps: filter ? x.products.filter(filter) : x.products })).filter((r) => r.ps.length);
  if (!rows.length) return '';
  return `<ul class="ps-locs">${rows.map(({ x, ps }, i) => {
    const f = fromStr(ps, cat);
    return `<li data-reveal style="--i:${i % 4}"><a href="${esc(hrefOf ? hrefOf(x) : `/locations/${x.loc.slug}`)}">${hexIcon('pin')}<span><b>${esc(x.loc.name)}</b><small>${ps.length} plan${ps.length > 1 ? 's' : ''}${f ? `, from ${esc(f)}` : ''}</small></span>${icon('arrow')}</a></li>`;
  }).join('')}</ul>`;
}

async function renderLocation(ctx: PageCtx, cat: Catalog, g: LocGroup, groups: LocGroup[]) {
  const { loc, products } = g;
  const site = siteOf(cat);
  const path = `/locations/${loc.slug}`;
  const fams = FAMILIES.map((f) => ({ f, ps: products.filter((p) => familyOf(p) === f.id) })).filter((x) => x.ps.length);
  const tls = typeLocPages(cat, groups).filter((x) => x.loc.slug === loc.slug);
  const from = fromStr(products, cat);
  const famNames = fams.map((x) => x.f.label.toLowerCase().replace('vps', 'VPS').replace('remote desktop (rdp)', 'remote desktop (RDP)'));
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Data centers', href: '/data-centers' }, { label: loc.name }];

  const glance = `<div class="ps-glance"><h2 class="ps-glance__h">${icon('pin')}${esc(loc.name)} at a glance</h2><ul>${fams.map(({ f, ps }) => {
    const fr = fromStr(ps, cat);
    return `<li><a href="#${f.id}"><span><b>${esc(f.label)}</b><small>${ps.length} plan${ps.length > 1 ? 's' : ''}</small></span><span class="num">${fr ? `from <b>${esc(fr)}</b>` : 'See price'}</span></a></li>`;
  }).join('')}</ul>${loc.region ? `<p>${esc(loc.region)} region · prices in ${esc(cat.currency)}</p>` : `<p>Prices in ${esc(cat.currency)}</p>`}</div>`;
  const hero = pageHero({
    crumbs, eyebrow: loc.region ? `${loc.region} location` : 'Hosting location', title: `Hosting and servers in ${loc.the}`,
    lead: `${products.length} plan${products.length > 1 ? 's' : ''} run${products.length > 1 ? '' : 's'} in ${loc.the}: ${andList(famNames)}${from ? `, from ${from}` : ''}. Every price below is live from our billing system.`,
    ctas: [{ label: 'See the plans', href: `#${fams[0]?.f.id || 'plans'}`, icon: 'arrow' }, { label: 'Help me choose', href: '/plan-finder', variant: 'ghost' }],
    visualHtml: glance, network: false,
  });

  const famSecs = fams.map(({ f, ps }, i) => {
    const tl = tls.find((x) => ps.some((p) => inTypeLoc(x.prefix, p)) && TYPE_LOC[x.prefix]);
    const existing = Object.entries(TYPE_LOC_EXISTING).find(([k]) => k.endsWith(`/${loc.slug}`) && ps.some((p) => inTypeLoc(k.split('/')[0], p)));
    const more = [
      tl ? link(`All ${tl.products.length} ${TYPE_LOC[tl.prefix].plural} in ${loc.the}`, `/${tl.prefix}/${loc.slug}`) : '',
      existing ? link(`${TYPE_LOC[existing[0].split('/')[0]].label} in ${loc.the}`, existing[1]) : '',
      link(`${f.label} in every location`, f.page),
    ].filter(Boolean).join('');
    return `<section class="hp-section${i % 2 ? ' hp-section--tint' : ''}" id="${f.id}" aria-labelledby="ps-${f.id}-h"><div class="hp-container">
      ${sectionHead({ id: `ps-${f.id}-h`, title: `${f.label} in ${loc.the}`, lead: famLead(f.id, ps, loc, cat) })}
      ${planCards(ps, { currency: cat.currency, base: cat.base, id: `ps-${f.id}` })}
      <p class="ps-links">${more}</p>
    </div></section>`;
  }).join('\n');

  const others = otherLocations(g, groups, cat);
  const otherSec = others ? `<section class="hp-section" aria-labelledby="ps-other-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-other-h', title: 'Other locations', lead: 'Compare what runs elsewhere if your audience is spread out.' })}${others}
  </div></section>` : '';

  const faqs = [
    { q: `Which plans can I order in ${loc.the}?`, a: `${andList(fams.map(({ f, ps }) => `${ps.length} ${f.label.toLowerCase().replace('vps', 'VPS').replace('remote desktop (rdp)', 'remote desktop (RDP)')} plan${ps.length > 1 ? 's' : ''}`))}. ${from ? `The lowest price is ${from}. ` : ''}The list comes straight from our live catalog.` },
    { q: `Who should choose ${loc.the}?`, a: `Sites, apps and remote desktops whose users are mostly in ${andList((loc.near.length ? loc.near : [loc.name]).slice(0, 3))}. The shorter the distance, the sooner pages and sessions respond.` },
    { q: 'How do I order a plan in this location?', a: `Each plan listed here runs in ${loc.the}, so ordering it from this page places it there. If a plan lets you pick a location at checkout, choose ${loc.name}.` },
    { q: 'Can I move my service to another location later?', a: 'Yes. Open a ticket and we will plan the move with you. Hosting accounts and most servers can be migrated, and we explain any price difference first.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="ps-faq-h"><div class="hp-container ps-faq">
    ${sectionHead({ id: 'ps-faq-h', title: `Hosting in ${loc.the}: questions`, align: 'left' })}${faq(faqs, { id: 'ps-faq', single: true })}
  </div></section>`;
  const cta = ctaBand({ title: `Not sure ${loc.the} is right?`, text: 'Answer four questions and get a plan from our live catalog, or move an existing site to us for free.',
    primary: { label: 'Open the plan finder', href: '/plan-finder' }, secondary: { label: 'Free migration', href: '/free-migration' } });

  const short = fams.map(({ f }) => f.id === 'shared' ? 'Web Hosting' : f.id === 'dedicated' ? 'Dedicated' : f.short);
  const theCap = cap(loc.the);
  let title = fams.length === 1 ? `${fams[0].f.short} in ${loc.the}: Plans & Prices` : `Hosting in ${loc.the}: ${short.slice(0, -1).join(', ')} & ${short[short.length - 1]}`;
  if (fams.length > 1 && /Dedicated$/.test(title)) title += ' Servers';
  if (title.length > 60) title = `Hosting & Servers in ${loc.the}`;
  const desc = fitDescription(`${theCap} hosting: ${products.length} ${andList(famNames)} plan${products.length > 1 ? 's' : ''}${from ? ` from ${from}` : ''}, with live prices.`, [
    `See who ${loc.the} suits, compare every plan side by side and order online in minutes.`,
    `See who ${loc.the} suits, compare every plan side by side and order online.`,
    `See who ${loc.the} suits, compare every plan and order online.`, `Compare every plan, see who it suits and order online.`, 'Compare plans and order online.', 'Order online.']);
  return page({
    ctx: { ...ctx, route: { ...ctx.route, title, description: desc } }, catalog: cat, path, title, description: desc,
    css: ['pseo'], ogKicker: 'Locations',
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), productsLd(products, cat, `Hosting plans in ${loc.the}`)].filter(Boolean),
    body: [hero, trustStrip(cat.settings), whoSection(loc, 'ps-who-h'), famSecs, otherSec, faqSec, cta].join('\n'),
  });
}

/** One sentence per family, from the real specs of the plans shown. */
function famLead(fam: string, ps: TProduct[], loc: LocInfo, cat: Catalog) {
  const sp = ps.map(specOf);
  const from = fromStr(ps, cat);
  const ram = rangeTxt(sp.map((s) => s.ram), ' GB'), cores = rangeTxt(sp.map((s) => s.cores), '');
  const parts: string[] = [];
  if (fam === 'shared') {
    const sites = sp.map((s) => s.sites).filter(Boolean);
    const w = (n: number) => (n >= 999 ? 'unlimited' : String(n));
    const lo = sites.length ? Math.min(...sites) : 0, hi = sites.length ? Math.max(...sites) : 0;
    parts.push(`${ps.length} plan${ps.length > 1 ? 's' : ''} hosted in ${loc.the}${!sites.length ? '' : sites.length < ps.length ? `, up to ${w(hi)} websites` : lo === hi ? `, each for ${w(lo)} website${lo === 1 ? '' : 's'}` : `, from ${w(lo)} to ${w(hi)} websites`}`);
  } else {
    parts.push(`${ps.length} plan${ps.length > 1 ? 's' : ''}${cores ? ` with ${cores} CPU cores` : ''}${ram ? `${cores ? ' and' : ' with'} ${ram} RAM` : ''}`);
  }
  return `${parts.join('')}${from ? `, from ${from}` : ''}.`;
}

async function renderTypeLoc(ctx: PageCtx, cat: Catalog, prefix: string, g: LocGroup, ps: TProduct[], groups: LocGroup[]) {
  const { loc } = g;
  const d = TYPE_LOC[prefix];
  const site = siteOf(cat);
  const path = `/${prefix}/${loc.slug}`;
  const sp = ps.map(specOf);
  const from = fromStr(ps, cat);
  const ram = rangeTxt(sp.map((s) => s.ram), ' GB'), cores = rangeTxt(sp.map((s) => s.cores), ''), disk = rangeTxt(sp.map((s) => s.disk), ' GB');
  const oses = [...new Set(sp.map((s) => s.os).filter(Boolean))];
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Data centers', href: '/data-centers' }, { label: loc.name, href: `/locations/${loc.slug}` }, { label: d.label }];
  const specLine = [cores && `${cores} CPU cores`, ram && `${ram} RAM`, disk && `${disk} storage`].filter(Boolean);

  const stats = `<div class="ps-glance"><h2 class="ps-glance__h">${icon('server')}${esc(d.label)} in ${esc(loc.name)}</h2><ul>
    <li><span><b>Plans</b></span><span class="num"><b>${ps.length}</b></span></li>
    ${cores ? `<li><span><b>CPU cores</b></span><span class="num">${esc(cores)}</span></li>` : ''}
    ${ram ? `<li><span><b>Memory</b></span><span class="num">${esc(ram)}</span></li>` : ''}
    ${disk ? `<li><span><b>Storage</b></span><span class="num">${esc(disk)}</span></li>` : ''}
    ${oses.length ? `<li><span><b>Operating system</b></span><span>${esc(oses.join(' or '))}</span></li>` : ''}
    <li><span><b>From</b></span><span class="num">${from ? `<b>${esc(from)}</b>` : 'See price'}</span></li>
  </ul><p>Live prices in ${esc(cat.currency)}</p></div>`;
  const hero = pageHero({
    crumbs, eyebrow: `${loc.region || 'Hosting'} · ${loc.name}`, title: `${d.label} in ${loc.the}`,
    lead: `${ps.length} ${d.plural} hosted in ${loc.the}${specLine.length ? `, with ${andList(specLine)}` : ''}${from ? `, from ${from}` : ''}. Compare them side by side and order online.`,
    ctas: [{ label: 'Compare the plans', href: '#plans', icon: 'arrow' }, { label: `Everything in ${loc.name}`, href: `/locations/${loc.slug}`, variant: 'ghost' }],
    visualHtml: stats, network: false,
  });
  const plans = `<section class="hp-section" id="plans" aria-labelledby="ps-plans-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-plans-h', title: `Every ${d.label.replace(/ Servers?$/, '').replace(/ Hosting$/, '')} plan in ${loc.the}`, lead: 'Plans and prices straight from our billing system. Pick a billing period to see the matching price.' })}
    ${planCards(ps, { currency: cat.currency, base: cat.base, id: 'ps-plans' })}
  </div></section>`;
  const compare = ps.length <= 5 ? `<section class="hp-section hp-section--tint" aria-labelledby="ps-cmp-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-cmp-h', title: 'Side-by-side comparison', lead: 'Specifications as listed for each plan.' })}${specTable(ps, { currency: cat.currency, caption: `${d.label} in ${loc.the} compared` })}
  </div></section>` : '';

  const tlAll = typeLocPages(cat, groups);
  const others = otherLocations(g, groups, cat, (p) => inTypeLoc(prefix, p), (x) => (tlAll.some((t) => t.prefix === prefix && t.loc.slug === x.loc.slug) ? `/${prefix}/${x.loc.slug}` : TYPE_LOC_EXISTING[`${prefix}/${x.loc.slug}`] || `/locations/${x.loc.slug}`));
  const otherSec = `<section class="hp-section" aria-labelledby="ps-other-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-other-h', title: others ? `${d.label} in other locations` : 'More options', lead: others ? 'The same kind of plan elsewhere, with the lowest live price in each location.' : undefined })}
    ${others}
    <p class="ps-links">${link(`All ${d.label.toLowerCase().replace('vps', 'VPS').replace('rdp', 'RDP')}`, d.page)}${link(`Everything in ${loc.the}`, `/locations/${loc.slug}`)}${link('Plan finder', '/plan-finder')}</p>
  </div></section>`;

  const faqs = [
    { q: `How much does ${/^[aeiou]/i.test(d.label) ? 'an' : 'a'} ${d.label.replace(/s$/, '').replace(/ Servers?$/, ' server').replace('Hosting', 'hosting')} plan in ${loc.the} cost?`, a: from ? `Prices start at ${from} for the smallest plan, live from our billing system in ${cat.currency}. Longer billing periods are shown on each plan.` : 'The live price of each plan is shown in the order form before you pay.' },
    { q: `What sizes are available in ${loc.the}?`, a: specLine.length ? `The ${ps.length} plans range across ${andList(specLine)}. The table above lists the exact specification of each.` : `There are ${ps.length} plans; the list above shows what each one includes.` },
    { q: `Is ${loc.the} the right location for me?`, a: `Choose it when most of your users are in ${andList((loc.near.length ? loc.near : [loc.name]).slice(0, 3))}. Otherwise compare the other locations above.` },
    { q: 'How soon is my server ready?', a: 'Most plans are set up automatically after payment, and we email the access details. If a plan needs manual setup, our team keeps you updated in a ticket.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="ps-faq-h"><div class="hp-container ps-faq">
    ${sectionHead({ id: 'ps-faq-h', title: `${d.label} in ${loc.the}: questions`, align: 'left' })}${faq(faqs, { id: 'ps-faq', single: true })}
  </div></section>`;
  const cta = ctaBand({ title: 'Want a second opinion on sizing?', text: 'Tell us what you run and our engineers suggest the right plan, or try the plan finder.',
    primary: { label: 'Open the plan finder', href: '/plan-finder' }, secondary: { label: 'Talk to us', href: '/contact' } });

  let title = `${d.label} in ${loc.the}: Plans & Prices`;
  if (title.length > 60) title = `${d.label} in ${loc.the}`;
  const desc = fitDescription(`${ps.length} ${d.plural} in ${loc.the}${specLine.length ? ` with ${andList(specLine)}` : ''}${from ? `, from ${from}` : ''}.`, [
    `See who ${loc.the} suits, compare the plans side by side and order online.`,
    'Live prices, a side-by-side comparison and online ordering.', 'Compare plans side by side and order online.', 'Live prices and online ordering.', 'Order online.']);
  return page({
    ctx: { ...ctx, route: { ...ctx.route, title, description: desc } }, catalog: cat, path, title, description: desc,
    css: ['pseo'], ogKicker: loc.name,
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), productsLd(ps, cat, `${d.label} in ${loc.the}`)].filter(Boolean),
    body: [hero, plans, compare, whoSection(loc, 'ps-who-h', !compare), otherSec, faqSec, cta].join('\n'),
  });
}
