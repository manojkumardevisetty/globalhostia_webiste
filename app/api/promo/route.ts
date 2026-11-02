// Public: the currently active announcement bar + pop-ups for a surface (website | clientarea).
// Consumed cross-origin by public/hp/promo.js (e.g. embedded in the WHMCS client area).
import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { activeFor, type Surface } from '@/lib/promo';

export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-max-age': '86400' };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('surface');
  const surface: Surface = q === 'clientarea' ? 'clientarea' : 'website';
  let body;
  try {
    const s = await getSettings();
    const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
    body = { ...activeFor(s.promotions, surface), origin: site, now: new Date().toISOString() };
  } catch {
    return NextResponse.json({ surface, bar: null, popups: [], error: 'unavailable' }, { status: 503, headers: { ...CORS, 'cache-control': 'no-store' } });
  }
  return NextResponse.json(body, { headers: { ...CORS, 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
