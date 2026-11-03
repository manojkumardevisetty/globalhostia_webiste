// Unit checks for the Business services shop rules (lib/store/config.ts): config parsing, WHMCS product group mapping,
// bundle totals (real prices only, no invented savings) and the quote form. Run:
//   node --test --experimental-strip-types tests/store.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStoreConfig, normGroup, groupSlugFromUrl, matchEntry, mapEntries, firstYear, bundleTotal, checkQuote, faqFromText, faqToText, storeSlugs, ITEM_REF,
  type BundlePart,
} from '../lib/store/config.ts';
import { storeConfigSeed, STORE_ENTRIES, STORE_SECTIONS } from '../scripts/store-seed.mjs';

const seed = parseStoreConfig(storeConfigSeed());

test('seed: valid, unpublished, every entry in a seeded section, no prices in the copy', () => {
  assert.equal(seed.published, false);
  assert.equal(seed.entries.length, STORE_ENTRIES.length);
  assert.equal(seed.sections.length, STORE_SECTIONS.length);
  const secs = new Set(seed.sections.map((s) => s.slug));
  for (const e of seed.entries) assert.ok(secs.has(e.section), `${e.slug} → ${e.section}`);
  const text = JSON.stringify(storeConfigSeed()) + JSON.stringify(STORE_ENTRIES) + JSON.stringify(STORE_SECTIONS);
  assert.doesNotMatch(text, /(\$|AED|USD|€)\s?\d/, 'no prices in seeded copy');
  for (const s of [...STORE_SECTIONS, ...STORE_ENTRIES]) if (s.seoDescription) assert.ok(s.seoDescription.length <= 165, `${s.slug} meta ${s.seoDescription.length}`);
  for (const b of seed.bundles) for (const i of b.items) assert.match(i, ITEM_REF);
  assert.ok(storeSlugs(seed).has('security-services') && storeSlugs(seed).has('website-backup'));
});

test('parse: never throws, drops invalid rows and duplicates', () => {
  assert.equal(parseStoreConfig(undefined).published, false);
  assert.equal(parseStoreConfig('{not json').entries.length, 0);
  const c = parseStoreConfig({ published: true, entries: [{ slug: 'Bad Slug' }, { slug: 'ok', kind: 'nope', icon: '<x>' }, { slug: 'ok' }],
    bundles: [{ slug: 'b', name: 'B', items: ['p:a'] }, { slug: 'c', name: 'C', items: ['p:a', 'javascript:x', 'tld:.ae'] }], salesDepartmentId: 'abc' });
  assert.equal(c.published, true);
  assert.deepEqual(c.entries.map((e) => [e.slug, e.kind, e.icon]), [['ok', 'whmcs', 'box']]);
  assert.deepEqual(c.bundles.map((b) => [b.slug, b.items]), [['c', ['p:a', 'tld:.ae']]]); // one-item bundle dropped
  assert.equal(c.salesDepartmentId, '');
});

test('mapping: WHMCS group names and store slugs match case-insensitively', () => {
  assert.equal(normGroup('SSL Certificates'), normGroup('ssl-certificates'));
  assert.equal(normGroup('E-mail Services'), normGroup('email_services'));
  assert.equal(groupSlugFromUrl('https://my.example.com/store/sitelock/sitelock-find'), 'sitelock');
  assert.equal(groupSlugFromUrl(''), '');
  assert.equal(matchEntry(seed, { slug: 'sitelock' })?.slug, 'website-security');
  assert.equal(matchEntry(seed, { name: 'CODEGUARD' })?.slug, 'website-backup');
  assert.equal(matchEntry(seed, { slug: 'email-services' })?.slug, 'spam-filtering'); // MarketConnect SpamExperts group
  assert.equal(matchEntry(seed, { name: 'Professional Email' })?.slug, 'professional-email');
  assert.equal(matchEntry(seed, { slug: 'ssl-certificates' })?.slug, 'ssl-certificates');
  assert.equal(matchEntry(seed, { slug: 'website-backup' })?.slug, 'website-backup'); // entry slug itself
  assert.equal(matchEntry(seed, { slug: 'hostia-shared' }), null);
  assert.equal(matchEntry(seed, {}), null);
});

test('mapping status: a saved gid wins, else the first matching synced group, else unmapped', () => {
  const groups = [{ gid: 5, slug: 'ssl-certificates', products: 3, priced: 3 }, { gid: 9, slug: 'sitelock', products: 4, priced: 0 }, { gid: 12, slug: 'codeguard', products: 2, priced: 2 }];
  const cats = [{ slug: 'ssl-certificates', whmcsGroupId: 5 }, { slug: 'website-security', whmcsGroupId: null }, { slug: 'website-backup', whmcsGroupId: 44 }];
  const m = Object.fromEntries(mapEntries(seed, cats, groups).map((x) => [x.slug, x]));
  assert.deepEqual([m['ssl-certificates'].matchedBy, m['ssl-certificates'].gid, m['ssl-certificates'].priced], ['gid', 5, 3]);
  assert.deepEqual([m['website-security'].matchedBy, m['website-security'].gid, m['website-security'].group], ['name', 9, 'sitelock']);
  assert.deepEqual([m['website-backup'].matchedBy, m['website-backup'].gid, m['website-backup'].products], ['gid', 44, 0]); // admin remap kept
  assert.equal(m['microsoft-365'].matchedBy, null);
  assert.equal(m['microsoft-365'].gid, null);
});

