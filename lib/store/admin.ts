// Admin → Business services: what the last WHMCS sync saw (server only; not a server action).
import 'server-only';
import { inArray, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { groupSlugFromUrl, type WhmcsGroupSeen } from './config';

/** WHMCS groups seen on synced products (store slug from the product URL, gid, how many products / priced). */
export async function groupsSeen(): Promise<WhmcsGroupSeen[]> {
  const ps = await db.select({ id: schema.products.id, gid: schema.products.whmcsGid, url: schema.products.whmcsUrl, retired: schema.products.whmcsRetired })
    .from(schema.products).where(isNotNull(schema.products.whmcsGid));
  const priced = new Set((ps.length ? await db.select({ id: schema.productPrices.productId }).from(schema.productPrices).where(inArray(schema.productPrices.productId, ps.map((p) => p.id))) : []).map((r) => r.id));
  const by = new Map<number, WhmcsGroupSeen>();
  for (const p of ps) {
    if (p.retired) continue;
    const g = by.get(p.gid!) || { gid: p.gid!, slug: groupSlugFromUrl(p.url), products: 0, priced: 0 };
    if (!g.slug) g.slug = groupSlugFromUrl(p.url);
    g.products++; if (priced.has(p.id)) g.priced++;
    by.set(p.gid!, g);
  }
  return [...by.values()].sort((a, b) => a.gid - b.gid);
}

