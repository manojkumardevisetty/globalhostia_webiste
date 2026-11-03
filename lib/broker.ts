// Domain Broker Service: fee settings, commission maths, visitor-currency display (catalog ratios only)
// and the pipeline statuses. Pure helpers, safe to import from server components, routes and admin.
import type { Settings } from './settings';
import type { RProduct } from './render/products';

export const BROKER_STATUSES = ['new', 'awaiting_fee', 'researching', 'contacting_owner', 'negotiating', 'agreed', 'in_escrow', 'transferred', 'failed', 'cancelled'] as const;
export type BrokerStatus = (typeof BROKER_STATUSES)[number];
export const BROKER_STATUS_LABEL: Record<BrokerStatus, string> = {
  new: 'New', awaiting_fee: 'Awaiting fee', researching: 'Researching', contacting_owner: 'Contacting owner', negotiating: 'Negotiating',
  agreed: 'Price agreed', in_escrow: 'In escrow', transferred: 'Transferred', failed: 'Failed', cancelled: 'Cancelled',
};
/** Open pipeline stages (shown as columns); closed ones are listed separately. */
export const BROKER_OPEN: BrokerStatus[] = ['new', 'awaiting_fee', 'researching', 'contacting_owner', 'negotiating', 'agreed', 'in_escrow'];
export const BROKER_CLOSED: BrokerStatus[] = ['transferred', 'failed', 'cancelled'];
/** Admin badge tone for a status. */
export const brokerTone = (s: string) =>
  s === 'transferred' ? 'green' : s === 'failed' || s === 'cancelled' ? 'red' : s === 'new' ? 'blue' : s === 'awaiting_fee' ? 'yellow' : 'gray';
export const isBrokerStatus =(s: unknown): s is BrokerStatus => typeof s === 'string' && (BROKER_STATUSES as readonly string[]).includes(s);

/** Budget currencies a visitor can choose on the form. */
export const BROKER_CURRENCIES = ['USD', 'AED', 'EUR', 'GBP', 'INR'] as const;
export const BROKER_PRODUCT_NAME = 'Domain Broker Service';

export type BrokerConfig = { feeUsd: number; pct: number; minUsd: number; pid: string; dept: string };
const numOr = (v: unknown, d: number) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) && n >= 0 ? n : d; };

/** Fee settings with the owner's defaults: $79 service fee, 15% on success, minimum $100 commission. */
export function brokerConfig(s: Partial<Settings>): BrokerConfig {
  return {
    feeUsd: numOr(s.broker_fee_usd, 79), pct: numOr(s.broker_commission_pct, 15), minUsd: numOr(s.broker_min_commission_usd, 100),
    pid: /^\d+$/.test(String(s.broker_whmcs_pid ?? '').trim()) ? String(s.broker_whmcs_pid).trim() : '',
    dept: /^\d+$/.test(String(s.broker_department_id ?? '').trim()) ? String(s.broker_department_id).trim() : '',
  };
}

/** Success commission on an agreed price (same currency as the price): max(pct × price, minimum). */
export function commissionFor(price: number, pct: number, min: number) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.round(Math.max((price * pct) / 100, min) * 100) / 100;
}

/**
 * Ratio visitor-currency / USD from our own synced catalog: the median of price[cur] / price[USD] over every
 * product and billing cycle that has both. Null when there is no overlap (then we show USD only).
 */
export function catalogRate(products: Pick<RProduct, 'prices'>[], currency: string): number | null {
  if (currency === 'USD') return 1;
  const r: number[] = [];
  for (const p of products) {
    for (const u of p.prices) {
      if (u.currency !== 'USD') continue;
      const usd = parseFloat(String(u.price));
      const o = p.prices.find((x) => x.currency === currency && x.cycle === u.cycle);
      const v = o ? parseFloat(String(o.price)) : NaN;
      if (usd > 0 && v > 0) r.push(v / usd);
    }
  }
  if (r.length < 3) return null;
  r.sort((a, b) => a - b);
  return r[Math.floor(r.length / 2)];
}

/** A USD amount in the visitor currency, or null when it can't be converted from our catalog. Rounded to whole units. */
export const convertUsd = (usd: number, rate: number | null) => (rate === null ? null : Math.round(usd * rate));
