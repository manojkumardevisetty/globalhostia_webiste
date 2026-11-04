// Runs on every deploy (and locally): applies SQL migrations, then seeds an
// empty database from legacy/seed.json and creates the first owner account.
// Idempotent — never overwrites existing content.
// Fast path: one query compares a fingerprint of this script, its seeds and the migrations with the one stored by the
// last successful run (settings.setup_fingerprint); when nothing changed the step ends there.
// Never fails the build because the database is unreachable or over its plan quota: it warns and the deploy goes on
// (pages then use the last-known-good snapshot, lib/lkg.ts).
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { enrichment } from '../lib/enrich-core.mjs';
import { BLOG_SEED, BLOG_SEED_V1 } from './blog-seed.mjs';
import { ALIAS_REDIRECTS } from '../lib/aliases.mjs';
import { SEED_IDEAS } from '../lib/content/seed-ideas.mjs';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url) { console.log('[db-setup] no DATABASE_URL — skipping'); process.exit(0); }
const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10 });
const id = () => Date.now().toString(36) + randomBytes(8).toString('hex');

const FINGERPRINT = (() => {
  const h = createHash('sha256');
  const files = ['scripts/db-setup.mjs', 'scripts/blog-seed.mjs', 'scripts/landing-seed.mjs', 'scripts/store-seed.mjs', 'lib/enrich-core.mjs', 'lib/aliases.mjs', 'lib/content/seed-ideas.mjs', 'drizzle/meta/_journal.json',
    ...fs.readdirSync('drizzle').filter((f) => f.endsWith('.sql')).sort().map((f) => `drizzle/${f}`)];
  for (const f of files) { h.update(f); try { h.update(fs.readFileSync(f)); } catch { h.update('-'); } }
  return h.digest('hex').slice(0, 24);
})();
// connection refused / DNS / timeout, SQLSTATE class 08 (connection), 53 (insufficient resources: Neon "exceeded the
// quota" is 53000), 57P (shutdown), XX000 (Neon "endpoint is disabled")
const unreachable = (e) => /^(08|53|57P|XX000|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|CONNECT_TIMEOUT|CONNECTION_)/.test(String(e?.code || e?.errno || ''))
  || /quota|connect(ion)? (timeout|refused|terminated)|getaddrinfo|endpoint .*(disabled|suspended)/i.test(String(e?.message || ''));

