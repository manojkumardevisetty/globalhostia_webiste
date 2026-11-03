// Client-area skin (public/hp/whmcs.js) Arabic dictionary (public/hp/whmcs-i18n.js): every English string the
// skin and the Manage hosting panel show has an Arabic entry with the same {placeholders}, plural entries have the
// forms Arabic needs, and the server-message patterns compile.
// Run: node --test --experimental-strip-types tests/i18n.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const SRC = fs.readFileSync(new URL('public/hp/whmcs.js', ROOT), 'utf8');
const D = require(new URL('public/hp/whmcs-i18n.js', ROOT).pathname) as { ar: Record<string, string | Record<string, string>>; srv: [string, string][] };

// English keys exactly as written in whmcs.js: _t('…'), N_('…') (labels translated later) and DL('…') (card labels);
// _tp(n, 'one', 'other') keeps the Arabic plural forms under the "other" text
const LIT = "'((?:[^'\\\\]|\\\\.)*)'";
const unq = (s: string) => s.replace(/\\(.)/g, '$1');
const singles = [...new Set([...SRC.matchAll(new RegExp('\\b(?:_t|N_|DL)\\(' + LIT, 'g'))].map((m) => unq(m[1])))];
const plurals = [...SRC.matchAll(new RegExp("\\b_tp\\([^']*?" + LIT + '\\s*,\\s*' + LIT, 'g'))].map((m) => ({ one: unq(m[1]), other: unq(m[2]) }));
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const ARABIC = /[؀-ۿ]/;
// values that stay in Latin script on purpose (product names)
const LATIN_OK = new Set(['Windows VPS', 'Forex VPS', 'Windows RDP', 'iPhone / Mac', 'Android / Gmail']);

test('the skin uses the dictionary for its strings', () => {
  assert.ok(singles.length > 600, `found only ${singles.length} translatable strings in whmcs.js`);
  assert.ok(plurals.length >= 10);
});

test('every English string has an Arabic translation with the same placeholders', () => {
  const missing: string[] = [], bad: string[] = [];
  for (const k of singles) {
    const v = D.ar[k];
    if (v == null) { missing.push(k); continue; }
    if (typeof v !== 'string') { bad.push(`${k}: expected text, got plural forms`); continue; }
    if (!v.trim()) bad.push(`${k}: empty`);
    if (holes(v) !== holes(k)) bad.push(`${k}: placeholders {${holes(k)}} vs {${holes(v)}}`);
    if (!ARABIC.test(v) && !LATIN_OK.has(k)) bad.push(`${k}: no Arabic text`);
    if ((k.match(/<\/?b>/g) || []).length !== (v.match(/<\/?b>/g) || []).length) bad.push(`${k}: markup differs`);
  }
  assert.deepEqual(missing, [], 'English strings without Arabic');
  assert.deepEqual(bad, []);
});

test('plural strings have Arabic plural forms', () => {
  for (const p of plurals) {
    const v = D.ar[p.other];
    assert.ok(v && typeof v === 'object', `no plural forms for "${p.other}"`);
    const forms = v as Record<string, string>;
    assert.ok(forms.one && forms.other, `"${p.other}" needs at least one/other`);
    for (const [cat, s] of Object.entries(forms)) {
      assert.ok(['zero', 'one', 'two', 'few', 'many', 'other'].includes(cat), `${p.other}: unknown category ${cat}`);
      assert.match(s, ARABIC);
      assert.ok(/\{n\}/.test(s) || ['zero', 'one', 'two'].includes(cat), `${p.other}/${cat} must show {n}`);
    }
    // every category Intl picks for Arabic resolves (missing ones fall back to "other")
    const pr = new Intl.PluralRules('ar');
    for (const n of [0, 1, 2, 3, 11, 100]) assert.ok(forms[pr.select(n)] || forms.other);
  }
});

test('brand, record types and technical values stay in Latin script', () => {
  for (const [k, v] of Object.entries(D.ar)) {
    if (typeof v !== 'string') continue;
    for (const word of ['GlobalHostia', 'WordPress', 'DNS', 'SSL', 'FTP', 'MySQL', 'IMAP', 'SMTP', 'TXT', 'MX', 'PHP']) {
      if (new RegExp('\\b' + word + '\\b').test(k)) assert.ok(v.includes(word), `"${k}" should keep ${word} in Latin`);
    }
  }
});

test('server message patterns compile and fill their groups', () => {
  for (const [re, ar] of D.srv) {
    const rx = new RegExp('^' + re + '$');
    const groups = new RegExp(rx.source + '|').exec('')!.length - 1;
    for (let g = 1; g <= groups; g++) assert.ok(ar.includes('$' + g), `${re}: $${g} unused`);
    assert.match(ar, ARABIC);
  }
  const hit = (msg: string) => D.srv.find(([re]) => new RegExp('^' + re + '$').test(msg));
  assert.ok(hit('TXT record added'));
  assert.ok(hit('info@shop-example.com created'));
  assert.ok(hit('SSL certificate expires in 9 days'));
});

test('the dictionary file is data only and works without a DOM', () => {
  const src = fs.readFileSync(new URL('public/hp/whmcs-i18n.js', ROOT), 'utf8');
  assert.doesNotMatch(src, /\b(document|location|fetch|XMLHttpRequest|eval)\b/);
  const win: Record<string, unknown> = {};
  new Function('window', 'module', src)(win, undefined);
  assert.ok((win.GH_I18N as typeof D).ar['Manage hosting']);
});
