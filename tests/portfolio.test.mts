// Domain portfolio: rows, filters, sorting, bulk validation, CSV and the bulk result round trip.
// Run: node --test --experimental-strip-types tests/portfolio.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toRows, parseFilter, matches, sortRows, summarize, parseBulk, eligible, bulkQuery, parseBulkResult, toCsv, csvCell, filterQuery, isHostname, idList, statusGroup, expiryTone, BULK_MAX,
} from '../lib/portal/portfolio.ts';

const NOW = Date.parse('2026-11-03T00:00:00Z');
const day = (n: number) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);
const domains = [
  { id: 301, domainname: 'Demo-Brand.com', status: 'Active', regdate: day(-345), expirydate: day(20), recurringamount: '13.99', regperiod: 1, donotrenew: false },
  { id: 302, domainname: 'demo.ae', status: 'Active', expirydate: day(265), recurringamount: '35.00', donotrenew: true },
  { id: 305, domainname: 'demo-legacy.org', status: 'Grace', expirydate: day(-3), donotrenew: '1' },
  { id: 306, domainname: 'demo-labs.io', status: 'Active', expirydate: day(55), recurringamount: '49.00' },
  { id: 307, domainname: 'gone.com', status: 'Cancelled', expirydate: day(10), donotrenew: true },
  { id: 308, domainname: 'pending.net', status: 'Pending Transfer', expirydate: '0000-00-00' },
  { id: 0, domainname: 'broken.com', status: 'Active' },
];
const rows = toRows(domains, NOW);
const ids = (rs: { id: number }[]) => rs.map((r) => r.id);

test('rows: normalised names, status groups, days, auto-renew, amounts', () => {
  assert.deepEqual(ids(rows), [301, 302, 305, 306, 307, 308]);
  const r = rows.find((x) => x.id === 301)!;
  assert.equal(r.name, 'demo-brand.com'); assert.equal(r.days, 20); assert.equal(r.autoRenew, true); assert.equal(r.amount, 13.99);
  assert.equal(rows.find((x) => x.id === 305)!.group, 'grace');
  assert.equal(rows.find((x) => x.id === 305)!.autoRenew, false);
  assert.equal(rows.find((x) => x.id === 308)!.days, null);
  assert.equal(rows.find((x) => x.id === 302)!.amount, 35);
  assert.equal(statusGroup('Transferred Away'), 'closed');
  assert.equal(expiryTone(-3), 'bad'); assert.equal(expiryTone(30), 'warn'); assert.equal(expiryTone(200), 'muted');
});

test('filters: search, status, expiring windows, auto-renew off, external nameservers', () => {
  const f = (q: Record<string, string>, ns?: Map<number, any>) => ids(rows.filter((r) => matches(r, parseFilter(q), ns?.get(r.id))));
  assert.deepEqual(f({}), [301, 302, 305, 306, 307, 308]);
  assert.deepEqual(f({ q: 'LABS' }), [306]);
  assert.deepEqual(f({ status: 'grace' }), [305]);
  assert.deepEqual(f({ exp: '30' }), [301, 305]); // grace + overdue counts as expiring; cancelled does not
  assert.deepEqual(f({ exp: '90' }), [301, 305, 306]);
  assert.deepEqual(f({ ar: 'off' }), [302, 305]); // cancelled domains are not "auto-renew off"
  const ns = new Map([[301, 'ours'], [302, 'external'], [306, 'mixed']]);
  assert.deepEqual(f({ ns: 'ext' }, ns), [302, 306]);
  assert.deepEqual(f({ ns: 'ext' }), []); // nameservers not known yet: nothing claims to be external
  assert.deepEqual(f({ exp: '30', ar: 'off' }), [305]);
});

test('filter parsing rejects junk and keeps defaults out of the URL', () => {
  const p = parseFilter({ q: ' <script>Demo ', status: 'evil', exp: '7', sort: 'drop table', ar: 'yes', ns: 'ext' });
  assert.deepEqual(p, { q: 'scriptdemo', status: '', exp: '', ar: '', ns: 'ext', sort: 'expiry' });
  assert.equal(filterQuery(parseFilter({ sort: 'expiry' })), '');
  assert.equal(filterQuery(parseFilter({ exp: '30', sort: 'name' })), '?exp=30&sort=name');
  assert.deepEqual(parseFilter(new URLSearchParams('q=demo&status=active&exp=90')), { q: 'demo', status: 'active', exp: '90', ar: '', ns: '', sort: 'expiry' });
});

