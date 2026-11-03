// Public site: every non-admin URL is rendered from the CMS database.
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { db, schema } from '@/lib/db';
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

export const dynamic = 'force-dynamic';

const redirectMap = unstable_cache(async () => {
  const rows = await db.select().from(schema.redirects);
  return Object.fromEntries(rows.map((r) => [r.from.toLowerCase(), [r.to, r.code] as const]));
}, ['redirects', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'], revalidate: 3600 });

const html = (body: string, status = 200, cache = true) => new NextResponse(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache && status === 200 ? 'public, s-maxage=60, stale-while-revalidate=600' : 'private, no-store' },
});

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
    'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600',
  } });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug?: string[] }> }): Promise<Response> {
  const { slug: segs = [] } = await ctx.params;
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
  if (/\.html?$/i.test(path)) return NextResponse.redirect(new URL(path.replace(/\/?index\.html?$/i, '/').replace(/\.html?$/i, ''), req.url), 301);

  const session = await verifySession(req.cookies.get(COOKIE)?.value);
  const preview = !!session && req.nextUrl.searchParams.has('preview');
  const s = await getSettings();
  if (s.maintenance && !session) {
    return html(`<!doctype html><meta name=viewport content="width=device-width"><title>${s.site_name}</title><body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>We'll be right back</h1><p>${s.site_name} is undergoing scheduled maintenance.</p></div>`, 503, false);
  }

  // Blog (admin → Blog) only exists in the Hostpen theme, so it renders with it whatever the site theme is.
  if (segs[0]?.toLowerCase() === 'blog') {
    const b = await renderBlogRoute(segs, { path, preview, query: req.nextUrl.searchParams });
    const cache = b.status === 200 && b.cache !== false && !preview;
    return new NextResponse(b.body, { status: b.status, headers: {
      'content-type': b.type || 'text/html; charset=utf-8',
      'cache-control': cache ? 'public, s-maxage=60, stale-while-revalidate=600' : 'private, no-store',
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
  const nf = await renderPage('404', { ...opts, preview: false });
  return html(nf || `<!doctype html><title>Not found</title><body style="font:16px system-ui;text-align:center;padding:80px"><h1>Page not found</h1><p><a href="/">Back to ${s.site_name}</a></p>`, 404, false);
}
