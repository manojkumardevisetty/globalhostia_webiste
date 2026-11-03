// Ad landing pages /lp/<slug> (Admin → Marketing → Landing pages). Distraction-free document: minimal header
// (logo + WhatsApp), hero with the live price from the DB, one call to action (the WHMCS order link with the
// visitor's currency, or a domain search for TLD pages), real catalog facts only (no reviews), optional lead form,
// trust strip, FAQ and a sticky mobile CTA. Styles: /hp/pages/lp.css (+ theme.css tokens, /hp/lead.css).
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db';
import { esc } from '../../render/util';
import { money, CYCLE_MONTHS } from '../../pricing';
import { getCatalog, productsFor, productBySlug, categoryBySlug, fromPrice, orderUrl, deriveSpecs, pricedTlds, domainCartUrl, type Catalog, type TProduct, type TTld } from '../data';
import { icon, iconSprite, featureList, ld, faqJsonLd, available } from '../ui';
import { trustStrip, waLink } from '../growth';
import { leadForm } from '../lead';
import { withCurrency } from '../shell';
import { trackingHead, consentLink } from '../../tracking';
import { ROBOTS_INDEX, ROBOTS_NOINDEX, ICON_LINKS, seoTitle, seoDescription, verificationMeta } from '../../seo';
import type { LandingPage } from '../../schema';

const ASSET_V = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 8);
const asset = (p: string) => `${p}?v=${ASSET_V}`;
const UNIT: Record<string, string> = { monthly: '/ month', quarterly: '/ quarter', semiannually: '/ 6 months', annually: '/ year', biennially: '/ 2 years', triennially: '/ 3 years', onetime: 'one-time' };

export type Resolved =
  | { kind: 'product'; product: TProduct; pool: TProduct[]; label: string; price: { amount: string; unit: string; prefix: string; price: number } | null; orderHref: string }
  | { kind: 'tld'; tld: string; row: TTld | null; label: string; price: { amount: string; unit: string; prefix: string; price: number } | null; orderHref: string }
  | { kind: 'none'; label: string; reason: string };

/** What the page features, resolved against the live catalog (also used by the admin editor for warnings). */
export function resolveTarget(cat: Catalog, lp: Pick<LandingPage, 'target' | 'productSlug'>): Resolved {
  const [kind, ref] = [lp.target.slice(0, lp.target.indexOf(':')), lp.target.slice(lp.target.indexOf(':') + 1)];
  if (kind === 'tld') {
    const tld = ref.startsWith('.') ? ref : '.' + ref;
    const row = pricedTlds(cat).find((t) => t.tld === tld) || null;
    const prefix = row ? currencyPrefix(cat) : '';
    return { kind: 'tld', tld, row, label: `${tld} domain`, orderHref: domainCartUrl(cat.base),
      price: row?.register != null ? { amount: money(row.register, prefix), unit: '/ year', prefix, price: row.register } : null };
  }
  let pool: TProduct[] = [];
  let label = '';
  if (kind === 'cat') { pool = productsFor(cat, [ref]); label = categoryBySlug(cat, ref)?.name || ref; }
  else if (kind === 'p') { const p = productBySlug(cat, ref); pool = p ? [p] : []; label = p?.name || ref; }
  if (!pool.length) return { kind: 'none', label, reason: kind === 'cat' ? 'This category has no published plans right now.' : 'This plan is not published (or was retired in WHMCS).' };
  const pinned = lp.productSlug ? pool.find((p) => p.slug === lp.productSlug) : undefined;
  const priced = available(pool).filter((p) => fromPrice(p, cat.currency));
  const per = (p: TProduct) => fromPrice(p, cat.currency)?.amount ?? 1e9;
  const product = pinned || [...priced].sort((a, b) => per(a) - per(b))[0] || pool[0];
  const f = fromPrice(product, cat.currency);
  return {
    kind: 'product', product, pool, label,
    price: f ? { amount: money(f.price, f.prefix), unit: UNIT[f.cycle] || '', prefix: f.prefix, price: f.price } : null,
    orderHref: orderUrl(product, cat.base, f?.cycle),
  };
}

function currencyPrefix(cat: Catalog) {
  for (const p of cat.products) { const r = p.prices.find((x) => x.currency === cat.currency && x.prefix); if (r) return r.prefix; }
  return cat.currency === 'USD' ? '$' : cat.currency + ' ';
}

