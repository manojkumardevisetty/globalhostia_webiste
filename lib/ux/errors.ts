// Customer-facing error wording, shared by the route handlers (hosting API, portal DNS editor, public pages).
// Pure module (no server-only imports) so tests/ux-errors.test.mts can import it directly.
//
// Style: what happened, then what to do next, in plain words. Never the name of an internal system (billing
// platform, control panel software, hosting provider, database), never a raw status code or stack trace on its own:
// the technical detail goes to the server log, the customer gets a sentence they can act on.
// The browser-side copies of this mapping live in public/hp/fx.js (GHFx.errInfo) and public/hp/whmcs.js (ghErr);
// tests/ux-errors.test.mts checks that all three agree.

export type ErrorKind = 'network' | 'timeout' | 'rate' | 'auth' | 'forbidden' | 'validation' | 'notfound' | 'unavailable' | 'server';

/** English copy for each kind (dictionary keys for the Arabic portal / client-area dictionaries). */
export const ERROR_COPY: Record<ErrorKind, string> = {
  network: 'You seem to be offline. Check your connection and try again.',
  timeout: 'This is taking longer than usual. Please try again in a moment.',
  rate: 'Too many attempts in a short time. Please wait a minute, then try again.',
  auth: 'Your session expired. Reload the page and sign in again to continue.',
  forbidden: 'This action is not allowed from this page. Reload the page and try again.',
  validation: 'Please check the highlighted fields and try again.',
  notfound: 'We could not find what you were looking for. It may have been moved or removed.',
  unavailable: 'This service is busy right now. Your websites and email keep running. Please try again in a few minutes.',
  server: 'Something went wrong on our side. Please try again in a minute.',
};

/** Kinds where a "Try again" button makes sense. */
export const RETRYABLE: ReadonlySet<ErrorKind> = new Set(['network', 'timeout', 'rate', 'unavailable', 'server']);

/** Classify an HTTP status (0 = no response) plus an optional machine code from our own APIs. */
export function errorKind(status: number, code?: string | null): ErrorKind {
  const c = String(code || '').toLowerCase();
  if (c === 'network' || c === 'offline') return 'network';
  if (c === 'timeout' || c === 'panel_timeout' || c === 'aborterror' || c === 'timeouterror') return 'timeout';
  if (c === 'expired' || c === 'unauthorized' || c === 'csrf') return 'auth';
  if (c === 'rate_limited' || c === 'rate') return 'rate';
  if (c === 'invalid' || c === 'validation') return 'validation';
  if (c === 'panel_unreachable' || c === 'not_configured') return 'unavailable';
  if (!status) return 'network';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'rate';
  if (status === 401 || status === 419 || status === 440) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404 || status === 410) return 'notfound';
  if (status === 400 || status === 409 || status === 413 || status === 422) return 'validation';
  if (status === 502 || status === 503) return 'unavailable';
  if (status >= 500) return 'server';
  return 'server';
}

/** Internal names that never reach a customer (case-insensitive, whole words). */
const INTERNAL = /\b(WHMCS|DirectAdmin|WHM|cPanel|Plesk|Vercel|Neon|Postgres(?:QL)?|Drizzle|Prisma|Anthropic|Redis|Upstash|Next\.js)\b/gi;

/**
 * A server message made safe to show: stack-trace lines, "HTTP 502"-style codes, URLs and internal product names are
 * removed or replaced; long messages are cut at a sentence boundary. Returns '' when nothing useful is left.
 */
export function scrubMessage(msg: unknown): string {
  let s = String(msg ?? '');
  s = s.split(/\r?\n/).filter((l) => !/^\s*at\s+\S+.*\(?.+:\d+:\d+\)?\s*$/.test(l) && !/^\s*(Error|TypeError|RangeError|SyntaxError):/.test(l)).join(' ');
  s = s.replace(/https?:\/\/\S+/gi, '').replace(/\(?\b(HTTP|status|code)\s*[:=]?\s*\d{3}\b\)?/gi, '').replace(/\b(E[A-Z]{3,}|ERR_[A-Z_]+)\b/g, '');
  s = s.replace(new RegExp(INTERNAL.source + '(?: API)?\\s*(?:error)?\\s*:\\s*', 'gi'), ''); // "DirectAdmin: …" / "WHMCS API error: …" prefixes
  s = s.replace(INTERNAL, (m) => (/^(cpanel|plesk|directadmin|whm)$/i.test(m) ? 'the hosting panel' : 'our system'));
  s = s.replace(/\bthe the hosting panel\b/gi, 'the hosting panel').replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  if (!/[a-z]{3}/i.test(s)) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > 220) { const cut = s.slice(0, 220); const dot = cut.lastIndexOf('. '); s = (dot > 60 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + '…'); }
  return s;
}

/** Public copy of the hosting panel's own failure: 4xx keep the (scrubbed) validation text, 5xx become a friendly sentence. */
export const PANEL_COPY = {
  timeout: 'Your hosting server took too long to answer. Please try again in a moment.',
  unreachable: 'We could not reach your hosting server right now. Your websites and email keep running. Please try again in a few minutes.',
  refused: 'The hosting server did not accept that change. Check the values and try again.',
} as const;

export function publicPanelError(status: number, message: string): { status: number; code: string; message: string } {
  if (status === 504 || status === 408) return { status: 504, code: 'panel_timeout', message: PANEL_COPY.timeout };
  if (status >= 500 && status !== 501) return { status: 502, code: 'panel_unreachable', message: PANEL_COPY.unreachable };
  return { status, code: 'panel', message: scrubMessage(message) || PANEL_COPY.refused };
}
