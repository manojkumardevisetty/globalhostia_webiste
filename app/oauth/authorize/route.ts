// OAuth 2.1 authorization endpoint with the GlobalHostia consent page.
// GET  validates the request (client via DCR or Client ID Metadata Document, exact redirect URI, PKCE S256, scopes,
//      RFC 8707 resource), then: not signed in → the portal sign-in page (the request waits in a 15-minute HttpOnly
//      cookie and resumes at /account/apps/authorize); signed in → consent page.
// POST (consent form, same origin + CSRF bound to the portal session) issues a one-time code, or access_denied.
// Errors that can be sent back to the app go to its redirect URI with state and iss (RFC 9207); anything else
// (unknown client, bad redirect URI) is shown here and never redirected.
import { NextRequest, NextResponse } from 'next/server';
import {
  PKCE_CHALLENGE, SCOPES, classifyRedirect, parseScope, profileForResource, redirectMatches, resourceFor, signRequest, verifyRequest, type AuthRequest,
} from '@/lib/oauth/core';
import { OAuthError, createGrantAndCode, findClient, type Client } from '@/lib/oauth/store';
import { PENDING_COOKIE, baseUrl } from '@/lib/oauth/http';
import { connectorConfig } from '@/lib/connector/config';
import { consentBody, consentError } from '@/lib/connector/consent-view';
import { auditClient, clientIp, csrfFor, csrfOk, readClient, sameOrigin } from '@/lib/portal/session';
import { frame } from '@/lib/portal/views/frame';
import { withLocale, parseLang, parseDigits, LANG_COOKIE, DIGITS_COOKIE } from '@/lib/portal/i18n';
import { t } from '@/lib/portal/views/kit';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REQ_TTL_S = 15 * 60;
const HEADERS = { 'cache-control': 'no-store', 'content-security-policy': "frame-ancestors 'none'", 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'same-origin' };
const secret = () => process.env.AUTH_SECRET || '';
const localeOf = (req: NextRequest) => ({ lang: parseLang(req.cookies.get(LANG_COOKIE)?.value), digits: parseDigits(req.cookies.get(DIGITS_COOKIE)?.value) });

const page = async (req: NextRequest, title: string, body: string, status = 200) => {
  const sess = await readClient(req);
  const html = sess
    ? await frame({ path: '/oauth/authorize', query: new URLSearchParams(), title, active: 'settings', viewer: { name: sess.name, email: sess.email, clientId: sess.clientId, csrf: csrfFor(sess.jti) }, body,
      crumbs: [{ label: t('App & notifications'), href: '/account/settings' }, { label: t('Connected apps'), href: '/account/apps' }, { label: title }] })
    : `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px">${body}</body>`;
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...HEADERS } });
};
const errorPage = (req: NextRequest, detail: string, status = 400) => page(req, t('This connection request cannot be used'), consentError(t('This connection request cannot be used'), detail), status);

/** Send the result back to the app (code or error), with state and the issuer (RFC 9207). */
function back(redirectUri: string, params: Record<string, string | undefined>, iss: string) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries({ ...params, iss })) if (v !== undefined) u.searchParams.set(k, v);
  const r = NextResponse.redirect(u.toString(), 303);
  for (const [k, v] of Object.entries(HEADERS)) r.headers.set(k, v);
  r.cookies.set(PENDING_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return r;
}

type Checked = { ok: true; client: Client; req: AuthRequest } | { ok: false; res: NextResponse | Promise<NextResponse> };

/** Validate the raw authorize parameters. */
async function check(req: NextRequest, q: URLSearchParams, base: string): Promise<Checked> {
  const cfg = await connectorConfig();
  let client: Client | null;
  try { client = await findClient(q.get('client_id')); }
  catch (e) {
    console.warn('[oauth] authorize: client lookup failed', String(q.get('client_id')).slice(0, 200), e instanceof OAuthError ? e.message : e);
    return { ok: false, res: errorPage(req, e instanceof OAuthError ? `${t('The app could not be identified')}: ${e.message}` : t('The app could not be identified.')) };
  }
  if (!client || client.disabled) return { ok: false, res: errorPage(req, t('The app asking for access is not registered or has been blocked.')) };
  const redirectUri = q.get('redirect_uri') || '';
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return { ok: false, res: errorPage(req, t('The return address of this request does not match the app’s registration.')) };
  const cls = classifyRedirect(redirectUri);
  if (!cls.ok) return { ok: false, res: errorPage(req, cls.reason) };
  if (cfg.blockUnknownRedirects && cls.flagged) return { ok: false, res: errorPage(req, t('Only Claude, ChatGPT and local apps can connect to GlobalHostia right now.'), 403) };
  // from here on, errors go back to the app
  const state = q.get('state') ?? undefined;
  if (state && state.length > 1024) return { ok: false, res: errorPage(req, 'state is too long') };
  const fail = (error: string, description: string) => ({ ok: false as const, res: back(redirectUri, { error, error_description: description, state }, base) });
  if (!cfg.enabled) return fail('temporarily_unavailable', 'GlobalHostia has paused new connections. Please try again later.');
  if (q.get('response_type') !== 'code') return fail('unsupported_response_type', 'response_type must be code');
  const cc = q.get('code_challenge') || '';
  if (q.get('code_challenge_method') !== 'S256' || !PKCE_CHALLENGE.test(cc)) return fail('invalid_request', 'PKCE is required: code_challenge (43 base64url characters) with code_challenge_method=S256');
  const sc = parseScope(q.get('scope'));
  if (!sc.ok) return fail('invalid_scope', `Unknown scope: ${sc.unknown.join(' ').slice(0, 200)}`);
  let resource = q.get('resource');
  if (resource) { if (!profileForResource(base, resource)) return fail('invalid_target', `resource must be ${resourceFor(base, 'claude')} or ${resourceFor(base, 'chatgpt')}`); }
  else resource = resourceFor(base, client.platform === 'chatgpt' ? 'chatgpt' : 'claude');
  return { ok: true, client, req: { cid: client.id, ru: redirectUri, st: state, cc, sc: sc.scopes, rs: resourceFor(base, profileForResource(base, resource)!), exp: Math.floor(Date.now() / 1000) + REQ_TTL_S } };
}

