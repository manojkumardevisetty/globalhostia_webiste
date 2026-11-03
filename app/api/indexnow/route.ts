// Status of the automatic IndexNow submissions (lib/indexnow.ts): when they ran, how many URLs, the HTTP answer.
// Read-only and public (no secrets: the IndexNow key is public by design); also shown on Admin > SEO.
import { NextResponse } from 'next/server';
import { indexNowLog } from '@/lib/indexnow';

export const dynamic = 'force-dynamic';

export async function GET() {
  const log = await indexNowLog().catch(() => []);
  return NextResponse.json({ deployment: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null, submissions: log.slice(0, 10) }, {
    headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}
