// Security essentials (lib/security/*): TOTP against the RFC 4226 / RFC 6238 test vectors, recovery codes, the central
// rate limiter, CSP policy + report parsing, Turnstile verification (mocked fetch), security.txt.
// Run: node --test --experimental-strip-types tests/security.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Decode, base32Encode, hotp, totp, verifyTotp, generateSecret, otpauthUri, generateRecoveryCodes, hashRecovery, consumeRecovery, normalizeRecovery, timeStep } from '../lib/security/totp.ts';
import { blocked, check, hit, newStore, RULES } from '../lib/security/ratelimit-core.ts';
import { parseCspReports, blockedOf } from '../lib/security/csp-report.ts';
import { verifyTurnstile, SITEVERIFY, TS_DEFAULT_FORMS } from '../lib/security/turnstile-core.ts';
import { securityTxt } from '../lib/security/disclosure.ts';
import { buildCsp, cleanExtra, cspHeaderName, effectiveMode, parseMode } from '../lib/security/csp-policy.mjs';

/* ---------------- TOTP ---------------- */
const ASCII20 = Buffer.from('12345678901234567890');

test('base32 round trip and RFC 4648 vector', () => {
  assert.equal(base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.equal(base32Decode('MZXW6YTBOI').toString(), 'foobar');
  assert.equal(base32Decode('mzxw 6ytb-oi').toString(), 'foobar');
  const s = generateSecret();
  assert.equal(s.length, 32); assert.equal(base32Decode(s).length, 20);
  assert.throws(() => base32Decode('0189'));
});

test('HOTP: RFC 4226 appendix D vectors', () => {
  const want = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  want.forEach((w, i) => assert.equal(hotp(ASCII20, i), w));
});

test('TOTP: RFC 6238 appendix B vectors (SHA1, SHA256, SHA512, 8 digits)', () => {
  const keys = { sha1: ASCII20, sha256: Buffer.from('12345678901234567890123456789012'), sha512: Buffer.from('1234567890123456789012345678901234567890123456789012345678901234') } as const;
  const rows: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'], [1111111109, '07081804', '68084774', '25091201'], [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'], [2000000000, '69279037', '90698825', '38618901'], [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [t, a, b, c] of rows) {
    assert.equal(totp(base32Encode(keys.sha1), t * 1000, { digits: 8 }), a, `sha1 ${t}`);
    assert.equal(totp(base32Encode(keys.sha256), t * 1000, { digits: 8, algo: 'sha256' }), b, `sha256 ${t}`);
    assert.equal(totp(base32Encode(keys.sha512), t * 1000, { digits: 8, algo: 'sha512' }), c, `sha512 ${t}`);
  }
});

test('verifyTotp: ±1 step drift, replay guard, bad input', () => {
  const sec = base32Encode(ASCII20), now = 1111111111_000;
  const code = totp(sec, now);
  assert.equal(verifyTotp(sec, code, { ms: now }), timeStep(now));
  assert.equal(verifyTotp(sec, code.slice(0, 3) + ' ' + code.slice(3), { ms: now }), timeStep(now));
  assert.equal(verifyTotp(sec, totp(sec, now - 30_000), { ms: now }), timeStep(now) - 1);
  assert.equal(verifyTotp(sec, totp(sec, now + 30_000), { ms: now }), timeStep(now) + 1);
  assert.equal(verifyTotp(sec, totp(sec, now - 90_000), { ms: now }), null);
  assert.equal(verifyTotp(sec, code, { ms: now, lastStep: timeStep(now) }), null, 'same step twice = replay');
  assert.equal(verifyTotp(sec, '12345', { ms: now }), null);
  assert.equal(verifyTotp(sec, 'abcdef', { ms: now }), null);
  assert.equal(verifyTotp('!!!', code, { ms: now }), null);
});

test('otpauth URI', () => {
  const u = otpauthUri('JBSWY3DPEHPK3PXP', 'owner@globalhostia.com');
  assert.match(u, /^otpauth:\/\/totp\/GlobalHostia%20Admin%3Aowner%40globalhostia\.com\?secret=JBSWY3DPEHPK3PXP&issuer=GlobalHostia%20Admin/);
});

/* ---------------- recovery codes ---------------- */
test('recovery codes: 10 unique, hashed, one use each', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10); assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
  const pepper = 'p'.repeat(40);
  let hashes = codes.map((c) => hashRecovery(c, pepper));
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h) && !codes.some((c) => h.includes(normalizeRecovery(c)))));
  const left = consumeRecovery(hashes, codes[3].toUpperCase().replace('-', ' '), pepper);
  assert.ok(left); assert.equal(left!.length, 9);
  hashes = left!;
  assert.equal(consumeRecovery(hashes, codes[3], pepper), null, 'used code no longer works');
  assert.equal(consumeRecovery(hashes, codes[4], 'other-pepper'.repeat(4)), null, 'pepper matters');
  assert.equal(consumeRecovery(hashes, 'short', pepper), null);
});

