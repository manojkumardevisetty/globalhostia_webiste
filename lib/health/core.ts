// Domain health alerts: the pure part. Settings, the rules that turn probe facts into issues (SSL, HTTPS, DNS,
// nameservers, A record, MX, SPF / DKIM / DMARC, registration expiry), SPF and DMARC parsing, expiry thresholds,
// state change (new / worse / resolved, per issue), the check cursor, fix links, the plain-language copy (EN + AR)
// and one bounded run (runCycle) with every I/O step injected. No imports at runtime, so tests load it directly;
// lib/health/engine.ts wires it to WHMCS, the hosting panels, the database and the reminders delivery.

/* ================================================================ types */
export type Sev = 'critical' | 'warning' | 'info';
export type Lang = 'en' | 'ar';
export type Source = 'registered' | 'service' | 'addon' | 'alias';
export type CheckKey = 'ssl' | 'https' | 'dns' | 'ns' | 'a' | 'mx' | 'spf' | 'dkim' | 'dmarc' | 'reg';
export const CHECKS: CheckKey[] = ['ssl', 'https', 'dns', 'ns', 'a', 'mx', 'spf', 'dkim', 'dmarc', 'reg'];
export const CHECK_LABEL: Record<CheckKey, string> = {
  ssl: 'SSL certificate (present, expiry, name, chain)', https: 'Website reachable over HTTPS', dns: 'Domain resolves (A / AAAA)', ns: 'Nameservers ours or declared external',
  a: 'A record points to the hosting server', mx: 'MX valid (when using our email)', spf: 'SPF present and valid', dkim: 'DKIM present (our email)', dmarc: 'DMARC present and valid', reg: 'Domain registration expiry',
};
export type IssueKey =
  | 'ssl_missing' | 'ssl_expired' | 'ssl_expiring' | 'ssl_name' | 'ssl_chain' | 'ssl_untrusted'
  | 'site_down' | 'site_error'
  | 'dns_unresolved' | 'ns_none' | 'ns_mixed' | 'ns_external' | 'a_mismatch'
  | 'mx_missing' | 'mx_broken' | 'spf_missing' | 'spf_multiple' | 'spf_invalid' | 'spf_server' | 'dkim_missing' | 'dmarc_missing' | 'dmarc_invalid'
  | 'reg_expiring' | 'reg_expired';
export type Params = Record<string, string | number>;
export interface Issue { key: IssueKey; check: CheckKey; sev: Sev; stage: number; params: Params }

/** What the run knows about one customer domain (from WHMCS and the hosting panel). */
export interface Target {
  domain: string; clientId: number; sources: Source[];
  whmcsDomainId?: number | null; serviceId?: number | null; serverId?: string | null; serverIp?: string | null;
  /** the panel can issue free SSL for this domain (managed hosting account) */
  sslIssue?: boolean;
  reg?: { expiry: string | null; status: string; autoRenew: boolean } | null;
}

/** What lib/health/probe.ts found (all optional parts: a disabled check gathers nothing). */
export interface DomainFacts {
  domain: string; checkedAt: string;
  dns: { ok: boolean; via: 'udp' | 'doh' | 'none'; error?: string; nx?: boolean; ns: string[]; a: string[]; aaaa: string[] };
  tls?: { connected: boolean; error?: string; authorized?: boolean; authError?: string; validTo?: string; daysLeft?: number; names?: string[]; issuer?: string; nameOk?: boolean } | null;
  web?: { https?: { status?: number; error?: string; ms?: number }; http?: { status?: number; error?: string } } | null;
  mail?: { mx: { host: string; pri: number; ips: string[] }[]; spf: string[]; dmarc: string[]; dkim: string[] } | null;
  /** why web / TLS were skipped (e.g. private address) */
  skipped?: string;
}

/* ================================================================ settings */
export interface HealthConfig {
  /** kill switch: false = no checks and no alerts */
  enabled: boolean;
  /** send alerts to customers (checks still run when off) */
  alerts: boolean;
  /** also email a short notice when an alerted problem is fixed */
  resolvedNotice: boolean;
  checks: Record<CheckKey, boolean>;
  /** SSL expiry alert stages (days left), e.g. 21, 7, 2, 0 */
  sslDays: number[];
  /** domain registration expiry stages (days left) */
  domainDays: number[];
  /** hours before a domain is checked again by the cron (cursor) */
  recheckHours: number;
  concurrency: number;
  /** max domains probed per run */
  perRun: number;
  timeouts: { dns: number; tls: number; http: number };
  sources: { addon: boolean; alias: boolean };
  whatsapp: { enabled: boolean; template: string };
  push: boolean;
}
export const DEFAULT_HEALTH: HealthConfig = {
  enabled: true, alerts: false, resolvedNotice: true,
  checks: { ssl: true, https: true, dns: true, ns: true, a: true, mx: true, spf: true, dkim: true, dmarc: true, reg: true },
  sslDays: [21, 7, 2, 0], domainDays: [30, 7, 1],
  recheckHours: 20, concurrency: 8, perRun: 400,
  timeouts: { dns: 3000, tls: 7000, http: 8000 },
  sources: { addon: true, alias: true },
  whatsapp: { enabled: false, template: '' }, push: true,
};
const int = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
/** "21, 7,2 0" / [21,7] → unique, descending, within [min,max]. 0 = "on the day". */
export function stageList(v: unknown, d: number[], min = 0, max = 120): number[] {
  const raw = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : []).filter((x) => String(x).trim() !== '');
  const out = [...new Set(raw.map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n >= min && n <= max))].sort((a, b) => b - a).slice(0, 6);
  return out.length ? out : [...d];
}
export const TEMPLATE_RE = /^[a-z0-9_]{1,512}$/;
export function normalizeHealth(v: any): HealthConfig {
  const D = DEFAULT_HEALTH, c = v && typeof v === 'object' ? v : {};
  const checks = {} as Record<CheckKey, boolean>;
  for (const k of CHECKS) checks[k] = bool(c.checks?.[k], D.checks[k]);
  const tpl = typeof c.whatsapp?.template === 'string' ? c.whatsapp.template.trim() : '';
  return {
    enabled: bool(c.enabled, D.enabled), alerts: bool(c.alerts, D.alerts), resolvedNotice: bool(c.resolvedNotice, D.resolvedNotice), checks,
    sslDays: stageList(c.sslDays, D.sslDays, 0, 60), domainDays: stageList(c.domainDays, D.domainDays, 0, 120),
    recheckHours: int(c.recheckHours, D.recheckHours, 1, 24), concurrency: int(c.concurrency, D.concurrency, 1, 24), perRun: int(c.perRun, D.perRun, 1, 5000),
    timeouts: { dns: int(c.timeouts?.dns, D.timeouts.dns, 500, 10000), tls: int(c.timeouts?.tls, D.timeouts.tls, 1000, 20000), http: int(c.timeouts?.http, D.timeouts.http, 1000, 20000) },
    sources: { addon: bool(c.sources?.addon, D.sources.addon), alias: bool(c.sources?.alias, D.sources.alias) },
    whatsapp: { enabled: bool(c.whatsapp?.enabled, false), template: TEMPLATE_RE.test(tpl) ? tpl : '' }, push: bool(c.push, D.push),
  };
}

