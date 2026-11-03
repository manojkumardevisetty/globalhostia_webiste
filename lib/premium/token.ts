// Form token for the premium-domain request form (CSRF protection on top of the same-origin check in the API route).
// The page is CDN-cached for up to a day, so a token is valid for 48 hours: "<unix>.<hex HMAC(AUTH_SECRET, 'pd-form.v1.<unix>.<domain>')>".
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE = 48 * 3600;
const secret = () => { const s = process.env.AUTH_SECRET; if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (min 32 chars)'); return s; };
const sign = (t: number, domain: string) => createHmac('sha256', secret()).update(`pd-form.v1.${t}.${domain}`).digest('hex');

export function formToken(domain: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  return `${t}.${sign(t, domain)}`;
}
export function checkToken(tok: unknown, domain: string, now = Date.now()): boolean {
  if (typeof tok !== 'string' || !/^\d{9,11}\.[a-f0-9]{64}$/.test(tok)) return false;
  const [ts, mac] = tok.split('.');
  const t = Number(ts), age = Math.floor(now / 1000) - t;
  if (age < 0 - 300 || age > MAX_AGE) return false;
  const want = Buffer.from(sign(t, domain), 'hex'), got = Buffer.from(mac, 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}
