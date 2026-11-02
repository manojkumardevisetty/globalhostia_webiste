'use server';
import { eq, inArray, and, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail, str, bool, int, slugify, isSlug, lines, kv } from '@/lib/admin';
import { whmcs, getCurrencies } from '@/lib/whmcs';
import { CYCLES } from '@/lib/pricing';
import { after } from 'next/server';
import { getSettings } from '@/lib/settings';
import { pingIndexNow, siteUrl } from '@/lib/seo';

export async function saveProduct(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const back = id ? `/admin/products/${id}` : '/admin/products/new';
  const name = str(fd, 'name');
  const slug = slugify(str(fd, 'slug') || name);
  if (!name) fail(back, 'Name is required');
  if (!isSlug(slug)) fail(back, 'Slug may contain only a–z, 0–9 and dashes');
  const pidRaw = str(fd, 'whmcsPid');
  const whmcsPid = pidRaw ? parseInt(pidRaw, 10) : null;
  if (pidRaw && !Number.isFinite(whmcsPid)) fail(back, 'WHMCS product ID must be a number');
  const dupSlug = await db.select({ id: schema.products.id }).from(schema.products).where(and(eq(schema.products.slug, slug), id ? ne(schema.products.id, id) : undefined)).limit(1);
  if (dupSlug.length) fail(back, `Slug "${slug}" is already used by another product`);
  if (whmcsPid) {
    const dup = await db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).where(and(eq(schema.products.whmcsPid, whmcsPid), id ? ne(schema.products.id, id) : undefined)).limit(1);
    if (dup.length) fail(back, `WHMCS product #${whmcsPid} is already linked to "${dup[0].name}"`);
  }
  const publishAt = str(fd, 'publishAt');
  const values = {
    name, slug, whmcsPid,
    categoryId: str(fd, 'categoryId') || null,
    tagline: str(fd, 'tagline'), description: str(fd, 'description'),
    features: lines(str(fd, 'features')), attributes: kv(str(fd, 'attributes')),
    badge: str(fd, 'badge'), badgeColor: str(fd, 'badgeColor') || 'primary',
    featured: bool(fd, 'featured'), sortOrder: int(fd, 'sortOrder'),
    status: (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(str(fd, 'status')) ? str(fd, 'status') : 'DRAFT') as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    displayCycle: str(fd, 'displayCycle') || 'auto', orderUrl: str(fd, 'orderUrl'),
    publishAt: publishAt ? new Date(publishAt) : null,
    contentLocked: bool(fd, 'contentLocked'), updatedAt: new Date(),
  };
  if (values.orderUrl && !/^(https:\/\/|\/)/.test(values.orderUrl)) fail(back, 'Order URL must start with https:// or /');
  let pid = id;
  if (id) {
    const [old] = await db.select().from(schema.products).where(eq(schema.products.id, id));
    if (old) await saveRevision(s, 'product', id, old);
    await db.update(schema.products).set(values).where(eq(schema.products.id, id));
  } else {
    const [row] = await db.insert(schema.products).values(values).returning({ id: schema.products.id });
    pid = row.id;
  }
  // manual prices only for products not linked to WHMCS (WHMCS is authoritative otherwise)
  if (!whmcsPid) {
    const cur = str(fd, 'currency') || 'USD';
    const rows = CYCLES.map((c) => ({ c, v: str(fd, `price_${c}`), f: str(fd, `setup_${c}`) })).filter((r) => r.v !== '');
    for (const r of rows) if (!/^\d+(\.\d{1,2})?$/.test(r.v)) fail(`/admin/products/${pid}`, `Invalid price for ${r.c}`);
    await db.delete(schema.productPrices).where(eq(schema.productPrices.productId, pid));
    if (rows.length) await db.insert(schema.productPrices).values(rows.map((r) => ({ productId: pid, currency: cur, prefix: cur === 'USD' ? '$' : '', cycle: r.c, price: r.v, setupFee: r.f || '0' })));
  }
  await audit(s, id ? 'update' : 'create', 'product', pid, { name, status: values.status });
  if (values.status === 'PUBLISHED') { const site = siteUrl(await getSettings()); after(() => pingIndexNow(site, [`${site}/p/${slug}`])); }
  done(`/admin/products/${pid}`, 'Product saved — live on the website');
}

