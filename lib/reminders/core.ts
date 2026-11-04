// Abandoned-cart and renewal reminders: the pure part (node:crypto only, so tests import it directly).
// Settings shape and validation, stage selection, quiet hours, frequency caps, E.164 phone numbers, signed tokens
// (cart snapshot from the WHMCS hook, webhook signature, unsubscribe, cart restore) and cart snapshot validation.
// Nothing here talks to WHMCS, the database or the network: lib/reminders/engine.ts does, using these rules.
import { createHmac, timingSafeEqual } from 'node:crypto';

/* ================================================================ settings */
export type Kind = 'cart' | 'renewal' | 'overdue' | 'domain';
export const KINDS: Kind[] = ['cart', 'renewal', 'overdue', 'domain'];
export type Channel = 'email' | 'whatsapp';
/** Flows that may use WhatsApp (opt-in). Abandoned carts are email only. */
export type WaKind = Exclude<Kind, 'cart'>;
export const WA_KINDS: WaKind[] = ['renewal', 'overdue', 'domain'];
export type Lang = 'en' | 'ar';
export type Copy = { subject: string; intro: string };
export type Channels = { email: boolean; whatsapp: boolean };

export type ReminderConfig = {
  /** Master switch. false = nothing is sent by any flow (kill switch). */
  enabled: boolean;
  /** Where email goes out: WHMCS SendEmail (client accounts only) or SMTP (also guests; sets List-Unsubscribe headers). */
  transport: 'whmcs' | 'smtp';
  cart: {
    /** Abandoned-cart reminders are EMAIL ONLY (owner decision): there is no WhatsApp channel for carts. */
    enabled: boolean; channels: { email: true; whatsapp: false };
    /** minutes after the last cart activity */
    first: number; second: number; third: number;
    /** the third reminder is sent only when it is on AND a promo code is set */
    thirdEnabled: boolean; promoCode: string;
    /** soft = existing clients get cart reminders unless they opted out; explicit = only after ticking the box */
    consent: 'soft' | 'explicit';
    /** guest carts (email typed at checkout + box ticked). Needs the SMTP transport (WHMCS can only email clients). */
    guests: boolean;
    /** carts older than this are closed without a reminder */
    expireDays: number;
  };
  renewal: { enabled: boolean; channels: Channels; days: number[] };
  overdue: { enabled: boolean; channels: Channels; days: number[] };
  domain: { enabled: boolean; channels: Channels; days: number[]; grace: boolean };
  quiet: { start: number; end: number; tz: string };
  caps: { perDay: number; perWeek: number; perRun: number };
  copy: Record<Kind, Record<Lang, Copy>>;
  whatsapp: { enabled: boolean; templates: Record<WaKind, string>; langs: Record<Lang, string> };
};

export const DEFAULT_COPY: Record<Kind, Record<Lang, Copy>> = {
  cart: {
    en: { subject: 'You left something in your cart', intro: 'Your order is saved. Pick up where you left off: everything below is still in your cart, at the prices shown.' },
    ar: { subject: 'تركت شيئًا في سلة التسوق', intro: 'طلبك محفوظ. أكمل من حيث توقفت: كل ما يلي لا يزال في سلتك بالأسعار الموضحة.' },
  },
  renewal: {
    en: { subject: 'Your upcoming renewals', intro: 'Here is what renews soon on your account, with the current renewal price. Renew in one click, or check that auto-renew and your payment method are ready.' },
    ar: { subject: 'تجديداتك القادمة', intro: 'إليك ما سيُجدَّد قريبًا في حسابك مع سعر التجديد الحالي. جدّد بنقرة واحدة، أو تأكد من أن التجديد التلقائي وطريقة الدفع جاهزان.' },
  },
  overdue: {
    en: { subject: 'Payment reminder: invoice overdue', intro: 'We have not received payment for the invoice below yet. Pay now to keep your services running without interruption.' },
    ar: { subject: 'تذكير بالدفع: فاتورة متأخرة', intro: 'لم نستلم بعد دفعة الفاتورة أدناه. ادفع الآن لتستمر خدماتك دون انقطاع.' },
  },
  domain: {
    en: { subject: 'Your domain is at risk of expiring', intro: 'The domain below will not renew by itself. If it expires, your website and email on it stop working and the name can be lost.' },
    ar: { subject: 'نطاقك معرّض لانتهاء الصلاحية', intro: 'النطاق أدناه لن يتجدد تلقائيًا. إذا انتهت صلاحيته يتوقف موقعك وبريدك عليه وقد تفقد الاسم.' },
  },
};

