// Promotions (Admin → Marketing → Promotions): top announcement bar + pop-up ads.
// Stored as one JSON value in settings under key `promotions`. Pure module: safe for server and client.

export type Surface = 'website' | 'clientarea';
export type Where = Surface | 'both';
export type BarStyle = 'brand' | 'charcoal' | 'gold';
export type Trigger = 'delay' | 'exit' | 'scroll';
export type Audience = 'all' | 'new';

export type PromoBar = {
  enabled: boolean; message: string; linkUrl: string; linkLabel: string; coupon: string;
  style: BarStyle; dismissible: boolean; dismissDays: number; start: string; end: string; where: Where;
};
export type PromoPopup = {
  enabled: boolean; title: string; body: string; imageUrl: string; imageAlt: string; ctaLabel: string; ctaUrl: string; coupon: string;
  trigger: Trigger; delay: number; scroll: number; audience: Audience; frequencyDays: number;
  start: string; end: string; where: Where; exclude: string[];
};
export type Promotions = { bar: PromoBar; popup: PromoPopup; welcome: PromoPopup; updatedAt?: string };

export const BAR_STYLES: Record<BarStyle, string> = { brand: 'Raspberry', charcoal: 'Charcoal', gold: 'Gold' };
export const DEFAULT_EXCLUDE = ['/cart', '/checkout', '/sign-in', '/sign-up', '/account'];

export const DEFAULT_BAR: PromoBar = {
  enabled: false, message: '', linkUrl: '', linkLabel: '', coupon: '', style: 'brand', dismissible: true, dismissDays: 7,
  start: '', end: '', where: 'website',
};
export const DEFAULT_POPUP: PromoPopup = {
  enabled: false, title: '', body: '', imageUrl: '', imageAlt: '', ctaLabel: '', ctaUrl: '', coupon: '',
  trigger: 'delay', delay: 10, scroll: 50, audience: 'all', frequencyDays: 7, start: '', end: '', where: 'website', exclude: DEFAULT_EXCLUDE,
};
/** "Welcome offer" preset: first-time visitors only. Disabled by default and never ships with a discount code. */
export const DEFAULT_WELCOME: PromoPopup = {
  ...DEFAULT_POPUP,
  title: 'Welcome to GlobalHostia',
  body: 'New here? Find the right plan for your website: **web hosting, VPS and dedicated servers** with free SSL and support every hour of every day.',
  ctaLabel: 'See hosting plans', ctaUrl: '/web-hosting', coupon: '', audience: 'new', trigger: 'delay', delay: 8, frequencyDays: 30,
};

