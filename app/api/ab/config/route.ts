// Running A/B tests for middleware.ts (lib/abtest/edge.ts): ids, paths and weights only (no texts). CDN-cached 60 s.
// consent: true when the cookie banner is active (a tracker is configured), so only visitors who accepted take part.
import { getSettings } from '@/lib/settings';
import { normExperiments, edgeConfig } from '@/lib/abtest/core';
import { anyTracker, normTracking } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

export async function GET() {
  let body;
  try {
    const s = await getSettings();
    body = edgeConfig(normExperiments(s.ab_experiments), anyTracker(normTracking(s.tracking)));
  } catch { body = { consent: true, exps: [] }; }
  return Response.json(body, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=60', 'x-robots-tag': 'noindex' } });
}
