// Conversion + trust pieces shared by several Hostpen pages:
// the admin-editable trust strip (settings.trust_points), the floating WhatsApp button
// (settings.whatsapp / whatsapp_float) and helpers for the UAE landing pages.
import { esc } from '../render/util';
import type { Settings } from '../settings';
import { icon, type IconName } from './ui';

export type TrustPoint = { id: string; text: string; on: boolean; icon: IconName; href?: string };

/** Defaults; the owner can edit the wording or switch any line off in Admin → Settings → Trust & conversion. */
export const TRUST_DEFAULTS: TrustPoint[] = [
  { id: 'price-lock', text: 'Price-lock: your renewal price never goes up', on: true, icon: 'lock' },
  { id: 'money-back', text: '30-day money-back on shared hosting', on: true, icon: 'refresh' },
  { id: 'migration', text: 'Free website migration', on: true, icon: 'move', href: '/free-migration' },
  { id: 'support', text: '24/7 engineers by ticket & WhatsApp', on: true, icon: 'headset' },
  { id: 'payments', text: 'Pay by card or crypto', on: false, icon: 'card' },
];

function parse(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/** All trust points (defaults merged with the saved settings), in default order. */
export function trustPoints(s: Partial<Settings>): TrustPoint[] {
  const saved = parse(s.trust_points);
  const list = Array.isArray(saved) ? saved.filter((x) => x && typeof x.id === 'string') : [];
  return TRUST_DEFAULTS.map((d) => {
    const m = list.find((x: any) => x.id === d.id) as Partial<TrustPoint> | undefined;
    const text = typeof m?.text === 'string' && m.text.trim() ? m.text.trim().slice(0, 120) : d.text;
    return { ...d, text, on: m ? m.on !== false : d.on };
  });
}
/** Is a given claim switched on (used to hide dependent copy, e.g. "price-locked" or "money-back" rows)? */
export const trustOn = (s: Partial<Settings>, id: string) => !!trustPoints(s).find((p) => p.id === id && p.on);
/** Text of a claim when it is on, else ''. */
export const trustText = (s: Partial<Settings>, id: string) => trustPoints(s).find((p) => p.id === id && p.on)?.text || '';

/** "Price-lock: your renewal…" → <b>Price-lock</b> your renewal… */
function label(t: string) {
  const i = t.indexOf(':');
  return i > 0 && i < 40 ? `<b>${esc(t.slice(0, i))}</b><span>${esc(t.slice(i + 1).trim())}</span>` : `<b>${esc(t)}</b>`;
}

/** Trust strip: one row of the enabled claims. tone 'tint' (grey band), 'light' (white) or 'dark'. '' when all are off. */
export function trustStrip(s: Partial<Settings>, o: { tone?: 'tint' | 'light' | 'dark'; id?: string } = {}) {
  const on = trustPoints(s).filter((p) => p.on);
  if (!on.length) return '';
  const items = on.map((p) => {
    const inner = `${icon(p.icon)}<span class="hp-trustbar__t">${label(p.text)}</span>`;
    return `<li>${p.href ? `<a href="${esc(p.href)}">${inner}</a>` : `<div>${inner}</div>`}</li>`;
  }).join('');
  return `<section class="hp-trustbar hp-trustbar--${o.tone || 'tint'}" aria-label="Why customers choose Globalhostia"${o.id ? ` id="${esc(o.id)}"` : ''}><div class="hp-container"><ul style="--n:${on.length}">${items}</ul></div></section>`;
}

/** Digits-only WhatsApp number (settings.whatsapp, else the phone). */
export const waNumber = (s: Partial<Settings>) => String(s.whatsapp || s.phone || '').replace(/[^\d]/g, '');
export const waLink = (s: Partial<Settings>, text: string) => { const n = waNumber(s); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ''; };

/** Floating WhatsApp button (bottom-left). Off when settings.whatsapp_float === false or no number is set. */
export function waFloat(s: Partial<Settings>, pageTitle: string, path: string) {
  if (s.whatsapp_float === false || s.whatsapp_float === 'false') return '';
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const name = String(s.site_name || 'Globalhostia');
  const href = waLink(s, `Hello ${name}, I'm looking at "${pageTitle}" (${site}${path || '/'}) and have a question.`);
  if (!href) return '';
  return `<a class="hp-wa" href="${esc(href)}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp (opens in a new tab)"><svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16.04 3C8.86 3 3.04 8.82 3.04 16c0 2.3.6 4.53 1.74 6.5L3 29l6.68-1.75A12.9 12.9 0 0 0 16.04 29C23.2 29 29 23.18 29 16S23.2 3 16.04 3zm0 23.6c-2 0-3.95-.54-5.65-1.56l-.4-.24-3.96 1.04 1.06-3.86-.26-.4A10.56 10.56 0 0 1 5.4 16c0-5.86 4.77-10.63 10.64-10.63 5.86 0 10.6 4.77 10.6 10.63 0 5.87-4.74 10.6-10.6 10.6zm5.83-7.95c-.32-.16-1.89-.93-2.18-1.04-.3-.1-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.6-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.66s1.14 3.08 1.3 3.3c.16.2 2.24 3.42 5.43 4.8.76.33 1.35.52 1.81.67.76.24 1.45.2 2 .12.61-.09 1.89-.77 2.15-1.52.27-.75.27-1.39.19-1.52-.08-.14-.29-.22-.61-.38z"/></svg><span class="hp-wa__lbl">WhatsApp us</span></a>`;
}