/* ================================================================ helpers */
const DAY = 86400_000;
const host = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');
export const SEV_RANK: Record<Sev, number> = { info: 0, warning: 1, critical: 2 };
const EXPIRY: IssueKey[] = ['ssl_expiring', 'reg_expiring'];
/** Higher = worse. Expiry issues get worse as the stage (days left) gets smaller. */
export const level = (i: { key: string; sev: Sev; stage: number }) => SEV_RANK[i.sev] * 1000 + (EXPIRY.includes(i.key as IssueKey) ? 500 - Math.min(Math.max(i.stage, 0), 499) : 0);

/** Most urgent threshold the value falls under: 25 → null, 21..8 → 21, 7..3 → 7, 2..1 → 2, 0 → 0 (with [21,7,2,0]). Negative → null (expired). */
export function expiryStage(days: number | null | undefined, stages: number[]): number | null {
  if (days === null || days === undefined || !Number.isFinite(days) || days < 0) return null;
  const asc = [...stages].sort((a, b) => a - b);
  const s = asc.find((t) => days <= t);
  return s === undefined ? null : s;
}
/** Whole days from now until an ISO date (UTC calendar). null for empty / 0000-00-00. */
export function daysTo(date: unknown, now: number): number | null {
  const s = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) || /^0000/.test(s)) return null;
  const t = Date.parse(s.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(t)) return null;
  const today = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((t - today) / DAY);
}
export const nsKind = (ns: string[], ours: string[]): 'ours' | 'mixed' | 'external' | 'none' => {
  const l = ns.map(host).filter(Boolean);
  if (!l.length) return 'none';
  const set = new Set(ours.map(host));
  const n = l.filter((x) => set.has(x)).length;
  return n === l.length ? 'ours' : n ? 'mixed' : 'external';
};
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) { const l = ip.toLowerCase(); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:'); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
const hosting = (t: Target) => t.sources.some((s) => s !== 'registered');

/* ================================================================ inventory merge */
export interface SvcPanel { domains: string[]; aliases: string[]; ip: string; ssl: boolean; serverId: string }
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const offRenew = (d: any) => d.donotrenew === true || d.donotrenew === 1 || d.donotrenew === '1' || d.donotrenew === 'true';
/** Hosting modules whose service domain is a website (VPS, SSL products and email-only services are skipped). */
export const HOSTING_MODULE = /cpanel|directadmin|plesk|interworx|cyberpanel|hestia/i;
/**
 * WHMCS GetClientsDomains + GetClientsProducts rows (+ what each managed hosting account's panel lists) → one target
 * per (client, domain), sources merged. Registered: Active / Grace / Redemption, Expired up to 45 days. Services:
 * Active, with a domain, on a managed panel or a hosting module.
 */
export function buildTargets(domains: any[], products: any[], o: { now: number; managed: (p: any) => boolean; panel: (p: any) => SvcPanel | null; addon: boolean; alias: boolean }): Target[] {
  const map = new Map<string, Target>();
  const put = (domain: unknown, cid: number, src: Source, patch: Partial<Target> = {}) => {
    const d = host(domain);
    if (!DOMAIN_RE.test(d) || !(cid > 0)) return;
    const k = `${cid}|${d}`;
    let t = map.get(k);
    if (!t) map.set(k, (t = { domain: d, clientId: cid, sources: [] }));
    if (!t.sources.includes(src)) t.sources.push(src);
    for (const [kk, v] of Object.entries(patch)) if (v !== undefined && v !== null && (t as any)[kk] == null) (t as any)[kk] = v;
    if (patch.sslIssue) t.sslIssue = true;
  };
  for (const d of domains || []) {
    const st = String(d.status || '');
    const exp = String(d.expirydate && !/^0000/.test(String(d.expirydate)) ? d.expirydate : d.nextduedate || '').slice(0, 10);
    const days = daysTo(exp, o.now);
    if (!/^(active|grace|redemption|expired)$/i.test(st) || (/^expired$/i.test(st) && (days === null || days < -45))) continue;
    put(d.domainname, Number(d.userid), 'registered', { whmcsDomainId: Number(d.id), reg: { expiry: exp || null, status: st, autoRenew: !offRenew(d) } });
  }
  for (const p of products || []) {
    if (!/^active$/i.test(String(p.status)) || !p.domain || !o.managed(p)) continue;
    const cid = Number(p.clientid), c = o.panel(p);
    const ip = c?.ip || String(p.dedicatedip || '').trim() || String(p.serverip || '').trim() || '';
    const base: Partial<Target> = { serviceId: Number(p.id), serverId: c?.serverId || null, serverIp: /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null, sslIssue: !!c?.ssl };
    put(p.domain, cid, 'service', base);
    if (c && o.addon) for (const d of c.domains) if (host(d) !== host(p.domain)) put(d, cid, 'addon', base);
    if (c && o.alias) for (const d of c.aliases) put(d, cid, 'alias', base);
  }
  return [...map.values()];
}

/* ================================================================ SPF / DMARC */
export interface Spf { ok: boolean; errors: string[]; all: '+' | '-' | '~' | '?' | null; lookups: number; ip4: string[]; a: boolean; mx: boolean; includes: string[]; redirect: string | null }
const IP4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/;
const DOMSPEC = /^[a-z0-9%{}._+-]+$/i;
/** RFC 7208 shape check: version, mechanisms, modifiers, DNS lookup budget (10), +all. */
export function parseSpf(rec: string): Spf {
  const out: Spf = { ok: true, errors: [], all: null, lookups: 0, ip4: [], a: false, mx: false, includes: [], redirect: null };
  const terms = String(rec || '').trim().split(/\s+/).filter(Boolean);
  if (!terms.length || terms[0].toLowerCase() !== 'v=spf1') { out.errors.push('does not start with v=spf1'); out.ok = false; return out; }
  for (const raw of terms.slice(1)) {
    const mod = /^([a-z][a-z0-9_.-]*)=(.*)$/i.exec(raw);
    if (mod) {
      const name = mod[1].toLowerCase();
      if (name === 'redirect') { if (!DOMSPEC.test(mod[2])) out.errors.push(`bad redirect "${raw}"`); else { out.redirect = mod[2].toLowerCase(); out.lookups++; } }
      else if (name === 'exp') { if (!DOMSPEC.test(mod[2])) out.errors.push(`bad exp "${raw}"`); }
      continue; // unknown modifiers are allowed
    }
    const m = /^([+\-~?]?)([a-z0-9]+)(?:([:/])(.*))?$/i.exec(raw);
    if (!m) { out.errors.push(`unknown term "${raw}"`); continue; }
    const q = (m[1] || '+') as Spf['all'], mech = m[2].toLowerCase(), sep = m[3], arg = m[4] ?? '';
    switch (mech) {
      case 'all': if (sep) out.errors.push(`bad term "${raw}"`); else out.all = q; break;
      case 'include': case 'exists':
        if (sep !== ':' || !arg || !DOMSPEC.test(arg)) out.errors.push(`bad ${mech} "${raw}"`); else { out.lookups++; if (mech === 'include') out.includes.push(arg.toLowerCase()); }
        break;
      case 'a': case 'mx': out.lookups++; if (mech === 'a') out.a = true; else out.mx = true; if (sep === ':' && !arg) out.errors.push(`bad ${mech} "${raw}"`); break;
      case 'ptr': out.lookups++; break;
      case 'ip4': if (sep !== ':' || !IP4.test(arg)) out.errors.push(`bad address "${raw}"`); else out.ip4.push(arg); break;
      case 'ip6': if (sep !== ':' || !/^[0-9a-f:.]+(\/\d{1,3})?$/i.test(arg) || !arg.includes(':')) out.errors.push(`bad address "${raw}"`); break;
      default: out.errors.push(`unknown mechanism "${raw}"`);
    }
  }
  if (out.lookups > 10) out.errors.push(`needs ${out.lookups} DNS lookups (the limit is 10)`);
  if (out.all === '+') out.errors.push('"+all" lets anyone send as you');
  out.ok = out.errors.length === 0;
  return out;
}
/** SPF that authorises the hosting server: its IP, a / mx (when those point here) or a redirect / include we cannot expand. */
export function spfCoversServer(s: Spf, serverIp: string | null | undefined, aHere: boolean, mxHere: boolean): boolean {
  if (!serverIp) return true;
  if (s.ip4.some((x) => x === serverIp || x === `${serverIp}/32` || (x.includes('/') && inCidr(serverIp, x)))) return true;
  if ((s.a && aHere) || (s.mx && mxHere)) return true;
  return s.includes.length > 0 || !!s.redirect; // cannot expand includes here: give the benefit of the doubt
}
function inCidr(ip: string, cidr: string) {
  const [net, bits] = cidr.split('/'); const n = Number(bits);
  const v = (s: string) => s.split('.').reduce((a, x) => (a << 8) + Number(x), 0) >>> 0;
  const mask = n === 0 ? 0 : (~0 << (32 - n)) >>> 0;
  return (v(ip) & mask) === (v(net) & mask);
}
export interface Dmarc { ok: boolean; errors: string[]; p: string | null; sp: string | null; pct: number | null; rua: string[] }
/** RFC 7489 shape check: v=DMARC1 first, p= required (none / quarantine / reject), sp, pct, rua/ruf mailto: URIs. */
export function parseDmarc(rec: string): Dmarc {
  const out: Dmarc = { ok: true, errors: [], p: null, sp: null, pct: null, rua: [] };
  const tags = String(rec || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return i < 0 ? [x.toLowerCase(), ''] : [x.slice(0, i).trim().toLowerCase(), x.slice(i + 1).trim()]; });
  if (!tags.length || tags[0][0] !== 'v' || tags[0][1] !== 'DMARC1') { out.errors.push('does not start with v=DMARC1'); out.ok = false; return out; }
  const POL = ['none', 'quarantine', 'reject'];
  for (const [k, v] of tags.slice(1)) {
    if (k === 'p') { if (!POL.includes(v.toLowerCase())) out.errors.push(`p=${v} is not none, quarantine or reject`); else out.p = v.toLowerCase(); }
    else if (k === 'sp') { if (!POL.includes(v.toLowerCase())) out.errors.push(`sp=${v} is not none, quarantine or reject`); else out.sp = v.toLowerCase(); }
    else if (k === 'pct') { const n = Number(v); if (!/^\d{1,3}$/.test(v) || n > 100) out.errors.push(`pct=${v} is not 0-100`); else out.pct = n; }
    else if (k === 'rua' || k === 'ruf') { for (const u of v.split(',').map((x) => x.trim()).filter(Boolean)) { if (!/^mailto:[^\s@]+@[^\s@]+\.[a-z]{2,}(!\d+[kmgt]?)?$/i.test(u)) out.errors.push(`${k} "${u}" is not a mailto: address`); else if (k === 'rua') out.rua.push(u); } }
    else if (k === 'adkim' || k === 'aspf') { if (!/^[rs]$/i.test(v)) out.errors.push(`${k}=${v} is not r or s`); }
  }
  if (!out.p) out.errors.push('the required p= tag is missing');
  out.ok = out.errors.length === 0;
  return out;
}
export const spfFor = (ip: string | null | undefined) => `v=spf1 a mx${ip ? ` ip4:${ip}` : ''} ~all`;
export const dmarcFor = (domain: string) => `v=DMARC1; p=none; rua=mailto:postmaster@${domain}`;