export const DEFAULT_CONFIG: ReminderConfig = {
  enabled: false,
  transport: 'whmcs',
  cart: { enabled: false, channels: { email: true, whatsapp: false }, first: 60, second: 1440, third: 4320, thirdEnabled: false, promoCode: '', consent: 'soft', guests: false, expireDays: 7 },
  renewal: { enabled: false, channels: { email: true, whatsapp: false }, days: [30, 14, 7, 1] },
  overdue: { enabled: false, channels: { email: true, whatsapp: false }, days: [1, 3, 7] },
  domain: { enabled: false, channels: { email: true, whatsapp: false }, days: [30, 7, 1], grace: true },
  quiet: { start: 22, end: 8, tz: 'Asia/Dubai' },
  caps: { perDay: 2, perWeek: 5, perRun: 60 },
  copy: DEFAULT_COPY,
  whatsapp: { enabled: false, templates: { renewal: '', overdue: '', domain: '' }, langs: { en: 'en', ar: 'ar' } },
};

const int = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const text = (v: unknown, d: string, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : d);
/** "30, 14, 7,1" / [30,14] → sorted unique day list within [min,max]. */
export function dayList(v: unknown, d: number[], min = 0, max = 90): number[] {
  const raw = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : []).filter((x) => String(x).trim() !== '');
  const out = [...new Set(raw.map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n >= min && n <= max))].sort((a, b) => b - a).slice(0, 6);
  return out.length ? out : d;
}
/** Channels a flow may use: carts never get WhatsApp. */
export const channelsFor = (cfg: ReminderConfig, k: Kind): Channels => (k === 'cart' ? { email: true, whatsapp: false } : cfg[k].channels);
const chans = (v: any, d: Channels): Channels => ({ email: bool(v?.email, d.email), whatsapp: bool(v?.whatsapp, d.whatsapp) });
export const PROMO_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const TEMPLATE_RE = /^[a-z0-9_]{1,512}$/;
export const TZ_OK = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

/** Any stored value (possibly partial or old) → a complete, valid config. */
export function normalizeConfig(v: any): ReminderConfig {
  const D = DEFAULT_CONFIG, c = v && typeof v === 'object' ? v : {};
  const first = int(c.cart?.first, D.cart.first, 15, 24 * 60);
  const second = int(c.cart?.second, D.cart.second, first + 60, 7 * 24 * 60);
  const third = int(c.cart?.third, D.cart.third, second + 60, 14 * 24 * 60);
  const promo = text(c.cart?.promoCode, '', 40).trim();
  const copy = {} as ReminderConfig['copy'];
  for (const k of KINDS) {
    copy[k] = {} as Record<Lang, Copy>;
    for (const l of ['en', 'ar'] as Lang[]) {
      const s = c.copy?.[k]?.[l];
      copy[k][l] = { subject: text(s?.subject, '', 150).trim() || DEFAULT_COPY[k][l].subject, intro: text(s?.intro, '', 1200).trim() || DEFAULT_COPY[k][l].intro };
    }
  }
  const tpl = {} as Record<WaKind, string>;
  for (const k of WA_KINDS) { const t = text(c.whatsapp?.templates?.[k], '', 512).trim(); tpl[k] = TEMPLATE_RE.test(t) ? t : ''; }
  const wl = (x: unknown, d: string) => { const s = text(x, d, 10).trim(); return /^[a-z]{2,3}(_[A-Z]{2})?$/.test(s) ? s : d; };
  const tz = text(c.quiet?.tz, D.quiet.tz, 64);
  return {
    enabled: bool(c.enabled, D.enabled),
    transport: c.transport === 'smtp' ? 'smtp' : 'whmcs',
    cart: {
      enabled: bool(c.cart?.enabled, D.cart.enabled), channels: { email: true, whatsapp: false }, first, second, third,
      thirdEnabled: bool(c.cart?.thirdEnabled, false), promoCode: PROMO_RE.test(promo) ? promo : '',
      consent: c.cart?.consent === 'explicit' ? 'explicit' : 'soft', guests: bool(c.cart?.guests, false), expireDays: int(c.cart?.expireDays, D.cart.expireDays, 1, 30),
    },
    renewal: { enabled: bool(c.renewal?.enabled, false), channels: chans(c.renewal?.channels, D.renewal.channels), days: dayList(c.renewal?.days, D.renewal.days, 1, 90) },
    overdue: { enabled: bool(c.overdue?.enabled, false), channels: chans(c.overdue?.channels, D.overdue.channels), days: dayList(c.overdue?.days, D.overdue.days, 1, 60) },
    domain: { enabled: bool(c.domain?.enabled, false), channels: chans(c.domain?.channels, D.domain.channels), days: dayList(c.domain?.days, D.domain.days, 1, 90), grace: bool(c.domain?.grace, true) },
    quiet: { start: int(c.quiet?.start, D.quiet.start, 0, 23), end: int(c.quiet?.end, D.quiet.end, 0, 23), tz: TZ_OK(tz) ? tz : D.quiet.tz },
    caps: { perDay: int(c.caps?.perDay, D.caps.perDay, 1, 10), perWeek: int(c.caps?.perWeek, D.caps.perWeek, 1, 30), perRun: int(c.caps?.perRun, D.caps.perRun, 1, 500) },
    copy,
    whatsapp: { enabled: bool(c.whatsapp?.enabled, false), templates: tpl, langs: { en: wl(c.whatsapp?.langs?.en, 'en'), ar: wl(c.whatsapp?.langs?.ar, 'ar') } },
  };
}

