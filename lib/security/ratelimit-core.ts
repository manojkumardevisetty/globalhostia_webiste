// Central rate-limit rules for sensitive endpoints (pure: tests/security.test.mts). lib/security/ratelimit.ts wires it to
// requests, the owner's switches (Admin > Security, env RATE_LIMITS=off) and 429 replies.
// Fixed windows in memory, per server instance: a burst control in front of the existing per-endpoint and database-backed
// limits, not a replacement for them. Vercel Firewall rules (docs/security/README.md) add a platform-wide layer.

export type Window = { max: number; ms: number };
export type Rule = { ip: Window; account?: Window; message: string };

const MIN = 60_000;
// AI platforms (Claude, ChatGPT) call /oauth and /mcp from shared egress IPs and WHMCS calls /api/reminders from one
// server: those ceilings sit above the per-endpoint limits already in place, so they only stop floods.
export const RULES = {
  'admin-login': { ip: { max: 10, ms: 10 * MIN }, account: { max: 10, ms: 30 * MIN }, message: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
  'admin-2fa': { ip: { max: 20, ms: 10 * MIN }, account: { max: 6, ms: 5 * MIN }, message: 'Too many codes tried. Please wait 5 minutes and sign in again.' },
  'account-login': { ip: { max: 20, ms: 10 * MIN }, account: { max: 10, ms: 15 * MIN }, message: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
  'password-reset': { ip: { max: 6, ms: 15 * MIN }, account: { max: 3, ms: 60 * MIN }, message: 'Too many reset requests. Please check your inbox or try again later.' },
  'signup': { ip: { max: 5, ms: 60 * MIN }, message: 'Too many sign-ups from your connection. Please try again later.' },
  'form': { ip: { max: 10, ms: 10 * MIN }, account: { max: 5, ms: 60 * MIN }, message: 'You have sent this form several times. Please wait a few minutes, or message us on WhatsApp.' },
  'ai': { ip: { max: 40, ms: MIN }, message: 'You are sending messages quickly. Please wait a moment.' },
  'oauth': { ip: { max: 600, ms: MIN }, message: 'Too many requests. Please try again in a minute.' },
  'mcp': { ip: { max: 600, ms: MIN }, message: 'Too many requests. Please try again in a minute.' },
  'reminders': { ip: { max: 240, ms: MIN }, message: 'Too many requests. Please try again in a minute.' },
  'domain-check': { ip: { max: 30, ms: MIN }, message: 'Too many domain searches. Please wait a minute.' },
  'csp-report': { ip: { max: 60, ms: MIN }, message: 'Too many reports.' },
} satisfies Record<string, Rule>;
export type RuleName = keyof typeof RULES;

export type Store = Map<string, { n: number; t: number }>;
export const newStore = (): Store => new Map();

/** Counts one hit; returns seconds to wait (0 = allowed). */
export function hit(store: Store, key: string, w: Window, now = Date.now()): number {
  if (store.size > 20_000) for (const [k, v] of store) if (now - v.t > 60 * MIN) store.delete(k);
  const h = store.get(key);
  if (!h || now - h.t >= w.ms) { store.set(key, { n: 1, t: now }); return 0; }
  h.n++;
  return h.n > w.max ? Math.max(1, Math.ceil((w.ms - (now - h.t)) / 1000)) : 0;
}

/** Seconds to wait if the key is already over its limit, without counting a hit (failure-only counters). */
export function peek(store: Store, key: string, w: Window, now = Date.now()): number {
  const h = store.get(key);
  if (!h || now - h.t >= w.ms || h.n < w.max) return 0;
  return Math.max(1, Math.ceil((w.ms - (now - h.t)) / 1000));
}

/** Like check(), but only reports whether the caller is already blocked (counts nothing). Pair with check() on failure. */
export function blocked(store: Store, name: RuleName, keys: { ip: string; account?: string | null }, mult = 1, now = Date.now()) {
  const r: Rule = RULES[name];
  const scale = (w: Window): Window => ({ max: Math.max(1, Math.round(w.max * mult)), ms: w.ms });
  let wait = peek(store, `${name}:ip:${keys.ip}`, scale(r.ip), now);
  if (r.account && keys.account) wait = Math.max(wait, peek(store, `${name}:acct:${keys.account.toLowerCase()}`, scale(r.account), now));
  return { ok: wait === 0, retryAfter: wait, message: r.message };
}

/** Applies a rule's per-IP and (when given) per-account windows; `mult` scales every max (owner setting, 0.25–10). */
export function check(store: Store, name: RuleName, keys: { ip: string; account?: string | null }, mult = 1, now = Date.now()) {
  const r: Rule = RULES[name];
  const scale = (w: Window): Window => ({ max: Math.max(1, Math.round(w.max * mult)), ms: w.ms });
  let wait = hit(store, `${name}:ip:${keys.ip}`, scale(r.ip), now);
  if (r.account && keys.account) wait = Math.max(wait, hit(store, `${name}:acct:${keys.account.toLowerCase()}`, scale(r.account), now));
  return { ok: wait === 0, retryAfter: wait, message: r.message };
}