/* ================================================================ evaluate */
const CHAIN = /UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT/;
const SELF = /SELF_SIGNED/;

/** Facts → issues. `external`: the customer said DNS / the website are managed elsewhere on purpose. */
export function evaluate(t: Target, f: DomainFacts, o: { cfg: HealthConfig; ourNs: string[]; external?: boolean; now: number }): Issue[] {
  const cfg = o.cfg, on = cfg.checks, out: Issue[] = [];
  const add = (key: IssueKey, check: CheckKey, sev: Sev, params: Params = {}, stage = 0) => { if (on[check]) out.push({ key, check, sev, stage, params: { domain: t.domain, ...params } }); };

  /* registration (WHMCS data; independent of DNS) */
  if (t.reg && on.reg) {
    const days = daysTo(t.reg.expiry, o.now);
    const st = String(t.reg.status || '');
    if (/^(grace|redemption|expired)$/i.test(st) || (/^active$/i.test(st) && days !== null && days < 0)) add('reg_expired', 'reg', 'critical', { date: String(t.reg.expiry || '').slice(0, 10) });
    else if (/^active$/i.test(st) && days !== null) {
      const stage = expiryStage(days, cfg.domainDays);
      // auto-renew on: WHMCS invoices it ahead of time, so only the last week (unpaid renewal) is a problem
      if (stage !== null && (!t.reg.autoRenew || days <= 7)) add('reg_expiring', 'reg', days <= 7 ? 'critical' : 'warning', { days, date: String(t.reg.expiry).slice(0, 10), auto: t.reg.autoRenew ? 'on' : 'off' }, stage);
    }
  }

  const d = f.dns;
  if (!d.ok) return out; // our lookup failed (both UDP and DoH): unknown, never an alert
  const k = nsKind(d.ns, o.ourNs);
  const resolves = d.a.length + d.aaaa.length > 0;
  if (d.nx || (k === 'none' && !resolves)) { add('ns_none', 'ns', hosting(t) ? 'critical' : 'warning'); return out; }
  if (!resolves) { add('dns_unresolved', 'dns', hosting(t) ? 'critical' : 'warning'); }
  if (k === 'mixed') add('ns_mixed', 'ns', 'warning', { ns: d.ns.slice(0, 4).join(', ') });
  else if (k === 'external' && !o.external) add('ns_external', 'ns', 'info', { ns: d.ns.slice(0, 2).join(', ') });
  const aHere = !!t.serverIp && d.a.includes(t.serverIp);
  if (resolves && t.serverIp && hosting(t) && !aHere && !o.external) add('a_mismatch', 'a', 'warning', { ips: [...d.a, ...d.aaaa].slice(0, 3).join(', '), ip: t.serverIp });

  /* website + certificate */
  if (resolves && !f.skipped) {
    const tl = f.tls, w = f.web;
    const httpUp = !!w?.http?.status;
    if (tl && !tl.connected) {
      if (httpUp) add('ssl_missing', 'ssl', 'warning', { reason: tl.error || 'refused' });
      else if (w) add('site_down', 'https', 'critical', { reason: w.https?.error || tl.error || 'timeout' });
    } else if (tl && tl.connected) {
      const exp = tl.validTo ? Date.parse(tl.validTo) : NaN;
      const expired = /CERT_HAS_EXPIRED/.test(tl.authError || '') || (Number.isFinite(exp) && exp < o.now);
      if (expired) add('ssl_expired', 'ssl', 'critical', { date: tl.validTo ? tl.validTo.slice(0, 10) : '' });
      else {
        if (tl.nameOk === false) add('ssl_name', 'ssl', 'critical', { names: (tl.names || []).slice(0, 3).join(', ') || '-' });
        if (tl.authorized === false && tl.authError && !/ALTNAME|HOSTNAME/.test(tl.authError)) { // a name mismatch is ssl_name above
          if (CHAIN.test(tl.authError)) add('ssl_chain', 'ssl', 'warning');
          else add('ssl_untrusted', 'ssl', 'critical', { reason: SELF.test(tl.authError) ? 'self-signed' : 'untrusted' });
        }
        const stage = expiryStage(tl.daysLeft ?? null, cfg.sslDays);
        if (stage !== null) add('ssl_expiring', 'ssl', stage <= 2 ? 'critical' : 'warning', { days: Math.max(0, tl.daysLeft ?? 0), date: tl.validTo ? tl.validTo.slice(0, 10) : '' }, stage);
      }
      if (w?.https) {
        if (w.https.status && w.https.status >= 500) add('site_error', 'https', 'warning', { code: w.https.status });
        else if (!w.https.status && w.https.error && !httpUp) add('site_down', 'https', 'critical', { reason: w.https.error });
      }
    }
  }

  /* email */
  const m = f.mail;
  if (m) {
    const nullMx = m.mx.length === 1 && host(m.mx[0].host) === '';
    const mxHere = !!t.serverIp && m.mx.some((x) => x.ips.includes(t.serverIp!));
    const hasMail = m.mx.length > 0 && !nullMx;
    if (!m.mx.length && hosting(t) && k === 'ours') add('mx_missing', 'mx', 'warning');
    if (hasMail && m.mx.every((x) => !x.ips.length)) add('mx_broken', 'mx', 'critical', { host: m.mx[0].host });
    if (hasMail || mxHere) {
      if (!m.spf.length) add('spf_missing', 'spf', 'warning', { value: spfFor(mxHere ? t.serverIp : null) });
      else if (m.spf.length > 1) add('spf_multiple', 'spf', 'warning', { n: m.spf.length });
      else {
        const s = parseSpf(m.spf[0]);
        if (!s.ok) add('spf_invalid', 'spf', 'warning', { reason: s.errors[0] });
        else if (mxHere && !spfCoversServer(s, t.serverIp, aHere, mxHere)) add('spf_server', 'spf', 'warning', { ip: t.serverIp! });
      }
      if (mxHere && !m.dkim.length) add('dkim_missing', 'dkim', 'warning');
      if (!m.dmarc.length) add('dmarc_missing', 'dmarc', 'warning', { value: dmarcFor(t.domain) });
      else { const r = parseDmarc(m.dmarc[0]); if (!r.ok) add('dmarc_invalid', 'dmarc', 'warning', { reason: r.errors[0] }); }
    }
  }
  return out;
}
export const worst = (issues: { sev: Sev }[]): 'ok' | 'warning' | 'critical' =>
  issues.some((i) => i.sev === 'critical') ? 'critical' : issues.some((i) => i.sev === 'warning') ? 'warning' : 'ok';

