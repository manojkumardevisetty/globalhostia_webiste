// "Sell your domain on GlobalHostia": customer-submitted listings in the premium domains marketplace.
// Pure helpers (no server or database imports) shared by the portal (/account/sell), the admin review queue
// (Admin → Premium domains → Seller submissions), the WHMCS flow at the end of this file, the public pages and the tests.
//
// Rules (owner requirements, decisions documented here):
//  - A domain can be listed only while it is registered with GlobalHostia in the seller's own WHMCS account, status Active,
//    and not expiring within `minExpiryDays` (default 30): an expiring domain must be renewed first (the portal shows Renew).
//  - Fees are charged by a WHMCS invoice in the client's own currency, never on our site (createFeeInvoice below).
//  - Status flow: draft → awaiting_payment → in_review → live → sold | withdrawn; in_review → rejected (with reason).
//    The daily check hides a listing (suspended) when the domain left the account, expired or was cancelled.
//  - The listing fee is per domain and buys one year from approval (listed_until). Featured (+fee, per domain) runs until
//    listed_until too (featured_until), also when bought later in the year (no pro-rata: owner decision, simplest to explain).
//    30, 7 and 1 days before listed_until the seller gets a "Renew listing" email; at listed_until the listing is hidden
//    (status expired) until a renewal invoice is paid. A paid renewal adds one year (from listed_until, or from today when
//    already expired) and goes live again without review, unless the seller has text changes waiting (then in_review).
//  - Several drafts can be paid together: one invoice with one line per domain (and per Featured upgrade).
//  - Seller edits: price, currency, minimum offer and "accept offers" apply at once (also on a live listing). Description,
//    tags and category of a LIVE listing go to review (pending changes); the public page keeps the approved text until the
//    admin approves them. Before approval (draft / awaiting payment / in review) every edit applies directly.
//  - Withdraw any time; fees are not refunded automatically. Rejections never refund automatically either: the owner refunds
//    manually in WHMCS, following the refund policy text from the settings.
// No imports: tests run this file directly with node --experimental-strip-types (relative runtime imports would not resolve).

/** Lower-case registrable domain, or null. Same rules as lib/premium/core.ts cleanDomain. */
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
/** "brand.co.uk" → { sld: "brand", tld: ".co.uk" } (same as lib/premium/core.ts splitDomain). */
export function splitDomain(d: string) {
  const parts = d.split('.');
  const two = parts.length >= 3 && /^(co|com|net|org|gov|ac|edu)$/.test(parts[parts.length - 2]);
  const tld = '.' + parts.slice(two ? -2 : -1).join('.');
  return { sld: d.slice(0, -tld.length), tld };
}

export const SELL_KEY = 'seller_listings';
export const SELL_STATUSES = ['draft', 'awaiting_payment', 'in_review', 'live', 'expired', 'rejected', 'suspended', 'sold', 'withdrawn'] as const;
export type SellStatus = (typeof SELL_STATUSES)[number];
export const isSellStatus = (s: unknown): s is SellStatus => typeof s === 'string' && (SELL_STATUSES as readonly string[]).includes(s);
/** Statuses that still hold the domain (one open listing per domain). */
export const OPEN_STATUSES: SellStatus[] = ['draft', 'awaiting_payment', 'in_review', 'live', 'expired', 'suspended'];
export const CLOSED_STATUSES: SellStatus[] = ['rejected', 'sold', 'withdrawn'];
export const SELL_STATUS_LABEL: Record<SellStatus, string> = {
  draft: 'Draft', awaiting_payment: 'Awaiting payment', in_review: 'In review', live: 'Live', expired: 'Listing expired', rejected: 'Not approved',
  suspended: 'Hidden', sold: 'Sold', withdrawn: 'Withdrawn',
};
/** Admin badge colour / portal pill tone. */
export const sellTone = (s: string): 'ok' | 'warn' | 'bad' | 'info' | 'muted' =>
  s === 'live' ? 'ok' : s === 'awaiting_payment' || s === 'in_review' || s === 'expired' ? 'warn' : s === 'rejected' || s === 'suspended' ? 'bad' : s === 'sold' ? 'info' : 'muted';

/** Allowed status changes. Anything else is refused by `canMove` (and so by every action). */
export const TRANSITIONS: Record<SellStatus, SellStatus[]> = {
  draft: ['awaiting_payment', 'withdrawn'],
  awaiting_payment: ['in_review', 'draft', 'withdrawn'],
  in_review: ['live', 'rejected', 'withdrawn', 'suspended'],
  live: ['sold', 'withdrawn', 'suspended', 'expired'],
  expired: ['live', 'in_review', 'withdrawn', 'suspended'],
  suspended: ['live', 'in_review', 'withdrawn'],
  rejected: [], sold: [], withdrawn: [],
};
export const canMove = (from: string, to: SellStatus) => isSellStatus(from) && TRANSITIONS[from].includes(to);

export const SELL_CURRENCIES = ['USD', 'AED', 'EUR', 'GBP'] as const;
export const SELL_CATEGORIES = ['Business', 'Technology', 'AI', 'Finance', 'Crypto', 'E-commerce', 'Real estate', 'Travel', 'Health', 'Media', 'Education', 'Gaming', 'Other'] as const;

/* ------------------------------------------------------------------ settings */
export interface SellConfig {
  enabled: boolean;
  /** fee amounts in USD (used for the conversion fallback and as the headline "Listing fee $15 · Featured +$50") */
  listingFeeUsd: number; featuredFeeUsd: number;
  /** WHMCS product ids of "Premium listing fee" and "Featured listing" (one-time, priced per currency). '' = fallback invoice */
  listingPid: string; featuredPid: string;
  /** our commission on a completed sale, percent of the sale price, deducted from the payout (owner: 15%; 0 = none, hidden) */
  commissionPct: number;
  /** minimum commission in USD (0 = no minimum) */
  commissionMinUsd: number;
  /** a domain must not expire within this many days to be listed (renew first) */
  minExpiryDays: number;
  /** tax the fallback invoice lines (WHMCS still applies tax only for taxable clients) */
  invoiceTaxed: boolean;
  refundPolicy: string;
  /** names containing these words are flagged for manual review (never auto-rejected) */
  trademarkTerms: string[];
  /** open listings per client */
  maxPerClient: number;
}

