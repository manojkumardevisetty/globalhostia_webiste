// HTML-string components for the Hostpen theme. Every piece of data is escaped with `esc`.
// Arguments named *Html are trusted markup produced by other components.
// Behaviour is wired by /hp/theme.js through classes and data attributes (no inline JS).
import { esc } from '../render/util';
import { deriveSpecs, SPEC_LABEL } from '../render/specs';
import { CYCLE_MONTHS, money } from '../pricing';
import { cycles, orderUrl, fromPrice, type TTld } from './data';
import type { RProduct } from '../render/products';

/* ------------------------------------------------------------------ icons */
// Lucide-style 24px stroke icons, emitted once as a sprite by the shell; icon() references them.
const ICONS: Record<string, string> = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  coin: '<circle cx="12" cy="12" r="10"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  server: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01M10 7h4M10 17h4"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  wp: '<circle cx="12" cy="12" r="10"/><path d="M4.5 8.5 8.5 19l3-8 3 8 4-10.5M6.5 8.5h4M13.5 8.5h4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  win: '<path d="M3 5.5 10.5 4.5v7H3zM13 4.2 21 3v8.5h-8zM3 13.5h7.5v6.9L3 19.5zM13 13.5h8V21l-8-1.1z"/>',
  term: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/>',
  flow: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h5a3 3 0 0 1 3 3v6"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  transfer: '<path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/>',
  tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  kanban: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4"/>',
  life: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>',
  drive: '<path d="M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  headset: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  move: '<path d="M3 7h13M12 3l4 4-4 4M21 17H8M12 13l-4 4 4 4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  net: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5V12M12 12l-5.2 5.2M12 12l5.2 5.2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  gauge: '<path d="M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0"/>',
  rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  trend: '<path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  award: '<circle cx="12" cy="8" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  hdd: '<path d="M22 12H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>',
  memory: '<path d="M6 19v-3M10 19v-3M14 19v-3M18 19v-3M8 11V9M16 11V9M12 11V9M2 15h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1.1a2 2 0 0 0 0 3.837V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.1a2 2 0 0 0 0-3.837Z"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>',
  git: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12"/>',
  store: '<path d="M3 9l1.5-5h15L21 9M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 21v-6h6v6"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  whatsapp: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
};
export type IconName = keyof typeof ICONS | string;
export const ICON_NAMES = Object.keys(ICONS);

/** Inline SVG icon (references the sprite emitted by the shell). Unknown names fall back to "check". */
export const icon = (name: IconName, cls = '') =>
  `<svg class="hp-ico${cls ? ' ' + esc(cls) : ''}" aria-hidden="true" focusable="false"><use href="#i-${esc(ICONS[name] ? name : 'check')}"/></svg>`;
/** Standalone inline SVG (no sprite needed), e.g. for content injected outside the shell. */
export const iconInline = (name: IconName, cls = '') =>
  `<svg class="hp-ico${cls ? ' ' + esc(cls) : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.check}</svg>`;
/** The <svg><defs> sprite — emitted once by shell.page(). */
export const iconSprite = () =>
  `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join('')}</defs></svg>`;
/** Icon inside the hexagon tile. */
export const hexIcon = (name: IconName) => `<i class="hp-hexi">${icon(name)}</i>`;

/* ------------------------------------------------------------------ small pieces */
export type Cta = { label: string; href: string; variant?: 'brand' | 'ghost' | 'dark' | 'light' | 'outline'; icon?: IconName; attrs?: string; ariaLabel?: string };
/** Button link. `attrs` is trusted raw attribute text (e.g. 'data-focus-domain'). */
export const button = (c: Cta) =>
  `<a class="hp-btn hp-btn--${c.variant || 'brand'}" href="${esc(c.href)}"${c.ariaLabel ? ` aria-label="${esc(c.ariaLabel)}"` : ''}${c.attrs ? ' ' + c.attrs : ''}>${c.icon ? icon(c.icon) : ''}${esc(c.label)}</a>`;
export const link = (label: string, href: string, ic: IconName = 'arrow') => `<a class="hp-link" href="${esc(href)}">${esc(label)}${icon(ic)}</a>`;
export const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const uid = (() => { let n = 0; return (p: string) => `${p}${(++n).toString(36)}`; })();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

/** Section heading with the gold underline. align 'left' for left-aligned heads. */
export function sectionHead(o: { title: string; lead?: string; id?: string; align?: 'center' | 'left'; level?: 2 | 3 }) {
  const h = `h${o.level || 2}`;
  return `<div class="hp-sec-head${o.align === 'left' ? ' hp-sec-head--left' : ''}" data-reveal><${h}${o.id ? ` id="${esc(o.id)}"` : ''} class="hp-hline">${esc(o.title)}</${h}>${o.lead ? `<p>${esc(o.lead)}</p>` : ''}</div>`;
}
/** Two-column heading: title left, lead right with a gold rule. */
export const splitHead = (o: { title: string; lead?: string; id?: string }) =>
  `<div class="hp-split-head" data-reveal><h2${o.id ? ` id="${esc(o.id)}"` : ''} class="hp-hline">${esc(o.title)}</h2>${o.lead ? `<p>${esc(o.lead)}</p>` : ''}</div>`;

/** Breadcrumb trail (+ use breadcrumbJsonLd for structured data). Last item is the current page. */
export function breadcrumbs(items: { label: string; href?: string }[], o: { light?: boolean } = {}) {
  return `<nav class="hp-crumbs${o.light ? ' hp-crumbs--light' : ''}" aria-label="Breadcrumb"><ol>${items.map((c, i) =>
    i === items.length - 1 || !c.href ? `<li><span aria-current="page">${esc(c.label)}</span></li>` : `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`).join('')}</ol></nav>`;
}
export const breadcrumbJsonLd = (items: { label: string; href?: string }[], siteUrl: string) => ld({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, ...(c.href ? { item: new URL(c.href, siteUrl || 'https://globalhostia.com').toString() } : {}) })),
});

