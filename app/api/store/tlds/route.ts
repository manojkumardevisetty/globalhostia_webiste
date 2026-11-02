// Public TLD prices + reference renewal comparison for the client-area domain search (whmcs.js).
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { REF_PRICES, REF_PRICES_CHECKED } from '@/lib/compare';

export const revalidate = 3600;

export async function GET() {
  const rows = await db.select().from(schema.tlds).where(eq(schema.tlds.visible, true));
  const items: Record<string, { reg: number | null; renew: number | null; ref?: { reg: number; renew: number } }> = {};
  for (const r of rows) {
    if (r.currency !== 'USD') continue;
    items[r.tld] = { reg: r.register ? Number(r.register) : null, renew: r.renew ? Number(r.renew) : null, ...(REF_PRICES[r.tld] ? { ref: REF_PRICES[r.tld] } : {}) };
  }
  return NextResponse.json({ currency: 'USD', compareChecked: REF_PRICES_CHECKED, items },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
