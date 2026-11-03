// Manage hosting > WordPress tab, rendered from the files in public/hp with a scripted /api/hosting backend (the same
// answers lib/hosting/wordpress-api.ts gives; the Softaculous calls behind it are covered by tests/wordpress.test.mts).
// Checks: list with staging children and update badge, install form -> progress -> password shown once with copy,
// one-click login opens a new tab, staging job progress, push-to-live and typed-domain delete dialogs (focus, Escape,
// disabled until typed), Arabic right-to-left, no horizontal scroll on phones. Screenshots (deviceScaleFactor 2).
// Run: SHOTS=/mnt/user-data/outputs/wordpress NODE_PATH=$(npm root -g) node tests/wordpress-ui.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const HP = path.join(__dirname, '..', 'public', 'hp');
const SHOTS = process.env.SHOTS || '/tmp/wordpress-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };
const SITE = 'https://globalhostia.com';
const PASSWORD = 'Kx7#mQ2p+Vh9_eRt4Lw8';

function backend() {
  const st = {
    sites: [
      { id: '26_11001', url: 'https://demo-brand.com', adminUrl: 'https://demo-brand.com/wp-admin/', domain: 'demo-brand.com', directory: '', version: '6.7.1', newVersion: '6.8.3', siteName: 'Demo Brand', created: '2026-01-01T00:00:00Z', staging: false, managed: true },
      { id: '26_11002', url: 'https://demo-brand.com/staging', adminUrl: 'https://demo-brand.com/staging/wp-admin/', domain: 'demo-brand.com', directory: 'staging', version: '6.7.1', siteName: 'Demo Brand', staging: true, parentId: '26_11001', managed: true },
      { id: '26_11003', url: 'https://demo-brand.shop', adminUrl: 'https://demo-brand.shop/wp-admin/', domain: 'demo-brand.shop', directory: '', version: '6.8.3', siteName: 'Demo Shop', created: '2026-03-01T00:00:00Z', staging: false, managed: true },
      { url: 'https://demo-brand.com/old', path: '/home/demobran/domains/demo-brand.com/public_html/old', domain: 'demo-brand.com', version: '5.9.3', managed: false },
    ],
    tasks: {}, posts: [], installDelay: 2500,
  };
  const caps = { overview: ['usage'], subdomains: ['list', 'add'], wordpress: ['list', 'install', 'login', 'staging', 'push', 'delete', 'backup', 'upgrade'], health: ['check'] };
  return {
    st,
    async handle(route) {
      const req = route.request(), u = new URL(req.url()), sec = u.pathname.split('/').pop();
      const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': 'https://my.globalhostia.com' }, body: JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': 'https://my.globalhostia.com', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
      if (sec === 'session') return json({ panel: 'directadmin', panelLabel: 'DirectAdmin', username: 'demobran', domain: 'demo-brand.com', server: 'Globalhostia USA', caps, domains: ['demo-brand.com', 'demo-brand.shop'], limits: {}, ai: false });
      if (sec !== 'wordpress') return json({ error: 'unsupported', message: 'Not in this test' }, 501);
      if (req.method() === 'GET') {
        const op = u.searchParams.get('op') || 'list';
        if (op === 'targets') return json({ targets: ['demo-brand.com', 'demo-brand.shop', 'blog.demo-brand.com'], languages: [['en', 'English'], ['ar', 'Arabic'], ['fr_FR', 'French']], email: 'owner@demo-brand.com' });
        if (op === 'task') {
          const t = st.tasks[u.searchParams.get('key')]; t.n++;
          if (t.n < 2) return json({ progress: 45, text: t.kind === 'staging' ? 'Copying files' : 'Propagating the database', done: false });
          if (!t.applied) { t.applied = 1; t.apply(); }
          return json({ progress: 100, text: t.kind === 'staging' ? 'Staging Completed' : 'Push to live Completed', done: true });
        }
        return json({ sites: st.sites, caps: caps.wordpress });
      }
      const b = JSON.parse(req.postData() || '{}');
      st.posts.push(b);
      const task = (kind, apply) => { const key = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32); st.tasks[key] = { kind, apply, n: 0 }; return key; };
      if (b.op === 'install') {
        await new Promise((r) => setTimeout(r, st.installDelay));
        const url = `https://${b.domain}${b.directory ? '/' + b.directory : ''}`;
        st.sites.push({ id: '26_12001', url, adminUrl: url + '/wp-admin/', domain: b.domain, directory: b.directory || '', version: '6.8.3', siteName: b.title, created: new Date().toISOString(), staging: false, managed: true });
        return json({ ok: true, message: `WordPress is installed on ${b.domain}${b.directory ? '/' + b.directory : ''}.`, site: { url, adminUrl: url + '/wp-admin/' }, adminUser: b.adminUser, deliver: b.deliver, ...(b.deliver === 'show' ? { password: PASSWORD } : { emailedTo: b.adminEmail }) });
      }
      if (b.op === 'login') return json({ ok: true, message: 'Opening WordPress admin', url: 'https://example.org/wp-admin/?softaculous_auto=1' });
      if (b.op === 'staging') {
        const dir = b.mode === 'dir' ? b.directory : '', dom = b.mode === 'dir' ? 'demo-brand.shop' : `${b.label}.demo-brand.shop`;
        const key = task('staging', () => st.sites.push({ id: '26_12002', url: `https://${dom}${dir ? '/' + dir : ''}`, domain: dom, directory: dir, version: '6.8.3', staging: true, parentId: b.id, managed: true }));
        return json({ ok: true, message: `Creating the staging copy on ${dom}${dir ? '/' + dir : ''}…`, task: key });
      }
      if (b.op === 'backup') return json({ ok: true, message: 'Backup finished. It is kept in your Softaculous backups.' });
      if (b.op === 'push') return json({ ok: true, message: 'Pushing staging to the live site…', task: task('pushtolive', () => {}) });
      if (b.op === 'delete') { st.sites = st.sites.filter((s) => s.id !== b.id); return json({ ok: true, message: 'Staging copy demo-brand.com/staging deleted.' }); }
      if (b.op === 'upgrade') { st.sites.forEach((s) => { if (s.id === b.id) { s.version = s.newVersion; delete s.newVersion; } }); return json({ ok: true, message: 'WordPress updated to 6.8.3.' }); }
      return json({ error: 'invalid', message: 'Unknown operation' }, 400);
    },
  };
}

