// Public: purchase request for a premium domain from /premium-domains/<domain> → broker_requests row (kind 'premium')
// + WHMCS support ticket. No payment here: the broker confirms the name and price, sends a WHMCS invoice and transfers it.
// Protections: same-origin check + signed form token (CSRF), honeypot + time trap, consent, per-IP rate limit (memory + DB),
// server-side price (the price comes from our own listing data, never from the form). Secrets never leave the server.
import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { brokerConfig } from '@/lib/broker';
import { premiumItems, premiumConfig } from '@/lib/premium/store';
import { checkToken } from '@/lib/premium/token';
import { cleanDomain, fmtMoney, PREMIUM_PATH } from '@/lib/premium/core';
import { transport, getListingItem } from '@/lib/premium/dynadot';

export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function memLimited(key: string, max = 4, windowMs = 10 * 60_000) {
  const now = Date.now();
  const l = (hits.get(key) || []).filter((t) => now - t < windowMs);
  l.push(now); hits.set(key, l);
  if (hits.size > 5000) hits.clear();
  return l.length > max;
}
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i;
const amount = (v: unknown) => { const s = clean(v, 20).replace(/[,\s]/g, ''); if (!s) return null; const n = Number(s); return /^\d+(\.\d{1,2})?$/.test(s) && Number.isFinite(n) ? n : NaN; };
const newRef = () => 'PD-' + randomBytes(5).toString('hex').toUpperCase().slice(0, 8);

type Reply = { ok: boolean; ref?: string; error?: string; fields?: Record<string, string> };

