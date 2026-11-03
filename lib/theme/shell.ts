// Full HTML document for a theme page: head/meta, utility bar, header + mega menus, drawer, main, footer.
import { esc } from '../render/util';
import { money } from '../pricing';
import type { PageCtx } from './index';
import { getCatalog, whmcsLinks, availableCurrencies, productsFor, type Catalog } from './data';
import { itemListLd, offerCatalogLd } from '../agents/ld';
import { mdPath } from '../agents/markdown';
import { CURRENCY_LABEL } from '../currency';
import { getMenu, footerColumns, type ThemeMenu } from './menu';
import { icon, iconSprite, hexIcon } from './ui';
import { preloadImage } from './img';
import { activeFor, barHtml, promoDataScript, hasPromo } from '../promo';
import { normalize as mobileHeroCfg } from '../mobile-hero';
import { waFloat } from './growth';
import { leadForm } from './lead';
import { trackingHead, consentLink } from '../tracking';
import { ROBOTS_INDEX, ROBOTS_NOINDEX, NOINDEX_SLUGS, ICON_LINKS, seoTitle, seoDescription, ogImageUrl, siteJsonLd, verificationMeta, blogListingDescription } from '../seo';

export type PageOpts = {
  title: string; description: string; path: string; body: string; ctx: PageCtx;
  css?: string[]; js?: string[]; jsonLd?: string | string[]; bodyClass?: string; ogImage?: string;
  /** LCP image(s): a URL (full-width, sizes 100vw) or { src, sizes } matching the page's <picture> */
  preload?: (string | { src: string; sizes: string; media?: string })[];
  catalog?: Catalog; noindex?: boolean;
  /** absolute canonical URL override (defaults to site_url + path) */
  canonical?: string;
  /** og:type (default "website") */
  ogType?: string;
  /** trusted extra <head> markup (e.g. article:published_time meta) */
  headExtra?: string;
  /** small label above the title on the generated OG image (e.g. product category) */
  ogKicker?: string;
  /** false: no website pre-sales chat (signed-in account pages use the customer assistant instead) */
  aiChat?: boolean;
};

const ASSET_V = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 8);
/** HP_MIN is set by next.config.mjs when scripts/build-assets.mjs wrote the minified copies (*.min.js|css). */
const MIN = process.env.HP_MIN === '1';
/** Versioned URL of a theme asset; the minified copy in production builds. */
export const asset = (p: string) => `${MIN && /^\/hp\/.*\.(js|css)$/.test(p) ? p.replace(/\.(js|css)$/, '.min.$1') : p}?v=${ASSET_V}`;
/** Self-hosted fonts (public/hp/fonts, @font-face in theme.css): preload the two used above the fold. */
export const FONT_PRELOADS = ['inter-latin-400-normal', 'manrope-latin-800-normal']
  .map((f) => `<link rel="preload" as="font" type="font/woff2" href="/hp/fonts/${f}.woff2" crossorigin>`).join('');
/** WebMCP (in-browser agents): load the tool registrations only where the browser exposes modelContext; nothing loads elsewhere. */
const WEBMCP_LOADER = `<script>if(document.modelContext||navigator.modelContext){var w=document.createElement("script");w.src="${asset('/hp/webmcp.js')}";w.defer=true;document.head.appendChild(w)}</script>`;
const safeKey = (k: string) => k.replace(/[^a-z0-9_-]/gi, '');
/** Website AI assistant (public/hp/ai-chat.js, lib/ai/*): CSS + JS load only after the page has loaded and the browser is
 *  idle, so they never compete with first paint. Switched off in Admin > AI assistant (settings.ai_chat_public.enabled), and absent without ANTHROPIC_API_KEY. */
function aiChatLoader(s: Record<string, any>, currency: string) {
  const pub = s.ai_chat_public && typeof s.ai_chat_public === 'object' ? s.ai_chat_public : {};
  if (pub.enabled === false) return '';
  // nothing loads until the owner has added ANTHROPIC_API_KEY (Vercel env + redeploy): no button that can only say "offline"
  if (!process.env.ANTHROPIC_API_KEY?.trim() && process.env.AI_MOCK !== '1') return '';
  const cfg = JSON.stringify({ cur: currency }).replace(/</g, '\\u003c');
  return `<script>window.GH_AI=${cfg};addEventListener("load",function(){var go=function(){var l=document.createElement("link");l.rel="stylesheet";l.href="${asset('/hp/ai-chat.css')}";document.head.appendChild(l);var j=document.createElement("script");j.src="${asset('/hp/ai-chat.js')}";j.defer=true;document.head.appendChild(j)};"requestIdleCallback"in window?requestIdleCallback(go,{timeout:5000}):setTimeout(go,3000)})</script>`;
}
/** Logo: 2x WebP (scripts/build-assets.mjs) with the original PNG as fallback. */
const logo = (tone: 'black' | 'white', w: number, h: number, lazy = false) =>
  `<picture><source type="image/webp" srcset="/hp/img/opt/logo-main-${tone}-356.webp"><img src="/image/logo-main-${tone}.png" alt="Globalhostia" width="${w}" height="${h}"${lazy ? ' loading="lazy"' : ''}></picture>`;