/** Facts derived from the catalog and settings only (no reviews, no invented numbers). */
function proofFacts(cat: Catalog, r: Resolved): { big: string; label: string }[] {
  const out: { big: string; label: string }[] = [];
  if (r.kind === 'product') {
    const locs = [...new Set(r.pool.map((p) => deriveSpecs(p.features, p.attributes).location).filter(Boolean))];
    if (r.pool.length > 1) out.push({ big: String(r.pool.length), label: `${r.label} plans to choose from` });
    if (locs.length) out.push({ big: String(locs.length), label: `datacenter location${locs.length > 1 ? 's' : ''}: ${locs.slice(0, 4).join(', ')}${locs.length > 4 ? '…' : ''}` });
    const cycles = new Set(r.product.prices.filter((x) => x.currency === cat.currency).map((x) => x.cycle).filter((c) => CYCLE_MONTHS[c]));
    if (cycles.size > 1) out.push({ big: String(cycles.size), label: 'billing periods, from monthly to multi-year' });
  }
  if (r.kind === 'tld') {
    const n = pricedTlds(cat).length;
    if (n > 1) out.push({ big: String(n), label: 'domain extensions with live prices' });
  }
  out.push({ big: 'Live', label: 'prices straight from our billing system' });
  out.push({ big: 'UAE', label: `${String(cat.settings.company || 'Desert Tech Cloud Services LLC')}, Dubai` });
  return out.slice(0, 4);
}

