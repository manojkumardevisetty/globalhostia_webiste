// Resume an OAuth authorization after sign-in: /oauth/authorize parked the signed request in an HttpOnly cookie and
// sent the customer to /account/login?next=/account/apps/authorize. Back here, continue at /oauth/authorize?r=….
import { NextRequest, NextResponse } from 'next/server';
import { PENDING_COOKIE } from '@/lib/oauth/http';

export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const r = req.cookies.get(PENDING_COOKIE)?.value || '';
  const to = /^[A-Za-z0-9_-]{70,6000}$/.test(r) ? `/oauth/authorize?r=${r}` : '/account/apps';
  const res = NextResponse.redirect(new URL(to, req.url), 303);
  res.headers.set('cache-control', 'no-store');
  res.cookies.set(PENDING_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
