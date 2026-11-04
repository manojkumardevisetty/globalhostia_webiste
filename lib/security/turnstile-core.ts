// Cloudflare Turnstile (free) server-side verification. Pure: fetch is injectable (tests/security.test.mts mocks it).
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TOKEN_FIELD = 'cf-turnstile-response';

/** Public forms that can carry the check (Admin > Security switches each one). */
export const TS_FORMS = {
  lead: 'Newsletter / lead sign-up (footer, pop-up, plan finder, landing pages)',
  migration: 'Free migration request',
  broker: 'Domain broker request',
  premium: 'Premium domain purchase request',
  quote: 'Business services quote / contact sales',
  forgot: 'Customer password reset',
  login: 'Customer sign-in',
} as const;
export type TsForm = keyof typeof TS_FORMS;
export const TS_DEFAULT_FORMS: Record<TsForm, boolean> = { lead: true, migration: true, broker: true, premium: true, quote: true, forgot: true, login: false };

export type TsResult = { ok: boolean; reason: 'disabled' | 'passed' | 'missing' | 'failed' | 'unreachable'; codes?: string[] };

/**
 * Verifies a widget token. Cloudflare unreachable (timeout, 5xx, bad JSON) fails OPEN by default: an outage on their
 * side must not stop real customers; honeypot, time trap and rate limits still apply.
 */
export async function verifyTurnstile(
  o: { secret: string; token: unknown; ip?: string; failOpen?: boolean; timeoutMs?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<TsResult> {
  if (!o.secret) return { ok: true, reason: 'disabled' };
  const token = typeof o.token === 'string' ? o.token.trim() : '';
  if (!token || token.length > 2048) return { ok: false, reason: 'missing' };
  const failOpen = o.failOpen !== false;
  try {
    const body = new URLSearchParams({ secret: o.secret, response: token });
    if (o.ip && o.ip !== 'unknown') body.set('remoteip', o.ip);
    const r = await fetchImpl(SITEVERIFY, { method: 'POST', body, signal: AbortSignal.timeout(o.timeoutMs ?? 6000) });
    if (r.status >= 500) return failOpen ? { ok: true, reason: 'unreachable' } : { ok: false, reason: 'unreachable' };
    const j = (await r.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (j?.success === true) return { ok: true, reason: 'passed' };
    const codes = Array.isArray(j?.['error-codes']) ? j['error-codes'].map(String).slice(0, 5) : [];
    // our own key problem (wrong / rotated secret): do not block customers for the owner's configuration error
    if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) return failOpen ? { ok: true, reason: 'unreachable', codes } : { ok: false, reason: 'failed', codes };
    return { ok: false, reason: 'failed', codes };
  } catch {
    return failOpen ? { ok: true, reason: 'unreachable' } : { ok: false, reason: 'unreachable' };
  }
}

export const TS_MESSAGE = 'Please complete the security check (the box above the button) and send the form again.';