/* ---------------- rate limiter ---------------- */
test('limiter: fixed window, retry-after, per account, multiplier', () => {
  const st = newStore(), t0 = 1_000_000;
  for (let i = 0; i < 10; i++) assert.equal(hit(st, 'k', { max: 10, ms: 60_000 }, t0 + i), 0);
  assert.equal(hit(st, 'k', { max: 10, ms: 60_000 }, t0 + 10_000), 50);
  assert.equal(hit(st, 'k', { max: 10, ms: 60_000 }, t0 + 60_000), 0, 'new window');

  const s2 = newStore();
  // password-reset: 3 per account per hour, 6 per IP per 15 min
  for (let i = 0; i < 3; i++) assert.ok(check(s2, 'password-reset', { ip: `1.1.1.${i}`, account: 'A@x.com' }, 1, t0).ok);
  const r = check(s2, 'password-reset', { ip: '1.1.1.9', account: 'a@x.com' }, 1, t0);
  assert.equal(r.ok, false); assert.ok(r.retryAfter > 0); assert.match(r.message, /reset/i);
  assert.ok(check(s2, 'password-reset', { ip: '1.1.1.9', account: 'b@x.com' }, 1, t0).ok, 'other account still allowed');

  const s3 = newStore();
  for (let i = 0; i < 20; i++) assert.ok(check(s3, 'admin-login', { ip: '9.9.9.9' }, 2, t0).ok, 'multiplier 2 doubles the IP limit');
  assert.equal(check(s3, 'admin-login', { ip: '9.9.9.9' }, 2, t0).ok, false);
  assert.ok(Object.values(RULES).every((x) => x.message.length > 10 && x.ip.max > 0));

  // failure-only counting: blocked() never counts, check() on each failure
  const s4 = newStore();
  for (let i = 0; i < 50; i++) assert.ok(blocked(s4, 'admin-login', { ip: '5.5.5.5', account: 'o@x.com' }, 1, t0).ok, 'successful sign-ins are not counted');
  for (let i = 0; i < 10; i++) check(s4, 'admin-login', { ip: '5.5.5.5', account: 'o@x.com' }, 1, t0);
  const b = blocked(s4, 'admin-login', { ip: '6.6.6.6', account: 'O@x.com' }, 1, t0 + 1000);
  assert.equal(b.ok, false, '10 failures lock the account from any IP'); assert.ok(b.retryAfter > 0);
  assert.ok(blocked(s4, 'admin-login', { ip: '6.6.6.6', account: 'other@x.com' }, 1, t0).ok);
  assert.ok(blocked(s4, 'admin-login', { ip: '5.5.5.5', account: 'o@x.com' }, 1, t0 + 31 * 60_000).ok, 'window expires');
});

