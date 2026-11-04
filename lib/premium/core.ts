// Premium domains marketplace: pure helpers shared by the page, the admin, the API route, the AI tools and the tests.
// No server or database imports here (tests/premium.test.mts runs it with node --experimental-strip-types); the Dynadot
// client at the end uses only global fetch and node:crypto.
//
// Sources, all real data, never invented:
//   1. The owner's own listings (table premium_domains, Admin → Premium domains).
//   2. Dynadot marketplace "for sale" listings (api3 get_listings), only when the owner switches the feed on, filtered by
//      the admin rules and shown with the owner's pricing rule (markup on the Dynadot price, or Dynadot price + broker fee).
//   3. Registry premium prices on a domain search (api3 search with show_price=1), with a premium badge.
// Settings key `premium_domains` is public (it holds no secrets): the Dynadot key and the proxy secret stay in env/WHMCS.
import { createHmac } from 'node:crypto';

export const PREMIUM_KEY = 'premium_domains';
export const PREMIUM_PATH = '/premium-domains';
export const PREMIUM_STATUSES = ['draft', 'for_sale', 'under_offer', 'sold'] as const;
export type PremiumStatus = (typeof PREMIUM_STATUSES)[number];
export const PREMIUM_STATUS_LABEL: Record<PremiumStatus, string> = { draft: 'Draft (hidden)', for_sale: 'For sale', under_offer: 'Under offer', sold: 'Sold' };
export const PREMIUM_CURRENCIES = ['USD', 'AED', 'EUR', 'GBP'] as const;
export const HOME_POSITIONS = ['after-domain', 'after-plans', 'before-blog', 'off'] as const;
export type HomePosition = (typeof HOME_POSITIONS)[number];
export const HOME_POSITION_LABEL: Record<HomePosition, string> = {
  'after-domain': 'Under the domain search (recommended)', 'after-plans': 'After the hosting plans', 'before-blog': 'Before the blog strip', off: 'Hidden',
};
export const SORTS = ['featured', 'price-asc', 'price-desc', 'length', 'az'] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABEL: Record<Sort, string> = { featured: 'Featured first', 'price-asc': 'Price: low to high', 'price-desc': 'Price: high to low', length: 'Shortest first', az: 'A to Z' };
export const LENGTHS = { '': 'Any length', '1-4': 'Up to 4 characters', '5-6': '5 to 6 characters', '7-9': '7 to 9 characters', '10+': '10 or more' } as const;
/** Built-in categories (derived from the name); owner tags are added as categories too. */
export const AUTO_CATS: Record<string, string> = { short: 'Short (5 or fewer)', letters: 'Letters only', numeric: 'Numbers', hyphen: 'With hyphen' };

export type PricingMode = 'markup' | 'fee';
export interface PremiumConfig {
  /** /premium-domains is live (else 404 → no, an elegant broker-first page; see the page module) */
  enabled: boolean;
  feed: { enabled: boolean; tlds: string[]; minPrice: number; maxPrice: number; keywords: string[]; exclude: string[]; maxCount: number; pages: number };
  /** markup: our price = Dynadot × (1 + pct) + fixed. fee: Dynadot price shown plus a broker fee max(pct × price, min). */
  pricing: { mode: PricingMode; markupPct: number; markupFixed: number; feePct: number; feeMin: number };
  /** registry premium prices on a domain search: shown with this markup (match WHMCS → Domain Pricing → Premium Domains) */
  registry: { enabled: boolean; markupPct: number };
  home: { position: HomePosition; title: string; max: number };
  /** transport: auto = WHMCS-server proxy when configured, else direct DYNADOT_API_KEY */
  source: 'auto' | 'proxy' | 'direct';
  /** '' = <WHMCS base>/gh_dynadot_proxy.php */
  proxyUrl: string;
  /** feed cache lifetime in hours (the daily cron and "Refresh now" also refresh) */
  cacheHours: number;
}

