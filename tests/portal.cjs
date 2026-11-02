// Customer portal ("My account") checks. Needs: the app running (BASE), tests/mock-whmcs.mjs on :4555
// (WHMCS_API_URL pointing at it) and a database. Run: BASE=http://localhost:3401 NODE_PATH=$(npm root -g) node tests/portal.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '';
let failures = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };
// unique client IP per run so the per-IP login limiter never carries over between runs
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const p = await ctx.newPage();
  const status = async (url) => (await p.goto(BASE + url)).status();

  // 1. guard + sign-in
  await p.goto(`${BASE}/account/services/101`);
  ok(p.url().includes('/account/login') && p.url().includes('next='), 'signed-out visitor is sent to sign in (with return path)');
  ok(!(await p.content()).includes('WHMCS'), 'no "WHMCS" wording on the sign-in page');
  await p.fill('#au-email', 'demo@example.com'); await p.fill('#au-pass', 'wrong-pass'); await p.click('button:has-text("Sign in")');
  await p.waitForLoadState();
  ok((await p.content()).includes('did not match an account'), 'wrong password shows a generic error');
  ok(!(await ctx.cookies()).some((c) => c.name === 'gh_client'), 'no session cookie after a failed login');
  await p.fill('#au-pass', 'demo-pass'); await p.click('button:has-text("Sign in")');
  await p.waitForURL(/\/account\/services\/101/);
  ok(true, 'correct password signs in and returns to the requested page');
  const ck = (await ctx.cookies()).find((c) => c.name === 'gh_client');
  ok(ck && ck.httpOnly && ck.secure && ck.sameSite === 'Lax', 'session cookie is HttpOnly + Secure + SameSite=Lax');

  // 2. service detail
  const svc = await p.content();
  ok(svc.includes('Cloud VPS 4') && svc.includes('203.0.113.24') && svc.includes('Ubuntu 24.04 LTS'), 'service detail shows product, IP and configuration');
  ok(!svc.includes('NEVER-SHOW-THIS'), 'service password is never rendered');
  ok(svc.includes('Power controls') && svc.includes('Show login details'), 'server card + secure login-details hand-off');

  // 3. dashboard
  await p.goto(`${BASE}/account`);
  const dash = await p.content();
  ok(dash.includes('Demo') && dash.includes('My Products') && dash.includes('Cloud VPS 4'), 'dashboard renders greeting and My Products');
  ok(dash.includes('$25.20') && dash.includes('demo-brand.com') && dash.includes('VPS reboot loop'), 'dashboard shows amount due, expiring domain and recent ticket');
  ok(dash.includes('name="robots" content="noindex"'), 'portal pages are noindex');
  ok(!/WHMCS/.test(dash), 'no "WHMCS" wording on the dashboard');

  // 4. ownership checks: another client's objects are 404
  ok(await status('/account/services/201') === 404, "another client's service → 404");
  ok(await status('/account/domains/401') === 404, "another client's domain → 404");
  ok(await status('/account/invoices/6001') === 404, "another client's invoice → 404");
  ok(await status('/account/support/8001') === 404, "another client's ticket → 404");
  ok(!(await p.content()).includes('Other client private ticket'), 'nothing from the other client leaks into the 404 page');

  // 5. invoices
  ok(await status('/account/invoices') === 200 && (await p.content()).includes('#5001'), 'invoice list');
  ok(await status('/account/invoices/5001') === 200 && (await p.content()).includes('Cloud VPS 4 - vps1.demo-brand.com'), 'invoice detail with line items');

  // 6. ticket thread: escaped plain text + reply
  await p.goto(`${BASE}/account/support/7001`);
  const th = await p.content();
  ok(th.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && !th.includes('<script>alert(1)'), 'ticket messages are escaped (no HTML from messages)');
  ok(th.includes('Rahul S.') && th.includes('Globalhostia support'), 'staff reply rendered');
  const replyText = 'Thanks, please retry during the window ' + Date.now();
  await p.fill('#ac-reply', replyText); await p.click('button:has-text("Send reply")');
  await p.waitForURL(/ok=reply_sent/);
  ok((await p.content()).includes(replyText) && (await p.content()).includes('Reply sent.'), 'ticket reply posted and shown');

  // 7. CSRF + origin enforcement
  const forged = await p.request.post(`${BASE}/account/support/7001`, { form: { action: 'reply', message: 'forged reply' }, headers: { origin: BASE }, maxRedirects: 0 });
  ok(forged.status() === 303 && /err=csrf/.test(forged.headers()['location'] || ''), 'POST without CSRF token is rejected');
  const csrf = await p.getAttribute('input[name=csrf]', 'value');
  const xorigin = await p.request.post(`${BASE}/account/support/7001`, { form: { action: 'reply', message: 'cross-site', csrf }, headers: { origin: 'https://evil.example' }, maxRedirects: 0 });
  ok(xorigin.status() === 303 && /err=csrf/.test(xorigin.headers()['location'] || ''), 'POST from another origin is rejected');
  await p.goto(`${BASE}/account/support/7001`);
  ok(!(await p.content()).includes('forged reply') && !(await p.content()).includes('cross-site'), 'rejected replies were not posted');

  // 8. secure hand-off only for owned objects
  const ssoOther = await p.request.post(`${BASE}/account/sso`, { form: { csrf, to: 'invoice', id: '6001' }, headers: { origin: BASE, referer: `${BASE}/account/invoices` }, maxRedirects: 0 });
  ok(/err=sso/.test(ssoOther.headers()['location'] || ''), "hand-off refused for another client's invoice");
  const ssoOwn = await p.request.post(`${BASE}/account/sso`, { form: { csrf, to: 'invoice', id: '5001' }, headers: { origin: BASE }, maxRedirects: 0 });
  ok(ssoOwn.status() === 303 && /singlesignon\.php.*viewinvoice\.php%3Fid%3D5001/.test(ssoOwn.headers()['location'] || ''), 'Pay now hands off to the invoice via single sign-on');
  const ssoBad = await p.request.post(`${BASE}/account/sso`, { form: { csrf, to: 'https://evil.example' }, headers: { origin: BASE }, maxRedirects: 0 });
  ok(/err=sso/.test(ssoBad.headers()['location'] || ''), 'unknown hand-off destinations are refused');

  // 9. nameservers
  await p.goto(`${BASE}/account/domains/301`);
  ok(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(await p.inputValue('#ac-ns1')), 'current nameservers loaded');
  await p.fill('#ac-ns1', 'http://bad host'); await p.click('button:has-text("Save nameservers")'); await p.waitForLoadState();
  ok((await p.content()).includes('Enter a hostname like'), 'invalid nameserver rejected with a field error');
  await p.fill('#ac-ns1', 'ns1.cloudflare.com'); await p.fill('#ac-ns2', 'ns2.cloudflare.com'); await p.click('button:has-text("Save nameservers")');
  await p.waitForURL(/ok=ns_saved/);
  ok((await p.inputValue('#ac-ns1')) === 'ns1.cloudflare.com', 'nameservers updated');
  await p.fill('#ac-ns1', 'ns1.globalhostia.com'); await p.fill('#ac-ns2', 'ns2.globalhostia.com'); await p.click('button:has-text("Save nameservers")');
  await p.waitForURL(/ok=ns_saved/);

  // 10. new ticket
  await p.goto(`${BASE}/account/support/new?service=101`);
  await p.selectOption('#ac-dept', '1'); await p.fill('#ac-sub', 'Need more IPv4'); await p.fill('#ac-msg', 'Please add two more IPv4 addresses to vps1.');
  await p.click('button:has-text("Open ticket")'); await p.waitForURL(/ok=ticket_opened/);
  ok((await p.content()).includes('Need more IPv4'), 'new ticket opened and shown');

  // 11. profile validation + save
  await p.goto(`${BASE}/account/profile`);
  await p.fill('#ac-firstname', ''); await p.click('button:has-text("Save changes")'); await p.waitForLoadState();
  ok((await p.content()).includes('Enter your first name.'), 'profile validation');
  await p.fill('#ac-firstname', 'Dana'); await p.click('button:has-text("Save changes")'); await p.waitForURL(/ok=profile_saved/);
  ok((await p.inputValue('#ac-firstname')) === 'Dana', 'profile saved');
  await p.fill('#ac-firstname', 'Demo'); await p.click('button:has-text("Save changes")'); await p.waitForURL(/ok=profile_saved/);

  // 12. mobile layout
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.context().addCookies([ck].map((c) => ({ ...c })));
  for (const u of ['/account', '/account/services/101', '/account/invoices', '/account/support/7001']) {
    await m.goto(BASE + u);
    const over = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    ok(!over, `no horizontal overflow at 390px: ${u}`);
  }

  // 13. sign out
  await p.goto(`${BASE}/account`);
  await p.click('.ac-dd--me summary'); await p.click('button:has-text("Sign out")');
  await p.waitForURL(/\/account\/login\?out=1/);
  ok((await p.content()).includes('You have signed out.'), 'sign out');
  await p.goto(`${BASE}/account`);
  ok(p.url().includes('/account/login'), 'session cleared after sign out');

  // 14. two-step accounts are sent to the secure sign-in page
  await p.fill('#au-email', 'tfa@example.com'); await p.fill('#au-pass', 'tfa-pass'); await p.click('button:has-text("Sign in")'); await p.waitForLoadState();
  ok((await p.content()).includes('two-step verification') && !(await ctx.cookies()).some((c) => c.name === 'gh_client'), 'two-step account: no session, secure fallback shown');

  // 15. rate limit (isolated IP + email)
  const rl = await b.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip() } });
  const rp = await rl.newPage();
  const email = `nobody${Date.now()}@example.com`;
  let last = '';
  for (let i = 0; i < 6; i++) {
    await rp.goto(`${BASE}/account/login`);
    await rp.fill('#au-email', email); await rp.fill('#au-pass', 'nope'); await rp.click('button:has-text("Sign in")'); await rp.waitForLoadState();
    last = await rp.content();
  }
  ok(last.includes('Too many sign-in attempts'), 'sixth failed attempt within 15 minutes is blocked');
  await rp.goto(`${BASE}/account/forgot`);
  await rp.fill('#au-email', 'whoever@example.com'); await rp.click('button:has-text("Send reset link")'); await rp.waitForLoadState();
  ok((await rp.content()).includes('Check your email'), 'password reset shows the neutral confirmation');

  // 16. theme sign-in page posts to the portal
  await rp.goto(`${BASE}/sign-in?theme=hostpen`);
  ok(/^\/account\/login(\?|$)/.test(await rp.getAttribute('form.au-form', 'action')), 'theme /sign-in form posts to /account/login');

  await b.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
