export const CYCLES = ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially'] as const;
export const CYCLE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semiannually: 6, annually: 12, biennially: 24, triennially: 36, onetime: 0 };
export const CYCLE_LABEL: Record<string, string> = {
  monthly: 'Monthly', quarterly: 'Quarterly', semiannually: 'Semi-Annually', annually: 'Annually',
  biennially: 'Biennially', triennially: 'Triennially', onetime: 'One Time', free: 'Free',
};
export const CYCLE_SHORT: Record<string, string> = { monthly: '/mo', quarterly: '/qtr', semiannually: '/6mo', annually: '/yr', biennially: '/2yr', triennially: '/3yr', onetime: '', free: '' };

export interface PriceRow { currency: string; prefix: string; suffix: string; cycle: string; price: string | number; setupFee: string | number }

/** Parse a WHMCS pricing object for one currency into rows (WHMCS uses -1.00 for disabled cycles). */
export function parseWhmcsPricing(paytype: string, p: Record<string, string>, currency: string): PriceRow[] {
  const rows: PriceRow[] = [];
  const base = { currency, prefix: p.prefix ?? '', suffix: p.suffix ?? '' };
  if (paytype === 'free') return [{ ...base, cycle: 'free', price: 0, setupFee: 0 }];
  if (paytype === 'onetime') {
    const v = parseFloat(p.monthly);
    return v >= 0 ? [{ ...base, cycle: 'onetime', price: v, setupFee: Math.max(0, parseFloat(p.msetupfee) || 0) }] : [];
  }
  const setupKey: Record<string, string> = { monthly: 'msetupfee', quarterly: 'qsetupfee', semiannually: 'ssetupfee', annually: 'asetupfee', biennially: 'bsetupfee', triennially: 'tsetupfee' };
  for (const c of CYCLES) {
    const v = parseFloat(p[c]);
    if (Number.isFinite(v) && v >= 0) rows.push({ ...base, cycle: c, price: v, setupFee: Math.max(0, parseFloat(p[setupKey[c]]) || 0) });
  }
  return rows;
}

/** Choose the cycle to display: explicit preference if available, else cheapest-per-month headline (monthly first). */
export function pickPrice(rows: PriceRow[], currency: string, prefer = 'auto'): PriceRow | null {
  const r = rows.filter((x) => x.currency === currency);
  if (!r.length) return null;
  if (prefer !== 'auto') { const m = r.find((x) => x.cycle === prefer); if (m) return m; }
  return r.find((x) => x.cycle === 'monthly') || r.find((x) => x.cycle === 'free') || r.find((x) => x.cycle === 'onetime') || r.sort((a, b) => CYCLE_MONTHS[a.cycle] - CYCLE_MONTHS[b.cycle])[0];
}

export const money = (v: string | number, prefix = '$', suffix = '') => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return `${prefix}${n.toFixed(2)}${suffix && !/^\s*[A-Z]{3}\s*$/.test(suffix) ? suffix : ''}`;
};

export function features(description: string): string[] {
  return description.replace(/<br\s*\/?>(\s*)/gi, '\n').replace(/<\/(p|li|div)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').split(/\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 30);
}
