// Customer-facing error wording: lib/ux/errors.ts (server), public/hp/fx.js (website + portal) and public/hp/whmcs.js
// (client area / Manage hosting) classify failures the same way and use the same copy; internal names never reach the
// text; every new string has Arabic in the portal and client-area dictionaries.
// Run: node --test --experimental-strip-types tests/ux-errors.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { ERROR_COPY, RETRYABLE, errorKind, scrubMessage, publicPanelError, PANEL_COPY, type ErrorKind } from '../lib/ux/errors.ts';
import { errorPage } from '../lib/ux/error-page.ts';
import { AR, CLIENT_KEYS } from '../lib/portal/i18n.ts';

const require = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
const read = (p: string) => fs.readFileSync(new URL(p, ROOT), 'utf8');
/** the code between /*<err-map>*\/ and /*</err-map>*\/ in a browser file */
const block = (src: string) => { const m = src.match(/\/\*<err-map>\*\/([\s\S]*?)\/\*<\/err-map>\*\//); assert.ok(m, 'err-map markers missing'); return m![1]; };

const fx = new Function('W', 'L', block(read('public/hp/fx.js')) + '; return { COPY, RETRY, kindOf, errInfo };')({ navigator: { onLine: true } }, (k: string) => k) as {
  COPY: Record<string, string>; RETRY: Record<string, number>; kindOf(s: number, c?: string): string; errInfo(s: number, b: unknown, e: unknown): { kind: string; msg: string; retry: boolean };
};
const wh = new Function('_t', 'N_', 'navigator', block(read('public/hp/whmcs.js')) + '; return { ERR_COPY, ghErr };')((k: string) => k, (k: string) => k, { onLine: true }) as {
  ERR_COPY: Record<string, string>; ghErr(s: number, c?: string, m?: string): { kind: string; msg: string; retry: boolean };
};
const STATUSES = [0, 400, 401, 403, 404, 408, 409, 410, 413, 422, 429, 500, 502, 503, 504, 520];
const KINDS = Object.keys(ERROR_COPY) as ErrorKind[];

test('status codes map to the expected kinds', () => {
  const want: Record<number, ErrorKind> = { 0: 'network', 400: 'validation', 401: 'auth', 403: 'forbidden', 404: 'notfound', 408: 'timeout', 413: 'validation', 422: 'validation', 429: 'rate', 500: 'server', 502: 'unavailable', 503: 'unavailable', 504: 'timeout', 520: 'server' };
  for (const [s, k] of Object.entries(want)) assert.equal(errorKind(Number(s)), k, `status ${s}`);
  assert.equal(errorKind(200, 'csrf'), 'auth');
  assert.equal(errorKind(401, 'expired'), 'auth');
  assert.equal(errorKind(502, 'panel_timeout'), 'timeout');
  assert.equal(errorKind(503, 'not_configured'), 'unavailable');
  assert.equal(errorKind(0, 'AbortError'), 'timeout');
  for (const k of ['network', 'timeout', 'rate', 'unavailable', 'server'] as ErrorKind[]) assert.ok(RETRYABLE.has(k), k);
  for (const k of ['validation', 'auth', 'forbidden', 'notfound'] as ErrorKind[]) assert.ok(!RETRYABLE.has(k), k);
});

test('the browser copies classify like the server module and use the same words', () => {
  assert.deepEqual(fx.COPY, ERROR_COPY, 'fx.js COPY differs from lib/ux/errors.ts');
  assert.deepEqual(wh.ERR_COPY, ERROR_COPY, 'whmcs.js ERR_COPY differs from lib/ux/errors.ts');
  for (const s of STATUSES) {
    assert.equal(fx.kindOf(s), errorKind(s), `fx.js status ${s}`);
    assert.equal(wh.ghErr(s).kind, errorKind(s), `whmcs.js status ${s}`);
    assert.equal(wh.ghErr(s).retry, RETRYABLE.has(errorKind(s)), `whmcs.js retry for ${s}`);
    assert.equal(fx.errInfo(s, null, null).retry, RETRYABLE.has(errorKind(s)), `fx.js retry for ${s}`);
  }
  for (const c of ['network', 'offline', 'timeout', 'expired', 'csrf', 'rate_limited', 'invalid', 'panel_unreachable']) assert.equal(fx.kindOf(500, c), errorKind(500, c), `fx.js code ${c}`);
});

test('a server sentence is kept only when it is safe and useful', () => {
  // our own APIs: a customer sentence on 429 / 422 is shown as is
  assert.equal(fx.errInfo(429, { ok: false, error: 'Too many requests from your connection. Please wait a few minutes.' }, null).msg, 'Too many requests from your connection. Please wait a few minutes.');
  // raw upstream text, codes and internal names are replaced by the standard copy
  assert.equal(fx.errInfo(500, { error: 'WHMCS API error: Invalid IP 1.2.3.4' }, null).msg, ERROR_COPY.server);
  assert.equal(fx.errInfo(502, { message: 'TypeError: x is undefined at handler (route.js:12:3)' }, null).msg, ERROR_COPY.unavailable);
  assert.equal(fx.errInfo(0, null, { name: 'AbortError' }).kind, 'timeout');
  assert.equal(fx.errInfo(0, null, new TypeError('Failed to fetch')).msg, ERROR_COPY.network);
  // hosting panel: input problems keep the server's words, 5xx get the standard copy
  assert.equal(wh.ghErr(400, 'invalid', 'Enter a valid IPv4 address.').msg, 'Enter a valid IPv4 address.');
  assert.equal(wh.ghErr(500, 'server', 'Something exploded in DirectAdmin').msg, ERROR_COPY.server);
  assert.equal(wh.ghErr(502, 'panel_unreachable', PANEL_COPY.unreachable).msg, PANEL_COPY.unreachable);
  assert.equal(wh.ghErr(401, 'expired').kind, 'auth');
  assert.equal(wh.ghErr(0, 'timeout').kind, 'timeout');
});

test('scrubMessage removes stack traces, codes, URLs and internal names', () => {
  const out = scrubMessage('Error: boom\n    at run (/var/task/route.js:12:5)\nThe hosting panel failed (HTTP 502) calling https://panel.example:2222/CMD_API via DirectAdmin and WHMCS on Vercel/Neon.');
  for (const bad of ['at run', 'HTTP 502', 'https://', 'DirectAdmin', 'WHMCS', 'Vercel', 'Neon', 'Error:']) assert.ok(!out.includes(bad), `${bad} left in "${out}"`);
  assert.match(out, /hosting panel/);
  assert.equal(scrubMessage('ECONNRESET'), '');
  assert.equal(scrubMessage('   '), '');
  assert.ok(scrubMessage('x'.repeat(50) + '. ' + 'word '.repeat(80)).length <= 221);
  assert.equal(scrubMessage('That mailbox already exists.'), 'That mailbox already exists.');
});

test('publicPanelError hides panel failures and keeps validation text', () => {
  assert.deepEqual(publicPanelError(502, 'WHM refused the API token.'), { status: 502, code: 'panel_unreachable', message: PANEL_COPY.unreachable });
  assert.deepEqual(publicPanelError(504, 'The hosting server did not answer in time.'), { status: 504, code: 'panel_timeout', message: PANEL_COPY.timeout });
  assert.equal(publicPanelError(400, 'DirectAdmin: That user already exists').message, 'That user already exists');
  assert.equal(scrubMessage('WHMCS API error: Domain not found'), 'Domain not found');
  assert.equal(publicPanelError(400, 'HTTP 400').message, PANEL_COPY.refused);
  assert.equal(publicPanelError(501, 'Not available on this server').status, 501);
});

test('every error string has Arabic in the portal and client-area dictionaries', () => {
  const WI = require(new URL('public/hp/whmcs-i18n.js', ROOT).pathname) as { ar: Record<string, unknown> };
  const keys = (CLIENT_KEYS as readonly string[]);
  for (const k of KINDS) {
    const en = ERROR_COPY[k];
    assert.ok(keys.includes(en), `CLIENT_KEYS is missing "${en}" (fx.js reads it from the portal dictionary)`);
    assert.equal(typeof AR[en], 'string', `portal Arabic missing: ${en}`);
    assert.equal(typeof WI.ar[en], 'string', `client-area Arabic missing: ${en}`);
  }
  // server messages the hosting API now sends are exact dictionary keys (L10N.srv)
  for (const en of Object.values(PANEL_COPY)) assert.equal(typeof WI.ar[en], 'string', `client-area Arabic missing: ${en}`);
  for (const en of ['Try again', 'Close', 'Still stuck? Message us on WhatsApp', 'Still stuck? Contact our team']) {
    assert.ok(keys.includes(en), `CLIENT_KEYS is missing "${en}"`);
    assert.equal(typeof AR[en], 'string', `portal Arabic missing: ${en}`);
  }
  // fx.js strings go through L(): each one is a client key
  for (const m of read('public/hp/fx.js').matchAll(/\bL\("((?:[^"\\]|\\.)*)"\)/g)) assert.ok(keys.includes(m[1]), `fx.js L("${m[1]}") is not in CLIENT_KEYS`);
});

test('the stand-alone error page is branded, actionable and leaks nothing', () => {
  const html = errorPage({ status: 503, retry: true, title: "We'll be right back", text: 'This page is temporarily unavailable.', whatsapp: '+971 50 734 1578', ref: 'abc<123>' });
  assert.match(html, /<button[^>]*onclick="location.reload\(\)"[^>]*>Try again<\/button>/);
  assert.match(html, /https:\/\/wa\.me\/971507341578/);
  assert.match(html, /M32 4 56\.2 18v28L32 60 7\.8 46V18z/, 'hexagon mark');
  assert.match(html, /abc&lt;123&gt;/);
  assert.ok(!/✓|&#10003;|&check;/.test(html), 'no tick characters');
  const nf = errorPage({ status: 404, title: 'Not found', text: 'Gone.' });
  assert.ok(!/keep running/.test(nf), 'the 404 page does not talk about outages');
  assert.ok(!/Try again/.test(nf));
});

test('no tick characters in the feedback UI (the brand mark is a hexagon)', () => {
  for (const f of ['public/hp/fx.js', 'public/hp/fx.css', 'public/hp/whmcs.js', 'public/hp/pages/account.js', 'lib/ux/error-page.ts', 'lib/theme/pages/notfound.ts', 'public/pwa-offline.htm']) {
    assert.ok(!/[✓✔☑]/.test(read(f)), `${f} contains a tick character`);
  }
});
