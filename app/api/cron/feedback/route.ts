// Daily client-experience run from Vercel Cron (vercel.json, 07:41 UTC = 11:41 Dubai): ticket rating requests for
// tickets closed since the last WHMCS cron tick, and the monthly site report while its window is open (days 1–2 of the
// month by default). The WHMCS cron tick (/api/reminders/webhook) runs the same jobs in short slices all day.
// Bearer CRON_SECRET.
import { NextRequest, NextResponse } from 'next/server';
import { cronCx } from '@/lib/cx/feedback-tick';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const r = await cronCx().catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
}
