import 'server-only';
// Renderer helper: the A/B slots for this request (variant from middleware's x-gh-ab header, promoted copy, default).
import { headers } from 'next/headers';
import { pageAb, abRequest, type PageAb } from './apply';

export async function abForPage(settings: Record<string, any>, ctx: { slug: string; query: URLSearchParams }, target: string): Promise<PageAb> {
  const h = await headers().catch(() => null);
  return pageAb(settings, abRequest(ctx.query, h), `/${ctx.slug}`, target);
}
