// Client experience, integration: the WHMCS calls of the one-click upgrade against tests/mock-whmcs.mjs (real HTTP, WHMCS
// API shapes): next plans in the same product group with catalog prices, the prorated quote (UpgradeProduct calconly:
// no order is created), the order + invoice; and DirectAdmin usage (tests/mock-da.mjs, CMD_API_SHOW_USER_USAGE / _CONFIG
// through the real parser) turned into metrics and the alert plan.
// Run: node --test --experimental-strip-types tests/cx-int.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { upgradeOptions, quoteUpgrade, placeUpgrade, paymentMethods, paymentMethodFor, fromPanel, planAlerts, worstOf, normalizeUsage, type Call } from '../lib/cx/usage-core.ts';
import { daUsage } from '../lib/hosting/providers/directadmin-parse.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4900 + Math.floor(Math.random() * 90), DA_PORT = PORT + 100;
const URL_ = `http://127.0.0.1:${PORT}/includes/api.php`;
let whmcsProc: ChildProcess, daProc: ChildProcess;

const call: Call = async (action, params = {}) => {
  const body = new URLSearchParams({ action, identifier: 'test', secret: 'test', responsetype: 'json' });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const r = await (await fetch(URL_, { method: 'POST', body })).json() as any;
  if (r.result === 'error') throw new Error(r.message);
  return r;
};
const da = async (cmd: string, user: string) => {
  const r = await fetch(`http://127.0.0.1:${DA_PORT}/${cmd}?json=yes&user=${user}`, { headers: { authorization: 'Basic ' + Buffer.from('admin:mock-key').toString('base64') } });
  return r.json() as Promise<Record<string, any>>;
};

before(async () => {
  whmcsProc = spawn(process.execPath, [path.join(ROOT, 'tests/mock-whmcs.mjs')], { env: { ...process.env, MOCK_PORT: String(PORT) }, stdio: 'ignore' });
  daProc = spawn(process.execPath, [path.join(ROOT, 'tests/mock-da.mjs')], { env: { ...process.env, DA_PORT: String(DA_PORT), DA_CERT: '' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { await call('WhmcsDetails'); await da('CMD_API_SHOW_USERS', ''); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('mocks did not start');
});
after(() => { whmcsProc?.kill(); daProc?.kill(); });

const service = async (id: number) => (await call('GetClientsProducts', { clientid: 1, serviceid: id })).products.product.find((p: any) => p.id === id);

test('next plans: same product group, dearer than the current plan, in the service cycle and client currency', async () => {
  const lite = await service(104); // Hostia Lite, monthly
  const o = await upgradeOptions(call, lite, 'USD');
  assert.equal(o.current?.name, 'Hostia Lite');
  assert.equal(o.current?.price, 2.99);
  assert.deepEqual(o.options.map((x) => [x.name, x.price, x.cycle]), [['Hostia Ultra', 5.99, 'monthly'], ['Hostia Infinity', 9.99, 'monthly']]);
  assert.ok(o.options.every((x) => x.currency === 'USD'));
  assert.ok(o.options[0].features.includes('10 GB NVMe'), 'features from the WHMCS description');
  const ultra = await service(102); // annual
  const u = await upgradeOptions(call, ultra, 'USD');
  assert.deepEqual(u.options.map((x) => [x.name, x.price]), [['Hostia Infinity', 99.99]]);
  // no prices in a currency the products do not have: nothing is offered (never an invented price)
  assert.deepEqual((await upgradeOptions(call, lite, 'EUR')).options, []);
  // a VPS module product that is not in the catalog
  const vps = await service(101);
  assert.equal((await upgradeOptions(call, vps, 'USD')).reason, 'product');
});

test('prorated quote uses calconly and creates no order; confirm creates the order and its invoice', async () => {
  await call('MockReset');
  const lite = await service(104);
  const methods = await paymentMethods(call);
  const pm = paymentMethodFor(await call('GetClientsDetails', { clientid: 1 }), lite, methods)!;
  assert.equal(pm, 'stripe');
  const ordersBefore = (await call('GetOrders', { userid: 1 })).orders.order.length;
  const q = await quoteUpgrade(call, { serviceId: 104, pid: 3, cycle: 'monthly', paymentmethod: pm });
  assert.equal(q.pid, 3);
  assert.ok(q.daysLeft !== null && q.daysLeft >= 9 && q.daysLeft <= 11);
  assert.ok(q.dueToday > 0 && q.dueToday < 9.99 - 2.99, `prorated difference, got ${q.dueToday}`);
  assert.equal((await call('GetOrders', { userid: 1 })).orders.order.length, ordersBefore, 'calconly placed nothing');
  const calls = (await call('MockCalls')).calls.filter((c: any) => c.action === 'UpgradeProduct');
  assert.equal(calls.length, 1); assert.equal(calls[0].calconly, 'true');
  const r = await placeUpgrade(call, { serviceId: 104, pid: 3, cycle: 'monthly', paymentmethod: pm });
  assert.ok(r.orderId > 0 && r.invoiceId > 0);
  const inv = await call('GetInvoice', { invoiceid: r.invoiceId });
  assert.equal(inv.userid, 1); assert.equal(inv.status, 'Unpaid');
  assert.equal(Number(inv.total), q.dueToday, 'the invoice is the quoted amount');
  const sent = (await call('MockCalls')).calls.filter((c: any) => c.action === 'UpgradeProduct');
  assert.equal(sent.length, 2); assert.equal(sent[1].calconly, undefined, 'the order call is not a quote');
  await assert.rejects(quoteUpgrade(call, { serviceId: 104, pid: 20, cycle: 'monthly', paymentmethod: pm }), /Invalid New Product ID/, 'another product group is refused');
  await assert.rejects(quoteUpgrade(call, { serviceId: 104, pid: 3, cycle: 'monthly', paymentmethod: 'bitcoin' }), /Payment Method/);
});

test('DirectAdmin usage → metrics → alert plan (critical disk, warning inodes, unlimited bandwidth)', async () => {
  const [use, conf] = await Promise.all([da('CMD_API_SHOW_USER_USAGE', 'demobran'), da('CMD_API_SHOW_USER_CONFIG', 'demobran')]);
  const m = fromPanel(daUsage(use, conf).items);
  assert.deepEqual(m.map((x) => [x.key, x.used, x.limit]), [['disk', 9850, 10240], ['bandwidth', 21000, null], ['inodes', 205000, 250000], ['mailboxes', 3, 10]]);
  const cfg = normalizeUsage({ enabled: true });
  assert.equal(worstOf(m, cfg).level, 'critical');
  assert.deepEqual(planAlerts(102, m, cfg, new Map()).map((l) => [l.metric, l.level]), [['disk', 'critical'], ['inodes', 'warn']]);
  const quiet = fromPanel(daUsage(await da('CMD_API_SHOW_USER_USAGE', 'demoblog'), await da('CMD_API_SHOW_USER_CONFIG', 'demoblog')).items);
  assert.equal(worstOf(quiet, cfg).level, 'ok');
  assert.deepEqual(planAlerts(104, quiet, cfg, new Map()), []);
});
