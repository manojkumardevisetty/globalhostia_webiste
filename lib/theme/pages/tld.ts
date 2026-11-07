// /domains/<tld> (one page per visible TLD with a register price) and /domains/all (A–Z index).
// Prices only from `tlds` / `tld_prices` in the visitor currency; a TLD without a price in that currency says "See price".
// Curated facts for popular extensions live in lib/theme/pseo.ts; the rest use a generic text enriched with real prices.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { fitDescription } from '../../seo';
import { getCatalog, pricedTlds, currencyPrefix, domainCartUrl, type Catalog, type TTld } from '../data';
import { page } from '../shell';
import { breadcrumbs, breadcrumbJsonLd, domainSearch, sectionHead, faq, faqJsonLd, ctaBand, icon, hexIcon, link, ld, pageHero, VAT_NOTE } from '../ui';
import { trustStrip } from '../growth';
import { tldInfo, tldIndexable, TLD_EXISTING, isCountryTld, tldPageList, tldFromSlug, tldHref, tldRow, tldSlug, siteOf, type TldInfo } from '../pseo';

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

/** Where a TLD's first-year price sits among all priced TLDs (real ranking, no adjectives without numbers). */
function priceRank(row: TTld, all: TTld[]) {
  const sorted = [...all].sort((a, b) => a.register! - b.register!);
  const i = sorted.findIndex((t) => t.tld === row.tld);
  const n = sorted.length;
  if (n < 4 || i < 0) return '';
  if (i === 0) return `the lowest first-year price of the ${n} extensions we sell`;
  if (i === n - 1) return `the highest first-year price of the ${n} extensions we sell`;
  const q = i / (n - 1);
  return q < 1 / 3 ? `in the lower third of the ${n} extensions we sell by first-year price` : q > 2 / 3 ? `in the upper third of the ${n} extensions we sell by first-year price` : `mid-range among the ${n} extensions we sell by first-year price`;
}

function relatedFor(tld: string, info: TldInfo | null | undefined, cat: Catalog, pages: string[]) {
  const have = new Set(pages);
  const out: string[] = [];
  for (const t of info?.related || []) if (have.has(t) && t !== tld && !out.includes(t)) out.push(t);
  if (out.length < 3) {
    // fill with extensions of the same kind, closest in first-year price
    const me = tldRow(cat, tld)?.register ?? null;
    const cc = isCountryTld(tld);
    const pool = pricedTlds(cat).filter((t) => t.tld !== tld && !out.includes(t.tld) && have.has(t.tld));
    pool.sort((a, b) => Number(isCountryTld(a.tld) !== cc) - Number(isCountryTld(b.tld) !== cc)
      || (me === null ? 0 : Math.abs(a.register! - me) - Math.abs(b.register! - me)) || a.tld.localeCompare(b.tld));
    for (const t of pool) { if (out.length >= 3) break; out.push(t.tld); }
  }
  return out.slice(0, 3);
}

export default async function render(ctx: PageCtx): Promise<string | null> {
  const slug = ctx.slug.split('/')[1] || '';
  const cat = await getCatalog();
  if (slug === 'all') return renderAll(ctx, cat);
  const tld = tldFromSlug(cat, slug);
  if (!tld || TLD_EXISTING[tld]) return null;
  return renderTld(ctx, cat, tld);
}