/** Inner-page hero: dark band, hex texture, network canvas, breadcrumb, copy left, visual right. */
export function pageHero(o: {
  eyebrow?: string; title: string; lead?: string; ctas?: Cta[]; visualHtml?: string; image?: string;
  crumbs?: { label: string; href?: string }[]; fromHtml?: string; trust?: string[]; network?: boolean; id?: string;
}) {
  const solo = !o.visualHtml;
  return `<section class="hp-hero hp-hero--page${solo ? ' is-solo' : ''}"${o.network === false ? '' : ' data-network'}${o.id ? ` id="${esc(o.id)}"` : ''}>
  ${o.image ? `<img class="hp-hero__bg" src="${esc(o.image)}" alt="" fetchpriority="high" decoding="async">` : ''}<div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="hp-container">
    <div class="hp-hero__copy">
      ${o.crumbs?.length ? breadcrumbs(o.crumbs) : ''}
      ${o.eyebrow ? `<span class="hp-kicker"><i aria-hidden="true"></i>${esc(o.eyebrow)}</span>` : ''}
      <h1 data-words>${esc(o.title)}</h1>
      ${o.lead ? `<p class="hp-lead">${esc(o.lead)}</p>` : ''}
      ${o.ctas?.length ? `<div class="hp-actions">${o.ctas.map(button).join('')}</div>` : ''}
      ${o.fromHtml ? `<p class="hp-from">${o.fromHtml}</p>` : ''}
      ${o.trust?.length ? trustRow(o.trust) : ''}
    </div>
    ${solo ? '' : `<div class="hp-hero__visual">${o.visualHtml}</div>`}
  </div>
</section>`;
}

/** Row of small check-marked trust points. */
export const trustRow = (items: string[] = ['Free SSL certificate', 'Daily backups', '24/7 support', 'Free domain transfer']) =>
  `<ul class="hp-trust">${items.map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul>`;

/* ------------------------------------------------------------------ pricing */
const UNIT: Record<string, string> = { monthly: '/ month', quarterly: '/ quarter', semiannually: '/ 6 months', annually: '/ year', biennially: '/ 2 years', triennially: '/ 3 years', onetime: 'one-time', free: '' };
const BILLED: Record<string, string> = { monthly: 'Billed monthly', quarterly: 'Billed every 3 months', semiannually: 'Billed every 6 months', annually: 'Billed yearly', biennially: 'Billed every 2 years', triennially: 'Billed every 3 years', onetime: 'One-time payment', free: '' };
const CYCLE_NAME: Record<string, string> = { monthly: 'Monthly', quarterly: 'Quarterly', semiannually: '6 months', annually: 'Yearly', biennially: '2 years', triennially: '3 years' };
const splitPrefix = (prefix: string) => esc(prefix || '$');

type PriceCtx = { currency: string; base: string };
type Cyc = ReturnType<typeof cycles>[number];

/** Pick the cycle shown for a product: requested → product.displayCycle → cheapest per month. */
function pickCycle(p: RProduct, currency: string, want?: string): Cyc | null {
  const cs = cycles(p, currency).filter((c) => Number.isFinite(c.price));
  if (!cs.length) return null;
  return (want && cs.find((c) => c.cycle === want))
    || (p.displayCycle && p.displayCycle !== 'auto' && cs.find((c) => c.cycle === p.displayCycle))
    || cs.reduce((a, b) => (b.perMonth < a.perMonth ? b : a));
}

/** Price block for one cycle; a product without prices shows "See price" linking to its order URL. */
function priceHtml(p: RProduct, c: Cyc | null, ctx: PriceCtx, monthlyRef?: Cyc) {
  if (!c) {
    return `<div class="hp-price hp-price--na"><a class="hp-price__amt" href="${esc(orderUrl(p, ctx.base))}">See price</a></div><p class="hp-plan__meta">Confirmed live in the order form</p>`;
  }
  if (c.cycle === 'free' || c.price === 0) return `<div class="hp-price num"><span class="hp-price__amt">Free</span></div><p class="hp-plan__meta">No charge</p>`;
  const months = CYCLE_MONTHS[c.cycle] || 0;
  const meta: string[] = [];
  if (BILLED[c.cycle]) meta.push(BILLED[c.cycle]);
  if (months > 1) meta.push(`about ${money(c.perMonth, c.prefix)} a month`);
  if (monthlyRef && months > 1) { const save = Math.round((1 - c.perMonth / monthlyRef.price) * 100); if (save >= 3) meta.push(`save ${save}%`); }
  if (c.setup > 0) meta.push(`plus ${money(c.setup, c.prefix)} setup`);
  return `<div class="hp-price num"><span class="hp-price__cur">${splitPrefix(c.prefix)}</span><span class="hp-price__amt">${c.price.toFixed(2)}</span><span class="hp-price__per">${esc(UNIT[c.cycle] ?? '')}</span></div><p class="hp-plan__meta">${esc(meta.join(', '))}</p>`;
}

/** Compact "from $X/mo" text for a product (escaped), or '' when unpriced. */
export function fromText(p: RProduct, currency = 'USD') {
  const f = fromPrice(p, currency);
  if (!f) return '';
  return f.months > 1 ? `${money(f.price, f.prefix)} ${UNIT[f.cycle]}` : `${money(f.price, f.prefix)}${f.cycle === 'monthly' ? ' / month' : ''}`;
}

const CHECK_LI = (t: string) => `<li>${icon('check')}<span>${esc(t)}</span></li>`;
const OFF_LI = (t: string) => `<li class="is-off">${icon('x')}<span><span class="sr-only">Not included: </span>${esc(t)}</span></li>`;
/** Feature list; a leading "-" marks a feature as not included. Lists longer than `limit` collapse. */
export function featureList(features: string[], limit = 7) {
  const li = (f: string) => (f.trim().startsWith('-') ? OFF_LI(f.trim().replace(/^-\s*/, '')) : CHECK_LI(f.trim()));
  const fs = features.filter((f) => f && f.trim());
  if (fs.length <= limit + 1) return `<ul class="hp-feat">${fs.map(li).join('')}</ul>`;
  return `<ul class="hp-feat">${fs.slice(0, limit).map(li).join('')}</ul><details class="hp-feat-more"><summary>Show all ${fs.length} features</summary><ul class="hp-feat">${fs.slice(limit).map(li).join('')}</ul></details>`;
}

function specSummary(p: RProduct) {
  const s = deriveSpecs(p.features, p.attributes);
  return [s.cpu, s.ram].filter(Boolean).join(', ');
}

