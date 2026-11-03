// /compare/globalhostia-vs-<slug>: one page per provider in lib/compare/competitors.ts.
// The provider column is the stored public facts (each with its source and checked date); our column is read from
// the live WHMCS-synced catalog and the admin trust settings, so no price of ours is ever typed into this file.
// Computed lines ("lower first-term price", "renews at the same price") are only shown when the numbers support them.
// Layout reuses uae.css (guide hero, contents, article, comparison table) and learn.css, plus vs.css.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, productsFor, fromPrice, deriveSpecs, orderUrl, cycles, availableCurrencies, type Catalog, type TProduct } from '../data';
import { page } from '../shell';
import { breadcrumbs, breadcrumbJsonLd, sectionHead, faq, faqJsonLd, ctaBand, icon, hexIcon, link, ld, fromText, available, VAT_NOTE } from '../ui';
import { trustStrip, trustOn, trustText, waLink } from '../growth';
import { siteOf } from './vps';
import { ROUTES } from '../routes';
import { FACT_KEYS, FACT_LABEL, competitor, visibleCompetitors, vsPath, sourcesOf, checkedRange, longDate, type Competitor, type FactKey } from '../../compare/competitors';

type QA = { q: string; a: string };
type C = Competitor & { hidden: boolean };
const CYC: Record<string, string> = { monthly: 'monthly', quarterly: 'quarterly', semiannually: '6-month', annually: 'yearly', biennially: '2-year', triennially: '3-year' };
const a = (label: string, href: string) => `<a class="ln-a" href="${esc(href)}">${esc(label)}</a>`;
const gb = (t?: string) => { const m = /(\d+(?:\.\d+)?)\s*(TB|GB)/i.exec(t || ''); return m ? parseFloat(m[1]) * (/tb/i.test(m[2]) ? 1024 : 1) : null; };
const specOf = (p?: TProduct) => (p ? deriveSpecs(p.features, p.attributes) : {}) as Record<string, string | undefined>;
const textOf = (p: TProduct) => [p.name, p.tagline, ...(p.features || [])].join(' · ');

/* ------------------------------------------------------------------ our column, from the live catalog */
type Ours = { plan?: TProduct; shared: TProduct[]; cells: Record<FactKey, string>; plain: Record<FactKey, string>;
  lowest: { perMonth: number; cycle: string; prefix: string } | null; storageGb: number | null; lock: boolean; wa: boolean; dailyBackups: boolean; locs: string[] };

/** Lowest per-month price of a plan in one currency, across every billing cycle. */
function lowestIn(p: TProduct | undefined, cur: string) {
  if (!p) return null;
  const cs = cycles(p, cur).filter((c) => Number.isFinite(c.price) && c.price > 0 && c.cycle !== 'onetime');
  if (!cs.length) return null;
  const b = cs.reduce((x, y) => (y.perMonth < x.perMonth ? y : x));
  return { perMonth: b.perMonth, cycle: b.cycle, prefix: b.prefix };
}

/** First plan (entry plan first) whose name or features match, as "<plan>: <matching feature>". */
function feature(shared: TProduct[], plan: TProduct | undefined, re: RegExp) {
  for (const p of plan ? [plan, ...shared.filter((x) => x !== plan)] : shared) {
    const hit = (p.features || []).find((x) => re.test(x));
    if (hit) return { onEntry: p === plan, text: hit, plan: p };
  }
  return null;
}

