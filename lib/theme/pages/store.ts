// Business services shop:
//   /business-services          hub: sections with category cards, search/filter across services and plans, popular plans,
//                               bundles (totals from real component prices), hosting/domain cross-links, FAQ
//   /business-services/<slug>   one category: live WHMCS plans (adaptive layout + auto comparison table), or a
//                               "Request a quote" form (done-for-you services) / "Coming soon · contact sales" form
// Everything comes from Admin → Business services (settings.business_services) and Admin → Categories; plans and prices
// only from WHMCS (product_prices / tlds). Nothing renders until the shop is published (admins can ?preview).
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { money } from '../../pricing';
import { getCatalog, pricedTlds, currencyPrefix, orderUrl, fromPrice, type Catalog } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, planCards, plansNote, specTable, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, ld, icon, hexIcon, link, fromText, domainSearch, VAT_NOTE,
} from '../ui';
import { trustStrip, waLink } from '../growth';
import { productsLd } from './vps';
import { storeView, type StoreItem, type StoreView, type BundleView } from '../../store/view';
import { HUB_PATH, entryPath, sectionAnchor, QUOTE_BUDGETS, QUOTE_TIMES } from '../../store/config';

const siteOf = (cat: Catalog) => String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
const LAYOUT: Record<string, 'auto' | 'featured' | 'cards' | 'grid' | 'list'> = { featured: 'featured', cards: 'cards', grid: 'grid', catalog: 'list' };

export default async function render(ctx: PageCtx): Promise<string | null> {
  const cat = await getCatalog();
  const v = storeView(cat);
  if (!v.cfg.published && !ctx.preview) return null;
  const slug = ctx.slug.split('/')[1];
  if (!slug) return v.live || ctx.preview ? renderHub(ctx, cat, v) : null;
  const it = v.items.find((i) => i.cat.slug === slug && !i.external);
  return it ? renderEntry(ctx, cat, v, it) : null;
}

const previewNote = (v: StoreView) => (v.cfg.published ? '' : `<p class="bs-preview" role="note">${icon('eye')}Preview: the Business services shop is not published yet. Switch it on in Admin → Business services.</p>`);

function statusHtml(it: StoreItem, currency: string) {
  if (it.status === 'live' && it.fromProduct) return `<span class="bs-from num">From <b>${esc(fromText(it.fromProduct, currency))}</b></span>`;
  if (it.status === 'quote') return `<span class="bs-tag bs-tag--quote">${icon('chat')}Request a quote</span>`;
  return `<span class="bs-tag">${icon('clock')}Coming soon · contact sales</span>`;
}

function card(it: StoreItem, currency: string, i = 0) {
  const q = [it.name, it.entry.blurb, it.description, ...it.entry.groups, ...it.priced.map((p) => p.name)].join(' ').toLowerCase();
  return `<a class="bs-card" href="${esc(it.href)}" data-bs-card data-sec="${esc(it.entry.section)}" data-q="${esc(q)}" data-reveal style="--i:${i % 4}">
  ${hexIcon(it.entry.icon)}<span class="bs-card__body"><b class="bs-card__t">${esc(it.name)}</b><span class="bs-card__d">${esc(it.entry.blurb || it.description)}</span></span>
  <span class="bs-card__foot">${statusHtml(it, currency)}${icon('arrow')}</span>
</a>`;
}

function bundleCard(b: BundleView, prefix: string, i = 0) {
  const t = b.total;
  const steps = b.orderHref
    ? `<a class="hp-btn hp-btn--brand" href="${esc(b.orderHref)}">${icon('cart')}Order this bundle</a>`
    : `<details class="bs-steps"><summary class="hp-btn hp-btn--ghost">${icon('cart')}Order step by step</summary>
      <ol>${t.lines.map((l) => `<li><a href="${esc(l.href || '#')}" target="_blank" rel="noopener">${esc(l.ref.startsWith('tld:') ? `Search and add your ${l.ref.slice(4)} domain` : `Add ${l.name}`)}${icon('external')}</a></li>`).join('')}</ol>
      <p>Each link opens our cart in a new tab and adds one item to the same cart. Check out once when everything is in it.</p></details>`;
  return `<article class="bs-bundle" data-bs-card data-sec="bundles" data-q="${esc([b.bundle.name, b.bundle.summary, ...t.lines.map((l) => l.name)].join(' ').toLowerCase())}" data-reveal style="--i:${i % 3}">
  <header><h3>${esc(b.bundle.name)}</h3>${b.bundle.summary ? `<p>${esc(b.bundle.summary)}</p>` : ''}</header>
  <ul class="bs-bundle__lines">${t.lines.map((l) => `<li><span>${esc(l.name)}<small>${esc(l.basis)}</small></span><b class="num">${esc(money(l.amount, prefix))}</b></li>`).join('')}</ul>
  <p class="bs-bundle__total"><span>First-year total</span><b class="num">${esc(money(t.total!, prefix))}</b></p>
  <p class="bs-bundle__note">Added up from each plan's live price${t.savings ? `, with a bundle discount of ${esc(money(t.savings, prefix))} from our billing system` : ''}. ${esc(VAT_NOTE)}. Renewal prices are shown on each plan before you pay.</p>
  <div class="bs-bundle__cta">${steps}</div>
</article>`;
}

