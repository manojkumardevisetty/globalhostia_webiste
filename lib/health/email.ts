// Domain health alert email in the GlobalHostia black-and-white "v2-mono" look (same table markup and gh-* classes as
// lib/reminders/email.ts, so the global email CSS for dark mode and mobile applies). One digest per customer: the
// problems grouped by domain, most urgent first, each with a plain-language explanation and one fix button; plus
// optional "fixed" lines. Pure (no imports): the caller passes the copy from lib/health/core.ts issueCopy().

export type Lang = 'en' | 'ar';
export type AlertLine = { domain: string; sev: 'critical' | 'warning' | 'info'; title: string; explain: string; fix: { href: string; label: string } | null; record?: { name: string; value: string } | null };
export type FixedLine = { domain: string; title: string };
export type Footer = { unsubUrl: string; prefsUrl: string; why: string };
export type HealthMail = { lang: Lang; name: string; alerts: AlertLine[]; fixed: FixedLine[]; footer: Footer; panelUrl: string };

const FONT_HEAD = `Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_BODY = `Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const C = { ink: '#222222', deep: '#111111', tint: '#f5f5f5', line: '#e5e5e5', muted: '#666666' };
/** HTML escape that is also safe in WHMCS (Smarty) bodies: no raw braces. */
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const url = (u: string) => (/^https:\/\//i.test(u) ? esc(u) : '#');

const L = {
  en: {
    hi: 'Hi {n},', there: 'there',
    subjOne: '{t}: {d}', subjMany: '{n} problems found on your domains', subjCrit: 'Urgent: {n} problems found on your domains', subjFixed: 'Fixed: {d} is healthy again', subjFixedMany: 'Fixed: {n} problems on your domains',
    intro: 'Our daily check of your domains found something that needs your attention. Each item says what is wrong, why it matters and how to fix it.',
    introFixed: 'Good news: the problems we told you about are fixed. No action needed.',
    urgent: 'Urgent', attention: 'Needs attention', fixedH: 'Fixed since our last email', addRecord: 'Record to add', name: 'Name', value: 'Value',
    panel: 'See all checks', note: 'We check every domain on your account once a day. You only hear from us when something new goes wrong or gets worse.',
    unsub: 'Unsubscribe', prefs: 'Email preferences', stop: 'Don’t want these alerts?',
  },
  ar: {
    hi: 'مرحبًا {n}،', there: 'بك',
    subjOne: '{t}: {d}', subjMany: 'وجدنا {n} مشكلات في نطاقاتك', subjCrit: 'عاجل: وجدنا {n} مشكلات في نطاقاتك', subjFixed: 'تم الإصلاح: {d} يعمل بشكل سليم مجددًا', subjFixedMany: 'تم إصلاح {n} مشكلات في نطاقاتك',
    intro: 'وجد فحصنا اليومي لنطاقاتك أمرًا يحتاج إلى انتباهك. يوضح كل بند ما الخطأ ولماذا يهم وكيف تصلحه.',
    introFixed: 'أخبار جيدة: تم إصلاح المشكلات التي أبلغناك بها. لا حاجة لأي إجراء.',
    urgent: 'عاجل', attention: 'يحتاج إلى انتباه', fixedH: 'تم إصلاحه منذ رسالتنا الأخيرة', addRecord: 'السجل المطلوب إضافته', name: 'الاسم', value: 'القيمة',
    panel: 'اعرض كل الفحوصات', note: 'نفحص كل نطاق في حسابك مرة يوميًا. لن تصلك رسالة إلا عند ظهور مشكلة جديدة أو تفاقمها.',
    unsub: 'إلغاء الاشتراك', prefs: 'تفضيلات البريد', stop: 'لا تريد هذه التنبيهات؟',
  },
} as const;
const lbl = (l: Lang, k: keyof (typeof L)['en'], v: Record<string, string | number> = {}) => String(L[l][k]).replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));

function button(href: string, text: string, ghost = false): string {
  const bg = ghost ? '#ffffff' : '#111111', fg = ghost ? '#111111' : '#ffffff';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="${ghost ? 'gh-btn2' : 'gh-btn'}" style="border-collapse:separate;"><tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid #111111;border-radius:8px;mso-padding-alt:10px 18px;"><a href="${url(href)}" target="_blank" style="display:inline-block;padding:10px 18px;font-family:${FONT_BODY};font-size:14px;font-weight:600;line-height:1.2;color:${fg};text-decoration:none;border-radius:8px;white-space:nowrap;"><span class="gh-gm-s"><span class="gh-gm-d">${esc(text)}</span></span></a></td></tr></table>`;
}
const h1 = (s: string) => `<h1 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:26px;line-height:1.25;font-weight:800;color:${C.deep};">${esc(s)}</h1>`;
const p = (html: string, small = false) => `<p${small ? ' class="gh-small"' : ''} style="margin:0 0 16px;${small ? `font-size:13px;line-height:1.55;color:${C.muted};` : ''}">${html}</p>`;
const preheader = (s: string) => `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${esc(s)}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>`;
const badge = (s: string, strong: boolean) => `<span class="gh-badge" style="display:inline-block;padding:2px 9px;border-radius:999px;${strong ? 'background-color:#111111;color:#ffffff;' : `background-color:#eeeeee;color:${C.deep};`}font-size:11px;font-weight:700;letter-spacing:.02em;">${esc(s)}</span>`;