export async function GET(req: NextRequest) {
  { const blocked = await guard(req, 'oauth'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  return withLocale(localeOf(req), async () => {
    const base = baseUrl(req);
    const q = req.nextUrl.searchParams;
    if (secret().length < 32) return errorPage(req, 'Sign-in is not configured.', 503);
    let r: AuthRequest | null, client: Client | null;
    if (q.has('r')) {
      r = verifyRequest(q.get('r'), secret());
      if (!r) return errorPage(req, t('This connection request has expired. Start the connection again from your assistant.'));
      client = await findClient(r.cid).catch(() => null);
      if (!client || client.disabled) return errorPage(req, t('The app asking for access is not registered or has been blocked.'));
    } else {
      const c = await check(req, q, base);
      if (!c.ok) return c.res;
      r = c.req; client = c.client;
    }
    const blob = signRequest(r, secret());
    const sess = await readClient(req);
    if (!sess) {
      const res = NextResponse.redirect(new URL('/account/login?next=' + encodeURIComponent('/account/apps/authorize'), req.url), 303);
      res.cookies.set(PENDING_COOKIE, blob, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: REQ_TTL_S });
      for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
      return res;
    }
    const cls = classifyRedirect(r.ru);
    const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };
    const body = consentBody({
      appName: client.name, appHost: client.kind === 'cimd' ? host(client.id) : client.clientUri ? host(client.clientUri) : '',
      platform: client.platform as any, returnHost: host(r.ru), loopbackOnly: client.redirectUris.every((u) => { const c = classifyRedirect(u); return c.ok && c.kind === 'loopback'; }),
      flagged: client.flagged || (cls.ok && cls.flagged), scopes: r.sc.filter((s) => SCOPES[s]),
      viewer: { name: sess.name, email: sess.email, clientId: sess.clientId }, csrf: csrfFor(sess.jti), r: blob, endpoint: r.rs,
    });
    return page(req, t('Connect {a}', { a: client.name }), body);
  });
}

export async function POST(req: NextRequest) {
  { const blocked = await guard(req, 'oauth'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  return withLocale(localeOf(req), async () => {
    const base = baseUrl(req);
    let fd: FormData;
    try { fd = await req.formData(); } catch { return errorPage(req, 'Bad request'); }
    const sess = await readClient(req);
    if (!sess) return NextResponse.redirect(new URL('/account/login', req.url), 303);
    const ip = clientIp(req);
    if (!sameOrigin(req) || !csrfOk(sess.jti, fd.get('csrf'))) {
      await auditClient('client_csrf_rejected', sess.email, ip, { path: '/oauth/authorize' });
      return errorPage(req, t('Your session form expired. Please try again.'), 403);
    }
    const r = verifyRequest(fd.get('r'), secret());
    if (!r) return errorPage(req, t('This connection request has expired. Start the connection again from your assistant.'));
    const client = await findClient(r.cid).catch(() => null);
    if (!client || client.disabled || !redirectMatches(client.redirectUris, r.ru)) return errorPage(req, t('The app asking for access is not registered or has been blocked.'));
    const cfg = await connectorConfig();
    if (fd.get('decision') !== 'allow') {
      await auditClient('oauth_denied', sess.email, ip, { clientId: sess.clientId, app: client.id, platform: client.platform });
      return back(r.ru, { error: 'access_denied', error_description: 'The customer declined the request', state: r.st }, base);
    }
    if (!cfg.enabled) return back(r.ru, { error: 'temporarily_unavailable', error_description: 'Connections are paused', state: r.st }, base);
    const picked = fd.getAll('scope').map(String).filter((s) => r.sc.includes(s));
    if (!picked.length) return back(r.ru, { error: 'access_denied', error_description: 'No permissions were approved', state: r.st }, base);
    const { code, grantId } = await createGrantAndCode({ clientId: client.id, cid: sess.clientId, email: sess.email, scopes: picked, resource: r.rs, redirectUri: r.ru, codeChallenge: r.cc });
    await auditClient('oauth_consent', sess.email, ip, { clientId: sess.clientId, app: client.id, appName: client.name, platform: client.platform, grant: grantId, scopes: picked, resource: r.rs });
    return back(r.ru, { code, state: r.st }, base);
  });
}
