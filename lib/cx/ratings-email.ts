// "How did we do?" email after a ticket is closed (one tap on a score, no login) and the owner's low-rating alert, in the
// black-and-white v2-mono email look (gh-* classes, same as lib/reminders/email.ts). Pure (no runtime imports).
import type { Lang } from './ratings-core';

export type Footer = { unsubUrl: string; prefsUrl: string; why: string };
const FONT_HEAD = `Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_BODY = `Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const C = { ink: '#222222', deep: '#111111', tint: '#f5f5f5', line: '#e5e5e5', muted: '#666666' };
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const url = (u: string) => (/^https:\/\//i.test(u) ? esc(u) : '#');

export const SCORE_LABEL: Record<Lang, string[]> = {
  en: ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent'],
  ar: ['سيئ جدًا', 'سيئ', 'مقبول', 'جيد', 'ممتاز'],
};
const L = {
  en: {
    subject: 'How did we do? Ticket #{t}', hi: 'Hi {n},', there: 'there',
    intro: 'We closed your ticket “{s}”. How happy are you with the help you got? Tap a score: it takes one second and you do not need to sign in.',
    ticket: 'Ticket #{t}', by: 'Answered by {a}', note: 'Your answer goes straight to our support team. You can add a comment on the next page if you like. Still need help? Reply to the ticket and it opens again.',
    unsub: 'Unsubscribe', prefs: 'Email preferences', stop: 'Don’t want these questions?',
  },
  ar: {
    subject: 'ما رأيك في خدمتنا؟ التذكرة رقم {t}', hi: 'مرحبًا {n}،', there: 'بك',
    intro: 'أغلقنا تذكرتك «{s}». ما مدى رضاك عن المساعدة التي تلقيتها؟ اختر تقييمًا: يستغرق ثانية واحدة ولا تحتاج إلى تسجيل الدخول.',
    ticket: 'التذكرة رقم {t}', by: 'ردّ عليك {a}', note: 'يصل رأيك مباشرةً إلى فريق الدعم. يمكنك إضافة تعليق في الصفحة التالية إن أردت. لا تزال تحتاج إلى مساعدة؟ ردّ على التذكرة لتُفتح من جديد.',
    unsub: 'إلغاء الاشتراك', prefs: 'تفضيلات البريد', stop: 'لا تريد هذه الأسئلة؟',
  },
};
const lbl = (l: Lang, k: keyof (typeof L)['en'], v: Record<string, string | number> = {}) => String(L[l][k]).replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));
const p = (html: string, small = false) => `<p${small ? ' class="gh-small"' : ''} style="margin:0 0 16px;${small ? `font-size:13px;line-height:1.55;color:${C.muted};` : ''}">${html}</p>`;

