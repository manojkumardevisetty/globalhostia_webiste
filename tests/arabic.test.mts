// Arabic section (/ar): page copy limits and keywords, no typed prices, EN ↔ AR pairs, the chrome translator,
// the language switcher / hreflang on English pages, the sitemap pairs and the content engine's Arabic mix.
// Run: node --test --experimental-strip-types tests/arabic.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// lib/i18n/* imports './ar-pages' without an extension (Next resolves it); let Node do the same here
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) { try { return await n(s + '.ts', c); } catch {} } return n(s, c); }"));
const P = await import('../lib/i18n/ar-pages.ts');
const C = await import('../lib/i18n/ar-chrome.ts');
const { wantArabicNext, normalizeContent, DEFAULT_CONTENT } = await import('../lib/content/core.ts');

const ARABIC = /[؀-ۿ]/;

test('every Arabic page has a unique slug, a unique English pair and Arabic copy within SEO limits', () => {
  const slugs = new Set<string>(), ens = new Set<string>();
  for (const d of P.AR_DEFS) {
    assert.ok(!slugs.has(d.slug), `duplicate slug ${d.slug}`); slugs.add(d.slug);
    assert.ok(!ens.has(d.en), `two Arabic pages for ${d.en}`); ens.add(d.en);
    const c = d.copy;
    assert.ok(c.seoTitle.length <= 60, `${d.slug || 'home'}: seoTitle ${c.seoTitle.length} > 60`);
    assert.ok(c.meta.length >= 110 && c.meta.length <= 160, `${d.slug || 'home'}: meta ${c.meta.length} not in 110–160`);
    for (const k of ['title', 'seoTitle', 'meta', 'lead', 'crumb', 'pointsTitle', 'faqTitle', 'ctaTitle', 'ctaText'] as const) assert.ok(ARABIC.test(c[k]), `${d.slug}: ${k} is not Arabic`);
    assert.ok(c.faqs.length >= 2 && c.points.length >= 2, `${d.slug}: needs FAQs and points`);
    // the main keyword appears in the title, H1, meta or intro
    const text = [c.title, c.seoTitle, c.meta, c.lead].join(' ');
    assert.ok(c.keywords.some((k) => text.includes(k)), `${d.slug}: no target keyword in title/meta/intro (${c.keywords.join(', ')})`);
  }
  assert.ok(P.AR_DEFS.length >= 14);
});

test('brand stays in Latin script and no price is typed into the copy', () => {
  for (const d of P.AR_DEFS) {
    const all = JSON.stringify(d.copy);
    assert.ok(!/جلوبال ?هوستيا|غلوبال/.test(all), `${d.slug}: brand transliterated`);
    assert.ok(!/(AED|SAR|USD|\$|درهم|ريال)\s*\d|\d+[.,]\d{2}\s*(AED|SAR|USD|درهم|ريال)/.test(all), `${d.slug}: price typed in copy`);
  }
});

test('GCC keywords are targeted', () => {
  const kws = P.AR_DEFS.flatMap((d) => d.copy.keywords).join(' | ');
  for (const k of ['استضافة مواقع الإمارات', 'استضافة دبي', 'نطاق .ae', 'بريد إلكتروني للشركات', 'خادم افتراضي خاص']) assert.ok(kws.includes(k), `missing keyword ${k}`);
});

test('owner overrides merge over the defaults; bad fields are ignored', () => {
  const d = P.AR_DEFS.find((x) => x.slug === 'web-hosting')!;
  const m = P.arPage(d, { 'web-hosting': { title: '  عنوان جديد  ', faqs: [{ q: 'سؤال', a: 'جواب' }, { q: '', a: 'x' }], points: 'nope', enabled: false } });
  assert.equal(m.copy.title, 'عنوان جديد');
  assert.deepEqual(m.copy.faqs, [{ q: 'سؤال', a: 'جواب' }]);
  assert.deepEqual(m.copy.points, d.copy.points);
  assert.equal(m.copy.enabled, false);
  assert.equal(P.enabledArDefs({ 'web-hosting': { enabled: false } }).some((x) => x.slug === 'web-hosting'), false);
  assert.equal(P.arPage(P.AR_DEFS[0], { home: { meta: 'x' } }).copy.meta, 'x'); // home page key is 'home'
});

test('path helpers map both ways', () => {
  assert.equal(P.arPathOf(P.arDefForEn('/')!), '/ar');
  assert.equal(P.arPathOf(P.arDefForEn('/web-hosting/')!), '/ar/web-hosting');
  assert.equal(P.arDefForThemeSlug('ar')!.en, '/');
  assert.equal(P.arDefForThemeSlug('ar/ae-domains')!.en, '/ae-domains');
  assert.equal(P.arDefForThemeSlug('web-hosting'), null);
  const h = P.hreflangLinks('https://x.test', P.arDefForEn('/contact')!);
  assert.match(h, /hreflang="en" href="https:\/\/x\.test\/contact"/);
  assert.match(h, /hreflang="ar" href="https:\/\/x\.test\/ar\/contact"/);
  assert.match(h, /hreflang="x-default" href="https:\/\/x\.test\/contact"/);
});

