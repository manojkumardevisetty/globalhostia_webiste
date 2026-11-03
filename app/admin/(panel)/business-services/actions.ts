'use server';
// Admin → Business services: the shop config (settings.business_services), its categories' WHMCS group mapping and bundles.
// Never touches WHMCS: activating MarketConnect services or creating products stays with the owner (see the checklist).
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool, int, lines, slugify, isSlug } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { CLAIMED } from '@/lib/theme/sitelinks';
import {
  parseStoreConfig, faqFromText, mapEntries, storeSlugs, ITEM_REF, STORE_KINDS,
  type StoreConfig, type StoreEntry, type StoreKind,
} from '@/lib/store/config';
import { groupsSeen } from '@/lib/store/admin';

const BACK = '/admin/business-services';

async function load(): Promise<StoreConfig> {
  const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, 'business_services'));
  return parseStoreConfig(r?.value);
}
async function save(cfg: StoreConfig) {
  // round-trip through the parser so only valid, normalised data is stored
  await setSetting('business_services', parseStoreConfig(cfg));
  await setSetting('business_services_at', new Date().toISOString()); // sitemap <lastmod> of the shop pages
}

export async function saveShop(fd: FormData) {
  const s = await requireSession('content');
  const cfg = await load();
  const next: StoreConfig = {
    ...cfg, published: bool(fd, 'published'), title: str(fd, 'title'), lead: str(fd, 'lead'), seoTitle: str(fd, 'seoTitle'), meta: str(fd, 'meta'),
    menuLabel: str(fd, 'menuLabel'), inNav: bool(fd, 'inNav'), salesDepartmentId: str(fd, 'salesDepartmentId'), faq: faqFromText(str(fd, 'faq')),
  };
  if (next.salesDepartmentId && !/^\d{1,6}$/.test(next.salesDepartmentId)) fail(BACK, 'Sales department ID must be a number (WHMCS → Support → Support Departments)');
  if (next.published && !cfg.entries.length) fail(BACK, 'Add at least one category before publishing the shop');
  await save(next);
  await audit(s, cfg.published === next.published ? 'update' : next.published ? 'publish' : 'unpublish', 'business_services', null, { published: next.published });
  done(BACK, next.published ? 'Shop settings saved. The shop is published.' : 'Shop settings saved. The shop is not published.');
}

export async function saveEntry(fd: FormData) {
  const s = await requireSession('content');
  const cfg = await load();
  const slug = str(fd, 'slug');
  const i = cfg.entries.findIndex((e) => e.slug === slug);
  if (i < 0) fail(BACK, 'Unknown shop category');
  const kind = str(fd, 'kind') as StoreKind;
  const e: StoreEntry = {
    ...cfg.entries[i], section: str(fd, 'section') || cfg.entries[i].section, kind: (STORE_KINDS as readonly string[]).includes(kind) ? kind : 'whmcs',
    icon: str(fd, 'icon') || 'box', groups: lines(str(fd, 'groups')), blurb: str(fd, 'blurb'), included: lines(str(fd, 'included')),
    options: lines(str(fd, 'options')), questions: lines(str(fd, 'questions')).slice(0, 4), faq: faqFromText(str(fd, 'faq')),
    hidden: bool(fd, 'hidden'), order: int(fd, 'order', cfg.entries[i].order),
  };
  cfg.entries[i] = e;
  // WHMCS product group of the category (same field as Admin → Categories): empty = automatic mapping by group name
  const gid = str(fd, 'gid');
  if (gid && !/^\d{1,9}$/.test(gid)) fail(`${BACK}#e-${slug}`, 'WHMCS group ID must be a number');
  await db.update(schema.categories).set({ whmcsGroupId: gid ? parseInt(gid, 10) : null, updatedAt: new Date() }).where(eq(schema.categories.slug, slug));
  await save(cfg);
  await audit(s, 'update', 'business_services_entry', slug, { kind: e.kind, gid: gid || null });
  done(`${BACK}#e-${slug}`, `"${slug}" saved`);
}

export async function addEntry(fd: FormData) {
  const s = await requireSession('content');
  const cfg = await load();
  const id = str(fd, 'categoryId');
  const [c] = id ? await db.select().from(schema.categories).where(eq(schema.categories.id, id)) : [];
  if (!c) fail(BACK, 'Choose a category');
  if (cfg.entries.some((e) => e.slug === c.slug)) fail(BACK, `"${c.name}" is already in the shop`);
  const section = str(fd, 'section');
  if (!cfg.sections.some((x) => x.slug === section)) fail(BACK, 'Choose a section');
  const kind = str(fd, 'kind') === 'service' ? 'service' : 'whmcs';
  cfg.entries.push({ slug: c.slug, section, kind, icon: 'box', groups: [c.name], blurb: '', included: [], faq: [], options: [], questions: [], hidden: false, order: cfg.entries.length });
  await save(cfg);
  await audit(s, 'create', 'business_services_entry', c.slug, { section, kind });
  done(`${BACK}#e-${c.slug}`, `"${c.name}" added to the shop`);
}

