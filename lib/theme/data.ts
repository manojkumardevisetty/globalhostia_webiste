// Theme data layer: one cached read of everything the theme pages need.
// Prices come only from product_prices (synced from WHMCS) and tlds — never invent them.
import 'server-only';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, schema } from '../db';
import { getSettings, type Settings } from '../settings';
import { cycles, orderUrl, type RProduct } from '../render/products';
import { deriveSpecs, SPEC_LABEL } from '../render/specs';
import { CYCLE_MONTHS, money } from '../pricing';

export { cycles, orderUrl, deriveSpecs, SPEC_LABEL, money };

export type TProduct = RProduct & { sortOrder: number; categorySlug: string; whmcsType: string; payType: string };
export type TCategory = { id: string; slug: string; name: string; description: string; layout: string; cardTemplate: string; sortOrder: number; parentId: string | null; seoTitle: string; seoDescription: string };
export type TTld = { tld: string; currency: string; register: number | null; transfer: number | null; renew: number | null; featured: boolean; promo: string; sortOrder: number };
export type Catalog = { settings: Settings; currency: string; base: string; categories: TCategory[]; products: TProduct[]; tlds: TTld[] };

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(parseFloat(String(v))) ? parseFloat(String(v)) : null);

const loadCatalog = unstable_cache(async () => {
  const now = new Date();
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.visible, true)).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  const rows = await db.select().from(schema.products).where(and(
    eq(schema.products.status, 'PUBLISHED'),
    eq(schema.products.whmcsRetired, false),
    or(isNull(schema.products.publishAt), lte(schema.products.publishAt, now)),
  )).orderBy(asc(schema.products.sortOrder), asc(schema.products.name));
  const prices = rows.length ? await db.select().from(schema.productPrices) : [];
  const tlds = await db.select().from(schema.tlds).where(eq(schema.tlds.visible, true));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const byProduct = new Map<string, typeof prices>();
  for (const p of prices) { const l = byProduct.get(p.productId) || []; l.push(p); byProduct.set(p.productId, l); }

  const products: TProduct[] = rows
    .filter((r) => !r.categoryId || catById.has(r.categoryId)) // hidden category → hidden products
    .map((r) => ({
      id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, description: r.description,
      features: (r.features || []).filter((f) => typeof f === 'string' && f.trim()), attributes: r.attributes || {},
      badge: r.badge, badgeColor: r.badgeColor, featured: r.featured, displayCycle: r.displayCycle, orderUrl: r.orderUrl,
      whmcsPid: r.whmcsPid, categoryId: r.categoryId, sortOrder: r.sortOrder, whmcsType: r.whmcsType, payType: r.payType,
      categorySlug: (r.categoryId && catById.get(r.categoryId)?.slug) || '',
      prices: (byProduct.get(r.id) || []).map((p) => ({ currency: p.currency, prefix: p.prefix, suffix: p.suffix, cycle: p.cycle, price: String(p.price), setupFee: String(p.setupFee) })),
    }));

  return {
    categories: cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, layout: c.layout, cardTemplate: c.cardTemplate, sortOrder: c.sortOrder, parentId: c.parentId, seoTitle: c.seoTitle, seoDescription: c.seoDescription })),
    products,
    tlds: tlds.map((t) => ({ tld: t.tld, currency: t.currency, register: num(t.register), transfer: num(t.transfer), renew: num(t.renew), featured: t.featured, promo: t.promo, sortOrder: t.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(b.featured) - Number(a.featured)),
  };
}, ['theme-catalog', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'], revalidate: 3600 });

/** Settings + visible categories + published, non-retired products (with prices) + visible TLDs. Cached (tag `site`). */
export async function getCatalog(): Promise<Catalog> {
  const [settings, data] = await Promise.all([getSettings(), loadCatalog()]);
  return { settings, currency: settings.currency || 'USD', base: whmcsBase(settings), ...data };
}

export const whmcsBase = (s: Partial<Settings>) => String(s.whmcs_base_url || process.env.WHMCS_BASE_URL || 'https://globalhostia.com/secure').replace(/\/$/, '');
export const domainCartUrl = (base: string, query = '') => `${base}/cart.php?a=add&domain=register${query ? `&query=${encodeURIComponent(query)}` : ''}`;
export const whmcsLinks = (base: string) => ({
  login: `${base}/clientarea.php`, register: `${base}/register.php`, cart: `${base}/cart.php`, ticket: `${base}/submitticket.php`,
  transfer: `${base}/cart.php?a=add&domain=transfer`, knowledgebase: `${base}/index.php?rp=/knowledgebase`, announcements: `${base}/index.php?rp=/announcements`,
});

export type FromPrice = { amount: number; price: number; prefix: string; cycle: string; months: number };

/** Cheapest per-month price of a product: amount = per-month equivalent, price = billed amount for that cycle. */
export function fromPrice(p: Pick<RProduct, 'prices'>, currency = 'USD'): FromPrice | null {
  const cs = cycles(p as RProduct, currency).filter((c) => Number.isFinite(c.price));
  if (!cs.length) return null;
  const best = cs.reduce((a, b) => (b.perMonth < a.perMonth ? b : a));
  return { amount: best.perMonth, price: best.price, prefix: best.prefix || '$', cycle: best.cycle, months: CYCLE_MONTHS[best.cycle] || 0 };
}

/** Cheapest fromPrice across a set of products (for "from $X/mo" copy). */
export function minFrom(products: Pick<RProduct, 'prices'>[], currency = 'USD'): FromPrice | null {
  let best: FromPrice | null = null;
  for (const p of products) { const f = fromPrice(p, currency); if (f && (!best || f.amount < best.amount)) best = f; }
  return best;
}

/** "$2.50" style money for a FromPrice amount. */
export const fmt = (v: number, prefix = '$') => money(v, prefix);

/** Products in the given categories, sorted by admin sortOrder then cheapest per-month. */
export function productsFor(cat: Catalog, slugs: string[] | undefined): TProduct[] {
  if (!slugs?.length) return [];
  const set = new Set(slugs);
  const per = (p: TProduct) => fromPrice(p, cat.currency)?.amount ?? 1e9;
  return cat.products.filter((p) => set.has(p.categorySlug)).sort((a, b) => a.sortOrder - b.sortOrder || per(a) - per(b));
}

export const categoryBySlug = (cat: Catalog, slug: string) => cat.categories.find((c) => c.slug === slug);
export const productBySlug = (cat: Catalog, slug: string) => cat.products.find((p) => p.slug === slug);

/** Visible TLDs that have a register price in the display currency. */
export const pricedTlds = (cat: Catalog) => cat.tlds.filter((t) => t.register !== null && (t.currency || 'USD') === cat.currency);

/** Display currency prefix (from any synced price row), default "$". */
export function currencyPrefix(cat: Catalog) {
  for (const p of cat.products) { const r = p.prices.find((x) => x.currency === cat.currency && x.prefix); if (r) return r.prefix; }
  return cat.currency === 'USD' ? '$' : '';
}