function notFound(cat: Catalog) {
  const name = esc(String(cat.settings.site_name || 'GlobalHostia'));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | ${name}</title><meta name="robots" content="noindex,follow">
<link rel="stylesheet" href="${asset('/hp/theme.css')}"><link rel="stylesheet" href="${asset('/hp/pages/lp.css')}"></head>
<body class="lp"><main id="main" class="lp-404"><div class="hp-container"><img src="/image/logo-main-black.png" alt="${name}" width="178" height="34"><h1>This offer is no longer available</h1><p>Our current plans and prices are on the main website.</p><a class="hp-btn hp-btn--brand" href="/">Go to ${name}</a></div></main></body></html>`;
}

export async function renderLanding(slug: string, o: { path: string; preview: boolean; query: URLSearchParams }): Promise<{ status: number; body: string; cache: boolean }> {
  const cat = await getCatalog();
  let lp: LandingPage | undefined;
  try { [lp] = await db.select().from(schema.landingPages).where(eq(schema.landingPages.slug, slug)).limit(1); } catch { lp = undefined; }
  if (!lp || (lp.status !== 'PUBLISHED' && !o.preview)) return { status: 404, body: notFound(cat), cache: false };

  const s = cat.settings;
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const siteName = String(s.site_name || 'GlobalHostia');
  const r = resolveTarget(cat, lp);
  const canonical = `${site}/lp/${lp.slug}`;
  const noindex = lp.noindex || o.preview || lp.status !== 'PUBLISHED';
  const wa = waLink(s, `Hello ${siteName}, I saw your offer "${lp.headline}" (${canonical}) and have a question.`);
  const cta = esc(lp.ctaLabel || 'Order now');
  const title = lp.seoTitle || lp.headline;
  const description = seoDescription(lp.seoDescription || lp.subheadline);
  const eyebrow = r.kind === 'product' ? r.label : r.kind === 'tld' ? `${r.tld} domains` : r.label;
  const priceLine = (cls = '') => r.kind !== 'none' && r.price
    ? `<p class="lp-price ${cls}"><span class="lp-price__from">${r.kind === 'product' && r.pool.length > 1 && !lp.productSlug ? 'From' : r.kind === 'tld' ? 'Register for' : 'Only'}</span> <b class="num">${esc(r.price.amount)}</b> <span class="lp-price__unit">${esc(r.price.unit)}</span></p>`
    : `<p class="lp-price ${cls}"><b>See price</b> <span class="lp-price__unit">confirmed live in the order form</span></p>`;

  // the single call to action
  let offer = '';
  let ctaHref = '';
  if (r.kind === 'product') {
    ctaHref = r.orderHref;
    const sp = deriveSpecs(r.product.features, r.product.attributes);
    const specs = [sp.cpu, sp.ram, sp.storage, sp.bandwidth, sp.location].filter(Boolean).slice(0, 4);
    offer = `<div class="lp-offer" aria-labelledby="lp-offer-h">
      <p class="lp-offer__k">${esc(r.label)}</p>
      <h2 id="lp-offer-h" class="lp-offer__h">${esc(r.product.name)}</h2>
      ${r.product.tagline ? `<p class="lp-offer__tag">${esc(r.product.tagline)}</p>` : ''}
      ${priceLine('lp-price--big')}
      ${r.price ? `<p class="lp-offer__renew num">Renews at ${esc(r.price.amount)} ${esc(r.price.unit)} · +VAT 5% where applicable</p>` : ''}
      ${specs.length ? `<ul class="lp-specs">${specs.map((x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul>` : ''}
      <a class="hp-btn hp-btn--brand hp-btn--lg hp-btn--block lp-cta" href="${esc(ctaHref)}" data-lp-cta>${cta}${icon('arrow')}</a>
      <p class="lp-offer__note">Secure checkout in our billing portal. You can change the billing period before you pay.</p>
    </div>`;
  } else if (r.kind === 'tld') {
    const curId = cat.currencyIds?.[cat.currency];
    const curField = curId && cat.currency !== (s.currency || 'USD') ? `<input type="hidden" name="currency" value="${curId}">` : '';
    offer = `<div class="lp-offer" aria-labelledby="lp-offer-h">
      <p class="lp-offer__k">Domain registration</p>
      <h2 id="lp-offer-h" class="lp-offer__h">Find your ${esc(r.tld)} domain</h2>
      ${priceLine('lp-price--big')}
      ${r.row?.renew != null ? `<p class="lp-offer__renew num">Renews at ${esc(money(r.row.renew, r.price?.prefix || ''))} / year · +VAT 5% where applicable</p>` : ''}
      <form class="lp-dsearch" action="${esc(cat.base)}/cart.php" method="get" role="search" data-lp-domain data-tld="${esc(r.tld)}">
        <input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="register">${curField}
        <label for="lp-dq" class="sr-only">Domain name to search</label>
        <div class="lp-dsearch__box"><input id="lp-dq" name="query" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="yourbusiness" required maxlength="63"><span class="lp-dsearch__tld" aria-hidden="true">${esc(r.tld)}</span></div>
        <button type="submit" class="hp-btn hp-btn--brand hp-btn--lg hp-btn--block lp-cta">${cta}${icon('search')}</button>
      </form>
      <p class="lp-offer__note">Availability is checked live in our billing portal.</p>
    </div>`;
    ctaHref = '#lp-dq';
  } else {
    offer = `<div class="lp-offer"><p class="lp-offer__k">${esc(r.label)}</p><h2 class="lp-offer__h">Talk to our team</h2><p class="lp-offer__tag">${esc(r.reason)}</p>${wa ? `<a class="hp-btn hp-btn--brand hp-btn--lg hp-btn--block" href="${esc(wa)}" target="_blank" rel="noopener">${icon('whatsapp')}Ask on WhatsApp</a>` : `<a class="hp-btn hp-btn--brand hp-btn--lg hp-btn--block" href="/contact">Contact us</a>`}</div>`;
    ctaHref = wa || '/contact';
  }

  const benefits = lp.benefits || [];
  const hero = `<section class="lp-hero" aria-labelledby="lp-h1"><div class="hp-container lp-hero__in">
    <div class="lp-hero__txt">
      <p class="lp-eyebrow"><i aria-hidden="true"></i>${esc(eyebrow)}</p>
      <h1 id="lp-h1">${esc(lp.headline)}</h1>
      ${lp.subheadline ? `<p class="lp-sub">${esc(lp.subheadline)}</p>` : ''}
      ${benefits.length ? `<ul class="lp-bul">${benefits.slice(0, 4).map((b) => `<li>${icon('check')}<span>${esc(b)}</span></li>`).join('')}</ul>` : ''}
    </div>
    ${offer}
  </div></section>`;

  const included = r.kind === 'product' && r.product.features.length ? `<section class="lp-sec" aria-labelledby="lp-inc-h"><div class="hp-container lp-two">
    <div><h2 id="lp-inc-h" class="lp-h2">What is included in ${esc(r.product.name)}</h2><p class="lp-lead">Taken from the plan in our catalog. The order form shows every option before you pay.</p>${benefits.length > 4 ? `<ul class="lp-bul lp-bul--ink">${benefits.slice(4).map((b) => `<li>${icon('check')}<span>${esc(b)}</span></li>`).join('')}</ul>` : ''}</div>
    <div class="lp-card">${featureList(r.product.features, 8)}</div>
  </div></section>` : benefits.length > 4 ? `<section class="lp-sec"><div class="hp-container"><ul class="lp-bul lp-bul--ink lp-bul--grid">${benefits.slice(4).map((b) => `<li>${icon('check')}<span>${esc(b)}</span></li>`).join('')}</ul></div></section>` : '';

  const facts = proofFacts(cat, r);
  const proof = `<section class="lp-proof" aria-label="About this offer"><div class="hp-container"><ul class="lp-facts" style="--n:${facts.length}">${facts.map((f) => `<li><b class="num">${esc(f.big)}</b><span>${esc(f.label)}</span></li>`).join('')}</ul></div></section>`;

  const trust = lp.showTrust ? trustStrip(s, { tone: 'tint' }) : '';
  const lead = lp.showLeadForm ? `<section class="lp-sec lp-lead-sec" aria-labelledby="lp-lead-h"><div class="hp-container lp-narrow">
    ${leadForm({ source: `landing:${lp.slug}`, page: `/lp/${lp.slug}`, title: 'Not ready yet? Get the details by email', text: 'Leave your email (and WhatsApp if you prefer) and our team will send you the details of this offer. No spam.', cta: 'Send me the details', interest: r.kind === 'product' ? `${r.product.name} (${lp.slug})` : r.kind === 'tld' ? `${r.tld} domain (${lp.slug})` : lp.slug, cls: 'gh-lead--wide lp-leadbox', done: o.query.get('lead') === 'ok' })}
  </div></section>` : '';
  const faqs = (lp.faq || []).filter((f) => f.q && f.a);
  const faqSec = faqs.length ? `<section class="lp-sec" aria-labelledby="lp-faq-h"><div class="hp-container lp-narrow"><h2 id="lp-faq-h" class="lp-h2">Questions</h2>
    <div class="lp-faq">${faqs.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}${icon('plus')}</summary><p>${esc(f.a)}</p></details>`).join('')}</div></div></section>` : '';

  const sticky = `<div class="lp-sticky" data-lp-sticky><div class="lp-sticky__in">${r.kind !== 'none' && r.price ? `<p class="num"><b>${esc(r.price.amount)}</b> <span>${esc(r.price.unit)}</span></p>` : `<p><b>${esc(r.label)}</b></p>`}<a class="hp-btn hp-btn--brand" href="${esc(ctaHref)}"${r.kind === 'tld' ? ' data-lp-focus' : ''}>${cta}</a></div></div>`;

  const productLd = r.kind === 'product' && r.price ? ld({ '@context': 'https://schema.org', '@type': 'Product', name: r.product.name, sku: r.product.whmcsPid ? String(r.product.whmcsPid) : r.product.slug, brand: { '@type': 'Brand', name: siteName }, category: r.label, url: canonical,
    offers: { '@type': 'Offer', price: r.price.price.toFixed(2), priceCurrency: cat.currency, availability: 'https://schema.org/InStock', url: r.orderHref } }) : '';
  const year = new Date().getFullYear();
  const company = String(s.company || 'Desert Tech Cloud Services LLC');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(seoTitle(title, siteName))}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(siteName)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${esc(site)}/og/default.png">
