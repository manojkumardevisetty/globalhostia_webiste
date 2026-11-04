'use server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool, int } from '@/lib/admin';
import { normalizeSecurity, saveSecurityConfig, securityConfig } from '@/lib/security/config';
import { TS_FORMS, type TsForm } from '@/lib/security/turnstile-core';
import { revokeSession } from '@/lib/security/sessions';

const P = '/admin/security';

export async function saveSecurity(fd: FormData) {
  const s = await requireSession('settings');
  const cur = await securityConfig();
  const forms = Object.fromEntries((Object.keys(TS_FORMS) as TsForm[]).map((k) => [k, bool(fd, `ts_${k}`)])) as Record<TsForm, boolean>;
  const lines = (k: string) => str(fd, k).split(/[\s,]+/).filter(Boolean);
  const next = normalizeSecurity({
    mfa: { requireAll: bool(fd, 'mfa_requireAll'), idleMinutes: int(fd, 'mfa_idle', cur.mfa.idleMinutes), rememberDays: int(fd, 'mfa_remember', cur.mfa.rememberDays), newDeviceAlert: bool(fd, 'mfa_alert') },
    csp: { mode: str(fd, 'csp_mode'), extra: { script: lines('csp_script'), style: lines('csp_style'), connect: lines('csp_connect'), frame: lines('csp_frame'), font: lines('csp_font'), form: lines('csp_form') } },
    rate: { enabled: bool(fd, 'rate_enabled'), multiplier: Number(str(fd, 'rate_mult') || 1) },
    turnstile: { enabled: bool(fd, 'ts_enabled'), forms },
    disclosure: { contact: str(fd, 'disc_contact'), policyUrl: str(fd, 'disc_policy') },
  });
  if (next.mfa.requireAll && s.role !== 'OWNER') fail(P, 'Only an owner can require two-factor for every admin.');
  await saveSecurityConfig(next);
  await audit(s, 'update', 'security', null, next);
  done(P, 'Security settings saved');
}

export async function clearCspReports() {
  const s = await requireSession('settings');
  await db.execute(sql`delete from csp_reports`).catch(() => fail(P, 'Reports table not available yet'));
  await audit(s, 'clear', 'csp_reports');
  done(P, 'CSP reports cleared');
}

export async function revokeAny(fd: FormData) {
  const s = await requireSession('users');
  const sid = str(fd, 'sid');
  if (!sid) fail(P, 'Missing session');
  await revokeSession(sid, 'revoked_by_owner');
  await audit(s, 'session_revoke', 'session', sid);
  done(P, 'Session signed out');
}