/* ---------------- CSP ---------------- */
test('CSP policy: enforced directives, no unsafe-eval in production, frame-ancestors self, extras validated', () => {
  const p = buildCsp();
  assert.match(p, /default-src 'self'/); assert.match(p, /frame-ancestors 'self'/); assert.match(p, /object-src 'none'/); assert.match(p, /base-uri 'self'/);
  assert.doesNotMatch(p, /unsafe-eval/);
  assert.match(buildCsp({ dev: true }), /unsafe-eval/);
  assert.match(p, /script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(p, /frame-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(p, /connect-src [^;]*https:\/\/my\.globalhostia\.com/);
  assert.match(p, /report-uri \/api\/csp-report; report-to csp$/);
  assert.doesNotMatch(buildCsp({ reportUri: false }), /report-uri/);
  const x = cleanExtra({ script: ['https://cdn.example.com/', "'unsafe-eval'", 'http://insecure.example', 'https://*.cdn.example', 'javascript:alert(1)'], connect: 'wss://live.example.com, https://api.example.com' });
  assert.deepEqual(x.script, ['https://cdn.example.com', 'https://*.cdn.example']);
  assert.deepEqual(x.connect, ['wss://live.example.com', 'https://api.example.com']);
  assert.match(buildCsp({ extra: x }), /script-src [^;]*https:\/\/cdn\.example\.com/);
});

test('CSP mode: env and admin, the least strict wins', () => {
  assert.equal(parseMode(undefined), 'enforce'); assert.equal(parseMode('Report-Only'), 'report'); assert.equal(parseMode('off'), 'off'); assert.equal(parseMode('junk'), 'enforce');
  assert.equal(effectiveMode(undefined, 'enforce'), 'enforce');
  assert.equal(effectiveMode('report', 'enforce'), 'report');
  assert.equal(effectiveMode('enforce', 'report'), 'report');
  assert.equal(effectiveMode('off', 'report'), 'off');
  assert.equal(cspHeaderName('enforce'), 'Content-Security-Policy');
  assert.equal(cspHeaderName('report'), 'Content-Security-Policy-Report-Only');
  assert.equal(cspHeaderName('off'), null);
});

test('CSP reports: report-uri and report-to formats, noise filtered, aggregation key', () => {
  const legacy = JSON.stringify({ 'csp-report': { 'document-uri': 'https://globalhostia.com/web-hosting?utm_source=x', 'violated-directive': 'script-src-elem', 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example.com/x.js?y=1', 'source-file': 'https://globalhostia.com/hp/theme.js', disposition: 'report' } });
  const [a] = parseCspReports(legacy, 'application/csp-report');
  assert.deepEqual({ d: a.directive, b: a.blocked, p: a.page, s: a.source, m: a.disposition }, { d: 'script-src-elem', b: 'https://evil.example.com', p: '/web-hosting', s: 'https://globalhostia.com/hp/theme.js', m: 'report' });
  const modern = JSON.stringify([
    { type: 'csp-violation', url: 'https://globalhostia.com/web-hosting', body: { documentURL: 'https://globalhostia.com/web-hosting', effectiveDirective: 'script-src-elem', blockedURL: 'https://evil.example.com/other.js', disposition: 'report' } },
    { type: 'csp-violation', url: 'https://globalhostia.com/', body: { effectiveDirective: 'style-src-attr', blockedURL: 'inline', sample: 'color:red', disposition: 'enforce' } },
    { type: 'csp-violation', url: 'https://globalhostia.com/', body: { effectiveDirective: 'script-src', blockedURL: 'chrome-extension://abc/x.js' } },
    { type: 'deprecation', url: 'https://globalhostia.com/', body: { id: 'x' } },
  ]);
  const list = parseCspReports(modern, 'application/reports+json');
  assert.equal(list.length, 2);
  assert.equal(list[0].key, a.key, 'same directive + origin + page + mode aggregate together');
  assert.equal(list[1].blocked, 'inline'); assert.equal(list[1].sample, 'color:red'); assert.equal(list[1].page, '/');
  assert.deepEqual(parseCspReports('not json'), []);
  assert.deepEqual(parseCspReports(JSON.stringify({ 'csp-report': { 'violated-directive': 'b@d!' } })), []);
  assert.deepEqual(parseCspReports('x'.repeat(70_000)), []);
  assert.equal(blockedOf('data:image/png;base64,xx'), 'data:'); assert.equal(blockedOf('eval'), 'eval'); assert.equal(blockedOf(''), 'inline');
});

/* ---------------- Turnstile ---------------- */
test('Turnstile: passes, fails, missing token, fail-open on outage', async () => {
  const calls: { url: string; body: string }[] = [];
  const mock = (reply: unknown, status = 200) => (async (url: any, init: any) => { calls.push({ url: String(url), body: String(init.body) }); return new Response(JSON.stringify(reply), { status }); }) as typeof fetch;
  assert.deepEqual(await verifyTurnstile({ secret: '', token: 'x' }, mock({ success: false })), { ok: true, reason: 'disabled' });
  assert.equal((await verifyTurnstile({ secret: 's', token: '' }, mock({ success: true }))).reason, 'missing');
  assert.equal(calls.length, 0, 'no network call without a token');
  const ok = await verifyTurnstile({ secret: 's3cret', token: 'tok', ip: '1.2.3.4' }, mock({ success: true }));
  assert.deepEqual(ok, { ok: true, reason: 'passed' });
  assert.equal(calls[0].url, SITEVERIFY); assert.match(calls[0].body, /secret=s3cret/); assert.match(calls[0].body, /response=tok/); assert.match(calls[0].body, /remoteip=1\.2\.3\.4/);
  const bad = await verifyTurnstile({ secret: 's', token: 'tok' }, mock({ success: false, 'error-codes': ['invalid-input-response'] }));
  assert.equal(bad.ok, false); assert.deepEqual(bad.codes, ['invalid-input-response']);
  assert.deepEqual(await verifyTurnstile({ secret: 's', token: 'tok' }, mock({}, 503)), { ok: true, reason: 'unreachable' });
  assert.equal((await verifyTurnstile({ secret: 's', token: 'tok', failOpen: false }, mock({}, 503))).ok, false);
  const boom = (async () => { throw new Error('network'); }) as typeof fetch;
  assert.equal((await verifyTurnstile({ secret: 's', token: 'tok' }, boom)).reason, 'unreachable');
  assert.equal((await verifyTurnstile({ secret: 'wrong', token: 'tok' }, mock({ success: false, 'error-codes': ['invalid-input-secret'] }))).ok, true, 'owner key mistake never blocks customers');
  assert.equal(TS_DEFAULT_FORMS.login, false); assert.equal(TS_DEFAULT_FORMS.lead, true);
});

/* ---------------- security.txt ---------------- */
test('security.txt: RFC 9116 fields, expiry under a year', () => {
  const now = Date.parse('2026-11-04T12:00:00Z');
  const t = securityTxt({ contact: 'security@globalhostia.com', site: 'https://globalhostia.com/', now });
  assert.match(t, /^Contact: mailto:security@globalhostia\.com$/m);
  assert.match(t, /^Expires: 2027-11-03T00:00:00Z$/m);
  assert.match(t, /^Policy: https:\/\/globalhostia\.com\/security$/m);
  assert.match(t, /^Canonical: https:\/\/globalhostia\.com\/\.well-known\/security\.txt$/m);
  assert.match(securityTxt({ contact: 'https://globalhostia.com/report', site: 'https://globalhostia.com', now }), /^Contact: https:\/\/globalhostia\.com\/report$/m);
});
