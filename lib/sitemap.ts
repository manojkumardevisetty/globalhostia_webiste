// Every indexable URL with its <lastmod>: used by /sitemap.xml and by the IndexNow submissions (lib/indexnow.ts).
// Only URLs that answer 200, are index,follow and self-canonical belong here.
import 'server-only';
import { eq, and } from 'drizzle-orm';
import { db, schema } from './db';
import { cachedRead } from './lkg';
import { getSettings } from './settings';
import { getPosts, blogCategories, COLLECTIONS } from './blog';
import { SITEMAP_EXCLUDE, NOINDEX_SLUGS } from './seo';
import { ROUTES, THEME_ONLY } from './theme/routes';
import { getCatalog, productsFor, type Catalog } from './theme/data';
import { pseoPaths } from './theme/pseo';
import { storePaths } from './store/view';
import { ALIAS_SLUGS } from './aliases.mjs';
import { isHiddenVs } from './compare/competitors';
import { AR_DEFS, arPage, arPathOf } from './i18n/ar-pages';

/** alternates: hreflang versions of the page (English ↔ Arabic pairs, lib/i18n/ar-pages.ts), emitted as xhtml:link. */
export type SitemapEntry = { loc: string; lastmod: string; alternates?: { lang: string; href: string }[] };

const iso = (d: Date | string | number) => new Date(d).toISOString();
const maxDate = (...ds: (string | number | Date | null | undefined)[]) => {
  const t = ds.map((d) => (d == null || d === '' ? NaN : new Date(d).getTime())).filter(Number.isFinite);
  return t.length ? iso(Math.max(...t)) : '';
};

/** A themed plan page whose categories have no live plans renders "Plans are being updated" (noindex): leave it out. */
const emptyListing = (cat: Catalog | null, slug: string) => {
  const cats = ROUTES[slug]?.categories;
  return !!cat && !!cats?.length && !productsFor(cat, cats).length;
};

type Row = { slug: string; updatedAt: Date | string };
/** The page / product / landing-page rows the sitemap lists (cached 6h, tag `site`; snapshot-backed, lib/lkg.ts). */
export const sitemapRows = cachedRead('sitemap-rows', async (): Promise<{ rows: Row[]; prods: Row[]; lps: Row[] }> => {
  const [rows, prods, lps] = await Promise.all([
    db.select({ slug: schema.pages.slug, updatedAt: schema.pages.updatedAt }).from(schema.pages)
      .where(and(eq(schema.pages.status, 'PUBLISHED'), eq(schema.pages.inSitemap, true))),
    db.select({ slug: schema.products.slug, updatedAt: schema.products.updatedAt }).from(schema.products)
      .where(and(eq(schema.products.status, 'PUBLISHED'), eq(schema.products.whmcsRetired, false))),
    // landing pages are noindex by default (ad traffic); the ones switched to indexable belong in the sitemap
    db.select({ slug: schema.landingPages.slug, updatedAt: schema.landingPages.updatedAt }).from(schema.landingPages)
      .where(and(eq(schema.landingPages.status, 'PUBLISHED'), eq(schema.landingPages.noindex, false))),
  ]);
  return { rows, prods, lps };
});