export async function bulkProducts(fd: FormData) {
  const s = await requireSession('content');
  const ids = fd.getAll('ids').map(String).filter(Boolean);
  const op = str(fd, 'op');
  if (!ids.length) fail('/admin/products', 'Select at least one product');
  const where = inArray(schema.products.id, ids);
  if (op === 'publish' || op === 'draft' || op === 'archive') {
    await db.update(schema.products).set({ status: op === 'publish' ? 'PUBLISHED' : op === 'draft' ? 'DRAFT' : 'ARCHIVED', updatedAt: new Date() }).where(where);
  } else if (op === 'feature' || op === 'unfeature') {
    await db.update(schema.products).set({ featured: op === 'feature' }).where(where);
  } else if (op === 'move') {
    await db.update(schema.products).set({ categoryId: str(fd, 'categoryId') || null }).where(where);
  } else if (op === 'delete') {
    // only local products can be deleted; WHMCS-linked ones are archived instead
    const rows = await db.select({ id: schema.products.id, pid: schema.products.whmcsPid }).from(schema.products).where(where);
    const local = rows.filter((r) => !r.pid).map((r) => r.id), linked = rows.filter((r) => r.pid).map((r) => r.id);
    if (local.length) await db.delete(schema.products).where(inArray(schema.products.id, local));
    if (linked.length) await db.update(schema.products).set({ status: 'ARCHIVED' }).where(inArray(schema.products.id, linked));
  } else fail('/admin/products', 'Unknown bulk action');
  await audit(s, `bulk_${op}`, 'product', null, { ids });
  done('/admin/products', `${ids.length} product(s) updated`);
}

/** Create the matching product in WHMCS via the AddProduct API, then link it. */
export async function createInWhmcs(fd: FormData) {
  const s = await requireSession('integration');
  const id = str(fd, 'id');
  const back = `/admin/products/${id}`;
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!p) fail('/admin/products', 'Product not found');
  if (p.whmcsPid) fail(back, `Already linked to WHMCS product #${p.whmcsPid}`);
  const [cat] = p.categoryId ? await db.select().from(schema.categories).where(eq(schema.categories.id, p.categoryId)) : [];
  if (!cat?.whmcsGroupId) fail(back, 'The product category has no WHMCS group ID. Set it under Categories (or run a sync) first.');
  const prices = await db.select().from(schema.productPrices).where(eq(schema.productPrices.productId, id));
  if (!prices.length) fail(back, 'Add at least one price before creating the product in WHMCS');
  let res: any;
  try {
    const currencies = await getCurrencies();
    const params: Record<string, string> = {
      type: str(fd, 'type') || 'hostingaccount', gid: String(cat.whmcsGroupId), name: p.name, slug: p.slug,
      description: p.features.filter((f) => !f.startsWith('-')).join('\n') || p.description, hidden: p.status === 'PUBLISHED' ? '0' : '1',
      paytype: 'recurring', module: str(fd, 'module') || '',
    };
    const setupKey: Record<string, string> = { monthly: 'msetupfee', quarterly: 'qsetupfee', semiannually: 'ssetupfee', annually: 'asetupfee', biennially: 'bsetupfee', triennially: 'tsetupfee' };
    for (const c of currencies) {
      for (const cyc of CYCLES) {
        const pr = prices.find((x) => x.currency === c.code && x.cycle === cyc);
        params[`pricing[${c.id}][${cyc}]`] = pr ? String(pr.price) : '-1';
        if (pr) params[`pricing[${c.id}][${setupKey[cyc]}]`] = String(pr.setupFee);
      }
    }
    res = await whmcs('AddProduct', params);
  } catch (e: any) {
    await db.update(schema.products).set({ syncError: e.message }).where(eq(schema.products.id, id));
    fail(back, `WHMCS refused AddProduct: ${e.message}`);
  }
  await db.update(schema.products).set({ whmcsPid: Number(res.pid), whmcsGid: cat.whmcsGroupId, syncError: '', syncedAt: new Date() }).where(eq(schema.products.id, id));
  await audit(s, 'whmcs_add_product', 'product', id, { pid: res.pid });
  done(back, `Created in WHMCS as product #${res.pid} and linked. Configure server module/provisioning in WHMCS admin.`);
}
