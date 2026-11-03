// Build-time snapshot (bundled and run by scripts/snapshot.mjs before `next build`): runs the public reads through
// the same cachedRead() loaders the site uses and writes what succeeded to .snapshot/lkg.json. At runtime lib/lkg.ts
// serves these values whenever Postgres is unavailable. Exit code 2 = the database could not be read.
import fs from 'node:fs';
import { and, eq, like } from 'drizzle-orm';
import { db, schema } from './db';
import { snapshotDump } from './lkg';
import { getCatalog } from './theme/data';
import { getPosts } from './blog';
import { cachedPage } from './render/page';
import { loadLegacy } from './theme/pages/content';
import { landingRow } from './theme/pages/landing';
import { cachedProductPage } from './render/product-page';
import { redirectMap } from './redirects';
import { sitemapRows } from './sitemap';
import { blockHtml } from './blocks';

const out = process.argv[2] || '.snapshot/lkg.json';

async function each<T>(items: T[], fn: (x: T) => Promise<unknown>, n = 4) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map((x) => fn(x).catch((e) => console.warn('[snapshot]', String(e?.message || e).slice(0, 160)))));
}

async function main() {
  const t0 = Date.now();
  const cat = await getCatalog(); // settings + catalog
  await Promise.all([getPosts(), redirectMap(), sitemapRows()]);
  const [pages, products, lps, blocks] = await Promise.all([
    db.select({ slug: schema.pages.slug }).from(schema.pages).where(eq(schema.pages.status, 'PUBLISHED')),
    db.select({ slug: schema.products.slug }).from(schema.products).where(and(eq(schema.products.status, 'PUBLISHED'), eq(schema.products.whmcsRetired, false))),
    db.select({ slug: schema.landingPages.slug }).from(schema.landingPages).where(eq(schema.landingPages.status, 'PUBLISHED')),
    db.select({ key: schema.blocks.key }).from(schema.blocks).where(like(schema.blocks.key, 'tp-%')),
  ]);
  await each(pages, (p) => Promise.all([cachedPage(p.slug), loadLegacy(p.slug)]));
  // /p/<slug> is rendered by the theme from the catalog; the CMS product page only serves the original theme
  if (cat.settings.site_theme !== 'hostpen') await each(products, (p) => cachedProductPage(p.slug));
  await each(lps, (l) => landingRow(l.slug));
  await each(blocks, (b) => blockHtml(b.key));

  const dump = snapshotDump(true);
  if (!('settings' in dump) || !('theme-catalog' in dump)) throw new Error('settings / catalog could not be read');
  const json = JSON.stringify({ ...dump, __meta: { at: new Date().toISOString(), sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local' } });
  fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
  fs.writeFileSync(out, json);
  console.log(`[snapshot] ${Object.keys(dump).length} entries, ${(json.length / 1024).toFixed(0)} KB in ${Date.now() - t0}ms → ${out}`);
}

main().then(() => process.exit(0), (e) => { console.warn('[snapshot] database read failed:', String(e?.message || e).slice(0, 200)); process.exit(2); });
