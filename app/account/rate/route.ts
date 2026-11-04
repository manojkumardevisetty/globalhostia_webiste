// "How did we do?" rating page (lib/cx/ratings-*). Opened from the score buttons in the email after a ticket is closed;
// works signed out. The signed token (HMAC with AUTH_SECRET) names the ticket and the client, so nobody can rate someone
// else's ticket; the score itself is the customer's choice.
//   GET  ?t=…&s=N        page with that score selected; it submits itself once (POST), so link scanners that only GET
//                        the URL never record a score. Without JavaScript the customer taps "Send rating".
//   GET  ?t=…&done=1     thank-you page: optional comment, change the score, review invitation (same for every score)
//   POST t, op=rate, s   record / change the score (1–2 stars email the owner at once); from=portal returns to the ticket
//   POST t, op=comment   optional comment
import { NextRequest, NextResponse } from 'next/server';
import { verifyRate, parseScore, type RateClaims } from '@/lib/cx/ratings-core';
import { viewFor, rate, comment, loadRatingsConfig, RateError } from '@/lib/cx/ratings-engine';
import { linkSecret } from '@/lib/reminders/store';
import { rateView, type RateState } from '@/lib/portal/views/ratings';
import { guestFrame } from '@/lib/portal/views/frame';
import { t, withLocale, parseLang, LANG_COOKIE } from '@/lib/portal/i18n';
import { sameOrigin, clientIp, auditClient } from '@/lib/portal/session';
import { limiter } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff' };
const limit = limiter(30, 10 * 60_000);
const claims = (tok: unknown): RateClaims | null => { try { return verifyRate(tok, linkSecret()); } catch { return null; } };
const BACK = /^\/account\/support\/\d{1,10}$/;

async function page(req: NextRequest, s: RateState, status = 200) {
  const lang = parseLang(req.nextUrl.searchParams.get('lang') || req.cookies.get(LANG_COOKIE)?.value);
  const html = await withLocale({ lang }, () => guestFrame({ path: '/account/rate', query: new URLSearchParams(), title: t('Rate our support'), body: rateView(s) }));
  return new NextResponse(html, { status, headers: HEADERS });
}
const go = (req: NextRequest, to: string) => { const r = NextResponse.redirect(new URL(to, req.url), 303); for (const [k, v] of Object.entries(HEADERS)) if (k !== 'content-type') r.headers.set(k, v); return r; };
const errState = (e: unknown): RateState => ({ state: e instanceof RateError ? (e.code === 'not-closed' ? 'not-closed' : 'invalid') : 'error' });
async function reviews() { const c = await loadRatingsConfig().catch(() => null); return { google: c?.googleUrl || '', trustpilot: c?.trustpilotUrl || '' }; }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tok = q.get('t');
  if (tok === 'demo') return page(req, { state: 'demo', score: parseScore(q.get('s')) });
  const c = claims(tok);
  if (!c) return page(req, { state: 'invalid' }, 400);
  let row;
  try { row = await viewFor(c); } catch (e) { return page(req, errState(e), e instanceof RateError ? 400 : 503); }
  const base = { token: tok!, tid: row.tid || String(row.ticketId), subject: row.subject };
  const ticketUrl = `/account/support/${row.ticketId}`;
  if (q.get('done') === 'comment' && row.score) return page(req, { state: 'commented', score: row.score, tid: base.tid, reviews: await reviews(), ticketUrl });
  const s = parseScore(q.get('s'));
  if (row.score && (q.get('done') === '1' || !s || s === row.score)) return page(req, { state: 'thanks', ...base, score: row.score, comment: row.comment, reviews: await reviews(), ticketUrl });
  return page(req, { state: 'confirm', ...base, score: s });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (limit(ip)) return new NextResponse('Too many requests', { status: 429 });
  if (!sameOrigin(req)) return page(req, { state: 'invalid' }, 403);
  const fd = new URLSearchParams(await req.text().catch(() => ''));
  const tok = fd.get('t');
  const c = claims(tok);
  if (!c) return page(req, { state: 'invalid' }, 400);
  const op = fd.get('op');
  const portal = fd.get('from') === 'portal';
  const back = portal && BACK.test(String(fd.get('back') || '')) ? String(fd.get('back')) : `/account/support/${c.k}`;
  const lang = parseLang(req.nextUrl.searchParams.get('lang') || req.cookies.get(LANG_COOKIE)?.value);
  const done = (d: string) => `/account/rate?t=${encodeURIComponent(tok!)}&done=${d}&lang=${lang}`;
  try {
    if (op === 'rate') {
      const s = parseScore(fd.get('s'));
      if (!s) return go(req, portal ? `${back}#cx-rate-h` : `/account/rate?t=${encodeURIComponent(tok!)}&lang=${lang}`);
      await rate(c, s, portal ? 'portal' : 'email');
      if (portal && (fd.get('comment') || '').trim()) await comment(c, String(fd.get('comment')));
      await auditClient('client_ticket_rated', `client:${c.c}`, ip, { ticket: c.k, score: s, via: portal ? 'portal' : 'link' });
      return go(req, portal ? `${back}#cx-rate-h` : done('1'));
    }
    if (op === 'comment') {
      await comment(c, String(fd.get('comment') || ''));
      return go(req, done('comment'));
    }
  } catch (e) {
    if (!(e instanceof RateError)) console.error('[cx-ratings] rate', e);
    return page(req, errState(e), e instanceof RateError ? 400 : 503);
  }
  return page(req, { state: 'invalid' }, 400);
}