/** Five score buttons in one row (stack on phones through the global .gh-stack rule). 5 first in Arabic reading order. */
function scores(base: string, lang: Lang): string {
  const cells = [1, 2, 3, 4, 5].map((s) => `<td class="gh-stack gh-stack-gap" width="20%" style="padding:0 4px 8px;" align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-btn-ghost" style="border-collapse:separate;"><tr><td align="center" bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #111111;border-radius:10px;">
    <a href="${url(`${base}&s=${s}`)}" target="_blank" style="display:block;padding:10px 4px;font-family:${FONT_BODY};color:${C.deep};text-decoration:none;line-height:1.25;"><span style="display:block;font-family:${FONT_HEAD};font-size:20px;font-weight:800;">${s}&nbsp;&#9733;</span><span style="display:block;font-size:12px;font-weight:600;color:${C.muted};">${esc(SCORE_LABEL[lang][s - 1])}</span></a></td></tr></table></td>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;" dir="ltr"><tr>${cells.join('')}</tr></table>`;
}

export type RatingMail = { lang: Lang; name: string; tid: string; subject: string; staff: string; rateUrl: string; footer: Footer };
export function ratingEmail(m: RatingMail): { subject: string; html: string; text: string } {
  const l = m.lang, rtl = l === 'ar';
  const subject = lbl(l, 'subject', { t: m.tid });
  const panel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 18px;"><tr><td style="padding:12px 20px;text-align:${rtl ? 'right' : 'left'};">
    <div class="gh-k" style="font-size:13px;color:${C.muted};">${esc(lbl(l, 'ticket', { t: m.tid }))}</div><div class="gh-v" style="font-size:15px;font-weight:700;color:${C.deep};word-break:break-word;">${esc(m.subject)}</div>${m.staff ? `<div class="gh-muted" style="font-size:13px;color:${C.muted};margin-top:2px;">${esc(lbl(l, 'by', { a: m.staff }))}</div>` : ''}</td></tr></table>`;
  const inner = [
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${esc(lbl(l, 'intro', { s: m.subject }))}&#8203;&#8203;&#8203;</div>`,
    `<h1 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:26px;line-height:1.25;font-weight:800;color:${C.deep};">${esc(subject)}</h1>`,
    p(esc(lbl(l, 'hi', { n: m.name.trim() || lbl(l, 'there') }))), p(esc(lbl(l, 'intro', { s: m.subject }))), panel, scores(m.rateUrl, l), p(esc(lbl(l, 'note')), true),
    `<hr class="gh-hr" style="border:0;border-top:1px solid ${C.line};margin:8px 0 16px;">`,
    p(`${esc(m.footer.why)} ${esc(lbl(l, 'stop'))} <a href="${url(m.footer.unsubUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(lbl(l, 'unsub'))}</a> &middot; <a href="${url(m.footer.prefsUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(lbl(l, 'prefs'))}</a>`, true),
  ].join('\n');
  const html = rtl ? `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;">${inner}</div>` : `<div dir="ltr" lang="en">${inner}</div>`;
  const text = [subject, '', lbl(l, 'hi', { n: m.name || lbl(l, 'there') }), '', lbl(l, 'intro', { s: m.subject }), '',
    ...[5, 4, 3, 2, 1].map((s) => `${s} - ${SCORE_LABEL[l][s - 1]}: ${m.rateUrl}&s=${s}`), '', lbl(l, 'note'), '', `${lbl(l, 'unsub')}: ${m.footer.unsubUrl}`].join('\n');
  return { subject, html, text };
}

/** Owner alert (English, internal): a 1–2 star rating, or a comment added to one. */
export function lowRatingAlert(o: { score: number; tid: string; ticketId: number; subject: string; client: string; clientId: number; staff: string; comment: string; adminUrl: string; followUp?: boolean }) {
  const subject = o.followUp ? `Comment added to a ${o.score}-star rating: ticket #${o.tid}` : `Low rating (${o.score}/5) on ticket #${o.tid}`;
  const rows: [string, string][] = [['Score', `${o.score} / 5 (${SCORE_LABEL.en[o.score - 1]})`], ['Ticket', `#${o.tid}: ${o.subject}`], ['Client', `${o.client || '—'} (#${o.clientId})`], ['Answered by', o.staff || '—'], ['Comment', o.comment || (o.followUp ? '—' : 'None yet. If the client adds one, you get it in a second email.')]];
  const html = `<div dir="ltr" lang="en"><h1 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:24px;line-height:1.25;font-weight:800;color:${C.deep};">${esc(subject)}</h1>
    ${p(esc(o.followUp ? 'The client added a comment to their rating.' : 'A client rated their support experience low. Following up quickly usually turns this around.'))}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 18px;"><tr><td style="padding:12px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-kv">${rows.map(([k, v]) => `<tr><td class="gh-k" width="30%" style="padding:7px 12px 7px 0;color:${C.muted};font-size:14px;vertical-align:top;">${esc(k)}</td><td class="gh-v" style="padding:7px 0;color:${C.deep};font-size:14px;font-weight:600;vertical-align:top;white-space:pre-wrap;word-break:break-word;">${esc(v)}</td></tr>`).join('')}</table></td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="gh-btn" style="border-collapse:separate;margin:0 0 18px;"><tr><td align="center" bgcolor="#111111" style="background-color:#111111;border:1px solid #111111;border-radius:8px;"><a href="${url(o.adminUrl)}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;"><span class="gh-gm-s"><span class="gh-gm-d">Open the ticket</span></span></a></td></tr></table></div>`;
  const text = [subject, '', ...rows.map(([k, v]) => `${k}: ${v}`), '', `Open the ticket: ${o.adminUrl}`].join('\n');
  return { subject, html, text };
}
