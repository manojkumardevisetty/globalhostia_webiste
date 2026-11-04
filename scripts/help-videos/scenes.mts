import fs from 'node:fs';
import path from 'node:path';
import { Rec } from './lib/rec.mts';
import { backend, routes } from './lib/panel.mts';
import { invoicePage } from './lib/invoice.mts';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const { HELP_TOPICS } = await import(REPO + '/lib/help/topics.ts');
const FX = process.env.HELP_FX || path.join(REPO, 'tests/fixtures/whmcs-skin');
const T = (slug: string) => { const t = HELP_TOPICS.find((x: any) => x.slug === slug); if (!t) throw new Error(slug); return t; };
const cap = (r: Rec, slug: string, i: number, hold?: number) => r.cap(T(slug).steps[i].en, T(slug).steps[i].ar, hold);
const vis = (sel: string) => `${sel} >> visible=true`;

export type Scene = { slug: string; kind: 'portal' | 'panel'; setup?: (ctx: any) => Promise<void>; run: (r: Rec, p: any, base: string) => Promise<void>; shots?: string[] };

/** portal: fonts off, the WHMCS SSO redirect (pay / renew) lands on the client-area invoice page */
const portalSetup = async (ctx: any) => {
  await ctx.route('https://fonts.googleapis.com/**', (r: any) => r.abort());
  await ctx.route('https://fonts.gstatic.com/**', (r: any) => r.abort());
  const inv = (r: any) => r.fulfill({ contentType: 'text/html', body: invoicePage() });
  await ctx.route('https://globalhostia.com/secure/**', inv);
  await ctx.route('https://my.globalhostia.com/**', (r: any) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/img/')) return r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(REPO, 'public/image', u.pathname.slice(5))) });
    if (u.pathname.startsWith('/fx/')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(FX, u.pathname.slice(4))) });
    return inv(r);
  });
  // redirects are not routed by Playwright: answer the portal's SSO hop with the client-area page directly
  await ctx.route(/\/account\/sso/, async (r: any) => {
    const res = await r.fetch({ maxRedirects: 0 });
    const loc = res.headers()['location'] || '';
    if (res.status() >= 300 && res.status() < 400 && /^https:\/\/(globalhostia\.com\/secure|my\.globalhostia\.com)/.test(loc)) return inv(r);
    return r.fulfill({ response: res });
  });
  // nothing in the recordings should reach a real third party
  await ctx.route(/^https:\/\/(?!globalhostia\.com|my\.globalhostia\.com)[^/]+\//, (r: any) => r.abort());
};
const go = async (p: any, url: string) => { await p.goto(url, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(700); };

export const SCENES: Scene[] = [
  { slug: 'pay-an-invoice', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account'); r.begin(); await r.pause(800);
    await cap(r, 'pay-an-invoice', 0, 900);
    await r.click(vis('a[href="/account/invoices"]')); await p.waitForLoadState('load'); await r.pause(900);
    await cap(r, 'pay-an-invoice', 1, 800);
    await r.click(vis('a[href*="status=Unpaid"]')); await p.waitForLoadState('load'); await r.pause(900);
    await cap(r, 'pay-an-invoice', 2, 900);
    await r.moveTo(vis('main td form button:has-text("Pay")'), { ms: 700 });
    await Promise.all([p.waitForSelector('.btn-pay', { timeout: 30000 }), r.click(vis('main td form button:has-text("Pay")'), { after: 0 })]);
    await p.waitForLoadState('load'); await r.pause(600);
    await cap(r, 'pay-an-invoice', 3, 900);
    await r.click('#pm', { after: 300 }); await p.selectOption('#pm', 'PayPal'); await r.pause(700); await p.selectOption('#pm', 'Credit or debit card');
    await r.moveTo('.btn-pay', { ms: 1800 });
  } },
  { slug: 'renew-services', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account'); r.begin(); await r.pause(800);
    await cap(r, 'renew-services', 0, 900);
    await r.click(vis('a[href="/account/renewals"]')); await p.waitForLoadState('load'); await r.pause(1000);
    await cap(r, 'renew-services', 1, 600);
    for (const s of await p.locator('main a[href*="#"], main .ac-stat, main [data-k]').all().then((a: any[]) => a.slice(0, 3))) { await r.moveTo(s, { ms: 700 }).catch(() => {}); }
    const boxes = p.locator('label.ac-rwr__cb:visible');
    const n = await boxes.count();
    // the overdue items come pre-ticked: untick two first, so the video shows ticking them
    for (let i = 0; i < Math.min(n, 2); i++) { const c = boxes.nth(i); if (await c.locator('input').isChecked()) await r.click(c, { after: 350 }); }
    await cap(r, 'renew-services', 2, 700);
    for (let i = 0; i < Math.min(n, 2); i++) { const c = boxes.nth(i); if (!(await c.locator('input').isChecked())) await r.click(c, { after: 800 }); }
    await r.pause(700);
    await cap(r, 'renew-services', 3, 800);
    const btn = vis('button[data-rw-dom]');
    await r.moveTo(btn, { ms: 900 });
    await Promise.all([p.waitForSelector('.btn-pay', { timeout: 30000 }).catch(() => {}), r.click(btn, { after: 0 })]);
    await p.waitForLoadState('load'); await r.pause(2200);
  } },
  { slug: 'add-a-dns-record', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account/domains'); r.begin(); await r.pause(800);
    await cap(r, 'add-a-dns-record', 0, 900);
    await r.click(vis('main a[href="/account/domains/301"]')); await p.waitForLoadState('load');
    await p.locator('#dns-add').waitFor({ timeout: 30000 }); await r.pause(800);
    await cap(r, 'add-a-dns-record', 1, 500);
    await r.click('#dns-add > summary', { after: 900 });
    await cap(r, 'add-a-dns-record', 2, 600);
    await r.select('#add-type', 'TXT');
    await r.type('#add-name', '_verify');
    await r.type('#add-value', 'site-verification=demo-0000-example', { delay: 45 });
    await cap(r, 'add-a-dns-record', 3, 500);
    await r.click('#dns-add button[type=submit]', { after: 0 });
    await p.waitForFunction(() => /site-verification=demo-0000-example/.test(document.getElementById('dns')?.textContent || ''), null, { timeout: 30000 });
    await r.pause(600);
    const row = p.locator('#dns tr:has-text("site-verification=demo-0000-example")').first();
    await row.scrollIntoViewIfNeeded(); await r.hl(row); await r.moveTo(row, { ms: 2200 }); await r.unhl();
  } },
  { slug: 'change-nameservers', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account/domains'); r.begin(); await r.pause(800);
    await cap(r, 'change-nameservers', 0, 900);
    await r.click(vis('main a[href="/account/domains/304"]')); await p.waitForLoadState('load'); await r.pause(900);
    await cap(r, 'change-nameservers', 1, 500);
    const ns = p.locator('main input[name^="ns"] >> visible=true');
    await r.type(ns.nth(0), 'ns1.globalhostia.com', { clear: true, delay: 55 });
    await r.type(ns.nth(1), 'ns2.globalhostia.com', { clear: true, delay: 55 });
    await cap(r, 'change-nameservers', 2, 500);
    await r.click(vis('main button:has-text("Save nameservers")'), { after: 0 }); await p.waitForLoadState('load'); await r.pause(1300);
    await cap(r, 'change-nameservers', 3, 2600);
  } },
  { slug: 'open-a-support-ticket', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account/support'); r.begin(); await r.pause(800);
    await cap(r, 'open-a-support-ticket', 0, 800);
    await r.click(vis('main a[href="/account/support/new"]')); await p.waitForLoadState('load'); await r.pause(900);
    await cap(r, 'open-a-support-ticket', 1, 500);
    const dept = await p.locator('#ac-dept option').evaluateAll((o: any[]) => o.map((x) => [x.value, x.textContent]));
    const tech = (dept.find((x: any) => /tech/i.test(x[1])) || dept[1] || dept[0])[0];
    await r.select('#ac-dept', tech);
    const svc = await p.locator('#ac-svc option').evaluateAll((o: any[]) => o.map((x) => [x.value, x.textContent]));
    const ultra = svc.find((x: any) => /Ultra/.test(x[1])); if (ultra) await r.select('#ac-svc', ultra[0]);
    await cap(r, 'open-a-support-ticket', 2, 500);
    await r.type('#ac-sub', 'Contact form emails are not arriving', { delay: 30 });
    await r.type('#ac-msg', 'Hi team, since this morning the contact form on example.com does not send emails. Could you check the mail logs? Thanks.', { delay: 9 });
    await r.click(vis('main button[type=submit]:has-text("Open ticket")'), { after: 0 }); await p.waitForLoadState('load'); await r.pause(1500);
    await cap(r, 'open-a-support-ticket', 3, 500);
    if (await p.locator('#ac-reply').count()) { await r.type('#ac-reply', 'One more detail: it started after I changed the form plugin.', { delay: 15 }); await r.moveTo(vis('main form:has(#ac-reply) button[type=submit]'), { ms: 1600 }); }
    else await r.pause(2000);
  } },
  { slug: 'give-team-access', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account'); r.begin(); await r.pause(700);
    await cap(r, 'give-team-access', 0, 800);
    await r.click(vis('aside a[href="/account/team"], nav a[href="/account/team"]')); await p.waitForLoadState('load'); await r.pause(900);
    await cap(r, 'give-team-access', 1, 500);
    await r.type('#ac-tm-email', 'designer@example.com', { delay: 55 });
    await cap(r, 'give-team-access', 2, 500);
    await r.click(vis('label.ac-tm__pre:has(input[value="developer"])'), { after: 900 });
    await r.moveTo(vis('label.ac-tm__pre:has(input[value="billing"])'), { ms: 700 });
    await r.click(vis('label.ac-tm__pre:has(input[value="developer"])'), { after: 600 });
    await cap(r, 'give-team-access', 3, 500);
    await r.click(vis('main button[type=submit]:has-text("Send invitation")'), { after: 0 }); await p.waitForLoadState('load'); await r.pause(800);
    const al = p.locator('.ac-alert, [role=status]').first(); if (await al.count()) { await al.scrollIntoViewIfNeeded().catch(() => {}); await r.hl(al).catch(() => {}); }
    await r.pause(2200); await r.unhl().catch(() => {});
  } },
  { slug: 'switch-language', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account'); r.begin(); await r.pause(800);
    await cap(r, 'switch-language', 0, 600);
    await r.click(vis('.ac-dd--me summary'), { after: 900 });
    await cap(r, 'switch-language', 1, 500);
    await r.click(vis('.ac-dd--me form[action="/account/lang"] button'), { after: 0 }); await p.waitForLoadState('load'); await r.pause(1600);
    await cap(r, 'switch-language', 2, 400);
    for (const h of ['/account/domains', '/account/invoices']) { await r.moveTo(vis(`aside a[href="${h}"], nav a[href="${h}"]`), { ms: 700 }).catch(() => {}); }
    await cap(r, 'switch-language', 3, 500);
    await r.click(vis('.ac-dd--me summary'), { after: 900 });
    await r.click(vis('.ac-dd--me form[action="/account/lang"] button'), { after: 0 }); await p.waitForLoadState('load'); await r.pause(2000);
  } },
  { slug: 'sell-a-domain', kind: 'portal', setup: portalSetup, async run(r, p, B) {
    await go(p, B + '/account/sell'); r.begin(); await r.pause(800);
    await cap(r, 'sell-a-domain', 0, 700);
    await r.click(vis('main a[href="/account/sell/new"]')); await p.waitForLoadState('load'); await r.pause(900);
    await cap(r, 'sell-a-domain', 1, 500);
    await r.click(vis('main label:has-text("labs.example")'), { after: 700 });
    await cap(r, 'sell-a-domain', 2, 500);
    await r.type('#ac-s-price', '2500', { clear: true });
    await r.type('#ac-s-min', '1500');
    await r.type('#ac-s-desc', 'Short, memorable name for a research lab or AI studio.', { delay: 30 });
    await cap(r, 'sell-a-domain', 3, 500);
    await r.click(vis('main input[name="terms"]'), { after: 700 });
    await r.moveTo(vis('main button:has-text("Continue to payment")'), { ms: 900 });
    const sum = p.locator('main :text("Total today")').first(); if (await sum.count()) await r.moveTo(sum, { ms: 1600 });
  } },
];

