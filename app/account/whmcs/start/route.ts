// The portal supplies the browser challenge; a WHMCS session alone never becomes a portal session.
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { HANDOFF_COOKIE, HANDOFF_TTL } from '@/lib/portal/whmcs-handoff-core';
export const dynamic = 'force-dynamic';
export function GET() {
  const state = randomBytes(32).toString('base64url');
  const to = new URL('https://my.globalhostia.com/clientarea.php');
  to.searchParams.set('gh_portal_state', state);
  const res = NextResponse.redirect(to, 303);
  res.cookies.set(HANDOFF_COOKIE, state, { secure: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: HANDOFF_TTL });
  res.headers.set('cache-control', 'private, no-store');
  res.headers.set('referrer-policy', 'no-referrer');
  res.headers.set('x-robots-tag', 'noindex, nofollow');
  return res;
}
