// Renewal centre grouping / totals / selection. Run: node --test --experimental-strip-types tests/renewals.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenewals, groupRenewals, groupOf, relDays, totals, selectionTotals, defaultSelected, parseSelection, domainPrice, daysFrom,
} from '../lib/portal/renewal-plan.ts';

const NOW = Date.parse('2026-11-03T00:00:00Z');
const day = (n: number) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);

const products = [
  { id: 101, name: 'Cloud VPS 4', domain: 'vps1.example.com', status: 'Active', billingcycle: 'Monthly', recurringamount: '24.00', nextduedate: day(12) },
  { id: 102, name: 'Hostia Ultra', status: 'Active', billingcycle: 'Annually', recurringamount: '59.99', nextduedate: day(140) },
  { id: 105, name: 'Email', status: 'Active', billingcycle: 'Monthly', recurringamount: '4.00', nextduedate: day(-3) },
  { id: 106, name: 'Old', status: 'Suspended', billingcycle: 'Annually', recurringamount: '29.99', nextduedate: day(-141) },
  { id: 103, name: 'Cancelled SSL', status: 'Cancelled', billingcycle: 'Annually', recurringamount: '9.23', nextduedate: day(-30) },
  { id: 107, name: 'Free plan', status: 'Active', billingcycle: 'Free Account', recurringamount: '0.00', nextduedate: day(5) },
  { id: 108, name: 'One-off', status: 'Active', billingcycle: 'One Time', recurringamount: '10.00', nextduedate: day(5) },
  { id: 109, name: 'No date', status: 'Active', billingcycle: 'Monthly', recurringamount: '1.00', nextduedate: '0000-00-00' },
];
const domains = [
  { id: 301, domainname: 'Demo-Brand.com', status: 'Active', expirydate: day(20), recurringamount: '13.99', regperiod: 1, donotrenew: false },
  { id: 305, domainname: 'demo-legacy.org', status: 'Grace', expirydate: day(-3), regperiod: 1, donotrenew: true },
  { id: 306, domainname: 'demo-labs.io', status: 'Active', expirydate: day(55), recurringamount: '49.00', regperiod: 2, donotrenew: '1' },
  { id: 307, domainname: 'gone.com', status: 'Cancelled', expirydate: day(10), recurringamount: '13.99' },
  { id: 308, domainname: 'pending.com', status: 'Pending', expirydate: day(10), recurringamount: '13.99' },
  { id: 309, domainname: 'nolist.xyz', status: 'Redemption', expirydate: day(-40), regperiod: 1 },
  { id: 310, domainname: 'free.com', status: 'Active', expirydate: day(30), recurringamount: '0.00', regperiod: 1 },
];
const tld = { org: { 1: '12.65' }, com: { 1: '13.99' } };
const inv = { services: new Map([[101, 5001]]), domains: new Map([[301, 5002]]) };

test('daysFrom / groupOf boundaries', () => {
  assert.equal(daysFrom(day(0), NOW), 0);
  assert.equal(daysFrom(day(-1), NOW), -1);
  assert.equal(daysFrom('0000-00-00', NOW), null);
  assert.equal(daysFrom('', NOW), null);
  assert.equal(groupOf(-1), 'overdue');
  assert.equal(groupOf(0), 'soon');
  assert.equal(groupOf(30), 'soon');
  assert.equal(groupOf(31), 'next');
  assert.equal(groupOf(90), 'next');
  assert.equal(groupOf(91), 'later');
});

test('relative labels', () => {
  assert.equal(relDays(12), 'in 12 days');
  assert.equal(relDays(1), 'Tomorrow');
  assert.equal(relDays(0), 'Due today');
  assert.equal(relDays(0, 'domain'), 'Expires today');
  assert.equal(relDays(-141), '141 days overdue');
  assert.equal(relDays(-1), '1 day overdue');
  assert.equal(relDays(-3, 'domain'), 'Expired 3 days ago');
});

