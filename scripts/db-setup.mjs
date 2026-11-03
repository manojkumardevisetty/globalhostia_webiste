// Runs on every deploy (and locally): applies SQL migrations, then seeds an
// empty database from legacy/seed.json and creates the first owner account.
// Idempotent — never overwrites existing content.
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { enrichment } from '../lib/enrich-core.mjs';
import { BLOG_SEED, BLOG_SEED_V1 } from './blog-seed.mjs';
import { ALIAS_REDIRECTS } from '../lib/aliases.mjs';

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
