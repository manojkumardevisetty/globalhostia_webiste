// Public TLD prices + GoDaddy renewal comparison for the client-area domain search (whmcs.js).
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { GODADDY, GODADDY_CHECKED } from '@/lib/compare';

export const revalidate = 3600;

export async function GET() {
  const rows = await db.select().from(schema.tlds).where(eq(schema.tlds.visible, true));
  const items: Record<string, { reg: number | null; renew: number | null; gd?: { reg: number; renew: number } }> = {};
  for (const r of rows) {
    if (r.currency !== 'USD') continue;
    items[r.tld] = { reg: r.register ? Number(r.register) : null, renew: r.renew ? Number(r.renew) : null, ...(GODADDY[r.tld] ? { gd: GODADDY[r.tld] } : {}) };
  }
  return NextResponse.json({ currency: 'USD', compareChecked: GODADDY_CHECKED, items },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
