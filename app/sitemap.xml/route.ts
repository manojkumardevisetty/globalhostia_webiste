import { eq, and } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const revalidate = 3600;

export async function GET() {
  const s = await getSettings();
  const base = (s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const rows = await db.select({ slug: schema.pages.slug, updatedAt: schema.pages.updatedAt }).from(schema.pages)
    .where(and(eq(schema.pages.status, 'PUBLISHED'), eq(schema.pages.inSitemap, true)));
  const prods = await db.select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt }).from(schema.products).where(and(eq(schema.products.status, 'PUBLISHED'), eq(schema.products.whmcsRetired, false)));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .filter((r) => !['404', 'sign-in', 'sign-up', 'forget-password'].includes(r.slug))
    .map((r) => `<url><loc>${base}${r.slug === 'index' ? '/' : '/' + r.slug}</loc><lastmod>${new Date(r.updatedAt).toISOString()}</lastmod></url>`).join('\n')}\n${prods.map((p) => `<url><loc>${base}/p/${p.slug}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod></url>`).join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
}