export const DEFAULT_PREMIUM: PremiumConfig = {
  enabled: true,
  feed: { enabled: true, tlds: ['.com', '.ai', '.io', '.net', '.co', '.ae'], minPrice: 100, maxPrice: 25000, keywords: [], exclude: [], maxCount: 60, pages: 10 },
  pricing: { mode: 'markup', markupPct: 15, markupFixed: 0, feePct: 15, feeMin: 100 },
  registry: { enabled: true, markupPct: 0 },
  home: { position: 'after-domain', title: 'Premium domains for sale', max: 16 },
  source: 'auto', proxyUrl: '', cacheHours: 6,
};

const num = (v: unknown, d: number, min = 0, max = 1e9) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (v: unknown, n: number, f: (x: string) => string) => {
  const a = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]+/) : [];
  return [...new Set(a.map((x) => f(String(x))).filter(Boolean))].slice(0, n);
};
export const normTld = (t: string) => { const x = t.trim().toLowerCase().replace(/^\.*/, ''); return /^[a-z0-9-]{2,24}(\.[a-z0-9-]{2,24})?$/.test(x) ? '.' + x : ''; };
const normWord = (t: string) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);

export function normalizePremium(raw: unknown): PremiumConfig {
  let r: any = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  r = r && typeof r === 'object' ? r : {};
  const d = DEFAULT_PREMIUM;
  const f = r.feed && typeof r.feed === 'object' ? r.feed : {};
  const p = r.pricing && typeof r.pricing === 'object' ? r.pricing : {};
  const g = r.registry && typeof r.registry === 'object' ? r.registry : {};
  const h = r.home && typeof r.home === 'object' ? r.home : {};
  const url = txt(r.proxyUrl, 300);
  return {
    enabled: r.enabled !== false,
    feed: {
      enabled: typeof f.enabled === 'boolean' ? f.enabled : d.feed.enabled,
      tlds: Array.isArray(f.tlds) || typeof f.tlds === 'string' ? list(f.tlds, 30, normTld) : d.feed.tlds,
      minPrice: num(f.minPrice, d.feed.minPrice, 0, 1e8), maxPrice: num(f.maxPrice, d.feed.maxPrice, 0, 1e8),
      keywords: list(f.keywords, 30, normWord), exclude: list(f.exclude, 30, normWord),
      maxCount: Math.round(num(f.maxCount, d.feed.maxCount, 0, 300)), pages: Math.round(num(f.pages, d.feed.pages, 1, 20)),
    },
    pricing: {
      mode: p.mode === 'fee' ? 'fee' : 'markup',
      markupPct: num(p.markupPct, d.pricing.markupPct, 0, 500), markupFixed: num(p.markupFixed, d.pricing.markupFixed, 0, 1e6),
      feePct: num(p.feePct, d.pricing.feePct, 0, 100), feeMin: num(p.feeMin, d.pricing.feeMin, 0, 1e6),
    },
    registry: { enabled: g.enabled !== false, markupPct: num(g.markupPct, d.registry.markupPct, 0, 500) },
    home: {
      position: (HOME_POSITIONS as readonly string[]).includes(h.position) ? h.position : d.home.position,
      title: txt(h.title, 60) || d.home.title, max: Math.round(num(h.max, d.home.max, 4, 40)),
    },
    source: r.source === 'proxy' || r.source === 'direct' ? r.source : 'auto',
    proxyUrl: /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : '',
    cacheHours: num(r.cacheHours, d.cacheHours, 1, 48),
  };
}