const telHref = (p: string) => 'tel:' + String(p).replace(/[^\d+]/g, '');

function megaPanel(m: ThemeMenu) {
  const f = m.featured;
  const links = m.groups.map((g) => `<div class="hp-mega__group"><h3${g.title ? '' : ' aria-hidden="true"'}>${esc(g.title || '\u00a0')}</h3>${g.items.map((i) =>
    `<a class="hp-mega-link" href="${esc(i.href)}">${hexIcon(i.icon)}<div><strong>${esc(i.label)}${i.soon ? '<em class="hp-soon">Soon</em>' : ''}</strong>${i.desc ? `<span>${esc(i.desc)}</span>` : ''}</div></a>`).join('')}</div>`).join('');
  const feat = f ? `<div class="hp-mega-feat">${f.tag ? `<span class="hp-tag">${esc(f.tag)}</span>` : ''}<h4>${esc(f.title)}</h4>${f.big ? `<div class="hp-big num"><span class="sr-only">From </span>${esc(f.big.amount)}${f.big.unit ? `<small>${esc(f.big.unit)}</small>` : ''}</div>` : ''}${f.text ? `<p>${esc(f.text)}</p>` : ''}${f.list?.length ? `<ul class="hp-tl num">${f.list.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('')}</ul>` : ''}${f.link ? `<a class="hp-link" href="${esc(f.link.href)}">${esc(f.link.label)}${icon('arrow')}</a>` : ''}</div>` : '';
  return `<div class="hp-mega" id="m-${esc(m.id)}" data-panel><div class="hp-mega__panel"${f ? '' : ' style="grid-template-columns:1fr"'}><div class="hp-mega__cols">${links}</div>${feat}</div></div>`;
}

/** Phone header icons (up to 767px, theme.css): deals, help, account, cart. The cart count comes from the gh_cart cookie
 *  that /hp/whmcs.js sets on .globalhostia.com while the visitor uses the WHMCS cart (theme.js shows it). */
function phoneIcons(cat: Catalog, L: ReturnType<typeof whmcsLinks>) {
  const m = mobileHeroCfg(cat.settings.mobile_hero);
  const a = (href: string, label: string, ic: string, extra = '') => `<a class="hp-micon" href="${esc(href)}" aria-label="${esc(label)}">${icon(ic)}${extra}</a>`;
  return `<div class="hp-micons">${a(m.dealsHref, 'Deals and domain prices', 'tag')}${a(m.helpHref, 'Help center', 'help')}${a('/account', 'Your account', 'user')}${a(`${L.cart}?a=view`, 'Cart', 'cart', '<span class="hp-cartn" data-cart-count hidden></span>')}</div>`;
}

function header(menus: ThemeMenu[], L: ReturnType<typeof whmcsLinks>, cat: Catalog) {
  return `<header class="hp-header">
  <div class="hp-container hp-header__inner">
    <a class="hp-brand" href="/" aria-label="Globalhostia home">${logo('black', 178, 34)}<img class="hp-brand__mark" src="/icon-192.png" alt="" width="36" height="36" loading="lazy"></a>
    <nav class="hp-nav" aria-label="Main">${menus.map((m) => `<button type="button" class="hp-nav__btn" aria-expanded="false" aria-controls="m-${esc(m.id)}" data-menu="m-${esc(m.id)}">${esc(m.label)}${icon('chev')}</button>`).join('')}</nav>
    <div class="hp-header__actions">
      <a class="hp-btn hp-btn--ghost" href="/account">Client login</a>
      <a class="hp-btn hp-btn--brand" href="${esc(L.register)}">Sign up</a>
      <button type="button" class="hp-burger" aria-expanded="false" aria-controls="hp-drawer" aria-label="Open menu">${icon('menu')}</button>
    </div>
    ${phoneIcons(cat, L)}
  </div>
  ${menus.map(megaPanel).join('\n  ')}
</header>`;
}

