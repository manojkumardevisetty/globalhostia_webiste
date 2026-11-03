// Render check of the AI surfaces (needs: `AI_MOCK=1 next dev` on BASE, tests/mock-whmcs.mjs on :4555).
// AI_MOCK=1 swaps the Anthropic client for lib/ai/mock.ts, so answers stream through the real SSE route and tools.
// Run: BASE=http://localhost:3101 NODE_PATH=$(npm root -g) node tests/ai-ui.cjs
const { chromium } = require('playwright');
const { SignJWT } = require('jose');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '/tmp';
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

(async () => {
  const b = await chromium.launch();
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    // a fresh client IP per run: the off-topic strikes from earlier runs would otherwise put this visitor on cooldown
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: tag === 'mobile' ? 2 : 1, extraHTTPHeaders: { 'x-real-ip': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    if (process.env.DEBUG) { p.on('console', (m) => console.log('console', m.text())); p.on('response', (r) => { if (r.url().includes('/api/ai')) console.log('RES', r.status(), r.url()); }); }
    await p.goto(`${BASE}/?theme=hostpen`, { waitUntil: 'load' });
    const launch = p.locator('.ghai-launch');
    await launch.waitFor({ timeout: 15000 });
    ok(await launch.isVisible(), `${tag}: chat button appears after idle`);
    await p.screenshot({ path: `${SHOTS}/ai-chat-${tag}-closed.png` });
    await launch.click();
    const panel = p.locator('.ghai-panel');
    ok(await panel.isVisible(), `${tag}: panel opens`);
    ok((await p.locator('.ghai-chip').count()) === 3, `${tag}: three suggested prompts`);
    await p.waitForTimeout(400);
    const box = await panel.boundingBox();
    if (tag === 'mobile') ok(box && box.width >= 389 && box.height >= 840, `${tag}: full-screen panel (${box && box.width}x${box && box.height})`);
    await p.screenshot({ path: `${SHOTS}/ai-chat-${tag}-open.png` });
    await p.fill('.ghai-input', 'I need hosting for a WordPress blog with 2 sites');
    await p.waitForTimeout(900);
    await p.keyboard.press('Enter');
    await p.locator('.ghai-card--best').waitFor({ timeout: 30000 });
    await p.waitForFunction(() => /Add one to your cart/.test(document.querySelector('.ghai-log')?.textContent || ''), null, { timeout: 30000 });
    ok((await p.locator('.ghai-card').count()) >= 2, `${tag}: best pick + alternative cards`);
    ok(/Renews at/.test(await p.locator('.ghai-card--best').innerText()), `${tag}: renewal price shown`);
    await p.locator('.ghai-card--best .ghai-btn', { hasText: 'Add to cart' }).click();
    ok(await p.locator('.ghai-cart').isVisible(), `${tag}: chat cart shows`);
    const href = await p.locator('.ghai-cart a', { hasText: 'Checkout' }).getAttribute('href');
    ok(/^\/ai\/checkout\?c=p%3A/.test(href || ''), `${tag}: checkout link ${href}`);
    await p.screenshot({ path: `${SHOTS}/ai-chat-${tag}-plans.png` });
    await p.fill('.ghai-input', 'what is the gold price today');
    await p.waitForTimeout(300);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => /I can help with GlobalHostia hosting, domains, email and your account\./.test(document.querySelector('.ghai-log')?.textContent || ''), null, { timeout: 15000 });
    ok(true, `${tag}: off-topic gets the canned line`);
    await p.locator('.ghai-log').evaluate((e) => { e.scrollTop = e.scrollHeight; });
    await p.screenshot({ path: `${SHOTS}/ai-chat-${tag}-offtopic.png` });
    await p.keyboard.press('Escape');
    ok(await launch.isVisible(), `${tag}: Escape closes`);
    if (tag === 'desktop') {
      const cp = await ctx.newPage();
      await cp.goto(`${BASE}${href}`);
      ok(/Continue to secure checkout/.test(await cp.content()), 'checkout handoff page renders with live re-pricing');
      await cp.screenshot({ path: `${SHOTS}/ai-checkout.png` });
    }
    ok(!errors.length, `${tag}: no page errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  // admin assistant page (signed admin cookie, same JWT as lib/auth.ts)
  const token = await new SignJWT({ uid: 'test', email: 'admin@globalhostia.com', name: 'Owner', role: 'OWNER' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addCookies([{ name: 'gh_admin', value: token, url: BASE }]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin/assistant`);
  ok(/Read-only\./.test(await p.content()), 'admin assistant shows the read-only banner');
  await p.locator('button', { hasText: 'How much did we earn this month?' }).click();
  await p.waitForFunction(() => /Read-only demo answer/.test(document.body.innerText), null, { timeout: 30000 });
  ok(true, 'admin assistant streams an answer');
  await p.screenshot({ path: `${SHOTS}/ai-admin-assistant.png`, fullPage: true });
  await p.goto(`${BASE}/admin/assistant/settings`);
  ok(/Scope filter/.test(await p.content()), 'AI settings page renders');
  await p.screenshot({ path: `${SHOTS}/ai-admin-settings.png`, fullPage: true });
  await p.goto(`${BASE}/admin/assistant/usage`);
  ok(/Estimated credits saved/.test(await p.content()), 'usage dashboard renders');
  await p.screenshot({ path: `${SHOTS}/ai-admin-usage.png`, fullPage: true });
  await b.close();
  console.log(failures ? `${failures} failure(s)` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
