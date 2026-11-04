// Portal i18n: every English key used in the portal has an Arabic entry, placeholders and markup survive translation,
// and locale-aware formatting. Run: node --test --experimental-strip-types tests/portal-i18n.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AR, CLIENT_KEYS, DYNAMIC_KEYS, t, tn, withLocale, intlTag, moneyTag, clientStrings } from '../lib/portal/i18n.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCES = [
  ...fs.readdirSync(path.join(ROOT, 'lib/portal/views')).map((f) => `lib/portal/views/${f}`),
  'lib/portal/push.ts', 'lib/portal/palette.ts', 'lib/portal/sell-handler.ts', 'app/account/[[...slug]]/route.ts', 'app/account/unsubscribe/route.ts',
  'app/account/apps/route.ts', 'app/oauth/authorize/route.ts', 'lib/connector/consent-view.ts',
];
const LIT = `'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)"`;
const unq = (s: string) => s.replace(/\\(['"\\])/g, '$1');

/** Every t('…') key and every tn(n, '…', '…') plural key in the portal sources. */
function sourceKeys() {
  const keys = new Map<string, string>();
  const t1 = new RegExp(`\\bt\\(\\s*(?:${LIT})`, 'g');
  const t2 = new RegExp(`\\btn\\([^,()]*(?:\\([^()]*\\))?[^,()]*,\\s*(?:${LIT})\\s*,\\s*(?:${LIT})`, 'g');
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(t1)) keys.set(unq(m[1] ?? m[2]), f);
    for (const m of src.matchAll(t2)) keys.set(unq(m[3] ?? m[4]), f);
  }
  return keys;
}

test('the scanner finds the portal strings', () => {
  const k = sourceKeys();
  assert.ok(k.size > 500, `only ${k.size} keys found`);
  for (const s of ['Dashboard', 'Team access', 'Use GlobalHostia nameservers', '{n} days overdue', 'Invoice #{n}']) assert.ok(k.has(s), s);
});

test('every English key has an Arabic translation', () => {
  const missing = [...sourceKeys()].filter(([k]) => !(k in AR)).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(missing, []);
  const dyn = [...DYNAMIC_KEYS, ...CLIENT_KEYS].filter((k) => !(k in AR));
  assert.deepEqual(dyn, []);
});

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?([a-z]+)\b/g)].map((m) => m[1]).sort();
test('placeholders and markup are kept in every translation', () => {
  for (const [k, v] of Object.entries(AR)) {
    const forms = typeof v === 'string' ? [v] : Object.values(v);
    for (const f of forms) {
      assert.ok(f && f.trim(), `empty translation: ${k}`);
      // plural forms may spell out one/two without {n}; every other variable must survive
      const want = vars(k).filter((x) => typeof v === 'string' || x !== 'n');
      for (const x of want) assert.ok(vars(f).includes(x), `{${x}} lost in: ${k}`);
      assert.deepEqual(tags(f), tags(k), `markup differs in: ${k}`);
    }
    if (typeof v !== 'string') assert.ok(v.other, `plural without "other": ${k}`);
  }
});

test('translations are Arabic (brand, product and protocol names stay Latin)', () => {
  const latinOk = new Set(['—', 'GlobalHostia', 'SSL', 'DNS']);
  for (const [k, v] of Object.entries(AR)) {
    const s = typeof v === 'string' ? v : v.other;
    if (latinOk.has(s)) continue;
    assert.match(s, /[\u0600-\u06FF]/, `not Arabic: ${k}`);
  }
});

test('t / tn: English fallback, Arabic, interpolation and plural categories', () => {
  assert.equal(t('Domains'), 'Domains');
  assert.equal(t('Invoice #{n}', { n: 5001 }), 'Invoice #5001');
  assert.equal(tn(1, '{n} day left', '{n} days left'), '1 day left');
  assert.equal(tn(3, '{n} day left', '{n} days left'), '3 days left');
  withLocale({ lang: 'ar' }, () => {
    assert.equal(t('Domains'), 'النطاقات');
    assert.equal(t('Invoice #{n}', { n: 5001 }), 'الفاتورة رقم 5001');
    assert.equal(tn(1, '{n} day left', '{n} days left'), 'يتبقى يوم واحد');
    assert.equal(tn(2, '{n} day left', '{n} days left'), 'يتبقى يومان');
    assert.equal(tn(5, '{n} day left', '{n} days left'), 'تتبقى 5 أيام');
    assert.equal(tn(14, '{n} day left', '{n} days left'), 'يتبقى 14 يومًا');
    assert.equal(t('Not a real key, falls back'), 'Not a real key, falls back');
    assert.equal(intlTag(), 'ar-AE-u-nu-latn');
    assert.equal(clientStrings()['Recent'], 'الأخيرة');
  });
  withLocale({ lang: 'ar', digits: 'arab' }, () => {
    assert.equal(t('Invoice #{n}', { n: 12 }), 'الفاتورة رقم ١٢');
    assert.equal(moneyTag(), 'ar-AE-u-nu-arab');
  });
});

test('money stays correct in Arabic: currency code kept, Latin digits by default', () => {
  const fmt = (tag: string) => new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD' }).format(25.2);
  withLocale({ lang: 'ar' }, () => {
    const s = fmt(moneyTag());
    assert.match(s, /25\.20/);
    assert.match(s, /US\$|USD/);
  });
  assert.equal(fmt(moneyTag()), '$25.20');
});