/* ------------------------------------------------------------------ domain names */
/** Lower-case registrable domain (ASCII or punycode), or null. Same rules as lib/agents/domain.ts validDomain. */
export function cleanDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
  if (d.length < 3 || d.length > 253) return null;
  const labels = d.split('.');
  if (labels.length < 2 || labels.length > 3) return null;
  if (!labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return null;
  if (!/^[a-z]{2,}$|^xn--[a-z0-9-]+$/.test(labels[labels.length - 1])) return null;
  return d;
}
/** "brand.co.uk" → { sld: "brand", tld: ".co.uk" } (two-label suffixes only for well-known second levels). */
export function splitDomain(d: string) {
  const parts = d.split('.');
  const two = parts.length >= 3 && /^(co|com|net|org|gov|ac|edu)$/.test(parts[parts.length - 2]);
  const tld = '.' + parts.slice(two ? -2 : -1).join('.');
  return { sld: d.slice(0, -tld.length), tld };
}
export function autoCats(sld: string): string[] {
  const out: string[] = [];
  if (sld.length <= 5) out.push('short');
  if (/^[a-z]+$/.test(sld)) out.push('letters');
  if (/^[0-9]+$/.test(sld)) out.push('numeric');
  if (sld.includes('-')) out.push('hyphen');
  return out;
}
export const tagSlug = (t: string) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);