/* ================================================================ state change */
export interface IssueState { sev: Sev; stage: number; first: string; last: string; params: Params; check: CheckKey }
export interface AlertMark { at: string; sev: Sev; stage: number; first: string }
export type IssueMap = Partial<Record<IssueKey, IssueState>>;
export type MarkMap = Partial<Record<IssueKey, AlertMark>>;

/** Merge the issues found now into the stored state: keeps first-seen times, drops what is gone. */
export function mergeIssues(prev: IssueMap, now: Issue[], at: string): { issues: IssueMap; opened: IssueKey[]; worse: IssueKey[]; resolved: IssueKey[] } {
  const issues: IssueMap = {}, opened: IssueKey[] = [], worse: IssueKey[] = [];
  for (const i of now) {
    const p = prev[i.key];
    issues[i.key] = { sev: i.sev, stage: i.stage, first: p?.first || at, last: at, params: i.params, check: i.check };
    if (!p) opened.push(i.key); else if (level(i) > level({ key: i.key, ...p })) worse.push(i.key);
  }
  const resolved = (Object.keys(prev) as IssueKey[]).filter((k) => !issues[k]);
  return { issues, opened, worse, resolved };
}

/**
 * Issues an alert is due for: at least `min` severity, and either never alerted for this occurrence (the mark's
 * first-seen differs: it went away and came back) or worse than what was alerted (higher severity / later stage).
 * Comparing with the last ALERT (not the last check) means an alert held back by quiet hours or caps is retried.
 */
export function dueAlerts(issues: IssueMap, marks: MarkMap, min: Sev = 'warning'): IssueKey[] {
  return (Object.keys(issues) as IssueKey[]).filter((k) => {
    const i = issues[k]!;
    if (SEV_RANK[i.sev] < SEV_RANK[min]) return false;
    const m = marks[k];
    return !m || m.first !== i.first || level({ key: k, ...i }) > level({ key: k, ...m });
  }).sort((a, b) => level({ key: b, ...issues[b]! }) - level({ key: a, ...issues[a]! }));
}
/** Alerted issues that are gone now (candidates for a "fixed" notice). */
export const resolvedAlerts = (issues: IssueMap, marks: MarkMap): IssueKey[] => (Object.keys(marks) as IssueKey[]).filter((k) => !issues[k]);
export const markOf = (i: IssueState, at: string): AlertMark => ({ at, sev: i.sev, stage: i.stage, first: i.first });
/** Earliest first-seen among open warning / critical issues (domain_health.first_seen_issue). */
export const firstSeen = (issues: IssueMap): string | null =>
  Object.values(issues).filter((i) => i && i.sev !== 'info').map((i) => i!.first).sort()[0] || null;
