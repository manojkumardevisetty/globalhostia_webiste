// End-to-end acceptance test (needs: app on :3000, tests/mock-whmcs.mjs on :4555, seeded DB).
// Run: NODE_PATH=$(npm root -g) node tests/e2e.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@globalhostia.com';
const PASS = process.env.ADMIN_PASSWORD || 'localtest123';
const SHOTS = process.env.SHOTS || '/tmp';
let failures = 0;
const SLUG = 'test-' + Date.now().toString(36);
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const flash = async () => { await p.waitForURL(/[?&](ok|err)=/, { timeout: 60000 }).catch(() => {}); const msg = decodeURIComponent((p.url().match(/[?&](?:ok|err)=([^&]*)/) || [, ''])[1].replace(/\+/g, ' ')); await p.goto(p.url().replace(/[?&](ok|err)=[^&]*/, '')); return msg; };
  const go = async (u) => { await p.goto(u); };

  // 1. auth guard + login
  await p.goto(`${BASE}/admin/products`);
  ok(p.url().includes('/admin/login'), 'admin requires login');
  await p.fill('input[name=email]', EMAIL); await p.fill('input[name=password]', 'wrong-password');
  await p.click('button:has-text("Sign in")');
  ok((await flash()).includes('Invalid email or password'), 'wrong password rejected');
  await p.fill('input[name=email]', EMAIL); await p.fill('input[name=password]', PASS);
  await p.click('button:has-text("Sign in")'); await p.waitForURL(/\/admin(\/products)?$/);
  ok(true, 'login works');

  // 2. WHMCS test + sync
  await p.goto(`${BASE}/admin/whmcs`);
  await p.click('button:has-text("Test connection")');
  ok((await flash()).includes('Connected to WHMCS'), 'WHMCS connection test');
  await p.click('button:has-text("Sync products & prices")');
  const f = await flash(); ok(/created:\s*\d+/.test(f), `product sync → ${f.slice(0, 120)}`);
  await p.click('button:has-text("Sync domain (TLD) prices")');
  ok((await flash()).includes('upserted'), 'TLD sync');

  // 3. web-hosting page now renders dynamic WHMCS products with tabs, real prices & cart links
  await p.goto(`${BASE}/web-hosting`);
  const html = await p.content();
  ok(html.includes('gh-products') && html.includes('Hostia Ultra'), 'dynamic product section rendered');
  ok(html.includes('$5.99') && html.includes('cart.php?a=add&amp;pid=2'), 'WHMCS price + cart link');
  ok(html.includes('gh-tabs'), 'multi-category tabs');
  await p.screenshot({ path: `${SHOTS}/e2e-webhosting.png` });

  // 4. dedicated: 14 products → catalog in server table with toolbar
  await p.goto(`${BASE}/dedicated-servers`);
  const d = await p.content();
  ok(d.includes('servers-table') && d.includes('Hostia Dedicated 14') && d.includes('gh-toolbar'), 'server table + toolbar (adaptive)');

  // 5. new product → publish → appears; category with 1 product → featured layout
  await p.goto(`${BASE}/admin/categories/new`);
  await p.fill('input[name=name]', 'Test Email Hosting'); await p.fill('input[name=slug]', SLUG);
  await p.check('input[name=visible]'); await p.click('button:has-text("Save category")');
  ok((await flash()).includes('saved'), 'category created');
  const catId = p.url().split('/').pop().split('?')[0];
  await p.click('button:has-text("Create landing page")');
  ok((await flash()).includes('Landing page created'), 'landing page generated');
  const pageUrl = p.url().split('?')[0];
  await p.goto(`${BASE}/admin/products/new`);
  await p.fill('input[name=name]', 'Mail Pro ' + SLUG); await p.fill('textarea[name=features]', '50 GB mailbox\nAnti-spam\n-Calendar sync');
  await p.selectOption('select[name=categoryId]', catId); await p.selectOption('select[name=status]', 'PUBLISHED');
  await p.fill('input[name=price_monthly]', '3.50');
  await p.click('button:has-text("Save product")');
  ok((await flash()).includes('Product saved'), 'product created without code');
  await p.goto(`${pageUrl}`);
  await p.selectOption('select[name=status]', 'PUBLISHED'); await p.click('button:has-text("Save page")');
  ok((await flash()).includes('saved'), 'page published');
  await p.goto(`${BASE}/${SLUG}`);
  const t = await p.content();
  ok(t.includes('Mail Pro') && t.includes('$3.50') && t.includes('data-layout="featured"'), 'new product live with featured layout (1 product)');
  ok(t.includes('FAQPage'), 'FAQ schema');

  // 6. section editing + hide + revision
  await p.goto(pageUrl);
  await p.click('a:has-text("hero")');
  await p.fill('textarea[name=html]', '<div class="pt-25 pb-10 text-center"><h1>Edited hero for {{site_name}}</h1></div>');
  await p.click('button:has-text("Save section")'); await flash();
  await p.goto(`${BASE}/${SLUG}`);
  ok((await p.content()).includes('Edited hero for GlobalHostia'), 'section edit + tokens live immediately');

  // 7. domain search via WHMCS
  await p.goto(pageUrl);
  await p.selectOption('select[name=type]', 'domain_search'); await p.click('button:has-text("+ Add")'); await flash();
  await p.goto(pageUrl);
  await p.selectOption('select[name=type]', 'domain_results'); await p.click('button:has-text("+ Add")'); await flash();
  await p.goto(`${BASE}/${SLUG}?domain=mynewbrand`);
  const ds = await p.content();
  ok(ds.includes('mynewbrand.com') && ds.includes('Available') && ds.includes('domain=register'), 'domain availability + register link');

  // 8. design manager recolours site
  await p.goto(`${BASE}/admin/design`);
  await p.fill('input[name=primary_hex]', '#e11d48'); await p.click('button:has-text("Save design")'); await flash();
  await p.goto(`${BASE}/`);
  ok((await p.content()).includes('#e11d48'), 'design tokens applied site-wide');
  await p.goto(`${BASE}/admin/design`); await p.click('button:has-text("Reset to original design")'); await flash();

  // 9. bulk edit, orders, customers, dashboard, search, audit
  await p.goto(`${BASE}/admin/orders`); ok((await p.content()).includes('8812'), 'orders from WHMCS');
  await p.goto(`${BASE}/admin/customers/7`); ok((await p.content()).includes('acme.ae'), 'customer detail from WHMCS');
  await p.goto(`${BASE}/admin`); ok((await p.content()).includes('$4,210.00'), 'dashboard WHMCS stats');
  await p.goto(`${BASE}/admin/search?q=ultra`); ok((await p.content()).includes('Hostia Ultra'), 'global search');
  await p.goto(`${BASE}/admin/audit`); ok((await p.content()).includes('sync_products'), 'audit log');
  await p.screenshot({ path: `${SHOTS}/e2e-admin.png` });

  // 10. mobile
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(`${BASE}/web-hosting`); await m.screenshot({ path: `${SHOTS}/e2e-mobile.png` });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  ok(!overflow, 'no horizontal overflow on mobile');

  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