test('chrome translator: phrases, patterns, unknown text untouched', () => {
  assert.equal(C.trAr('Order now'), 'اطلب الآن');
  assert.equal(C.trAr('  Client login '), '  دخول العملاء ');
  assert.equal(C.trAr('Renews at AED 120.00 / year · +VAT 5% where applicable'), 'يُجدَّد بسعر AED 120.00 / سنة · + ضريبة القيمة المضافة 5% حيثما تنطبق');
  assert.equal(C.trAr('Billed yearly, about $2.50 a month, save 17%'), 'يُدفع سنوياً، حوالي $2.50 شهرياً، وفّر 17%');
  assert.equal(C.trAr('Prices shown live from our billing system, in SAR.'), 'الأسعار معروضة مباشرة من نظام الفوترة، بعملة SAR.');
  assert.equal(C.trAr('$2.99 / month'), '$2.99 / شهر');
  assert.equal(C.trAr('Hostia Ultra'), 'Hostia Ultra');
  assert.equal(C.arLocation('Malaysia'), 'ماليزيا');
});

test('arabizeHtml: lang/dir, text and attributes, links to Arabic pages, scripts and code untouched, switcher back to English', () => {
  const html = `<!DOCTYPE html><html lang="en"><head><meta property="og:locale" content="en_AE"><script type="application/ld+json">{"name":"Order now"}</script></head><body>
<div class="hp-util"><span class="hp-u-item hp-u-lang"><svg class="hp-ico"><use href="#i-globe"/></svg>Language <b>English</b></span></div>
<a href="/web-hosting#plans">Web Hosting</a><a href="/blog">Blog</a><a class="hp-btn" href="https://my.test/cart.php?a=add" aria-label="Order now: Hostia Ultra">Order now</a>
<input placeholder="Type the name you want, for example yourbrand" data-typing="a.com"><code>Order now</code>
<footer><p class="hp-legal">© 2026 GlobalHostia<br>x</p></footer><div class="hp-drawer__contact"></div></body></html>`;
  const links = new Map([['/web-hosting', '/ar/web-hosting']]);
  const out = C.arabizeHtml(html, { links, enPath: '/web-hosting' });
  assert.match(out, /<html lang="ar" dir="rtl">/);
  assert.match(out, /og:locale" content="ar_AE"/);
  assert.match(out, /href="\/ar\/web-hosting#plans">استضافة المواقع</);
  assert.match(out, /href="\/blog">المدونة</); // no Arabic blog index: link kept, label translated
  assert.match(out, /aria-label="اطلب الآن: Hostia Ultra">اطلب الآن</);
  assert.match(out, /\{"name":"Order now"\}/); // JSON-LD untouched
  assert.match(out, /<code>Order now<\/code>/);
  assert.match(out, /placeholder="اكتب الاسم الذي تريده، مثلاً yourbrand"/);
  assert.match(out, /data-typing-prefix="جرّب: "/);
  // the switcher points to the English page (not rewritten to the Arabic one)
  assert.match(out, /<a class="hp-u-item hp-u-lang" href="\/web-hosting" hreflang="en" lang="en"/);
  assert.match(out, /hp-legal__lang" href="\/web-hosting"/);
  assert.match(out, /hp-drawer__lang/);
});

test('English pages: switcher to the Arabic twin, hreflang only on self-canonical indexable pages', () => {
  const page = (path: string, extra = '') => `<html lang="en"><head><link rel="canonical" href="https://g.test${path}">${extra}</head><body><span class="hp-u-item hp-u-lang"><svg></svg>Language <b>English</b></span></body></html>`;
  const a = C.withArabicSwitch(page('/ae-domains'), { path: '/ae-domains', site: 'https://g.test', overrides: null });
  assert.match(a, /hreflang="ar" href="https:\/\/g\.test\/ar\/ae-domains"/);
  assert.match(a, /<a class="hp-u-item hp-u-lang" href="\/ar\/ae-domains" hreflang="ar"/);
  const noidx = C.withArabicSwitch(page('/ae-domains', '<meta name="robots" content="noindex,follow">'), { path: '/ae-domains', site: 'https://g.test', overrides: null });
  assert.doesNotMatch(noidx, /hreflang="ar" href=/);
  const other = C.withArabicSwitch(page('/plan-finder'), { path: '/plan-finder', site: 'https://g.test', overrides: null });
  assert.doesNotMatch(other, /rel="alternate"/);
  assert.match(other, /href="\/ar" hreflang="ar"/); // no twin: switcher to the Arabic home
  const off = C.withArabicSwitch(page('/ae-domains'), { path: '/ae-domains', site: 'https://g.test', overrides: { 'ae-domains': { enabled: false } } });
  assert.doesNotMatch(off, /\/ar\/ae-domains/);
  // an Arabic page is left alone
  assert.equal(C.withArabicSwitch('<html lang="ar" dir="rtl">x', { path: '/ar', site: 'https://g.test', overrides: null }), '<html lang="ar" dir="rtl">x');
});

test('content engine: Arabic mix gives 1 in 5 by default and respects 0 / 1', () => {
  assert.equal(DEFAULT_CONTENT.arabicShare, 0.2);
  assert.equal(normalizeContent({ arabicShare: 3 }).arabicShare, 1);
  assert.equal(normalizeContent({}).arabicShare, 0.2);
  const recent: boolean[] = [];
  let ar = 0;
  for (let i = 0; i < 50; i++) { const w = wantArabicNext(recent, 0.2); recent.unshift(w); if (w) ar++; }
  assert.equal(ar, 10);
  assert.equal(wantArabicNext([], 0), false);
  assert.equal(wantArabicNext([true, true], 1), true);
});