/* ================================================================ stages */
export type CartStage = 'c1' | 'c2' | 'c3';
const HOUR = 3600_000, DAY = 86400_000;

/** Cart stages that are switched on, with their delay in minutes. The third needs a promo code set by the owner. */
export function cartStages(cfg: ReminderConfig): { stage: CartStage; after: number }[] {
  const l: { stage: CartStage; after: number }[] = [{ stage: 'c1', after: cfg.cart.first }, { stage: 'c2', after: cfg.cart.second }];
  if (cfg.cart.thirdEnabled && cfg.cart.promoCode) l.push({ stage: 'c3', after: cfg.cart.third });
  return l;
}

/**
 * Which cart reminder is due now, if any. The latest stage whose delay has passed is the candidate; nothing is sent when
 * that stage, or a later one, was already sent (a late run never sends two at once, and never goes backwards).
 * Carts past expireDays, or with no items, get nothing.
 */
export function dueCartStage(o: { lastActivity: number; now: number; sent: Iterable<string>; cfg: ReminderConfig; items: number }): CartStage | null {
  if (o.items <= 0) return null;
  const age = o.now - o.lastActivity;
  if (age < 0 || age > o.cfg.cart.expireDays * DAY) return null;
  const stages = cartStages(o.cfg);
  const sent = new Set(o.sent);
  let pick = -1;
  stages.forEach((s, i) => { if (age >= s.after * 60_000) pick = i; });
  if (pick < 0) return null;
  for (let i = pick; i < stages.length; i++) if (sent.has(stages[i].stage)) return null;
  return stages[pick].stage;
}

/** Late-run tolerance: a stage is still sent up to this many days after its day passed (missed cron runs). */
export const LATE_DAYS = 3;

/**
 * Pre-due stage ("d14") for an item `daysLeft` days before its due / expiry date. Stages are days before (e.g. 30,14,7,1).
 * The most urgent stage that applies is the candidate; skipped when it or a more urgent one was sent this cycle.
 */
export function dueStage(daysLeft: number | null, days: number[], sent: Iterable<string>, prefix = 'd'): string | null {
  if (daysLeft === null || daysLeft < 0) return null;
  const asc = [...days].sort((a, b) => a - b);
  const s = asc.find((d) => daysLeft <= d);
  if (s === undefined || s - daysLeft > LATE_DAYS) return null;
  const got = new Set(sent);
  for (const d of asc) if (d <= s && got.has(`${prefix}${d}`)) return null;
  return `${prefix}${s}`;
}

/** Post-due stage ("o3") for an invoice `daysPast` days after its due date (stages: days after, e.g. 1,3,7). */
export function overdueStage(daysPast: number | null, days: number[], sent: Iterable<string>, prefix = 'o'): string | null {
  if (daysPast === null || daysPast < 1) return null;
  const asc = [...days].sort((a, b) => a - b);
  let s: number | undefined;
  for (const d of asc) if (daysPast >= d) s = d;
  if (s === undefined || daysPast - s > LATE_DAYS) return null;
  const got = new Set(sent);
  for (const d of asc) if (d >= s && got.has(`${prefix}${d}`)) return null;
  return `${prefix}${s}`;
}

