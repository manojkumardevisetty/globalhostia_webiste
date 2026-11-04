// Client experience, unit: hosting usage metrics and thresholds, the once-per-month alert plan, the alert email (EN + AR),
// upgrade helpers (billing cycles, quote parsing, payment method choice), and the welcome checklist rules (who sees it,
// target, step status, progress, "is this the default page?").
// Run: node --test --experimental-strip-types tests/cx-usage.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUsage, DEFAULT_USAGE, fromPanel, fromWhmcs, pctOf, levelOf, worstOf, planAlerts, alertItem, monthKey, usageEmail, alertSubject, fmtAmount,
  cycleKey, parseQuote, paymentMethodFor, featuresOf, type Metric,
} from '../lib/cx/usage-core.ts';
import {
  recentPurchases, pickTarget, shouldShow, buildSteps, progress, siteLive, actionFor, stale, EMPTY_STATE, STEPS, isStep, type ObState, type Target,
} from '../lib/cx/onboarding-core.ts';

const D = 86400_000;
const NOW = Date.parse('2026-11-04T10:00:00Z');
const day = (n: number) => new Date(NOW + n * D).toISOString().slice(0, 10);
const on = (p: any = {}) => normalizeUsage({ ...DEFAULT_USAGE, enabled: true, ...p });

/* ---------------------------------------------------------------- settings */
test('usage config: defaults, clamping, warn < critical, copy fallback', () => {
  const d = normalizeUsage(undefined);
  assert.equal(d.enabled, false);
  assert.equal(d.warn, 80); assert.equal(d.critical, 95);
  assert.equal(d.checklist, true);
  const c = normalizeUsage({ warn: 97, critical: 90, copy: { en: { subject: '  ' }, ar: { intro: 'نص' } }, metrics: { inodes: false } });
  assert.equal(c.warn, 97); assert.equal(c.critical, 98, 'critical is pushed above warn');
  assert.equal(c.copy.en.subject, DEFAULT_USAGE.copy.en.subject);
  assert.equal(c.copy.ar.intro, 'نص');
  assert.equal(c.metrics.inodes, false); assert.equal(c.metrics.disk, true);
  assert.equal(normalizeUsage({ warn: 10, critical: 500 }).warn, 50);
  assert.equal(normalizeUsage({ warn: 10, critical: 500 }).critical, 100);
});

/* ---------------------------------------------------------------- metrics */
test('metrics: panel rows map to disk / bandwidth / inodes / mailboxes; unlimited and zero limits never alert', () => {
  const m = fromPanel([
    { key: 'quota', used: 9850, limit: 10240 }, { key: 'bandwidth', used: 21000, limit: null }, { key: 'inode', used: 205000, limit: 250000 },
    { key: 'nemails', used: 3, limit: 10 }, { key: 'vdomains', used: 2, limit: 5 }, { key: 'mysql', used: 1, limit: 0 },
  ]);
  assert.deepEqual(m.map((x) => x.key), ['disk', 'bandwidth', 'inodes', 'mailboxes']);
  assert.equal(m[1].limit, null);
  assert.equal(pctOf(m[0]), 96.2);
  assert.equal(levelOf(pctOf(m[0]), DEFAULT_USAGE), 'critical');
  assert.equal(levelOf(pctOf(m[2]), DEFAULT_USAGE), 'warn');
  assert.equal(levelOf(pctOf(m[3]), DEFAULT_USAGE), 'ok');
  assert.equal(levelOf(null, DEFAULT_USAGE), 'ok');
  const w = worstOf(m, on());
  assert.equal(w.level, 'critical'); assert.equal(w.metric?.key, 'disk');
  assert.equal(worstOf(m, on({ metrics: { disk: false } })).metric?.key, 'inodes', 'switched-off metrics are ignored');
});

test('metrics: WHMCS usage sync fallback, nothing before the first sync', () => {
  assert.deepEqual(fromWhmcs({ diskusage: 0, disklimit: 0, lastupdate: '0000-00-00 00:00:00' }), []);
  const m = fromWhmcs({ diskusage: '8400', disklimit: '10240', bwusage: '21000', bwlimit: '0', lastupdate: '2026-11-04 03:00:00' });
  assert.equal(m.length, 2);
  assert.equal(m[0].key, 'disk'); assert.equal(m[0].limit, 10240);
  assert.equal(m[1].limit, null, '0 = unlimited');
});