async function open(b, w, h, lang) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const be = backend();
  if (process.env.DEBUG) { p.on('requestfailed', (r) => console.log('failed', r.url(), r.failure())); p.on('framenavigated', (f) => console.log('nav', f.url())); }
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await ctx.route(`${SITE}/api/hosting/**`, (r) => be.handle(r));
  await ctx.route('https://example.org/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>WordPress admin</title><h1>Dashboard</h1>' }));
  await ctx.route(`${SITE}/hp/**`, (r) => {
    const f = path.join(HP, new URL(r.request().url()).pathname.replace(/^\/hp\//, ''));
    if (!f.startsWith(HP) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const type = /\.css$/.test(f) ? 'text/css' : /\.js$/.test(f) ? 'application/javascript' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream';
    return r.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await ctx.route('https://my.globalhostia.com/**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Product details</title>
<link rel="stylesheet" href="${SITE}/hp/whmcs.css?v=test"><style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#f4f6f8;color:#23313d}#main-body .container{max-width:1180px;margin:0 auto;padding:24px 16px;box-sizing:border-box}.card{background:#fff;border:1px solid #e3e7ec;border-radius:12px;padding:16px 20px;margin-bottom:20px}</style>
<script>window.GH_HOSTING={token:"t.t",sid:102};window.GH_LANG=${JSON.stringify(lang === 'ar' ? 'arabic' : 'english')};</script>
<script src="${SITE}/hp/whmcs.js?v=test"></script></head><body><nav class="card"><a href="logout.php">Logout</a></nav><div id="main-body"><div class="container"><div class="card"><h3>Hostia Ultra · demo-brand.com</h3><a class="btn gh-console-btn" href="#">Login to DirectAdmin</a></div></div></div></body></html>` }));
  await ctx.addInitScript(() => { try { sessionStorage.setItem('gh-hosting-tab-102', 'wordpress'); } catch (e) { /* ignore */ } });
  await p.goto('https://my.globalhostia.com/clientarea.php?action=productdetails&id=102');
  await p.locator('.ghh-wplist').waitFor({ timeout: 20000 });
  await p.waitForTimeout(300);
  return { ctx, p, be, errors };
}
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (p, name, el) => { const f = `${SHOTS}/${name}.png`; if (el) await el.screenshot({ path: f }); else await p.screenshot({ path: f, fullPage: false }); };

(async () => {
  const b = await chromium.launch();
  for (const [w, h, tag] of [[1440, 1000, 'desktop'], [390, 844, 'mobile']]) for (const lang of ['en', 'ar']) {
    const T = `${tag} ${lang}`, sfx = `${lang}-${w}`;
    const { ctx, p, be, errors } = await open(b, w, h, lang);
    const panel = p.locator('.ghh');
    await p.locator('.ghh').scrollIntoViewIfNeeded();
    const rows = p.locator('.ghh-wp');
    ok(await rows.count() === 4, `${T}: four rows (3 Softaculous + 1 listed only)`);
    ok(await p.locator('.ghh-wp--child').count() === 1, `${T}: staging copy nested under its live site`);
    ok(await p.locator('.ghh-pill--warn').count() === 1, `${T}: one "update available" badge`);
    ok((await panel.getAttribute('dir')) === (lang === 'ar' ? 'rtl' : null), `${T}: direction`);
    ok(await noHScroll(p), `${T}: no horizontal scroll (list)`);
    await shot(p, `list-${sfx}`, panel);

    // overflow menu
    await rows.first().locator('[data-wpmenu]').click();
    const menu = rows.first().locator('[role=menu]');
    ok(await menu.isVisible() && (await menu.locator('[role=menuitem]').count()) === 5, `${T}: row menu with 5 actions`);
    ok(await p.evaluate(() => !!document.activeElement.closest('[role=menu]')), `${T}: focus moves into the menu`);
    await shot(p, `menu-${sfx}`, panel);
    await p.keyboard.press('Escape');
    ok(!(await menu.isVisible()), `${T}: Escape closes the menu`);

    // one-click login: a new tab opens with the sign-on address
    if (tag === 'desktop') {
      const [pop] = await Promise.all([p.waitForEvent('popup'), rows.first().locator('[data-wp=login]').click()]);
      await pop.waitForURL(/softaculous_auto=1/, { timeout: 10000 }).catch(() => {});
      ok(/softaculous_auto=1/.test(pop.url()), `${T}: "Log in to WP admin" opens the sign-on URL in a new tab`);
      await pop.close();
    }

    // install form
    await p.locator('.ghh-bar [data-add]').click();
    const form = p.locator('[data-slot] form');
    await form.waitFor();
    ok(await form.locator('[name=domain] option').count() === 3, `${T}: domain picker includes the subdomain`);
    ok((await form.locator('[name=adminEmail]').inputValue()) === 'owner@demo-brand.com', `${T}: admin email prefilled`);
    ok((await form.locator('[name=language]').inputValue()) === (lang === 'ar' ? 'ar' : 'en'), `${T}: language defaults to the panel language`);
    await form.locator('[name=directory]').fill('blog');
    await form.locator('[name=title]').fill(lang === 'ar' ? 'مدونتي' : 'Demo Blog');
    await form.locator('[name=adminUser]').fill('maria');
    ok(await noHScroll(p), `${T}: no horizontal scroll (install form)`);
    await shot(p, `install-form-${sfx}`, panel);
    await form.locator('[type=submit]').click();
    await p.locator('.ghh-wpjob--inl').waitFor({ timeout: 3000 });
    ok(true, `${T}: install progress shown while the installer runs`);
    await shot(p, `install-progress-${sfx}`, p.locator('[data-slot]'));
    const doneCard = p.locator('.ghh-wpdone');
    await doneCard.waitFor({ timeout: 10000 });
    ok((await doneCard.locator('[data-pw]').innerText()) === PASSWORD, `${T}: generated password shown once`);
    ok(await doneCard.locator('[data-copy]').count() === 2, `${T}: copy buttons for user name and password`);
    const post = be.st.posts.find((x) => x.op === 'install');
    ok(post && post.domain === 'demo-brand.com' && post.directory === 'blog' && post.deliver === 'show' && !('password' in post) && post.autoUpdate.core === true, `${T}: install request (no password sent from the browser)`);
    ok(!(await p.evaluate((pw) => JSON.stringify(Object.assign({}, localStorage, sessionStorage)).includes(pw), PASSWORD)), `${T}: password not kept in browser storage`);
    await shot(p, `install-done-${sfx}`, panel);
    await doneCard.locator('[data-close]').click();
    ok(!(await p.evaluate((pw) => document.body.innerHTML.includes(pw), PASSWORD)), `${T}: password gone from the page after Done`);
    await p.waitForFunction(() => document.querySelectorAll('.ghh-wp').length === 5);
    ok(true, `${T}: new site in the list`);

    // email delivery variant (desktop en only)
    if (tag === 'desktop' && lang === 'en') {
      await p.locator('.ghh-bar [data-add]').click();
      await form.waitFor();
      await form.locator('[name=directory]').fill('news'); await form.locator('[name=title]').fill('News'); await form.locator('[name=adminUser]').fill('editor1');
      await form.locator('input[name=deliver][value=email]').check();
      await form.locator('[type=submit]').click();
      await doneCard.waitFor({ timeout: 10000 });
      ok(!(await doneCard.locator('[data-pw]').count()) && /owner@demo-brand\.com/.test(await doneCard.innerText()), `${T}: "email me the login" shows no password`);
      await doneCard.locator('[data-close]').click();
    }

    // staging copy of the shop: sub-folder, job progress
    const shop = p.locator('.ghh-wp[data-id="26_11003"]');
    await shop.locator('[data-wpmenu]').click();
    await shop.locator('[data-wp=staging]').click();
    await form.waitFor();
    await form.locator('input[name=mode][value=sub]').check();
    ok(await form.locator('[data-f=label]').isVisible() && !(await form.locator('[data-f=directory]').isVisible()), `${T}: subdomain option swaps the field`);
    await form.locator('input[name=mode][value=dir]').check();
    await shot(p, `staging-form-${sfx}`, panel);
    await form.locator('[type=submit]').click();
    const job = p.locator('.ghh-wpjob').first();
    await job.waitFor({ timeout: 5000 });
    await p.waitForFunction(() => /45%/.test((document.querySelector('.ghh-wpjob') || {}).textContent || ''), null, { timeout: 8000 });
    ok(true, `${T}: staging job shows progress`);
    await shot(p, `staging-progress-${sfx}`, panel);
    await p.waitForFunction(() => document.querySelector('.ghh-wpjob.is-ok'), null, { timeout: 12000 });
    await p.waitForFunction(() => document.querySelectorAll('.ghh-wp--child').length === 2, null, { timeout: 8000 });
    ok(true, `${T}: staging finished and the copy appears under the shop`);

    // push to live: confirm dialog with backup option, focus inside, Escape cancels
    const stg = p.locator('.ghh-wp[data-id="26_11002"]');
    await stg.locator('[data-wp=push]').click();
    const dlg = p.locator('.ghh-dlg');
    await dlg.waitFor();
    ok(await p.evaluate(() => !!document.activeElement.closest('.ghh-dlg')), `${T}: focus in the push dialog`);
    ok(await dlg.locator('[data-chk]').isChecked(), `${T}: "back up the live site first" is on by default`);
    await shot(p, `confirm-push-${sfx}`);
    await p.keyboard.press('Escape');
    ok(!(await dlg.count()), `${T}: Escape cancels`);
    await stg.locator('[data-wp=push]').click();
    await dlg.locator('[data-ok]').click();
    await p.waitForFunction(() => document.querySelector('.ghh-wpjob.is-ok, .ghh-wpjob'), null, { timeout: 8000 });
    await p.waitForTimeout(300);
    ok(be.st.posts.some((x) => x.op === 'backup' && x.id === '26_11001') && be.st.posts.some((x) => x.op === 'push' && x.confirm === true), `${T}: backup of the live site, then push with confirm`);

    // delete: typed domain required
    await stg.locator('[data-wpmenu]').click();
    await stg.locator('[data-wp=delete]').click();
    await dlg.waitFor();
    const okBtn = dlg.locator('[data-ok]');
    ok(await okBtn.isDisabled(), `${T}: Delete disabled until the address is typed`);
    await dlg.locator('[data-typed]').fill('demo-brand.com');
    ok(await okBtn.isDisabled(), `${T}: a partial address does not enable Delete`);
    await dlg.locator('[data-typed]').fill('demo-brand.com/staging');
    ok(!(await okBtn.isDisabled()), `${T}: exact address enables Delete`);
    ok(await noHScroll(p), `${T}: no horizontal scroll (dialog)`);
    await shot(p, `confirm-delete-${sfx}`);
    await okBtn.click();
    await p.waitForFunction(() => !document.querySelector('.ghh-wp[data-id="26_11002"]'), null, { timeout: 8000 });
    ok(be.st.posts.some((x) => x.op === 'delete' && x.confirm === 'demo-brand.com/staging'), `${T}: delete sends the typed address`);

    // update core with backup first
    await rows.first().locator('[data-wpmenu]').click();
    await rows.first().locator('[data-wp=upgrade]').click();
    await dlg.waitFor();
    await dlg.locator('[data-ok]').click();
    await p.waitForFunction(() => !document.querySelector('.ghh-wp[data-id="26_11001"] .ghh-pill--warn'), null, { timeout: 8000 });
    ok(true, `${T}: update badge gone after updating WordPress`);
    await shot(p, `list-after-${sfx}`, panel);
    ok(!errors.length, `${T}: no console errors ${errors.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  console.log(failures ? `${failures} failure(s)` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
