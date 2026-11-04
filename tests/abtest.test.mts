// A/B tests (lib/abtest/*): deterministic assignment and weights, bot / Do-Not-Track / consent exclusion, Googlebot always
// gets the control from the middleware, page slots (variant → promoted copy → default), experiment validation and the stats.
// Run: node --test --experimental-strip-types tests/abtest.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import {
  pickVariant, hash32, isBot, eligibility, edgeConfig, assignFor, normExperiments, normExperiment, validateExperiment, isLive,
  parseTokens, mergeAssignCookie, fillTokens, newVisitorId, isVisitorId, type Experiment,
} from '../lib/abtest/core.ts';
import { zTest, probBeats, analyse, phi, sampleNeeded, ZERO, MIN_VISITORS } from '../lib/abtest/stats.ts';

// lib/abtest/edge.ts and apply.ts import './core' without an extension (Next resolves it); let Node do the same here
register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) { try { return await n(s + '.ts', c); } catch {} } return n(s, c); }"));
const { abAssign, __resetConfigCache } = await import('../lib/abtest/edge.ts');
const { pageAb, normCopy, abRequest } = await import('../lib/abtest/apply.ts');

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const GOOGLEBOT_MOBILE = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const exp = (o: Partial<Experiment> & { set?: Record<string, string> } = {}): Experiment => normExperiment({
  id: 'hero-1', name: 'Hero', target: 'hosting', paths: ['/web-hosting'], status: 'running', metric: 'cart',
  variants: [{ name: 'Control', weight: 50, set: {} }, { name: 'B', weight: 50, set: o.set || { 'hero.title': 'Web hosting with free SSL, daily backups and free migration' } }],
  ...o,
})!;

test('assignment is deterministic per visitor and experiment', () => {
  const e = exp();
  for (let i = 0; i < 200; i++) {
    const id = newVisitorId();
    assert.ok(isVisitorId(id));
    const v = pickVariant(id, e);
    assert.equal(pickVariant(id, e), v);
    assert.equal(pickVariant(id, { ...e, variants: [...e.variants] }), v);
  }
  assert.equal(hash32('abc'), hash32('abc'));
  assert.notEqual(hash32('abc:x'), hash32('abc:y'));
});

test('weights are respected (50/50, 80/20, 0 never picked) and experiments are independent', () => {
  const ids = Array.from({ length: 20000 }, (_, i) => `visitor${i.toString(36).padStart(12, '0')}`);
  const share = (e: any, k: string) => ids.filter((id) => pickVariant(id, e) === k).length / ids.length;
  const e50 = exp();
  assert.ok(Math.abs(share(e50, 'a') - 0.5) < 0.02, `50/50 got ${share(e50, 'a')}`);
  const e80 = { id: 'w80', variants: [{ key: 'a', weight: 80 }, { key: 'b', weight: 20 }] };
  assert.ok(Math.abs(share(e80, 'b') - 0.2) < 0.015, `80/20 got ${share(e80, 'b')}`);
  const e3 = { id: 'w3', variants: [{ key: 'a', weight: 34 }, { key: 'b', weight: 0 }, { key: 'c', weight: 66 }] };
  assert.equal(share(e3, 'b'), 0);
  // a visitor's bucket in one test says nothing about the other
  const both = ids.filter((id) => pickVariant(id, e50) === 'b' && pickVariant(id, { ...e50, id: 'other-test' }) === 'b').length / ids.length;
  assert.ok(Math.abs(both - 0.25) < 0.02, `independence got ${both}`);
});

