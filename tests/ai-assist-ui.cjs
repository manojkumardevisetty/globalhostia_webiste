// Customer assistant in the account portal and the Manage hosting panel, rendered with the local mocks.
// Needs: `AI_MOCK=1 next dev` on BASE with DA_URL=https://localhost:4556 DA_USER=admin DA_LOGIN_KEY=mock-key
// DA_WHMCS_SERVER_IDS=5 HOSTING_HMAC_SECRET=<secret> NODE_EXTRA_CA_CERTS=<mock DA cert>, tests/mock-whmcs.mjs on :4555,
// tests/mock-da.mjs on :4556 and the database.
// Run: BASE=http://localhost:3101 HOSTING_HMAC_SECRET=<same secret> SHOTS=/tmp/shots NODE_PATH=$(npm root -g) node tests/ai-assist-ui.cjs
// Optional KILL=1 PGURL=postgresql://… also checks the admin kill switch (writes ai_settings, waits for the 30s cache, restores).
const { chromium } = require('playwright');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '/tmp';
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hostingToken = () => { const p = b64u(JSON.stringify({ cid: 1, sid: 102, exp: Math.floor(Date.now() / 1000) + 600 })); return `${p}.${b64u(crypto.createHmac('sha256', process.env.HOSTING_HMAC_SECRET).update(p).digest())}`; };

async function page(b, w, h, lang) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1, extraHTTPHeaders: { 'x-forwarded-for': ip(), 'x-real-ip': ip() } });
  if (lang === 'ar') await ctx.addCookies([{ name: 'gh_lang', value: 'ar', url: BASE }]);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  // ERR_TUNNEL_CONNECTION_FAILED: Google Fonts (Arabic font) is unreachable from the sandbox, not an app error
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(m.text())) errors.push(m.text()); });
  return { ctx, p, errors };
}
async function signIn(p) {
  await p.goto(`${BASE}/account/login`);
  await p.fill('#au-email', 'demo@example.com'); await p.fill('#au-pass', 'demo-pass');
  await Promise.all([p.waitForURL(/\/account(\?|$)/), p.click('form button[type=submit]')]);
}
// the assistant allows 10 messages per client per minute (AI settings): pace the questions this script sends
const sent = [];
async function pace() {
  for (;;) { const now = Date.now(); while (sent.length && now - sent[0] > 61000) sent.shift(); if (sent.length < 8) break; await new Promise((r) => setTimeout(r, 61000 - (now - sent[0]))); }
  sent.push(Date.now());
}
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const sheetBox = (p) => p.locator('.ghas-sheet.is-open .ghas-panel').boundingBox();

