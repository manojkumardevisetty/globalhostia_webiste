// Hosting usage alerts + one-click upgrade: the pure part (no imports, so tests load it directly).
//   - metrics: disk, bandwidth, inodes and mailboxes vs the plan limits, from the hosting panel (lib/hosting providers,
//     DirectAdmin CMD_API_SHOW_USER_USAGE / _CONFIG, cPanel ResourceUsage) or, as a fallback, the WHMCS usage sync
//   - levels: warn at 80%, critical at 95% (admin-configurable); unlimited or unreported limits never alert
//   - alert plan: one email per service per threshold crossing per calendar month (Dubai), deduplicated by the
//     reminders_log unique key (kind 'usage', item svc:<id>:<metric>, stage warn|critical, cycle YYYY-MM)
//   - upgrade: the next plans in the same WHMCS product group with their real catalog prices (GetProducts), a prorated
//     quote (UpgradeProduct calconly=true) and the order (UpgradeProduct) paid with the client's default method.
//     Nothing here ever upgrades on its own: placeUpgrade() is only called from the customer's confirmed POST.

export type Lang = 'en' | 'ar';
export type MetricKey = 'disk' | 'bandwidth' | 'inodes' | 'mailboxes';
export const METRICS: MetricKey[] = ['disk', 'bandwidth', 'inodes', 'mailboxes'];
export type Level = 'ok' | 'warn' | 'critical';
/** limit null = unlimited (or not set on the plan); unit MB for disk / bandwidth, a count otherwise */
export interface Metric { key: MetricKey; used: number; limit: number | null; unit: 'MB' | '' }
export interface Snapshot { metrics: Metric[]; source: 'panel' | 'whmcs'; at: string; plan?: string }

/* ================================================================ settings */
export type UsageCopy = { subject: string; subjectCritical: string; intro: string };
export interface UsageConfig {
  /** customer alerts (email + push); the portal meters and the upgrade button work either way */
  enabled: boolean;
  warn: number;
  critical: number;
  email: boolean;
  push: boolean;
  metrics: Record<MetricKey, boolean>;
  copy: Record<Lang, UsageCopy>;
  /** the dashboard "Get your site live" checklist (lib/cx/onboarding-core.ts) */
  checklist: boolean;
}
export const DEFAULT_USAGE_COPY: Record<Lang, UsageCopy> = {
  en: {
    subject: '{service} is using {pct}% of its {metric}',
    subjectCritical: 'Action needed: {service} is almost out of {metric}',
    intro: 'Your hosting plan is close to one of its limits. When a limit is reached, uploads and new email can stop and the site can slow down or go offline. Free up space, or move to a bigger plan in one click: you only pay the difference for the rest of this billing period.',
  },
  ar: {
    subject: 'تستخدم {service} نسبة {pct}% من {metric}',
    subjectCritical: 'إجراء مطلوب: {service} على وشك استنفاد {metric}',
    intro: 'اقتربت خطة الاستضافة من أحد حدودها. عند بلوغ الحد قد يتوقف رفع الملفات واستقبال البريد الجديد، وقد يبطؤ الموقع أو يتوقف. حرّر بعض المساحة، أو انتقل إلى خطة أكبر بنقرة واحدة: تدفع الفرق فقط عن بقية فترة الفوترة الحالية.',
  },
};
export const DEFAULT_USAGE: UsageConfig = {
  enabled: false, warn: 80, critical: 95, email: true, push: true,
  metrics: { disk: true, bandwidth: true, inodes: true, mailboxes: true },
  copy: DEFAULT_USAGE_COPY, checklist: true,
};
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const pctInt = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && v !== '' && v !== null ? Math.min(max, Math.max(min, n)) : d; };

