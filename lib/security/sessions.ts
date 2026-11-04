// Tracked admin sessions: every sign-in gets an admin_sessions row and a fresh cookie that names it (sid), so a session can
// be listed, revoked and expired after idle time (Admin > Security / My account). Rotation: a new sid on every sign-in,
// and the cookie the browser had before is revoked.
// Fail-open on database trouble only (table missing, database down): the signed 12-hour cookie still stands, exactly as
// before session tracking existed. A missing or revoked row is never treated as trouble.
import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { verifySession, type Session } from '../auth';
import { securityConfig } from './config';

export const SESSION_HOURS = 12;
export const DEVICE_COOKIE = 'gh_admin_did';
export const newId = (bytes = 18) => randomBytes(bytes).toString('base64url');

type Row = typeof schema.adminSessions.$inferSelect;
const memo = new Map<string, { at: number; row: Row | null }>();

export async function createAdminSession(o: { uid: string; email: string; ip: string; ua: string; country: string; deviceId: string; mfa: string }): Promise<string | undefined> {
  const id = newId();
  try {
    await db.insert(schema.adminSessions).values({
      id, userId: o.uid, email: o.email, ip: o.ip.slice(0, 64), ua: o.ua.slice(0, 300), country: o.country.slice(0, 2), deviceId: o.deviceId.slice(0, 64), mfa: o.mfa,
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000),
    });
    return id;
  } catch { return undefined; } // table not there yet: an untracked session, as before
}

export async function revokeSession(sid: string, reason: string) {
  memo.delete(sid);
  await db.update(schema.adminSessions).set({ revokedAt: new Date(), revokedReason: reason.slice(0, 40) }).where(and(eq(schema.adminSessions.id, sid), isNull(schema.adminSessions.revokedAt))).catch(() => {});
}

export async function revokeUserSessions(uid: string, reason: string, exceptSid?: string) {
  for (const k of memo.keys()) if (k !== exceptSid) memo.delete(k);
  await db.update(schema.adminSessions).set({ revokedAt: new Date(), revokedReason: reason.slice(0, 40) })
    .where(and(eq(schema.adminSessions.userId, uid), isNull(schema.adminSessions.revokedAt), exceptSid ? ne(schema.adminSessions.id, exceptSid) : sql`true`)).catch(() => {});
}

/** Was this browser (device cookie) used by this admin before? Unknown when the table is unavailable (no alert then). */
export async function knownDevice(uid: string, deviceId: string): Promise<boolean | null> {
  if (!deviceId) return false;
  try {
    const r = await db.select({ id: schema.adminSessions.id }).from(schema.adminSessions).where(and(eq(schema.adminSessions.userId, uid), eq(schema.adminSessions.deviceId, deviceId))).limit(1);
    return r.length > 0;
  } catch { return null; }
}

export async function listSessions(uid?: string, limit = 50) {
  try {
    const q = db.select().from(schema.adminSessions);
    return await (uid ? q.where(eq(schema.adminSessions.userId, uid)) : q).orderBy(desc(schema.adminSessions.lastSeenAt)).limit(limit);
  } catch { return null; }
}

export const isActive = (r: Row, idleMinutes: number, now = Date.now()) =>
  !r.revokedAt && r.expiresAt.getTime() > now && !(idleMinutes > 0 && now - r.lastSeenAt.getTime() > idleMinutes * 60_000);

/** The admin session for a cookie value: signature, then the tracked row (revoked / expired / idle → null). */
export async function liveSession(token?: string | null): Promise<Session | null> {
  const s = await verifySession(token);
  if (!s || !s.sid) return s;
  const now = Date.now();
  let m = memo.get(s.sid);
  if (!m || now - m.at > 15_000) {
    try {
      const [row] = await db.select().from(schema.adminSessions).where(eq(schema.adminSessions.id, s.sid)).limit(1);
      m = { at: now, row: row ?? null };
      if (memo.size > 2000) memo.clear();
      memo.set(s.sid, m);
    } catch { return s; } // database trouble: the signed cookie stands
  }
  const row = m.row;
  if (!row || row.userId !== s.uid) return null;
  const { mfa } = await securityConfig();
  if (!isActive(row, mfa.idleMinutes, now)) {
    if (!row.revokedAt && mfa.idleMinutes > 0 && now - row.lastSeenAt.getTime() > mfa.idleMinutes * 60_000) await revokeSession(row.id, 'idle');
    return null;
  }
  if (now - row.lastSeenAt.getTime() > 60_000) {
    row.lastSeenAt = new Date(now);
    await db.update(schema.adminSessions).set({ lastSeenAt: row.lastSeenAt }).where(eq(schema.adminSessions.id, row.id)).catch(() => {});
  }
  return s;
}
