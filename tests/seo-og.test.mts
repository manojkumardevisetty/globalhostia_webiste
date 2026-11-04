// Social sharing and head metadata helpers (lib/seo.ts) and the Arabic shaper of the OG image (lib/og/arabic-shape.ts).
// The full crawl of every page is tests/seo-audit.cjs. Run: node --test --experimental-strip-types tests/seo-og.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// lib/seo.ts imports './render/util' without an extension (Next resolves it); let Node do the same here
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) { try { return await n(s + '.ts', c); } catch {} } return n(s, c); }"));
const S = await import('../lib/seo.ts');
const A = await import('../lib/og/arabic-shape.ts');

const SITE = 'https://globalhostia.com';

test('ogImageUrl: absolute, versioned by content, kicker / price / lang carried', () => {
  const a = S.ogImageUrl(SITE, 'Hostia Ultra', { kicker: 'Web hosting', price: '$5.99/mo' });
  const u = new URL(a);
  assert.equal(u.origin + u.pathname, `${SITE}/og`);
  assert.equal(u.searchParams.get('title'), 'Hostia Ultra');
  assert.equal(u.searchParams.get('kicker'), 'Web hosting');
  assert.equal(u.searchParams.get('price'), '$5.99/mo');
  assert.match(u.searchParams.get('v') || '', /^[0-9a-z]+$/);
  // same content → same URL (cacheable as immutable); any change → a new URL
  assert.equal(S.ogImageUrl(SITE, 'Hostia Ultra', { kicker: 'Web hosting', price: '$5.99/mo' }), a);
  assert.notEqual(S.ogImageUrl(SITE, 'Hostia Ultra', { kicker: 'Web hosting', price: '$6.99/mo' }), a);
  assert.equal(new URL(S.ogImageUrl(SITE, 'استضافة', { lang: 'ar' })).searchParams.get('lang'), 'ar');
  // older call sites pass the kicker as a string
  assert.equal(new URL(S.ogImageUrl(SITE, 'Contact', 'Contact')).searchParams.get('kicker'), 'Contact');
  // control characters and tags never reach the image
  assert.equal(new URL(S.ogImageUrl(SITE, 'A <b>\u0007bold</b>  title')).searchParams.get('title'), 'A bbold/b title');
});

test('socialMeta: every Open Graph and Twitter tag, locales, escaped values', () => {
  const html = S.socialMeta({ url: `${SITE}/web-hosting`, title: 'Web Hosting "NVMe" | GlobalHostia', description: 'Fast & safe.', image: `${SITE}/og?title=x&v=1`, imageAlt: 'Web Hosting | GlobalHostia', alternate: true });
  for (const p of ['og:type', 'og:site_name', 'og:locale', 'og:locale:alternate', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:secure_url', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt']) {
    assert.ok(html.includes(`property="${p}"`), p);
  }
  for (const n of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) assert.ok(html.includes(`name="${n}"`), n);
  assert.ok(html.includes('<meta property="og:site_name" content="GlobalHostia">'));
  assert.ok(html.includes('<meta property="og:locale" content="en_AE"><meta property="og:locale:alternate" content="ar_AE">'));
  assert.ok(html.includes('content="summary_large_image"'));
  assert.ok(html.includes('<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'));
  assert.ok(html.includes('&quot;NVMe&quot;') && html.includes('Fast &amp; safe.') && html.includes('title=x&amp;v=1'));
  const ar = S.socialMeta({ url: `${SITE}/ar`, title: 't', description: 'd', image: `${SITE}/og`, imageAlt: 'a', lang: 'ar', alternate: true });
  assert.ok(ar.includes('<meta property="og:locale" content="ar_AE"><meta property="og:locale:alternate" content="en_AE">'));
  // a custom image of unknown size declares no size; a JPEG is typed as one
  const custom = S.socialMeta({ url: `${SITE}/blog/x`, title: 't', description: 'd', image: `${SITE}/img/cover.jpg`, imageAlt: 'a', imageWidth: 0, imageHeight: 0, type: 'article' });
  assert.ok(!custom.includes('og:image:width') && custom.includes('content="image/jpeg"') && custom.includes('content="article"'));
  assert.ok(!custom.includes('og:locale:alternate'));
});

