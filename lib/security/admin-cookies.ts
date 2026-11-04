// Cookie names and the sealed one-time recovery-codes cookie for the admin sign-in (app/admin/login/actions.ts).
import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { seal, unseal } from '../hosting/crypto';

export const PENDING_COOKIE = 'gh_admin_mfa'; // 10-minute two-factor step token
export const REMEMBER_COOKIE = 'gh_admin_rd'; // "remember this device" (signed, per admin, epoch-bound)
export const CODES_COOKIE = 'gh_admin_rc'; // recovery codes waiting to be shown once (sealed, 15 minutes)
export const secureCookies = process.env.NODE_ENV === 'production';

const codesKey = () => createHash('sha256').update(`gh-mfa-codes:v1:${process.env.AUTH_SECRET || ''}`).digest();

export async function setCodesCookie(uid: string, codes: string[]) {
  (await cookies()).set(CODES_COOKIE, seal(JSON.stringify({ uid, codes, exp: Date.now() + 15 * 60_000 }), codesKey()), { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/admin', maxAge: 15 * 60 });
}

/** The codes waiting for this admin, or null (already shown, expired, other admin). */
export async function readCodesCookie(uid: string): Promise<string[] | null> {
  const v = (await cookies()).get(CODES_COOKIE)?.value;
  if (!v) return null;
  try {
    const j = JSON.parse(unseal(v, codesKey()));
    return j.uid === uid && j.exp > Date.now() && Array.isArray(j.codes) ? j.codes.map(String) : null;
  } catch { return null; }
}