/* ------------------------------------------------------------------ money */
/** "$1,250.00", "1250 USD", "1,250.00 in USD", 1250 → { amount: 1250, currency: "USD" }; null when there is no number. */
export function parsePrice(v: unknown, fallbackCur = 'USD'): { amount: number; currency: string } | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? { amount: v, currency: fallbackCur } : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m = s.replace(/,(?=\d{3}\b)/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const amount = parseFloat(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cur = (s.match(/\b(USD|EUR|GBP|AED|CNY|CAD|AUD|INR|JPY)\b/i)?.[1] || (s.includes('€') ? 'EUR' : s.includes('£') ? 'GBP' : s.includes('$') ? 'USD' : fallbackCur)).toUpperCase();
  return { amount, currency: cur };
}
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Marketplace prices are shown as whole units above 100, cents below. */
export const tidy = (n: number) => (n >= 100 ? Math.round(n) : round2(n));

export type PriceView = { price: number; base: number; fee: number; mode: PricingMode | 'own' };
/** Price a Dynadot marketplace listing with the owner's rule. base = Dynadot price (USD). */
export function priceFor(base: number, p: PremiumConfig['pricing']): PriceView {
  if (p.mode === 'fee') {
    const fee = tidy(Math.max((base * p.feePct) / 100, p.feeMin));
    return { price: tidy(base + fee), base: tidy(base), fee, mode: 'fee' };
  }
  const price = tidy(base * (1 + p.markupPct / 100) + p.markupFixed);
  return { price, base: tidy(base), fee: 0, mode: 'markup' };
}
export const registryPrice = (base: number, pct: number) => tidy(base * (1 + pct / 100));

const SYM: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
export function fmtMoney(n: number, cur = 'USD') {
  const s = n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return SYM[cur] ? `${SYM[cur]}${s}` : `${cur} ${s}`;
}

/* ------------------------------------------------------------------ Dynadot api3 responses */
export class DynadotApiError extends Error { code: string; constructor(message: string, code = 'api') { super(message); this.code = code; } }

/** The "<Command>Response" object (or the body itself), throwing the Dynadot error message on failure. */
export function unwrap(json: any): any {
  if (!json || typeof json !== 'object') throw new DynadotApiError('Empty response from Dynadot', 'invalid');
  const key = Object.keys(json).find((k) => /Response$/i.test(k));
  const inner = key ? json[key] : json;
  const hk = inner && typeof inner === 'object' ? Object.keys(inner).find((k) => /Header$/i.test(k)) : undefined;
  const head = hk ? inner[hk] : inner && typeof inner === 'object' ? inner : {};
  const code = head?.ResponseCode ?? head?.SuccessCode ?? inner?.ResponseCode;
  const status = String(head?.Status ?? inner?.Status ?? '');
  if (String(code) === '-1' || /^error$/i.test(status) || inner?.Error || json.error) {
    const msg = String(head?.Error || inner?.Error || inner?.ErrorMessage || json.error || 'Dynadot returned an error');
    throw new DynadotApiError(msg.slice(0, 300), /ip|whitelist|allow/i.test(msg) ? 'ip' : /key/i.test(msg) ? 'key' : 'api');
  }
  return inner;
}

const pickKey = (o: Record<string, unknown>, re: RegExp) => { const k = Object.keys(o).find((x) => re.test(x)); return k === undefined ? undefined : o[k]; };
/** Every plain object anywhere in the value (depth-first), for tolerant extraction across api3 JSON shapes. */
function objects(v: unknown, out: Record<string, unknown>[] = [], depth = 0): Record<string, unknown>[] {
  if (depth > 6 || !v || typeof v !== 'object') return out;
  if (Array.isArray(v)) { for (const x of v) objects(x, out, depth + 1); return out; }
  out.push(v as Record<string, unknown>);
  for (const x of Object.values(v)) if (x && typeof x === 'object') objects(x, out, depth + 1);
  return out;
}
const DOMAIN_KEY = /^(domain|domain_?name|name)$/i;

export type RawListing = { id: string; domain: string; amount: number; currency: string };
/** get_listings / get_listing_item → listings that carry a valid domain and a positive buy-now price. */
export function parseListings(json: unknown): RawListing[] {
  const inner = unwrap(json);
  const seen = new Set<string>();
  const out: RawListing[] = [];
  for (const o of objects(inner)) {
    const dom = cleanDomain(String(pickKey(o, DOMAIN_KEY) ?? ''));
    if (!dom || seen.has(dom)) continue;
    const cur = String(pickKey(o, /^currency$/i) ?? 'USD').toUpperCase();
    const pr = parsePrice(pickKey(o, /^(buy_?it_?now_?price|buy_?now_?price|price|asking_?price)$/i) as any, /^[A-Z]{3}$/.test(cur) ? cur : 'USD');
    if (!pr) continue;
    seen.add(dom);
    out.push({ id: String(pickKey(o, /^(listing_?id|id)$/i) ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), domain: dom, amount: pr.amount, currency: pr.currency });
  }
  return out;
}

export type SearchHit = { domain: string; available: boolean; premium: boolean; amount: number | null; renew: number | null; currency: string };
/** search (show_price=1) → per-domain availability, registration price and the premium flag. */
export function parseSearch(json: unknown): SearchHit[] {
  const inner = unwrap(json);
  const out: SearchHit[] = [];
  for (const o of objects(inner)) {
    const dom = cleanDomain(String(pickKey(o, /^(domain_?name|domain)$/i) ?? ''));
    if (!dom || out.some((x) => x.domain === dom)) continue;
    const av = String(pickKey(o, /^available$/i) ?? '').toLowerCase();
    const priceRaw = pickKey(o, /^(price|registration_?price)$/i);
    const prem = pickKey(o, /premium/i);
    const premium = prem !== undefined ? /^(yes|true|1)$/i.test(String(prem)) : /premium/i.test(String(priceRaw ?? ''));
    const pr = parsePrice(priceRaw as any);
    const rn = parsePrice(pickKey(o, /^renew(al)?_?price$/i) as any);
    out.push({ domain: dom, available: av === 'yes' || av === 'true' || av === '1', premium, amount: pr?.amount ?? null, renew: rn?.amount ?? null, currency: pr?.currency || 'USD' });
  }
  return out;
}

/** list_domain → the account's own domain names (for the explicit "import my domains" picker). */
export function parseOwnDomains(json: unknown): string[] {
  const inner = unwrap(json);
  const out = new Set<string>();
  for (const o of objects(inner)) {
    const v = pickKey(o, /^(name|domain|domain_?name)$/i);
    const d = typeof v === 'string' ? cleanDomain(v) : null;
    if (d) out.add(d);
  }
  return [...out].sort();
}

/* ------------------------------------------------------------------ feed rules */
/** Does a Dynadot listing pass the admin filters (TLDs, price range in USD, keywords, excluded words)? */
/** Brandable names only for the marketplace feed: letters, 3–12 characters, no digits or hyphens. */
export const brandable = (domain: string) => /^[a-z]{3,12}$/.test(splitDomain(domain).sld);

export function feedAllows(l: { domain: string; amount: number; currency: string }, f: PremiumConfig['feed']): boolean {
  if (l.currency !== 'USD') return false;
  const { sld, tld } = splitDomain(l.domain);
  if (f.tlds.length && !f.tlds.includes(tld)) return false;
  if (f.minPrice && l.amount < f.minPrice) return false;
  if (f.maxPrice && l.amount > f.maxPrice) return false;
  if (f.keywords.length && !f.keywords.some((k) => sld.includes(k))) return false;
  if (f.exclude.some((k) => sld.includes(k))) return false;
  return true;
}

/* ------------------------------------------------------------------ public items */
export interface PItem {
  domain: string; sld: string; tld: string; len: number;
  /** price the visitor pays for the domain (null = make an offer) */
  price: number | null; currency: string;
  /** fee mode only: Dynadot price + broker fee */
  base?: number; fee?: number;
  minOffer: number | null; offers: boolean;
  source: 'own' | 'dynadot'; owned: boolean; status: PremiumStatus; featured: boolean;
  tags: string[]; cats: string[]; description: string; listingId?: string; updatedAt?: string;
}

export type OwnRow = { domain: string; price: string | number | null; currency: string; makeOffer: boolean; minOffer: string | number | null; tags: string[] | null; description: string; status: string; owned: boolean; featured: boolean; updatedAt?: Date | string | null };
export type FeedRow = { domain: string; listingId: string; price: string | number; currency: string; fetchedAt?: Date | string | null };

export function ownItem(r: OwnRow): PItem {
  const { sld, tld } = splitDomain(r.domain);
  const price = r.price === null || r.price === '' || r.price === undefined ? null : Number(r.price);
  const tags = (r.tags || []).map((t) => txt(t, 30)).filter(Boolean);
  const status = (PREMIUM_STATUSES as readonly string[]).includes(r.status) ? r.status as PremiumStatus : 'draft';
  return {
    domain: r.domain, sld, tld, len: sld.length, price: price !== null && price > 0 ? price : null, currency: r.currency || 'USD',
    minOffer: r.minOffer ? Number(r.minOffer) || null : null, offers: !!r.makeOffer || !(price && price > 0),
    source: 'own', owned: !!r.owned, status, featured: !!r.featured, tags,
    cats: [...autoCats(sld), ...tags.map(tagSlug).filter(Boolean)], description: txt(r.description, 1200),
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
  };
}
export function feedItem(r: FeedRow, p: PremiumConfig['pricing']): PItem | null {
  const base = Number(r.price);
  if (!(base > 0) || r.currency !== 'USD') return null;
  const { sld, tld } = splitDomain(r.domain);
  const v = priceFor(base, p);
  return {
    domain: r.domain, sld, tld, len: sld.length, price: v.price, currency: 'USD', ...(v.mode === 'fee' ? { base: v.base, fee: v.fee } : {}),
    minOffer: null, offers: false, source: 'dynadot', owned: false, status: 'for_sale', featured: false, tags: [], cats: autoCats(sld),
    description: '', listingId: r.listingId, updatedAt: r.fetchedAt ? new Date(r.fetchedAt).toISOString() : undefined,
  };
}
/** Own listings first (they win over a feed row of the same name), visible statuses only, then the feed up to maxCount. */
export function mergeItems(own: OwnRow[], feed: FeedRow[], cfg: PremiumConfig): PItem[] {
  const out: PItem[] = [];
  const have = new Set<string>();
  for (const r of own) { const it = ownItem(r); if (it.status === 'draft' || it.status === 'sold' || have.has(it.domain)) continue; have.add(it.domain); out.push(it); }
  if (cfg.feed.enabled) {
    let n = 0;
    for (const r of feed) {
      if (n >= cfg.feed.maxCount) break;
      if (have.has(r.domain) || !feedAllows({ domain: r.domain, amount: Number(r.price), currency: r.currency }, cfg.feed)) continue;
      const it = feedItem(r, cfg.pricing);
      if (it) { have.add(it.domain); out.push(it); n++; }
    }
  }
  return out;
}

export type Filter = { q?: string; tld?: string; min?: number; max?: number; len?: string; cat?: string; sort?: Sort };
export function readFilter(q: URLSearchParams): Filter {
  const n = (k: string) => { const v = parseFloat(q.get(k) || ''); return Number.isFinite(v) && v >= 0 ? v : undefined; };
  const sort = q.get('sort') || '';
  const len = q.get('len') || '';
  return {
    q: (q.get('q') || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 40) || undefined,
    tld: normTld(q.get('tld') || '') || undefined, min: n('min'), max: n('max'),
    len: len in LENGTHS && len ? len : undefined, cat: tagSlug(q.get('cat') || '') || undefined,
    sort: (SORTS as readonly string[]).includes(sort) ? sort as Sort : undefined,
  };
}
const lenOk = (n: number, l?: string) => !l || (l === '1-4' ? n <= 4 : l === '5-6' ? n >= 5 && n <= 6 : l === '7-9' ? n >= 7 && n <= 9 : l === '10+' ? n >= 10 : true);
export function applyFilter(items: PItem[], f: Filter): PItem[] {
  const out = items.filter((i) =>
    (!f.q || i.domain.includes(f.q)) && (!f.tld || i.tld === f.tld) && lenOk(i.len, f.len) && (!f.cat || i.cats.includes(f.cat))
    && (f.min === undefined || (i.price ?? i.minOffer ?? 0) >= f.min) && (f.max === undefined || (i.price !== null && i.price <= f.max) || (i.price === null && (i.minOffer ?? 0) <= f.max)));
  const pr = (i: PItem) => i.price ?? i.minOffer ?? Infinity;
  const s = f.sort || 'featured';
  const cmp: Record<Sort, (a: PItem, b: PItem) => number> = {
    featured: (a, b) => Number(b.featured) - Number(a.featured) || Number(b.source === 'own') - Number(a.source === 'own') || pr(a) - pr(b),
    'price-asc': (a, b) => pr(a) - pr(b), 'price-desc': (a, b) => (b.price ?? -1) - (a.price ?? -1),
    length: (a, b) => a.len - b.len || a.domain.localeCompare(b.domain), az: (a, b) => a.domain.localeCompare(b.domain),
  };
  return out.sort((a, b) => cmp[s](a, b) || a.domain.localeCompare(b.domain));
}
/** Homepage row: featured own listings first, then the cheapest-first rest, at most `max`. */
export function marqueePicks(items: PItem[], max: number): PItem[] {
  return applyFilter(items.filter((i) => i.status === 'for_sale'), { sort: 'featured' }).slice(0, max);
}
/** Category options present in the items (auto categories + owner tags). */
export function categoriesOf(items: PItem[]): { slug: string; label: string; n: number }[] {
  const m = new Map<string, { label: string; n: number }>();
  for (const i of items) {
    for (const c of autoCats(i.sld)) { const e = m.get(c) || { label: AUTO_CATS[c], n: 0 }; e.n++; m.set(c, e); }
    for (const t of i.tags) { const s = tagSlug(t); if (!s || AUTO_CATS[s]) continue; const e = m.get(s) || { label: t, n: 0 }; e.n++; m.set(s, e); }
  }
  return [...m.entries()].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
/** Which grid the listing uses: a featured spread (1-3), cards (4-24) or a compact list with paging (25+). */
export const layoutFor = (n: number): 'feature' | 'grid' | 'list' => (n <= 3 ? 'feature' : n <= 24 ? 'grid' : 'list');

/** AI / MCP search: keyword, extension and max price (USD), with absolute listing URLs. */
export function searchPremium(items: PItem[], a: { keyword?: string; tld?: string; maxPrice?: number; limit?: number }, site: string) {
  const f: Filter = { q: (a.keyword || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 40) || undefined, tld: normTld(a.tld || '') || undefined, max: a.maxPrice && a.maxPrice > 0 ? a.maxPrice : undefined, sort: 'featured' };
  const all = applyFilter(items.filter((i) => i.status !== 'sold'), f);
  const base = site.replace(/\/$/, '');
  return {
    total: items.length, url: `${base}${PREMIUM_PATH}`,
    items: all.slice(0, Math.min(20, Math.max(1, a.limit || 6))).map((i) => ({
      domain: i.domain, price: i.price, currency: i.currency, minOffer: i.minOffer, makeOffer: i.offers, status: i.status, featured: i.featured,
      listing: i.source === 'dynadot' ? 'marketplace' : i.owned ? 'owned' : 'brokered', url: `${base}${PREMIUM_PATH}/${encodeURIComponent(i.domain)}`,
    })),
  };
}

/* ------------------------------------------------------------------ CSV import (Admin) */
export type CsvRow = { domain: string; price: number | null; currency: string; makeOffer: boolean; minOffer: number | null; tags: string[]; description: string; owned: boolean; featured: boolean };
/** domain,price,currency,min_offer,tags,description,owned,featured: header optional; tags separated by | or ;. */
export function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2001);
  const rows: CsvRow[] = [], errors: string[] = [];
  const cells = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((c) => c.trim()); };
  lines.forEach((l, i) => {
    const c = cells(l);
    if (i === 0 && /^domain$/i.test(c[0])) return;
    const d = cleanDomain(c[0]);
    if (!d) { errors.push(`Line ${i + 1}: "${c[0].slice(0, 60)}" is not a domain`); return; }
    const pr = c[1] ? parseFloat(c[1].replace(/[,\s$]/g, '')) : NaN;
    const cur = (c[2] || 'USD').toUpperCase();
    const mo = c[3] ? parseFloat(c[3].replace(/[,\s$]/g, '')) : NaN;
    rows.push({
      domain: d, price: Number.isFinite(pr) && pr > 0 ? pr : null, currency: (PREMIUM_CURRENCIES as readonly string[]).includes(cur) ? cur : 'USD',
      makeOffer: !(Number.isFinite(pr) && pr > 0) || /offer/i.test(c[1] || ''), minOffer: Number.isFinite(mo) && mo > 0 ? mo : null,
      tags: (c[4] || '').split(/[|;]/).map((t) => txt(t, 30)).filter(Boolean).slice(0, 8), description: txt(c[5], 1200),
      owned: !/^(no|false|0|brokered)$/i.test(c[6] || 'yes'), featured: /^(yes|true|1)$/i.test(c[7] || ''),
    });
  });
  return { rows, errors };
}