/** Any stored value (partial, old, hand-edited) → a complete, valid config. warn < critical always holds. */
export function normalizeUsage(v: any): UsageConfig {
  const c = v && typeof v === 'object' ? v : {};
  const warn = pctInt(c.warn, DEFAULT_USAGE.warn, 50, 98);
  const critical = pctInt(c.critical, DEFAULT_USAGE.critical, warn + 1, 100);
  const copy = {} as Record<Lang, UsageCopy>;
  for (const l of ['en', 'ar'] as Lang[]) {
    const s = c.copy?.[l] || {};
    copy[l] = { subject: clean(s.subject, 150) || DEFAULT_USAGE_COPY[l].subject, subjectCritical: clean(s.subjectCritical, 150) || DEFAULT_USAGE_COPY[l].subjectCritical, intro: clean(s.intro, 1200) || DEFAULT_USAGE_COPY[l].intro };
  }
  const metrics = {} as Record<MetricKey, boolean>;
  for (const k of METRICS) metrics[k] = bool(c.metrics?.[k], true);
  return { enabled: bool(c.enabled, false), warn, critical, email: bool(c.email, true), push: bool(c.push, true), metrics, copy, checklist: bool(c.checklist, true) };
}

/* ================================================================ metrics */
const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
/** panel overview rows (lib/hosting/types.ts UsageItem: quota / bandwidth / inode / nemails) → our four metrics */
const PANEL_KEY: Record<string, MetricKey> = { quota: 'disk', bandwidth: 'bandwidth', inode: 'inodes', nemails: 'mailboxes' };
export function fromPanel(items: { key: string; used: number; limit: number | null }[]): Metric[] {
  const out: Metric[] = [];
  for (const it of items || []) {
    const k = PANEL_KEY[it.key];
    if (!k || out.some((m) => m.key === k)) continue;
    const used = num(it.used) ?? 0, lim = it.limit === null || it.limit === undefined ? null : num(it.limit);
    out.push({ key: k, used: Math.max(0, used), limit: lim !== null && lim > 0 ? lim : null, unit: k === 'disk' || k === 'bandwidth' ? 'MB' : '' });
  }
  return METRICS.map((k) => out.find((m) => m.key === k)).filter((m): m is Metric => !!m);
}
const validDate = (s: unknown) => !!s && !/^0000/.test(String(s)) && !Number.isNaN(Date.parse(String(s).slice(0, 10)));
/** WHMCS GetClientsProducts usage sync (diskusage / disklimit / bwusage / bwlimit in MB; 0 limit = unlimited). Empty before the first sync. */
export function fromWhmcs(p: any): Metric[] {
  if (!validDate(p?.lastupdate)) return [];
  const m = (key: MetricKey, u: unknown, l: unknown): Metric | null => {
    const used = num(u); if (used === null) return null;
    const lim = /unlimited/i.test(String(l ?? '')) ? null : num(l);
    return { key, used: Math.max(0, used), limit: lim !== null && lim > 0 ? lim : null, unit: 'MB' };
  };
  return [m('disk', p.diskusage, p.disklimit), m('bandwidth', p.bwusage, p.bwlimit)].filter((x): x is Metric => !!x);
}

