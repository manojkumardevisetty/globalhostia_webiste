// Monthly site report in the GlobalHostia black-and-white "v2-mono" email look (same table markup and gh-* classes as
// lib/reminders/email.ts and lib/health/email.ts, so the global email CSS for dark mode and phone stacking applies).
// The same body is shown in the portal (/account/reports, embed mode: h2 instead of h1, no preheader / unsubscribe
// footer) and on the print page. Pure (type imports only): every value comes from the ReportData the engine built.
import type { ReportData, ReportSite, ReportTip, Lang, AuthState } from './report-core';

export type Footer = { unsubUrl: string; prefsUrl: string; why: string };
export type ReportMail = {
  lang: Lang; data: ReportData; site: string;
  /** issue key → short title in this language (lib/health/core.ts issueCopy) */
  issueTitle: (key: string) => string;
  footer?: Footer; embed?: boolean;
};

const FONT_HEAD = `Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_BODY = `Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const C = { ink: '#222222', deep: '#111111', tint: '#f5f5f5', line: '#e5e5e5', line2: '#d4d4d4', muted: '#666666' };
/** HTML escape that is also safe in WHMCS (Smarty) bodies: no raw braces. */
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const abs = (site: string, u: string) => (/^https:\/\//i.test(u) ? u : u.startsWith('/') ? `${site.replace(/\/$/, '')}${u}` : '#');
const href = (site: string, u: string) => { const a = abs(site, u); return a === '#' ? '#' : esc(a); };

const MONTHS = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] };
const SHORT = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], ar: MONTHS.ar };
export const monthName = (m: string, l: Lang) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[l][mo - 1]} ${y}`; };
/** "2026-11-15" → "15 Nov 2026" / "15 نوفمبر 2026" (Latin digits, no time zone shift). */
export function niceDate(iso: string | null | undefined, l: Lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} ${SHORT[l][Number(m[2]) - 1]} ${m[1]}` : '';
}
const gb = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${Math.round(mb)} MB`);

const L = {
  en: {
    subject: 'Your site report: {m}', hi: 'Hi {n},', there: 'there',
    intro: 'Here is how your sites did in {m}: our checks, SSL, email settings, backups, usage and what renews in the next 60 days.',
    good: 'All good', attention: 'Needs attention', urgent: 'Action needed',
    goodLine: 'Everything we check looked fine.', attentionLine: 'A few things could be better. The tips below say how.', urgentLine: 'Something needs your attention now. See the details below.',
    checks: 'Our checks', ssl: 'SSL certificate', mail: 'Email authentication', backups: 'Backups', disk: 'Disk space', bw: 'Bandwidth',
    checkedOn: 'Checked on {n} days', noProblems: 'no problems found', problemDays: 'problems on {n} days', downDays: 'not reachable on {n} days', downDay: 'not reachable on 1 day',
    problemDay: 'problems on 1 day', checkedDay: 'Checked on 1 day', found: 'Found', fixed: 'Fixed since', stillOpen: 'Still open',
    sslOk: 'Valid until {d}', sslExp: 'Expires {d} (in {n} days): check that it renews', sslBad: 'Problem: visitors may see a security warning', sslBy: 'issued by {i}',
    set: 'set up', missing: 'missing', invalid: 'needs fixing',
    backupsN: '{n} backups, latest {d}', backups1: '1 backup, {d}', backupsNone: 'No backups found in your hosting account', backupsNoDate: '{n} backups',
    of: '{u} of {l} ({p}%)', noLimit: '{u} (no limit)',
    renewals: 'Renewals in the next 60 days', noRenewals: 'Nothing renews in the next 60 days.', autoOn: 'Auto-renew on', autoOff: 'Auto-renew off', inDays: 'in {n} days', today: 'today', tomorrow: 'tomorrow',
    tips: 'Tips for you', watch: 'Watch how', see: 'See the plan', from: '{p} {c}',
    more: 'And {n} more domains: see them all in your account.',
    open: 'Open in my account', note: 'We check each site about once a day from our network. A day with a problem means at least one check that day found it; this is not minute-by-minute uptime monitoring.',
    unsub: 'Unsubscribe', prefs: 'Email preferences', stop: 'Don’t want this monthly email?',
    cycle: { monthly: 'per month', quarterly: 'every 3 months', semiannually: 'every 6 months', annually: 'per year', biennially: 'every 2 years', triennially: 'every 3 years' } as Record<string, string>,
    tip: {
      site_down: ['{d} was not reachable', 'Our checks could not reach {d} recently. If you did not take it offline on purpose, open a ticket and we will look into it with you.', 'Open a ticket'],
      ssl: ['Keep {d} secure', 'Your SSL certificate needs attention. A free certificate takes a minute to issue from your hosting panel.', 'Watch how'],
      email_auth: ['Help your emails reach the inbox', 'SPF, DKIM and DMARC records tell Gmail and Outlook that email from {d} is really yours. One missing record can send your emails to spam.', 'Watch how'],
      disk: ['{d} is almost out of disk space', 'When the disk is full, uploads, email and updates stop working. {p} has more room.', 'See the plan'],
      backups: ['Know where your backups are', 'Take a backup before big changes and see how to restore one in a few clicks.', 'Watch how'],
      autorenew: ['{d} will not renew by itself', 'Auto-renew is off for this domain. Renew it or turn auto-renew on so your website and email keep working.', 'Watch how'],
      wordpress: ['Build your site in minutes', 'Install WordPress on your hosting with one click and start from a ready-made theme.', 'Watch how'],
      hosting: ['Put {d} to work', 'Add hosting to publish a website and set up email on your domain. {p}.', 'See the plan'],
    } as Record<string, [string, string, string]>,
  },
  ar: {
    subject: 'تقرير موقعك: {m}', hi: 'مرحبًا {n}،', there: 'بك',
    intro: 'إليك أداء مواقعك في {m}: فحوصاتنا وشهادة SSL وإعدادات البريد والنسخ الاحتياطية والاستخدام وما يتجدد خلال الستين يومًا القادمة.',
    good: 'كل شيء سليم', attention: 'يحتاج إلى انتباه', urgent: 'مطلوب إجراء',
    goodLine: 'كل ما نفحصه كان سليمًا.', attentionLine: 'هناك أمور يمكن تحسينها. توضح النصائح أدناه كيف.', urgentLine: 'هناك أمر يحتاج إلى انتباهك الآن. اطّلع على التفاصيل أدناه.',
    checks: 'فحوصاتنا', ssl: 'شهادة SSL', mail: 'توثيق البريد الإلكتروني', backups: 'النسخ الاحتياطية', disk: 'مساحة القرص', bw: 'نقل البيانات',
    checkedOn: 'فُحص في {n} يومًا', noProblems: 'لم نجد أي مشكلة', problemDays: 'مشكلات في {n} أيام', downDays: 'تعذّر الوصول إليه في {n} أيام', downDay: 'تعذّر الوصول إليه في يوم واحد',
    problemDay: 'مشكلات في يوم واحد', checkedDay: 'فُحص في يوم واحد', found: 'ما وجدناه', fixed: 'تم إصلاحه', stillOpen: 'لا يزال قائمًا',
    sslOk: 'صالحة حتى {d}', sslExp: 'تنتهي في {d} (بعد {n} يومًا): تأكد من تجديدها', sslBad: 'مشكلة: قد يرى الزوار تحذيرًا أمنيًا', sslBy: 'صادرة عن {i}',
    set: 'مُعَد', missing: 'غير موجود', invalid: 'يحتاج إلى إصلاح',
    backupsN: '{n} نسخ احتياطية، آخرها {d}', backups1: 'نسخة احتياطية واحدة، {d}', backupsNone: 'لم نجد نسخًا احتياطية في حساب الاستضافة', backupsNoDate: '{n} نسخ احتياطية',
    of: '{u} من {l} ({p}%)', noLimit: '{u} (بلا حد)',
    renewals: 'التجديدات خلال الستين يومًا القادمة', noRenewals: 'لا شيء يتجدد خلال الستين يومًا القادمة.', autoOn: 'التجديد التلقائي مفعّل', autoOff: 'التجديد التلقائي متوقف', inDays: 'بعد {n} يومًا', today: 'اليوم', tomorrow: 'غدًا',
    tips: 'نصائح لك', watch: 'شاهد الطريقة', see: 'اعرض الخطة', from: '{p} {c}',
    more: 'و{n} نطاقات أخرى: اعرضها كلها في حسابك.',
    open: 'افتح في حسابي', note: 'نفحص كل موقع مرة يوميًا تقريبًا من شبكتنا. اليوم الذي فيه مشكلة يعني أن فحصًا واحدًا على الأقل في ذلك اليوم وجدها؛ هذه ليست مراقبة لحظية لوقت التشغيل.',
    unsub: 'إلغاء الاشتراك', prefs: 'تفضيلات البريد', stop: 'لا تريد هذه الرسالة الشهرية؟',
    cycle: { monthly: 'شهريًا', quarterly: 'كل 3 أشهر', semiannually: 'كل 6 أشهر', annually: 'سنويًا', biennially: 'كل سنتين', triennially: 'كل 3 سنوات' } as Record<string, string>,
    tip: {
      site_down: ['تعذّر الوصول إلى {d}', 'لم تتمكن فحوصاتنا من الوصول إلى {d} مؤخرًا. إن لم توقفه عمدًا، افتح تذكرة وسنتحقق من الأمر معك.', 'افتح تذكرة'],
      ssl: ['حافظ على أمان {d}', 'شهادة SSL تحتاج إلى انتباه. إصدار شهادة مجانية من لوحة الاستضافة يستغرق دقيقة.', 'شاهد الطريقة'],
      email_auth: ['ساعد رسائلك على الوصول إلى صندوق الوارد', 'سجلات SPF وDKIM وDMARC تخبر Gmail وOutlook أن البريد من {d} صادر منك فعلًا. غياب سجل واحد قد يرسل رسائلك إلى البريد العشوائي.', 'شاهد الطريقة'],
      disk: ['مساحة القرص في {d} على وشك النفاد', 'عند امتلاء القرص تتوقف الرفع والبريد والتحديثات. توفر {p} مساحة أكبر.', 'اعرض الخطة'],
      backups: ['اعرف أين نسخك الاحتياطية', 'خذ نسخة احتياطية قبل أي تغيير كبير وتعرّف على استعادتها ببضع نقرات.', 'شاهد الطريقة'],
      autorenew: ['{d} لن يتجدد تلقائيًا', 'التجديد التلقائي متوقف لهذا النطاق. جدّده أو فعّل التجديد التلقائي ليستمر موقعك وبريدك في العمل.', 'شاهد الطريقة'],
      wordpress: ['أنشئ موقعك في دقائق', 'ثبّت WordPress على استضافتك بنقرة واحدة وابدأ بقالب جاهز.', 'شاهد الطريقة'],
      hosting: ['استفد من {d}', 'أضف استضافة لنشر موقع وإعداد بريد على نطاقك. {p}.', 'اعرض الخطة'],
    } as Record<string, [string, string, string]>,
  },
};
type Key = Exclude<keyof (typeof L)['en'], 'cycle' | 'tip'>;
export const lbl = (l: Lang, k: Key, v: Record<string, string | number> = {}) => String(L[l][k]).replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));

/* ---------------------------------------------------------------- blocks */
function button(link: string, text: string, ghost = false): string {
  const bg = ghost ? '#ffffff' : '#111111', fg = ghost ? '#111111' : '#ffffff';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="${ghost ? 'gh-btn-ghost' : 'gh-btn'}" style="border-collapse:separate;"><tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid #111111;border-radius:8px;mso-padding-alt:10px 18px;"><a href="${link}" target="_blank" style="display:inline-block;padding:10px 18px;font-family:${FONT_BODY};font-size:14px;font-weight:600;line-height:1.2;color:${fg};text-decoration:none;border-radius:8px;white-space:nowrap;"><span class="gh-gm-s"><span class="gh-gm-d">${esc(text)}</span></span></a></td></tr></table>`;
}
const heading = (s: string, embed: boolean) => embed
  ? `<h2 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:24px;line-height:1.25;font-weight:800;color:${C.deep};">${esc(s)}</h2>`
  : `<h1 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:26px;line-height:1.25;font-weight:800;color:${C.deep};">${esc(s)}</h1>`;