/* ------------------------------------------------------------------ proxy signing (shared with docs/whmcs/gh_dynadot_proxy.php) */
/** Read-only Dynadot commands (and parameters) our server may ask the WHMCS proxy for. The PHP file has the same list. */
export const PROXY_COMMANDS: Record<string, string[]> = {
  search: ['show_price', 'currency', ...Array.from({ length: 20 }, (_, i) => `domain${i}`)],
  get_listings: ['currency', 'count_per_page', 'page_index', 'exclude_pending_sale', 'show_other_registrar'],
  get_listing_item: ['listing_id', 'currency'],
  list_domain: ['count_per_page', 'page_index'],
};
export const proxyPayload = (t: number, body: string) => `gh-dynadot.v1.${t}.${body}`;

/* ------------------------------------------------------------------ Dynadot client (pure: global fetch + node:crypto) */
/** How lib/premium/dynadot.ts reaches Dynadot: the signed WHMCS proxy (primary), a direct key (fallback) or not at all.
 *  apiBase is for tests only (a local mock); production always calls https://api.dynadot.com. */
export type Transport = { mode: 'proxy'; url: string; secret: string } | { mode: 'direct'; key: string; apiBase?: string } | { mode: 'none'; reason: string };

/** One read-only api3 command through the chosen transport. Throws DynadotApiError. */
export async function call(t: Transport, cmd: string, params: Record<string, string> = {}, timeoutMs = 15000): Promise<unknown> {
  if (!PROXY_COMMANDS[cmd]) throw new DynadotApiError(`Command ${cmd} is not allowed`, 'config');
  for (const k of Object.keys(params)) if (!PROXY_COMMANDS[cmd].includes(k)) throw new DynadotApiError(`Parameter ${k} is not allowed for ${cmd}`, 'config');
  if (t.mode === 'none') throw new DynadotApiError(t.reason, 'config');
  let res: Response;
  try {
    if (t.mode === 'proxy') {
      const body = JSON.stringify({ cmd, params });
      const ts = Math.floor(Date.now() / 1000);
      const sig = createHmac('sha256', t.secret).update(proxyPayload(ts, body)).digest('hex');
      res = await fetch(t.url, { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'content-type': 'application/json', 'x-gh-signature': `t=${ts},v1=${sig}`, 'user-agent': 'GlobalHostia-Premium/1' } });
    } else {
      const u = new URL(`${t.apiBase || 'https://api.dynadot.com'}/api3.json`);
      u.searchParams.set('key', t.key); u.searchParams.set('command', cmd);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      res = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    }
  } catch (e: any) {
    throw new DynadotApiError(e?.name === 'TimeoutError' ? `Timed out after ${timeoutMs / 1000}s` : `Network error: ${String(e?.message || e).slice(0, 160)}`, 'network');
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new DynadotApiError(`HTTP ${res.status}: not JSON (${text.slice(0, 120).replace(/\s+/g, ' ')})`, res.status === 404 ? 'proxy_missing' : 'invalid'); }
  if (t.mode === 'proxy') {
    // the proxy answers {ok:true,data:<Dynadot JSON>} or {ok:false,error}
    if (!json?.ok) throw new DynadotApiError(String(json?.error || `Proxy HTTP ${res.status}`).slice(0, 300), res.status === 401 ? 'signature' : /ip|whitelist/i.test(String(json?.error)) ? 'ip' : 'proxy');
    return json.data;
  }
  return json;
}