${verificationMeta(s)}
${trackingHead(s.tracking)}
<meta name="theme-color" content="#16212b">
${ICON_LINKS}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${asset('/hp/theme.css')}">
<link rel="stylesheet" href="${asset('/hp/lead.css')}">
<link rel="stylesheet" href="${asset('/hp/pages/lp.css')}">
${productLd}
${faqs.length ? faqJsonLd(faqs) : ''}
</head>
<body class="lp">
${iconSprite()}
<a class="hp-skip" href="#main">Skip to content</a>
<header class="lp-top"><div class="hp-container lp-top__in">
  <img src="/image/logo-main-black.png" alt="${esc(siteName)}" width="178" height="34">
  ${wa ? `<a class="lp-wa" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp (opens in a new tab)">${icon('whatsapp')}<span>WhatsApp us</span></a>` : ''}
</div></header>
<main id="main" tabindex="-1">
${hero}
${proof}
${included}
${trust}
${lead}
${faqSec}
</main>
<footer class="lp-foot"><div class="hp-container"><p>© ${year} ${esc(siteName)} · ${esc(company)}, Dubai, UAE · <a href="/terms-conditions">Terms</a> · <a href="/privacy-policy">Privacy</a>${consentLink(s.tracking)}</p><p class="lp-foot__live">Prices shown live from our billing system in ${esc(cat.currency)}.</p></div></footer>
${sticky}
${o.preview && lp.status !== 'PUBLISHED' ? `<p class="lp-preview" role="status">Preview · ${esc(lp.status.toLowerCase())}, not public yet</p>` : ''}
<script>(function(){var f=document.querySelector("[data-lp-domain]");if(f)f.addEventListener("submit",function(){var i=f.querySelector("[name=query]"),t=f.getAttribute("data-tld"),v=i.value.trim().toLowerCase().replace(/^https?:\\/\\//,"").replace(/^www\\./,"").replace(/\\/.*$/,"");if(v&&v.indexOf(".")<0)v+=t;i.value=v;if(window.GH&&GH.track)GH.track("add_to_cart",{item_name:v,items:[{item_id:t,item_name:v}]})});var s=document.querySelector("[data-lp-sticky]"),h=document.querySelector(".lp-offer");if(s&&h&&"IntersectionObserver"in window){new IntersectionObserver(function(e){s.classList.toggle("is-on",!e[e.length-1].isIntersecting)}).observe(h)}else if(s)s.classList.add("is-on");document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("[data-lp-focus]");if(a){e.preventDefault();var q=document.getElementById("lp-dq");if(q){q.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});q.focus({preventScroll:true})}}})})()</script>
<script src="${asset('/hp/track.js')}" defer></script>
</body>
</html>`;
  return { status: 200, body: withCurrency(html, cat), cache: !o.preview && lp.status === 'PUBLISHED' };
}