export const DEFAULT_REFUND_POLICY = 'If we do not approve your listing, we refund the listing fee (and the Featured upgrade, if paid) to your GlobalHostia account credit or original payment method within 10 business days. Fees are not refunded once a listing has been approved, or when you withdraw it, it sells, or it is removed because the domain left your account or expired.';
export const DEFAULT_TRADEMARKS = ['google', 'youtube', 'gmail', 'apple', 'iphone', 'amazon', 'facebook', 'instagram', 'whatsapp', 'meta', 'microsoft', 'windows', 'netflix', 'paypal', 'tesla', 'nike', 'adidas', 'visa', 'mastercard', 'samsung', 'sony', 'tiktok', 'openai', 'chatgpt', 'emirates', 'etisalat', 'emaar', 'noon', 'careem', 'talabat', 'binance', 'coinbase', 'rolex', 'gucci', 'cocacola', 'pepsi', 'disney', 'uber', 'airbnb'];

export const DEFAULT_SELL: SellConfig = {
  enabled: true, listingFeeUsd: 15, featuredFeeUsd: 50, listingPid: '', featuredPid: '', commissionPct: 15, commissionMinUsd: 0, minExpiryDays: 30,
  invoiceTaxed: true, refundPolicy: DEFAULT_REFUND_POLICY, trademarkTerms: DEFAULT_TRADEMARKS, maxPerClient: 25,
};

const num = (v: unknown, d: number, min: number, max: number) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const pid = (v: unknown) => { const s = String(v ?? '').trim(); return /^\d{1,9}$/.test(s) && s !== '0' ? s : ''; };
export const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');
const word = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);

export function normalizeSell(raw: unknown): SellConfig {
  let r: any = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  r = r && typeof r === 'object' ? r : {};
  const d = DEFAULT_SELL;
  const tm = Array.isArray(r.trademarkTerms) ? r.trademarkTerms : typeof r.trademarkTerms === 'string' ? r.trademarkTerms.split(/[\s,]+/) : d.trademarkTerms;
  return {
    enabled: r.enabled !== false,
    listingFeeUsd: num(r.listingFeeUsd, d.listingFeeUsd, 0, 10000), featuredFeeUsd: num(r.featuredFeeUsd, d.featuredFeeUsd, 0, 10000),
    listingPid: pid(r.listingPid), featuredPid: pid(r.featuredPid),
    commissionPct: num(r.commissionPct, d.commissionPct, 0, 50), commissionMinUsd: num(r.commissionMinUsd, 0, 0, 100000), minExpiryDays: Math.round(num(r.minExpiryDays, d.minExpiryDays, 0, 365)),
    invoiceTaxed: r.invoiceTaxed !== false,
    refundPolicy: txt(r.refundPolicy, 1500) || d.refundPolicy,
    trademarkTerms: [...new Set(tm.map((x: unknown) => word(String(x))).filter((x: string) => x.length >= 3))].slice(0, 300) as string[],
    maxPerClient: Math.round(num(r.maxPerClient, d.maxPerClient, 1, 500)),
  };
}

/* ------------------------------------------------------------------ fees and currency */
export type Rate = { id: number; code: string; rate: number; isDefault?: boolean };
/** GetCurrencies → rates relative to the WHMCS default currency (the default has rate 1). */
export function parseRates(json: any): Rate[] {
  const l = json?.currencies?.currency;
  const arr: any[] = Array.isArray(l) ? l : l ? [l] : [];
  return arr.map((c) => ({ id: Number(c.id), code: String(c.code || '').toUpperCase(), rate: parseFloat(String(c.rate ?? (Number(c.default) ? 1 : ''))) || (Number(c.default) ? 1 : 0), isDefault: Number(c.default) === 1 }))
    .filter((c) => c.id > 0 && /^[A-Z]{3}$/.test(c.code) && c.rate > 0);
}
/** Converted amounts are rounded to whole units (AED 55, EUR 14); USD keeps cents. Small amounts (< 10) keep cents. */
export const roundFee = (n: number, code: string) => (code === 'USD' || n < 10 ? Math.round(n * 100) / 100 : Math.round(n));
/** A USD amount in `code` using WHMCS rates (amount / rate(USD) × rate(code)). Null when either rate is unknown. */
export function convertUsd(usd: number, code: string, rates: Rate[]): number | null {
  if (!(usd >= 0)) return null;
  if (code === 'USD') return roundFee(usd, 'USD');
  const u = rates.find((r) => r.code === 'USD'), c = rates.find((r) => r.code === code);
  if (!u || !c) return null;
  return roundFee((usd / u.rate) * c.rate, code);
}

/** The one-time price of a WHMCS product in a currency (GetProducts pricing[code]: one-time products use `monthly`). */
export function productPrice(p: any, code: string): number | null {
  const pr = p?.pricing?.[code];
  if (!pr) return null;
  const v = parseFloat(String(pr.monthly ?? pr.onetime ?? ''));
  const setup = parseFloat(String(pr.msetupfee ?? '0'));
  return Number.isFinite(v) && v >= 0 ? Math.round((v + (setup > 0 ? setup : 0)) * 100) / 100 : null;
}

export type FeeQuote = {
  currency: string; listing: number; featured: number;
  /** order = AddOrder of the two WHMCS products (WHMCS prices); invoice = CreateInvoice with converted amounts */
  method: 'order' | 'invoice';
  usd: { listing: number; featured: number };
};
/**
 * Fees in the client's currency. With both product ids set and priced in that currency → `order` (WHMCS prices them).
 * Otherwise → `invoice` with the USD amounts converted by the WHMCS rates. Null when the currency cannot be priced.
 */
export function quoteFees(cfg: SellConfig, code: string, o: { rates: Rate[]; listingProduct?: any; featuredProduct?: any }): FeeQuote | null {
  const usd = { listing: cfg.listingFeeUsd, featured: cfg.featuredFeeUsd };
  if (cfg.listingPid && cfg.featuredPid) {
    const l = productPrice(o.listingProduct, code), f = productPrice(o.featuredProduct, code);
    if (l !== null && f !== null && l > 0) return { currency: code, listing: l, featured: f, method: 'order', usd };
  }
  const l = convertUsd(usd.listing, code, o.rates), f = convertUsd(usd.featured, code, o.rates);
  if (l === null || f === null) return null;
  return { currency: code, listing: l, featured: f, method: 'invoice', usd };
}
export const feeTotal = (q: FeeQuote, featured: boolean) => Math.round((q.listing + (featured ? q.featured : 0)) * 100) / 100;

/* ------------------------------------------------------------------ eligibility (WHMCS GetClientsDomains record) */
export type Eligibility =
  | { ok: true; code: 'ok'; domainId: number; days: number | null; expires: string }
  | { ok: false; code: 'not_found' | 'not_active' | 'expiring' | 'invalid'; domainId?: number; days?: number | null; status?: string; expires?: string };

