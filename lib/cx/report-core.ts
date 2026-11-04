// Monthly "Your site report": the pure part (no runtime imports, so tests load it directly). Settings, Dubai month maths,
// the send window (the 1st of the month, spread over the first days so the shared reminder caps are respected), and the
// report model built from facts the engine gathered: our own domain health checks (domain_health + health_days), the
// hosting panel (usage, backups list) and WHMCS (services, domains, renewal amounts). Nothing here invents a number: a
// section without data is left out, and a tip with a product only carries a price that came from the synced catalog.
// lib/cx/report-engine.ts gathers the facts and sends; lib/cx/report-email.ts renders the email / portal HTML.

export type Lang = 'en' | 'ar';

/* ================================================================ settings */
export type ReportConfig = {
  /** master switch for the monthly email (the portal page works either way) */
  enabled: boolean;
  /** days at the start of the month the sends are spread over (Dubai time) */
  windowDays: number;
  /** max reports sent per run (cron tick); the shared reminder caps also apply per customer */
  perRun: number;
  /** product tips (an upgrade or hosting plan, real catalog price) in addition to help-video tips */
  productTips: boolean;
};
export const DEFAULT_REPORT: ReportConfig = { enabled: false, windowDays: 2, perRun: 15, productTips: true };
const int = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
export function normalizeReport(v: any): ReportConfig {
  const c = v && typeof v === 'object' ? v : {};
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : DEFAULT_REPORT.enabled,
    windowDays: int(c.windowDays, DEFAULT_REPORT.windowDays, 1, 5),
    perRun: int(c.perRun, DEFAULT_REPORT.perRun, 1, 200),
    productTips: typeof c.productTips === 'boolean' ? c.productTips : DEFAULT_REPORT.productTips,
  };
}

/* ================================================================ months (Asia/Dubai, UTC+4 all year: no DST) */
export const TZ = 'Asia/Dubai';
const DUBAI_MS = 4 * 3600_000;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** "2026-11" for the Dubai calendar month containing `now`. */
export const monthOf = (now: number) => new Date(now + DUBAI_MS).toISOString().slice(0, 7);
export const dayOfMonth = (now: number) => Number(new Date(now + DUBAI_MS).toISOString().slice(8, 10));
export function prevMonth(m: string) { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; }
export function nextMonth(m: string) { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; }
export const daysInMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };
/** First and last calendar day (YYYY-MM-DD) of a month. */
export const monthRange = (m: string) => ({ from: `${m}-01`, to: `${m}-${String(daysInMonth(m)).padStart(2, '0')}` });
/** 00:00 Dubai on the 1st of month `m`, as epoch ms. */
export const monthStart = (m: string) => Date.parse(`${m}-01T00:00:00Z`) - DUBAI_MS;
/** Months a customer can pick in the portal: the last `n` full months (newest first), never before `since`. */
export function pickableMonths(now: number, n = 12, since?: string) {
  const out: string[] = [];
  let m = prevMonth(monthOf(now));
  for (let i = 0; i < n; i++) { if (since && m < since) break; out.push(m); m = prevMonth(m); }
  return out;
}