/** Same site only: Origin (or Referer) must be this host or the configured site URL. */
function sameOrigin(req: NextRequest, site: string) {
  const o = req.headers.get('origin') || (() => { try { return new URL(req.headers.get('referer') || '').origin; } catch { return ''; } })();
  if (!o) return false;
  const allowed = new Set([new URL(req.url).origin, site.replace(/\/$/, '')]);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) allowed.add(`https://${host}`), allowed.add(`http://${host}`);
  return allowed.has(o);
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') || '';
  const json = ct.includes('application/json');
  let data: Record<string, unknown> = {};
  if (json) data = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  else { const fd = await req.formData().catch(() => null); if (fd) for (const [k, v] of fd.entries()) if (typeof v === 'string') data[k] = v; }
  const domain = cleanDomain(clean(data.domain, 253));
  const reply = (status: number, body: Reply) => {
    if (json) return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
    const u = new URL(domain ? `${PREMIUM_PATH}/${domain}` : PREMIUM_PATH, req.url);
    if (body.ok && body.ref) u.searchParams.set('ref', body.ref); else u.searchParams.set('error', body.error || 'Something went wrong');
    u.hash = 'request';
    return NextResponse.redirect(u, 303);
  };
  const s = await getSettings();
  const site = String(s.site_url || 'https://globalhostia.com');
  if (!sameOrigin(req, site)) return reply(403, { ok: false, error: 'Please send the form from our website.' });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipKey = createHash('sha256').update(`${ip}|${process.env.AUTH_SECRET || 'gh'}`).digest('hex').slice(0, 24);
  const started = Number(data.t || 0);
  if (clean(data.company_url, 200) || (started && Date.now() - started < 2500)) return reply(200, { ok: true, ref: 'received' });
  if (!domain || !checkToken(data.tk, domain)) return reply(400, { ok: false, error: 'This form has expired. Please reload the page and try again.' });

  const cfg = await premiumConfig();
  const item = cfg.enabled ? (await premiumItems()).find((i) => i.domain === domain) : undefined;
  if (!item) return reply(410, { ok: false, error: 'This domain is no longer listed. Our broker can still try to get it for you.' });

  const intent = item.price === null || data.intent === 'offer' ? 'offer' : 'buy';
  const f = { name: clean(data.name, 80), email: clean(data.email, 120).toLowerCase(), phone: clean(data.phone, 30), notes: clean(data.notes, 1500), offer: amount(data.offer),
    consent: data.consent === true || data.consent === 'on' || data.consent === 'yes' || data.consent === '1' };
  const fields: Record<string, string> = {};
  if (intent === 'offer') {
    if (f.offer === null || Number.isNaN(f.offer) || f.offer <= 0) fields.offer = 'Enter your offer as a number, for example 2500.';
    else if (f.offer > 100_000_000) fields.offer = 'Please enter a realistic offer.';
    else if (item.minOffer && f.offer < item.minOffer) fields.offer = `The minimum offer for this name is ${fmtMoney(item.minOffer, item.currency)}.`;
  }
  if (f.name.length < 2) fields.name = 'Please enter your name.';
  if (!EMAIL.test(f.email)) fields.email = 'Please enter a valid email address.';
  if (f.phone && !/^\+?[\d\s()-]{6,30}$/.test(f.phone)) fields.phone = 'Use digits only, with your country code (for example +971 50 000 0000).';
  if (!f.consent) fields.consent = 'Please confirm we may contact you about this domain.';
  if (Object.keys(fields).length) return reply(422, { ok: false, error: 'Please check the highlighted fields.', fields });

  if (memLimited(ipKey)) return reply(429, { ok: false, error: 'Too many requests from your connection. Please wait a few minutes, or contact us on WhatsApp.' });
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.brokerRequests)
      .where(and(eq(schema.brokerRequests.ipHash, ipKey), gt(schema.brokerRequests.createdAt, new Date(Date.now() - 3600_000))));
    if (n >= 6) return reply(429, { ok: false, error: 'Too many requests from your connection. Please try again later, or contact us on WhatsApp.' });
  } catch { /* the insert below reports a missing table */ }

  // marketplace listing: re-check with Dynadot (best effort, short timeout) so the broker sees the live price in the ticket
  let live: { amount: number; currency: string } | null | 'unknown' = 'unknown';
  if (item.source === 'dynadot' && item.listingId) {
    try { const t = await transport(cfg); const r = t.mode === 'none' ? null : await getListingItem(t, item.listingId); live = r ? { amount: r.amount, currency: r.currency } : null; } catch { live = 'unknown'; }
  }
  const price = intent === 'buy' ? item.price : f.offer!;
  const listing = { source: item.source, owned: item.owned, listedPrice: item.price, currency: item.currency, minOffer: item.minOffer, intent, base: item.base ?? null, fee: item.fee ?? null,
    listingId: item.listingId || null, liveCheck: live === 'unknown' ? 'not checked' : live ? `${live.amount} ${live.currency}` : 'not found (may be sold)' };

  let ref = newRef();
  try {
    for (let i = 0; ; i++) {
      try {
        await db.insert(schema.brokerRequests).values({
          ref, domain, budgetMin: null, budgetMax: price === null ? null : String(price), currency: item.currency, name: f.name, email: f.email, phone: f.phone,
          notes: f.notes, use: intent === 'buy' ? 'Premium domain: buy now' : 'Premium domain: offer', status: 'new', ipHash: ipKey, kind: 'premium', listing: listing as any,
          referrer: clean(req.headers.get('referer'), 300),
        });
        break;
      } catch (e: any) { if (i < 2 && /unique|duplicate/i.test(String(e?.message))) { ref = newRef(); continue; } throw e; }
    }
  } catch (e: any) {
    await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'premium_request', entity: 'broker_request', entityId: null, detail: { ip: ipKey, ok: false, error: String(e?.message || e).slice(0, 300) } as any }).catch(() => {});
    return reply(502, { ok: false, error: 'We could not save your request right now. Please try again in a minute, or contact us by WhatsApp or email.' });
  }

  let ticket = '', ticketError = '';
  if (whmcsConfigured()) {
    try {
      let deptid = brokerConfig(s).dept;
      if (!deptid) {
        const r = await whmcs<{ departments?: { department?: { id: number | string; name: string }[] } }>('GetSupportDepartments', { ignore_dept_assignments: true });
        const l = r.departments?.department || [];
        const pick = l.find((d) => /domain|broker/i.test(d.name)) || l.find((d) => /sales/i.test(d.name)) || l.find((d) => /support/i.test(d.name)) || l[0];
        deptid = pick ? String(pick.id) : '';
      }
      if (deptid) {
        const message = [
          `Premium domain purchase request (reference ${ref}).`, '',
          `Domain: ${domain}`, `Request: ${intent === 'buy' ? `Buy now at ${fmtMoney(item.price!, item.currency)}` : `Offer of ${fmtMoney(f.offer!, item.currency)}${item.price !== null ? ` (listed at ${fmtMoney(item.price, item.currency)})` : ''}`}`,
          `Listing: ${item.source === 'dynadot' ? `Dynadot marketplace, listing ${item.listingId || '?'}${item.base !== undefined ? `, Dynadot price ${fmtMoney(item.base)} + broker fee ${fmtMoney(item.fee!)}` : ''}; live check: ${listing.liveCheck}` : item.owned ? 'own domain' : 'brokered for a third party'}`,
          `Name: ${f.name}`, `Email: ${f.email}`, `Phone / WhatsApp: ${f.phone || '-'}`, '', 'Message:', f.notes || '-', '',
          'Next steps: confirm availability and price with the customer, create the invoice in WHMCS (Billing → Create Invoice), and after payment buy/push or transfer the domain to the customer.',
        ].join('\n');
        const r = await whmcs<{ id?: number; tid?: string }>('OpenTicket', { deptid, subject: `Premium domain request: ${domain}`.slice(0, 200), message, name: f.name, email: f.email, priority: 'High', markdown: false });
        ticket = String(r.tid || r.id || '');
        await db.update(schema.brokerRequests).set({ ticketNum: ticket, ticketId: String(r.id || '') }).where(eq(schema.brokerRequests.ref, ref)).catch(() => {});
      }
    } catch (e: any) { ticketError = String(e?.message || e).slice(0, 300); }
  }
  await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'premium_request', entity: 'broker_request', entityId: ref,
    detail: { ip: ipKey, ok: true, domain, intent, ticket, ...(ticketError ? { ticketError } : {}) } as any }).catch(() => {});
  return reply(200, { ok: true, ref });
}
