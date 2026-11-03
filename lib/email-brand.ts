// GlobalHostia branded WHMCS email design (pure module: no imports, so it runs in Next, in
// node --experimental-strip-types tests and in scripts/gen-email-sql.mjs).
//
// WHMCS builds every email as: Email Global Header (with [EmailCSS] replaced by the Email CSS)
// + template body + Email Global Footer. We own those three values (setting names EmailCSS,
// EmailGlobalHeader, EmailGlobalFooter) and the bodies of the main client-facing templates.
//
// Rules this file follows:
// - Table layout, 600px max, fluid below that; critical styles inline so the email still looks
//   right if a client drops the <style> block.
// - Dark mode: color-scheme metas + @media (prefers-color-scheme: dark) + [data-ogsc]/[data-ogsb]
//   (Outlook.com / Outlook apps) + the Gmail blend-mode hack on button text (u + .body).
// - Every "{" in CSS is followed by a space: WHMCS runs emails through Smarty, whose auto-literal
//   rule only ignores braces followed by whitespace.
// - Only standard WHMCS merge fields in bodies. Ticket subjects keep "[Ticket ID: {$ticket_id}]"
//   so email piping still matches replies to tickets.

export const EMAIL_DESIGN_VERSION = 'gh-email v2-mono';

export const BRAND = {
  name: 'GlobalHostia',
  company: 'GlobalHostia',
  city: 'Dubai, United Arab Emirates',
  site: 'https://globalhostia.com',
  clientArea: 'https://my.globalhostia.com',
  support: 'support@globalhostia.com',
  phone: '+971 50 734 1578',
  whatsapp: 'https://wa.me/971507341578',
  logoOnDark: 'https://globalhostia.com/email/logo-on-dark@2x.png',
  logoOnLight: 'https://globalhostia.com/email/logo-tile@2x.png',
} as const;

const CA = BRAND.clientArea;
export const LINKS = {
  clientArea: `${CA}/clientarea.php`,
  services: `${CA}/clientarea.php?action=services`,
  domains: `${CA}/clientarea.php?action=domains`,
  invoices: `${CA}/clientarea.php?action=invoices`,
  ticket: `${CA}/submitticket.php`,
  tickets: `${CA}/supporttickets.php`,
  knowledge: `${BRAND.site}/help-center`,
  hosting: `${BRAND.site}/web-hosting`,
  vps: `${BRAND.site}/vps-hosting`,
  domainsSite: `${BRAND.site}/domains-registration`,
};

// Theme tokens from public/hp/theme.css ("Hostpen Modern").
// v2: clean monochrome. Black/grey on white, no accent colours, so every client (and every dark-mode inversion) stays readable.
const C = {
  ink: '#222222', deep: '#111111', deep2: '#1a1a1a', brand: '#111111', brandD: '#111111', brandL: '#555555', gold: '#111111',
  tint: '#f5f5f5', line: '#e5e5e5', line2: '#d4d4d4', muted: '#666666', white: '#ffffff', ok: '#111111', wa: '#111111',
};
// Dark palette (mono, >= 4.5:1 contrast).
const D = { page: '#111111', head: '#111111', card: '#1a1a1a', panel: '#222222', line: '#333333', text: '#eeeeee', mute: '#b3b3b3', link: '#ffffff', faint: '#9a9a9a' };

const FONT_HEAD = `Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_BODY = `Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

// ---------------------------------------------------------------- CSS
type Rule = [selector: string, decls: string];

const DARK_RULES: Rule[] = [
  ['.gh-body, .body', `background-color:${D.page} !important;`],
  ['.gh-head', `background-color:${D.head} !important;`],
  ['.gh-card', `background-color:${D.card} !important;`],
  ['.gh-content, .gh-content p, .gh-content li, .gh-content td', `color:${D.text} !important;`],
  ['.gh-content h1, .gh-content h2, .gh-content h3, .gh-v', `color:#ffffff !important;`],
  ['.gh-content a, .gh-link', `color:${D.link} !important;`],
  ['.gh-muted, .gh-k, .gh-small', `color:${D.mute} !important;`],
  ['.gh-panel, .gh-panel td', `background-color:${D.panel} !important; border-color:${D.line} !important;`],
  ['.gh-quote', `background-color:${D.panel} !important; border-color:${C.brandL} !important;`],
  ['.gh-hr', `border-color:${D.line} !important;`],
  ['.gh-code', `background-color:${D.head} !important; color:${D.text} !important; border-color:${D.line} !important;`],
  ['.gh-btn td', `background-color:#ffffff !important; border-color:#ffffff !important;`],
  ['.gh-btn a, .gh-btn span', `color:#111111 !important;`],
  ['.gh-badge', `background-color:${D.panel} !important; color:${D.text} !important;`],
  ['.gh-head', `border-color:${D.line} !important;`],
  ['.gh-btn-ghost td', `border-color:${D.line} !important; background-color:transparent !important;`],
  ['.gh-btn-ghost a', `color:${D.text} !important;`],
  ['.gh-foot, .gh-foot p, .gh-foot td', `color:${D.faint} !important;`],
  ['.gh-foot a', `color:#dddddd !important;`],
  ['.gh-help-title', `color:#ffffff !important;`],
];

/** Dark-mode declarations as plain CSS (for the media query, Outlook hooks and the forced-dark preview). */
const darkBlock = (prefix = '') => DARK_RULES.map(([s, d]) => `${s.split(',').map((x) => `${prefix}${x.trim()}`).join(', ')} { ${d} }`).join('\n');

const dropEmpty = (css: string) => css.split('\n').filter((l) => !/\{\s*\}$/.test(l)).join('\n');

