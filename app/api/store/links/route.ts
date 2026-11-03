// Public, read-only data for the client-area store script (public/hp/whmcs.js), so it never hardcodes pids or
// category lists: the cart's "Complete your setup" offers and the store categories, from the live catalog.
// Offers: Admin → Site links (settings.site_links.offers) or, when unset, the cheapest SSL / web hosting plan.
import { NextResponse } from 'next/server';
import { getCatalog, type TProduct } from '@/lib/theme/data';
import { offerProduct } from '@/lib/theme/offers';
import { TYPE_ICON, CLAIMED, prettyName } from '@/lib/theme/sitelinks';
import { categoryHrefIn } from '@/lib/theme/pseo';

export const revalidate = 3600;

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

function priceMap(p: TProduct) {
  const prices: Record<string, Record<string, number>> = {};
  for (const x of p.prices) { const v = parseFloat(String(x.price)); if (Number.isFinite(v) && v >= 0) (prices[x.currency] ||= {})[x.cycle] = v; }
  return prices;
}

export async function GET() {
  const cat = await getCatalog();
  const offer = (p: TProduct | null) => (p ? { slug: p.slug, name: p.name, pid: p.whmcsPid, category: p.categorySlug, prices: priceMap(p) } : null);
  const counts = new Map<string, number>();
  for (const p of cat.products) counts.set(p.categorySlug, (counts.get(p.categorySlug) || 0) + 1);
  // only categories the site itself shows: hand-written pages, or approved ones (no "Whmcs Group 1", no unreviewed)
  const categories = cat.categories.filter((c) => counts.get(c.slug) && (CLAIMED.has(c.slug) || c.auto)).map((c) => ({
    slug: c.slug, name: prettyName(c.name), desc: strip(c.seoDescription || c.description).slice(0, 140), type: c.type, icon: TYPE_ICON[c.type] || 'box',
    products: counts.get(c.slug) || 0, page: categoryHrefIn(cat, c.slug),
  }));
  return NextResponse.json({
    offers: { ssl: offer(offerProduct(cat, 'ssl', cat.links.offers.ssl)), hosting: offer(offerProduct(cat, 'shared', cat.links.offers.hosting)) },
    categories,
  }, { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
