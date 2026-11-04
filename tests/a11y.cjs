// Accessibility audit (WCAG 2.2 A/AA) with axe-core on every public page type, the account portal and the admin login,
// at phone and desktop widths, in English and Arabic. Also runs keyboard checks axe cannot (skip link, drawer focus
// trap + Esc, mega menu Esc, AI chat dialog focus + Esc) and a 320px reflow check (WCAG 1.4.10).
// Needs: the app running (BASE), tests/mock-whmcs.mjs on :4555 (WHMCS_API_URL pointing at it) and the seeded database.
// Run: BASE=http://localhost:3000 NODE_PATH=$(npm root -g) node tests/a11y.cjs [page,page…]
// Env: W=390,1440 (widths) · LANGS=en,ar · THEME=hostpen (adds ?theme=hostpen when the local DB still uses the old theme)
//      VERBOSE=1 (print every node) · KEYS=0 (skip keyboard checks) · JSON=/path/out.json (raw results)
// Exit code 1 when any page has a serious or critical violation, or a keyboard/reflow check fails.
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:3000';
const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const WIDTHS = (process.env.W || '390,1440').split(',').map(Number);
const LANGS = (process.env.LANGS || 'en,ar').split(',');
const THEME = process.env.THEME || '';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;

// [key, path, need]  need: 'auth' = signed-in portal page
const PAGES = [
  ['home', '/'], ['web-hosting', '/web-hosting'], ['wordpress', '/wordpress-hosting'], ['vps', '/vps-hosting'], ['dedicated', '/dedicated-servers'],
  ['cloud', '/cloud-servers'], ['reseller', '/cpanel-reseller'], ['ssl', '/ssl-certificate'], ['email', '/google-workspace'],
  ['domains', '/domains-registration'], ['tld', '/domains/com'], ['ae-domains', '/ae-domains'], ['product', '/p/hostia-ultra'],
  ['compare', '/compare'], ['vs', '/compare/globalhostia-vs-hostinger'], ['plan-finder', '/plan-finder'],
  ['premium', '/premium-domains'], ['premium-detail', process.env.PREMIUM_DETAIL || '/premium-domains/atlas.test'], ['sell-domains', '/sell-domains'],
  ['connectors', '/connectors'], ['docs-mcp', '/docs/mcp'], ['store', '/business-services'],
  ['blog', '/blog'], ['blog-post', '/blog/spf-dkim-dmarc-explained'], ['blog-post-ar', '/blog/spf-dkim-dmarc-explained-ar'],
  ['help', '/help-center'], ['contact', '/contact'], ['terms', '/terms-conditions'], ['privacy', '/privacy-policy'],
  ['uae', '/web-hosting-dubai'], ['migration', '/free-migration'], ['404', '/no-such-page-xyz'],
  ['acc-login', '/account/login'], ['acc-forgot', '/account/forgot'], ['admin-login', '/admin/login'],
  ['acc-home', '/account', 'auth'], ['acc-services', '/account/services', 'auth'], ['acc-service', '/account/services/101', 'auth'],
  ['acc-domains', '/account/domains', 'auth'], ['acc-domain', '/account/domains/301', 'auth'], ['acc-dns', '/account/domains/301/dns', 'auth'],
  ['acc-invoices', '/account/invoices', 'auth'], ['acc-invoice', '/account/invoices/5001', 'auth'],
  ['acc-support', '/account/support', 'auth'], ['acc-ticket', '/account/support/7001', 'auth'], ['acc-ticket-new', '/account/support/new', 'auth'],
  ['acc-renewals', '/account/renewals', 'auth'], ['acc-profile', '/account/profile', 'auth'], ['acc-settings', '/account/settings', 'auth'],
  ['acc-team', '/account/team', 'auth'], ['acc-sell', '/account/sell', 'auth'], ['acc-sell-new', '/account/sell/new', 'auth'],
];
const url = (path, need) => {
  if (!THEME || need || path.startsWith('/account') || path.startsWith('/admin')) return BASE + path;
  return BASE + path + (path.includes('?') ? '&' : '?') + 'theme=' + THEME;
};

async function signIn(p) {
  await p.goto(BASE + '/account/login');
  await p.fill('#au-email', 'demo@example.com'); await p.fill('#au-pass', 'demo-pass');
  await Promise.all([p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}), p.click('form button[type=submit]')]);
}