/* ------------------------------------------------------------------ Manage hosting panel (WHMCS client area) */
const panelSetup = (tweak?: (be: any) => void) => async (ctx: any) => {
  const be = backend(); if (tweak) tweak(be); await routes(ctx, be);
  await ctx.addInitScript(() => { const add = () => { const st = document.createElement('style'); st.textContent = '.gh-wa,.ext-chat{display:none!important}'; (document.head || document.documentElement).appendChild(st); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); });
};
const openPanel = async (r: Rec, p: any, tab?: string) => {
  if (tab) await p.addInitScript((t: string) => { try { sessionStorage.setItem('gh-hosting-tab-102', t); } catch (e) { /* */ } }, 'overview');
  await p.goto('https://my.globalhostia.com/clientarea.php?action=productdetails&id=102');
  await p.locator('.ghh [data-tab]').first().waitFor({ timeout: 30000 });
  await p.evaluate(() => { const g = document.querySelector('.ghh') as HTMLElement; window.scrollTo(0, g.getBoundingClientRect().top + window.scrollY - 8); });
  await p.waitForTimeout(1200);
  r.begin(); await r.pause(600);
};
const tab = async (r: Rec, p: any, t: string) => { await r.click(`.ghh [data-tab="${t}"]`, { after: 1100 }); };
const field = (p: any, name: string) => p.locator(`.ghh [data-slot] [name="${name}"]`).first();

