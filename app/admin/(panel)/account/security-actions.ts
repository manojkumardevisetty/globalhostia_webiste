'use server';
// My account > Security: two-factor enrolment, recovery codes, remembered devices, own sessions.
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { confirmEnrol, disableMfa, forgetDevices, getMfa, mfaPolicy, regenerateRecovery, startEnrol, verifySecondFactor } from '@/lib/security/mfa';
import { revokeSession, revokeUserSessions } from '@/lib/security/sessions';
import { CODES_COOKIE, setCodesCookie } from '@/lib/security/admin-cookies';
import { env2faDisabled, securityConfig } from '@/lib/security/config';
import { redirect } from 'next/navigation';

export async function beginEnrol() {
  const s = await requireSession('content');
  const r = await getMfa(s.uid);
  if (r === undefined) fail('/admin/account', 'Two-factor is not available yet: the database update (patch 040-security) has not run. Redeploy once the database is reachable.');
  if (r?.enabled) fail('/admin/account', 'Two-factor is already on.');
  await startEnrol(s.uid, s.email);
  redirect('/admin/account/2fa');
}

export async function finishEnrol(fd: FormData) {
  const s = await requireSession('content');
  const codes = await confirmEnrol(s.uid, str(fd, 'code'));
  if (!codes) fail('/admin/account/2fa', 'That code did not match. Enter the newest 6-digit code from the app.');
  await setCodesCookie(s.uid, codes!);
  await audit(s, 'mfa_enabled', 'user', s.uid);
  redirect('/admin/account/codes');
}

export async function newRecoveryCodes(fd: FormData) {
  const s = await requireSession('content');
  if (!(await verifySecondFactor(s.uid, str(fd, 'code')))) fail('/admin/account', 'Enter a current code from your authenticator app to make new recovery codes.');
  const codes = await regenerateRecovery(s.uid);
  if (!codes) fail('/admin/account', 'Two-factor is not on.');
  await setCodesCookie(s.uid, codes!);
  await audit(s, 'mfa_recovery_regenerated', 'user', s.uid);
  redirect('/admin/account/codes');
}

export async function turnOffMfa(fd: FormData) {
  const s = await requireSession('content');
  const r = await getMfa(s.uid);
  const cfg = await securityConfig();
  if ((r?.required || cfg.mfa.requireAll) && !env2faDisabled()) fail('/admin/account', 'Two-factor is required for your account. An owner can change that in Users & Roles.');
  if (!(await verifySecondFactor(s.uid, str(fd, 'code')))) fail('/admin/account', 'Enter a current code (or a recovery code) to turn two-factor off.');
  await disableMfa(s.uid);
  await audit(s, 'mfa_disabled', 'user', s.uid);
  done('/admin/account', 'Two-factor sign-in is off');
}

export async function forgetMyDevices() {
  const s = await requireSession('content');
  await forgetDevices(s.uid);
  await audit(s, 'mfa_forget_devices', 'user', s.uid);
  done('/admin/account', 'Remembered browsers forgotten: every browser asks for a code at the next sign-in');
}

export async function codesSaved() {
  const s = await requireSession('content');
  (await cookies()).delete({ name: CODES_COOKIE, path: '/admin' });
  const p = await mfaPolicy(s.uid);
  done('/admin/account', p.need === 'verify' ? 'Two-factor sign-in is on' : 'Saved');
}

export async function revokeMine(fd: FormData) {
  const s = await requireSession('content');
  const sid = str(fd, 'sid');
  const [row] = await db.select({ id: schema.adminSessions.id }).from(schema.adminSessions).where(and(eq(schema.adminSessions.id, sid), eq(schema.adminSessions.userId, s.uid))).limit(1).catch(() => []);
  if (!row) fail('/admin/account', 'Session not found');
  await revokeSession(sid, 'revoked_by_user');
  await audit(s, 'session_revoke', 'session', sid);
  if (sid === s.sid) redirect('/admin/login');
  done('/admin/account', 'Session signed out');
}

export async function revokeMyOthers() {
  const s = await requireSession('content');
  await revokeUserSessions(s.uid, 'revoked_by_user', s.sid);
  await audit(s, 'session_revoke_others', 'session', s.sid || null);
  done('/admin/account', 'Signed out everywhere else');
}
