// Theme data layer: one cached read of everything the theme pages need.
// Prices come only from product_prices (synced from WHMCS) and tlds — never invent them.
import 'server-only';
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, schema } from '../db';
import { cachedRead, isDbError } from '../lkg';
import { getSettings, type Settings } from '../settings';
import { cycles, orderUrl, type RProduct } from '../render/products';
import { deriveSpecs, SPEC_LABEL } from '../render/specs';
import { CYCLE_MONTHS, money } from '../pricing';
import { siteLinks, familyFor, isApproved, CLAIMED, TYPE, type SiteLinksConfig } from './sitelinks';

export { cycles, orderUrl, deriveSpecs, SPEC_LABEL, money };

export type TProduct = RProduct & { sortOrder: number; categorySlug: string; whmcsType: string; payType: string; configOptions: import('../schema').ConfigOption[];
  /** product family of its category (sitelinks.ts familyFor): shared, vps, dedicated, rdp, ssl… */
  type: string };
export type TCategory = { id: string; slug: string; name: string; description: string; layout: string; cardTemplate: string; sortOrder: number; parentId: string | null; seoTitle: string; seoDescription: string; type: string;
  /** may surface automatically (sitelinks.ts isApproved): menu, family pages, /category page */
  auto: boolean };
export type TTld = { tld: string; currency: string; register: number | null; transfer: number | null; renew: number | null; featured: boolean; promo: string; sortOrder: number };
export type Catalog = { settings: Settings; currency: string; currencyIds?: Record<string, number>; base: string; categories: TCategory[]; products: TProduct[]; tlds: TTld[];
  /** slugs of categories the admin has hidden (they and their products are not in `categories` / `products`) */
  hiddenCategories: string[];
  /** settings.site_links, parsed */
  links: SiteLinksConfig };

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(parseFloat(String(v))) ? parseFloat(String(v)) : null);

type CatalogData = Pick<Catalog, 'categories' | 'hiddenCategories' | 'products' | 'tlds'>;
const EMPTY_CATALOG: CatalogData = { categories: [], hiddenCategories: [], products: [], tlds: [] };

