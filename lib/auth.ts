// Admin authentication: bcrypt passwords, signed HttpOnly JWT cookie, role checks.
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'gh_admin';
export type Role = 'OWNER' | 'ADMIN' | 'EDITOR';
export interface Session { uid: string; email: string; name: string; role: Role }

const key = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error('AUTH_SECRET must be set (min 32 chars)');
  return new TextEncoder().encode(s);
};

export async function signSession(s: Session) {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(key());
}

export async function verifySession(token?: string | null): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return { uid: String(payload.uid), email: String(payload.email), name: String(payload.name || ''), role: payload.role as Role };
  } catch { return null; }
}

/** Permission matrix. EDITOR = content; ADMIN = + integration, commerce, settings; OWNER = + users. */
const PERMS: Record<string, Role[]> = {
  content: ['OWNER', 'ADMIN', 'EDITOR'],
  commerce: ['OWNER', 'ADMIN'],
  integration: ['OWNER', 'ADMIN'],
  settings: ['OWNER', 'ADMIN'],
  users: ['OWNER'],
};
export const can = (s: Session | null, perm: keyof typeof PERMS | string) => !!s && (PERMS[perm] ?? ['OWNER']).includes(s.role);
