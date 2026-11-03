import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE } from './lib/auth';
import { COUNTRY_CURRENCY, CUR_COOKIE, isCode } from './lib/currency';
import { wantsMarkdown, mdPath } from './lib/agents/markdown';

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

export async function middleware(req: NextRequest) {
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
    return NextResponse.rewrite(url, { request: { headers } });
  }
  if (pathname === '/admin/login') return NextResponse.next();
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
