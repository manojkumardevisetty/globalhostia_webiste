// Unsubscribe from reminder emails (link in every reminder; works signed out). The signed token (lib/reminders/core.ts,
// HMAC with AUTH_SECRET) names the address and the reminder type, so nobody can unsubscribe someone else.
//   GET  ?t=…                    page: choose what to stop (the email's own type preselected), one click
//   POST t=…&scope=…             form on that page (same-origin)
//   POST ?t=…&one-click=1        RFC 8058 one-click from the mail app (body "List-Unsubscribe=One-Click"; SMTP transport)
import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsub, type UnsubScope } from '@/lib/reminders/core';
import { linkSecret, suppress, setPrefs, prefsFor } from '@/lib/reminders/store';
import { unsubscribeView, type UnsubState } from '@/lib/portal/views/reminders';
import { guestFrame } from '@/lib/portal/views/frame';
import { t, withLocale, parseLang, LANG_COOKIE } from '@/lib/portal/i18n';
import { sameOrigin, clientIp, auditClient } from '@/lib/portal/session';
import { limiter } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff' };
const limit = limiter(30, 60_000);

const claims = (tok: unknown) => { try { return verifyUnsub(tok, linkSecret()); } catch { return null; } };
async function page(req: NextRequest, s: UnsubState, status = 200) {
  const lang = parseLang(req.cookies.get(LANG_COOKIE)?.value || req.nextUrl.searchParams.get('lang'));
  const html = await withLocale({ lang }, () => guestFrame({ path: '/account/unsubscribe', query: new URLSearchParams(), title: t('Email preferences'), body: unsubscribeView(s) }));
  return new NextResponse(html, { status, headers: HEADERS });
}

async function apply(email: string, clientId: number, scope: UnsubScope) {
  await suppress(email, scope);
  if (clientId) {
    // mirror it in the portal switches, so the account settings show the same thing
    const cur = await prefsFor(clientId).catch(() => null);
    if (cur) await setPrefs(clientId, email, { cartEmail: scope === 'renewal' ? cur.cartEmail : false, renewalEmail: scope === 'cart' ? cur.renewalEmail : false }, 'unsubscribe');
  }
}

export async function GET(req: NextRequest) {
  const tok = req.nextUrl.searchParams.get('t');
  const c = claims(tok);
  if (!c) return page(req, { state: 'invalid' }, 400);
  return page(req, { state: 'confirm', token: tok!, scope: c.s, email: c.e });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (limit(ip)) return new NextResponse('Too many requests', { status: 429 });
  const q = req.nextUrl.searchParams;
  const raw = await req.text().catch(() => '');
  const form = new URLSearchParams(raw);
  // RFC 8058: the mail provider POSTs "List-Unsubscribe=One-Click" to the URL from the header
  if (q.get('one-click') === '1') {
    const c = claims(q.get('t'));
    if (!c || form.get('List-Unsubscribe') !== 'One-Click') return new NextResponse('Bad request', { status: 400 });
    await apply(c.e, c.c, c.s).catch(() => {});
    await auditClient('reminder_unsubscribe', c.e, ip, { scope: c.s, via: 'one-click' });
    return new NextResponse('Unsubscribed', { status: 200, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
  }
  if (!sameOrigin(req)) return page(req, { state: 'invalid' }, 403);
  const tok = form.get('t');
  const c = claims(tok);
  if (!c) return page(req, { state: 'invalid' }, 400);
  const s = form.get('scope');
  const scope: UnsubScope = s === 'cart' || s === 'renewal' || s === 'all' ? s : c.s;
  try { await apply(c.e, c.c, scope); } catch { return page(req, { state: 'error', token: tok!, scope, email: c.e }, 503); }
  await auditClient('reminder_unsubscribe', c.e, ip, { scope, via: 'page' });
  return page(req, { state: 'done', scope, email: c.e });
}
