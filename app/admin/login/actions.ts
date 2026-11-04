'use server';
// Admin sign-in: password → (two-factor when enrolled or required) → a fresh tracked session.
// Emergency: ADMIN_2FA_DISABLED=1 (Vercel env + redeploy) skips the two-factor step for everyone (docs/security/README.md).
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, schema } from '@/lib/db';
import { COOKIE, signSession, signPurpose, verifyPurpose, verifySession } from '@/lib/auth';
import { isBlocked, limit } from '@/lib/security/ratelimit';
import { confirmEnrol, getMfa, mfaPolicy, verifySecondFactor } from '@/lib/security/mfa';
import { createAdminSession, knownDevice, newId, revokeSession, DEVICE_COOKIE, SESSION_HOURS } from '@/lib/security/sessions';
import { securityConfig } from '@/lib/security/config';
import { PENDING_COOKIE, REMEMBER_COOKIE, secureCookies, setCodesCookie } from '@/lib/security/admin-cookies';

function err(path: string, m: string): never { redirect(`${path}?err=${encodeURIComponent(m)}`); }
const secure = secureCookies;

type User = typeof schema.adminUsers.$inferSelect;

async function reqInfo() {
  const h = await headers();
  return {
    ip: (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'local').trim().slice(0, 64),
    ua: (h.get('user-agent') || '').slice(0, 300),
    country: (h.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
  };
}

async function rememberedOk(uid: string, epoch: number) {
  const t = await verifyPurpose('admin-remember', (await cookies()).get(REMEMBER_COOKIE)?.value);
  return !!t && t.uid === uid && Number(t.epoch) === epoch;
}

/** Issues the session: revokes the cookie the browser had (rotation), new sid, device cookie, new-device alert. */
async function completeLogin(u: User, mfa: string, next: string, o: { remember?: boolean; epoch?: number; codes?: string[] } = {}): Promise<never> {
  const jar = await cookies();
  const info = await reqInfo();
  const prior = await verifySession(jar.get(COOKIE)?.value);
  if (prior?.sid) await revokeSession(prior.sid, 'rotated');
  let did = jar.get(DEVICE_COOKIE)?.value || '';
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(did)) did = newId(16);
  const known = await knownDevice(u.id, did);
  const sid = await createAdminSession({ uid: u.id, email: u.email, ip: info.ip, ua: info.ua, country: info.country, deviceId: did, mfa });
  const token = await signSession({ uid: u.id, email: u.email, name: u.name, role: u.role, ...(sid ? { sid } : {}) });
  jar.set(COOKIE, token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_HOURS * 3600 });
  jar.set(DEVICE_COOKIE, did, { httpOnly: true, secure, sameSite: 'lax', path: '/admin', maxAge: 400 * 24 * 3600 });
  jar.delete(PENDING_COOKIE);
  const cfg = await securityConfig();
  if (o.remember && cfg.mfa.rememberDays > 0 && o.epoch != null) {
    const days = cfg.mfa.rememberDays;
    jar.set(REMEMBER_COOKIE, await signPurpose('admin-remember', { uid: u.id, epoch: o.epoch, did }, `${days}d`), { httpOnly: true, secure, sameSite: 'lax', path: '/admin', maxAge: days * 24 * 3600 });
  }
  if (o.codes) await setCodesCookie(u.id, o.codes);
  await db.update(schema.adminUsers).set({ lastLoginAt: new Date() }).where(eq(schema.adminUsers.id, u.id)).catch(() => {});
  await db.insert(schema.auditLogs).values({ userEmail: u.email, action: 'login', entity: 'auth', detail: { ip: info.ip, country: info.country, mfa, newDevice: known === false, sid: sid || null } as any }).catch(() => {});
  if (known === false && cfg.mfa.newDeviceAlert) {
    const send = async () => {
      const { emailOwner } = await import('@/lib/support-notify');
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      await emailOwner(`Admin sign-in from a new device: ${u.email}`,
        `<p>The GlobalHostia admin account <b>${esc(u.email)}</b> just signed in from a browser that has not been used before.</p>` +
        `<p>Time: ${esc(new Date().toISOString())} (UTC)<br>IP: ${esc(info.ip)}${info.country ? ` (${esc(info.country)})` : ''}<br>Browser: ${esc(info.ua.slice(0, 160))}<br>Two-factor: ${esc(mfa)}</p>` +
        `<p>If this was not you, open Admin &gt; Security, revoke the session and change the password.</p>`);
    };
    try { after(send); } catch { void send().catch(() => {}); }
  }
  redirect(next);
}