/* ================================================================ send window */
/** Stable 0..1 fraction per customer and month (FNV-1a), so each customer gets the same slot on every run. */
export function slot(clientId: number, month: string) {
  let h = 0x811c9dc5;
  for (const ch of `${clientId}|${month}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0) / 0x100000000;
}
/**
 * The report month that is being sent now, or null outside the window. Runs on days 1..windowDays of a month (Dubai)
 * send the previous month's report; one extra day catches customers held back by quiet hours or caps.
 */
export function windowMonth(now: number, cfg: Pick<ReportConfig, 'windowDays'>): string | null {
  const d = dayOfMonth(now);
  return d >= 1 && d <= cfg.windowDays + 1 ? prevMonth(monthOf(now)) : null;
}
/**
 * When this customer's report is due (epoch ms): spread evenly over the window, from 08:00 Dubai on the 1st to 18:00 on
 * the last window day. Quiet hours in the customer's own country are applied by the sender on top.
 */
export function dueAt(clientId: number, reportMonth: string, cfg: Pick<ReportConfig, 'windowDays'>) {
  const start = monthStart(nextMonth(reportMonth)) + 8 * 3600_000;
  const span = (cfg.windowDays - 1) * 24 * 3600_000 + 10 * 3600_000;
  return start + Math.floor(slot(clientId, reportMonth) * span);
}

/* ================================================================ facts → report */
/** One customer domain as the health checks store it (domain_health row + its checks summary). */
export type HealthFact = {
  domain: string; sources: string[]; serviceId?: number | null; lastChecked: number | null;
  issues: Record<string, { sev: string } | undefined>;
  checks?: {
    tls?: { connected?: boolean; validTo?: string; daysLeft?: number; issuer?: string; authError?: string; nameOk?: boolean } | null;
    mail?: { mx?: unknown[]; spf?: string[]; dmarc?: string[]; dkim?: number } | null;
    web?: { https?: { status?: number } } | null;
  } | null;
};
/** health_days rows of the month for one domain. */
export type DayFact = { domain: string; day: string; checks: number; status: string; issues: string[] };
export type ServiceFact = {
  id: number; domain: string; product: string; pid?: number | null; status: string;
  usage?: { disk?: { used: number; limit: number | null }; bw?: { used: number; limit: number | null } } | null;
  /** null = the panel does not list backups for this account (section left out) */
  backups?: { count: number; latest: string | null } | null;
};
export type RenewalFact = { kind: 'service' | 'domain'; name: string; date: string; days: number; price: string | null; auto: boolean | null };
export type ProductOffer = { name: string; url: string; price: string; cycle: string };

export type SiteChecks = { days: number; issueDays: number; downDays: number; found: string[]; resolved: string[]; open: string[]; lastChecked: string | null };
export type SiteSsl = { state: 'ok' | 'expiring' | 'problem'; validTo: string | null; daysLeft: number | null; issuer: string };
export type AuthState = 'ok' | 'missing' | 'invalid';
export type SiteMail = { spf: AuthState; dkim: AuthState | null; dmarc: AuthState };
export type ReportSite = {
  domain: string; hosting: boolean; serviceId: number | null; product: string;
  checks: SiteChecks | null; ssl: SiteSsl | null; mail: SiteMail | null;
  backups: { count: number; latest: string | null } | null;
  usage: { disk?: { used: number; limit: number | null; pct: number | null }; bw?: { used: number; limit: number | null; pct: number | null } } | null;
};
export type TipKey = 'ssl' | 'email_auth' | 'site_down' | 'disk' | 'backups' | 'autorenew' | 'wordpress' | 'hosting';
export type ReportTip = { key: TipKey; domain: string; href: string; product: ProductOffer | null };
export type ReportData = {
  v: 1; month: string; generatedAt: string; clientId: number; name: string;
  sites: ReportSite[]; moreSites: number; renewals: RenewalFact[]; tips: ReportTip[];
};

/** Issue keys that mean the site or the domain itself did not answer. */
export const DOWN_KEYS = ['site_down', 'dns_unresolved', 'ns_none'];
const SSL_KEYS = ['ssl_missing', 'ssl_expired', 'ssl_expiring', 'ssl_name', 'ssl_chain', 'ssl_untrusted'];
const SPF_KEYS = ['spf_missing', 'spf_multiple', 'spf_invalid', 'spf_server'];
/** keys that count as a problem in the month summary (informational notes such as "DNS elsewhere" do not) */
const NOTE_KEYS = new Set(['ns_external']);
const SSL_WARN_DAYS = 21;
export const MAX_SITES = 8;
const DAY = 86400_000;

export function siteChecks(days: DayFact[], h: HealthFact | null): SiteChecks | null {
  const list = days.filter((d) => d.checks > 0);
  if (!list.length) return null;
  const found = [...new Set(list.flatMap((d) => d.issues).filter((k) => !NOTE_KEYS.has(k)))].sort();
  const open = h ? Object.entries(h.issues).filter(([k, v]) => v && v.sev !== 'info' && !NOTE_KEYS.has(k)).map(([k]) => k).sort() : [];
  return {
    days: list.length,
    issueDays: list.filter((d) => d.issues.some((k) => !NOTE_KEYS.has(k))).length,
    downDays: list.filter((d) => d.issues.some((k) => DOWN_KEYS.includes(k))).length,
    found, open, resolved: found.filter((k) => !open.includes(k)),
    lastChecked: h?.lastChecked ? new Date(h.lastChecked).toISOString() : null,
  };
}

export function siteSsl(h: HealthFact | null, now: number): SiteSsl | null {
  const tls = h?.checks?.tls;
  if (!h || !tls) return null;
  const has = (k: string) => !!h.issues[k];
  const validTo = tls.validTo && !Number.isNaN(Date.parse(tls.validTo)) ? tls.validTo : null;
  const daysLeft = validTo ? Math.floor((Date.parse(validTo) - now) / DAY) : null;
  if (!tls.connected && !SSL_KEYS.some(has)) return null; // nothing answered on 443 and no SSL finding: no section
  const problem = SSL_KEYS.filter((k) => k !== 'ssl_expiring').some(has) || (daysLeft !== null && daysLeft < 0);
  const state: SiteSsl['state'] = problem ? 'problem' : has('ssl_expiring') || (daysLeft !== null && daysLeft <= SSL_WARN_DAYS) ? 'expiring' : 'ok';
  return { state, validTo: validTo ? validTo.slice(0, 10) : null, daysLeft, issuer: String(tls.issuer || '').slice(0, 80) };
}

export function siteMail(h: HealthFact | null): SiteMail | null {
  const m = h?.checks?.mail;
  if (!h || !m) return null;
  const has = (k: string) => !!h.issues[k];
  const spf: AuthState = has('spf_missing') ? 'missing' : SPF_KEYS.some(has) ? 'invalid' : (m.spf || []).length ? 'ok' : 'missing';
  const dmarc: AuthState = has('dmarc_missing') ? 'missing' : has('dmarc_invalid') ? 'invalid' : (m.dmarc || []).length ? 'ok' : 'missing';
  // DKIM is only looked up for mail on our hosting (known selectors): no lookup and no finding = not shown
  const dkim: AuthState | null = has('dkim_missing') ? 'missing' : Number(m.dkim || 0) > 0 ? 'ok' : null;
  return { spf, dkim, dmarc };
}

const pct = (used: number, limit: number | null) => (limit && limit > 0 ? Math.round((used / limit) * 100) : null);
const usageOf = (u: ServiceFact['usage']): ReportSite['usage'] => {
  if (!u || (!u.disk && !u.bw)) return null;
  const o: NonNullable<ReportSite['usage']> = {};
  if (u.disk) o.disk = { ...u.disk, pct: pct(u.disk.used, u.disk.limit) };
  if (u.bw) o.bw = { ...u.bw, pct: pct(u.bw.used, u.bw.limit) };
  return o;
};

/** Order: hosting service domains first, then registered domains; alphabetical within. */
const rank = (h: HealthFact) => (h.sources.includes('service') ? 0 : h.sources.includes('registered') ? 1 : 2);

export function buildReport(o: {
  month: string; now: number; clientId: number; name: string;
  health: HealthFact[]; days: DayFact[]; services: ServiceFact[]; renewals: RenewalFact[];
  /** cheapest bigger plan in the same category per service id, and the cheapest hosting plan (domain-only customers) */
  offers?: { upgrade?: Map<number, ProductOffer>; hosting?: ProductOffer | null };
  productTips?: boolean;
}): ReportData {
  const byDomain = new Map<string, DayFact[]>();
  for (const d of o.days) { const l = byDomain.get(d.domain) || []; l.push(d); byDomain.set(d.domain, l); }
  const svcByDomain = new Map(o.services.filter((s) => /^active$/i.test(s.status) && s.domain).map((s) => [s.domain.toLowerCase(), s]));
  const seen = new Set<string>();
  const sites: ReportSite[] = [];
  for (const h of [...o.health].sort((a, b) => rank(a) - rank(b) || a.domain.localeCompare(b.domain))) {
    const d = h.domain.toLowerCase();
    if (seen.has(d)) continue;
    seen.add(d);
    const svc = svcByDomain.get(d) || (h.serviceId ? o.services.find((s) => s.id === h.serviceId && s.domain.toLowerCase() === d) : undefined) || null;
    sites.push({
      domain: d, hosting: !!svc, serviceId: svc?.id ?? null, product: svc?.product || '',
      checks: siteChecks(byDomain.get(d) || [], h), ssl: siteSsl(h, o.now), mail: siteMail(h),
      backups: svc?.backups ?? null, usage: usageOf(svc?.usage),
    });
  }
  // active hosting services whose domain has no health row yet still get their panel facts
  for (const s of svcByDomain.values()) {
    const d = s.domain.toLowerCase();
    if (seen.has(d)) continue;
    seen.add(d);
    sites.unshift({ domain: d, hosting: true, serviceId: s.id, product: s.product, checks: null, ssl: null, mail: null, backups: s.backups ?? null, usage: usageOf(s.usage) });
  }
  const shown = sites.filter((s) => s.checks || s.ssl || s.mail || s.backups || s.usage);
  const renewals = o.renewals.filter((r) => r.days >= 0 && r.days <= 60).sort((a, b) => a.days - b.days).slice(0, 12);
  const visible = shown.slice(0, MAX_SITES);
  return {
    v: 1, month: o.month, generatedAt: new Date(o.now).toISOString(), clientId: o.clientId, name: o.name,
    sites: visible, moreSites: Math.max(0, shown.length - visible.length), renewals,
    tips: pickTips(visible, renewals, { upgrade: o.offers?.upgrade, hosting: o.offers?.hosting ?? null, products: o.productTips !== false, hasHosting: o.services.some((s) => /^active$/i.test(s.status)) }),
  };
}

/** Help-video slugs the tips link to (/help/<slug>, lib/help/topics.ts). */
export const TIP_HELP: Partial<Record<TipKey, string>> = {
  ssl: 'issue-ssl-certificate', email_auth: 'add-a-dns-record', backups: 'restore-a-backup', autorenew: 'renew-services', wordpress: 'install-wordpress', site_down: 'open-a-support-ticket',
};
const DISK_TIP_PCT = 80;

/** 1–2 tips, most useful first. Product tips only with an offer from the synced catalog (real price). */
export function pickTips(sites: ReportSite[], renewals: RenewalFact[], o: { upgrade?: Map<number, ProductOffer>; hosting?: ProductOffer | null; products: boolean; hasHosting: boolean }): ReportTip[] {
  const out: ReportTip[] = [];
  const add = (t: ReportTip) => { if (out.length < 2 && !out.some((x) => x.key === t.key)) out.push(t); };
  const help = (k: TipKey) => `/help/${TIP_HELP[k]}`;
  const down = sites.find((s) => s.checks && (s.checks.open.some((k) => DOWN_KEYS.includes(k))));
  if (down) add({ key: 'site_down', domain: down.domain, href: help('site_down'), product: null });
  const ssl = sites.find((s) => s.ssl && s.ssl.state !== 'ok');
  if (ssl) add({ key: 'ssl', domain: ssl.domain, href: help('ssl'), product: null });
  const mail = sites.find((s) => s.mail && (s.mail.spf !== 'ok' || s.mail.dmarc !== 'ok' || s.mail.dkim === 'missing'));
  if (mail) add({ key: 'email_auth', domain: mail.domain, href: help('email_auth'), product: null });
  const full = sites.find((s) => (s.usage?.disk?.pct ?? 0) >= DISK_TIP_PCT);
  if (full && o.products && full.serviceId && o.upgrade?.get(full.serviceId)) { const p = o.upgrade.get(full.serviceId)!; add({ key: 'disk', domain: full.domain, href: p.url, product: p }); }
  const noBackup = sites.find((s) => s.backups && s.backups.count === 0);
  if (noBackup) add({ key: 'backups', domain: noBackup.domain, href: help('backups'), product: null });
  const off = renewals.find((r) => r.kind === 'domain' && r.auto === false);
  if (off) add({ key: 'autorenew', domain: off.name, href: help('autorenew'), product: null });
  if (!out.length) {
    if (o.hasHosting) { const s = sites.find((x) => x.hosting); if (s) add({ key: s.backups ? 'backups' : 'wordpress', domain: s.domain, href: help(s.backups ? 'backups' : 'wordpress'), product: null }); }
    else if (o.products && o.hosting) add({ key: 'hosting', domain: sites[0]?.domain || '', href: o.hosting.url, product: o.hosting });
  }
  return out;
}

/** Nothing worth sending: no site with any data and no renewal coming up. */
export const isEmpty = (r: ReportData) => !r.sites.length && !r.renewals.length;

/** Overall line for the top of the report. */
export function headline(r: ReportData): 'good' | 'attention' | 'urgent' {
  const urgent = r.sites.some((s) => s.ssl?.state === 'problem' || (s.checks?.open || []).some((k) => DOWN_KEYS.includes(k)));
  if (urgent) return 'urgent';
  const att = r.sites.some((s) => s.ssl?.state === 'expiring' || (s.checks?.open.length || 0) > 0 || (s.mail && (s.mail.spf !== 'ok' || s.mail.dmarc !== 'ok' || s.mail.dkim === 'missing')) || (s.usage?.disk?.pct ?? 0) >= DISK_TIP_PCT);
  return att ? 'attention' : 'good';
}

/** Megabytes → "820 MB" / "8.2 GB". */
export function size(mb: number) {
  if (!Number.isFinite(mb)) return '';
  return mb >= 1024 ? `${(Math.round((mb / 1024) * 10) / 10).toString()} GB` : `${Math.round(mb)} MB`;
}
