// Public: free-migration request from /free-migration → WHMCS support ticket (OpenTicket as a guest).
// Server-side validation, honeypot + time trap, per-IP rate limit (memory + audit log), never exposes API secrets.
// Accepts JSON (fetch from /hp/pages/migration.js → JSON reply) or a plain form post (→ 303 back to the page).
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { limit } from '@/lib/security/ratelimit';
import { checkTurnstile, TOKEN_FIELD, TS_MESSAGE } from '@/lib/security/turnstile';

export const dynamic = 'force-dynamic';

const WHAT = ['Website files', 'Databases', 'Email accounts', 'Domain and DNS'] as const;
const PANELS = ['cPanel', 'Plesk', 'DirectAdmin', 'WordPress admin only', 'Other', 'Not sure'];
const WHEN = ['As soon as possible', 'Outside UAE business hours', 'At the weekend', 'A specific date (see notes)'];

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
const SITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

type Input = Record<string, unknown>;
async function readBody(req: NextRequest): Promise<{ data: Input; json: boolean }> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return { data: (await req.json().catch(() => ({}))) as Input, json: true };
  const fd = await req.formData().catch(() => null);
  const data: Input = {};
  if (fd) for (const [k, v] of fd.entries()) { if (typeof v !== 'string') continue; data[k] = k === 'what' ? [...((data.what as string[]) || []), v] : v; }
  return { data, json: false };
}

// Arabic form (/ar/free-migration posts with ?lang=ar): messages in Arabic and the no-JS redirect back to the Arabic page
const AR: Record<string, string> = {
  'Something went wrong': 'حدث خطأ ما',
  'Please enter your name.': 'يرجى إدخال اسمك.',
  'Please enter a valid email address.': 'يرجى إدخال بريد إلكتروني صحيح.',
  'Use digits only, with your country code (for example +971 50 000 0000).': 'استخدم الأرقام فقط مع رمز الدولة (مثلاً ‎+971 50 000 0000).',
  'Please enter the address of the site to move, for example example.com.': 'يرجى إدخال عنوان الموقع المراد نقله، مثلاً example.com.',
  'Choose at least one thing to move.': 'اختر عنصراً واحداً على الأقل لنقله.',
  'Please check the highlighted fields.': 'يرجى مراجعة الحقول المحددة.',
  'Too many requests from your connection. Please wait a few minutes, or contact us on WhatsApp.': 'طلبات كثيرة من اتصالك. يرجى الانتظار بضع دقائق، أو التواصل معنا على واتساب.',
  'Too many requests from your connection. Please try again later, or contact us on WhatsApp.': 'طلبات كثيرة من اتصالك. يرجى المحاولة لاحقاً، أو التواصل معنا على واتساب.',
  'Online requests are unavailable right now. Please email or WhatsApp us and we will start your migration.': 'الطلبات عبر الإنترنت غير متاحة حالياً. راسلنا بالبريد الإلكتروني أو على واتساب وسنبدأ نقل موقعك.',
  'We could not open your request right now. Please try again in a minute, or contact us by WhatsApp or email.': 'تعذّر فتح طلبك الآن. يرجى المحاولة بعد دقيقة، أو التواصل معنا عبر واتساب أو البريد الإلكتروني.',
};