const dayMs = 86400000;
export function daysLeft(expiry: unknown, now = Date.now()): number | null {
  const s = String(expiry || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) || /^0000/.test(s)) return null;
  return Math.ceil((Date.parse(s.slice(0, 10) + 'T00:00:00Z') - now) / dayMs) || 0;
}
/** Find `domain` in the client's own domains and check it can be listed. `list` must come from GetClientsDomains(clientid). */
export function eligibility(domain: string, list: any[], clientId: number, cfg: Pick<SellConfig, 'minExpiryDays'>, now = Date.now()): Eligibility {
  const d = cleanDomain(domain);
  if (!d) return { ok: false, code: 'invalid' };
  const rec = list.find((x) => String(x?.domainname || '').trim().toLowerCase() === d && (x.userid === undefined || Number(x.userid) === clientId));
  if (!rec) return { ok: false, code: 'not_found' };
  const id = Number(rec.id);
  const expires = String(rec.expirydate || rec.nextduedate || '');
  const days = daysLeft(expires, now);
  if (!/^active$/i.test(String(rec.status || ''))) return { ok: false, code: 'not_active', domainId: id, status: String(rec.status || ''), days, expires };
  if (days !== null && days < cfg.minExpiryDays) return { ok: false, code: 'expiring', domainId: id, days, expires };
  return { ok: true, code: 'ok', domainId: id, days, expires };
}

/** Daily re-check of a listed domain: keep, warn (expiring soon, still active) or hide (gone, not active, expired). */
export type Recheck = { action: 'keep' } | { action: 'warn'; days: number } | { action: 'hide'; reason: 'gone' | 'not_active' | 'expired'; status?: string };
export function recheck(domain: string, list: any[], clientId: number, cfg: Pick<SellConfig, 'minExpiryDays'>, now = Date.now()): Recheck {
  const e = eligibility(domain, list, clientId, cfg, now);
  if (e.ok) return { action: 'keep' };
  if (e.code === 'not_found' || e.code === 'invalid') return { action: 'hide', reason: 'gone' };
  if (e.code === 'not_active') return { action: 'hide', reason: /expired/i.test(e.status || '') ? 'expired' : 'not_active', status: e.status };
  // expiring but active: still in the account, so it stays listed; the seller is asked to renew
  return (e.days ?? 0) < 0 ? { action: 'hide', reason: 'expired' } : { action: 'warn', days: e.days ?? 0 };
}

/* ------------------------------------------------------------------ trademark screen */
/** Words from the admin list that appear in the name (letters only, hyphens ignored). Flags for manual review only. */
export function trademarkHits(domain: string, terms: string[]): string[] {
  const { sld } = splitDomain(domain);
  const flat = sld.replace(/[^a-z0-9]/g, '');
  return terms.filter((t) => t.length >= 3 && (flat === t || (t.length >= 4 && flat.includes(t)))).slice(0, 10);
}

/* ------------------------------------------------------------------ the seller's form */
export type SellForm = { domain: string; mode: 'price' | 'offer'; price: string; currency: string; minOffer: string; acceptOffers: boolean; description: string; category: string; tags: string; featured: boolean; terms: boolean };
export type SellValues = { domain: string; price: number | null; currency: string; minOffer: number | null; acceptOffers: boolean; description: string; category: string; tags: string[]; featured: boolean };
/** Error keys (the portal view translates them). */
export type SellErr = 'domain' | 'price' | 'price_range' | 'min_offer' | 'min_offer_high' | 'currency' | 'description' | 'category' | 'terms';

