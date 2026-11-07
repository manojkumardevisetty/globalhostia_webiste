// Separate purpose from hosting service tokens, even though the server-side hook secret is shared.
import { createHmac, timingSafeEqual } from 'node:crypto';
export const HANDOFF_AUD = 'globalhostia:whmcs-admin-portal:v1';
export const HANDOFF_TTL = 120;
export const HANDOFF_COOKIE = '__Host-gh_whmcs_state';
export interface HandoffClaims { aud: typeof HANDOFF_AUD; cid: number; admin: number; state: string; jti: string; iat: number; exp: number }
const opaque = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
export const validState = opaque;
export function verifyHandoff(token: unknown, secret: string | null, state: unknown, now = Math.floor(Date.now() / 1000)): HandoffClaims | null {
  if (!secret || secret.length < 32 || !opaque(state) || typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [body, signature] = token.split('.');
  const want = createHmac('sha256', secret).update(`${HANDOFF_AUD}:${body}`).digest();
  const got = Buffer.from(signature, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let c: HandoffClaims;
  try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!c || c.aud !== HANDOFF_AUD || c.state !== state || !opaque(c.jti)) return null;
  if (![c.cid, c.admin, c.iat, c.exp].every(n => Number.isSafeInteger(n) && n > 0)) return null;
  if (c.iat > now + 5 || c.exp <= now || c.exp - c.iat > HANDOFF_TTL || c.exp <= c.iat || c.iat < now - HANDOFF_TTL) return null;
  return c;
}
