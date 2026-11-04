// Account → Site reports (/account/reports): the monthly "Your site report" (lib/cx) with a month picker, the same body
// as the email (embed mode), "Download PDF" (the print page: the browser saves it as PDF) and the monthly email switch.
import { card, esc, icon, t } from './kit';
import { lang } from '../i18n';
import { monthName } from '../../cx/report-email';

export type ReportsView = {
  months: string[]; month: string; current: string; body: string; stored: boolean; reportOn: boolean; emailOn: boolean;
};

export function reportsView(o: ReportsView) {
  const l = lang();
  const label = (m: string) => (m === o.current ? t('{m} (so far)', { m: monthName(m, l) }) : monthName(m, l));
  const opts = [o.current, ...o.months.filter((m) => m !== o.current)].map((m) => `<option value="${esc(m)}"${m === o.month ? ' selected' : ''}>${esc(label(m))}</option>`).join('');
  const note = o.month === o.current ? t('This month is still running: the report shows what we know so far and is final on the 1st.')
    : o.stored ? t('This is the report we emailed for this month.') : t('Built from our checks and your account today.');
  const bar = `<div class="cx-bar">
    <form method="get" action="/account/reports" class="cx-bar__f"><label for="cx-m" class="cx-bar__l">${esc(t('Month'))}</label>
      <select class="ac-input" id="cx-m" name="m">${opts}</select>
      <button class="hp-btn hp-btn--ghost ac-sm" type="submit">${esc(t('Show'))}</button></form>
    <a class="hp-btn hp-btn--dark ac-sm" href="/account/reports/print?m=${esc(o.month)}" target="_blank" rel="noopener">${icon('download')}${esc(t('Download PDF'))}</a>
  </div><p class="ac-help">${esc(note)}</p>`;
  const sw = o.emailOn
    ? (o.reportOn ? t('We email this report on the 1st of each month.') : t('The monthly email is off for your account.'))
    : t('The monthly email is not sent yet. You can always see your report here.');
  return `<style>.cx-bar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 0 8px}.cx-bar__f{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.cx-bar__l{font-weight:600;font-size:14px}.cx-bar select{min-width:200px;width:auto}.cx-rep{background:#fff;color:#222;border:1px solid #e5e5e5;border-radius:16px;padding:28px 24px;max-width:760px;font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;overflow-wrap:anywhere}.cx-rep a{color:#111}.cx-rep table{max-width:100%}@media (max-width:560px){.cx-rep{padding:20px 14px}.cx-rep .gh-kv td{display:block;width:100%!important;padding:0!important}.cx-rep .gh-kv .gh-k{padding-top:8px!important}.cx-rep .gh-kv .gh-v{padding-bottom:6px!important}}</style>
  <div class="ac-col">${bar}
    <article class="cx-rep" aria-label="${esc(t('Site report for {m}', { m: monthName(o.month, l) }))}">${o.body}</article>
    ${card(t('Monthly email'), `<p>${esc(sw)}</p><p class="ac-help"><a href="/account/settings#reminders">${esc(t('Change email choices'))}</a></p>`, { id: 'cx-email-h' })}
  </div>`;
}

/** Print / "Save as PDF" page around the full email HTML (header, body, footer of the email design). */
export function printPage(o: { html: string; title: string; lang: 'en' | 'ar' }) {
  const bar = `<div class="cx-print" role="region" aria-label="${esc(t('Print'))}"><button type="button" onclick="window.print()">${esc(t('Print or save as PDF'))}</button><a href="javascript:history.back()">${esc(t('Back'))}</a></div>`;
  const css = `<style>.cx-print{position:sticky;top:0;z-index:5;display:flex;gap:12px;justify-content:center;align-items:center;padding:12px;background:#111;font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}.cx-print button{font:600 15px/1 inherit;padding:11px 18px;border-radius:8px;border:1px solid #fff;background:#fff;color:#111;cursor:pointer}.cx-print a{color:#fff;font-size:14px}.cx-print button:focus-visible,.cx-print a:focus-visible{outline:3px solid #9ec5ff;outline-offset:2px}a{text-decoration:underline!important}@media print{.cx-print{display:none!important}body{background:#fff!important}@page{margin:12mm}}</style>`;
  return o.html.replace(/<title>[^<]*<\/title>/, `<title>${esc(o.title)}</title>`).replace('</head>', `${css}<meta name="robots" content="noindex, nofollow"></head>`).replace(/<body([^>]*)>/, `<body$1>${bar}`);
}