function ours(cat: Catalog): Ours {
  const s = cat.settings, cur = cat.currency;
  const shared = available(productsFor(cat, ROUTES['shared-hosting']?.categories));
  const priced = shared.filter((p) => fromPrice(p, cur));
  const plan = [...(priced.length ? priced : shared)].sort((x, y) => (lowestIn(x, cur)?.perMonth ?? 1e9) - (lowestIn(y, cur)?.perMonth ?? 1e9))[0];
  const sp = specOf(plan);
  const lock = trustOn(s, 'price-lock');
  const lowest = lowestIn(plan, cur);
  const locs = [...new Set(shared.map((p) => specOf(p).location).filter(Boolean))] as string[];
  const wa = !!waLink(s, 'x');
  const feat = (re: RegExp, none: string) => {
    const h = feature(shared, plan, re);
    return h ? (h.onEntry ? h.text : `${h.text} (on ${h.plan.name})`) : none;
  };
  const backups = feat(/backup/i, 'Not listed on our shared plans');
  const plain: Record<FactKey, string> = {
    plan: plan ? `${plan.name}${sp.websites ? ` (${sp.websites})` : ''}` : 'Plans are being updated',
    intro: plan && fromText(plan, cur) ? `${fromText(plan, cur)}${lowest && lowest.cycle !== fromPrice(plan, cur)?.cycle ? `, or ${money(lowest.perMonth, lowest.prefix)}/mo on the ${CYC[lowest.cycle] || lowest.cycle} cycle` : ''}, ${VAT_NOTE}` : 'See the plan page',
    renewal: lock ? 'The same price you pay now, for the same billing period (price-lock)' : 'Shown next to the plan before you order',
    storage: sp.storage || 'Listed on the plan page',
    domain: feat(/free\s+domain|domain\s+(included|free)/i, 'Not listed on our shared plans; domains are priced separately'),
    ssl: feat(/\bssl\b|https/i, 'Listed on the plan page'),
    backups,
    panel: feat(/cpanel|directadmin|plesk/i, 'Listed on the plan page'),
    locations: `${locs.length ? `${locs.join(', ')}. ` : ''}Company and support team based in Dubai, UAE`,
    support: [trustOn(s, 'support') ? trustText(s, 'support') : 'Ticket, email and phone', wa && !/whatsapp/i.test(trustText(s, 'support')) ? 'WhatsApp' : '', 'client area in English and Arabic'].filter(Boolean).join('; '),
    moneyBack: trustOn(s, 'money-back') ? trustText(s, 'money-back') : 'See our terms and conditions',
  };
  const cells = Object.fromEntries(FACT_KEYS.map((k) => [k, esc(plain[k])])) as Record<FactKey, string>;
  if (plan) cells.plan = `<a class="ln-a" href="/p/${esc(plan.slug)}">${esc(plan.name)}</a>${sp.websites ? ` <span class="vs-sub">(${esc(sp.websites)})</span>` : ''}`;
  if (plan && fromText(plan, cur)) cells.intro = `<b class="num">${esc(fromText(plan, cur))}</b>${lowest && lowest.cycle !== fromPrice(plan, cur)?.cycle ? `<span class="vs-sub num">or ${esc(money(lowest.perMonth, lowest.prefix))}/mo on the ${esc(CYC[lowest.cycle] || lowest.cycle)} cycle</span>` : ''}<span class="vs-sub">${esc(VAT_NOTE)} · live price</span>`;
  return { plan, shared, cells, plain, lowest, storageGb: gb(sp.storage), lock, wa, dailyBackups: /daily/i.test(backups), locs };
}

