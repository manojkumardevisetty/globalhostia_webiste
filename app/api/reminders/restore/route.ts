// "Complete your order" link in a cart reminder: verify the signed link, count the click, send the customer to the
// WHMCS order link of the first item (a documented cart.php?a=add link, with the owner's promo code on reminder 3).
// A short-lived gh_restore cookie on .globalhostia.com lets public/hp/whmcs.js add the cart's other items too.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { verifyRestore, productLink, domainLink } from '@/lib/reminders/core';
import { getCart, linkSecret, loadConfig } from '@/lib/reminders/store';
import { getSettings } from '@/lib/settings';
import { whmcsBase } from '@/lib/theme/data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSettings().catch(() => ({} as any));
  const base = whmcsBase(s);
  const tok = req.nextUrl.searchParams.get('t');
  let c;
  try { c = verifyRestore(tok, linkSecret()); } catch { c = null; }
  const cart = c ? await getCart(c.id).catch(() => null) : null;
  const view = `${base}/cart.php?a=view`;
  if (!c || !cart) return NextResponse.redirect(view, 303);
  await db.execute(sql`update reminder_carts set restore_clicks = restore_clicks + 1 where id = ${cart.id}`).catch(() => {});
  if (cart.status !== 'open') return NextResponse.redirect(view, 303);
  const cfg = await loadConfig();
  const promo = c.st === 'c3' && cfg.cart.thirdEnabled && cfg.cart.promoCode ? cfg.cart.promoCode : undefined;
  const it = cart.items as any;
  const first = it.p?.[0] ? productLink(base, it.p[0], { promo, currency: cart.currencyId || undefined }) : it.d?.[0] ? domainLink(base, it.d[0], { promo }) : view;
  const res = NextResponse.redirect(first, 303);
  res.headers.set('cache-control', 'no-store');
  res.headers.set('referrer-policy', 'no-referrer');
  const host = req.headers.get('host') || '';
  if ((it.p?.length || 0) + (it.d?.length || 0) > 1)
    res.cookies.set('gh_restore', tok!, { path: '/', maxAge: 900, sameSite: 'lax', secure: true, httpOnly: false, ...(/(^|\.)globalhostia\.com$/i.test(host.split(':')[0]) ? { domain: '.globalhostia.com' } : {}) });
  return res;
}
