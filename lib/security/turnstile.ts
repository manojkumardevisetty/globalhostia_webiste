// Turnstile wiring: fully off until the owner adds TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY (Vercel env), then per form
// in Admin > Security. Env TURNSTILE_DISABLED=1 switches it off everywhere. Honeypot + time trap stay in each form.
import 'server-only';
import { envTurnstileOff, securityConfig, turnstileKeys } from './config';
import { TOKEN_FIELD, TS_MESSAGE, verifyTurnstile, type TsForm, type TsResult } from './turnstile-core';
import { db, schema } from '../db';

export { TOKEN_FIELD, TS_MESSAGE };

/** Is the check asked for on this form right now? */
export async function turnstileActive(form: TsForm): Promise<boolean> {
  if (envTurnstileOff() || !turnstileKeys()) return false;
  const c = await securityConfig();
  return c.turnstile.enabled && c.turnstile.forms[form] !== false;
}

/** Verifies the token sent with a form (field cf-turnstile-response). ok when the check is off for this form. */
export async function checkTurnstile(form: TsForm, token: unknown, ip: string): Promise<TsResult> {
  if (!(await turnstileActive(form))) return { ok: true, reason: 'disabled' };
  const r = await verifyTurnstile({ secret: turnstileKeys()!.secret, token, ip });
  if (!r.ok || r.reason === 'unreachable') {
    await db.insert(schema.auditLogs).values({ userEmail: 'website-form', action: r.ok ? 'turnstile_unreachable' : 'turnstile_blocked', entity: 'security', entityId: form, detail: { reason: r.reason, codes: r.codes || [] } as any }).catch(() => {});
  }
  return r;
}
