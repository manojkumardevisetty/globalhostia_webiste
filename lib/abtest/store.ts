import 'server-only';
// A/B test storage. Experiments: settings key `ab_experiments` (JSON, edited in Admin → Experiments; texts only).
// Counts: ab_daily, one row per (Dubai day, experiment, variant) with views, unique visitors, CTA clickers, add-to-cart
// clickers, orders and revenue per currency. No visitor ids, IPs or emails are stored anywhere.
// Orders: ab_carts maps a WHMCS cart session hash (from the signed cart snapshot) to the assignments for a few days, until
// the AfterShoppingCartCheckout webhook counts the order once (ab_orders, keyed by the WHMCS order id).
// Tables: db-setup patch '039-ab-tests'.
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { getSettings, setSetting } from '../settings';
import { whmcs, whmcsConfigured } from '../whmcs';
import { getCatalog } from '../theme/data';
import { normExperiments, parseTokens, tokens, pickVariant, isLive, normPath, type Experiment } from './core';
import { ZERO, type Counts } from './stats';

export const EXP_KEY = 'ab_experiments';
export const COPY_KEY = 'page_copy';

export async function listExperiments(): Promise<Experiment[]> {
  const rows = await db.execute(sql`select value from settings where key = ${EXP_KEY}`);
  return normExperiments((rows as any)[0]?.value);
}
export const saveExperiments = (list: Experiment[]) => setSetting(EXP_KEY, list);

/** Experiments as the public pages see them (cached settings). */
export async function liveExperiments() {
  const s = await getSettings();
  return normExperiments(s[EXP_KEY]).filter((e) => isLive(e));
}

type Field = 'views' | 'visitors' | 'cta' | 'carts' | 'orders';
async function bump(exp: string, variant: string, add: Partial<Record<Field, number>>, rev?: { cur: string; amount: number }) {
  const v = (k: Field) => Math.max(0, Math.round(add[k] || 0));
  const cur = rev && /^[A-Z]{3}$/.test(rev.cur) && rev.amount > 0 ? rev.cur : '';
  const amt = cur ? Math.round(rev!.amount * 100) / 100 : 0;
  await db.execute(sql`insert into ab_daily (day, exp, variant, views, visitors, cta, carts, orders, revenue)
    values ((now() at time zone 'Asia/Dubai')::date, ${exp}, ${variant}, ${v('views')}, ${v('visitors')}, ${v('cta')}, ${v('carts')}, ${v('orders')},
      ${cur ? JSON.stringify({ [cur]: amt }) : '{}'}::jsonb)
    on conflict (day, exp, variant) do update set views = ab_daily.views + excluded.views, visitors = ab_daily.visitors + excluded.visitors,
      cta = ab_daily.cta + excluded.cta, carts = ab_daily.carts + excluded.carts, orders = ab_daily.orders + excluded.orders,
      revenue = case when ${cur} = '' then ab_daily.revenue
        else jsonb_set(ab_daily.revenue, array[${cur}]::text[], to_jsonb(coalesce((ab_daily.revenue->>${cur})::numeric, 0) + ${amt}::numeric)) end`);
}

export type EventKind = 'view' | 'cta' | 'cart';
/** One beacon from /hp/pages/ab.js. `done`: experiments this browser already counted for this event kind
 *  (unique visitors / unique clickers without storing ids). Returns the experiments on this page and those counted now. */
export async function recordEvent(o: { kind: EventKind; path: string; visitorId: string; done: string[] }) {
  const p = normPath(o.path);
  const list = (await liveExperiments()).filter((e) => e.paths.includes(p));
  const on: string[] = [], counted: string[] = [];
  for (const e of list) {
    const variant = pickVariant(o.visitorId, e);
    on.push(`${e.id}.${variant}`);
    const first = !o.done.includes(e.id);
    if (o.kind === 'view') await bump(e.id, variant, { views: 1, visitors: first ? 1 : 0 });
    else if (first) await bump(e.id, variant, o.kind === 'cta' ? { cta: 1 } : { carts: 1 });
    if (first) counted.push(e.id);
  }
  return { on, counted };
}

/** whmcs.js on a WHMCS cart page: remember which variants this cart's visitor saw (signed cart session hash). */
export async function tagCart(o: { sk: string; cid: number; cur: number; ab: string }) {
  const known = new Map((await getSettings().then((s) => normExperiments(s[EXP_KEY]))).map((e) => [e.id, e]));
  const list = parseTokens(o.ab).filter((t) => { const e = known.get(t.exp); return e && e.status !== 'draft' && e.variants.some((v) => v.key === t.variant); });
  if (!list.length) return false;
  await db.execute(sql`insert into ab_carts (sk, client_id, currency_id, ab, updated_at) values (${o.sk}, ${o.cid > 0 ? o.cid : null}, ${o.cur}, ${tokens(list)}, now())
    on conflict (sk) do update set client_id = coalesce(excluded.client_id, ab_carts.client_id), currency_id = excluded.currency_id, ab = excluded.ab, updated_at = now()`);
  if (Math.random() < 0.05) await db.execute(sql`delete from ab_carts where updated_at < now() - interval '14 days'`).catch(() => {});
  return true;
}