test('amounts: MB / GB / TB and counts', () => {
  assert.equal(fmtAmount(512, 'MB'), '512 MB');
  assert.equal(fmtAmount(9850, 'MB'), '9.6 GB');
  assert.equal(fmtAmount(2 * 1048576, 'MB'), '2 TB');
  assert.equal(fmtAmount(205000, ''), '205,000');
});

/* ---------------------------------------------------------------- alert plan */
const M = (key: Metric['key'], used: number, limit: number | null): Metric => ({ key, used, limit, unit: key === 'disk' || key === 'bandwidth' ? 'MB' : '' });
test('alert plan: one email per threshold crossing per month, critical first, never warn after critical', () => {
  const cfg = on();
  const metrics = [M('disk', 9850, 10240), M('inodes', 205000, 250000), M('mailboxes', 3, 10), M('bandwidth', 1, null)];
  const first = planAlerts(7, metrics, cfg, new Map());
  assert.deepEqual(first.map((l) => [l.metric, l.level]), [['disk', 'critical'], ['inodes', 'warn']]);
  const sent = new Map([[alertItem(7, 'disk'), ['critical']], [alertItem(7, 'inodes'), ['warn']]]);
  assert.deepEqual(planAlerts(7, metrics, cfg, sent), [], 'same month: nothing again');
  // disk falls back to 85%: critical already went out this month, so no warn email either
  assert.deepEqual(planAlerts(7, [M('disk', 8700, 10240)], cfg, sent), []);
  // inodes grow from warn to critical: that is a new crossing
  assert.deepEqual(planAlerts(7, [M('inodes', 240000, 250000)], cfg, sent).map((l) => l.level), ['critical']);
  // a warn already sent, still at warn: nothing
  assert.deepEqual(planAlerts(7, [M('inodes', 210000, 250000)], cfg, sent), []);
});

test('month key follows Dubai time (the dedup cycle)', () => {
  assert.equal(monthKey(Date.parse('2026-11-30T21:00:00Z')), '2026-12', '01:00 on 1 December in Dubai');
  assert.equal(monthKey(Date.parse('2026-11-30T19:00:00Z')), '2026-11');
});

/* ---------------------------------------------------------------- email */
test('alert email: English and Arabic, subject placeholders, bars, upgrade + unsubscribe links, Smarty-safe', () => {
  const lines = planAlerts(7, [M('disk', 9850, 10240), M('inodes', 205000, 250000)], on(), new Map());
  const base = { name: 'Sara', service: 'Hostia Ultra', domain: 'demo-brand.com', lines, cfg: on(), upgradeUrl: 'https://globalhostia.com/account/services/7/upgrade', panelUrl: 'https://globalhostia.com/account/services/7', unsubUrl: 'https://globalhostia.com/account/unsubscribe?t=abc', prefsUrl: 'https://globalhostia.com/account/settings#reminders' };
  const en = usageEmail({ ...base, lang: 'en' });
  assert.equal(en.subject, 'Action needed: Hostia Ultra is almost out of disk space');
  assert.match(en.html, /dir="ltr"/);
  assert.match(en.html, /\/account\/services\/7\/upgrade/);
  assert.match(en.html, /unsubscribe\?t=abc/);
  assert.match(en.html, /9\.6 GB/);
  assert.match(en.text, /disk space: 96%/);
  assert.ok(!/[{}]/.test(en.html), 'no raw braces in the HTML (WHMCS Smarty)');
  const ar = usageEmail({ ...base, lang: 'ar' });
  assert.match(ar.html, /dir="rtl" lang="ar"/);
  assert.match(ar.subject, /مساحة القرص/);
  assert.match(ar.html, /اعرض الخطط الأكبر وأسعارها/);
  // warning-only subject
  const w = alertSubject(on(), 'en', 'Hostia Lite', { metric: 'inodes', level: 'warn', pct: 82.4, used: 1, limit: 2, unit: '' });
  assert.equal(w, 'Hostia Lite is using 82% of its files and folders (inodes)');
  // a hostile service name is escaped
  const x = usageEmail({ ...base, lang: 'en', service: '<img src=x onerror=1>{$x}' });
  assert.ok(!x.html.includes('<img src=x'));
  assert.ok(!/\{\$x\}/.test(x.html));
});

