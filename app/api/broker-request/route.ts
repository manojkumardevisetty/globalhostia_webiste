// Public: Domain Broker Service request from /domain-broker → broker_requests row (+ WHMCS support ticket when possible).
// Same protections as /api/free-migration: server-side validation, honeypot + time trap, per-IP rate limit (memory + DB),
// API secrets never leave the server. The request is stored first, so a WHMCS outage never loses a lead.
// Accepts JSON (fetch from /hp/pages/broker.js → JSON reply) or a plain form post (→ 303 back to the page).
import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { validDomain } from '@/lib/agents/domain';
import { brokerConfig, BROKER_CURRENCIES } from '@/lib/broker';
import { autoEnsureBrokerProduct } from '@/lib/broker-whmcs';
import { getCatalog } from '@/lib/theme/data';

export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function memLimited(key: string, max = 3, windowMs = 10 * 60_000) {
  const now = Date.now();
  const l = (hits.get(key) || []).filter((t) => now - t < windowMs);
  l.push(now); hits.set(key, l);
  if (hits.size > 5000) hits.clear();
  return l.length > max;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i;
const amount = (v: unknown) => { const s = clean(v, 20).replace(/[,\s]/g, ''); if (!s) return null; const n = Number(s); return /^\d+(\.\d{1,2})?$/.test(s) && Number.isFinite(n) ? n : NaN; };
const newRef = () => 'BR-' + randomBytes(5).toString('hex').toUpperCase().slice(0, 8);

type Input = Record<string, unknown>;
async function readBody(req: NextRequest): Promise<{ data: Input; json: boolean }> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return { data: (await req.json().catch(() => ({}))) as Input, json: true };
  const fd = await req.formData().catch(() => null);
  const data: Input = {};
  if (fd) for (const [k, v] of fd.entries()) if (typeof v === 'string') data[k] = v;
  return { data, json: false };
}

type Reply = { ok: boolean; ref?: string; ticket?: string; payUrl?: string; error?: string; fields?: Record<string, string> };