test('noindex query parameters: A/B previews, internal variant keys, previews', () => {
  for (const q of ['ab=hero.b', '_ab=hero.b', '_abd=1', 'theme=hostpen', 'preview=1']) assert.equal(S.isNoindexQuery(new URLSearchParams(q)), true, q);
  for (const q of ['', 'utm_source=x', 'gclid=1', 'page=2', 'currency=AED']) assert.equal(S.isNoindexQuery(new URLSearchParams(q)), false, q);
});

test('descriptionFor: always 70-160 characters', () => {
  for (const [t, x] of [['Test Email Hosting', ''], ['A', 'Short.'], ['Hostia Ultra', 'x'.repeat(400)], ['Hostia Lite', 'Shared hosting with 2 GB NVMe, 10 email accounts and free SSL, hosted in Dubai.']]) {
    const d = S.descriptionFor(t, x);
    assert.ok(d.length >= 70 && d.length <= 160, `${d.length}: ${d}`);
  }
});

test('sectionKicker: explicit label, path sections, route kinds', () => {
  assert.equal(S.sectionKicker('vps', '/vps-hosting'), 'VPS hosting');
  assert.equal(S.sectionKicker('content', '/help/pay-an-invoice'), 'Help centre');
  assert.equal(S.sectionKicker('vs', '/compare/globalhostia-vs-x'), 'Compare');
  assert.equal(S.sectionKicker('product', '/p/x', 'Dedicated Servers'), 'Dedicated Servers');
  assert.equal(S.sectionKicker('content', '/about'), '');
});

test('cleanJsonLd: drops invalid blocks, empty FAQPage and a second Organization', () => {
  const graph = '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"x#organization","name":"GlobalHostia","url":"https://globalhostia.com/"}]}</script>';
  const html = [
    '<script type="application/ld+json">{ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [] }</script>',
    '<script type="application/ld+json">{ not json</script>',
    '<script type="application/ld+json">{"@type":"Organization","name":"Template","url":"https://example.com"}</script>',
    graph,
    '<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q","acceptedAnswer":{"@type":"Answer","text":"A"}}]}</script>',
  ].join('\n');
  const out = S.cleanJsonLd(html);
  assert.ok(out.includes(graph));
  assert.ok(out.includes('"name":"Q"'));
  assert.ok(!out.includes('"mainEntity": []') && !out.includes('not json') && !out.includes('Template'));
  // without the site graph a page's own Organization stays
  assert.ok(S.cleanJsonLd('<script type="application/ld+json">{"@type":"Organization","name":"X","url":"u"}</script>').includes('"X"'));
});

test('shapeArabic: contextual forms and lam-alef', () => {
  // ب ا ب: beh initial, alef final (no link after alef), beh isolated
  assert.deepEqual([...A.shapeArabic('باب')].map((c) => c.codePointAt(0)!.toString(16)), ['fe91', 'fe8e', 'fe8f']);
  // دبي: dal isolated (right-joining), beh initial, yeh final
  assert.deepEqual([...A.shapeArabic('دبي')].map((c) => c.codePointAt(0)!.toString(16)), ['fea9', 'fe91', 'fef2']);
  // لا → one ligature; سلام: seen initial, lam-alef final ligature, meem isolated
  assert.equal(A.shapeArabic('لا'), 'ﻻ');
  assert.deepEqual([...A.shapeArabic('سلام')].map((c) => c.codePointAt(0)!.toString(16)), ['feb3', 'fefc', 'fee1']);
  // Latin, digits and spaces pass through
  assert.equal(A.shapeArabic('VPS 24/7'), 'VPS 24/7');
});

test('visualArabicWord: letters in drawing order, digit runs kept left to right', () => {
  assert.equal(A.visualArabicWord('دبي'), 'ﻲﺑﺩ');
  // "5" stays one run and the Arabic letters around it are reversed
  const v = [...A.visualArabicWord('ب5ب')].map((c) => c.codePointAt(0)!.toString(16));
  assert.deepEqual(v, ['fe8f', '35', 'fe8f']);
});