/* ---------------------------------------------------------------- upgrade helpers */
test('upgrade helpers: cycles, quote parsing, payment method, features', () => {
  assert.equal(cycleKey('Semi-Annually'), 'semiannually');
  assert.equal(cycleKey('Annually'), 'annually');
  assert.equal(cycleKey('Free Account'), null);
  assert.equal(cycleKey('One Time'), 'onetime');
  const q = parseQuote({ newproductid: '3', newproductname: 'Hostia Infinity', daysuntilrenewal: '10', totaldays: '30', newproductbillingcycle: 'monthly', price: '2.33', discount: '0.50' }, 3, 'monthly');
  assert.equal(q.dueToday, 1.83); assert.equal(q.daysLeft, 10); assert.equal(q.newName, 'Hostia Infinity');
  assert.equal(parseQuote({ price: '5.00', total: '4.00' }, 3, 'monthly').dueToday, 4, 'total wins when WHMCS sends it');
  assert.throws(() => parseQuote({ result: 'success' }, 3, 'monthly'), /No price/);
  const methods = [{ module: 'stripe' }, { module: 'banktransfer' }];
  assert.equal(paymentMethodFor({ defaultgateway: 'banktransfer' }, { paymentmethod: 'stripe' }, methods), 'banktransfer');
  assert.equal(paymentMethodFor({ defaultgateway: 'gone' }, { paymentmethod: 'stripe' }, methods), 'stripe');
  assert.equal(paymentMethodFor({}, {}, methods), 'stripe');
  assert.equal(paymentMethodFor({}, {}, []), null);
  assert.deepEqual(featuresOf('10 GB NVMe<br />Unlimited Bandwidth<br />\n5 Websites'), ['10 GB NVMe', 'Unlimited Bandwidth', '5 Websites']);
});

/* ---------------------------------------------------------------- checklist */
const isHosting = (p: any) => /shared|hosting/i.test(String(p.groupname || '')) && !/vps|ssl/i.test(String(p.groupname || '') + ' ' + String(p.name || ''));
const products = [
  { id: 101, name: 'Cloud VPS 4', groupname: 'Servers', domain: 'vps1.demo-brand.com', status: 'Active', regdate: day(-200) },
  { id: 102, name: 'Hostia Ultra', groupname: 'Shared Hosting', domain: 'demo-brand.com', status: 'Active', regdate: day(-400) },
  { id: 104, name: 'Hostia Lite', groupname: 'Shared Hosting', domain: 'demo-blog.com', status: 'Active', regdate: day(-20) },
];
const domains = [{ id: 301, domainname: 'demo-brand.com', status: 'Active', regdate: day(-345) }, { id: 304, domainname: 'demo-store.com', status: 'Active', regdate: day(-30) }];

test('checklist: recent purchases, target is the newest hosting service, domain-only accounts get the domain steps', () => {
  const r = recentPurchases(products, domains, NOW);
  assert.deepEqual(r.services.map((p) => p.id), [104]);
  assert.deepEqual(r.domains.map((d) => d.id), [304]);
  const t = pickTarget(products, domains, NOW, isHosting)!;
  assert.deepEqual(t, { serviceId: 104, domain: 'demo-blog.com', domainId: null, hosting: true });
  const d = pickTarget([], domains, NOW, isHosting)!;
  assert.deepEqual(d, { serviceId: null, domain: 'demo-store.com', domainId: 304, hosting: false });
  const steps = buildSteps(d, { manual: {}, detected: {} }).map((s) => s.id);
  assert.deepEqual(steps, ['domain', 'team', 'ai'], 'no hosting steps without hosting');
  assert.equal(pickTarget([], [], NOW, isHosting), null);
  assert.ok(!recentPurchases(products.slice(0, 2), domains.slice(0, 1), NOW).any, 'nothing bought in 60 days');
});

test('checklist: shown for recent buyers until dismissed; after completion only once more (the celebration)', () => {
  const st = (p: Partial<ObState>): ObState => ({ ...EMPTY_STATE, ...p });
  assert.equal(shouldShow(st({}), true, NOW), true);
  assert.equal(shouldShow(st({}), false, NOW), false);
  assert.equal(shouldShow(st({ startedAt: new Date(NOW - 90 * D).toISOString() }), false, NOW), true, 'started: keeps showing up to 120 days');
  assert.equal(shouldShow(st({ startedAt: new Date(NOW - 130 * D).toISOString() }), false, NOW), false);
  assert.equal(shouldShow(st({ dismissedAt: new Date(NOW).toISOString() }), true, NOW), false);
  assert.equal(shouldShow(st({ completedAt: new Date(NOW).toISOString() }), true, NOW), true);
  assert.equal(shouldShow(st({ completedAt: new Date(NOW).toISOString(), celebratedAt: new Date(NOW).toISOString() }), true, NOW), false);
});

