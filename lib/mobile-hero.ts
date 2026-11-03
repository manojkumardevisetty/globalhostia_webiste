// Mobile homepage hero (phones up to 767px): the carousel card under the compact header and domain search bar.
// Admin -> Marketing -> Mobile hero. Stored as one JSON value in settings under key `mobile_hero`.
// Pure module (no server imports): normalise, validate, schedule and resolve price tokens. Safe for server and client.

export type HeroMedia = 'gradient' | 'image' | 'video';
export type HeroGradient = 'raspberry' | 'midnight' | 'gold';
export type HeroArt = 'cube' | 'globe' | 'mail' | 'server' | 'none';

export type HeroSlide = {
  id: string;
  enabled: boolean;
  /** Headline with tokens: {price:.com} {renew:.com} {transfer:.com} {offer:.com} {from:hosting} {from:email} {from:<category-slug>} {currency} */
  headline: string;
  /** Shown instead of the headline when a token has no live price, or when "offer only" is set and the TLD has no offer. */
  fallback: string;
  /** TLD (".com"): the price headline is used only while that TLD has a promo label or a first-year price at least 10% under renewal. */
  offerTld: string;
  ctaLabel: string;
  ctaHref: string;
  /** Small line under the button; hidden when one of its tokens has no live price. */
  finePrint: string;
  media: HeroMedia;
  gradient: HeroGradient;
  art: HeroArt;
  imageUrl: string;
  videoUrl: string;
  posterUrl: string;
  /** darkening over the media, 0-90 (%) */
  scrim: number;
  start: string;
  end: string;
};

export type MobileHero = {
  enabled: boolean;
  /** seconds per slide while autoplaying */
  interval: number;
  dealsHref: string;
  helpHref: string;
  slides: HeroSlide[];
  updatedAt?: string;
};

export const GRADIENTS: Record<HeroGradient, string> = { raspberry: 'Raspberry', midnight: 'Midnight', gold: 'Gold and raspberry' };
export const ARTS: Record<HeroArt, string> = { cube: 'Brand cube', globe: 'Globe', mail: 'Envelope', server: 'Server stack', none: 'None' };
export const TOKENS_HELP = '{price:.com} first-year price, {renew:.com} renewal, {transfer:.com} transfer, {offer:.com} promo label, {from:hosting} cheapest web hosting, {from:email} cheapest business email, {from:<category slug>} cheapest plan in a category, {currency} currency code';

export const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'com', enabled: true,
    headline: 'Get a .com for only {price:.com}/1st yr', fallback: 'Find the perfect .com for your business', offerTld: '.com',
    ctaLabel: 'Claim your .com', ctaHref: '/domains-registration',
    finePrint: '.com renews at {renew:.com}/yr.',
    media: 'image', gradient: 'raspberry', art: 'none', imageUrl: '/hp/img/hero-domains.jpg', videoUrl: '', posterUrl: '', scrim: 55, start: '', end: '',
  },
  {
    id: 'hosting', enabled: true,
    headline: 'Web hosting from {from:hosting}', fallback: 'Fast NVMe web hosting for every website', offerTld: '',
    ctaLabel: 'See hosting plans', ctaHref: '/web-hosting',
    finePrint: 'Free SSL, daily backups and 24/7 support on every plan.',
    media: 'image', gradient: 'midnight', art: 'none', imageUrl: '/hp/img/hero-servers.jpg', videoUrl: '', posterUrl: '', scrim: 55, start: '', end: '',
  },
  {
    id: 'email', enabled: true,
    headline: 'Business email from {from:email}', fallback: 'Business email on your own domain', offerTld: '',
    ctaLabel: 'Get business email', ctaHref: '/google-workspace',
    finePrint: 'Professional mailboxes or Google Workspace, set up for you.',
    media: 'image', gradient: 'midnight', art: 'none', imageUrl: '/hp/img/email-office.jpg', videoUrl: '', posterUrl: '', scrim: 55, start: '', end: '',
  },
];