/* ------------------------------------------------------------------ hub */
function renderHub(ctx: PageCtx, cat: Catalog, v: StoreView) {
  const cfg = v.cfg, site = siteOf(cat), cur = cat.currency, prefix = currencyPrefix(cat) || '$';
  const secs = v.sections.filter((s) => s.items.length || s.bundles.length);
  const crumbs = [{ label: 'Home', href: '/' }, { label: cfg.title }];
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const visual = `<nav class="bs-index" aria-label="Service sections"><p class="bs-index__h">Browse by need</p><ul>${secs.map((s) =>
    `<li><a href="#${esc(s.slug)}">${hexIcon(s.icon)}<span><b>${esc(s.name)}</b><small>${esc(s.items.length ? count(s.items.length, 'service', 'services') : count(s.bundles.length, 'bundle', 'bundles'))}</small></span>${icon('arrow')}</a></li>`).join('')}</ul></nav>`;
  const hero = pageHero({
    crumbs, eyebrow: 'Business services', title: cfg.title, lead: cfg.lead,
    ctas: [{ label: 'Browse services', href: '#bs-catalog' }, { label: 'Talk to sales', href: '/contact', variant: 'ghost' }],
    trust: ['Prices from our billing system', 'Managed with your hosting and domains', 'Written quotes for custom work'], visualHtml: visual,
  });

  // search across services and the plans they sell (store.js filters cards and plan rows)
  const plans = v.items.filter((i) => !i.external || i.status === 'live').flatMap((i) => i.priced.map((p) => ({ p, i })));
  const results = plans.length ? `<div class="bs-results" data-bs-results hidden><h3 class="bs-results__h">Matching plans</h3><ul>${plans.map(({ p, i }) =>
    `<li data-bs-plan data-sec="${esc(i.entry.section)}" data-q="${esc([p.name, p.tagline, i.name, ...p.features].join(' ').toLowerCase())}" hidden><a href="/p/${esc(p.slug)}"><b>${esc(p.name)}</b><span>${esc(i.name)}</span></a><span class="num">${esc(fromText(p, cur))}</span><a class="hp-link" href="${esc(orderUrl(p, cat.base))}" aria-label="${esc(`Order ${p.name}`)}">Order${icon('arrow')}</a></li>`).join('')}</ul></div>` : '';
  const sections = secs.map((s) => `<section class="bs-sec" id="${esc(s.slug)}" data-bs-group="${esc(s.items.length ? s.slug : 'bundles')}" aria-labelledby="${esc(s.slug)}-h">
    <div class="bs-sec__head" data-reveal>${hexIcon(s.icon)}<div><h2 id="${esc(s.slug)}-h">${esc(s.name)}</h2>${s.description ? `<p>${esc(s.description)}</p>` : ''}</div></div>
    ${s.items.length ? `<div class="bs-grid">${s.items.map((it, i) => card(it, cur, i)).join('')}</div>` : `<div class="bs-bundles">${s.bundles.map((b, i) => bundleCard(b, prefix, i)).join('')}</div>`}
  </section>`).join('');
  const chips = [{ slug: '', name: 'All' }, ...secs.map((s) => ({ slug: s.items.length ? s.slug : 'bundles', name: s.name }))];
  const catalog = `<section class="hp-section bs-cat" id="bs-catalog" aria-labelledby="bs-cat-h"><div class="hp-container">
    ${previewNote(v)}
    <div class="bs-bar" data-bs-filter>
      <h2 id="bs-cat-h" class="sr-only">All business services</h2>
      <label class="bs-search">${icon('search')}<span class="sr-only">Search business services and plans</span><input type="search" class="hp-input" placeholder="Search, for example backup, email or logo" autocomplete="off" data-bs-q></label>
      <div class="bs-chips" role="group" aria-label="Filter by section">${chips.map((c, i) => `<button type="button" class="bs-chip" aria-pressed="${i === 0}" data-bs-sec="${esc(c.slug)}">${esc(c.name)}</button>`).join('')}</div>
      <p class="bs-count" aria-live="polite" data-bs-count></p>
    </div>
    ${results}
    ${sections}
    <p class="bs-empty" data-bs-empty hidden>No services match your search. Clear it, or <a href="/contact">ask our team</a> what you need.</p>
  </div></section>`;

  // popular: plans the admin marked as featured, else the lowest-priced plan of each live category (real prices only)
  const featured = plans.filter(({ p }) => p.featured);
  const pick = (featured.length ? featured : v.items.filter((i) => i.fromProduct).map((i) => ({ p: i.fromProduct!, i }))).slice(0, 6);
  const popular = pick.length ? `<section class="hp-section hp-section--tint" aria-labelledby="bs-pop-h"><div class="hp-container">
    ${sectionHead({ id: 'bs-pop-h', title: featured.length ? 'Popular services' : 'Order online today', lead: 'Live prices from our billing system. Order in a few clicks; it is added to the same account as your hosting.' })}
    <div class="bs-pop">${pick.map(({ p, i }, k) => `<article class="bs-pcard" data-reveal style="--i:${k % 3}">${hexIcon(i.entry.icon)}<div class="bs-pcard__b"><span class="bs-pcard__k">${esc(i.name)}</span><h3><a href="/p/${esc(p.slug)}">${esc(p.name)}</a></h3>${p.tagline ? `<p>${esc(p.tagline)}</p>` : ''}</div>
      <div class="bs-pcard__f"><span class="num">From <b>${esc(fromText(p, cur))}</b></span><a class="hp-btn hp-btn--brand" href="${esc(orderUrl(p, cat.base, fromPrice(p, cur)?.cycle))}" aria-label="${esc(`Order ${p.name}`)}">Order</a></div></article>`).join('')}</div>
    ${plansNote(cur)}
  </div></section>` : '';

  const tl = pricedTlds(cat);
  const cross = `<section class="hp-section" aria-labelledby="bs-x-h"><div class="hp-container bs-x">
    <div>${sectionHead({ id: 'bs-x-h', title: 'Need hosting or a domain too?', lead: 'Business services work alongside hosting and domains in the same client account.', align: 'left' })}
      <p class="bs-x__links">${[link('Web hosting', '/web-hosting'), link('WordPress hosting', '/wordpress-hosting'), link('VPS hosting', '/vps-hosting'), link('Domain names', '/domains-registration'), link('Not sure? Try the plan finder', '/plan-finder')].join('')}</p></div>
    <div class="bs-x__dom">${domainSearch({ tlds: tl, base: cat.base, compact: true, title: 'Find your domain', headingLevel: 3, id: 'bs-dq', moreHref: '/domains-registration', prefix })}</div>
  </div></section>`;
  const faqSec = cfg.faq.length ? `<section class="hp-section hp-section--tint" aria-labelledby="bs-faq-h"><div class="hp-container bs-faq">
    ${sectionHead({ id: 'bs-faq-h', title: 'Questions about business services', align: 'left' })}${faq(cfg.faq, { id: 'bs-faq', single: true })}</div></section>` : '';
  const cta = ctaBand({ title: 'Not sure what you need?', text: 'Tell us about your business and our team will suggest the services that fit, with prices from our billing system.', primary: { label: 'Talk to sales', href: '/contact' }, secondary: { label: 'Browse services', href: '#bs-catalog' } });

  const offerCatalog = ld({ '@context': 'https://schema.org', '@type': 'OfferCatalog', name: cfg.title, url: site + HUB_PATH,
    itemListElement: secs.filter((s) => s.items.length).map((s) => ({ '@type': 'OfferCatalog', name: s.name, url: site + sectionAnchor(s.slug), itemListElement: s.items.map((it) => ({
      '@type': 'Offer', url: site + it.href, itemOffered: { '@type': 'Service', name: it.name, url: site + it.href, provider: { '@id': `${site}/#organization` } },
      ...(it.from ? { price: it.from.price.toFixed(2), priceCurrency: cur } : {}) })) })) });
  return page({
    ctx: { ...ctx, route: { ...ctx.route, title: cfg.title, description: cfg.lead, seoTitle: cfg.seoTitle || undefined, meta: cfg.meta || undefined } },
    catalog: cat, path: HUB_PATH, title: cfg.title, description: cfg.lead || cfg.meta, css: ['store'], js: ['store'], noindex: !v.cfg.published,
    ogKicker: 'Business services',
    jsonLd: [breadcrumbJsonLd(crumbs, site), offerCatalog, productsLd(pick.map((x) => x.p), cat, 'Business services: popular plans'), cfg.faq.length ? faqJsonLd(cfg.faq) : ''].filter(Boolean),
    body: [hero, catalog, popular, cross, trustStrip(cat.settings, { tone: 'tint' }), faqSec, cta].join('\n'),
  });
}

