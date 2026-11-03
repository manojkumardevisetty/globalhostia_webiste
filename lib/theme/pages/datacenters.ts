// /data-centers: the datacenter regions that actually appear in the catalog (product location attributes /
// features), what runs where with live "from" prices, and a browser round-trip test to endpoints we control.
// Only measured numbers are shown: our edge always; a region only when the owner has set a test URL for it
// (settings.dc_test_urls, "Germany: https://…"). No invented per-datacenter latency.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, deriveSpecs, minFrom, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, dcMap, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, icon, hexIcon, fromText, available, type DC } from '../ui';
import { trustStrip } from '../growth';
import { siteOf, crumbsFor } from './vps';
import { TYPE, TYPE_LABEL, TYPE_PAGE } from './planfinder';
import { locationGroups, typeLocPages, TYPE_LOC } from '../pseo';

/** Coordinates and plain-language reach for known location labels (as used in product attributes). */
const GEO: Record<string, { ll: [number, number]; region: string; near: string; name?: string }> = {
  usa: { ll: [39, -77], region: 'North America', near: 'Visitors in the Americas', name: 'USA' },
  'united states': { ll: [39, -77], region: 'North America', near: 'Visitors in the Americas', name: 'USA' },
  canada: { ll: [45.5, -73.6], region: 'North America', near: 'Visitors in Canada and the US' },
  europe: { ll: [50.1, 8.7], region: 'Europe', near: 'Visitors across Europe, the Middle East and Africa' },
  germany: { ll: [50.1, 8.7], region: 'Europe', near: 'Visitors in Europe and the Middle East' },
  france: { ll: [48.9, 2.35], region: 'Europe', near: 'Visitors in Western Europe and North Africa' },
  netherlands: { ll: [52.4, 4.9], region: 'Europe', near: 'Visitors in Northern and Western Europe' },
  uk: { ll: [51.5, -0.1], region: 'Europe', near: 'Visitors in the UK and Europe' },
  finland: { ll: [60.2, 24.9], region: 'Europe', near: 'Visitors in Northern Europe' },
  malaysia: { ll: [3.1, 101.7], region: 'Asia Pacific', near: 'Visitors in Malaysia and Southeast Asia' },
  singapore: { ll: [1.35, 103.8], region: 'Asia Pacific', near: 'Visitors in Southeast Asia, India and Australia' },
  india: { ll: [19, 72.8], region: 'Asia Pacific', near: 'Visitors in South Asia' },
  uae: { ll: [25.2, 55.3], region: 'Middle East', near: 'Visitors in the Gulf region' },
  dubai: { ll: [25.2, 55.3], region: 'Middle East', near: 'Visitors in the Gulf region', name: 'UAE' },
  brazil: { ll: [-23.5, -46.6], region: 'South America', near: 'Visitors in South America' },
  'south africa': { ll: [-26.2, 28], region: 'Africa', near: 'Visitors in Southern Africa' },
};

type Loc = { name: string; key: string; products: TProduct[]; types: string[]; geo?: (typeof GEO)[string] };