export function emailCss(opts: { forceDark?: boolean } = {}): string {
  const base = `
/* ${EMAIL_DESIGN_VERSION} - GlobalHostia email styling. Edit in globalhostia.com/admin/emails */
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: ${C.tint}; }
table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; max-width: 100%; height: auto; }
a[x-apple-data-detectors], #MessageViewBody a { color: inherit !important; text-decoration: none !important; font: inherit !important; }
.gh-content { font-family: ${FONT_BODY}; font-size: 16px; line-height: 1.6; color: ${C.ink}; }
.gh-content p { margin: 0 0 16px; }
.gh-content h1 { font-family: ${FONT_HEAD}; font-size: 26px; line-height: 1.25; font-weight: 800; letter-spacing: -0.02em; color: ${C.deep}; margin: 0 0 14px; }
.gh-content h2 { font-family: ${FONT_HEAD}; font-size: 20px; line-height: 1.3; font-weight: 700; color: ${C.deep}; margin: 28px 0 10px; }
.gh-content h3 { font-family: ${FONT_HEAD}; font-size: 16px; line-height: 1.4; font-weight: 700; color: ${C.deep}; margin: 22px 0 8px; }
.gh-content a { color: ${C.brandD}; font-weight: 600; text-decoration: underline; }
.gh-content ul, .gh-content ol { margin: 0 0 16px; padding-left: 22px; }
.gh-content li { margin: 0 0 6px; }
.gh-content blockquote, .gh-quote { margin: 0 0 20px; padding: 14px 18px; background-color: ${C.tint}; border-left: 3px solid ${C.brand}; border-radius: 0 10px 10px 0; }
.gh-content hr, .gh-hr { border: 0; border-top: 1px solid ${C.line}; margin: 24px 0; }
.gh-content pre, .gh-content code, .gh-code { font-family: SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; background-color: ${C.tint}; border: 1px solid ${C.line}; border-radius: 6px; padding: 2px 6px; word-break: break-all; }
.gh-content table { max-width: 100%; }
.gh-muted, .gh-small { color: ${C.muted}; }
.gh-small { font-size: 13px; line-height: 1.55; }
.gh-center { text-align: center; }
.gh-panel { background-color: ${C.tint}; border: 1px solid ${C.line}; border-radius: 12px; margin: 0 0 20px; }
.gh-k { color: ${C.muted}; font-size: 14px; padding: 7px 12px 7px 0; vertical-align: top; white-space: nowrap; }
.gh-v { color: ${C.deep}; font-size: 15px; font-weight: 600; padding: 7px 0; vertical-align: top; word-break: break-word; }
.gh-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; background-color: #eeeeee; color: ${C.deep}; font-size: 12px; font-weight: 700; }
/* Legacy / editor classes so older template bodies inherit the brand */
.gh-content a.button, .gh-content a.btn, .gh-content a.btn-primary { display: inline-block; padding: 12px 22px; background-color: ${C.brand}; color: #ffffff !important; border-radius: 8px; text-decoration: none; }
#templateContainer, #templateBody, .bodyContent { background-color: transparent; border: 0; width: 100%; }
/* Mobile */
@media only screen and (max-width: 620px) {
  .gh-outer { padding: 0 !important; }
  .gh-head, .gh-help { border-radius: 0 !important; }
  .gh-head { padding: 18px 20px !important; }
  .gh-pad { padding: 28px 20px !important; }
  .gh-help { padding: 0 20px 28px !important; }
  .gh-foot { padding: 22px 20px 30px !important; }
  .gh-content h1 { font-size: 23px !important; }
  .gh-btn, .gh-btn-ghost { width: 100% !important; }
  .gh-btn td, .gh-btn-ghost td { display: block !important; width: 100% !important; text-align: center !important; }
  .gh-btn a, .gh-btn-ghost a { display: block !important; }
  .gh-kv td { display: block !important; width: 100% !important; padding: 0 !important; }
  .gh-kv .gh-k { padding-top: 8px !important; }
  .gh-kv .gh-v { padding-bottom: 6px !important; }
  .gh-stack { display: block !important; width: 100% !important; }
  .gh-stack-gap { padding: 0 0 10px !important; }
  .gh-logo { width: 150px !important; }
}
/* Dark mode: Apple Mail, iOS Mail, Outlook for Mac, Thunderbird, Samsung Mail */
@media (prefers-color-scheme: dark) {
${darkBlock()}
}
/* Dark mode: Outlook.com and Outlook apps */
${dropEmpty(darkBlock('[data-ogsc] ').replace(/background-color:[^;]+ !important;/g, ''))}
${dropEmpty(darkBlock('[data-ogsb] ').replace(/(?<![-\w])color:[^;]+ !important;/g, ''))}
/* Gmail (u + .body): keep white button text white when Gmail inverts colours */
u + .body .gh-gm-s { background-color: #000000; mix-blend-mode: screen; }
u + .body .gh-gm-d { background-color: #000000; mix-blend-mode: difference; }
`;
  const css = opts.forceDark ? `${base}\n@media all {\n${darkBlock()}\n}` : base;
  return css.trim().replace(/\{(?=\S)/g, '{ ');
}

// ---------------------------------------------------------------- header / footer
export function globalHeader(): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${BRAND.name}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>td,th,div,p,a,h1,h2,h3 { font-family: 'Segoe UI', Arial, sans-serif !important; }</style><![endif]-->
<style type="text/css">
[EmailCSS]
</style>
</head>
<body class="body gh-body" style="margin:0;padding:0;width:100%;background-color:${C.tint};">
<!-- ${EMAIL_DESIGN_VERSION} -->
<div role="article" aria-roledescription="email" lang="en" class="gh-body" style="background-color:${C.tint};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-body" bgcolor="${C.tint}" style="background-color:${C.tint};">
<tr><td align="center" class="gh-outer" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" align="center" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-wrap" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td class="gh-head" bgcolor="#ffffff" style="background-color:#ffffff;padding:22px 32px;border-radius:14px 14px 0 0;border-bottom:1px solid ${C.line};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="left" valign="middle"><a href="${BRAND.site}" target="_blank" style="text-decoration:none;"><img class="gh-logo gh-logo-l" src="${BRAND.logoOnLight}" width="176" alt="${BRAND.name}" style="display:block;width:176px;max-width:176px;height:auto;border:0;color:#ffffff;font:700 20px ${FONT_HEAD};"></a></td>
<td align="right" valign="middle" style="font-family:${FONT_BODY};font-size:13px;line-height:1;"><a href="${LINKS.clientArea}" target="_blank" class="gh-link" style="color:${C.deep};font-weight:600;text-decoration:none;white-space:nowrap;">Client area &rarr;</a></td>
</tr></table>
</td></tr>
<tr><td class="gh-card gh-content gh-pad" bgcolor="#ffffff" style="background-color:#ffffff;padding:36px 40px 12px;font-family:${FONT_BODY};font-size:16px;line-height:1.6;color:${C.ink};">
`;
}

export function globalFooter(): string {
  return `
</td></tr>
<tr><td class="gh-card gh-help" bgcolor="#ffffff" style="background-color:#ffffff;padding:0 40px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;">
<tr><td style="padding:18px 20px;font-family:${FONT_BODY};">
<p class="gh-help-title" style="margin:0 0 4px;font-family:${FONT_HEAD};font-size:16px;font-weight:700;color:${C.deep};">Need a hand? We're here 24/7.</p>
<p class="gh-muted" style="margin:0 0 14px;font-size:14px;line-height:1.5;color:${C.muted};">Real engineers, not bots. Message us on WhatsApp or open a ticket and we'll reply fast.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="gh-stack gh-stack-gap" valign="top" style="padding:0 10px 0 0;white-space:nowrap;">${button(BRAND.whatsapp, 'Chat on WhatsApp', 'wa')}</td>
<td class="gh-stack" valign="top" style="padding:0;white-space:nowrap;">${button(LINKS.ticket, 'Open a ticket', 'ghost')}</td>
</tr></table>
</td></tr></table>
</td></tr>
<tr><td class="gh-card" bgcolor="#ffffff" style="background-color:#ffffff;padding:0 40px 30px;border-radius:0 0 14px 14px;">
<p class="gh-help-title" style="margin:0 0 10px;font-family:${FONT_HEAD};font-size:15px;font-weight:700;color:${C.deep};">Everything for your business online</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${[['Domains', 'Find your name', LINKS.domainsSite], ['Web hosting', 'Fast, secure, 24/7', LINKS.hosting], ['Business email', 'you@yourbrand.com', `${BRAND.site}/google-workspace`], ['VPS & servers', 'Full control', LINKS.vps]].map(([t, d, u]) => `<td class="gh-stack" width="25%" valign="top" style="padding:0 8px 10px 0;font-family:${FONT_BODY};"><a href="${u}" target="_blank" class="gh-link" style="color:${C.deep};font-weight:700;font-size:14px;text-decoration:none;">${t} &rarr;</a><br><span class="gh-muted" style="font-size:12.5px;color:${C.muted};">${d}</span></td>`).join('')}
</tr></table>
</td></tr>
<tr><td class="gh-foot" align="center" style="padding:26px 32px 34px;font-family:${FONT_BODY};font-size:12.5px;line-height:1.7;color:${C.muted};text-align:center;">
<p style="margin:0 0 10px;">
<a href="${BRAND.site}" target="_blank" style="color:${C.ink};font-weight:600;text-decoration:none;">globalhostia.com</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
<a href="${LINKS.clientArea}" target="_blank" style="color:${C.ink};font-weight:600;text-decoration:none;">Client area</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
<a href="${LINKS.knowledge}" target="_blank" style="color:${C.ink};font-weight:600;text-decoration:none;">Help center</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
<a href="${BRAND.whatsapp}" target="_blank" style="color:${C.ink};font-weight:600;text-decoration:none;">WhatsApp</a>
</p>
<p style="margin:0 0 6px;">Support: <a href="mailto:${BRAND.support}" style="color:${C.ink};text-decoration:none;">${BRAND.support}</a> &nbsp;&middot;&nbsp; ${BRAND.phone}</p>
<p style="margin:0 0 6px;">Web hosting &middot; VPS &amp; dedicated servers &middot; Domains &middot; SSL &middot; Business email</p>
<p style="margin:0;">&copy; ${BRAND.name} &middot; ${BRAND.city}.<br>You received this email because of an account or order with ${BRAND.name}.</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</div>
</body>
</html>`;
}

// ---------------------------------------------------------------- body building blocks
const esc = (s: string) => s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bulletproof button: padded <a> inside a bgcolor cell, mso-padding-alt for Outlook, Gmail blend spans. */
export function button(href: string, label: string, kind: 'brand' | 'wa' | 'ghost' = 'brand'): string {
  const bg = kind === 'brand' ? C.brand : kind === 'wa' ? C.wa : '#ffffff';
  const fg = kind === 'ghost' ? C.ink : '#ffffff';
  const border = kind === 'ghost' ? C.line2 : bg;
  const cls = kind === 'ghost' ? 'gh-btn-ghost' : 'gh-btn';
  const text = kind === 'ghost' ? esc(label) : `<span class="gh-gm-s"><span class="gh-gm-d">${esc(label)}</span></span>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="${cls}" style="border-collapse:separate;"><tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${border};border-radius:8px;mso-padding-alt:12px 22px;"><a href="${href}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT_BODY};font-size:15px;font-weight:600;line-height:1.2;color:${fg};text-decoration:none;border-radius:8px;white-space:nowrap;">${text}</a></td></tr></table>`;
}

