// Ad landing pages /lp/<slug> (Admin → Marketing → Landing pages). Always rendered with the Hostpen brand, whatever
// the site theme. Drafts are visible only to signed-in admins with ?preview=1.
import { NextRequest, NextResponse } from 'next/server';
import { cdnCache } from '@/lib/lkg';
import { renderLanding } from '@/lib/theme/pages/landing';
import { getSettings } from '@/lib/settings';
import { verifySession, COOKIE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const s = await getSettings();
  const session = await verifySession(req.cookies.get(COOKIE)?.value);
  if (s.maintenance && !session) return new NextResponse('We will be right back.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const preview = !!session && req.nextUrl.searchParams.has('preview');
  const clean = slug.toLowerCase();
  if (clean !== slug) return NextResponse.redirect(new URL(`/lp/${clean}${req.nextUrl.search.replace(/([?&])_cur=[A-Z]{3}&?/, '$1').replace(/[?&]$/, '')}`, req.url), 301);
  const r = await renderLanding(clean, { path: `/lp/${clean}`, preview, query: req.nextUrl.searchParams });
  return new NextResponse(r.body, { status: r.status, headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': r.cache && r.status === 200 && !req.nextUrl.searchParams.has('lead') ? cdnCache() : 'private, no-store',
    ...(r.status === 200 ? {} : { 'x-robots-tag': 'noindex' }),
  } });
}
