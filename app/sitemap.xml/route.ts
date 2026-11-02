import { eq, and } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { getPosts, blogCategories } from '@/lib/blog';
import { SITEMAP_EXCLUDE } from '@/lib/seo';
import { THEME_ONLY } from '@/lib/theme/routes';

export const revalidate = 3600;

export async function GET() {
  const s = await getSettings();
  const base = (s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const rows = await db.select({ slug: schema.pages.slug, updatedAt: schema.pages.updatedAt }).from(schema.pages)
    .where(and(eq(schema.pages.status, 'PUBLISHED'), eq(schema.pages.inSitemap, true)));
  const prods = await db.select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt }).from(schema.products).where(and(eq(schema.products.status, 'PUBLISHED'), eq(schema.products.whmcsRetired, false)));
  const posts = await getPosts();
  const newest = posts[0] ? new Date(Math.max(...posts.map((p) => Date.parse(p.updatedAt)))).toISOString() : new Date().toISOString();
  const blog = !posts.length ? '' : [
    `<url><loc>${base}/blog</loc><lastmod>${newest}</lastmod></url>`,
    ...blogCategories(posts).map((c) => `<url><loc>${base}/blog/category/${c.slug}</loc><lastmod>${newest}</lastmod></url>`),
    ...posts.filter((p) => !p.canonical || p.canonical.startsWith(base)).map((p) => `<url><loc>${base}/blog/${p.slug}</loc><lastmod>${p.updatedAt}</lastmod></url>`),
  ].join('\n');
  // theme-only landing pages (plan finder, free migration, .ae, data centers, UAE guides) have no CMS page row
  const have = new Set(rows.map((r) => r.slug));
  const themeOnly = [...THEME_ONLY].filter((slug) => !have.has(slug)).map((slug) => `<url><loc>${base}/${slug}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .filter((r) => !SITEMAP_EXCLUDE.has(r.slug) && r.slug !== 'blog')
    .map((r) => `<url><loc>${base}${r.slug === 'index' ? '/' : '/' + r.slug}</loc><lastmod>${new Date(r.updatedAt).toISOString()}</lastmod></url>`).join('\n')}\n${prods.map((p) => `<url><loc>${base}/p/${p.slug}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod></url>`).join('\n')}\n<url><loc>${base}/ai</loc></url>\n${blog}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
}