/** Whole days from `now` to an ISO date (YYYY-MM-DD…) in the given time zone's calendar; null for empty / 0000 dates. */
export function daysUntil(date: unknown, now: number, tz = 'Asia/Dubai'): number | null {
  const s = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) || /^0000/.test(s)) return null;
  const target = Date.parse(s.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(target)) return null;
  const today = Date.parse(localDate(now, tz) + 'T00:00:00Z');
  return Math.round((target - today) / DAY);
}
export const localDate = (now: number, tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));

/* ================================================================ quiet hours */
// Representative time zones per country (several for countries that span many). A send is allowed only when it is
// outside quiet hours in every zone of the customer's country; unknown countries use the configured default (Dubai).
const ZONES: Record<string, string[]> = {
  AE: ['Asia/Dubai'], OM: ['Asia/Muscat'], SA: ['Asia/Riyadh'], QA: ['Asia/Qatar'], KW: ['Asia/Kuwait'], BH: ['Asia/Bahrain'], IQ: ['Asia/Baghdad'],
  JO: ['Asia/Amman'], LB: ['Asia/Beirut'], SY: ['Asia/Damascus'], YE: ['Asia/Aden'], IR: ['Asia/Tehran'], IL: ['Asia/Jerusalem'], PS: ['Asia/Gaza'],
  EG: ['Africa/Cairo'], LY: ['Africa/Tripoli'], TN: ['Africa/Tunis'], DZ: ['Africa/Algiers'], MA: ['Africa/Casablanca'], SD: ['Africa/Khartoum'],
  IN: ['Asia/Kolkata'], PK: ['Asia/Karachi'], BD: ['Asia/Dhaka'], LK: ['Asia/Colombo'], NP: ['Asia/Kathmandu'], AF: ['Asia/Kabul'],
  SG: ['Asia/Singapore'], MY: ['Asia/Kuala_Lumpur'], PH: ['Asia/Manila'], TH: ['Asia/Bangkok'], VN: ['Asia/Ho_Chi_Minh'], HK: ['Asia/Hong_Kong'],
  CN: ['Asia/Shanghai'], TW: ['Asia/Taipei'], JP: ['Asia/Tokyo'], KR: ['Asia/Seoul'], ID: ['Asia/Jakarta', 'Asia/Jayapura'],
  TR: ['Europe/Istanbul'], GB: ['Europe/London'], IE: ['Europe/Dublin'], PT: ['Europe/Lisbon'], ES: ['Europe/Madrid'], FR: ['Europe/Paris'],
  DE: ['Europe/Berlin'], NL: ['Europe/Amsterdam'], BE: ['Europe/Brussels'], CH: ['Europe/Zurich'], AT: ['Europe/Vienna'], IT: ['Europe/Rome'],
  SE: ['Europe/Stockholm'], NO: ['Europe/Oslo'], DK: ['Europe/Copenhagen'], FI: ['Europe/Helsinki'], PL: ['Europe/Warsaw'], CZ: ['Europe/Prague'],
  GR: ['Europe/Athens'], RO: ['Europe/Bucharest'], UA: ['Europe/Kyiv'], CY: ['Asia/Nicosia'], RU: ['Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk'],
  NG: ['Africa/Lagos'], KE: ['Africa/Nairobi'], ZA: ['Africa/Johannesburg'], GH: ['Africa/Accra'], ET: ['Africa/Addis_Ababa'],
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'], CA: ['America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver'],
  MX: ['America/Mexico_City'], BR: ['America/Sao_Paulo'], AR: ['America/Argentina/Buenos_Aires'], CL: ['America/Santiago'], CO: ['America/Bogota'],
  AU: ['Australia/Sydney', 'Australia/Adelaide', 'Australia/Perth'], NZ: ['Pacific/Auckland'],
};
export const zonesFor = (country: unknown, fallback = 'Asia/Dubai') => ZONES[String(country || '').toUpperCase()] || [fallback];

