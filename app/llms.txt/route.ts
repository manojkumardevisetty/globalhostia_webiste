// /llms.txt — generated from the live catalog (cached 1h, tag 'site').
import { unstable_cache } from 'next/cache';
import { buildLlms } from '@/lib/agents/llms';

export const dynamic = 'force-dynamic';

const cached = unstable_cache(() => buildLlms(false), ['llms-txt', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'], revalidate: 3600 });

export async function GET() {
  return new Response(await cached(), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