/** Idempotency stage for reminders_log: same issue, same severity and stage, same occurrence → one row. */
export const alertStage = (k: IssueKey, i: { sev: Sev; stage: number }) => `${k}:${i.sev}:${i.stage}`;
/** Problems that also appear when OUR network cannot reach the internet (mass-failure guard in runCycle). */
export const NET_ISSUES: IssueKey[] = ['site_down', 'dns_unresolved', 'ns_none', 'mx_broken'];
/** WhatsApp only for these (critical) problems, and only to opted-in customers. */
export const WA_ISSUES: IssueKey[] = ['ssl_expired', 'site_down', 'reg_expiring', 'reg_expired', 'ns_none'];
export const waWorthy = (k: IssueKey, i: { sev: Sev }) => i.sev === 'critical' && WA_ISSUES.includes(k);

/* ================================================================ cursor */
/** Domains due a check: never checked first, then oldest; only those older than `minAgeMs`. */
export function pickDue<T extends { active: boolean; lastChecked: number | null }>(rows: T[], now: number, minAgeMs: number, limit: number): T[] {
  return rows.filter((r) => r.active && (r.lastChecked === null || now - r.lastChecked >= minAgeMs))
    .sort((a, b) => (a.lastChecked ?? -1) - (b.lastChecked ?? -1)).slice(0, limit);
}

/* ================================================================ fix links */
export interface FixLink { kind: 'ssl' | 'dns' | 'renew' | 'ns' | 'help'; href: string; label: Record<Lang, string> }
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
/** One-click fix (or the most direct place to fix it) for an issue. `site` = https://globalhostia.com. */
export function fixFor(k: IssueKey, i: { params: Params }, t: Target, o: { site: string; nsOurs: boolean }): FixLink {
  const help = (en: string, ar: string): FixLink => ({ kind: 'help', href: `${o.site}/account/health?${qs({ d: t.domain })}#issue-${k}`, label: { en, ar } });
  const dnsAdd = (name: string, value: string): FixLink => t.whmcsDomainId && o.nsOurs
    ? { kind: 'dns', href: `${o.site}/account/domains/${t.whmcsDomainId}?${qs({ add: '1', type: 'TXT', name, value })}#dns-add`, label: { en: 'Add the record', ar: 'أضف السجل' } }
    : help('See the record to add', 'اعرض السجل المطلوب إضافته');
  switch (k) {
    case 'ssl_missing': case 'ssl_expired': case 'ssl_expiring': case 'ssl_name': case 'ssl_chain': case 'ssl_untrusted':
      return t.sslIssue ? { kind: 'ssl', href: `${o.site}/account/health?${qs({ d: t.domain, fix: 'ssl' })}#fix`, label: { en: 'Issue free SSL', ar: 'أصدر شهادة SSL مجانية' } } : help('See how to fix', 'اعرف طريقة الإصلاح');
    case 'spf_missing': case 'spf_server': return dnsAdd('@', String(i.params.value || spfFor(t.serverIp)));
    case 'dmarc_missing': return dnsAdd('_dmarc', String(i.params.value || dmarcFor(t.domain)));
    case 'spf_multiple': case 'spf_invalid': case 'dmarc_invalid':
      return t.whmcsDomainId && o.nsOurs ? { kind: 'dns', href: `${o.site}/account/domains/${t.whmcsDomainId}#dns`, label: { en: 'Open my DNS records', ar: 'افتح سجلات DNS' } } : help('See how to fix', 'اعرف طريقة الإصلاح');
    case 'reg_expiring': case 'reg_expired': return { kind: 'renew', href: `${o.site}/account/renewals`, label: { en: 'Renew domain', ar: 'جدّد النطاق' } };
    case 'ns_none': case 'ns_mixed': case 'ns_external':
      return t.whmcsDomainId ? { kind: 'ns', href: `${o.site}/account/domains/${t.whmcsDomainId}#ac-ns-h`, label: { en: 'Change nameservers', ar: 'غيّر خوادم الأسماء' } } : help('See how to fix', 'اعرف طريقة الإصلاح');
    default: return help('See details', 'اعرض التفاصيل');
  }
}