export type PlanOpts = {
  currency: string; base: string;
  /** product slug, index, 'auto' (featured / "popular" badge / middle card) or false */
  highlight?: string | number | false | 'auto';
  /** show a billing-cycle switch when products share 2+ cycles (default true) */
  cycleSwitch?: boolean;
  /** cycle selected first ('annually', 'monthly'…); default: cheapest per-month of the first product */
  defaultCycle?: string;
  /** split into tabs by datacenter location (shorthand for groupBy 'location') */
  locationTabs?: boolean;
  /** split into tabs by a spec key ('location', 'os'), 'category', or a function */
  groupBy?: string | ((p: RProduct) => string);
  groupLabel?: string; // aria-label of the group switch, e.g. "Hosting location"
  categoryNames?: Record<string, string>; // categoryId|slug → label when groupBy 'category'
  orderLabel?: string; // button text, default "Order now"
  layout?: 'auto' | 'featured' | 'cards' | 'grid' | 'list';
  note?: string; // text on the left of the controls bar
  barHtml?: string; // extra trusted markup on the right of the controls bar
  id?: string;
  details?: boolean; // "View details" link to /p/<slug> (default true)
  emptyTitle?: string; emptyText?: string; contactHref?: string;
  pageSize?: number; // list mode page size (default 15)
};

/** Choose the highlighted index for a set of cards. */
function hlIndex(items: RProduct[], h: PlanOpts['highlight']) {
  if (h === false) return -1;
  if (typeof h === 'number') return h;
  if (typeof h === 'string' && h !== 'auto') return items.findIndex((p) => p.slug === h);
  const f = items.findIndex((p) => p.featured); if (f >= 0) return f;
  const b = items.findIndex((p) => /popular|best|recommend/i.test(p.badge)); if (b >= 0) return b;
  return items.length === 3 || items.length === 4 ? 1 : -1;
}

const isSoftBadge = (b: string) => /^(eol|out|sold ?out|end of life|discontinued|retired)$/i.test(b.trim());

type Views = { cycles: string[]; group: string } | null;

/** price + order href for the default cycle, plus [data-cv] alternates when a cycle switch exists. */
function priceViews(p: RProduct, ctx: PriceCtx, views: Views, def: string | undefined) {
  const cs = cycles(p, ctx.currency).filter((c) => Number.isFinite(c.price));
  const monthly = cs.find((c) => c.cycle === 'monthly');
  if (!views) {
    const c = pickCycle(p, ctx.currency, def);
    return { html: priceHtml(p, c, ctx, monthly), href: orderUrl(p, ctx.base, c?.cycle), attrs: '', sort: c ? c.perMonth : 1e9 };
  }
  let html = '', attrs = '', href = '', sort = 1e9;
  for (const v of views.cycles) {
    const c = pickCycle(p, ctx.currency, v);
    const u = orderUrl(p, ctx.base, c?.cycle);
    html += `<div data-cv="${esc(v)}" data-cv-group="${esc(views.group)}"${v === def ? '' : ' hidden'}>${priceHtml(p, c, ctx, monthly)}</div>`;
    attrs += ` data-href-${esc(v)}="${esc(u)}"`;
    if (v === def) { href = u; sort = c ? c.perMonth : 1e9; }
  }
  return { html, href, attrs, sort };
}

function planCard(p: RProduct, i: number, hl: boolean, ctx: PriceCtx, views: Views, def: string | undefined, o: PlanOpts) {
  const pv = priceViews(p, ctx, views, def);
  const badge = p.badge || (hl ? 'Recommended' : '');
  const soft = !hl || isSoftBadge(badge);
  const sub = p.tagline || specSummary(p);
  const unpriced = !cycles(p, ctx.currency).length;
  const label = unpriced ? 'See price and order' : o.orderLabel || 'Order now';
  return `<article class="hp-plan${hl ? ' is-hl' : ''}" data-reveal style="--i:${i % 4}">${badge ? `<span class="hp-badge${soft ? ' hp-badge--soft' : ''}">${esc(badge)}</span>` : ''}
  <div class="hp-plan__top"><h3>${esc(p.name)}</h3><p class="hp-plan__sub">${esc(sub)}</p>${pv.html}</div>
  <div class="hp-plan__body">${featureList(p.features)}</div>
  <div class="hp-plan__foot"><a class="hp-btn hp-btn--${hl ? 'brand' : 'ghost'}" href="${esc(pv.href)}"${pv.attrs} aria-label="${esc(`${label}: ${p.name}`)}">${esc(label)}</a>${o.details === false ? '' : `<a class="hp-link" href="/p/${esc(p.slug)}">View details</a>`}</div>
</article>`;
}

