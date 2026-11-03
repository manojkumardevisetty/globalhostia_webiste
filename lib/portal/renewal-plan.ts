// Renewal centre data model (pure, no I/O): which services and domains renew, when, for how much, grouped into
// Overdue / Next 30 days / 31–90 days / Later, with running totals and the default selection.
// Amounts only ever come from the billing records (service/domain recurring amount) or, for a domain without one,
// the registry's current renewal price for its TLD and period (GetTLDPricing). Nothing is estimated.

export type GroupKey = 'overdue' | 'soon' | 'next' | 'later';
export const GROUPS: { key: GroupKey; label: string; hint: string }[] = [
  { key: 'overdue', label: 'Overdue', hint: 'Past the due or expiry date' },
  { key: 'soon', label: 'Next 30 days', hint: 'Due within 30 days' },
  { key: 'next', label: '31–90 days', hint: 'Due in 31 to 90 days' },
  { key: 'later', label: 'Later', hint: 'More than 90 days away' },
];

export type RenewalRow = {
  key: string; // "s:101" / "d:301" (checkbox value)
  kind: 'service' | 'domain';
  id: number;
  name: string; // product name, or the domain name
  product: string; // service: hostname/group; domain: "Domain registration"
  status: string;
  date: string; // YYYY-MM-DD (next due date or expiry date)
  days: number; // negative = overdue
  cycle: string;
  amount: number | null; // null = no price on record
  priceFrom: 'billing' | 'tld' | null;
  invoiceId?: number; // unpaid invoice that already covers this item
  autoRenew?: boolean; // domains only
};

export type TldRenewPrices = Record<string, Record<string, string>>; // { com: { "1": "13.99" } }

const DAY = 86400000;
const validDate = (s: unknown) => !!s && /^\d{4}-\d{2}-\d{2}/.test(String(s)) && !/^0000/.test(String(s)) && !Number.isNaN(Date.parse(String(s).slice(0, 10)));

/** Whole days from today (UTC) to the date; negative when in the past. Same rounding as the portal's daysUntil. */
export function daysFrom(date: unknown, now = Date.now()) {
  if (!validDate(date)) return null;
  return Math.round((Date.parse(String(date).slice(0, 10) + 'T00:00:00Z') - now) / DAY);
}

export const groupOf = (days: number): GroupKey => (days < 0 ? 'overdue' : days <= 30 ? 'soon' : days <= 90 ? 'next' : 'later');

/** "in 12 days", "Today", "Tomorrow", "141 days overdue" (domains: "Expired 3 days ago"). */
export function relDays(days: number, kind: 'service' | 'domain' = 'service') {
  const s = (n: number) => (n === 1 ? '' : 's');
  if (days === 0) return kind === 'domain' ? 'Expires today' : 'Due today';
  if (days === 1) return 'Tomorrow';
  if (days > 0) return `in ${days} day${s(days)}`;
  const n = -days;
  return kind === 'domain' ? `Expired ${n} day${s(n)} ago` : `${n} day${s(n)} overdue`;
}

const SERVICE_STATUS = /^(active|suspended)$/i;
const DOMAIN_STATUS = /^(active|grace|redemption)$/i;
const NO_RECURRING = /free|one ?time/i;
const CYCLES: Record<string, string> = {
  monthly: 'Monthly', quarterly: 'Quarterly', 'semi-annually': 'Every 6 months', semiannually: 'Every 6 months',
  annually: 'Yearly', biennially: 'Every 2 years', triennially: 'Every 3 years',
};
export const cycleText = (c: unknown) => CYCLES[String(c || '').toLowerCase()] || String(c || '—');

const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const flag = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';
const tldOf = (domain: string) => { const i = domain.indexOf('.'); return i > 0 ? domain.slice(i + 1).toLowerCase() : ''; };