/* ================================================================ copy (EN + AR, plain language) */
const REASON: Record<string, Record<Lang, string>> = {
  timeout: { en: 'no answer in time', ar: 'لا يوجد رد في الوقت المحدد' },
  refused: { en: 'the connection was refused', ar: 'تم رفض الاتصال' },
  reset: { en: 'the connection was dropped', ar: 'انقطع الاتصال' },
  handshake: { en: 'the secure handshake failed', ar: 'فشلت المصافحة الآمنة' },
  unreachable: { en: 'the server cannot be reached', ar: 'لا يمكن الوصول إلى الخادم' },
  'self-signed': { en: 'it is self-signed', ar: 'الشهادة موقّعة ذاتيًا' },
  untrusted: { en: 'it is not issued by a trusted authority', ar: 'لم تصدر عن جهة موثوقة' },
};
const reason = (v: unknown, l: Lang) => REASON[String(v)]?.[l] || (l === 'ar' ? 'خطأ في الاتصال' : String(v || 'connection error'));
const fill = (s: string, p: Params) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));
type Copy = { title: string; explain: string };
const C: Record<IssueKey, Record<Lang, Copy | ((p: Params) => Copy)>> = {
  ssl_missing: {
    en: { title: 'No secure connection (HTTPS)', explain: '{domain} does not answer securely on HTTPS ({reason}), so browsers mark it as "Not secure". A free SSL certificate fixes this.' },
    ar: { title: 'لا يوجد اتصال آمن (HTTPS)', explain: 'لا يستجيب {domain} بشكل آمن عبر HTTPS ({reason})، لذلك تصفه المتصفحات بأنه «غير آمن». شهادة SSL مجانية تحل المشكلة.' },
  },
  ssl_expired: {
    en: { title: 'SSL certificate has expired', explain: 'The certificate for {domain} expired on {date}. Visitors now see a full-page security warning and most will leave. Renew it now: it is free on our hosting.' },
    ar: { title: 'انتهت صلاحية شهادة SSL', explain: 'انتهت صلاحية شهادة {domain} في {date}. يرى الزوار الآن تحذيرًا أمنيًا يملأ الصفحة وسيغادر معظمهم. جدّدها الآن: إنها مجانية على استضافتنا.' },
  },
  ssl_expiring: {
    en: (p) => ({ title: Number(p.days) === 0 ? 'SSL certificate expires today' : Number(p.days) === 1 ? 'SSL certificate expires tomorrow' : 'SSL certificate expires in {days} days', explain: 'The certificate for {domain} expires on {date}. Free certificates on our hosting renew by themselves; this one has not yet, so renew it before visitors see a warning.' }),
    ar: (p) => ({ title: Number(p.days) === 0 ? 'تنتهي شهادة SSL اليوم' : Number(p.days) === 1 ? 'تنتهي شهادة SSL غدًا' : 'تنتهي شهادة SSL خلال {days} يومًا', explain: 'تنتهي شهادة {domain} في {date}. الشهادات المجانية على استضافتنا تتجدد تلقائيًا، لكن هذه لم تتجدد بعد، فجدّدها قبل أن يرى الزوار تحذيرًا.' }),
  },
  ssl_name: {
    en: { title: 'SSL certificate is for a different name', explain: 'The certificate on {domain} does not include this name (it covers {names}). Every visitor gets a security warning.' },
    ar: { title: 'شهادة SSL صادرة لاسم مختلف', explain: 'الشهادة على {domain} لا تشمل هذا الاسم (تغطي {names}). يرى كل زائر تحذيرًا أمنيًا.' },
  },
  ssl_chain: {
    en: { title: 'SSL certificate chain is incomplete', explain: 'The server for {domain} does not send the intermediate certificate. Some browsers, most apps and payment providers refuse the connection. Reinstalling the certificate fixes it.' },
    ar: { title: 'سلسلة شهادة SSL غير مكتملة', explain: 'لا يرسل خادم {domain} الشهادة الوسيطة. ترفض بعض المتصفحات ومعظم التطبيقات ومزودي الدفع الاتصال. إعادة تثبيت الشهادة تحل المشكلة.' },
  },
  ssl_untrusted: {
    en: { title: 'SSL certificate is not trusted', explain: 'Browsers do not trust the certificate on {domain} ({reason}). Visitors see a security warning. Replace it with a free trusted certificate.' },
    ar: { title: 'شهادة SSL غير موثوقة', explain: 'لا تثق المتصفحات بالشهادة على {domain} ({reason}). يرى الزوار تحذيرًا أمنيًا. استبدلها بشهادة مجانية موثوقة.' },
  },
  site_down: {
    en: { title: 'Website is not reachable', explain: 'We could not open {domain} over HTTPS or HTTP ({reason}). Visitors cannot reach your site. If you did not take it offline on purpose, open a ticket and we will look right away.' },
    ar: { title: 'لا يمكن الوصول إلى الموقع', explain: 'لم نتمكن من فتح {domain} عبر HTTPS أو HTTP ({reason}). لا يستطيع الزوار الوصول إلى موقعك. إذا لم توقفه عمدًا، افتح تذكرة وسنتحقق فورًا.' },
  },
  site_error: {
    en: { title: 'Website shows a server error (HTTP {code})', explain: '{domain} answers with an error page instead of your site. A recent change to the site, a plugin or the PHP version is the usual cause.' },
    ar: { title: 'يعرض الموقع خطأ في الخادم (HTTP {code})', explain: 'يستجيب {domain} بصفحة خطأ بدلًا من موقعك. السبب المعتاد تغيير حديث في الموقع أو إضافة أو إصدار PHP.' },
  },
  dns_unresolved: {
    en: { title: 'Domain does not point anywhere', explain: '{domain} has no address record (A or AAAA), so browsers cannot find your website. Point it at your hosting, or add the record where your DNS is managed.' },
    ar: { title: 'النطاق لا يشير إلى أي مكان', explain: 'لا يوجد لـ {domain} سجل عنوان (A أو AAAA)، لذلك لا تجد المتصفحات موقعك. وجّهه إلى استضافتك أو أضف السجل حيث تُدار DNS الخاصة بك.' },
  },
  ns_none: {
    en: { title: 'Domain has no working nameservers', explain: 'No nameserver answers for {domain}, so its website and email are both offline. Set nameservers for the domain.' },
    ar: { title: 'لا توجد خوادم أسماء تعمل للنطاق', explain: 'لا يستجيب أي خادم أسماء لـ {domain}، لذلك موقعه وبريده متوقفان. اضبط خوادم الأسماء للنطاق.' },
  },
  ns_mixed: {
    en: { title: 'Nameservers are mixed', explain: '{domain} uses some GlobalHostia nameservers and some from another provider ({ns}). Visitors get different answers depending on which one they reach. Use one set only.' },
    ar: { title: 'خوادم الأسماء مختلطة', explain: 'يستخدم {domain} بعض خوادم أسماء GlobalHostia وبعضها من مزود آخر ({ns}). يحصل الزوار على إجابات مختلفة حسب الخادم الذي يصلون إليه. استخدم مجموعة واحدة فقط.' },
  },
  ns_external: {
    en: { title: 'DNS is managed elsewhere', explain: '{domain} uses the nameservers {ns}. That is fine if it is on purpose: changes in your GlobalHostia DNS editor will not apply there.' },
    ar: { title: 'تُدار DNS في مكان آخر', explain: 'يستخدم {domain} خوادم الأسماء {ns}. لا بأس إن كان ذلك مقصودًا: التغييرات في محرر DNS لدى GlobalHostia لن تُطبَّق هناك.' },
  },
  a_mismatch: {
    en: { title: 'Website is not served from your hosting', explain: '{domain} points to {ips}, not to your hosting server ({ip}). Visitors see whatever is at that address, not the site on your plan.' },
    ar: { title: 'الموقع لا يُعرض من استضافتك', explain: 'يشير {domain} إلى {ips} وليس إلى خادم استضافتك ({ip}). يرى الزوار ما هو موجود على ذلك العنوان وليس الموقع الموجود على خطتك.' },
  },
  mx_missing: {
    en: { title: 'No mail server (MX) record', explain: 'Email sent to addresses @{domain} cannot be delivered, because there is no MX record.' },
    ar: { title: 'لا يوجد سجل خادم بريد (MX)', explain: 'لا يمكن تسليم الرسائل المرسلة إلى عناوين @{domain} لعدم وجود سجل MX.' },
  },
  mx_broken: {
    en: { title: 'Mail server does not resolve', explain: 'The MX record for {domain} points to {host}, which has no address. Incoming email bounces.' },
    ar: { title: 'خادم البريد لا يُحَل', explain: 'يشير سجل MX لـ {domain} إلى {host} الذي ليس له عنوان. ترتد الرسائل الواردة.' },
  },
  spf_missing: {
    en: { title: 'No SPF record', explain: 'Without SPF, email from @{domain} is more likely to land in spam, and others can fake your address more easily. One TXT record fixes it.' },
    ar: { title: 'لا يوجد سجل SPF', explain: 'بدون SPF يزيد احتمال وصول رسائل @{domain} إلى البريد العشوائي، ويسهل على الآخرين انتحال عنوانك. سجل TXT واحد يحل المشكلة.' },
  },
  spf_multiple: {
    en: { title: 'More than one SPF record', explain: '{domain} has {n} SPF records. Receiving servers treat this as an error and may reject your email. Merge them into one record.' },
    ar: { title: 'أكثر من سجل SPF', explain: 'لدى {domain} عدد {n} من سجلات SPF. تعتبر خوادم الاستقبال ذلك خطأ وقد ترفض رسائلك. ادمجها في سجل واحد.' },
  },
  spf_invalid: {
    en: { title: 'SPF record has a problem', explain: 'The SPF record for {domain} is not valid ({reason}), so receivers may ignore it.' },
    ar: { title: 'في سجل SPF مشكلة', explain: 'سجل SPF لـ {domain} غير صالح ({reason})، لذلك قد تتجاهله خوادم الاستقبال.' },
  },
  spf_server: {
    en: { title: 'SPF does not include your hosting server', explain: 'Your SPF record does not list your hosting server ({ip}), so email sent from your hosting may be marked as spam.' },
    ar: { title: 'سجل SPF لا يشمل خادم استضافتك', explain: 'لا يتضمن سجل SPF خادم استضافتك ({ip})، لذلك قد تُصنَّف الرسائل المرسلة من استضافتك كبريد عشوائي.' },
  },
  dkim_missing: {
    en: { title: 'DKIM signing is off', explain: 'Email from @{domain} is not signed with DKIM. Gmail and Outlook trust signed mail more. Turn DKIM on in your hosting control panel (Email, then DKIM).' },
    ar: { title: 'توقيع DKIM متوقف', explain: 'رسائل @{domain} غير موقّعة بـ DKIM. يثق Gmail وOutlook بالبريد الموقّع أكثر. فعّل DKIM من لوحة تحكم الاستضافة (البريد ثم DKIM).' },
  },
  dmarc_missing: {
    en: { title: 'No DMARC policy', explain: 'DMARC tells receivers what to do with email that fails SPF or DKIM; Gmail and Yahoo require it for bulk senders. A monitoring-only policy (p=none) is a safe start.' },
    ar: { title: 'لا توجد سياسة DMARC', explain: 'تخبر DMARC خوادم الاستقبال بما تفعله بالرسائل التي تفشل في SPF أو DKIM، ويشترطها Gmail وYahoo للمرسلين بكثرة. سياسة المراقبة فقط (p=none) بداية آمنة.' },
  },
  dmarc_invalid: {
    en: { title: 'DMARC record has a problem', explain: 'The DMARC record for {domain} is not valid ({reason}), so receivers ignore it.' },
    ar: { title: 'في سجل DMARC مشكلة', explain: 'سجل DMARC لـ {domain} غير صالح ({reason})، لذلك تتجاهله خوادم الاستقبال.' },
  },
  reg_expiring: {
    en: (p) => ({ title: Number(p.days) === 0 ? 'Domain expires today' : Number(p.days) === 1 ? 'Domain expires tomorrow' : 'Domain expires in {days} days', explain: p.auto === 'off' ? '{domain} expires on {date} and auto-renew is off. If it expires, the website and email on it stop working and the name can be lost.' : '{domain} expires on {date} and its renewal is not paid yet. If it expires, the website and email on it stop working.' }),
    ar: (p) => ({ title: Number(p.days) === 0 ? 'ينتهي النطاق اليوم' : Number(p.days) === 1 ? 'ينتهي النطاق غدًا' : 'ينتهي النطاق خلال {days} يومًا', explain: p.auto === 'off' ? 'ينتهي {domain} في {date} والتجديد التلقائي متوقف. إذا انتهى يتوقف الموقع والبريد عليه وقد تفقد الاسم.' : 'ينتهي {domain} في {date} ولم يُدفع تجديده بعد. إذا انتهى يتوقف الموقع والبريد عليه.' }),
  },
  reg_expired: {
    en: { title: 'Domain has expired', explain: '{domain} expired on {date}. The website and email on it are offline. Renew it now, before the grace period ends and the name is released.' },
    ar: { title: 'انتهت صلاحية النطاق', explain: 'انتهت صلاحية {domain} في {date}. الموقع والبريد عليه متوقفان. جدّده الآن قبل انتهاء فترة السماح وطرح الاسم.' },
  },
};
/** Plain-language title + explanation for an issue in the customer's language. */
export function issueCopy(k: IssueKey, p: Params, l: Lang): Copy {
  const e = C[k]?.[l] ?? C[k]?.en;
  if (!e) return { title: k, explain: '' };
  const c = typeof e === 'function' ? e(p) : e;
  const v = { ...p, reason: p.reason !== undefined ? reason(p.reason, l) : '' };
  return { title: fill(c.title, v), explain: fill(c.explain, v) };
}
export const SEV_LABEL: Record<Sev, Record<Lang, string>> = { critical: { en: 'Urgent', ar: 'عاجل' }, warning: { en: 'Needs attention', ar: 'يحتاج إلى انتباه' }, info: { en: 'Note', ar: 'ملاحظة' } };

