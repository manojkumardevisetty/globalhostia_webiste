// Account → Site reports (/account/reports?m=YYYY-MM): the monthly site report (lib/cx/report-*) for any month we have
// data for. A month that was emailed shows the stored report (exactly what was sent); other months are built from our
// checks and the account now. A sibling of the portal catch-all route, using the same session and frame.
import { NextRequest, NextResponse } from 'next/server';
import { readClient, csrfFor } from '@/lib/portal/session';
import { frame } from '@/lib/portal/views/frame';
import { esc, t } from '@/lib/portal/views/kit';
import { withLocale } from '@/lib/portal/i18n';
import { localeOf, monthsFor } from '@/lib/cx/reports-portal';
import { reportsView } from '@/lib/portal/views/reports';
import { reportFor, reportOn, loadReportConfig, issueTitle, siteUrl } from '@/lib/cx/report-engine';
import { reportEmail } from '@/lib/cx/report-email';
import { MONTH_RE } from '@/lib/cx/report-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const HEADERS = { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' };
export async function GET(req: NextRequest) {
  const loc = localeOf(req);
  return withLocale(loc, async () => {
    const sess = await readClient(req);
    const q = req.nextUrl.searchParams;
    if (!sess) return NextResponse.redirect(new URL('/account/login?next=' + encodeURIComponent('/account/reports' + (q.get('m') ? `?m=${q.get('m')}` : '')), req.url), 303);
    const { current, months } = await monthsFor(sess.clientId);
    const want = String(q.get('m') || '');
    const month = MONTH_RE.test(want) && (want === current || months.includes(want)) ? want : months[0] || current;
    const v = { name: sess.name, email: sess.email, clientId: sess.clientId, csrf: csrfFor(sess.jti) };
    let body: string, stored = false, status = 200;
    try {
      const r = await reportFor(sess.clientId, month);
      stored = r.stored;
      body = reportEmail({ lang: loc.lang, data: r.data, site: await siteUrl(), issueTitle: issueTitle(loc.lang), embed: true }).html;
    } catch (e: any) {
      console.error('[cx-report] portal', sess.clientId, month, e?.message || e);
      body = `<p role="alert">${esc(t('We could not build this report right now. Please try again in a moment.'))}</p>`;
      status = 503;
    }
    const [cfg, on] = await Promise.all([loadReportConfig().catch(() => null), reportOn(sess.email)]);
    const html = await frame({ path: '/account/reports', query: q, title: t('Site reports'), sub: esc(t('A monthly summary of your sites: checks, SSL, email settings, backups, usage and renewals.')), active: 'reports', viewer: v,
      body: reportsView({ months, month, current, body, stored, reportOn: on, emailOn: !!cfg?.enabled }) });
    return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...HEADERS } });
  });
}
