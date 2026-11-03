// Business services shop: the shop config (lib/store/config.ts) resolved against the live catalog. Which categories show,
// where they link, which products are orderable (priced in WHMCS only), and bundle totals from real component prices.
// Used by the theme pages, the menu, the sitemap, /category redirects (pseo.ts coveredBy) and the agent catalog.
import { categoryProducts, fromPrice, pricedTlds, orderUrl, domainCartUrl, type Catalog, type TCategory, type TProduct, type FromPrice } from '../theme/data';
import { CLAIMED, routeForCategory, prettyName } from '../theme/sitelinks';
import { parseStoreConfig, bundleTotal, firstYear, entryPath, sectionAnchor, HUB_PATH, type StoreConfig, type StoreEntry, type StoreBundle, type BundlePart, type BundleTotal } from './config';

export type StoreStatus = 'live' | 'quote' | 'soon';
export type StoreItem = {
  entry: StoreEntry; cat: TCategory; name: string; description: string;
  /** the shop page, or the hand-written page that already sells this category (/ssl-certificate …) */
  href: string; external: boolean;
  /** published products with a price in the display currency (the only ones the shop lists) */
  priced: TProduct[];
  status: StoreStatus; from: FromPrice | null; fromProduct: TProduct | null;
};
/** A section lists its categories; a section with no categories of its own lists the bundles. */
export type StoreSectionView = { slug: string; name: string; description: string; icon: string; items: StoreItem[]; bundles: BundleView[] };
export type BundleView = { bundle: StoreBundle; total: BundleTotal; parts: (BundlePart | null)[]; visible: boolean; orderHref: string | null };
export type StoreView = { cfg: StoreConfig; live: boolean; sections: StoreSectionView[]; items: StoreItem[]; bundles: BundleView[] };

const strip = (h: string) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export const storeConfig = (cat: Pick<Catalog, 'settings'>) => parseStoreConfig(cat.settings?.business_services);

const cache = new WeakMap<Catalog, StoreView>();

/** The shop resolved against the catalog (memoised per catalog object). `live` = published with at least one category to show. */
export function storeView(cat: Catalog): StoreView {
  const hit = cache.get(cat);
  if (hit) return hit;
  const cfg = storeConfig(cat);
  const priced = (ps: TProduct[]) => ps.filter((p) => fromPrice(p, cat.currency));
  const items: StoreItem[] = [];
  for (const e of cfg.entries) {
    if (e.hidden) continue;
    const c = cat.categories.find((x) => x.slug === e.slug); // hidden categories are not in the catalog
    if (!c) continue;
    const ps = priced(categoryProducts(cat, c.slug));
    const external = CLAIMED.has(c.slug);
    const status: StoreStatus = ps.length ? 'live' : e.kind === 'service' ? 'quote' : 'soon';
    // a hand-written page with nothing to sell would only show an empty state: keep such entries off the shop
    if (external && !ps.length) continue;
    const from = ps.reduce<{ f: FromPrice; p: TProduct } | null>((a, p) => { const f = fromPrice(p, cat.currency)!; return !a || f.amount < a.f.amount ? { f, p } : a; }, null);
    items.push({
      entry: e, cat: c, name: c.name.trim(), description: strip(c.description),
      href: external ? routeForCategory(c.slug)! : entryPath(c.slug), external,
      priced: ps, status, from: from?.f || null, fromProduct: from?.p || null,
    });
  }
  const bundles = cfg.bundles.map((b) => resolveBundle(cat, b));
  const sections = cfg.sections.map((s) => {
    const row = cat.categories.find((x) => x.slug === s.slug);
    const own = cfg.entries.some((e) => e.section === s.slug);
    return { slug: s.slug, name: row ? row.name.trim() : s.slug, description: strip(row?.description || ''), icon: s.icon,
      items: items.filter((i) => i.entry.section === s.slug), bundles: own ? [] : bundles.filter((b) => b.visible) };
  });
  const view = { cfg, live: cfg.published && (items.length > 0 || bundles.some((b) => b.visible)), sections, items, bundles };
  cache.set(cat, view);
  return view;
}

