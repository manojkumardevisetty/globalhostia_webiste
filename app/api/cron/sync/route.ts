import { NextRequest, NextResponse } from 'next/server';
import { syncAll } from '@/lib/sync';
import { getSettings } from '@/lib/settings';
import { whmcsConfigured } from '@/lib/whmcs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const s = await getSettings();
  if (s.sync_auto === false || !whmcsConfigured()) return NextResponse.json({ skipped: true });
  return NextResponse.json(await syncAll('cron'));
}
