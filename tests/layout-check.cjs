// Layout check: text clipped or spilling out of its box, elements escaping their card or the viewport,
// overlapping text, horizontal page scroll. Runs every page type at phone, tablet and desktop widths, then
// again with long-text stress data (long domain / plan names, long emails and prices, Arabic RTL).
// Needs: the app running (BASE), tests/mock-whmcs.mjs (WHMCS_API_URL pointing at it) and a seeded database.
// Run: BASE=http://localhost:3000 NODE_PATH=$(npm root -g) node tests/layout-check.cjs [page,page…]
// Env: W=390,768,1440 (widths) · STRESS=0 (skip the stress pass) · VERBOSE=1 (print every finding)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const WIDTHS = (process.env.W || '390,768,1440').split(',').map(Number);
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;

const PAGES = [
  ['home', '/'], ['web-hosting', '/web-hosting'], ['vps', '/vps-hosting'], ['dedicated', '/dedicated-servers'],
  ['ssl', '/ssl-certificate'], ['domains', '/domains-registration'], ['tld', '/domains/com'], ['product', '/p/hostia-ultra-usa'],
  ['compare', '/compare'], ['vs-hostinger', '/compare/globalhostia-vs-hostinger'], ['vs-aeserver', '/compare/globalhostia-vs-aeserver'], ['plan-finder', '/plan-finder'], ['blog', '/blog'], ['contact', '/contact'], ['terms', '/terms-conditions'],
  ['connectors', '/connectors'], ['docs', '/docs/mcp'], ['email', '/google-workspace'], ['help', '/help-center'], ['store', '/business-services'],
  ['uae', '/web-hosting-dubai'], ['migration', '/free-migration'], ['404', '/no-such-page-xyz'],
  ['acc-login', '/account/login'],
  ['acc-home', '/account', 'auth'], ['acc-services', '/account/services', 'auth'], ['acc-domains', '/account/domains', 'auth'],
  ['acc-invoices', '/account/invoices', 'auth'], ['acc-support', '/account/support', 'auth'],
  ['acc-reports', '/account/reports?m=2026-10', 'auth'], ['acc-ticket-closed', '/account/support/7000', 'auth'], ['rate-demo', '/account/rate?t=demo&s=4'],
  ['acc-home-ar', '/account', 'ar'], ['acc-domains-ar', '/account/domains', 'ar'],
  // setup checklist, usage meters and the one-click upgrade (lib/cx)
  ['acc-service-usage', '/account/services/102', 'auth'], ['acc-upgrade', '/account/services/104/upgrade', 'auth'], ['acc-service-usage-ar', '/account/services/102', 'ar'], ['acc-upgrade-ar', '/account/services/104/upgrade', 'ar'],
  // premium domains (lib/premium): 'rtl' = Arabic right-to-left stress without signing in; PREMIUM_DETAIL = a listed name
  ['premium', '/premium-domains'], ['premium-detail', process.env.PREMIUM_DETAIL || '/premium-domains/atlas.test'], ['home-hostpen', '/?theme=hostpen'],
  ['premium-ar', '/premium-domains', 'rtl'], ['premium-detail-ar', process.env.PREMIUM_DETAIL || '/premium-domains/atlas.test', 'rtl'],
  // sell your domain (lib/sell, lib/portal/views/sell.ts, lib/theme/pages/sell.ts)
  ['sell-domains', '/sell-domains'], ['sell-domains-ar', '/sell-domains', 'rtl'],
  // help centre how-tos (lib/theme/pages/help.ts): a video topic and an illustrated walkthrough, also right to left
  ['help-hub', '/help-center?theme=hostpen'], ['help-video', '/help/pay-an-invoice'], ['help-walk', '/help/buy-hosting'], ['help-video-ar', '/help/add-a-dns-record', 'rtl'], ['help-walk-ar', '/help/connect-ai-assistant', 'rtl'],
  // Arabic section (lib/theme/pages/ar.ts): right-to-left pages with Arabic copy
  ...['', 'web-hosting', 'vps-hosting', 'dedicated-servers', 'domains-registration', 'ae-domains', 'google-workspace', 'ssl-certificate', 'free-migration', 'premium-domains', 'sell-domains', 'connectors', 'contact', 'about']
    .map((s) => [`ar-${s || 'home'}`, s ? `/ar/${s}` : '/ar']),
  ['acc-sell', '/account/sell', 'auth'], ['acc-sell-new', '/account/sell/new', 'auth'], ['acc-sell-ar', '/account/sell', 'ar'], ['acc-sell-new-ar', '/account/sell/new', 'ar'],
];

