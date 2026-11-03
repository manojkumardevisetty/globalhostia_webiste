// Lead capture: shared validation for POST /api/lead and the admin (Marketing → Leads). Pure module.

export const LEAD_STATUSES = ['new', 'contacted', 'won', 'lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const STATUS_LABEL: Record<LeadStatus, string> = { new: 'New', contacted: 'Contacted', won: 'Won', lost: 'Lost' };

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
export type Utm = Record<(typeof UTM_KEYS)[number], string>;

/** Cookie set by /hp/track.js on the first landing that carries utm_* parameters (first touch, 30 days). */
export const UTM_COOKIE = 'gh_utm';

export const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
/** popup | footer | plan-finder | landing:<slug> | quote:<slug> (Business services quote requests, /api/store/quote) */
export const SOURCE = /^(popup|footer|plan-finder|landing:[a-z0-9-]{1,60}|quote:[a-z0-9-]{1,80})$/;

/** "+971 50-000 0000" → "+971500000000"; '' when empty; null when invalid. */
export function normPhone(v: unknown): string | null {
  const raw = clean(v, 40);
  if (!raw) return '';
  if (!/^\+?[\d\s().-]{6,30}$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return '+' + digits.replace(/^00/, '');
}

/** utm values: letters, digits and a few separators only (they end up in CSV and admin filters). */
export const utmVal = (v: unknown) => clean(v, 120).replace(/[^\w .:/+@-]/g, '');

/** Parse the gh_utm cookie ({utm_source,…} as URL-encoded JSON). */
export function parseUtmCookie(raw: string | undefined): Partial<Utm> {
  if (!raw) return {};
  try {
    const o = JSON.parse(decodeURIComponent(raw));
    const out: Partial<Utm> = {};
    for (const k of UTM_KEYS) if (o && typeof o[k] === 'string') out[k] = utmVal(o[k]);
    return out;
  } catch { return {}; }
}

/** Same-site path only (no scheme/host), used for the `page` field and form-post redirects. */
export const safePath = (v: unknown) => { const p = clean(v, 300); return /^\/(?!\/)[^\s<>"]*$/.test(p) ? p : ''; };

/** WhatsApp chat link for a lead's number (admin). */
export const waChat = (phone: string, text = '') => (phone ? `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '');

/** Human label for a source value. */
export function sourceLabel(s: string) {
  if (s.startsWith('landing:')) return `Landing page /lp/${s.slice(8)}`;
  if (s.startsWith('quote:')) return `Quote request: ${s.slice(6)}`;
  return ({ popup: 'Pop-up', footer: 'Footer form', 'plan-finder': 'Plan finder' } as Record<string, string>)[s] || s || '—';
}

/** CSV cell: quoted, and neutralise spreadsheet formulas (=, +, -, @ at the start). */
export function csvCell(v: unknown) {
  let s = v instanceof Date ? v.toISOString() : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{6,15}$/.test(s)) s = "'" + s; // phone numbers "+971…" stay as they are
  return `"${s.replace(/"/g, '""')}"`;
}