function featuredCard(p: RProduct, ctx: PriceCtx, views: Views, def: string | undefined, o: PlanOpts) {
  const pv = priceViews(p, ctx, views, def);
  const specs = deriveSpecs(p.features, p.attributes);
  const rows = Object.entries(specs).filter(([k]) => SPEC_LABEL[k]).slice(0, 6);
  const used = new Set(rows.map(([, v]) => v));
  const unpriced = !cycles(p, ctx.currency).length;
  return `<article class="hp-pfeature" data-reveal>
  <div class="hp-pfeature__main">${p.badge ? `<span class="hp-badge">${esc(p.badge)}</span>` : ''}<h3>${esc(p.name)}</h3>${p.tagline ? `<p class="hp-plan__sub">${esc(p.tagline)}</p>` : ''}
    ${pv.html}
    <div class="hp-actions"><a class="hp-btn hp-btn--light" href="${esc(pv.href)}"${pv.attrs}>${esc(unpriced ? 'See price and order' : o.orderLabel || 'Order now')}</a>${o.details === false ? '' : `<a class="hp-btn hp-btn--outline" href="/p/${esc(p.slug)}">View details</a>`}</div>
  </div>
  <div class="hp-pfeature__side">
    ${rows.length ? `<dl class="hp-specs">${rows.map(([k, v]) => `<div><dt>${esc(SPEC_LABEL[k])}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${featureList(p.features.filter((f) => !used.has(f) && !rows.some(([, v]) => f.startsWith(v))), 10)}
  </div>
</article>`;
}

function listView(items: RProduct[], ctx: PriceCtx, views: Views, def: string | undefined, o: PlanOpts, id: string) {
  const specOf = items.map((p) => deriveSpecs(p.features, p.attributes));
  const count = (k: string) => specOf.filter((s) => s[k]).length;
  const cols = ['cpu', 'ram', 'storage', 'bandwidth', 'location', 'websites', 'email', 'os'].filter((k) => count(k) >= items.length / 2).slice(0, 3);
  const filterKeys = ['location', 'os', 'ram', 'storage'].filter((k) => { const vals = new Set(specOf.map((s) => s[k]).filter(Boolean)); return vals.size >= 2 && vals.size <= 12; }).slice(0, 2);
  const page = o.pageSize ?? 15;
  const rows = items.map((p, i) => {
    const pv = priceViews(p, ctx, views, def), s = specOf[i];
    const priceCell = pv.html.replace(/<p class="hp-plan__meta">/g, '<span class="hp-plan__meta">').replace(/<\/p>/g, '</span>');
    const unpriced = !cycles(p, ctx.currency).length;
    return `<div class="hp-prow" role="row" data-idx="${i}" data-name="${esc(p.name.toLowerCase())}" data-price="${pv.sort < 1e9 ? pv.sort.toFixed(4) : ''}" data-search="${esc([p.name, p.tagline, ...p.features].join(' ').toLowerCase())}"${filterKeys.map((k) => ` data-f-${k}="${esc(s[k] || '')}"`).join('')}>
    <div class="hp-prow__name" role="cell"><a href="/p/${esc(p.slug)}">${esc(p.name)}</a>${p.badge ? `<span class="hp-badge hp-badge--inline${isSoftBadge(p.badge) ? ' hp-badge--soft' : ''}">${esc(p.badge)}</span>` : ''}${p.tagline ? `<small>${esc(p.tagline)}</small>` : ''}</div>
    ${cols.map((k) => `<div class="hp-prow__spec" role="cell" data-label="${esc(SPEC_LABEL[k] || k)}">${esc(s[k] || '—')}</div>`).join('')}
    <div class="hp-prow__price" role="cell">${priceCell}</div>
    <div class="hp-prow__cta" role="cell"><a class="hp-btn hp-btn--brand" href="${esc(pv.href)}"${pv.attrs} aria-label="${esc(`${unpriced ? 'See price' : 'Order'}: ${p.name}`)}">${unpriced ? 'See price' : 'Order'}</a></div>
  </div>`;
  }).join('');
  const opts = (k: string) => [...new Set(specOf.map((s) => s[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return `<div class="hp-plist" data-plist data-page="${items.length > page ? page : 0}">
  <div class="hp-plist__bar">
    <label class="hp-plist__search"><span class="sr-only">Search plans</span><input class="hp-input" style="width:100%" type="search" placeholder="Search ${items.length} plans" data-plist-search></label>
    <label><span class="sr-only">Sort plans</span><select class="hp-select" data-plist-sort><option value="">Recommended order</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name</option></select></label>
    ${filterKeys.map((k) => `<label><span class="sr-only">Filter by ${esc((SPEC_LABEL[k] || k).toLowerCase())}</span><select class="hp-select" data-plist-filter="${k}"><option value="">Any ${esc((SPEC_LABEL[k] || k).toLowerCase())}</option>${opts(k).map((v) => `<option>${esc(v)}</option>`).join('')}</select></label>`).join('')}
    <span class="hp-plist__count" aria-live="polite" data-plist-count>${items.length} plans</span>
  </div>
  <div class="hp-plist__table" role="table" aria-label="Plans" id="${esc(id)}-t">
    <div class="hp-prow hp-prow--head" role="row" style="--cols:${cols.length}"><div role="columnheader">Plan</div>${cols.map((k) => `<div role="columnheader">${esc(SPEC_LABEL[k] || k)}</div>`).join('')}<div role="columnheader">Price</div><div role="columnheader"><span class="sr-only">Order</span></div></div>
    <div data-plist-body style="--cols:${cols.length}" role="rowgroup">${rows.replace(/class="hp-prow"/g, `class="hp-prow" style="--cols:${cols.length}"`)}</div>
    <p class="hp-plist__empty" data-plist-empty hidden>No plans match. Clear the search or filters to see every plan.</p>
  </div>
  <div class="hp-plist__more" data-plist-more hidden><button type="button" class="hp-btn hp-btn--ghost">Show more plans</button></div>
</div>`;
}

/** Empty state with a contact CTA. */
export function emptyState(o: { title?: string; text?: string; contactHref?: string; icon?: IconName } = {}) {
  return `<div class="hp-empty">${hexIcon(o.icon || 'headset')}<h3>${esc(o.title || 'Plans are being updated')}</h3><p>${esc(o.text || 'There are no plans listed here right now. Tell us what you need and our team will send you a quote.')}</p><div class="hp-actions">${button({ label: 'Talk to sales', href: o.contactHref || '/contact' })}</div></div>`;
}

function paneBody(items: RProduct[], ctx: PriceCtx, views: Views, def: string | undefined, o: PlanOpts, id: string) {
  const n = items.length;
  const mode = o.layout && o.layout !== 'auto' ? o.layout : n === 0 ? 'empty' : n === 1 ? 'featured' : n <= 4 ? 'cards' : n <= 12 ? 'grid' : 'list';
  if (!n) return emptyState({ title: o.emptyTitle, text: o.emptyText, contactHref: o.contactHref });
  if (mode === 'featured') return items.map((p) => featuredCard(p, ctx, views, def, o)).join('');
  if (mode === 'list') return listView(items, ctx, views, def, o, id);
  const hl = hlIndex(items, o.highlight ?? 'auto');
  const cls = mode === 'grid' ? 'hp-plans--grid' : `hp-plans--n${Math.min(n, 4) === 3 ? 3 : Math.min(n, 4)}`;
  return `<div class="hp-plans ${cls}">${items.map((p, i) => planCard(p, i, i === hl, ctx, views, def, o)).join('')}</div>`;
}

/**
 * Adaptive plan presentation: 0 → empty state, 1 → featured, 2–4 → aligned cards (middle highlighted),
 * 5–12 → grid, 13+ → searchable/filterable list. Optional group tabs (location/os/category) and a billing-cycle switch.
 */
export function planCards(products: RProduct[], o: PlanOpts) {
  const ctx = { currency: o.currency, base: o.base };
  const id = o.id || uid('hp-plans-');
  const groupBy = o.groupBy || (o.locationTabs ? 'location' : undefined);
  const keyOf = (p: RProduct): string => {
    if (!groupBy) return '';
    if (typeof groupBy === 'function') return groupBy(p) || 'Other';
    if (groupBy === 'category') return (o.categoryNames && (o.categoryNames[p.categoryId || ''])) || p.categoryId || 'Other';
    return deriveSpecs(p.features, p.attributes)[groupBy] || 'Other';
  };
  const groups: { key: string; items: RProduct[] }[] = [];
  for (const p of products) { const k = keyOf(p); let g = groups.find((x) => x.key === k); if (!g) groups.push((g = { key: k, items: [] })); g.items.push(p); }
  if (!groups.length) groups.push({ key: '', items: [] });

  // billing-cycle views shared by at least half the priced products
  let views: Views = null, def = o.defaultCycle;
  if (o.cycleSwitch !== false) {
    const priced = products.filter((p) => cycles(p, o.currency).length);
    const tally = new Map<string, number>();
    priced.forEach((p) => cycles(p, o.currency).forEach((c) => { if (CYCLE_NAME[c.cycle]) tally.set(c.cycle, (tally.get(c.cycle) || 0) + 1); }));
    const shared = [...tally.entries()].filter(([, n]) => n >= Math.max(2, priced.length / 2)).map(([c]) => c)
      .sort((a, b) => (CYCLE_MONTHS[a] || 0) - (CYCLE_MONTHS[b] || 0));
    const pick = shared.length > 3 ? [shared[0], ...(shared.includes('annually') ? ['annually'] : []), shared[shared.length - 1]].filter((v, i, a) => a.indexOf(v) === i) : shared;
    if (pick.length >= 2) {
      views = { cycles: pick, group: `${id}-cycle` };
      if (!def || !pick.includes(def)) { const f = priced[0] && pickCycle(priced[0], o.currency); def = f && pick.includes(f.cycle) ? f.cycle : pick[pick.length - 1]; }
    }
  }
  const monthlyAll = products.map((p) => cycles(p, o.currency));
  const save = views && views.cycles.includes('monthly')
    ? Math.max(0, ...monthlyAll.map((cs) => { const m = cs.find((c) => c.cycle === 'monthly'); const longest = cs.filter((c) => views!.cycles.includes(c.cycle)).pop(); return m && longest && longest !== m ? Math.round((1 - longest.perMonth / m.price) * 100) : 0; }))
    : 0;
  const cycleSeg = views ? `<div class="hp-seg" role="radiogroup" aria-label="Billing period" data-tabs="${esc(views.group)}" data-scope="#${esc(id)}"><span class="hp-seg__thumb" aria-hidden="true"></span>${views.cycles.map((c, i) =>
    `<button type="button" role="radio" aria-checked="${c === def}" data-v="${esc(c)}"${c === def ? '' : ' tabindex="-1"'}>${esc(CYCLE_NAME[c] || c)}${i === views!.cycles.length - 1 && save >= 5 ? `<small>save up to ${save}%</small>` : ''}</button>`).join('')}</div>` : '';
  const multi = groups.length > 1;
  const groupSeg = multi ? `<div class="hp-seg" role="tablist" aria-label="${esc(o.groupLabel || 'Choose an option')}" data-tabs><span class="hp-seg__thumb" aria-hidden="true"></span>${groups.map((g, i) =>
    `<button type="button" role="tab" id="${esc(id)}-t${i}" aria-controls="${esc(id)}-p${i}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${esc(g.key)}</button>`).join('')}</div>` : '';
  const bar = o.note || groupSeg || cycleSeg || o.barHtml
    ? `<div class="hp-panel-bar">${o.note ? `<p>${esc(o.note)}</p>` : '<span></span>'}<div class="hp-panel-bar__ctrls">${groupSeg}${cycleSeg}${o.barHtml || ''}</div></div>` : '';
  const panes = groups.map((g, i) => multi
    ? `<div class="hp-tabpanel" role="tabpanel" id="${esc(id)}-p${i}" aria-labelledby="${esc(id)}-t${i}" data-pane${i ? ' hidden' : ''}>${paneBody(g.items, ctx, views, def, o, `${id}-${i}`)}</div>`
    : paneBody(g.items, ctx, views, def, o, `${id}-${i}`)).join('');
  return `<div class="hp-planset" id="${esc(id)}" data-layout="${products.length}">${bar}${panes}</div>`;
}

/** Feature-by-feature comparison table across products (specs first, then feature checks). */
export function specTable(products: RProduct[], o: { currency?: string; caption?: string } = {}) {
  if (!products.length) return '';
  const lines = new Map<string, string[]>();
  products.forEach((p, i) => {
    const specs = deriveSpecs(p.features, p.attributes);
    for (const [k, v] of Object.entries(specs)) { const key = SPEC_LABEL[k] || k; if (!lines.has(key)) lines.set(key, Array(products.length).fill('<span class="hp-no">—</span>')); lines.get(key)![i] = esc(v); }
    const used = new Set(Object.values(specs));
    for (const f of p.features) {
      const t = f.trim().replace(/^-\s*/, '');
      if (!t || used.has(f.trim())) continue;
      if (!lines.has(t)) lines.set(t, Array(products.length).fill(`<span class="hp-no">${icon('minus')}<span class="sr-only">Not included</span></span>`));
      lines.get(t)![i] = f.trim().startsWith('-') ? `<span class="hp-no">${icon('x')}<span class="sr-only">Not included</span></span>` : `<span class="hp-yes">${icon('check')}<span class="sr-only">Included</span></span>`;
    }
  });
  const price = (p: RProduct) => { const t = fromText(p, o.currency || 'USD'); return t ? esc(t) : 'See price'; };
  return `<div class="hp-table-wrap" data-reveal><table class="hp-table">${o.caption ? `<caption class="sr-only">${esc(o.caption)}</caption>` : ''}
  <thead><tr><th scope="col"><span class="sr-only">Feature</span></th>${products.map((p) => `<th scope="col">${esc(p.name)}<small class="num">${price(p)}</small></th>`).join('')}</tr></thead>
  <tbody>${[...lines.entries()].map(([k, v]) => `<tr><th scope="row">${esc(k)}</th>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/* ------------------------------------------------------------------ domain search */
/** Domain search panel posting to WHMCS cart (GET cart.php?a=add&domain=register&query=). Prices from `tlds` only. */
export function domainSearch(o: {
  tlds: TTld[]; base: string; compact?: boolean; title?: string; id?: string; max?: number; value?: string;
  moreHref?: string; note?: string; typing?: string[]; headingLevel?: 2 | 3; flat?: boolean; prefix?: string;
}) {
  const id = o.id || 'domain-q';
  const priced = o.tlds.filter((t) => t.register !== null);
  const list = [...priced.filter((t) => t.featured), ...priced.filter((t) => !t.featured)].slice(0, o.max ?? 5);
  const h = `h${o.headingLevel || 2}`;
  const typing = (o.typing || ['yourbrand.com', 'mystore.shop', 'cloudapp.net', 'studio.live', 'greenleaf.org']).join('|');
  const cur = list[0]?.currency || 'USD';
  return `<div class="hp-dpanel${o.compact ? ' hp-dpanel--compact' : ''}">
  ${o.title === '' ? '' : `<div class="hp-dhead"><${h} id="${esc(id)}-h">${esc(o.title || 'Find your domain')}</${h}>${o.moreHref ? `<a class="hp-link" href="${esc(o.moreHref)}">${icon('search')}Search multiple domains</a>` : ''}</div>`}
  <form class="hp-dform" action="${esc(o.base)}/cart.php" method="get" role="search" data-domain-form${o.title === '' ? '' : ` aria-labelledby="${esc(id)}-h"`}>
    <input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="register">
    <div class="hp-dfield">${icon('globe')}<label class="sr-only" for="${esc(id)}">Domain name</label>
      <input id="${esc(id)}" name="query" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type the name you want, for example yourbrand" value="${esc(o.value || '')}" data-typing="${esc(typing)}" required></div>
    <button class="hp-btn hp-btn--brand" type="submit">${icon('search')}Search</button>
  </form>
  ${list.length ? `<fieldset class="hp-tlds"><legend class="sr-only">Extension to add when you type a name without one</legend><span class="hp-lbl" aria-hidden="true">Extensions</span>${list.map((t, i) =>
    `<span class="hp-tld" style="--k:${i}"><input type="radio" name="${esc(id)}-tld" id="${esc(id)}-${i}" value="${esc(t.tld)}"${i === 0 ? ' checked' : ''}><label for="${esc(id)}-${i}"><span class="hp-bx">${icon('check')}</span><b>${esc(t.tld)}</b><span class="hp-p num">${esc(money(t.register!, o.prefix || '$'))}</span></label></span>`).join('')}</fieldset>` : ''}
  ${o.note === '' ? '' : `<p class="hp-dnote">${esc(o.note || `First-year prices in ${cur}. The renewal price is shown before you pay.`)}</p>`}
</div>`;
}

/* ------------------------------------------------------------------ content blocks */
export type FeatureItem = { icon: IconName; title: string; text: string };
/** Grid of hexagon-icon features (icons draw in on reveal). cols 2|3|4. */
export const featureGrid = (items: FeatureItem[], o: { cols?: 2 | 3 | 4 } = {}) =>
  `<div class="hp-fgrid${o.cols && o.cols !== 3 ? ` hp-fgrid--${o.cols}` : ''}">${items.map((f, i) =>
    `<div class="hp-fitem" data-reveal style="--i:${i % (o.cols || 3)}">${hexIcon(f.icon)}<div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div></div>`).join('')}</div>`;

export type StatItem = { value: string; suffix?: string; label: string };
/** Stat tiles; numeric values count up on reveal. Dark by default, `light` for white sections. */
export const statRow = (items: StatItem[], o: { light?: boolean; cols?: 2 | 4 } = {}) =>
  `<div class="hp-stats${o.cols === 4 ? ' hp-stats--4' : ''}${o.light ? ' hp-stats--light' : ''}">${items.map((s, i) =>
    `<div class="hp-stat" data-reveal style="--i:${i}"><b class="num"${/^\d[\d,]*(\.\d+)?$/.test(s.value) ? ' data-count' : ''}>${esc(s.value)}${s.suffix ? `<em>${esc(s.suffix)}</em>` : ''}</b><span>${esc(s.label)}</span></div>`).join('')}</div>`;

/** FAQ accordion. `single` keeps one open at a time; first item open by default. */
export function faq(items: { q: string; a: string; icon?: IconName }[], o: { id?: string; single?: boolean; openFirst?: boolean; icons?: boolean } = {}) {
  const id = o.id || uid('faq');
  return `<div class="hp-faq${o.icons ? ' hp-faq--icons' : ''}" data-acc${o.single ? '="single"' : ''}>${items.map((it, i) => {
    const open = (o.openFirst ?? true) && i === 0;
    return `<div class="hp-acc__item${open ? ' is-open' : ''}"><h3><button type="button" class="hp-acc__q" aria-expanded="${open}" aria-controls="${id}-a${i}" id="${id}-q${i}">${o.icons ? hexIcon(it.icon || 'info') : ''}<span>${esc(it.q)}</span><span class="hp-acc__pm">${icon('plus')}</span></button></h3><div class="hp-acc__a" id="${id}-a${i}" role="region" aria-labelledby="${id}-q${i}"${open ? '' : ' hidden'}>${esc(it.a)}</div></div>`;
  }).join('')}</div>`;
}
export const faqJsonLd = (items: { q: string; a: string }[]) =>
  ld({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) });

const CUBE = (top: string) => `<svg viewBox="0 0 100 116" aria-hidden="true"><path d="M50 0 100 29 50 58 0 29Z" fill="${top}"/><path d="M0 29 50 58V116L0 87Z" fill="rgba(255,255,255,.34)"/><path d="M100 29 50 58V116L100 87Z" fill="rgba(255,255,255,.14)"/><path d="M50 0 100 29V87L50 116 0 87V29ZM50 58V116M50 58 100 29M50 58 0 29" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/></svg>`;
/** Raspberry CTA band with drifting hex cubes and a light sweep. */
export function ctaBand(o: { title: string; text?: string; primary: Cta; secondary?: Cta; id?: string }) {
  const hid = o.id ? `${o.id}-h` : uid('cta-h');
  return `<section class="hp-cta" aria-labelledby="${esc(hid)}"${o.id ? ` id="${esc(o.id)}"` : ''}>
  <div class="hp-cubes" aria-hidden="true">
    <span class="hp-cube c1" style="left:calc(50% + 628px);top:12%;width:116px;opacity:.26;--d:24s;--tx:-14px;--ty:18px;--rt:-5deg">${CUBE('rgba(253,215,0,.9)')}</span>
    <span class="hp-cube c2" style="left:57%;bottom:-40px;width:72px;opacity:.18;--d:19s;--dl:-6s;--tx:22px;--ty:6px">${CUBE('rgba(255,255,255,.6)')}</span>
    <span class="hp-cube c3" style="left:44%;top:-28px;width:46px;opacity:.14;--d:28s;--dl:-11s;--tx:-18px;--ty:-4px;--rt:8deg">${CUBE('rgba(255,255,255,.6)')}</span>
    <span class="hp-cube c4" style="right:calc(50% + 640px);bottom:14%;width:60px;opacity:.16;--d:21s;--dl:-3s;--tx:12px;--ty:-16px">${CUBE('rgba(255,255,255,.6)')}</span>
  </div>
  <div class="hp-container">
    <div><h2 id="${esc(hid)}">${esc(o.title)}</h2>${o.text ? `<p>${esc(o.text)}</p>` : ''}</div>
    <div class="hp-cta__acts">${button({ ...o.primary, variant: o.primary.variant || 'light' })}${o.secondary ? button({ ...o.secondary, variant: o.secondary.variant || 'outline' }) : ''}</div>
  </div>
</section>`;
}

/** Client-name marquee (pauses on hover / off-screen; static under reduced motion). */
export function logosStrip(o: { label?: string; names?: string[] } = {}) {
  const names = o.names?.length ? o.names : ['ADPList', '1Mentorship', 'INFRA', 'AllCode', 'Token247'];
  const span = (n: string, hidden: boolean) => `<span${hidden ? ' aria-hidden="true"' : ''}>${esc(n)}</span>`;
  return `<section class="hp-logos" aria-label="${esc(o.label || 'Clients')}"><div class="hp-container"><p class="hp-logos__lbl">${esc(o.label || 'Trusted by teams at')}</p>
  <div class="hp-marquee"><div class="hp-marquee__track">${names.map((n) => span(n, false)).join('')}${names.map((n) => span(n, true)).join('')}</div></div></div></section>`;
}

export type DC = [string, number, number];
/** Animated datacenter map (dark panel). dcs: [label, lat, lon][]; hq likewise. */
export function dcMap(o: { title?: string; caption?: string; dcs?: DC[]; hq?: DC; legend?: [string, string] } = {}) {
  const dcs = o.dcs || [['USA', 39, -77], ['Brazil', -23.5, -46.6], ['Algeria (EU)', 36.7, 3.1], ['South Africa', -26.2, 28], ['India', 19, 72.8], ['Russia', 55.7, 37.6]];
  const hq = o.hq || ['Dubai', 25.2, 55.3];
  const names = dcs.map((d) => d[0]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
  return `<figure class="hp-panel-dark hp-dcmap" data-reveal>
  <h3>${esc(o.title || 'Our datacenter network')}</h3><figcaption class="hp-cap">${esc(o.caption || `${dcs.length} datacenters, managed from our headquarters in ${hq[0]}.`)}</figcaption>
  <div class="hp-dcmap__stage" data-dcmap data-dcs="${esc(JSON.stringify(dcs))}" data-hq="${esc(JSON.stringify(hq))}" role="img" aria-label="${esc(`World map with datacenters in ${list}, each linked to ${hq[0]}`)}"><canvas aria-hidden="true"></canvas></div>
  <div class="hp-legend" aria-hidden="true"><span><i></i>${esc(o.legend?.[0] || 'Datacenter')}</span><span><i class="is-gold"></i>${esc(o.legend?.[1] || `${hq[0]} headquarters`)}</span></div>
</figure>`;
}

/** Animated bar chart in a dark panel. Values are plotted relative to the max. */
export function barChart(o: { title: string; caption?: string; bars: { label: string; value: number; top?: boolean }[]; legend?: { label: string; gold?: boolean }[]; unit?: string }) {
  if (!o.bars.length) return '';
  const max = Math.max(...o.bars.map((b) => b.value), 1);
  return `<figure class="hp-panel-dark hp-chart" data-reveal style="--n:${o.bars.length}">
  <h3>${esc(o.title)}</h3>${o.caption ? `<figcaption class="hp-cap">${esc(o.caption)}</figcaption>` : ''}
  <div class="hp-bars" data-inview role="img" aria-label="${esc(o.bars.map((b) => `${b.label} ${b.value}${o.unit ? ' ' + o.unit : ''}`).join(', '))}">${o.bars.map((b, i) =>
    `<div class="hp-bar${b.top ? ' is-top' : ''}" style="--i:${i}"><div class="hp-bar__col" style="--v:${((b.value / max) * 100).toFixed(1)}"><span class="hp-bar__val num">${esc(String(b.value))}</span></div></div>`).join('')}</div>
  <div class="hp-bar-labels" aria-hidden="true">${o.bars.map((b) => `<span>${esc(b.label)}</span>`).join('')}</div>
  ${o.legend?.length ? `<div class="hp-legend" aria-hidden="true">${o.legend.map((l) => `<span><i${l.gold ? ' class="is-gold"' : ''}></i>${esc(l.label)}</span>`).join('')}</div>` : ''}
</figure>`;
}

export type TabItem = { id?: string; label: string; sub?: string; icon?: IconName; panelHtml: string };
/** Big tabs with the sliding raspberry indicator (2–4 tabs), each controlling a panel. */
export function bigTabs(items: TabItem[], o: { label?: string; id?: string } = {}) {
  const id = o.id || uid('tabs');
  const ids = items.map((t, i) => t.id || `${id}-${slugify(t.label)}-${i}`);
  return `<div class="hp-tabs" role="tablist" aria-label="${esc(o.label || 'Choose a category')}" data-tabs style="--n:${items.length}"><span class="hp-tabs__ind" aria-hidden="true"></span>${items.map((t, i) =>
    `<button type="button" class="hp-tab" role="tab" id="${ids[i]}-t" aria-controls="${ids[i]}" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''}>${t.icon ? `<span class="hp-tab__ico">${icon(t.icon)}</span>` : ''}<span><strong>${esc(t.label)}</strong>${t.sub ? `<small class="num">${esc(t.sub)}</small>` : ''}</span></button>`).join('')}</div>
  ${items.map((t, i) => `<div class="hp-tabpanel" role="tabpanel" id="${ids[i]}" aria-labelledby="${ids[i]}-t" tabindex="0"${i ? ' hidden' : ''}>${t.panelHtml}</div>`).join('')}`;
}

/** Rating card + testimonial carousel. Reviews must be labelled `sample` until verified. */
export function testimonials(o: { score?: string; label?: string; reviews: { quote: string; who: string; meta?: string; avatar?: string; sample?: boolean }[] }) {
  const star = '<svg aria-hidden="true"><use href="#i-star"/></svg>';
  return `${o.score ? `<div class="hp-rating"><div class="hp-rating__score num">${esc(o.score)}<small>/5</small></div><div><div class="hp-stars" aria-hidden="true">${star.repeat(5)}</div><strong>${esc(o.label || 'Excellent')}</strong><p>Average customer rating</p></div></div>` : ''}
  <div class="hp-tst" data-carousel aria-roledescription="carousel" aria-label="Customer reviews">${o.reviews.map((r, i) =>
    `<div class="hp-tst__item${i ? '' : ' is-on'}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${o.reviews.length}">${r.sample !== false ? '<span class="hp-sample">Sample review, to be replaced with a verified customer review</span>' : ''}<blockquote>${esc(r.quote)}</blockquote><div class="hp-who">${r.avatar ? `<img src="${esc(r.avatar)}" alt="" width="44" height="44" loading="lazy">` : ''}<div><b>${esc(r.who)}</b>${r.meta ? `<span>${esc(r.meta)}</span>` : ''}</div></div></div>`).join('')}
    ${o.reviews.length > 1 ? `<div class="hp-tst__nav"><button type="button" data-step="-1" aria-label="Previous review">${icon('left')}</button><button type="button" data-step="1" aria-label="Next review">${icon('right')}</button></div>` : ''}
  </div>`;
}

/** Column heading used in the three-column row (hex bullet + raspberry underline). */
export const colHead = (t: string) => `<h2 class="hp-col-h"><i aria-hidden="true"></i>${esc(t)}</h2>`;

/** Article teaser rows (help center). */
export const articleList = (items: { title: string; meta?: string; href: string; image?: string }[]) =>
  items.map((a) => `<a class="hp-art" href="${esc(a.href)}">${a.image ? `<img src="${esc(a.image)}" alt="" width="104" height="78" loading="lazy">` : '<span></span>'}<div><h3>${esc(a.title)}</h3>${a.meta ? `<p>${esc(a.meta)}</p>` : ''}</div></a>`).join('');

/** "Prices shown live" note row under pricing. */
export const plansNote = (currency = 'USD', rightHtml = '') =>
  `<div class="hp-plans-note"><span class="hp-live"><i aria-hidden="true"></i>Prices shown live from our billing system, in ${esc(currency)}.</span>${rightHtml}</div>`;

/** Wrap content in a standard section. */
export const section = (inner: string, o: { id?: string; cls?: string; label?: string; labelledby?: string; dark?: boolean; tint?: boolean } = {}) =>
  `<section class="hp-section${o.dark ? ' hp-section--dark hp-on-dark' : ''}${o.tint ? ' hp-section--tint' : ''}${o.cls ? ' ' + esc(o.cls) : ''}"${o.id ? ` id="${esc(o.id)}"` : ''}${o.labelledby ? ` aria-labelledby="${esc(o.labelledby)}"` : o.label ? ` aria-label="${esc(o.label)}"` : ''}><div class="hp-container">${inner}</div></section>`;

export type Slide = { kicker: string; title: string; text: string; image: string; imageW?: number; imageH?: number; ctas: Cta[]; fromHtml?: string; dot?: string };
/** Homepage hero carousel: full-bleed image slides with a white card, progress dots, network canvas.
 *  The first slide's title is the page <h1>; others are <h2>. */
export function heroSlider(slides: Slide[], o: { label?: string; interval?: number } = {}) {
  return `<section class="hp-hero" data-hero-slider data-network${o.interval ? ` data-interval="${o.interval}"` : ''} aria-roledescription="carousel" aria-label="${esc(o.label || 'Featured products')}">
  <div class="hp-hero__hex" aria-hidden="true"></div>
  ${slides.map((s, i) => `<div class="hp-slide${i ? '' : ' is-active'}" id="hp-slide-${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}">
    <img class="hp-slide__img" src="${esc(s.image)}" alt="" width="${s.imageW || 1920}" height="${s.imageH || 1280}"${i ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">
    <div class="hp-container hp-slide__inner"><div class="hp-hcard">
      <span class="hp-kicker"><i aria-hidden="true"></i>${esc(s.kicker)}</span>
      <${i ? 'h2' : 'h1'} data-words>${esc(s.title)}</${i ? 'h2' : 'h1'}>
      <p>${esc(s.text)}</p>
      <div class="hp-actions">${s.ctas.map(button).join('')}</div>
      ${s.fromHtml ? `<div class="hp-from">${s.fromHtml}</div>` : ''}
    </div></div>
  </div>`).join('\n  ')}
  ${slides.length > 1 ? `<div class="hp-hnav"><div class="hp-container"><ol aria-label="Choose a slide">${slides.map((s, i) =>
    `<li><button type="button" class="hp-hdot" aria-current="${i === 0}" aria-controls="hp-slide-${i}"><span class="hp-hdot__lab">${esc(s.dot || s.kicker)}</span><span class="hp-hdot__track" aria-hidden="true"><span class="hp-hdot__fill"></span></span></button></li>`).join('')}</ol></div></div>` : ''}
</section>`;
}

/** Product filter helper: drop end-of-life / sold-out badged products when others remain. */
export const available = <T extends RProduct>(ps: T[]) => { const a = ps.filter((p) => !isSoftBadge(p.badge || '')); return a.length ? a : ps; };
