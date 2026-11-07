// Tests the exact HTML emitted by the PHP hook, with all network traffic intercepted.
// NODE_PATH=/path/to/playwright/node_modules node tests/whmcs-handoff-ui.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const php = fs.readFileSync(path.join(__dirname, '../docs/whmcs/globalhostia_portal_hook.php'), 'utf8');
const nonce = 'testNonceForBrowser123';
const html = php.match(/echo <<<HTML\n([\s\S]*?)\nHTML;/)[1].replaceAll('{$nonce}', nonce).replaceAll('{$safeAssertion}', 'dummy.signedassertion');
const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action https://globalhostia.com; base-uri 'none'; frame-ancestors 'none'`;
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1440]) {
      for (const mode of ['automatic', 'paused', 'no-script']) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: mode !== 'no-script' });
        if (mode === 'automatic') await ctx.addInitScript(() => { HTMLFormElement.prototype.submit = function () { window.__handoffSubmitted = true; }; });
        if (mode === 'paused') await ctx.addInitScript(() => { HTMLFormElement.prototype.submit = function () {}; });
        const page = await ctx.newPage();
        page.on('pageerror', e => console.error('PAGEERROR', e.message));
        await ctx.route('**/*', async route => {
          const req = route.request(), u = new URL(req.url());
          if (u.pathname === '/clientarea.php') return route.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': csp }, body: html });
          if (u.pathname === '/account/whmcs/callback') {
            assert.equal(req.method(), 'POST'); assert.equal(new URLSearchParams(req.postData()).get('assertion'), 'dummy.signedassertion');
            return route.fulfill({ status: 303, headers: { location: 'https://globalhostia.com/account' }, body: '' });
          }
          if (u.pathname === '/account') return route.fulfill({ contentType: 'text/html', body: '<h1>Dashboard</h1>' });
          return route.abort();
        });
        await page.goto('https://my.globalhostia.com/clientarea.php?gh_portal_state=temporary-challenge', { waitUntil: 'domcontentloaded' });
        if (mode === 'automatic') {
          await page.waitForFunction(() => window.__handoffSubmitted === true);
          assert.equal(await page.locator('#gh-handoff').isVisible(), false, 'no intermediate form flashes');
          assert.equal(await page.locator('body').innerText(), '', 'no raw handoff text or button is painted');
          assert.ok(!page.url().includes('gh_portal_state='), 'temporary challenge removed from visible history');
        } else {
          await page.locator('#gh-handoff').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#gh-handoff').isVisible(), true, 'branded recovery is usable without automatic submission');
          assert.ok(await page.locator('#gh-handoff').innerText().then(t => t.includes('GlobalHostia')));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          assert.equal(await page.getByRole('button', { name: 'Open my account' }).evaluate(b => b.form.id), 'gh-handoff-form');
          assert.equal(await page.locator('#gh-handoff-form').getAttribute('method'), 'post');
        }
        console.log(`PASS ${width}px ${mode}: automatic handoff or accessible recovery`);
        await ctx.close();
      }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
