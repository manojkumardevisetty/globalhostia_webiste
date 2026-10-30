// Converts the legacy static site (legacy/html/*.html) into legacy/seed.json:
// pages -> ordered sections, shared head/header/footer blocks (with variants),
// categories inferred from WHMCS store links. Uses a browser-grade HTML5 parser
// (parse5) and slices the ORIGINAL source by node offsets, so markup is preserved.
// Run: node scripts/import-legacy.mjs
import { parse } from 'parse5';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'legacy/html';
const SKIP = new Set(['index1.html', 'index111111.html', 'web-hosting1.html']);
const ASSET_DIRS = ['css/', 'js/', 'fonts/', 'plugins/', 'image/', 'assets/', 'lang/', "project-logo's/", 'template-part/'];
const slugOf = (f) => (f === 'index.html' ? 'index' : f.replace(/\.html$/, ''));

function rewrite(html) {
  html = html.replace(/\b(href|src|data-src|poster|data-background|data-bg|data-image|action)=(["'])([^"']*)\2/gi, (m, attr, q, url) => {
    let u = url.trim();
    const own = u.match(/^https?:\/\/(www\.)?globalhostia\.com\/(?!secure)([^?#]*)(.*)$/i);
    if (own) u = '/' + own[2] + own[3];
    if (/^(https?:|\/\/|#|mailto:|tel:|javascript:|data:|\{\{)/i.test(u) || u === '') return `${attr}=${q}${u}${q}`;
    if (u.startsWith('./')) u = u.slice(2);
    if (!u.startsWith('/')) u = '/' + u;
    u = u.replace(/^\/index\.html(?=$|[?#])/, '/').replace(/^\/([\w-]+)\.html(?=$|[?#])/, '/$1');
    return `${attr}=${q}${u}${q}`;
  });
  html = html.replace(/url\((["']?)(?!https?:|\/|data:|#)([^)"']+)\1\)/gi, (m, q, u) =>
    ASSET_DIRS.some((d) => u.replace(/^\.\//, '').startsWith(d)) ? `url(${q}/${u.replace(/^\.\//, '')}${q})` : m);
  return html;
}

const isNode = (n) => n.nodeName !== '#text' || n.value.trim() !== '';
const isEl = (n) => !n.nodeName.startsWith('#');
const cls = (n) => (n.attrs || []).find((a) => a.name === 'class')?.value || '';
const attr = (n, k) => (n.attrs || []).find((a) => a.name === k)?.value || '';

function sliceRange(src, nodes) {
  // original source from first node start to last node end
  const locs = nodes.map((n) => n.sourceCodeLocation).filter(Boolean);
  if (!locs.length) return '';
  return src.slice(locs[0].startOffset, locs[locs.length - 1].endOffset);
}
const srcOf = (src, n) => sliceRange(src, [n]);

const blocks = {};
function blockKey(base, html, pageSlug) {
  for (const [k, v] of Object.entries(blocks)) if ((k === base || k.startsWith(base + '-')) && v.html === html) return k;
  const exists = Object.keys(blocks).some((k) => k === base);
  const key = exists ? `${base}-${pageSlug}` : base;
  blocks[key] = { name: exists ? `${base.replace('_', ' ')} – ${pageSlug} variant` : `${base.replace('_', ' ')} (default)`, html };
  return key;
}
const text = (n) => (n.childNodes || []).map((c) => (c.nodeName === '#text' ? c.value : text(c))).join('');
function find(n, pred) {
  if (pred(n)) return n;
  for (const c of n.childNodes || []) { const r = find(c, pred); if (r) return r; }
  return null;
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.html') && !SKIP.has(f));
files.sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));

const pages = [];
let indexHeadSet = null;
const warnings = [];

for (const f of files) {
  const slug = slugOf(f);
  const src = rewrite(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const doc = parse(src, { sourceCodeLocationInfo: true });
  const html = doc.childNodes.find((n) => n.nodeName === 'html');
  const head = html.childNodes.find((n) => n.nodeName === 'head');
  const body = html.childNodes.find((n) => n.nodeName === 'body');

  const ogImg = find(head, (n) => n.nodeName === 'meta' && attr(n, 'property') === 'og:image');
  const titleEl = find(head, (n) => n.nodeName === 'title');
  const title = titleEl ? text(titleEl).trim() : slug;
  const metaOf = (name) => { const m = find(head, (n) => n.nodeName === 'meta' && attr(n, 'name') === name); return m ? attr(m, 'content') : ''; };
  const headHtmls = head.childNodes.filter(isNode)
    .filter((n) => !(n.nodeName === 'title' || (n.nodeName === 'meta' && ['description', 'keywords', 'twitter:title', 'twitter:description', 'twitter:image'].includes(attr(n, 'name')))
      || (n.nodeName === 'meta' && ['og:url', 'og:title', 'og:description', 'og:image'].includes(attr(n, 'property')))
      || (n.nodeName === 'link' && attr(n, 'rel') === 'canonical')))
    .map((n) => srcOf(src, n)).filter(Boolean);
  if (!indexHeadSet) { indexHeadSet = new Set(headHtmls); blocks.head = { name: 'head (shared CSS, meta, analytics)', html: headHtmls.join('\n') }; }
  const headExtra = headHtmls.filter((h) => !indexHeadSet.has(h)).join('\n');

  const kids = body.childNodes.filter(isNode);
  const wi = kids.findIndex((n) => isEl(n) && cls(n).includes('site-wrapper'));
  if (wi < 0) { warnings.push(`${f}: no top-level site-wrapper`); continue; }
  const wrapper = kids[wi];
  const before = kids.slice(0, wi).map((n) => srcOf(src, n)).join('\n');
  const after = kids.slice(wi + 1).map((n) => srcOf(src, n)).join('\n');
  const wk = wrapper.childNodes.filter(isEl);
  let hEnd = wk.findIndex((n) => n.nodeName === 'header');
  if (hEnd < 0) hEnd = wk.findIndex((n) => /header-overline|site-header/.test(cls(n)));
  let fStart = wk.length - 1;
  if (!/footer/.test(cls(wk[fStart] || { attrs: [] }))) fStart = wk.length;
  const headerHtml = hEnd >= 0 ? wk.slice(0, hEnd + 1).map((n) => srcOf(src, n)).join('\n') : '';
  const footerHtml = wk.slice(fStart).map((n) => srcOf(src, n)).join('\n');
  const content = wk.slice(hEnd + 1, fStart);

  const sections = content.map((n, i) => {
    const h = srcOf(src, n);
    const c = cls(n);
    const name = (c.split(/\s+/)[0] || n.nodeName).replace(/-/g, ' ');
    const groups = [...h.matchAll(/\/secure\/store\/([\w-]+)\/[\w-]+/g)].map((m) => m[1]);
    const uniq = [...new Set(groups)];
    const cards = (h.match(/pricing-plan|btn-order/g) || []).length;
    const rows = /<tr[^>]*>[\s\S]*?\/secure\/store\//.test(h);
    if (slug !== 'index' && groups.length >= 2 && uniq.length <= 4 && (cards >= 2 || rows)) {
      const hd = find(n, (x) => x.nodeName === 'h2' || x.nodeName === 'h3');
      return { type: 'products', name: `Products: ${uniq.join(', ')}`, sortOrder: i,
        data: { categories: uniq, template: rows ? 'server-row' : 'plan-card', layout: 'auto',
          title: hd ? text(hd).trim().replace(/\s+/g, ' ') : '', subtitle: '', wrapperClass: c, fallbackHtml: h } };
    }
    return { type: 'html', name, sortOrder: i, html: h };
  });

  pages.push({
    slug, title, seoTitle: title, ogImage: ogImg ? attr(ogImg, 'content') : '', seoDescription: metaOf('description'), seoKeywords: metaOf('keywords'),
    bodyClass: attr(body, 'class').trim(), wrapperClass: cls(wrapper), headExtra,
    blocks: {
      bodyStart: blockKey('body_start', before, slug),
      header: blockKey('header', headerHtml, slug),
      footer: blockKey('footer', footerHtml, slug),
      bodyEnd: blockKey('body_end', after, slug),
    },
    sections,
  });
}

const NAMES = {
  'hostia-shared': 'Shared Hosting', 'hosting-usa': 'Shared Hosting – USA', 'hosting-singapore': 'Shared Hosting – Singapore',
  hostiavps: 'VPS Hosting', 'dedicated-servers': 'Dedicated Servers', 'premiumdedicated-servers': 'Premium Dedicated Servers',
  'ssl-certificates': 'SSL Certificates', mcps: 'n8n Automation', 'ai-llm': 'AI / LLM Servers', 'forex-vps': 'Forex VPS',
  'project-management': 'Project Management Workspaces',
};
const all = fs.readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const groups = [...new Set([...all.matchAll(/\/secure\/store\/([\w-]+)/g)].map((m) => m[1]))];
const categories = groups.map((g, i) => ({ slug: g, name: NAMES[g] || g.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), sortOrder: i }));

const redirects = [
  { from: '/index.html', to: '/' }, { from: '/index1.html', to: '/' }, { from: '/index111111.html', to: '/' },
  { from: '/web-hosting1.html', to: '/web-hosting' },
  ...pages.filter((p) => p.slug !== 'index').map((p) => ({ from: `/${p.slug}.html`, to: `/${p.slug}` })),
];

fs.writeFileSync('legacy/seed.json', JSON.stringify({ blocks, pages, categories, redirects }));
const dyn = pages.flatMap((p) => p.sections.filter((s) => s.type === 'products').map((s) => `${p.slug}:${s.data.category}`));
console.log(`pages=${pages.length} sections=${pages.reduce((a, p) => a + p.sections.length, 0)} blocks=${Object.keys(blocks).length} categories=${categories.length} dynamicProductSections=${dyn.length}`);
console.log('blocks:', Object.keys(blocks).join(', '));
console.log('dynamic:', dyn.join(', '));
if (warnings.length) console.log('WARN', warnings);