async function renderTld(ctx: PageCtx, cat: Catalog, tld: string) {
  const { base, settings: s } = cat;
  const site = siteOf(cat);
  const prefix = currencyPrefix(cat) || '$';
  const m = (v: number | null | undefined) => (v === null || v === undefined ? '' : money(v, prefix));
  const pages = tldPageList(cat);
  const priced = pricedTlds(cat);
  const row = tldRow(cat, tld);
  const info = tldInfo(cat, tld);
  const cc = isCountryTld(tld);
  const path = `/domains/${tldSlug(tld)}`;
  const label = tld.slice(1).toUpperCase();
  const related = relatedFor(tld, info, cat, pages);
  const relRows = related.map((t) => ({ t, r: tldRow(cat, t) }));
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Domains', href: '/domains-registration' }, { label: 'All extensions', href: '/domains/all' }, { label: tld }];

  /* ---------- copy built from real prices ---------- */
  const rank = row ? priceRank(row, priced) : '';
  const renewNote = row && row.renew !== null
    ? (row.renew > row.register! * 1.03 ? `The first year is ${m(row.register)}; after that it renews at ${m(row.renew)} a year, ${pct(row.renew, row.register!)}% more, so budget for the renewal price.`
      : row.renew < row.register! * 0.97 ? `It renews at ${m(row.renew)} a year, less than the first year.`
        : `It renews at ${m(row.renew)} a year, the same as the first year, so there is no price jump after year one.`)
    : '';
  const three = row && row.renew !== null ? row.register! + 2 * row.renew : null;
  const insight = [
    row ? `A ${tld} domain costs ${m(row.register)} for the first year${rank ? `, ${rank}` : ''}.` : `The live ${tld} price is shown in the order form before you pay.`,
    renewNote,
    row && row.transfer !== null ? `Transferring an existing ${tld} name to us costs ${m(row.transfer)}${!cc ? ', and for most generic extensions a transfer adds a year to the registration' : ''}.` : '',
  ].filter(Boolean);

  const forWho = info?.forWho || (cc
    ? `Businesses, organisations and people who want a ${label} country address, or a short name that reads well with .${tld.split('.').pop()}.`
    : `Anyone whose name or idea reads well with ${tld}. Generic extensions are open to everyone, and a word extension can make the full address read like a phrase.`);
  const facts = info?.facts || (cc
    ? [`${tld} is a country-code extension.`, 'Country addresses tell visitors where you are based or who you serve.', 'Registration rules are set by the registry and may require a local presence or extra details; we confirm what applies before you pay.']
    : [`${tld} is a generic extension, available to anyone for any purpose.`, 'Short names that are long gone in .com are often still free here.', 'You can point it at any website or email service, or use it alongside your main domain.']);
  const kind = cc ? (info?.country ? `Country extension of ${info.country}` : 'Country-code extension') : 'Generic extension';

  /* ---------- hero with live price card ---------- */
  const priceCard = `<div class="ps-price" aria-labelledby="ps-price-h">
    <div class="ps-price__tld" aria-hidden="true">${esc(tld)}</div>
    <h2 id="ps-price-h" class="sr-only">${esc(tld)} prices</h2>
    ${row ? `<dl class="ps-price__rows num">
      <div><dt>First year</dt><dd><b>${esc(m(row.register))}</b></dd></div>
      ${row.renew !== null ? `<div><dt>Renews at</dt><dd>${esc(m(row.renew))} / year</dd></div>` : ''}
      ${row.transfer !== null ? `<div><dt>Transfer in</dt><dd>${esc(m(row.transfer))}</dd></div>` : ''}
    </dl><p class="ps-price__note">Live price in ${esc(cat.currency)} from our billing system. ${esc(VAT_NOTE)}.</p>`
    : `<p class="ps-price__na"><a class="hp-btn hp-btn--light" href="${esc(domainCartUrl(base))}">See price</a></p><p class="ps-price__note">The ${esc(tld)} price in ${esc(cat.currency)} is shown in the order form before you pay.</p>`}
  </div>`;
  const hero = `<section class="hp-hero hp-hero--page ps-hero" aria-labelledby="ps-h1">
  <div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="hp-container">
    <div class="hp-hero__copy">
      ${breadcrumbs(crumbs)}
      <span class="hp-kicker"><i aria-hidden="true"></i>${esc(kind)}</span>
      <h1 id="ps-h1">Register a ${esc(tld)} domain</h1>
      <p class="hp-lead">${esc(forWho)} Search for your name below; the first-year and renewal prices are shown before you pay.</p>
    </div>
    <div class="hp-hero__visual">${priceCard}</div>
  </div>
</section>`;

  const searchTlds: TTld[] = [row, ...relRows.map((x) => x.r)].filter((t): t is TTld => !!t).map((t) => ({ ...t, featured: true }));
  const words = ['yourbrand', 'mystudio', 'greenleaf', 'northwind'];
  const search = `<section class="hp-domain ps-search" aria-labelledby="ps-q-h"><div class="hp-container">${domainSearch({
    tlds: searchTlds, base, id: 'ps-q', title: `Is your ${tld} name free?`, max: 4, prefix,
    typing: words.map((w) => w + tld),
    note: row ? `Type a name without an extension and we search ${tld} first. First-year prices in ${cat.currency}${row.renew !== null ? `; ${tld} renews at ${m(row.renew)} a year` : ''}.` : `Type a name without an extension and we search ${tld} first. The live price is shown before you pay.`,
  })}</div></section>`;

  const about = `<section class="hp-section" aria-labelledby="ps-about-h"><div class="hp-container ps-two">
    <div data-reveal>
      <h2 id="ps-about-h" class="hp-hline hp-h2">Who ${esc(tld)} is for</h2>
      <p class="hp-lead">${esc(forWho)}</p>
      <ul class="ps-facts">${facts.map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>
    </div>
    <div class="ps-card" data-reveal>
      <h3>${icon('tag')}What a ${esc(tld)} domain costs</h3>
      ${insight.map((t) => `<p>${esc(t)}</p>`).join('')}
      ${three !== null ? `<dl class="ps-cost num"><div><dt>Year 1</dt><dd>${esc(m(row!.register))}</dd></div><div><dt>Years 2 and 3</dt><dd>${esc(m(row!.renew! * 2))}</dd></div><div class="is-total"><dt>3 years in total</dt><dd>${esc(m(three))}</dd></div></dl>
      <p class="ps-small">Calculated from today’s prices in ${esc(cat.currency)}, before VAT where it applies. Renewal prices can change; the order form always shows the current price.</p>` : ''}
    </div>
  </div></section>`;

  const relSec = relRows.length ? `<section class="hp-section hp-section--tint" aria-labelledby="ps-rel-h"><div class="hp-container">
    ${sectionHead({ id: 'ps-rel-h', title: `Extensions to consider with ${tld}`, lead: 'Register a second extension to protect your name, or compare alternatives if yours is taken.' })}
    <ul class="ps-rel">${relRows.map(({ t, r }, i) => `<li data-reveal style="--i:${i}"><a href="${esc(tldHref(t))}">
      <b class="ps-rel__tld">${esc(t)}</b>
      <span class="ps-rel__for">${esc(tldInfo(cat, t)?.forWho || (isCountryTld(t) ? 'Country-code extension' : 'Generic extension open to anyone'))}</span>
      <span class="ps-rel__p num">${r ? `${esc(m(r.register))} first year${r.renew !== null ? `<small>Renews at ${esc(m(r.renew))}</small>` : ''}` : 'See price'}</span>
      <span class="hp-link" aria-hidden="true">${esc(t)} details${icon('arrow')}</span></a></li>`).join('')}</ul>
  </div></section>` : '';

  const faqs = [
    { q: `How much does a ${tld} domain cost?`, a: row ? `${m(row.register)} for the first year in ${cat.currency}${row.renew !== null ? `, then ${m(row.renew)} a year to renew` : ''}, before VAT where it applies. Prices come live from our billing system and are confirmed in the order form.` : `The live ${tld} price is shown in our order form before you pay, together with the renewal price.` },
    { q: `Who can register a ${tld} domain?`, a: cc ? `${tld} is a country-code extension. The registry sets the rules, which may require a local presence, a local contact or documents. Ask us before ordering and we will confirm what applies to you.` : `${tld} is a generic extension, open to anyone. If the registry has extra rules for a name, the order form shows them before you pay.` },
    { q: `Can I transfer my ${tld} domain to Globalhostia?`, a: row && row.transfer !== null ? `Yes. A transfer costs ${m(row.transfer)}. Unlock the domain at your current registrar, get the transfer code and start the transfer from our domains page. Your website and email keep working during the move.` : 'Yes. Unlock the domain at your current registrar, get the transfer code and start the transfer from our domains page. Your website and email keep working during the move.' },
    { q: `Can I use a ${tld} domain with my website and email?`, a: `Yes. Point it at hosting with us or anywhere else, and create email addresses such as you@yourname${tld}. DNS management is included with every domain.` },
    ...(info?.facts.some((f) => /HTTPS/.test(f)) ? [{ q: `Does a ${tld} website need SSL?`, a: `Yes. ${tld} is on browsers’ HSTS preload list, so pages only load over HTTPS. Every hosting plan with us includes a free SSL certificate.` }] : []),
  ];
  const faqSec = `<section class="hp-section" aria-labelledby="ps-faq-h"><div class="hp-container ps-faq">
    ${sectionHead({ id: 'ps-faq-h', title: `${tld} domain questions`, align: 'left' })}${faq(faqs, { id: 'ps-faq', single: true })}
  </div></section>`;
  const next = `<section class="hp-section hp-section--tint ps-next" aria-label="Next steps"><div class="hp-container"><p class="ps-links">
    ${link('Web hosting for your new domain', '/web-hosting')}${link('Business email on your domain', '/google-workspace')}${link('SSL certificates', '/ssl-certificate')}${link('Every extension and price', '/domains/all')}${link('Transfer a domain', '/domain-transfer')}</p></div></section>`;
  const cta = ctaBand({ title: `Claim your ${tld} name before someone else does`, text: 'Good names go quickly. Search now and see the live price before you pay.',
    primary: { label: `Search ${tld} names`, href: '#ps-q', attrs: 'data-focus-domain' }, secondary: { label: 'Help choosing a name', href: '/contact' } });

  const title = `${tld} Domain Registration & Renewal Prices`;
  const visible = `Register a ${tld} domain`;
  const desc = row
    ? fitDescription(`Register a ${tld} domain for ${m(row.register)} the first year${row.renew !== null ? `, renewing at ${m(row.renew)} a year` : ''}.`, [
      `${row.transfer !== null ? `Transfer in for ${m(row.transfer)}. ` : ''}Search names, see who ${tld} suits and order online.`,
      `Search available names, see who ${tld} suits and order online in minutes, with DNS management included.`,
      `Search names, see who ${tld} suits and order online with DNS management included.`,
      `Search available names and order online with DNS management included.`,
      `Search names and order online in minutes.`,
    ])
    : fitDescription(`Register a ${tld} domain with GlobalHostia: search for your name and see the first-year and renewal price before you pay.`, ['DNS management included with every domain.', 'DNS management included.']);
  const offer = row ? ld({ '@context': 'https://schema.org', '@type': 'Product', name: `${tld} domain registration`, description: `Registration of a ${tld} domain name for one year.`,
    brand: { '@type': 'Brand', name: 'GlobalHostia' }, url: site + path,
    offers: { '@type': 'Offer', price: row.register!.toFixed(2), priceCurrency: cat.currency, url: domainCartUrl(base), availability: 'https://schema.org/InStock', seller: { '@id': `${site}/#organization` } } }) : '';

  return page({
    ctx: { ...ctx, route: { ...ctx.route, title: visible, description: desc, seoTitle: title, meta: desc } }, catalog: cat, path, title: visible, description: desc,
    css: ['pseo'], ogKicker: 'Domains', noindex: !tldIndexable(cat, tld) || undefined, // template-only pages: noindex,follow
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), offer].filter(Boolean),
    body: [hero, search, trustStrip(s), about, relSec, faqSec, next, cta].join('\n'),
  });
}