/** Marketplace listings, page by page (count_per_page 100, page_index from 1). Returns the listings and how many pages were read. */
export async function getListings(t: Transport, pages: number): Promise<{ items: RawListing[]; pages: number }> {
  const all: RawListing[] = [];
  let read = 0;
  for (let i = 0; i < pages; i++) {
    const r = parseListings(await call(t, 'get_listings', { currency: 'usd', count_per_page: '100', page_index: String(i + 1) }, 25000));
    read++;
    all.push(...r);
    if (r.length < 100) break;
  }
  return { items: all, pages: read };
}

export async function getListingItem(t: Transport, id: string): Promise<RawListing | null> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  return parseListings(await call(t, 'get_listing_item', { listing_id: id, currency: 'usd' }))[0] || null;
}

/** Registry price check for up to 20 names (search with show_price=1). */
export async function searchPrices(t: Transport, domains: string[], timeoutMs = 6000): Promise<SearchHit[]> {
  const p: Record<string, string> = { show_price: '1', currency: 'usd' };
  domains.slice(0, 20).forEach((d, i) => { p[`domain${i}`] = d; });
  return parseSearch(await call(t, 'search', p, timeoutMs));
}

/** The registrar account's own domains (Admin import picker only; never listed automatically). */
export async function ownDomains(t: Transport): Promise<string[]> {
  return parseOwnDomains(await call(t, 'list_domain', {}, 25000));
}

/** Human advice for an error kind (Admin → Premium domains). */
export function adviceFor(e: unknown): string {
  const code = e instanceof DynadotApiError ? e.code : 'network';
  return ({
    config: 'Finish the setup below.', signature: 'The proxy rejected the signature: the secret in gh_dynadot_proxy.php must match the WHMCS hook secret.',
    proxy_missing: 'The proxy file was not found: upload docs/whmcs/gh_dynadot_proxy.php to the WHMCS root folder.',
    ip: 'Dynadot refused the IP: whitelist the calling server IP in Dynadot → Settings → API.', key: 'Dynadot rejected the API key: check WHMCS → Registrars → Dynadot.',
    proxy: 'The proxy reported an error (see the message).', network: 'Could not reach the server; it may be down or blocking requests.', invalid: 'Unexpected response.', api: 'Dynadot returned an error.',
  } as Record<string, string>)[code] || '';
}
