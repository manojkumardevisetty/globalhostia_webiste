// Portal web push: VAPID keys (environment or Admin → Settings), browser subscriptions per WHMCS client, sending, and
// the notifications: ticket reply, invoice created / overdue, domain expiring within 7 days, service suspended.
// Every notification is claimed in push_log before it is sent, so a scan that runs twice never repeats one.
// Tables come from db-setup patch '022-portal-push'; until it ran, reads return nothing and writes are refused.
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured } from '../whmcs';
import { setSetting } from '../settings';
import { seal, unseal } from '../hosting/crypto';
import { createId } from '../id';
import { encryptPayload, generateVapidKeys, validVapid, vapidAuth, PUSH_CATEGORIES, type PushCategory } from './push-crypto';
import { t, tn, withLocale, parseLang, type Lang } from './i18n';

export const VAPID_KEY = 'push_vapid';
const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
const noTable = (e: any) => String(e?.code || e?.cause?.code || '') === '42P01' || /relation "push_(subscriptions|log)" does not exist/.test(String(e?.message || e?.cause?.message || ''));
export class PushUnavailable extends Error {}

/* ------------------------------------------------------------------ VAPID keys */
export type Vapid = { publicKey: string; privateKey: string; subject: string; source: 'env' | 'db' };

/** VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT win; else the pair generated in Admin → Settings (private key sealed). */
export async function vapid(): Promise<Vapid | null> {
  const e = process.env;
  if (e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && validVapid(e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY)) {
    return { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT || 'mailto:support@globalhostia.com', source: 'env' };
  }
  try {
    const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, VAPID_KEY));
    const v = r?.value as any;
    if (!v?.publicKey || !v?.privateKeyEnc) return null;
    const privateKey = unseal(String(v.privateKeyEnc));
    return validVapid(v.publicKey, privateKey) ? { publicKey: v.publicKey, privateKey, subject: String(v.subject || 'mailto:support@globalhostia.com'), source: 'db' } : null;
  } catch { return null; }
}

/** Admin: create a new key pair. Existing browser subscriptions stop working (they were made for the old key), so they are removed. */
export async function generateVapid(subject: string) {
  const k = generateVapidKeys();
  await setSetting(VAPID_KEY, { publicKey: k.publicKey, privateKeyEnc: seal(k.privateKey), subject, createdAt: new Date().toISOString() });
  await db.delete(schema.pushSubscriptions).catch((e) => { if (!noTable(e)) throw e; });
  return k.publicKey;
}

/* ------------------------------------------------------------------ subscriptions */
export async function subscriptions(clientId: number) {
  return db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.clientId, clientId)).catch((e) => { if (noTable(e)) return []; throw e; });
}

export async function saveSubscription(o: { clientId: number; userId?: number; endpoint: string; p256dh: string; auth: string; categories: PushCategory[]; lang: Lang; ua: string }) {
  const cats = o.categories.length ? o.categories : [...PUSH_CATEGORIES];
  const v = { clientId: o.clientId, userId: o.userId ?? null, p256dh: o.p256dh, auth: o.auth, categories: cats, lang: o.lang, ua: o.ua.slice(0, 200), failCount: 0 };
  // the same browser signed in to another account takes the subscription over
  await db.insert(schema.pushSubscriptions).values({ id: createId(), endpoint: o.endpoint, ...v })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: v })
    .catch((e) => { if (noTable(e)) throw new PushUnavailable('push tables missing'); throw e; });
}

export async function removeSubscription(clientId: number, endpoint: string) {
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.clientId, clientId), eq(schema.pushSubscriptions.endpoint, endpoint))).catch((e) => { if (!noTable(e)) throw e; });
}

/** Categories apply to every device of the client (the settings page edits them as one preference). */
export async function setCategories(clientId: number, cats: PushCategory[]) {
  await db.update(schema.pushSubscriptions).set({ categories: cats }).where(eq(schema.pushSubscriptions.clientId, clientId)).catch((e) => { if (!noTable(e)) throw e; });
}
export async function setLanguage(clientId: number, lang: Lang) {
  await db.update(schema.pushSubscriptions).set({ lang }).where(eq(schema.pushSubscriptions.clientId, clientId)).catch((e) => { if (!noTable(e)) throw e; });
}

/* ------------------------------------------------------------------ sending */
export type PushMessage = { title: string; body: string; url: string; tag: string };

