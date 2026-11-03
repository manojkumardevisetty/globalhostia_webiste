// Customer portal session: signed HttpOnly JWT cookie (HS256, audience "client", 8h), CSRF tokens bound to the
// session id, same-origin checks and login rate limiting. Passwords are never stored or logged.
import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { and, count, eq, gt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db, schema } from '../db';

export const CLIENT_COOKIE = 'gh_client';
const AUD = 'client';
const TTL_S = 8 * 60 * 60;

export interface ClientSession { clientId: number; userId?: number; email: string; name: string; cur: string; jti: string }

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (min 32 chars)');
  return s;
};
const key = () => new TextEncoder().encode(secret());

export async function signClient(s: Omit<ClientSession, 'jti'>) {
  const jti = randomUUID();
  const token = await new SignJWT({ cid: s.clientId, uid: s.userId, email: s.email, name: s.name, cur: s.cur })
    .setProtectedHeader({ alg: 'HS256' }).setAudience(AUD).setJti(jti).setIssuedAt().setExpirationTime(`${TTL_S}s`).sign(key());
  return { token, jti };
}

export async function readClient(req: NextRequest): Promise<ClientSession | null> {
  const t = req.cookies.get(CLIENT_COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload: p } = await jwtVerify(t, key(), { algorithms: ['HS256'], audience: AUD });
    const clientId = Number(p.cid);
    if (!Number.isInteger(clientId) || clientId <= 0 || !p.jti) return null;
    return { clientId, userId: p.uid ? Number(p.uid) : undefined, email: String(p.email || ''), name: String(p.name || ''), cur: /^[A-Z]{3}$/.test(String(p.cur)) ? String(p.cur) : 'USD', jti: String(p.jti) };
  } catch { return null; }
}

export const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: TTL_S };

/** CSRF token = HMAC(session id). Every POST form in the portal carries it. */
export const csrfFor = (jti: string) => createHmac('sha256', secret()).update(`csrf:${jti}`).digest('base64url');
export function csrfOk(jti: string, token: unknown) {
  if (typeof token !== 'string' || !token) return false;
  const a = Buffer.from(csrfFor(jti)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** POSTs must come from our own origin (Origin header, or Referer when Origin is absent). */
export function sameOrigin(req: NextRequest) {
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  // Browsers send Origin: null on form POSTs from pages with a strict referrer policy; trust the browser's own
  // Sec-Fetch-Site in that case (it cannot be set by page script).
  if (req.headers.get('sec-fetch-site') === 'same-origin') return true;
  const o = req.headers.get('origin');
  const src = (o && o !== 'null' ? o : '') || req.headers.get('referer');
  if (!host || !src || src === 'null') return false;
  try { return new URL(src).host.toLowerCase() === host; } catch { return false; }
}

export const clientIp = (req: NextRequest) =>
  (req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown').slice(0, 64);

const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILS = 5;

/** Failed attempts in the last 15 minutes, per IP and per email (from audit_logs). */
export async function recentFailures(action: string, ip: string, email: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const base = and(eq(schema.auditLogs.action, action), gt(schema.auditLogs.createdAt, since));
  // database unavailable: no count (WHMCS still applies its own failed-login bans)
  const none = [{ n: 0 }];
  const [byIp, byEmail] = await Promise.all([
    db.select({ n: count() }).from(schema.auditLogs).where(and(base, eq(schema.auditLogs.entityId, ip))).catch(() => none),
    email ? db.select({ n: count() }).from(schema.auditLogs).where(and(base, eq(schema.auditLogs.userEmail, email))).catch(() => none) : Promise.resolve(none),
  ]);
  return Math.max(Number(byIp[0]?.n || 0), Number(byEmail[0]?.n || 0));
}

export async function auditClient(action: string, email: string, ip: string, detail?: Record<string, unknown>) {
  await db.insert(schema.auditLogs).values({ userEmail: email.slice(0, 254) || 'unknown', action, entity: 'client', entityId: ip, detail: (detail ?? null) as any }).catch(() => {});
}
