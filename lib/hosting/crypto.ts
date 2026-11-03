// AES-256-GCM sealing for hosting-panel secrets (login keys / API tokens / the hook HMAC secret) stored in the
// settings table. Key: HOSTING_ENC_KEY, else AUTH_SECRET (both server-only env vars), stretched with SHA-256.
// Pure module (only node:crypto) so it can be unit-tested.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const keyFrom = (raw: string) => createHash('sha256').update(`gh-hosting:v1:${raw}`).digest();

export function encKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.HOSTING_ENC_KEY || env.AUTH_SECRET;
  if (!raw || raw.length < 32) throw new Error('HOSTING_ENC_KEY or AUTH_SECRET (min 32 chars) must be set to store panel secrets');
  return keyFrom(raw);
}

export function seal(plain: string, key: Buffer = encKey()): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

export function unseal(sealed: string, key: Buffer = encKey()): string {
  const [v, iv, tag, ct] = String(sealed || '').split(':');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Stored secret is unreadable');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export const randomSecret = (bytes = 32) => randomBytes(bytes).toString('base64url');
