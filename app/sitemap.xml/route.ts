import { sitemapEntries, sitemapXml, staticSitemapEntries } from '@/lib/sitemap';
import { cdnCache } from '@/lib/lkg';

export const revalidate = 3600;

// Always 200 with valid XML: database → snapshot (lib/lkg.ts) → the static theme route list.
export async function GET() {
  let entries = await sitemapEntries().catch((e) => { console.error('[sitemap]', (e as Error)?.message || e); return []; });
  if (!entries.length) entries = staticSitemapEntries();
  return new Response(sitemapXml(entries), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': cdnCache() } });
}