test('buildRenewals: only renewing statuses, recurring cycles and valid dates; sorted soonest first', () => {
  const rows = buildRenewals(products, domains, { inv, tld, now: NOW });
  assert.deepEqual(rows.map((r) => r.key), ['s:106', 'd:309', 'd:305', 's:105', 's:101', 'd:301', 'd:310', 'd:306', 's:102']);
  const vps = rows.find((r) => r.key === 's:101')!;
  assert.equal(vps.invoiceId, 5001);
  assert.equal(vps.amount, 24);
  assert.equal(vps.cycle, 'Monthly');
  assert.equal(vps.product, 'vps1.example.com');
  const brand = rows.find((r) => r.key === 'd:301')!;
  assert.equal(brand.name, 'demo-brand.com');
  assert.equal(brand.invoiceId, 5002);
  assert.equal(brand.autoRenew, true);
  assert.equal(rows.find((r) => r.key === 'd:306')!.autoRenew, false);
  assert.equal(rows.find((r) => r.key === 'd:306')!.cycle, '2 years');
});

test('domain prices: billing record first, TLD renewal price only when missing, never invented', () => {
  assert.deepEqual(domainPrice({ domainname: 'a.com', recurringamount: '13.99' }, tld), { amount: 13.99, from: 'billing' });
  assert.deepEqual(domainPrice({ domainname: 'a.com', recurringamount: '0.00' }, tld), { amount: 0, from: 'billing' });
  assert.deepEqual(domainPrice({ domainname: 'legacy.org', regperiod: 1 }, tld), { amount: 12.65, from: 'tld' });
  assert.deepEqual(domainPrice({ domainname: 'legacy.org', regperiod: 2 }, tld), { amount: null, from: null });
  assert.deepEqual(domainPrice({ domainname: 'x.xyz' }, tld), { amount: null, from: null });
  assert.deepEqual(domainPrice({ domainname: 'x.org' }), { amount: null, from: null });
});

test('groups and running totals', () => {
  const g = groupRenewals(buildRenewals(products, domains, { inv, tld, now: NOW }));
  assert.deepEqual(g.map((x) => x.key), ['overdue', 'soon', 'next', 'later']);
  const [overdue, soon, next, later] = g;
  assert.deepEqual(overdue.rows.map((r) => r.key), ['s:106', 'd:309', 'd:305', 's:105']);
  assert.deepEqual(overdue.totals, { count: 4, amount: 46.64, unpriced: 1 }); // 29.99 + 12.65 + 4.00; .xyz has no price
  assert.deepEqual(soon.totals, { count: 3, amount: 37.99, unpriced: 0 }); // 24 + 13.99 + 0
  assert.deepEqual(next.totals, { count: 1, amount: 49, unpriced: 0 });
  assert.deepEqual(later.totals, { count: 1, amount: 59.99, unpriced: 0 });
});

test('default selection = overdue + next 30 days; selection totals', () => {
  const rows = buildRenewals(products, domains, { inv, tld, now: NOW });
  const sel = rows.filter(defaultSelected).map((r) => r.key);
  assert.deepEqual(sel, ['s:106', 'd:309', 'd:305', 's:105', 's:101', 'd:301', 'd:310']);
  assert.deepEqual(selectionTotals(rows, sel), { count: 7, amount: 84.63, unpriced: 1 });
  assert.deepEqual(selectionTotals(rows, ['d:306', 'nope']), { count: 1, amount: 49, unpriced: 0 });
  assert.deepEqual(totals([]), { count: 0, amount: 0, unpriced: 0 });
});

test('empty account: no rows, all groups empty', () => {
  const g = groupRenewals(buildRenewals([], [], { now: NOW }));
  assert.ok(g.every((x) => x.rows.length === 0 && x.totals.count === 0));
});

test('parseSelection: only d:/s: ids, deduplicated, junk ignored', () => {
  assert.deepEqual(parseSelection(['d:301', 's:101', 'd:301', 'x:1', 'd:abc', 'd:-1', '', null, 'd:12345678901', 's:105']), { domains: [301], services: [101, 105] });
});
