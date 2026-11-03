// Account → Connected apps (/account/apps): AI assistants (Claude, ChatGPT, …) connected to this account through the
// connector, with their permissions and last use, and Disconnect (revokes the grant and every token at once).
// A sibling of the portal catch-all route, using the same session, CSRF, frame and audit helpers.
import { NextRequest, NextResponse } from 'next/server';
import { auditClient, clientIp, csrfFor, csrfOk, readClient, sameOrigin } from '@/lib/portal/session';
import { frame } from '@/lib/portal/views/frame';
import { card, empty, esc, icon, t, fmtDate } from '@/lib/portal/views/kit';
import { withLocale, parseLang, parseDigits, LANG_COOKIE, DIGITS_COOKIE } from '@/lib/portal/i18n';
import { customerGrants, revokeGrant, type GrantRow } from '@/lib/oauth/store';
import { SCOPES, PLATFORM_LABEL } from '@/lib/oauth/core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEADERS = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'same-origin', 'content-security-policy': "frame-ancestors 'none'" };
const localeOf = (req: NextRequest) => ({ lang: parseLang(req.cookies.get(LANG_COOKIE)?.value), digits: parseDigits(req.cookies.get(DIGITS_COOKIE)?.value) });
const go = (req: NextRequest, to: string) => { const r = NextResponse.redirect(new URL(to, req.url), 303); for (const [k, v] of Object.entries(HEADERS)) r.headers.set(k, v); return r; };

function appsView(rows: GrantRow[] | null, csrf: string) {
  const intro = `<p class="ac-muted">${esc(t('AI assistants you connected to your account. Each one can only do what you approved, and every change is recorded. Disconnecting removes its access immediately.'))} <a href="/connectors">${esc(t('How connectors work'))}</a></p>`;
  if (rows === null) return card(t('Connected apps'), `${intro}<p class="ac-alert ac-alert--warn">${esc(t('We could not load your connected apps right now. Please reload the page.'))}</p>`, { id: 'ac-apps-h' });
  if (!rows.length) return card(t('Connected apps'), intro + empty(t('No apps connected'), t('Connect GlobalHostia in Claude or ChatGPT to manage your account by chat.'), `<a class="hp-btn hp-btn--dark" href="/connectors">${esc(t('Set up a connector'))}</a>`, 'plug'), { id: 'ac-apps-h' });
  const items = rows.map((g) => {
    const perms = g.scopes.filter((s) => SCOPES[s]);
    const plat = PLATFORM_LABEL[(g.platform in PLATFORM_LABEL ? g.platform : 'other') as keyof typeof PLATFORM_LABEL];
    return `<li class="ac-app">
      <div class="ac-app__head"><span class="ac-app__logo" aria-hidden="true">${esc((g.name || '?').trim()[0]?.toUpperCase() || '?')}</span>
        <div><b>${esc(g.name || t('Unnamed app'))}</b><small class="ac-muted">${esc(t(plat))}${g.flagged ? ` · ${esc(t('not Claude or ChatGPT'))}` : ''}</small></div>
        <form method="post" action="/account/apps" class="ac-inline" onsubmit="return confirm(${esc(JSON.stringify(t('Disconnect this app? It loses access immediately.')))})">
          <input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="op" value="revoke"><input type="hidden" name="id" value="${esc(g.id)}">
          <button class="hp-btn hp-btn--ghost ac-sm" type="submit">${icon('x')}${esc(t('Disconnect'))}</button></form></div>
      <p class="ac-app__meta">${esc(t('Connected {d}', { d: fmtDate(g.createdAt.toISOString()) }))} · ${esc(g.lastUsedAt ? t('last used {d}', { d: fmtDate(g.lastUsedAt.toISOString()) }) : t('not used yet'))} · ${esc(t('expires {d}', { d: fmtDate(g.expiresAt.toISOString()) }))}</p>
      <ul class="ac-app__perms">${perms.map((s) => `<li class="${SCOPES[s].write ? 'is-w' : ''}">${esc(t(SCOPES[s].label))}</li>`).join('')}</ul>
    </li>`;
  }).join('');
  return `<style>.ac-apps{list-style:none;margin:0;padding:0}.ac-app{border-top:1px solid #eef0f3;padding:16px 0}.ac-app:first-child{border-top:0}
    .ac-app__head{display:flex;gap:12px;align-items:center}.ac-app__head>div{flex:1;min-width:0}.ac-app__head small{display:block}
    .ac-app__logo{width:40px;height:40px;border-radius:10px;background:#16212b;color:#fff;display:grid;place-items:center;font-weight:800;flex:none}
    .ac-app__meta{margin:8px 0 6px;color:#5b6573;font-size:.92em}.ac-app__perms{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}
    .ac-app__perms li{font-size:.85em;background:#f2f4f7;border-radius:999px;padding:3px 10px}.ac-app__perms li.is-w{background:#fdf0f5;color:#8a1c4f}</style>`
    + card(t('Connected apps'), `${intro}<ul class="ac-apps">${items}</ul>`, { id: 'ac-apps-h' });
}

export async function GET(req: NextRequest) {
  return withLocale(localeOf(req), async () => {
    const sess = await readClient(req);
    if (!sess) return go(req, '/account/login?next=' + encodeURIComponent('/account/apps'));
    const rows = await customerGrants(sess.clientId).catch((e) => { console.error('[account/apps]', e); return null; });
    const v = { name: sess.name, email: sess.email, clientId: sess.clientId, csrf: csrfFor(sess.jti) };
    const html = await frame({ path: '/account/apps', query: req.nextUrl.searchParams, title: t('Connected apps'), sub: esc(t('AI assistants and other apps with access to your account.')), active: 'settings', viewer: v,
      crumbs: [{ label: t('App & notifications'), href: '/account/settings' }, { label: t('Connected apps') }], body: appsView(rows, v.csrf) });
    return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...HEADERS } });
  });
}

export async function POST(req: NextRequest) {
  const sess = await readClient(req);
  if (!sess) return go(req, '/account/login');
  let fd: FormData;
  try { fd = await req.formData(); } catch { return go(req, '/account/apps?err=failed'); }
  const ip = clientIp(req);
  if (!sameOrigin(req) || !csrfOk(sess.jti, fd.get('csrf'))) { await auditClient('client_csrf_rejected', sess.email, ip, { path: '/account/apps' }); return go(req, '/account/apps?err=csrf'); }
  const id = String(fd.get('id') || '');
  if (fd.get('op') !== 'revoke' || !/^[a-z0-9]{10,40}$/.test(id)) return go(req, '/account/apps?err=failed');
  const ok = await revokeGrant(id, `customer:${sess.email}`, sess.clientId).catch(() => false);
  await auditClient(ok ? 'oauth_revoked' : 'oauth_revoke_failed', sess.email, ip, { clientId: sess.clientId, grant: id });
  return go(req, ok ? '/account/apps?ok=removed' : '/account/apps?err=failed');
}