// Cached 6h (tag `site`); snapshot-backed when the database is unavailable (lib/lkg.ts).
const loadCatalog = cachedRead('theme-catalog', async (): Promise<CatalogData> => {
  const now = new Date();
  const allCats = await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  const cats = allCats.filter((c) => c.visible);
  const links = siteLinks(await getSettings());
  const typeOf = (c?: { slug: string; name: string }) => (c ? familyFor(c.slug, c.name, links) : 'other');
  const rows = await db.select().from(schema.products).where(and(
    eq(schema.products.status, 'PUBLISHED'),
    eq(schema.products.whmcsRetired, false),
    or(isNull(schema.products.publishAt), lte(schema.products.publishAt, now)),
  )).orderBy(asc(schema.products.sortOrder), asc(schema.products.name));
  const prices = rows.length ? await db.select().from(schema.productPrices) : [];
  const tlds = await db.select().from(schema.tlds).where(eq(schema.tlds.visible, true));
  const tldExtra = await db.select().from(schema.tldPrices).catch((e) => { if (isDbError(e)) throw e; return [] as (typeof schema.tldPrices.$inferSelect)[]; });
  const catById = new Map(cats.map((c) => [c.id, c]));
  const byProduct = new Map<string, typeof prices>();
  for (const p of prices) { const l = byProduct.get(p.productId) || []; l.push(p); byProduct.set(p.productId, l); }

  const products: TProduct[] = rows
    .filter((r) => !r.categoryId || catById.has(r.categoryId)) // hidden category → hidden products
    .map((r) => ({
      id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, description: r.description,
      features: (r.features || []).filter((f) => typeof f === 'string' && f.trim()), attributes: r.attributes || {},
      badge: r.badge, badgeColor: r.badgeColor, featured: r.featured, displayCycle: r.displayCycle, orderUrl: r.orderUrl,
      whmcsPid: r.whmcsPid, categoryId: r.categoryId, sortOrder: r.sortOrder, whmcsType: r.whmcsType, payType: r.payType, configOptions: (r as any).configOptions || [],
      categorySlug: (r.categoryId && catById.get(r.categoryId)?.slug) || '',
      type: typeOf(r.categoryId ? catById.get(r.categoryId) : undefined),
      prices: (byProduct.get(r.id) || []).map((p) => ({ currency: p.currency, prefix: p.prefix, suffix: p.suffix, cycle: p.cycle, price: String(p.price), setupFee: String(p.setupFee) })),
    }));

  return {
    categories: cats.map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, layout: c.layout, cardTemplate: c.cardTemplate, sortOrder: c.sortOrder, parentId: c.parentId, seoTitle: c.seoTitle, seoDescription: c.seoDescription, type: typeOf(c), auto: isApproved(c.slug, c.name, links) })),
    hiddenCategories: allCats.filter((c) => !c.visible).map((c) => c.slug),
    products,
    tlds: [
      ...tlds.map((t) => ({ tld: t.tld, currency: t.currency, register: num(t.register), transfer: num(t.transfer), renew: num(t.renew), featured: t.featured, promo: t.promo, sortOrder: t.sortOrder })),
      ...tldExtra.flatMap((x) => { const m = tlds.find((t) => t.tld === x.tld); return m && x.currency !== m.currency ? [{ tld: x.tld, currency: x.currency, register: num(x.register), transfer: num(x.transfer), renew: num(x.renew), featured: m.featured, promo: m.promo, sortOrder: m.sortOrder }] : []; }),
    ]
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(b.featured) - Number(a.featured)),
  };
}, { fallback: () => EMPTY_CATALOG });

/** Settings + visible categories + published, non-retired products (with prices) + visible TLDs. Cached (tag `site`). */
export async function getCatalog(): Promise<Catalog> {
  const [settings, data] = await Promise.all([getSettings(), loadCatalog()]);
  // WHMCS currency ids are stored by the TLD sync (settings.whmcs_currency_ids): pages and the agent
  // endpoints (llms.txt, catalog, MCP) never wait on a live WHMCS call
  const stored = settings.whmcs_currency_ids;
  const currencyIds = stored && typeof stored === 'object' && Object.keys(stored).length ? stored as Record<string, number> : await loadCurrencyIds();
  const def = settings.currency || 'USD';
  let currency = def;
  try {
    const { headers } = await import('next/headers');
    const want = (await headers()).get('x-gh-cur');
    if (want && want !== def && availableCurrencies(data.products).includes(want)) currency = want;
  } catch { /* outside a request (build, cache) → default */ }
  return { settings, currency, currencyIds, base: whmcsBase(settings), links: siteLinks(settings), ...data };
}

// Fallback until the first TLD sync has stored the ids: live WHMCS, at most 2.5s; a failure is not cached.
const liveCurrencyIds = unstable_cache(async () => {
  const { getCurrencies } = await import('../whmcs');
  const ids = Object.fromEntries((await getCurrencies()).map((c) => [c.code, Number(c.id)])) as Record<string, number>;
  if (!Object.keys(ids).length) throw new Error('no currencies');
  return ids;
}, ['whmcs-currency-ids'], { tags: ['site'], revalidate: 86400 });
async function loadCurrencyIds(): Promise<Record<string, number>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([liveCurrencyIds(), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 2500); })]);
  } catch { return {}; } finally { clearTimeout(timer); }
}