test('sorting', () => {
  assert.deepEqual(ids(sortRows(rows, 'expiry')), [305, 307, 301, 306, 302, 308]);
  assert.deepEqual(ids(sortRows(rows, 'expiry_desc')), [308, 302, 306, 301, 307, 305]);
  // locale order (punctuation-insensitive): demo-brand, demo-labs, demo-legacy, demo.ae, gone, pending
  assert.deepEqual(sortRows(rows, 'name').map((r) => r.name).slice(0, 3), ['demo-brand.com', 'demo-labs.io', 'demo-legacy.org']);
  assert.deepEqual(sortRows(rows, 'name').map((r) => r.name).slice(-2), ['gone.com', 'pending.net']);
  assert.deepEqual(ids(sortRows(rows, 'status')).slice(0, 2), [305, 301]);
});

test('summary counts', () => {
  assert.deepEqual(summarize(rows), { total: 6, active: 3, exp30: 2, exp90: 3, arOff: 2 });
});

test('bulk validation: action, selection, limits', () => {
  assert.deepEqual(parseBulk('lock', ['d:301', '302', 'd:301']), { ok: true, action: 'lock', ids: [301, 302] });
  assert.deepEqual(parseBulk('delete_everything', ['d:301']), { ok: false, error: 'action' });
  assert.deepEqual(parseBulk('lock', []), { ok: false, error: 'nosel' });
  assert.deepEqual(parseBulk('lock', ['d:301', 'x:9']), { ok: false, error: 'invalid' });
  assert.deepEqual(parseBulk('lock', ["301 OR 1=1"]), { ok: false, error: 'invalid' });
  assert.deepEqual(parseBulk('unlock', Array.from({ length: BULK_MAX + 1 }, (_, i) => `d:${i + 1}`)), { ok: false, error: 'toomany' });
  assert.equal(parseBulk('ns_ours', Array.from({ length: BULK_MAX }, (_, i) => `d:${i + 1}`)).ok, true);
});

test('bulk eligibility per status', () => {
  assert.equal(eligible('autorenew_off', 'Grace'), true);
  assert.equal(eligible('autorenew_on', 'Redemption'), true);
  assert.equal(eligible('autorenew_on', 'Cancelled'), false);
  assert.equal(eligible('lock', 'Active'), true);
  assert.equal(eligible('lock', 'Grace'), false);
  assert.equal(eligible('ns_ours', 'Pending'), false);
});

test('bulk result survives the redirect query', () => {
  const r = { action: 'lock' as const, done: [301, 306], skipped: [302], failed: [{ id: 305, reason: 'state' as const }, { id: 9, reason: 'api' as const }] };
  const q = new URLSearchParams(bulkQuery(r));
  assert.deepEqual(parseBulkResult(q), r);
  assert.equal(parseBulkResult(new URLSearchParams('bk=rm_rf')), null);
  assert.deepEqual(parseBulkResult(new URLSearchParams('bk=unlock&bf=301-hack.302-api'))!.failed, [{ id: 302, reason: 'api' }]);
});

test('CSV: quoting, formula injection guard, BOM, CRLF', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+971'), "'+971");
  assert.equal(csvCell(null), '');
  const csv = toCsv(rows.slice(0, 2), { currency: 'USD', ns: new Map([[301, ['ns1.globalhostia.com', 'ns2.globalhostia.com']]]) });
  assert.ok(csv.startsWith('\ufeffDomain,Status,'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], `demo-brand.com,Active,${day(-345)},${day(20)},20,On,13.99,USD,1,ns1.globalhostia.com ns2.globalhostia.com`);
  assert.equal(lines[2], `demo.ae,Active,,${day(265)},265,Off,35.00,USD,1,`);
});

test('hostnames and id lists', () => {
  assert.ok(isHostname('demo-brand.com')); assert.ok(isHostname('xn--mgbh0fb.xn--mgbaam7a8h'));
  assert.ok(!isHostname('localhost')); assert.ok(!isHostname('127.0.0.1')); assert.ok(!isHostname('-bad.com'));
  assert.deepEqual(idList('1,2,d:3,2,x,-4'), [1, 2, 3]);
  assert.deepEqual(idList(['5', '6,7'], 2), [5, 6]);
});