async function sendOne(v: Vapid, s: typeof schema.pushSubscriptions.$inferSelect, msg: PushMessage) {
  const body = encryptPayload(JSON.stringify(msg), s.p256dh, s.auth);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(s.endpoint, {
      method: 'POST', body, signal: ctrl.signal,
      headers: { TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapidAuth(s.endpoint, v.subject, v.publicKey, v.privateKey) },
    });
    if (r.status === 404 || r.status === 410) { await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id)); return false; }
    if (!r.ok) {
      // 403 = key mismatch (keys regenerated): drop after a few failures
      await db.update(schema.pushSubscriptions).set({ failCount: sql`${schema.pushSubscriptions.failCount} + 1` }).where(eq(schema.pushSubscriptions.id, s.id));
      if (s.failCount >= 4) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, s.id));
      return false;
    }
    await db.update(schema.pushSubscriptions).set({ failCount: 0, lastOkAt: new Date() }).where(eq(schema.pushSubscriptions.id, s.id));
    return true;
  } catch { return false; } finally { clearTimeout(timer); }
}

/**
 * Send to every subscription of a client that has `cat` turned on. The message is built per subscription language.
 * Returns how many devices accepted it.
 */
export async function sendToClient(clientId: number, cat: PushCategory | 'test', build: () => PushMessage): Promise<number> {
  const v = await vapid();
  if (!v) return 0;
  const subs = (await subscriptions(clientId)).filter((s) => cat === 'test' || arr<string>(s.categories).includes(cat));
  let n = 0;
  for (const s of subs) {
    const msg = withLocale({ lang: parseLang(s.lang) }, build);
    if (await sendOne(v, s, msg)) n++;
  }
  return n;
}

/** Claim a dedupe key; false when this notification was already sent. */
async function claim(key: string, clientId: number) {
  const r = await db.insert(schema.pushLog).values({ key: key.slice(0, 200), clientId }).onConflictDoNothing().returning({ key: schema.pushLog.key });
  return r.length > 0;
}
const unclaim = (key: string) => db.delete(schema.pushLog).where(eq(schema.pushLog.key, key.slice(0, 200))).catch(() => {});

async function notifyOnce(key: string, clientId: number, cat: PushCategory, build: () => PushMessage) {
  if (!(await claim(key, clientId))) return 0;
  const n = await sendToClient(clientId, cat, build);
  if (!n) await unclaim(key); // nobody received it (offline push service, no device with the category): try again next scan
  return n;
}