async function renderAll(ctx: PageCtx, cat: Catalog) {
  const { base } = cat;
  const site = siteOf(cat);
  const prefix = currencyPrefix(cat) || '$';
  const m = (v: number | null | undefined) => (v === null || v === undefined ? '' : money(v, prefix));
  const pages = tldPageList(cat);
  const rows = pages.map((t) => ({ t, r: tldRow(cat, t), cc: isCountryTld(t) }));
  const priced = rows.filter((x) => x.r);
  const cheapest = [...priced].sort((a, b) => a.r!.register! - b.r!.register!)[0];
  const sameRenew = priced.filter((x) => x.r!.renew !== null && Math.abs(x.r!.renew - x.r!.register!) < 0.005);
  const nCc = rows.filter((x) => x.cc).length;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Domains', href: '/domains-registration' }, { label: 'All extensions' }];
  const path = '/domains/all';

  const hero = pageHero({
    crumbs, eyebrow: 'Domains A to Z', title: 'Every domain extension we sell, with prices',
    lead: `${pages.length} extensions${nCc ? `, ${nCc} of them country codes` : ''}. Compare the first-year, renewal and transfer price of each in ${cat.currency}, then open any extension for who it suits and a search box.`,
    ctas: [{ label: 'Search a domain', href: '/domains-registration', icon: 'search' }, { label: 'Transfer a domain', href: '/domain-transfer', variant: 'ghost' }],
    network: false,
  });
  const th = (k: string, l: string, num = false) => `<th scope="col"${num ? ' class="is-num"' : ''}><button type="button" data-sort="${k}">${esc(l)}<span class="ps-sort" aria-hidden="true"></span></button></th>`;
  const table = `<section class="hp-section" aria-labelledby="ps-all-h"><div class="hp-container">
    <h2 id="ps-all-h" class="sr-only">Domain extensions and prices</h2>
    <div class="ps-tl" data-tl data-page-size="25">
      <div class="ps-tl__bar">
        <label class="ps-tl__search"><span class="sr-only">Filter extensions</span>${icon('search')}<input class="hp-input" type="search" placeholder="Filter ${pages.length} extensions, e.g. .shop" data-tl-q autocomplete="off" spellcheck="false"></label>
        <label><span class="sr-only">Show</span><select class="hp-select" data-tl-kind><option value="">All extensions</option><option value="g">Generic only</option><option value="c">Country codes only</option></select></label>
        <span class="ps-tl__count" aria-live="polite" data-tl-count>${pages.length} extensions</span>
      </div>
      <div class="ps-tl__wrap"><table class="ps-tl__table">
        <caption class="sr-only">Domain extensions with first-year, renewal and transfer prices in ${esc(cat.currency)}. Column headers sort the table.</caption>
        <thead><tr>${th('tld', 'Extension')}${th('reg', 'First year', true)}${th('renew', 'Renews at', true)}${th('transfer', 'Transfer', true)}<th scope="col"><span class="sr-only">Details</span></th></tr></thead>
        <tbody data-tl-body>${rows.map(({ t, r, cc }) => `<tr data-tld="${esc(t)}" data-kind="${cc ? 'c' : 'g'}" data-reg="${r ? r.register!.toFixed(2) : ''}" data-renew="${r && r.renew !== null ? r.renew.toFixed(2) : ''}" data-transfer="${r && r.transfer !== null ? r.transfer.toFixed(2) : ''}">
          <th scope="row"><a href="${esc(tldHref(t))}">${esc(t)}</a><small>${cc ? 'Country code' : 'Generic'}</small></th>
          <td class="is-num" data-label="First year">${r ? `<b>${esc(m(r.register))}</b>` : `<a href="${esc(domainCartUrl(base))}">See price</a>`}</td>
          <td class="is-num" data-label="Renews at">${r && r.renew !== null ? esc(m(r.renew)) : '<span class="ps-na">In order form</span>'}</td>
          <td class="is-num" data-label="Transfer">${r && r.transfer !== null ? esc(m(r.transfer)) : '<span class="ps-na">In order form</span>'}</td>
          <td class="ps-tl__go"><a class="hp-btn hp-btn--ghost" href="${esc(tldHref(t))}" aria-label="${esc(`${t} details and search`)}">Details</a></td></tr>`).join('')}</tbody>
      </table></div>
      <p class="ps-tl__empty" data-tl-empty hidden>No extension matches. Clear the filter to see all ${pages.length}.</p>
      <nav class="ps-tl__pager" aria-label="Pages" data-tl-pager hidden></nav>
      <p class="ps-small">Prices in ${esc(cat.currency)}, live from our billing system. ${esc(VAT_NOTE)}.</p>
    </div>
  </div></section>`;

  const faqs = [
    { q: 'Which domain extension is the cheapest?', a: cheapest ? `Today ${cheapest.t} has the lowest first-year price at ${m(cheapest.r!.register)}${cheapest.r!.renew !== null ? `, renewing at ${m(cheapest.r!.renew)}` : ''}. Sort the table by "Renews at" to compare what you pay from year two.` : 'Sort the table by price to compare. Every price is confirmed in the order form.' },
    { q: 'Why is the renewal price different from the first year?', a: `Registries and registrars often discount the first year. We show the renewal next to every first-year price so there are no surprises${sameRenew.length ? `; ${sameRenew.length} of these extensions renew at the same price as the first year` : ''}.` },
    { q: 'Generic or country-code extension?', a: 'Generic extensions such as .com or .online are open to anyone. Country codes such as .de or .in show a local connection, and their registries may require a local presence; each extension page explains what to expect.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="ps-faq-h"><div class="hp-container ps-faq">
    ${sectionHead({ id: 'ps-faq-h', title: 'Choosing an extension', align: 'left' })}${faq(faqs, { id: 'ps-faq', single: true })}
  </div></section>`;
  const cta = ctaBand({ title: 'Found the right extension?', text: 'Search your name across every extension and see the live price before you pay.',
    primary: { label: 'Search a domain', href: '/domains-registration' }, secondary: { label: '.ae domains for the UAE', href: '/ae-domains' } });

  const list = priced.slice(0, 50);
  const itemList = list.length ? ld({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Domain extensions and prices', url: site + path, numberOfItems: list.length,
    itemListElement: list.map(({ t, r }, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: `${t} domain registration`, url: site + tldHref(t),
      offers: { '@type': 'Offer', price: r!.register!.toFixed(2), priceCurrency: cat.currency, availability: 'https://schema.org/InStock' } } })) }) : '';
  const desc = fitDescription(`Compare all ${pages.length} domain extensions we sell, A to Z, with first-year, renewal and transfer prices${cheapest ? ` from ${m(cheapest.r!.register)}` : ''}.`, [
    'Filter, sort and open any extension to search for your name.', 'Filter, sort and search for your name.', 'Sort by price and search your name.']);
  const title = 'All Domain Extensions A–Z with Prices';
  return page({
    ctx: { ...ctx, route: { ...ctx.route, title, description: desc } }, catalog: cat, path, title, description: desc,
    css: ['pseo'], js: ['pseo'], ogKicker: 'Domains',
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(faqs), itemList].filter(Boolean),
    body: [hero, table, faqSec, cta].join('\n'),
  });
}