function drawer(menus: ThemeMenu[], L: ReturnType<typeof whmcsLinks>, phone: string, email: string, currency = '') {
  return `<div class="hp-drawer" id="hp-drawer" aria-hidden="true" inert>
  <div class="hp-drawer__scrim" data-close></div>
  <div class="hp-drawer__sheet" role="dialog" aria-modal="true" aria-label="Menu">
    <div class="hp-drawer__head">${logo('black', 147, 28, true)}<button type="button" data-close aria-label="Close menu">${icon('close')}</button></div>
    <nav class="hp-drawer__body" aria-label="Mobile">${menus.map((m, i) => `<button type="button" class="hp-dacc__btn" aria-expanded="false" aria-controls="hp-dp${i}">${esc(m.label)}${icon('chev')}</button><div class="hp-dacc__panel" id="hp-dp${i}"><ul>${m.groups.flatMap((g) => g.items).map((it) =>
      `<li><a href="${esc(it.href)}">${icon(it.icon)}${esc(it.label)}</a></li>`).join('')}</ul></div>`).join('')}</nav>
    <div class="hp-drawer__foot">
      <a class="hp-btn hp-btn--ghost" href="/account">Client login</a>
      <a class="hp-btn hp-btn--brand" href="${esc(L.register)}">Sign up</a>
      ${currency ? `<div class="hp-drawer__cur">${currency}</div>` : ''}
      <div class="hp-drawer__contact">${phone ? `<a href="${esc(telHref(phone))}" aria-label="${esc(`Call us: ${phone}`)}">${icon('phone')}<span class="num">${esc(phone)}</span></a>` : ''}${email ? `<a href="mailto:${esc(email)}">${icon('mail')}${esc(email)}</a>` : ''}</div>
    </div>
  </div>
</div>`;
}

function utilBar(cat: Catalog, L: ReturnType<typeof whmcsLinks>, phone: string, email: string) {
  return `<div class="hp-util"><div class="hp-container">
  <div class="hp-u-left">${phone ? `<a href="${esc(telHref(phone))}" aria-label="Call us on ${esc(phone)}">${icon('phone')}<span class="num">${esc(phone)}</span></a>` : ''}${phone && email ? '<span class="hp-sep" aria-hidden="true"></span>' : ''}${email ? `<a href="mailto:${esc(email)}">${icon('mail')}${esc(email)}</a>` : ''}</div>
  <div class="hp-u-right">
    ${currencyPicker(cat)}
    <span class="hp-u-item">${icon('globe')}Language <b>English</b></span>
    <span class="hp-sep" aria-hidden="true"></span>
    <a href="${esc(L.ticket)}" class="hp-hide-md">${icon('ticket')}Submit a ticket</a>
    <a href="/account">${icon('user')}Client login</a>
  </div>
</div></div>`;
}

function footer(menus: ThemeMenu[], cat: Catalog, phone: string, email: string, lead = '') {
  const s = cat.settings;
  const wa = String(s.whatsapp || phone || '').replace(/[^\d]/g, '');
  const company = 'GlobalHostia';
  const cols = footerColumns(menus, cat.links?.footerExtra);
  const pays = ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'maestro'];
  return `<footer class="hp-footer">
  <div class="hp-container">
    <div class="hp-fbox">
      <div class="hp-contact-card">
        <h2>Contact us</h2>
        <p>Sales and technical support, every hour of every day.</p>
        ${phone ? `<div class="hp-cc-row">${hexIcon('phone')}<div><small>Call us</small><a class="num" href="${esc(telHref(phone))}">${esc(phone)}</a></div></div>` : ''}
        ${email ? `<div class="hp-cc-row">${hexIcon('mail')}<div><small>Email us</small><a href="mailto:${esc(email)}">${esc(email)}</a></div></div>` : ''}
        ${wa ? `<div class="hp-cc-row">${hexIcon('chat')}<div><small>Chat on WhatsApp</small><a href="https://wa.me/${esc(wa)}">Message us on WhatsApp</a></div></div>` : ''}
        ${lead}
      </div>
      <nav class="hp-fcols" aria-label="Footer">${cols.map((c) => `<div><h3>${esc(c.title)}</h3>${c.links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('')}</div>`).join('')}</nav>
      <div class="hp-pay" role="img" aria-label="Accepted payment methods: Visa, Mastercard, American Express, Discover, JCB, Maestro and Bitcoin">
        ${pays.map((p) => `<img src="/image/payment/${p}.png" alt="${({ visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', maestro: 'Maestro' } as Record<string, string>)[p] || p} accepted" width="48" height="30" loading="lazy">`).join('')}<span class="hp-btc">Bitcoin</span>
      </div>
    </div>
  </div>
  <div class="hp-foot-bottom">
    <div class="hp-container">
      ${logo('white', 157, 30, true)}
      <p class="hp-legal">© ${new Date().getFullYear()} ${esc(s.site_name || 'Globalhostia')} · ${esc(company)}, Dubai, UAE. <a href="/terms-conditions">Terms</a> · <a href="/privacy-policy">Privacy</a>${consentLink(s.tracking)}<br><span class="hp-live"><i aria-hidden="true"></i><b>Prices shown live from our billing system.</b></span></p>
      <a class="hp-totop" href="#main" aria-label="Back to top">${icon('up')}</a>
    </div>
  </div>
</footer>`;
}

