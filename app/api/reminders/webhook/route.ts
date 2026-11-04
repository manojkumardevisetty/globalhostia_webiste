// Signed server-to-server webhook from the WHMCS hook (docs/whmcs/globalhostia_reminders_hook.php).
// Header X-GH-Signature: t=<unix>,v1=<hex HMAC-SHA256("gh-hook.v1.<t>.<body>")> with the shared hook secret; 5-minute window.
//   {"event":"order","orderid":N,"invoiceid":N,"cid":N,"email":"…","sk":"<session hash>"}   cart ordered → reminders stop
//   {"event":"invoice_paid","invoiceid":N}                                                  overdue / renewal reminders stop; seller listing fees
//   {"event":"tick"}                                                                          WHMCS cron ran → reminder run (max every 10 min), ticket check
import { NextRequest, NextResponse, after } from 'next/server';
import { verifyHook, EMAIL_RE } from '@/lib/reminders/core';
import { hookSecret, cartsOrdered, patchState, state, setPrefs, closeCart } from '@/lib/reminders/store';
import { invoicePaid, runReminders } from '@/lib/reminders/engine';
import { tickHealth } from '@/lib/health/engine';
import { tickCx } from '@/lib/cx/feedback-tick';
import { kickContent } from '@/lib/content/kick';
import { sellerInvoicePaid, sellerTick } from '@/lib/sell/store';
import { limiter } from '@/lib/agents/http';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { orderPlaced } from '@/lib/abtest/store';
import { checkTicketsSoon } from '@/lib/support-notify';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const limit = limiter(120, 60_000);
const TICK_EVERY_MS = 10 * 60_000;

export async function POST(req: NextRequest) {
  { const blocked = await guard(req, 'reminders'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
  if (limit(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  const body = await req.text();
  if (body.length > 4000) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const secret = await hookSecret();
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!verifyHook(req.headers.get('x-gh-signature'), body, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let e: any;
  try { e = JSON.parse(body); } catch { return NextResponse.json({ error: 'invalid' }, { status: 400 }); }
  const ev = String(e?.event || '');
  await patchState({ lastHook: new Date().toISOString(), lastHookEvent: ev });

  if (ev === 'order') {
    const cid = Number(e.cid) > 0 ? Number(e.cid) : null;
    const email = typeof e.email === 'string' && EMAIL_RE.test(e.email) ? e.email.toLowerCase() : '';
    const orderId = Number(e.orderid) > 0 ? Number(e.orderid) : undefined;
    // A/B tests: count the order (and its WHMCS total) for the variants this cart session was tagged with (lib/abtest/store.ts)
    after(() => orderPlaced({ orderId, sk: typeof e.sk === 'string' && /^[a-f0-9]{16,64}$/.test(e.sk) ? e.sk : '', cid }).then(() => undefined, (x) => console.warn('[abtest] order', x?.message || x)));
    const closed = await cartsOrdered(cid, email, orderId);
    // guest cart of this browser session (the guest just became a client)
    if (typeof e.sk === 'string' && /^[a-f0-9]{16,64}$/.test(e.sk)) {
      const [g] = await db.select().from(schema.reminderCarts).where(eq(schema.reminderCarts.cartKey, `g:${e.sk}`));
      if (g) { await closeCart(g.id, 'ordered', orderId); if (g.status === 'open') closed.push(g); }
    }
    // WhatsApp opt-in ticked by a guest at checkout: now that the account exists, record it on the client
    if (cid && closed.some((c) => c.whatsappOptIn)) await setPrefs(cid, email, { whatsapp: true }, 'checkout').catch(() => {});
    return NextResponse.json({ ok: true, carts: closed.length });
  }
  if (ev === 'invoice_paid') {
    const id = Number(e.invoiceid);
    if (!(id > 0)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    after(() => invoicePaid(id).catch((x) => console.warn('[reminders] invoice_paid', x?.message || x)));
    // "Sell your domain" fee invoices (lib/sell): verified with GetInvoice, then listing → in review / renewed / featured
    after(() => sellerInvoicePaid(id).then(() => undefined));
    return NextResponse.json({ ok: true });
  }
  if (ev === 'tick') {
    // domain health checks ride the same WHMCS cron tick (their own 10-minute spacing and lock: lib/health/engine.ts)
    after(() => tickHealth().catch((x) => console.warn('[health] tick', x?.message || x)));
    // ticket rating requests (closed tickets polled with GetTickets) and the monthly site report window (lib/cx)
    after(() => tickCx().then(() => undefined, (x) => console.warn('[cx] tick', x?.message || x)));
    // content engine: scheduled posts go live on time and the day's articles get drafted (own route, maxDuration 300)
    after(() => kickContent(req.nextUrl.origin, 'whmcs'));
    // seller listing fee invoices: fallback payment poll, at most every 15 minutes (lib/sell/store.ts)
    after(() => sellerTick().then(() => undefined));
    // support tickets: owner alert, ticket spam filter (lib/ai/spam.ts) and AI assistant; locked and claimed per ticket
    // activity, so the every-5-minutes WHMCS cron only does work when a ticket is new or has a new reply
    checkTicketsSoon('whmcs-tick');
    const st = await state();
    const last = st.lastRun ? Date.parse(st.lastRun) : 0;
    if (Date.now() - last < TICK_EVERY_MS) return NextResponse.json({ ok: true, skipped: 'recent' });
    after(() => runReminders('whmcs-cron', { deadlineMs: 45_000 }).catch((x) => console.warn('[reminders] tick', x?.message || x)));
    return NextResponse.json({ ok: true, started: true });
  }
  return NextResponse.json({ error: 'unknown_event' }, { status: 400 });
}