try {
  // a fresh database has no settings table yet: that error just means "run everything"
  const [fp] = await sql`select value from settings where key = 'setup_fingerprint'`.catch((e) => { if (unreachable(e)) throw e; return []; });
  if (fp?.value === FINGERPRINT) {
    console.log('[db-setup] up to date (fingerprint ' + FINGERPRINT + '), nothing to do');
  } else {
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
    company: 'GlobalHostia', currency: 'USD', default_cycle: 'auto',
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
    // 5. real GlobalHostia copy instead of theme placeholders / template brand names / Envato FAQs
    '005-real-content': async (tx) => {
      // 5a. sections rewritten by scripts/write-content.py (only if still untouched placeholder text)
      const rewritten = JSON.parse(fs.readFileSync('legacy/content-005.json', 'utf8'));
      for (const [slug, secs] of Object.entries(rewritten)) {
        for (const [name, html] of Object.entries(secs)) {
          await tx`update sections set html = ${html} where name = ${name} and html ~* '(lorem ipsum|dummy text)' and page_id = (select id from pages where slug = ${slug})`;
        }
      }
      // 5b. template brand leftovers everywhere (sections + blocks)
      const swaps = [
        ['Customers visit Albino every month to get their service done.', 'Customers trust GlobalHostia every month to keep their websites online.'],
        ['Join over 18.000 satisfied customers already using coodiv.net and make your content load faster..', 'Join the businesses already hosting with GlobalHostia and make your content load faster.'],
        ['All Coodiv cloulds hosting options.', 'All GlobalHostia cloud hosting options.'],
        ['Holy guacamole! coodiv.net is Registered', 'Sorry — this domain is already registered'],
        ['Copyright © 2022 EMYUI AWS theme demo. All Rights Reserved., Made with', 'Copyright © {{year}} GlobalHostia · {{company}}. All rights reserved.'],
        ['support@coodiv.net', '{{email}}'], ['Branding Design at Coodiv', 'Hosting tips from GlobalHostia'], ['Branding Design at coodiv', 'Hosting tips from GlobalHostia'],
        ['Coodiv-Cache', 'GlobalHostia Cache'], ['coodiv.net', 'globalhostia.com'], ['Albino', 'GlobalHostia'],
      ];
      for (const [a, b] of swaps) {
        await tx`update sections set html = replace(html, ${a}, ${b}) where html like ${'%' + a + '%'}`;
        await tx`update blocks set html = replace(html, ${a}, ${b}) where html like ${'%' + a + '%'}`;
      }
      // 5c. template FAQ (wrong questions, empty answers) -> the real homepage FAQ, same design
      const [home] = await tx`select s.html from sections s join pages p on p.id = s.page_id where p.slug = 'index' and s.name = 'faq section' limit 1`;
      if (home) await tx`update sections set html = ${home.html} where html like '%how can i order new host ?%' and html like '%Search for quastions here%'`;
      // 5d. Envato licence FAQs -> hide, add page-specific live FAQ (with Google FAQ schema)
      const faqs = JSON.parse(fs.readFileSync('legacy/faq-content.json', 'utf8'));
      for (const [slug, f] of Object.entries(faqs)) {
        const [pg] = await tx`select id from pages where slug = ${slug}`;
        if (!pg) continue;
        const [old] = await tx`select id, sort_order from sections where page_id = ${pg.id} and html like '%Envato%' limit 1`;
        if (!old) continue;
        await tx`update sections set visible = false, name = ${'template FAQ (hidden)'} where id = ${old.id}`;
        await tx`update sections set sort_order = sort_order + 1 where page_id = ${pg.id} and sort_order > ${old.sort_order}`;
        await tx`insert into sections (id,page_id,type,name,sort_order,data) values (${id()},${pg.id},'faq','FAQ',${old.sort_order + 1},${JSON.stringify({ ...f, wrapperClass: 'pt-15 pb-15' })}::jsonb)`;
      }
      // 5e. fake team member (template author) and demo blog -> hidden; demo blog URLs -> Help Center
      await tx`update sections set visible = false where name = 'our team section' and html like '%Nedjai%'`;
      await tx`update pages set status = 'DRAFT', in_sitemap = false where slug in ('blog','blog-2','blog-3','blog-single','blog-single-2')`;
      for (const s of ['blog', 'blog-2', 'blog-3', 'blog-single', 'blog-single-2']) {
        await tx`insert into redirects (id,"from","to",code) values (${id()},${'/' + s},'/help-center',302) on conflict ("from") do nothing`;
      }
    },
    '006-more-leftovers': async (tx) => {
      for (const [a, b] of [['EMYUI EMAIL SERVICES', 'GLOBALHOSTIA EMAIL SERVICES'], ['EMYUI', 'GlobalHostia']]) {
        await tx`update sections set html = replace(html, ${a}, ${b}) where html like ${'%' + a + '%'}`;
        await tx`update blocks set html = replace(html, ${a}, ${b}) where html like ${'%' + a + '%'}`;
      }
      const f = JSON.parse(fs.readFileSync('legacy/faq-content.json', 'utf8')).about;
      const [pg] = await tx`select id from pages where slug = 'about'`;
      const [old] = pg ? await tx`select id, sort_order from sections where page_id = ${pg.id} and html like '%Envato%' and visible limit 1` : [];
      if (old) {
        await tx`update sections set visible = false, name = 'template FAQ (hidden)' where id = ${old.id}`;
        await tx`update sections set sort_order = sort_order + 1 where page_id = ${pg.id} and sort_order > ${old.sort_order}`;
        await tx`insert into sections (id,page_id,type,name,sort_order,data) values (${id()},${pg.id},'faq','FAQ',${old.sort_order + 1},${JSON.stringify({ ...f, wrapperClass: 'pt-15 pb-15' })}::jsonb)`;
      }
    },
    // 7. template pricing tables with fake prices -> hidden; live WHMCS product sections instead
    '007-fake-prices': async (tx) => {
      const FAKE = `(Hatchling|Renews Nov\\. 2025|287\\.64|\\$2\\.75/mo|free for 14 days|€)`;
      const plan = [
        ['web-hosting', 'tables section', null], ['ssl-certificate', 'services iformations wrapper', null],
        ['shared-hosting', 'tables section', [['hostia-shared', 'hosting-usa', 'hosting-singapore'], 'plan-card', 'Shared hosting plans']],
        ['cloudvps-hosting', 'tables section', [['hostiavps'], 'plan-card', 'Cloud VPS plans']],
        ['vps-2', 'tables section', [['hostiavps'], 'plan-card', 'VPS plans']],
        ['aws-pro-vps-hosting', 'page section', [['hostiavps', 'forex-vps'], 'plan-card', 'VPS hosting plans']],
        ['aws-pro-vps-hosting', 'services iformations wrapper', null],
        ['aws-pro-cpanel-hosting', 'page section', [['hostia-shared', 'hosting-usa', 'hosting-singapore'], 'plan-card', 'cPanel hosting plans']],
        ['aws-pro-dedicated-server', 'services iformations wrapper', [['dedicated-servers', 'premiumdedicated-servers'], 'server-row', 'Dedicated servers']],
      ];
      for (const [slug, name, dyn] of plan) {
        const [pg] = await tx`select id from pages where slug = ${slug}`;
        if (!pg) continue;
        const [sec] = await tx`select id, sort_order from sections where page_id = ${pg.id} and name = ${name} and visible and html ~* ${FAKE} limit 1`;
        if (!sec) continue;
        await tx`update sections set visible = false, name = ${name + ' (template prices — hidden)'} where id = ${sec.id}`;
        if (dyn) {
          const [cats, template, title] = dyn;
          await tx`update sections set sort_order = sort_order + 1 where page_id = ${pg.id} and sort_order > ${sec.sort_order}`;
          await tx`insert into sections (id,page_id,type,name,sort_order,data) values (${id()},${pg.id},'products',${'Products: ' + cats.join(', ')},${sec.sort_order + 1},
            ${JSON.stringify({ categories: cats, template, layout: 'auto', title, subtitle: 'Live prices from our billing system', wrapperClass: 'pt-15 pb-15', fallbackHtml: '' })}::jsonb)`;
        }
      }
    },
    '008-fake-contacts': async (tx) => {
      for (const [a, b] of [['+123 456 78 90 11', '{{phone}}'], ['experience batter !', 'experience better!'], ['experience batter!', 'experience better!']]) {
        await tx`update sections set html = replace(html, ${a}, ${b}) where html like ${'%' + a + '%'}`;
        await tx`update blocks set html = replace(html, ${a}, ${b}) where html like ${'%' + a + '%'}`;
      }
    },
    '009-fake-phone-2': async (tx) => {
      await tx`update sections set html = replace(html, '+123-456-6788-99', '{{phone}}') where html like '%+123-456-6788-99%'`;
      await tx`update blocks set html = replace(html, '+123-456-6788-99', '{{phone}}') where html like '%+123-456-6788-99%'`;
    },
    // 10. product details from the original website -> WHMCS products (specs, features, taglines, badges)
    '010-product-details': async (tx) => {
      const details = JSON.parse(fs.readFileSync('legacy/product-details.json', 'utf8'));
      const prods = await tx`select id, slug, whmcs_url, features from products where content_locked = false`;
      for (const p of prods) {
        const e = enrichment(details, p.whmcs_url, p.slug);
        if (!e) continue;
        const feats = e.features.length >= (p.features || []).length ? e.features : p.features;
        await tx`update products set tagline = ${e.tagline}, features = ${JSON.stringify(feats)}::jsonb, attributes = ${JSON.stringify(e.attributes)}::jsonb,
          badge = case when badge = '' then ${e.badge} else badge end, updated_at = now() where id = ${p.id}`;
      }
      await tx`update categories set name = 'Shared Hosting – Malaysia' where slug = 'hostia-shared' and name = 'Shared Hosting'`;
      // original tab order on Web Hosting: USA, Malaysia, Singapore
      await tx`update sections set data = jsonb_set(data, '{categories}', '["hosting-usa","hostia-shared","hosting-singapore"]'::jsonb)
        where type = 'products' and page_id = (select id from pages where slug = 'web-hosting') and data->'categories' ? 'hostia-shared'`;
    },
    // 11. menu & footer-link partials (loaded by the theme JS) become editable blocks
    '011-menu-partials': async (tx) => {
      const names = { 'header-navbar': 'Main menu', 'header-navbar-vpn': 'Main menu – VPN pages', 'header-navbar-aws': 'Main menu – Pro pages', 'header-navbar-aws-pro': 'Main menu – Pro hosting',
        'footer': 'Footer links', 'footer-aws': 'Footer links – Pro pages', 'languages': 'Language selector' };
      for (const [f, label] of Object.entries(names)) {
        const file = `legacy/template-part/${f}.html`;
        if (!fs.existsSync(file)) continue;
        await tx`insert into blocks (key,name,html) values (${'tp-' + f},${label},${fs.readFileSync(file, 'utf8')}) on conflict (key) do nothing`;
      }
    },
    '012-config-options': async (tx) => {
      await tx`alter table products add column if not exists config_options jsonb not null default '[]'::jsonb`;
      // categories for the VPS Automation (rdp.monster) catalog, with SEO text; existing ones only get empty fields filled
      const cats = [
        ['windows-rdp', 'Windows RDP', 'Always-on Windows desktops in the cloud for trading platforms, bots and remote work.',
          'Windows RDP Server | Always-On Remote Desktop', 'Buy a Windows RDP server with NVMe storage and full administrator access. Connect from any device, set up automatically after payment.'],
        ['hostiavps', 'VPS Hosting', 'Linux and Windows KVM VPS in Europe and the USA with NVMe storage and full root access.',
          'VPS Hosting in Europe & USA | Linux and Windows KVM VPS', 'KVM VPS with NVMe storage, full root access and your choice of Ubuntu, Debian, CentOS, Kali or Windows Server. Automatic setup in minutes.'],
      ];
      for (const [slug, name, d, st, sd] of cats) {
        await tx`insert into categories (id, slug, name, description, seo_title, seo_description) values (gen_random_uuid()::text, ${slug}, ${name}, ${d}, ${st}, ${sd})
          on conflict (slug) do update set description = case when categories.description = '' then excluded.description else categories.description end,
            seo_title = case when categories.seo_title = '' then excluded.seo_title else categories.seo_title end,
            seo_description = case when categories.seo_description = '' then excluded.seo_description else categories.seo_description end`;
      }
    },
    // 13. blog: posts table (Markdown articles), /blog no longer redirected to the help center, 3 starter drafts
    '013-blog': async (tx) => {
      await tx`create table if not exists posts (
        id text primary key,
        slug text not null unique,
        title text not null,
        excerpt text not null default '',
        body text not null default '',
        cover_image text not null default '',
        cover_alt text not null default '',
        category text not null default '',
        tags jsonb not null default '[]'::jsonb,
        author text not null default '',
        status status not null default 'DRAFT',
        publish_at timestamptz,
        featured boolean not null default false,
        seo_title text not null default '',
        seo_description text not null default '',
        og_image text not null default '',
        canonical text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`;
      await tx`create index if not exists posts_status_publish_idx on posts (status, publish_at)`;
      // patch 005 parked the template's demo blog: /blog -> /help-center. The real blog lives there now.
      await tx`delete from redirects where lower("from") = '/blog' and "to" = '/help-center'`;
      await tx`update redirects set "to" = '/blog' where "from" in ('/blog-2', '/blog-3', '/blog-single', '/blog-single-2') and "to" = '/help-center'`;
      const [{ n }] = await tx`select count(*)::int n from posts`;
      if (n === 0) {
        for (const p of BLOG_SEED) {
          await tx`insert into posts (id, slug, title, excerpt, body, cover_image, cover_alt, category, tags, author, status, seo_title, seo_description)
            values (${id()}, ${p.slug}, ${p.title}, ${p.excerpt}, ${p.body}, ${p.coverImage}, ${p.coverAlt}, ${p.category}, ${JSON.stringify(p.tags)}::jsonb,
              'Globalhostia Team', 'DRAFT', ${p.seoTitle}, ${p.seoDescription}) on conflict (slug) do nothing`;
        }
      }
    },
    // 15. blog: cover style, key takeaways, recommended products per post
    '015-blog-extras': async (tx) => {
      await tx`alter table posts add column if not exists cover_style text not null default 'branded'`;
      await tx`alter table posts add column if not exists takeaways text not null default ''`;
      await tx`alter table posts add column if not exists related_products jsonb not null default '[]'::jsonb`;
      await tx`alter table posts add column if not exists focus_keyword text not null default ''`;
      await tx`alter table posts add column if not exists secondary_keywords text not null default ''`;
    },
    // 16. expanded starter articles (v2) — only for posts whose text nobody has edited since the v1 seed
    '016-blog-content-v2': async (tx) => {
      for (const p of BLOG_SEED) {
        const v1 = BLOG_SEED_V1.find((x) => x.slug === p.slug);
        await tx`update posts set title = ${p.title}, excerpt = ${p.excerpt}, body = ${p.body}, cover_image = ${p.coverImage}, cover_alt = ${p.coverAlt},
            category = ${p.category}, tags = ${JSON.stringify(p.tags)}::jsonb, seo_title = ${p.seoTitle}, seo_description = ${p.seoDescription},
            focus_keyword = ${p.focusKeyword}, secondary_keywords = ${p.secondaryKeywords}, takeaways = ${p.takeaways}, cover_style = ${p.coverStyle}, updated_at = now()
          where slug = ${p.slug} and (body = ${v1 ? v1.body : p.body} or body = ${p.body})`;
      }
    },
    '014-tld-prices': async (tx) => {
      await tx`create table if not exists tld_prices (tld text not null, currency text not null, register numeric(12,2), transfer numeric(12,2), renew numeric(12,2), synced_at timestamptz)`;
      await tx`create unique index if not exists tld_prices_tld_cur on tld_prices (tld, currency)`;
    },
    // 15. SEO: duplicate template alias pages (/aws-pro-*, /vps-2) now 301 to their main page (next.config.mjs).
    // Point old *.html redirects straight at the final URL (no redirect chains) and keep aliases and the
    // noindex incident pages out of the sitemap.
    '015-seo-alias-redirects': async (tx) => {
      for (const [slug, to] of Object.entries(ALIAS_REDIRECTS)) {
        await tx`update redirects set "to" = ${to} where lower("to") = ${'/' + slug}`;
        await tx`update pages set in_sitemap = false where slug = ${slug}`;
      }
      await tx`update pages set in_sitemap = false where slug in ('incident-post', 'incident-history')`;
    },
    // 17. support notifier: which ticket activity the owner was already emailed about (lib/support-notify.ts)
    '017-ticket-notify': async (tx) => {
      await tx`create table if not exists ticket_notify (
        ticket_id integer primary key,
        tid text not null default '',
        last_reply text not null,
        status text not null default '',
        notified_at timestamptz not null default now()
      )`;
      await tx`insert into settings (key,value) values ('support_notify_clientid', '1'::jsonb) on conflict (key) do nothing`;
      await tx`insert into settings (key,value) values ('support_admin_username', '""'::jsonb) on conflict (key) do nothing`;
    },
    // 18. /admin/emails: backups of the WHMCS email design settings before they are changed
    '018-email-design-backups': async (tx) => {
      await tx`create table if not exists email_design_backups (
        id text primary key,
        values jsonb not null,
        note text not null default '',
        user_email text not null,
        created_at timestamptz not null default now(),
        restored_at timestamptz
      )`;
      await tx`create index if not exists email_backup_created_idx on email_design_backups (created_at)`;
    },
    // 17. lead capture (Admin → Marketing → Leads). Stored only; never emailed automatically.
    '017-leads': async (tx) => {
      await tx`create table if not exists leads (
        id text primary key, email text not null, name text not null default '', phone text not null default '',
        source text not null default '', page text not null default '',
        utm_source text not null default '', utm_medium text not null default '', utm_campaign text not null default '',
        utm_term text not null default '', utm_content text not null default '',
        country text not null default '', interest text not null default '', consent boolean not null default false,
        ip_hash text not null default '', status text not null default 'new', notes text not null default '',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create index if not exists leads_email_created_idx on leads (email, created_at)`;
      await tx`create index if not exists leads_created_idx on leads (created_at)`;
      await tx`create index if not exists leads_ip_created_idx on leads (ip_hash, created_at)`;
    },
    // 18. ad landing pages /lp/<slug> + five starter DRAFTS pointing at real catalog entries (owner publishes them)
    '018-landing-pages': async (tx) => {
      await tx`create table if not exists landing_pages (
        id text primary key, slug text not null unique, name text not null default '', headline text not null default '',
        subheadline text not null default '', target text not null default '', product_slug text not null default '',
        benefits jsonb not null default '[]'::jsonb, faq jsonb not null default '[]'::jsonb, cta_label text not null default '',
        show_lead_form boolean not null default true, show_trust boolean not null default true, noindex boolean not null default true,
        status status not null default 'DRAFT', seo_title text not null default '', seo_description text not null default '',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      const { LANDING_SEED } = await import('./landing-seed.mjs');
      for (const lp of LANDING_SEED) {
        let target = lp.targets[0];
        for (const t of lp.targets) {
          const [kind, ref] = [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)];
          const [{ n }] = kind === 'cat'
            ? await tx`select count(*)::int n from products p join categories c on c.id = p.category_id where c.slug = ${ref} and p.status = 'PUBLISHED' and p.whmcs_retired = false`
            : kind === 'tld' ? await tx`select count(*)::int n from tlds where tld = ${ref}` : [{ n: 1 }];
          if (n > 0) { target = t; break; }
        }
        await tx`insert into landing_pages (id, slug, name, headline, subheadline, target, benefits, faq, cta_label, status)
          values (${id()}, ${lp.slug}, ${lp.name}, ${lp.headline}, ${lp.subheadline}, ${target}, ${JSON.stringify(lp.benefits)}::jsonb,
            ${JSON.stringify(lp.faq)}::jsonb, ${lp.ctaLabel}, 'DRAFT') on conflict (slug) do nothing`;
      }
    },
    // 18. Domain Broker Service: request pipeline table + fee settings (owner's pricing; pid filled by ensureBrokerProduct).
    '018-broker': async (tx) => {
      await tx`create table if not exists broker_requests (
        id text primary key, ref text not null unique, domain text not null, budget_min numeric(14,2), budget_max numeric(14,2),
        currency text not null default 'USD', name text not null, email text not null, phone text not null default '', notes text not null default '',
        use text not null default '', status text not null default 'new', assigned text not null default '', owner_contacted_at timestamptz,
        agreed_price numeric(14,2), commission numeric(14,2), outcome_notes text not null default '', ticket_id text not null default '',
        ticket_num text not null default '', utm_source text not null default '', utm_medium text not null default '', utm_campaign text not null default '',
        referrer text not null default '', ip_hash text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create index if not exists broker_status_idx on broker_requests (status, created_at)`;
      for (const [k, v] of Object.entries({ broker_fee_usd: 79, broker_commission_pct: 15, broker_min_commission_usd: 100, broker_whmcs_pid: '', broker_department_id: '' }))
        await tx`insert into settings (key,value) values (${k},${JSON.stringify(v)}::jsonb) on conflict (key) do nothing`;
    },
    // 19. Site links (Admin → Website → Site links): category families, footer columns, TLD/use-case/location text and
    // cart offers live in settings.site_links. Empty object = everything automatic from the catalog, built-in defaults.
    '019-site-links-dyn': async (tx) => {
      await tx`insert into settings (key,value) values ('site_links', ${JSON.stringify({ autoMenu: true, categoryTypes: {}, tldBlurbs: {}, useCases: {}, locations: {}, footerExtra: null, offers: { ssl: '', hosting: '' } })}::jsonb) on conflict (key) do nothing`;
    },
    // 20. Categories that exist now keep surfacing automatically; categories first seen after this (admin or WHMCS sync)
    // wait in Admin → Site links → "New categories: review" until the owner switches them on.
    '020-site-links-seen': async (tx) => {
      await tx`insert into settings (key,value) values ('site_links', '{}'::jsonb) on conflict (key) do nothing`;
      await tx`update settings set value = jsonb_set(case when jsonb_typeof(value) = 'object' then value else '{}'::jsonb end, '{seen}',
        (select coalesce(jsonb_agg(slug order by slug), '[]'::jsonb) from categories)) where key = 'site_links'`;
    },
    // 21. Portal DNS editor: zones created on the DNS-only DirectAdmin account, owned by one WHMCS client each.
    '021-dns-zones': async (tx) => {
      await tx`create table if not exists dns_zones (
        id text primary key, domain text not null unique, whmcs_domain_id integer, client_id integer not null,
        server_id text not null, da_user text not null, created_at timestamptz not null default now())`;
      await tx`create index if not exists dns_zones_client_idx on dns_zones (client_id)`;
    },
    // 23. Business services shop (/business-services): section + category rows and settings.business_services, only where
    // missing (existing categories such as ssl-certificates are never changed). The shop stays unpublished until the owner
    // switches it on in Admin → Business services. New rows are not added to site_links.seen, so they never surface in the
    // automatic menus or /category pages; the shop has its own pages and menu entry.
    '023-business-services': async (tx) => {
      const { STORE_SECTIONS, STORE_ENTRIES, storeConfigSeed } = await import('./store-seed.mjs');
      const sectionIds = {};
      let order = 200;
      for (const s of STORE_SECTIONS) {
        await tx`insert into categories (id, slug, name, description, seo_title, seo_description, sort_order) values (${id()}, ${s.slug}, ${s.name}, ${s.description}, ${s.seoTitle}, ${s.seoDescription}, ${order++})
          on conflict (slug) do nothing`;
        const [row] = await tx`select id from categories where slug = ${s.slug}`;
        sectionIds[s.slug] = row.id;
      }
      for (const e of STORE_ENTRIES) {
        await tx`insert into categories (id, slug, name, description, seo_title, seo_description, parent_id, sort_order)
          values (${id()}, ${e.slug}, ${e.name}, ${e.description}, ${e.seoTitle}, ${e.seoDescription}, ${sectionIds[e.section] || null}, ${order++})
          on conflict (slug) do nothing`;
      }
      await tx`insert into settings (key, value) values ('business_services', ${JSON.stringify(storeConfigSeed())}::jsonb) on conflict (key) do nothing`;
    },
    // 22. Portal web push: browser subscriptions per WHMCS client + a sent log so each notification goes out once.
    '022-portal-push': async (tx) => {
      await tx`create table if not exists push_subscriptions (
        id text primary key, client_id integer not null, user_id integer, endpoint text not null unique, p256dh text not null, auth text not null,
        categories jsonb not null default '["tickets","invoices","domains","services"]'::jsonb, lang text not null default 'en', ua text not null default '',
        fail_count integer not null default 0, last_ok_at timestamptz, created_at timestamptz not null default now())`;
      await tx`create index if not exists push_sub_client_idx on push_subscriptions (client_id)`;
      await tx`create table if not exists push_log (key text primary key, client_id integer not null, sent_at timestamptz not null default now())`;
      await tx`create index if not exists push_log_sent_idx on push_log (sent_at)`;
    },
    // 30. AI assistant (lib/ai/*): usage/cost log and support-ticket automation decisions. Settings live in settings.ai_settings.
    '030-ai': async (tx) => {
      await tx`create table if not exists ai_usage (
        id text primary key, surface text not null, model text not null default '', subject text not null default '', status text not null default 'ok',
        input_tokens integer not null default 0, output_tokens integer not null default 0, cache_read integer not null default 0, cache_write integer not null default 0,
        cost_usd numeric(12,6) not null default 0, ms integer not null default 0, tools jsonb not null default '[]'::jsonb, detail text not null default '',
        created_at timestamptz not null default now())`;
      await tx`create index if not exists ai_usage_created_idx on ai_usage (created_at)`;
      await tx`create index if not exists ai_usage_subject_idx on ai_usage (subject, created_at)`;
      await tx`create table if not exists ai_ticket_runs (
        id text primary key, ticket_id integer not null, tid text not null default '', activity text not null, state text not null default 'pending',
        category text not null default '', sentiment text not null default '', urgency text not null default '', language text not null default '',
        confidence numeric(4,3), summary text not null default '', reasons jsonb not null default '[]'::jsonb, draft text not null default '',
        sent_by text not null default '', error text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create unique index if not exists ai_ticket_runs_activity on ai_ticket_runs (ticket_id, activity)`;
      await tx`create index if not exists ai_ticket_runs_created_idx on ai_ticket_runs (created_at)`;
    },
    // 31. SEO content engine (lib/content/*): article language / guide collection / translation link on posts, the idea and
    // calendar table, and the curated starter backlog (24 ideas, state "idea": nothing is drafted or published).
    '031-content-engine': async (tx) => {
      await tx`alter table posts add column if not exists lang text not null default 'en'`;
      await tx`alter table posts add column if not exists track text not null default ''`;
      await tx`alter table posts add column if not exists translation_of text`;
      await tx`create table if not exists content_ideas (
        id text primary key, track text not null default 'global', title text not null, primary_keyword text not null default '',
        secondary_keywords jsonb not null default '[]'::jsonb, intent text not null default 'informational', country text not null default '',
        target text not null default '', slug text not null default '', priority integer not null default 50, rationale text not null default '',
        overlap text not null default '', source text not null default 'ai', state text not null default 'idea', planned_for timestamptz,
        post_id text, ar_post_id text, want_arabic boolean not null default false, checks jsonb not null default '[]'::jsonb, checked_at timestamptz,
        cost_usd numeric(12,6) not null default 0, error text not null default '', approved_by text not null default '', approved_at timestamptz,
        notified_at timestamptz, published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create index if not exists content_ideas_state_idx on content_ideas (state, planned_for)`;
      await tx`create index if not exists content_ideas_post_idx on content_ideas (post_id)`;
      const [{ n }] = await tx`select count(*)::int n from content_ideas`;
      if (n === 0) for (const i of SEED_IDEAS) {
        await tx`insert into content_ideas (id, track, title, primary_keyword, secondary_keywords, intent, country, target, slug, priority, rationale, source, state)
          values (${id()}, ${i.track}, ${i.title}, ${i.primaryKeyword}, ${JSON.stringify(i.secondaryKeywords)}::jsonb, ${i.intent}, ${i.country}, ${i.target}, ${i.slug}, ${i.priority}, ${i.rationale}, 'seed', 'idea')`;
      }
    },
    // 32. AI connector OAuth server (lib/oauth/*): registered clients, consents (grants), one-time codes, hashed tokens.
    '032-oauth': async (tx) => {
      await tx`create table if not exists oauth_clients (
        id text primary key, kind text not null, name text not null default '', redirect_uris jsonb not null default '[]'::jsonb,
        platform text not null default 'other', flagged boolean not null default false, auth_method text not null default 'none', secret_hash text,
        client_uri text, logo_uri text, disabled boolean not null default false, fetched_at timestamptz, last_used_at timestamptz,
        created_at timestamptz not null default now())`;
      await tx`create table if not exists oauth_grants (
        id text primary key, client_id text not null, whmcs_client_id integer not null, user_email text not null default '',
        scopes jsonb not null default '[]'::jsonb, resource text not null, created_at timestamptz not null default now(), last_used_at timestamptz,
        expires_at timestamptz not null, revoked_at timestamptz, revoked_by text not null default '')`;
      await tx`create index if not exists oauth_grants_client_idx on oauth_grants (whmcs_client_id)`;
      await tx`create index if not exists oauth_grants_app_idx on oauth_grants (client_id)`;
      await tx`create table if not exists oauth_codes (
        hash text primary key, grant_id text not null, client_id text not null, redirect_uri text not null, code_challenge text not null,
        expires_at timestamptz not null, used_at timestamptz)`;
      await tx`create table if not exists oauth_tokens (
        hash text primary key, kind text not null, grant_id text not null, client_id text not null, whmcs_client_id integer not null,
        scopes jsonb not null default '[]'::jsonb, resource text not null, expires_at timestamptz not null, used_at timestamptz, revoked_at timestamptz,
        created_at timestamptz not null default now())`;
      await tx`create index if not exists oauth_tokens_grant_idx on oauth_tokens (grant_id)`;
      await tx`create index if not exists oauth_tokens_exp_idx on oauth_tokens (expires_at)`;
    },
    // 33. Connector data handling in the existing legal pages (one extra section each, editable in Admin → Pages).
    '033-connector-legal': async (tx) => {
      const add = async (slug, name, html) => {
        const [p] = await tx`select id from pages where slug = ${slug}`;
        if (!p) return;
        const [have] = await tx`select id from sections where page_id = ${p.id} and name = ${name}`;
        if (have) return;
        const [{ n }] = await tx`select coalesce(max(sort_order), 0)::int + 1 n from sections where page_id = ${p.id}`;
        await tx`insert into sections (id, page_id, type, name, sort_order, visible, html, data) values (${id()}, ${p.id}, 'html', ${name}, ${n}, true, ${html}, '{}'::jsonb)`;
      };
      await add('privacy-policy', 'AI assistant connectors', `<section id="ai-connectors"><h2>AI assistant connectors (Claude, ChatGPT)</h2>
<p>You can connect your GlobalHostia account to an AI assistant such as Claude (by Anthropic) or ChatGPT (by OpenAI) so the assistant can look up and manage your services for you. This section explains what happens to your data when you do.</p>
<h3>What the assistant can access</h3>
<ul><li>Nothing until you sign in on globalhostia.com and approve the connection on our consent page.</li>
<li>Only the permissions you approve: for example your services and domains, DNS records, invoices and support tickets, and, if you allow it, changing DNS records, mailboxes, SSL certificates, domain settings and tickets.</li>
<li>Only your own account. Every request is checked against the account you signed in with.</li>
<li>An assistant can never pay, change your password, see card details, read service passwords or delete your account. Purchases and renewals always finish on globalhostia.com, where you review and pay yourself.</li></ul>
<h3>What we store</h3>
<ul><li>The connection: which app you connected, the permissions you approved, when you connected and when it was last used.</li>
<li>Access tokens, stored only in a one-way hashed form. Access tokens expire after one hour; refresh tokens expire after 60 days without use and at the latest 90 days after you approved the connection.</li>
<li>An activity record of each action taken through a connector (the action, the time, the app and the domain or item it applied to), as part of our account security logs. We never store your conversation with the assistant.</li></ul>
<h3>What the assistant provider receives</h3>
<p>The assistant receives the results of the actions it asks for, such as a list of your domains, and shows them in your conversation. The provider handles that information under its own privacy policy and your settings with them.</p>
<h3>No training, no sale</h3>
<p>We do not use data from connectors to train AI models, and we do not sell or share it for advertising.</p>
<h3>Removing access</h3>
<p>Disconnect at any time in your account under App &amp; notifications, Connected apps, or from the assistant's own connector settings. Disconnecting revokes every token for that app immediately. You can also ask our support team to remove a connection.</p></section>`);
      await add('terms-conditions', 'AI assistant connectors', `<section id="ai-connectors"><h2>AI assistant connectors</h2>
<p>If you connect your account to an AI assistant, actions the assistant takes with the permissions you approved are treated as actions you requested on your account. Review what the assistant proposes before you confirm changes, especially deleting DNS records or mailboxes and changing nameservers. Orders, renewals and payments are never completed by an assistant: they finish on globalhostia.com. You can revoke a connection at any time in your account under Connected apps. We may suspend connector access to protect your account or our services.</p></section>`);
    },
    // 34. OAuth private_key_jwt (RFC 7523) for ChatGPT's client metadata document: client keys and assertion replay guard.
    '034-oauth-private-key-jwt': async (tx) => {
      await tx`alter table oauth_clients add column if not exists jwks jsonb`;
      await tx`alter table oauth_clients add column if not exists jwks_uri text`;
      await tx`create table if not exists oauth_assertions (key text primary key, client_id text not null, expires_at timestamptz not null)`;
      await tx`create index if not exists oauth_assertions_exp_idx on oauth_assertions (expires_at)`;
    },
    // 41. Client experience (lib/cx/*): daily health check history per domain (monthly site report), the stored monthly
    // reports shown in the portal, and ticket ratings (one rating request per WHMCS ticket).
    '041-cx': async (tx) => {
      await tx`create table if not exists health_days (row_id text not null, day text not null, client_id integer not null, domain text not null,
        checks integer not null default 1, status text not null default 'unknown', issues jsonb not null default '[]'::jsonb)`;
      await tx`create unique index if not exists health_days_pk on health_days (row_id, day)`;
      await tx`create index if not exists health_days_client_idx on health_days (client_id, day)`;
      await tx`create table if not exists site_reports (id text primary key, client_id integer not null, month text not null, lang text not null default 'en',
        data jsonb not null, created_at timestamptz not null default now())`;
      await tx`create unique index if not exists site_reports_uniq on site_reports (client_id, month)`;
      await tx`create table if not exists ticket_ratings (id text primary key, ticket_id integer not null, tid text not null default '', client_id integer not null default 0,
        email text not null default '', subject text not null default '', dept_id integer not null default 0, staff text not null default '',
        status text not null default 'pending', reason text not null default '', lang text not null default 'en', score integer, comment text not null default '',
        source text not null default '', sent_at timestamptz, rated_at timestamptz, alerted_at timestamptz, comment_alerted_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create unique index if not exists ticket_ratings_ticket on ticket_ratings (ticket_id)`;
      await tx`create index if not exists ticket_ratings_status_idx on ticket_ratings (status, created_at)`;
      await tx`create index if not exists ticket_ratings_rated_idx on ticket_ratings (rated_at)`;
    },
    // 37. Domain health alerts (lib/health/*): one row per customer domain with open issues and what was alerted; email opt-out.
    '037-domain-health': async (tx) => {
      await tx`create table if not exists domain_health (
        id text primary key, domain text not null, client_id integer not null, sources jsonb not null default '[]'::jsonb, whmcs_domain_id integer,
        service_id integer, server_id text not null default '', server_ip text not null default '', ssl_issue boolean not null default false, reg jsonb,
        external boolean not null default false, active boolean not null default true, status text not null default 'unknown',
        checks jsonb not null default '{}'::jsonb, issues jsonb not null default '{}'::jsonb, last_alerted jsonb not null default '{}'::jsonb,
        first_seen_issue timestamptz, last_checked timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create unique index if not exists domain_health_uniq on domain_health (domain, client_id)`;
      await tx`create index if not exists domain_health_due_idx on domain_health (active, last_checked)`;
      await tx`create index if not exists domain_health_client_idx on domain_health (client_id)`;
      await tx`create index if not exists domain_health_status_idx on domain_health (status)`;
      await tx`create table if not exists health_prefs (client_id integer primary key, email text not null default '', alerts boolean not null default true, updated_at timestamptz not null default now())`;
    },
    // 35. Abandoned-cart and renewal reminders (lib/reminders/*): customer choices, unsubscribes, captured carts, send log.
    '035-reminders': async (tx) => {
      await tx`create table if not exists reminder_prefs (
        id text primary key, client_id integer unique, email text not null default '', cart_email boolean not null default true,
        renewal_email boolean not null default true, whatsapp boolean not null default false, whatsapp_at timestamptz,
        whatsapp_source text not null default '', updated_at timestamptz not null default now())`;
      await tx`create index if not exists reminder_prefs_email_idx on reminder_prefs (email)`;
      await tx`create table if not exists reminder_suppress (email text not null, scope text not null, source text not null default 'link', created_at timestamptz not null default now())`;
      await tx`create unique index if not exists reminder_suppress_uniq on reminder_suppress (email, scope)`;
      await tx`create table if not exists reminder_carts (
        id text primary key, cart_key text not null unique, client_id integer, email text not null default '', consent text not null default '',
        currency_id integer not null default 0, items jsonb not null default '{}'::jsonb, fingerprint text not null default '',
        status text not null default 'open', whatsapp_opt_in boolean not null default false, restore_clicks integer not null default 0, order_id integer,
        created_at timestamptz not null default now(), activity_at timestamptz not null default now(), closed_at timestamptz)`;
      await tx`create index if not exists reminder_carts_status_idx on reminder_carts (status, activity_at)`;
      await tx`create index if not exists reminder_carts_client_idx on reminder_carts (client_id)`;
      await tx`create table if not exists reminders_log (
        id text primary key, kind text not null, client_id integer, email text not null default '', item text not null, stage text not null,
        channel text not null, cycle text not null default '', status text not null default 'claimed', attempts integer not null default 1,
        message_id text not null default '', error text not null default '', detail jsonb, created_at timestamptz not null default now(),
        sent_at timestamptz, converted_at timestamptz)`;
      await tx`create unique index if not exists reminders_log_uniq on reminders_log (kind, item, stage, channel, cycle)`;
      await tx`create index if not exists reminders_log_client_idx on reminders_log (client_id, sent_at)`;
      await tx`create index if not exists reminders_log_created_idx on reminders_log (created_at)`;
    },
    // 36. Premium domains marketplace (lib/premium/*): own listings, cached Dynadot listings, purchase requests in broker_requests.
    '036-premium-domains': async (tx) => {
      await tx`create table if not exists premium_domains (
        id text primary key, domain text not null unique, price numeric(14,2), currency text not null default 'USD', make_offer boolean not null default false,
        min_offer numeric(14,2), tags jsonb not null default '[]'::jsonb, description text not null default '', status text not null default 'draft',
        owned boolean not null default true, featured boolean not null default false, sold_at timestamptz,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create index if not exists premium_domains_status_idx on premium_domains (status)`;
      await tx`create table if not exists premium_feed (domain text primary key, listing_id text not null default '', price numeric(14,2) not null,
        currency text not null default 'USD', fetched_at timestamptz not null default now())`;
      await tx`alter table broker_requests add column if not exists kind text not null default 'broker'`;
      await tx`alter table broker_requests add column if not exists listing jsonb`;
    },
    // 38. "Sell your domain" (lib/sell/*): customer listings, one open listing per domain.
    '038-seller-listings': async (tx) => {
      await tx`create table if not exists seller_listings (
        id text primary key, ref text not null unique, domain text not null, client_id integer not null, whmcs_domain_id integer,
        status text not null default 'draft', price numeric(14,2), currency text not null default 'USD', min_offer numeric(14,2),
        accept_offers boolean not null default true, description text not null default '', category text not null default '',
        tags jsonb not null default '[]'::jsonb, featured boolean not null default false, featured_state text not null default '',
        featured_invoice_id integer, invoice_id integer, order_id integer, fee_method text not null default '', fee_amount numeric(14,2),
        fee_currency text not null default '', featured_fee_amount numeric(14,2), pending jsonb, flags jsonb not null default '[]'::jsonb,
        reject_reason text not null default '', hidden_reason text not null default '', admin_note text not null default '',
        listed_until timestamptz, featured_until timestamptz, renew_invoice_id integer, renew_state text not null default '',
        renew_featured boolean not null default false, reminders jsonb not null default '[]'::jsonb,
        terms_at timestamptz, terms_ip text not null default '', paid_at timestamptz, approved_at timestamptz, approved_by text not null default '',
        last_check_at timestamptz, warned_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create index if not exists seller_listings_client_idx on seller_listings (client_id)`;
      await tx`create index if not exists seller_listings_status_idx on seller_listings (status)`;
      await tx`create index if not exists seller_listings_domain_idx on seller_listings (domain)`;
      await tx`create unique index if not exists seller_listings_open_domain on seller_listings (domain) where status in ('draft','awaiting_payment','in_review','live','expired','suspended')`;
      await tx`create index if not exists seller_listings_rinvoice_idx on seller_listings (renew_invoice_id)`;
      await tx`create index if not exists seller_listings_invoice_idx on seller_listings (invoice_id)`;
      await tx`create index if not exists seller_listings_finvoice_idx on seller_listings (featured_invoice_id)`;
    },
    // 39. A/B tests (lib/abtest/*): daily counts per experiment and variant, cart-session tags for order attribution, counted
    // orders. Seeds two example experiments as drafts (never started automatically); texts use claims the pages already make.
    '039-ab-tests': async (tx) => {
      await tx`create table if not exists ab_daily (day date not null, exp text not null, variant text not null,
        views integer not null default 0, visitors integer not null default 0, cta integer not null default 0, carts integer not null default 0,
        orders integer not null default 0, revenue jsonb not null default '{}'::jsonb, primary key (day, exp, variant))`;
      await tx`create index if not exists ab_daily_exp_idx on ab_daily (exp, day)`;
      await tx`create table if not exists ab_carts (sk text primary key, client_id integer, currency_id integer not null default 0, ab text not null, updated_at timestamptz not null default now())`;
      await tx`create index if not exists ab_carts_client_idx on ab_carts (client_id, updated_at)`;
      await tx`create table if not exists ab_orders (order_id integer primary key, ab text not null, amount numeric(14,2), currency text not null default '', created_at timestamptz not null default now())`;
      const at = new Date().toISOString();
      const seed = [
        { id: 'hosting-hero-1', name: 'Web hosting hero headline', target: 'hosting', paths: ['/web-hosting'], status: 'draft', metric: 'cart',
          notes: 'Does leading with what every plan includes (free SSL, daily backups, free migration: all stated on the page) sell better than the location message?',
          variants: [{ name: 'Control: location headline', weight: 50, set: {} },
            { name: 'Included extras headline', weight: 50, set: { 'hero.title': 'Web hosting with free SSL, daily backups and free migration' } }],
          startAt: '', endAt: '', createdAt: at, startedAt: '', stoppedAt: '', winner: '' },
        { id: 'hosting-plan-layout-1', name: 'Hosting plan layout: cards vs table', target: 'hosting', paths: ['/web-hosting', '/shared-hosting'], status: 'draft', metric: 'cart',
          notes: 'Same plans and prices; only the presentation changes. Start after the headline test (one test per page at a time).',
          variants: [{ name: 'Control: plan cards', weight: 50, set: {} },
            { name: 'Comparison table', weight: 50, set: { 'plans.layout': 'table' } }],
          startAt: '', endAt: '', createdAt: at, startedAt: '', stoppedAt: '', winner: '' },
      ];
      await tx`insert into settings (key, value) values ('ab_experiments', ${JSON.stringify(seed)}::jsonb) on conflict (key) do nothing`;
    },
    // 40. Ticket spam filter (lib/ai/spam*.ts): decisions per ticket activity and the internal sender block / allow lists.
    // Settings live in settings.ai_spam (defaults in code: on, auto-close at >= 0.95 for non-clients, flag 0.6-0.95).
    '040-ticket-spam': async (tx) => {
      await tx`create table if not exists ai_spam_decisions (
        id text primary key, ticket_id integer not null, tid text not null default '', activity text not null,
        email text not null default '', domain text not null default '', name text not null default '', subject text not null default '',
        label text not null default '', confidence numeric(4,3), reason text not null default '', source text not null default '',
        action text not null default 'pending', state text not null default 'active', prev_status text not null default '', prev_dept integer not null default 0,
        hints jsonb not null default '[]'::jsonb, reviewed_by text not null default '',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now())`;
      await tx`create unique index if not exists ai_spam_decisions_activity on ai_spam_decisions (ticket_id, activity)`;
      await tx`create index if not exists ai_spam_decisions_created_idx on ai_spam_decisions (created_at)`;
      await tx`create index if not exists ai_spam_decisions_email_idx on ai_spam_decisions (email)`;
      await tx`create index if not exists ai_spam_decisions_domain_idx on ai_spam_decisions (domain)`;
      await tx`create table if not exists ai_spam_senders (
        id text primary key, value text not null, kind text not null default 'email', list text not null default 'block',
        source text not null default 'auto', label text not null default '', created_at timestamptz not null default now())`;
      await tx`create unique index if not exists ai_spam_senders_uniq on ai_spam_senders (value, list)`;
    },
    // 42. Client experience (lib/cx/onboarding*.ts, lib/cx/usage*.ts): welcome checklist state per client, hosting usage
    // cache (6 h) per service, idempotency keys for one-click plan upgrades. Settings live in settings.usage_alerts.
    '042-cx-onboarding-usage': async (tx) => {
      await tx`create table if not exists cx_onboarding (client_id integer primary key, started_at timestamptz, dismissed_at timestamptz,
        completed_at timestamptz, celebrated_at timestamptz, manual jsonb not null default '{}'::jsonb, detected jsonb not null default '{}'::jsonb,
        detected_at timestamptz, target jsonb, updated_at timestamptz not null default now())`;
      await tx`create table if not exists cx_usage (service_id integer primary key, client_id integer not null, metrics jsonb not null default '[]'::jsonb,
        source text not null default 'panel', plan text not null default '', error text not null default '', at timestamptz not null default now())`;
      await tx`create index if not exists cx_usage_client_idx on cx_usage (client_id)`;
      await tx`create index if not exists cx_usage_at_idx on cx_usage (at)`;
      await tx`create table if not exists cx_upgrades (key text primary key, client_id integer not null, service_id integer not null, pid integer not null,
        cycle text not null default '', status text not null default 'pending', order_id integer, invoice_id integer, error text not null default '',
        created_at timestamptz not null default now())`;
      await tx`create index if not exists cx_upgrades_client_idx on cx_upgrades (client_id, created_at)`;
    },
  };
  for (const [key, fn] of Object.entries(PATCHES)) {
    if (applied.has(key)) continue;
    await sql.begin(fn);
    applied.add(key);
    await sql`insert into settings (key,value) values ('patches', ${JSON.stringify([...applied])}::jsonb) on conflict (key) do update set value = excluded.value`;
    console.log('[db-setup] patch applied:', key);
  }
  await sql`insert into settings (key,value) values ('setup_fingerprint', ${JSON.stringify(FINGERPRINT)}::jsonb) on conflict (key) do update set value = excluded.value`;
  }
} catch (e) {
  if (unreachable(e)) {
    console.warn('[db-setup] WARNING: database unreachable or over quota, skipped (the build continues; migrations run on the next deploy):', e?.code || '', String(e?.message || e).slice(0, 200));
  } else {
    console.error('[db-setup] FAILED', e);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
