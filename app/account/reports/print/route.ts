// Print / "Download PDF" page of a monthly site report (/account/reports/print?m=YYYY-MM): the full email design (header,
// report, footer) on its own page with a print button; the browser's "Save as PDF" makes the file. No server-side PDF
// renderer (a headless browser per request would be slow and costly on Vercel).
import { NextRequest, NextResponse } from 'next/server';
import { readClient } from '@/lib/portal/session';
import { withLocale } from '@/lib/portal/i18n';
import { t } from '@/lib/portal/views/kit';
import { printPage } from '@/lib/portal/views/reports';
import { reportFor, issueTitle, siteUrl } from '@/lib/cx/report-engine';
import { reportEmail, monthName } from '@/lib/cx/report-email';
import { MONTH_RE } from '@/lib/cx/report-core';
import { composeFull } from '@/lib/reminders/send';
import { localeOf, monthsFor } from '@/lib/cx/reports-portal';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' };

export async function GET(req: NextRequest) {
  const loc = localeOf(req);
  return withLocale(loc, async () => {
    const sess = await readClient(req);
    const m = String(req.nextUrl.searchParams.get('m') || '');
    if (!sess) return NextResponse.redirect(new URL('/account/login?next=' + encodeURIComponent(`/account/reports${m ? `?m=${m}` : ''}`), req.url), 303);
    const { current, months } = await monthsFor(sess.clientId);
    if (!MONTH_RE.test(m) || !(m === current || months.includes(m))) return NextResponse.redirect(new URL('/account/reports', req.url), 303);
    try {
      const r = await reportFor(sess.clientId, m);
      const mail = reportEmail({ lang: loc.lang, data: r.data, site: await siteUrl(), issueTitle: issueTitle(loc.lang) });
      const html = printPage({ html: composeFull(mail.html, { lang: loc.lang }), title: `${t('Site report')} ${monthName(m, loc.lang)} · GlobalHostia`, lang: loc.lang });
      return new NextResponse(html, { headers: HEADERS });
    } catch (e: any) {
      console.error('[cx-report] print', sess.clientId, m, e?.message || e);
      return NextResponse.redirect(new URL(`/account/reports?m=${m}`, req.url), 303);
    }
  });
}
