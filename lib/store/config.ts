// Business services shop (/business-services): the admin-managed config in settings.business_services
// (Admin → Business services) plus the pure rules around it: WHMCS product group mapping, bundle totals and the
// quote form. No imports, so the theme, the WHMCS sync, the admin, the agent catalog and the unit tests can all use it.
// Category names, intro text and SEO fields live on the categories rows (Admin → Categories); prices only ever come
// from product_prices / tlds (synced from WHMCS). Nothing here invents a price or a discount.

export const HUB_PATH = '/business-services';
/** Alternative URLs that 301 to the hub (app/[[...slug]]/route.ts). */
export const ALIAS_PATHS = ['/store', '/business-service'];
export const STORE_KINDS = ['whmcs', 'service'] as const;
export type StoreKind = (typeof STORE_KINDS)[number];
export type StoreFaq = { q: string; a: string };

/** One shop category. `slug` is the categories row; `section` is the slug of its section row. */
export type StoreEntry = {
  slug: string; section: string;
  /** whmcs: sold through WHMCS products (shows "coming soon / contact sales" until priced products exist);
   *  service: done-for-you work, quoted by the sales team until a WHMCS product is linked to the category */
  kind: StoreKind;
  icon: string;
  /** WHMCS product group names or store-URL slugs that belong here, matched case-insensitively (MarketConnect: "SiteLock"…) */
  groups: string[];
  /** short card text; falls back to the category description */
  blurb: string;
  /** what the customer gets, one line each (no prices) */
  included: string[];
  faq: StoreFaq[];
  /** quote form: package choices and extra questions */
  options: string[]; questions: string[];
  hidden: boolean; order: number;
};
export type StoreSection = { slug: string; icon: string; order: number };
/** items: "p:<product slug>" | "cat:<category slug>" (cheapest priced plan) | "tld:.ae" (domain registration, 1 year) */
export type StoreBundle = { slug: string; name: string; summary: string; items: string[]; whmcsBundleId: number | null; published: boolean; order: number };
export type StoreConfig = {
  /** master switch: hub, category pages, menu entry and sitemap entries only exist when on */
  published: boolean;
  title: string; lead: string; seoTitle: string; meta: string;
  menuLabel: string; inNav: boolean;
  /** WHMCS support department for quote requests ('' = the first department named like "Sales") */
  salesDepartmentId: string;
  faq: StoreFaq[];
  sections: StoreSection[]; entries: StoreEntry[]; bundles: StoreBundle[];
};

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const list = (v: unknown, max = 12, len = 300) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, max) : []);
const num = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : d; };
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON = /^[a-z0-9-]{1,24}$/;
const faqs = (v: unknown, max = 12) => (Array.isArray(v) ? v.map((f) => ({ q: str(obj(f).q, 300), a: str(obj(f).a, 1500) })).filter((f) => f.q && f.a).slice(0, max) : []);
export const ITEM_REF = /^(p|cat):[a-z0-9]+(?:-[a-z0-9]+)*$|^tld:\.[a-z0-9]+(?:\.[a-z0-9]+)*$/;

/** settings.business_services (object or JSON string), validated. Never throws; missing or broken = empty, unpublished. */
export function parseStoreConfig(raw: unknown): StoreConfig {
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const r = obj(raw);
  const sections = (Array.isArray(r.sections) ? r.sections : []).map((x: unknown, i: number) => {
    const s = obj(x);
    return { slug: str(s.slug, 80), icon: ICON.test(str(s.icon, 24)) ? str(s.icon, 24) : 'box', order: num(s.order, i) };
  }).filter((s: StoreSection) => SLUG.test(s.slug));
  const seen = new Set<string>();
  const entries = (Array.isArray(r.entries) ? r.entries : []).map((x: unknown, i: number) => {
    const e = obj(x);
    return {
      slug: str(e.slug, 80), section: str(e.section, 80),
      kind: (STORE_KINDS as readonly string[]).includes(e.kind) ? e.kind as StoreKind : 'whmcs',
      icon: ICON.test(str(e.icon, 24)) ? str(e.icon, 24) : 'box',
      groups: list(e.groups, 12, 80), blurb: str(e.blurb, 200), included: list(e.included, 10, 200), faq: faqs(e.faq),
      options: list(e.options, 8, 80), questions: list(e.questions, 4, 160),
      hidden: e.hidden === true, order: num(e.order, i),
    };
  }).filter((e: StoreEntry) => SLUG.test(e.slug) && !seen.has(e.slug) && (seen.add(e.slug), true));
  const bseen = new Set<string>();
  const bundles = (Array.isArray(r.bundles) ? r.bundles : []).map((x: unknown, i: number) => {
    const b = obj(x);
    const bid = num(b.whmcsBundleId, 0);
    return { slug: str(b.slug, 80), name: str(b.name, 100), summary: str(b.summary, 300), items: list(b.items, 8, 90).map((t) => t.toLowerCase()).filter((t) => ITEM_REF.test(t)),
      whmcsBundleId: bid > 0 ? bid : null, published: b.published !== false, order: num(b.order, i) };
  }).filter((b: StoreBundle) => SLUG.test(b.slug) && b.name && b.items.length >= 2 && !bseen.has(b.slug) && (bseen.add(b.slug), true));
  const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;
  return {
    published: r.published === true,
    title: str(r.title, 120) || 'Business services', lead: str(r.lead, 400), seoTitle: str(r.seoTitle, 120), meta: str(r.meta, 300),
    menuLabel: str(r.menuLabel, 40) || 'Business services', inNav: r.inNav !== false,
    salesDepartmentId: /^\d{1,6}$/.test(str(r.salesDepartmentId, 10)) ? str(r.salesDepartmentId, 10) : '',
    faq: faqs(r.faq), sections: sections.sort(byOrder), entries: entries.sort(byOrder), bundles: bundles.sort(byOrder),
  };
}

