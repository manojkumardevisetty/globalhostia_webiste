import { NextRequest, NextResponse, type NextFetchEvent } from 'next/server';
import { buildCsp, cspHeaderName, effectiveMode, reportingEndpoints } from './lib/security/csp-policy.mjs';
import { verifySession, COOKIE } from './lib/auth';
import { COUNTRY_CURRENCY, CUR_COOKIE, isCode } from './lib/currency';
import { wantsMarkdown, mdPath } from './lib/agents/markdown';
import { abAssign, AB_PARAM, AB_DRAFT_PARAM, AB_HEADER, AB_DRAFT_HEADER, AB_COOKIE_MAX_AGE } from './lib/abtest/edge';

// Public pages: pick the visitor's currency (cookie → country) and pass it on as x-gh-cur.
// The URL is rewritten with ?_cur=XXX so the CDN caches one copy per currency.
function currency(req: NextRequest) {
  const pick = req.nextUrl.searchParams.get('currency')?.toUpperCase();
  if (isCode(pick)) return { cur: pick!, set: true };
  const c = req.cookies.get(CUR_COOKIE)?.value;
  if (isCode(c)) return { cur: c!, set: false };
  const country = req.headers.get('x-vercel-ip-country') || '';
  return { cur: COUNTRY_CURRENCY[country] || 'USD', set: false };
}

// Content-Security-Policy for every page middleware sees (public pages + admin). Mode: the least strict of env CSP_MODE
// and Admin > Security (read from /api/security/csp, remembered 60s per instance, refreshed in the background).
// next.config.mjs sends the same policy for /account, /oauth and /mcp (not routed through middleware), from env only.
let cspRt: { at: number; mode: string; extra: Record<string, string[]>; busy?: boolean } = { at: 0, mode: 'enforce', extra: {} };
async function refreshCsp(req: NextRequest) {
  if (cspRt.busy) return;
  cspRt.busy = true;
  try {
    const r = await fetch(new URL('/api/security/csp', req.url), { signal: AbortSignal.timeout(1500), headers: { accept: 'application/json' } });
    if (r.ok) { const j = await r.json(); cspRt = { at: Date.now(), mode: String(j.mode || 'enforce'), extra: j.extra || {} }; } else cspRt = { ...cspRt, at: Date.now() };
  } catch { cspRt = { ...cspRt, at: Date.now() }; } finally { cspRt.busy = false; }
}
async function withCsp(req: NextRequest, ev: NextFetchEvent | undefined, res: NextResponse) {
  if (!cspRt.at) await refreshCsp(req);
  else if (Date.now() - cspRt.at > 60_000) { const p = refreshCsp(req); if (ev) ev.waitUntil(p); }
  const mode = effectiveMode(process.env.CSP_MODE, cspRt.mode);
  const name = cspHeaderName(mode);
  if (name) {
    res.headers.set(name, buildCsp({ dev: process.env.NODE_ENV === 'development', extra: cspRt.extra }));
    res.headers.set('Reporting-Endpoints', reportingEndpoints());
  }
  return res;
}

export async function middleware(req: NextRequest, ev?: NextFetchEvent) {
  return withCsp(req, ev, await handle(req));
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  if (pathname === '/ask') return NextResponse.next(); // NLWeb API: ?currency= is an API parameter, not the site picker
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
    // AI agents asking for Markdown (Accept: text/markdown preferred over text/html) get <page>.md at the same URL
    if (wantsMarkdown(req.headers.get('accept'))) {
      const url = req.nextUrl.clone();
      url.pathname = mdPath(pathname);
      return NextResponse.rewrite(url);
    }
    const { cur, set } = currency(req);
    const url = req.nextUrl.clone();
    url.searchParams.delete('currency');
    url.searchParams.set('_cur', cur);
    const headers = new Headers(req.headers);
    headers.set('x-gh-cur', cur);
    if (set) { // explicit choice from the selector: remember it and drop ?currency from the address bar
      const clean = req.nextUrl.clone(); clean.searchParams.delete('currency');
      const res = NextResponse.redirect(clean, 303);
      res.cookies.set(CUR_COOKIE, cur, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
      return res;
    }
    // A/B tests (lib/abtest/edge.ts): non-control variants render from ?_ab= (own CDN copy); bots always get the control
    url.searchParams.delete(AB_PARAM); url.searchParams.delete(AB_DRAFT_PARAM);
    const ab = await abAssign(req, async () => !!(await verifySession(req.cookies.get(COOKIE)?.value))).catch(() => null);
    if (ab) url.searchParams.delete('ab');
    // the renderer reads the x-gh-ab* headers (like x-gh-cur); ?_ab= only gives each variant its own CDN cache key
    headers.delete(AB_HEADER); headers.delete(AB_DRAFT_HEADER);
    if (ab?.param) {
      url.searchParams.set(AB_PARAM, ab.param); headers.set(AB_HEADER, ab.param);
      if (ab.draft) { url.searchParams.set(AB_DRAFT_PARAM, '1'); headers.set(AB_DRAFT_HEADER, '1'); }
    }
    const res = NextResponse.rewrite(url, { request: { headers } });
    for (const c of ab?.cookies || []) res.cookies.set(c.name, c.value, { path: '/', maxAge: AB_COOKIE_MAX_AGE, sameSite: 'lax', secure: req.nextUrl.protocol === 'https:', httpOnly: c.httpOnly, ...(c.domain ? { domain: c.domain } : {}) });
    return res;
  }
  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) return NextResponse.next();
  const s = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!s) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const u = new URL('/admin/login', req.url);
    u.searchParams.set('next', pathname);
    return NextResponse.redirect(u);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*',
    // public HTML pages only: skip API, Next internals, static assets and files with an extension
    '/((?!api|_next|hp|image|assets|css|js|fonts|plugins|lang|previews|og|account|oauth/|mcp$|mcp/|\\.well-known/|template-part|sitemap|robots|favicon|.*\\.[a-z0-9]+$).*)'],
};
