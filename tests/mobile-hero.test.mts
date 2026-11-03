// Unit checks for the phone hero config (lib/mobile-hero.ts). Run: node --test --experimental-strip-types tests/mobile-hero.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validate, liveSlides, resolveTokens, onOffer, slideStatus, DEFAULT_SLIDES, type PriceCtx, type TldPrice } from '../lib/mobile-hero.ts';

const NOW = Date.parse('2026-11-03T10:00:00Z');
const TLDS: Record<string, TldPrice> = {
  '.com': { register: 13.65, renew: 13.99, transfer: 13.65, promo: '' },
  '.shop': { register: 1.99, renew: 34.99, transfer: 30, promo: '' },
  '.net': { register: null, renew: 11.29, transfer: null, promo: '' },
};
const ctx = (over: Partial<Record<string, TldPrice>> = {}, from: Record<string, string | null> = { hosting: '$2.99/mo', email: '$3.50/mo' }): PriceCtx => ({
  currency: 'USD', money: (v) => `$${v.toFixed(2)}`, tld: (t) => ({ ...TLDS, ...over })[t] || null, from: (k) => from[k] ?? null,
});

test('defaults: three seeded slides, all on, no hardcoded prices', () => {
  const h = normalize(undefined);
  assert.equal(h.enabled, true); assert.equal(h.slides.length, 3); assert.equal(h.interval, 6);
  for (const s of DEFAULT_SLIDES) assert.doesNotMatch(s.headline + s.fallback + s.finePrint, /\$\s?\d|\d+\.\d\d/);
  assert.deepEqual(validate(h), []);
});

test('tokens resolve from live prices; a missing price returns null', () => {
  assert.equal(resolveTokens('Get a .com for only {price:.com}/1st yr', ctx()), 'Get a .com for only $13.65/1st yr');
  assert.equal(resolveTokens('{renew:.com} in {currency}', ctx()), '$13.99 in USD');
  assert.equal(resolveTokens('from {from:hosting}', ctx()), 'from $2.99/mo');
  assert.equal(resolveTokens('{price:.net}', ctx()), null);
  assert.equal(resolveTokens('{price:.xyz}', ctx()), null);
  assert.equal(resolveTokens('{from:vps}', ctx()), null);
  assert.equal(resolveTokens('{price:com}', ctx()), '$13.65');
  assert.equal(resolveTokens('No tokens', ctx()), 'No tokens');
});

test('offer rule: promo label or 10%+ first-year discount', () => {
  assert.equal(onOffer(TLDS['.com']), false);
  assert.equal(onOffer(TLDS['.shop']), true);
  assert.equal(onOffer({ ...TLDS['.com'], promo: 'Sale' }), true);
  assert.equal(onOffer(TLDS['.net']), false);
  assert.equal(onOffer(null), false);
});

test('live slides: .com price headline only while on offer, fallback otherwise', () => {
  const h = normalize(undefined);
  const a = liveSlides(h, ctx(), NOW);
  assert.equal(a[0].title, 'Find the perfect .com for your business');
  assert.equal(a[0].fine, '.com renews at $13.99/yr.');
  assert.equal(a[1].title, 'Web hosting from $2.99/mo');
  const b = liveSlides(h, ctx({ '.com': { ...TLDS['.com'], promo: 'Sale' } }), NOW);
  assert.equal(b[0].title, 'Get a .com for only $13.65/1st yr');
  // no hosting price synced -> non-price fallback, fine print without tokens still shown
  const c = liveSlides(h, ctx({}, {}), NOW);
  assert.equal(c[1].title, 'Fast NVMe web hosting for every website');
  assert.equal(c[2].title, 'Business email on your own domain');
});

test('fine print with an unavailable price is hidden, not shown half-filled', () => {
  const h = normalize({ slides: [{ headline: 'Hello', finePrint: 'Renews at {renew:.zz}' }] });
  assert.equal(liveSlides(h, ctx(), NOW)[0].fine, '');
});

test('schedule, visibility and the master switch', () => {
  const h = normalize({ slides: [
    { id: 'a', headline: 'A' },
    { id: 'b', headline: 'B', enabled: false },
    { id: 'c', headline: 'C', start: '2026-12-01T00:00:00Z' },
    { id: 'd', headline: 'D', end: '2026-11-01T00:00:00Z' },
  ] });
  assert.deepEqual(liveSlides(h, ctx(), NOW).map((s) => s.id), ['a']);
  assert.equal(slideStatus(h.slides[2], NOW), 'scheduled'); assert.equal(slideStatus(h.slides[3], NOW), 'ended');
  assert.deepEqual(liveSlides({ ...h, enabled: false }, ctx(), NOW), []);
});

test('validation', () => {
  const bad = normalize({ dealsHref: 'javascript:alert(1)', slides: [
    { headline: 'From {price:.com}', ctaLabel: 'Go' },
    { headline: 'X', media: 'image' },
    { headline: 'Y', media: 'video', videoUrl: '/v.mp4' },
    { headline: 'Z', ctaHref: '//evil.example', ctaLabel: 'Z' },
  ] });
  const e = validate(bad).join(' | ');
  assert.match(e, /Deals link/); assert.match(e, /Slide 1: add a fallback/); assert.match(e, /Slide 1: add a button link/);
  assert.match(e, /Slide 2: add an image/); assert.match(e, /Slide 3: add a poster/); assert.match(e, /Slide 4: button link must start/);
});

test('normalise: unique ids, clamps, at most 8 slides', () => {
  const h = normalize({ interval: 99, slides: Array.from({ length: 12 }, () => ({ id: 'x', headline: 'H', scrim: 500, offerTld: 'COM' })) });
  assert.equal(h.slides.length, 8); assert.equal(h.interval, 20);
  assert.equal(new Set(h.slides.map((s) => s.id)).size, 8);
  assert.equal(h.slides[0].scrim, 90); assert.equal(h.slides[0].offerTld, '.com');
});