/* ------------------------------------------------------------------ one category */
function renderEntry(ctx: PageCtx, cat: Catalog, v: StoreView, it: StoreItem) {
  const cfg = v.cfg, e = it.entry, site = siteOf(cat), cur = cat.currency;
  const sec = v.sections.find((s) => s.slug === e.section);
  const path = entryPath(it.cat.slug);
  const crumbs = [{ label: 'Home', href: '/' }, { label: cfg.title, href: HUB_PATH }, ...(sec ? [{ label: sec.name, href: sectionAnchor(sec.slug) }] : []), { label: it.name }];
  const live = it.status === 'live';
  const lead = it.description || e.blurb;
  const visual = e.included.length ? `<div class="bs-incl"><p class="bs-incl__h">${live ? 'What you get' : 'What we do for you'}</p><ul>${e.included.map((t) => `<li>${icon('check')}<span>${esc(t)}</span></li>`).join('')}</ul></div>` : undefined;
  const hero = pageHero({
    crumbs, eyebrow: sec?.name || 'Business services', title: it.name, lead,
    ctas: live ? [{ label: 'See the plans', href: '#plans' }, { label: e.kind === 'service' ? 'Request a quote' : 'Talk to sales', href: e.kind === 'service' ? '#quote' : '/contact', variant: 'ghost' }]
      : [{ label: it.status === 'quote' ? 'Request a quote' : 'Contact sales', href: '#quote' }, { label: 'All business services', href: HUB_PATH, variant: 'ghost' }],
    fromHtml: live && it.fromProduct ? `From <b>${esc(fromText(it.fromProduct, cur))}</b>` : '',
    visualHtml: visual,
  });

  const plans = live ? `<section class="hp-section" id="plans" aria-labelledby="bs-plans-h"><div class="hp-container">
    ${previewNote(v)}
    ${sectionHead({ id: 'bs-plans-h', title: it.priced.length === 1 ? 'The plan' : 'Choose your plan', lead: 'Live prices from our billing system. Pick a billing period and order in a few clicks.' })}
    ${planCards(it.priced, { currency: cur, base: cat.base, id: 'bs-plans', cycleSwitch: true, details: true, layout: LAYOUT[it.cat.layout] || 'auto' })}
    ${plansNote(cur)}
  </div></section>` : '';
  const compare = live && it.priced.length >= 2 && it.priced.length <= 8 ? `<section class="hp-section hp-section--tint" aria-labelledby="bs-cmp-h"><div class="hp-container">
    ${sectionHead({ id: 'bs-cmp-h', title: 'Compare plans', lead: 'Generated from each plan’s specifications and features.' })}
    ${specTable(it.priced, { currency: cur, caption: `${it.name}: plan comparison` })}
  </div></section>` : '';
  const quote = !live || e.kind === 'service' ? quoteSection(ctx, cat, v, it) : '';

  const siblings = (sec?.items || []).filter((x) => x !== it);
  const related = `<section class="hp-section" aria-labelledby="bs-rel-h"><div class="hp-container">
    ${sectionHead({ id: 'bs-rel-h', title: siblings.length ? `More ${sec ? sec.name.toLowerCase() : 'services'}` : 'Related', align: 'left' })}
    ${siblings.length ? `<div class="bs-grid bs-grid--sm">${siblings.slice(0, 4).map((x, i) => card(x, cur, i)).join('')}</div>` : ''}
    <p class="bs-x__links">${[link('All business services', HUB_PATH), link('Web hosting', '/web-hosting'), link('Domain names', '/domains-registration'), link('Contact sales', '/contact')].join('')}</p>
  </div></section>`;
  const faqSec = e.faq.length ? `<section class="hp-section hp-section--tint" aria-labelledby="bs-faq-h"><div class="hp-container bs-faq">
    ${sectionHead({ id: 'bs-faq-h', title: `${it.name}: questions`, align: 'left' })}${faq(e.faq, { id: 'bs-faq', single: true })}</div></section>` : '';
  const cta = live
    ? ctaBand({ title: `Questions about ${it.name.toLowerCase()}?`, text: 'Our team answers by ticket, phone and WhatsApp, around the clock.', primary: { label: 'See the plans', href: '#plans' }, secondary: { label: 'Contact us', href: '/contact' } })
    : '';

  const service = ld({ '@context': 'https://schema.org', '@type': 'Service', name: it.name, description: lead, url: site + path, serviceType: it.name,
    provider: { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/` }, areaServed: 'Worldwide' });
  const done = ctx.query.has('quote') || ctx.query.has('quote_error');
  return page({
    ctx: { ...ctx, route: { ...ctx.route, title: it.name, description: lead, categories: live ? [it.cat.slug] : undefined } },
    catalog: cat, path, title: it.cat.seoTitle || it.name, description: it.cat.seoDescription || lead, css: ['store'], js: ['store'],
    // "coming soon" pages have nothing to order yet: kept out of the index (and the sitemap) until plans are live
    noindex: !cfg.published || it.status === 'soon' || done, ogKicker: sec?.name || 'Business services',
    jsonLd: [breadcrumbJsonLd(crumbs, site), live ? productsLd(it.priced, cat, it.name) : service, e.faq.length ? faqJsonLd(e.faq) : ''].filter(Boolean),
    body: [hero, plans, compare, quote, faqSec, related, cta].join('\n'),
  });
}

/* ------------------------------------------------------------------ quote / contact sales form */
function quoteSection(ctx: PageCtx, cat: Catalog, v: StoreView, it: StoreItem) {
  const e = it.entry, s = cat.settings;
  const ticket = ctx.query.get('quote') || '';
  const err = ctx.query.get('quote_error') || '';
  const soon = it.status === 'soon';
  const email = String(s.email || '');
  const wa = waLink(s, `Hello, I would like a quote for ${it.name}.`);
  const field = (id: string, label: string, input: string, o: { req?: boolean; hint?: string; wide?: boolean } = {}) =>
    `<div class="bs-field${o.wide ? ' bs-field--wide' : ''}" data-field="${id}"><label for="bq-${id}">${esc(label)}${o.req ? ' <span class="bs-req" aria-hidden="true">*</span>' : ' <span class="bs-opt">optional</span>'}</label>${input}${o.hint ? `<p class="bs-hint" id="bq-${id}-hint">${esc(o.hint)}</p>` : ''}<p class="bs-err" id="bq-${id}-err" hidden></p></div>`;
  const inp = (id: string, type: string, extra = '') => `<input class="hp-input" id="bq-${id}" name="${id}" type="${type}" ${extra} aria-describedby="bq-${id}-err">`;
  const sel = (id: string, opts: string[], first: string) => `<select class="hp-select" id="bq-${id}" name="${id}" aria-describedby="bq-${id}-err"><option value="">${esc(first)}</option>${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
  const ta = (id: string, ph = '', rows = 3) => `<textarea class="hp-input bs-ta" id="bq-${id}" name="${id}" rows="${rows}" maxlength="${id === 'notes' ? 2000 : 600}" placeholder="${esc(ph)}" aria-describedby="bq-${id}-err"></textarea>`;
  const title = soon ? 'Contact sales' : 'Request a quote';
  const form = `<form class="bs-form" action="/api/store/quote" method="post" data-bs-form novalidate aria-labelledby="bq-h">
    <h2 id="bq-h" class="bs-form__h">${esc(title)}</h2>
    <p class="bs-form__lead">${esc(soon ? `${it.name} plans are not listed online yet. Tell us what you need and our sales team will help you directly.` : 'Tell us about your project. We reply with a written quote; asking is free and does not commit you to anything.')}</p>
    ${err ? `<p class="bs-alert" role="alert">${icon('alert')}${esc(err)}</p>` : '<p class="bs-alert" role="alert" data-bs-alert hidden></p>'}
    <input type="hidden" name="service" value="${esc(it.cat.slug)}"><input type="hidden" name="t" value="" data-bs-t>
    <div class="bs-fgrid">
      ${e.options.length ? field('option', 'What do you need?', sel('option', e.options, 'Choose one'), { wide: true }) : ''}
      ${field('name', 'Your name', inp('name', 'text', 'autocomplete="name" required minlength="2" maxlength="80"'), { req: true })}
      ${field('email', 'Email', inp('email', 'email', 'autocomplete="email" required maxlength="160"'), { req: true })}
      ${field('phone', 'Phone or WhatsApp', inp('phone', 'tel', 'autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+971 50 000 0000"'))}
      ${field('company', 'Company', inp('company', 'text', 'autocomplete="organization" maxlength="120"'))}
      ${field('website', 'Current website', inp('website', 'text', 'inputmode="url" autocapitalize="off" spellcheck="false" maxlength="200" placeholder="example.com"'))}
      ${field('budget', 'Budget', sel('budget', QUOTE_BUDGETS.slice(1), 'Not sure yet'))}
      ${field('timeline', 'When do you need it?', sel('timeline', QUOTE_TIMES, 'Choose one'), { wide: false })}
      ${e.questions.map((q, i) => field(`q${i}`, q, ta(`q${i}`, '', 2), { wide: true })).join('')}
      ${field('notes', 'Anything else we should know?', ta('notes', 'For example: what the business does, examples you like, or a deadline.', 4), { wide: true, hint: 'Please do not include passwords or card details.' })}
    </div>
    <label class="bs-consent"><input type="checkbox" name="consent" value="on"><span>Also send me occasional offers and guides by email or WhatsApp. <span class="bs-opt">optional</span></span></label>
    <div class="bs-hp" aria-hidden="true"><label for="bq-cu">Leave this empty</label><input id="bq-cu" name="company_url" type="text" tabindex="-1" autocomplete="off"></div>
    <div class="bs-submit"><button class="hp-btn hp-btn--brand hp-btn--lg" type="submit" data-bs-btn>${icon('chat')}<span>${esc(soon ? 'Send to sales' : 'Request my quote')}</span></button>
      <p>We open a ticket with your details and reply by email. ${email ? `Prefer email? Write to <a href="mailto:${esc(email)}">${esc(email)}</a>.` : ''}</p></div>
  </form>`;
  const doneOk = !!ticket && !err;
  const done = `<div class="bs-done" data-bs-done${doneOk ? '' : ' hidden'} tabindex="-1" role="status">
    ${hexIcon('check')}<h2>Request received</h2>
    <p data-bs-tline${doneOk && ticket !== 'received' ? '' : ' hidden'}>Your ticket number is <b class="num" data-bs-ticket>${esc(doneOk && ticket !== 'received' ? ticket : '')}</b>.</p>
    <p>Our sales team will reply by email${soon ? '' : ' with a quote or a few questions'}.</p>
    <div class="hp-actions">${link('All business services', HUB_PATH)}${wa ? link('Message us on WhatsApp', wa, 'whatsapp') : ''}</div>
  </div>`;
  const side = `<aside class="bs-side" aria-labelledby="bq-side-h"><h2 id="bq-side-h">What happens next</h2>
    <ol class="bs-next">${[
      ['We read your request', 'You get a ticket number by email, so the whole conversation stays in one place.'],
      [soon ? 'We find the right option' : 'We send a written quote', soon ? 'Our sales team replies with the options available for you.' : 'Scope, timeline and price, or a few questions first if we need them.'],
      ['You decide', soon ? 'Order when you are ready; nothing is charged until you do.' : 'Accept the quote and we start. Nothing is charged before you accept.'],
    ].map(([h, p], i) => `<li><span class="num" aria-hidden="true">${i + 1}</span><div><b>${esc(h)}</b><span>${esc(p)}</span></div></li>`).join('')}</ol>
    ${wa ? `<p class="bs-side__wa">${link('Prefer WhatsApp? Message our team', wa, 'whatsapp')}</p>` : ''}
  </aside>`;
  return `<section class="hp-section bs-qsec" id="quote" aria-label="${esc(title)}"><div class="hp-container">
    ${it.status === 'live' ? '' : previewNote(v)}
    <div class="bs-qwrap"><div class="bs-qcard">${doneOk ? '' : form}${done}</div>${side}</div>
  </div></section>`;
}