export const DEFAULT_MOBILE_HERO: MobileHero = {
  enabled: true, interval: 6, dealsHref: '/domains-registration#pricing', helpHref: '/help-center', slides: DEFAULT_SLIDES,
};

const s = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const clampInt = (v: unknown, min: number, max: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const iso = (v: unknown) => { const x = s(v, 40); if (!x) return ''; const t = Date.parse(x); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
const tld = (v: unknown) => { const x = s(v, 30).toLowerCase(); return x ? (x.startsWith('.') ? x : '.' + x) : ''; };

export function normSlide(x: any, i = 0): HeroSlide {
  x = x && typeof x === 'object' ? x : {};
  return {
    id: s(x.id, 40).replace(/[^a-z0-9_-]/gi, '') || `s${i + 1}`,
    enabled: x.enabled !== false,
    headline: s(x.headline, 120), fallback: s(x.fallback, 120), offerTld: tld(x.offerTld),
    ctaLabel: s(x.ctaLabel, 40), ctaHref: s(x.ctaHref, 500), finePrint: s(x.finePrint, 200),
    media: oneOf(x.media, ['gradient', 'image', 'video'] as const, 'gradient'),
    gradient: oneOf(x.gradient, ['raspberry', 'midnight', 'gold'] as const, 'raspberry'),
    art: oneOf(x.art, ['cube', 'globe', 'mail', 'server', 'none'] as const, 'none'),
    imageUrl: s(x.imageUrl, 500), videoUrl: s(x.videoUrl, 500), posterUrl: s(x.posterUrl, 500),
    scrim: clampInt(x.scrim, 0, 90, 40), start: iso(x.start), end: iso(x.end),
  };
}

/** Stored value -> complete config. Nothing saved yet -> the seeded defaults. */
export function normalize(x: any): MobileHero {
  if (!x || typeof x !== 'object') return { ...DEFAULT_MOBILE_HERO, slides: DEFAULT_SLIDES.map((d) => ({ ...d })) };
  const slides = Array.isArray(x.slides) ? x.slides.slice(0, 8).map(normSlide) : DEFAULT_SLIDES.map((d) => ({ ...d }));
  const seen = new Set<string>();
  for (const sl of slides) { let id = sl.id, n = 2; while (seen.has(id)) id = `${sl.id}-${n++}`; sl.id = id; seen.add(id); }
  return {
    enabled: x.enabled !== false, interval: clampInt(x.interval, 3, 20, 6),
    dealsHref: s(x.dealsHref, 500) || DEFAULT_MOBILE_HERO.dealsHref, helpHref: s(x.helpHref, 500) || DEFAULT_MOBILE_HERO.helpHref,
    slides, updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : undefined,
  };
}

/** Link targets: site-relative path, #anchor or https URL. */
export const okUrl = (u: string) => !u || /^\/(?!\/)/.test(u) || /^#[\w-]+$/.test(u) || /^https:\/\/[^\s"'<>]+$/i.test(u);

export function validate(h: MobileHero): string[] {
  const e: string[] = [];
  if (!okUrl(h.dealsHref)) e.push('Deals link must start with / or https://');
  if (!okUrl(h.helpHref)) e.push('Help link must start with / or https://');
  h.slides.forEach((x, i) => {
    const L = `Slide ${i + 1}`;
    if (x.enabled && !x.headline && !x.fallback) e.push(`${L}: add a headline`);
    if (x.headline && /\{[^}]*\{|\{(?:price|renew|transfer|offer|from):\s*\}/.test(x.headline)) e.push(`${L}: a price token is incomplete`);
    if (x.headline && hasTokens(x.headline) && !x.fallback) e.push(`${L}: add a fallback headline (used when a price is not available)`);
    if (x.ctaLabel && !x.ctaHref) e.push(`${L}: add a button link`);
    if (x.ctaHref && !x.ctaLabel) e.push(`${L}: add a button label`);
    for (const [k, label] of [['ctaHref', 'button link'], ['imageUrl', 'image'], ['videoUrl', 'video'], ['posterUrl', 'poster']] as const) {
      if (!okUrl(x[k])) e.push(`${L}: ${label} must start with / or https://`);
    }
    if (x.enabled && x.media === 'image' && !x.imageUrl) e.push(`${L}: add an image URL or choose the gradient background`);
    if (x.enabled && x.media === 'video' && !x.videoUrl) e.push(`${L}: add a video URL`);
    if (x.enabled && x.media === 'video' && !x.posterUrl && !x.imageUrl) e.push(`${L}: add a poster image for the video (shown before it plays and when motion is reduced)`);
    if (x.start && x.end && Date.parse(x.end) <= Date.parse(x.start)) e.push(`${L}: end must be after start`);
  });
  return e;
}

export type SlideStatus = 'off' | 'scheduled' | 'live' | 'ended';
export function slideStatus(x: Pick<HeroSlide, 'enabled' | 'start' | 'end'>, now = Date.now()): SlideStatus {
  if (!x.enabled) return 'off';
  if (x.end && Date.parse(x.end) <= now) return 'ended';
  if (x.start && Date.parse(x.start) > now) return 'scheduled';
  return 'live';
}

/* ------------------------------------------------------------------ price tokens */
export type TldPrice = { register: number | null; renew: number | null; transfer: number | null; promo: string };
/** Live prices for token resolution, built from the synced catalog (lib/theme/mobile-hero.ts). */
export type PriceCtx = {
  currency: string;
  /** "$13.65" */
  money: (v: number) => string;
  tld: (t: string) => TldPrice | null;
  /** cheapest billed price + short unit ("$2.99/mo") of a category group, or null */
  from: (key: string) => string | null;
};

const TOKEN = /\{(price|renew|transfer|offer|from):\s*([^}\s]+)\s*\}|\{currency\}/g;
export const hasTokens = (t: string) => { TOKEN.lastIndex = 0; return TOKEN.test(t); };

/** Replace tokens with live values; null when any token has no live value (callers then fall back). */
export function resolveTokens(text: string, ctx: PriceCtx): string | null {
  let missing = false;
  const out = text.replace(TOKEN, (m, kind?: string, arg?: string) => {
    if (!kind) return ctx.currency;
    if (kind === 'from') { const v = ctx.from(arg!.toLowerCase()); if (!v) missing = true; return v || ''; }
    const t = ctx.tld(arg!.toLowerCase().startsWith('.') ? arg!.toLowerCase() : '.' + arg!.toLowerCase());
    if (kind === 'offer') { if (!t?.promo) missing = true; return t?.promo || ''; }
    const n = t ? t[kind === 'price' ? 'register' : (kind as 'renew' | 'transfer')] : null;
    if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) { missing = true; return ''; }
    return ctx.money(n);
  });
  return missing ? null : out;
}

/** A TLD is "on offer" with a promo label set in Admin -> Domains & TLDs, or a first-year price at least 10% under renewal. */
export function onOffer(t: TldPrice | null) {
  if (!t || t.register === null || !(t.register > 0)) return false;
  if (t.promo) return true;
  return t.renew !== null && t.renew > 0 && t.register <= t.renew * 0.9;
}

export type ResolvedSlide = HeroSlide & { title: string; fine: string };
/** Live slides for the page, in order, with tokens resolved. A slide with no usable headline is dropped. */
export function liveSlides(h: MobileHero, ctx: PriceCtx, now = Date.now()): ResolvedSlide[] {
  if (!h.enabled) return [];
  return h.slides.filter((x) => slideStatus(x, now) === 'live').flatMap((x) => {
    const offerOk = !x.offerTld || onOffer(ctx.tld(x.offerTld));
    const head = x.headline && offerOk ? resolveTokens(x.headline, ctx) : null;
    const title = head || (x.fallback ? resolveTokens(x.fallback, ctx) : null) || '';
    if (!title) return [];
    const fine = x.finePrint ? resolveTokens(x.finePrint, ctx) || '' : '';
    return [{ ...x, title, fine }];
  });
}
