// SEO + social-sharing audit: crawls every public page (both sitemaps, the theme routes, a fixed list of extra
// URLs and every internal link it finds) and checks titles, descriptions, canonicals, robots, hreflang, Open Graph,
// Twitter cards, headings, image alts, JSON-LD, sitemap consistency, status codes, redirects and the OG images
// themselves (200, image/png, 1200x630). Exit code 1 when there is any error (warnings are listed, never fail).
// Needs: the app running (BASE) with tests/mock-whmcs.mjs as WHMCS and a seeded database (see tests/layout-check.cjs).
// Run: BASE=http://localhost:3000 node tests/seo-audit.cjs
// Env: SITE=https://globalhostia.com (canonical origin) · OUT=<dir> (writes seo-audit.json + seo-audit.md)
//      MAX=1500 (page limit) · CONC=6 (parallel requests) · VERBOSE=1 (print every finding)
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('parse5');

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const SITE = (process.env.SITE || 'https://globalhostia.com').replace(/\/$/, '');
const OUT = process.env.OUT || '';
const MAX = Number(process.env.MAX || 1500);
const CONC = Number(process.env.CONC || 6);
const VERBOSE = process.env.VERBOSE === '1';

// Pages that are not in a sitemap but must be checked (status, noindex, canonical); [path, expectation]
// expectation: 'index' (indexable page), 'noindex' (must carry noindex), '404', 'clean' (canonical = URL without query)
const EXTRA = [
  ['/no-such-page-xyz', '404'], ['/account/login', 'noindex'], ['/sign-in', 'noindex'], ['/sign-up', 'noindex'],
  ['/forget-password', 'noindex'], ['/account/forgot', 'noindex'], ['/admin/login', 'noindex'], ['/ai/checkout', 'noindex'], ['/thank-you', '404'], ['/404', '404'],
  ['/premium-domains?q=atlas', 'noindex'], ['/Web-Hosting', 'redirect'], ['/index', 'redirect'],
  ['/web-hosting?utm_source=newsletter&utm_medium=email&gclid=abc', 'clean'], ['/vps-hosting?sort=price&cycle=annually', 'clean'],
  ['/dedicated-servers?location=usa&page=2', 'clean'], ['/domains-registration?domain=example.com', 'clean'], ['/blog?page=1', 'clean'],
  ['/web-hosting?ab=hero.b', 'noindex'], ['/web-hosting?_ab=hero.b', 'clean'], ['/web-hosting?theme=hostpen', 'noindex'], ['/?fbclid=xyz', 'clean'],
  ['/ar?utm_source=x', 'clean'], ['/compare?x=1', 'clean'], ['/premium-domains?q=atlas&sort=price', 'clean'], ['/blog/shared-hosting-vs-vps-which-one-do-you-need?utm_campaign=x', 'clean'],
  // more, per fixture: EXTRA_PATHS="/lp/forex-vps:noindex,/p/hostia-lite:clean?ref=x"
  ...(process.env.EXTRA_PATHS || '').split(',').filter(Boolean).map((x) => { const i = x.lastIndexOf(':'); return [x.slice(0, i), x.slice(i + 1)]; }),
];
// legacy .html URLs that must 301 to their clean URL
const LEGACY = [['/index.html', '/'], ['/web-hosting.html', '/web-hosting'], ['/vps-hosting.html', '/vps-hosting'], ['/contact.html', '/contact'],
  ['/dedicated-servers.html', '/dedicated-servers'], ['/ssl-certificate.html', '/ssl-certificate'],
  // one hop straight to the final page (no /aws-pro-wordpress chain, no 404 at /index1)
  ['/aws-pro-wordpress.html', '/wordpress-hosting'], ['/index1.html', '/'], ['/web-hosting1.html', '/web-hosting'], ['/blog-single.html', '/blog']];
// never crawled: admin, account (except the probes above), APIs, WHMCS, assets, Markdown copies
const SKIP = /^\/(admin|api|secure|account|oauth|mcp|_next|hp|image|assets|og|feeds|template-part|cgi-bin|cart|checkout|ask|v2)(\/|$)|\.(md|txt|xml|json|png|jpe?g|webp|svg|gif|ico|css|js|pdf|mp4|woff2?|zip)$/i;

