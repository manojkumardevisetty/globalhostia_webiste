// Theme menu / footer partials (loaded by the theme's JS), served from editable DB blocks.
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { siteVars } from '@/lib/render/page';
import { tokens } from '@/lib/render/util';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const key = 'tp-' + file.replace(/\.html$/, '').replace(/[^a-z0-9-]/gi, '');
  const [b] = await db.select().from(schema.blocks).where(eq(schema.blocks.key, key)).limit(1);
  if (!b) return new Response('Not found', { status: 404 });
  const { vars } = siteVars(await getSettings());
  return new Response(tokens(b.html, vars), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=60, stale-while-revalidate=600' } });
}
