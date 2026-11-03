// Theme menu / footer partials (loaded by the theme's JS), served from editable DB blocks.
import { getSettings } from '@/lib/settings';
import { siteVars } from '@/lib/render/page';
import { tokens } from '@/lib/render/util';
import { cdnCache } from '@/lib/lkg';
import { blockHtml } from '@/lib/blocks';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const key = 'tp-' + file.replace(/\.html$/, '').replace(/[^a-z0-9-]/gi, '');
  const html = await blockHtml(key).catch(() => null);
  if (html === null) return new Response('Not found', { status: 404, headers: { 'cache-control': 'public, s-maxage=60' } });
  const { vars } = siteVars(await getSettings());
  return new Response(tokens(html, vars), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cdnCache() } });
}