const hourIn = (now: number, tz: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
/** Quiet window start..end (e.g. 22..8 wraps midnight). start === end means no quiet hours. */
export function inQuiet(hour: number, start: number, end: number) {
  if (start === end) return false;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}
/** true when a message may be sent now to someone in `country`. */
export function sendableNow(now: number, country: unknown, q: ReminderConfig['quiet']) {
  return zonesFor(country, q.tz).every((tz) => !inQuiet(hourIn(now, tz), q.start, q.end));
}

/* ================================================================ caps */
/** sent = timestamps (ms) of messages already sent to this person. true when one more is within the caps. */
export function withinCaps(sent: number[], now: number, caps: ReminderConfig['caps']) {
  const day = sent.filter((t) => now - t < DAY).length;
  const week = sent.filter((t) => now - t < 7 * DAY).length;
  return day < caps.perDay && week < caps.perWeek;
}
/** Minimum spacing between two reminders to the same person, whatever the caps say. */
export const MIN_GAP_MS = 4 * HOUR;
export const spacedEnough = (sent: number[], now: number) => sent.every((t) => now - t >= MIN_GAP_MS);

/* ================================================================ phone numbers */
// ISO 3166-1 alpha-2 → ITU calling code
const CC: Record<string, string> = Object.fromEntries(('AD376 AE971 AF93 AG1 AI1 AL355 AM374 AO244 AR54 AS1 AT43 AU61 AW297 AZ994 BA387 BB1 BD880 BE32 BF226 BG359 BH973 BI257 BJ229 BM1 BN673 BO591 BR55 BS1 BT975 BW267 BY375 BZ501 CA1 CD243 CF236 CG242 CH41 CI225 CL56 CM237 CN86 CO57 CR506 CU53 CV238 CY357 CZ420 DE49 DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 EG20 ER291 ES34 ET251 FI358 FJ679 FR33 GA241 GB44 GD1 GE995 GH233 GM220 GN224 GQ240 GR30 GT502 GU1 GW245 GY592 HK852 HN504 HR385 HT509 HU36 ID62 IE353 IL972 IN91 IQ964 IR98 IS354 IT39 JM1 JO962 JP81 KE254 KG996 KH855 KM269 KN1 KR82 KW965 KY1 KZ7 LA856 LB961 LC1 LI423 LK94 LR231 LS266 LT370 LU352 LV371 LY218 MA212 MC377 MD373 ME382 MG261 MK389 ML223 MM95 MN976 MO853 MR222 MT356 MU230 MV960 MW265 MX52 MY60 MZ258 NA264 NE227 NG234 NI505 NL31 NO47 NP977 NZ64 OM968 PA507 PE51 PG675 PH63 PK92 PL48 PR1 PS970 PT351 PY595 QA974 RO40 RS381 RU7 RW250 SA966 SB677 SC248 SD249 SE46 SG65 SI386 SK421 SL232 SM378 SN221 SO252 SR597 SS211 SV503 SY963 SZ268 TD235 TG228 TH66 TJ992 TL670 TM993 TN216 TO676 TR90 TT1 TW886 TZ255 UA380 UG256 US1 UY598 UZ998 VA39 VC1 VE58 VG1 VI1 VN84 VU678 WS685 XK383 YE967 ZA27 ZM260 ZW263')
  .split(' ').map((s) => [s.slice(0, 2), s.slice(2)]));
export const callingCode = (country: unknown) => CC[String(country || '').toUpperCase()] || '';
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * WHMCS phone (client `phonenumber`, often "+971.501234567"; or a local number) + country / phonecc → E.164 ("+971501234567").
 * null when it cannot be made into a plausible international number. Never guesses a country it was not given.
 */
export function toE164(raw: unknown, o: { country?: unknown; cc?: unknown } = {}): string | null {
  let s = String(raw ?? '').trim();
  if (!s || s.length > 40) return null;
  const dotted = /^\+?(\d{1,4})\.\s*(.+)$/.exec(s.replace(/[\s()-]/g, ''));
  if (dotted) { const n = dotted[2].replace(/\D/g, '').replace(/^0+/, ''); const p = `+${dotted[1]}${n}`; return E164.test(p) ? p : null; }
  const intl = /^(\+|00)/.test(s);
  let d = s.replace(/\D/g, '');
  if (s.startsWith('00')) d = d.slice(2);
  if (intl) { const p = `+${d}`; return E164.test(p) ? p : null; }
  const code = String(o.cc ?? '').replace(/\D/g, '') || callingCode(o.country);
  if (!code) return null;
  d = d.replace(/^0+/, '');
  // a number typed with its country code but without "+" (e.g. 971501234567 for AE)
  if (d.startsWith(code) && d.length - code.length >= 8) { const p = `+${d}`; if (E164.test(p)) return p; }
  const p = `+${code}${d}`;
  return E164.test(p) ? p : null;
}

/* ================================================================ tokens */
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url');
const mac = (secret: string, domain: string, data: string) => createHmac('sha256', secret).update(`${domain}.${data}`).digest();
const eq = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);
const okSecret = (s: unknown): s is string => typeof s === 'string' && s.length >= 32;

