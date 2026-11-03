// Phone homepage top (up to 767px): sticky domain search bar + the admin-managed hero carousel card
// (Admin -> Marketing -> Mobile hero, lib/mobile-hero.ts). Desktop keeps the full-width hero slider.
// Script: public/hp/pages/mhero.js · styles: public/hp/pages/mhero.css (+ the phone header in theme.css).
import { esc } from '../render/util';
import { money } from '../pricing';
import { normalize, liveSlides, type PriceCtx, type ResolvedSlide } from '../mobile-hero';
import { productsFor, minFrom, pricedTlds, currencyPrefix, fromPrice, type Catalog } from './data';
import { icon, available } from './ui';
import { picture, imgInfo } from './img';

const GROUPS: Record<string, string[]> = {
  hosting: ['hosting-usa', 'hostia-shared', 'hosting-singapore'],
  email: ['business-email', 'professional-email'],
  vps: ['hostiavps'],
  dedicated: ['dedicated-servers', 'premiumdedicated-servers'],
};
const UNIT: Record<string, string> = { monthly: '/mo', quarterly: '/qtr', semiannually: '/6 mo', annually: '/yr', biennially: '/2 yrs', triennially: '/3 yrs' };

/** Live prices from the synced catalog (WHMCS): TLD pricing in the visitor's currency and the cheapest priced plan of a category group. */
export function priceCtx(cat: Catalog): PriceCtx {
  const prefix = currencyPrefix(cat) || '$';
  const tlds = pricedTlds(cat);
  return {
    currency: cat.currency,
    money: (v) => money(v, prefix),
    tld: (t) => { const x = tlds.find((y) => y.tld.toLowerCase() === t); return x ? { register: x.register, renew: x.renew, transfer: x.transfer, promo: x.promo || '' } : null; },
    from: (key) => {
      const slugs = GROUPS[key] || key.split(',').map((x) => x.trim()).filter(Boolean);
      // a zero price is a placeholder (free/unconfigured in WHMCS), never an offer
      const ps = available(productsFor(cat, slugs)).filter((p) => (fromPrice(p, cat.currency)?.price ?? 0) > 0);
      const f = minFrom(ps, cat.currency);
      return f ? `${money(f.price, f.prefix)}${UNIT[f.cycle] || ''}` : null;
    },
  };
}

/* decorative line art for gradient slides */
const ART: Record<string, string> = {
  cube: `<svg viewBox="0 0 220 200" aria-hidden="true" focusable="false"><g transform="translate(62 30)"><path d="M48 0 96 28 48 56 0 28Z" fill="#fdd700"/><path d="M0 28 48 56V112L0 84Z" fill="rgba(255,255,255,.28)"/><path d="M96 28 48 56V112L96 84Z" fill="rgba(255,255,255,.12)"/><path d="M48 0 96 28V84L48 112 0 84V28ZM48 56V112M48 56 96 28M48 56 0 28" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.2"/></g><g transform="translate(10 112) scale(.42)" opacity=".7"><path d="M48 0 96 28 48 56 0 28Z" fill="rgba(255,255,255,.5)"/><path d="M0 28 48 56V112L0 84Z" fill="rgba(255,255,255,.22)"/><path d="M96 28 48 56V112L96 84Z" fill="rgba(255,255,255,.1)"/></g><g transform="translate(176 8) scale(.3)" opacity=".6"><path d="M48 0 96 28 48 56 0 28Z" fill="rgba(253,215,0,.85)"/><path d="M0 28 48 56V112L0 84Z" fill="rgba(255,255,255,.22)"/><path d="M96 28 48 56V112L96 84Z" fill="rgba(255,255,255,.1)"/></g></svg>`,
  globe: `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.4"><circle cx="100" cy="100" r="78"/><ellipse cx="100" cy="100" rx="34" ry="78"/><path d="M22 100h156M34 60h132M34 140h132"/><circle cx="150" cy="52" r="7" fill="#fdd700" stroke="none"/></svg>`,
  mail: `<svg viewBox="0 0 220 180" aria-hidden="true" focusable="false" fill="none" stroke-linejoin="round"><rect x="36" y="40" width="148" height="104" rx="14" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.55)" stroke-width="1.6"/><path d="m40 50 70 52 70-52" stroke="rgba(255,255,255,.7)" stroke-width="1.6"/><circle cx="178" cy="44" r="16" fill="#fdd700"/><path d="m171 44 5 5 9-10" stroke="#16212b" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  server: `<svg viewBox="0 0 220 180" aria-hidden="true" focusable="false" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.6"><rect x="40" y="28" width="140" height="36" rx="9" fill="rgba(255,255,255,.08)"/><rect x="40" y="72" width="140" height="36" rx="9" fill="rgba(255,255,255,.08)"/><rect x="40" y="116" width="140" height="36" rx="9" fill="rgba(255,255,255,.08)"/><g fill="#fdd700" stroke="none"><circle cx="60" cy="46" r="4"/><circle cx="60" cy="90" r="4"/><circle cx="60" cy="134" r="4"/></g><path d="M120 46h44M120 90h44M120 134h44"/></svg>`,
};