export async function POST(req: NextRequest) {
  const { data, json } = await readBody(req);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipKey = createHash('sha256').update(`${ip}|${process.env.AUTH_SECRET || 'gh'}`).digest('hex').slice(0, 24);
  const reply = (status: number, body: Reply) => {
    if (json) return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
    const u = new URL('/domain-broker', req.url);
    if (body.ok && body.ref) { u.searchParams.set('ref', body.ref); if (body.payUrl) u.searchParams.set('pay', '1'); }
    else u.searchParams.set('error', body.error || 'Something went wrong');
    return NextResponse.redirect(u, 303);
  };

  // bots: hidden field filled, or submitted faster than a person can type
  const started = Number(data.t || 0);
  if (clean(data.company_url, 200) || (started && Date.now() - started < 2500)) return reply(200, { ok: true, ref: 'received' });

  const cur = clean(data.currency, 3).toUpperCase();
  const f = {
    domain: clean(data.domain, 253).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
    min: amount(data.budget_min), max: amount(data.budget_max), currency: (BROKER_CURRENCIES as readonly string[]).includes(cur) ? cur : 'USD',
    name: clean(data.name, 80), email: clean(data.email, 120).toLowerCase(), phone: clean(data.phone, 30),
    use: clean(data.use, 200), notes: clean(data.notes, 2000), consent: data.consent === true || data.consent === 'on' || data.consent === 'yes' || data.consent === '1',
    utmSource: clean(data.utm_source, 80), utmMedium: clean(data.utm_medium, 80), utmCampaign: clean(data.utm_campaign, 120), referrer: clean(data.referrer, 300),
  };
  const fields: Record<string, string> = {};
  const domain = validDomain(f.domain);
  if (!domain) fields.domain = 'Enter the full domain you want, for example yourbrand.com.';
  if (f.min !== null && (Number.isNaN(f.min) || f.min < 0)) fields.budget_min = 'Enter a number, or leave it empty.';
  if (f.max === null || Number.isNaN(f.max) || f.max <= 0) fields.budget_max = 'Enter the most you would pay for the domain.';
  else if (f.max > 100_000_000) fields.budget_max = 'Please enter a realistic maximum budget.';
  else if (f.min !== null && !Number.isNaN(f.min) && f.min > f.max) fields.budget_min = 'The minimum cannot be higher than the maximum.';
  if (f.name.length < 2) fields.name = 'Please enter your name.';
  if (!EMAIL.test(f.email)) fields.email = 'Please enter a valid email address.';
  if (f.phone && !/^\+?[\d\s()-]{6,30}$/.test(f.phone)) fields.phone = 'Use digits only, with your country code (for example +971 50 000 0000).';
  if (!f.consent) fields.consent = 'Please confirm you have read how the fees work.';
  if (Object.keys(fields).length) return reply(422, { ok: false, error: 'Please check the highlighted fields.', fields });

  if (memLimited(ipKey)) return reply(429, { ok: false, error: 'Too many requests from your connection. Please wait a few minutes, or contact us on WhatsApp.' });
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.brokerRequests)
      .where(and(eq(schema.brokerRequests.ipHash, ipKey), gt(schema.brokerRequests.createdAt, new Date(Date.now() - 3600_000))));
    if (n >= 5) return reply(429, { ok: false, error: 'Too many requests from your connection. Please try again later, or contact us on WhatsApp.' });
  } catch { /* table unavailable: the insert below reports it */ }

  // 1. store (the lead is never lost, whatever WHMCS does)
  let ref = newRef();
  try {
    for (let i = 0; ; i++) {
      try {
        await db.insert(schema.brokerRequests).values({
          ref, domain: domain!, budgetMin: f.min === null ? null : String(f.min), budgetMax: String(f.max), currency: f.currency,
          name: f.name, email: f.email, phone: f.phone, notes: f.notes, use: f.use, status: 'new',
          utmSource: f.utmSource, utmMedium: f.utmMedium, utmCampaign: f.utmCampaign, referrer: f.referrer, ipHash: ipKey,
        });
        break;
      } catch (e: any) { if (i < 2 && /unique|duplicate/i.test(String(e?.message))) { ref = newRef(); continue; } throw e; }
    }
  } catch (e: any) {
    await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'broker_request', entity: 'broker_request', entityId: null, detail: { ip: ipKey, ok: false, error: String(e?.message || e).slice(0, 300) } as any }).catch(() => {});
    return reply(502, { ok: false, error: 'We could not save your request right now. Please try again in a minute, or contact us by WhatsApp or email.' });
  }

  // 2. WHMCS ticket (best effort) + the fee product link
  const s = await getSettings();
  const cfg = brokerConfig(s);
  let ticket = '', ticketId = '', deptid = cfg.dept, ticketError = '';
  if (whmcsConfigured()) {
    try {
      if (!deptid) {
        const r = await whmcs<{ departments?: { department?: { id: number | string; name: string }[] } }>('GetSupportDepartments', { ignore_dept_assignments: true });
        const list = r.departments?.department || [];
        const pick = list.find((d) => /domain|broker/i.test(d.name)) || list.find((d) => /sales/i.test(d.name)) || list.find((d) => /support/i.test(d.name)) || list[0];
        deptid = pick ? String(pick.id) : '';
      }
      if (deptid) {
        const budget = `${f.min !== null ? `${f.min.toLocaleString('en-US')} to ` : 'up to '}${f.max!.toLocaleString('en-US')} ${f.currency}`;
        const message = [
          `A visitor requested the Domain Broker Service (reference ${ref}).`,
          '',
          `Domain wanted: ${domain}`, `Budget: ${budget}`,
          `Name: ${f.name}`, `Email: ${f.email}`, `Phone / WhatsApp: ${f.phone || '-'}`, `Intended use: ${f.use || '-'}`,
          '', 'Notes:', f.notes || '-',
          '', `Fees agreed on the form: ${cfg.feeUsd} USD non-refundable service fee; ${cfg.pct}% commission on the agreed price (minimum ${cfg.minUsd} USD), only if a deal closes.`,
          `WHOIS: https://lookup.icann.org/en/lookup?name=${domain}`,
          '', 'Next step: confirm the request and send the service fee invoice, then start research.',
        ].join('\n');
        const r = await whmcs<{ id?: number; tid?: string }>('OpenTicket', {
          deptid, subject: `Domain broker request: ${domain}`.slice(0, 200), message, name: f.name, email: f.email, priority: 'Medium', markdown: false,
        });
        ticket = String(r.tid || r.id || ''); ticketId = String(r.id || '');
        await db.update(schema.brokerRequests).set({ ticketNum: ticket, ticketId }).where(eq(schema.brokerRequests.ref, ref)).catch(() => {});
      }
    } catch (e: any) { ticketError = String(e?.message || e).slice(0, 300); }
  }
  await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'broker_request', entity: 'broker_request', entityId: ref,
    detail: { ip: ipKey, ok: true, domain, ticket, dept: deptid, ...(ticketError ? { ticketError } : {}) } as any }).catch(() => {});

  const pid = cfg.pid || (await autoEnsureBrokerProduct());
  let payUrl = '';
  if (pid) {
    const cat = await getCatalog().catch(() => null);
    const base = cat?.base || String(s.whmcs_base_url || 'https://globalhostia.com/secure').replace(/\/$/, '');
    const curId = cat?.currencyIds?.[cat.currency];
    payUrl = `${base}/cart.php?a=add&pid=${pid}${curId ? `&currency=${curId}` : ''}`;
  }
  return reply(200, { ok: true, ref, ticket, payUrl });
}