/* ------------------------------------------------------------------ computed, like-for-like lines */
function computed(c: C, o: Ours, cat: Catalog) {
  const them: string[] = [], us: string[] = [];
  // compare in the provider's currency, and only when our plan has a price in it
  const ourLow = availableCurrencies(o.shared).includes(c.num.currency) ? lowestIn(o.plan, c.num.currency) : null;
  const ourLowTxt = ourLow ? `${money(ourLow.perMonth, ourLow.prefix)}/mo on the ${CYC[ourLow.cycle] || ourLow.cycle} cycle` : '';
  if (ourLow && c.num.introMo !== null && c.num.introMo < ourLow.perMonth - 0.005 && c.facts.intro)
    them.push(`<b>Lower first-term price.</b> ${esc(c.name)}: ${esc(c.facts.intro.value)}. Our lowest price for ${esc(o.plan!.name)} is ${esc(ourLowTxt)}.`);
  if (ourLow && c.num.renewMo !== null && c.num.renewMo < ourLow.perMonth - 0.005 && c.facts.renewal)
    them.push(`<b>Lower renewal price.</b> ${esc(c.name)} renews at ${esc(c.facts.renewal.value)}. Our lowest price for ${esc(o.plan!.name)} is ${esc(ourLowTxt)}.`);
  if (c.num.storageGb !== null && o.storageGb !== null && c.num.storageGb > o.storageGb && c.facts.storage)
    them.push(`<b>More storage on the entry plan.</b> ${esc(c.facts.storage.value)}, against ${esc(o.plain.storage)} on our ${esc(o.plan?.name || 'entry plan')}.`);

  if (o.lock && ourLow && c.num.renewMo !== null && c.num.introMo !== null && c.num.renewMo > c.num.introMo && c.facts.renewal)
    us.push(`<b>No price jump at renewal.</b> ${esc(c.name)} renews its ${esc(c.facts.plan?.value.replace(/\s*\(.*$/, '') || 'entry')} plan at ${esc(c.facts.renewal.value)}. Our ${esc(o.plan!.name)} renews at the price you pay today, from ${esc(ourLowTxt)}.`);
  else if (o.lock) us.push('<b>Price-lock.</b> Your renewal price is the same as the price you pay for the billing period you choose.');
  if (c.num.storageGb !== null && o.storageGb !== null && o.storageGb > c.num.storageGb)
    us.push(`<b>More storage on the entry plan.</b> ${esc(o.plain.storage)} on our ${esc(o.plan?.name || 'entry plan')}, against ${esc(c.facts.storage?.value || '')}.`);
  if (o.dailyBackups && c.facts.backups && !/daily/i.test(c.facts.backups.value.split(';')[0]))
    us.push(`<b>Daily backups on the entry plan.</b> ${esc(c.name)} lists: ${esc(c.facts.backups.value)}.`);
  if (o.wa && !/whatsapp/i.test(c.facts.support?.value || '')) us.push('<b>WhatsApp support.</b> Message our engineers on WhatsApp as well as by ticket.');
  if (!c.num.middleEast) us.push('<b>A team in the Gulf.</b> We are a Dubai-based company, so support, invoices and business hours follow Gulf time.');
  if (availableCurrencies(o.shared).includes('AED') && c.num.currency !== 'AED') us.push('<b>Prices and invoices in AED.</b> Pay in dirhams and avoid card currency conversion.');
  if (trustOn(cat.settings, 'migration')) us.push(`<b>Free website migration.</b> Our engineers move your site, databases and email for you. ${a('Request a migration', '/free-migration')}.`);
  return { them, us };
}

/* ------------------------------------------------------------------ page */
const DISCLAIMER = (c: C, range: { oldest: string; newest: string }) =>
  `Facts about ${esc(c.name)} come from ${esc(c.name)}’s own website and were checked ${range.oldest === range.newest ? `on ${esc(longDate(range.newest))}` : `between ${esc(longDate(range.oldest))} and ${esc(longDate(range.newest))}`}. Prices and features change; check the provider’s site before you buy. Introductory prices usually need a prepaid term and exclude tax. Our prices are live from our billing system. ${esc(c.name)} and other names are trademarks of their respective owners and are used only to identify the providers; this is an independent comparison, not sponsored by or affiliated with ${esc(c.name)}.`;