export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const s = await getSettings();
  const base = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const hostpen = s.site_theme === 'hostpen';
  const [db_, posts, cat] = await Promise.all([
    // no database and no snapshot: published products still come from the (snapshot) catalog, pages from the theme routes
    sitemapRows().catch(() => null),
    getPosts().catch(() => []),
    getCatalog().catch(() => null),
  ]);
  const rows = db_?.rows || [];
  const prods = db_?.prods || (cat?.products || []).map((p) => ({ slug: p.slug, updatedAt: '' }));
  const lps = db_?.lps || [];
  // pages built from the live catalog change when a product or price changes (lib/sync.ts only moves updatedAt then);
  // hand-written theme pages also change with a deploy (time of the first request after it, lib/indexnow.ts)
  const catalogMod = maxDate(...prods.map((p) => p.updatedAt)) || iso(Date.now());
  const tldMod = maxDate(s.tlds_changed_at) || catalogMod;
  const themeMod = maxDate(catalogMod, s.indexnow_deploy?.at) || catalogMod;

  const out: SitemapEntry[] = [];
  const seen = new Set<string>();
  // Arabic pages switched off in Admin → Arabic pages answer 404
  const arOff = new Set(AR_DEFS.filter((d) => !arPage(d, s.ar_pages).copy.enabled).map(arPathOf));
  const add = (path: string, lastmod: string) => {
    const loc = base + path;
    if (seen.has(loc) || isHiddenVs(path, s) || arOff.has(path)) return; // competitor pages hidden in admin answer 404
    seen.add(loc); out.push({ loc, lastmod });
  };

  for (const r of rows) {
    if (SITEMAP_EXCLUDE.has(r.slug) || r.slug === 'blog' || (hostpen && emptyListing(cat, r.slug))) continue;
    add(r.slug === 'index' ? '/' : `/${r.slug}`, maxDate(r.updatedAt, hostpen && ROUTES[r.slug] ? themeMod : null));
  }
  if (!db_) add('/', themeMod);
  for (const p of prods) add(`/p/${p.slug}`, maxDate(p.updatedAt) || catalogMod);
  add('/ai', themeMod);
  add('/connectors', themeMod);
  add('/docs/mcp', themeMod);
  for (const l of lps) add(`/lp/${l.slug}`, maxDate(l.updatedAt, catalogMod));
  if (posts.length) {
    const newest = maxDate(...posts.map((p) => p.updatedAt));
    add('/blog', newest);
    for (const c of blogCategories(posts.filter((p) => p.lang !== 'ar'))) add(`/blog/category/${c.slug}`, newest);
    // guide collections (content engine): UAE guides, Global guides, Arabic articles
    for (const c of COLLECTIONS) { const ps = posts.filter(c.match); if (ps.length) add(`/blog/${c.slug}`, maxDate(...ps.map((p) => p.updatedAt))); }
    for (const p of posts) if (!p.canonical || p.canonical.startsWith(base)) add(`/blog/${p.slug}`, iso(p.updatedAt));
  }
  const have = new Set(rows.map((r) => r.slug));
  // theme-only landing pages (plan finder, free migration, .ae, data centers, UAE guides, /compare, /guides)
  for (const slug of THEME_ONLY) if (!have.has(slug) && !emptyListing(cat, slug)) add(`/${slug}`, slug === 'ae-domains' ? maxDate(themeMod, tldMod) : themeMod);
  // with the Hostpen theme every route in lib/theme/routes.ts renders even without a CMS page row
  // (/windows-rdp, /cloud-servers, /forex-vps …), so list those too; sign-in flows and noindex pages stay out
  if (hostpen) {
    for (const [slug, r] of Object.entries(ROUTES)) {
      if (slug === 'index' || have.has(slug) || r.kind === 'auth' || NOINDEX_SLUGS.has(slug) || ALIAS_SLUGS.includes(slug) || SITEMAP_EXCLUDE.has(slug)) continue;
      if (emptyListing(cat, slug)) continue;
      add(`/${slug}`, themeMod);
    }
  }
  // programmatic SEO pages (domains A–Z, locations, use cases): derived from the cached catalog
  const pseo = cat ? pseoPaths(cat) : [];
  for (const p of pseo) if (!have.has(p.slice(1))) add(p, p.startsWith('/domains/') ? maxDate(tldMod, catalogMod) : catalogMod);
  // Business services shop: only while published, and only pages with something to order or quote (lib/store/view.ts)
  for (const p of cat ? storePaths(cat) : []) if (!have.has(p.slice(1))) add(p, maxDate(catalogMod, s.business_services_at) || catalogMod);
  // premium domain detail pages (lib/premium): listed names only, while the page is live
  try {
    const { premiumItems, premiumConfig } = await import('./premium/store');
    if ((await premiumConfig()).enabled) for (const i of await premiumItems()) add(`/premium-domains/${i.domain}`, i.updatedAt || themeMod);
  } catch { /* tables not created yet */ }
  // hreflang pairs: both versions listed (so both answer 200 and are indexable) → each gets en, ar and x-default
  for (const d of AR_DEFS) {
    const en = out.find((e) => e.loc === base + (d.en === '/' ? '/' : d.en)), ar = out.find((e) => e.loc === base + arPathOf(d));
    if (!en || !ar) continue;
    const alts = [{ lang: 'en', href: en.loc }, { lang: 'ar', href: ar.loc }, { lang: 'x-default', href: en.loc }];
    en.alternates = alts; ar.alternates = alts;
  }
  return out;
}

/** Every theme route, with no data at all: what /sitemap.xml answers when even the snapshot is missing. */
export function staticSitemapEntries(base = 'https://globalhostia.com'): SitemapEntry[] {
  const now = iso(Date.now());
  const paths = ['/', '/ai', '/connectors', '/docs/mcp', ...[...THEME_ONLY].map((s) => `/${s}`), ...Object.entries(ROUTES)
    .filter(([slug, r]) => slug !== 'index' && r.kind !== 'auth' && !NOINDEX_SLUGS.has(slug) && !ALIAS_SLUGS.includes(slug) && !SITEMAP_EXCLUDE.has(slug))
    .map(([slug]) => `/${slug}`)];
  return [...new Set(paths)].map((p) => ({ loc: base + p, lastmod: now }));
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sitemapXml(entries: SitemapEntry[]) {
  const xhtml = entries.some((e) => e.alternates?.length) ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtml}>\n${entries
    .map((e) => `<url><loc>${xmlEsc(e.loc)}</loc><lastmod>${e.lastmod}</lastmod>${(e.alternates || []).map((a) => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${xmlEsc(a.href)}"/>`).join('')}</url>`).join('\n')}\n</urlset>\n`;
}