/** Category slugs the shop owns (its own pages), i.e. entries and section rows. */
export function storeSlugs(cfg: StoreConfig): Set<string> {
  return new Set([...cfg.entries.map((e) => e.slug), ...cfg.sections.map((s) => s.slug)]);
}
export const entryFor = (cfg: StoreConfig, slug: string) => cfg.entries.find((e) => e.slug === slug);
export const entryPath = (slug: string) => `${HUB_PATH}/${slug}`;
export const sectionAnchor = (slug: string) => `${HUB_PATH}#${slug}`;

/* ------------------------------------------------------------------ WHMCS product group mapping */
/** "SSL Certificates", "ssl-certificates", "SSL_certificates" → "sslcertificates"; "E-mail & Spam" → "emailandspam". */
export const normGroup = (s: string) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/e-mail/g, 'email').replace(/[^a-z0-9]+/g, '');
/** Store group slug of a WHMCS product URL (…/store/<group>/<product>). */
export const groupSlugFromUrl = (u?: string | null) => String(u || '').match(/\/store\/([\w-]+)\//)?.[1] || '';

/** The shop entry a WHMCS product group belongs to (by its store slug or name), or null. Entry slugs match too. */
export function matchEntry(cfg: Pick<StoreConfig, 'entries'>, group: { slug?: string; name?: string }): StoreEntry | null {
  const keys = [group.slug, group.name].map((x) => normGroup(x || '')).filter(Boolean);
  if (!keys.length) return null;
  return cfg.entries.find((e) => [e.slug, ...e.groups].some((g) => keys.includes(normGroup(g)))) || null;
}

export type WhmcsGroupSeen = { gid: number; slug: string; name?: string; products: number; priced: number };
export type EntryMapping = { slug: string; gid: number | null; group: string; matchedBy: 'gid' | 'name' | null; products: number; priced: number };

/**
 * Mapping status per entry. A category's saved gid wins (admin choice, or set by the sync); otherwise the first WHMCS group
 * whose store slug / name matches the entry's group names. `groups` = the groups seen on synced products.
 */
export function mapEntries(cfg: Pick<StoreConfig, 'entries'>, cats: { slug: string; whmcsGroupId: number | null }[], groups: WhmcsGroupSeen[]): EntryMapping[] {
  return cfg.entries.map((e) => {
    const gid = cats.find((c) => c.slug === e.slug)?.whmcsGroupId ?? null;
    const byGid = gid != null ? groups.find((g) => g.gid === gid) : undefined;
    if (gid != null) return { slug: e.slug, gid, group: byGid ? byGid.name || byGid.slug : '', matchedBy: 'gid', products: byGid?.products || 0, priced: byGid?.priced || 0 };
    const m = groups.find((g) => matchEntry({ entries: [e] }, g));
    return m ? { slug: e.slug, gid: m.gid, group: m.name || m.slug, matchedBy: 'name', products: m.products, priced: m.priced } : { slug: e.slug, gid: null, group: '', matchedBy: null, products: 0, priced: 0 };
  });
}

/* ------------------------------------------------------------------ bundles */
export type PriceRow = { currency: string; cycle: string; price: number | string; setupFee?: number | string };
/** A resolved bundle item: a product (its synced prices) or a domain (register price), or null when it does not exist / has no price. */
export type BundlePart = { ref: string; name: string; href?: string; pid?: number | null; prices: PriceRow[] } | { ref: string; name: string; domain: string; register: number | null; currency: string };
export type BundleLine = { ref: string; name: string; amount: number; basis: string; cycle: string; href?: string; pid?: number | null };
export type BundleTotal = { lines: BundleLine[]; missing: string[]; total: number | null; complete: boolean; currency: string; savings: number | null };

const ok = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v)); return Number.isFinite(n) && n >= 0 ? n : null; };
/** First-year cost of a product in one currency: the yearly price, else 12 × monthly, 4 × quarterly, 2 × semi-annual, else one-time; plus setup fees. */
export function firstYear(prices: PriceRow[], currency: string): { amount: number; basis: string; cycle: string } | null {
  const rows = prices.filter((r) => r.currency === currency && ok(r.price) !== null && ok(r.price)! > 0);
  const pick: [string, number, string][] = [['annually', 1, 'per year'], ['monthly', 12, '12 × monthly'], ['quarterly', 4, '4 × quarterly'], ['semiannually', 2, '2 × 6 months'], ['onetime', 1, 'one-time']];
  for (const [cycle, n, basis] of pick) {
    const r = rows.find((x) => x.cycle === cycle);
    if (r) return { amount: round2(ok(r.price)! * n + (ok(r.setupFee) || 0)), basis, cycle };
  }
  return null;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Bundle total for the first year from real component prices only. Incomplete (an item missing or unpriced) → total null.
 * savings is only ever the discount WHMCS itself reports for a native product bundle; without one it stays null.
 */
export function bundleTotal(parts: (BundlePart | null)[], refs: string[], currency: string, whmcsDiscount: number | null = null): BundleTotal {
  const lines: BundleLine[] = [], missing: string[] = [];
  parts.forEach((p, i) => {
    if (!p) { missing.push(refs[i] || `item ${i + 1}`); return; }
    if ('domain' in p) {
      const v = p.currency === currency ? ok(p.register) : null;
      if (v === null || v <= 0) { missing.push(p.ref); return; }
      lines.push({ ref: p.ref, name: p.name, amount: round2(v), basis: 'first year', cycle: 'annually' });
      return;
    }
    const f = firstYear(p.prices, currency);
    if (!f) { missing.push(p.ref); return; }
    lines.push({ ref: p.ref, name: p.name, amount: f.amount, basis: f.basis, cycle: f.cycle, href: p.href, pid: p.pid });
  });
  const complete = !missing.length && lines.length >= 2;
  const total = complete ? round2(lines.reduce((s, l) => s + l.amount, 0)) : null;
  const d = ok(whmcsDiscount);
  return { lines, missing, total, complete, currency, savings: complete && d !== null && d > 0 && d < total! ? round2(d) : null };
}

/* ------------------------------------------------------------------ quote requests */
export const QUOTE_SOURCE = (slug: string) => `quote:${slug}`;
export const QUOTE_BUDGETS = ['Not sure yet', 'Under 1,000 AED', '1,000 to 3,000 AED', '3,000 to 10,000 AED', 'Over 10,000 AED'];
export const QUOTE_TIMES = ['As soon as possible', 'Within a month', 'In 1 to 3 months', 'Just exploring'];
export type QuoteInput = { service: string; option: string; name: string; email: string; phone: string; company: string; website: string; budget: string; timeline: string; answers: string[]; notes: string; consent: boolean };
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

/** Clean and validate a quote request against its entry. Returns the cleaned input and per-field errors. */
export function checkQuote(data: Record<string, unknown>, entry: Pick<StoreEntry, 'options' | 'questions'> | null): { input: QuoteInput; fields: Record<string, string> } {
  const c = (k: string, max: number) => str(data[k], max);
  const answers = (entry?.questions || []).map((_, i) => c(`q${i}`, 600));
  const input: QuoteInput = {
    service: c('service', 80).toLowerCase(), option: c('option', 80), name: c('name', 80), email: c('email', 160).toLowerCase(), phone: c('phone', 30),
    company: c('company', 120), website: c('website', 200), budget: c('budget', 40), timeline: c('timeline', 40), answers, notes: c('notes', 2000),
    consent: data.consent === true || data.consent === 'on' || data.consent === 'true' || data.consent === '1',
  };
  const fields: Record<string, string> = {};
  if (!entry) fields.service = 'Choose a service.';
  if (input.name.length < 2) fields.name = 'Please enter your name.';
  if (!EMAIL.test(input.email)) fields.email = 'Please enter a valid email address.';
  if (input.phone && !/^\+?[\d\s().-]{6,30}$/.test(input.phone)) fields.phone = 'Use digits only, with your country code (for example +971 50 000 0000).';
  if (input.website && !/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(input.website)) fields.website = 'Enter a web address like example.com, or leave it empty.';
  if (entry?.options.length && input.option && !entry.options.includes(input.option)) input.option = '';
  if (!QUOTE_BUDGETS.includes(input.budget)) input.budget = '';
  if (!QUOTE_TIMES.includes(input.timeline)) input.timeline = '';
  if (input.notes.length < 10 && !input.answers.some((a) => a.length >= 3) && !input.option) fields.notes = 'Tell us a little about what you need.';
  return { input, fields };
}

/* ------------------------------------------------------------------ admin text formats */
/** FAQ ⇄ textarea: blocks of "Q: question" + "A: answer" lines, separated by a blank line. */
export const faqToText = (f: StoreFaq[]) => f.map((x) => `Q: ${x.q}\nA: ${x.a}`).join('\n\n');
export function faqFromText(t: string): StoreFaq[] {
  const out: StoreFaq[] = [];
  for (const block of String(t || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const q = block.match(/^\s*Q:\s*([\s\S]*?)(?:\n\s*A:|$)/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
    const a = block.match(/\n\s*A:\s*([\s\S]*)$/i)?.[1]?.replace(/\s+/g, ' ').trim() || '';
    if (q && a) out.push({ q: q.slice(0, 300), a: a.slice(0, 1500) });
  }
  return out.slice(0, 12);
}