let failures = 0;
const keyFail = (m) => { failures++; console.log(`FAIL  keyboard: ${m}`); };
const keyPass = (m) => console.log(`PASS  keyboard: ${m}`);
const active = (p) => p.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}.${a.className}` : ''; });

/** Keyboard checks on a public page (phone width for the drawer, desktop for the mega menu). */
async function keyboard(p, w) {
  // skip link is the first tab stop, visible when focused, and moves focus to <main>
  await p.keyboard.press('Tab');
  const first = await p.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { cls: String(a.className), txt: a.textContent.trim(), vis: r.width > 1 && r.top >= 0 && r.top < innerHeight }; });
  if (!/hp-skip/.test(first.cls) || !first.vis) keyFail(`@${w} first Tab stop is not a visible skip link (${first.cls} "${first.txt}")`); else keyPass(`@${w} skip link first and visible`);
  await p.keyboard.press('Enter');
  const inMain = await p.evaluate(() => !!document.activeElement && (document.activeElement.id === 'main' || !!document.activeElement.closest('main')));
  if (!inMain) keyFail(`@${w} skip link does not move focus to main (${await active(p)})`); else keyPass(`@${w} skip link moves focus to main`);
  if (w < 768) {
    const burger = p.locator('.hp-burger:visible');
    if (await burger.count()) {
      await burger.first().focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      const st = await p.evaluate(() => ({ open: document.getElementById('hp-drawer').classList.contains('is-open'), inDrawer: !!document.activeElement.closest('#hp-drawer'), exp: document.querySelector('.hp-burger').getAttribute('aria-expanded') }));
      if (!st.open || !st.inDrawer) keyFail(`@${w} drawer: opened=${st.open} focus inside=${st.inDrawer}`); else keyPass(`@${w} drawer opens with focus inside`);
      if (st.exp !== 'true') keyFail(`@${w} burger aria-expanded not true when open`);
      let escaped = false;
      for (let i = 0; i < 60; i++) { await p.keyboard.press('Tab'); if (!(await p.evaluate(() => !!document.activeElement.closest('#hp-drawer')))) { escaped = true; break; } }
      if (escaped) keyFail(`@${w} drawer: Tab moves focus out of the open drawer (${await active(p)})`); else keyPass(`@${w} drawer keeps focus while open`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      const after = await p.evaluate(() => ({ open: document.getElementById('hp-drawer').classList.contains('is-open'), back: document.activeElement.classList.contains('hp-burger') }));
      if (after.open || !after.back) keyFail(`@${w} drawer: Esc closed=${!after.open} focus returned to burger=${after.back}`); else keyPass(`@${w} Esc closes drawer and returns focus`);
    }
  } else {
    const btn = p.locator('.hp-nav__btn').first();
    if (await btn.count()) {
      await btn.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      const open = await btn.getAttribute('aria-expanded');
      if (open !== 'true') keyFail(`@${w} mega menu does not open with Enter`); else keyPass(`@${w} mega menu opens with Enter`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      const st = await p.evaluate(() => ({ exp: document.querySelector('.hp-nav__btn').getAttribute('aria-expanded'), back: document.activeElement === document.querySelector('.hp-nav__btn') }));
      if (st.exp !== 'false' || !st.back) keyFail(`@${w} mega menu: Esc closed=${st.exp === 'false'} focus back=${st.back}`); else keyPass(`@${w} Esc closes mega menu, focus back on its button`);
    }
  }
}

/** AI chat widget: open from its launcher, focus goes in, Esc closes and returns focus. */
async function chat(p, w) {
  const launcher = p.locator('.ghai-launch').first();
  try { await launcher.waitFor({ state: 'visible', timeout: 10000 }); } catch { console.log(`  skip @${w}: AI chat launcher not loaded`); return; }
  await launcher.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
  const st = await p.evaluate(() => { const d = document.activeElement; const dlg = d && d.closest('[role=dialog]'); return { inDialog: !!dlg, label: dlg && (dlg.getAttribute('aria-label') || dlg.getAttribute('aria-labelledby')) }; });
  if (!st.inDialog || !st.label) keyFail(`@${w} AI chat: focus inside dialog=${st.inDialog} label=${st.label}`); else keyPass(`@${w} AI chat opens with focus inside a labelled dialog`);
  // axe on the open chat
  const r = await new AxeBuilder({ page: p }).withTags(TAGS).include('[role=dialog]').analyze().catch(() => null);
  if (r) { const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'); if (bad.length) { failures++; console.log(`FAIL  ai-chat open @${w}: ${bad.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0].target.join(' ')}`).join(', ')}`); } else console.log(`PASS  ai-chat open @${w}: ${r.violations.length} minor/moderate`); }
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const back = await p.evaluate(() => { const a = document.activeElement; return !!a && !a.closest('[role=dialog]') && a !== document.body; });
  if (!back) keyFail(`@${w} AI chat: Esc did not close or focus not returned (${await active(p)})`); else keyPass(`@${w} Esc closes AI chat, focus returned`);
}