/* ================================================================ one bounded run (I/O injected) */
export interface HealthRow {
  id: string; domain: string; clientId: number; active: boolean; external: boolean;
  target: Target; issues: IssueMap; marks: MarkMap; lastChecked: number | null; status: string;
}
export interface PlannedAlert { rowId: string; domain: string; key: IssueKey; issue: IssueState; fix: FixLink; target: Target }
export interface RunDeps {
  now(): number;
  /** wall-clock deadline (ms epoch): stop starting new probes after it */
  deadline: number;
  site: string;
  ourNs: string[];
  /** fresh list of every customer domain (WHMCS + panels); null = could not load (keep the stored rows) */
  inventory(): Promise<Target[] | null>;
  store: {
    sync(targets: Target[]): Promise<{ added: number; removed: number }>;
    due(limit: number, olderThanMs: number): Promise<HealthRow[]>;
    saveCheck(id: string, p: { issues: IssueMap; status: string; checks: unknown; firstSeen: string | null; checkedAt: number }): Promise<void>;
    saveMarks(id: string, marks: MarkMap): Promise<void>;
  };
  probe(t: Target, o: { mailNeeded: boolean }): Promise<DomainFacts>;
  /** gate + send one digest per client. Returns the alert / resolved keys (rowId:key) actually delivered. */
  deliver?(clientId: number, alerts: PlannedAlert[], resolved: PlannedAlert[]): Promise<{ delivered: string[]; skipped?: string }>;
  log?(msg: string): void;
}
export interface RunResult { synced?: { added: number; removed: number } | null; checked: number; errors: number; issues: Record<Sev, number>; alerts: number; resolved: number; clients: number; skipped: Record<string, number>; deadline: boolean }

/** Bounded pool: at most `n` in flight; stops taking new items once `stop()` says so. */
export async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, stop: () => boolean = () => false) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length && !stop()) { const k = i++; await fn(items[k]); } }));
  return i;
}

/** Summarise facts for storage / the panel (no raw certificate data). */
export function factsSummary(f: DomainFacts) {
  return {
    dns: { ok: f.dns.ok, via: f.dns.via, ns: f.dns.ns.slice(0, 6), a: f.dns.a.slice(0, 6), aaaa: f.dns.aaaa.slice(0, 4), nx: !!f.dns.nx, error: f.dns.error },
    tls: f.tls ? { connected: f.tls.connected, issuer: f.tls.issuer, validTo: f.tls.validTo, daysLeft: f.tls.daysLeft, names: (f.tls.names || []).slice(0, 6), authError: f.tls.authError, error: f.tls.error, nameOk: f.tls.nameOk } : null,
    web: f.web || null, mail: f.mail ? { mx: f.mail.mx.slice(0, 4), spf: f.mail.spf.slice(0, 3).map((s) => s.slice(0, 300)), dmarc: f.mail.dmarc.slice(0, 2).map((s) => s.slice(0, 300)), dkim: f.mail.dkim.length } : null,
    skipped: f.skipped, at: f.checkedAt,
  };
}

