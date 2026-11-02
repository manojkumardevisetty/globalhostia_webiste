import { NextRequest, NextResponse } from 'next/server';
import { syncAll } from '@/lib/sync';
import { getSettings } from '@/lib/settings';
import { whmcsConfigured } from '@/lib/whmcs';
import { checkTickets } from '@/lib/support-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!whmcsConfigured()) return NextResponse.json({ skipped: true });
  // daily safety net for ticket emails (independent of the catalog auto-sync switch)
  const support = await checkTickets('cron').catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  const s = await getSettings();
  if (s.sync_auto === false) return NextResponse.json({ skipped: true, support });
  return NextResponse.json({ ...(await syncAll('cron')), support });
}
