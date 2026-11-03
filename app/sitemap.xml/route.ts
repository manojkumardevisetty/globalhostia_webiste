import { sitemapEntries, sitemapXml } from '@/lib/sitemap';

export const revalidate = 3600;

export async function GET() {
  return new Response(sitemapXml(await sitemapEntries()), { headers: { 'content-type': 'application/xml; charset=utf-8' } });
}