export const pctOf = (m: Pick<Metric, 'used' | 'limit'>) => (m.limit && m.limit > 0 ? Math.round((m.used / m.limit) * 1000) / 10 : null);
export function levelOf(pct: number | null, cfg: Pick<UsageConfig, 'warn' | 'critical'>): Level {
  if (pct === null) return 'ok';
  return pct >= cfg.critical ? 'critical' : pct >= cfg.warn ? 'warn' : 'ok';
}
export const LEVEL_RANK: Record<Level, number> = { ok: 0, warn: 1, critical: 2 };
/** Highest level over the metrics that are switched on, and the metric that set it. */
export function worstOf(metrics: Metric[], cfg: UsageConfig): { level: Level; metric: Metric | null; pct: number | null } {
  let best: { level: Level; metric: Metric | null; pct: number | null } = { level: 'ok', metric: null, pct: null };
  for (const m of metrics) {
    if (!cfg.metrics[m.key]) continue;
    const pct = pctOf(m), level = levelOf(pct, cfg);
    if (pct !== null && (LEVEL_RANK[level] > LEVEL_RANK[best.level] || (level === best.level && (best.pct ?? -1) < pct))) best = { level, metric: m, pct };
  }
  return best;
}
/** "8.2 GB", "512 MB", "1.5 TB"; counts as plain integers */
export function fmtAmount(v: number, unit: 'MB' | '', locale = 'en-US') {
  const n = (x: number, d = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(x);
  if (unit !== 'MB') return n(Math.round(v), 0);
  return v >= 1048576 ? `${n(v / 1048576)} TB` : v >= 1024 ? `${n(v / 1024)} GB` : `${n(Math.round(v), 0)} MB`;
}

/* ================================================================ alert plan */
/** Calendar month in the given zone ("2026-11"): the dedup cycle. */
export const monthKey = (now: number, tz = 'Asia/Dubai') => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date(now)).slice(0, 7);
export const alertItem = (serviceId: number, metric: MetricKey) => `svc:${serviceId}:${metric}`;
export interface AlertLine { metric: MetricKey; level: Exclude<Level, 'ok'>; pct: number; used: number; limit: number; unit: 'MB' | '' }
/**
 * Lines to email now for one service. `sent` = stages already sent (or claimed) this month per item. A metric at
 * critical is sent once as critical; a metric at warn is sent once as warn, and never after critical went out this
 * month (falling back below critical is not news). Most urgent first.
 */
export function planAlerts(serviceId: number, metrics: Metric[], cfg: UsageConfig, sent: Map<string, string[]>): AlertLine[] {
  const out: AlertLine[] = [];
  for (const m of metrics) {
    if (!cfg.metrics[m.key] || !m.limit) continue;
    const pct = pctOf(m)!, level = levelOf(pct, cfg);
    if (level === 'ok') continue;
    const got = sent.get(alertItem(serviceId, m.key)) || [];
    if (got.includes('critical') || got.includes(level)) continue;
    out.push({ metric: m.key, level, pct, used: m.used, limit: m.limit, unit: m.unit });
  }
  return out.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.pct - a.pct);
}

/* ================================================================ copy (EN + AR) */
export const METRIC_LABEL: Record<MetricKey, Record<Lang, string>> = {
  disk: { en: 'disk space', ar: 'مساحة القرص' },
  bandwidth: { en: 'monthly bandwidth', ar: 'نقل البيانات الشهري' },
  inodes: { en: 'files and folders (inodes)', ar: 'الملفات والمجلدات (inodes)' },
  mailboxes: { en: 'email accounts', ar: 'حسابات البريد' },
};
export const METRIC_TIP: Record<MetricKey, Record<Lang, string>> = {
  disk: { en: 'Delete old backups, logs and unused files, or empty large mailboxes.', ar: 'احذف النسخ الاحتياطية والسجلات والملفات القديمة غير المستخدمة، أو أفرغ صناديق البريد الكبيرة.' },
  bandwidth: { en: 'Bandwidth resets on the 1st of each month. Busy sites, large downloads and bots use it fastest.', ar: 'يُعاد ضبط نقل البيانات في أول كل شهر. المواقع المزدحمة والتنزيلات الكبيرة والروبوتات تستهلكه بسرعة.' },
  inodes: { en: 'Every file counts: cache folders, old WordPress copies and email folders add up fastest.', ar: 'كل ملف يُحتسب: مجلدات التخزين المؤقت ونسخ ووردبريس القديمة ومجلدات البريد تتراكم بسرعة.' },
  mailboxes: { en: 'Remove mailboxes nobody uses, or use forwarders instead of separate mailboxes.', ar: 'احذف صناديق البريد غير المستخدمة، أو استخدم إعادة التوجيه بدل الصناديق المنفصلة.' },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m));