const money = (v: string) => { const s = v.replace(/[,\s]/g, ''); if (!s) return null; return /^\d{1,10}(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };
export const MIN_PRICE = 10, MAX_PRICE = 10_000_000;

export function readSellForm(get: (k: string) => string): SellForm {
  return {
    domain: get('domain').slice(0, 253), mode: get('mode') === 'offer' ? 'offer' : 'price', price: get('price').slice(0, 20), currency: get('currency').slice(0, 3).toUpperCase(),
    minOffer: get('min_offer').slice(0, 20), acceptOffers: get('accept_offers') === '1' || get('accept_offers') === 'on', description: get('description').slice(0, 2000),
    category: get('category').slice(0, 40), tags: get('tags').slice(0, 300), featured: get('featured') === '1' || get('featured') === 'on', terms: get('terms') === '1' || get('terms') === 'on',
  };
}

/** Server-side validation of the listing form. `edit` skips the domain and terms checks (they were done at creation). */
export function validateSell(f: SellForm, o: { edit?: boolean } = {}): { ok: true; v: SellValues } | { ok: false; errs: Partial<Record<SellErr, true>> } {
  const errs: Partial<Record<SellErr, true>> = {};
  const domain = o.edit ? f.domain : cleanDomain(f.domain) || '';
  if (!o.edit && !domain) errs.domain = true;
  const currency = (SELL_CURRENCIES as readonly string[]).includes(f.currency) ? f.currency : '';
  if (!currency) errs.currency = true;
  let price: number | null = null;
  if (f.mode === 'price') {
    const p = money(f.price);
    if (p === null || Number.isNaN(p)) errs.price = true;
    else if (p < MIN_PRICE || p > MAX_PRICE) errs.price_range = true;
    else price = p;
  }
  const mo = money(f.minOffer);
  let minOffer: number | null = null;
  if (mo !== null) {
    if (Number.isNaN(mo) || mo <= 0 || mo > MAX_PRICE) errs.min_offer = true;
    else if (price !== null && mo >= price) errs.min_offer_high = true;
    else minOffer = mo;
  }
  const description = txt(f.description.replace(/\r\n?/g, '\n'), 1200);
  if (/<[a-z/!]|https?:\/\/|www\./i.test(description)) errs.description = true;
  const category = (SELL_CATEGORIES as readonly string[]).includes(f.category) ? f.category : '';
  if (f.category && !category) errs.category = true;
  if (!o.edit && !f.terms) errs.terms = true;
  if (Object.keys(errs).length) return { ok: false, errs };
  const tags = [...new Set(f.tags.split(/[,;|]/).map((t) => txt(t, 24)).filter((t) => t && !/[<>]/.test(t)))].slice(0, 5);
  return { ok: true, v: { domain, price, currency, minOffer, acceptOffers: price === null ? true : f.acceptOffers, description, category, tags, featured: f.featured } };
}

/* ------------------------------------------------------------------ listing rows */
export type Listing = {
  id: string; ref: string; domain: string; clientId: number; whmcsDomainId: number | null; status: string;
  price: string | number | null; currency: string; minOffer: string | number | null; acceptOffers: boolean;
  description: string; category: string; tags: string[];
  featured: boolean; featuredState: string; featuredInvoiceId: number | null;
  invoiceId: number | null; orderId: number | null; feeMethod: string; feeAmount: string | number | null; feeCurrency: string; featuredFeeAmount: string | number | null;
  pending: { description?: string; category?: string; tags?: string[] } | null;
  flags: string[]; rejectReason: string; hiddenReason: string; adminNote: string;
  listedUntil?: Date | string | null; featuredUntil?: Date | string | null;
  renewInvoiceId?: number | null; renewState?: string; renewFeatured?: boolean; reminders?: string[];
  paidAt?: Date | string | null; approvedAt?: Date | string | null; lastCheckAt?: Date | string | null; warnedAt?: Date | string | null;
  createdAt?: Date | string | null; updatedAt?: Date | string | null;
};

/** What a seller may do with a listing right now (the portal shows only these; the POST handler re-checks). */
export function sellerActions(l: Pick<Listing, 'status' | 'featured' | 'featuredState' | 'invoiceId' | 'featuredInvoiceId' | 'listedUntil' | 'renewState' | 'renewInvoiceId'>, now = Date.now()) {
  const s = l.status;
  const left = l.listedUntil ? (new Date(l.listedUntil).getTime() - now) / dayMs : null;
  return {
    edit: ['draft', 'awaiting_payment', 'in_review', 'live', 'expired', 'suspended'].includes(s),
    pay: s === 'draft' || (s === 'awaiting_payment' && !l.invoiceId),
    invoice: s === 'awaiting_payment' && !!l.invoiceId,
    featured: s === 'live' && !l.featured && l.featuredState !== 'awaiting_payment' && (left === null || left > 1),
    // a separate Featured invoice only (when Featured is on the listing invoice, "Pay invoice" covers both)
    featuredInvoice: l.featuredState === 'awaiting_payment' && !!l.featuredInvoiceId && !(s === 'awaiting_payment' && l.featuredInvoiceId === l.invoiceId),
    renew: l.renewState !== 'awaiting_payment' && (s === 'expired' || (s === 'live' && left !== null && left <= RENEW_WINDOW_DAYS)),
    renewInvoice: l.renewState === 'awaiting_payment' && !!l.renewInvoiceId,
    withdraw: (OPEN_STATUSES as string[]).includes(s),
  };
}

/* ------------------------------------------------------------------ the one-year listing period */
/** Renewal opens this many days before listed_until (the first reminder goes out at 30). */
export const RENEW_WINDOW_DAYS = 45;
export const REMINDER_DAYS = [30, 7, 1] as const;
/** One calendar year later (29 Feb → 28 Feb). */
export function addYear(d: Date | string | number): Date {
  const x = new Date(d);
  const y = new Date(Date.UTC(x.getUTCFullYear() + 1, x.getUTCMonth(), x.getUTCDate(), x.getUTCHours(), x.getUTCMinutes(), x.getUTCSeconds()));
  if (y.getUTCMonth() !== x.getUTCMonth()) y.setUTCDate(0);
  return y;
}
/** A paid renewal: one more year from listed_until, or from now when it already ended. */
export const renewedUntil = (until: Date | string | null | undefined, now = Date.now()) => addYear(until && new Date(until).getTime() > now ? until : now);
/** The reminder due now (30 / 7 / 1 days before listed_until), once per period: key `${YYYY-MM-DD of until}:${days}`. */
export function reminderDue(until: Date | string | null | undefined, sent: string[] | undefined, now = Date.now()): { days: number; key: string } | null {
  if (!until) return null;
  const t = new Date(until).getTime();
  const left = (t - now) / dayMs;
  if (left <= 0) return null;
  const day = new Date(t).toISOString().slice(0, 10);
  // the smallest threshold already reached (a late run sends only the most urgent one)
  const hit = [...REMINDER_DAYS].reverse().find((n) => left <= n);
  if (hit === undefined) return null;
  const key = `${day}:${hit}`;
  return (sent || []).includes(key) ? null : { days: hit, key };
}
/** Featured counts only until featured_until (= listed_until). */
export const featuredNow = (l: Pick<Listing, 'featured' | 'featuredUntil'>, now = Date.now()) => !!l.featured && (!l.featuredUntil || new Date(l.featuredUntil).getTime() > now);
/** Is the paid year over? */
export const periodOver = (l: Pick<Listing, 'listedUntil'>, now = Date.now()) => !!l.listedUntil && new Date(l.listedUntil).getTime() <= now;

/** Which invoice lines a listing needs: a draft → listing (+ Featured when requested); renewal → listing (+ Featured). */
export type LineKind = 'listing' | 'featured' | 'renew' | 'renew_featured';
export function linesFor(l: Pick<Listing, 'status' | 'featuredState' | 'featured' | 'featuredUntil' | 'listedUntil'>, o: { renew?: boolean; featured?: boolean; featuredOnly?: boolean } = {}): LineKind[] {
  if (o.featuredOnly) return ['featured'];
  if (o.renew) return o.featured ? ['renew', 'renew_featured'] : ['renew'];
  return l.featuredState === 'requested' ? ['listing', 'featured'] : ['listing'];
}

/** Apply seller edits: offer terms at once; text of a live listing becomes pending (review). Returns the DB patch. */
export function editPatch(l: Pick<Listing, 'status' | 'description' | 'category' | 'tags' | 'pending'>, v: Omit<SellValues, 'domain' | 'featured'>) {
  const patch: Record<string, unknown> = {
    price: v.price === null ? null : v.price.toFixed(2), currency: v.currency, minOffer: v.minOffer === null ? null : v.minOffer.toFixed(2), acceptOffers: v.acceptOffers,
  };
  const textChanged = v.description !== l.description || v.category !== l.category || JSON.stringify(v.tags) !== JSON.stringify(l.tags || []);
  let review = false;
  if (l.status === 'live' || l.status === 'suspended' || l.status === 'expired') {
    if (textChanged) { patch.pending = { description: v.description, category: v.category, tags: v.tags }; review = true; }
    else if (l.pending) patch.pending = null;
  } else Object.assign(patch, { description: v.description, category: v.category, tags: v.tags, pending: null });
  return { patch, review };
}

/** A live listing as a premium_domains-shaped row (lib/premium/core.ts mergeItems): brokered, never the seller's identity. */
export function toOwnRow(l: Pick<Listing, 'domain' | 'price' | 'currency' | 'acceptOffers' | 'minOffer' | 'tags' | 'category' | 'description' | 'featured' | 'featuredUntil' | 'updatedAt'>, now = Date.now()) {
  const price = l.price === null || l.price === '' ? null : Number(l.price);
  return {
    domain: l.domain, price: price && price > 0 ? price : null, currency: l.currency || 'USD', makeOffer: !!l.acceptOffers || !(price && price > 0),
    minOffer: l.minOffer ? Number(l.minOffer) : null, tags: [...(l.category && l.category !== 'Other' ? [l.category] : []), ...(l.tags || [])].slice(0, 6),
    description: l.description || '', status: 'for_sale', owned: false, featured: featuredNow(l, now), updatedAt: l.updatedAt ?? null,
  };
}

/** Commission text for sellers ("15% commission when your domain sells, deducted from the payout"); '' when none. */
export const commissionOf = (price: number, cfg: Pick<SellConfig, 'commissionPct' | 'commissionMinUsd'>) =>
  cfg.commissionPct > 0 ? Math.round(Math.max((price * cfg.commissionPct) / 100, cfg.commissionMinUsd) * 100) / 100 : 0;

/** SL-XXXXXXX reference shown to the seller and the admin. */
export const sellRef = (rand: string) => 'SL-' + rand.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7).padEnd(7, '0');