/** Cheapest first-year priced product of a category (bundle component). */
function cheapestIn(cat: Catalog, slug: string) {
  let best: { p: TProduct; v: number } | null = null;
  for (const p of categoryProducts(cat, slug)) {
    const f = firstYear(p.prices.map((x) => ({ ...x, price: Number(x.price), setupFee: Number(x.setupFee) })), cat.currency);
    if (f && (!best || f.amount < best.v)) best = { p, v: f.amount };
  }
  return best?.p || null;
}

export function resolveBundle(cat: Catalog, b: StoreBundle): BundleView {
  const parts: (BundlePart | null)[] = b.items.map((ref) => {
    const [kind, key] = [ref.slice(0, ref.indexOf(':')), ref.slice(ref.indexOf(':') + 1)];
    if (kind === 'tld') {
      const t = pricedTlds(cat).find((x) => x.tld === key);
      return t ? { ref, name: `${key} domain registration`, domain: key, register: t.register, currency: t.currency || cat.currency } : null;
    }
    const p = kind === 'p' ? cat.products.find((x) => x.slug === key) || null : cheapestIn(cat, key);
    if (!p) return null;
    const f = firstYear(p.prices.map((x) => ({ ...x, price: Number(x.price), setupFee: Number(x.setupFee) })), cat.currency);
    const c = kind === 'cat' ? cat.categories.find((x) => x.slug === key) : undefined;
    return { ref, name: c ? `${prettyName(p.name)} (${prettyName(c.name)})` : prettyName(p.name), pid: p.whmcsPid,
      href: kind === 'tld' ? undefined : withSkip(orderUrl(p, cat.base, f?.cycle)), prices: p.prices };
  });
  const total = bundleTotal(parts, b.items, cat.currency);
  // domain lines order through the domain search; product lines add straight to the cart
  total.lines.forEach((l) => { if (l.ref.startsWith('tld:')) l.href = domainCartUrl(cat.base); });
  const orderHref = b.whmcsBundleId ? `${cat.base}/cart.php?a=add&bid=${b.whmcsBundleId}` : null;
  return { bundle: b, total, parts, visible: b.published && total.complete, orderHref };
}
const withSkip = (u: string) => (/cart\.php\?a=add&pid=/.test(u) ? `${u}&skipconfig=1` : u);

/** Shop URL of a category when the shop is published and lists it ('' otherwise). Hand-written pages keep their own URL. */
export function storeHref(cat: Catalog, slug: string): string {
  const v = storeView(cat);
  if (!v.cfg.published) return '';
  const it = v.items.find((i) => i.cat.slug === slug);
  if (it) return it.href;
  const sec = v.sections.find((s) => s.slug === slug);
  return sec && (sec.items.length || sec.bundles.length) ? sectionAnchor(slug) : '';
}

/** Indexable shop URLs for the sitemap / IndexNow: only when published, and only pages with something to order or quote. */
export function storePaths(cat: Catalog): string[] {
  const v = storeView(cat);
  if (!v.live) return [];
  return [HUB_PATH, ...v.items.filter((i) => !i.external && i.status !== 'soon').map((i) => i.href)];
}

/** 301 target for /business-services/<slug> that is not a shop page of its own ('' = render or 404). */
export function storeRedirect(cat: Catalog, slug: string): string {
  const v = storeView(cat);
  const it = v.items.find((i) => i.cat.slug === slug);
  if (it?.external) return it.href;
  const sec = v.sections.find((s) => s.slug === slug || (slug === 'bundles' && s.bundles.length));
  return sec && (sec.items.length || sec.bundles.length) ? sectionAnchor(sec.slug) : '';
}
