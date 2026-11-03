// Reminders: database access (settings, secrets, customer choices, unsubscribes, captured carts, the send log).
// Secrets: the WhatsApp access token is read from env WHATSAPP_TOKEN / WHATSAPP_PHONE_ID first, else from the settings
// row `reminders_secrets` sealed with AES-256-GCM (lib/hosting/crypto.ts, same as hosting-panel keys). Never sent to a browser.
import 'server-only';
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { seal, unseal } from '../hosting/crypto';
import { hmacSecret } from '../hosting/servers';
import { normalizeConfig, type ReminderConfig, type UnsubScope } from './core';
import { credsOk, type WaCreds } from './whatsapp';

const CFG_KEY = 'reminders', SECRETS_KEY = 'reminders_secrets', STATE_KEY = 'reminders_state';

async function readKey<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}
async function writeKey(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}

/** Fresh (uncached) config. */
export async function loadConfig(): Promise<ReminderConfig> { return normalizeConfig(await readKey(CFG_KEY).catch(() => undefined)); }
export async function saveConfig(c: ReminderConfig) { await writeKey(CFG_KEY, normalizeConfig(c)); }

/* ---------------- secrets */
type Sealed = { waPhoneId?: string; waTokenEnc?: string; updatedAt?: string };
export const waFromEnv = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
export async function waCreds(): Promise<WaCreds | null> {
  if (waFromEnv()) { const c = { phoneId: String(process.env.WHATSAPP_PHONE_ID).trim(), token: String(process.env.WHATSAPP_TOKEN).trim() }; return credsOk(c) ? c : null; }
  const s = await readKey<Sealed>(SECRETS_KEY).catch(() => undefined);
  if (!s?.waPhoneId || !s.waTokenEnc) return null;
  try { const c = { phoneId: s.waPhoneId, token: unseal(s.waTokenEnc) }; return credsOk(c) ? c : null; } catch { return null; }
}
/** For the admin page: never the token, only whether one is stored and a hint. */
export async function waView() {
  if (waFromEnv()) return { source: 'env' as const, phoneId: String(process.env.WHATSAPP_PHONE_ID), token: 'set in Vercel (WHATSAPP_TOKEN)' };
  const s = await readKey<Sealed>(SECRETS_KEY).catch(() => undefined);
  return { source: 'db' as const, phoneId: s?.waPhoneId || '', token: s?.waTokenEnc ? `stored encrypted${s.updatedAt ? `, ${s.updatedAt.slice(0, 10)}` : ''}` : '' };
}
export async function saveWaCreds(phoneId: string, token: string | null) {
  const s = (await readKey<Sealed>(SECRETS_KEY).catch(() => undefined)) || {};
  await writeKey(SECRETS_KEY, { waPhoneId: phoneId, waTokenEnc: token === null ? s.waTokenEnc || '' : token ? seal(token) : '', updatedAt: new Date().toISOString() });
}

/** HMAC secret shared with the WHMCS hook: REMINDERS_HMAC_SECRET, else the existing hosting-hook secret (GH_HOSTING_SECRET). */
export async function hookSecret(): Promise<string | null> {
  const e = process.env.REMINDERS_HMAC_SECRET;
  if (e && e.length >= 32) return e;
  return hmacSecret().catch(() => null);
}
/** Unsubscribe / restore links: AUTH_SECRET (server only). */
export function linkSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (min 32 chars)');
  return s;
}

/* ---------------- run state (shown in admin) */
export type RunState = { lastRun?: string; lastResult?: unknown; lastHook?: string; lastHookEvent?: string; lastCart?: string };
export async function state(): Promise<RunState> { return (await readKey<RunState>(STATE_KEY).catch(() => undefined)) || {}; }
export async function patchState(p: Partial<RunState>) {
  await db.execute(sql`insert into settings (key, value) values (${STATE_KEY}, ${JSON.stringify(p)}::jsonb)
    on conflict (key) do update set value = settings.value || excluded.value`).catch(() => {});
}