export function alertSubject(cfg: UsageConfig, l: Lang, service: string, top: AlertLine) {
  const tpl = top.level === 'critical' ? cfg.copy[l].subjectCritical : cfg.copy[l].subject;
  return fill(tpl, { service, pct: Math.floor(top.pct), metric: METRIC_LABEL[top.metric][l] }).slice(0, 200);
}

/* ================================================================ email (black-and-white reminders look) */
export type UsageMail = {
  lang: Lang; name: string; service: string; domain: string; lines: AlertLine[]; cfg: UsageConfig;
  upgradeUrl: string; panelUrl: string; unsubUrl: string; prefsUrl: string;
};
const FONT_HEAD = `Manrope,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_BODY = `Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const C = { ink: '#222222', deep: '#111111', tint: '#f5f5f5', line: '#e5e5e5', muted: '#666666' };
/** HTML escape that is also safe inside WHMCS (Smarty) email bodies: no raw braces. */
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const url = (u: string) => (/^https:\/\//i.test(u) ? esc(u) : '#');
const T = {
  en: { hi: 'Hi {n},', there: 'there', crit: 'Almost full', warn: 'Getting full', of: '{u} of {l} used', upgrade: 'See bigger plans and prices', panel: 'Free up space in Manage hosting',
    note: 'We check your hosting usage every day and email at most once per limit each month. Nothing changes on your plan unless you choose an upgrade.', why: 'You get this because this hosting plan is on your GlobalHostia account.',
    stop: 'Don’t want usage alerts?', unsub: 'Unsubscribe', prefs: 'Email preferences', tip: 'Tip' },
  ar: { hi: 'مرحبًا {n}،', there: 'بك', crit: 'شبه ممتلئ', warn: 'يقترب من الامتلاء', of: 'تم استخدام {u} من {l}', upgrade: 'اعرض الخطط الأكبر وأسعارها', panel: 'حرّر المساحة من إدارة الاستضافة',
    note: 'نفحص استخدام استضافتك يوميًا ونراسلك مرة واحدة على الأكثر لكل حد في الشهر. لا يتغير شيء في خطتك إلا إذا اخترت الترقية بنفسك.', why: 'تصلك هذه الرسالة لأن خطة الاستضافة هذه مسجلة في حسابك لدى GlobalHostia.',
    stop: 'لا تريد تنبيهات الاستخدام؟', unsub: 'إلغاء الاشتراك', prefs: 'تفضيلات البريد', tip: 'نصيحة' },
} as const;

function button(href: string, text: string, ghost = false): string {
  const bg = ghost ? '#ffffff' : '#111111', fg = ghost ? '#111111' : '#ffffff';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="${ghost ? 'gh-btn2' : 'gh-btn'}" style="border-collapse:separate;"><tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid #111111;border-radius:8px;mso-padding-alt:10px 18px;"><a href="${url(href)}" target="_blank" style="display:inline-block;padding:10px 18px;font-family:${FONT_BODY};font-size:14px;font-weight:600;line-height:1.2;color:${fg};text-decoration:none;border-radius:8px;white-space:nowrap;"><span class="gh-gm-s"><span class="gh-gm-d">${esc(text)}</span></span></a></td></tr></table>`;
}
function bar(pct: number, crit: boolean) {
  const w = Math.max(2, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 6px;border-collapse:separate;"><tr>
    <td width="${w}%" height="8" bgcolor="${crit ? '#555555' : '#888888'}" style="height:8px;line-height:8px;font-size:0;background-color:${crit ? '#555555' : '#888888'};">&nbsp;</td>
    ${w < 100 ? `<td height="8" bgcolor="#d6d6d6" style="height:8px;line-height:8px;font-size:0;background-color:#d6d6d6;">&nbsp;</td>` : ''}</tr></table>`;
}

export function usageEmail(m: UsageMail): { subject: string; html: string; text: string } {
  const l = m.lang, rtl = l === 'ar', L = T[l], start = rtl ? 'right' : 'left';
  const loc = rtl ? 'ar-AE' : 'en-US';
  const top = m.lines[0];
  const subject = alertSubject(m.cfg, l, m.service, top);
  const lab = (s: string, v: Record<string, string | number> = {}) => fill(s, v);
  const rows = m.lines.map((x, i) => `<tr><td style="padding:14px 0;${i ? `border-top:1px solid ${C.line};` : ''}text-align:${start};">
      <div style="margin:0 0 4px;"><span class="gh-badge" style="display:inline-block;padding:2px 9px;border-radius:999px;${x.level === 'critical' ? 'background-color:#111111;color:#ffffff;' : `background-color:#eeeeee;color:${C.deep};`}font-size:11px;font-weight:700;">${esc(x.level === 'critical' ? L.crit : L.warn)} &middot; ${esc(Math.floor(x.pct))}%</span></div>
      <div class="gh-v" style="font-size:16px;font-weight:700;color:${C.deep};line-height:1.35;">${esc(METRIC_LABEL[x.metric][l].replace(/^./, (c) => c.toUpperCase()))}</div>
      ${bar(x.pct, x.level === 'critical')}
      <div class="gh-muted" style="font-size:13.5px;line-height:1.5;color:${C.ink};">${esc(lab(L.of, { u: fmtAmount(x.used, x.unit, loc), l: fmtAmount(x.limit, x.unit, loc) }))}</div>
      <div class="gh-small" style="font-size:13px;line-height:1.55;color:${C.muted};margin-top:4px;"><b>${esc(L.tip)}:</b> ${esc(METRIC_TIP[x.metric][l])}</div></td></tr>`).join('');
  const panel = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gh-panel" style="background-color:${C.tint};border:1px solid ${C.line};border-radius:12px;margin:0 0 18px;"><tr><td style="padding:12px 20px 6px;">
    <div class="gh-k" style="font-family:${FONT_HEAD};font-size:13px;font-weight:800;letter-spacing:.04em;color:${C.muted};text-transform:uppercase;text-align:${start};padding:4px 0 2px;">${esc(m.service)}${m.domain ? ` &middot; <span style="direction:ltr;unicode-bidi:embed;">${esc(m.domain)}</span>` : ''}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table>`;
  const p = (html: string, small = false) => `<p${small ? ' class="gh-small"' : ''} style="margin:0 0 16px;${small ? `font-size:13px;line-height:1.55;color:${C.muted};` : ''}">${html}</p>`;
  const inner = [
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${esc(m.cfg.copy[l].intro.slice(0, 110))}&#8203;&#8203;&#8203;</div>`,
    `<h1 style="margin:0 0 14px;font-family:${FONT_HEAD};font-size:26px;line-height:1.25;font-weight:800;color:${C.deep};">${esc(subject)}</h1>`,
    p(esc(lab(L.hi, { n: m.name.trim() || L.there }))), p(esc(m.cfg.copy[l].intro)), panel,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 12px;"><tr><td>${button(m.upgradeUrl, L.upgrade)}</td></tr></table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td>${button(m.panelUrl, L.panel, true)}</td></tr></table>`,
    p(esc(L.note), true),
    `<hr class="gh-hr" style="border:0;border-top:1px solid ${C.line};margin:8px 0 16px;">`,
    p(`${esc(L.why)} ${esc(L.stop)} <a href="${url(m.unsubUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(L.unsub)}</a> &middot; <a href="${url(m.prefsUrl)}" target="_blank" class="gh-link" style="color:${C.ink};">${esc(L.prefs)}</a>`, true),
  ].join('\n');
  const html = rtl ? `<div dir="rtl" lang="ar" style="direction:rtl;text-align:right;">${inner}</div>` : `<div dir="ltr" lang="en">${inner}</div>`;
  const text = [subject, '', lab(L.hi, { n: m.name || L.there }), '', m.cfg.copy[l].intro, '', `${m.service}${m.domain ? ` (${m.domain})` : ''}`,
    ...m.lines.map((x) => `- ${METRIC_LABEL[x.metric][l]}: ${Math.floor(x.pct)}% (${lab(L.of, { u: fmtAmount(x.used, x.unit, loc), l: fmtAmount(x.limit, x.unit, loc) })})`), '',
    `${L.upgrade}: ${m.upgradeUrl}`, `${L.panel}: ${m.panelUrl}`, '', `${L.unsub}: ${m.unsubUrl}`].join('\n');
  return { subject, html, text };
}

/* ================================================================ upgrade (WHMCS) */
export type Call = <T = any>(action: string, params?: Record<string, string | number | boolean | undefined>) => Promise<T>;
const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
/** WHMCS service billing cycle ("Semi-Annually", "Free Account") → pricing key ("semiannually"); null = cannot be upgraded here */
export function cycleKey(c: unknown): string | null {
  const s = String(c || '').toLowerCase().replace(/[^a-z]/g, '');
  if (['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially'].includes(s)) return s;
  if (s === 'onetime') return 'onetime';
  return null;
}
const priceIn = (pricing: any, cur: string, cycle: string): number | null => {
  const p = pricing?.[cur];
  if (!p) return null;
  const v = num(cycle === 'onetime' ? p.monthly : p[cycle]);
  return v !== null && v >= 0 ? v : null;
};
const setupIn = (pricing: any, cur: string, cycle: string): number => {
  const k: Record<string, string> = { monthly: 'msetupfee', quarterly: 'qsetupfee', semiannually: 'ssetupfee', annually: 'asetupfee', biennially: 'bsetupfee', triennially: 'tsetupfee', onetime: 'msetupfee' };
  return Math.max(0, num(pricing?.[cur]?.[k[cycle]]) ?? 0);
};
const offFlag = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
/** first lines of a WHMCS description ("10 GB NVMe<br />Unlimited Bandwidth") as feature bullets */
export const featuresOf = (d: unknown) => String(d || '').split(/<br\s*\/?>|\r?\n/i).map((s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim()).filter(Boolean).slice(0, 5);

export interface PlanOption { pid: number; name: string; group: string; cycle: string; price: number; setupFee: number; currency: string; features: string[] }
export interface UpgradeOptions { current: { pid: number; name: string; price: number | null; cycle: string } | null; options: PlanOption[]; currency: string; reason?: 'cycle' | 'product' | 'none' }

/**
 * Next plans for a service: same WHMCS product group (GetProducts pid → gid, then GetProducts gid), not hidden or
 * retired, priced in the client's currency for the service's own billing cycle, dearer than the current plan
 * (cheapest first, at most `max`). Prices are the catalog prices exactly as WHMCS returns them.
 */
export async function upgradeOptions(call: Call, svc: { pid: unknown; billingcycle: unknown }, currency: string, max = 3): Promise<UpgradeOptions> {
  const cur = String(currency || 'USD').toUpperCase();
  const cycle = cycleKey(svc.billingcycle);
  if (!cycle || cycle === 'onetime') return { current: null, options: [], currency: cur, reason: 'cycle' };
  const pid = Number(svc.pid);
  const me = pid > 0 ? arr((await call('GetProducts', { pid })).products?.product).find((x: any) => Number(x.pid) === pid) : null;
  if (!me) return { current: null, options: [], currency: cur, reason: 'product' };
  const gid = Number(me.gid);
  const group = arr((await call('GetProducts', { gid })).products?.product).filter((x: any) => Number(x.gid) === gid);
  const mine = priceIn(me.pricing, cur, cycle);
  const options = group
    .filter((x: any) => Number(x.pid) !== pid && !offFlag(x.hidden) && !offFlag(x.retired) && (x.paytype || 'recurring') === 'recurring')
    .map((x: any) => ({ x, price: priceIn(x.pricing, cur, cycle) }))
    .filter((o: any) => o.price !== null && (mine === null || o.price > mine))
    .sort((a: any, b: any) => a.price - b.price || Number(a.x.pid) - Number(b.x.pid))
    .slice(0, max)
    .map(({ x, price }: any) => ({ pid: Number(x.pid), name: String(x.name || ''), group: String(x.groupname || me.groupname || ''), cycle, price, setupFee: setupIn(x.pricing, cur, cycle), currency: cur, features: featuresOf(x.description) }));
  return { current: { pid, name: String(me.name || ''), price: mine, cycle }, options, currency: cur, reason: options.length ? undefined : 'none' };
}

/** Payment method for the order: the client's default gateway, else the one on the service, else the first active one. */
export function paymentMethodFor(client: any, svc: any, methods: { module: string }[]): string | null {
  const ok = new Set(methods.map((m) => String(m.module)));
  for (const c of [client?.defaultgateway, svc?.paymentmethod]) if (c && (ok.size === 0 || ok.has(String(c)))) return String(c);
  return methods[0]?.module ? String(methods[0].module) : null;
}
export async function paymentMethods(call: Call) {
  return arr((await call('GetPaymentMethods')).paymentmethods?.paymentmethod).map((m: any) => ({ module: String(m.module || ''), name: String(m.displayname || m.module || '') })).filter((m) => m.module);
}

export interface Quote { pid: number; cycle: string; dueToday: number; price: number; discount: number; daysLeft: number | null; totalDays: number | null; newName: string }
/** Prorated price for moving to `pid` now: UpgradeProduct calconly=true (WHMCS does the maths; no order is created). */
export async function quoteUpgrade(call: Call, o: { serviceId: number; pid: number; cycle: string; paymentmethod: string }): Promise<Quote> {
  const r = await call('UpgradeProduct', { serviceid: o.serviceId, type: 'product', newproductid: o.pid, newproductbillingcycle: o.cycle, paymentmethod: o.paymentmethod, calconly: true });
  return parseQuote(r, o.pid, o.cycle);
}
export function parseQuote(r: any, pid: number, cycle: string): Quote {
  const price = num(r?.price) ?? num(r?.total) ?? null;
  if (price === null) throw new Error('No price in the upgrade quote');
  const discount = Math.max(0, num(r?.discount) ?? 0);
  // newer WHMCS builds return "total" (after discount); older ones only price + discount
  const due = num(r?.total) ?? Math.max(0, price - discount);
  const dl = num(r?.daysuntilrenewal), td = num(r?.totaldays);
  return { pid: Number(r?.newproductid) || pid, cycle: String(r?.newproductbillingcycle || cycle).toLowerCase(), dueToday: Math.round(due * 100) / 100, price, discount, daysLeft: dl, totalDays: td, newName: String(r?.newproductname || '') };
}
/** Create the upgrade order (UpgradeProduct without calconly). Sent once. Returns the order and its invoice (0 when nothing is due). */
export async function placeUpgrade(call: Call, o: { serviceId: number; pid: number; cycle: string; paymentmethod: string }): Promise<{ orderId: number; invoiceId: number }> {
  const r = await call('UpgradeProduct', { serviceid: o.serviceId, type: 'product', newproductid: o.pid, newproductbillingcycle: o.cycle, paymentmethod: o.paymentmethod });
  const orderId = Number(r?.orderid) || 0;
  let invoiceId = Number(r?.invoiceid) || 0;
  if (!invoiceId && orderId) {
    // some builds return only the order: read its invoice (read-only, retried)
    const ord = arr((await call('GetOrders', { id: orderId }).catch(() => ({}))).orders?.order).find((x: any) => Number(x.id) === orderId);
    invoiceId = Number(ord?.invoiceid) || 0;
  }
  if (!orderId && !invoiceId) throw new Error('The billing system did not return an order');
  return { orderId, invoiceId };
}
