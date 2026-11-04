// Monthly site report, pure parts: Dubai months and the send window, per-site facts (checks history, SSL, SPF / DKIM /
// DMARC, backups, usage), sections left out without data, tips (help videos; products only with a real catalog price),
// and the email / portal HTML in English and Arabic. Run: node --test --experimental-strip-types tests/cx-report.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOf, prevMonth, nextMonth, monthRange, dayOfMonth, windowMonth, dueAt, slot, pickableMonths, normalizeReport, buildReport, siteChecks, siteSsl, siteMail,
  pickTips, isEmpty, headline, type HealthFact, type DayFact, type ServiceFact, type RenewalFact,
} from '../lib/cx/report-core.ts';
import { reportEmail, niceDate, monthName } from '../lib/cx/report-email.ts';
import { verifyUnsub, signUnsub } from '../lib/reminders/core.ts';

const NOW = Date.parse('2026-11-01T06:00:00Z'); // 10:00 Dubai on 1 Nov
const DAY = 86400_000;
const cfg = normalizeReport({ enabled: true });
const title = (k: string) => ({ site_down: 'Website is not reachable', ssl_expiring: 'SSL certificate close to expiry', dmarc_missing: 'DMARC missing' } as Record<string, string>)[k] || k;

const health = (o: Partial<HealthFact> = {}): HealthFact => ({
  domain: 'shop.example', sources: ['registered', 'service'], serviceId: 102, lastChecked: NOW - 3600_000, issues: {},
  checks: { tls: { connected: true, validTo: new Date(NOW + 60 * DAY).toISOString(), daysLeft: 60, issuer: "Let's Encrypt" }, mail: { mx: [{}], spf: ['v=spf1 a mx ~all'], dmarc: ['v=DMARC1; p=none'], dkim: 1 } },
  ...o,
});
const days = (domain: string, n: number, bad: Record<number, string[]> = {}): DayFact[] =>
  Array.from({ length: n }, (_, i) => ({ domain, day: `2026-10-${String(i + 1).padStart(2, '0')}`, checks: 2, status: bad[i + 1] ? 'warning' : 'ok', issues: bad[i + 1] || [] }));
const svc = (o: Partial<ServiceFact> = {}): ServiceFact => ({ id: 102, domain: 'shop.example', product: 'Hostia Ultra', pid: 2, status: 'Active', usage: { disk: { used: 8400, limit: 10240 }, bw: { used: 21000, limit: null } }, backups: { count: 6, latest: '2026-10-31' }, ...o });

test('Dubai months, ranges and the send window', () => {
  assert.equal(monthOf(Date.parse('2026-10-31T20:30:00Z')), '2026-11'); // 00:30 on 1 Nov in Dubai
  assert.equal(monthOf(Date.parse('2026-10-31T19:30:00Z')), '2026-10');
  assert.equal(prevMonth('2026-01'), '2025-12'); assert.equal(nextMonth('2026-12'), '2027-01');
  assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(dayOfMonth(NOW), 1);
  assert.equal(windowMonth(NOW, cfg), '2026-10');
  assert.equal(windowMonth(Date.parse('2026-11-03T06:00:00Z'), cfg), '2026-10', 'one catch-up day after the 2-day window');
  assert.equal(windowMonth(Date.parse('2026-11-04T06:00:00Z'), cfg), null);
  assert.deepEqual(pickableMonths(NOW, 3), ['2026-10', '2026-09', '2026-08']);
  assert.deepEqual(pickableMonths(NOW, 12, '2026-09'), ['2026-10', '2026-09']);
});

test('each customer gets a stable slot spread over the window (08:00 on the 1st to 18:00 on day 2, Dubai)', () => {
  const start = Date.parse('2026-11-01T04:00:00Z'), end = Date.parse('2026-11-02T14:00:00Z');
  const slots = Array.from({ length: 400 }, (_, i) => dueAt(i + 1, '2026-10', cfg));
  assert.ok(slots.every((t) => t >= start && t < end));
  assert.equal(dueAt(7, '2026-10', cfg), dueAt(7, '2026-10', cfg));
  assert.ok(slots.filter((t) => t < start + 19 * 3600_000).length > 100 && slots.filter((t) => t >= start + 24 * 3600_000).length > 100, 'both days get a share');
  assert.ok(slot(1, '2026-10') !== slot(1, '2026-11'));
});

test('checks history: days checked, days with problems, found vs fixed vs still open, notes ignored', () => {
  const c = siteChecks(days('shop.example', 31, { 3: ['site_down'], 4: ['site_down', 'ns_external'], 20: ['dmarc_missing'] }), health({ issues: { dmarc_missing: { sev: 'warning' }, ns_external: { sev: 'info' } } }))!;
  assert.equal(c.days, 31); assert.equal(c.issueDays, 3); assert.equal(c.downDays, 2);
  assert.deepEqual(c.found, ['dmarc_missing', 'site_down']); assert.deepEqual(c.resolved, ['site_down']); assert.deepEqual(c.open, ['dmarc_missing']);
  assert.equal(siteChecks([], health()), null, 'no history = no section (never invented)');
});