const clampInt = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const s = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const iso = (v: unknown) => { const x = s(v, 40); if (!x) return ''; const t = Date.parse(x); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
const WHERE = ['website', 'clientarea', 'both'] as const;

export function normBar(x: any): PromoBar {
  const d = DEFAULT_BAR; x = x && typeof x === 'object' ? x : {};
  return {
    enabled: x.enabled === true, message: s(x.message, 240), linkUrl: s(x.linkUrl, 500), linkLabel: s(x.linkLabel, 40),
    coupon: s(x.coupon, 40).toUpperCase().replace(/\s+/g, ''), style: oneOf(x.style, ['brand', 'charcoal', 'gold'] as const, d.style),
    dismissible: x.dismissible !== false, dismissDays: clampInt(x.dismissDays, 0, 365, d.dismissDays),
    start: iso(x.start), end: iso(x.end), where: oneOf(x.where, WHERE, d.where),
  };
}
export function normPopup(x: any, d: PromoPopup = DEFAULT_POPUP): PromoPopup {
  x = x && typeof x === 'object' ? x : {};
  const ex = Array.isArray(x.exclude) ? x.exclude : typeof x.exclude === 'string' ? x.exclude.split(/\r?\n/) : d.exclude;
  return {
    enabled: x.enabled === true, title: s(x.title ?? d.title, 90), body: s(x.body ?? d.body, 600), imageUrl: s(x.imageUrl, 500), imageAlt: s(x.imageAlt, 140),
    ctaLabel: s(x.ctaLabel ?? d.ctaLabel, 40), ctaUrl: s(x.ctaUrl ?? d.ctaUrl, 500), coupon: s(x.coupon, 40).toUpperCase().replace(/\s+/g, ''),
    trigger: oneOf(x.trigger, ['delay', 'exit', 'scroll'] as const, d.trigger), delay: clampInt(x.delay, 0, 600, d.delay),
    scroll: clampInt(x.scroll, 5, 100, d.scroll), audience: oneOf(x.audience, ['all', 'new'] as const, d.audience),
    frequencyDays: clampInt(x.frequencyDays, 0, 365, d.frequencyDays), start: iso(x.start), end: iso(x.end), where: oneOf(x.where, WHERE, d.where),
    exclude: ex.map((p: unknown) => s(p, 200)).filter(Boolean).slice(0, 50),
  };
}
export function normalize(x: any): Promotions {
  x = x && typeof x === 'object' ? x : {};
  return { bar: normBar(x.bar), popup: normPopup(x.popup), welcome: normPopup(x.welcome, DEFAULT_WELCOME), updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : undefined };
}

/** Link targets: site-relative path or https URL. */
export const okUrl = (u: string) => !u || /^\/(?!\/)/.test(u) || /^https:\/\/[^\s"'<>]+$/i.test(u);

/** Human-readable validation errors (empty = valid). Only enabled items need complete content. */
export function validate(p: Promotions): string[] {
  const e: string[] = [];
  const win = (label: string, a: string, b: string) => { if (a && b && Date.parse(b) <= Date.parse(a)) e.push(`${label}: end must be after start`); };
  const b = p.bar;
  if (b.enabled && !b.message) e.push('Announcement bar: message is required');
  if (!okUrl(b.linkUrl)) e.push('Announcement bar: link must start with / or https://');
  if (b.linkUrl && !b.linkLabel) e.push('Announcement bar: add a link label');
  if (b.coupon && !/^[A-Z0-9_-]{2,40}$/.test(b.coupon)) e.push('Announcement bar: coupon may contain only letters, numbers, - and _');
  win('Announcement bar', b.start, b.end);
  for (const [k, label] of [['popup', 'Pop-up'], ['welcome', 'Welcome offer']] as const) {
    const x = p[k];
    if (x.enabled && !x.title) e.push(`${label}: title is required`);
    if (x.enabled && !x.body && !x.imageUrl) e.push(`${label}: add body text or an image`);
    if (!okUrl(x.ctaUrl)) e.push(`${label}: button link must start with / or https://`);
    if (!okUrl(x.imageUrl)) e.push(`${label}: image URL must start with / or https://`);
    if (x.imageUrl && !x.imageAlt) e.push(`${label}: describe the image (alt text) for screen readers`);
    if (x.ctaUrl && !x.ctaLabel) e.push(`${label}: add a button label`);
    if (x.ctaLabel && !x.ctaUrl) e.push(`${label}: add a button link`);
    if (x.coupon && !/^[A-Z0-9_-]{2,40}$/.test(x.coupon)) e.push(`${label}: coupon may contain only letters, numbers, - and _`);
    win(label, x.start, x.end);
  }
  return e;
}

const onSurface = (w: Where, sf: Surface) => w === 'both' || w === sf;
export type Status = 'off' | 'scheduled' | 'live' | 'ended';
export function status(x: { enabled: boolean; start: string; end: string }, now = Date.now()): Status {
  if (!x.enabled) return 'off';
  if (x.end && Date.parse(x.end) <= now) return 'ended';
  if (x.start && Date.parse(x.start) > now) return 'scheduled';
  return 'live';
}

/** Short stable id of the content, used as the visitor's dismiss/frequency key (changes when the owner edits the promo). */
export function contentId(prefix: string, o: unknown) {
  let h = 0x811c9dc5; const str = JSON.stringify(o);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return prefix + (h >>> 0).toString(36);
}

export type PublicBar = Omit<PromoBar, 'enabled' | 'where'> & { id: string };
export type PublicPopup = Omit<PromoPopup, 'enabled' | 'where'> & { id: string; kind: 'popup' | 'welcome' };
export type PublicPromo = { surface: Surface; bar: PublicBar | null; popups: PublicPopup[] };

/**
 * What is active right now for a surface. The bar is kept until its end date (a future start is still sent;
 * the client hides it until then) so cached pages switch on time. Pop-ups: welcome first (first-time visitors), then the general one.
 */
export function activeFor(raw: unknown, surface: Surface, now = Date.now()): PublicPromo {
  const p = normalize(raw);
  const live = (x: { enabled: boolean; start: string; end: string; where: Where }) => x.enabled && onSurface(x.where, surface) && (!x.end || Date.parse(x.end) > now);
  const strip = <T extends { enabled: boolean; where: Where }>(x: T) => { const { enabled: _e, where: _w, ...rest } = x; return rest; };
  const bar = live(p.bar) && p.bar.message ? { id: contentId('b', p.bar), ...strip(p.bar) } : null;
  const popups: PublicPopup[] = [];
  for (const kind of ['welcome', 'popup'] as const) {
    const x = p[kind];
    if (live(x) && x.title) popups.push({ id: contentId(kind === 'welcome' ? 'w' : 'p', x), kind, ...strip(x) });
  }
  return { surface, bar, popups };
}

/** Escape text and turn **bold** into <strong>. */
export function richText(t: string) {
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return esc(t).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
}

/** Asia/Dubai (UTC+4, no DST) helpers for the admin datetime inputs. */
export const toDubaiLocal = (isoStr: string) => (isoStr ? new Date(Date.parse(isoStr) + 4 * 3600e3).toISOString().slice(0, 16) : '');
export const fromDubaiLocal = (local: string) => (local ? new Date(`${local.length === 16 ? local + ':00' : local}+04:00`).toISOString() : '');

const ICON = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
const attr = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Server-rendered announcement bar for the top of the Hostpen shell (styles: /hp/promo.css, behaviour: /hp/promo.js).
 * The inline script right after it hides it synchronously (before first paint, so no layout shift) when it is
 * outside its schedule or the visitor dismissed it.
 */
export function barHtml(b: PublicBar | null): string {
  if (!b) return '';
  const chip = b.coupon ? `<button type="button" class="ghp-chip" data-ghp-copy="${attr(b.coupon)}" aria-label="Copy coupon code ${attr(b.coupon)}"><small>Code</small><span>${attr(b.coupon)}</span>${ICON('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>')}</button>` : '';
  const link = b.linkUrl && b.linkLabel ? `<a class="ghp-bar__link" href="${attr(b.linkUrl)}">${attr(b.linkLabel)}${ICON('<path d="M5 12h14M13 6l6 6-6 6"/>')}</a>` : '';
  const x = b.dismissible ? `<button type="button" class="ghp-bar__x" aria-label="Dismiss announcement">${ICON('<path d="M18 6 6 18M6 6l12 12"/>')}</button>` : '';
  return `<div class="ghp-bar ghp-bar--${b.style}" id="ghp-bar" role="region" aria-label="Announcement" data-id="${attr(b.id)}" data-days="${b.dismissDays}" data-start="${attr(b.start)}" data-end="${attr(b.end)}"${b.dismissible ? ' data-dismiss' : ''}><div class="ghp-bar__in"><p class="ghp-bar__msg">${richText(b.message)}</p>${chip}${link}</div>${x}<span class="ghp-live" aria-live="polite"></span></div>
<script>(function(){var b=document.getElementById("ghp-bar");if(!b)return;var n=Date.now(),s=b.getAttribute("data-start"),e=b.getAttribute("data-end"),h=(s&&Date.parse(s)>n)||(e&&Date.parse(e)<=n);if(!h&&b.hasAttribute("data-dismiss")){try{var d=+b.getAttribute("data-days"),k="ghp:bar:"+b.getAttribute("data-id"),t=+(d>0?localStorage:sessionStorage).getItem(k);h=t>0&&(d<=0||n-t<d*864e5)}catch(x){}}if(h)b.hidden=true})()</script>`;
}

/** Inline config consumed by promo.js on the website (saves a request). */
export const promoDataScript = (p: PublicPromo) => `<script type="application/json" id="ghp-data">${JSON.stringify(p).replace(/</g, '\\u003c')}</script>`;
export const hasPromo = (p: PublicPromo) => !!(p.bar || p.popups.length);