/** Runs in the page: returns a list of findings. */
function audit() {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const name = (e) => {
    const c = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${e.tagName.toLowerCase()}${c}${e.textContent ? ` "${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 32)}"` : ''}`;
  };
  const visible = (e) => {
    if (!e.getClientRects().length) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.visibility === 'hidden' || s.opacity === '0' || s.display === 'none') return false;
      if (a.hidden || a.getAttribute('aria-hidden') === 'true' || a.inert) return false;
      if (s.clip !== 'auto' || s.clipPath === 'inset(50%)') return false;
      if (a.parentElement && a.parentElement.matches('details:not([open])') && a.tagName !== 'SUMMARY') return false;
      if (a.matches('.sr-only,[class*="sr-only"],dialog:not([open]),.hp-drawer:not(.is-open),.hp-mega:not(.is-open),[role="tabpanel"][hidden]')) return false;
    }
    return true;
  };
  const scrolls = (s) => /(auto|scroll)/.test(s.overflowX);
  const clipsX = (s) => /(hidden|clip)/.test(s.overflowX);
  // 1. horizontal page scroll
  if (document.documentElement.scrollWidth > vw + 1) {
    const off = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > vw + 1 && r.width && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(name);
    out.push(['page-scroll', `page is ${document.documentElement.scrollWidth}px wide at ${vw}px: ${off.join(' | ')}`]);
  }
  // nearest "box" ancestor: something with a visible border or its own background, i.e. a card, button, pill or input
  const isBox = (e) => {
    const s = getComputedStyle(e);
    if (e === document.body || e.matches('main,section,header,footer,html')) return false;
    const bw = parseFloat(s.borderTopWidth) + parseFloat(s.borderLeftWidth);
    const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    return (bw > 0 || bg || s.boxShadow !== 'none') && e.getBoundingClientRect().width < vw - 4;
  };
  const els = [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg,script,style,noscript,template,canvas,select,option,.hp-marquee,.hp-progress') && visible(e));
  const leaves = [];
  for (const e of els) {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    // 2. content wider than its own box: clipped (overflow hidden, not an intended ellipsis) or spilling (overflow visible)
    if (!scrolls(s) && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && !['IMG', 'VIDEO', 'INPUT', 'TEXTAREA', 'PICTURE'].includes(e.tagName)) {
      const ellipsis = s.textOverflow === 'ellipsis';
      const kids = [...e.children].filter(visible);
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      // a child that overflows on purpose (absolutely placed badge, edge-to-edge scroller) is not a spill
      const inFlow = (k) => { const ks = getComputedStyle(k); return !/(absolute|fixed)/.test(ks.position) && !scrolls(ks); };
      const real = own || kids.some((k) => inFlow(k) && (k.getBoundingClientRect().right > r.right + 2 || k.getBoundingClientRect().left < r.left - 2));
      if (real && !ellipsis) out.push([clipsX(s) ? 'clipped' : 'spills', `${name(e)} content ${e.scrollWidth}px in ${e.clientWidth}px`]);
    }
    // 3. leaving the viewport
    if (s.position !== 'fixed' && (r.right > vw + 1 || r.left < -1)) {
      let inScroller = false;
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const as = getComputedStyle(a); if (scrolls(as) || clipsX(as)) { inScroller = true; break; } }
      if (!inScroller) out.push(['off-screen', `${name(e)} at ${Math.round(r.left)}..${Math.round(r.right)} (viewport ${vw})`]);
    }
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own || ['BUTTON', 'IMG', 'INPUT', 'A'].includes(e.tagName)) leaves.push(e);
  }
  // floating widgets (WhatsApp / AI launchers, toasts) sit above the page on purpose
  const floating = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return true; return false; };
  // text that an overflow:hidden ancestor cuts away (collapsed lists, ellipsis, carousels) is not on screen
  const clipRects = (e, rects) => {
    let out = rects;
    for (let a = e; a && a !== document.body && out.length; a = a.parentElement) {
      const as = getComputedStyle(a);
      if (!clipsX(as) && !/(hidden|clip|auto|scroll)/.test(as.overflowY)) continue;
      const c = a.getBoundingClientRect();
      out = out.map((x) => ({ left: Math.max(x.left, c.left), right: Math.min(x.right, c.right), top: Math.max(x.top, c.top), bottom: Math.min(x.bottom, c.bottom) }))
        .filter((x) => x.right - x.left > 1 && x.bottom - x.top > 1).map((x) => ({ ...x, width: x.right - x.left, height: x.bottom - x.top }));
    }
    return out;
  };
  // 4. escaping the nearest card / button / pill
  for (const e of leaves) {
    const s = getComputedStyle(e);
    if (s.position === 'absolute' || s.position === 'fixed' || floating(e)) continue;
    if (s.webkitLineClamp && s.webkitLineClamp !== 'none') continue; // clamped excerpts hide their extra lines on purpose
    let box = e.parentElement, scrolled = false;
    while (box && box !== document.body && !isBox(box)) { if (scrolls(getComputedStyle(box))) scrolled = true; box = box.parentElement; }
    if (!box || box === document.body || scrolled) continue;
    const bs = getComputedStyle(box);
    if (scrolls(bs)) continue;
    // text box, not element box: inline text that wraps is measured by its line boxes
    const range = document.createRange(); range.selectNodeContents(e);
    const rr = [...range.getClientRects()].filter((x) => x.width > 1);
    const r = rr.length ? rr.reduce((a, x) => ({ left: Math.min(a.left, x.left), right: Math.max(a.right, x.right), top: Math.min(a.top, x.top), bottom: Math.max(a.bottom, x.bottom) }), { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 }) : e.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const dx = Math.max(b.left - r.left, r.right - b.right), dy = Math.max(b.top - r.top, r.bottom - b.bottom);
    if (dx > 2 || dy > 3) out.push([clipsX(bs) ? 'clipped-by-box' : 'escapes-box', `${name(e)} leaves ${name(box).slice(0, 60)} by ${Math.round(Math.max(dx, dy))}px`]);
  }
  // 5. overlapping text (two different text leaves whose glyph boxes intersect)
  const txt = leaves.filter((e) => !floating(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => {
    const range = document.createRange(); const rects = [];
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { range.selectNodeContents(n); rects.push(...[...range.getClientRects()].filter((x) => x.width > 1 && x.height > 1)); }
    return { e, rects: clipRects(e, rects) };
  }).filter((x) => x.rects.length);
  txt.sort((a, b) => a.rects[0].top - b.rects[0].top);
  for (let i = 0; i < txt.length; i++) {
    for (let j = i + 1; j < txt.length; j++) {
      if (txt[j].rects[0].top > txt[i].rects[txt[i].rects.length - 1].bottom + 40) break;
      const A = txt[i], B = txt[j];
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
      const hit = A.rects.some((a) => B.rects.some((b) => {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return w > 3 && h > Math.min(a.height, b.height) * 0.35;
      }));
      if (hit) out.push(['overlap', `${name(A.e)} overlaps ${name(B.e)}`]);
    }
  }
  return out;
}

/** Long-text stress data, written into the rendered page before the audit. */
function stress(ar) {
  const LONG_DOMAIN = 'international-business-consulting-and-technology-solutions.com';
  const LONG_PLAN = 'Hostia Ultra Business Unlimited NVMe Professional';
  const LONG_EMAIL = 'accounts.payable.department@international-business-solutions.example';
  const AR = 'استضافة مواقع سريعة مع شهادة أمان مجانية ونسخ احتياطي يومي';
  const set = (sel, v, n = 3) => [...document.querySelectorAll(sel)].slice(0, n).forEach((e) => { if (!e.children.length || e.matches('h3,h2,strong,b')) e.textContent = v; });
  set('.hp-plan h3,.hp-pfeature h3,.hp-prow__name a,.pd-name,.ac-svc__name,.ac-card h3', LONG_PLAN);
  set('.hp-price__amt', '1,234,567.89', 2);
  set('.hp-tl b,.dom-name,.dom-row b,.ac-dom__name,.ac-domain b,.ps-card b,[data-domain]', LONG_DOMAIN);
  set('.pd-card__h .pd-dom b,.pd-hero__h .pd-dom b,.pd-cert .pd-dom b', LONG_DOMAIN.replace(/\.com$/, ''));
  set('.pd-card__price b,.pd-buy__price', '$1,234,567.89', 3);
  [...document.querySelectorAll('a[href^="mailto:"]')].slice(0, 2).forEach((a) => { a.textContent = LONG_EMAIL; });
  [...document.querySelectorAll('input[type=search],input[name=domain],.hp-dfield input,.hp-msearch input')].forEach((i) => { i.value = LONG_DOMAIN; });
  if (ar) {
    document.documentElement.setAttribute('dir', 'rtl'); document.documentElement.lang = 'ar';
    set('.hp-sec-head h2,.hp-cta h2,.hp-fitem h3', AR, 4);
  }
}

(async () => {
  const b = await chromium.launch();
  let total = 0;
  const rows = [];
  for (const w of WIDTHS) {
    for (const mode of process.env.STRESS === '0' ? ['plain'] : ['plain', 'stress']) {
      const ctx = await b.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, reducedMotion: 'reduce', extraHTTPHeaders: { 'x-forwarded-for': ip() } });
      await ctx.addCookies([{ name: 'gh_consent', value: 'denied', url: BASE }]);
      const p = await ctx.newPage();
      let signedIn = false;
      for (const [key, path, need] of PAGES) {
        if (ONLY.length && !ONLY.includes(key)) continue;
        if (need && need !== 'rtl' && !signedIn) {
          await p.goto(BASE + '/account/login');
          await p.fill('#au-email', 'demo@example.com'); await p.fill('#au-pass', 'demo-pass');
          await Promise.all([p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 }).catch(() => {}), p.click('button:has-text("Sign in")')]);
          signedIn = true;
        }
        await ctx.addCookies([{ name: 'gh_lang', value: need === 'ar' ? 'ar' : 'en', url: BASE }]);
        try { await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 90000 }); } catch { rows.push([key, w, mode, 'load', 'timeout']); continue; }
        await p.addStyleTag({ content: '.gh-consent{display:none!important}' });
        if (mode === 'stress') await p.evaluate(stress, need === 'ar' || need === 'rtl' || key === 'blog');
        await p.waitForTimeout(150);
        const found = await p.evaluate(audit);
        const uniq = [...new Map(found.map((f) => [f.join(' '), f])).values()];
        total += uniq.length;
        for (const [kind, msg] of uniq) rows.push([key, w, mode, kind, msg]);
        console.log(`${uniq.length ? 'FAIL' : 'PASS'}  ${key} @${w} ${mode}${uniq.length ? ` (${uniq.length})` : ''}`);
        if (uniq.length && process.env.VERBOSE) for (const [kind, msg] of uniq) console.log(`      ${kind}: ${msg}`);
      }
      await ctx.close();
    }
  }
  await b.close();
  if (!process.env.VERBOSE && rows.length) for (const r of rows.slice(0, 80)) console.log('  ', r.join(' · '));
  console.log(total ? `\n${total} layout finding(s)` : '\nno layout findings');
  process.exit(total ? 1 : 0);
})();
