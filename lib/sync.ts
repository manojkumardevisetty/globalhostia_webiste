// WHMCS → platform synchronisation. WHMCS is authoritative for pricing,
// cycles and product existence; the platform owns presentation content.
import 'server-only';
import { eq, isNotNull, inArray, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from './db';
import { getProducts, getCurrencies, getTldPricing, type WhmcsProduct } from './whmcs';
import { parseWhmcsPricing, features } from './pricing';
import { getSettings } from './settings';
import { enrichment } from './enrich-core.mjs';
import legacyDetails from '../legacy/product-details.json';

const slugify = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'product';
const groupSlugFromUrl = (u?: string) => u?.match(/\/store\/([\w-]+)\//)?.[1];

async function startRun(kind: string, trigger: string) {
  const [r] = await db.insert(schema.syncRuns).values({ kind, trigger }).returning();
  return r.id;
}
async function endRun(id: string, status: string, stats: object, error = '') {
  await db.update(schema.syncRuns).set({ status, stats, error: error.slice(0, 2000), finishedAt: new Date() }).where(eq(schema.syncRuns.id, id));
}

export async function syncProducts(trigger = 'manual') {
  const runId = await startRun('products', trigger);
  const stats = { fetched: 0, created: 0, updated: 0, retired: 0, categoriesCreated: 0, errors: [] as string[] };
  try {
    const s = await getSettings();
    const list: WhmcsProduct[] = await getProducts();
    stats.fetched = list.length;
    const cats = await db.select().from(schema.categories);
    const bySlug = new Map(cats.map((c) => [c.slug, c]));
    const byGid = new Map(cats.filter((c) => c.whmcsGroupId != null).map((c) => [c.whmcsGroupId!, c]));
    const existing = await db.select({ id: schema.products.id, pid: schema.products.whmcsPid, slug: schema.products.slug, locked: schema.products.contentLocked }).from(schema.products);
    const byPid = new Map(existing.filter((p) => p.pid != null).map((p) => [p.pid!, p]));
    const slugs = new Set(existing.map((p) => p.slug));

    for (const wp of list) {
      try {
        const pid = Number(wp.pid), gid = Number(wp.gid);
        // category: match by store URL group slug, then by remembered WHMCS gid, else create
        const gslug = groupSlugFromUrl(wp.product_url);
        let cat = (gslug && bySlug.get(gslug)) || byGid.get(gid);
        if (!cat) {
          const slug = gslug || `whmcs-group-${gid}`;
          [cat] = await db.insert(schema.categories).values({ slug, name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), whmcsGroupId: gid })
            .onConflictDoUpdate({ target: schema.categories.slug, set: { whmcsGroupId: gid } }).returning();
          bySlug.set(cat.slug, cat); byGid.set(gid, cat); stats.categoriesCreated++;
        } else if (cat.whmcsGroupId == null) {
          await db.update(schema.categories).set({ whmcsGroupId: gid }).where(eq(schema.categories.id, cat.id));
          cat.whmcsGroupId = gid; byGid.set(gid, cat);
        }
        const mirror = {
          whmcsGid: gid, whmcsName: wp.name, whmcsType: wp.type || '', payType: wp.paytype || '',
          whmcsHidden: !!Number(wp.hidden ?? 0), whmcsRetired: !!Number(wp.retired ?? 0),
          whmcsUrl: wp.product_url || '', syncedAt: new Date(), syncError: '',
        };
        // WHMCS text, enriched with the detailed specs/features from the original website when available
        const rich = enrichment(legacyDetails as any, wp.product_url, wp.slug) as null | { tagline: string; features: string[]; attributes: Record<string, string>; badge: string };
        const whmcsFeatures = features(wp.description || '');
        const content = {
          name: wp.name, description: wp.description || '',
          features: rich && rich.features.length >= whmcsFeatures.length ? rich.features : whmcsFeatures,
          ...(rich ? { tagline: rich.tagline, attributes: rich.attributes, ...(rich.badge ? { badge: rich.badge } : {}) } : {}),
        };
        let productId: string;
        const ex = byPid.get(pid);
        if (ex) {
          await db.update(schema.products).set({ ...mirror, ...(ex.locked ? {} : content), updatedAt: new Date() }).where(eq(schema.products.id, ex.id));
          productId = ex.id; stats.updated++;
        } else {
          let slug = wp.slug || slugify(wp.name);
          if (slugs.has(slug)) slug = `${slug}-${pid}`;
          slugs.add(slug);
          const [np] = await db.insert(schema.products).values({
            ...mirror, ...content, slug, whmcsPid: pid, categoryId: cat.id,
            status: s.publish_new_products !== false && !mirror.whmcsHidden && !mirror.whmcsRetired ? 'PUBLISHED' : 'DRAFT',
          }).returning({ id: schema.products.id });
          productId = np.id; stats.created++;
        }
        // prices: replace wholesale from WHMCS (authoritative)
        const rows = Object.entries(wp.pricing || {}).flatMap(([cur, p]) => parseWhmcsPricing(wp.paytype, p, cur));
        await db.delete(schema.productPrices).where(eq(schema.productPrices.productId, productId));
        if (rows.length) await db.insert(schema.productPrices).values(rows.map((r) => ({ ...r, productId, price: String(r.price), setupFee: String(r.setupFee) })));
      } catch (e: any) {
        stats.errors.push(`pid ${wp.pid}: ${e.message}`);
      }
    }
    // products no longer returned by WHMCS → flag as retired (never deleted automatically)
    const seen = list.map((p) => Number(p.pid));
    if (seen.length) {
      const gone = await db.update(schema.products).set({ whmcsRetired: true, syncError: 'Not returned by WHMCS GetProducts' })
        .where(sql`${schema.products.whmcsPid} is not null and ${schema.products.whmcsPid} not in (${sql.join(seen.map((n) => sql`${n}`), sql`, `)}) and ${schema.products.whmcsRetired} = false`)
        .returning({ id: schema.products.id });
      stats.retired = gone.length;
    }
    await endRun(runId, stats.errors.length ? 'partial' : 'ok', stats);
    revalidateTag('site');
    return { ok: true, runId, stats };
  } catch (e: any) {
    await endRun(runId, 'failed', stats, e.message);
    return { ok: false, runId, stats, error: e.message as string };
  }
}

export async function syncTlds(trigger = 'manual') {
  const runId = await startRun('tlds', trigger);
  const stats = { fetched: 0, upserted: 0 };
  try {
    const s = await getSettings();
    const currencies = await getCurrencies().catch(() => []);
    const cur = currencies.find((c) => c.code === s.currency) || currencies.find((c) => Number(c.default) === 1);
    const { pricing, currency } = await getTldPricing(cur ? Number(cur.id) : undefined);
    const entries = Object.entries(pricing);
    stats.fetched = entries.length;
    const first = (o?: Record<string, string>) => { const v = o ? parseFloat(o['1'] ?? Object.values(o)[0]) : NaN; return Number.isFinite(v) && v >= 0 ? String(v) : null; };
    for (const [ext, p] of entries) {
      const tld = '.' + ext.replace(/^\./, '');
      await db.insert(schema.tlds).values({ tld, currency: currency || cur?.code || s.currency, register: first(p.register), transfer: first(p.transfer), renew: first(p.renew), syncedAt: new Date() })
        .onConflictDoUpdate({ target: schema.tlds.tld, set: { currency: currency || cur?.code || s.currency, register: first(p.register), transfer: first(p.transfer), renew: first(p.renew), syncedAt: new Date() } });
      stats.upserted++;
    }
    await endRun(runId, 'ok', stats);
    revalidateTag('site');
    return { ok: true, runId, stats };
  } catch (e: any) {
    await endRun(runId, 'failed', stats, e.message);
    return { ok: false, runId, stats, error: e.message as string };
  }
}

export async function syncAll(trigger = 'manual') {
  const products = await syncProducts(trigger);
  const tlds = await syncTlds(trigger);
  return { products, tlds };
}
