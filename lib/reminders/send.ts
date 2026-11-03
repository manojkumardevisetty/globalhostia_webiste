// Reminders: delivery. Email through WHMCS SendEmail (customtype=general to the client's own account, so mail goes out
// through the owner's existing WHMCS mail setup and lands in the client's WHMCS email history), or through SMTP
// (lib/reminders/smtp.ts) when the owner picks it: SMTP also reaches guests and sets the RFC 8058 one-click
// List-Unsubscribe headers, which WHMCS SendEmail cannot set. WhatsApp through the Cloud API adapter.
import 'server-only';
import { whmcs, whmcsConfigured } from '../whmcs';
import { emailCss, globalFooter, globalHeader } from '../email-brand';
import { smtpFromEnv, sendSmtp } from './smtp';
import { sendTemplate } from './whatsapp';
import { waCreds } from './store';
import type { ReminderConfig, WaKind, Lang } from './core';

/** Full HTML document (header + body + footer of the branded design) for SMTP and the admin preview. */
export function composeFull(body: string, o: { forceDark?: boolean; lang?: Lang } = {}) {
  let head = globalHeader().replace('[EmailCSS]', emailCss({ forceDark: o.forceDark }));
  if (o.lang === 'ar') head = head.replace('<html lang="en"', '<html lang="ar" dir="rtl"');
  return head + body + globalFooter();
}

export const transportReady = (cfg: ReminderConfig) => (cfg.transport === 'smtp' ? !!smtpFromEnv() : whmcsConfigured());
/** Guests (no WHMCS client account yet) can only be emailed over SMTP. */
export const canEmailGuests = (cfg: ReminderConfig) => cfg.transport === 'smtp' && !!smtpFromEnv();

export type Outgoing = { clientId: number | null; to: string; subject: string; html: string; text: string; unsubUrl: string; unsubPost: string; lang: Lang };

export async function sendEmail(cfg: ReminderConfig, m: Outgoing): Promise<{ ok: boolean; error?: string; via: string }> {
  try {
    if (cfg.transport === 'smtp') {
      const s = smtpFromEnv();
      if (!s) return { ok: false, error: 'SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_FROM)', via: 'smtp' };
      await sendSmtp(s, {
        to: m.to, subject: m.subject, html: composeFull(m.html, { lang: m.lang }), text: m.text,
        headers: { 'List-Unsubscribe': `<${m.unsubPost}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
      });
      return { ok: true, via: 'smtp' };
    }
    if (!m.clientId) return { ok: false, error: 'guest email needs the SMTP transport', via: 'whmcs' };
    // WHMCS wraps the body in the branded Email Global Header/Footer; Smarty must not see raw braces
    await whmcs('SendEmail', { id: m.clientId, customtype: 'general', customsubject: m.subject.replace(/[{}]/g, ''), custommessage: m.html.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;') });
    return { ok: true, via: 'whmcs' };
  } catch (e: any) { return { ok: false, error: String(e?.message || e).slice(0, 300), via: cfg.transport }; }
}

export async function whatsappReady(cfg: ReminderConfig, kind: WaKind) {
  return cfg.whatsapp.enabled && !!cfg.whatsapp.templates[kind] && !!(await waCreds());
}
export async function sendWhatsapp(cfg: ReminderConfig, kind: WaKind, to: string, lang: Lang, params: string[]) {
  const creds = await waCreds();
  if (!creds || !cfg.whatsapp.enabled || !cfg.whatsapp.templates[kind]) return { ok: false as const, error: 'not-configured' };
  return sendTemplate(creds, to, cfg.whatsapp.templates[kind], cfg.whatsapp.langs[lang], params);
}