export async function POST(req: NextRequest) {
  const { data, json } = await readBody(req);
  const ar = req.nextUrl.searchParams.get('lang') === 'ar';
  const tr = (m: string) => (ar ? AR[m] || m : m);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipKey = createHash('sha256').update(`${ip}|${process.env.AUTH_SECRET || 'gh'}`).digest('hex').slice(0, 24);
  const reply = (status: number, body: { ok: boolean; ticket?: string; error?: string; fields?: Record<string, string> }) => {
    if (ar) body = { ...body, ...(body.error ? { error: tr(body.error) } : {}), ...(body.fields ? { fields: Object.fromEntries(Object.entries(body.fields).map(([k, v]) => [k, tr(v)])) } : {}) };
    if (json) return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
    const u = new URL(ar ? '/ar/free-migration' : '/free-migration', req.url);
    if (body.ok && body.ticket) u.searchParams.set('ticket', body.ticket); else u.searchParams.set('error', body.error || tr('Something went wrong'));
    return NextResponse.redirect(u, 303);
  };

  // bots: hidden field filled, or the form was submitted faster than a person can type
  const started = Number(data.t || 0);
  if (clean(data.company_url, 200) || (started && Date.now() - started < 2500)) return reply(200, { ok: true, ticket: 'received' });

  const f = {
    name: clean(data.name, 80), email: clean(data.email, 120).toLowerCase(), phone: clean(data.phone, 30),
    host: clean(data.host, 80), site: clean(data.site, 200), panel: clean(data.panel, 40), when: clean(data.when, 60), notes: clean(data.notes, 2000),
    what: (Array.isArray(data.what) ? data.what : data.what ? [data.what] : []).map((x) => clean(x, 40)).filter((x) => (WHAT as readonly string[]).includes(x)),
  };
  const fields: Record<string, string> = {};
  if (f.name.length < 2) fields.name = 'Please enter your name.';
  if (!EMAIL.test(f.email)) fields.email = 'Please enter a valid email address.';
  if (f.phone && !/^\+?[\d\s()-]{6,30}$/.test(f.phone)) fields.phone = 'Use digits only, with your country code (for example +971 50 000 0000).';
  if (!SITE.test(f.site)) fields.site = 'Please enter the address of the site to move, for example example.com.';
  if (!f.what.length) fields.what = 'Choose at least one thing to move.';
  if (f.panel && !PANELS.includes(f.panel)) f.panel = '';
  if (f.when && !WHEN.includes(f.when)) f.when = '';
  if (Object.keys(fields).length) return reply(422, { ok: false, error: 'Please check the highlighted fields.', fields });

  if (memLimited(ipKey)) return reply(429, { ok: false, error: 'Too many requests from your connection. Please wait a few minutes, or contact us on WhatsApp.' });
  // central limiter (lib/security/ratelimit.ts) per IP and per email, then Cloudflare Turnstile when switched on (Admin > Security)
  { const g = await limit('form', ip, String(data.email || '').trim().toLowerCase() || null); if (!g.ok) return reply(429, { ok: false, error: g.message }); }
  { const t = await checkTurnstile('migration', data[TOKEN_FIELD], ip); if (!t.ok) return reply(400, { ok: false, error: TS_MESSAGE }); }
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.auditLogs).where(and(
      eq(schema.auditLogs.action, 'migration_request'), gt(schema.auditLogs.createdAt, new Date(Date.now() - 3600_000)), sql`${schema.auditLogs.detail}->>'ip' = ${ipKey}`));
    if (n >= 5) return reply(429, { ok: false, error: 'Too many requests from your connection. Please try again later, or contact us on WhatsApp.' });
  } catch { /* audit table unavailable: memory limit still applies */ }

  if (!whmcsConfigured()) return reply(503, { ok: false, error: 'Online requests are unavailable right now. Please email or WhatsApp us and we will start your migration.' });

  const s = await getSettings();
  let deptid = String(s.migration_department_id || '').trim();
  try {
    if (!/^\d+$/.test(deptid)) {
      const r = await whmcs<{ departments?: { department?: { id: number | string; name: string }[] } }>('GetSupportDepartments', { ignore_dept_assignments: true });
      const list = r.departments?.department || [];
      const pick = list.find((d) => /migrat/i.test(d.name)) || list.find((d) => /tech|support/i.test(d.name)) || list[0];
      deptid = pick ? String(pick.id) : '';
    }
    if (!deptid) throw new Error('No support department found in WHMCS');
    const host = f.site.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    const message = [
      `A visitor requested a free website migration from the ${ar ? 'Arabic (/ar/free-migration)' : 'website'} form.${ar ? ' They used the Arabic page: reply in Arabic if you can.' : ''}`,
      '',
      `Name: ${f.name}`, `Email: ${f.email}`, `Phone / WhatsApp: ${f.phone || '-'}`,
      `Site to move: ${f.site}`, `Current host: ${f.host || '-'}`, `Control panel: ${f.panel || '-'}`,
      `What to move: ${f.what.join(', ')}`, `Preferred time: ${f.when || '-'}`,
      '', 'Notes:', f.notes || '-',
      '', 'Next step: reply to agree a time and request access securely (never by plain email).',
    ].join('\n');
    const r = await whmcs<{ id?: number; tid?: string; c?: string }>('OpenTicket', {
      deptid, subject: `Free migration request: ${host}`.slice(0, 200), message, name: f.name, email: f.email, priority: 'Medium', markdown: false,
    });
    const ticket = String(r.tid || r.id || '');
    await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'migration_request', entity: 'ticket', entityId: ticket, detail: { ip: ipKey, site: host, dept: deptid, ok: true } as any }).catch(() => {});
    return reply(200, { ok: true, ticket });
  } catch (e: any) {
    await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: 'migration_request', entity: 'ticket', entityId: null, detail: { ip: ipKey, ok: false, error: String(e?.message || e).slice(0, 300) } as any }).catch(() => {});
    return reply(502, { ok: false, error: 'We could not open your request right now. Please try again in a minute, or contact us by WhatsApp or email.' });
  }
}