const h1 = (s: string) => `<h1 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:26px;line-height:1.25;font-weight:800;color:${C.deep};">${s}</h1>`;
const h2 = (s: string) => `<h2 style="margin:28px 0 10px;font-family:${FONT_HEAD};font-size:19px;line-height:1.3;font-weight:700;color:${C.deep};">${s}</h2>`;
const p = (s: string, cls = '') => `<p${cls ? ` class="${cls}"` : ''} style="margin:0 0 16px;${cls.includes('gh-small') ? `font-size:13px;line-height:1.55;color:${C.muted};` : ''}">${s}</p>`;
const ul = (items: string[]) => `<ul style="margin:0 0 16px;padding-left:22px;">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join('')}</ul>`;
const cta = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 24px;"><tr><td align="left">${button(href, label)}</td></tr></table>`;
const hi = (name = '{$client_first_name}') => p(`Hi ${name},`);
const signoff = () => p(`Thanks for choosing ${BRAND.name},<br><strong>The ${BRAND.name} Team</strong>`);

/** Key/value panel. A row whose value is wrapped in {if}..{/if} by `opt` only shows when the field has a value. */
type Row = [label: string, value: string, optionalField?: string];
function panel(rows: Row[], title?: string): string {
  const tr = ([k, v, f]: Row) => {
    const row = `<tr><td class="gh-k" width="38%" style="padding:7px 12px 7px 0;color:${C.muted};font-size:14px;vertical-align:top;">${k}</td><td class="gh-v" style="padding:7px 0;color:${C.deep};font-size:15px;font-weight:600;vertical-align:top;word-break:break-word;">${v}</td></tr>`;
    return f ? `{if $${f}}${row}{/if}` : row;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 20px;"><tr><td style="padding:14px 20px;">${title ? `<p style="margin:2px 0 6px;font-family:${FONT_HEAD};font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.brandD};">${title}</p>` : ''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-kv">${rows.map(tr).join('')}</table></td></tr></table>`;
}
const quote = (s: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td class="gh-quote" style="padding:14px 18px;background-color:${C.tint};border-left:3px solid ${C.brand};border-radius:0 10px 10px 0;">${s}</td></tr></table>`;

// ---------------------------------------------------------------- template bodies
export type TemplateDef = { name: string; type: string; group: string; subject: string; message: string; purpose: string };

const billing: Row[] = [
  ['First payment', '{$service_first_payment_amount}', 'service_first_payment_amount'],
  ['Renews at', '{$service_recurring_amount} &middot; {$service_billing_cycle}', 'service_recurring_amount'],
  ['Next due date', '{$service_next_due_date}', 'service_next_due_date'],
];
const securityNote = p('For your security, change this password after your first login and never share it. Our team will never ask you for your password.', 'gh-small');

export const TEMPLATES: TemplateDef[] = [
  // ----- account & orders
  { name: 'Client Signup Email', type: 'general', group: 'Account', purpose: 'New customer account created',
    subject: `Welcome to ${BRAND.name}, {$client_first_name}`,
    message: [h1(`Welcome to ${BRAND.name}`), hi(),
      p('Your account is ready. From your client area you can order hosting, register domains, pay invoices and reach our support team any time.'),
      panel([['Login email', '{$client_email}'], ['Client area', `<a href="${LINKS.clientArea}" style="color:${C.brandD};">my.globalhostia.com</a>`]]),
      cta(LINKS.clientArea, 'Go to your client area'),
      h2('Popular next steps'),
      ul([`<a href="${LINKS.domainsSite}">Find and register your domain</a>`, `<a href="${LINKS.hosting}">Launch a website with fast web hosting</a>`, `<a href="${LINKS.vps}">Deploy a VPS, Forex VPS or AI server</a>`]),
      signoff()].join('\n') },
  { name: 'Order Confirmation', type: 'general', group: 'Account', purpose: 'Order placed',
    subject: `Order #{$order_number} received - thank you`,
    message: [h1('We have your order'), hi(),
      p('Thanks for your order. Here is a summary. As soon as payment is confirmed we start setting everything up, and you will get a separate email with your access details.'),
      panel([['Order number', '#{$order_number}']]),
      `<div style="margin:0 0 20px;">{$order_details}</div>`,
      cta(LINKS.invoices, 'View invoice & pay'),
      p('Questions about this order? Just reply to this email.', 'gh-small'), signoff()].join('\n') },
  { name: 'Password Reset Validation', type: 'general', group: 'Account', purpose: 'Password reset link',
    subject: `Reset your ${BRAND.name} password`,
    message: [h1('Reset your password'), hi(),
      p(`We received a request to reset the password for your ${BRAND.name} account. Use the button below to choose a new one. The link works once and expires shortly.`),
      cta('{$pw_reset_url}', 'Choose a new password'),
      p('If the button does not work, copy this link into your browser:<br><span class="gh-code" style="word-break:break-all;">{$pw_reset_url}</span>', 'gh-small'),
      p(`Did not ask for this? You can ignore this email; your password stays the same. If you keep getting these, contact us at <a href="mailto:${BRAND.support}">${BRAND.support}</a>.`, 'gh-small'),
      signoff()].join('\n') },
  { name: 'Password Reset Confirmation', type: 'general', group: 'Account', purpose: 'Password changed',
    subject: `Your ${BRAND.name} password was changed`,
    message: [h1('Password changed'), hi(),
      p(`The password for your ${BRAND.name} account was just changed. If this was you, there is nothing else to do.`),
      p(`<strong>Was not you?</strong> Reset your password straight away and contact us on WhatsApp or at <a href="mailto:${BRAND.support}">${BRAND.support}</a> so we can secure your account.`),
      cta(LINKS.clientArea, 'Go to your client area'), signoff()].join('\n') },

  // ----- product welcome emails
  { name: 'Hosting Account Welcome Email', type: 'product', group: 'Welcome emails', purpose: 'Shared / web hosting activated',
    subject: `Your hosting for {$service_domain} is ready`,
    message: [h1('Your hosting is live'), hi(),
      p('Your <strong>{$service_product_name}</strong> plan is active. Everything you need to get your website online is below. Keep this email somewhere safe.'),
      panel([['Plan', '{$service_product_name}'], ['Domain', '{$service_domain}'], ['Username', '{$service_username}', 'service_username'], ['Password', '{$service_password}', 'service_password'], ['Server', '{$service_server_hostname}', 'service_server_hostname'], ['Server IP', '{$service_server_ip}', 'service_server_ip']], 'Login details'),
      panel([['Nameserver 1', '{$service_ns1}', 'service_ns1'], ['Nameserver 2', '{$service_ns2}', 'service_ns2'], ['Nameserver 3', '{$service_ns3}', 'service_ns3'], ['Nameserver 4', '{$service_ns4}', 'service_ns4']], 'Point your domain'),
      p('If your domain is registered elsewhere, set its nameservers to the ones above at your registrar. DNS changes can take a few hours to reach everyone.', 'gh-small'),
      cta(LINKS.services, 'Open your hosting dashboard'),
      h2('Get started in minutes'),
      ul(['Log in to your control panel with one click from the client area (Services &rarr; your plan).', 'Install WordPress or upload your site files.', 'Create business email addresses on your own domain.', 'Your free SSL certificate is issued automatically once the domain points to us.']),
      panel(billing, 'Billing'), securityNote, signoff()].join('\n') },
  { name: 'Reseller Account Welcome Email', type: 'product', group: 'Welcome emails', purpose: 'Reseller hosting activated',
    subject: `Your reseller hosting is ready - {$service_product_name}`,
    message: [h1('Your reseller account is live'), hi(),
      p('Your <strong>{$service_product_name}</strong> reseller plan is active. You can now create hosting accounts for your own customers under your brand.'),
      panel([['Plan', '{$service_product_name}'], ['Main domain', '{$service_domain}'], ['Username', '{$service_username}', 'service_username'], ['Password', '{$service_password}', 'service_password'], ['Server', '{$service_server_hostname}', 'service_server_hostname'], ['Server IP', '{$service_server_ip}', 'service_server_ip'], ['Nameserver 1', '{$service_ns1}', 'service_ns1'], ['Nameserver 2', '{$service_ns2}', 'service_ns2']], 'Login details'),
      cta(LINKS.services, 'Open your reseller dashboard'),
      ul(['Log in to the reseller control panel from the client area with one click.', 'Create hosting packages, then accounts for your clients.', 'Use the nameservers above (or your own branded ones) for client domains.']),
      panel(billing, 'Billing'), securityNote, signoff()].join('\n') },
  { name: 'Dedicated/VPS Server Welcome Email', type: 'product', group: 'Welcome emails', purpose: 'VPS, Forex VPS, AI/LLM or dedicated server online',
    subject: `Your server is online - {$service_product_name}`,
    message: [h1('Your server is online'), hi(),
      p('Your <strong>{$service_product_name}</strong> has been provisioned and is ready to use. Here are your access details.'),
      panel([['Server', '{$service_product_name}'], ['Hostname', '{$service_domain}', 'service_domain'], ['Main IP', '{$service_dedicated_ip}', 'service_dedicated_ip'], ['Additional IPs', '{$service_assigned_ips}', 'service_assigned_ips'], ['Username', '{$service_username}', 'service_username'], ['Password', '{$service_password}', 'service_password']], 'Access details'),
      p('Connect over SSH (Linux) with <span class="gh-code">ssh {$service_username}@{$service_dedicated_ip}</span>, or with Remote Desktop for Windows servers.', 'gh-small'),
      cta(LINKS.services, 'Manage your server'),
      h2('First things to do'),
      ul(['Change the password and add your SSH key.', 'Install the latest system updates.', 'Reboot, reinstall the OS or view usage from the client area at any time.', 'Need managed help (setup, firewall, MT4/MT5, AI models)? Open a ticket and we will take care of it.']),
      panel(billing, 'Billing'), securityNote, signoff()].join('\n') },
  { name: 'Other Product/Service Welcome Email', type: 'product', group: 'Welcome emails', purpose: 'Other services: n8n automation, project workspaces, email, licences',
    subject: `{$service_product_name} is active`,
    message: [h1('Your service is active'), hi(),
      p('Good news: <strong>{$service_product_name}</strong> is now active on your account.'),
      panel([['Service', '{$service_product_name}'], ['Domain / URL', '{$service_domain}', 'service_domain'], ['Username', '{$service_username}', 'service_username'], ['Password', '{$service_password}', 'service_password'], ['Server IP', '{$service_dedicated_ip}', 'service_dedicated_ip']], 'Service details'),
      cta(LINKS.services, 'Open in client area'),
      p('Setup notes, documentation and any extra login links for this service are in your client area under <strong>Services</strong>. If something is not working as expected, our team can help 24/7.'),
      panel(billing, 'Billing'), signoff()].join('\n') },
  { name: 'SSL Certificate Configuration Required', type: 'product', group: 'Welcome emails', purpose: 'SSL certificate ordered, needs configuration',
    subject: `Action needed: set up your SSL certificate`,
    message: [h1('One step to activate your SSL'), hi(),
      p('Thank you for ordering <strong>{$service_product_name}</strong>. Before the certificate can be issued, it needs to be configured: submit your CSR, confirm the domain and choose how you will validate ownership.'),
      panel([['Certificate', '{$service_product_name}'], ['Domain', '{$service_domain}', 'service_domain']]),
      cta(LINKS.services, 'Configure your certificate'),
      p('Direct configuration link: {$ssl_configuration_link}', 'gh-small'),
      p('Hosting your site with us? Open a ticket and we will generate the CSR and install the certificate for you, free.'), signoff()].join('\n') },

  // ----- domains
  { name: 'Domain Registration Confirmation', type: 'domain', group: 'Domains', purpose: 'Domain registered',
    subject: `{$domain_name} is registered`,
    message: [h1('Your domain is registered'), hi(),
      p('Congratulations, <strong>{$domain_name}</strong> is now yours.'),
      panel([['Domain', '{$domain_name}'], ['Registered on', '{$domain_reg_date}', 'domain_reg_date'], ['Period', '{$domain_reg_period}', 'domain_reg_period'], ['Amount', '{$domain_first_payment_amount}', 'domain_first_payment_amount'], ['Next due date', '{$domain_next_due_date}', 'domain_next_due_date']]),
      cta(LINKS.domains, 'Manage your domain'),
      h2('What next?'),
      ul([`Connect it to <a href="${LINKS.hosting}">web hosting</a> and create email addresses on your domain.`, 'Manage nameservers, DNS and contacts from the client area.', 'Auto-renew is on by default so you never lose the name.']),
      p('ICANN may email the registrant to verify contact details. Please click the link in that email within 15 days, otherwise the domain can be suspended.', 'gh-small'), signoff()].join('\n') },
  { name: 'Domain Transfer Initiated', type: 'domain', group: 'Domains', purpose: 'Domain transfer started',
    subject: `Transfer started for {$domain_name}`,
    message: [h1('Your domain transfer has started'), hi(),
      p('We have started moving <strong>{$domain_name}</strong> to ' + BRAND.name + '. Most transfers finish within 5 to 7 days.'),
      h2('Help it go faster'),
      ul(['Make sure the domain is unlocked at your current registrar.', 'Check the EPP / authorisation code you gave us is correct.', 'Approve the transfer if your current registrar emails you about it.']),
      cta(LINKS.domains, 'Track the transfer'),
      p('Your website and email keep working during the transfer; nameservers do not change unless you change them.', 'gh-small'), signoff()].join('\n') },
  { name: 'Domain Renewal Confirmation', type: 'domain', group: 'Domains', purpose: 'Domain renewed',
    subject: `{$domain_name} has been renewed`,
    message: [h1('Domain renewed'), hi(),
      p('<strong>{$domain_name}</strong> has been renewed successfully. No action needed.'),
      panel([['Domain', '{$domain_name}'], ['Renewed for', '{$domain_reg_period}', 'domain_reg_period'], ['Next due date', '{$domain_next_due_date}', 'domain_next_due_date']]),
      cta(LINKS.domains, 'View your domains'), signoff()].join('\n') },

  // ----- invoices
  ...invoiceTemplates(),

  // ----- support
  { name: 'Support Ticket Opened', type: 'support', group: 'Support', purpose: 'Customer opened a ticket',
    subject: `[Ticket ID: {$ticket_id}] {$ticket_subject}`,
    message: [h1('We have your request'), hi('{$client_name}'),
      p('Thanks for contacting ' + BRAND.name + ' support. Your ticket is with our team and we will reply as soon as possible, usually within the hour.'),
      panel([['Ticket', '#{$ticket_id}'], ['Subject', '{$ticket_subject}'], ['Department', '{$ticket_department}', 'ticket_department'], ['Priority', '{$ticket_priority}', 'ticket_priority'], ['Status', '{$ticket_status}', 'ticket_status']]),
      cta('{$ticket_url}', 'View your ticket'),
      p('To add details, simply reply to this email and keep the ticket number in the subject.', 'gh-small'), signoff()].join('\n') },
  { name: 'Support Ticket Opened by Admin', type: 'support', group: 'Support', purpose: 'Staff opened a ticket for the customer',
    subject: `[Ticket ID: {$ticket_id}] {$ticket_subject}`,
    message: [h1('A message from our team'), hi('{$client_name}'),
      p('Our team has opened a support ticket for you:'),
      quote('{$ticket_message}'),
      panel([['Ticket', '#{$ticket_id}'], ['Department', '{$ticket_department}', 'ticket_department']]),
      cta('{$ticket_url}', 'View & reply'),
      p('You can also reply directly to this email.', 'gh-small'), signoff()].join('\n') },
  { name: 'Support Ticket Reply', type: 'support', group: 'Support', purpose: 'Staff replied to a ticket',
    subject: `[Ticket ID: {$ticket_id}] {$ticket_subject}`,
    message: [h1('New reply on your ticket'), hi('{$client_name}'),
      quote('{$ticket_message}'),
      panel([['Ticket', '#{$ticket_id}'], ['Status', '{$ticket_status}', 'ticket_status']]),
      cta('{$ticket_url}', 'View the conversation'),
      p('Reply to this email to answer us. Keep the ticket number in the subject so it reaches the right engineer.', 'gh-small'), signoff()].join('\n') },
  { name: 'Support Ticket Auto Close Notification', type: 'support', group: 'Support', purpose: 'Ticket closed after no reply',
    subject: `[Ticket ID: {$ticket_id}] Closed: {$ticket_subject}`,
    message: [h1('Your ticket has been closed'), hi('{$client_name}'),
      p('We have not heard back for a while, so ticket <strong>#{$ticket_id}</strong> ({$ticket_subject}) has been closed. We hope everything is working well.'),
      p('Still need help? Reply to this email and the ticket reopens automatically, or open a new one.'),
      cta('{$ticket_url}', 'View ticket'), signoff()].join('\n') },
];

function invoiceTemplates(): TemplateDef[] {
  const inv = (extra: Row[] = []): string => panel([['Invoice', '#{$invoice_num}'], ['Issued', '{$invoice_date_created}'], ['Due date', '{$invoice_date_due}'], ['Amount due', '{$invoice_balance}'], ['Payment method', '{$invoice_payment_method}', 'invoice_payment_method'], ...extra]);
  const items = `<div style="margin:0 0 20px;">{$invoice_html_contents}</div>`;
  const pay = cta('{$invoice_link}', 'Pay invoice securely');
  const def = (name: string, purpose: string, subject: string, title: string, lead: string, after = ''): TemplateDef =>
    ({ name, type: 'invoice', group: 'Invoices & billing', purpose, subject, message: [h1(title), hi(), p(lead), inv(), items, pay, after, signoff()].filter(Boolean).join('\n') });
  return [
    def('Invoice Created', 'New invoice', `Invoice #{$invoice_num} - due {$invoice_date_due}`, 'Your new invoice',
      'A new invoice has been generated for your ' + BRAND.name + ' services. Paying before the due date keeps everything running without interruption.',
      p('Paid already, or set up automatic payment? You can ignore this email.', 'gh-small')),
    { name: 'Invoice Payment Confirmation', type: 'invoice', group: 'Invoices & billing', purpose: 'Payment received',
      subject: `Payment received - invoice #{$invoice_num}`,
      message: [h1('Payment received, thank you'), hi(),
        p('We have received your payment. Your receipt is below and the invoice is in your client area.'),
        panel([['Invoice', '#{$invoice_num}'], ['Amount paid', '{$invoice_last_payment_amount}', 'invoice_last_payment_amount'], ['Transaction ID', '{$invoice_last_payment_transid}', 'invoice_last_payment_transid'], ['Balance', '{$invoice_balance}'], ['Status', '{$invoice_status}']]),
        items, cta('{$invoice_link}', 'View receipt'), signoff()].join('\n') },
    def('Invoice Payment Reminder', 'Friendly reminder before due date', `Reminder: invoice #{$invoice_num} is due {$invoice_date_due}`, 'A friendly reminder',
      'This is a reminder that the invoice below is due soon. Paying on time keeps your services and domains active.'),
    def('First Invoice Overdue Notice', 'Overdue notice 1', `Overdue: invoice #{$invoice_num}`, 'Your invoice is overdue',
      'We have not received payment for the invoice below, which was due on {$invoice_date_due}. Please pay it as soon as possible to avoid any interruption.',
      p('Having trouble paying? Reply to this email and we will help.', 'gh-small')),
    def('Second Invoice Overdue Notice', 'Overdue notice 2', `Second notice: invoice #{$invoice_num} is overdue`, 'Second overdue notice',
      'Invoice #{$invoice_num} is still unpaid. Services linked to an unpaid invoice can be <strong>suspended</strong> automatically, so please settle it today.'),
    def('Third Invoice Overdue Notice', 'Overdue notice 3 (final)', `Final notice: invoice #{$invoice_num} - suspension risk`, 'Final notice before suspension',
      'Invoice #{$invoice_num} remains unpaid. To keep your websites, servers, email and domains online, please pay now. Suspended services may be terminated, and expired domains can be lost.',
      p('If you have already paid, please reply with your payment reference and we will update your account.', 'gh-small')),
  ];
}

/** Admin-only templates the SQL keeps enabled (never rewritten). */
export const ADMIN_KEEP_ENABLED = ['Support Ticket Created', 'Support Ticket Response'];

// ---------------------------------------------------------------- previews
export const SAMPLE: Record<string, string> = {
  client_name: 'Aisha Rahman', client_first_name: 'Aisha', client_email: 'aisha@example.com', company_name: BRAND.name,
  service_product_name: 'Business Hosting', service_domain: 'aisha-studio.com', service_username: 'aishastu', service_password: '••••••••••',
  service_server_hostname: 'srv12.globalhostia.com', service_server_ip: '203.0.113.24', service_dedicated_ip: '203.0.113.24', service_assigned_ips: '',
  service_ns1: 'ns1.globalhostia.com', service_ns2: 'ns2.globalhostia.com', service_ns3: '', service_ns4: '',
  service_first_payment_amount: '$47.88 USD', service_recurring_amount: '$47.88 USD', service_billing_cycle: 'Annually', service_next_due_date: '02/11/2027',
  ssl_configuration_link: 'https://my.globalhostia.com/configuressl.php?cert=…',
  domain_name: 'aisha-studio.com', domain_reg_date: '02/11/2026', domain_reg_period: '1 Year/s', domain_first_payment_amount: '$12.99 USD', domain_next_due_date: '02/11/2027',
  invoice_num: '10482', invoice_date_created: '02/11/2026', invoice_date_due: '09/11/2026', invoice_balance: '$47.88 USD', invoice_total: '$47.88 USD', invoice_payment_method: 'Credit / Debit Card',
  invoice_status: 'Paid', invoice_last_payment_amount: '$47.88 USD', invoice_last_payment_transid: 'ch_3PZ…9xQ', invoice_link: LINKS.invoices,
  invoice_html_contents: '<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;"><tr><td style="padding:6px 0;">Business Hosting - aisha-studio.com (02/11/2026 - 01/11/2027)</td><td align="right" style="padding:6px 0;white-space:nowrap;">$47.88 USD</td></tr></table>',
  order_number: '4829173650', order_details: 'Product/Service: Business Hosting<br>Domain: aisha-studio.com<br>First Payment Amount: $47.88 USD<br>Recurring Amount: $47.88 USD<br>Billing Cycle: Annually',
  pw_reset_url: 'https://my.globalhostia.com/password/reset/redeem/…',
  ticket_id: '482915', ticket_subject: 'Email not sending from Outlook', ticket_department: 'Technical Support', ticket_priority: 'Medium', ticket_status: 'Answered',
  ticket_message: '<p>Hi Aisha, thanks for the details. We have enabled authenticated SMTP on port 587 for your mailbox. Please restart Outlook and try sending again.</p>', ticket_link: LINKS.tickets,
};

/** Fill merge fields and resolve {if $x}..{/if} the way Smarty would for the sample data. */
export function fillSample(html: string, data: Record<string, string> = SAMPLE): string {
  return html
    .replace(/\{if \$(\w+)\}([\s\S]*?)\{\/if\}/g, (_, f, inner) => (data[f] ? inner : ''))
    .replace(/\{\$(\w+)\}/g, (_, f) => data[f] ?? '');
}

export function composeEmail(body: string, opts: { forceDark?: boolean; css?: string; header?: string; footer?: string } = {}): string {
  const header = (opts.header ?? globalHeader()).replace('[EmailCSS]', opts.css ?? emailCss({ forceDark: opts.forceDark }));
  return fillSample(header + body + (opts.footer ?? globalFooter()));
}

export const designValues = () => ({ EmailCSS: emailCss(), EmailGlobalHeader: globalHeader(), EmailGlobalFooter: globalFooter() });
export const DESIGN_KEYS = ['EmailCSS', 'EmailGlobalHeader', 'EmailGlobalFooter'] as const;

// ---------------------------------------------------------------- brand checks
export type Flag = { tone: 'red' | 'yellow' | 'blue' | 'green'; label: string };
const OLD_BRAND = /budget\s*global\s*hosting|budgetglobalhosting/i;
export function templateFlags(t: { name: string; subject?: string; custom?: boolean | number | string }): Flag[] {
  const f: Flag[] = [];
  const subj = String(t.subject || '');
  if (OLD_BRAND.test(subj) || OLD_BRAND.test(t.name)) f.push({ tone: 'red', label: 'Old name: BudgetGlobalHosting' });
  const rewritten = TEMPLATES.some((x) => x.name === t.name);
  if (rewritten) f.push({ tone: 'green', label: 'Rewritten by SQL' });
  else if (subj && !/globalhostia|\{\$company_name\}/i.test(subj) && !/\[Ticket ID/i.test(subj)) f.push({ tone: 'yellow', label: 'Unbranded subject' });
  f.push(String(t.custom) === '1' || t.custom === true ? { tone: 'blue', label: 'Custom' } : { tone: 'blue', label: 'Default' });
  return f;
}
export const hasOldBrand = (v: string) => OLD_BRAND.test(v);

/** Optional brand fixes applied with the design when the current value still carries the old name. */
export const BRAND_SETTINGS: { key: string; fix: string; why: string }[] = [
  { key: 'CompanyName', fix: BRAND.name, why: 'Used as {$company_name} and the email sender' },
  { key: 'SystemEmailsFromName', fix: BRAND.name, why: 'Sender name on system emails' },
  { key: 'Signature', fix: `The ${BRAND.name} Team\n${BRAND.support} | ${BRAND.site}`, why: 'Used as {$signature} in older templates' },
  { key: 'LogoURL', fix: BRAND.logoOnLight, why: 'Logo on invoices / PDFs and the client area' },
];
export const needsBrandFix = (key: string, value: string) => OLD_BRAND.test(value) || (key === 'LogoURL' ? !value || /budget/i.test(value) : !value.trim() && key !== 'Signature');

// ---------------------------------------------------------------- phpMyAdmin SQL
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

export function buildSql(date = new Date()): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replace(/-/g, '');
  const v = designValues();
  const names = TEMPLATES.map((t) => q(t.name)).join(', ');
  const ssl = `(LOWER(servertype) IN ('thesslstore','sslstore','gogetssl','digicertssl','resellerclubssl','enomssl','sectigo','ssl')
     OR (servertype = 'marketconnect' AND LOWER(configoption1) REGEXP 'ssl|digicert|geotrust|rapidssl|sectigo|comodo|thawte')
     OR (type = 'other' AND LOWER(name) REGEXP '(^|[^a-z])ssl([^a-z]|$)'))`;
  const tpl = (name: string) => `(SELECT id FROM tblemailtemplates WHERE name = ${q(name)} AND type <> 'admin' AND (language = '' OR language IS NULL) ORDER BY id LIMIT 1)`;
  return `-- =====================================================================
-- GlobalHostia: branded WHMCS emails + product welcome-email mapping
-- Database: ofgizflz_whmcs   (${EMAIL_DESIGN_VERSION}, generated ${ymd})
--
-- HOW TO RUN: cPanel -> phpMyAdmin -> click database ofgizflz_whmcs ->
--             SQL tab -> paste everything -> Go.
--
-- SAFE BY DESIGN
--  * Step 1 copies tblemailtemplates, tblproducts and the email settings to
--    *_bak_${ymd} tables first. If a backup with today's name already exists
--    the script stops right there and changes NOTHING (run it again tomorrow,
--    or drop the old backup table first).
--  * Only the default-language row of each template is rewritten
--    (language = ''). Translated rows are left untouched.
--  * Admin-only templates are not rewritten; the admin "Support Ticket
--    Created/Response" notifications are only switched ON if disabled.
--  * Only standard WHMCS merge fields are used. Ticket subjects keep
--    "[Ticket ID: ...]" so email replies still thread into tickets.
--
-- UNDO (restores everything from the backups):
--   UPDATE tblemailtemplates t JOIN tblemailtemplates_bak_${ymd} b ON b.id = t.id
--     SET t.subject = b.subject, t.message = b.message, t.disabled = b.disabled, t.plaintext = b.plaintext;
--   UPDATE tblproducts p JOIN tblproducts_bak_${ymd} b ON b.id = p.id SET p.welcomeemail = b.welcomeemail;
--   UPDATE tblconfiguration c JOIN tblconfiguration_bak_${ymd} b ON b.setting = c.setting SET c.value = b.value;
-- =====================================================================

-- 1. Backups (stops here if they already exist)
CREATE TABLE tblemailtemplates_bak_${ymd} AS SELECT * FROM tblemailtemplates;
CREATE TABLE tblproducts_bak_${ymd} AS SELECT * FROM tblproducts;
CREATE TABLE tblconfiguration_bak_${ymd} AS SELECT * FROM tblconfiguration
  WHERE setting IN ('EmailCSS','EmailGlobalHeader','EmailGlobalFooter','CompanyName','SystemEmailsFromName','Signature','LogoURL');

START TRANSACTION;

-- 2. Global email design (same values the admin "Apply branded design" button sets)
UPDATE tblconfiguration SET value = ${q(v.EmailCSS)} WHERE setting = 'EmailCSS';
UPDATE tblconfiguration SET value = ${q(v.EmailGlobalHeader)} WHERE setting = 'EmailGlobalHeader';
UPDATE tblconfiguration SET value = ${q(v.EmailGlobalFooter)} WHERE setting = 'EmailGlobalFooter';
UPDATE tblconfiguration SET value = ${q(BRAND.name)} WHERE setting IN ('CompanyName','SystemEmailsFromName') AND (value = '' OR LOWER(value) LIKE '%budget%');

-- 3. Client-facing template bodies (default language only, HTML mode)
${TEMPLATES.map((t) => `-- ${t.name}  (${t.purpose})
UPDATE tblemailtemplates SET subject = ${q(t.subject)}, plaintext = 0,
  message = ${q(t.message)}
WHERE name = ${q(t.name)} AND type <> 'admin' AND (language = '' OR language IS NULL);`).join('\n\n')}

-- 4. Keep the admin ticket notifications switched on (content untouched)
UPDATE tblemailtemplates SET disabled = 0
WHERE type = 'admin' AND name IN (${ADMIN_KEEP_ENABLED.map(q).join(', ')});

-- 5. Point every product at the right welcome email by product type
SET @t_hosting  = ${tpl('Hosting Account Welcome Email')};
SET @t_reseller = COALESCE(${tpl('Reseller Account Welcome Email')}, @t_hosting);
SET @t_server   = ${tpl('Dedicated/VPS Server Welcome Email')};
SET @t_other    = ${tpl('Other Product/Service Welcome Email')};
SET @t_ssl      = COALESCE(${tpl('SSL Certificate Configuration Required')}, @t_other);

UPDATE tblproducts SET welcomeemail = @t_hosting  WHERE type = 'hostingaccount'  AND @t_hosting  IS NOT NULL;
UPDATE tblproducts SET welcomeemail = @t_reseller WHERE type = 'reselleraccount' AND @t_reseller IS NOT NULL;
UPDATE tblproducts SET welcomeemail = @t_server   WHERE type = 'server'          AND @t_server   IS NOT NULL AND NOT ${ssl};
UPDATE tblproducts SET welcomeemail = @t_other    WHERE type = 'other'           AND @t_other    IS NOT NULL AND NOT ${ssl};
UPDATE tblproducts SET welcomeemail = @t_ssl      WHERE @t_ssl IS NOT NULL AND ${ssl};

COMMIT;

-- 6. Check the result (phpMyAdmin shows these tables)
SELECT p.id, p.name, p.type, p.servertype, t.name AS welcome_email
FROM tblproducts p LEFT JOIN tblemailtemplates t ON t.id = p.welcomeemail
ORDER BY p.type, p.name;

SELECT id, type, name, subject, disabled FROM tblemailtemplates
WHERE (language = '' OR language IS NULL) AND (name IN (${names}) OR (type = 'admin' AND name IN (${ADMIN_KEEP_ENABLED.map(q).join(', ')})))
ORDER BY type, name;
`;
}
