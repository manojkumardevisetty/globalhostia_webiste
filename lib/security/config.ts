// Security switches (Admin > Security, settings key `security_config`) merged with the env emergency overrides.
// Every control can be turned off from here or from env, so the owner can never lock themselves out:
//   ADMIN_2FA_DISABLED=1   skip the admin two-factor check entirely (sign in with the password only)
//   CSP_MODE=report|off    stop enforcing the Content-Security-Policy (the least strict of env and admin wins)
//   RATE_LIMITS=off        turn the central rate limiter off
//   TURNSTILE_DISABLED=1   never ask for the Turnstile check (also off until TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY exist)
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { setSetting } from '../settings';
import { TS_DEFAULT_FORMS, type TsForm } from './turnstile-core';
import { cleanExtra, parseMode } from './csp-policy.mjs';

export const SECURITY_KEY = 'security_config';
/** Public mirror (read by page rendering through getSettings): which forms show Turnstile. No secrets. */
export const SECURITY_PUBLIC_KEY = 'security_public';

export type SecurityConfig = {
  mfa: { requireAll: boolean; idleMinutes: number; rememberDays: number; newDeviceAlert: boolean };
  csp: { mode: 'enforce' | 'report' | 'off'; extra: Record<string, string[]> };
  rate: { enabled: boolean; multiplier: number };
  turnstile: { enabled: boolean; forms: Record<TsForm, boolean> };
  disclosure: { contact: string; policyUrl: string };
};

export const DEFAULT_SECURITY: SecurityConfig = {
  mfa: { requireAll: false, idleMinutes: 120, rememberDays: 30, newDeviceAlert: true },
  csp: { mode: 'enforce', extra: {} },
  rate: { enabled: true, multiplier: 1 },
  turnstile: { enabled: true, forms: { ...TS_DEFAULT_FORMS } },
  disclosure: { contact: '', policyUrl: '' },
};

const num = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

export function normalizeSecurity(raw: any): SecurityConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SECURITY;
  const forms = { ...d.turnstile.forms };
  for (const k of Object.keys(forms) as TsForm[]) if (typeof r.turnstile?.forms?.[k] === 'boolean') forms[k] = r.turnstile.forms[k];
  return {
    mfa: {
      requireAll: r.mfa?.requireAll === true,
      idleMinutes: num(r.mfa?.idleMinutes, 0, 24 * 60, d.mfa.idleMinutes),
      rememberDays: num(r.mfa?.rememberDays, 0, 90, d.mfa.rememberDays),
      newDeviceAlert: r.mfa?.newDeviceAlert !== false,
    },
    csp: { mode: parseMode(r.csp?.mode, 'enforce') as SecurityConfig['csp']['mode'], extra: cleanExtra(r.csp?.extra || {}) },
    rate: { enabled: r.rate?.enabled !== false, multiplier: num(r.rate?.multiplier, 0.25, 10, 1) },
    turnstile: { enabled: r.turnstile?.enabled !== false, forms },
    disclosure: {
      contact: typeof r.disclosure?.contact === 'string' ? r.disclosure.contact.trim().slice(0, 200) : '',
      policyUrl: typeof r.disclosure?.policyUrl === 'string' && /^https:\/\//.test(r.disclosure.policyUrl.trim()) ? r.disclosure.policyUrl.trim().slice(0, 300) : '',
    },
  };
}

let memo: { at: number; v: SecurityConfig } | null = null;
/** Fresh read, remembered 30s per instance. Database unavailable: defaults (never blocks a request). */
export async function securityConfig(): Promise<SecurityConfig> {
  if (memo && Date.now() - memo.at < 30_000) return memo.v;
  let v = DEFAULT_SECURITY;
  try {
    const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, SECURITY_KEY)).limit(1);
    v = normalizeSecurity(row?.value);
  } catch { v = memo?.v ?? DEFAULT_SECURITY; }
  memo = { at: Date.now(), v };
  return v;
}

export async function saveSecurityConfig(v: SecurityConfig) {
  const n = normalizeSecurity(v);
  await setSetting(SECURITY_KEY, n);
  await setSetting(SECURITY_PUBLIC_KEY, { turnstile: { enabled: n.turnstile.enabled, forms: n.turnstile.forms }, contact: n.disclosure.contact });
  memo = { at: Date.now(), v: n };
  return n;
}

const on = (v: string | undefined) => /^(1|true|yes|on)$/i.test(String(v || '').trim());
export const env2faDisabled = () => on(process.env.ADMIN_2FA_DISABLED);
export const envRateOff = () => /^(0|off|false|no|disabled)$/i.test(String(process.env.RATE_LIMITS || '').trim());
export const envTurnstileOff = () => on(process.env.TURNSTILE_DISABLED);
export const turnstileKeys = () => {
  const site = (process.env.TURNSTILE_SITE_KEY || '').trim(), secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  return site && secret ? { site, secret } : null;
};
