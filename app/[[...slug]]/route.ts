// Public site: every non-admin URL is rendered from the CMS database.
import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { db, schema } from '@/lib/db';
import { renderPage } from '@/lib/render/page';
import { renderProductPage } from '@/lib/render/product-page';
import { renderTheme, renderBlogRoute } from '@/lib/theme';
import { THEME_ONLY, dynamicRoute } from '@/lib/theme/routes';
import { PSEO_REDIRECTS } from '@/lib/theme/pseo';
import { getSettings } from '@/lib/settings';
import { verifySession, COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const redirectMap = unstable_cache(async () => {
  const rows = await db.select().from(schema.redirects);
  return Object.fromEntries(rows.map((r) => [r.from.toLowerCase(), [r.to, r.code] as const]));
}, ['redirects', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'], revalidate: 3600 });

const html = (body: string, status = 200, cache = true) => new NextResponse(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache && status === 200 ? 'public, s-maxage=60, stale-while-revalidate=600' : 'private, no-store' },
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug?: string[] }> }) {
  const { slug: segs = [] } = await ctx.params;
  const path = '/' + segs.join('/');
  const r = (await redirectMap())[path.toLowerCase()];
  if (r) return NextResponse.redirect(new URL(r[0], req.url), r[1]);
  const pr = PSEO_REDIRECTS[path.slice(1).toLowerCase()];
  if (pr) return NextResponse.redirect(new URL(pr, req.url), 301);
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