function media(s: ResolvedSlide, i: number) {
  const img = s.media === 'image' ? s.imageUrl : s.media === 'video' ? s.posterUrl || s.imageUrl : '';
  const pic = img ? picture({ src: img, className: 'hp-mslide__img', sizes: 'calc(100vw - 32px)', priority: i === 0, deferred: i > 0 }) : '';
  if (s.media === 'video' && s.videoUrl) {
    const poster = img ? (imgInfo(img) ? `/hp/img/opt/${imgInfo(img)!.name}-640.webp` : img) : '';
    // no src until the script decides playback is allowed (not reduced motion, not Save-Data): the poster/picture shows otherwise
    return `${pic}<video class="hp-mslide__vid" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"${poster ? ` poster="${esc(poster)}"` : ''} data-src="${esc(s.videoUrl)}"></video>`;
  }
  if (pic) return pic;
  return s.art !== 'none' && ART[s.art] ? `<div class="hp-mslide__art">${ART[s.art]}</div>` : '';
}

/** The sticky domain search bar shown under the phone header. Submits to the same WHMCS domain search as every other form. */
export function mobileSearch(base: string, title: string) {
  return `<div class="hp-mtop">
  <h1 class="sr-only hp-mtop__h">${esc(title)}</h1>
  <form class="hp-msearch" action="${esc(base)}/cart.php" method="get" role="search" aria-label="Domain search" data-domain-form>
    <input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="register">
    <label class="sr-only" for="m-domain-q">Domain name</label>
    <input id="m-domain-q" name="query" type="search" enterkeyhint="search" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the domain you want" required>
    <button type="submit" aria-label="Search domains">${icon('search')}</button>
  </form>
</div>`;
}

/** Hero carousel card. Empty string when no slide is live (the page then starts with the sections below). */
export function mobileHero(cat: Catalog): { html: string; preload: { src: string; sizes: string; media: string } | null } {
  const cfg = normalize(cat.settings.mobile_hero);
  const slides = liveSlides(cfg, priceCtx(cat));
  if (!slides.length) return { html: '', preload: null };
  const n = slides.length;
  const first = slides[0];
  const firstImg = first.media === 'image' ? first.imageUrl : first.media === 'video' ? first.posterUrl || first.imageUrl : '';
  const body = slides.map((s, i) => `<div class="hp-mslide hp-mslide--${esc(s.media === 'gradient' ? s.gradient : 'media')}${i ? '' : ' is-active'}" id="mslide-${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}"${i ? ' aria-hidden="true" inert' : ''}>
      <div class="hp-mslide__bg">${media(s, i)}</div>
      <div class="hp-mslide__scrim" style="--s:${(s.scrim / 100).toFixed(2)}"></div>
      <div class="hp-mslide__body">
        <h2 class="hp-mslide__t">${esc(s.title)}</h2>
        ${s.ctaLabel && s.ctaHref ? `<a class="hp-mslide__cta" href="${esc(s.ctaHref)}">${esc(s.ctaLabel)}</a>` : ''}
        ${s.fine ? `<p class="hp-mslide__fine">${esc(s.fine)}</p>` : ''}
      </div>
    </div>`).join('\n    ');
  const ctrl = n > 1 ? `<div class="hp-mhero__ctrl">
    <div class="hp-mhero__dots" role="group" aria-label="Choose a slide">${slides.map((s, i) => `<button type="button" class="hp-mdot" aria-controls="mslide-${i}" aria-label="Slide ${i + 1} of ${n}: ${esc(s.title)}"${i ? '' : ' aria-current="true"'}><i></i></button>`).join('')}</div>
    <div class="hp-mhero__btns">
      <button type="button" class="hp-mbtn" data-mh="toggle" aria-label="Pause slideshow">${icon('pause', 'is-pause')}${icon('play', 'is-play')}</button>
      <button type="button" class="hp-mbtn" data-mh="prev" aria-label="Previous slide">${icon('left')}</button>
      <button type="button" class="hp-mbtn" data-mh="next" aria-label="Next slide">${icon('right')}</button>
    </div>
  </div>` : '';
  const html = `<section class="hp-mhero" data-mhero data-interval="${cfg.interval * 1000}" aria-roledescription="carousel" aria-label="Offers">
  <div class="hp-mhero__card">
    <div class="hp-mhero__track" aria-live="off">
    ${body}
    </div>
    ${ctrl}
  </div>
</section>`;
  return { html, preload: firstImg && imgInfo(firstImg) ? { src: firstImg, sizes: 'calc(100vw - 32px)', media: '(max-width: 767px)' } : null };
}
