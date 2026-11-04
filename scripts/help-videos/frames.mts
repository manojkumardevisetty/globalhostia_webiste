// Illustrated walkthrough frames: screenshots of our own pages (local app + client-area cart skin) with a highlight box.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium, Rec, OVERLAY } from './lib/rec.mts';
const BASE = process.env.HELP_BASE || 'http://localhost:3411';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const FX = process.env.HELP_FX || path.join(REPO, 'tests/fixtures/whmcs-skin');
const OUT = path.resolve('raw/frames'); fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? process.argv[2].split(',') : null;
const item = (title: string, group: string, dom: string, small: string, price: string, cycle: string) => `<div class="item"><div class="row"><div class="col-sm-7"><span class="item-title">${title} ${group ? `<span class="item-group">${group}</span>` : ''}</span><span class="item-domain">${dom}</span><small>${small}</small></div><div class="col-sm-4 item-price"><span>${price} USD</span><span class="cycle">${cycle}</span></div><div class="col-sm-1"><button type="button" class="btn btn-link btn-xs btn-remove-from-cart">×</button></div></div></div>`;
const CARTS: Record<string, { items: string; sub: string; vat: string; tot: string }> = {
  domain: { items: item('Domain Registration', '', 'example-studio.com', '1 Year/s · renews at $13.99 a year', '$13.65', '1 Year/s'), sub: '$13.65', vat: '$0.68', tot: '$14.33' },
  hosting: { items: item('Hostia Ultra', 'Shared Hosting', 'example-studio.com', 'Disk space: 10 GB NVMe', '$59.99', 'Annually') + item('Domain Registration', '', 'example-studio.com', '1 Year/s', '$13.65', '1 Year/s'), sub: '$73.64', vat: '$3.68', tot: '$77.32' },
  transfer: { items: item('Domain Transfer', '', 'example-studio.com', 'EPP code: ●●●●●●●● · includes 1 year renewal', '$13.65', '1 Year/s'), sub: '$13.65', vat: '$0.68', tot: '$14.33' },
};
const cart = (k: string) => {
  const c = CARTS[k];
  return fs.readFileSync(path.join(FX, 'cart.php'), 'utf8').replace('http://localhost:3477/hp/whmcs.css', 'https://globalhostia.com/hp/whmcs.css').replace(/<script src="http:\/\/localhost:3477\/hp\/whmcs\.js[^"]*"><\/script>/, '<script src="https://globalhostia.com/hp/whmcs.js?v=rec"></script>')
    .replace('http://localhost:3477/hp/img/logo.svg', 'https://my.globalhostia.com/img/logo-main-black.png').replaceAll('href="/bootstrap.min.css"', 'href="https://my.globalhostia.com/fx/bootstrap.min.css"').replaceAll('href="/theme-emul.css"', 'href="https://my.globalhostia.com/fx/theme-emul.css"')
    .replace('__ITEMS__', c.items).replaceAll('__SUB__', c.sub).replaceAll('__VAT__', c.vat).replaceAll('__TOT__', c.tot).replace('__DIS__', '').replace('__INJECT__', '');
};
const b = await chromium.launch();
const login = async (ctx: any) => { const p = await ctx.newPage(); await p.goto(`${BASE}/account/login`); await p.fill('#au-email', 'demo@example.com'); await p.fill('#au-pass', 'demo-pass'); await p.click('form button[type=submit]'); await p.waitForURL((u: URL) => u.pathname === '/account', { timeout: 90000 }); await p.close(); };
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.route('https://fonts.googleapis.com/**', (r: any) => r.abort()); await ctx.route('https://fonts.gstatic.com/**', (r: any) => r.abort());
await ctx.route('https://globalhostia.com/hp/**', (r: any) => { const f = path.join(REPO, 'public/hp', new URL(r.request().url()).pathname.slice(4)); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, contentType: /\.css$/.test(f) ? 'text/css' : /\.js$/.test(f) ? 'application/javascript' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream', body: fs.readFileSync(f) }); });
await ctx.route('https://my.globalhostia.com/**', (r: any) => { const u = new URL(r.request().url());
  if (u.pathname.startsWith('/img/')) return r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(REPO, 'public/image', u.pathname.slice(5))) });
  if (u.pathname.startsWith('/fx/')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(FX, u.pathname.slice(4))) });
  return r.fulfill({ contentType: 'text/html', body: cart(u.searchParams.get('k') || 'domain') }); });
