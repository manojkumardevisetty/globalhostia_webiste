// /premium-domains (marketplace) and /premium-domains/<domain> (detail + purchase request).
// Data: lib/premium/store.ts premiumItems() — the owner's own listings and, when switched on, cached Dynadot marketplace
// listings priced with the admin rule. Nothing is invented: with no listings the page shows a broker-first empty state.
// Purchase = request handled by our broker (no payment on the site): form → POST /api/premium-request → broker_requests
// row + WHMCS ticket → we confirm → secure WHMCS invoice → transfer/push to the customer's account.
import { after } from 'next/server';
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, faq, faqJsonLd, breadcrumbJsonLd, icon, hexIcon, ld, link, ctaBand } from '../ui';
import { trustStrip, waLink } from '../growth';
import { siteOf, crumbsFor } from './vps';
import { brokerConfig } from '../../broker';
import { premiumItems, premiumConfig, feedStale, refreshFeed } from '../../premium/store';
import { formToken } from '../../premium/token';
import {
  PREMIUM_PATH, LENGTHS, SORTS, SORT_LABEL, applyFilter, categoriesOf, layoutFor, readFilter, cleanDomain, fmtMoney, type PItem, type PremiumConfig,
} from '../../premium/core';
import { card, domainHtml, itemHref, priceText, sourceLabel } from '../../premium/view';
import { sellBand } from './sell';
import { normalizeSell, SELL_KEY } from '../../sell/core';

type Cat = Awaited<ReturnType<typeof getCatalog>>;

const STEPS = [
  { ic: 'pen', h: 'Send a request', p: 'Choose Buy now or make an offer. It takes a minute and nothing is charged.' },
  { ic: 'check', h: 'We confirm the name', p: 'Your broker checks the name is still available at that price and replies within one business day.' },
  { ic: 'lock', h: 'Pay a secure invoice', p: 'You receive a GlobalHostia invoice in your client area and pay with your usual method. No card details are taken on this page.' },
  { ic: 'transfer', h: 'The domain moves to you', p: 'We transfer or push the domain into your account and help you point it at your website and email.' },
];

function faqs(cfg: PremiumConfig, b: ReturnType<typeof brokerConfig>) {
  return [
    { q: 'Where do these premium domains come from?', a: `Two places: names GlobalHostia owns or lists for their owners, and selected listings from the marketplace of our registrar partner${cfg.feed.enabled ? '' : ' (when enabled)'}. Each card says which. Prices are the current asking prices; we never show an estimate as a price.` },
    { q: 'How do I pay?', a: 'After you send a request, we confirm the name and price and send an invoice from our client area (WHMCS). You pay it with the payment methods offered there. This website never asks for card details.' },
    { q: 'How long does the transfer take?', a: 'Names we hold in our own registrar account usually move to you within one or two business days after payment. Names bought from a marketplace or a third-party owner can take longer, typically a few days, depending on the seller and the registry.' },
    { q: 'Can I make an offer below the price?', a: 'Yes. Use Make an offer and tell us your price. We pass it on and reply with the answer. Some names have a minimum offer, shown on the page.' },
    { q: 'What if the name is sold before I pay?', a: 'Marketplace names can sell elsewhere at any time. We confirm availability before we invoice you; if a name is gone you pay nothing, and our broker can suggest similar names.' },
    { q: 'The domain I want is not listed. Can you get it?', a: `Yes, often. Our domain broker contacts the owner anonymously and negotiates within your budget. A ${fmtMoney(b.feeUsd)} service fee to start, and ${b.pct}% commission (minimum ${fmtMoney(b.minUsd)}) only if the deal closes.` },
  ];
}

function brokerBand(b: ReturnType<typeof brokerConfig>, domain = '') {
  return `<section class="hp-section" aria-labelledby="pd-br-h"><div class="hp-container"><div class="pd-broker" data-reveal>
    <div class="pd-broker__t">
      <span class="pd-broker__k">${icon('key')}Domain broker service</span>
      <h2 id="pd-br-h">Want a domain that's taken? Our broker negotiates for you.</h2>
      <p>We find the owner, contact them without revealing who you are and negotiate within your budget. The transfer goes through escrow, so neither side pays on trust.</p>
      <ul class="pd-broker__facts">
        <li><b class="num">${esc(fmtMoney(b.feeUsd))}</b><span>service fee to start</span></li>
        <li><b class="num">${esc(String(b.pct))}%</b><span>commission only on success, minimum ${esc(fmtMoney(b.minUsd))}</span></li>
        <li><b>Anonymous</b><span>the owner never learns who is buying</span></li>
      </ul>
    </div>
    <div class="pd-broker__a"><a class="hp-btn hp-btn--brand hp-btn--lg" href="/domain-broker${domain ? `?domain=${encodeURIComponent(domain)}` : ''}">${icon('arrow')}<span>Ask our broker</span></a><a class="hp-link" href="/domain-broker#fees">How the fees work${icon('arrow')}</a></div>
  </div></div></section>`;
}