function domainPanel(domain: string, rows: AlertLine[], l: Lang): string {
  const start = l === 'ar' ? 'right' : 'left';
  const items = rows.map((r, i) => {
    const rec = r.record ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px;"><tr><td class="gh-mono" style="padding:8px 10px;background-color:#ffffff;border:1px solid ${C.line};border-radius:6px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:${C.deep};word-break:break-all;text-align:left;direction:ltr;">TXT &nbsp;${esc(r.record.name)}<br>${esc(r.record.value)}</td></tr></table>` : '';
    return `<tr><td style="padding:14px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${start};">
      <div style="margin:0 0 6px;">${badge(lbl(l, r.sev === 'critical' ? 'urgent' : 'attention'), r.sev === 'critical')}</div>
      <div class="gh-v" style="font-size:16px;font-weight:700;color:${C.deep};line-height:1.35;margin:0 0 4px;">${esc(r.title)}</div>
      <div class="gh-muted" style="font-size:14px;line-height:1.55;color:${C.ink};margin:0 0 ${r.fix ? '10px' : '0'};">${esc(r.explain)}</div>${rec}
      ${r.fix ? button(r.fix.href, r.fix.label) : ''}</td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 18px;"><tr><td style="padding:12px 20px 6px;">
    <div class="gh-k" style="font-family:${FONT_HEAD};font-size:13px;font-weight:800;letter-spacing:.04em;color:${C.muted};text-transform:uppercase;direction:ltr;text-align:${start};padding:4px 0 2px;">${esc(domain)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table></td></tr></table>`;
}

export function healthEmail(m: HealthMail): { subject: string; html: string; text: string } {
  const l = m.lang, rtl = l === 'ar';
  const crit = m.alerts.filter((a) => a.sev === 'critical').length;
  const domains = [...new Set(m.alerts.map((a) => a.domain))];
  const subject = m.alerts.length === 1 ? lbl(l, 'subjOne', { t: m.alerts[0].title, d: m.alerts[0].domain })
    : m.alerts.length > 1 ? lbl(l, crit ? 'subjCrit' : 'subjMany', { n: m.alerts.length })
    : m.fixed.length === 1 ? lbl(l, 'subjFixed', { d: m.fixed[0].domain }) : lbl(l, 'subjFixedMany', { n: m.fixed.length });
  const intro = m.alerts.length ? lbl(l, 'intro') : lbl(l, 'introFixed');
  const fixed = m.fixed.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="border:1px solid ${C.line};border-radius:12px;margin:0 0 18px;"><tr><td style="padding:14px 20px;">
    <div style="font-size:14px;font-weight:700;color:${C.deep};margin:0 0 6px;">&#10003; ${esc(lbl(l, 'fixedH'))}</div>
    ${m.fixed.map((f) => `<div style="font-size:14px;line-height:1.6;color:${C.ink};"><span style="direction:ltr;unicode-bidi:embed;font-weight:600;">${esc(f.domain)}</span> &middot; ${esc(f.title)}</div>`).join('')}</td></tr></table>` : '';
  const foot = `<hr class="gh-hr" style="border:0;border-top:1px solid ${C.line};margin:8px 0 16px;">` +
    p(`${esc(m.footer.why)} ${esc(lbl(l, 'stop'))} <a href="${url(m.footer.unsubUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(lbl(l, 'unsub'))}</a> &middot; <a href="${url(m.footer.prefsUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(lbl(l, 'prefs'))}</a>`, true);
  const inner = [
    preheader(m.alerts[0] ? `${m.alerts[0].domain}: ${m.alerts[0].title}` : intro), h1(subject),
    p(esc(lbl(l, 'hi', { n: m.name.trim() || lbl(l, 'there') }))), p(esc(intro)),
    ...domains.map((d) => domainPanel(d, m.alerts.filter((a) => a.domain === d), l)),
    fixed,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 20px;"><tr><td align="${rtl ? 'right' : 'left'}">${button(m.panelUrl, lbl(l, 'panel'), true)}</td></tr></table>`,
    p(esc(lbl(l, 'note')), true), foot,
  ].join('\n');
  const html = rtl ? `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;">${inner}</div>` : `<div dir="ltr" lang="en">${inner}</div>`;
  const text = [subject, '', lbl(l, 'hi', { n: m.name || lbl(l, 'there') }), '', intro, '',
    ...m.alerts.flatMap((a) => [`[${lbl(l, a.sev === 'critical' ? 'urgent' : 'attention')}] ${a.domain}: ${a.title}`, a.explain, ...(a.record ? [`TXT ${a.record.name} ${a.record.value}`] : []), ...(a.fix ? [`${a.fix.label}: ${a.fix.href}`] : []), '']),
    ...(m.fixed.length ? [lbl(l, 'fixedH'), ...m.fixed.map((f) => `- ${f.domain}: ${f.title}`), ''] : []),
    `${lbl(l, 'panel')}: ${m.panelUrl}`, '', `${lbl(l, 'unsub')}: ${m.footer.unsubUrl}`].join('\n');
  return { subject, html, text };
}

/** WhatsApp template (Utility) to submit in Meta. Parameters: {{1}} first name, {{2}} domain, {{3}} problem, {{4}} link. */
export const WA_HEALTH = {
  name: 'gh_site_alert', category: 'UTILITY' as const, params: ['first name', 'domain', 'problem', 'link'],
  en: 'Hi {{1}}, GlobalHostia alert for {{2}}: {{3}}. Details and the fix: {{4}}',
  ar: 'مرحبًا {{1}}، تنبيه من GlobalHostia بخصوص {{2}}: {{3}}. التفاصيل وطريقة الإصلاح: {{4}}',
};
