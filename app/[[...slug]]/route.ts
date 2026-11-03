// Public site: every non-admin URL is rendered from the CMS database.
import { NextRequest, NextResponse, after } from 'next/server';
import { redirectMap } from '@/lib/redirects';
import { cdnCache } from '@/lib/lkg';
import { renderPage } from '@/lib/render/page';
import { renderProductPage } from '@/lib/render/product-page';
import { renderTheme, renderBlogRoute } from '@/lib/theme';
import { THEME_ONLY, dynamicRoute } from '@/lib/theme/routes';
import { PSEO_REDIRECTS, categoryRedirect } from '@/lib/theme/pseo';
import { getCatalog } from '@/lib/theme/data';
import { getSettings } from '@/lib/settings';
import { verifySession, COOKIE } from '@/lib/auth';
import { pageMarkdown, mdPath } from '@/lib/agents/markdown';
import { GET as aiPage } from '../ai/route';
import { onDeploy } from '@/lib/indexnow';
import { ALIAS_PATHS, HUB_PATH } from '@/lib/store/config';
import { storeRedirect } from '@/lib/store/view';
import { errorPage } from '@/lib/ux/error-page';
import { renderNotFound } from '@/lib/theme/pages/notfound';

export const dynamic = 'force-dynamic';

// Public HTML is served from the CDN for an hour (then stale for up to a day while it refreshes), so crawler bursts
// never reach the function or Postgres; admin saves revalidate the data cache (tag 'site'). The ?_cur= rewrite
// (middleware.ts) keeps one cached copy per currency. While a page is built from snapshot data (database
// unavailable, lib/lkg.ts) the TTL is one minute so fresh content returns quickly after recovery.
const pageCache = cdnCache;
const html = (body: string, status = 200, cache = true) => new NextResponse(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache && status === 200 ? pageCache() : 'private, no-store' },
});

/** Last resort when a page cannot be built at all (no database and no snapshot): 503 + Retry-After, never a 500.
 *  The technical reason stays in the log; the visitor gets the branded page with "Try again" and support links. */
function unavailable(e: unknown) {
  console.error('[page] render failed:', (e as Error)?.message || e);
  return new NextResponse(errorPage({ status: 503, retry: true, title: "We'll be right back", text: 'This page is temporarily unavailable. Please try again in a few minutes.' }),
    { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '120' } });
}

