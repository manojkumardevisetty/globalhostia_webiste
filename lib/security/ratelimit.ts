// Central limiter for sensitive endpoints: one call at the top of a handler.
//   const blocked = await guard(req, 'form', email); if (blocked) return blocked;
// Off with Admin > Security ("Rate limits") or env RATE_LIMITS=off. Limits scale with the owner's multiplier.
import 'server-only';
import { blocked, check, newStore, type RuleName } from './ratelimit-core';
import { envRateOff, securityConfig } from './config';

const store = newStore();

export function ipOf(req: Request | { headers: Headers }): string {
  const h = req.headers;
  return (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);
}

/** Counts the hit; returns {ok:false, retryAfter, message} when over the limit. */
export async function limit(rule: RuleName, ip: string, account?: string | null) {
  if (envRateOff()) return { ok: true, retryAfter: 0, message: '' };
  const cfg = await securityConfig();
  if (!cfg.rate.enabled) return { ok: true, retryAfter: 0, message: '' };
  return check(store, rule, { ip, account }, cfg.rate.multiplier);
}

/** Failure-only counting (sign-in, codes): is this IP / account already blocked? Count failures with limit(). */
export async function isBlocked(rule: RuleName, ip: string, account?: string | null) {
  if (envRateOff()) return { ok: true, retryAfter: 0, message: '' };
  const cfg = await securityConfig();
  if (!cfg.rate.enabled) return { ok: true, retryAfter: 0, message: '' };
  return blocked(store, rule, { ip, account }, cfg.rate.multiplier);
}

/** 429 JSON with Retry-After and a friendly message, or null when the request may go on. */
export async function guard(req: Request, rule: RuleName, account?: string | null): Promise<Response | null> {
  const r = await limit(rule, ipOf(req), account);
  if (r.ok) return null;
  return new Response(JSON.stringify({ ok: false, error: 'rate_limited', message: r.message, retryAfter: r.retryAfter }), {
    status: 429,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(r.retryAfter), 'access-control-allow-origin': '*', 'access-control-expose-headers': 'retry-after' },
  });
}
