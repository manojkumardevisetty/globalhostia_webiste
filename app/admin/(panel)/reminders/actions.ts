'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { normalizeConfig, dayList, PROMO_RE, TEMPLATE_RE, KINDS, WA_KINDS, type Kind, type Lang } from '@/lib/reminders/core';
import { loadConfig, saveConfig, saveWaCreds, waFromEnv } from '@/lib/reminders/store';
import { runReminders, sendTestTo } from '@/lib/reminders/engine';
import { PHONE_ID_RE } from '@/lib/reminders/whatsapp';

const P = '/admin/reminders';
const num = (fd: FormData, k: string) => Number(str(fd, k));

export async function setMaster(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadConfig();
  const on = str(fd, 'on') === '1';
  await saveConfig({ ...cfg, enabled: on });
  await audit(s, on ? 'reminders_on' : 'reminders_off', 'reminders', null);
  done(P, on ? 'Reminders are ON. Flows that are switched on start with the next run.' : 'Kill switch: all reminders stopped. Nothing is sent until you switch them on again.');
}

export async function saveFlows(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadConfig();
  const promo = str(fd, 'cart_promo');
  if (promo && !PROMO_RE.test(promo)) fail(P, 'Promo code: letters, digits, - and _ only (exactly as created in WHMCS → Promotions)');
  const hours = (k: string, d: number) => { const v = Number(str(fd, k).replace(',', '.')); return Number.isFinite(v) && v > 0 ? Math.round(v * 60) : d; };
  const next = normalizeConfig({
    ...cfg,
    transport: str(fd, 'transport') === 'smtp' ? 'smtp' : 'whmcs',
    cart: { ...cfg.cart, enabled: bool(fd, 'cart_on'), first: hours('cart_first', cfg.cart.first), second: hours('cart_second', cfg.cart.second), third: hours('cart_third', cfg.cart.third),
      thirdEnabled: bool(fd, 'cart_third_on'), promoCode: promo, consent: str(fd, 'cart_consent') === 'explicit' ? 'explicit' : 'soft', guests: bool(fd, 'cart_guests'), expireDays: num(fd, 'cart_expire') },
    renewal: { enabled: bool(fd, 'renewal_on'), days: dayList(str(fd, 'renewal_days'), cfg.renewal.days, 1, 90), channels: { email: bool(fd, 'renewal_email'), whatsapp: bool(fd, 'renewal_wa') } },
    overdue: { enabled: bool(fd, 'overdue_on'), days: dayList(str(fd, 'overdue_days'), cfg.overdue.days, 1, 60), channels: { email: bool(fd, 'overdue_email'), whatsapp: bool(fd, 'overdue_wa') } },
    domain: { enabled: bool(fd, 'domain_on'), days: dayList(str(fd, 'domain_days'), cfg.domain.days, 1, 90), grace: bool(fd, 'domain_grace'), channels: { email: bool(fd, 'domain_email'), whatsapp: bool(fd, 'domain_wa') } },
    quiet: { start: num(fd, 'quiet_start'), end: num(fd, 'quiet_end'), tz: str(fd, 'quiet_tz') || cfg.quiet.tz },
    caps: { perDay: num(fd, 'cap_day'), perWeek: num(fd, 'cap_week'), perRun: num(fd, 'cap_run') },
  });
  if (next.cart.thirdEnabled && !next.cart.promoCode) fail(P, 'Reminder 3 needs a promo code. Create it in WHMCS (Setup → Promotions) and enter it here, or switch reminder 3 off.');
  await saveConfig(next);
  await audit(s, 'update', 'reminders', 'flows', { transport: next.transport, cart: next.cart, renewal: next.renewal, overdue: next.overdue, domain: next.domain, quiet: next.quiet, caps: next.caps });
  done(P, 'Reminder settings saved');
}