/* ---------------- customer choices */
export type Prefs = { cartEmail: boolean; renewalEmail: boolean; whatsapp: boolean; whatsappAt: Date | null; whatsappSource: string };
export const DEFAULT_PREFS: Prefs = { cartEmail: true, renewalEmail: true, whatsapp: false, whatsappAt: null, whatsappSource: '' };
export async function prefsFor(clientId: number): Promise<Prefs> {
  const [r] = await db.select().from(schema.reminderPrefs).where(eq(schema.reminderPrefs.clientId, clientId));
  return r ? { cartEmail: r.cartEmail, renewalEmail: r.renewalEmail, whatsapp: r.whatsapp, whatsappAt: r.whatsappAt, whatsappSource: r.whatsappSource } : { ...DEFAULT_PREFS };
}
export async function prefsMany(ids: number[]): Promise<Map<number, Prefs>> {
  const m = new Map<number, Prefs>();
  if (!ids.length) return m;
  for (const r of await db.select().from(schema.reminderPrefs).where(inArray(schema.reminderPrefs.clientId, ids)))
    if (r.clientId) m.set(r.clientId, { cartEmail: r.cartEmail, renewalEmail: r.renewalEmail, whatsapp: r.whatsapp, whatsappAt: r.whatsappAt, whatsappSource: r.whatsappSource });
  return m;
}
/** Save the portal / checkout choices. WhatsApp opt-in keeps the first consent time and its source. */
export async function setPrefs(clientId: number, email: string, p: Partial<Pick<Prefs, 'cartEmail' | 'renewalEmail' | 'whatsapp'>>, source: string) {
  const cur = await prefsFor(clientId);
  const next = { ...cur, ...p };
  const waAt = next.whatsapp ? (cur.whatsapp && cur.whatsappAt ? cur.whatsappAt : new Date()) : null;
  const waSrc = next.whatsapp ? (cur.whatsapp ? cur.whatsappSource : source) : '';
  const v = { clientId, email: email.toLowerCase().slice(0, 254), cartEmail: next.cartEmail, renewalEmail: next.renewalEmail, whatsapp: next.whatsapp, whatsappAt: waAt, whatsappSource: waSrc, updatedAt: new Date() };
  await db.insert(schema.reminderPrefs).values(v).onConflictDoUpdate({ target: schema.reminderPrefs.clientId, set: v });
  // turning an email reminder back on in the portal lifts an earlier unsubscribe link for that address
  const lift: UnsubScope[] = [];
  if (p.cartEmail) lift.push('cart');
  if (p.renewalEmail) lift.push('renewal');
  if (lift.length && email) {
    await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, email.toLowerCase()), inArray(schema.reminderSuppress.scope, lift)));
    if (p.cartEmail && p.renewalEmail) await db.delete(schema.reminderSuppress).where(and(eq(schema.reminderSuppress.email, email.toLowerCase()), eq(schema.reminderSuppress.scope, 'all')));
  }
}

/* ---------------- unsubscribes */
export async function suppress(email: string, scope: UnsubScope, source = 'link') {
  await db.insert(schema.reminderSuppress).values({ email: email.toLowerCase(), scope, source }).onConflictDoNothing();
}
export async function suppressedScopes(email: string): Promise<Set<string>> {
  if (!email) return new Set();
  const rows = await db.select({ s: schema.reminderSuppress.scope }).from(schema.reminderSuppress).where(eq(schema.reminderSuppress.email, email.toLowerCase()));
  return new Set(rows.map((r) => r.s));
}
export const blocks = (sup: Set<string>, scope: 'cart' | 'renewal' | 'health') => sup.has('all') || sup.has(scope);

/* ---------------- carts */
export type CartItems = { p: { pid: number; cycle: string; domain: string; options: boolean }[]; d: { domain: string; type: 'register' | 'transfer'; years: number }[]; lang?: 'en' | 'ar' };
/**
 * Upsert the open cart for this key. Same contents → only the activity time moves when `touch`; new contents → items
 * replaced and the timer restarts. An empty snapshot closes the cart ("emptied"): no reminders for an empty cart.
 */