const sub = (s: string, embed: boolean) => `<${embed ? 'h3' : 'h2'} style="margin:26px 0 10px;font-family:${FONT_HEAD};font-size:18px;line-height:1.3;font-weight:800;color:${C.deep};">${esc(s)}</${embed ? 'h3' : 'h2'}>`;
const p = (html: string, small = false) => `<p${small ? ' class="gh-small"' : ''} style="margin:0 0 16px;${small ? `font-size:13px;line-height:1.55;color:${C.muted};` : ''}">${html}</p>`;
const preheader = (s: string) => `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${esc(s)}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>`;
const badge = (s: string, strong: boolean) => `<span class="gh-badge" style="display:inline-block;padding:3px 10px;border-radius:999px;${strong ? 'background-color:#111111;color:#ffffff;' : `background-color:#eeeeee;color:${C.deep};`}font-size:12px;font-weight:700;letter-spacing:.02em;">${esc(s)}</span>`;
const ltr = (s: string) => `<span style="direction:ltr;unicode-bidi:embed;">${esc(s)}</span>`;

function kvPanel(title: string, sub: string, rows: [string, string][], rtl: boolean): string {
  const start = rtl ? 'right' : 'left';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 16px;"><tr><td style="padding:14px 20px 10px;">
    <div class="gh-v" style="font-family:${FONT_HEAD};font-size:16px;font-weight:800;color:${C.deep};text-align:${start};padding:0 0 2px;">${ltr(title)}</div>${sub ? `<div class="gh-muted" style="font-size:13px;color:${C.muted};text-align:${start};margin:0 0 6px;">${esc(sub)}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-kv">${rows.map(([k, v], i) => `<tr><td class="gh-k" width="38%" style="padding:8px 12px 8px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${start};color:${C.muted};font-size:14px;vertical-align:top;">${esc(k)}</td><td class="gh-v" style="padding:8px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${start};color:${C.deep};font-size:14px;font-weight:600;vertical-align:top;line-height:1.5;word-break:break-word;">${v}</td></tr>`).join('')}</table></td></tr></table>`;
}

const authWord = (l: Lang, s: AuthState) => lbl(l, s === 'ok' ? 'set' : s === 'missing' ? 'missing' : 'invalid');
const mark = (s: AuthState) => (s === 'ok' ? '&#10003;' : '&#9888;');

/** The rows of one site panel; only sections with data. */
export function siteRows(s: ReportSite, m: ReportMail): [string, string][] {
  const l = m.lang, rows: [string, string][] = [];
  if (s.checks) {
    const c = s.checks;
    const head = c.days === 1 ? lbl(l, 'checkedDay') : lbl(l, 'checkedOn', { n: c.days });
    const tail = !c.issueDays ? lbl(l, 'noProblems') : c.issueDays === 1 ? lbl(l, 'problemDay') : lbl(l, 'problemDays', { n: c.issueDays });
    const down = c.downDays ? ` · ${c.downDays === 1 ? lbl(l, 'downDay') : lbl(l, 'downDays', { n: c.downDays })}` : '';
    const list = (k: Key, keys: string[]) => (keys.length ? `<br><span class="gh-muted" style="font-weight:400;color:${C.muted};">${esc(lbl(l, k))}: ${keys.slice(0, 4).map((x) => esc(m.issueTitle(x))).join(', ')}</span>` : '');
    rows.push([lbl(l, 'checks'), `${esc(head)} · ${esc(tail)}${esc(down)}${list('fixed', c.resolved)}${list('stillOpen', c.open)}`]);
  }
  if (s.ssl) {
    const x = s.ssl, d = niceDate(x.validTo, l);
    const main = x.state === 'problem' ? lbl(l, 'sslBad') : x.state === 'expiring' && d ? lbl(l, 'sslExp', { d, n: Math.max(0, x.daysLeft ?? 0) }) : d ? lbl(l, 'sslOk', { d }) : lbl(l, 'set');
    rows.push([lbl(l, 'ssl'), `${x.state === 'ok' ? '&#10003; ' : '&#9888; '}${esc(main)}${x.issuer && x.state !== 'problem' ? `<br><span class="gh-muted" style="font-weight:400;color:${C.muted};">${esc(lbl(l, 'sslBy', { i: x.issuer }))}</span>` : ''}`]);
  }
  if (s.mail) {
    const parts = [`${mark(s.mail.spf)} SPF ${esc(authWord(l, s.mail.spf))}`, ...(s.mail.dkim ? [`${mark(s.mail.dkim)} DKIM ${esc(authWord(l, s.mail.dkim))}`] : []), `${mark(s.mail.dmarc)} DMARC ${esc(authWord(l, s.mail.dmarc))}`];
    rows.push([lbl(l, 'mail'), parts.join('<br>')]);
  }
  if (s.backups) {
    const b = s.backups, d = niceDate(b.latest, l);
    rows.push([lbl(l, 'backups'), esc(!b.count ? lbl(l, 'backupsNone') : b.count === 1 ? (d ? lbl(l, 'backups1', { d }) : lbl(l, 'backupsNoDate', { n: 1 })) : d ? lbl(l, 'backupsN', { n: b.count, d }) : lbl(l, 'backupsNoDate', { n: b.count }))]);
  }
  const use = (k: 'disk' | 'bw', u?: { used: number; limit: number | null; pct: number | null }) => {
    if (!u) return;
    rows.push([lbl(l, k), esc(u.limit && u.pct !== null ? lbl(l, 'of', { u: gb(u.used), l: gb(u.limit), p: u.pct }) : lbl(l, 'noLimit', { u: gb(u.used) }))]);
  };
  use('disk', s.usage?.disk); use('bw', s.usage?.bw);
  return rows;
}

function tipBlock(t: ReportTip, m: ReportMail): string {
  const l = m.lang, rtl = l === 'ar';
  const [title, body, cta] = L[l].tip[t.key] || ['', '', ''];
  const price = t.product ? fill(L[l].from, { p: t.product.price, c: L[l].cycle[t.product.cycle] || '' }).trim() : '';
  const pv = { d: t.domain, p: t.product ? `${t.product.name} (${price})` : '' };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="border:1px solid ${C.line};border-radius:12px;margin:0 0 14px;"><tr><td style="padding:14px 20px;text-align:${rtl ? 'right' : 'left'};">
    <div class="gh-v" style="font-size:15px;font-weight:700;color:${C.deep};line-height:1.35;margin:0 0 4px;">${esc(fill(title, pv))}</div>
    <div class="gh-muted" style="font-size:14px;line-height:1.55;color:${C.ink};margin:0 0 10px;">${esc(fill(body, pv))}</div>
    ${button(href(m.site, t.href), cta, true)}</td></tr></table>`;
}

const relDays = (n: number, l: Lang) => (n === 0 ? lbl(l, 'today') : n === 1 ? lbl(l, 'tomorrow') : lbl(l, 'inDays', { n }));

export function reportEmail(m: ReportMail): { subject: string; html: string; text: string } {
  const l = m.lang, rtl = l === 'ar', r = m.data, embed = !!m.embed;
  const month = monthName(r.month, l);
  const subject = lbl(l, 'subject', { m: month });
  const head = r.sites.some((s) => s.ssl?.state === 'problem' || (s.checks?.open || []).some((k) => ['site_down', 'dns_unresolved', 'ns_none'].includes(k))) ? 'urgent'
    : r.sites.some((s) => s.ssl?.state === 'expiring' || (s.checks?.open.length || 0) > 0 || (s.mail && (s.mail.spf !== 'ok' || s.mail.dmarc !== 'ok' || s.mail.dkim === 'missing')) || (s.usage?.disk?.pct ?? 0) >= 80) ? 'attention' : 'good';
  const start = rtl ? 'right' : 'left', end = rtl ? 'left' : 'right';
  const renew = r.renewals.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 16px;"><tr><td style="padding:6px 20px 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${r.renewals.map((x, i) => `<tr><td class="gh-v" style="padding:11px 12px 11px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${start};vertical-align:top;color:${C.deep};font-size:14px;font-weight:600;word-break:break-word;">${ltr(x.name)}<br><span class="gh-muted" style="font-weight:400;font-size:13px;color:${C.muted};">${esc(niceDate(x.date, l))} · ${esc(relDays(x.days, l))}${x.auto === null ? '' : ` · ${esc(lbl(l, x.auto ? 'autoOn' : 'autoOff'))}`}</span></td><td class="gh-v" style="padding:11px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${end};vertical-align:top;white-space:nowrap;color:${C.deep};font-size:14px;font-weight:600;">${x.price ? esc(x.price) : '&mdash;'}</td></tr>`).join('')}</table></td></tr></table>` : p(esc(lbl(l, 'noRenewals')));
  const reportUrl = href(m.site, `/account/reports?m=${r.month}`);
  const parts = [
    embed ? '' : preheader(lbl(l, 'intro', { m: month })), heading(subject, embed),
    p(esc(lbl(l, 'hi', { n: r.name.trim() || lbl(l, 'there') }))), p(esc(lbl(l, 'intro', { m: month }))),
    p(`${badge(lbl(l, head), head === 'urgent')} <span style="font-size:14px;">${esc(lbl(l, head === 'good' ? 'goodLine' : head === 'urgent' ? 'urgentLine' : 'attentionLine'))}</span>`),
    ...r.sites.map((s) => kvPanel(s.domain, s.product, siteRows(s, m), rtl)),
    r.moreSites ? p(esc(lbl(l, 'more', { n: r.moreSites })), true) : '',
    sub(lbl(l, 'renewals'), embed), renew,
    r.tips.length ? sub(lbl(l, 'tips'), embed) + r.tips.map((t) => tipBlock(t, m)).join('') : '',
    embed ? '' : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 20px;"><tr><td align="${start}">${button(reportUrl, lbl(l, 'open'))}</td></tr></table>`,
    p(esc(lbl(l, 'note')), true),
    !embed && m.footer ? `<hr class="gh-hr" style="border:0;border-top:1px solid ${C.line};margin:8px 0 16px;">` + p(`${esc(m.footer.why)} ${esc(lbl(l, 'stop'))} <a href="${href(m.site, m.footer.unsubUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(lbl(l, 'unsub'))}</a> &middot; <a href="${href(m.site, m.footer.prefsUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(lbl(l, 'prefs'))}</a>`, true) : '',
  ].filter(Boolean).join('\n');
  const html = rtl ? `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;">${parts}</div>` : `<div dir="ltr" lang="en">${parts}</div>`;
  const strip = (s: string) => s.replace(/<br>/g, '\n  ').replace(/<[^>]+>/g, '').replace(/&#10003;/g, '✓').replace(/&#9888;/g, '!').replace(/&middot;/g, '·').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#123;/g, '{').replace(/&#125;/g, '}');
  const text = [subject, '', lbl(l, 'hi', { n: r.name || lbl(l, 'there') }), '', lbl(l, 'intro', { m: month }), '', `${lbl(l, head)}: ${lbl(l, head === 'good' ? 'goodLine' : head === 'urgent' ? 'urgentLine' : 'attentionLine')}`, '',
    ...r.sites.flatMap((s) => [`== ${s.domain}${s.product ? ` (${s.product})` : ''}`, ...siteRows(s, m).map(([k, v]) => `${k}: ${strip(v)}`), '']),
    lbl(l, 'renewals'), ...(r.renewals.length ? r.renewals.map((x) => `- ${x.name}: ${niceDate(x.date, l)}${x.price ? `, ${x.price}` : ''}`) : [lbl(l, 'noRenewals')]), '',
    ...(r.tips.length ? [lbl(l, 'tips'), ...r.tips.map((t) => `- ${fill((L[l].tip[t.key] || [''])[0], { d: t.domain, p: t.product?.name || '' })}: ${abs(m.site, t.href)}`), ''] : []),
    `${lbl(l, 'open')}: ${abs(m.site, `/account/reports?m=${r.month}`)}`, ...(m.footer ? ['', `${lbl(l, 'unsub')}: ${m.footer.unsubUrl}`] : [])].join('\n');
  return { subject, html, text };
}