test('checklist: step status (manual wins), progress, completion ignores optional steps, actions', () => {
  const t: Target = { serviceId: 104, domain: 'demo-blog.com', domainId: null, hosting: true };
  let steps = buildSteps(t, { manual: {}, detected: {} });
  assert.equal(steps.length, STEPS.length);
  assert.ok(steps.every((s) => s.status === 'checking'));
  steps = buildSteps(t, { manual: { backups: 'done', wordpress: 'skipped' }, detected: { domain: 'done', ssl: 'done', email: 'todo', site: 'todo', backups: 'todo', team: 'todo', ai: 'unknown' } });
  const by = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.equal(by.domain.status, 'done'); assert.equal(by.domain.auto, true);
  assert.equal(by.backups.status, 'done'); assert.equal(by.backups.auto, false, 'marked by the customer');
  assert.equal(by.wordpress.status, 'skipped');
  assert.equal(by.ai.status, 'todo', 'unknown = still to do (the customer can mark it)');
  let p = progress(steps);
  assert.equal(p.done, 4); assert.equal(p.complete, false); assert.equal(p.next?.id, 'email');
  steps = buildSteps(t, { manual: { email: 'done', site: 'skipped' }, detected: { domain: 'done', ssl: 'done', backups: 'done', wordpress: 'todo', team: 'todo', ai: 'todo' } });
  p = progress(steps);
  assert.equal(p.complete, true, 'required steps closed; optional ones may stay open');
  assert.deepEqual(actionFor('email', t), { kind: 'panel', tab: 'email' });
  assert.deepEqual(actionFor('domain', { ...t, domainId: 301 }), { kind: 'link', href: '/account/domains/301#ac-ns-h' });
  assert.deepEqual(actionFor('ssl', { ...t, hosting: false }), { kind: 'link', href: '/account/health?d=demo-blog.com' });
  assert.ok(isStep('ssl') && !isStep('nope'));
  assert.equal(stale({ detectedAt: new Date(NOW - 5 * 60_000).toISOString() }, NOW, t, t), false);
  assert.equal(stale({ detectedAt: new Date(NOW - 15 * 60_000).toISOString() }, NOW, t, t), true);
  assert.equal(stale({ detectedAt: new Date(NOW).toISOString() }, NOW, t, { ...t, serviceId: 102 }), true, 'a different service: check again');
});

test('website live: real pages vs panel / server default pages', () => {
  const real = `<html><head><title>Demo Blog — notes on hosting</title></head><body><main><h1>Welcome to the Demo Blog</h1><p>${'We write about servers, DNS and the web. '.repeat(20)}</p><footer>Hosted with cPanel</footer></main></body></html>`;
  assert.equal(siteLive(200, real), 'live', 'a footer mentioning a panel is fine on a real page');
  assert.equal(siteLive(200, '<html><head><title>Default Web Page</title></head><body><h1>Default Web Page</h1><p>This is the default index page of your website. This file may be deleted or overwritten without any difficulty.</p></body></html>'), 'default');
  assert.equal(siteLive(200, '<html><body><h1>It works!</h1></body></html>'), 'default');
  assert.equal(siteLive(200, '<title>Index of /</title><h1>Index of /</h1><a href="cgi-bin/">cgi-bin/</a> and more text to pass the length check here'), 'default');
  assert.equal(siteLive(200, '<html><body><h2>This domain has been successfully set up on DirectAdmin</h2><p>Upload your files to public_html.</p></body></html>'), 'default');
  assert.equal(siteLive(200, '<html><body></body></html>'), 'default', 'empty page');
  assert.equal(siteLive(200, '<html><body><img src="hero.jpg"></body></html>'), 'live', 'an image-only page still counts');
  assert.equal(siteLive(500, real), 'down');
  assert.equal(siteLive(undefined, ''), 'down');
  assert.equal(siteLive(301, ''), 'down');
});