/** Render a complete themed HTML document. */
export async function page(o: PageOpts): Promise<string> {
  const cat = o.catalog || await getCatalog();
  const s = cat.settings;
  const L = whmcsLinks(cat.base);
  const menus = getMenu(cat);
  const phone = String(s.phone || ''), email = String(s.email || '');
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const canonical = o.canonical || site + (o.path === '/' || !o.path ? '/' : o.path);
  const siteName = String(s.site_name || 'Globalhostia');
  // routes.ts seoTitle/meta replace the visible title/description in <title> and meta tags only
  const r = o.ctx.route;
  const isBlogList = r.kind === 'blog' && (o.path === '/blog' || o.path.startsWith('/blog/category/'));
  const fullTitle = seoTitle(r.seoTitle && o.title === r.title ? r.seoTitle : o.title, siteName);
  const description = seoDescription(r.meta && o.description === r.description ? r.meta
    : isBlogList ? blogListingDescription(o.description, o.title) : o.description);
  const preview = o.ctx.query.get('theme') === 'hostpen';
  // a plan page whose categories have no live plans only shows "Plans are being updated": keep it out of the
  // index until plans are back (a soft 404 otherwise). The sitemap leaves it out too (lib/sitemap.ts).
  const emptyListing = !!r.categories?.length && !!o.path && o.path !== '/' && !productsFor(cat, r.categories).length;
  const noindex = preview || o.noindex || NOINDEX_SLUGS.has(o.ctx.slug) || emptyListing;
  const css = (o.css || []).map(safeKey).filter(Boolean);
  const js = (o.js || []).map(safeKey).filter(Boolean);
  // drop empty FAQPage blocks (pages with no FAQ items) so structured data stays valid
  const promo = activeFor(s.promotions, 'website');
  const lds = ([] as string[]).concat(o.jsonLd || []).filter((x) => x && !x.includes('"mainEntity":[]'));
  const isHome = !o.path || o.path === '/';
  // category pages: ItemList of their products when the page module didn't add one; home: Organization OfferCatalog
  const routeCats = o.ctx.route?.categories;
  if (routeCats?.length && o.ctx.route.kind !== 'product' && !lds.some((x) => x.includes('"ItemList"'))) {
    const l = itemListLd(cat, productsFor(cat, routeCats), o.ctx.route.title || o.title, canonical);
    if (l) lds.push(l);
  }
  if (o.ctx.route?.kind === 'home') { const oc = offerCatalogLd(cat); if (oc) lds.push(oc); }
  const og = o.ogImage ? new URL(o.ogImage, site + '/').toString()
    : isHome ? `${site}/og/default.png` : ogImageUrl(site, o.title.replace(/\s*\|\s*[^|]*$/, '') || o.title, o.ogKicker, ASSET_V);
  const ogAlt = isHome && !o.ogImage ? 'GlobalHostia: web hosting, VPS and dedicated servers' : o.title;

  return withCurrency(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '' : `<link rel="alternate" type="text/markdown" href="${esc(site + mdPath(o.path || '/'))}">`}
<meta property="og:type" content="${esc(o.ogType || 'website')}"><meta property="og:site_name" content="${esc(siteName)}"><meta property="og:locale" content="en_AE"><meta property="og:url" content="${esc(canonical)}"><meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(og)}">${o.ogImage ? '' : '<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'}<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fullTitle)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(og)}"><meta name="twitter:image:alt" content="${esc(ogAlt)}">
${o.headExtra || ''}
${verificationMeta(s)}
${trackingHead(s.tracking)}
<meta name="theme-color" content="#16212b">
${ICON_LINKS}
${(o.preload || []).map((p) => (typeof p === 'string' ? preloadImage(p) : preloadImage(p.src, p.sizes, p.media))).join('')}
${FONT_PRELOADS}
<link rel="stylesheet" href="${asset('/hp/theme.css')}">
<link rel="stylesheet" href="${asset('/hp/fx.css')}" media="print" onload="this.media='all'">
${hasPromo(promo) ? `<link rel="stylesheet" href="${asset('/hp/promo.css')}">` : ''}
${css.map((k) => `<link rel="stylesheet" href="${asset(`/hp/pages/${k}.css`)}">`).join('\n')}
<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("hp-mo")</script>
${siteJsonLd(s, cat.base)}
${lds.join('\n')}
${s.custom_css ? `<style id="gh-custom">${String(s.custom_css).replace(/<\/style/gi, '<\\/style')}</style>` : ''}
</head>
<body${o.bodyClass ? ` class="${esc(o.bodyClass)}"` : ''}>
${iconSprite()}
<div class="hp-progress" aria-hidden="true"></div>
<a class="hp-skip" href="#main">Skip to content</a>
${barHtml(promo.bar)}
${utilBar(cat, L, phone, email)}
${header(menus, L, cat)}
${drawer(menus, L, phone, email, currencyPicker(cat))}
<main id="main" tabindex="-1">
${o.body}
</main>
${footer(menus, cat, phone, email, s.lead_footer === false || s.lead_footer === 'false' ? '' : leadForm({ source: 'footer', page: o.path || '/', tone: 'dark', title: 'Get hosting deals & guides', text: 'Occasional offers and practical hosting tips. No spam.', cta: 'Sign me up', level: 3, done: o.ctx.query.get('lead') === 'ok' }))}
${waFloat(s, o.title.replace(/\s*\|\s*[^|]*$/, '') || o.title, o.path)}
${preview ? `<a class="hp-preview-pill" href="${esc((o.path || '/') + '?theme=original')}"><i aria-hidden="true"></i>Theme preview · switch back to the current site</a>` : ''}
<script src="${asset('/hp/theme.js')}" defer></script>
<script src="${asset('/hp/fx.js')}" defer></script>
${WEBMCP_LOADER}
${o.aiChat === false ? '' : aiChatLoader(s, cat.currency)}
<script src="${asset('/hp/track.js')}" defer></script>
${hasPromo(promo) ? `${promoDataScript(promo)}<script src="${asset('/hp/promo.js')}" defer></script>` : ''}
${js.map((k) => `<script src="${asset(`/hp/pages/${k}.js`)}" defer></script>`).join('\n')}
</body>
</html>`, cat);
}


/** Shared helper for page modules: "$X / month" text. */
export const priceText = (v: number, prefix = '$') => money(v, prefix);

/** Currency picker in the utility bar: links set the gh_cur cookie via middleware (?currency=XXX). */
function currencyPicker(cat: Catalog) {
  const list = availableCurrencies(cat.products);
  if (list.length < 2) return `<span class="hp-u-item">${icon('coin')}<span class="hp-u-lbl">Currency </span><b>${esc(cat.currency)}</b></span>`;
  return `<details class="hp-cur"><summary class="hp-u-item">${icon('coin')}<span class="hp-u-lbl">Currency </span><b>${esc(cat.currency)}</b></summary><ul class="hp-cur__menu">${list.map((c) =>
    `<li><a href="?currency=${c}" rel="nofollow"${c === cat.currency ? ' aria-current="true"' : ''}><i class="hp-cur__sym">${esc(symbolOf(cat, c))}</i><b>${c}</b><span>${esc(CURRENCY_LABEL[c] || '')}</span></a></li>`).join('')}</ul></details>`;
}

/** Send the visitor's currency to WHMCS so the cart and checkout use it too. */
export function withCurrency(html: string, cat: Catalog) {
  const id = cat.currencyIds?.[cat.currency];
  if (!id || cat.currency === (cat.settings.currency || 'USD')) return html;
  const base = cat.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html
    .replace(new RegExp(`(href="${base}/cart\\.php\\?)`, 'g'), `$1currency=${id}&amp;`)
    .replace(new RegExp(`href="(${base}/(?:store|cart\\.php)[^"?]*)"`, 'g'), `href="$1?currency=${id}"`)
    // GET forms (domain search / transfer) submit straight to the cart: carry the currency as a field
    .replace(new RegExp(`(<form\\b[^>]*action="${base}/cart\\.php"[^>]*>)`, 'g'), `$1<input type="hidden" name="currency" value="${id}">`)
    // order links inside JSON data (plan finder, VPS sizer, AI picker, JSON-LD offers) that page scripts turn into links
    .replace(new RegExp(`"(${base}/cart\\.php\\?)(?!currency=)`, 'g'), `"$1currency=${id}&`);
}

function symbolOf(cat: Catalog, code: string) {
  for (const p of cat.products) { const r = p.prices.find((x) => x.currency === code && x.prefix); if (r) return r.prefix.trim(); }
  return ({ USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'AED' } as Record<string, string>)[code] || code;
}
