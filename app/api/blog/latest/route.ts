// Public JSON feed of the newest published blog posts (used by the WHMCS client area and other sites).
// GET /api/blog/latest?limit=3 → [{ title, slug, url, excerpt, coverImage, category, date, readingMinutes }]
import { NextRequest, NextResponse } from 'next/server';
import { getLatestPosts, postPath, absUrl } from '@/lib/blog';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' };

export async function GET(req: NextRequest) {
  const n = parseInt(req.nextUrl.searchParams.get('limit') || '3', 10);
  const limit = Number.isFinite(n) ? Math.min(Math.max(n, 1), 20) : 3;
  try {
    const [s, posts] = await Promise.all([getSettings(), getLatestPosts(limit)]);
    const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
    const data = posts.map((p) => ({
      title: p.title, slug: p.slug, url: site + postPath(p.slug), excerpt: p.excerpt,
      coverImage: p.coverImage ? absUrl(site, p.coverImage) : '', category: p.category, date: p.date, readingMinutes: p.readingMinutes,
    }));
    return NextResponse.json(data, { headers: { ...CORS, 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600' } });
  } catch (e) {
    console.error('[api/blog/latest]', (e as Error).message);
    return NextResponse.json([], { status: 503, headers: { ...CORS, 'cache-control': 'no-store' } });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, 'access-control-max-age': '86400' } });
}
