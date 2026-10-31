// DEV ONLY: fills a local database with a realistic catalog (products from the original
// site pages + the prices they showed) so themes can be built without the live WHMCS.
// Usage: DATABASE_URL=postgres://.../gh_theme node scripts/dev-fixture.mjs
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { enrichment } from '../lib/enrich-core.mjs';

const url = process.env.DATABASE_URL;
if (!url || /neon|vercel/i.test(url)) throw new Error('dev-fixture refuses to run against a non-local database');
const sql = postgres(url);
const details = JSON.parse(readFileSync(new URL('../legacy/product-details.json', import.meta.url)));
const content = JSON.parse(readFileSync(new URL('../public/previews/content.json', import.meta.url)));

const cats = Object.fromEntries((await sql`select id, slug from categories`).map((c) => [c.slug, c.id]));
const extra = [['wordpress-hosting', 'WordPress Hosting'], ['cpanel-reseller', 'cPanel Reseller Hosting'], ['business-email', 'Business Email']];
for (const [slug, name] of extra) if (!cats[slug]) cats[slug] = (await sql`insert into categories (id, slug, name) values (gen_random_uuid()::text, ${slug}, ${name}) returning id`)[0].id;

const shared = content.sharedHostingYearly;
let pid = 100, n = 0;
for (const [key, d] of Object.entries(details)) {
  const [group, slug] = key.split('/');
  if (!cats[group]) continue;
  const e = enrichment(details, `https://globalhostia.com/secure/store/${key}`, slug) || {};
  const name = d.name && !/^most popular$/i.test(d.name) ? d.name : slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  const retired = /EOL/i.test(d.badge || '') && false;
  const [p] = await sql`insert into products (id, category_id, slug, name, tagline, description, features, attributes, badge, status, whmcs_pid, whmcs_url, whmcs_retired, sort_order)
    values (gen_random_uuid()::text, ${cats[group]}, ${slug}, ${name}, ${e.tagline || d.description || ''}, ${d.description || ''}, ${sql.json(e.features || d.features || [])}, ${sql.json(e.attributes || {})},
      ${e.badge || d.badge || ''}, 'PUBLISHED', ${pid++}, ${'https://globalhostia.com/secure/store/' + key}, ${retired}, ${n++})
    on conflict (slug) do nothing returning id`;
  if (!p) continue;
  const base = Object.entries(shared).find(([k]) => name.startsWith(k));
  const monthly = d.attrs?.price ? Number(d.attrs.price) : null;
  if (monthly) await sql`insert into product_prices (id, product_id, currency, prefix, cycle, price) values (gen_random_uuid()::text, ${p.id}, 'USD', '$', 'monthly', ${monthly})`;
  if (base) {
    await sql`insert into product_prices (id, product_id, currency, prefix, cycle, price) values (gen_random_uuid()::text, ${p.id}, 'USD', '$', 'annually', ${base[1]})`;
    await sql`insert into product_prices (id, product_id, currency, prefix, cycle, price) values (gen_random_uuid()::text, ${p.id}, 'USD', '$', 'monthly', ${Math.round(base[1] / 10 * 100) / 100 + 0.5})`;
  }
}
for (const [tld, price] of [...content.tldsSample, ['.io', 39.99], ['.ai', 79.99], ['.co', 11.99], ['.xyz', 1.99], ['.store', 3.99], ['.tech', 6.99], ['.online', 2.49]])
  await sql`insert into tlds (id, tld, currency, register, transfer, renew, visible) values (gen_random_uuid()::text, ${tld}, 'USD', ${price}, ${price}, ${Math.round(price * 1.6 * 100) / 100}, true) on conflict (tld) do nothing`;
console.log('fixture:', n, 'products,', (await sql`select count(*)::int c from tlds`)[0].c, 'tlds');
await sql.end();