export async function login(fd: FormData) {
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  let next = String(fd.get('next') || '/admin');
  if (!next.startsWith('/admin') || next.startsWith('//') || next.startsWith('/admin/login')) next = '/admin';
  const info = await reqInfo();
  // failed attempts only (lib/security/ratelimit.ts): 10 per IP per 10 minutes, 10 per account per 30 minutes
  const rl = await isBlocked('admin-login', info.ip, email);
  if (!rl.ok) err('/admin/login', rl.message);

  const u = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, email)).limit(1).then((r) => r[0] ?? null, () => undefined);
  if (u === undefined) err('/admin/login', 'Database unavailable. The website is still online; please try signing in again later.');
  const ok = u && u.active && (await bcrypt.compare(password, u.passwordHash));
  if (!ok) {
    await limit('admin-login', info.ip, email);
    await db.insert(schema.auditLogs).values({ userEmail: email || '(blank)', action: 'login_failed', entity: 'auth', detail: { ip: info.ip } }).catch(() => {});
    err('/admin/login', 'Invalid email or password');
  }
  const user = u!;
  const p = await mfaPolicy(user.id);
  if (p.need === 'verify' && (await rememberedOk(user.id, p.row!.epoch))) return completeLogin(user, 'remembered', next);
  if (p.need === 'none') return completeLogin(user, p.disabledByEnv ? 'env-disabled' : 'none', next);
  // two-factor step: a 10-minute token naming the admin (never a session; verifySession refuses it)
  (await cookies()).set(PENDING_COOKIE, await signPurpose('admin-mfa', { uid: user.id, stage: p.need, next }, '10m'), { httpOnly: true, secure, sameSite: 'lax', path: '/admin', maxAge: 600 });
  await db.insert(schema.auditLogs).values({ userEmail: user.email, action: 'login_password_ok', entity: 'auth', detail: { ip: info.ip, step: p.need } }).catch(() => {});
  redirect('/admin/login/2fa');
}

async function pending() {
  const t = await verifyPurpose('admin-mfa', (await cookies()).get(PENDING_COOKIE)?.value);
  if (!t) err('/admin/login', 'Your sign-in step expired. Please sign in again.');
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, String(t!.uid))).limit(1);
  if (!u || !u.active) err('/admin/login', 'Please sign in again.');
  return { t: t!, u: u! };
}

/** Two-factor step: a 6-digit code or a recovery code. */
export async function verify2fa(fd: FormData) {
  const { t, u } = await pending();
  const info = await reqInfo();
  const rl = await isBlocked('admin-2fa', info.ip, u.id);
  if (!rl.ok) err('/admin/login/2fa', rl.message);
  const method = await verifySecondFactor(u.id, String(fd.get('code') || ''));
  if (!method) {
    await limit('admin-2fa', info.ip, u.id);
    await db.insert(schema.auditLogs).values({ userEmail: u.email, action: 'login_2fa_failed', entity: 'auth', detail: { ip: info.ip } }).catch(() => {});
    err('/admin/login/2fa', 'That code did not work. Check the time on your phone and try the newest code.');
  }
  const row = await getMfa(u.id);
  return completeLogin(u, method!, String(t.next || '/admin'), { remember: fd.get('remember') === 'on', epoch: row?.epoch ?? 0 });
}

/** Required enrolment during sign-in: confirm the first code, then show the recovery codes once. */
export async function enrolAtLogin(fd: FormData) {
  const { u } = await pending();
  const info = await reqInfo();
  const rl = await isBlocked('admin-2fa', info.ip, u.id);
  if (!rl.ok) err('/admin/login/2fa', rl.message);
  const codes = await confirmEnrol(u.id, String(fd.get('code') || ''));
  if (!codes) await limit('admin-2fa', info.ip, u.id);
  if (!codes) err('/admin/login/2fa', 'That code did not match. Scan the QR code again and enter the newest 6-digit code.');
  await db.insert(schema.auditLogs).values({ userEmail: u.email, action: 'mfa_enabled', entity: 'auth', detail: { ip: info.ip, at: 'login' } }).catch(() => {});
  return completeLogin(u, 'totp', '/admin/account/codes', { codes });
}

export async function cancelLogin() {
  (await cookies()).delete(PENDING_COOKIE);
  redirect('/admin/login');
}

export async function logout() {
  const jar = await cookies();
  const s = await verifySession(jar.get(COOKIE)?.value);
  if (s?.sid) await revokeSession(s.sid, 'signed_out');
  jar.delete(COOKIE);
  redirect('/admin/login');
}