function locations(ps: TProduct[]): Loc[] {
  const map = new Map<string, Loc>();
  for (const p of ps) {
    const raw = (deriveSpecs(p.features, p.attributes).location || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const geo = GEO[key];
    const name = geo?.name || raw;
    const k = name.toLowerCase();
    const l = map.get(k) || { name, key: k, products: [], types: [], geo };
    l.products.push(p);
    const t = TYPE[p.categorySlug]; if (t && !l.types.includes(t)) l.types.push(t);
    map.set(k, l);
  }
  return [...map.values()].sort((a, b) => b.products.length - a.products.length || a.name.localeCompare(b.name));
}

function parseTests(raw: unknown) {
  return String(raw || '').split(/\r?\n/).map((l) => l.trim()).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; })
    .filter((x): x is [string, string] => !!x && /^https:\/\/\S+$/.test(x[1]));
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, settings: s } = cat;
  const site = siteOf(cat);
  const locs = locations(available(cat.products));
  const tests = parseTests(s.dc_test_urls);
  const testFor = (name: string) => tests.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1] || '';
  const crumbs = crumbsFor('Data centers', { label: 'Support', href: '/help-center' });
  const regions = [...new Set(locs.map((l) => l.geo?.region).filter(Boolean))];
  const names = locs.map((l) => l.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';

  const hero = pageHero({
    crumbs, eyebrow: 'Network and locations', title: 'Choose where your servers run',
    lead: locs.length ? `Our plans run in ${locs.length} location${locs.length > 1 ? 's' : ''}: ${list}. Pick the one closest to your visitors, then test the connection from your own browser.` : 'Pick the location closest to your visitors when you order, then test the connection from your own browser.',
    ctas: [{ label: 'Test from your browser', href: '#speed', icon: 'gauge' }, { label: 'Help me choose a plan', href: '/plan-finder', variant: 'ghost' }],
    visualHtml: locs.length ? dcMap({ title: 'Where our plans are hosted', caption: `${locs.length} hosting location${locs.length > 1 ? 's' : ''} in the current catalog, operated from our headquarters in Dubai.`,
      dcs: locs.filter((l) => l.geo).map((l) => [l.name, l.geo!.ll[0], l.geo!.ll[1]] as DC), hq: ['Dubai', 25.2, 55.3], legend: ['Hosting location', 'Dubai headquarters'] }) : undefined,
    network: false,
  });

  const cards = locs.length ? `<ul class="dc-grid">${locs.map((l, i) => {
    const f = minFrom(l.products, currency);
    const cheapest = f ? l.products.find((p) => minFrom([p], currency)?.amount === f.amount) : undefined;
    const t = testFor(l.name);
    return `<li class="dc-card" data-reveal style="--i:${i % 4}"${t ? ` data-dc-test="${esc(t)}" data-dc-name="${esc(l.name)}"` : ''}>
      <div class="dc-card__head">${hexIcon('pin')}<div><h3>${esc(l.name)}</h3>${l.geo ? `<span>${esc(l.geo.region)}</span>` : ''}</div></div>
      ${l.geo ? `<p class="dc-card__near">${icon('users')}${esc(l.geo.near)}</p>` : ''}
      <ul class="dc-card__types">${l.types.map((ty) => `<li><a href="${esc(TYPE_PAGE[ty] || '/')}">${esc(TYPE_LABEL[ty] || ty)}</a></li>`).join('')}</ul>
      <p class="dc-card__meta num">${l.products.length} plan${l.products.length > 1 ? 's' : ''}${cheapest ? `, from <b>${esc(fromText(cheapest, currency))}</b>` : ''}</p>
      ${t ? `<p class="dc-card__rtt" data-dc-out aria-live="polite"><span>Round trip from you</span><b class="num">Not tested yet</b></p>` : ''}
    </li>`;
  }).join('')}</ul>` : `<p class="dc-empty">Locations are listed with each plan in the order form.</p>`;
  const where = `<section class="hp-section" aria-labelledby="dc-loc-h"><div class="hp-container">
    ${sectionHead({ id: 'dc-loc-h', title: 'Our hosting locations', lead: `Taken from the plans you can order today${regions.length ? `, across ${regions.length} region${regions.length > 1 ? 's' : ''}` : ''}. Each location shows what runs there and the lowest live price.` })}
    ${cards}
  </div></section>`;

  // links to the per-location pages (/locations/<loc>, /<type>/<loc>) generated from the same catalog
  const lg = locationGroups(cat), tl = typeLocPages(cat, lg);
  const guides = lg.length ? `<section class="hp-section hp-section--tint" aria-labelledby="dc-guides-h"><div class="hp-container">
    ${sectionHead({ id: 'dc-guides-h', title: 'Plans by location', lead: 'Every plan that runs in each location, with live prices and who each location suits.' })}
    <ul class="dc-guides">${lg.map((g) => `<li><a class="hp-link" href="/locations/${esc(g.loc.slug)}">${esc(`Hosting in ${g.loc.the}`)}${icon('arrow')}</a>${tl.filter((x) => x.loc.slug === g.loc.slug).map((x) =>
      `<a class="dc-guides__sub" href="/${esc(x.prefix)}/${esc(x.loc.slug)}">${esc(TYPE_LOC[x.prefix].label)} in ${esc(g.loc.the)}</a>`).join('')}</li>`).join('')}</ul>
  </div></section>` : '';

  const speed = `<section class="hp-section hp-section--dark hp-on-dark" id="speed" aria-labelledby="dc-speed-h"><div class="hp-container dc-speed" data-dc-speed>
    <div class="dc-speed__copy">
      <h2 id="dc-speed-h" class="hp-hline hp-h2">Test the connection from your browser</h2>
      <p class="hp-lead">Your browser sends a few small requests and times the round trip. Nothing is estimated: if a number appears, it was measured just now, from where you are.</p>
      <ul class="dc-speed__notes">
        <li>${icon('check')}<span><b>Globalhostia edge</b> is the network that serves this website. It shows how quickly our pages and order forms reach you.</span></li>
        <li>${icon('info')}<span>${tests.length ? `Locations with a public test address (${esc(tests.map(([n]) => n).join(', '))}) are measured too.` : 'Our datacenters do not expose public test addresses yet, so we do not show per-location numbers.'} Real speed also depends on your own connection and on the server’s load.</span></li>
      </ul>
      <button type="button" class="hp-btn hp-btn--brand hp-btn--lg" data-dc-run>${icon('gauge')}<span>Run the test</span></button>
    </div>
    <div class="dc-meter" aria-live="polite">
      <div class="dc-meter__row" data-dc-edge data-url="/favicon.ico">
        <div><b>Globalhostia edge</b><span>${esc(site.replace(/^https?:\/\//, ''))}</span></div>
        <div class="dc-meter__val num"><b data-v>–</b><small>ms</small></div>
        <div class="dc-meter__bar" aria-hidden="true"><i></i></div>
        <p class="dc-meter__sub" data-s>Press “Run the test” to measure.</p>
      </div>
      ${tests.map(([n, u]) => `<div class="dc-meter__row" data-dc-remote data-url="${esc(u)}" data-name="${esc(n)}">
        <div><b>${esc(n)}</b><span>Datacenter test address</span></div>
        <div class="dc-meter__val num"><b data-v>–</b><small>ms</small></div>
        <div class="dc-meter__bar" aria-hidden="true"><i></i></div>
        <p class="dc-meter__sub" data-s>Not tested yet.</p>
      </div>`).join('')}
      <p class="dc-meter__foot">Median of 5 timed requests after one warm-up. Results stay in your browser.</p>
    </div>
  </div></section>`;

  const faqs = [
    { q: 'Which location should I choose?', a: 'Choose the location closest to most of your visitors. For a site aimed at the UAE and the Gulf, Europe and Asian locations such as Singapore or Malaysia are usually the closest of the options we list; for an audience in the Americas, choose the USA. A CDN can speed up visitors who are far away.' },
    { q: 'Is the speed test accurate?', a: 'It measures the real round-trip time from your browser to the address being tested, right now. It does not include server processing for a full page, and results vary with your connection, Wi-Fi and time of day.' },
    { q: 'Why is there no number for each datacenter?', a: 'We only show numbers we can measure from your browser. A location gets a number when it has a public test address; until then we list the location without one rather than show an estimate.' },
    { q: 'Can I move my service to another location later?', a: 'Yes. Open a ticket and we will plan the move with you. Hosting accounts and most servers can be migrated, and we explain any price difference first.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="dc-faq-h"><div class="hp-container dc-faq">
    ${sectionHead({ id: 'dc-faq-h', title: 'Locations and speed questions', align: 'left' })}${faq(faqs, { id: 'dc-faq', single: true })}
  </div></section>`;
  const cta = ctaBand({ title: 'Not sure which location fits?', text: 'Answer four questions and we suggest a plan from our live catalog, or ask our engineers.',
    primary: { label: 'Open the plan finder', href: '/plan-finder' }, secondary: { label: 'Talk to us', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: '/data-centers', title: ctx.route.title, description: ctx.route.description,
    css: ['datacenters', 'pseo'], js: ['datacenters'],
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs)],
    body: [hero, trustStrip(s), where, guides, speed, faqSec, cta].join('\n'),
  });
}
