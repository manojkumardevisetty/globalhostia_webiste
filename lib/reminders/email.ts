// Reminder email bodies in the GlobalHostia "v2-mono" email look (lib/email-brand.ts): black and white, Manrope/Inter,
// table layout, the same gh-* classes so the global CSS (dark mode, mobile stacking) applies. Pure (no imports), so the
// tests render it directly. Bodies go out inside WHMCS's Email Global Header/Footer (transport "whmcs"), or are wrapped
// with the same header/footer here on the server (transport "smtp" and the admin preview: lib/reminders/send.ts).
// Everything shown comes from the caller (WHMCS data): this file never invents an item, a price or a discount.

export type Lang = 'en' | 'ar';
export type Copy = { subject: string; intro: string };
export type Footer = { unsubUrl: string; prefsUrl: string; why: string };

export type CartLine = { title: string; detail: string; price: string | null; link: string };
export type CartMail = { lang: Lang; name: string; copy: Copy; lines: CartLine[]; total: string | null; cta: string; promo?: string; stage: 'c1' | 'c2' | 'c3'; footer: Footer };

export type RenewLine = { title: string; detail: string; date: string; rel: string; price: string | null; auto: boolean | null; invoice?: { num: string; url: string } };
export type RenewalMail = { lang: Lang; name: string; copy: Copy; lines: RenewLine[]; total: string | null; cta: string; footer: Footer };

export type OverdueMail = { lang: Lang; name: string; copy: Copy; invoice: { num: string; date: string; due: string; days: number; total: string; url: string }; items: string[]; footer: Footer };

export type DomainLine = { domain: string; date: string; rel: string; price: string | null; grace: boolean; url: string };
export type DomainMail = { lang: Lang; name: string; copy: Copy; lines: DomainLine[]; cta: string; footer: Footer };

const FONT_HEAD = `Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_BODY = `Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const C = { ink: '#222222', deep: '#111111', tint: '#f5f5f5', line: '#e5e5e5', line2: '#d4d4d4', muted: '#666666' };

/** HTML escape that is also safe in WHMCS (Smarty) bodies: no raw braces. */
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const url = (u: string) => (/^https:\/\//i.test(u) ? esc(u) : '#');

const L = {
  en: {
    hi: 'Hi {n},', there: 'there', item: 'Item', price: 'Price', total: 'Total', complete: 'Complete your order', renewAll: 'Review and renew',
    pay: 'Pay invoice', renewDomain: 'Renew domain', renewNow: 'Renew now', autoOn: 'Auto-renew on', autoOff: 'Auto-renew off', invoiceReady: 'Invoice #{n} is ready',
    priceNote: 'Prices are the current prices for the billing cycle shown. Taxes, setup fees and any options you chose appear at checkout.',
    promo: 'Your code {c} is applied when you use the button below.', ignore: 'Changed your mind? Just ignore this email. We send at most {n} reminders about a cart.',
    renewNote: 'Renewal prices are the amounts on your account. Items with auto-renew on are invoiced automatically before the due date; make sure your payment method is up to date.',
    invoice: 'Invoice', issued: 'Issued', due: 'Due date', overdueBy: 'Overdue by', days: '{n} days', day: '1 day', amount: 'Amount due', covers: 'This invoice covers',
    overdueNote: 'Already paid? Thank you, you can ignore this email: payments can take a little while to show.',
    expires: 'Expires', expired: 'Expired', renewPrice: 'Renewal price', grace: 'In the grace period: renew now before the domain is released.',
    domainNote: 'Turn auto-renew on in your account to stop these warnings for this domain.',
    unsub: 'Unsubscribe', prefs: 'Email preferences', stop: 'Don’t want these reminders?', ref: 'Reference',
  },
  ar: {
    hi: 'مرحبًا {n}،', there: 'بك', item: 'العنصر', price: 'السعر', total: 'الإجمالي', complete: 'أكمل طلبك', renewAll: 'مراجعة وتجديد',
    pay: 'ادفع الفاتورة', renewDomain: 'جدّد النطاق', renewNow: 'جدّد الآن', autoOn: 'التجديد التلقائي مفعّل', autoOff: 'التجديد التلقائي متوقف', invoiceReady: 'الفاتورة رقم {n} جاهزة',
    priceNote: 'الأسعار هي الأسعار الحالية لدورة الفوترة الموضحة. تظهر الضرائب ورسوم الإعداد وأي خيارات اخترتها عند إتمام الطلب.',
    promo: 'يُطبَّق رمزك {c} عند استخدام الزر أدناه.', ignore: 'غيّرت رأيك؟ تجاهل هذه الرسالة فقط. نرسل {n} تذكيرات كحد أقصى بشأن السلة.',
    renewNote: 'أسعار التجديد هي المبالغ المسجلة في حسابك. العناصر التي فُعِّل لها التجديد التلقائي تصدر فواتيرها تلقائيًا قبل تاريخ الاستحقاق؛ تأكد من تحديث طريقة الدفع.',
    invoice: 'الفاتورة', issued: 'تاريخ الإصدار', due: 'تاريخ الاستحقاق', overdueBy: 'متأخرة منذ', days: '{n} أيام', day: 'يوم واحد', amount: 'المبلغ المستحق', covers: 'تشمل هذه الفاتورة',
    overdueNote: 'دفعت بالفعل؟ شكرًا لك، يمكنك تجاهل هذه الرسالة: قد يستغرق ظهور الدفعات بعض الوقت.',
    expires: 'ينتهي في', expired: 'انتهى في', renewPrice: 'سعر التجديد', grace: 'في فترة السماح: جدّد الآن قبل أن يُطرح النطاق.',
    domainNote: 'فعّل التجديد التلقائي من حسابك لإيقاف هذه التنبيهات لهذا النطاق.',
    unsub: 'إلغاء الاشتراك', prefs: 'تفضيلات البريد', stop: 'لا تريد هذه التذكيرات؟', ref: 'المرجع',
  },
} as const;
export const label = (lang: Lang, k: keyof (typeof L)['en'], v: Record<string, string | number> = {}) =>
  String(L[lang][k]).replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));

