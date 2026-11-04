// Content-Security-Policy for globalhostia.com. Plain ESM (no app imports): read by next.config.mjs (static header for
// the paths middleware does not see), middleware.ts (public pages + admin, with the runtime mode from Admin > Security)
// and tests/security.test.mts. docs/security/CSP.md explains every source.
//
// Why 'unsafe-inline' stays in script-src: public pages are rendered once and cached by the CDN for every visitor
// (s-maxage), so a per-request nonce cannot be used; the theme also ships small inline bootstraps (reduced motion,
// AI chat loader, JSON config) and Next.js inlines its RSC payload in admin pages. 'unsafe-eval' is never allowed in
// production. Everything else is an explicit allow-list: no wildcard script, frame or connect host.

export const CSP_MODES = ['enforce', 'report', 'off'];

const GA = ['https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://googleads.g.doubleclick.net', 'https://www.google.com'];
const CLARITY = ['https://www.clarity.ms', 'https://scripts.clarity.ms', 'https://*.clarity.ms'];
const META = ['https://connect.facebook.net', 'https://www.facebook.com'];
const TIKTOK = ['https://analytics.tiktok.com'];
const TURNSTILE = ['https://challenges.cloudflare.com'];
// Vercel preview comments / toolbar (only injected on preview deployments)
const VERCEL = ['https://vercel.live'];
const YOUTUBE = ['https://www.youtube.com', 'https://www.youtube-nocookie.com'];
const WHMCS = ['https://my.globalhostia.com'];
// Crisp live chat and Google Maps: used by the original (legacy) theme's footer and contact page, which the owner can
// switch back to (Admin > Design) and which ?theme=original previews
const CRISP = { script: ['https://client.crisp.chat', 'https://settings.crisp.chat'], connect: ['https://client.crisp.chat', 'https://storage.crisp.chat', 'wss://client.relay.crisp.chat', 'wss://stream.relay.crisp.chat'], frame: ['https://game.crisp.chat'] };
const MAPS = ['https://maps.googleapis.com'];
// Trustpilot review widgets (legacy theme blocks)
const TRUSTPILOT = ['https://widget.trustpilot.com'];

const HOST_RE = /^(https:\/\/(\*\.)?[a-z0-9.-]+\.[a-z]{2,}(:\d{1,5})?|wss:\/\/[a-z0-9.-]+\.[a-z]{2,})$/i;
/**
 * Extra sources the owner adds in Admin > Security (validated: https/wss origins only, no keywords, no paths).
 * @param {any} extra
 * @returns {Record<string, string[]>}
 */
export function cleanExtra(extra) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const k of ['script', 'style', 'connect', 'frame', 'font', 'img', 'media', 'form']) {
    const v = Array.isArray(extra?.[k]) ? extra[k] : typeof extra?.[k] === 'string' ? extra[k].split(/[\s,]+/) : [];
    out[k] = [...new Set(v.map((x) => String(x).trim().replace(/\/+$/, '')).filter((x) => HOST_RE.test(x)))].slice(0, 20);
  }
  return out;
}

/**
 * @param {{ dev?: boolean, reportUri?: string | false, extra?: Record<string, string[]> }} [o]
 * @returns {string}
 */
export function buildCsp(o = {}) {
  const x = cleanExtra(o.extra || {});
  const dev = !!o.dev;
  const join = (...parts) => [...new Set(parts.flat())].join(' ');
  const d = [
    "default-src 'self'",
    `script-src ${join("'self'", "'unsafe-inline'", dev ? ["'unsafe-eval'"] : [], GA, CLARITY, META, TIKTOK, TURNSTILE, VERCEL, CRISP.script, MAPS, TRUSTPILOT, x.script)}`,
    `style-src ${join("'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://client.crisp.chat', VERCEL, x.style)}`,
    `font-src ${join("'self'", 'data:', 'https://fonts.gstatic.com', 'https://client.crisp.chat', VERCEL, x.font)}`,
    `img-src ${join("'self'", 'data:', 'blob:', 'https:', x.img)}`,
    `connect-src ${join("'self'", WHMCS, GA, CLARITY, META, TIKTOK, TURNSTILE, VERCEL, 'wss://ws-us3.pusher.com', CRISP.connect, MAPS, dev ? ['ws:', 'http://localhost:*'] : [], x.connect)}`,
    `frame-src ${join("'self'", 'https://www.googletagmanager.com', 'https://td.doubleclick.net', YOUTUBE, TURNSTILE, VERCEL, CRISP.frame, TRUSTPILOT, x.frame)}`,
    `media-src ${join("'self'", 'blob:', 'https:', x.media)}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `form-action ${join("'self'", WHMCS, 'https://globalhostia.com', 'https://www.globalhostia.com', 'https://globalhostiawebiste.vercel.app', x.form)}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ];
  if (o.reportUri !== false) d.push(`report-uri ${o.reportUri || '/api/csp-report'}`, 'report-to csp');
  return d.join('; ');
}

/** Header name for a mode, or null when CSP is switched off. */
export const cspHeaderName = (mode) => (mode === 'off' ? null : mode === 'report' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy');

/** Normalise an env / setting value: enforce (default) | report | off. */
export const parseMode = (v, dflt = 'enforce') => {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'report' || s === 'report-only' || s === 'reportonly') return 'report';
  if (s === 'off' || s === 'disabled' || s === '0' || s === 'false') return 'off';
  if (s === 'enforce' || s === 'on' || s === '1' || s === 'true') return 'enforce';
  return dflt;
};

/** The least strict of the env value and the admin value wins: either one can switch enforcement off in an emergency. */
export function effectiveMode(envMode, adminMode) {
  const rank = { off: 0, report: 1, enforce: 2 };
  const e = parseMode(envMode), a = parseMode(adminMode);
  return rank[e] <= rank[a] ? e : a;
}

/** Reporting API endpoint list (Reporting-Endpoints header) for report-to. */
export const reportingEndpoints = (uri = '/api/csp-report') => `csp="${uri}"`;
