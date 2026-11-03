import { NextRequest, NextResponse } from 'next/server';
import { syncAll } from '@/lib/sync';
import { getSettings } from '@/lib/settings';
import { whmcsConfigured } from '@/lib/whmcs';
import { checkTickets } from '@/lib/support-notify';
import { submitChanged } from '@/lib/indexnow';
import { scanAndNotify } from '@/lib/portal/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // IndexNow: sitemap URLs whose <lastmod> moved since yesterday's run (after the catalog sync below)
  const indexnow = async () => (process.env.VERCEL_ENV === 'production' ? submitChanged('daily cron') : null);
  if (!whmcsConfigured()) return NextResponse.json({ skipped: true, indexnow: await indexnow() });
  // daily safety net for ticket emails (independent of the catalog auto-sync switch)
  const support = await checkTickets('cron').catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  // portal web push (tickets, invoices, expiring domains, suspensions); /api/cron/push runs the same scan on its own schedule
  const push = await scanAndNotify().catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
  const s = await getSettings();
  if (s.sync_auto === false) return NextResponse.json({ skipped: true, support, push, indexnow: await indexnow() });
  const sync = await syncAll('cron');
  return NextResponse.json({ ...sync, support, push, indexnow: await indexnow() });
}
