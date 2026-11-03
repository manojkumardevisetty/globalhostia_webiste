// Public TLD prices + reference renewal comparison for the client-area domain search (whmcs.js).
// ?currency=AED → our prices in that currency; reference prices are converted with our own USD→currency ratio.
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { REF_PRICES, REF_PRICES_CHECKED } from '@/lib/compare';
import { cachedRead } from '@/lib/lkg';

// cached 6h (tag `site`); snapshot-backed when the database is unavailable (lib/lkg.ts)
const tldRows = cachedRead('store-tlds', async (cur: string) => ({
  rows: await db.select().from(schema.tlds).where(eq(schema.tlds.visible, true)),
  extra: cur === 'USD' ? [] : await db.select().from(schema.tldPrices).where(eq(schema.tldPrices.currency, cur)),
}), { fallback: () => ({ rows: [], extra: [] }) });

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const cur = (req.nextUrl.searchParams.get('currency') || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'USD';
  const { rows, extra } = await tldRows(cur);
  const byTld = new Map(extra.map((x) => [x.tld, x]));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const items: Record<string, { reg: number | null; renew: number | null; ref?: { reg: number; renew: number } }> = {};
  for (const r of rows) {
    if (r.currency !== 'USD') continue;
    const usdRenew = n(r.renew), ref = REF_PRICES[r.tld];
    if (cur === 'USD') { items[r.tld] = { reg: n(r.register), renew: usdRenew, ...(ref ? { ref } : {}) }; continue; }
    const x = byTld.get(r.tld); if (!x) continue;
    const renew = n(x.renew), ratio = renew && usdRenew ? renew / usdRenew : null;
    items[r.tld] = { reg: n(x.register), renew, ...(ref && ratio ? { ref: { reg: +(ref.reg * ratio).toFixed(2), renew: +(ref.renew * ratio).toFixed(2) } } : {}) };
  }
  return NextResponse.json({ currency: cur, compareChecked: REF_PRICES_CHECKED, items },
    { headers: { 'access-control-allow-origin': '*', 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
}