const findings = []; // { level, type, url, msg }
const err = (type, url, msg) => findings.push({ level: 'error', type, url, msg });
const warn = (type, url, msg) => findings.push({ level: 'warning', type, url, msg });
const toLocal = (u) => u.startsWith(SITE) ? BASE + u.slice(SITE.length) : u;
const toSite = (u) => u.startsWith(BASE) ? SITE + u.slice(BASE.length) : u;
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;

async function get(url, opts = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; GH-SEO-Audit/1.0)', accept: 'text/html,*/*', 'x-forwarded-for': ip(), ...(opts.headers || {}) }, signal: AbortSignal.timeout(120000) });
      const buf = opts.binary ? Buffer.from(await r.arrayBuffer()) : null;
      const text = opts.binary ? '' : await r.text();
      return { status: r.status, headers: r.headers, text, buf, location: r.headers.get('location') };
    } catch (e) { if (i === 2) return { status: 0, headers: new Headers(), text: '', error: e.message }; await new Promise((s) => setTimeout(s, 1000)); }
  }
}

/* ---------------------------------------------------------------- HTML helpers (parse5 tree) */
function walk(node, fn) { fn(node); for (const c of node.childNodes || []) walk(c, fn); if (node.content) walk(node.content, fn); }
const attr = (n, k) => (n.attrs || []).find((a) => a.name === k)?.value;
const textOf = (n) => { let t = ''; walk(n, (x) => { if (x.nodeName === '#text') t += x.value; }); return t.replace(/\s+/g, ' ').trim(); };
function extract(html) {
  const doc = parse(html);
  const o = { titles: [], metas: [], links: [], h: [], imgs: [], ld: [], anchors: [], html: null };
  walk(doc, (n) => {
    switch (n.nodeName) {
      case 'html': o.html = { lang: attr(n, 'lang'), dir: attr(n, 'dir') }; break;
      case 'title': if (!inside(n, 'svg')) o.titles.push(textOf(n)); break;
      case 'meta': o.metas.push({ name: (attr(n, 'name') || '').toLowerCase(), prop: (attr(n, 'property') || '').toLowerCase(), content: attr(n, 'content') ?? '' }); break;
      case 'link': o.links.push({ rel: (attr(n, 'rel') || '').toLowerCase(), href: attr(n, 'href') || '', hreflang: attr(n, 'hreflang') }); break;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        if (!inside(n, 'template')) o.h.push({ level: Number(n.nodeName[1]), text: textOf(n).slice(0, 60), hidden: ariaHidden(n) || inside(n, 'header') || inside(n, 'footer') || inside(n, 'nav') }); break;
      case 'img': o.imgs.push({ src: attr(n, 'src') || '', alt: attr(n, 'alt'), role: attr(n, 'role'), hidden: attr(n, 'aria-hidden') === 'true' }); break;
      case 'script': if ((attr(n, 'type') || '') === 'application/ld+json') o.ld.push(textOf(n) || (n.childNodes?.[0]?.value ?? '')); break;
      case 'a': { const h = attr(n, 'href'); if (h) o.anchors.push(h); break; }
    }
  });
  return o;
}
function inside(n, tag) { for (let p = n.parentNode; p; p = p.parentNode) if (p.nodeName === tag) return true; return false; }
function ariaHidden(n) { for (let p = n; p; p = p.parentNode) if (p.attrs && attr(p, 'aria-hidden') === 'true') return true; return false; }
const meta = (o, key) => o.metas.filter((m) => m.name === key || m.prop === key).map((m) => m.content);