export async function upsertCart(o: { key: string; clientId: number | null; email: string; consent: string; currencyId: number; items: CartItems; fingerprint: string; whatsapp?: boolean }) {
  const empty = !o.items.p.length && !o.items.d.length;
  const [cur] = await db.select().from(schema.reminderCarts).where(eq(schema.reminderCarts.cartKey, o.key));
  if (empty) {
    if (cur && cur.status === 'open') await db.update(schema.reminderCarts).set({ status: 'emptied', closedAt: new Date() }).where(eq(schema.reminderCarts.id, cur.id));
    return { id: cur?.id || null, status: 'emptied' as const };
  }
  if (cur && cur.status === 'open') {
    const changed = cur.fingerprint !== o.fingerprint;
    await db.update(schema.reminderCarts).set({
      ...(changed ? { items: o.items as any, fingerprint: o.fingerprint, currencyId: o.currencyId, activityAt: new Date() } : {}),
      clientId: o.clientId ?? cur.clientId, email: o.email || cur.email, consent: o.consent || cur.consent,
      whatsappOptIn: o.whatsapp ?? cur.whatsappOptIn,
    }).where(eq(schema.reminderCarts.id, cur.id));
    return { id: cur.id, status: changed ? ('updated' as const) : ('same' as const) };
  }
  // a closed cart under this key (ordered / emptied): retire its key, start a fresh one
  if (cur) await db.update(schema.reminderCarts).set({ cartKey: `${cur.cartKey}#${cur.id}` }).where(eq(schema.reminderCarts.id, cur.id));
  const [row] = await db.insert(schema.reminderCarts).values({
    cartKey: o.key, clientId: o.clientId, email: o.email, consent: o.consent, currencyId: o.currencyId, items: o.items as any, fingerprint: o.fingerprint, whatsappOptIn: !!o.whatsapp,
  }).returning({ id: schema.reminderCarts.id });
  return { id: row.id, status: 'created' as const };
}
export const getCart = async (id: string) => (await db.select().from(schema.reminderCarts).where(eq(schema.reminderCarts.id, id)))[0] || null;
export async function closeCart(id: string, status: 'ordered' | 'expired' | 'stopped' | 'emptied', orderId?: number) {
  await db.update(schema.reminderCarts).set({ status, closedAt: new Date(), ...(orderId ? { orderId } : {}) }).where(and(eq(schema.reminderCarts.id, id), eq(schema.reminderCarts.status, 'open')));
  if (status === 'ordered') await db.update(schema.remindersLog).set({ convertedAt: new Date() }).where(and(eq(schema.remindersLog.item, `cart:${id}`), eq(schema.remindersLog.status, 'sent'), isNull(schema.remindersLog.convertedAt)));
}
/** Order placed (WHMCS hook / GetOrders): every open cart of this client or email is converted. */
export async function cartsOrdered(clientId: number | null, email: string, orderId?: number) {
  const conds = [];
  if (clientId) conds.push(eq(schema.reminderCarts.clientId, clientId));
  if (email) conds.push(eq(schema.reminderCarts.email, email.toLowerCase()));
  if (!conds.length) return [];
  const open = await db.select().from(schema.reminderCarts).where(and(eq(schema.reminderCarts.status, 'open'), conds.length === 1 ? conds[0] : sql`(${conds[0]} or ${conds[1]})`));
  for (const c of open) await closeCart(c.id, 'ordered', orderId);
  return open;
}
/** Open carts idle for at least `minAgeMs` (oldest first). Carts past the expiry are closed by expireCarts() first. */
export async function openCartsDue(minAgeMs: number, limit = 200) {
  return db.select().from(schema.reminderCarts).where(and(eq(schema.reminderCarts.status, 'open'),
    sql`${schema.reminderCarts.activityAt} < now() - (${Math.round(minAgeMs / 1000)} || ' seconds')::interval`)).orderBy(schema.reminderCarts.activityAt).limit(limit);
}
export async function expireCarts(days: number) {
  await db.execute(sql`update reminder_carts set status = 'expired', closed_at = now() where status = 'open' and activity_at < now() - (${days} || ' days')::interval`);
}