/** Renewal price for a domain: its recurring amount on record, else the TLD's current renewal price for its period. */
export function domainPrice(d: any, tld?: TldRenewPrices): { amount: number | null; from: RenewalRow['priceFrom'] } {
  const own = num(d.recurringamount);
  if (own !== null) return { amount: own, from: 'billing' };
  const years = String(Number(d.regperiod) || 1);
  const p = num(tld?.[tldOf(String(d.domainname || ''))]?.[years]);
  return p !== null && p > 0 ? { amount: p, from: 'tld' } : { amount: null, from: null };
}

/** Every service and domain that renews, soonest first. `inv` maps service/domain id → unpaid invoice id. */
export function buildRenewals(
  products: any[], domains: any[],
  o: { inv?: { services: Map<number, number>; domains: Map<number, number> }; tld?: TldRenewPrices; now?: number } = {},
): RenewalRow[] {
  const now = o.now ?? Date.now();
  const rows: RenewalRow[] = [];
  for (const p of products) {
    if (!SERVICE_STATUS.test(String(p.status || '')) || NO_RECURRING.test(String(p.billingcycle || ''))) continue;
    const days = daysFrom(p.nextduedate, now);
    if (days === null) continue;
    const id = Number(p.id);
    const amount = num(p.recurringamount);
    rows.push({
      key: `s:${id}`, kind: 'service', id, name: String(p.translated_name || p.name || 'Service'),
      product: String(p.domain || p.translated_groupname || p.groupname || ''), status: String(p.status), date: String(p.nextduedate).slice(0, 10), days,
      cycle: cycleText(p.billingcycle), amount, priceFrom: amount === null ? null : 'billing', invoiceId: o.inv?.services.get(id),
    });
  }
  for (const d of domains) {
    if (!DOMAIN_STATUS.test(String(d.status || ''))) continue;
    const date = validDate(d.expirydate) ? d.expirydate : d.nextduedate;
    const days = daysFrom(date, now);
    if (days === null) continue;
    const id = Number(d.id);
    const yrs = Number(d.regperiod) || 1;
    const price = domainPrice(d, o.tld);
    rows.push({
      key: `d:${id}`, kind: 'domain', id, name: String(d.domainname || '').toLowerCase(), product: 'Domain registration', status: String(d.status),
      date: String(date).slice(0, 10), days, cycle: `${yrs} year${yrs === 1 ? '' : 's'}`, amount: price.amount, priceFrom: price.from,
      invoiceId: o.inv?.domains.get(id), autoRenew: !flag(d.donotrenew),
    });
  }
  return rows.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

/** Overdue and the next 30 days are ticked by default. */
export const defaultSelected = (r: RenewalRow) => r.days <= 30;

export type Totals = { count: number; amount: number; unpriced: number };
export function totals(rows: RenewalRow[]): Totals {
  let amount = 0, unpriced = 0;
  for (const r of rows) { if (r.amount === null) unpriced++; else amount += r.amount; }
  return { count: rows.length, amount: Math.round(amount * 100) / 100, unpriced };
}

export type Group = { key: GroupKey; label: string; hint: string; rows: RenewalRow[]; totals: Totals };
/** All four groups in order (empty ones included, so the caller decides what to hide). */
export function groupRenewals(rows: RenewalRow[]): Group[] {
  return GROUPS.map((g) => {
    const list = rows.filter((r) => groupOf(r.days) === g.key);
    return { ...g, rows: list, totals: totals(list) };
  });
}

/** Totals for a set of selected keys (the summary bar). */
export const selectionTotals = (rows: RenewalRow[], keys: Iterable<string>) => {
  const set = new Set(keys);
  return totals(rows.filter((r) => set.has(r.key)));
};

/** Parse posted checkbox values ("d:301") into domain / service ids. Junk is ignored. */
export function parseSelection(values: unknown[]) {
  const domains: number[] = [], services: number[] = [];
  for (const v of values) {
    const m = /^([ds]):(\d{1,10})$/.exec(String(v ?? ''));
    if (!m) continue;
    const list = m[1] === 'd' ? domains : services;
    const id = Number(m[2]);
    if (!list.includes(id)) list.push(id);
  }
  return { domains: domains.slice(0, 100), services: services.slice(0, 100) };
}