export async function removeEntry(fd: FormData) {
  const s = await requireSession('content');
  const cfg = await load();
  const slug = str(fd, 'slug');
  cfg.entries = cfg.entries.filter((e) => e.slug !== slug);
  await save(cfg);
  await audit(s, 'delete', 'business_services_entry', slug);
  done(BACK, `"${slug}" removed from the shop (the category itself is unchanged)`);
}

export async function saveBundle(fd: FormData) {
  const s = await requireSession('content');
  const cfg = await load();
  const orig = str(fd, 'orig');
  const name = str(fd, 'name');
  const slug = slugify(str(fd, 'slug') || name).replace(/\//g, '-');
  const back = `${BACK}#bundles`;
  if (!name) fail(back, 'Bundle name is required');
  if (!isSlug(slug)) fail(back, 'Invalid bundle slug');
  if (cfg.bundles.some((b) => b.slug === slug && b.slug !== orig)) fail(back, `A bundle "${slug}" already exists`);
  const items = lines(str(fd, 'items')).map((x) => x.toLowerCase());
  const bad = items.filter((x) => !ITEM_REF.test(x));
  if (bad.length) fail(back, `Unknown item format: ${bad.join(', ')} (use p:<product slug>, cat:<category slug> or tld:.ae)`);
  if (items.length < 2) fail(back, 'A bundle needs at least two items');
  const bid = str(fd, 'whmcsBundleId');
  if (bid && !/^\d{1,9}$/.test(bid)) fail(back, 'WHMCS bundle ID must be a number');
  const b = { slug, name, summary: str(fd, 'summary'), items, whmcsBundleId: bid ? parseInt(bid, 10) : null, published: bool(fd, 'published'), order: int(fd, 'order', cfg.bundles.length) };
  const i = cfg.bundles.findIndex((x) => x.slug === orig);
  if (orig && i >= 0) cfg.bundles[i] = b; else cfg.bundles.push(b);
  await save(cfg);
  await audit(s, orig ? 'update' : 'create', 'business_services_bundle', slug, { items });
  done(back, `Bundle "${name}" saved`);
}

export async function deleteBundle(fd: FormData) {
  const s = await requireSession('content');
  const cfg = await load();
  const slug = str(fd, 'slug');
  cfg.bundles = cfg.bundles.filter((b) => b.slug !== slug);
  await save(cfg);
  await audit(s, 'delete', 'business_services_bundle', slug);
  done(`${BACK}#bundles`, 'Bundle deleted');
}

/**
 * Link shop categories to the WHMCS groups that match their group names, and move those groups' products (from the
 * category the sync created for them) into the shop category. Categories with a gid already set, and products in a
 * category a hand-written page sells (SSL, business email), are left alone.
 */
export async function applyMapping() {
  const s = await requireSession('content');
  const cfg = await load();
  const cats = await db.select().from(schema.categories);
  const groups = await groupsSeen();
  const shop = storeSlugs(cfg);
  let linked = 0, moved = 0;
  for (const m of mapEntries(cfg, cats, groups)) {
    if (m.matchedBy !== 'name' || m.gid == null) continue;
    const c = cats.find((x) => x.slug === m.slug);
    if (!c) continue;
    if (cats.some((x) => x.whmcsGroupId === m.gid && x.id !== c.id && (shop.has(x.slug) || CLAIMED.has(x.slug)))) continue; // another shop / hand-written category owns it
    // the category the sync made for the group no longer owns it; the shop category does
    await db.update(schema.categories).set({ whmcsGroupId: null }).where(and(eq(schema.categories.whmcsGroupId, m.gid), ne(schema.categories.id, c.id)));
    await db.update(schema.categories).set({ whmcsGroupId: m.gid, updatedAt: new Date() }).where(eq(schema.categories.id, c.id));
    linked++;
    const keep = new Set(cats.filter((x) => shop.has(x.slug) || CLAIMED.has(x.slug)).map((x) => x.id));
    const ps = await db.select({ id: schema.products.id, categoryId: schema.products.categoryId }).from(schema.products).where(eq(schema.products.whmcsGid, m.gid));
    const move = ps.filter((p) => !p.categoryId || !keep.has(p.categoryId)).map((p) => p.id);
    if (move.length) { await db.update(schema.products).set({ categoryId: c.id, updatedAt: new Date() }).where(inArray(schema.products.id, move)); moved += move.length; }
  }
  await audit(s, 'apply_mapping', 'business_services', null, { linked, moved });
  done(BACK, linked ? `Linked ${linked} categor${linked === 1 ? 'y' : 'ies'} to WHMCS groups, moved ${moved} product${moved === 1 ? '' : 's'}` : 'Nothing to link: no unlinked shop category matches a synced WHMCS group yet');
}