export async function saveCopy(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadConfig();
  const copy = { ...cfg.copy };
  for (const k of KINDS) for (const l of ['en', 'ar'] as Lang[]) copy[k] = { ...copy[k], [l]: { subject: str(fd, `${k}_${l}_subject`), intro: String(fd.get(`${k}_${l}_intro`) ?? '').trim() } };
  await saveConfig(normalizeConfig({ ...cfg, copy }));
  await audit(s, 'update', 'reminders', 'copy');
  done(`${P}?tab=copy`, 'Email texts saved (empty fields use the default text)');
}

export async function saveWhatsapp(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadConfig();
  const templates = { ...cfg.whatsapp.templates };
  for (const k of WA_KINDS) { const v = str(fd, `wa_tpl_${k}`); if (v && !TEMPLATE_RE.test(v)) fail(`${P}?tab=whatsapp`, `Template name for ${k}: lowercase letters, digits and _ only (as approved in Meta)`); templates[k] = v; }
  const next = normalizeConfig({ ...cfg, whatsapp: { enabled: bool(fd, 'wa_on'), templates, langs: { en: str(fd, 'wa_lang_en') || 'en', ar: str(fd, 'wa_lang_ar') || 'ar' } } });
  if (!waFromEnv()) {
    const phoneId = str(fd, 'wa_phone_id'), token = String(fd.get('wa_token') ?? '').trim();
    if (phoneId && !PHONE_ID_RE.test(phoneId)) fail(`${P}?tab=whatsapp`, 'Phone Number ID is the long number from Meta → WhatsApp → API setup (digits only)');
    if (token && (token.length < 20 || /\s/.test(token))) fail(`${P}?tab=whatsapp`, 'The access token looks incomplete');
    await saveWaCreds(phoneId, bool(fd, 'wa_clear') ? '' : token || null);
  }
  await saveConfig(next);
  await audit(s, 'update', 'reminders', 'whatsapp', { enabled: next.whatsapp.enabled, templates, tokenChanged: !!str(fd, 'wa_token') || bool(fd, 'wa_clear') });
  done(`${P}?tab=whatsapp`, 'WhatsApp settings saved');
}

export async function testSend(fd: FormData) {
  const s = await requireSession('commerce');
  const kind = str(fd, 'kind') as Kind, lang: Lang = str(fd, 'lang') === 'ar' ? 'ar' : 'en';
  if (!KINDS.includes(kind)) fail(P, 'Unknown reminder');
  let r: Awaited<ReturnType<typeof sendTestTo>> | null = null;
  try { r = await sendTestTo(kind, lang); } catch (e: any) { fail(`${P}?pv=${kind}&pl=${lang}`, `Test email failed: ${e.message}`); }
  await audit(s, 'reminders_test', 'reminders', kind, { lang, ...r });
  done(`${P}?pv=${kind}&pl=${lang}`, `Test ${kind} email (${lang.toUpperCase()}) sent to ${r!.to} via ${r!.via === 'whmcs' ? 'WHMCS' : 'SMTP'}. Check that inbox (and spam).`);
}

export async function runNow(fd: FormData) {
  const s = await requireSession('commerce');
  const dry = str(fd, 'dry') === '1';
  const r = await runReminders(dry ? 'admin-dry' : 'admin', { dry, deadlineMs: 50_000 });
  await audit(s, dry ? 'reminders_dry_run' : 'reminders_run', 'reminders', null, r);
  if (r.skipped) fail(P, `Not run: ${r.skipped}`);
  const c: any = r.cart || {}, a: any = r.accounts || {};
  const msg = `${dry ? 'Dry run (nothing sent): would send' : 'Run finished: sent'} ${(c.sent || 0) + (a.sent || 0)} email(s)${a.whatsapp ? `, ${a.whatsapp} WhatsApp` : ''}${(c.failed || 0) + (a.failed || 0) ? `, ${(c.failed || 0) + (a.failed || 0)} failed` : ''}`;
  done(P, msg);
}