test('SSL: ok / expiring / problem, and no section without a TLS result', () => {
  assert.equal(siteSsl(health(), NOW)!.state, 'ok');
  assert.equal(siteSsl(health({ checks: { tls: { connected: true, validTo: new Date(NOW + 9 * DAY).toISOString() } } }), NOW)!.state, 'expiring');
  assert.equal(siteSsl(health({ issues: { ssl_name: { sev: 'critical' } } }), NOW)!.state, 'problem');
  assert.equal(siteSsl(health({ checks: { tls: null } }), NOW), null);
  assert.equal(siteSsl(health({ checks: { tls: { connected: false } } }), NOW), null);
});

test('SPF / DKIM / DMARC from the check and its findings; DKIM only when it was looked up', () => {
  assert.deepEqual(siteMail(health()), { spf: 'ok', dkim: 'ok', dmarc: 'ok' });
  assert.deepEqual(siteMail(health({ issues: { spf_multiple: { sev: 'warning' }, dmarc_missing: { sev: 'warning' } }, checks: { mail: { spf: ['a', 'b'], dmarc: [], dkim: 0 } } })), { spf: 'invalid', dkim: null, dmarc: 'missing' });
  assert.equal(siteMail(health({ checks: { mail: null } })), null);
});

test('report: hosting site first, panel facts attached, empty sites dropped, renewals 0..60 days', () => {
  const r = buildReport({
    month: '2026-10', now: NOW, clientId: 1, name: 'Demo',
    health: [health({ domain: 'blog.example', sources: ['registered'], serviceId: null, checks: null }), health()],
    days: days('shop.example', 31), services: [svc()],
    renewals: [{ kind: 'domain', name: 'shop.example', date: '2026-11-20', days: 19, price: '$13.99', auto: true }, { kind: 'service', name: 'Hostia Ultra', date: '2027-03-01', days: 120, price: '$59.99', auto: null }],
  });
  assert.deepEqual(r.sites.map((s) => s.domain), ['shop.example'], 'blog.example has no data at all: left out');
  const s = r.sites[0];
  assert.equal(s.hosting, true); assert.equal(s.usage!.disk!.pct, 82); assert.equal(s.usage!.bw!.pct, null);
  assert.deepEqual(s.backups, { count: 6, latest: '2026-10-31' });
  assert.equal(r.renewals.length, 1);
  assert.ok(!isEmpty(r));
  assert.equal(headline(r), 'attention', 'disk at 82%');
});

test('tips: problems first, at most two, product only with a real catalog offer', () => {
  const r = buildReport({ month: '2026-10', now: NOW, clientId: 1, name: 'Demo', health: [health({ issues: { dmarc_missing: { sev: 'warning' } }, checks: { ...health().checks!, mail: { spf: ['v=spf1'], dmarc: [], dkim: 1 } } })], days: days('shop.example', 5), services: [svc()], renewals: [] });
  assert.deepEqual(r.tips.map((t) => t.key), ['email_auth'], 'disk tip needs a catalog offer');
  assert.equal(r.tips[0].href, '/help/add-a-dns-record');
  const offer = { name: 'Hostia Infinity', url: 'https://globalhostia.com/p/hostia-infinity', price: '$99.99', cycle: 'annually' };
  const r2 = buildReport({ month: '2026-10', now: NOW, clientId: 1, name: 'Demo', health: [health({ issues: { site_down: { sev: 'critical' }, dmarc_missing: { sev: 'warning' } } })], days: days('shop.example', 5, { 5: ['site_down'] }), services: [svc()], renewals: [], offers: { upgrade: new Map([[102, offer]]) } });
  assert.deepEqual(r2.tips.map((t) => t.key), ['site_down', 'email_auth']);
  const r3 = buildReport({ month: '2026-10', now: NOW, clientId: 1, name: 'Demo', health: [health()], days: days('shop.example', 5), services: [svc()], renewals: [], offers: { upgrade: new Map([[102, offer]]) } });
  assert.equal(r3.tips[0].key, 'disk'); assert.equal(r3.tips[0].product!.price, '$99.99');
  const r4 = buildReport({ month: '2026-10', now: NOW, clientId: 1, name: 'Demo', health: [health()], days: days('shop.example', 5), services: [svc()], renewals: [], offers: { upgrade: new Map([[102, offer]]) }, productTips: false });
  assert.notEqual(r4.tips[0]?.key, 'disk');
  // domain-only customer, all fine: hosting plan tip only with an offer
  const dom = health({ sources: ['registered'], serviceId: null });
  assert.deepEqual(pickTips(buildReport({ month: '2026-10', now: NOW, clientId: 2, name: '', health: [dom], days: days('shop.example', 3), services: [], renewals: [] }).sites, [], { products: true, hasHosting: false }), []);
  const withOffer = pickTips(buildReport({ month: '2026-10', now: NOW, clientId: 2, name: '', health: [dom], days: days('shop.example', 3), services: [], renewals: [] }).sites, [], { products: true, hasHosting: false, hosting: { ...offer, name: 'Hostia Lite', price: '$2.99', cycle: 'monthly' } });
  assert.equal(withOffer[0].key, 'hosting');
});