/** Invoice status from GetInvoice → paid | cancelled | unpaid. */
export const invoiceState = (inv: any): 'paid' | 'cancelled' | 'unpaid' | 'unknown' => {
  const s = String(inv?.status || '').toLowerCase();
  return s === 'paid' ? 'paid' : s === 'cancelled' || s === 'refunded' || s === 'collections' ? 'cancelled' : s === 'unpaid' || s === 'draft' || s === 'payment pending' ? 'unpaid' : 'unknown';
};

/** The cart link for moving a domain into GlobalHostia (WHMCS transfer flow). */
export const transferUrl = (base: string, domain: string) => `${base.replace(/\/$/, '')}/cart.php?a=add&domain=transfer&query=${encodeURIComponent(domain)}`;

/* ------------------------------------------------------------------ emails (plain, escaped; WHMCS wraps them in the brand template) */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const p = (s: string) => `<p>${s}</p>`;
export type Mail = { subject: string; html: string };
export function sellerMail(kind: 'approved' | 'rejected' | 'hidden' | 'expiring' | 'request' | 'featured' | 'sold' | 'renew' | 'ended' | 'renewed', l: Pick<Listing, 'domain' | 'ref'> & { id?: string }, o: { site: string; reason?: string; refund?: string; days?: number; intent?: 'buy' | 'offer'; amount?: string; commission?: number; until?: string; fee?: string } = { site: '' }): Mail {
  const d = esc(l.domain), ref = esc(l.ref), link = `${o.site.replace(/\/$/, '')}/account/sell`;
  const renewLink = `${link}${l.id ? `/${encodeURIComponent(l.id)}` : ''}#renew`;
  const renewBtn = `<p><a href="${esc(renewLink)}"><b>Renew listing${o.fee ? ` (${esc(o.fee)})` : ''}</b></a></p>`;
  const btn = `<p><a href="${esc(link)}">Open your listings</a></p>`;
  switch (kind) {
    case 'approved': return { subject: `Your listing ${l.domain} is live`, html: p(`Good news: <b>${d}</b> (listing ${ref}) is approved and now listed in the GlobalHostia premium domains marketplace.`) + p('Keep the domain in your GlobalHostia account and renewed while it is listed. We email you when a buyer is interested.') + btn };
    case 'rejected': return { subject: `Your listing ${l.domain} was not approved`, html: p(`We reviewed <b>${d}</b> (listing ${ref}) and cannot list it.`) + (o.reason ? p(`Reason: ${esc(o.reason)}`) : '') + (o.refund ? p(esc(o.refund)) : '') + p('Reply to this email or open a ticket if you have questions.') + btn };
    case 'hidden': return { subject: `Your listing ${l.domain} is hidden`, html: p(`We hid <b>${d}</b> (listing ${ref}) from the marketplace because ${o.reason === 'gone' ? 'the domain is no longer in your GlobalHostia account' : o.reason === 'expired' ? 'the domain has expired' : 'the domain is no longer active in your account'}.`) + p('Domains can only be listed while they are registered with GlobalHostia and active. If this is a mistake, renew or transfer the domain back and contact us to restore the listing.') + btn };
    case 'expiring': return { subject: `Renew ${l.domain} to keep it listed`, html: p(`<b>${d}</b> (listing ${ref}) expires in ${o.days ?? 0} days. Renew it to keep the listing live; expired domains are removed from the marketplace.`) + btn };
    case 'request': return { subject: `A buyer is interested in ${l.domain}`, html: p(`A buyer sent ${o.intent === 'offer' ? `an offer${o.amount ? ` of <b>${esc(o.amount)}</b>` : ''}` : `a Buy now request${o.amount ? ` at <b>${esc(o.amount)}</b>` : ''}`} for <b>${d}</b> (listing ${ref}).`) + p('Our broker team confirms the buyer and handles the payment through escrow and the move of the domain between GlobalHostia accounts. We contact you before anything changes; the buyer\'s identity is shared only once a deal is agreed.') + (o.commission ? p(`When the sale completes, our ${o.commission}% commission is deducted from your payout.`) : '') + p('Please keep the domain in your account and do not transfer it elsewhere while we work on the sale.') + btn };
    case 'featured': return { subject: `${l.domain} is now featured`, html: p(`<b>${d}</b> (listing ${ref}) is now featured: it is shown first in the marketplace and in the premium domains row on our homepage.`) + btn };
    case 'renew': return { subject: `Renew your listing ${l.domain}: ${o.days} ${o.days === 1 ? 'day' : 'days'} left`, html: p(`The listing for <b>${d}</b> (${ref}) ends on <b>${esc(o.until || '')}</b>. Renew it for another year to keep it in the marketplace${o.fee ? ` for ${esc(o.fee)}` : ''}.`) + p('Renewing creates an invoice in your GlobalHostia account; once it is paid the listing continues without a new review.') + renewBtn };
    case 'ended': return { subject: `Your listing ${l.domain} has ended`, html: p(`The one-year listing for <b>${d}</b> (${ref}) ended and the domain is no longer shown in the marketplace.`) + p('Renew the listing to show it again; it goes live as soon as the renewal invoice is paid.') + renewBtn };
    case 'renewed': return { subject: `Your listing ${l.domain} is renewed`, html: p(`Thank you: <b>${d}</b> (${ref}) is listed until <b>${esc(o.until || '')}</b>.`) + btn };
    case 'sold': return { subject: `${l.domain} is marked as sold`, html: p(`Listing ${ref} for <b>${d}</b> is closed as sold. Thank you for selling with GlobalHostia.`) + btn };
  }
}