(async () => {
  const b = await chromium.launch();

  /* ------------------------------------------------------------ account portal */
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) for (const lang of ['en', 'ar']) {
    const T = `${tag} ${lang}`;
    const { ctx, p, errors } = await page(b, w, h, lang);
    await signIn(p);
    await p.waitForLoadState('load');
    const fab = p.locator('.ac-ask');
    await fab.waitFor({ state: 'visible', timeout: 15000 });
    ok(true, `${T}: floating "Ask GlobalHostia" button on the dashboard`);
    ok(!(await p.content()).includes('/hp/ai-chat'), `${T}: the website pre-sales chat is not loaded for signed-in customers`);
    ok(!(await p.evaluate(() => performance.getEntriesByType('resource').some((r) => /ai-assist/.test(r.name)))), `${T}: ai-assist.js is not loaded before first use`);
    if (tag === 'mobile') { const fb = await fab.boundingBox(); const tb = await p.locator('.ac-tabbar').boundingBox(); ok(fb && tb && fb.y + fb.height <= tb.y, `${T}: button sits above the tab bar`); }
    await fab.click();
    await p.locator('.ghas-sheet.is-open').waitFor({ timeout: 15000 });
    await p.waitForTimeout(400);
    const box = await sheetBox(p);
    if (tag === 'mobile') ok(box && box.width >= 389 && box.height >= 840 && box.x === 0, `${T}: full-screen sheet (${box && box.width}x${box && box.height})`);
    else ok(box && Math.round(box.width) === 440 && (lang === 'ar' ? box.x === 0 : Math.round(box.x + box.width) === w), `${T}: side sheet on the ${lang === 'ar' ? 'left' : 'right'} (${box && box.x},${box && box.width})`);
    ok((await p.locator('.ghas-sheet').getAttribute('dir')) === (lang === 'ar' ? 'rtl' : 'ltr'), `${T}: direction ${lang === 'ar' ? 'rtl' : 'ltr'}`);
    ok((await p.locator('.ghas-chip').count()) === 3, `${T}: three starter chips for the dashboard`);
    ok(await p.evaluate(() => !!document.activeElement.closest('.ghas-panel')), `${T}: focus moves into the sheet`);
    const chip0 = await p.locator('.ghas-chip').first().innerText();
    ok(lang === 'ar' ? /حسابي/.test(chip0) : /attention/.test(chip0), `${T}: dashboard chip "${chip0}"`);
    await p.screenshot({ path: `${SHOTS}/portal-dashboard-${lang}-${w}.png` });
    await pace(); await p.locator('.ghas-chip').first().click();
    await p.waitForFunction((l) => (l === 'ar' ? /غير مدفوعة/ : /unpaid invoice/).test(document.querySelector('.ghas-log').textContent), lang, { timeout: 30000 });
    ok(true, `${T}: the answer streams in (${lang === 'ar' ? 'Arabic' : 'English'})`);
    await p.locator('.ghas-send:not([disabled])').waitFor({ timeout: 20000 });
    ok((await p.locator('.ghas-log').getAttribute('aria-live')) === 'polite' && !(await p.locator('.ghas-bub[aria-busy]').count()), `${T}: streaming text in an aria-live log, busy flag cleared`);
    await p.screenshot({ path: `${SHOTS}/portal-dashboard-answer-${lang}-${w}.png` });
    ok(await noHScroll(p), `${T}: no horizontal scroll with the sheet open`);
    if (tag === 'desktop' && lang === 'en') {
      for (let i = 0; i < 14; i++) await p.keyboard.press('Tab');
      ok(await p.evaluate(() => !!document.activeElement.closest('.ghas-panel')), `${T}: Tab stays inside the sheet (focus trap)`);
      await p.keyboard.press('Escape');
      await p.waitForTimeout(350);
      ok(!(await p.locator('.ghas-sheet.is-open').count()) && (await fab.isVisible()), `${T}: Escape closes the sheet and the button returns`);
      ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('ac-ask')), `${T}: focus returns to the button`);
      // account menu entry
      await p.locator('.ac-dd--me summary').click();
      const mi = p.locator('.ac-dd--me [data-ac-ask]');
      ok(await mi.isVisible(), `${T}: "Ask the assistant" in the account menu`);
      await mi.click(); await p.locator('.ghas-sheet.is-open').waitFor(); ok(true, `${T}: account menu opens the sheet`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    }

    /* DNS page: palette -> assistant -> MX proposal */
    await p.goto(`${BASE}/account/domains/301`);
    await p.waitForLoadState('load');
    await p.locator('.ac-ask').waitFor({ state: 'visible' });
    if (tag === 'desktop') {
      await p.keyboard.press('Control+k');
      await p.locator('#ac-pal').waitFor({ state: 'visible' });
      await p.fill('#ac-pal-q', lang === 'ar' ? 'أضف سجلات MX لـ Google Workspace' : 'Add MX records for Google Workspace');
      await p.waitForTimeout(200);
      const opt = p.locator('#ac-pal-list [role=option]', { hasText: lang === 'ar' ? 'اسأل المساعد' : 'Ask the assistant' });
      ok(await opt.count() === 1, `${T}: palette offers "Ask the assistant: …" with the query`);
      await pace(); await opt.click();
    } else {
      await p.locator('.ac-ask').click();
      await p.locator('.ghas-sheet.is-open').waitFor();
      const chips = await p.locator('.ghas-chip').allInnerTexts();
      ok(chips.some((c) => /demo-brand\.com/.test(c)) && chips.some((c) => /Google Workspace/.test(c)), `${T}: DNS page chips name the domain (${chips.join(' | ')})`);
      await pace(); await p.locator('.ghas-chip', { hasText: 'Google Workspace' }).click();
    }
    const card = p.locator('.ghas-card').last();
    await card.waitFor({ timeout: 30000 });
    await p.waitForTimeout(500);
    const ct = await card.innerText();
    ok(/smtp\.google\.com/.test(ct) && (lang === 'ar' ? /إضافة سجل MX/.test(ct) : /Add MX record/.test(ct)), `${T}: MX proposal card for demo-brand.com`);
    ok((await card.locator('button').allInnerTexts()).length === 2, `${T}: Confirm + Cancel`);
    await card.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${SHOTS}/portal-dns-proposal-${lang}-${w}.png` });
    ok(await noHScroll(p), `${T}: no horizontal scroll on the DNS page with the card`);
    if (tag === 'desktop' && lang === 'en') {
      await card.locator('.ghas-btn').first().click();
      await p.locator('.ghas-card.is-ok').waitFor({ timeout: 20000 });
      ok(/Record added/.test(await card.innerText()) && (await card.locator('.ghas-mk--ok').count()) === 1, `${T}: success with the hexagon mark`);
      await p.waitForFunction(() => /smtp\.google\.com/.test(document.getElementById('dns').textContent), null, { timeout: 10000 });
      ok(true, `${T}: the DNS card refreshed in place with the new record`);
      ok((await p.locator('#dns [data-dns-open]').count()) > 0 && (await p.evaluate(() => { const a = document.querySelector('#dns [data-dns-open]'); a.click(); const pnl = document.getElementById(a.getAttribute('data-dns-open')); return pnl && !pnl.hidden; })), `${T}: refreshed DNS editor still works (edit panel opens)`);
      await p.screenshot({ path: `${SHOTS}/portal-dns-confirmed-${lang}-${w}.png` });
      // off-topic: canned line + chips, no model call
      await pace(); await p.fill('.ghas-input', 'what is the gold price today');
      await p.keyboard.press('Enter');
      await p.waitForFunction(() => /I can help with GlobalHostia hosting, domains, email and your account\./.test(document.querySelector('.ghas-log').textContent), null, { timeout: 15000 });
      ok((await p.locator('.ghas-chips').last().locator('.ghas-chip').count()) === 3, `${T}: off-topic gets the canned line and three chips`);
      await p.screenshot({ path: `${SHOTS}/portal-offtopic-${lang}-${w}.png` });
    }
    ok(!errors.length, `${T}: no console errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  /* ------------------------------------------------------------ Manage hosting panel (WHMCS client area, mocked page) */
  const SITE = 'https://globalhostia.com';
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) for (const lang of ['en', 'ar']) {
    const T = `panel ${tag} ${lang}`;
    const { ctx, p, errors } = await page(b, w, h, lang);
    const token = hostingToken();
    // the client area page (my.globalhostia.com) and the app's own origin, proxied to the local server
    await ctx.route('https://my.globalhostia.com/**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Product details</title>
<link rel="stylesheet" href="${SITE}/hp/whmcs.css?v=test"><style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#f4f6f8;color:#23313d}#main-body .container{max-width:1180px;margin:0 auto;padding:24px 16px}.card{background:#fff;border:1px solid #e3e7ec;border-radius:12px;padding:16px 20px;margin-bottom:20px}</style>
<script>window.GH_HOSTING=${JSON.stringify({ token, sid: 102 })};window.GH_LANG=${JSON.stringify(lang === 'ar' ? 'arabic' : 'english')};</script>
<script src="${SITE}/hp/whmcs.js?v=test"></script></head><body><nav class="card"><a href="logout.php">Logout</a></nav><div id="main-body"><div class="container"><div class="card"><h3>Hostia Ultra · demo-brand.com</h3><a class="btn gh-console-btn" href="#">Login to DirectAdmin</a></div></div></div></body></html>` }));
    await ctx.route(`${SITE}/**`, async (r) => { const u = new URL(r.request().url()); const res = await r.fetch({ url: BASE + u.pathname + u.search }); await r.fulfill({ response: res }); });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('gh-hosting-tab-102', 'dns'); } catch (e) { /* ignore */ } });
    await p.goto('https://my.globalhostia.com/clientarea.php?action=productdetails&id=102');
    const ask = p.locator('.ghh [data-ask]');
    await ask.waitFor({ state: 'visible', timeout: 30000 });
    ok(true, `${T}: "Ask" button in the panel header`);
    await p.locator('.ghh tbody tr').first().waitFor({ timeout: 20000 });
    ok(!(await p.evaluate(() => performance.getEntriesByType('resource').some((r) => /ai-assist/.test(r.name)))), `${T}: ai-assist.js not loaded until the assistant is opened`);
    if (tag === 'desktop') {
      await p.keyboard.press('Control+k');
      await p.locator('.ghh-pal:not([hidden])').waitFor();
      await p.keyboard.type(lang === 'ar' ? 'لماذا موقعي بطيء' : 'why is my site slow');
      await p.waitForTimeout(150);
      const opt = p.locator('.ghh-pal__it', { hasText: lang === 'ar' ? 'اسأل المساعد' : 'Ask the assistant' });
      ok(await opt.count() === 1, `${T}: palette offers "Ask the assistant: …"`);
      await p.keyboard.press('Escape');
    }
    const wBefore = await p.evaluate(() => document.documentElement.scrollWidth);
    await ask.click();
    await p.locator('.ghas-sheet.is-open').waitFor({ timeout: 20000 });
    await p.waitForTimeout(400);
    const box = await sheetBox(p);
    if (tag === 'mobile') ok(box && box.width >= 389 && box.height >= 840, `${T}: full-screen sheet`);
    else ok(box && Math.round(box.width) === 440, `${T}: side sheet`);
    const chips = await p.locator('.ghas-chip').allInnerTexts();
    ok(chips.some((c) => /Google Workspace/.test(c)), `${T}: DNS tab chips (${chips.join(' | ')})`);
    await pace(); await p.locator('.ghas-chip', { hasText: 'Google Workspace' }).click();
    const card = p.locator('.ghas-card').last();
    await card.waitFor({ timeout: 30000 });
    await p.waitForTimeout(500);
    ok(/smtp\.google\.com/.test(await card.innerText()), `${T}: MX proposal for the panel's domain`);
    await p.screenshot({ path: `${SHOTS}/panel-proposal-${lang}-${w}.png` });
    // this mock page has no Bootstrap container, so the panel's wide DNS table (long DKIM value) can overflow it on its own;
    // what is checked here is that the assistant adds no horizontal scroll
    ok(await p.evaluate((b0) => document.documentElement.scrollWidth <= Math.max(b0, window.innerWidth + 1), wBefore), `${T}: the sheet adds no horizontal scroll`);
    if (tag === 'desktop') {
      await card.locator('.ghas-btn').first().click();
      await p.locator('.ghas-card.is-ok').waitFor({ timeout: 20000 });
      ok((await card.locator('.ghas-mk--ok').count()) === 1, `${T}: confirmed through /api/hosting/dns, success mark shown`);
      await p.waitForFunction(() => /smtp\.google\.com/.test(document.querySelector('.ghh [data-body]').textContent), null, { timeout: 15000 });
      ok(true, `${T}: DNS tab reloaded with the new record`);
      await p.screenshot({ path: `${SHOTS}/panel-confirmed-${lang}-${w}.png` });
    }
    ok(!errors.length, `${T}: no console errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  /* ------------------------------------------------------------ kill switch (optional: writes the AI settings row) */
  if (process.env.KILL === '1' && process.env.PGURL) {
    const sql = (q) => execFileSync('psql', [process.env.PGURL, '-tAc', q]).toString().trim();
    const had = sql("select count(*) from settings where key='ai_settings'") !== '0';
    if (!had) {
      sql(`insert into settings(key, value) values ('ai_settings', '{"surfaces":{"chat":true,"assist":false,"tickets":true,"admin":true}}')`);
      try {
        console.log('waiting 31s for the settings cache…');
        await new Promise((r) => setTimeout(r, 31000));
        const { ctx, p } = await page(b, 1440, 900, 'en');
        await signIn(p);
        ok(!(await p.locator('.ac-ask, [data-ac-ask]').count()) && !(await p.locator('[data-ac][data-ai]').count()), 'kill switch: no assistant entry points in the portal');
        const s = await (await p.request.get(`${BASE}/api/hosting/session`, { headers: { authorization: `Bearer ${hostingToken()}`, origin: 'https://my.globalhostia.com' } })).json();
        ok(s.ai === false, 'kill switch: the panel session reports ai=false (Ask button stays hidden)');
        await ctx.close();
      } finally { sql("delete from settings where key='ai_settings'"); }
    } else console.log('SKIP  kill switch: an ai_settings row exists; not touching it');
  }

  await b.close();
  console.log(failures ? `${failures} failure(s)` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
