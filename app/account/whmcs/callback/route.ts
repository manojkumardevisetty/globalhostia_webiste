import { NextRequest, NextResponse } from 'next/server';
import { lt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { hmacSecret } from '@/lib/hosting/servers';
import { getClientsDetails } from '@/lib/portal/api';
import { auditClient, CLIENT_COOKIE, clientIp, cookieOpts, signClient } from '@/lib/portal/session';
import { HANDOFF_COOKIE, verifyHandoff } from '@/lib/portal/whmcs-handoff-core';
import { limit } from '@/lib/security/ratelimit';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const ORIGIN = 'https://globalhostia.com';
function response(path: string) {
  const res = NextResponse.redirect(new URL(path, ORIGIN), 303);
  res.headers.set('cache-control', 'private, no-store');
  res.headers.set('referrer-policy', 'no-referrer');
  res.headers.set('x-robots-tag', 'noindex, nofollow');
  res.cookies.set(HANDOFF_COOKIE, '', { secure: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
export async function POST(req: NextRequest) {
  const fail = failed;
  // Accept the browser POST only from the actual WHMCS host, never arbitrary sites or Origin:null.
  if (req.headers.get('origin') !== 'https://my.globalhostia.com') return fail();
  if (!(await limit('account-login', clientIp(req))).ok) return fail();
  try {
    if (Number(req.headers.get('content-length') || 0) > 4096) return fail();
    const body = await req.text(); if (body.length > 4096) return fail();
    const token = new URLSearchParams(body).get('assertion');
    const claims = verifyHandoff(token, await hmacSecret(), req.cookies.get(HANDOFF_COOKIE)?.value);
    if (!claims) return fail();
    // This existing table has a unique primary key. INSERT ... ON CONFLICT gives an atomic, cross-instance
    // replay guard; the prefix separates these assertions from OAuth client assertions. No schema change.
    const A = schema.oauthAssertions;
    const [fresh] = await db.insert(A).values({ key: `whmcs-admin:${claims.jti}`, clientId: 'whmcs-admin-portal', expiresAt: new Date((claims.exp + 120) * 1000) })
      .onConflictDoNothing().returning({ key: A.key });
    if (!fresh) return fail();
    const client = await getClientsDetails(claims.cid);
    if (Number(client.id ?? client.userid) !== claims.cid || String(client.status).toLowerCase() !== 'active' || !client.email) return fail();
    const { token: session } = await signClient({ clientId: claims.cid, email: String(client.email), name: `${client.firstname || ''} ${client.lastname || ''}`.trim(), cur: client.currency_code || 'USD' }, 15 * 60);
    const res = response('/account');
    res.cookies.set(CLIENT_COOKIE, session, { ...cookieOpts, maxAge: 15 * 60 });
    res.cookies.set('gh_in', '1', { ...cookieOpts, httpOnly: false, maxAge: 15 * 60 });
    await auditClient('client_admin_handoff', String(client.email), clientIp(req), { clientId: claims.cid, whmcsAdminId: claims.admin });
    // Keep markers beyond assertion expiry so a request already in flight cannot race cleanup. Never log the assertion or cookie.
    await db.delete(A).where(lt(A.expiresAt, new Date())).catch(() => {});
    return res;
  } catch {
    return fail(); // Database / API / configuration failures must never create a session.
  }
}
function failed() {
  const res = new NextResponse('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unable to switch accounts · GlobalHostia</title><link rel="stylesheet" href="/hp/theme.css"><body><main class="hp-container hp-section"><h1>We could not open this client account</h1><p>The sign-in link may have expired. Return to WHMCS and choose Login as Owner again.</p><p>Your current account has not been switched.</p><a class="hp-btn hp-btn--brand" href="https://my.globalhostia.com/clientarea.php">Return to WHMCS</a></main></body></html>', { status: 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'x-robots-tag': 'noindex, nofollow' } });
  res.cookies.set(HANDOFF_COOKIE, '', { secure: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
export function GET() { return failed(); }
