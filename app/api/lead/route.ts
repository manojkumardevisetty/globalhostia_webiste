// Public: lead capture (footer "Get hosting deals & guides", pop-up email capture, plan finder, /lp/<slug>).
// Stores the lead only: nothing is emailed and nothing is sent to WHMCS (no AddClient / AddContact).
// Validation, honeypot + time trap, per-IP rate limit (memory + DB), dedupe by email within 24h, hashed IP only.
// Accepts JSON (fetch from /hp/track.js or /hp/promo.js → JSON reply) or a plain form post (→ 303 back to the page).
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { clean, EMAIL, SOURCE, UTM_KEYS, UTM_COOKIE, normPhone, parseUtmCookie, safePath, utmVal } from '@/lib/leads';
import { limit } from '@/lib/security/ratelimit';
import { checkTurnstile, TOKEN_FIELD, TS_MESSAGE } from '@/lib/security/turnstile';

export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function memLimited(key: string, max = 5, windowMs = 10 * 60_000) {
  const now = Date.now();
  const l = (hits.get(key) || []).filter((t) => now - t < windowMs);
  l.push(now); hits.set(key, l);
  if (hits.size > 5000) hits.clear();
  return l.length > max;
}

type Input = Record<string, unknown>;
async function readBody(req: NextRequest): Promise<{ data: Input; json: boolean }> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const text = await req.text().catch(() => '');
    if (text.length > 8000) return { data: {}, json: true };
    try { const d = JSON.parse(text); return { data: d && typeof d === 'object' ? d : {}, json: true }; } catch { return { data: {}, json: true }; }
  }
  const fd = await req.formData().catch(() => null);
  const data: Input = {};
  if (fd) for (const [k, v] of fd.entries()) if (typeof v === 'string') data[k] = v;
  return { data, json: false };
}

const NO_STORE = { 'cache-control': 'no-store' };

export async function POST(req: NextRequest) {
  const { data, json } = await readBody(req);
  const page = safePath(data.page) || safePath(req.headers.get('referer')?.replace(/^https?:\/\/[^/]+/i, '')) || '/';
  const reply = (status: number, body: { ok: boolean; error?: string; fields?: Record<string, string>; dedup?: boolean }) => {
    if (json) return NextResponse.json(body, { status, headers: NO_STORE });
    const u = new URL(page.split('#')[0], req.url);
    u.searchParams.set('lead', body.ok ? 'ok' : 'error');
    u.hash = 'gh-lead';
    return NextResponse.redirect(u, 303);
  };

  // bots: hidden field filled, or submitted faster than a person can type
  const started = Number(data.t || 0);
  if (clean(data.website, 200) || (started > 0 && Date.now() - started < 1500)) return reply(200, { ok: true });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipHash = createHash('sha256').update(`${ip}|${process.env.AUTH_SECRET || 'gh'}`).digest('hex').slice(0, 24);

  const email = clean(data.email, 160).toLowerCase();
  const phone = normPhone(data.phone ?? data.whatsapp);
  const source = clean(data.source, 80).toLowerCase();
  const consent = data.consent === true || data.consent === 'on' || data.consent === 'true' || data.consent === '1';
  const fields: Record<string, string> = {};
  if (!EMAIL.test(email)) fields.email = 'Please enter a valid email address.';
  if (phone === null) fields.phone = 'Use digits only, with your country code (for example +971 50 000 0000).';
  if (!consent) fields.consent = 'Please tick the box to agree to hear from us.';
  if (!SOURCE.test(source)) return reply(400, { ok: false, error: 'Unknown form.' });
  if (Object.keys(fields).length) return reply(422, { ok: false, error: 'Please check the highlighted fields.', fields });

  if (memLimited(ipHash)) return reply(429, { ok: false, error: 'Too many sign-ups from your connection. Please wait a few minutes.' });
  // central limiter (lib/security/ratelimit.ts) per IP and per email, then Cloudflare Turnstile when switched on (Admin > Security)
  { const g = await limit('form', ip, String(data.email || '').trim().toLowerCase() || null); if (!g.ok) return reply(429, { ok: false, error: g.message }); }
  { const t = await checkTurnstile('lead', data[TOKEN_FIELD], ip); if (!t.ok) return reply(400, { ok: false, error: TS_MESSAGE }); }
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.leads)
      .where(and(eq(schema.leads.ipHash, ipHash), gt(schema.leads.createdAt, new Date(Date.now() - 3600_000))));
    if (n >= 10) return reply(429, { ok: false, error: 'Too many sign-ups from your connection. Please try again later.' });
  } catch { /* table unavailable: memory limit still applies */ }

  // UTM: body (from the first-party cookie, via track.js) first, then the cookie itself
  const fromCookie = parseUtmCookie(req.cookies.get(UTM_COOKIE)?.value);
  const bodyUtm = (data.utm && typeof data.utm === 'object' ? data.utm : data) as Record<string, unknown>;
  const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, utmVal(bodyUtm[k]) || fromCookie[k] || ''])) as Record<(typeof UTM_KEYS)[number], string>;
  const lead = {
    email, phone: phone || '', name: clean(data.name, 80), source, page,
    utmSource: utm.utm_source, utmMedium: utm.utm_medium, utmCampaign: utm.utm_campaign, utmTerm: utm.utm_term, utmContent: utm.utm_content,
    country: (req.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
    interest: clean(data.interest, 500), consent, ipHash,
  };

  try {
    // same email within 24h: keep one row, fill in what was missing
    const [dup] = await db.select().from(schema.leads)
      .where(and(eq(schema.leads.email, email), gt(schema.leads.createdAt, new Date(Date.now() - 24 * 3600_000)))).limit(1);
    if (dup) {
      const interest = lead.interest && !dup.interest.includes(lead.interest) ? clean([dup.interest, lead.interest].filter(Boolean).join(' | '), 1000) : dup.interest;
      await db.update(schema.leads).set({
        phone: dup.phone || lead.phone, name: dup.name || lead.name, interest, updatedAt: new Date(),
        ...(dup.utmSource ? {} : { utmSource: lead.utmSource, utmMedium: lead.utmMedium, utmCampaign: lead.utmCampaign, utmTerm: lead.utmTerm, utmContent: lead.utmContent }),
      }).where(eq(schema.leads.id, dup.id));
      return reply(200, { ok: true, dedup: true });
    }
    const [row] = await db.insert(schema.leads).values(lead).returning({ id: schema.leads.id });
    await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'lead_create', entity: 'lead', entityId: row.id, detail: { source, page, utm_source: lead.utmSource, country: lead.country } as any }).catch(() => {});
    return reply(200, { ok: true });
  } catch {
    return reply(503, { ok: false, error: 'We could not save your details right now. Please try again in a minute, or message us on WhatsApp.' });
  }
}