/** Currencies that actually have synced product prices. */
export function availableCurrencies(products: Pick<RProduct, 'prices'>[]) {
  const set = new Set<string>();
  for (const p of products) for (const x of p.prices) set.add(x.currency);
  return [...set].sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
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
  // headline price = the shortest billing cycle (monthly when offered): longer cycles are shown as savings, not as the "from" price
  const order = ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially'];
  const rank = (c: string) => { const i = order.indexOf(c); return i < 0 ? -1 : i; };
  const best = cs.reduce((a, b) => (rank(b.cycle) < rank(a.cycle) ? b : a));
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

/**
 * Category slugs a page lists, grown automatically: subcategories of the listed ones, and categories that no
 * hand-written page claims (new in admin or from WHMCS) whose family matches a listed one, once approved
 * (Admin → Site links: new categories wait for review; machine names like "Whmcs Group 1" never surface).
 */
export function expandCategories(cat: Pick<Catalog, 'categories'>, slugs: string[]): string[] {
  const set = new Set(slugs);
  const types = new Set(slugs.map((s) => cat.categories.find((c) => c.slug === s)?.type || TYPE[s]).filter((t) => t && t !== 'other'));
  const ids = () => new Set(cat.categories.filter((c) => set.has(c.slug)).map((c) => c.id));
  for (const c of cat.categories) if (!set.has(c.slug) && !CLAIMED.has(c.slug) && c.auto && types.has(c.type)) set.add(c.slug);
  for (let i = 0; i < 3; i++) { const pid = ids(); for (const c of cat.categories) if (c.parentId && pid.has(c.parentId)) set.add(c.slug); }
  return [...set];
}

/** Products in the given categories (see expandCategories), sorted by admin sortOrder then cheapest per-month. */
export function productsFor(cat: Catalog, slugs: string[] | undefined): TProduct[] {
  if (!slugs?.length) return [];
  const set = new Set(expandCategories(cat, slugs));
  const per = (p: TProduct) => fromPrice(p, cat.currency)?.amount ?? 1e9;
  return cat.products.filter((p) => set.has(p.categorySlug)).sort((a, b) => a.sortOrder - b.sortOrder || per(a) - per(b));
}

/** Products of one category and its subcategories (no family expansion), in admin order. */
export function categoryProducts(cat: Catalog, slug: string): TProduct[] {
  const set = new Set([slug]);
  for (let i = 0; i < 3; i++) { const ids = new Set(cat.categories.filter((c) => set.has(c.slug)).map((c) => c.id)); for (const c of cat.categories) if (c.parentId && ids.has(c.parentId)) set.add(c.slug); }
  const per = (p: TProduct) => fromPrice(p, cat.currency)?.amount ?? 1e9;
  return cat.products.filter((p) => set.has(p.categorySlug)).sort((a, b) => a.sortOrder - b.sortOrder || per(a) - per(b));
}

export const categoryBySlug = (cat: Catalog, slug: string) => cat.categories.find((c) => c.slug === slug);
export const productBySlug = (cat: Catalog, slug: string) => cat.products.find((p) => p.slug === slug);

/** Visible TLDs that have a register price in the display currency. */
const TLD_POPULAR = ['.com', '.ae', '.net', '.org', '.io', '.co', '.ai', '.online', '.store', '.shop', '.tech', '.xyz', '.info', '.biz', '.in', '.uk', '.co.uk', '.eu', '.de', '.us'];
const tldRank = (t: TTld) => { const i = TLD_POPULAR.indexOf(t.tld); return (t.featured ? 0 : 1000) + (i < 0 ? 100 + t.sortOrder : i); };
export const pricedTlds = (cat: Catalog) => cat.tlds.filter((t) => t.register !== null && (t.currency || 'USD') === cat.currency).sort((a, b) => tldRank(a) - tldRank(b) || a.tld.localeCompare(b.tld));

/** Display currency prefix (from any synced price row), default "$". */
export function currencyPrefix(cat: Catalog) {
  for (const p of cat.products) { const r = p.prices.find((x) => x.currency === cat.currency && x.prefix); if (r) return r.prefix; }
  return cat.currency === 'USD' ? '$' : '';
}
