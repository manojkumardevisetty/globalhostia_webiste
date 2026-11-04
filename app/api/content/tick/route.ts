// Content engine tick (lib/content/daily.ts): publishes scheduled posts on time (IndexNow + fresh blog data), fills the
// day's publish slots with new topics and drafts them. Vercel Hobby allows one daily cron, so this is kicked through the
// day by the WHMCS cron webhook and by page traffic (lib/content/kick.ts), at most about every 10 minutes.
// Auth: Authorization: Bearer <CRON_SECRET>. The work runs after the response (up to maxDuration).
import { NextRequest, NextResponse, after } from 'next/server';
import { runDaily } from '@/lib/content/daily';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const trigger = (req.nextUrl.searchParams.get('from') || 'tick').replace(/[^a-z-]/gi, '').slice(0, 20) || 'tick';
  // new drafts start within the first 100 s; a draft takes 1–2 minutes, so the run ends well inside 300 s
  after(() => runDaily({ deadlineMs: 100_000, trigger }).then(() => undefined).catch((e) => console.warn('[content] tick', e?.message || e)));
  return NextResponse.json({ ok: true, started: true }, { status: 202 });
}
export const GET = handle;
export const POST = handle;