/** Generic signed value: base64url(JSON).base64url(HMAC(domain.payload)). */
export function signValue(domain: string, value: unknown, secret: string, macBytes = 32) {
  const p = b64(JSON.stringify(value));
  return `${p}.${b64(mac(secret, domain, p).subarray(0, macBytes))}`;
}
export function verifyValue<T = any>(domain: string, token: unknown, secret: unknown, o: { maxLen?: number; macBytes?: number } = {}): T | null {
  if (!okSecret(secret) || typeof token !== 'string' || token.length > (o.maxLen ?? 4096) || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [p, sig] = token.split('.');
  if (!eq(unb64(sig), mac(secret, domain, p).subarray(0, o.macBytes ?? 32))) return null;
  try { return JSON.parse(unb64(p).toString('utf8')) as T; } catch { return null; }
}

/** Unsubscribe link token (no expiry: an unsubscribe link must keep working). scope: which reminders it stops (health = domain health alerts, lib/health;
 *  report = the monthly site report and rating = "How did we do?" requests after a closed ticket, lib/cx). */
export type UnsubScope = 'cart' | 'renewal' | 'health' | 'report' | 'rating' | 'all';
export const UNSUB_SCOPES: UnsubScope[] = ['cart', 'renewal', 'health', 'report', 'rating', 'all'];
export type UnsubClaims = { e: string; c: number; s: UnsubScope };
export const signUnsub = (c: UnsubClaims, secret: string) => signValue('gh-unsub.v1', { e: c.e.toLowerCase(), c: c.c, s: c.s }, secret, 16);
export function verifyUnsub(token: unknown, secret: unknown): UnsubClaims | null {
  const v = verifyValue<UnsubClaims>('gh-unsub.v1', token, secret, { maxLen: 600, macBytes: 16 });
  if (!v || typeof v.e !== 'string' || !EMAIL_RE.test(v.e) || !Number.isInteger(v.c) || v.c < 0 || !(UNSUB_SCOPES as string[]).includes(v.s)) return null;
  return v;
}
export const scopeOf = (k: Kind): UnsubScope => (k === 'cart' ? 'cart' : 'renewal');

/** Cart restore link (in the reminder email): which cart, until when (60 days). */
export type RestoreClaims = { id: string; st: string; exp: number };
export const signRestore = (c: RestoreClaims, secret: string) => signValue('gh-restore.v1', c, secret, 16);
export function verifyRestore(token: unknown, secret: unknown, nowS = Math.floor(Date.now() / 1000)): RestoreClaims | null {
  const v = verifyValue<RestoreClaims>('gh-restore.v1', token, secret, { maxLen: 400, macBytes: 16 });
  if (!v || typeof v.id !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(v.id) || !Number.isInteger(v.exp) || v.exp < nowS) return null;
  return v;
}

/**
 * Webhook from the WHMCS hook (order placed, invoice paid, cron tick): header "t=<unix>,v1=<hex HMAC>",
 * HMAC-SHA256 over "gh-hook.v1.<t>.<raw body>". Rejected when older/newer than 5 minutes.
 */
export const HOOK_TOLERANCE_S = 300;
export function signHook(body: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${mac(secret, 'gh-hook.v1', `${t}.${body}`).toString('hex')}`;
}
export function verifyHook(header: unknown, body: string, secret: unknown, nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!okSecret(secret) || typeof header !== 'string' || header.length > 200) return false;
  const m = /^t=(\d{9,11}),v1=([0-9a-f]{64})$/.exec(header.trim());
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(nowS - t) > HOOK_TOLERANCE_S) return false;
  return eq(Buffer.from(m[2], 'hex'), mac(secret, 'gh-hook.v1', `${t}.${body}`));
}

/* ================================================================ cart snapshot */
export const EMAIL_RE = /^[^\s@<>"(),;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,63}$/i;
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const CYCLES = ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially', 'onetime', 'free'] as const;
export type CartProduct = { pid: number; cycle: string; domain: string; options: boolean };
export type CartDomain = { domain: string; type: 'register' | 'transfer'; years: number };
/** What the WHMCS hook signs from $_SESSION['cart'] (no prices, no card data, no passwords). */
export type CartClaims = { v: 1; cid: number; sk: string; cur: number; p: CartProduct[]; d: CartDomain[]; iat: number; exp: number };

/** Cart snapshot token printed by the WHMCS hook on cart pages (valid 2 hours). */
export const CART_TTL_MAX_S = 3 * 3600;
export function verifyCart(token: unknown, secret: unknown, nowS = Math.floor(Date.now() / 1000)): CartClaims | null {
  const v = verifyValue<any>('gh-cart.v1', token, secret, { maxLen: 8000 });
  if (!v || v.v !== 1) return null;
  const exp = Number(v.exp), iat = Number(v.iat);
  if (!Number.isSafeInteger(exp) || exp < nowS || exp > nowS + CART_TTL_MAX_S || !Number.isSafeInteger(iat) || iat > nowS + 60) return null;
  return validateCart(v);
}

/** Strict shape check of a cart snapshot; unknown fields are dropped, anything malformed rejects the whole snapshot. */
export function validateCart(v: any): CartClaims | null {
  const cid = Number(v?.cid), cur = Number(v?.cur ?? 0);
  if (!Number.isSafeInteger(cid) || cid < 0 || !Number.isSafeInteger(cur) || cur < 0) return null;
  const sk = String(v?.sk ?? '');
  if (!/^[a-f0-9]{16,64}$/.test(sk)) return null;
  if (!Array.isArray(v.p ?? []) || !Array.isArray(v.d ?? [])) return null;
  const p: CartProduct[] = [], d: CartDomain[] = [];
  for (const x of (v.p ?? []).slice(0, 20)) {
    const pid = Number(x?.pid), cycle = String(x?.cycle ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 1e7) return null;
    if (!(CYCLES as readonly string[]).includes(cycle)) return null;
    const domain = String(x?.domain ?? '').trim().toLowerCase();
    if (domain && !DOMAIN_RE.test(domain)) return null;
    p.push({ pid, cycle, domain, options: !!x?.options });
  }
  for (const x of (v.d ?? []).slice(0, 20)) {
    const domain = String(x?.domain ?? '').trim().toLowerCase(), type = x?.type === 'transfer' ? 'transfer' : x?.type === 'register' ? 'register' : null;
    const years = Number(x?.years ?? 1);
    if (!DOMAIN_RE.test(domain) || !type || !Number.isInteger(years) || years < 1 || years > 10) return null;
    d.push({ domain, type, years });
  }
  return { v: 1, cid, sk, cur, p, d, iat: Number(v.iat) || 0, exp: Number(v.exp) || 0 };
}

/** Stable fingerprint of the cart contents (to see whether a new snapshot changed anything). */
export const cartFingerprint = (c: Pick<CartClaims, 'p' | 'd' | 'cur'>) =>
  createHmac('sha256', 'fp').update(JSON.stringify([c.cur, c.p.map((x) => [x.pid, x.cycle, x.domain, x.options]), c.d.map((x) => [x.domain, x.type, x.years])])).digest('hex').slice(0, 24);

/* ================================================================ links */
/** WHMCS documented order links: cart.php?a=add&pid=…&billingcycle=… [&promocode=…] and the domain register/transfer link. */
export function productLink(base: string, p: Pick<CartProduct, 'pid' | 'cycle'>, o: { promo?: string; currency?: number } = {}) {
  const q = new URLSearchParams({ a: 'add', pid: String(p.pid) });
  if (p.cycle && p.cycle !== 'free') q.set('billingcycle', p.cycle);
  if (o.promo) q.set('promocode', o.promo);
  if (o.currency) q.set('currency', String(o.currency));
  return `${base.replace(/\/$/, '')}/cart.php?${q}`;
}
export function domainLink(base: string, d: Pick<CartDomain, 'domain' | 'type'>, o: { promo?: string } = {}) {
  const q = new URLSearchParams({ a: 'add', domain: d.type, query: d.domain });
  if (o.promo) q.set('promocode', o.promo);
  return `${base.replace(/\/$/, '')}/cart.php?${q}`;
}

/** Idempotency key parts for the reminders_log unique index. */
export const itemKey = (kind: 'svc' | 'dom' | 'inv' | 'cart', id: string | number) => `${kind}:${id}`;

/** HTML escaping that is also safe inside WHMCS (Smarty) email bodies: no raw { or }. */
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