const rows = (cur: string, o: Record<string, [number, number?]>) => Object.entries(o).map(([cycle, [price, setupFee = 0]]) => ({ currency: cur, cycle, price, setupFee }));

test('firstYear: yearly price, else 12 × monthly, plus setup; ignores -1/0 and other currencies', () => {
  assert.deepEqual(firstYear(rows('USD', { monthly: [2.99], annually: [29.99] }), 'USD'), { amount: 29.99, basis: 'per year', cycle: 'annually' });
  assert.deepEqual(firstYear(rows('USD', { monthly: [5, 10] }), 'USD'), { amount: 70, basis: '12 × monthly', cycle: 'monthly' });
  assert.equal(firstYear(rows('USD', { annually: [-1], monthly: [0] }), 'USD'), null);
  assert.equal(firstYear(rows('AED', { annually: [100] }), 'USD'), null);
  assert.deepEqual(firstYear(rows('USD', { onetime: [499] }), 'USD'), { amount: 499, basis: 'one-time', cycle: 'onetime' });
});

test('bundle total: sum of real component prices; incomplete → no total; savings only from a WHMCS discount', () => {
  const host: BundlePart = { ref: 'cat:hostia-shared', name: 'Hostia Lite', pid: 1, href: 'x', prices: rows('USD', { annually: [29.99] }) };
  const mail: BundlePart = { ref: 'cat:professional-email', name: 'Mail Basic', pid: 2, prices: rows('USD', { monthly: [1.5] }) };
  const ae: BundlePart = { ref: 'tld:.ae', name: '.ae domain registration', domain: '.ae', register: 35.5, currency: 'USD' };
  const refs = ['tld:.ae', 'cat:hostia-shared', 'cat:professional-email'];
  const t = bundleTotal([ae, host, mail], refs, 'USD');
  assert.equal(t.complete, true);
  assert.equal(t.total, 83.49); // 35.50 + 29.99 + 12 × 1.50
  assert.equal(t.savings, null, 'never invents a saving');
  assert.deepEqual(t.lines.map((l) => l.basis), ['first year', 'per year', '12 × monthly']);
  assert.equal(bundleTotal([ae, host, mail], refs, 'USD', 10).savings, 10); // WHMCS-reported discount only
  assert.equal(bundleTotal([ae, host, mail], refs, 'USD', 500).savings, null); // nonsense discount ignored
  const missing = bundleTotal([ae, host, null], refs, 'USD');
  assert.equal(missing.complete, false); assert.equal(missing.total, null); assert.deepEqual(missing.missing, ['cat:professional-email']);
  const unpriced = bundleTotal([{ ...ae, register: null }, host], ['tld:.ae', 'cat:hostia-shared'], 'USD');
  assert.equal(unpriced.total, null); assert.deepEqual(unpriced.missing, ['tld:.ae']);
  assert.equal(bundleTotal([ae, host], ['tld:.ae', 'cat:hostia-shared'], 'AED').total, null); // other currency: no conversion
  assert.equal(bundleTotal([host], ['cat:hostia-shared'], 'USD').complete, false); // a bundle needs two items
});

test('quote form: required fields, options and selects are whitelisted', () => {
  const entry = seed.entries.find((e) => e.slug === 'website-design')!;
  const ok = checkQuote({ service: 'website-design', option: 'Online shop', name: 'Sara', email: 'SARA@Example.ae', budget: 'Over 10,000 AED', timeline: 'nope', q0: 'About 40 products' }, entry);
  assert.deepEqual(ok.fields, {});
  assert.equal(ok.input.email, 'sara@example.ae'); assert.equal(ok.input.option, 'Online shop'); assert.equal(ok.input.timeline, '');
  assert.equal(ok.input.answers[0], 'About 40 products');
  const bad = checkQuote({ name: 'S', email: 'x@', website: 'not a site', phone: 'abc', option: 'Free stuff' }, entry);
  assert.deepEqual(Object.keys(bad.fields).sort(), ['email', 'name', 'notes', 'phone', 'website']);
  assert.equal(bad.input.option, '');
  assert.ok(checkQuote({ name: 'Sam', email: 'sam@x.com', notes: 'Need a site' }, null).fields.service);
});

test('FAQ text round trip', () => {
  const f = [{ q: 'One?', a: 'Yes.' }, { q: 'Two lines?', a: 'First\nsecond.' }];
  assert.deepEqual(faqFromText(faqToText(f)), [{ q: 'One?', a: 'Yes.' }, { q: 'Two lines?', a: 'First second.' }]);
  assert.deepEqual(faqFromText('Q: no answer\n\nA: no question'), []);
});
