// Public, read-only product specs for the client-area store (whmcs.js): slug → features/location/tier.
// Prices are not included — the store shows WHMCS's own live prices.
import { NextResponse } from 'next/server';
import { getCatalog } from '@/lib/theme/data';

export const revalidate = 3600;

export async function GET() {
  const cat = await getCatalog();
  const out: Record<string, { name: string; features: string[]; allFeatures: string[]; tagline: string; pid: number | null; prices: Record<string, Record<string, number>>; location?: string; tier?: string; category: string }> = {};
  for (const p of cat.products) {
    const prices: Record<string, Record<string, number>> = {};
    for (const x of p.prices) { const v = parseFloat(String(x.price)); if (Number.isFinite(v) && v >= 0) (prices[x.currency] ||= {})[x.cycle] = v; }
    const feats = p.features.filter((f) => !f.startsWith('-'));
    out[p.slug] = { name: p.name, features: feats.slice(0, 6), allFeatures: feats.slice(0, 24), tagline: p.tagline || '', pid: p.whmcsPid, prices, location: p.attributes?.location, tier: p.attributes?.tier, category: p.categorySlug };
  }
  return NextResponse.json(out, { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