(async () => {
  const b = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const out = [];
  const summary = {};
  for (const lang of LANGS) {
    for (const w of WIDTHS) {
      const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, reducedMotion: 'reduce', extraHTTPHeaders: { 'x-forwarded-for': ip() } });
      await ctx.addCookies([{ name: 'gh_consent', value: 'denied', url: BASE }, { name: 'gh_lang', value: lang, url: BASE }]);
      let p = await ctx.newPage();
      let signedIn = false;
      // a dev server recompiling (or a crashed renderer) gets one retry on a fresh tab
      const load = async (u) => {
        for (let i = 0; i < 2; i++) {
          try { await p.goto(u, { waitUntil: 'networkidle', timeout: 90000 }); return true; } catch (e) {
            if (i) { console.log(`ERR   ${u}: ${String(e.message).split('\n')[0]}`); return false; }
            try { await p.close(); } catch {} p = await ctx.newPage();
          }
        }
      };
      for (const [key, path, need] of PAGES) {
        if (ONLY.length && !ONLY.includes(key)) continue;
        if (need === 'auth' && !signedIn) { try { await signIn(p); } catch { p = await ctx.newPage(); await signIn(p); } signedIn = true; }
        if (!(await load(url(path, need)))) { failures++; continue; }
        try { await p.addStyleTag({ content: '.gh-consent{display:none!important}' }); await p.waitForTimeout(200); } catch {}
        let res;
        try { res = await new AxeBuilder({ page: p }).withTags(TAGS).exclude('.hp-preview-pill').analyze(); } catch (e) {
          console.log(`ERR   ${key} @${w} ${lang}: ${String(e.message).split('\n')[0]}`); failures++; try { await p.close(); } catch {} p = await ctx.newPage(); continue;
        }
        const v = res.violations;
        const by = { critical: 0, serious: 0, moderate: 0, minor: 0 };
        for (const x of v) by[x.impact] = (by[x.impact] || 0) + x.nodes.length;
        const bad = by.critical + by.serious;
        if (bad) failures++;
        summary[key] = summary[key] || { critical: 0, serious: 0, moderate: 0, minor: 0 };
        for (const i of Object.keys(by)) summary[key][i] += by[i];
        console.log(`${bad ? 'FAIL' : v.length ? 'WARN' : 'PASS'}  ${key} @${w} ${lang}  crit ${by.critical} · serious ${by.serious} · moderate ${by.moderate} · minor ${by.minor}`);
        for (const x of v) {
          console.log(`      [${x.impact}] ${x.id} (${x.nodes.length}): ${x.help}`);
          for (const n of x.nodes.slice(0, process.env.VERBOSE ? 50 : 3)) console.log(`         ${n.target.join(' ')}${process.env.VERBOSE ? `  — ${(n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220)}` : ''}`);
        }
        out.push({ key, path, w, lang, violations: v.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.map((n) => ({ target: n.target, html: n.html, summary: n.failureSummary })) })) });
        try {
          if (w < 500) {
            await p.setViewportSize({ width: 320, height: 700 });
            await p.waitForTimeout(150);
            const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            if (wide > 1) { failures++; console.log(`FAIL  reflow: ${key} ${lang} scrolls ${wide}px sideways at 320px`); }
            await p.setViewportSize({ width: w, height: 844 });
          }
          if (process.env.KEYS !== '0' && lang === 'en' && key === 'home') {
            await p.goto(url(path, need), { waitUntil: 'networkidle' });
            await p.addStyleTag({ content: '.gh-consent{display:none!important}' });
            await keyboard(p, w);
            await p.goto(url(path, need), { waitUntil: 'load' });
            await chat(p, w);
          }
        } catch (e) { console.log(`ERR   ${key} @${w} ${lang}: ${String(e.message).split('\n')[0]}`); failures++; try { await p.close(); } catch {} p = await ctx.newPage(); }
      }
      await ctx.close();
    }
  }
  await b.close();
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(out, null, 1));
  console.log('\nTotals per page (all widths and languages):');
  for (const [k, s] of Object.entries(summary)) console.log(`  ${k.padEnd(16)} crit ${s.critical}  serious ${s.serious}  moderate ${s.moderate}  minor ${s.minor}`);
  console.log(failures ? `\n${failures} failing check(s)` : '\nAll pages: 0 serious/critical');
  process.exit(failures ? 1 : 0);
})();