/** <page>.md: the same page as Markdown for AI agents (also reached with Accept: text/markdown via middleware). */
async function markdown(req: NextRequest, segs: string[]): Promise<Response> {
  const last = segs[segs.length - 1].replace(/\.md$/i, '');
  const inner = last.toLowerCase() === 'index' && segs.length === 1 ? [] : [...segs.slice(0, -1), last];
  const path = '/' + inner.join('/');
  const u = new URL(path, req.url);
  u.searchParams.set('_cur', req.nextUrl.searchParams.get('currency')?.toUpperCase() || 'USD');
  const sub = new NextRequest(u, { headers: { accept: 'text/html' } });
  const res: Response = inner.length === 1 && inner[0] === 'ai' ? await aiPage(sub) : await GET(sub, { params: Promise.resolve({ slug: inner }) });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    const to = loc ? new URL(loc, req.url) : null;
    if (to && to.origin === u.origin && !to.pathname.endsWith('.md')) { to.pathname = mdPath(to.pathname); to.searchParams.delete('_cur'); return NextResponse.redirect(to, res.status); }
    return res;
  }
  if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) {
    return new NextResponse('# Not found\n\nNo Markdown version of this page. See https://globalhostia.com/llms.txt\n', { status: 404, headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store' } });
  }
  const s = await getSettings();
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const body = pageMarkdown(await res.text(), site + (path === '/' ? '/' : path), site);
  return new NextResponse(body, { headers: {
    'content-type': 'text/markdown; charset=utf-8', 'access-control-allow-origin': '*', vary: 'Accept',
    'x-robots-tag': 'noindex', link: `<${site}${path === '/' ? '/' : path}>; rel="canonical"`,
    'cache-control': pageCache(),
  } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  try { return await render(req, ctx); } catch (e) { return unavailable(e); }
}

async function render(req: NextRequest, ctx: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug: segs = [] } = await ctx.params;
  after(onDeploy); // first request after a production deploy: submit the sitemap to IndexNow (once per commit)
  if (segs.length && /\.md$/i.test(segs[segs.length - 1]) && segs[segs.length - 1].length > 3) return markdown(req, segs);
  const path = '/' + segs.join('/');
  const r = (await redirectMap())[path.toLowerCase()];
  if (r) return NextResponse.redirect(new URL(r[0], req.url), r[1]);
  const pr = PSEO_REDIRECTS[path.slice(1).toLowerCase()];
  if (pr) return NextResponse.redirect(new URL(pr, req.url), 301);
  // /category/<slug> of a category another page already sells → that page (lib/theme/pseo.ts coveredBy)
  if (segs.length === 2 && segs[0].toLowerCase() === 'category') {
    const to = await getCatalog().then((cat) => categoryRedirect(cat, segs[1].toLowerCase())).catch(() => '');
    if (to) return NextResponse.redirect(new URL(to, req.url), 301);
  }
  // Business services shop: /store → /business-services; /business-services/<slug> of a section, or of a category a
  // hand-written page sells (SSL, business email), → that section on the hub or that page (lib/store/view.ts)
  const s0 = segs[0]?.toLowerCase();
  if (s0 && segs.length <= 2 && ALIAS_PATHS.includes('/' + s0)) return NextResponse.redirect(new URL(HUB_PATH + (segs[1] ? '/' + segs[1].toLowerCase() : ''), req.url), 301);
  if (s0 === 'business-services' && segs.length === 2) {
    const to = await getCatalog().then((cat) => storeRedirect(cat, segs[1].toLowerCase())).catch(() => '');
    if (to) return NextResponse.redirect(new URL(to, req.url), 301);
  }
  if (/\.html?$/i.test(path)) return NextResponse.redirect(new URL(path.replace(/\/?index\.html?$/i, '/').replace(/\.html?$/i, ''), req.url), 301);

  const session = await verifySession(req.cookies.get(COOKIE)?.value);
  const preview = !!session && req.nextUrl.searchParams.has('preview');
  const s = await getSettings();
  if (s.maintenance && !session) {
    return html(errorPage({ status: 503, retry: true, siteName: String(s.site_name || 'GlobalHostia'), whatsapp: String(s.whatsapp || ''), email: String(s.email || '') || undefined,
      title: "We'll be right back", text: `${s.site_name || 'GlobalHostia'} is undergoing scheduled maintenance. Please try again in a few minutes.` }), 503, false);
  }

  // Blog (admin → Blog) only exists in the Hostpen theme, so it renders with it whatever the site theme is.
  if (segs[0]?.toLowerCase() === 'blog') {
    const b = await renderBlogRoute(segs, { path, preview, query: req.nextUrl.searchParams });
    const cache = b.status === 200 && b.cache !== false && !preview;
    return new NextResponse(b.body, { status: b.status, headers: {
      'content-type': b.type || 'text/html; charset=utf-8',
      'cache-control': cache ? pageCache() : 'private, no-store',
    } });
  }

  // Site theme: Admin > Design "Site theme". ?theme=hostpen previews it, ?theme=original previews the old one.
  const tq = req.nextUrl.searchParams.get('theme');
  const themed = (tq ? tq === 'hostpen' : s.site_theme === 'hostpen') || (segs.length <= 2 && segs.length > 0 && THEME_ONLY.has(segs.join('/').toLowerCase())) || !!dynamicRoute(segs);
  if (themed) {
    const out = await renderTheme(segs, { path, preview, query: req.nextUrl.searchParams });
    if (out) return html(out, 200, !preview && !req.nextUrl.searchParams.has('domain'));
  }

  if (segs[0] === 'p' && segs.length === 2) {
    const out = await renderProductPage(segs[1].toLowerCase(), preview);
    if (out) return html(out, 200, !preview);
  }
  const slug = segs.length ? segs.join('/').toLowerCase() : 'index';
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const opts = { preview, query: req.nextUrl.searchParams, ip, path };
  const out = await renderPage(slug, opts);
  if (out) return html(out, 200, !preview && !req.nextUrl.searchParams.has('domain'));
  // branded 404 (search + popular pages) with the site theme; the original theme's CMS "404" page otherwise
  if (s.site_theme === 'hostpen' || tq === 'hostpen') {
    const themed = await renderNotFound({ slug, path, preview: false, query: req.nextUrl.searchParams, route: { kind: 'content', title: 'Page not found', description: '' } }).catch((e) => { console.error('[page] 404 render failed:', (e as Error)?.message || e); return null; });
    if (themed) return html(themed, 404, false);
  }
  const nf = await renderPage('404', { ...opts, preview: false });
  return html(nf || errorPage({ status: 404, siteName: String(s.site_name || 'GlobalHostia'), title: 'We could not find that page', text: 'The link may be old, or the page has moved.' }), 404, false);
}
