// Domain portfolio (/account/domains) data model: rows, filters, sorting, bulk-action validation, CSV export and the
// bulk result round trip. Pure (no imports), so tests/portfolio.test.mts loads it directly. Everything shown comes from
// the billing records (GetClientsDomains) or a live lookup (nameservers, registrar lock, TLS); nothing is estimated.

export type StatusGroup = 'active' | 'grace' | 'expired' | 'pending' | 'closed';
export type NsKind = 'ours' | 'external' | 'mixed' | 'unknown';

export interface PortfolioRow {
  id: number; name: string; status: string; group: StatusGroup;
  regdate: string; expiry: string; days: number | null;
  autoRenew: boolean; amount: number | null; years: number;
}

const DAY = 86400000;
const validDate = (s: unknown) => !!s && /^\d{4}-\d{2}-\d{2}/.test(String(s)) && !/^0000/.test(String(s));
export const daysTo = (date: unknown, now = Date.now()) =>
  validDate(date) ? Math.round((Date.parse(String(date).slice(0, 10) + 'T00:00:00Z') - now) / DAY) : null;

export function statusGroup(status: unknown): StatusGroup {
  const s = String(status || '').toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'grace' || s === 'redemption') return 'grace';
  if (s === 'expired') return 'expired';
  if (s.startsWith('pending')) return 'pending';
  return 'closed'; // cancelled, transferred away, fraud
}

const off = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

export function toRows(domains: any[], now = Date.now()): PortfolioRow[] {
  return (domains || []).map((d) => {
    const expiry = validDate(d.expirydate) ? String(d.expirydate).slice(0, 10) : validDate(d.nextduedate) ? String(d.nextduedate).slice(0, 10) : '';
    const amt = parseFloat(String(d.recurringamount ?? ''));
    return {
      id: Number(d.id), name: String(d.domainname || '').trim().toLowerCase(), status: String(d.status || 'Unknown'), group: statusGroup(d.status),
      regdate: validDate(d.regdate) ? String(d.regdate).slice(0, 10) : '', expiry, days: daysTo(expiry, now),
      autoRenew: !off(d.donotrenew), amount: Number.isFinite(amt) && amt > 0 ? amt : null, years: Number(d.regperiod) || 1,
    };
  }).filter((r) => Number.isInteger(r.id) && r.id > 0 && r.name);
}

/* ------------------------------------------------------------------ filters */
export const SORTS = ['expiry', 'expiry_desc', 'name', 'status'] as const;
export type Sort = (typeof SORTS)[number];
export const STATUS_FILTERS = ['', 'active', 'grace', 'expired', 'pending', 'closed'] as const;
export interface Filter { q: string; status: (typeof STATUS_FILTERS)[number]; exp: '' | '30' | '90'; ar: '' | 'off'; ns: '' | 'ext'; sort: Sort }

type Params = { get(k: string): string | null } | Record<string, string | undefined>;
const read = (p: Params, k: string) => (typeof (p as any).get === 'function' ? (p as any).get(k) : (p as any)[k]) ?? '';

export function parseFilter(p: Params): Filter {
  const st = String(read(p, 'status'));
  const sort = String(read(p, 'sort'));
  return {
    q: String(read(p, 'q')).trim().toLowerCase().replace(/[^\p{L}\p{N}.\-]/gu, '').slice(0, 80),
    status: (STATUS_FILTERS as readonly string[]).includes(st) ? (st as Filter['status']) : '',
    exp: read(p, 'exp') === '30' ? '30' : read(p, 'exp') === '90' ? '90' : '',
    ar: read(p, 'ar') === 'off' ? 'off' : '',
    ns: read(p, 'ns') === 'ext' ? 'ext' : '',
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as Sort) : 'expiry',
  };
}
export const isFiltered = (f: Filter) => !!(f.q || f.status || f.exp || f.ar || f.ns);

/** Query string for a filter (defaults left out), e.g. "?exp=30&sort=name". */
export function filterQuery(f: Filter) {
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  if (f.status) q.set('status', f.status);
  if (f.exp) q.set('exp', f.exp);
  if (f.ar) q.set('ar', f.ar);
  if (f.ns) q.set('ns', f.ns);
  if (f.sort !== 'expiry') q.set('sort', f.sort);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * Does a row pass the filter? `ns` is the nameserver kind when it is known (external = not ours, including mixed);
 * with the "external NS" filter on, a row whose nameservers are not known yet is kept out.
 */
export function matches(r: PortfolioRow, f: Filter, ns?: NsKind) {
  if (f.q && !r.name.includes(f.q)) return false;
  if (f.status && r.group !== f.status) return false;
  if (f.exp) {
    // "expiring within N days": still renewable (active / grace) and the date falls in the window (overdue included)
    if (!(r.group === 'active' || r.group === 'grace') || r.days === null || r.days > Number(f.exp)) return false;
  }
  if (f.ar === 'off' && (r.autoRenew || r.group === 'closed')) return false;
  if (f.ns === 'ext' && !(ns === 'external' || ns === 'mixed')) return false;
  return true;
}

const ORDER: Record<StatusGroup, number> = { grace: 0, active: 1, pending: 2, expired: 3, closed: 4 };
export function sortRows(rows: PortfolioRow[], sort: Sort): PortfolioRow[] {
  const byDate = (a: PortfolioRow, b: PortfolioRow) => (a.days ?? 1e9) - (b.days ?? 1e9) || a.name.localeCompare(b.name);
  const out = [...rows];
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'status') out.sort((a, b) => ORDER[a.group] - ORDER[b.group] || byDate(a, b));
  else if (sort === 'expiry_desc') out.sort((a, b) => -byDate(a, b));
  else out.sort(byDate);
  return out;
}

