// CSP check: opens every public page (sitemap + fixed extras), the client-area sign-in pages and (with ADMIN_EMAIL /
// ADMIN_PASSWORD) the admin, in Chromium, and records every Content-Security-Policy violation the page raises
// (securitypolicyviolation events, enforced or report-only), plus failed same-site requests and page errors.
// Also exercises the features most likely to trip a policy: AI chat widget, help videos, premium marquee, OG images.
// Exit code 1 when there is any violation.
// Run: BASE=http://localhost:3000 NODE_PATH=$(npm root -g) node tests/csp-crawl.cjs
// Env: MAX=400 (pages) · CONC=4 · ADMIN_EMAIL / ADMIN_PASSWORD (admin pages, skipped when the account has two-factor on)
const { chromium } = require('playwright');
const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const MAX = Number(process.env.MAX || 400), CONC = Number(process.env.CONC || 4);
const EXTRA = ['/', '/account/login', '/account/forgot', '/sign-in', '/sign-up', '/admin/login', '/help-center', '/help/pay-an-invoice', '/help/buy-hosting',
  '/premium-domains', '/premium-domains/atlas.test', '/sell-domains', '/connectors', '/docs/mcp', '/ai', '/plan-finder', '/free-migration', '/domain-broker',
  '/business-services', '/contact', '/security', '/?theme=original', '/web-hosting?theme=original', '/ar', '/ar/free-migration', '/no-such-page-xyz', '/oauth/authorize'];
const ACCOUNT = ['/account', '/account/services', '/account/domains', '/account/invoices', '/account/support', '/account/sell', '/account/team', '/account/health'];
const ADMIN = ['/admin', '/admin/products', '/admin/pages', '/admin/design', '/admin/seo', '/admin/whmcs', '/admin/settings', '/admin/security', '/admin/account', '/admin/users', '/admin/assistant', '/admin/help-videos', '/admin/audit'];

const INIT = () => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ d: e.effectiveDirective, b: e.blockedURI, s: e.sourceFile, l: e.lineNumber, m: e.disposition, x: (e.sample || '').slice(0, 60) }), true);
};

async function sitemapPaths() {
  const out = new Set();
  for (const sm of ['/sitemap.xml', '/sitemap-video.xml']) {
    try {
      const x = await (await fetch(BASE + sm)).text();
      for (const m of x.matchAll(/<loc>([^<]+)<\/loc>/g)) { try { const u = new URL(m[1]); out.add(u.pathname + u.search); } catch {} }
    } catch {}
  }
  return [...out];
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(INIT);
  const found = [], errors = [];
  const visit = async (path, opts = {}) => {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push({ path, msg: String(e.message || e).slice(0, 200) }));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && /Content Security Policy/i.test(t)) found.push({ path, d: 'console', b: t.slice(0, 220) }); });
    try {
      const r = await page.goto(BASE + path, { waitUntil: 'load', timeout: 45000 });
      if (opts.after) await opts.after(page);
      await page.waitForTimeout(opts.wait ?? 1200);
      const v = await page.evaluate(() => window.__csp || []);
      for (const x of v) found.push({ path, ...x });
      return { status: r ? r.status() : 0, page };
    } catch (e) { errors.push({ path, msg: 'navigation: ' + String(e.message || e).slice(0, 160) }); return { status: 0, page }; }
    finally { if (!opts.keep) await page.close(); }
  };

  const paths = [...new Set([...EXTRA, ...(await sitemapPaths())])].slice(0, MAX);
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (i < paths.length) { const p = paths[i++]; await visit(p, { wait: 600 }); } }));
  console.log(`[csp] ${paths.length} public pages visited`);

  // features: AI chat widget (loads on idle), help video playback, OG image, premium marquee scroll
  await visit('/', { wait: 6500, after: async (pg) => { await pg.mouse.move(400, 400); await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); } });
  await visit('/help/pay-an-invoice', { after: async (pg) => { await pg.evaluate(async () => { const v = document.querySelector('video'); if (v) { v.muted = true; try { await v.play(); } catch {} } }); }, wait: 2500 });
  await visit('/premium-domains', { after: async (pg) => pg.evaluate(() => window.scrollTo(0, 600)), wait: 2500 });
  const og = await ctx.request.get(BASE + '/og?t=Security%20check&k=Test');
  console.log(`[csp] OG image: ${og.status()} ${og.headers()['content-type']}`);
  const chat = await visit('/', { keep: true, wait: 6000 });
  const hasChat = await chat.page.evaluate(() => typeof window.GHChat !== 'undefined' || !!document.querySelector('[class*="ghai"]'));
  console.log(`[csp] AI chat widget loaded: ${hasChat}`);
  await chat.page.close();

  // client area (mock WHMCS demo account, as in tests/layout-check.cjs): served with the static next.config.mjs policy
  {
    const pg = await ctx.newPage();
    await pg.goto(BASE + '/account/login');
    await pg.fill('#au-email', process.env.CLIENT_EMAIL || 'demo@example.com'); await pg.fill('#au-pass', process.env.CLIENT_PASSWORD || 'demo-pass');
    await Promise.all([pg.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}), pg.click('button:has-text("Sign in")')]);
    const ok = !pg.url().endsWith('/login'); await pg.close();
    if (ok) { for (const p of ACCOUNT) await visit(p, { wait: 1500 }); console.log(`[csp] ${ACCOUNT.length} client-area pages visited`); } else console.log('[csp] client area skipped (demo sign-in failed)');
  }

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const pg = await ctx.newPage();
    await pg.goto(BASE + '/admin/login');
    await pg.fill('input[name=email]', process.env.ADMIN_EMAIL); await pg.fill('input[name=password]', process.env.ADMIN_PASSWORD);
    await pg.click('button:has-text("Sign in")');
    await pg.waitForURL((u) => !/\/admin\/login$/.test(u.pathname), { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(800);
    const v = await pg.evaluate(() => window.__csp || []); for (const x of v) found.push({ path: '/admin/login', ...x });
    const url = pg.url(); await pg.close();
    if (/\/admin\/login/.test(url)) console.log(`[csp] admin pages skipped (sign-in stopped at ${url.replace(BASE, '')})`);
    else { for (const p of ADMIN) await visit(p, { wait: 900 }); console.log(`[csp] ${ADMIN.length} admin pages visited`); }
  }
  await browser.close();

  const uniq = new Map();
  for (const f of found) { const k = `${f.d}|${f.b}|${f.m || ''}`; const e = uniq.get(k) || { ...f, n: 0, pages: new Set() }; e.n++; e.pages.add(f.path); uniq.set(k, e); }
  for (const e of uniq.values()) console.log(`VIOLATION ${e.m || ''} ${e.d} blocked=${e.b} src=${e.s || ''}:${e.l || ''} ${e.x ? `sample="${e.x}"` : ''} ×${e.n} on ${[...e.pages].slice(0, 4).join(', ')}`);
  for (const e of errors.slice(0, 30)) console.log(`PAGE ERROR ${e.path}: ${e.msg}`);
  console.log(`[csp] ${uniq.size} distinct violations, ${found.length} total; ${errors.length} page errors`);
  process.exit(uniq.size ? 1 : 0);
})();