/* ---------------------------------------------------------------- image size (PNG / JPEG / WebP headers) */
function imageSize(b) {
  if (!b || b.length < 24) return null;
  if (b.readUInt32BE(0) === 0x89504e47) return { type: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]; const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { type: 'jpeg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const c = b.toString('ascii', 12, 16);
    if (c === 'VP8X') return { type: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (c === 'VP8 ') return { type: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (c === 'VP8L') { const v = b.readUInt32LE(21); return { type: 'webp', w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  }
  return null;
}

/* ---------------------------------------------------------------- sitemaps */
async function sitemap(p) {
  const r = await get(BASE + p);
  if (r.status !== 200) { err('sitemap', p, `HTTP ${r.status}`); return []; }
  if (!/xml/.test(r.headers.get('content-type') || '')) err('sitemap', p, `content-type ${r.headers.get('content-type')}`);
  const urls = [];
  for (const m of r.text.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = (m[1].match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const lastmod = (m[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
    const alts = [...m[1].matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((a) => ({ lang: a[1], href: a[2].replace(/&amp;/g, '&') }));
    if (!loc) continue;
    urls.push({ loc: loc.replace(/&amp;/g, '&'), lastmod, alts });
  }
  const seen = new Set();
  for (const u of urls) {
    if (!u.loc.startsWith(SITE + '/')) err('sitemap', p, `loc not on ${SITE}: ${u.loc}`);
    if (seen.has(u.loc)) err('sitemap', p, `duplicate loc ${u.loc}`); seen.add(u.loc);
    if (u.lastmod !== undefined) {
      const t = Date.parse(u.lastmod);
      if (!Number.isFinite(t)) err('sitemap-lastmod', u.loc, `invalid lastmod "${u.lastmod}"`);
      else if (t > Date.now() + 86400000) err('sitemap-lastmod', u.loc, `lastmod in the future (${u.lastmod})`);
      else if (t < Date.parse('2015-01-01')) warn('sitemap-lastmod', u.loc, `very old lastmod (${u.lastmod})`);
    }
  }
  return urls;
}

/* ---------------------------------------------------------------- page audit */
const pages = new Map(); // site URL -> result
const linkSources = new Map(); // site path -> Set(page)
function addLink(fromUrl, href) {
  if (!href || /^(#|mailto:|tel:|javascript:|data:|sms:|whatsapp:)/i.test(href)) return null;
  let u; try { u = new URL(href, fromUrl); } catch { return null; }
  if (u.origin !== SITE && u.origin !== BASE) return null;
  u.hash = '';
  const local = u.pathname + u.search;
  if (SKIP.test(u.pathname)) return null;
  if (u.search && !/^\?page=\d+$/.test(u.search)) return null; // query variants (currency, filters) are probed separately
  if (!linkSources.has(local)) linkSources.set(local, new Set());
  linkSources.get(local).add(toSite(fromUrl));
  return SITE + local;
}

async function auditPage(siteUrl, expect = 'index') {
  const local = toLocal(siteUrl);
  const r = await get(local);
  const res = { url: siteUrl, status: r.status, expect };
  pages.set(siteUrl, res);
  if (r.status >= 300 && r.status < 400) {
    res.location = r.location;
    if (expect === 'redirect' && r.status !== 301 && r.status !== 308) err('redirect', siteUrl, `expected a permanent redirect, got ${r.status}`);
    else if (expect !== 'redirect' && /^(index|noindex|404|clean)$/.test(expect) && EXTRA.some(([p]) => SITE + p === siteUrl)) err('status', siteUrl, `HTTP ${r.status} → ${r.location}`);
    return res;
  }
  if (expect === 'redirect') { err('redirect', siteUrl, `expected a 301 to the canonical URL, got ${r.status}`); return res; }
  if (expect === '404') { if (r.status !== 404) err('status', siteUrl, `expected 404, got ${r.status}`); }
  else if (r.status !== 200) { err('status', siteUrl, `HTTP ${r.status}${r.error ? ' ' + r.error : ''}`); if (r.status !== 404) return res; }
  if (!/text\/html/.test(r.headers.get('content-type') || '')) { res.nonHtml = true; return res; }
  const o = extract(r.text);
  const robots = [...meta(o, 'robots'), r.headers.get('x-robots-tag') || ''].join(',').toLowerCase();
  res.noindex = /noindex/.test(robots);
  res.title = o.titles[0] || '';
  res.description = meta(o, 'description')[0] || '';
  const canon = o.links.filter((l) => l.rel === 'canonical').map((l) => l.href);
  res.canonical = canon[0] || '';
  res.lang = o.html?.lang || '';
  res.hreflang = o.links.filter((l) => l.rel === 'alternate' && l.hreflang).map((l) => ({ lang: l.hreflang, href: l.href }));
  const clean = siteUrl.split('?')[0];
  const where = siteUrl;
  if (r.status === 404 || expect === '404') { if (!res.noindex) warn('robots', where, '404 page without noindex'); if (o.titles.length !== 1) err('title', where, '404 page has no <title>'); return res; }

  // robots expectations
  if (expect === 'noindex' && !res.noindex) err('robots', where, 'should be noindex (search/account/preview/variant)');
  if (expect === 'noindex' && /^\/(admin|ai\/checkout)(\/|$)/.test(new URL(siteUrl).pathname)) return res; // private tools: robots only
  if (expect === 'index' && res.noindex) res.skipIndexChecks = true; // listed in a sitemap → reported by the sitemap check

  // title
  if (o.titles.length !== 1) err('title', where, `${o.titles.length} <title> elements`);
  const tl = res.title.length;
  if (!tl) err('title', where, 'empty <title>');
  else if (tl > 60) err('title-length', where, `title ${tl} chars (max 60): "${res.title}"`);
  else if (tl < 30) err('title-length', where, `title ${tl} chars (min 30): "${res.title}"`);
  // description
  const ds = meta(o, 'description');
  if (ds.length !== 1) err('description', where, `${ds.length} meta descriptions`);
  const dl = res.description.length;
  if (!dl) err('description', where, 'missing meta description');
  else if (dl > 160) err('description-length', where, `description ${dl} chars (max 160)`);
  else if (dl < 70) err('description-length', where, `description ${dl} chars (min 70): "${res.description}"`);
  // canonical
  if (canon.length !== 1) err('canonical', where, `${canon.length} canonical links`);
  else {
    const c = canon[0];
    if (!/^https:\/\//.test(c)) err('canonical', where, `not absolute https: ${c}`);
    else if (!c.startsWith(SITE + '/')) err('canonical', where, `not on ${SITE}: ${c}`);
    if (/[?#]/.test(c)) err('canonical', where, `canonical has query/fragment: ${c}`);
    if (c !== SITE + '/' && c.endsWith('/')) err('canonical', where, `trailing slash: ${c}`);
    if (!res.noindex && c !== clean && expect !== 'noindex') {
      // pagination: /blog?page=2 canonical to itself is fine
      if (!(siteUrl.includes('?page=') && c === siteUrl)) err('canonical', where, `not self-referencing: ${c} (expected ${clean})`);
    }
  }
  // Open Graph + Twitter
  const one = (k, type = 'og') => { const v = meta(o, k); if (!v.length || !v[0].trim()) err(type, where, `missing ${k}`); else if (v.length > 1 && !/^og:locale:alternate$/.test(k)) err(type, where, `${v.length}× ${k}`); return v[0] || ''; };
  const ogTitle = one('og:title'), ogDesc = one('og:description'), ogUrl = one('og:url'); one('og:type');
  const siteName = one('og:site_name'); const locale = one('og:locale');
  const ogImg = one('og:image'); one('og:image:width'); one('og:image:height'); one('og:image:alt'); one('og:image:type');
  if (siteName && siteName !== 'GlobalHostia') err('og', where, `og:site_name "${siteName}" (expected GlobalHostia)`);
  if (ogUrl && res.canonical && ogUrl !== res.canonical) err('og', where, `og:url ${ogUrl} != canonical ${res.canonical}`);
  if (ogTitle && ogTitle !== res.title) warn('og', where, `og:title differs from <title>`);
  if (ogDesc && ogDesc !== res.description) warn('og', where, `og:description differs from meta description`);
  const isAr = res.lang.startsWith('ar') || locale === 'ar_AE';
  if (locale && locale !== (isAr ? 'ar_AE' : 'en_AE')) err('og', where, `og:locale ${locale} (expected ${isAr ? 'ar_AE' : 'en_AE'})`);
  const altLoc = meta(o, 'og:locale:alternate');
  if (res.hreflang.length && !altLoc.includes(isAr ? 'en_AE' : 'ar_AE')) err('og', where, `og:locale:alternate ${isAr ? 'en_AE' : 'ar_AE'} missing on a page with an ${isAr ? 'English' : 'Arabic'} version`);
  if (ogImg && !/^https:\/\//.test(ogImg)) err('og-image', where, `og:image not absolute https: ${ogImg}`);
  const w = meta(o, 'og:image:width')[0], h = meta(o, 'og:image:height')[0];
  if (w && h && (w !== '1200' || h !== '630')) warn('og-image', where, `og:image declared ${w}x${h}`);
  res.ogImage = ogImg; res.ogDeclared = [w, h];
  if (meta(o, 'twitter:card')[0] !== 'summary_large_image') err('twitter', where, `twitter:card ${meta(o, 'twitter:card')[0] || 'missing'}`);
  for (const k of ['twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) one(k, 'twitter');
  if (meta(o, 'twitter:image')[0] && ogImg && meta(o, 'twitter:image')[0] !== ogImg) warn('twitter', where, 'twitter:image differs from og:image');
  // hreflang
  if (res.hreflang.length) {
    const langs = res.hreflang.map((x) => x.lang);
    for (const need of ['en', 'ar', 'x-default']) if (!langs.includes(need)) err('hreflang', where, `hreflang set without ${need}`);
    if (new Set(langs).size !== langs.length) err('hreflang', where, 'duplicate hreflang values');
    const self = res.hreflang.find((x) => x.lang === (isAr ? 'ar' : 'en'));
    if (self && res.canonical && self.href !== res.canonical) err('hreflang', where, `hreflang ${self.lang} ${self.href} != canonical ${res.canonical}`);
    for (const x of res.hreflang) if (!/^https:\/\//.test(x.href) || /[?#]/.test(x.href)) err('hreflang', where, `hreflang ${x.lang} not a clean absolute URL: ${x.href}`);
  }
  // headings
  const h1 = o.h.filter((x) => x.level === 1);
  if (h1.length !== 1) err('h1', where, `${h1.length} <h1> elements${h1.length ? ': ' + h1.map((x) => `"${x.text}"`).join(', ') : ''}`);
  const main = o.h.filter((x) => !x.hidden);
  for (let i = 1; i < main.length; i++) if (main[i].level > main[i - 1].level + 1) { warn('heading-order', where, `h${main[i - 1].level} → h${main[i].level} ("${main[i].text}")`); break; }
  // images
  const noAlt = o.imgs.filter((i) => i.alt === undefined && !i.hidden && i.role !== 'presentation');
  if (noAlt.length) err('img-alt', where, `${noAlt.length} <img> without alt: ${noAlt.slice(0, 3).map((i) => i.src.slice(0, 60)).join(', ')}`);
  // JSON-LD
  let orgs = 0, hasCrumb = false;
  const types = [];
  for (const raw of o.ld) {
    let j; try { j = JSON.parse(raw); } catch (e) { err('json-ld', where, `invalid JSON-LD: ${e.message.slice(0, 80)}`); continue; }
    const nodes = []; const collect = (x) => { if (Array.isArray(x)) x.forEach(collect); else if (x && typeof x === 'object') { nodes.push(x); if (x['@graph']) collect(x['@graph']); } };
    collect(j);
    for (const n of nodes) {
      const t = [].concat(n['@type'] || []);
      types.push(...t);
      if (t.includes('Organization') && n.name && (n.url || n.logo)) orgs++;
      if (t.includes('BreadcrumbList')) {
        hasCrumb = true;
        const items = n.itemListElement || [];
        if (!items.length) err('json-ld', where, 'empty BreadcrumbList');
        items.forEach((it, i) => { if (it.position !== i + 1) err('json-ld', where, `BreadcrumbList position ${it.position} at index ${i}`); const id = typeof it.item === 'string' ? it.item : it.item?.['@id']; if (i < items.length - 1 && !id) err('json-ld', where, 'BreadcrumbList item without URL'); if (id && !/^https:\/\//.test(id)) err('json-ld', where, `BreadcrumbList item not absolute: ${id}`); });
      }
      if (t.includes('FAQPage') && !(Array.isArray(n.mainEntity) ? n.mainEntity.length : n.mainEntity ? 1 : 0)) err('json-ld', where, 'empty FAQPage');
      if (n.aggregateRating || t.includes('AggregateRating') || t.includes('Review')) warn('json-ld-rating', where, `${t.join('/')} carries rating/review markup: make sure it is real and visible on the page`);
      if (t.includes('Product') && !n.offers) warn('json-ld', where, 'Product without offers');
    }
  }
  if (orgs > 1) err('json-ld', where, `${orgs} Organization nodes (expected 1)`);
  if (!orgs) warn('json-ld', where, 'no Organization JSON-LD');
  const depth = new URL(clean).pathname.split('/').filter(Boolean).length;
  if (depth >= 2 && !hasCrumb && !res.noindex) warn('breadcrumb', where, 'deep page without BreadcrumbList');
  res.ldTypes = [...new Set(types)];
  // internal links
  res.links = [];
  for (const a of o.anchors) { const u = addLink(siteUrl, a); if (u) res.links.push(u); }
  return res;
}

/* ---------------------------------------------------------------- run */
async function pool(items, fn) {
  const q = [...items]; let n = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (q.length) { const x = q.shift(); await fn(x); if (++n % 50 === 0) process.stdout.write(`  ${n}…\n`); } }));
}

(async () => {
  const t0 = Date.now();
  const sm = await sitemap('/sitemap.xml');
  const vsm = await sitemap('/sitemap-video.xml');
  const smSet = new Set(sm.map((u) => u.loc));
  // robots.txt
  const rb = await get(BASE + '/robots.txt');
  if (rb.status !== 200) err('robots.txt', '/robots.txt', `HTTP ${rb.status}`);
  else {
    for (const s of ['/sitemap.xml', '/sitemap-video.xml']) if (!rb.text.includes(`Sitemap: ${SITE}${s}`)) err('robots.txt', '/robots.txt', `no Sitemap: ${SITE}${s}`);
    const dis = [...rb.text.matchAll(/^Disallow:\s*(\S+)/gm)].map((m) => m[1]);
    for (const u of sm) { const p = new URL(u.loc).pathname; const d = dis.find((x) => p === x || p.startsWith(x.endsWith('/') ? x : x + '/') || p === x); if (d) err('robots.txt', u.loc, `sitemap URL disallowed by robots.txt (${d})`); }
  }
  console.log(`sitemap.xml: ${sm.length} URLs · sitemap-video.xml: ${vsm.length} URLs`);

  const queue = new Set(sm.map((u) => u.loc));
  for (const u of vsm) queue.add(u.loc);
  await pool([...queue], (u) => auditPage(u));
  // crawl internal links found on those pages (one more level, then until nothing new or MAX)
  for (let round = 0; round < 4 && pages.size < MAX; round++) {
    const next = new Set();
    for (const p of pages.values()) for (const l of p.links || []) if (!pages.has(l)) next.add(l);
    if (!next.size) break;
    await pool([...next].slice(0, MAX - pages.size), (u) => auditPage(u));
  }
  const extras = new Map();
  await pool(EXTRA, async ([p, exp]) => { const r = await auditPage(SITE + p, exp); extras.set(p, r); if (exp === 'clean' && r.status === 200 && r.canonical !== SITE + (p.split('?')[0] === '/' ? '/' : p.split('?')[0])) {} });
  for (const [p, exp] of EXTRA) { const r = extras.get(p); if (exp === 'clean' && r && r.status === 200 && r.canonical && r.canonical !== (SITE + p.split('?')[0])) err('canonical', SITE + p, `query URL canonical ${r.canonical} (expected ${SITE + p.split('?')[0]})`); }
  // legacy redirects
  for (const [from, to] of LEGACY) {
    const r = await get(BASE + from);
    const loc = r.location ? new URL(r.location, BASE).pathname : '';
    if (r.status !== 301 && r.status !== 308) err('redirect', from, `legacy URL answers ${r.status} (expected 301)`);
    else if (loc !== to) warn('redirect', from, `legacy URL → ${loc} (expected ${to})`);
    else {
      const r2 = await get(BASE + loc);
      if (r2.status !== 200) err('redirect', from, `legacy redirect target ${loc} answers ${r2.status}`);
    }
  }

  // sitemap consistency
  for (const u of sm) {
    const p = pages.get(u.loc);
    if (!p) continue;
    if (p.status !== 200) err('sitemap-url', u.loc, `in sitemap but HTTP ${p.status}${p.location ? ' → ' + p.location : ''}`);
    else if (p.noindex) err('sitemap-url', u.loc, 'in sitemap but noindex');
    else if (p.canonical && p.canonical !== u.loc) err('sitemap-url', u.loc, `in sitemap but canonical is ${p.canonical}`);
    // sitemap hreflang = page hreflang
    if (u.alts.length || p.hreflang?.length) {
      const a = u.alts.map((x) => `${x.lang}=${x.href}`).sort().join(' '), b = (p.hreflang || []).map((x) => `${x.lang}=${x.href}`).sort().join(' ');
      if (a !== b) err('hreflang', u.loc, `sitemap hreflang [${a}] != page hreflang [${b}]`);
    }
  }
  for (const p of pages.values()) {
    if (p.status === 200 && !p.noindex && !p.nonHtml && p.expect === 'index' && !p.url.includes('?') && p.canonical === p.url && !smSet.has(p.url)) err('sitemap-missing', p.url, 'indexable, self-canonical page missing from sitemap.xml');
  }
  // hreflang reciprocity
  for (const p of pages.values()) {
    for (const x of p.hreflang || []) {
      if (x.lang === 'x-default' || x.href === p.canonical) continue;
      let q = pages.get(x.href);
      if (!q) q = await auditPage(x.href);
      if (q.status !== 200) { err('hreflang', p.url, `hreflang ${x.lang} → ${x.href} answers ${q.status}`); continue; }
      if (q.noindex) err('hreflang', p.url, `hreflang ${x.lang} → ${x.href} is noindex`);
      if (!(q.hreflang || []).some((y) => y.href === p.canonical)) err('hreflang', p.url, `hreflang ${x.lang} → ${x.href} does not link back`);
    }
  }
  // duplicates across indexable pages
  const idx = [...pages.values()].filter((p) => p.status === 200 && !p.noindex && !p.nonHtml && p.title && !p.url.includes('?'));
  for (const k of ['title', 'description']) {
    const by = new Map();
    for (const p of idx) { const v = p[k].toLowerCase(); if (!by.has(v)) by.set(v, []); by.get(v).push(p.url); }
    for (const [v, us] of by) if (us.length > 1) for (const u of us) err(`duplicate-${k}`, u, `same ${k} as ${us.filter((x) => x !== u).slice(0, 3).join(', ')}${us.length > 4 ? ` (+${us.length - 4})` : ''}: "${v.slice(0, 70)}"`);
  }
  // internal links to 404 / redirects
  for (const [local, from] of linkSources) {
    const p = pages.get(SITE + local);
    if (!p) continue;
    const src = [...from].slice(0, 3).join(', ') + (from.size > 3 ? ` (+${from.size - 3})` : '');
    if (p.status === 404) err('broken-link', SITE + local, `404, linked from ${src}`);
    else if (p.status >= 300 && p.status < 400) {
      const loc = new URL(p.location, SITE + local);
      // follow one hop for chains
      const r2 = await get(toLocal(loc.origin === BASE ? SITE + loc.pathname + loc.search : loc.href));
      if (r2.status >= 300 && r2.status < 400) err('redirect-chain', SITE + local, `redirect chain ${local} → ${loc.pathname} → ${r2.location}`);
      warn('link-redirect', SITE + local, `internal link redirects (${p.status} → ${loc.pathname}), linked from ${src}`);
    } else if (p.status >= 500 || p.status === 0) err('broken-link', SITE + local, `HTTP ${p.status}, linked from ${src}`);
  }
  // OG images
  const imgs = new Map();
  for (const p of pages.values()) if (p.ogImage) { if (!imgs.has(p.ogImage)) imgs.set(p.ogImage, []); imgs.get(p.ogImage).push(p.url); }
  const samples = [];
  await pool([...imgs.keys()], async (u) => {
    const r = await get(toLocal(u), { binary: true, headers: { accept: 'image/*' } });
    const who = imgs.get(u)[0];
    if (r.status !== 200) { err('og-image', who, `og:image ${u} answers ${r.status}`); return; }
    const ct = r.headers.get('content-type') || '';
    if (!/^image\//.test(ct)) { err('og-image', who, `og:image ${u} content-type ${ct}`); return; }
    const sz = imageSize(r.buf);
    if (!sz) warn('og-image', who, `og:image ${u}: size unreadable (${ct})`);
    else if (sz.w !== 1200 || sz.h !== 630) {
      const decl = pages.get(who)?.ogDeclared || [];
      if (decl[0] === String(sz.w) && decl[1] === String(sz.h) && sz.w >= 1200) warn('og-image', who, `og:image ${sz.w}x${sz.h} (not 1200x630, declared correctly)`);
      else err('og-image', who, `og:image is ${sz.w}x${sz.h} (expected 1200x630): ${u}`);
    }
    if (r.buf.length > 5 * 1024 * 1024) err('og-image', who, `og:image ${Math.round(r.buf.length / 1024)} KB (max 5 MB)`);
    const cc = r.headers.get('cache-control') || '';
    if (new URL(u).pathname === '/og' && !/immutable/.test(cc)) warn('og-cache', who, `/og image cache-control "${cc}" (expected immutable with a version param)`);
    if (new URL(u).pathname === '/og' && !new URL(u).searchParams.get('v')) warn('og-cache', who, `/og image without a version param: ${u}`);
    samples.push({ url: u, bytes: r.buf.length, size: sz, pages: imgs.get(u).length });
  });

  /* ---------------------------------------------------------------- report */
  const errors = findings.filter((f) => f.level === 'error'), warnings = findings.filter((f) => f.level === 'warning');
  const byType = (list) => list.reduce((m, f) => ((m[f.type] = (m[f.type] || 0) + 1), m), {});
  const summary = {
    base: BASE, site: SITE, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
    pages: pages.size, html: [...pages.values()].filter((p) => p.title !== undefined).length,
    indexable: idx.length, sitemap: sm.length, videoSitemap: vsm.length, ogImages: imgs.size,
    statuses: [...pages.values()].reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {}),
    errors: errors.length, warnings: warnings.length, errorsByType: byType(errors), warningsByType: byType(warnings),
  };
  console.log(`\n${summary.pages} URLs (${summary.indexable} indexable) · ${summary.ogImages} OG images · ${summary.seconds}s`);
  console.log('errors:', summary.errors, JSON.stringify(summary.errorsByType));
  console.log('warnings:', summary.warnings, JSON.stringify(summary.warningsByType));
  const show = (list, n) => { for (const f of list.slice(0, n)) console.log(`  [${f.type}] ${f.url.replace(SITE, '')} — ${f.msg}`); if (list.length > n) console.log(`  … ${list.length - n} more`); };
  if (errors.length) { console.log('\nERRORS'); show(errors, VERBOSE ? 1e9 : 80); }
  if (VERBOSE && warnings.length) { console.log('\nWARNINGS'); show(warnings, 1e9); }
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    const pageRows = [...pages.values()].sort((a, b) => a.url.localeCompare(b.url)).map(({ links, ...p }) => p);
    fs.writeFileSync(path.join(OUT, 'seo-audit.json'), JSON.stringify({ summary, findings, pages: pageRows, ogImages: samples }, null, 2));
    const md = [`# SEO audit — ${SITE}`, '', `Run ${summary.at} against ${BASE} (${summary.seconds}s).`, '',
      `| | |`, `|---|---|`, `| URLs checked | ${summary.pages} |`, `| Indexable pages | ${summary.indexable} |`, `| sitemap.xml URLs | ${summary.sitemap} |`, `| sitemap-video.xml URLs | ${summary.videoSitemap} |`, `| Distinct OG images | ${summary.ogImages} |`,
      `| HTTP statuses | ${Object.entries(summary.statuses).map(([k, v]) => `${k}: ${v}`).join(', ')} |`, `| **Errors** | **${summary.errors}** |`, `| Warnings | ${summary.warnings} |`, '',
      '## Errors by type', '', ...(Object.keys(summary.errorsByType).length ? Object.entries(summary.errorsByType).map(([k, v]) => `- ${k}: ${v}`) : ['None.']), '',
      '## Warnings by type', '', ...(Object.keys(summary.warningsByType).length ? Object.entries(summary.warningsByType).map(([k, v]) => `- ${k}: ${v}`) : ['None.']), '',
      ...(errors.length ? ['## Errors', '', ...errors.map((f) => `- **${f.type}** \`${f.url.replace(SITE, '') || '/'}\` — ${f.msg}`), ''] : []),
      '## Warnings', '', ...(warnings.length ? warnings.map((f) => `- ${f.type} \`${f.url.replace(SITE, '') || '/'}\` — ${f.msg}`) : ['None.']), '',
      '## Pages served with noindex', '', 'Intended: sign-in flows, account, search / filter / A-B / theme previews, thin tag pages, plan pages whose categories have no live plans in this data set.', '',
      ...pageRows.filter((p) => p.noindex).map((p) => `- \`${p.url.replace(SITE, '') || '/'}\` (${p.status})`), '',
      '## Pages', '', '| URL | Status | Index | Title (chars) | Description (chars) | JSON-LD |', '|---|---|---|---|---|---|',
      ...pageRows.map((p) => `| ${p.url.replace(SITE, '') || '/'} | ${p.status} | ${p.noindex ? 'noindex' : p.title ? 'index' : ''} | ${(p.title || '').replace(/\|/g, '\\|')} (${(p.title || '').length}) | ${(p.description || '').length} | ${(p.ldTypes || []).join(', ')} |`)];
    fs.writeFileSync(path.join(OUT, 'seo-audit.md'), md.join('\n') + '\n');
    console.log(`\nreport: ${path.join(OUT, 'seo-audit.md')}`);
  }
  process.exit(errors.length ? 1 : 0);
})();