/* ================================================================== the flow (WHMCS side, injected dependencies) */
// Seller listings: the WHMCS side of the flow, with injected dependencies (no server imports) so the integration test
// drives it against tests/mock-whmcs.mjs. lib/sell/store.ts binds the real WHMCS client, the database and email.
//
//   createFeeInvoice  one invoice for one or more listings of one client, one line per domain (+ one per Featured):
//                     AddOrder of the two WHMCS products (WHMCS prices them in the client's currency, noemail=false so
//                     WHMCS sends the order and invoice emails) or, when the product ids are not set or not priced in that
//                     currency, CreateInvoice with the USD fees converted by the WHMCS rates. Also renewals and Featured.
//   invoicePaid       webhook InvoicePaid (verified with GetInvoice) → in_review / renewed / featured
//   pollPayments      fallback for a missed webhook: GetInvoice for every open fee invoice
//   approve           admin: in_review → live, listed for one year from now (Featured until the same date)
//   dailyCheck        domain still Active in the seller's account? listing year over? reminders 30/7/1 days before
// Never refunds: a cancelled or refunded invoice only moves the listing back (draft / no renewal / no Featured).

export type Call = <T = any>(action: string, params?: Record<string, string | number | boolean | undefined>) => Promise<T>;
export interface SellStore {
  get(id: string): Promise<Listing | null>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  /** listings whose listing, featured or renewal invoice is `invoiceId` */
  byInvoice(invoiceId: number): Promise<Listing[]>;
  /** listings with an open fee invoice (listing, featured or renewal) */
  awaitingPayment(limit: number): Promise<Listing[]>;
  /** listings the daily check covers (in_review, live, expired) */
  forCheck(limit: number): Promise<Listing[]>;
}
export interface SellDeps {
  call: Call;
  store: SellStore;
  cfg: SellConfig;
  site: string;
  /** email the seller (WHMCS SendEmail to their own client account) */
  mailClient?: (clientId: number, m: Mail) => Promise<void>;
  /** email the owner/admin */
  mailOwner?: (subject: string, html: string) => Promise<void>;
  audit?: (action: string, l: Pick<Listing, 'id' | 'domain' | 'ref'>, detail?: Record<string, unknown>) => Promise<void>;
  now?: () => number;
  log?: (m: string) => void;
}

const arr = <T = any>(v: any): T[] => (Array.isArray(v) ? v : v ? [v] : []);
export class SellError extends Error {
  code: 'currency' | 'payment' | 'whmcs' | 'state';
  constructor(message: string, code: 'currency' | 'payment' | 'whmcs' | 'state' = 'whmcs') { super(message); this.code = code; }
}

/** Client currency code (GetClientsDetails), WHMCS rates and, when configured, the two fee products → the fee quote. */
export async function feeContext(call: Call, cfg: SellConfig, clientId: number) {
  const c = await call('GetClientsDetails', { clientid: clientId });
  const cl = c.client ?? c;
  if (Number(cl.id ?? cl.userid ?? clientId) !== clientId) throw new SellError('Client mismatch');
  const rates: Rate[] = parseRates(await call('GetCurrencies'));
  const code = String(cl.currency_code || rates.find((r) => r.id === Number(cl.currency))?.code || rates.find((r) => r.isDefault)?.code || 'USD').toUpperCase();
  let listingProduct: any, featuredProduct: any;
  if (cfg.listingPid && cfg.featuredPid) {
    const [a, b] = await Promise.all([call('GetProducts', { pid: cfg.listingPid }), call('GetProducts', { pid: cfg.featuredPid })]);
    listingProduct = arr(a.products?.product).find((p) => String(p.pid) === cfg.listingPid);
    featuredProduct = arr(b.products?.product).find((p) => String(p.pid) === cfg.featuredPid);
  }
  const quote = quoteFees(cfg, code, { rates, listingProduct, featuredProduct });
  return { code, client: cl, quote };
}

/** The client's default payment gateway when it is active, else the first active gateway (AddOrder/CreateInvoice need one). */
async function paymentMethod(call: Call, client: any): Promise<string> {
  const r = await call('GetPaymentMethods');
  const list = arr(r.paymentmethods?.paymentmethod).map((m) => String(m.module || '')).filter(Boolean);
  const pref = String(client.defaultgateway || '');
  const pick = pref && list.includes(pref) ? pref : list[0];
  if (!pick) throw new SellError('No payment method is active in WHMCS', 'payment');
  return pick;
}

export type InvoiceItem = { l: Listing; kinds: LineKind[] };

/** Can these lines be invoiced for this listing now? (re-checked on every request) */
export function lineAllowed(l: Listing, k: LineKind, now = Date.now()): boolean {
  const a = sellerActions(l, now);
  if (k === 'listing') return canMove(l.status, 'awaiting_payment') && !(l.status === 'awaiting_payment' && l.invoiceId);
  if (k === 'featured') return (l.status === 'draft' && l.featuredState === 'requested') || a.featured;
  return a.renew; // renew, renew_featured
}

/**
 * One fee invoice for several listings of ONE client: a line per domain (and per Featured upgrade). Sent exactly once
 * (write actions are never retried). Updates every listing with the invoice id; returns the invoice and the total.
 */