/** Counts for the quick-filter chips and hero numbers. */
export function summarize(rows: PortfolioRow[]) {
  const renewable = (r: PortfolioRow) => r.group === 'active' || r.group === 'grace';
  return {
    total: rows.length,
    active: rows.filter((r) => r.group === 'active').length,
    exp30: rows.filter((r) => renewable(r) && r.days !== null && r.days <= 30).length,
    exp90: rows.filter((r) => renewable(r) && r.days !== null && r.days <= 90).length,
    arOff: rows.filter((r) => !r.autoRenew && r.group !== 'closed').length,
  };
}

/** Expiry tone: red when expired or under 14 days, amber under 60, neutral otherwise. */
export const expiryTone = (days: number | null): 'bad' | 'warn' | 'muted' => (days === null ? 'muted' : days < 14 ? 'bad' : days < 60 ? 'warn' : 'muted');

/* ------------------------------------------------------------------ bulk actions */
export const BULK_ACTIONS = ['autorenew_on', 'autorenew_off', 'lock', 'unlock', 'ns_ours'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const BULK_MAX = 50;

export type BulkParse = { ok: true; action: BulkAction; ids: number[] } | { ok: false; error: 'action' | 'nosel' | 'toomany' | 'invalid' };

/** Validate a bulk request: a known action and 1..BULK_MAX distinct domain ids (checkbox values "d:301" or "301"). */
export function parseBulk(action: unknown, sel: unknown[], max = BULK_MAX): BulkParse {
  if (typeof action !== 'string' || !(BULK_ACTIONS as readonly string[]).includes(action)) return { ok: false, error: 'action' };
  const ids: number[] = [];
  for (const v of sel || []) {
    const m = /^(?:d:)?(\d{1,10})$/.exec(String(v ?? '').trim());
    if (!m) return { ok: false, error: 'invalid' };
    const n = Number(m[1]);
    if (n > 0 && !ids.includes(n)) ids.push(n);
  }
  if (!ids.length) return { ok: false, error: 'nosel' };
  if (ids.length > max) return { ok: false, error: 'toomany' };
  return { ok: true, action: action as BulkAction, ids };
}

/** Which domains an action may touch: auto-renew while renewable (active / grace / redemption); lock and nameservers when active. */
export function eligible(action: BulkAction, status: unknown) {
  const s = String(status || '').toLowerCase();
  if (action === 'autorenew_on' || action === 'autorenew_off') return s === 'active' || s === 'grace' || s === 'redemption';
  return s === 'active';
}

export type FailReason = 'state' | 'api' | 'notfound' | 'verify' | 'nozone' | 'rate';
export const FAIL_REASONS: FailReason[] = ['state', 'api', 'notfound', 'verify', 'nozone', 'rate'];
export interface BulkResult { action: BulkAction; done: number[]; skipped: number[]; failed: { id: number; reason: FailReason }[] }

/** Redirect query after a bulk action (ids and reason codes only; names are looked up again when the page renders). */
export function bulkQuery(r: BulkResult) {
  const q = new URLSearchParams();
  q.set('bk', r.action);
  if (r.done.length) q.set('bd', r.done.join('.'));
  if (r.skipped.length) q.set('bs', r.skipped.join('.'));
  if (r.failed.length) q.set('bf', r.failed.map((f) => `${f.id}-${f.reason}`).join('.'));
  return q.toString();
}
export function parseBulkResult(p: Params): BulkResult | null {
  const action = String(read(p, 'bk'));
  if (!(BULK_ACTIONS as readonly string[]).includes(action)) return null;
  const ids = (s: string) => s.split('.').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, BULK_MAX);
  const failed = String(read(p, 'bf')).split('.').map((x) => /^(\d{1,10})-([a-z]+)$/.exec(x)).filter((m): m is RegExpExecArray => !!m && FAIL_REASONS.includes(m[2] as FailReason))
    .map((m) => ({ id: Number(m[1]), reason: m[2] as FailReason })).slice(0, BULK_MAX);
  return { action: action as BulkAction, done: ids(String(read(p, 'bd'))), skipped: ids(String(read(p, 'bs'))), failed };
}

/* ------------------------------------------------------------------ CSV */
/** One CSV cell: RFC 4180 quoting, and cells that a spreadsheet would run as a formula are prefixed with a quote. */
export function csvCell(v: unknown) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: PortfolioRow[], o: { currency: string; ns?: Map<number, string[]> } = { currency: 'USD' }) {
  const head = ['Domain', 'Status', 'Registered', 'Expires', 'Days left', 'Auto-renew', 'Renewal amount', 'Currency', 'Registration period (years)', 'Nameservers'];
  const lines = rows.map((r) => [r.name, r.status, r.regdate, r.expiry, r.days ?? '', r.autoRenew ? 'On' : 'Off', r.amount !== null ? r.amount.toFixed(2) : '', r.amount !== null ? o.currency : '', r.years, (o.ns?.get(r.id) || []).join(' ')]);
  // BOM so spreadsheet apps read UTF-8 (internationalised domain names), CRLF line ends per RFC 4180
  return '\ufeff' + [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Hostname check used before probing a domain's TLS certificate. */
export const isHostname = (s: string) => /^(?=.{4,253}$)(?!-)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i.test(s);

/** Parse "1,2,3" (or repeated values) into at most `max` distinct positive ids. */
export function idList(raw: string | string[] | null | undefined, max = 25): number[] {
  const parts = (Array.isArray(raw) ? raw : [raw || '']).join(',').split(',');
  const out: number[] = [];
  for (const p of parts) { const n = Number(p.trim().replace(/^d:/, '')); if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n); if (out.length >= max) break; }
  return out;
}
