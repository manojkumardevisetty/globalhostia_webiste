// Runs on every deploy (and locally): applies SQL migrations, then seeds an
// empty database from legacy/seed.json and creates the first owner account.
// Idempotent — never overwrites existing content.
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url) { console.log('[db-setup] no DATABASE_URL — skipping'); process.exit(0); }
const sql = postgres(url, { max: 1, onnotice: () => {} });
const id = () => Date.now().toString(36) + randomBytes(8).toString('hex');

try {
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
  console.log('[db-setup] migrations applied');

  // first owner
  const [{ n: users }] = await sql`select count(*)::int n from admin_users`;
  if (users === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@globalhostia.com').toLowerCase();
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) console.warn('[db-setup] ADMIN_PASSWORD not set — no admin user created');
    else {
      await sql`insert into admin_users (id,email,name,password_hash,role) values (${id()},${email},'Owner',${await bcrypt.hash(pw, 12)},'OWNER')`;
      console.log('[db-setup] owner created:', email);
    }
  }

  // default settings
  const defaults = {
    site_name: 'GlobalHostia', site_url: 'https://globalhostia.com', phone: '(+971) 50-7341578', email: 'support@globalhostia.com',
    company: 'Desert Tech Cloud Services LLC', currency: 'USD', default_cycle: 'auto',
    whmcs_base_url: process.env.WHMCS_BASE_URL || 'https://globalhostia.com/secure',
    order_button_label: 'Order Now', custom_css: '', custom_head: '', maintenance: false,
    sync_auto: true, publish_new_products: true, domain_suggest_tlds: ['.com', '.net', '.org', '.ae', '.io', '.shop', '.online', '.co'],
  };
  for (const [k, v] of Object.entries(defaults)) await sql`insert into settings (key,value) values (${k},${JSON.stringify(v)}::jsonb) on conflict (key) do nothing`;

  // content seed
  const [{ n: pageCount }] = await sql`select count(*)::int n from pages`;
  if (pageCount === 0 && fs.existsSync('legacy/seed.json')) {
    const seed = JSON.parse(fs.readFileSync('legacy/seed.json', 'utf8'));
    await sql.begin(async (tx) => {
      for (const [key, b] of Object.entries(seed.blocks)) await tx`insert into blocks (key,name,html) values (${key},${b.name},${b.html}) on conflict do nothing`;
      for (const c of seed.categories) await tx`insert into categories (id,slug,name,sort_order) values (${id()},${c.slug},${c.name},${c.sortOrder}) on conflict (slug) do nothing`;
      for (const p of seed.pages) {
        const pid = id();
        await tx`insert into pages (id,slug,title,seo_title,seo_description,seo_keywords,og_image,body_class,wrapper_class,head_extra,
          body_start_block,header_block,footer_block,body_end_block)
          values (${pid},${p.slug},${p.title},${p.seoTitle},${p.seoDescription},${p.seoKeywords},${p.ogImage || ''},${p.bodyClass},${p.wrapperClass},${p.headExtra},
          ${p.blocks.bodyStart},${p.blocks.header},${p.blocks.footer},${p.blocks.bodyEnd})`;
        for (const s of p.sections)
          await tx`insert into sections (id,page_id,type,name,sort_order,html,data) values (${id()},${pid},${s.type},${s.name},${s.sortOrder},${s.html || ''},${JSON.stringify(s.data || {})}::jsonb)`;
      }
      for (const r of seed.redirects) await tx`insert into redirects (id,"from","to") values (${id()},${r.from},${r.to}) on conflict do nothing`;
    });
    console.log(`[db-setup] seeded ${seed.pages.length} pages from legacy site`);
  }
} catch (e) {
  console.error('[db-setup] FAILED', e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
