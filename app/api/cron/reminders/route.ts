// Daily reminder run from Vercel Cron (vercel.json, 06:00 UTC = 10:00 Dubai, outside quiet hours). Bearer CRON_SECRET.
// Cart reminders need more frequent runs: the WHMCS hook's cron tick (AfterCronJob → /api/reminders/webhook) or any
// external scheduler calling this endpoint every 15 minutes with the same Bearer token.
import { NextRequest, NextResponse } from 'next/server';
import { runReminders } from '@/lib/reminders/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const r = await runReminders('cron', { deadlineMs: 270_000 }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
}
