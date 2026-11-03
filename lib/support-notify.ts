// Support notifier: emails the owner when a customer opens a ticket or replies to one.
// WHMCS stays the source of truth (GetTickets / GetTicket); the email goes out through WHMCS too
// (SendEmail, customtype=general, to the owner's client account), so the app needs no mail library.
//
// Safe to call from anywhere, as often as you like:
//  - one run at a time (lease lock in `settings`); a call that arrives while a run is busy flags
//    "run again" so the active run loops once more and nothing that just landed in WHMCS is missed;
//  - per ticket, the ticket_notify row is claimed with a conditional upsert before the email is sent,
//    so the same ticket activity (ticket id + last reply time) is never emailed twice;
//  - if sending fails the claim is rolled back and the next run retries.
import 'server-only';
import { after } from 'next/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { whmcs, whmcsConfigured } from './whmcs';

const LOCK_KEY = 'support_notify_lock';
const LEASE_SEC = 90;
const MAX_EMAILS_PER_RUN = 10;
const AWAITING = ['Open', 'Customer-Reply'] as const;

const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);

export type SupportSettings = { clientId: number; adminUsername: string; siteUrl: string };

/** Fresh (uncached) read of the support settings. */
export async function supportSettings(): Promise<SupportSettings> {
  const rows = await db.select().from(schema.settings)
    .where(inArray(schema.settings.key, ['support_notify_clientid', 'support_admin_username', 'site_url']));
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value as any]));
  const clientId = Number(m.support_notify_clientid) > 0 ? Number(m.support_notify_clientid) : 1;
  const siteUrl = (typeof m.site_url === 'string' && /^https:\/\//.test(m.site_url) ? m.site_url : 'https://globalhostia.com').replace(/\/$/, '');
  return { clientId, adminUsername: String(m.support_admin_username || ''), siteUrl };
}

/* ---------------- lock ---------------- */
async function acquire(): Promise<boolean> {
  const value = JSON.stringify({ until: new Date(Date.now() + LEASE_SEC * 1000).toISOString(), again: false });
  const got = await db.execute(sql`
    insert into settings (key, value) values (${LOCK_KEY}, ${value}::jsonb)
    on conflict (key) do update set value = excluded.value
    where coalesce((settings.value->>'until')::timestamptz, 'epoch'::timestamptz) < now()
    returning key`);
  if (got.length) return true;
  // busy: ask the active run to go round once more
  await db.execute(sql`update settings set value = jsonb_set(value, '{again}', 'true'::jsonb) where key = ${LOCK_KEY}`);
  return false;
}
/** Releases the lock unless another caller asked for a re-run; returns true when the caller must loop again. */
async function releaseOrAgain(): Promise<boolean> {
  const done = await db.execute(sql`
    update settings set value = jsonb_build_object('until', (now() - interval '1 second')::text, 'again', false)
    where key = ${LOCK_KEY} and coalesce((value->>'again')::boolean, false) = false
    returning key`);
  if (done.length) return false;
  const until = new Date(Date.now() + LEASE_SEC * 1000).toISOString();
  await db.execute(sql`update settings set value = jsonb_build_object('until', ${until}::text, 'again', false) where key = ${LOCK_KEY}`);
  return true;
}
async function forceRelease() {
  await db.execute(sql`update settings set value = jsonb_build_object('until', (now() - interval '1 second')::text, 'again', false) where key = ${LOCK_KEY}`).catch(() => {});
}

/* ---------------- WHMCS reads ---------------- */
export type TicketSummary = { id: number; tid: string; subject: string; status: string; priority: string; deptid: number; name: string; email: string; date: string; lastreply: string };

const toSummary = (t: any): TicketSummary => ({
  id: Number(t.id ?? t.ticketid), tid: String(t.tid || ''), subject: String(t.subject || ''), status: String(t.status || ''),
  priority: String(t.priority || ''), deptid: Number(t.deptid || 0),
  name: String(t.requestor_name || t.name || t.owner_name || ''), email: String(t.requestor_email || t.email || ''),
  date: String(t.date || ''), lastreply: String(t.lastreply || ''),
});

/** Tickets waiting on us (status Open or Customer-Reply), across all departments. */
export async function awaitingTickets(): Promise<TicketSummary[]> {
  const out = new Map<number, TicketSummary>();
  for (const status of AWAITING) {
    const r = await whmcs('GetTickets', { status, limitnum: 100, ignore_dept_assignments: true });
    for (const t of arr(r.tickets?.ticket)) { const s = toSummary(t); if (s.id) out.set(s.id, s); }
  }
  return [...out.values()];
}

export async function supportDepartments(): Promise<{ id: number; name: string; email: string }[]> {
  const r = await whmcs('GetSupportDepartments', { ignore_dept_assignments: true });
  return arr(r.departments?.department).map((d) => ({ id: Number(d.id), name: String(d.name || ''), email: String(d.email || '') }));
}

