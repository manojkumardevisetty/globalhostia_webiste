// Content engine UI walk-through + screenshots (needs: app on :3000 started with AI_MOCK=1, seeded local DB with patch 031).
// Approves the seed idea "SPF, DKIM and DMARC", drafts it (mock model), adds the Arabic version, publishes both and checks
// the article pages (hreflang, FAQPage, BreadcrumbList, Organization author, RTL). LOCAL DATABASE ONLY.
// Run: NODE_PATH=$(npm root -g) SHOTS=/tmp/shots node tests/content-ui.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@globalhostia.com';
const PASS = process.env.ADMIN_PASSWORD || 'localtest123';
const SHOTS = process.env.SHOTS || '/tmp';
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('dialog', (d) => d.accept());
  const flash = async () => { await p.waitForURL(/[?&](ok|err)=/, { timeout: 180000 }); return decodeURIComponent((p.url().match(/[?&](?:ok|err)=([^&]*)/) || [, ''])[1].replace(/\+/g, ' ')); };
  const shot = async (name, url, full = true) => {
    if (url) await p.goto(BASE + url, { waitUntil: 'networkidle' });
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${SHOTS}/${name}-1440.png`, fullPage: full });
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
    await p.screenshot({ path: `${SHOTS}/${name}-390.png`, fullPage: full });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, `${name}: no horizontal scroll at 390px (${overflow}px)`);
    await p.setViewportSize({ width: 1440, height: 900 });
  };

  await p.goto(`${BASE}/admin/login`);
  await p.fill('input[name=email]', EMAIL); await p.fill('input[name=password]', PASS);
  await p.click('button:has-text("Sign in")'); await p.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 120000 });

  // backlog
  await p.goto(`${BASE}/admin/seo/content?tab=ideas`);
  const ideasHtml = await p.content();
  ok((ideasHtml.match(/>seed</g) || []).length >= 20, 'starter backlog listed with "seed" labels');
  ok(ideasHtml.includes('intent (estimated)'), 'intent labelled as an estimate (no search volumes)');
  await shot('content-ideas');

  // approve the SPF idea (with Arabic) → draft → Arabic → checks
  await p.goto(`${BASE}/admin/seo/content?tab=ideas&track=global&state=all`);
  await p.click('a:has-text("SPF, DKIM and DMARC explained")');
  await p.waitForURL(/\/admin\/seo\/content\/[a-z0-9]+$/);
  const ideaUrl = p.url();
  if (await p.locator('button:has-text("Approve into calendar")').count()) {
    await p.check('input[type=checkbox][name=arabic]');
    await p.click('button:has-text("Approve into calendar")');
    ok(/Approved for/.test(await flash()), 'idea approved into the next calendar slot');
  }
  await p.goto(ideaUrl);
  if (await p.locator('button:has-text("Generate draft now")').count()) {
    await p.click('button:has-text("Generate draft now")');
    const f = await flash(); ok(/Draft ready/.test(f), `draft generated → ${f.slice(0, 90)}`);
  }
  await p.goto(ideaUrl);
  if (await p.locator('button:has-text("Generate the Arabic draft")').count()) {
    await p.click('button:has-text("Generate the Arabic draft")');
    ok(/Arabic draft ready/.test(await flash()), 'Arabic draft generated');
  }
  await p.goto(ideaUrl);
  const ideaHtml = await p.content();
  ok(ideaHtml.includes('Every internal link points to a live page'), 'quality checklist shown');
  ok(ideaHtml.includes('Arabic: '), 'Arabic checks shown');
  await shot('content-review');

  // section rewrite (mock) and publish
  await p.goto(ideaUrl);
  if (await p.locator('button:has-text("Rewrite")').first().count()) {
    await p.locator('form:has(input[name=lang][value=en]) button:has-text("Rewrite")').click();
    ok(/rewritten/.test(await flash()), 'section rewrite');
  }
  await p.goto(ideaUrl);
  if (await p.locator('button:has-text("Publish now")').count()) {
    await p.locator('button:has-text("Publish now")').first().click();
    ok(/Published/.test(await flash()), 'published (owner action)');
  }

  // public article EN + AR
  await p.goto(`${BASE}/blog/spf-dkim-dmarc-explained`, { waitUntil: 'networkidle' });
  const en = await p.content();
  ok(en.includes('hreflang="ar"') && en.includes('hreflang="x-default"'), 'EN: hreflang pair');
  ok(en.includes('"FAQPage"') && en.includes('"BreadcrumbList"'), 'EN: FAQPage + BreadcrumbList JSON-LD');
  ok(/"author":\{"@type":"Organization","name":"GlobalHostia Team"/.test(en), 'EN: Organization author GlobalHostia Team');
  ok(en.includes('"dateModified"') && en.includes('logo-main-black.png'), 'EN: dateModified + publisher logo');
  ok(en.includes('bl-authorbox') && en.includes('Last updated'), 'EN: author box with last-updated date');
  await p.goto(`${BASE}/blog/spf-dkim-dmarc-explained`, { waitUntil: 'networkidle' });
  await shot('article-en');
  await p.goto(`${BASE}/blog/spf-dkim-dmarc-explained-ar`, { waitUntil: 'networkidle' });
  const ar = await p.content();
  ok(ar.includes('lang="ar" dir="rtl"'), 'AR: article is right to left');
  ok(ar.includes('"inLanguage":"ar"') && ar.includes('الأسئلة الشائعة') && ar.includes('"FAQPage"'), 'AR: inLanguage + Arabic FAQ → FAQPage');
  await shot('article-ar');

  // collections, calendar, pipeline, settings
  await shot('blog-global-guides', '/blog/global-guides');
  await shot('content-calendar', '/admin/seo/content');
  await shot('content-pipeline', '/admin/seo/content?tab=pipeline');
  await shot('content-settings', '/admin/seo/content?tab=settings');
  const sm = await (await p.request.get(`${BASE}/sitemap.xml`)).text();
  ok(sm.includes('/blog/spf-dkim-dmarc-explained</loc>') && sm.includes('/blog/global-guides</loc>'), 'sitemap lists the article and the collection');

  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
