// Daily hosting usage alerts from Vercel Cron (vercel.json, 05:23 UTC = 09:23 Dubai, after quiet hours). Bearer CRON_SECRET.
// Refreshes usage older than 6 hours from the hosting panels and emails threshold crossings (lib/cx/usage.ts); an
// external scheduler may call it more often with the same token (each threshold is emailed once per month at most).
import { NextRequest, NextResponse } from 'next/server';
import { runUsageAlerts } from '@/lib/cx/usage';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const r = await runUsageAlerts('cron', { deadlineMs: 270_000 }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
}
