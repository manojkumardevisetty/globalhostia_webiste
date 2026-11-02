// Unit checks for the promotions config (lib/promo.ts). Run: node --test --experimental-strip-types tests/promo.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validate, activeFor, barHtml, richText, fromDubaiLocal, toDubaiLocal, DEFAULT_WELCOME } from '../lib/promo.ts';

const NOW = Date.parse('2026-11-02T10:00:00Z');

test('defaults: everything off, welcome preset has no coupon', () => {
  const p = normalize(undefined);
  assert.equal(p.bar.enabled, false); assert.equal(p.popup.enabled, false); assert.equal(p.welcome.enabled, false);
  assert.equal(p.welcome.coupon, ''); assert.equal(p.welcome.audience, 'new');
  assert.deepEqual(activeFor(undefined, 'website', NOW), { surface: 'website', bar: null, popups: [] });
  assert.equal(DEFAULT_WELCOME.coupon, '');
});

test('validation catches incomplete or unsafe input', () => {
  const p = normalize({ bar: { enabled: true, message: '', linkUrl: 'javascript:alert(1)' }, popup: { enabled: true, title: 'x', body: 'y', ctaLabel: 'Go' } });
  const e = validate(p).join('\n');
  assert.match(e, /message is required/); assert.match(e, /link must start/); assert.match(e, /button link/);
  const w = normalize({ bar: { enabled: true, message: 'Hi', start: '2026-11-05T00:00:00Z', end: '2026-11-01T00:00:00Z' } });
  assert.match(validate(w).join(), /end must be after start/);
  assert.deepEqual(validate(normalize({ bar: { enabled: true, message: 'Sale', linkUrl: '/web-hosting', linkLabel: 'See plans', coupon: 'save10' } })), []);
});

test('activeFor filters by surface, end date and enabled; welcome comes first', () => {
  const raw = {
    bar: { enabled: true, message: 'Hello **world**', where: 'both', coupon: 'abc' },
    popup: { enabled: true, title: 'P', body: 'b', where: 'website' },
    welcome: { enabled: true, title: 'W', body: 'b', where: 'both', end: '2026-11-01T00:00:00Z' },
  };
  const web = activeFor(raw, 'website', NOW);
  assert.equal(web.bar?.coupon, 'ABC'); assert.equal(web.popups.length, 1); assert.equal(web.popups[0].kind, 'popup');
  assert.ok(!('enabled' in (web.bar as object)));
  const ca = activeFor(raw, 'clientarea', NOW);
  assert.ok(ca.bar); assert.equal(ca.popups.length, 0);
  const both = activeFor({ ...raw, welcome: { ...raw.welcome, end: '' } }, 'website', NOW);
  assert.deepEqual(both.popups.map((x) => x.kind), ['welcome', 'popup']);
  // scheduled (future start) is still sent so cached pages switch on in time; the client checks the window
  assert.ok(activeFor({ bar: { enabled: true, message: 'x', start: '2026-12-01T00:00:00Z' } }, 'website', NOW).bar);
});

test('content id changes when content changes', () => {
  const a = activeFor({ bar: { enabled: true, message: 'A' } }, 'website', NOW).bar!.id;
  const b = activeFor({ bar: { enabled: true, message: 'B' } }, 'website', NOW).bar!.id;
  assert.notEqual(a, b);
});

test('rich text escapes HTML and supports **bold**', () => {
  assert.equal(richText('<b>x</b> **y**'), '&lt;b&gt;x&lt;/b&gt; <strong>y</strong>');
  const html = barHtml(activeFor({ bar: { enabled: true, message: '"><script>', linkUrl: '/x"y', linkLabel: 'L' } }, 'website', NOW).bar);
  assert.ok(!html.includes('"><script>'));
  assert.ok(html.includes('id="ghp-bar"'));
});

test('Dubai local time round-trips', () => {
  const iso = fromDubaiLocal('2026-11-05T09:30');
  assert.equal(iso, '2026-11-05T05:30:00.000Z');
  assert.equal(toDubaiLocal(iso), '2026-11-05T09:30');
});
