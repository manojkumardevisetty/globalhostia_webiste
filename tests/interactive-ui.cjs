// Read-only public UI audit. Install Playwright separately, then:
// BASE=https://globalhostia.com NODE_PATH=/path/to/playwright/node_modules node tests/interactive-ui.cjs
// LOCAL_ASSETS=1 exercises this checkout against real public markup before deployment.
// All non-GET requests are intercepted; no tickets, orders or messages are created.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { default: AxeBuilder } = require('@axe-core/playwright');
const fs = require('node:fs');
const path = require('node:path');
const BASE = process.env.BASE || 'https://globalhostia.com';
const origin = new URL(BASE).origin;
const routes = ['/', '/vps-hosting', '/web-hosting', '/wordpress-hosting', '/dedicated-servers', '/cloud-servers', '/windows-rdp', '/linux-rdp', '/forex-vps', '/ai', '/cpanel-reseller', '/domains-registration', '/domain-transfer', '/premium-domains', '/ssl-certificate', '/google-workspace', '/plan-finder', '/free-migration', '/contact', '/business-services', '/help-center', '/ar/vps-hosting'];
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await ctx.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url());
        if (req.method() !== 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ticket: 'received' }) });
        if (u.origin !== origin) return route.abort();
        if (process.env.LOCAL_ASSETS === '1' && u.pathname.startsWith('/hp/')) {
          const file = path.join(__dirname, '../public', u.pathname.replace(/\.min\.(js|css)$/, '.$1'));
          if (fs.existsSync(file)) return route.fulfill({ path: file });
        }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const url of routes.filter(u => !process.env.ONLY || process.env.ONLY.split(",").includes(u))) {
        errors.length = 0;
        const response = await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
        if (url === '/business-services' && response.status() === 404) { console.log(`SKIP ${width} ${url}: shop unpublished`); continue; }
        ok(response.status() === 200, `${width} ${url}: HTTP 200 (${response.status()})`);
        await page.waitForFunction(() => window.HP && window.HP.on);
        // Page modules initialize during idle time (1200ms deadline).
        await page.waitForTimeout(1500);
        ok(!errors.length, `${width} ${url}: script errors ${errors.join('; ')}`);
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} ${url}: no horizontal page overflow`);
        // Every visible billing/plan tab must update selection and its pane/href targets.
        for (const group of await page.locator('[data-tabs]').all()) {
          if (!await group.isVisible()) continue;
          const buttons = group.locator('[role=radio], [role=tab]');
          for (const b of await buttons.all()) {
            if (!await b.isVisible()) continue;
            await b.click();
            ok(await b.getAttribute(await b.getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-checked') === 'true', `${url}: selector changes`);
            const pane = await b.getAttribute('aria-controls');
            if (pane) ok(await page.locator(`[id="${pane}"]`).isVisible(), `${url}: selected pane visible`);
          }
        }
        const faq = page.locator('main details summary').first();
        if (await faq.isVisible()) { await faq.click(); ok(await faq.evaluate(e => e.parentElement.open), `${url}: FAQ opens`); }
        if (url === '/vps-hosting') {
          for (const id of ['vx-cpu', 'vx-ram', 'vx-disk']) {
            const slider = page.locator('#' + id);
            ok(await slider.count(), `${id}: exists`);
            await slider.focus();
            for (const key of ['End', 'Home', 'ArrowRight']) {
              await slider.press(key);
              const state = await slider.evaluate(e => ({ value: +e.value, min: +e.min, max: +e.max, fill: parseFloat(e.style.getPropertyValue('--p')), text: e.getAttribute('aria-valuetext'), expected: e.dataset.steps.split(',')[+e.value] + e.dataset.unit, output: document.querySelector('[data-out="' + e.id + '"]').textContent, track: getComputedStyle(e, '::-webkit-slider-runnable-track').backgroundImage }));
              ok(Math.abs(state.fill - (state.max > state.min ? (state.value - state.min) / (state.max - state.min) * 100 : 0)) < .001, `${id} ${key}: pink track follows`);
              ok(state.text === state.expected && state.output === state.expected, `${id} ${key}: label and accessible value follow`);
            }
            // Pointer movement uses the native control, as does touch on mobile.
            const r = await slider.boundingBox();
            await page.mouse.click(r.x + r.width * .75, r.y + r.height / 2);
            ok(await slider.evaluate(e => Math.abs(parseFloat(e.style.getPropertyValue('--p')) - e.value / e.max * 100) < .001), `${id}: pointer input repaints`);
          }
          for (const b of await page.locator('.vx-preset').all()) { await b.click(); ok(await b.getAttribute('aria-pressed') === 'true', 'VPS preset selects'); }
          for (const b of await page.locator('.vx-os button').all()) {
            await b.click();
            ok(await page.locator('[data-r=os]').textContent() === await b.getAttribute('data-os'), 'VPS OS recommendation follows');
          }
          const chip = page.locator('.vx-chips:not([hidden]) .vx-chip').last();
          await chip.click();
          const plan = await page.evaluate(() => { const plans = JSON.parse(document.querySelector('[data-plans]').textContent); return plans.find(p => p.slug === document.querySelector('.vx-chip.is-on').dataset.slug); });
          ok(await page.locator('[data-r=name]').textContent() === plan.name, 'VPS plan name follows chip');
          ok(await page.locator('[data-r=href]').getAttribute('href') === plan.href, 'VPS order URL follows plan without ordering');
          ok(await page.locator('[data-r=price]').textContent() === (plan.price || 'Price shown in the order form'), 'VPS synced price follows plan');
          await page.locator('#vx-cpu').press('Home'); await page.locator('#vx-ram').press('Home'); await page.locator('#vx-disk').press('End');
          const fit = await page.evaluate(() => {
            const p = JSON.parse(document.querySelector('[data-plans]').textContent).find(p => p.slug === document.querySelector('.vx-chip.is-on').dataset.slug);
            const e = document.querySelector('#vx-disk'); return { short: p.disk < +e.dataset.steps.split(',')[+e.value], warning: document.querySelector('[data-r=fit]').textContent };
          });
          ok(!fit.short || /storage/.test(fit.warning), 'VPS insufficient storage disclosed');
          const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          ok(!a11y.violations.some(v => ['serious', 'critical'].includes(v.impact)), 'VPS has no serious/critical accessibility violations');
          if (process.env.SHOTS) await page.locator('[data-vx-sizer]').screenshot({ path: path.join(process.env.SHOTS, `vps-${width}.png`) });
        }
        if (url === '/') {
          if (width === 1440) {
            const b = page.locator('.hp-nav__btn[data-menu]').first();
            await b.evaluate(e => e.click()); // Assistive technology generates detail=0 clicks.
            ok(await b.getAttribute('aria-expanded') === 'true', 'assistive click opens menu');
            await b.press('Escape'); ok(await b.getAttribute('aria-expanded') === 'false', 'Escape closes menu');
            await b.press('Enter'); ok(await b.getAttribute('aria-expanded') === 'true', 'keyboard opens menu');
            await page.keyboard.press('Escape');
          } else {
            await page.locator('.hp-burger').click();
            ok(await page.locator('.hp-drawer').getAttribute('aria-hidden') === 'false', 'mobile drawer opens');
            const b = page.locator('.hp-dacc__btn').first(); await b.click();
            ok(await b.getAttribute('aria-expanded') === 'true', 'mobile submenu opens');
            await page.keyboard.press('Escape');
            ok(await page.locator('.hp-burger').getAttribute('aria-expanded') === 'false', 'mobile Escape closes drawer');
          }
        }
        if (url === '/ai') {
          const range = page.locator('#ai-p');
          if (await range.count()) { await range.focus(); await range.press('End'); ok(await range.evaluate(e => e.style.getPropertyValue('--p') === '100%'), 'AI sizing guide slider'); }
        }
        if (url === '/domains-registration') {
          const form = page.locator('[data-domain-form]').first();
          await form.locator('input[name=query]').fill('https://www.Example.com/path');
          await form.evaluate(f => { f.addEventListener('submit', e => e.preventDefault(), { once: true }); f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
          ok(await form.locator('input[name=query]').inputValue() === 'example.com', 'domain search normalizes URLs');
          const filter = page.locator('.dom-chips button').nth(1);
          if (await filter.count()) { await filter.click(); ok(await filter.getAttribute('aria-pressed') === 'true', 'domain filter selected'); }
        }
        if (url === '/dedicated-servers') {
          const ram = page.locator('[data-f-ram]');
          if (await ram.count()) {
            await ram.selectOption({ index: 1 });
            ok(await page.locator('.dx-row:not([hidden])').evaluateAll((rows, min) => rows.every(r => +r.dataset.ram >= +min), await ram.inputValue()), 'dedicated RAM filter');
            await page.locator('[data-dx-reset]').click(); ok(await ram.inputValue() === '0', 'dedicated reset');
            await page.locator('[data-sort]').selectOption('price-d');
            ok(await page.locator('.dx-row:not([hidden])').evaluateAll(rows => { const ps = rows.map(r => r.dataset.price).filter(p => p !== '').map(Number); return ps.every((p, i) => !i || ps[i - 1] >= p); }), 'dedicated price sort');
          }
        }
        if (url === '/premium-domains') {
          const dropdown = page.locator('.pd-dd').first();
          if (await dropdown.count()) {
            const btn = dropdown.locator('.pd-dd__btn');
            await btn.click();
            const option = dropdown.locator('[role=option]').nth(1);
            const value = await option.getAttribute('data-v');
            await option.evaluate(e => e.click());
            ok(await dropdown.locator('select').inputValue() === value, 'premium dropdown accepts touch/assistive click');
            await btn.press('ArrowUp');
            ok(await btn.getAttribute('aria-expanded') === 'true', 'premium ArrowUp opens dropdown');
            await btn.press('Escape');
            await page.locator('[data-pd-reset]').evaluate(e => e.click());
          }
          const q = page.locator('[data-pd-form] input[name=q]');
          if (await q.count()) { await q.fill('no-match-example-987654321'); await page.waitForTimeout(250); ok(await page.locator('[data-pd-none]').isVisible(), 'premium empty state'); await page.locator('[data-pd-reset]').click(); ok(await q.inputValue() === '', 'premium reset'); }
        }
        if (url === '/plan-finder') {
          for (let i = 0; i < 4; i++) {
            const question = page.locator('.pf-q:not([hidden])');
            await question.locator('input[type=radio]').first().evaluate(e => { e.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
            await page.locator('[data-pf-next]').click();
          }
          ok(await page.locator('[data-pf-res]').isVisible(), 'plan finder completes questionnaire');
          ok(await page.locator('[data-pf-cards] a').count() > 0, 'plan finder recommends catalog plans');
          await page.locator('[data-pf-restart]').click();
          ok(await page.locator('[data-pf-form]').isVisible(), 'plan finder restarts');
        }
        if (url === '/free-migration') {
          const f = page.locator('[data-mg-form]');
          await f.evaluate(e => e.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
          ok(await f.locator('[aria-invalid=true]').count() > 0, 'migration validation displays inline errors');
          await f.locator('[name=name]').fill('UI audit');
          await f.locator('[name=email]').fill('audit@example.com');
          await f.locator('[name=site]').fill('example.com');
          await f.locator('[name=what]').first().check();
          await page.route('**/api/free-migration', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporarily unavailable' }) }));
          await f.evaluate(e => e.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
          await page.waitForFunction(() => !document.querySelector('[data-mg-btn]').disabled);
          ok(await page.locator('[data-mg-alert]').isVisible(), 'migration failed send shows error and allows retry');
          await page.unroute('**/api/free-migration');
          await f.evaluate(e => e.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
          await page.locator('[data-mg-done]').waitFor({ state: 'visible' });
          ok(await f.isHidden(), 'migration mocked success shows confirmation');
        }
        console.log(`PASS ${width} ${url}`);
      }
      await ctx.close();
    }
    console.log(`PASS ${checks} public interaction checks (all writes intercepted)`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