const howSec = () => `<section class="hp-section hp-section--tint" id="how" aria-labelledby="pd-how-h"><div class="hp-container">
  ${sectionHead({ id: 'pd-how-h', title: 'How buying a premium domain works', lead: 'Four steps, handled by a person. You only pay once the name and price are confirmed.' })}
  <ol class="pd-steps">${STEPS.map((s, i) => `<li data-reveal style="--i:${i}"><span class="pd-steps__n num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${hexIcon(s.ic as any)}<h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></li>`).join('')}</ol>
</div></section>`;

function offerLd(i: PItem, site: string) {
  const base: any = { '@type': 'Product', name: i.domain, url: `${site}${itemHref(i)}`, category: 'Domain name', description: i.description || `The domain name ${i.domain}, for sale.` };
  if (i.price !== null) base.offers = { '@type': 'Offer', price: i.price.toFixed(2), priceCurrency: i.currency, availability: i.status === 'under_offer' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/InStock', url: `${site}${itemHref(i)}`, seller: { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia' } };
  return base;
}

/* ------------------------------------------------------------------ listing page */
async function listing(ctx: PageCtx, cat: Cat, items: PItem[], cfg: PremiumConfig) {
  const s = cat.settings, site = siteOf(cat), b = brokerConfig(s);
  const crumbs = crumbsFor('Premium domains', { label: 'Domains', href: '/domains-registration' });
  const f = readFilter(ctx.query);
  const shown = applyFilter(items, f).slice(0, 300);
  const filtered = Object.values(f).some((v) => v !== undefined);
  const top = applyFilter(items, { sort: 'featured' })[0];
  const minP = items.filter((i) => i.price !== null).reduce((m, i) => Math.min(m, i.price!), Infinity);

  const visual = top ? `<a class="pd-cert" href="${esc(itemHref(top))}">
      <span class="pd-cert__k">${icon('star')}${top.featured ? 'Featured name' : 'Premium name'}</span>
      ${domainHtml(top, 'span')}
      <span class="pd-cert__row"><span>${esc(sourceLabel(top))}</span><b class="num">${esc(priceText(top))}</b></span>
    </a>` : `<div class="pd-cert pd-cert--empty" aria-hidden="true"><span class="pd-cert__k">${icon('key')}Broker desk</span><span class="pd-dom"><b>yourbrand</b><i>.com</i></span><span class="pd-cert__row"><span>Taken? We negotiate.</span><b>You set the budget</b></span></div>`;
  const hero = pageHero({
    crumbs, eyebrow: 'Premium domains',
    title: items.length ? 'Premium domain names, ready to own.' : 'Premium domains, found and negotiated for you.',
    lead: items.length
      ? `Short and brandable names with the price shown upfront${Number.isFinite(minP) ? `, from ${fmtMoney(minP)}` : ''}. Send a request, we confirm it, you pay a secure invoice and the domain moves to your account.`
      : 'Our collection is being curated. Tell us the name you want and our broker approaches the owner anonymously and negotiates within your budget.',
    ctas: items.length ? [{ label: 'Browse names', href: '#names', icon: 'arrow' }, { label: 'Ask our broker', href: '/domain-broker', variant: 'ghost' }]
      : [{ label: 'Start a broker request', href: '/domain-broker', icon: 'arrow' }, { label: 'Search available domains', href: '/domains-registration', variant: 'ghost' }],
    visualHtml: visual, network: false,
  });

  let body: string;
  if (!items.length) {
    body = `<section class="hp-section" id="names" aria-labelledby="pd-empty-h"><div class="hp-container"><div class="pd-empty" data-reveal>
      ${hexIcon('star')}
      <h2 id="pd-empty-h">New premium names are on their way</h2>
      <p>We are adding hand-picked names with verified prices. Until then, our broker can try to buy almost any registered domain for you, or you can register an available one today.</p>
      <div class="hp-actions"><a class="hp-btn hp-btn--brand hp-btn--lg" href="/domain-broker">${icon('key')}<span>Ask our broker</span></a><a class="hp-btn hp-btn--ghost hp-btn--lg" href="/domains-registration">${icon('search')}<span>Search available domains</span></a></div>
    </div></div></section>`;
  } else {
    const tlds = [...new Set(items.map((i) => i.tld))].sort();
    const cats = categoriesOf(items).slice(0, 12);
    const sel = (name: string, label: string, opts: [string, string][], v = '') => `<label class="pd-f"><span>${esc(label)}</span><select class="hp-select" name="${name}" data-pd-f="${name}">${opts.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const numIn = (name: string, label: string, v?: number) => `<label class="pd-f pd-f--n"><span>${esc(label)}</span><input class="hp-input" type="number" min="0" step="1" inputmode="numeric" name="${name}" data-pd-f="${name}" placeholder="${name === 'min' ? 'Any' : 'Any'}" value="${v ?? ''}"></label>`;
    const tools = `<form class="pd-tools" method="get" action="${PREMIUM_PATH}#names" role="search" aria-label="Filter premium domains" data-pd-form>
      <label class="pd-f pd-f--q"><span>Search names</span><span class="pd-q">${icon('search')}<input class="hp-input" type="search" name="q" data-pd-f="q" value="${esc(f.q || '')}" placeholder="Keyword, e.g. cloud" autocomplete="off" spellcheck="false" maxlength="40"></span></label>
      ${sel('tld', 'Extension', [['', 'All extensions'], ...tlds.map((t): [string, string] => [t, t])], f.tld || '')}
      ${numIn('min', 'Min price (USD)', f.min)}${numIn('max', 'Max price (USD)', f.max)}
      ${sel('len', 'Length', Object.entries(LENGTHS) as [string, string][], f.len || '')}
      ${sel('cat', 'Category', [['', 'All categories'], ...cats.map((c): [string, string] => [c.slug, `${c.label} (${c.n})`])], f.cat || '')}
      ${sel('sort', 'Sort by', SORTS.map((k): [string, string] => [k, SORT_LABEL[k]]), f.sort || 'featured')}
      <div class="pd-tools__btns"><button class="hp-btn hp-btn--brand" type="submit" data-pd-apply>Apply</button>${filtered ? `<a class="hp-link" href="${PREMIUM_PATH}#names">Reset</a>` : ''}</div>
    </form>`;
    const lay = layoutFor(shown.length);
    const grid = shown.length
      ? `<div class="pd-results pd-results--${lay}" data-pd-results data-layout="${lay}">${shown.map((i) => card(i, { feature: lay === 'feature' })).join('')}</div>`
      : '';
    const none = `<div class="pd-none" data-pd-none${shown.length ? ' hidden' : ''} role="status"><h3>No names match these filters</h3><p>Try a wider price range or another extension, or ask our broker to find the name you have in mind.</p><div class="hp-actions"><a class="hp-btn hp-btn--ghost" href="${PREMIUM_PATH}#names" data-pd-reset>Clear filters</a>${link('Ask our broker', '/domain-broker')}</div></div>`;
    const feedNote = items.some((i) => i.source === 'dynadot')
      ? `<p class="pd-note">${icon('info')}<span>Marketplace listings are refreshed several times a day and can sell elsewhere; we confirm the name and price before we invoice you.${cfg.pricing.mode === 'fee' ? ` Their price includes our broker fee (${cfg.pricing.feePct}%, minimum ${fmtMoney(cfg.pricing.feeMin)}).` : ''}</span></p>` : '';
    body = `<section class="hp-section pd-sec" id="names" aria-labelledby="pd-names-h"><div class="hp-container">
      <div class="pd-head"><h2 id="pd-names-h" class="hp-hline">Premium domains for sale</h2><p class="pd-count" data-pd-count aria-live="polite"><b class="num">${shown.length}</b> ${shown.length === 1 ? 'name' : 'names'}${filtered ? ' match' : ''}</p></div>
      ${tools}${grid}${none}
      <nav class="pd-pager" data-pd-pager aria-label="Result pages" hidden></nav>
      ${feedNote}
      <p class="pd-prices">Prices in ${[...new Set(items.map((i) => i.currency))].join(' and ')}, one-time. Taxes, if any, are shown on the invoice.</p>
    </div></section>`;
  }

  const fq = faqs(cfg, b);
  const faqSec = `<section class="hp-section" aria-labelledby="pd-faq-h"><div class="hp-container pd-faq">${sectionHead({ id: 'pd-faq-h', title: 'Premium domain questions', align: 'left' })}${faq(fq, { id: 'pd-faq', single: true })}</div></section>`;
  const cta = ctaBand({ id: 'pd-cta', title: 'Prefer a name nobody owns yet?', text: 'Search hundreds of extensions with the first-year and renewal price shown upfront.', primary: { label: 'Search available domains', href: '/domains-registration' }, secondary: { label: 'Ask our broker', href: '/domain-broker' } });
  const list = items.length ? ld({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Premium domains for sale', url: `${site}${PREMIUM_PATH}`, numberOfItems: Math.min(items.length, 50),
    itemListElement: applyFilter(items, { sort: 'featured' }).slice(0, 50).map((i, n) => ({ '@type': 'ListItem', position: n + 1, item: offerLd(i, site) })) }) : '';
  if (await feedStale(cfg).catch(() => false)) { try { after(() => refreshFeed('page').then(() => undefined)); } catch { /* not in a request */ } }
  return page({
    ctx, catalog: cat, path: PREMIUM_PATH, title: ctx.route.title, description: ctx.route.description,
    css: ['pdm', 'premium', 'sell'], js: ['premium'], noindex: filtered, canonical: `${site}${PREMIUM_PATH}`,
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(fq), list],
    // "Sell your domain with us" (lib/theme/pages/sell.ts, customer listings via /account/sell)
    body: [hero, trustStrip(s), body, howSec(), sellBand(normalizeSell((s as any)[SELL_KEY])), brokerBand(b), faqSec, cta].join('\n'),
  });
}