SCENES.push(
  { slug: 'set-up-email', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await cap(r, 'set-up-email', 0, 500);
    await tab(r, p, 'email');
    await r.click('.ghh-bar [data-add]', { after: 800 });
    await cap(r, 'set-up-email', 1, 500);
    await r.type(field(p, 'user'), 'hello');
    await r.type(field(p, 'password'), 'Demo-Only-Pass-0000', { delay: 40 });
    await r.click('.ghh [data-slot] form [type=submit]', { after: 0 });
    await p.locator('.ghh [data-list]:has-text("hello@example.com")').waitFor({ timeout: 15000 }); await r.pause(1200);
    await cap(r, 'set-up-email', 2, 500);
    await r.click('.ghh tr:has-text("hello@example.com") [data-setup]', { after: 1400 });
    await cap(r, 'set-up-email', 3, 700);
    for (const d of ['android', 'outlook', 'apple']) await r.click(`.ghh [data-dev="${d}"]`, { after: 1700 });
    await r.moveTo('.ghh [data-prof]', { ms: 1400 });
  } },
  { slug: 'connect-a-domain', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await p.locator('.ghh [data-connect]').waitFor({ timeout: 15000 });
    await cap(r, 'connect-a-domain', 0, 600);
    await r.hl('.ghh .ghh-unc'); await r.pause(1600); await r.unhl();
    await cap(r, 'connect-a-domain', 1, 400);
    await r.click('.ghh [data-connect="shop.example"]', { after: 1800 });
    await cap(r, 'connect-a-domain', 2, 600);
    const rec = p.locator('.ghh [data-recs]').first();
    if (await rec.count()) { await r.moveTo(rec, { ms: 1600 }); }
    await r.scroll(260);
    await cap(r, 'connect-a-domain', 3, 500);
    await r.click('.ghh [data-now]', { after: 1800 });
    await r.click('.ghh [data-now]', { after: 2000 }).catch(() => {});
    await r.pause(1500);
  } },
  { slug: 'issue-ssl-certificate', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await cap(r, 'issue-ssl-certificate', 0, 500);
    await tab(r, p, 'ssl');
    await cap(r, 'issue-ssl-certificate', 1, 500);
    const row = p.locator('.ghh [data-go]').nth(1);
    await r.moveTo(row.locator('[data-www]'), { ms: 1200 });
    await cap(r, 'issue-ssl-certificate', 2, 400);
    await r.click(row.locator('[data-issue]'), { after: 0 });
    await p.locator('.ghh-toast').first().waitFor({ timeout: 15000 }); await r.pause(1800);
    await cap(r, 'issue-ssl-certificate', 3, 300);
    await r.click('.ghh-bar [data-re]', { after: 0 });
    await p.waitForFunction(() => !/Not secure/.test(document.querySelector('.ghh [data-body]')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
    await r.moveTo(p.locator('.ghh [data-go]').nth(1), { ms: 2200 });
  } },
  { slug: 'upload-files', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await cap(r, 'upload-files', 0, 500);
    await tab(r, p, 'files');
    await cap(r, 'upload-files', 1, 500);
    await r.moveTo('.ghh :text("public_html")', { ms: 900 }).catch(() => {});
    await cap(r, 'upload-files', 2, 500);
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), r.click('.ghh .ghh-upload', { after: 300 })]);
    await fc.setFiles({ name: 'summer-offer.html', mimeType: 'text/html', buffer: Buffer.from('<!doctype html><title>Summer offer</title><h1>Summer offer</h1>') });
    await p.locator('.ghh [data-body]:has-text("summer-offer.html")').waitFor({ timeout: 15000 }); await r.pause(700);
    await cap(r, 'upload-files', 3, 400);
    const row = p.locator('.ghh tr:has-text("summer-offer.html")').first(); await r.hl(row); await r.moveTo(row, { ms: 2000 }); await r.unhl();
  } },
  { slug: 'create-a-database', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await cap(r, 'create-a-database', 0, 500);
    await tab(r, p, 'databases');
    await r.click('.ghh-bar [data-add]', { after: 800 });
    await cap(r, 'create-a-database', 1, 500);
    await r.type(field(p, 'name'), 'shop'); await r.type(field(p, 'user'), 'shop');
    await cap(r, 'create-a-database', 2, 500);
    await r.click('.ghh [data-slot] button:has-text("Generate")', { after: 900 });
    await r.click('.ghh [data-slot] form [type=submit]', { after: 0 });
    await p.locator('.ghh [data-list]:has-text("examplec_shop")').waitFor({ timeout: 15000 }); await r.pause(900);
    await cap(r, 'create-a-database', 3, 400);
    const row = p.locator('.ghh [data-list] tr:has-text("examplec_shop"), .ghh [data-list] :text("examplec_shop")').first(); await r.hl(row).catch(() => {}); await r.moveTo(row, { ms: 2200 }); await r.unhl();
  } },
  { slug: 'change-php-version', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await cap(r, 'change-php-version', 0, 500);
    await tab(r, p, 'php');
    await cap(r, 'change-php-version', 1, 500);
    await r.moveTo('.ghh label:has-text("PHP 8.1")', { ms: 1400 });
    await r.click('.ghh label:has-text("PHP 8.3")', { after: 1200 });
    await cap(r, 'change-php-version', 2, 400);
    await r.click('.ghh button:has-text("Switch version")', { after: 2200 });
    await cap(r, 'change-php-version', 3, 1200);
    const chip = p.locator('.ghh button:has-text("shop.example"), .ghh a:has-text("shop.example")').first();
    if (await chip.count()) { await r.click(chip, { after: 1800 }); await r.click(p.locator('.ghh button:has-text("example.com"), .ghh a:has-text("example.com")').first(), { after: 1800 }); }
    await r.pause(2500);
  } },
  { slug: 'restore-a-backup', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await cap(r, 'restore-a-backup', 0, 500);
    await tab(r, p, 'backups');
    await cap(r, 'restore-a-backup', 1, 400);
    const row = p.locator('.ghh tr:has-text("Oct-25")').first(); await r.hl(row); await r.moveTo(row, { ms: 1400 }); await r.unhl();
    await cap(r, 'restore-a-backup', 2, 400);
    await r.click(row.locator('[data-rs]'), { after: 1200 });
    await r.click('.ghh [data-yes]', { after: 2200 });
    await cap(r, 'restore-a-backup', 3, 500);
    await r.moveTo('.ghh-bar [data-new]', { ms: 2000 });
  } },
  { slug: 'install-wordpress', kind: 'panel', setup: panelSetup(), async run(r, p) {
    await openPanel(r, p);
    await cap(r, 'install-wordpress', 0, 500);
    await tab(r, p, 'wordpress');
    await r.click('.ghh-bar [data-add]', { after: 900 });
    await cap(r, 'install-wordpress', 1, 400);
    const form = p.locator('.ghh [data-slot] form');
    await r.select(form.locator('[name=domain]'), 'shop.example');
    await r.type(form.locator('[name=title]'), 'Example Shop');
    await r.type(form.locator('[name=adminUser]'), 'owner');
    await r.moveTo(form.locator('[name=adminEmail]'), { ms: 700 });
    await r.click(form.locator('[type=submit]'), { after: 0 });
    await p.locator('.ghh [data-slot]:has-text("is installed")').waitFor({ timeout: 25000 }); await r.pause(1800);
    await r.click('.ghh [data-slot] [data-close]', { after: 900 }).catch(() => {});
    await cap(r, 'install-wordpress', 2, 400);
    const site = p.locator('.ghh-wp:has-text("shop.example")').first();
    await r.moveTo(site.locator('[data-wp=login]'), { ms: 1300 });
    await cap(r, 'install-wordpress', 3, 400);
    await r.click(site.locator('[data-wpmenu]'), { after: 900 });
    await r.click(site.locator('[data-wp=staging]'), { after: 1100 });
    await r.click('.ghh [data-slot] form [type=submit]', { after: 0 });
    await p.locator('.ghh-wp--child').first().waitFor({ timeout: 30000 }).catch(() => {});
    await r.pause(2000);
  } },
);