export async function createFeeInvoice(d: SellDeps, clientId: number, items: InvoiceItem[]): Promise<{ invoiceId: number; orderId: number | null; quote: FeeQuote; total: number; lines: number }> {
  const now = d.now?.() ?? Date.now();
  if (!items.length) throw new SellError('Nothing to invoice', 'state');
  for (const it of items) {
    if (it.l.clientId !== clientId) throw new SellError('Listing belongs to another client', 'state');
    for (const k of it.kinds) if (!lineAllowed(it.l, k, now)) throw new SellError(`${it.l.domain}: ${k} cannot be invoiced in status ${it.l.status}`, 'state');
  }
  const { quote, client } = await feeContext(d.call, d.cfg, clientId);
  if (!quote) throw new SellError('Fees cannot be priced in this account currency', 'currency');
  const gateway = await paymentMethod(d.call, client);
  const isFeat = (k: LineKind) => k === 'featured' || k === 'renew_featured';
  const lines = items.flatMap((it) => it.kinds.map((k) => ({ l: it.l, k, amount: isFeat(k) ? quote.featured : quote.listing })));
  const total = Math.round(lines.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  let invoiceId = 0, orderId: number | null = null;
  if (quote.method === 'order') {
    const p: Record<string, string | number | boolean> = { clientid: clientId, paymentmethod: gateway, noemail: false, noinvoice: false, noinvoiceemail: false };
    lines.forEach((x, i) => { p[`pid[${i}]`] = isFeat(x.k) ? d.cfg.featuredPid : d.cfg.listingPid; p[`domain[${i}]`] = x.l.domain; p[`billingcycle[${i}]`] = 'onetime'; });
    const r = await d.call('AddOrder', p);
    invoiceId = Number(r.invoiceid) || 0; orderId = Number(r.orderid) || null;
  } else {
    const p: Record<string, string | number | boolean> = { userid: clientId, status: 'Unpaid', sendinvoice: true, paymentmethod: gateway, date: new Date(now).toISOString().slice(0, 10), duedate: new Date(now).toISOString().slice(0, 10) };
    const label: Record<LineKind, string> = { listing: 'Premium domain listing fee (1 year)', featured: 'Featured listing upgrade', renew: 'Premium domain listing renewal (1 year)', renew_featured: 'Featured listing renewal (1 year)' };
    lines.forEach((x, i) => { p[`itemdescription${i + 1}`] = `${label[x.k]}: ${x.l.domain} (listing ${x.l.ref})`; p[`itemamount${i + 1}`] = x.amount.toFixed(2); p[`itemtaxed${i + 1}`] = d.cfg.invoiceTaxed; });
    const r = await d.call('CreateInvoice', p);
    invoiceId = Number(r.invoiceid) || 0;
  }
  if (!invoiceId) throw new SellError('WHMCS did not return an invoice');
  for (const it of items) {
    const patch: Record<string, unknown> = { feeMethod: quote.method, feeCurrency: quote.currency, updatedAt: new Date(now) };
    for (const k of it.kinds) {
      if (k === 'listing') Object.assign(patch, { status: 'awaiting_payment', invoiceId, orderId, feeAmount: quote.listing.toFixed(2) });
      if (k === 'featured') Object.assign(patch, { featuredState: 'awaiting_payment', featuredInvoiceId: invoiceId, featuredFeeAmount: quote.featured.toFixed(2) });
      if (k === 'renew') Object.assign(patch, { renewState: 'awaiting_payment', renewInvoiceId: invoiceId, renewFeatured: false });
      if (k === 'renew_featured') patch.renewFeatured = true;
    }
    await d.store.update(it.l.id, patch);
    await d.audit?.('seller_listing_invoice', it.l, { invoiceId, orderId, method: quote.method, currency: quote.currency, lines: it.kinds, total });
  }
  return { invoiceId, orderId, quote, total, lines: lines.length };
}

/** Apply a paid / cancelled invoice to its listings. Idempotent; returns how many listings changed. */
async function applyInvoice(d: SellDeps, inv: any, list: Listing[]): Promise<number> {
  const id = Number(inv.invoiceid ?? inv.id);
  const st = invoiceState(inv);
  const now = d.now?.() ?? Date.now();
  let n = 0;
  for (const l of list) {
    if (Number(inv.userid) && Number(inv.userid) !== l.clientId) { d.log?.(`invoice ${id} belongs to another client than ${l.ref}`); continue; }
    const patch: Record<string, unknown> = {};
    let renewed: Date | null = null;
    if (st === 'paid') {
      if (l.invoiceId === id && l.status === 'awaiting_payment') Object.assign(patch, { status: 'in_review', paidAt: new Date(now) });
      if (l.featuredInvoiceId === id && l.featuredState === 'awaiting_payment') {
        patch.featuredState = 'paid';
        // Featured shows at once on a live listing, until the end of its listing year; on a new listing it starts at approval
        if (l.status === 'live') Object.assign(patch, { featured: true, featuredUntil: l.listedUntil ?? addYear(now) });
      }
      if (l.renewInvoiceId === id && l.renewState === 'awaiting_payment') {
        renewed = renewedUntil(l.listedUntil, now);
        Object.assign(patch, { renewState: '', listedUntil: renewed, renewFeatured: false });
        if (l.renewFeatured) Object.assign(patch, { featured: true, featuredState: 'paid', featuredUntil: renewed });
        else if (!featuredNow(l, now)) patch.featured = false;
        // back online without review, unless text changes are waiting for review
        if (l.status === 'expired') patch.status = l.pending ? 'in_review' : 'live';
      }
    } else if (st === 'cancelled') {
      if (l.invoiceId === id && l.status === 'awaiting_payment') Object.assign(patch, { status: 'draft', invoiceId: null, orderId: null, ...(l.featuredInvoiceId === id ? { featuredState: 'requested', featuredInvoiceId: null } : {}) });
      else if (l.featuredInvoiceId === id && l.featuredState === 'awaiting_payment') Object.assign(patch, { featuredState: '', featuredInvoiceId: null });
      if (l.renewInvoiceId === id && l.renewState === 'awaiting_payment') Object.assign(patch, { renewState: '', renewInvoiceId: null, renewFeatured: false });
    }
    if (!Object.keys(patch).length) continue;
    await d.store.update(l.id, { ...patch, updatedAt: new Date(now) });
    await d.audit?.(st === 'paid' ? 'seller_listing_paid' : 'seller_listing_invoice_cancelled', l, { invoiceId: id, ...patch });
    n++;
    if (st === 'paid' && patch.status === 'in_review') {
      await d.mailOwner?.(`Seller listing to review: ${l.domain}`, `<p>${l.renewInvoiceId === id ? 'A renewal' : 'The listing fee'} for <b>${l.domain}</b> (${l.ref}, client #${l.clientId}) is paid. Review it in Admin → Premium domains → Seller submissions.</p><p><a href="${d.site.replace(/\/$/, '')}/admin/premium-domains/sellers?id=${encodeURIComponent(l.id)}">Open the listing</a></p>`).catch(() => {});
    }
    if (renewed) await d.mailClient?.(l.clientId, sellerMail('renewed', l, { site: d.site, until: renewed.toISOString().slice(0, 10) })).catch(() => {});
    else if (st === 'paid' && patch.featured) await d.mailClient?.(l.clientId, sellerMail('featured', l, { site: d.site })).catch(() => {});
  }
  return n;
}

/** Signed InvoicePaid webhook: verify the invoice with WHMCS (never trust the event alone), then apply it. */
export async function invoicePaid(d: SellDeps, invoiceId: number): Promise<number> {
  const list = await d.store.byInvoice(invoiceId);
  if (!list.length) return 0;
  const inv = await d.call('GetInvoice', { invoiceid: invoiceId });
  return applyInvoice(d, inv, list);
}

/** Fallback poll (cron, WHMCS tick, the seller opening /account/sell): every open fee invoice, read-only. */
export async function pollPayments(d: SellDeps, o: { limit?: number; only?: Listing[] } = {}): Promise<{ checked: number; changed: number; errors: number }> {
  const list = o.only ?? await d.store.awaitingPayment(o.limit ?? 60);
  const ids = new Map<number, Listing[]>();
  for (const l of list) {
    for (const id of [l.status === 'awaiting_payment' ? l.invoiceId : null, l.featuredState === 'awaiting_payment' ? l.featuredInvoiceId : null, l.renewState === 'awaiting_payment' ? l.renewInvoiceId : null]) {
      if (!id) continue;
      const a = ids.get(id) || [];
      if (!a.includes(l)) a.push(l);
      ids.set(id, a);
    }
  }
  let changed = 0, errors = 0;
  for (const [id, ls] of ids) {
    try { changed += await applyInvoice(d, await d.call('GetInvoice', { invoiceid: id }), ls); }
    catch (e: any) { errors++; d.log?.(`GetInvoice ${id}: ${e?.message || e}`); }
  }
  return { checked: ids.size, changed, errors };
}

/** Admin approval: live for one year from now; a paid Featured upgrade runs until the same date. */
export function approvePatch(l: Listing, who: string, now = Date.now()) {
  if (!canMove(l.status, 'live')) throw new SellError(`Cannot approve a listing in status ${l.status}`, 'state');
  const until = l.listedUntil && new Date(l.listedUntil).getTime() > now ? new Date(l.listedUntil) : addYear(now);
  const feat = l.featuredState === 'paid';
  const patch: Record<string, unknown> = { status: 'live', approvedAt: new Date(now), approvedBy: who, listedUntil: until, featured: feat || featuredNow(l, now), featuredUntil: feat ? until : l.featuredUntil ?? null, rejectReason: '', hiddenReason: '', updatedAt: new Date(now) };
  if (l.pending) Object.assign(patch, { description: l.pending.description ?? l.description, category: l.pending.category ?? l.category, tags: l.pending.tags ?? l.tags, pending: null });
  return patch;
}

/**
 * Daily: every in-review / live / expired listing's domain must still be in the seller's account, Active, and not expired.
 * Hide (suspended) + email the seller + admin note when not; warn weekly when the domain expires within minExpiryDays.
 * Live listings whose paid year is over → expired (hidden, email with the renew link); 30/7/1 days before → reminder.
 * A WHMCS error for a client never hides anything (only a successful read can).
 */
export async function dailyCheck(d: SellDeps, o: { limit?: number } = {}): Promise<{ checked: number; hidden: number; warned: number; ended: number; reminded: number; errors: number }> {
  const list = await d.store.forCheck(o.limit ?? 500);
  const byClient = new Map<number, Listing[]>();
  for (const l of list) byClient.set(l.clientId, [...(byClient.get(l.clientId) || []), l]);
  const now = d.now?.() ?? Date.now();
  const res = { checked: 0, hidden: 0, warned: 0, ended: 0, reminded: 0, errors: 0 };
  for (const [cid, ls] of byClient) {
    let domains: any[];
    try {
      const r = await d.call('GetClientsDomains', { clientid: cid, limitnum: 250 });
      domains = arr(r.domains?.domain).filter((x) => x.userid === undefined || Number(x.userid) === cid);
    } catch (e: any) { res.errors++; d.log?.(`GetClientsDomains ${cid}: ${e?.message || e}`); continue; }
    // renewal fee in the seller's currency for the reminder emails (best effort; the link works without it)
    let fee: string | undefined;
    const fmt = (n: number, c: string) => (c === 'USD' ? `$${n % 1 ? n.toFixed(2) : n}` : `${c} ${n % 1 ? n.toFixed(2) : n}`);
    const feeText = async () => {
      if (fee !== undefined) return fee;
      try { const q = (await feeContext(d.call, d.cfg, cid)).quote; fee = q ? fmt(q.listing, q.currency) : ''; } catch { fee = ''; }
      return fee;
    };
    for (const l of ls) {
      res.checked++;
      const r = recheck(l.domain, domains, cid, d.cfg, now);
      const base: Record<string, unknown> = { lastCheckAt: new Date(now) };
      if (r.action === 'hide' && canMove(l.status, 'suspended')) {
        const note = `Hidden by the daily check on ${new Date(now).toISOString().slice(0, 10)}: ${r.reason === 'gone' ? 'domain no longer in the seller account' : r.reason === 'expired' ? 'domain expired' : `domain status ${r.status || 'not active'}`}.`;
        await d.store.update(l.id, { ...base, status: 'suspended', featured: false, hiddenReason: r.reason, adminNote: [l.adminNote, note].filter(Boolean).join('\n').slice(-2000), updatedAt: new Date(now) });
        await d.audit?.('seller_listing_hidden', l, { reason: r.reason, status: r.status, was: l.status });
        await d.mailClient?.(cid, sellerMail('hidden', l, { site: d.site, reason: r.reason })).catch(() => {});
        await d.mailOwner?.(`Seller listing hidden: ${l.domain}`, `<p>${l.domain} (${l.ref}, client #${cid}) was hidden from the marketplace. ${note}</p>`).catch(() => {});
        res.hidden++;
        continue;
      }
      if (r.action === 'warn') {
        const last = l.warnedAt ? new Date(l.warnedAt).getTime() : 0;
        if (now - last > 7 * 86400000) {
          await d.mailClient?.(cid, sellerMail('expiring', l, { site: d.site, days: r.days })).catch(() => {});
          base.warnedAt = new Date(now);
          res.warned++;
        }
      }
      if (l.featured && !featuredNow(l, now)) base.featured = false;
      if (l.status === 'live' && periodOver(l, now)) {
        Object.assign(base, { status: 'expired', featured: false, updatedAt: new Date(now) });
        await d.store.update(l.id, base);
        await d.audit?.('seller_listing_ended', l, { listedUntil: l.listedUntil });
        await d.mailClient?.(cid, sellerMail('ended', l, { site: d.site, fee: (await feeText()) || undefined })).catch(() => {});
        res.ended++;
        continue;
      }
      if (l.status === 'live' && l.renewState !== 'awaiting_payment') {
        const due = reminderDue(l.listedUntil, l.reminders, now);
        if (due) {
          await d.mailClient?.(cid, sellerMail('renew', l, { site: d.site, days: due.days, until: new Date(l.listedUntil!).toISOString().slice(0, 10), fee: (await feeText()) || undefined })).catch(() => {});
          base.reminders = [...(l.reminders || []), due.key].slice(-12);
          res.reminded++;
        }
      }
      await d.store.update(l.id, base);
    }
  }
  return res;
}
