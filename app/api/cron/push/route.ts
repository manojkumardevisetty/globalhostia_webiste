// Portal web push scan: answered tickets, new / overdue invoices, domains expiring within 7 days, suspended services,
// for every client with a subscribed device (lib/portal/push.ts). Bearer CRON_SECRET. The daily /api/cron/sync run calls
// the same scan; call this endpoint more often (e.g. every 15 minutes from an external scheduler) for timely alerts.
import { NextRequest, NextResponse } from 'next/server';
import { scanAndNotify } from '@/lib/portal/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const r = await scanAndNotify().catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } });
}
