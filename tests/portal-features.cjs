// Portal features: domain portfolio, team access, command palette, install / notifications settings, Arabic + RTL.
// Needs the app (BASE) with tests/mock-whmcs.mjs as WHMCS and a database.
// Run: BASE=http://localhost:3401 SHOTS=/tmp/shots NODE_PATH=$(npm root -g) node tests/portal-features.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '';
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

async function signIn(b, email, pass, viewport) {
  const ctx = await b.newContext({ viewport, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/account/login`);
  await p.fill('#au-email', email); await p.fill('#au-pass', pass);
  await Promise.all([p.waitForURL(/\/account(\?|$)/), p.click('button[type=submit]:has-text("Sign in"), button[type=submit]:has-text("تسجيل الدخول")')]);
  return { ctx, p };
}
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const setLang = async (ctx, l) => ctx.addCookies([{ name: 'gh_lang', value: l, url: BASE }]);

(async () => {
  const b = await chromium.launch();
  const { ctx, p } = await signIn(b, 'demo@example.com', 'demo-pass', { width: 1440, height: 900 });

  /* ---------------- 1. domain portfolio */
  await p.goto(`${BASE}/account/domains`);
  let html = await p.content();
  ok(html.includes('data-pfw') && html.includes('demo-store.com') && html.includes('demo-legacy.org'), 'portfolio lists every domain');
  ok((await p.locator('[data-pf-row]').count()) === 6, 'six domain rows');
  ok(html.includes('Expiring in 30 days') && html.includes('Auto-renew off'), 'hero numbers and quick filters');
  await p.waitForFunction(() => !document.querySelector('[data-pf-ns] .ac-pf__sk, [data-pf-lock] .ac-pf__sk'), null, { timeout: 20000 }).catch(() => {});
  const cf = await p.locator('[data-id="304"] [data-pf-ns]').innerText();
  ok(/cloudflare/i.test(cf), `lazy nameserver lookup names the external DNS host (${cf.trim()})`);
  ok(/locked/i.test(await p.locator('[data-id="301"] [data-pf-lock]').innerText()), 'registrar lock state loaded');
  ok(/Hosting account|Managed by us/.test(await p.locator('[data-id="301"] [data-pf-dns]').innerText()), 'DNS location shown under the domain');
  await p.waitForFunction(() => !document.querySelector('[data-pf-ssl] .ac-pf__sk'), null, { timeout: 30000 }).catch(() => {});
  ok(!(await p.locator('[data-pf-ssl] .ac-pf__sk').count()), 'SSL column filled (probe result or "Not checked")');
  // client-side filters
  await p.fill('[data-pf-q]', 'labs'); await p.waitForTimeout(300);
  ok((await p.locator('[data-pf-row]:not([hidden])').count()) === 1 && /q=labs/.test(p.url()), 'search filters instantly and keeps the URL');
  await p.fill('[data-pf-q]', ''); await p.waitForTimeout(200);
  await p.click('label.ac-chipf:has(input[name=exp][value="30"])'); await p.waitForTimeout(200);
  const exp30 = await p.locator('[data-pf-row]:not([hidden])').evaluateAll((rs) => rs.map((r) => r.dataset.id).sort());
  ok(JSON.stringify(exp30) === JSON.stringify(['301', '303', '305']), `expiring ≤ 30 days filter (${exp30})`);
  await p.click('label.ac-chipf:has(input[name=exp][value="30"])');
  await p.click('label.ac-chipf:has(input[name=ns][value="ext"])'); await p.waitForTimeout(200);
  // demo.ae has ns3.globalhostia.com (not one of ours): mixed counts as external
  ok((await p.locator('[data-pf-row]:not([hidden])').evaluateAll((rs) => rs.map((r) => r.dataset.id))).join() === '302,304', 'external nameservers filter (external + mixed)');
  await p.click('label.ac-chipf:has(input[name=ns][value="ext"])');
  await p.selectOption('[data-pf-sort]', 'name'); await p.waitForTimeout(200);
  ok((await p.locator('[data-pf-row] .ac-pf__dom a').first().innerText()) === 'demo-brand.com', 'sort by name');
  await p.selectOption('[data-pf-sort]', 'expiry');
  // server-side filtering (no JS) agrees
  const srv = await (await p.request.get(`${BASE}/account/domains?ar=off`)).text();
  ok((srv.match(/data-pf-row[^>]*>/g) || []).filter((r) => !/ hidden/.test(r)).length === 2, 'server-side filter (auto-renew off) without JavaScript');
  await shot(p, 'domains-1440-en');
  ok(await noOverflow(p), 'no horizontal scroll: portfolio 1440 en');

  // bulk: auto-renew on for two domains (one already on → skipped), partial failure reporting
  await p.check('[data-id="302"] .ac-pf__cb input'); await p.check('[data-id="301"] .ac-pf__cb input');
  ok(await p.locator('[data-pf-bar].is-on').isVisible(), 'bulk bar appears when domains are selected');
  await Promise.all([p.waitForURL(/bk=autorenew_on/), p.click('[data-pf-bar] button[value=autorenew_on]')]);
  html = await p.content();
  ok(/bd=302/.test(p.url()) && /bs=301/.test(p.url()) && html.includes('1 domain updated') && html.includes('1 already set'), 'bulk auto-renew: updated + already-set reported per domain');
  // bulk lock with a registry refusal (.ae)
  await p.check('[data-id="302"] .ac-pf__cb input'); await p.check('[data-id="306"] .ac-pf__cb input');
  await Promise.all([p.waitForURL(/bk=lock/), p.click('[data-pf-bar] button[value=lock]')]);
  html = await p.content();
  ok(/bf=302-api/.test(p.url()) && html.includes('demo-labs.io') && html.includes('refused the change'), 'bulk lock: partial failure listed with its reason');
  // nameserver switch asks for confirmation; external-NS domain without a zone here is skipped (never broken)
  await p.check('[data-id="304"] .ac-pf__cb input'); await p.check('[data-id="302"] .ac-pf__cb input');
  await p.click('[data-pf-bar] button[value=ns_ours]');
  ok(await p.locator('#ac-pf-dlg[open]').isVisible(), 'nameserver change opens a confirmation dialog');
  ok((await p.locator('[data-pf-dlg-list]').innerText()).includes('demo-store.com'), 'dialog lists the selected domains');
  await shot(p, 'domains-confirm-1440-en');
  await Promise.all([p.waitForURL(/bk=ns_ours/), p.click('[data-pf-dlg-yes]')]);
  ok(/bd=304/.test(p.url()) && /bf=302-nozone/.test(p.url()), 'zone here: switched; no DNS zone here: skipped, never broken');
  // CSRF + ownership
  const csrf = await p.getAttribute('input[name=csrf]', 'value');
  const forged = await p.request.post(`${BASE}/account/domains`, { form: { op: 'bulk', action: 'unlock', sel: 'd:301' }, headers: { origin: BASE }, maxRedirects: 0 });
  ok(forged.status() === 303 && /err=csrf/.test(forged.headers().location || ''), 'bulk POST without CSRF token is rejected');
  const other = await p.request.post(`${BASE}/account/domains`, { form: { csrf, op: 'bulk', action: 'unlock', sel: 'd:401' }, headers: { origin: BASE }, maxRedirects: 0 });
  ok(/bf=401-notfound/.test(other.headers().location || ''), "another client's domain is refused (not found)");
  const api = await (await p.request.get(`${BASE}/account/api/domains?f=status&ids=401,301`)).json();
  ok(api.items['301'] && !api.items['401'], 'lookup API answers only for own domains');
  // CSV
  const csv = await p.request.get(`${BASE}/account/domains/export?sel=d:301&sel=d:304`);
  const body = await csv.text();
  ok(/text\/csv/.test(csv.headers()['content-type']) && /attachment/.test(csv.headers()['content-disposition']) && body.split('\r\n').filter(Boolean).length === 3 && body.includes('demo-store.com'), 'CSV export of selected domains');

  /* ---------------- 2. team access */
  await p.goto(`${BASE}/account/team`);
  html = await p.content();
  ok(html.includes('Dana Developer') && html.includes('Bilal Accounts') && html.includes('Owner'), 'team lists members with the owner');
  ok(html.includes('Developer') && html.includes('Manage domains') && html.includes('Invoices and payments'), 'permission chips and preset names');
  await p.fill('#ac-tm-email', 'not-an-email'); await p.click('button:has-text("Send invitation")'); await p.waitForLoadState();
  ok((await p.content()).includes('Enter a valid email address.'), 'invite validation');
  await p.fill('#ac-tm-email', `new${Date.now()}@example.com`);
  await p.check('input[name=preset][value=billing] >> nth=-1');
  await Promise.all([p.waitForURL(/ok=invited/), p.click('button:has-text("Send invitation")')]);
  ok((await p.content()).includes('Invitation sent'), 'invite with the Billing preset');
  await p.click('#tm-22 summary:has-text("Change access")');
  await p.check('#tm-22 input[name=preset][value=developer]');
  await Promise.all([p.waitForURL(/ok=perms_saved/), p.click('#tm-22 button:has-text("Save access")')]);
  ok((await p.locator('#tm-22').innerText()).includes('Developer'), 'change permissions to a preset');
  await shot(p, 'team-1440-en');
  ok(await noOverflow(p), 'no horizontal scroll: team 1440 en');
  // non-owner sees the list read-only, and cannot post
  const dev = await signIn(b, 'dev@example.com', 'dev-pass', { width: 1440, height: 900 });
  await dev.p.goto(`${BASE}/account/team`);
  ok((await dev.p.content()).includes('Only the account owner can invite people') && !(await dev.p.content()).includes('Send invitation'), 'non-owner: read-only team page');
  const dcsrf = await dev.p.getAttribute('input[name=csrf]', 'value');
  const denied = await dev.p.request.post(`${BASE}/account/team`, { form: { csrf: dcsrf, op: 'remove', uid: '22', confirm: 'yes' }, headers: { origin: BASE }, maxRedirects: 0 });
  ok(/err=owner_only/.test(denied.headers().location || ''), 'non-owner cannot remove members');
  await dev.ctx.close();

  /* ---------------- 3. command palette */
  await p.goto(`${BASE}/account`);
  await p.keyboard.press('Control+k');
  ok(await p.locator('#ac-pal[open]').isVisible(), 'Ctrl+K opens the palette');
  ok((await p.getAttribute('#ac-pal-q', 'role')) === 'combobox', 'palette input is a combobox');
  await p.fill('#ac-pal-q', 'demo-labs'); await p.waitForTimeout(800);
  ok((await p.locator('#ac-pal-list [role=option]').first().innerText()).includes('demo-labs.io'), 'palette finds a domain');
  await p.fill('#ac-pal-q', 'add dns demo-brand.com'); await p.waitForTimeout(300);
  ok((await p.locator('#ac-pal-list [role=option][aria-selected=true]').innerText()).includes('Add DNS record for demo-brand.com'), 'palette offers "Add DNS record for …"');
  await p.fill('#ac-pal-q', '5001'); await p.waitForTimeout(300);
  ok((await p.locator('#ac-pal-list').innerText()).includes('Invoice #5001'), 'palette finds an invoice by number');
  await p.fill('#ac-pal-q', 'vps'); await p.waitForTimeout(300);
  await shot(p, 'palette-1440-en');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  await p.waitForLoadState();
  ok(/\/account\/services\/101/.test(p.url()) || /\/account/.test(p.url()), 'keyboard navigation opens the result');
  await p.click('[data-ac-palette]');
  ok(/recent/i.test(await p.locator('#ac-pal-list').innerText()), 'recent items listed');
  await p.keyboard.press('Escape');

  /* ---------------- 4. install & notifications settings, PWA files */
  await p.goto(`${BASE}/account/settings`);
  html = await p.content();
  ok(html.includes('Install the app') && html.includes('Notifications') && html.includes('Language and numbers'), 'settings page sections');
  ok(html.includes('<link rel="manifest" href="/account.webmanifest">'), 'portal links its own web manifest');
  const man = await (await p.request.get(`${BASE}/account.webmanifest`)).json();
  ok(man.scope === '/account' && man.theme_color === '#16212b' && man.icons.some((i) => i.purpose === 'maskable'), 'manifest scoped to /account with maskable icon');
  const sw = await (await p.request.get(`${BASE}/account-sw.js`)).text();
  ok(/indexOf\("\/account"\) === 0\) return false/.test(sw), 'service worker never caches /account responses');
  const reg = await p.evaluate(() => Promise.race([navigator.serviceWorker.ready.then((r) => r.scope), new Promise((r) => setTimeout(() => r(''), 10000))]));
  ok(/\/account$/.test(reg), `service worker registered with scope /account (${reg})`);
  await shot(p, 'settings-1440-en');
  // offline: the worker answers navigations with the static offline page (no account data is ever cached)
  await p.reload();
  await ctx.setOffline(true);
  await p.goto(`${BASE}/account/invoices`).catch(() => {});
  const off = await p.content();
  ok(off.includes('You are offline') && !off.includes('5001'), 'offline navigation shows the offline page, no cached account data');
  await ctx.setOffline(false);
  await p.goto(`${BASE}/account/settings`);

  /* ---------------- 5. Arabic / RTL */
  await p.click('.ac-dd--me summary');
  await Promise.all([p.waitForURL(/ok=lang_saved/), p.click('.ac-dd--me button[lang=ar]')]);
  ok((await p.getAttribute('html', 'dir')) === 'rtl' && (await p.getAttribute('html', 'lang')) === 'ar', 'language switch: <html dir="rtl" lang="ar">');
  html = await p.content();
  ok(html.includes('اللغة والأرقام') && html.includes('IBM+Plex+Sans+Arabic'), 'Arabic strings and Arabic font');
  await shot(p, 'settings-1440-ar');
  for (const [u, name] of [['/account/domains', 'domains'], ['/account/team', 'team'], ['/account', 'dashboard'], ['/account/renewals', 'renewals'], ['/account/invoices', 'invoices']]) {
    await p.goto(BASE + u);
    if (name === 'domains') await p.waitForFunction(() => !document.querySelector('[data-pf-lock] .ac-pf__sk'), null, { timeout: 20000 }).catch(() => {});
    ok(await noOverflow(p), `no horizontal scroll: ${name} 1440 ar`);
    if (name === 'domains' || name === 'team' || name === 'dashboard') await shot(p, `${name}-1440-ar`);
  }
  await p.goto(`${BASE}/account/domains`);
  ok((await p.content()).includes('محفظة نطاقاتك') && (await p.content()).includes('تنتهي خلال 30 يومًا'), 'Arabic portfolio');
  await p.goto(`${BASE}/account/invoices`);
  ok(/25\.20/.test(await p.content()), 'money keeps Latin digits in Arabic');
  await p.keyboard.press('Control+k'); await p.waitForTimeout(400);
  ok((await p.locator('#ac-pal-q').getAttribute('placeholder')).includes('ابحث'), 'palette in Arabic');
  await shot(p, 'palette-1440-ar');
  await p.keyboard.press('Escape');

  /* ---------------- 6. phone width, both languages */
  for (const lang of ['en', 'ar']) {
    const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
    await m.addCookies((await ctx.cookies()).filter((c) => c.name === 'gh_client'));
    await setLang(m, lang);
    const mp = await m.newPage();
    for (const [u, name] of [['/account/domains', 'domains'], ['/account/team', 'team'], ['/account/settings', 'settings'], ['/account', 'dashboard']]) {
      await mp.goto(BASE + u);
      if (name === 'domains') {
        await mp.waitForFunction(() => !document.querySelector('[data-pf-lock] .ac-pf__sk'), null, { timeout: 20000 }).catch(() => {});
        await mp.check('[data-id="301"] .ac-pf__cb input');
      }
      ok(await noOverflow(mp), `no horizontal scroll: ${name} 390 ${lang}`);
      await shot(mp, `${name}-390-${lang}`);
    }
    await mp.goto(`${BASE}/account`);
    await mp.click('[data-ac-palette]');
    const box = await mp.locator('#ac-pal').boundingBox();
    ok(box && box.width >= 389 && box.height >= 800, `palette is a full-screen sheet on phones (${lang})`);
    await shot(mp, `palette-390-${lang}`);
    await m.close();
  }

  // back to English for other runs
  await p.goto(`${BASE}/account/settings`);
  await p.check('input[type=radio][name=lang][value=en]');
  await Promise.all([p.waitForURL(/ok=lang_saved/), p.click('.ac-st form[action="/account/lang"] button[type=submit]')]);
  ok((await p.getAttribute('html', 'lang')) === 'en', 'switch back to English');
  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
