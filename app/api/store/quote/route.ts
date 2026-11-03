// Public: Business services quote request (/business-services/<slug> "Request a quote" and "Contact sales" forms).
// Stored first as a lead (Admin → Marketing → Leads, source quote:<slug>) so a WHMCS outage never loses it, then opened as a
// WHMCS ticket in the Sales department (Admin → Business services → sales department, else the first department named
// like "Sales"). Same protections as /api/free-migration: server-side validation, honeypot + time trap, per-IP rate limit
// (memory + DB), hashed IP only, API secrets never leave the server.
// Accepts JSON (fetch from /hp/pages/store.js → JSON reply) or a plain form post (→ 303 back to the page).
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { getCatalog } from '@/lib/theme/data';
import { storeView } from '@/lib/store/view';
import { checkQuote, entryPath, QUOTE_SOURCE } from '@/lib/store/config';
import { normPhone, parseUtmCookie, UTM_COOKIE } from '@/lib/leads';

export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function memLimited(key: string, max = 4, windowMs = 10 * 60_000) {
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
    if (text.length > 16000) return { data: {}, json: true };
    try { const d = JSON.parse(text); return { data: d && typeof d === 'object' ? d : {}, json: true }; } catch { return { data: {}, json: true }; }
  }
  const fd = await req.formData().catch(() => null);
  const data: Input = {};
  if (fd) for (const [k, v] of fd.entries()) if (typeof v === 'string') data[k] = v;
  return { data, json: false };
}

type Reply = { ok: boolean; ticket?: string; error?: string; fields?: Record<string, string> };

export async function POST(req: NextRequest) {
  const { data, json } = await readBody(req);
  const slug = String(data.service || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
  const back = slug ? entryPath(slug) : '/business-services';
  const reply = (status: number, body: Reply) => {
    if (json) return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
    const u = new URL(back, req.url);
    if (body.ok) u.searchParams.set('quote', body.ticket || 'received'); else u.searchParams.set('quote_error', body.error || 'Something went wrong');
    u.hash = 'quote';
    return NextResponse.redirect(u, 303);
  };

  // bots: hidden field filled, or submitted faster than a person can type
  const started = Number(data.t || 0);
  if (String(data.company_url || '').trim() || (started && Date.now() - started < 2500)) return reply(200, { ok: true, ticket: 'received' });

  const cat = await getCatalog().catch(() => null);
  const view = cat ? storeView(cat) : null;
  const item = view?.items.find((i) => i.cat.slug === slug && !i.external) || null;
  const { input, fields } = checkQuote(data, item?.entry || null);
  const phone = normPhone(input.phone);
  if (phone === null) fields.phone = 'Use digits only, with your country code (for example +971 50 000 0000).';
  if (!item) return reply(400, { ok: false, error: 'This service is not available for online requests. Please contact us instead.' });
  if (Object.keys(fields).length) return reply(422, { ok: false, error: 'Please check the highlighted fields.', fields });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipHash = createHash('sha256').update(`${ip}|${process.env.AUTH_SECRET || 'gh'}`).digest('hex').slice(0, 24);
  if (memLimited(ipHash)) return reply(429, { ok: false, error: 'Too many requests from your connection. Please wait a few minutes, or contact us on WhatsApp.' });
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.leads)
      .where(and(eq(schema.leads.ipHash, ipHash), gt(schema.leads.createdAt, new Date(Date.now() - 3600_000)), sql`${schema.leads.source} like 'quote:%'`));
    if (n >= 6) return reply(429, { ok: false, error: 'Too many requests from your connection. Please try again later, or contact us on WhatsApp.' });
  } catch { /* table unavailable: memory limit still applies */ }

  const name = item.name;
  const qs = item.entry.questions;
  const lines = [
    `Quote request for: ${name}${input.option ? ` (${input.option})` : ''}`,
    item.status === 'soon' ? 'Note: this service has no plans listed online yet ("coming soon / contact sales").' : '',
    '',
    `Name: ${input.name}`, `Email: ${input.email}`, `Phone / WhatsApp: ${phone || '-'}`, `Company: ${input.company || '-'}`, `Website: ${input.website || '-'}`,
    `Budget: ${input.budget || '-'}`, `Timeline: ${input.timeline || '-'}`,
    ...qs.map((q, i) => `${q}\n  ${input.answers[i] || '-'}`),
    '', 'Notes:', input.notes || '-',
    '', `Page: ${entryPath(item.cat.slug)}`,
    'Next step: reply with a written quote (scope, timeline, price). If a WHMCS product exists for this service, link it to the category in Admin so customers can order it directly.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  const message = lines.join('\n');
  const utm = parseUtmCookie(req.cookies.get(UTM_COOKIE)?.value);

  // 1. store the request (never lost, even if WHMCS is down)
  let leadId = '';
  try {
    const [row] = await db.insert(schema.leads).values({
      email: input.email, name: input.name, phone: phone || '', source: QUOTE_SOURCE(item.cat.slug), page: entryPath(item.cat.slug),
      utmSource: utm.utm_source || '', utmMedium: utm.utm_medium || '', utmCampaign: utm.utm_campaign || '', utmTerm: utm.utm_term || '', utmContent: utm.utm_content || '',
      country: (req.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
      interest: [name, input.option, input.budget, input.timeline].filter(Boolean).join(' | ').slice(0, 500),
      consent: input.consent, ipHash, notes: message.slice(0, 4000),
    }).returning({ id: schema.leads.id });
    leadId = row.id;
  } catch { /* fall through to the ticket */ }

  // 2. WHMCS ticket in the Sales department
  let ticket = '';
  if (whmcsConfigured()) {
    try {
      let deptid = view!.cfg.salesDepartmentId;
      if (!deptid) {
        const r = await whmcs<{ departments?: { department?: { id: number | string; name: string }[] } }>('GetSupportDepartments', { ignore_dept_assignments: true });
        const list = r.departments?.department || [];
        const pick = list.find((d) => /sales/i.test(d.name)) || list.find((d) => /billing|account|general/i.test(d.name)) || list[0];
        deptid = pick ? String(pick.id) : '';
      }
      if (!deptid) throw new Error('No support department found in WHMCS');
      const r = await whmcs<{ id?: number; tid?: string }>('OpenTicket', {
        deptid, subject: `Quote request: ${name}${input.option ? ` (${input.option})` : ''}`.slice(0, 200), message,
        name: input.name, email: input.email, priority: 'Medium', markdown: false,
      });
      ticket = String(r.tid || r.id || '');
      if (leadId && ticket) await db.update(schema.leads).set({ notes: `WHMCS ticket #${ticket}\n\n${message}`.slice(0, 4000), updatedAt: new Date() }).where(eq(schema.leads.id, leadId)).catch(() => {});
    } catch (e: any) {
      await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'quote_ticket_failed', entity: 'lead', entityId: leadId || null, detail: { service: item.cat.slug, error: String(e?.message || e).slice(0, 300) } as any }).catch(() => {});
    }
  }
  if (!leadId && !ticket) return reply(503, { ok: false, error: 'We could not send your request right now. Please try again in a minute, or contact us by WhatsApp or email.' });
  await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'quote_request', entity: 'lead', entityId: leadId || null, detail: { service: item.cat.slug, ticket, ip: ipHash } as any }).catch(() => {});
  return reply(200, { ok: true, ticket: ticket || 'received' });
}