test('nothing to report: no site data and no renewal', () => {
  const r = buildReport({ month: '2026-10', now: NOW, clientId: 3, name: '', health: [health({ checks: null })], days: [], services: [], renewals: [] });
  assert.ok(isEmpty(r));
});

const renewals: RenewalFact[] = [{ kind: 'domain', name: 'shop.example', date: '2026-11-20', days: 19, price: '$13.99', auto: false }];
const full = () => buildReport({ month: '2026-10', now: NOW, clientId: 1, name: 'Demo', health: [health({ issues: { dmarc_missing: { sev: 'warning' } }, checks: { ...health().checks!, mail: { spf: ['x'], dmarc: [], dkim: 1 } } })], days: days('shop.example', 31, { 3: ['site_down'] }), services: [svc()], renewals });

test('email: subject, sections, real values only, unsubscribe link, Smarty-safe', () => {
  const tok = signUnsub({ e: 'demo@example.com', c: 1, s: 'report' }, 'x'.repeat(40));
  assert.equal(verifyUnsub(tok, 'x'.repeat(40))!.s, 'report');
  const m = reportEmail({ lang: 'en', data: full(), site: 'https://globalhostia.com', issueTitle: title, footer: { unsubUrl: `https://globalhostia.com/account/unsubscribe?t=${tok}`, prefsUrl: 'https://globalhostia.com/account/settings#reminders', why: 'Why' } });
  assert.equal(m.subject, 'Your site report: October 2026');
  for (const s of ['Checked on 31 days', 'problems on 1 day', 'not reachable on 1 day', 'Fixed since', 'Website is not reachable', 'Valid until', 'DMARC missing', '6 backups, latest 31 Oct 2026', '8.2 GB of 10 GB (82%)', '20.5 GB (no limit)', '$13.99', 'Auto-renew off', '/help/add-a-dns-record', '/account/reports?m=2026-10', 'Unsubscribe'])
    assert.ok(m.html.includes(s) || m.html.includes(s.replace("'", '&#39;')), `missing: ${s}`);
  assert.ok(!/[{}]/.test(m.html.replace(/&#123;|&#125;/g, '')), 'no raw braces for WHMCS Smarty');
  assert.ok(m.text.includes('shop.example') && m.text.includes('Unsubscribe:'));
});

test('email: sections without data are left out; embed mode for the portal', () => {
  const r = buildReport({ month: '2026-10', now: NOW, clientId: 1, name: '', health: [health({ checks: { tls: { connected: true, validTo: new Date(NOW + 80 * DAY).toISOString() }, mail: null } })], days: [], services: [], renewals: [] });
  const m = reportEmail({ lang: 'en', data: r, site: 'https://globalhostia.com', issueTitle: title, embed: true });
  assert.ok(m.html.includes('SSL certificate'));
  for (const s of ['Our checks', 'Email authentication', 'Backups', 'Disk space', 'Bandwidth', 'Unsubscribe', '<h1']) assert.ok(!m.html.includes(s), `should be absent: ${s}`);
  assert.ok(m.html.includes('<h2') && m.html.includes('Nothing renews in the next 60 days.'));
});

test('Arabic: RTL wrapper, Arabic month, labels, Latin digits for dates', () => {
  const m = reportEmail({ lang: 'ar', data: full(), site: 'https://globalhostia.com', issueTitle: title, footer: { unsubUrl: 'https://globalhostia.com/u', prefsUrl: 'https://globalhostia.com/p', why: 'لماذا' } });
  assert.ok(m.html.startsWith('<div dir="rtl" lang="ar"'));
  assert.equal(m.subject, 'تقرير موقعك: أكتوبر 2026');
  assert.ok(m.html.includes('النسخ الاحتياطية') && m.html.includes('31 أكتوبر 2026'));
  assert.equal(niceDate('2026-02-05', 'en'), '5 Feb 2026'); assert.equal(monthName('2026-12', 'ar'), 'ديسمبر 2026');
});
