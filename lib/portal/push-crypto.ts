// Minimal Web Push for the portal: VAPID (RFC 8292, ES256 JWT) and message encryption with aes128gcm (RFC 8188 +
// RFC 8291). node:crypto only, no dependency. Pure, so tests/push.test.mts can round-trip it.
import { createCipheriv, createDecipheriv, createECDH, createHmac, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';

export const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
export const unb64u = (s: string) => Buffer.from(String(s || '').replace(/=+$/, ''), 'base64url');

/** New P-256 key pair: public key as uncompressed point (65 bytes), private key as the 32-byte scalar, both base64url. */
export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

export function validVapid(pub: string, priv: string) {
  const p = unb64u(pub), d = unb64u(priv);
  return p.length === 65 && p[0] === 4 && d.length === 32;
}

const jwk = (pub: string, priv?: string) => {
  const p = unb64u(pub);
  return { kty: 'EC', crv: 'P-256', x: b64u(p.subarray(1, 33)), y: b64u(p.subarray(33, 65)), ...(priv ? { d: priv.replace(/=+$/, '') } : {}) };
};

/** Authorization header value for a push service endpoint: "vapid t=<jwt>, k=<public key>". */
export function vapidAuth(endpoint: string, subject: string, publicKey: string, privateKey: string, ttlSec = 12 * 3600, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const enc = (o: object) => b64u(Buffer.from(JSON.stringify(o)));
  const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(now / 1000) + ttlSec, sub: subject })}`;
  const key = createPrivateKey({ key: jwk(publicKey, privateKey) as any, format: 'jwk' });
  const sig = sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${data}.${b64u(sig)}, k=${publicKey.replace(/=+$/, '')}`;
}

/** Check a VAPID JWT against the public key (tests, diagnostics). */
export function verifyVapid(jwt: string, publicKey: string) {
  const [h, p, s] = jwt.split('.');
  const key = createPublicKey({ key: jwk(publicKey) as any, format: 'jwk' });
  return verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, unb64u(s));
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
const RS = 4096;

/**
 * Encrypt a push message for one subscription (keys.p256dh, keys.auth). Returns the request body:
 * salt(16) | rs(4) | idlen(1)=65 | sender public key(65) | AES-128-GCM(payload || 0x02) | tag(16). Single record.
 */
export function encryptPayload(payload: Buffer | string, p256dh: string, auth: string, o: { salt?: Buffer; sender?: { pub: Buffer; priv: Buffer } } = {}) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  if (ua.length !== 65 || secret.length < 16) throw new Error('Invalid subscription keys');
  const msg = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  if (msg.length > RS - 17 - 86) throw new Error('Push payload too large');
  const as = createECDH('prime256v1');
  if (o.sender) as.setPrivateKey(o.sender.priv); else as.generateKeys();
  const asPub = as.getPublicKey();
  const ecdhSecret = as.computeSecret(ua);
  const prkKey = hmac(secret, ecdhSecret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const salt = o.salt || randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const c = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([msg, Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0); head.writeUInt32BE(RS, 16); head[20] = 65;
  return Buffer.concat([head, asPub, body]);
}

/** Receiver side of encryptPayload (tests): needs the subscription's private key and auth secret. */
export function decryptPayload(body: Buffer, uaPriv: Buffer, auth: string) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ua = createECDH('prime256v1'); ua.setPrivateKey(uaPriv);
  const uaPub = ua.getPublicKey();
  const prkKey = hmac(unb64u(auth), ua.computeSecret(asPub));
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('Bad padding delimiter');
  return plain.subarray(0, end);
}

/** Subscription JSON from the browser (PushSubscription.toJSON()), validated. Only https push services are accepted. */
export function parseSubscription(raw: unknown): { endpoint: string; p256dh: string; auth: string } | null {
  let o: any = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  const endpoint = String(o?.endpoint || '');
  const p256dh = String(o?.keys?.p256dh || ''), auth = String(o?.keys?.auth || '');
  let u: URL;
  try { u = new URL(endpoint); } catch { return null; }
  if (u.protocol !== 'https:' || endpoint.length > 2048 || /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) return null;
  if (unb64u(p256dh).length !== 65 || unb64u(auth).length < 16 || unb64u(auth).length > 64) return null;
  return { endpoint, p256dh, auth };
}

export const PUSH_CATEGORIES = ['tickets', 'invoices', 'domains', 'services'] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];
export const parseCategories = (v: unknown[]): PushCategory[] =>
  [...new Set(v.map(String).filter((c): c is PushCategory => (PUSH_CATEGORIES as readonly string[]).includes(c)))];