export const DEFAULT_STATUSES = ['Open', 'Answered', 'Customer-Reply', 'On Hold', 'In Progress', 'Closed'];
/** Ticket statuses configured in WHMCS (falls back to the WHMCS defaults). */
export async function supportStatuses(): Promise<string[]> {
  try {
    const r = await whmcs('GetSupportStatuses');
    const l = arr(r.statuses?.status).map((x) => String(x.title || '')).filter(Boolean);
    return l.length ? l : DEFAULT_STATUSES;
  } catch { return DEFAULT_STATUSES; }
}

/** Full ticket incl. thread (oldest first). Admin side: no ownership filter. */
export async function fullTicket(id: number) {
  const r = await whmcs('GetTicket', { ticketid: id, repliessort: 'ASC' });
  return { ...r, id: Number(r.ticketid ?? r.id ?? id), replies: arr(r.replies?.reply), notes: arr(r.notes?.note) };
}

/* ---------------- email ---------------- */
const ENT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#039;': "'", '&nbsp;': ' ' };
export const plainText = (s: string) =>
  String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#0?39|nbsp);/g, (m) => ENT[m] ?? m).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
// WHMCS runs custom email bodies through Smarty, so customer text must never carry raw { or }.
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');

export function buildEmail(i: { id: number; tid: string; subject: string; customer: string; email: string; department: string; priority: string; status: string; excerpt: string; isNew: boolean; replyUrl: string }) {
  const pc = /high/i.test(i.priority) ? '#b42318' : /low/i.test(i.priority) ? '#475467' : '#b54708';
  const row = (k: string, v: string, color = '#101828') =>
    `<tr><td style="padding:6px 0;color:#667085;font-size:13px;width:96px;vertical-align:top">${k}</td><td style="padding:6px 0;color:${color};font-size:14px;font-weight:600;word-break:break-word">${v}</td></tr>`;
  const headline = i.isNew ? 'New support ticket' : 'Customer replied';
  const subject = `[#${i.tid || i.id}] ${headline}: ${i.subject}`.slice(0, 200);
  const body = `<div style="margin:0 auto;max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#101828">
<div style="background:#473bf0;border-radius:14px 14px 0 0;padding:20px 22px;color:#ffffff">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">${esc(headline)} &middot; #${esc(i.tid || String(i.id))}</div>
<div style="font-size:20px;font-weight:700;line-height:1.3;margin-top:6px;word-break:break-word">${esc(i.subject || '(no subject)')}</div>
</div>
<div style="border:1px solid #e4e7ec;border-top:0;border-radius:0 0 14px 14px;padding:18px 22px 24px;background:#ffffff">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
${row('Customer', esc(i.customer || '—') + (i.email ? `<br><span style="font-weight:400;color:#475467;font-size:13px">${esc(i.email)}</span>` : ''))}
${row('Department', esc(i.department || '—'))}
${row('Priority', esc(i.priority || '—'), pc)}
${row('Status', esc(i.status || '—'))}
</table>
<div style="margin:16px 0 0;padding:14px 16px;background:#f2f4f7;border-left:4px solid #473bf0;border-radius:8px;font-size:15px;line-height:1.55;color:#344054;white-space:pre-wrap;word-break:break-word">${esc(i.excerpt || '(empty message)')}</div>
<a href="${esc(i.replyUrl)}" style="display:block;margin:22px 0 0;padding:16px 20px;background:#e11d74;color:#ffffff;text-align:center;text-decoration:none;font-size:17px;font-weight:700;border-radius:12px">Reply now &rarr;</a>
<p style="margin:14px 0 0;font-size:12px;color:#98a2b3;text-align:center">Sent by the GlobalHostia support notifier.</p>
</div></div>`;
  return { subject, body };
}

async function sendOwnerEmail(clientId: number, subject: string, html: string) {
  await whmcs('SendEmail', { id: clientId, customtype: 'general', customsubject: subject.replace(/[{}]/g, ''), custommessage: html });
}

/** Email the owner (same WHMCS client account as the ticket alerts) — used by other admin notifiers (content engine).
 *  `html` must already be escaped; braces are neutralised here because WHMCS runs the body through Smarty. */
export async function emailOwner(subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!whmcsConfigured()) return { ok: false, error: 'whmcs-not-configured' };
  try {
    const cfg = await supportSettings();
    await sendOwnerEmail(cfg.clientId, subject, html.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;'));
    return { ok: true };
  } catch (e: any) { return { ok: false, error: String(e?.message || e).slice(0, 200) }; }
}

async function notifyOne(t: TicketSummary, isNew: boolean, depts: Map<number, string>, cfg: SupportSettings) {
  let excerpt = '', department = depts.get(t.deptid) || '';
  let full: any = null;
  try { full = await fullTicket(t.id); } catch { /* still notify with the summary */ }
  if (full) {
    department = String(full.deptname || department);
    const msgs = full.replies.filter((r: any) => !r.admin);
    const last = msgs[msgs.length - 1] || full.replies[full.replies.length - 1];
    excerpt = plainText(last?.message || full.message || '');
  }
  if (excerpt.length > 700) excerpt = excerpt.slice(0, 700).trimEnd() + '…';
  const { subject, body } = buildEmail({
    id: t.id, tid: t.tid, subject: t.subject, customer: t.name, email: t.email, department, priority: t.priority,
    status: t.status, excerpt, isNew, replyUrl: `${cfg.siteUrl}/admin/support/${t.id}`,
  });
  await sendOwnerEmail(cfg.clientId, subject, body);
}

