// Hosting-panel identity token issued by the WHMCS hook (docs/whmcs/globalhostia_hosting_hook.php) and verified here.
// Format: base64url(JSON {cid, sid, exp}) + "." + base64url(HMAC-SHA256(payloadPart, secret)).
// Pure module (only node:crypto) so tests/hosting.test.mts can import it directly.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface HostingToken { cid: number; sid: number; exp: number }
export type TokenResult = { ok: true; claims: HostingToken } | { ok: false; error: 'malformed' | 'signature' | 'expired' | 'config' };

/** Longest lifetime we accept, whatever exp says (the hook issues now + 600s). */
export const MAX_TTL_S = 15 * 60;

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function signToken(claims: HostingToken, secret: string): string {
  const p = b64url(Buffer.from(JSON.stringify(claims)));
  return `${p}.${b64url(createHmac('sha256', secret).update(p).digest())}`;
}

export function verifyToken(token: string | null | undefined, secret: string | null | undefined, nowS = Math.floor(Date.now() / 1000)): TokenResult {
  if (!secret || secret.length < 32) return { ok: false, error: 'config' };
  if (!token || token.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return { ok: false, error: 'malformed' };
  const [p, sig] = token.split('.');
  const want = createHmac('sha256', secret).update(p).digest();
  const got = fromB64url(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, error: 'signature' };
  let c: any;
  try { c = JSON.parse(fromB64url(p).toString('utf8')); } catch { return { ok: false, error: 'malformed' }; }
  const cid = Number(c?.cid), sid = Number(c?.sid), exp = Number(c?.exp);
  if (![cid, sid, exp].every((n) => Number.isSafeInteger(n) && n > 0)) return { ok: false, error: 'malformed' };
  if (exp <= nowS || exp > nowS + MAX_TTL_S) return { ok: false, error: 'expired' };
  return { ok: true, claims: { cid, sid, exp } };
}

/** "Bearer <token>" or "GH-Hosting <token>" from an Authorization header. */
export const bearer = (h: string | null) => (h && /^(Bearer|GH-Hosting)\s+(\S+)$/i.exec(h.trim())?.[2]) || null;