/** Check one stored domain: probe, evaluate, merge state. Pure apart from deps.probe. */
export async function checkRow(row: HealthRow, cfg: HealthConfig, deps: Pick<RunDeps, 'probe' | 'ourNs' | 'now'>) {
  const t = row.target;
  const mailNeeded = cfg.checks.mx || cfg.checks.spf || cfg.checks.dkim || cfg.checks.dmarc;
  let facts = await deps.probe(t, { mailNeeded });
  let found = evaluate(t, facts, { cfg, ourNs: deps.ourNs, external: row.external, now: deps.now() });
  // a site that looks down or a domain that looks unresolved is checked once more before it counts (no alert on a blip)
  if (found.some((i) => (i.key === 'site_down' || i.key === 'dns_unresolved' || i.key === 'ns_none') && !row.issues[i.key])) {
    facts = await deps.probe(t, { mailNeeded });
    found = evaluate(t, facts, { cfg, ourNs: deps.ourNs, external: row.external, now: deps.now() });
  }
  const at = new Date(deps.now()).toISOString();
  const m = mergeIssues(row.issues, found, at);
  const checks = { ...factsSummary(facts), nsOurs: nsKind(facts.dns.ns, deps.ourNs) === 'ours' };
  return { facts, found, ...m, checks, status: !facts.dns.ok && !found.length ? 'unknown' : worst(found), firstSeen: firstSeen(m.issues), at };
}

export async function runCycle(cfg: HealthConfig, deps: RunDeps, o: { sync?: boolean; limit?: number } = {}): Promise<RunResult> {
  const res: RunResult = { synced: null, checked: 0, errors: 0, issues: { critical: 0, warning: 0, info: 0 }, alerts: 0, resolved: 0, clients: 0, skipped: {}, deadline: false };
  const skip = (w: string, n = 1) => { res.skipped[w] = (res.skipped[w] || 0) + n; };
  if (!cfg.enabled) { skip('disabled'); return res; }
  if (o.sync !== false) {
    const inv = await deps.inventory().catch((e) => { deps.log?.(`inventory: ${e?.message || e}`); return null; });
    if (inv) res.synced = await deps.store.sync(inv);
    else skip('inventory-failed');
  }
  const rows = await deps.store.due(Math.min(o.limit ?? cfg.perRun, cfg.perRun), cfg.recheckHours * 3600_000);
  const byClient = new Map<number, { alerts: PlannedAlert[]; resolved: PlannedAlert[]; rows: Map<string, { row: HealthRow; issues: IssueMap }> }>();
  const timeUp = () => deps.now() > deps.deadline;
  let netNew = 0; // rows where a "cannot reach it" problem appeared this run (mass-failure guard below)
  await pool(rows, cfg.concurrency, async (row) => {
    try {
      const r = await checkRow(row, cfg, deps);
      await deps.store.saveCheck(row.id, { issues: r.issues, status: r.status, checks: r.checks, firstSeen: r.firstSeen, checkedAt: deps.now() });
      res.checked++;
      for (const i of r.found) res.issues[i.sev]++;
      if (r.opened.some((k) => NET_ISSUES.includes(k))) netNew++;
      const nsOurs = r.checks.nsOurs;
      const alerts = dueAlerts(r.issues, row.marks).map((key) => ({ rowId: row.id, domain: row.domain, key, issue: r.issues[key]!, fix: fixFor(key, r.issues[key]!, row.target, { site: deps.site, nsOurs }), target: row.target }));
      const gone = resolvedAlerts(r.issues, row.marks).map((key) => ({ rowId: row.id, domain: row.domain, key, issue: { ...(row.issues[key] || { sev: row.marks[key]!.sev, stage: row.marks[key]!.stage, first: row.marks[key]!.first, last: '', params: { domain: row.domain }, check: 'ssl' as CheckKey }) }, fix: fixFor(key, { params: {} }, row.target, { site: deps.site, nsOurs }), target: row.target }));
      if (alerts.length || gone.length) {
        let s = byClient.get(row.clientId);
        if (!s) byClient.set(row.clientId, (s = { alerts: [], resolved: [], rows: new Map() }));
        s.alerts.push(...alerts); s.resolved.push(...gone); s.rows.set(row.id, { row, issues: r.issues });
      }
    } catch (e: any) { res.errors++; deps.log?.(`check ${row.domain}: ${e?.message || e}`); }
  }, timeUp);
  if (timeUp() && res.checked < rows.length) res.deadline = true;
  // half or more of a sizeable run suddenly "down" / "not resolving" is far more likely our network than the customers':
  // keep the results, send nothing about those problems this run (they are alerted next run if they are real)
  const suspect = res.checked >= 8 && netNew / res.checked >= 0.5;
  if (suspect) {
    skip('suspected-network', netNew);
    for (const s of byClient.values()) s.alerts = s.alerts.filter((a) => !NET_ISSUES.includes(a.key));
  }

  for (const [cid, s] of byClient) {
    const at = new Date(deps.now()).toISOString();
    const resolved = cfg.resolvedNotice ? s.resolved : [];
    let delivered = new Set<string>();
    if (!cfg.alerts) skip('alerts-off');
    else if (!deps.deliver) skip('no-delivery');
    else if (s.alerts.length || resolved.length) {
      res.clients++;
      const r = await deps.deliver(cid, s.alerts, resolved).catch((e) => { deps.log?.(`deliver #${cid}: ${e?.message || e}`); return { delivered: [] as string[], skipped: 'error' }; });
      if (r.skipped) skip(r.skipped);
      delivered = new Set(r.delivered);
    }
    // marks: delivered alerts record what was said; resolved issues are forgotten (notice sent, or not wanted)
    for (const [id, { row, issues }] of s.rows) {
      const marks: MarkMap = { ...row.marks };
      let changed = false;
      for (const a of s.alerts.filter((x) => x.rowId === id && delivered.has(`${id}:${x.key}`))) { marks[a.key] = markOf(issues[a.key]!, at); changed = true; res.alerts++; }
      for (const g of s.resolved.filter((x) => x.rowId === id)) {
        if (cfg.resolvedNotice && cfg.alerts && !delivered.has(`${id}:${g.key}:resolved`)) continue; // retry the notice next run
        if (delivered.has(`${id}:${g.key}:resolved`)) res.resolved++;
        delete marks[g.key]; changed = true;
      }
      if (changed) await deps.store.saveMarks(id, marks);
    }
  }
  return res;
}
