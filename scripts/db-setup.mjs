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

  // ---- one-time content patches (idempotent, tracked in settings.patches) ----
  const [pr] = await sql`select value from settings where key = 'patches'`;
  const applied = new Set(pr?.value || []);
  const PATCHES = {
    // 1. hard-coded WHMCS URLs -> {{whmcs_url}} token, so moving WHMCS (e.g. my.globalhostia.com) is one setting
    '001-whmcs-url-token': async (tx) => {
      for (const u of ['https://www.globalhostia.com/secure', 'https://globalhostia.com/secure', 'http://globalhostia.com/secure', 'http://www.globalhostia.com/secure']) {
        await tx`update sections set html = replace(html, ${u}, '{{whmcs_url}}'), data = replace(data::text, ${u}, '{{whmcs_url}}')::jsonb`;
        await tx`update blocks set html = replace(html, ${u}, '{{whmcs_url}}')`;
      }
    },
    // 2. broken domain search forms -> live WHMCS availability results on the same page
    '002-domain-search': async (tx) => {
      const fixes = [
        ['domains-registration', `action="#" method="GET"`, `action="/domains-registration" method="GET"`],
        ['aws-pro-domains-search', `method="post" action="https://emyui.coodiv.net/whmcs-aws/domainchecker.php"`, `method="get" action="/aws-pro-domains-search"`],
      ];
      for (const [slug, from, to] of fixes) {
        const [pg] = await tx`select id from pages where slug = ${slug}`;
        if (!pg) continue;
        const [sec] = await tx`select id, sort_order from sections where page_id = ${pg.id} and html like ${'%' + from + '%'} limit 1`;
        if (!sec) continue;
        await tx`update sections set html = replace(replace(html, ${from}, ${to}), '<input type="hidden" name="plid" value="587345">', '') where id = ${sec.id}`;
        const [has] = await tx`select id from sections where page_id = ${pg.id} and type = 'domain_results'`;
        if (!has) {
          await tx`update sections set sort_order = sort_order + 1 where page_id = ${pg.id} and sort_order > ${sec.sort_order}`;
          await tx`insert into sections (id,page_id,type,name,sort_order,data) values (${id()},${pg.id},'domain_results','Domain search results (live WHMCS)',${sec.sort_order + 1},${JSON.stringify({ wrapperClass: 'pt-10 pb-15' })}::jsonb)`;
        }
      }
    },
    // 3. template "add to cart" forms that posted nowhere -> WHMCS store
    '003-dead-cart-forms': async (tx) => {
      await tx`update sections set html = regexp_replace(html, '<form class="rstore-add-to-cart-form" method="POST" action="[^"]*">', '<form class="rstore-add-to-cart-form" method="GET" action="{{whmcs_url}}/cart.php">', 'g')`;
    },
    // 4. placeholder text in support popup; template TLD slider with fake prices -> real WHMCS TLD price table
    '004-placeholders': async (tx) => {
      await tx`update blocks set html = replace(html, 'Lorem ipsum dolor sit amet consectetur adipisicing elit', 'Leave us a message or open a ticket and we will reply as soon as possible.')`;
      await tx`update blocks set html = replace(html, 'All of our support team are busy right now :(', 'Our team is helping other customers right now')`;
      const [pg] = await tx`select id from pages where slug = 'domains-registration'`;
      if (pg) {
        const [sl] = await tx`select id, sort_order from sections where page_id = ${pg.id} and html ~* 'dummy text' and name = 'single slide boxes' limit 1`;
        if (sl) {
          await tx`update sections set visible = false, name = 'single slide boxes (template prices — hidden)' where id = ${sl.id}`;
          await tx`update sections set sort_order = sort_order + 1 where page_id = ${pg.id} and sort_order > ${sl.sort_order}`;
          await tx`insert into sections (id,page_id,type,name,sort_order,data) values (${id()},${pg.id},'tld_pricing','Domain prices (live WHMCS)',${sl.sort_order + 1},${JSON.stringify({ title: 'Domain extension pricing', limit: 40, wrapperClass: 'pt-13 pb-15 bg-default-4' })}::jsonb)`;
        }
      }
    },
  };
  for (const [key, fn] of Object.entries(PATCHES)) {
    if (applied.has(key)) continue;
    await sql.begin(fn);
    applied.add(key);
    await sql`insert into settings (key,value) values ('patches', ${JSON.stringify([...applied])}::jsonb) on conflict (key) do update set value = excluded.value`;
    console.log('[db-setup] patch applied:', key);
  }
} catch (e) {
  console.error('[db-setup] FAILED', e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