async function renderVs(ctx: PageCtx, cat: Catalog, c: C) {
  const s = cat.settings, site = siteOf(cat), path = vsPath(c.slug), url = `${site}${path}`;
  const o = ours(cat);
  const { them, us } = computed(c, o, cat);
  const range = checkedRange(c);
  const srcs = sourcesOf(c);
  const ref = (u: string) => srcs.findIndex((x) => x.url === u) + 1;
  const title = `GlobalHostia vs ${c.name}`;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Hosting comparisons', href: '/compare' }, { label: title }];
  const migration = trustOn(s, 'migration');
  const wa = waLink(s, `Hello ${s.site_name || 'Globalhostia'}, I am comparing you with ${c.name} and have a question.`);

  const hero = `<section class="ua-hero ua-hero--guide" aria-labelledby="vs-h1"><div class="hp-container">
    ${breadcrumbs(crumbs, { light: true })}
    <span class="ua-eyebrow">Comparison</span>
    <h1 id="vs-h1">${esc(title)}</h1>
    <p class="ua-lead">${esc(`Entry shared hosting from GlobalHostia and ${c.name} side by side: price and renewal, storage, backups, data-centre locations and support, with a source for every ${c.name} fact.`)}</p>
    <p class="ua-meta">${icon('clock')}${esc(c.name)} facts as of ${esc(longDate(range.newest))} · Our prices are live from our billing system</p>
  </div></section>`;

  const verdict = `<div class="vs-verdict">
    <div class="vs-verdict__i vs-verdict__i--us">${hexIcon('shield')}<div><h3>GlobalHostia suits</h3><p>${esc(`UAE and GCC businesses, and anyone who wants ${o.lock ? 'a renewal price that stays the same, ' : ''}engineers on ${o.wa ? 'WhatsApp and ' : ''}ticket around the clock and a company on Gulf time${migration ? ', with the move done for free' : ''}.`)}</p>${o.plan && fromText(o.plan, cat.currency) ? `<p class="ln-from num">From <b>${esc(fromText(o.plan, cat.currency))}</b></p>` : ''}</div></div>
    <div class="vs-verdict__i">${hexIcon('globe')}<div><h3>${esc(c.name)} suits</h3><p>${esc(c.suits)}</p>${c.facts.intro ? `<p class="ln-from">${esc(c.facts.intro.value)}</p>` : ''}</div></div>
  </div>`;

  const cell = (k: FactKey) => {
    const f = c.facts[k];
    if (!f) return '<span class="ua-meh">Not stated on the pages we checked</span>';
    const n = ref(f.source);
    return `${esc(f.value)}<span class="vs-sub">as of ${esc(longDate(f.checked))} <a class="vs-ref" href="#src-${n}" aria-label="Source ${n}">[${n}]</a></span>`;
  };
  const table = `<div class="hp-table-wrap ua-cmp ln-tbl vs-tbl"><table class="hp-table"><caption class="sr-only">${esc(title)}: entry shared hosting compared</caption>
    <thead><tr><th scope="col"><span class="sr-only">What to compare</span></th><th scope="col">GlobalHostia</th><th scope="col">${esc(c.name)}</th></tr></thead>
    <tbody>${FACT_KEYS.map((k) => `<tr><th scope="row">${esc(FACT_LABEL[k])}</th><td data-label="GlobalHostia">${o.cells[k]}</td><td data-label="${esc(c.name)}">${cell(k)}</td></tr>`).join('')}</tbody></table></div>
    <p class="ln-note">${icon('info')}<span>We compare the lowest-priced shared plan of each provider. ${esc(c.name)}’s first-term price needs the term shown; compare the renewal price over the years you plan to stay.</span></p>`;

  const stronger = [...c.stronger.map((x) => `${esc(x.text)} <a class="vs-ref" href="#src-${ref(x.source)}" aria-label="Source ${ref(x.source)}">[${ref(x.source)}]</a>`), ...them];
  const strongerHtml = `<p>Every provider does some things better. Based on ${esc(c.name)}’s own published information, it may suit you better for:</p><ul class="ln-list">${stronger.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  const usHtml = us.length ? `<ul class="ln-list">${us.map((x) => `<li>${x}</li>`).join('')}</ul>` : `<p>See our ${a('shared hosting plans', '/shared-hosting')} for what each plan includes.</p>`;

  const moveHtml = migration
    ? `<p>Moving from ${esc(c.name)}? Our engineers copy your files, databases and email to GlobalHostia, test the site on a preview address and only then help you switch DNS, so visitors do not see downtime. It is free.</p>
       <div class="vs-actions"><a class="hp-btn hp-btn--brand" href="/free-migration">Request a free migration</a>${o.plan ? `<a class="hp-btn hp-btn--ghost" href="${esc(orderUrl(o.plan, cat.base, fromPrice(o.plan, cat.currency)?.cycle))}">Order ${esc(o.plan.name)}</a>` : ''}</div>
       <p>Prefer to do it yourself? Follow ${a('how to move a website', '/guides/move-website-to-hostia')}.</p>`
    : `<p>Moving from ${esc(c.name)}? Follow ${a('how to move a website', '/guides/move-website-to-hostia')}, or ${a('ask our team', '/contact')} to help.</p>`;

  const sourcesHtml = `<ol class="vs-src">${srcs.map((x, i) => `<li id="src-${i + 1}"><a href="${esc(x.url)}" rel="nofollow noopener" target="_blank">${esc(x.url.replace(/^https:\/\//, ''))}</a><span>checked ${esc(longDate(x.checked))}</span></li>`).join('')}</ol>
    <p class="vs-disc">${DISCLAIMER(c, range)}</p>`;

  const sections = [
    { id: 'verdict', title: 'Quick verdict', html: verdict },
    { id: 'table', title: 'Side by side', html: table },
    { id: 'stronger', title: `Where ${c.name} is stronger`, html: strongerHtml },
    { id: 'ours', title: 'Where GlobalHostia may suit you better', html: usHtml },
    { id: 'move', title: `Moving from ${c.name}`, html: moveHtml },
    { id: 'sources', title: 'Sources', html: sourcesHtml },
  ];

  const loc = c.facts.locations?.value;
  const faqs: QA[] = [
    { q: `Is GlobalHostia cheaper than ${c.name}?`, a: `${c.facts.intro && c.facts.plan ? `${c.name}’s ${c.facts.plan.value.replace(/\s*\(.*$/, '')} plan costs ${c.facts.intro.value} and renews at ${c.facts.renewal ? c.facts.renewal.value : 'a price its pricing page did not state when we checked'} (as of ${longDate(range.newest)}).` : `${c.name} publishes its prices on its own website.`} ${o.plan ? `Our ${o.plan.name} costs ${o.plain.intro}${o.lock ? ', and renews at the same price for the same billing period' : ''}.` : ''} Compare the total over the years you plan to stay, including tax.` },
    { q: `Does ${c.name} have a data centre in the Middle East?`, a: loc ? `${c.name} lists: ${loc} (as of ${longDate(c.facts.locations!.checked)}). GlobalHostia is a Dubai-based company${o.locs.length ? `; our shared hosting runs in ${o.locs.join(', ')}` : ''}. You can test the speed from your browser on our data centers page.` : `${c.name} did not list data-centre locations for this plan on the pages we checked. GlobalHostia is a Dubai-based company${o.locs.length ? `; our shared hosting runs in ${o.locs.join(', ')}` : ''}.` },
    { q: `Can GlobalHostia move my website from ${c.name}?`, a: migration ? 'Yes. Our engineers copy your website, databases and email for free, test everything and then help you switch DNS without downtime.' : 'Yes. Our guide explains each step, and our team can help with the move.' },
    { q: `Where do the ${c.name} facts on this page come from?`, a: `Only from ${c.name}’s own website. Each fact links to the page we read and the date we checked it. Prices and features change, so check ${c.site.replace(/^https:\/\//, '')} before you buy.` },
    { q: `Is this comparison sponsored by ${c.name}?`, a: `No. GlobalHostia wrote it independently and is not affiliated with ${c.name}. ${c.name} is a trademark of its owner and is named only to identify the provider.` },
  ];

  const others = visibleCompetitors(s).filter((x) => x.slug !== c.slug);
  const body = [hero, `<div class="hp-container ua-guide">
    <aside class="ua-toc" aria-labelledby="vs-toc-h"><h2 id="vs-toc-h">On this page</h2><ol>${sections.map((x) => `<li><a href="#${x.id}">${esc(x.title)}</a></li>`).join('')}<li><a href="#ln-faq-h">Questions</a></li></ol>
      <div class="ua-toc__cta"><p>Rather ask a person?</p>${wa ? `<a class="hp-link" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp our team${icon('arrow')}</a>` : link('Contact our team', '/contact')}</div></aside>
    <article class="ua-article ln-article">${sections.map((x) => `<section class="ua-sec" id="${x.id}" aria-labelledby="${x.id}-h"><h2 id="${x.id}-h" class="hp-hline">${esc(x.title)}</h2><div class="ln-prose">${x.html}</div></section>`).join('')}
      <nav class="ua-links" aria-label="Related pages">${[['Shared hosting plans', '/shared-hosting'], ['Best web hosting in the UAE', '/best-hosting-uae'], ['Data centers', '/data-centers'], ['Plan finder', '/plan-finder']].map(([l, h]) => link(l, h)).join('')}</nav>
      ${others.length ? `<aside class="ln-more" aria-labelledby="vs-more-h"><h2 id="vs-more-h">More comparisons</h2><ul>${others.slice(0, 6).map((x) => `<li><a href="${esc(vsPath(x.slug))}">GlobalHostia vs ${esc(x.name)}</a></li>`).join('')}</ul>${link('All hosting comparisons', '/compare')}</aside>` : ''}
    </article>
  </div>`, trustStrip(s),
    `<section class="hp-section hp-section--tint" aria-labelledby="ln-faq-h"><div class="hp-container ua-faq">${sectionHead({ id: 'ln-faq-h', title: `${title}: questions`, align: 'left' })}${faq(faqs, { id: 'ln-faq', single: true })}</div></section>`,
    ctaBand({ title: migration ? `Ready to move from ${c.name}?` : 'Not sure which plan you need?', text: migration ? 'Our engineers move your website for free, with no downtime.' : 'Answer four questions and get a recommendation from our live plans.',
      primary: migration ? { label: 'Request a free migration', href: '/free-migration' } : { label: 'Open the plan finder', href: '/plan-finder' }, secondary: { label: 'See shared hosting plans', href: '/shared-hosting' } }),
  ].join('\n');

  const org = { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/` };
  const lds = [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs),
    ld({ '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: ROUTES[path.slice(1)]?.meta || ROUTES[path.slice(1)]?.description, url, inLanguage: 'en',
      dateModified: range.newest, isPartOf: { '@type': 'WebSite', url: `${site}/`, name: 'GlobalHostia' }, publisher: org,
      about: [{ '@type': 'Organization', name: 'GlobalHostia', url: `${site}/` }, { '@type': 'Organization', name: c.name, url: c.site }],
      citation: srcs.map((x) => x.url) })];
  return page({ ctx, catalog: cat, path, title, description: ROUTES[path.slice(1)]?.description || title, css: ['uae', 'learn', 'vs'], js: ['uae'], jsonLd: lds, ogType: 'article', ogKicker: 'Comparison', body });
}

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const m = /^compare\/globalhostia-vs-([a-z0-9-]+)$/.exec(ctx.slug);
  const c = m ? competitor(m[1], cat.settings) : undefined;
  // a page hidden in Admin → Competitor pages answers 404 (and leaves the sitemap and llms.txt)
  if (!c || c.hidden) return null as unknown as string;
  return renderVs(ctx, cat, c);
}

/** Hub cards for /compare (lib/theme/pages/learn.ts). */
export function vsCards(cat: Catalog) {
  const list = visibleCompetitors(cat.settings);
  if (!list.length) return '';
  return `<section class="hp-section" aria-labelledby="vs-list-h"><div class="hp-container">
    ${sectionHead({ id: 'vs-list-h', title: 'GlobalHostia vs other hosts', lead: 'Our live plans next to other providers’ published plans, with a source and a date for every fact about them.' })}
    <ul class="ln-cards vs-cards">${list.map((c) => `<li><a class="ln-card" href="${esc(vsPath(c.slug))}"><h3>GlobalHostia vs ${esc(c.name)}</h3><p>${esc(c.blurb)}</p><span class="ln-card__meta">${icon('clock')}Facts as of ${esc(longDate(checkedRange(c).newest))}</span></a></li>`).join('')}</ul>
    <p class="vs-disc vs-disc--hub">Facts about other providers come from their own websites, with the date we checked. Prices and features change; check the provider’s site. Trademarks belong to their owners.</p>
  </div></section>`;
}