/* ------------------------------------------------------------------ detail page */
async function detail(ctx: PageCtx, cat: Cat, items: PItem[], cfg: PremiumConfig, domain: string) {
  const s = cat.settings, site = siteOf(cat), b = brokerConfig(s);
  const i = items.find((x) => x.domain === domain);
  if (!i) return null;
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Premium domains', href: PREMIUM_PATH }, { label: i.domain }];
  const ref = (ctx.query.get('ref') || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 24);
  const err = (ctx.query.get('error') || '').slice(0, 200);
  const wa = waLink(s, `Hello GlobalHostia, I am interested in the premium domain ${i.domain}.`);
  const offerOnly = i.price === null;
  const kind = /^[a-z]+$/.test(i.sld) ? 'Letters only' : /^[0-9]+$/.test(i.sld) ? 'Numbers only' : i.sld.includes('-') ? 'Contains a hyphen' : 'Letters and numbers';
  const facts: [string, string][] = [['Extension', i.tld], ['Length', `${i.len} ${i.len === 1 ? 'character' : 'characters'}`], ['Characters', kind], ['Listing', sourceLabel(i)], ['Status', i.status === 'under_offer' ? 'Under offer: still accepting offers' : 'Available']];
  const breakdown = i.base !== undefined && i.fee !== undefined
    ? `<dl class="pd-bd"><div><dt>Marketplace price</dt><dd class="num">${esc(fmtMoney(i.base))}</dd></div><div><dt>Broker fee</dt><dd class="num">${esc(fmtMoney(i.fee))}</dd></div><div class="pd-bd__t"><dt>You pay</dt><dd class="num">${esc(fmtMoney(i.price!))}</dd></div></dl>` : '';

  const buy = `<aside class="pd-buy" aria-labelledby="pd-buy-h">
    <p class="pd-buy__k">${i.featured ? `${icon('star')}Featured premium domain` : `${icon('star')}Premium domain`}</p>
    <h2 id="pd-buy-h" class="pd-buy__price num">${esc(priceText(i))}</h2>
    <p class="pd-buy__sub">${offerOnly ? 'The owner is open to offers.' : 'One-time price. Renews at the standard rate for the extension.'}${i.minOffer && !offerOnly ? ` Offers from ${esc(fmtMoney(i.minOffer, i.currency))} considered.` : ''}</p>
    ${breakdown}
    <div class="pd-buy__acts">
      ${offerOnly ? '' : `<a class="hp-btn hp-btn--brand hp-btn--lg" href="#request" data-pd-intent="buy">${icon('cart')}<span>Buy now</span></a>`}
      <a class="hp-btn ${offerOnly ? 'hp-btn--brand' : 'hp-btn--ghost'} hp-btn--lg" href="#request" data-pd-intent="offer">${icon('chat')}<span>Make an offer</span></a>
    </div>
    <ul class="pd-buy__ticks"><li>${icon('check')}No payment on this page</li><li>${icon('check')}Secure invoice from our client area</li><li>${icon('check')}Transfer handled for you</li></ul>
  </aside>`;
  const hero = `<section class="pd-hero" aria-labelledby="pd-h"><div class="hp-container">
    <nav class="pd-crumbs" aria-label="Breadcrumb"><ol>${crumbs.map((c, n) => `<li>${c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : `<span aria-current="page">${esc(c.label)}</span>`}${n < crumbs.length - 1 ? icon('right') : ''}</li>`).join('')}</ol></nav>
    <div class="pd-hero__grid">
      <div class="pd-hero__t">
        <p class="pd-hero__k">${esc(sourceLabel(i))}</p>
        <h1 id="pd-h" class="pd-hero__h">${domainHtml(i)}<span class="sr-only"> is for sale</span></h1>
        ${i.description ? `<p class="pd-hero__lead">${esc(i.description)}</p>` : `<p class="pd-hero__lead">A ${i.len}-character ${esc(i.tld)} name. Own it outright: point it at your website and email the day it reaches your account.</p>`}
        ${i.tags.length ? `<ul class="pd-tags" aria-label="Tags">${i.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <dl class="pd-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>
      ${buy}
    </div>
  </div></section>`;

  const tok = (() => { try { return formToken(i.domain); } catch { return ''; } })();
  const form = `<form class="pd-form" action="/api/premium-request" method="post" data-pd-req novalidate aria-labelledby="pd-form-h">
    <h2 id="pd-form-h">Request ${esc(i.domain)}</h2>
    <p class="pd-form__lead">Your broker replies within one business day. Fields marked <span aria-hidden="true">*</span><span class="sr-only">with an asterisk</span> are required. Nothing is charged by sending this form.</p>
    ${err ? `<p class="pd-alert" role="alert">${icon('alert')}${esc(err)}</p>` : '<p class="pd-alert" role="alert" data-pd-alert hidden></p>'}
    <fieldset class="pd-intent"><legend>What would you like to do?</legend>
      ${offerOnly ? '' : `<label><input type="radio" name="intent" value="buy" checked data-pd-radio><span><b>Buy at ${esc(priceText(i))}</b><small>We confirm and send the invoice</small></span></label>`}
      <label><input type="radio" name="intent" value="offer"${offerOnly ? ' checked' : ''} data-pd-radio><span><b>Make an offer</b><small>${i.minOffer ? `From ${esc(fmtMoney(i.minOffer, i.currency))}` : 'Name your price'}</small></span></label>
    </fieldset>
    <div class="pd-grid">
      <div class="pd-field" data-field="offer"${offerOnly ? '' : ' hidden'} data-pd-offer><label for="pd-offer">Your offer (${esc(i.currency)}) <span aria-hidden="true">*</span></label><input class="hp-input" id="pd-offer" name="offer" type="text" inputmode="decimal" autocomplete="off" maxlength="14" placeholder="${i.minOffer ? esc(String(i.minOffer)) : '1,000'}" aria-describedby="pd-offer-err"><p class="pd-err" id="pd-offer-err" hidden></p></div>
      <div class="pd-field"><label for="pd-name">Your name <span aria-hidden="true">*</span></label><input class="hp-input" id="pd-name" name="name" autocomplete="name" required minlength="2" maxlength="80" aria-describedby="pd-name-err"><p class="pd-err" id="pd-name-err" hidden></p></div>
      <div class="pd-field"><label for="pd-email">Email <span aria-hidden="true">*</span></label><input class="hp-input" id="pd-email" name="email" type="email" autocomplete="email" required maxlength="120" aria-describedby="pd-email-err"><p class="pd-err" id="pd-email-err" hidden></p></div>
      <div class="pd-field"><label for="pd-phone">WhatsApp number <span class="pd-opt">optional</span></label><input class="hp-input" id="pd-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+971 50 000 0000" aria-describedby="pd-phone-err"><p class="pd-err" id="pd-phone-err" hidden></p></div>
      <div class="pd-field pd-field--wide"><label for="pd-notes">Message <span class="pd-opt">optional</span></label><textarea class="hp-input" id="pd-notes" name="notes" rows="3" maxlength="1500" placeholder="For example: how you plan to use the name, or a deadline." aria-describedby="pd-notes-hint"></textarea><p class="pd-hint" id="pd-notes-hint">Please do not include passwords or payment details.</p></div>
      <div class="pd-field pd-field--wide"><label class="pd-consent"><input type="checkbox" name="consent" value="yes" required aria-describedby="pd-consent-err"><span>I agree that GlobalHostia contacts me about this domain by email${wa ? ' or WhatsApp' : ''}, and I understand the sale is confirmed only once I pay the invoice.</span></label><p class="pd-err" id="pd-consent-err" hidden></p></div>
    </div>
    <div class="pd-hp" aria-hidden="true"><label for="pd-cu">Leave this empty</label><input id="pd-cu" name="company_url" type="text" tabindex="-1" autocomplete="off"></div>
    <input type="hidden" name="domain" value="${esc(i.domain)}"><input type="hidden" name="tk" value="${esc(tok)}"><input type="hidden" name="t" value="" data-pd-t>
    <div class="pd-submit"><button class="hp-btn hp-btn--brand hp-btn--lg" type="submit" data-pd-btn>${icon('arrow')}<span>Send request</span></button>${wa ? `<a class="hp-link" href="${esc(wa)}">Ask on WhatsApp${icon('whatsapp')}</a>` : ''}</div>
  </form>`;
  const done = `<div class="pd-done" data-pd-done${ref ? '' : ' hidden'} tabindex="-1" role="status">${hexIcon('check')}<h2>Request received</h2>
    <p data-pd-refline${ref ? '' : ' hidden'}>Your reference is <b class="num" data-pd-ref>${esc(ref)}</b>. Your broker will confirm ${esc(i.domain)} and the price within one business day, then send a secure invoice.</p>
    <div class="hp-actions">${link('Browse more premium domains', PREMIUM_PATH)}${link('Search available domains', '/domains-registration')}</div></div>`;
  const reqSec = `<section class="hp-section pd-sec" id="request" aria-label="Purchase request"><div class="hp-container pd-reqwrap"><div class="pd-card-form">${ref ? '' : form}${done}</div>
    <aside class="pd-side" aria-labelledby="pd-side-h"><h2 id="pd-side-h">What happens next</h2><ol class="pd-next">${STEPS.map((x, n) => `<li><span class="num" aria-hidden="true">${n + 1}</span><div><b>${esc(x.h)}</b><span>${esc(x.p)}</span></div></li>`).join('')}</ol></aside>
  </div></section>`;

  const similar = applyFilter(items.filter((x) => x.domain !== i.domain && (x.tld === i.tld || Math.abs(x.len - i.len) <= 2)), { sort: 'featured' }).slice(0, 4);
  const more = similar.length ? `<section class="hp-section hp-section--tint" aria-labelledby="pd-more-h"><div class="hp-container"><div class="pd-head"><h2 id="pd-more-h" class="hp-hline">Similar premium names</h2>${link('See all', PREMIUM_PATH)}</div><div class="pd-results pd-results--grid">${similar.map((x) => card(x)).join('')}</div></div></section>` : '';
  const fq = faqs(cfg, b).slice(1, 5);
  const faqSec = `<section class="hp-section" aria-labelledby="pd-faq-h"><div class="hp-container pd-faq">${sectionHead({ id: 'pd-faq-h', title: 'Buying this domain', align: 'left' })}${faq(fq, { id: 'pd-faq', single: true })}</div></section>`;
  const product = ld({ '@context': 'https://schema.org', ...offerLd(i, site) });
  return page({
    ctx, catalog: cat, path: itemHref(i), title: `${i.domain} is for sale`,
    description: `${i.domain} premium domain for sale${i.price !== null ? ` at ${fmtMoney(i.price, i.currency)}` : ', offers welcome'}. Request it, we confirm, you pay a secure invoice and we transfer it to your account.`,
    css: ['pdm', 'premium'], js: ['premium'], noindex: !!(ref || err), canonical: `${site}${itemHref(i)}`, ogKicker: 'Premium domain',
    jsonLd: [breadcrumbJsonLd(crumbs, site), faqJsonLd(fq), product],
    body: [hero, reqSec, howSec(), more, brokerBand(b, i.domain), faqSec].join('\n'),
  });
}

export default async function render(ctx: PageCtx): Promise<string | null> {
  const [cat, items, cfg] = await Promise.all([getCatalog(), premiumItems(), premiumConfig()]);
  const seg = ctx.slug.split('/')[1];
  if (seg !== undefined) {
    const d = cleanDomain(decodeURIComponent(seg));
    return d && cfg.enabled ? detail(ctx, cat, items, cfg, d) : null;
  }
  return listing(ctx, cat, cfg.enabled ? items : [], cfg);
}
