// TOTP (RFC 6238) on HOTP (RFC 4226) with Node crypto only: no paid service, no dependency.
// Pure module (no app imports) so tests/security.test.mts can run it directly.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 20 random bytes (160 bits, the RFC 4226 recommendation) as base32. */
export const generateSecret = (bytes = 20) => base32Encode(randomBytes(bytes));

export type Algo = 'sha1' | 'sha256' | 'sha512';

/** RFC 4226 HOTP value for a counter. */
export function hotp(key: Buffer, counter: number, digits = 6, algo: Algo = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algo, key).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** RFC 6238 time step for a unix time in ms. */
export const timeStep = (ms: number, period = 30) => Math.floor(ms / 1000 / period);

export function totp(secretB32: string, ms = Date.now(), o: { digits?: number; period?: number; algo?: Algo } = {}) {
  return hotp(base32Decode(secretB32), timeStep(ms, o.period), o.digits ?? 6, o.algo ?? 'sha1');
}

const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a 6-digit code against the current step ±window (default ±1 = 90s of clock drift).
 * Returns the matched time step (store it: a step at or below the last used one is a replay), or null.
 */
export function verifyTotp(secretB32: string, code: string, o: { ms?: number; window?: number; lastStep?: number } = {}): number | null {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  let key: Buffer;
  try { key = base32Decode(secretB32); } catch { return null; }
  const now = timeStep(o.ms ?? Date.now());
  const w = o.window ?? 1;
  for (let d = -w; d <= w; d++) {
    const step = now + d;
    if (o.lastStep != null && step <= o.lastStep) continue;
    if (eq(hotp(key, step), c)) return step;
  }
  return null;
}

/** otpauth:// URI read by Google Authenticator, 1Password, Authy, Microsoft Authenticator … */
export function otpauthUri(secretB32: string, account: string, issuer = 'GlobalHostia Admin') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ---------------- one-time recovery codes ---------------- */

const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i

/** 10 codes like "k7m2q-9xw4p" (50 bits each). Show once; store only hashRecovery() values. */
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(10);
    const s = Array.from(b, (x) => RC_ALPHABET[x % RC_ALPHABET.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5, 10)}`;
  });
}

export const normalizeRecovery = (code: string) => String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** HMAC-SHA256 with a server-side pepper: a database leak alone does not reveal usable codes. */
export const hashRecovery = (code: string, pepper: string) => createHmac('sha256', pepper).update('rc:' + normalizeRecovery(code)).digest('hex');

/** Returns the remaining hashes when `code` matches one (consumed), or null. */
export function consumeRecovery(hashes: string[], code: string, pepper: string): string[] | null {
  const n = normalizeRecovery(code);
  if (n.length !== 10) return null;
  const h = hashRecovery(n, pepper);
  const i = hashes.findIndex((x) => eq(x, h));
  if (i < 0) return null;
  return hashes.filter((_, k) => k !== i);
}
