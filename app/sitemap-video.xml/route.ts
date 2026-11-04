import { videoSitemapXml } from '@/lib/sitemap';
import { getSettings } from '@/lib/settings';
import { cdnCache } from '@/lib/lkg';

export const revalidate = 3600;

// Help centre how-to videos (lib/help): always 200 with valid XML, from the topic defaults when settings are unavailable.
export async function GET() {
  const s = await getSettings().catch(() => null);
  const base = String(s?.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  return new Response(videoSitemapXml(s, base), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': cdnCache() } });
}