/* ------------------------------------------------------------------ notifications */
const DAY = 86400000;
const days = (d: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || '')) && !/^0000/.test(String(d)) ? Math.round((Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') - Date.now()) / DAY) : null);

/** Staff replied to a ticket (admin panel hook, and the scan for replies made in the billing system). */
export async function notifyTicketReply(ticketId: number, stamp?: string) {
  const tk = await whmcs<any>('GetTicket', { ticketid: ticketId, repliessort: 'DESC' });
  const cid = Number(tk.userid);
  if (!cid) return 0;
  const key = `tk:${ticketId}:${stamp || tk.lastreply || ''}`;
  return notifyOnce(key, cid, 'tickets', () => ({
    title: t('New reply on ticket #{n}', { n: String(tk.tid || ticketId) }), body: String(tk.subject || '').slice(0, 140) || t('Our support team replied to your ticket.'),
    url: `/account/support/${ticketId}`, tag: `ticket-${ticketId}`,
  }));
}

/**
 * Scan every client with a subscription: answered tickets, unpaid invoices (new in the last 3 days / overdue),
 * active domains expiring within 7 days, suspended services. Bounded per run.
 */
export async function scanAndNotify(o: { maxClients?: number } = {}) {
  if (!whmcsConfigured()) return { ok: false, skipped: 'whmcs-not-configured' };
  if (!(await vapid())) return { ok: true, skipped: 'no-vapid-keys' };
  let clients: number[];
  try {
    clients = (await db.selectDistinct({ c: schema.pushSubscriptions.clientId }).from(schema.pushSubscriptions)).map((r) => r.c).slice(0, o.maxClients ?? 200);
  } catch (e) { if (noTable(e)) return { ok: true, skipped: 'no-table' }; throw e; }
  let sent = 0, checked = 0, errors = 0;
  for (const cid of clients) {
    checked++;
    try {
      const subs = await subscriptions(cid);
      const want = new Set(subs.flatMap((s) => arr<string>(s.categories)));
      if (want.has('tickets')) {
        const r = await whmcs('GetTickets', { clientid: cid, status: 'Answered', limitnum: 25 });
        for (const tk of arr(r.tickets?.ticket)) {
          if (Number(tk.userid) !== cid) continue;
          const age = Date.now() - Date.parse(String(tk.lastreply || '').replace(' ', 'T') + 'Z');
          if (!(age >= 0 && age < 3 * DAY)) continue;
          sent += await notifyOnce(`tk:${tk.id}:${tk.lastreply}`, cid, 'tickets', () => ({
            title: t('New reply on ticket #{n}', { n: String(tk.tid || tk.id) }), body: String(tk.subject || '').slice(0, 140), url: `/account/support/${tk.id}`, tag: `ticket-${tk.id}`,
          }));
        }
      }
      if (want.has('invoices')) {
        const r = await whmcs('GetInvoices', { userid: cid, status: 'Unpaid', limitnum: 50 });
        for (const inv of arr(r.invoices?.invoice)) {
          if (Number(inv.userid) !== cid) continue;
          const id = Number(inv.id), num = String(inv.invoicenum || id), due = days(inv.duedate), made = days(inv.date);
          const amount = `${inv.total ?? ''} ${inv.currencycode || ''}`.trim();
          if (made !== null && made >= -3) {
            sent += await notifyOnce(`inv:${id}:new`, cid, 'invoices', () => ({
              title: t('New invoice #{n}', { n: num }), body: t('{a} due {d}.', { a: amount, d: String(inv.duedate || '').slice(0, 10) }), url: `/account/invoices/${id}`, tag: `invoice-${id}`,
            }));
          }
          if (due !== null && due < 0 && due >= -30) {
            sent += await notifyOnce(`inv:${id}:overdue`, cid, 'invoices', () => ({
              title: t('Invoice #{n} is overdue', { n: num }), body: t('{a} was due {d}. Pay now to avoid interruption.', { a: amount, d: String(inv.duedate || '').slice(0, 10) }), url: `/account/invoices/${id}`, tag: `invoice-${id}`,
            }));
          }
        }
      }
      if (want.has('domains')) {
        const r = await whmcs('GetClientsDomains', { clientid: cid, limitnum: 250 });
        for (const d of arr(r.domains?.domain)) {
          if (Number(d.userid ?? cid) !== cid || !/^active$/i.test(String(d.status))) continue;
          const n = days(d.expirydate);
          if (n === null || n < 0 || n > 7) continue;
          sent += await notifyOnce(`dom:${d.id}:exp7:${String(d.expirydate).slice(0, 10)}`, cid, 'domains', () => ({
            title: t('{d} expires soon', { d: String(d.domainname) }), body: tn(n, 'It expires in {n} day. Renew it to keep your website and email working.', 'It expires in {n} days. Renew it to keep your website and email working.'),
            url: `/account/domains/${d.id}`, tag: `domain-${d.id}`,
          }));
        }
      }
      if (want.has('services')) {
        const r = await whmcs('GetClientsProducts', { clientid: cid, limitnum: 250 });
        for (const p of arr(r.products?.product)) {
          if (Number(p.clientid ?? cid) !== cid || !/^suspended$/i.test(String(p.status))) continue;
          // one notification per suspension: the due date identifies it (a later suspension has a later due date)
          sent += await notifyOnce(`svc:${p.id}:susp:${String(p.nextduedate || '').slice(0, 10)}`, cid, 'services', () => ({
            title: t('Service suspended: {s}', { s: String(p.name || p.translated_name || '') }), body: String(p.domain || '') ? t('{d} is suspended. Pay any open invoice or contact support to restore it.', { d: String(p.domain) }) : t('Pay any open invoice or contact support to restore it.'),
            url: `/account/services/${p.id}`, tag: `service-${p.id}`,
          }));
        }
      }
    } catch (e) { errors++; console.warn('[push] scan client', cid, e instanceof Error ? e.message : e); }
  }
  // the dedupe log only needs to outlive the scan windows above
  await db.delete(schema.pushLog).where(sql`${schema.pushLog.sentAt} < now() - interval '120 days'`).catch(() => {});
  return { ok: errors === 0, clients: checked, sent, errors };
}