/* ---------------- send log */
export type Claim = { kind: string; clientId: number | null; email: string; item: string; stage: string; channel: string; cycle: string; messageId: string; detail?: unknown };
/** Claim one send. false = already sent (or claimed by a parallel run). A failed row may be retried up to 3 attempts. */
export async function claim(c: Claim): Promise<string | null> {
  const r = await db.execute(sql`
    insert into reminders_log (id, kind, client_id, email, item, stage, channel, cycle, status, message_id, detail)
    values (${cryptoId()}, ${c.kind}, ${c.clientId}, ${c.email.toLowerCase()}, ${c.item}, ${c.stage}, ${c.channel}, ${c.cycle}, 'claimed', ${c.messageId}, ${JSON.stringify(c.detail ?? null)}::jsonb)
    on conflict (kind, item, stage, channel, cycle) do update set status = 'claimed', attempts = reminders_log.attempts + 1, message_id = excluded.message_id, error = '', created_at = now()
    where reminders_log.status = 'failed' and reminders_log.attempts < 3
    returning id`);
  return (r as any)[0]?.id ?? null;
}
export async function finish(ids: string[], ok: boolean, error = '') {
  if (!ids.length) return;
  await db.update(schema.remindersLog).set(ok ? { status: 'sent', sentAt: new Date(), error: '' } : { status: 'failed', error: error.slice(0, 500) }).where(inArray(schema.remindersLog.id, ids));
}
/** Stages already done (sent or claimed) for these items in this cycle, per item. */
export async function sentStages(kind: string, items: string[], channel = 'email'): Promise<Map<string, { stage: string; cycle: string }[]>> {
  const m = new Map<string, { stage: string; cycle: string }[]>();
  if (!items.length) return m;
  const rows = await db.select({ item: schema.remindersLog.item, stage: schema.remindersLog.stage, cycle: schema.remindersLog.cycle }).from(schema.remindersLog)
    .where(and(eq(schema.remindersLog.kind, kind), eq(schema.remindersLog.channel, channel), inArray(schema.remindersLog.item, items), inArray(schema.remindersLog.status, ['sent', 'claimed', 'skipped'])));
  for (const r of rows) { const l = m.get(r.item) || []; l.push({ stage: r.stage, cycle: r.cycle }); m.set(r.item, l); }
  return m;
}
/** Send times (ms) of the distinct messages a person got in the last 7 days (caps), keyed by client id or email. */
export async function recentSends(clientId: number | null, email: string): Promise<number[]> {
  const who = clientId ? eq(schema.remindersLog.clientId, clientId) : eq(schema.remindersLog.email, email.toLowerCase());
  const rows = await db.select({ m: schema.remindersLog.messageId, t: sql<Date>`max(${schema.remindersLog.sentAt})` }).from(schema.remindersLog)
    .where(and(who, eq(schema.remindersLog.status, 'sent'), gt(schema.remindersLog.sentAt, new Date(Date.now() - 7 * 86400_000)))).groupBy(schema.remindersLog.messageId);
  return rows.map((r) => new Date(r.t).getTime());
}
export async function markConverted(kind: string, item: string, cycle?: string) {
  await db.update(schema.remindersLog).set({ convertedAt: new Date() }).where(and(eq(schema.remindersLog.kind, kind), eq(schema.remindersLog.item, item),
    eq(schema.remindersLog.status, 'sent'), isNull(schema.remindersLog.convertedAt), ...(cycle !== undefined ? [eq(schema.remindersLog.cycle, cycle)] : [])));
}
export async function unconverted(kinds: string[], days = 60) {
  return db.select().from(schema.remindersLog).where(and(inArray(schema.remindersLog.kind, kinds), eq(schema.remindersLog.status, 'sent'), isNull(schema.remindersLog.convertedAt),
    gt(schema.remindersLog.sentAt, new Date(Date.now() - days * 86400_000)))).limit(2000);
}
export async function logPage(o: { kind?: string; status?: string; limit?: number } = {}) {
  const conds = [];
  if (o.kind) conds.push(eq(schema.remindersLog.kind, o.kind));
  if (o.status) conds.push(eq(schema.remindersLog.status, o.status));
  return db.select().from(schema.remindersLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.remindersLog.createdAt)).limit(o.limit ?? 100);
}
export async function stats(days = 30) {
  const r = await db.execute(sql`select kind, channel, count(*) filter (where status = 'sent')::int sent, count(*) filter (where status = 'failed')::int failed,
    count(*) filter (where converted_at is not null)::int converted from reminders_log where created_at > now() - (${days} || ' days')::interval group by kind, channel`);
  const carts = await db.execute(sql`select status, count(*)::int n from reminder_carts where created_at > now() - (${days} || ' days')::interval group by status`);
  return { rows: [...(r as any)] as { kind: string; channel: string; sent: number; failed: number; converted: number }[], carts: Object.fromEntries([...(carts as any)].map((x: any) => [x.status, x.n])) as Record<string, number> };
}

import { createId } from '../id';
const cryptoId = () => createId();

/* ---------------- run lock (lease in settings, same pattern as lib/support-notify.ts) */
const LOCK_KEY = 'reminders_lock';
export async function acquire(leaseSec = 280): Promise<boolean> {
  const value = JSON.stringify({ until: new Date(Date.now() + leaseSec * 1000).toISOString() });
  const got = await db.execute(sql`insert into settings (key, value) values (${LOCK_KEY}, ${value}::jsonb)
    on conflict (key) do update set value = excluded.value
    where coalesce((settings.value->>'until')::timestamptz, 'epoch'::timestamptz) < now() returning key`);
  return (got as any).length > 0;
}
export async function release() {
  await db.execute(sql`update settings set value = jsonb_build_object('until', (now() - interval '1 second')::text) where key = ${LOCK_KEY}`).catch(() => {});
}