await ctx.route(/^https:\/\/(?!globalhostia\.com|my\.globalhostia\.com)[^/]+\//, (r: any) => r.abort());
await ctx.addInitScript(() => { const add = () => { const st = document.createElement('style'); st.textContent = '.hp-preview-pill,#ghrec-cur,#ghrec-cap,.gh-wa,.ext-chat,.ghai-fab,[class*="ghai-launch"]{display:none!important} *{animation-duration:0s!important;transition-duration:0s!important}'; (document.head || document.documentElement).appendChild(st); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); });
await ctx.addInitScript(OVERLAY);
await login(ctx);
const p = await ctx.newPage(); const r = new Rec(p);
const go = async (u: string) => { await p.goto(u.startsWith('http') ? u : BASE + u, { timeout: 120000 }); await p.waitForTimeout(900); await p.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e: any) => e.classList.add('is-in', 'in', 'revealed'))); };
const focus = async (sel: string, off = 0.35) => { const l = p.locator(sel).first(); await l.evaluate((el: any, o: number) => { const r = el.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - innerHeight * o); }, off); await p.waitForTimeout(500); return l; };
const shot = async (name: string, sel?: any) => { if (sel) { const l = typeof sel === 'string' ? p.locator(sel).first() : sel.first(); if (await l.count()) await r.hl(l).catch((e: any) => console.log('nohl', name, e.message.slice(0, 80))); else console.log('MISSING', name); } await p.waitForTimeout(250); await p.screenshot({ path: path.join(OUT, name + '.png') }); await r.unhl().catch(() => {}); console.log('frame', name); };
const want = (s: string) => !only || only.includes(s);

if (want('register-a-domain')) {
  await go('/domains-registration?theme=hostpen'); await focus('[data-domain-form]', 0.3);
  await p.locator('[data-domain-form] input[name=query]').fill('example-studio'); await shot('register-a-domain-1', '[data-domain-form]');
  await focus('.dom-table', 0.12); await shot('register-a-domain-2', '.dom-table');
  await go('https://my.globalhostia.com/cart.php?a=view&k=domain'); await shot('register-a-domain-3', '.item');
  await go('/account/domains'); await focus('main', 0.05); await focus('main a[href="/account/domains/301"]', 0.35); await shot('register-a-domain-4', p.locator('main a[href="/account/domains/301"]').locator('xpath=ancestor::*[self::tr or self::li or self::article][1]'));
}
if (want('buy-hosting')) {
  await go('/web-hosting?theme=hostpen'); await focus('.hp-planset', 0.02);
  await shot('buy-hosting-1', '.hp-plans');
  await shot('buy-hosting-2', p.locator('.hp-plans a[href*="cart.php"]').nth(1));
  await go('https://my.globalhostia.com/cart.php?a=view&k=hosting'); await shot('buy-hosting-3', '.item');
  await focus('#checkout', 0.5); await shot('buy-hosting-4', '#checkout');
}
if (want('transfer-a-domain')) {
  await go('/domains-registration?theme=hostpen'); await focus('[data-dom-transfer]', 0.4);
  await shot('transfer-a-domain-1', '[data-dom-transfer]');
  await p.locator('[data-dom-transfer] input[type=text], [data-dom-transfer] input:not([type=hidden])').first().fill('example-studio.com'); await shot('transfer-a-domain-2', '[data-dom-transfer]');
  await go('https://my.globalhostia.com/cart.php?a=view&k=transfer'); await shot('transfer-a-domain-3', '.item');
  await go('/account/domains'); await focus('main', 0.05); await focus('main a[href="/account/domains/301"]', 0.35); await shot('transfer-a-domain-4', p.locator('main a[href="/account/domains/301"]').locator('xpath=ancestor::*[self::tr or self::li or self::article][1]'));
}
if (want('connect-ai-assistant')) {
  await go('/connectors?theme=hostpen'); await focus('h2:has-text("Connect in two minutes")', 0.12);
  await focus('code:text-is("https://globalhostia.com/mcp")', 0.6);
  await shot('connect-ai-assistant-1', p.locator('code:text-is("https://globalhostia.com/mcp")').locator('xpath=..'));
  await shot('connect-ai-assistant-2', p.locator('ol:has-text("Customize")'));
  // our consent page: register a demo client and open /oauth/authorize while signed in
  const reg = await p.request.post(`${BASE}/oauth/register`, { data: { client_name: 'Your AI assistant', redirect_uris: ['https://assistant.example/oauth/callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } });
  const cid = (await reg.json()).client_id;
  const v = crypto.randomBytes(32).toString('base64url'), c = crypto.createHash('sha256').update(v).digest('base64url');
  await go(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: cid, redirect_uri: 'https://assistant.example/oauth/callback', code_challenge: c, code_challenge_method: 'S256', state: 'demo', resource: BASE + '/mcp' })}`);
  await focus('main form button[type=submit] >> nth=-1', 0.78); await shot('connect-ai-assistant-3', p.locator('main form button:has-text("Allow access")'));
  await go('/account/apps'); await shot('connect-ai-assistant-4', p.locator('main button:has-text("Disconnect")'));
}
await b.close();
