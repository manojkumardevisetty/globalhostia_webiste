// "Sell your domain", integration: the flow in lib/sell/core.ts against tests/mock-whmcs.mjs (real HTTP, WHMCS API shapes):
// eligibility from GetClientsDomains, the converted-fee CreateInvoice in the client's currency (AED), the two-product
// AddOrder path (WHMCS prices), InvoicePaid → in_review, cancelled → draft, and the daily check emailing the seller
// through SendEmail when the domain leaves the account. Run: node --test --experimental-strip-types tests/sell-int.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  DEFAULT_SELL, eligibility, linesFor, createFeeInvoice, invoicePaid, pollPayments, dailyCheck, approvePatch, feeContext, sellerMail,
  type Listing, type SellStore, type SellDeps, type Call,
} from '../lib/sell/core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4700 + Math.floor(Math.random() * 200);
const URL_ = `http://127.0.0.1:${PORT}/includes/api.php`;
let proc: ChildProcess;

const call: Call = async (action, params = {}) => {
  const body = new URLSearchParams({ action, identifier: 'test', secret: 'test', responsetype: 'json' });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const r = await (await fetch(URL_, { method: 'POST', body })).json() as any;
  if (r.result === 'error') throw new Error(r.message);
  return r;
};

before(async () => {
  proc = spawn(process.execPath, [path.join(ROOT, 'tests/mock-whmcs.mjs')], { env: { ...process.env, MOCK_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await call('WhmcsDetails'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('mock WHMCS did not start');
});
after(() => { proc?.kill(); });

let seq = 0;
const L = (o: Partial<Listing>): Listing => ({
  id: `lst${++seq}xx`, ref: `SL-INT00${seq}`, domain: 'demo.ae', clientId: 1, whmcsDomainId: 302, status: 'draft', price: '4000.00', currency: 'USD', minOffer: null, acceptOffers: true,
  description: '', category: '', tags: [], featured: false, featuredState: '', featuredInvoiceId: null, invoiceId: null, orderId: null, feeMethod: '', feeAmount: null, feeCurrency: '',
  featuredFeeAmount: null, pending: null, flags: [], rejectReason: '', hiddenReason: '', adminNote: '', listedUntil: null, featuredUntil: null, renewInvoiceId: null, renewState: '',
  renewFeatured: false, reminders: [], ...o,
});
function memStore(rows: Listing[]): SellStore {
  return {
    async get(id) { return rows.find((r) => r.id === id) || null; },
    async update(id, p) { Object.assign(rows.find((x) => x.id === id)!, p); },
    async byInvoice(i) { return rows.filter((r) => r.invoiceId === i || r.featuredInvoiceId === i || r.renewInvoiceId === i); },
    async awaitingPayment() { return rows.filter((r) => (r.status === 'awaiting_payment' && r.invoiceId) || r.featuredState === 'awaiting_payment' || r.renewState === 'awaiting_payment'); },
    async forCheck() { return rows.filter((r) => ['in_review', 'live', 'expired'].includes(r.status)); },
  };
}
const deps = (rows: Listing[], cfg = DEFAULT_SELL): SellDeps => ({
  call, store: memStore(rows), cfg, site: 'https://globalhostia.test',
  mailClient: async (cid, m) => { await call('SendEmail', { id: cid, customtype: 'general', customsubject: m.subject, custommessage: m.html }); },
});
const domainsOf = async (cid: number) => { const r = await call('GetClientsDomains', { clientid: cid, limitnum: 250 }); return Array.isArray(r.domains?.domain) ? r.domains.domain : []; };

test('eligibility from GetClientsDomains: own Active domain ok, expiring / grace / another client refused', async () => {
  const mine = await domainsOf(1);
  assert.equal(eligibility('demo.ae', mine, 1, DEFAULT_SELL).ok, true);
  assert.equal(eligibility('demo-brand.com', mine, 1, DEFAULT_SELL).code, 'expiring', 'expires in 20 days → renew first');
  assert.equal(eligibility('demo-legacy.org', mine, 1, DEFAULT_SELL).code, 'not_active');
  assert.equal(eligibility('other-site.com', mine, 1, DEFAULT_SELL).code, 'not_found', "client 2's domain");
  // even if a caller passed client 2's list, the record must belong to the signed-in client
  assert.equal(eligibility('other-site.com', await domainsOf(2), 1, DEFAULT_SELL).code, 'not_found');
});

test('fallback: CreateInvoice in the client currency (AED, converted with WHMCS rates), one line per domain', async () => {
  await call('MockReset'); await call('MockSetClient', { id: 1, currency_code: 'AED', currency: 2 });
  const q = (await feeContext(call, DEFAULT_SELL, 1)).quote!;
  assert.deepEqual([q.method, q.currency, q.listing, q.featured], ['invoice', 'AED', 55, 184]);
  const a = L({ featuredState: 'requested' }), b = L({ domain: 'demo-labs.io', whmcsDomainId: 306 });
  const rows = [a, b]; const d = deps(rows);
  const r = await createFeeInvoice(d, 1, [{ l: a, kinds: linesFor(a) }, { l: b, kinds: linesFor(b) }]);
  const inv = await call('GetInvoice', { invoiceid: r.invoiceId });
  assert.equal(inv.currencycode, 'AED'); assert.equal(inv.total, '294.00'); assert.equal(inv.items.item.length, 3); assert.equal(inv.paymentmethod, 'stripe');
  assert.match(inv.items.item[0].description, /listing fee.*demo\.ae/i);
  assert.equal(a.status, 'awaiting_payment'); assert.equal(a.feeCurrency, 'AED'); assert.equal(b.invoiceId, r.invoiceId);
  // webhook before payment: verified with GetInvoice → nothing changes
  assert.equal(await invoicePaid(d, r.invoiceId), 0);
  await call('MockPayInvoice', { invoiceid: r.invoiceId });
  assert.equal(await invoicePaid(d, r.invoiceId), 2);
  assert.equal(a.status, 'in_review'); assert.equal(a.featuredState, 'paid'); assert.equal(b.status, 'in_review');
  Object.assign(a, approvePatch(a, 'owner@test'));
  assert.equal(a.status, 'live'); assert.equal(a.featured, true);
  await call('MockSetClient', { id: 1, currency_code: 'USD', currency: 1 });
});

test('preferred: AddOrder of the two WHMCS products (WHMCS prices, emails on), Featured bought later on a separate invoice', async () => {
  await call('MockReset'); await call('MockFeeProducts'); await call('MockSetClient', { id: 1, currency_code: 'AED', currency: 2 });
  const cfg = { ...DEFAULT_SELL, listingPid: '950', featuredPid: '951' };
  const a = L({}); const rows = [a]; const d = deps(rows, cfg);
  const r = await createFeeInvoice(d, 1, [{ l: a, kinds: ['listing'] }]);
  assert.equal(r.quote.method, 'order'); assert.equal(r.total, 55);
  const { calls } = await call('MockCalls');
  const ao = calls.find((c: any) => c.action === 'AddOrder');
  assert.equal(ao['pid[0]'], '950'); assert.equal(ao['domain[0]'], 'demo.ae'); assert.equal(ao.noemail, 'false'); assert.equal(ao.clientid, '1');
  assert.ok(a.orderId && a.invoiceId);
  await call('MockPayInvoice', { invoiceid: a.invoiceId! });
  assert.deepEqual(await pollPayments(d), { checked: 1, changed: 1, errors: 0 }, 'fallback poll finds the payment');
  Object.assign(a, approvePatch(a, 'owner@test'));
  assert.equal(a.featured, false);
  const f = await createFeeInvoice(d, 1, [{ l: a, kinds: linesFor(a, { featuredOnly: true }) }]);
  assert.equal(f.total, 185); assert.notEqual(f.invoiceId, a.invoiceId);
  await call('MockPayInvoice', { invoiceid: f.invoiceId });
  await invoicePaid(d, f.invoiceId);
  assert.equal(a.featured, true, 'featured at once on a live listing'); assert.equal(String(a.featuredUntil), String(a.listedUntil));
  const sent = (await call('MockSentEmails')).emails;
  assert.ok(sent.some((e: any) => /now featured/.test(e.subject)));
  await call('MockSetClient', { id: 1, currency_code: 'USD', currency: 1 });
});

test('cancelled invoice → back to draft; the daily check hides a domain that left the account and emails the seller', async () => {
  await call('MockReset');
  const a = L({ domain: 'demo-store.com', whmcsDomainId: 304 });
  const rows = [a]; const d = deps(rows);
  const r = await createFeeInvoice(d, 1, [{ l: a, kinds: ['listing'] }]);
  await call('UpdateInvoice', { invoiceid: r.invoiceId, status: 'Cancelled' });
  await pollPayments(d);
  assert.equal(a.status, 'draft'); assert.equal(a.invoiceId, null);

  const live = L({ domain: 'demo-store.com', status: 'live', listedUntil: new Date(Date.now() + 200 * 86400000) });
  const keep = L({ domain: 'demo-labs.io', status: 'live', listedUntil: new Date(Date.now() + 200 * 86400000) });
  const d2 = deps([live, keep]);
  await call('MockSetDomain', { id: 304, status: 'Transferred Away' });
  const res = await dailyCheck(d2);
  assert.equal(res.hidden, 1); assert.equal(live.status, 'suspended'); assert.equal(live.featured, false); assert.equal(keep.status, 'live');
  const sent = (await call('MockSentEmails')).emails;
  const mail = sent.find((e: any) => e.id === 1 && /is hidden/.test(e.subject));
  assert.ok(mail, 'seller emailed through WHMCS SendEmail'); assert.match(mail.message, /no longer active|no longer in your GlobalHostia account/);
  // the buyer-interest email never names the buyer
  const m = sellerMail('request', live, { site: 'https://x', intent: 'buy', amount: '$4,000', commission: 15 });
  assert.ok(!/@|buyer's name/i.test(m.html.replace(/buyer's identity/, '')));
  await call('MockSetDomain', { id: 304, status: 'Active' });
});
