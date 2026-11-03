// Machine-readable view of the live catalog for AI assistants and shopping agents
// (/api/catalog, /api/mcp, /llms.txt, /feeds/*). Prices come only from the database
// (product_prices synced from WHMCS, tlds); nothing here invents a price.
import 'server-only';
import { getCatalog, availableCurrencies, pricedTlds, cycles, deriveSpecs, type Catalog, type TProduct } from '../theme/data';
import { ROUTES } from '../theme/routes';
import { categoryHref } from '../theme/sitelinks';
import { CYCLE_LABEL, CYCLE_MONTHS } from '../pricing';
import { CURRENCY_LABEL } from '../currency';
import { DEFAULT_EMAIL, DEFAULT_PHONE } from '../seo';

export const BRAND = 'GlobalHostia';
export const CYCLE_ORDER = ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially', 'onetime', 'free'] as const;
export const ISO_DURATION: Record<string, string> = { monthly: 'P1M', quarterly: 'P3M', semiannually: 'P6M', annually: 'P1Y', biennially: 'P2Y', triennially: 'P3Y' };

export type AgentPrice = { cycle: string; label: string; months: number; price: number; setupFee: number; perMonth: number | null; currency: string; orderUrl: string };
export type AgentProduct = {
  slug: string; name: string; tagline: string; description: string;
  category: { slug: string; name: string } | null; type: string;
  specs: Record<string, string>; features: string[]; notIncluded: string[]; location: string | null;
  currency: string; prices: AgentPrice[];
  from: { price: number; cycle: string; perMonth: number | null } | null;
  availability: 'in_stock' | 'out_of_stock' | 'preorder' | 'price_on_request';
  configurable: boolean; url: string; categoryUrl: string | null; orderUrl: string;
};
export type AgentCategory = { slug: string; name: string; summary: string; url: string | null; productCount: number; from: { price: number; cycle: string; perMonth: number | null; currency: string } | null; parent: string | null };
export type AgentTld = { tld: string; currency: string; register: number | null; transfer: number | null; renew: number | null; promo: string; registerUrl: string };

export type AgentData = {
  cat: Catalog; site: string; currency: string; currencies: string[]; defaultCurrency: string;
  company: string; phone: string; email: string; locations: string[];
  categories: AgentCategory[]; products: AgentProduct[];
};

export const siteOf = (cat: Catalog) => String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
const strip = (s: string) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const round = (n: number) => Math.round(n * 100) / 100;

/** Listing page for a category: its hand-written page (first route listing it), else the generated /category/<slug>. */
export function categoryPath(slug: string): string | null {
  return slug ? categoryHref(slug) : null;
}

/** WHMCS cart link for a product/cycle in a currency (adds &currency=<WHMCS id> when known). */
export function cartLink(cat: Catalog, p: Pick<TProduct, 'orderUrl' | 'whmcsPid'>, cycle: string | undefined, currency: string) {
  if (p.orderUrl) return p.orderUrl;
  if (!p.whmcsPid) return '';
  const id = cat.currencyIds?.[currency];
  const bc = cycle && !['auto', 'free', 'onetime'].includes(cycle) ? `&billingcycle=${cycle}` : '';
  return `${cat.base}/cart.php?a=add&pid=${p.whmcsPid}${bc}${id ? `&currency=${id}` : ''}`;
}

export function domainCartLink(cat: Catalog, domain: string, currency: string) {
  const id = cat.currencyIds?.[currency];
  return `${cat.base}/cart.php?a=add&domain=register&query=${encodeURIComponent(domain)}${id ? `&currency=${id}` : ''}`;
}

function availability(p: TProduct, priced: boolean): AgentProduct['availability'] {
  const b = (p.badge || '').trim();
  if (/^(out|sold ?out|out of stock)$/i.test(b)) return 'out_of_stock';
  if (/pre-?order/i.test(b)) return 'preorder';
  return priced ? 'in_stock' : 'price_on_request';
}

export function toAgentProduct(cat: Catalog, p: TProduct, currency: string, site: string): AgentProduct {
  const cs = cycles(p, currency).filter((c) => Number.isFinite(c.price));
  const prices: AgentPrice[] = cs
    .sort((a, b) => CYCLE_ORDER.indexOf(a.cycle as any) - CYCLE_ORDER.indexOf(b.cycle as any))
    .map((c) => {
      const months = CYCLE_MONTHS[c.cycle] || 0;
      return { cycle: c.cycle, label: CYCLE_LABEL[c.cycle] || c.cycle, months, price: round(c.price), setupFee: round(c.setup), perMonth: months ? round(c.price / months) : null, currency, orderUrl: cartLink(cat, p, c.cycle, currency) };
    });
  const head = prices.find((x) => x.cycle === p.displayCycle) || prices[0] || null;
  const specs = deriveSpecs(p.features, p.attributes);
  const catRow = cat.categories.find((c) => c.slug === p.categorySlug);
  const cp = p.categorySlug ? categoryPath(p.categorySlug) : null;
  return {
    slug: p.slug, name: p.name, tagline: strip(p.tagline), description: strip(p.description),
    category: catRow ? { slug: catRow.slug, name: catRow.name } : null, type: p.whmcsType || '',
    specs, features: p.features.filter((f) => !f.trim().startsWith('-')).map(strip),
    notIncluded: p.features.filter((f) => f.trim().startsWith('-')).map((f) => strip(f.replace(/^\s*-\s*/, ''))),
    location: specs.location || null, currency, prices,
    from: head ? { price: head.price, cycle: head.cycle, perMonth: head.perMonth } : null,
    availability: availability(p, prices.length > 0), configurable: (p.configOptions || []).length > 0,
    url: `${site}/p/${p.slug}`, categoryUrl: cp ? site + cp : null,
    orderUrl: head ? head.orderUrl : cartLink(cat, p, undefined, currency),
  };
}