test('bots, previews and scripts are excluded; real browsers are not', () => {
  for (const ua of [GOOGLEBOT, GOOGLEBOT_MOBILE, 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'curl/8.4.0', '', null,
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36', 'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Chrome-Lighthouse']) {
    assert.equal(isBot(ua), true, String(ua));
  }
  for (const ua of [CHROME, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 9; CUBOT X19) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36']) {
    assert.equal(isBot(ua), false, ua);
  }
  assert.equal(eligibility({ ua: CHROME, consentRequired: false }), 'ok');
  assert.equal(eligibility({ ua: CHROME, dnt: '1', consentRequired: false }), 'dnt');
  assert.equal(eligibility({ ua: CHROME, gpc: '1', consentRequired: false }), 'dnt');
  assert.equal(eligibility({ ua: CHROME, consentRequired: true }), 'consent');
  assert.equal(eligibility({ ua: CHROME, consent: 'denied', consentRequired: true }), 'consent');
  assert.equal(eligibility({ ua: CHROME, consent: 'granted', consentRequired: true }), 'ok');
  assert.equal(eligibility({ ua: GOOGLEBOT, consent: 'granted', consentRequired: false }), 'bot');
});

/* ---------------- middleware (lib/abtest/edge.ts) with a stubbed /api/ab/config */
const cfgFor = (list: Experiment[], consent = false) => edgeConfig(list, consent);
function req(path: string, ua: string | null, cookies: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const h = new Headers(headers); if (ua) h.set('user-agent', ua);
  return { nextUrl: new URL(`https://globalhostia.com${path}`), headers: h, cookies: { get: (n: string) => (cookies[n] ? { value: cookies[n] } : undefined) } };
}
let served = cfgFor([exp()]);
globalThis.fetch = (async () => new Response(JSON.stringify(served), { headers: { 'content-type': 'application/json' } })) as typeof fetch;
const noAdmin = async () => false;

test('middleware: Googlebot always gets the control, with no cookie and no _ab', async () => {
  for (const ua of [GOOGLEBOT, GOOGLEBOT_MOBILE]) {
    for (let i = 0; i < 50; i++) {
      const r = await abAssign(req('/web-hosting', ua, { gh_ab: `visitor${String(i).padStart(12, '0')}` }), noAdmin);
      assert.deepEqual(r, { param: '', draft: false, cookies: [] });
    }
  }
  // not a testable page: nothing at all
  assert.equal(await abAssign(req('/vps-hosting', CHROME), noAdmin), null);
});

test('middleware: browsers get a stable bucket, new visitors get an id cookie and the shared assignment cookie', async () => {
  const first = await abAssign(req('/web-hosting', CHROME), noAdmin);
  const idCookie = first!.cookies.find((c) => c.name === 'gh_ab')!;
  assert.ok(idCookie && idCookie.httpOnly && isVisitorId(idCookie.value));
  const abv = first!.cookies.find((c) => c.name === 'gh_abv')!;
  assert.equal(abv.domain, '.globalhostia.com');
  assert.equal(abv.httpOnly, false);
  const v = pickVariant(idCookie.value, exp());
  assert.equal(abv.value, `hero-1.${v}`);
  assert.equal(first!.param, v === 'a' ? '' : 'hero-1.b'); // the control is the normal (shared) page copy
  const again = await abAssign(req('/web-hosting/', CHROME, { gh_ab: idCookie.value, gh_abv: abv.value }), noAdmin);
  assert.equal(again!.param, first!.param);
  assert.deepEqual(again!.cookies, []); // nothing changed: no Set-Cookie
});

test('middleware: Do-Not-Track, GPC and missing consent (cookie banner active) see the control', async () => {
  const always = exp({ variants: [{ name: 'Control', weight: 1, set: {} }, { name: 'B', weight: 1000, set: { 'hero.title': 'X' } }] as any });
  served = cfgFor([always], true); __resetConfigCache();
  const id = 'visitor000000000001';
  assert.equal(pickVariant(id, always), 'b');
  assert.deepEqual(await abAssign(req('/web-hosting', CHROME, { gh_ab: id }, { dnt: '1' }), noAdmin), { param: '', draft: false, cookies: [] });
  assert.deepEqual(await abAssign(req('/web-hosting', CHROME, { gh_ab: id }, { 'sec-gpc': '1' }), noAdmin), { param: '', draft: false, cookies: [] });
  assert.deepEqual(await abAssign(req('/web-hosting', CHROME, { gh_ab: id }), noAdmin), { param: '', draft: false, cookies: [] }); // no consent yet
  assert.equal((await abAssign(req('/web-hosting', CHROME, { gh_ab: id, gh_consent: 'granted' }), noAdmin))!.param, 'hero-1.b');
  // config endpoint down: everyone gets the control, the page still renders
  globalThis.fetch = (async () => { throw new Error('down'); }) as typeof fetch; __resetConfigCache();
  assert.deepEqual(await abAssign(req('/web-hosting', CHROME, { gh_ab: id, gh_consent: 'granted' }), noAdmin), { param: '', draft: false, cookies: [] });
});

test('middleware: preview links pass the variant through (drafts only for admins); junk is ignored', async () => {
  assert.deepEqual(await abAssign(req('/web-hosting?ab=hero-1.b', GOOGLEBOT), noAdmin), { param: 'hero-1.b', draft: false, cookies: [] });
  assert.equal((await abAssign(req('/web-hosting?ab=hero-1.b', CHROME), async () => true))!.draft, true);
  const junk = await abAssign(req('/web-hosting?ab=%3Cscript%3E', CHROME), noAdmin);
  assert.equal(junk!.param, '');
});

/* ---------------- page slots (lib/abtest/apply.ts) */
test('page slots: variant (running) → promoted copy → default; stopped tests and other pages ignored', () => {
  const settings = { ab_experiments: [exp(), exp({ id: 'layout-1', set: { 'plans.layout': 'table' }, paths: ['/shared-hosting'] })],
    page_copy: { '/web-hosting': { 'plans.title': 'Hosting plans', 'hero.cta': 'See plans' }, '/nope': { 'hero.title': 'y' } } };
  const q = (s: string) => new URLSearchParams(s);
  const ctl = pageAb(settings, q('_cur=USD'), '/web-hosting', 'hosting');
  assert.equal(ctl.text('hero.title', 'Default'), 'Default');
  assert.equal(ctl.text('plans.title', 'Web hosting plans'), 'Hosting plans');
  assert.equal(ctl.applied, '');
  const b = pageAb(settings, q('_ab=hero-1.b'), '/web-hosting', 'hosting');
  assert.equal(b.text('hero.title', 'Default'), 'Web hosting with free SSL, daily backups and free migration');
  assert.equal(b.text('hero.cta', 'x'), 'See plans');
  assert.equal(b.applied, 'hero-1.b');
  // wrong page, wrong target, control token, stopped experiment
  assert.equal(pageAb(settings, q('_ab=hero-1.b'), '/shared-hosting', 'hosting').applied, '');
  assert.equal(pageAb(settings, q('_ab=hero-1.b'), '/web-hosting', 'domains').applied, '');
  assert.equal(pageAb(settings, q('_ab=hero-1.a'), '/web-hosting', 'hosting').applied, '');
  const stopped = { ...settings, ab_experiments: [exp({ status: 'stopped' })] };
  assert.equal(pageAb(stopped, q('_ab=hero-1.b'), '/web-hosting', 'hosting').applied, '');
  assert.equal(pageAb(stopped, q('_ab=hero-1.b&_abd=1'), '/web-hosting', 'hosting').applied, 'hero-1.b'); // admin draft / stopped preview
  assert.equal(pageAb(settings, q('_ab=layout-1.b'), '/shared-hosting', 'hosting').layout('plans.layout', 'cards'), 'table');
  assert.deepEqual(normCopy({ '/Web-Hosting/': { 'plans.layout': 'nonsense', 'hero.title': ' Hi ' }, hosting: { 'hero.title': 'x' } }), { '/web-hosting': { 'hero.title': 'Hi' } });
  // promoted copy is per page: /shared-hosting keeps its own headline
  assert.equal(pageAb(settings, q(''), '/shared-hosting', 'hosting').text('plans.title', 'Shared hosting plans'), 'Shared hosting plans');
  assert.equal(fillTokens('Host in {locations}. {nope}', { locations: 'USA or Malaysia' }), 'Host in USA or Malaysia.');
  // the renderer takes the variant from middleware's header first, then the internal query
  const hdr = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(abRequest(q('_ab=x-1.b'), hdr({ 'x-gh-ab': 'hero-1.b' })).get('_ab'), 'hero-1.b');
  assert.equal(abRequest(q('_ab=hero-1.b&_abd=1'), null).toString(), '_ab=hero-1.b&_abd=1');
  assert.equal(abRequest(q(''), hdr({})).toString(), '');
});

/* ---------------- experiments */
test('experiments: normalisation drops unknown slots / layouts and validation catches mistakes', () => {
  const e = normExperiment({ id: 'Bad Id!', target: 'hosting' });
  assert.equal(e, null);
  const x = exp({ set: { 'hero.title': 'A', nope: 'x', 'plans.layout': 'carousel' } as any });
  assert.deepEqual(x.variants[1].set, { 'hero.title': 'A' });
  assert.deepEqual(validateExperiment(exp(), []), []);
  assert.ok(validateExperiment(exp({ set: {} }), []).some((m) => /change at least one/.test(m)));
  const running = exp({ id: 'other', status: 'running' });
  assert.ok(validateExperiment(exp({ status: 'draft' }), [running], true).some((m) => /already running/.test(m)));
  assert.deepEqual(validateExperiment(exp({ status: 'draft' }), [{ ...running, paths: ['/shared-hosting'] }], true), []);
  assert.equal(isLive(exp({ endAt: '2020-01-01T00:00:00Z' })), false);
  assert.equal(isLive(exp({ startAt: '2999-01-01T00:00:00Z' })), false);
  assert.equal(normExperiments([exp(), exp()]).length, 1);
  assert.deepEqual(assignFor(edgeConfig([exp({ status: 'draft' })], false), '/web-hosting', 'visitor000000000001'), []);
  assert.deepEqual(parseTokens('hero-1.b~x.z~<b>~layout-1.a,hero-1.a'), [{ exp: 'hero-1', variant: 'b' }, { exp: 'layout-1', variant: 'a' }]);
  assert.equal(mergeAssignCookie('old-1.b~hero-1.a', [{ exp: 'hero-1', variant: 'b' }], new Set(['hero-1'])), 'hero-1.b');
});

test('seeded drafts use only claims the hosting page already makes', async () => {
  const fs = await import('node:fs');
  const setup = fs.readFileSync(new URL('../scripts/db-setup.mjs', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../lib/theme/pages/hosting.ts', import.meta.url), 'utf8');
  assert.match(setup, /'039-ab-tests'/);
  assert.match(setup, /status: 'draft'[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*'hero\.title': 'Web hosting with free SSL, daily backups and free migration'/);
  for (const claim of ['free SSL', 'daily and weekly backups', 'Migration is free']) assert.ok(page.toLowerCase().includes(claim.toLowerCase()), claim);
  assert.doesNotMatch(setup.slice(setup.indexOf("'039-ab-tests'")), /status: 'running'/);
});

/* ---------------- stats */
test('stats: z-test, Bayesian probability, sample size and verdicts', () => {
  assert.ok(Math.abs(phi(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(phi(1.959964) - 0.975) < 1e-4);
  const big = zTest(100, 1000, 150, 1000);
  assert.ok(big.p < 0.01 && big.z > 0, JSON.stringify(big));
  assert.ok(zTest(50, 1000, 52, 1000).p > 0.5);
  assert.equal(zTest(0, 0, 0, 0).p, 1);
  assert.ok(probBeats(100, 1000, 150, 1000) > 0.99);
  assert.ok(Math.abs(probBeats(50, 1000, 50, 1000) - 0.5) < 1e-9);
  assert.ok(probBeats(150, 1000, 100, 1000) < 0.01);
  const n = sampleNeeded(0.05, 0.2);
  assert.ok(n > 7000 && n < 9000, String(n)); // textbook: ~8,150 per group for 5% → 6%
  const row = (key: string, visitors: number, carts: number, revenue = 0) => ({ ...ZERO, key, visitors, carts, revenue });
  const [c, few] = analyse([row('a', 50, 5), row('b', 50, 9)], 'cart');
  assert.equal(c.verdict, 'control');
  assert.equal(few.verdict, 'collecting');
  assert.match(few.note, new RegExp(`Not significant yet: wait for at least ${MIN_VISITORS} visitors`));
  const [, win] = analyse([row('a', 2000, 100, 500), row('b', 2000, 160, 700)], 'cart');
  assert.equal(win.verdict, 'winning');
  assert.ok(win.uplift! > 0.59 && win.uplift! < 0.61);
  assert.ok(Math.abs(win.rpv - 0.35) < 1e-9 && Math.abs(win.rpvUplift! - 0.4) < 1e-9);
  const [, lose] = analyse([row('a', 2000, 160), row('b', 2000, 100)], 'cart');
  assert.equal(lose.verdict, 'losing');
  const [, flat] = analyse([row('a', 2000, 100), row('b', 2000, 104)], 'cart');
  assert.equal(flat.verdict, 'flat');
  assert.match(flat.note, /Not significant yet/);
  // conversions never exceed visitors
  assert.equal(analyse([row('a', 10, 50), row('b', 10, 1)], 'cart')[0].rate, 1);
});