/* ---------------------------------------------------------------- blocks (same markup as lib/email-brand.ts) */
export function button(href: string, text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="gh-btn" style="border-collapse:separate;"><tr><td align="center" bgcolor="#111111" style="background-color:#111111;border:1px solid #111111;border-radius:8px;mso-padding-alt:12px 22px;"><a href="${url(href)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT_BODY};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;white-space:nowrap;"><span class="gh-gm-s"><span class="gh-gm-d">${esc(text)}</span></span></a></td></tr></table>`;
}
const cta = (href: string, text: string, rtl: boolean) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 24px;"><tr><td align="${rtl ? 'right' : 'left'}">${button(href, text)}</td></tr></table>`;
const h1 = (s: string) => `<h1 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:26px;line-height:1.25;font-weight:800;color:${C.deep};">${esc(s)}</h1>`;
const p = (html: string, small = false) => `<p${small ? ' class="gh-small"' : ''} style="margin:0 0 16px;${small ? `font-size:13px;line-height:1.55;color:${C.muted};` : ''}">${html}</p>`;
const preheader = (s: string) => `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${esc(s)}&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>`;

/** Line-item panel: title + muted detail on the start side, value on the end side; optional total row. */
function lines(rows: { title: string; detail: string; value: string; href?: string }[], total: { label: string; value: string } | null, rtl: boolean): string {
  const end = rtl ? 'left' : 'right', start = rtl ? 'right' : 'left';
  const tr = (r: (typeof rows)[number], i: number) => `<tr><td class="gh-v" style="padding:12px 12px 12px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${start};vertical-align:top;color:${C.deep};font-size:15px;font-weight:600;word-break:break-word;">${r.href ? `<a href="${url(r.href)}" target="_blank" class="gh-link" style="color:${C.deep};text-decoration:none;">${esc(r.title)}</a>` : esc(r.title)}${r.detail ? `<br><span class="gh-muted" style="font-weight:400;font-size:13px;color:${C.muted};">${r.detail}</span>` : ''}</td><td class="gh-v" style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${end};vertical-align:top;white-space:nowrap;color:${C.deep};font-size:15px;font-weight:600;">${r.value}</td></tr>`;
  const tot = total ? `<tr><td class="gh-k" style="padding:12px 12px 4px 0;border-top:1px solid ${C.line2};text-align:${start};color:${C.muted};font-size:14px;">${esc(total.label)}</td><td class="gh-v" style="padding:12px 0 4px;border-top:1px solid ${C.line2};text-align:${end};white-space:nowrap;color:${C.deep};font-size:17px;font-weight:800;">${esc(total.value)}</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 20px;"><tr><td style="padding:6px 20px 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map(tr).join('')}${tot}</table></td></tr></table>`;
}
function kv(rows: [string, string][], rtl: boolean): string {
  const start = rtl ? 'right' : 'left';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 20px;"><tr><td style="padding:14px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-kv">${rows.map(([k, v]) => `<tr><td class="gh-k" width="40%" style="padding:7px 12px 7px 0;text-align:${start};color:${C.muted};font-size:14px;vertical-align:top;">${esc(k)}</td><td class="gh-v" style="padding:7px 0;text-align:${start};color:${C.deep};font-size:15px;font-weight:600;vertical-align:top;word-break:break-word;">${v}</td></tr>`).join('')}</table></td></tr></table>`;
}
function foot(lang: Lang, f: Footer): string {
  return `<hr class="gh-hr" style="border:0;border-top:1px solid ${C.line};margin:8px 0 16px;">` +
    p(`${esc(f.why)} ${esc(label(lang, 'stop'))} <a href="${url(f.unsubUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(label(lang, 'unsub'))}</a> &middot; <a href="${url(f.prefsUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(label(lang, 'prefs'))}</a>`, true);
}
const wrap = (lang: Lang, inner: string) => (lang === 'ar' ? `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;">${inner}</div>` : `<div dir="ltr" lang="en">${inner}</div>`);
const hello = (lang: Lang, name: string) => p(esc(label(lang, 'hi', { n: name.trim() || label(lang, 'there') })));
const introHtml = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

/* ---------------------------------------------------------------- the four emails */
export function cartEmail(m: CartMail): { subject: string; html: string; text: string } {
  const rtl = m.lang === 'ar';
  const rows = m.lines.map((l) => ({ title: l.title, detail: esc(l.detail), value: l.price ? esc(l.price) : '&mdash;', href: l.link }));
  const html = wrap(m.lang, [
    preheader(m.copy.intro), h1(m.copy.subject), hello(m.lang, m.name), p(introHtml(m.copy.intro)),
    lines(rows, m.total ? { label: label(m.lang, 'total'), value: m.total } : null, rtl),
    m.promo ? p(`<span class="gh-badge" style="display:inline-block;padding:3px 10px;border-radius:999px;background-color:#eeeeee;color:${C.deep};font-size:12px;font-weight:700;">${esc(m.promo)}</span> ${esc(label(m.lang, 'promo', { c: m.promo }))}`) : '',
    cta(m.cta, label(m.lang, 'complete'), rtl),
    p(esc(label(m.lang, 'priceNote')), true), p(esc(label(m.lang, 'ignore', { n: m.stage === 'c3' || m.promo ? 3 : 2 })), true),
    foot(m.lang, m.footer),
  ].join('\n'));
  const text = [m.copy.subject, '', label(m.lang, 'hi', { n: m.name || label(m.lang, 'there') }), '', m.copy.intro, '',
    ...m.lines.map((l) => `- ${l.title}${l.detail ? ` (${l.detail})` : ''}${l.price ? `: ${l.price}` : ''}`),
    ...(m.total ? ['', `${label(m.lang, 'total')}: ${m.total}`] : []), ...(m.promo ? ['', label(m.lang, 'promo', { c: m.promo })] : []),
    '', `${label(m.lang, 'complete')}: ${m.cta}`, '', label(m.lang, 'priceNote'), '', `${label(m.lang, 'unsub')}: ${m.footer.unsubUrl}`].join('\n');
  return { subject: m.copy.subject, html, text };
}

export function renewalEmail(m: RenewalMail): { subject: string; html: string; text: string } {
  const rtl = m.lang === 'ar';
  const rows = m.lines.map((l) => {
    const bits = [l.detail, `${l.date} · ${l.rel}`, l.auto === null ? '' : label(m.lang, l.auto ? 'autoOn' : 'autoOff'), l.invoice ? label(m.lang, 'invoiceReady', { n: l.invoice.num }) : ''].filter(Boolean);
    return { title: l.title, detail: bits.map(esc).join('<br>'), value: l.price ? esc(l.price) : '&mdash;' };
  });
  const html = wrap(m.lang, [
    preheader(m.copy.intro), h1(m.copy.subject), hello(m.lang, m.name), p(introHtml(m.copy.intro)),
    lines(rows, m.total ? { label: label(m.lang, 'total'), value: m.total } : null, rtl),
    cta(m.cta, label(m.lang, 'renewAll'), rtl), p(esc(label(m.lang, 'renewNote')), true), foot(m.lang, m.footer),
  ].join('\n'));
  const text = [m.copy.subject, '', label(m.lang, 'hi', { n: m.name || label(m.lang, 'there') }), '', m.copy.intro, '',
    ...m.lines.map((l) => `- ${l.title}${l.detail ? ` (${l.detail})` : ''}: ${l.date}${l.price ? `, ${l.price}` : ''}`),
    ...(m.total ? ['', `${label(m.lang, 'total')}: ${m.total}`] : []), '', `${label(m.lang, 'renewAll')}: ${m.cta}`, '', `${label(m.lang, 'unsub')}: ${m.footer.unsubUrl}`].join('\n');
  return { subject: m.copy.subject, html, text };
}

export function overdueEmail(m: OverdueMail): { subject: string; html: string; text: string } {
  const rtl = m.lang === 'ar', i = m.invoice;
  const subject = `${m.copy.subject} #${i.num}`;
  const rows: [string, string][] = [[label(m.lang, 'invoice'), `#${esc(i.num)}`], [label(m.lang, 'issued'), esc(i.date)], [label(m.lang, 'due'), esc(i.due)],
    [label(m.lang, 'overdueBy'), esc(i.days === 1 ? label(m.lang, 'day') : label(m.lang, 'days', { n: i.days }))], [label(m.lang, 'amount'), esc(i.total)]];
  const html = wrap(m.lang, [
    preheader(m.copy.intro), h1(subject), hello(m.lang, m.name), p(introHtml(m.copy.intro)), kv(rows, rtl),
    m.items.length ? p(`<strong>${esc(label(m.lang, 'covers'))}:</strong><br>${m.items.slice(0, 10).map(esc).join('<br>')}`) : '',
    cta(i.url, label(m.lang, 'pay'), rtl), p(esc(label(m.lang, 'overdueNote')), true), foot(m.lang, m.footer),
  ].join('\n'));
  const text = [subject, '', label(m.lang, 'hi', { n: m.name || label(m.lang, 'there') }), '', m.copy.intro, '', ...rows.map(([k, v]) => `${k}: ${v.replace(/&#?\w+;/g, (x) => ({ '&amp;': '&', '&#39;': "'" } as Record<string, string>)[x] ?? x)}`),
    '', `${label(m.lang, 'pay')}: ${i.url}`, '', `${label(m.lang, 'unsub')}: ${m.footer.unsubUrl}`].join('\n');
  return { subject, html, text };
}

export function domainEmail(m: DomainMail): { subject: string; html: string; text: string } {
  const rtl = m.lang === 'ar';
  const rows = m.lines.map((l) => ({
    title: l.domain, href: l.url,
    detail: [esc(`${label(m.lang, l.grace ? 'expired' : 'expires')} ${l.date} · ${l.rel}`), esc(label(m.lang, 'autoOff')), l.grace ? `<strong>${esc(label(m.lang, 'grace'))}</strong>` : ''].filter(Boolean).join('<br>'),
    value: l.price ? esc(l.price) : '&mdash;',
  }));
  const html = wrap(m.lang, [
    preheader(m.copy.intro), h1(m.copy.subject), hello(m.lang, m.name), p(introHtml(m.copy.intro)), lines(rows, null, rtl),
    cta(m.cta, label(m.lang, m.lines.length === 1 ? 'renewDomain' : 'renewNow'), rtl), p(esc(label(m.lang, 'domainNote')), true), foot(m.lang, m.footer),
  ].join('\n'));
  const text = [m.copy.subject, '', label(m.lang, 'hi', { n: m.name || label(m.lang, 'there') }), '', m.copy.intro, '',
    ...m.lines.map((l) => `- ${l.domain}: ${label(m.lang, l.grace ? 'expired' : 'expires')} ${l.date}${l.price ? `, ${l.price}` : ''}`), '', `${label(m.lang, 'renewNow')}: ${m.cta}`, '', `${label(m.lang, 'unsub')}: ${m.footer.unsubUrl}`].join('\n');
  return { subject: m.copy.subject, html, text };
}

/* ---------------------------------------------------------------- money and dates */
export type Currency = { code: string; prefix: string; suffix: string };
/** "$24.00 USD" the way WHMCS prints it (prefix + amount + suffix). */
export function money(amount: number, c: Currency): string {
  const n = (Math.round(amount * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const suf = String(c.suffix || '').trim();
  const pre = String(c.prefix || '').trim();
  return `${pre}${n}${suf ? ` ${suf}` : !pre && c.code ? ` ${c.code}` : ''}`.trim();
}
const MONTHS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'] };
/** "2026-11-15" → "15 Nov 2026" / "15 نوفمبر 2026" (Latin digits, no time zone shift). */
export function niceDate(iso: string, lang: Lang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${Number(m[3])} ${MONTHS[lang][Number(m[2]) - 1]} ${m[1]}`;
}
export function relDays(days: number, lang: Lang, kind: 'due' | 'expires' = 'due'): string {
  if (lang === 'ar') {
    if (days === 0) return kind === 'expires' ? 'ينتهي اليوم' : 'مستحق اليوم';
    if (days === 1) return 'غدًا';
    if (days > 0) return days === 2 ? 'بعد يومين' : days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يومًا`;
    const n = -days; return n === 1 ? 'منذ يوم واحد' : n === 2 ? 'منذ يومين' : n <= 10 ? `منذ ${n} أيام` : `منذ ${n} يومًا`;
  }
  if (days === 0) return kind === 'expires' ? 'expires today' : 'due today';
  if (days === 1) return 'tomorrow';
  if (days > 0) return `in ${days} days`;
  return `${-days} day${days === -1 ? '' : 's'} ago`;
}
const CYCLE = {
  en: { monthly: 'Monthly', quarterly: 'Every 3 months', semiannually: 'Every 6 months', annually: 'Yearly', biennially: 'Every 2 years', triennially: 'Every 3 years', onetime: 'One time', free: 'Free' },
  ar: { monthly: 'شهريًا', quarterly: 'كل 3 أشهر', semiannually: 'كل 6 أشهر', annually: 'سنويًا', biennially: 'كل سنتين', triennially: 'كل 3 سنوات', onetime: 'مرة واحدة', free: 'مجاني' },
};
export const cycleLabel = (c: string, lang: Lang) => (CYCLE[lang] as Record<string, string>)[String(c).toLowerCase().replace(/[^a-z]/g, '')] || String(c || '');
export const years = (n: number, lang: Lang) => (lang === 'ar' ? (n === 1 ? 'سنة واحدة' : n === 2 ? 'سنتان' : `${n} سنوات`) : `${n} year${n === 1 ? '' : 's'}`);
export const domainKind = (t: 'register' | 'transfer', lang: Lang) => (lang === 'ar' ? (t === 'transfer' ? 'نقل نطاق' : 'تسجيل نطاق') : t === 'transfer' ? 'Domain transfer' : 'Domain registration');

/* ---------------------------------------------------------------- WhatsApp template texts (submit these in Meta) */
// Body parameters {{1}}..{{n}} in the order lib/reminders/whatsapp.ts sends them. All three are Utility templates (notices
// about an existing account). Abandoned-cart reminders are email only: there is no WhatsApp cart template.
export const WA_TEMPLATES: Record<'renewal' | 'overdue' | 'domain', { name: string; category: 'MARKETING' | 'UTILITY'; params: string[]; en: string; ar: string }> = {
  renewal: { name: 'gh_renewal_reminder', category: 'UTILITY', params: ['first name', 'items', 'first due date', 'link'],
    en: 'Hi {{1}}, renewal reminder from GlobalHostia: {{2}} renew on {{3}}. Review and renew here {{4}}',
    ar: 'مرحبًا {{1}}، تذكير بالتجديد من GlobalHostia: {{2}} يتجدد في {{3}}. راجع وجدّد من هنا {{4}}' },
  overdue: { name: 'gh_invoice_overdue', category: 'UTILITY', params: ['first name', 'invoice number', 'amount', 'due date', 'link'],
    en: 'Hi {{1}}, GlobalHostia invoice #{{2}} for {{3}} was due on {{4}}. Pay securely here {{5}}',
    ar: 'مرحبًا {{1}}، فاتورة GlobalHostia رقم {{2}} بقيمة {{3}} كانت مستحقة في {{4}}. ادفع بأمان من هنا {{5}}' },
  domain: { name: 'gh_domain_expiry', category: 'UTILITY', params: ['first name', 'domain', 'expiry date', 'link'],
    en: 'Hi {{1}}, your domain {{2}} expires on {{3}} and auto-renew is off. Renew it to keep your website and email working: {{4}}',
    ar: 'مرحبًا {{1}}، ينتهي نطاقك {{2}} في {{3}} والتجديد التلقائي متوقف. جدّده ليستمر موقعك وبريدك في العمل: {{4}}' },
};