/** Normalise a requested currency: valid 3-letter code that has synced prices, else null. */
export function pickCurrency(want: string | null | undefined, currencies: string[], def: string) {
  if (!want) return def;
  const c = want.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) && currencies.includes(c) ? c : null;
}

/** Everything an agent needs, in one currency. */
export async function agentData(currency?: string | null): Promise<AgentData> {
  const cat = await getCatalog();
  const site = siteOf(cat);
  const currencies = availableCurrencies(cat.products);
  const def = currencies.includes(String(cat.settings.currency || 'USD')) ? String(cat.settings.currency || 'USD') : currencies[0] || 'USD';
  const cur = pickCurrency(currency, currencies, def) || def;
  const products = cat.products.map((p) => toAgentProduct(cat, p, cur, site));
  const categories: AgentCategory[] = cat.categories.map((c) => {
    const ps = products.filter((p) => p.category?.slug === c.slug);
    const priced = ps.filter((p) => p.from);
    const low = priced.reduce<AgentProduct | null>((a, b) => (!a || (b.from!.perMonth ?? b.from!.price) < (a.from!.perMonth ?? a.from!.price) ? b : a), null);
    const path = categoryPath(c.slug);
    return {
      slug: c.slug, name: c.name, parent: c.parentId ? cat.categories.find((x) => x.id === c.parentId)?.slug || null : null,
      summary: strip(c.seoDescription || c.description) || (path ? ROUTES[path.slice(1)]?.description || '' : ''),
      url: path ? site + path : null, productCount: ps.length,
      from: low?.from ? { ...low.from, currency: cur } : null,
    };
  }).filter((c) => c.productCount > 0);
  const locations = [...new Set(products.map((p) => p.location).filter(Boolean) as string[])].sort();
  return {
    cat, site, currency: cur, currencies, defaultCurrency: def,
    company: String(cat.settings.company || '').trim(),
    phone: String(cat.settings.phone || DEFAULT_PHONE).trim(), email: String(cat.settings.email || DEFAULT_EMAIL).trim(),
    locations, categories, products,
  };
}

/** TLD prices in a currency (popular first). */
export function agentTlds(d: AgentData, limit = 500): AgentTld[] {
  return pricedTlds({ ...d.cat, currency: d.currency }).slice(0, limit).map((t) => ({
    tld: t.tld, currency: d.currency, register: t.register, transfer: t.transfer, renew: t.renew, promo: t.promo || '',
    registerUrl: `${d.cat.base}/cart.php?a=add&domain=register`,
  }));
}

export type SearchOpts = { query?: string; category?: string; maxPrice?: number; location?: string; limit?: number };

/** Simple ranked search: every query word should match name, tagline, category, features or specs. */
export function searchProducts(d: AgentData, o: SearchOpts) {
  const words = String(o.query || '').toLowerCase().split(/[^a-z0-9.+]+/).filter((w) => w.length > 1).slice(0, 12);
  const cat = o.category?.trim().toLowerCase();
  const loc = o.location?.trim().toLowerCase();
  const scored = d.products.map((p) => {
    if (cat && !(p.category && (p.category.slug === cat || p.category.name.toLowerCase().includes(cat)))) return null;
    if (loc && !(`${p.location || ''} ${p.name} ${p.features.join(' ')}`.toLowerCase().includes(loc))) return null;
    if (o.maxPrice !== undefined && (!p.from || (p.from.perMonth ?? p.from.price) > o.maxPrice)) return null;
    let score = 0;
    if (words.length) {
      const name = p.name.toLowerCase(), meta = `${p.tagline} ${p.category?.name || ''} ${p.category?.slug || ''}`.toLowerCase();
      const body = `${p.features.join(' ')} ${Object.values(p.specs).join(' ')} ${p.description}`.toLowerCase();
      let hit = 0;
      for (const w of words) {
        const s = name.includes(w) ? 3 : meta.includes(w) ? 2 : body.includes(w) ? 1 : 0;
        if (s) hit++;
        score += s;
      }
      if (hit < Math.ceil(words.length / 2)) return null;
    }
    return { p, score };
  }).filter(Boolean) as { p: AgentProduct; score: number }[];
  const price = (p: AgentProduct) => (p.from ? p.from.perMonth ?? p.from.price : 1e9);
  scored.sort((a, b) => b.score - a.score || price(a.p) - price(b.p));
  return scored.slice(0, Math.min(Math.max(o.limit || 20, 1), 100)).map((x) => x.p);
}

export const currencyName = (c: string) => CURRENCY_LABEL[c] || c;
const money = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;
export const priceText = (p: AgentProduct) => {
  if (!p.from) return 'price on request';
  const cyc = p.prices.find((x) => x.cycle === p.from!.cycle);
  const m = cyc?.months || 0;
  const per = m === 1 ? '/month' : m === 12 ? '/year' : m ? ` per ${m} months` : p.from.cycle === 'onetime' ? ' one-time' : '';
  return `from ${money(p.from.price, p.currency)}${per}`;
};
