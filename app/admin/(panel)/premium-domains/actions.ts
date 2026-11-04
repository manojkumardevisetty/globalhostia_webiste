'use server';
// Admin → Premium domains: own listings (add/edit/CSV/sold/feature/delete), Dynadot feed settings and refresh, the explicit
// "import my domains" picker, and connection tests. Every write is audited.
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { normalizePremium, cleanDomain, parseCsv, PREMIUM_KEY, PREMIUM_STATUSES, PREMIUM_CURRENCIES, HOME_POSITIONS, normTld, type PremiumStatus } from '@/lib/premium/core';
import { premiumConfig, refreshFeed } from '@/lib/premium/store';
import { transport, searchPrices, getListings, adviceFor } from '@/lib/premium/dynadot';

const BASE = '/admin/premium-domains';
const money = (v: string) => { const s = v.replace(/[,\s$]/g, ''); if (!s) return null; return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };
const tagsOf = (v: string) => [...new Set(v.split(/[,|;]/).map((t) => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 8);
const missing = (e: any) => /premium_(domains|feed)|does not exist/i.test(String(e?.message));

function listingFrom(fd: FormData, back: string) {
  const domain = cleanDomain(str(fd, 'domain'));
  if (!domain) fail(back, 'Enter a full domain such as brand.com');
  const price = money(str(fd, 'price')), minOffer = money(str(fd, 'min_offer'));
  if (Number.isNaN(price) || (price !== null && price > 1e9)) fail(back, 'Price must be a number such as 2500 or 2500.00');
  if (Number.isNaN(minOffer)) fail(back, 'Minimum offer must be a number');
  const makeOffer = bool(fd, 'make_offer') || price === null;
  const currency = (PREMIUM_CURRENCIES as readonly string[]).includes(str(fd, 'currency')) ? str(fd, 'currency') : 'USD';
  const status = (PREMIUM_STATUSES as readonly string[]).includes(str(fd, 'status')) ? str(fd, 'status') as PremiumStatus : 'draft';
  return {
    domain, price: price === null ? null : price.toFixed(2), currency, makeOffer, minOffer: minOffer === null ? null : minOffer.toFixed(2),
    tags: tagsOf(str(fd, 'tags')), description: str(fd, 'description').slice(0, 1200), status, owned: str(fd, 'owned') !== 'brokered', featured: bool(fd, 'featured'),
  };
}

export async function saveListing(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const v = listingFrom(fd, BASE);
  try {
    if (id) {
      const [old] = await db.select().from(schema.premiumDomains).where(eq(schema.premiumDomains.id, id));
      if (!old) fail(BASE, 'Listing not found');
      await db.update(schema.premiumDomains).set({ ...v, updatedAt: new Date(), soldAt: v.status === 'sold' ? old.soldAt || new Date() : null }).where(eq(schema.premiumDomains.id, id));
    } else {
      const [dup] = await db.select({ id: schema.premiumDomains.id }).from(schema.premiumDomains).where(eq(schema.premiumDomains.domain, v.domain));
      if (dup) fail(BASE, `${v.domain} is already listed; edit it below`);
      await db.insert(schema.premiumDomains).values({ ...v, soldAt: v.status === 'sold' ? new Date() : null });
    }
  } catch (e: any) { if (missing(e)) fail(BASE, 'The premium_domains table is created by the next deploy (db-setup patch 036-premium-domains).'); throw e; }
  await audit(s, id ? 'update' : 'create', 'premium_domain', v.domain, { price: v.price, currency: v.currency, status: v.status, featured: v.featured });
  done(BASE, `${v.domain} saved`);
}

export async function quickListing(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id'), op = str(fd, 'op');
  const [row] = await db.select().from(schema.premiumDomains).where(eq(schema.premiumDomains.id, id));
  if (!row) fail(BASE, 'Listing not found');
  if (op === 'delete') { await db.delete(schema.premiumDomains).where(eq(schema.premiumDomains.id, id)); await audit(s, 'delete', 'premium_domain', row.domain, {}); done(BASE, `${row.domain} removed`); }
  const set = op === 'feature' ? { featured: !row.featured } : op === 'sold' ? { status: 'sold', soldAt: new Date(), featured: false }
    : op === 'publish' ? { status: 'for_sale', soldAt: null } : op === 'hide' ? { status: 'draft' } : op === 'offer' ? { status: 'under_offer' } : null;
  if (!set) fail(BASE, 'Unknown action');
  await db.update(schema.premiumDomains).set({ ...set, updatedAt: new Date() }).where(eq(schema.premiumDomains.id, id));
  await audit(s, 'update', 'premium_domain', row.domain, { op });
  done(BASE, `${row.domain}: ${op === 'feature' ? (row.featured ? 'no longer featured' : 'featured') : op === 'sold' ? 'marked sold' : op === 'publish' ? 'for sale' : op === 'offer' ? 'under offer' : 'hidden'}`);
}

export async function importCsv(fd: FormData) {
  const s = await requireSession('content');
  const file = fd.get('file');
  const text = file && typeof file === 'object' && 'text' in file && (file as File).size ? (await (file as File).text()).slice(0, 400_000) : str(fd, 'csv');
  if (!text) fail(BASE, 'Paste CSV rows or choose a .csv file');
  const { rows, errors } = parseCsv(text);
  if (!rows.length) fail(BASE, errors[0] || 'No valid rows found');
  const status = str(fd, 'status') === 'for_sale' ? 'for_sale' : 'draft';
  let added = 0, updated = 0;
  try {
    const have = new Map((await db.select({ id: schema.premiumDomains.id, domain: schema.premiumDomains.domain }).from(schema.premiumDomains)
      .where(inArray(schema.premiumDomains.domain, rows.map((r) => r.domain)))).map((r) => [r.domain, r.id]));
    for (const r of rows) {
      const v = { price: r.price === null ? null : r.price.toFixed(2), currency: r.currency, makeOffer: r.makeOffer, minOffer: r.minOffer === null ? null : r.minOffer.toFixed(2), tags: r.tags, description: r.description, owned: r.owned, featured: r.featured };
      const id = have.get(r.domain);
      if (id) { await db.update(schema.premiumDomains).set({ ...v, updatedAt: new Date() }).where(eq(schema.premiumDomains.id, id)); updated++; }
      else { await db.insert(schema.premiumDomains).values({ domain: r.domain, status, ...v }); added++; }
    }
  } catch (e: any) { if (missing(e)) fail(BASE, 'The premium_domains table is created by the next deploy.'); throw e; }
  await audit(s, 'import', 'premium_domain', null, { added, updated, errors: errors.length, status });
  done(BASE, `CSV: ${added} added${status === 'draft' ? ' as drafts' : ''}, ${updated} updated${errors.length ? `, ${errors.length} skipped (${errors.slice(0, 2).join('; ')})` : ''}`);
}

/** The explicit picker: only the names the owner ticked, as drafts or make-an-offer listings. */
export async function importOwn(fd: FormData) {
  const s = await requireSession('content');
  const picked = [...new Set(fd.getAll('pick').map((x) => cleanDomain(String(x))).filter((x): x is string => !!x))].slice(0, 500);
  if (!picked.length) fail(`${BASE}?import=1`, 'Tick at least one domain to list');
  const status = str(fd, 'status') === 'for_sale' ? 'for_sale' : 'draft';
  const have = new Set((await db.select({ d: schema.premiumDomains.domain }).from(schema.premiumDomains).where(inArray(schema.premiumDomains.domain, picked))).map((r) => r.d));
  const add = picked.filter((d) => !have.has(d));
  if (add.length) await db.insert(schema.premiumDomains).values(add.map((domain) => ({ domain, status, makeOffer: true, owned: true })));
  await audit(s, 'import', 'premium_domain', null, { source: 'dynadot_account', added: add.length, status });
  done(BASE, `${add.length} of your domains added ${status === 'draft' ? 'as drafts: set a price, then publish' : 'for sale (make an offer)'}`);
}

export async function saveConfig(fd: FormData) {
  const s = await requireSession('settings');
  const n = (k: string) => str(fd, k);
  const cfg = normalizePremium({
    enabled: bool(fd, 'enabled'), source: n('source'), proxyUrl: n('proxy_url'), cacheHours: n('cache_hours'),
    feed: { enabled: bool(fd, 'feed_enabled'), tlds: n('feed_tlds').split(/[\s,]+/).map(normTld).filter(Boolean), minPrice: n('feed_min'), maxPrice: n('feed_max'),
      keywords: n('feed_keywords'), exclude: n('feed_exclude'), maxCount: n('feed_max_count'), pages: n('feed_pages'), brandable: bool(fd, 'feed_brandable'),
      minLen: n('feed_min_len'), maxLen: n('feed_max_len'), noDigits: bool(fd, 'feed_no_digits'), noHyphens: bool(fd, 'feed_no_hyphens'), startsWith: n('feed_starts'), endsWith: n('feed_ends'), startPage: n('feed_start_page'), step: n('feed_step') },
    pricing: { mode: n('pricing_mode'), markupPct: n('markup_pct'), markupFixed: n('markup_fixed'), feePct: n('fee_pct'), feeMin: n('fee_min') },
    registry: { enabled: bool(fd, 'registry_enabled'), markupPct: n('registry_markup') },
    home: { position: (HOME_POSITIONS as readonly string[]).includes(n('home_position')) ? n('home_position') : 'after-domain', title: n('home_title'), max: n('home_max') },
  });
  if (n('proxy_url') && !cfg.proxyUrl) fail(BASE, 'Proxy URL must start with https://');
  await setSetting(PREMIUM_KEY, cfg);
  await audit(s, 'update', 'settings', PREMIUM_KEY, { feed: cfg.feed.enabled, mode: cfg.pricing.mode, source: cfg.source, home: cfg.home.position });
  done(BASE, 'Premium domain settings saved');
}

export async function refreshNow() {
  const s = await requireSession('content');
  const r = await refreshFeed(s.email);
  if (!r.ok) fail(BASE, `Refresh failed: ${r.error}${r.advice ? ` ${r.advice}` : ''}`);
  done(BASE, `Dynadot feed refreshed: ${r.read ?? 0} listings read from ${r.pages ?? 0} page(s), ${r.kept ?? 0} kept by your filters`);
}

export async function testConnection() {
  const s = await requireSession('integration');
  const cfg = await premiumConfig();
  const t = await transport(cfg);
  if (t.mode === 'none') fail(BASE, t.reason);
  const t0 = Date.now();
  try {
    const [hit] = await searchPrices(t, ['globalhostia.com'], 15000);
    let listings = 'not tried';
    try { const l = await getListings(t, 1); listings = `${l.items.length} marketplace listings on the first page`; } catch (e: any) { listings = `get_listings failed: ${String(e?.message || e).slice(0, 120)}`; }
    await audit(s, 'test', 'premium_dynadot', t.mode, { ok: true, ms: Date.now() - t0 });
    done(BASE, `Connected via ${t.mode === 'proxy' ? 'the WHMCS proxy' : 'the direct API key'} in ${Date.now() - t0} ms: search OK${hit ? ` (${hit.domain} ${hit.available ? 'available' : 'registered'})` : ''}; ${listings}`);
  } catch (e: any) {
    if (String(e?.digest || '').startsWith('NEXT_REDIRECT')) throw e;
    await audit(s, 'test', 'premium_dynadot', t.mode, { ok: false, error: String(e?.message || e).slice(0, 200) });
    fail(BASE, `Connection failed (${t.mode}): ${String(e?.message || e).slice(0, 200)} ${adviceFor(e)}`);
  }
}
