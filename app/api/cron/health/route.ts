// Daily domain health run from Vercel Cron (vercel.json, 04:17 UTC = 08:17 Dubai, so alerts land after quiet hours).
// Bearer CRON_SECRET. Domains are checked oldest-first (cursor in domain_health.last_checked) within the time budget;
// the WHMCS cron tick (/api/reminders/webhook) adds short runs through the day, and any external scheduler may call
// this endpoint more often with the same token. ?limit=N caps the domains probed in this call.
import { NextRequest, NextResponse } from 'next/server';
import { runHealth } from '@/lib/health/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const limit = Number(req.nextUrl.searchParams.get('limit')) || undefined;
  const r = await runHealth('cron', { deadlineMs: 270_000, limit }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
}