export async function sendTestNotification() {
  const cfg = await supportSettings();
  const { subject, body } = buildEmail({
    id: 0, tid: 'TEST', subject: 'Test notification — support alerts are working', customer: 'Test Customer', email: 'customer@example.com',
    department: 'Support', priority: 'Medium', status: 'Open', isNew: true,
    excerpt: 'This is a test message from the admin panel. When a customer opens a ticket or replies, you will get an email like this one.',
    replyUrl: `${cfg.siteUrl}/admin/support`,
  });
  await sendOwnerEmail(cfg.clientId, subject, body);
  return cfg.clientId;
}

/* ---------------- main ---------------- */
export type CheckResult = { ok: boolean; skipped?: string; checked?: number; notified?: number; failed?: number; error?: string };

export async function checkTickets(reason = 'manual'): Promise<CheckResult> {
  if (!whmcsConfigured()) return { ok: false, skipped: 'whmcs-not-configured' };
  let got = false;
  try { got = await acquire(); } catch (e: any) { return { ok: false, error: `lock: ${e?.message || e}` }; }
  if (!got) return { ok: true, skipped: 'busy' };
  let checked = 0, notified = 0, failed = 0, lastErr = '';
  try {
    for (let loop = 0; loop < 3; loop++) {
      try {
        const r = await runOnce();
        checked = r.checked; notified += r.notified; failed += r.failed; if (r.error) lastErr = r.error;
      } catch (e: any) { lastErr = e?.message || String(e); }
      if (!(await releaseOrAgain())) { got = false; break; }
    }
  } finally {
    if (got) await forceRelease();
  }
  if (lastErr) console.warn(`[support-notify] ${reason}: ${lastErr}`);
  // AI ticket assistant (lib/ai/tickets.ts): classify + draft / auto-reply. Off unless ANTHROPIC_API_KEY is set; never throws.
  try { const { triageAwaiting } = await import('./ai/tickets'); await triageAwaiting(reason); } catch (e: any) { console.warn('[support-notify] ai triage:', e?.message || e); }
  return { ok: !lastErr, checked, notified, failed, ...(lastErr ? { error: lastErr } : {}) };
}

async function runOnce() {
  const cfg = await supportSettings();
  const tickets = await awaitingTickets();
  if (!tickets.length) return { checked: 0, notified: 0, failed: 0 };
  const known = await db.select().from(schema.ticketNotify).where(inArray(schema.ticketNotify.ticketId, tickets.map((t) => t.id)));
  const prev = new Map(known.map((k) => [k.ticketId, k]));
  const key = (t: TicketSummary) => t.lastreply || t.date || t.status;
  const todo = tickets.filter((t) => prev.get(t.id)?.lastReply !== key(t))
    .sort((a, b) => key(a).localeCompare(key(b))).slice(0, MAX_EMAILS_PER_RUN);
  if (!todo.length) return { checked: tickets.length, notified: 0, failed: 0 };

  let depts = new Map<number, string>();
  try { depts = new Map((await supportDepartments()).map((d) => [d.id, d.name])); } catch { /* names are optional */ }

  let notified = 0, failed = 0, error = '';
  for (const t of todo) {
    const before = prev.get(t.id);
    // claim: only one caller can move this ticket to this activity stamp
    const claimed = await db.insert(schema.ticketNotify)
      .values({ ticketId: t.id, tid: t.tid, lastReply: key(t), status: t.status, notifiedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.ticketNotify.ticketId,
        set: { tid: t.tid, lastReply: key(t), status: t.status, notifiedAt: new Date() },
        setWhere: sql`${schema.ticketNotify.lastReply} is distinct from ${key(t)}`,
      }).returning({ id: schema.ticketNotify.ticketId });
    if (!claimed.length) continue;
    try {
      await notifyOne(t, !before && t.status === 'Open', depts, cfg);
      notified++;
    } catch (e: any) {
      failed++; error = e?.message || String(e);
      // roll the claim back so the next run retries
      if (before) await db.update(schema.ticketNotify).set({ lastReply: before.lastReply, status: before.status, notifiedAt: before.notifiedAt }).where(eq(schema.ticketNotify.ticketId, t.id)).catch(() => {});
      else await db.delete(schema.ticketNotify).where(eq(schema.ticketNotify.ticketId, t.id)).catch(() => {});
    }
  }
  return { checked: tickets.length, notified, failed, error };
}

/** Fire-and-forget from request handlers: runs after the response is sent (Next `after`), never throws. */
export function checkTicketsSoon(reason: string, delayMs = 0) {
  const run = async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await checkTickets(reason).catch(() => {});
  };
  try { after(run); } catch { void run(); }
}
