// Account → Domain health (/account/health): every domain on the account with its daily check result, the details of
// one domain (?d=example.com), and the fixes: "Re-check now" (rate limited), "Issue free SSL" (the hosting panel's
// issue path, same as the connector's issue_ssl tool), "DNS / website elsewhere on purpose". Alert emails link here.
// A sibling of the portal catch-all route, using the same session, CSRF, frame and audit helpers.
import { NextRequest, NextResponse } from 'next/server';
import { auditClient, clientIp, csrfFor, csrfOk, readClient, sameOrigin } from '@/lib/portal/session';
import { frame } from '@/lib/portal/views/frame';
import { esc, t } from '@/lib/portal/views/kit';
import { withLocale, parseLang, parseDigits, LANG_COOKIE, DIGITS_COOKIE } from '@/lib/portal/i18n';
import { healthPage, healthFlash } from '@/lib/portal/views/health';
import { rowsFor, rowFor, recheck, setExternal, issueSslFor, healthPrefs, SslUnavailable } from '@/lib/health/engine';
import { limiter } from '@/lib/agents/http';
import { PanelError } from '@/lib/hosting/types';
import { publicPanelError } from '@/lib/ux/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const HEADERS = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' };
const localeOf = (req: NextRequest) => ({ lang: parseLang(req.cookies.get(LANG_COOKIE)?.value), digits: parseDigits(req.cookies.get(DIGITS_COOKIE)?.value) });
const go = (req: NextRequest, to: string) => { const r = NextResponse.redirect(new URL(to, req.url), 303); for (const [k, v] of Object.entries(HEADERS)) r.headers.set(k, v); return r; };
const DOMAIN = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** Re-checks: 6 per client per 10 minutes, and a domain checked in the last minute is shown as is. SSL issue: 5 per hour. */
const recheckLimit = limiter(6, 10 * 60_000);
const sslLimit = limiter(5, 60 * 60_000);
const toggleLimit = limiter(20, 10 * 60_000);
const safeBack = (b: unknown, d: string) => (typeof b === 'string' && /^\/account\/(health(\?d=[a-z0-9.%-]+)?|domains\/\d{1,10})(#[a-z-]+)?$/i.test(b) ? b : `/account/health?d=${encodeURIComponent(d)}`);
const withQ = (back: string, q: string) => { const [p, h] = back.split('#'); return `${p}${p.includes('?') ? '&' : '?'}${q}${h ? `#${h}` : '#health'}`; };

export async function GET(req: NextRequest) {
  return withLocale(localeOf(req), async () => {
    const sess = await readClient(req);
    const q = req.nextUrl.searchParams;
    if (!sess) return go(req, '/account/login?next=' + encodeURIComponent('/account/health' + (q.get('d') ? `?d=${q.get('d')}` : '')));
    const d = String(q.get('d') || '').trim().toLowerCase();
    const [rows, prefs] = await Promise.all([rowsFor(sess.clientId).catch(() => []), healthPrefs(sess.clientId).catch(() => ({ alerts: true }))]);
    const selected = d && DOMAIN.test(d) ? rows.find((r) => r.domain === d) || null : null;
    const flash = healthFlash(q.get('ok') || q.get('err'));
    const v = { name: sess.name, email: sess.email, clientId: sess.clientId, csrf: csrfFor(sess.jti) };
    const view = healthPage(rows, v.csrf, { selected, fixTarget: q.get('fix') === 'ssl' ? 'ssl' : undefined, flash, prefsOff: !prefs.alerts });
    const crumbs = [{ label: t('Domains'), href: '/account/domains' }, ...(selected ? [{ label: t('Domain health'), href: '/account/health' }, { label: selected.domain }] : [{ label: t('Domain health') }])];
    const html = await frame({ path: '/account/health', query: q, title: selected ? selected.domain : t('Domain health'), sub: esc(view.sub), active: 'domains', viewer: v, crumbs, body: view.body });
    return new NextResponse(html, { status: d && !selected ? 404 : 200, headers: { 'content-type': 'text/html; charset=utf-8', ...HEADERS } });
  });
}

export async function POST(req: NextRequest) {
  return withLocale(localeOf(req), async () => {
    const sess = await readClient(req);
    if (!sess) return go(req, '/account/login?next=/account/health');
    let fd: FormData;
    try { fd = await req.formData(); } catch { return go(req, '/account/health?err=hfailed'); }
    const ip = clientIp(req);
    if (!sameOrigin(req) || !csrfOk(sess.jti, fd.get('csrf'))) { await auditClient('client_csrf_rejected', sess.email, ip, { path: '/account/health' }); return go(req, '/account/health?err=hfailed'); }
    const cid = sess.clientId;
    const d = String(fd.get('d') || '').trim().toLowerCase();
    const back = safeBack(fd.get('back'), d);
    if (!DOMAIN.test(d)) return go(req, '/account/health?err=hfailed');
    const row = await rowFor(cid, d).catch(() => null);
    if (!row) return go(req, '/account/health'); // not this client's domain
    const op = String(fd.get('op') || '');
    if (op === 'recheck') {
      if (row.lastChecked && Date.now() - row.lastChecked < 60_000) return go(req, withQ(back, 'ok=recent'));
      if (recheckLimit(`c${cid}`)) return go(req, withQ(back, 'err=rate'));
      const r = await recheck(cid, d).catch((e) => { console.error('[health] recheck', d, e?.message || e); return null; });
      await auditClient('client_health_recheck', sess.email, ip, { domain: d, status: r?.status });
      return go(req, withQ(back, r ? 'ok=rechecked' : 'err=hfailed'));
    }
    if (op === 'ssl') {
      if (sslLimit(`c${cid}`)) return go(req, withQ(back, 'err=rate'));
      try {
        const msg = await issueSslFor(cid, d);
        await auditClient('client_health_ssl', sess.email, ip, { domain: d, result: String(msg || '').slice(0, 200) });
        return go(req, withQ(back, 'ok=ssl'));
      } catch (e) {
        // fixed texts only (nothing from the query string is shown): "not possible here" vs "the panel failed"
        const code = e instanceof SslUnavailable ? 'ssl_unavailable' : 'ssl_failed';
        if (e instanceof PanelError && e.status >= 500) console.error('[health] ssl', d, publicPanelError(e.status, e.message).code, e.message);
        await auditClient('client_health_ssl_failed', sess.email, ip, { domain: d, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
        return go(req, withQ(back, `err=${code}`));
      }
    }
    if (op === 'external') {
      if (toggleLimit(`c${cid}`)) return go(req, withQ(back, 'err=rate'));
      const on = fd.get('on') === '1';
      await setExternal(cid, d, on).catch(() => false);
      await auditClient('client_health_external', sess.email, ip, { domain: d, on });
      return go(req, withQ(back, on ? 'ok=external_on' : 'ok=external_off'));
    }
    return go(req, '/account/health?err=hfailed');
  });
}
