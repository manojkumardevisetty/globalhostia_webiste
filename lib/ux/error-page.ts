// Stand-alone branded error page (no database, no shell): used when the site itself cannot be built (503, maintenance,
// last-resort 404/500) and mirrored by public/pwa-offline.htm and app/global-error.tsx. Inline CSS only, system
// fonts with Manrope/Inter when the browser already has them, the hexagon mark, a retry button and support links.
// Pure module so tests can render it.

export type ErrorPageOpts = {
  status: number;
  title: string;
  text: string;
  /** show the "Try again" button (reloads the page) */
  retry?: boolean;
  /** extra line under the text (escaped) */
  note?: string;
  /** support channels (defaults: email + contact page) */
  email?: string;
  whatsapp?: string;
  siteName?: string;
  /** a small "Reference" line for support (e.g. a request id); never an internal error message */
  ref?: string;
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The hexagon brand mark with an inner glyph: 'alert' (!), 'clock' (maintenance), 'search' (404), 'off' (offline). */
export function hexMark(kind: 'alert' | 'clock' | 'search' | 'off' = 'alert') {
  const inner = {
    alert: '<path d="M32 21v14M32 42v.5" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>',
    clock: '<circle cx="32" cy="32" r="11" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M32 25v7l5 3" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
    search: '<circle cx="30" cy="30" r="8.5" fill="none" stroke="#fff" stroke-width="3.5"/><path d="m36.5 36.5 6 6" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
    off: '<path d="M22 30a14 14 0 0 1 20 0M26 35a8 8 0 0 1 12 0M32 41v.5M21 21l22 22" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
  }[kind];
  return `<svg class="gh-ep__mark" viewBox="0 0 64 64" width="72" height="72" aria-hidden="true"><defs><linearGradient id="gh-ep-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e14c7f"/><stop offset="1" stop-color="#a6225f"/></linearGradient></defs><path d="M32 4 56.2 18v28L32 60 7.8 46V18z" fill="url(#gh-ep-g)"/><path d="M32 4 56.2 18v28L32 60 7.8 46V18z" fill="none" stroke="#fdd700" stroke-opacity=".55" stroke-width="1.5"/>${inner}</svg>`;
}

/** Shared CSS of the stand-alone error pages (also pasted into public/pwa-offline.htm). */
export const ERROR_PAGE_CSS = `:root{color-scheme:light}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:#16212b;background-image:radial-gradient(60% 50% at 80% 0,rgba(197,56,111,.28),transparent 70%),radial-gradient(50% 40% at 0 100%,rgba(253,215,0,.08),transparent 70%);color:#e8edf2;font:16px/1.55 Inter,system-ui,-apple-system,"Segoe UI",Roboto,"IBM Plex Sans Arabic",Tahoma,sans-serif}
.gh-ep{width:100%;max-width:480px;text-align:center}
.gh-ep__mark{display:block;margin:0 auto}
.gh-ep__code{display:inline-block;margin-top:18px;padding:3px 10px;border-radius:999px;background:rgba(253,215,0,.12);color:#fdd700;font:700 12px/1.6 Manrope,Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase}
.gh-ep h1{margin:12px 0 8px;font:800 clamp(24px,5vw,30px)/1.2 Manrope,Inter,system-ui,sans-serif;color:#fff;letter-spacing:-.02em}
.gh-ep p{margin:0 0 6px;color:#b9c4cf}
.gh-ep__act{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:24px}
.gh-ep__btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 22px;border:0;border-radius:12px;background:#c5386f;color:#fff;font:600 15px Inter,system-ui,sans-serif;text-decoration:none;cursor:pointer}
.gh-ep__btn--ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18)}
.gh-ep__btn:hover{filter:brightness(1.08)}
.gh-ep__btn:focus-visible,.gh-ep a:focus-visible{outline:2px solid #fdd700;outline-offset:3px}
.gh-ep__help{margin-top:22px;padding-top:18px;border-top:1px solid rgba(255,255,255,.12);font-size:14px}
.gh-ep__help a{color:#fff}
.gh-ep__ref{margin-top:10px;font-size:12px;color:#8a97a4}
.gh-ep__ar{margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12)}`;

export function errorPage(o: ErrorPageOpts): string {
  const site = o.siteName || 'GlobalHostia';
  const email = o.email || 'support@globalhostia.com';
  const wa = o.whatsapp ? String(o.whatsapp).replace(/[^\d]/g, '') : '';
  const mark = o.status === 503 && /maintenance/i.test(o.title + o.text) ? 'clock' : o.status === 404 ? 'search' : 'alert';
  const label = o.status === 404 ? 'Error 404' : o.status === 503 ? 'Temporarily unavailable' : `Error ${o.status}`;
  return `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#16212b"><title>${esc(o.title)} · ${esc(site)}</title><link rel="icon" href="/favicon.ico" sizes="48x48"><style>${ERROR_PAGE_CSS}</style></head>
<body><main class="gh-ep" role="main">${hexMark(mark)}<span class="gh-ep__code">${esc(label)}</span><h1>${esc(o.title)}</h1><p>${esc(o.text)}</p>${o.note ? `<p>${esc(o.note)}</p>` : ''}
<div class="gh-ep__act">${o.retry ? '<button type="button" class="gh-ep__btn" onclick="location.reload()">Try again</button>' : ''}<a class="gh-ep__btn${o.retry ? ' gh-ep__btn--ghost' : ''}" href="/">Go to the homepage</a></div>
<p class="gh-ep__help">Still not working? ${wa ? `<a href="https://wa.me/${esc(wa)}">Message us on WhatsApp</a>, ` : ''}email <a href="mailto:${esc(email)}">${esc(email)}</a> or open your <a href="/account">account</a>.${o.status >= 500 ? ' Your hosting, email and domains keep running.' : ''}</p>
${o.ref ? `<p class="gh-ep__ref">Reference: ${esc(o.ref)}</p>` : ''}</main></body></html>`;
}