/** AfterShoppingCartCheckout webhook: count the order (once) for the variants its cart was tagged with. */
export async function orderPlaced(o: { orderId?: number; sk?: string; cid?: number | null }) {
  if (!o.orderId) return { counted: 0 };
  const rows = await db.execute(sql`select sk, ab, currency_id from ab_carts
    where (${o.sk || ''} <> '' and sk = ${o.sk || ''}) or (${o.cid || 0} > 0 and client_id = ${o.cid || 0})
    order by (sk = ${o.sk || ''}) desc, updated_at desc limit 1`) as any[];
  const cart = rows[0];
  if (!cart) return { counted: 0 };
  const list = parseTokens(cart.ab);
  if (!list.length) return { counted: 0 };
  const ins = await db.execute(sql`insert into ab_orders (order_id, ab) values (${o.orderId}, ${cart.ab}) on conflict (order_id) do nothing returning order_id`) as any[];
  if (!ins.length) return { counted: 0 }; // this order was already counted
  await db.execute(sql`delete from ab_carts where sk = ${cart.sk}`).catch(() => {});
  // revenue: WHMCS order total (authoritative), currency from the cart snapshot's WHMCS currency id
  let rev: { cur: string; amount: number } | undefined;
  if (whmcsConfigured()) {
    try {
      const r: any = await whmcs('GetOrders', { id: o.orderId });
      const order = r?.orders?.order?.[0];
      const amount = Number(order?.amount);
      const cat = await getCatalog();
      const ids = cat.currencyIds || {};
      const cur = Object.keys(ids).find((k) => Number(ids[k]) === Number(cart.currency_id)) || String(cat.settings.currency || 'USD');
      if (Number.isFinite(amount) && amount > 0) rev = { cur, amount };
      await db.execute(sql`update ab_orders set amount = ${rev ? rev.amount : null}, currency = ${rev ? rev.cur : ''} where order_id = ${o.orderId}`);
    } catch (e) { console.warn('[abtest] order total', (e as Error)?.message || e); }
  }
  const known = new Set(normExperiments((await getSettings())[EXP_KEY]).map((e) => e.id));
  let n = 0;
  for (const t of list) { if (!known.has(t.exp)) continue; await bump(t.exp, t.variant, { orders: 1 }, rev); n++; }
  return { counted: n };
}

export type Results = { byVariant: Record<string, Counts & { revenueByCur: Record<string, number> }>; days: { day: string; variant: string; visitors: number; conv: number }[] };
/** Totals per variant (revenue converted to the default currency with WHMCS exchange rates when available). */
export async function results(exp: string, fx: { base: string; rates: Record<string, number> } | null, baseCur: string): Promise<Results> {
  const rows = await db.execute(sql`select day::text as d, variant, views, visitors, cta, carts, orders, revenue from ab_daily where exp = ${exp} order by day`) as any[];
  const byVariant: Results['byVariant'] = {};
  const days: Results['days'] = [];
  for (const r of rows) {
    const v = (byVariant[r.variant] ||= { ...ZERO, revenueByCur: {} });
    v.views += r.views; v.visitors += r.visitors; v.cta += r.cta; v.carts += r.carts; v.orders += r.orders;
    for (const [c, a] of Object.entries((r.revenue || {}) as Record<string, string | number>)) {
      v.revenueByCur[c] = (v.revenueByCur[c] || 0) + Number(a);
      // without WHMCS rates only the default currency is summed (the per-currency totals stay visible)
      const rate = fx ? fx.rates[c] : c === baseCur ? 1 : 0;
      if (rate && rate > 0) v.revenue += Number(a) / rate;
    }
    days.push({ day: r.d, variant: r.variant, visitors: r.visitors, conv: r.carts });
  }
  return { byVariant, days };
}

/** WHMCS exchange rates relative to the default currency ({USD: 1, AED: 3.6725, ...}); null when unavailable. */
export async function exchangeRates(): Promise<{ base: string; rates: Record<string, number> } | null> {
  if (!whmcsConfigured()) return null;
  try {
    const r: any = await Promise.race([whmcs('GetCurrencies'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
    const list: any[] = r?.currencies?.currency || [];
    const rates: Record<string, number> = {};
    let base = '';
    for (const c of list) { const rate = Number(c.rate); if (c.code && rate > 0) rates[String(c.code).toUpperCase()] = rate; if (Number(c.default) === 1 || rate === 1) base ||= String(c.code).toUpperCase(); }
    return Object.keys(rates).length ? { base: base || 'USD', rates } : null;
  } catch { return null; }
}

export async function resetCounts(exp: string) {
  await db.execute(sql`delete from ab_daily where exp = ${exp}`);
}
