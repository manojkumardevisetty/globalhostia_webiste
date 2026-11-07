// Read-only WHMCS signup regression checks. No account is created; all writes are blocked.
// NODE_PATH=/path/to/playwright/node_modules LOCAL_ASSETS=1 node tests/whmcs-signup.cjs
// Omit LOCAL_ASSETS after deploying to verify the actual production assets.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.BASE || 'https://my.globalhostia.com';
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [320, 390, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      let writes = 0;
      await ctx.route('**/*', route => {
        const req = route.request(), u = new URL(req.url());
        if (req.method() !== 'GET') { writes++; return route.abort(); }
        if (process.env.LOCAL_ASSETS === '1' && /^\/hp\/whmcs(?:\.min)?\.(js|css)$/.test(u.pathname)) {
          return route.fulfill({ path: path.join(__dirname, '../public', u.pathname.replace('.min.', '.')), headers: { 'access-control-allow-origin': '*' } });
        }
        // Third-party analytics/chat are unrelated to the form and must not receive test data.
        if (!['my.globalhostia.com', 'globalhostia.com', 'globalhostiawebiste.vercel.app'].includes(u.hostname)) return route.abort();
        return route.continue();
      });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(BASE + '/register.php', { waitUntil: 'networkidle' });
      await page.locator('.gh-signup').waitFor();
      await page.evaluate(() => document.activeElement?.blur());
      const result = await page.evaluate(() => {
        const form = document.querySelector('form#frmCheckout');
        const fields = [...form.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=checkbox]),select')];
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          action: new URL(form.action).pathname,
          token: !!form.querySelector('input[name=token]'),
          fields: fields.map(e => ({ name: e.name, id: e.id, label: !!document.querySelector('label[for="' + e.id + '"]'), visible: !!e.getClientRects().length, font: parseFloat(getComputedStyle(e).fontSize) })),
          columns: getComputedStyle(document.querySelector('#containerNewUserSignup')).gridTemplateColumns.split(' ').length,
          consent: !!form.querySelector('input[name=accepttos]'),
          headings: document.querySelectorAll('h1').length
        };
      });
      assert.equal(result.overflow, false, `${width}: no horizontal overflow`);
      assert.equal(result.action, '/register.php'); assert.ok(result.token); assert.ok(result.consent);
      assert.equal(result.headings, 1);
      for (const f of result.fields) { assert.ok(f.label, `${width}: ${f.name} has a visible label`); if (f.visible) assert.ok(f.font >= 16, `${width}: ${f.name} readable without mobile zoom`); }
      assert.equal(result.columns, width <= 540 ? 1 : 2, `${width}: responsive field columns`);
      await page.locator('#inputFirstName').fill('UI');
      await page.locator('#inputLastName').fill('Audit');
      await page.locator('#inputEmail').fill('audit@example.com');
      await page.locator('#inputNewPassword1').fill('Testing-Form-Only!4829');
      await page.locator('#inputNewPassword1').press('Tab');
      assert.equal(await page.locator('#inputNewPassword2').getAttribute('autocomplete'), 'new-password');
      assert.ok(await page.locator('#passwordStrengthMeterBar').count());
      const consent = page.locator('input[name=accepttos]');
      await consent.focus(); await consent.press('Space'); assert.equal(await consent.isChecked(), true, 'terms keyboard control');
      await consent.press('Space'); assert.equal(await consent.isChecked(), false);
      assert.ok(await page.locator('#inputCurrency').isVisible(), 'native currency dropdown remains accessible');
      // Country changes still use WHMCS's original dependent state widget.
      await page.locator('#inputCountry').selectOption('US');
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#inputCountry').inputValue(), 'US');
      assert.ok(await page.locator('#stateinput').isHidden(), 'country change hides unused state text field');
      assert.ok(await page.locator('#stateselect').isVisible(), 'country change exposes native state menu');
      assert.ok(await page.locator('label[for=stateselect]').count(), 'replacement state menu keeps its label');
      await page.locator('#inputCountry').selectOption('AE');
      // Clear test data before screenshots; keep the form entirely unsubmitted.
      await page.locator('#inputFirstName').fill(''); await page.locator('#inputLastName').fill('');
      await page.locator('#inputEmail').fill(''); await page.locator('#inputNewPassword1').fill('');
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.SHOTS, `signup-${width}.png`), fullPage: true }); }
      console.log(`PASS signup ${width}px: labels, layout, fields, password and country widgets; ${writes} writes blocked; page errors: ${errors.length}`);
      assert.deepEqual(errors, [], 'no client script errors');
      await ctx.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
