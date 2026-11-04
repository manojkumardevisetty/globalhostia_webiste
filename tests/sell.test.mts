// "Sell your domain" (lib/sell/core.ts): settings, status machine, fees and currency conversion, eligibility / ownership,
// trademark flags, form validation, edits (price now, text to review), the one-year period and renewals, and the flow with
// an in-memory store and a fake WHMCS (webhook paid → in_review, cancelled → draft, daily check delist / expire / remind).
// Run: node --test --experimental-strip-types tests/sell.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSell, DEFAULT_SELL, canMove, TRANSITIONS, SELL_STATUSES, parseRates, convertUsd, roundFee, productPrice, quoteFees, eligibility, recheck,
  trademarkHits, readSellForm, validateSell, editPatch, toOwnRow, sellerActions, addYear, renewedUntil, reminderDue, featuredNow, periodOver, linesFor,
  invoiceState, transferUrl, sellerMail, commissionOf, createFeeInvoice, invoicePaid, pollPayments, dailyCheck, approvePatch, lineAllowed, SellError,
  type Listing, type SellStore, type SellDeps,
} from '../lib/sell/core.ts';

const DAY = 86400000;
const NOW = Date.parse('2026-11-04T10:00:00Z');
const iso = (n: number) => new Date(NOW + n * DAY).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- settings */
test('settings: owner defaults ($15 / $50, 15% commission, 30 days), clamps and cleans', () => {
  const d = normalizeSell(undefined);
  assert.equal(d.listingFeeUsd, 15); assert.equal(d.featuredFeeUsd, 50); assert.equal(d.commissionPct, 15); assert.equal(d.commissionMinUsd, 0);
  assert.equal(d.minExpiryDays, 30); assert.equal(d.enabled, true); assert.equal(d.listingPid, ''); assert.ok(d.trademarkTerms.includes('google'));
  const c = normalizeSell(JSON.stringify({ listingFeeUsd: '-5', commissionPct: 99, listingPid: '12', featuredPid: 'x', trademarkTerms: 'Acme, ab, Big-Brand', refundPolicy: '  ' }));
  assert.equal(c.listingFeeUsd, 0); assert.equal(c.commissionPct, 50); assert.equal(c.listingPid, '12'); assert.equal(c.featuredPid, '');
  assert.deepEqual(c.trademarkTerms, ['acme', 'bigbrand']); assert.equal(c.refundPolicy, DEFAULT_SELL.refundPolicy);
  assert.equal(normalizeSell({ commissionPct: 0 }).commissionPct, 0, '0 = no commission');
  assert.equal(commissionOf(1000, { commissionPct: 15, commissionMinUsd: 0 }), 150);
  assert.equal(commissionOf(100, { commissionPct: 15, commissionMinUsd: 50 }), 50);
  assert.equal(commissionOf(100, { commissionPct: 0, commissionMinUsd: 50 }), 0);
});

/* ---------------------------------------------------------------- status machine */
test('status machine: only the documented moves', () => {
  assert.ok(canMove('draft', 'awaiting_payment')); assert.ok(canMove('awaiting_payment', 'in_review')); assert.ok(canMove('in_review', 'live'));
  assert.ok(canMove('in_review', 'rejected')); assert.ok(canMove('live', 'sold')); assert.ok(canMove('live', 'expired')); assert.ok(canMove('expired', 'live'));
  assert.ok(canMove('live', 'suspended')); assert.ok(canMove('suspended', 'live'));
  assert.ok(!canMove('draft', 'live'), 'never live without review'); assert.ok(!canMove('awaiting_payment', 'live'));
  assert.ok(!canMove('rejected', 'live')); assert.ok(!canMove('sold', 'live')); assert.ok(!canMove('withdrawn', 'draft')); assert.ok(!canMove('nonsense', 'live'));
  for (const s of SELL_STATUSES) for (const t of TRANSITIONS[s]) assert.ok((SELL_STATUSES as readonly string[]).includes(t));
  for (const s of ['draft', 'awaiting_payment', 'in_review', 'live', 'expired', 'suspended'] as const) assert.ok(canMove(s, 'withdrawn'), `${s} can be withdrawn`);
});

/* ---------------------------------------------------------------- fees and currency */
const RATES = parseRates({ currencies: { currency: [{ id: 1, code: 'USD', rate: '1.00000', default: 1 }, { id: 2, code: 'AED', rate: '3.67250' }, { id: 3, code: 'EUR', rate: '0.92' }, { id: 4, code: 'bad' }] } });
test('currency: WHMCS rates, sensible rounding (USD cents, others whole units)', () => {
  assert.deepEqual(RATES.map((r) => r.code), ['USD', 'AED', 'EUR']);
  assert.equal(convertUsd(15, 'USD', RATES), 15); assert.equal(convertUsd(15, 'AED', RATES), 55); assert.equal(convertUsd(50, 'AED', RATES), 184);
  assert.equal(convertUsd(15, 'EUR', RATES), 14); assert.equal(convertUsd(15, 'GBP', RATES), null, 'unknown currency');
  // default currency AED (rate 1), USD rate 0.2723
  const aedBase = parseRates({ currencies: { currency: [{ id: 1, code: 'AED', rate: '1', default: 1 }, { id: 2, code: 'USD', rate: '0.2723' }] } });
  assert.equal(convertUsd(15, 'AED', aedBase), 55);
  assert.equal(roundFee(4.567, 'EUR'), 4.57); assert.equal(roundFee(12.5, 'USD'), 12.5);
});
test('fees: WHMCS products when both pids are set and priced, else converted invoice', () => {
  const lp = { pid: 1, pricing: { USD: { monthly: '15.00', msetupfee: '0.00' }, AED: { monthly: '55.00', msetupfee: '0.00' } } };
  const fp = { pid: 2, pricing: { USD: { monthly: '50.00' }, AED: { monthly: '185.00' } } };
  const withPids = { ...DEFAULT_SELL, listingPid: '1', featuredPid: '2' };
  assert.deepEqual(quoteFees(withPids, 'AED', { rates: RATES, listingProduct: lp, featuredProduct: fp })?.method, 'order');
  assert.equal(quoteFees(withPids, 'AED', { rates: RATES, listingProduct: lp, featuredProduct: fp })?.featured, 185);
  const eur = quoteFees(withPids, 'EUR', { rates: RATES, listingProduct: lp, featuredProduct: fp })!;
  assert.equal(eur.method, 'invoice', 'not priced in EUR → converted invoice'); assert.equal(eur.listing, 14);
  const none = quoteFees(DEFAULT_SELL, 'AED', { rates: RATES })!;
  assert.deepEqual([none.method, none.listing, none.featured, none.currency], ['invoice', 55, 184, 'AED']);
  assert.equal(quoteFees(DEFAULT_SELL, 'JPY', { rates: RATES }), null);
  assert.equal(productPrice({ pricing: { USD: { monthly: '15.00', msetupfee: '2.00' } } }, 'USD'), 17);
  assert.equal(productPrice({ pricing: {} }, 'USD'), null);
});

/* ---------------------------------------------------------------- eligibility = ownership + status + expiry */
const DOMAINS = [
  { id: 301, userid: 1, domainname: 'demo-brand.com', status: 'Active', expirydate: iso(200) },
  { id: 302, userid: 1, domainname: 'soon.com', status: 'Active', expirydate: iso(10) },
  { id: 303, userid: 1, domainname: 'grace.org', status: 'Grace', expirydate: iso(-3) },
  { id: 304, userid: 2, domainname: 'other.com', status: 'Active', expirydate: iso(300) },
  { id: 305, userid: 1, domainname: 'pending.net', status: 'Pending Transfer', expirydate: '0000-00-00' },
];
test('eligibility: must be in the signed-in client\'s list, Active, and not expiring within 30 days', () => {
  const cfg = { minExpiryDays: 30 };
  assert.deepEqual(eligibility('Demo-Brand.com', DOMAINS, 1, cfg, NOW), { ok: true, code: 'ok', domainId: 301, days: 200, expires: iso(200) });
  assert.equal(eligibility('other.com', DOMAINS, 1, cfg, NOW).code, 'not_found', "another client's domain is never eligible");
  assert.equal(eligibility('nothere.com', DOMAINS, 1, cfg, NOW).code, 'not_found');
  assert.equal(eligibility('soon.com', DOMAINS, 1, cfg, NOW).code, 'expiring');
  assert.equal(eligibility('soon.com', DOMAINS, 1, { minExpiryDays: 5 }, NOW).ok, true);
  assert.equal(eligibility('grace.org', DOMAINS, 1, cfg, NOW).code, 'not_active');
  assert.equal(eligibility('pending.net', DOMAINS, 1, cfg, NOW).code, 'not_active');
  assert.equal(eligibility('not a domain', DOMAINS, 1, cfg, NOW).code, 'invalid');
});
test('daily recheck: keep, warn (expiring but active), hide (gone / not active / expired)', () => {
  const cfg = { minExpiryDays: 30 };
  assert.deepEqual(recheck('demo-brand.com', DOMAINS, 1, cfg, NOW), { action: 'keep' });
  assert.deepEqual(recheck('soon.com', DOMAINS, 1, cfg, NOW), { action: 'warn', days: 10 });
  assert.deepEqual(recheck('other.com', DOMAINS, 1, cfg, NOW), { action: 'hide', reason: 'gone' });
  assert.equal(recheck('grace.org', DOMAINS, 1, cfg, NOW).action, 'hide');
  assert.deepEqual(recheck('x.com', [{ id: 1, userid: 1, domainname: 'x.com', status: 'Expired', expirydate: iso(-1) }], 1, cfg, NOW), { action: 'hide', reason: 'expired', status: 'Expired' });
});
test('trademark screen flags (never rejects) brand words', () => {
  assert.deepEqual(trademarkHits('google-deals.com', DEFAULT_SELL.trademarkTerms), ['google']);
  assert.deepEqual(trademarkHits('noon.ae', DEFAULT_SELL.trademarkTerms), ['noon']);
  assert.deepEqual(trademarkHits('afternoonsun.com', ['noon']), ['noon'], '4+ letter words match inside the name');
  assert.deepEqual(trademarkHits('vista.com', ['visa', 'uber']), []);
  assert.deepEqual(trademarkHits('tuberose.com', ['uber']), ['uber']);
});

/* ---------------------------------------------------------------- form */
const form = (o: Record<string, string>) => readSellForm((k) => o[k] ?? '');
test('form validation: price or offer, ranges, min offer below price, no links, terms', () => {
  const ok = validateSell(form({ domain: 'Demo-Brand.com', mode: 'price', price: '2,500', currency: 'AED', min_offer: '1000', accept_offers: '1', description: 'Short and brandable', category: 'Technology', tags: 'short, brandable, short', terms: '1', featured: '1' }));
  assert.ok(ok.ok); if (ok.ok) assert.deepEqual(ok.v, { domain: 'demo-brand.com', price: 2500, currency: 'AED', minOffer: 1000, acceptOffers: true, description: 'Short and brandable', category: 'Technology', tags: ['short', 'brandable'], featured: true });
  const offer = validateSell(form({ domain: 'a.com', mode: 'offer', price: '999', currency: 'USD', terms: '1' }));
  assert.ok(offer.ok && offer.v.price === null && offer.v.acceptOffers === true, 'make-an-offer has no price and accepts offers');
  const bad = validateSell(form({ domain: 'nope', mode: 'price', price: '5', currency: 'XYZ', min_offer: 'abc', description: 'see https://x.io', category: 'Cars' }));
  assert.ok(!bad.ok); if (!bad.ok) assert.deepEqual(Object.keys(bad.errs).sort(), ['category', 'currency', 'description', 'domain', 'min_offer', 'price_range', 'terms']);
  const hi = validateSell(form({ domain: 'a.com', mode: 'price', price: '500', min_offer: '500', currency: 'USD', terms: '1' }));
  assert.ok(!hi.ok && hi.errs.min_offer_high);
  assert.ok(validateSell(form({ domain: 'x', mode: 'price', price: '50', currency: 'USD' }), { edit: true }).ok, 'edit skips domain + terms');
});
const L = (o: Partial<Listing> = {}): Listing => ({
  id: 'lst_' + Math.random().toString(36).slice(2, 10), ref: 'SL-TEST001', domain: 'demo-brand.com', clientId: 1, whmcsDomainId: 301, status: 'draft', price: '2500.00', currency: 'USD', minOffer: null,
  acceptOffers: true, description: 'Old text', category: 'Technology', tags: ['short'], featured: false, featuredState: '', featuredInvoiceId: null, invoiceId: null, orderId: null, feeMethod: '',
  feeAmount: null, feeCurrency: '', featuredFeeAmount: null, pending: null, flags: [], rejectReason: '', hiddenReason: '', adminNote: '', listedUntil: null, featuredUntil: null,
  renewInvoiceId: null, renewState: '', renewFeatured: false, reminders: [], ...o,
});
test('edits: price at once; text of a live listing goes to review, before approval it applies', () => {
  const v = { price: 3000, currency: 'USD', minOffer: null, acceptOffers: false, description: 'New text', category: 'Technology', tags: ['short'] };
  const live = editPatch(L({ status: 'live' }), v);
  assert.equal(live.review, true); assert.equal(live.patch.price, '3000.00'); assert.equal(live.patch.description, undefined); assert.deepEqual(live.patch.pending, { description: 'New text', category: 'Technology', tags: ['short'] });
  const priceOnly = editPatch(L({ status: 'live' }), { ...v, description: 'Old text' });
  assert.equal(priceOnly.review, false); assert.equal(priceOnly.patch.pending, undefined);
  const draft = editPatch(L({ status: 'in_review' }), v);
  assert.equal(draft.review, false); assert.equal(draft.patch.description, 'New text'); assert.equal(draft.patch.pending, null);
});
test('public row: brokered, never the seller, featured only inside featured_until', () => {
  const r = toOwnRow(L({ status: 'live', featured: true, featuredUntil: new Date(NOW + DAY), category: 'AI', tags: ['short'] }), NOW);
  assert.equal(r.owned, false); assert.equal(r.status, 'for_sale'); assert.equal(r.featured, true); assert.deepEqual(r.tags, ['AI', 'short']);
  assert.ok(!('clientId' in r) && !JSON.stringify(r).includes('"clientId"'));
  assert.equal(toOwnRow(L({ featured: true, featuredUntil: new Date(NOW - DAY) }), NOW).featured, false);
  assert.equal(toOwnRow(L({ price: null, acceptOffers: false }), NOW).makeOffer, true);
});

/* ---------------------------------------------------------------- the one-year period */
test('period: one calendar year, renewal from the end date (or today when over), reminders 30/7/1 once', () => {
  assert.equal(addYear('2026-11-04T10:00:00Z').toISOString(), '2027-11-04T10:00:00.000Z');
  assert.equal(addYear('2028-02-29T00:00:00Z').toISOString().slice(0, 10), '2029-02-28');
  assert.equal(renewedUntil(new Date(NOW + 10 * DAY), NOW).toISOString().slice(0, 10), iso(10 + 365));
  assert.equal(renewedUntil(new Date(NOW - 10 * DAY), NOW).toISOString().slice(0, 10), '2027-11-04', 'expired → a year from today');
  const until = new Date(NOW + 25 * DAY);
  assert.deepEqual(reminderDue(until, [], NOW), { days: 30, key: `${until.toISOString().slice(0, 10)}:30` });
  assert.equal(reminderDue(until, [`${until.toISOString().slice(0, 10)}:30`], NOW), null, 'sent once');
  assert.equal(reminderDue(new Date(NOW + 5 * DAY), [`${iso(5)}:30`], NOW)?.days, 7);
  assert.equal(reminderDue(new Date(NOW + 0.5 * DAY), [], NOW)?.days, 1, 'a late run sends only the most urgent');
  assert.equal(reminderDue(new Date(NOW + 40 * DAY), [], NOW), null); assert.equal(reminderDue(new Date(NOW - DAY), [], NOW), null);
  assert.ok(periodOver({ listedUntil: new Date(NOW - 1) }, NOW)); assert.ok(!periodOver({ listedUntil: null }, NOW));
  assert.ok(featuredNow({ featured: true, featuredUntil: null }, NOW));
});
test('seller actions follow status, invoices and the renewal window', () => {
  assert.deepEqual(sellerActions(L({ status: 'draft' }), NOW), { edit: true, pay: true, invoice: false, featured: false, featuredInvoice: false, renew: false, renewInvoice: false, withdraw: true });
  assert.equal(sellerActions(L({ status: 'awaiting_payment', invoiceId: 9 }), NOW).invoice, true);
  assert.equal(sellerActions(L({ status: 'awaiting_payment', invoiceId: 9, featuredInvoiceId: 9, featuredState: 'awaiting_payment' }), NOW).featuredInvoice, false, 'one invoice, one Pay button');
  assert.equal(sellerActions(L({ status: 'live', featuredInvoiceId: 12, featuredState: 'awaiting_payment' }), NOW).featuredInvoice, true);
  assert.equal(sellerActions(L({ status: 'live', listedUntil: new Date(NOW + 200 * DAY) }), NOW).featured, true);
  assert.equal(sellerActions(L({ status: 'live', listedUntil: new Date(NOW + 200 * DAY) }), NOW).renew, false);
  assert.equal(sellerActions(L({ status: 'live', listedUntil: new Date(NOW + 20 * DAY) }), NOW).renew, true);
  assert.equal(sellerActions(L({ status: 'expired', listedUntil: new Date(NOW - DAY) }), NOW).renew, true);
  assert.equal(sellerActions(L({ status: 'sold' }), NOW).withdraw, false);
  assert.deepEqual(linesFor(L({ featuredState: 'requested' })), ['listing', 'featured']);
  assert.deepEqual(linesFor(L(), { renew: true, featured: true }), ['renew', 'renew_featured']);
  assert.equal(lineAllowed(L({ status: 'live' }), 'listing', NOW), false);
  assert.equal(invoiceState({ status: 'Paid' }), 'paid'); assert.equal(invoiceState({ status: 'Refunded' }), 'cancelled'); assert.equal(invoiceState({ status: 'Unpaid' }), 'unpaid');
  assert.equal(transferUrl('https://my.example.com/', 'a b.com'), 'https://my.example.com/cart.php?a=add&domain=transfer&query=a%20b.com');
});
test('emails: escaped, renew link, no buyer identity', () => {
  const m = sellerMail('request', { domain: 'x<b>.com', ref: 'SL-1', id: 'abc' }, { site: 'https://s.test', intent: 'offer', amount: '$900', commission: 15 });
  assert.ok(!m.html.includes('<b>.com') && m.html.includes('x&lt;b&gt;.com')); assert.match(m.html, /15% commission is deducted from your payout/);
  assert.match(sellerMail('renew', { domain: 'a.com', ref: 'SL-1', id: 'abc' }, { site: 'https://s.test', days: 7, until: '2027-01-01', fee: 'AED 55' }).html, /\/account\/sell\/abc#renew.*Renew listing \(AED 55\)/);
});

/* ---------------------------------------------------------------- the flow with a fake WHMCS */
function memStore(rows: Listing[]): SellStore & { rows: Listing[] } {
  return {
    rows,
    async get(id) { return rows.find((r) => r.id === id) || null; },
    async update(id, p) { const r = rows.find((x) => x.id === id)!; Object.assign(r, p); },
    async byInvoice(i) { return rows.filter((r) => r.invoiceId === i || r.featuredInvoiceId === i || r.renewInvoiceId === i); },
    async awaitingPayment() { return rows.filter((r) => (r.status === 'awaiting_payment' && r.invoiceId) || r.featuredState === 'awaiting_payment' || r.renewState === 'awaiting_payment'); },
    async forCheck() { return rows.filter((r) => ['in_review', 'live', 'expired'].includes(r.status)); },
  };
}
function fakeWhmcs(o: { currency?: string; domains?: any[] } = {}) {
  const inv: Record<number, any> = {}; let next = 100;
  const log: { a: string; p: any }[] = [];
  const call = async (a: string, p: any = {}) => {
    log.push({ a, p });
    if (a === 'GetClientsDetails') return { client: { id: Number(p.clientid), currency_code: o.currency || 'USD' } };
    if (a === 'GetCurrencies') return { currencies: { currency: [{ id: 1, code: 'USD', rate: '1', default: 1 }, { id: 2, code: 'AED', rate: '3.6725' }] } };
    if (a === 'GetPaymentMethods') return { paymentmethods: { paymentmethod: [{ module: 'stripe' }] } };
    if (a === 'CreateInvoice') { const id = next++; inv[id] = { invoiceid: id, userid: Number(p.userid), status: 'Unpaid', p }; return { invoiceid: id }; }
    if (a === 'GetInvoice') return inv[Number(p.invoiceid)] || (() => { throw new Error('Invoice ID Not Found'); })();
    if (a === 'GetClientsDomains') return { domains: { domain: o.domains ?? DOMAINS.filter((d) => d.userid === Number(p.clientid)) } };
    throw new Error('unexpected ' + a);
  };
  return { call: call as any, inv, log };
}
const mk = (store: SellStore, w: ReturnType<typeof fakeWhmcs>, now = NOW): SellDeps & { mails: any[]; owner: string[] } => {
  const mails: any[] = [], owner: string[] = [];
  return { call: w.call, store, cfg: DEFAULT_SELL, site: 'https://s.test', now: () => now, mailClient: async (c, m) => { mails.push({ c, ...m }); }, mailOwner: async (s) => { owner.push(s); }, mails, owner };
};

test('flow: one invoice for two drafts (line per domain + Featured), webhook paid → in_review, approve → live 1 year', async () => {
  const a = L({ domain: 'demo-brand.com', featuredState: 'requested' }), b = L({ domain: 'second.com' });
  const store = memStore([a, b]); const w = fakeWhmcs({ currency: 'AED' }); const d = mk(store, w);
  const r = await createFeeInvoice(d, 1, [{ l: a, kinds: linesFor(a) }, { l: b, kinds: linesFor(b) }]);
  assert.equal(r.lines, 3); assert.equal(r.total, 55 + 184 + 55); assert.equal(r.quote.method, 'invoice');
  const ci = w.log.find((x) => x.a === 'CreateInvoice')!.p;
  assert.equal(ci.userid, 1); assert.equal(ci.itemamount1, '55.00'); assert.match(ci.itemdescription2, /Featured.*demo-brand\.com/); assert.match(ci.itemdescription3, /second\.com/); assert.equal(ci.sendinvoice, true);
  assert.equal(a.status, 'awaiting_payment'); assert.equal(a.invoiceId, r.invoiceId); assert.equal(a.featuredInvoiceId, r.invoiceId); assert.equal(b.featuredState, '');
  assert.equal(await invoicePaid(d, r.invoiceId), 0, 'unpaid invoice: nothing changes (the webhook is verified with GetInvoice)');
  w.inv[r.invoiceId].status = 'Paid';
  assert.equal(await invoicePaid(d, r.invoiceId), 2);
  assert.equal(a.status, 'in_review'); assert.equal(a.featuredState, 'paid'); assert.equal(a.featured, false, 'Featured starts at approval');
  assert.equal(await invoicePaid(d, r.invoiceId), 0, 'idempotent');
  assert.equal(d.owner.length, 2);
  Object.assign(a, approvePatch(a, 'admin@x', NOW));
  assert.equal(a.status, 'live'); assert.equal(new Date(a.listedUntil!).toISOString().slice(0, 10), '2027-11-04'); assert.equal(a.featured, true); assert.equal(String(a.featuredUntil), String(a.listedUntil));
  assert.throws(() => approvePatch(L({ status: 'draft' }), 'x'), SellError);
});
test('flow: ownership and state are re-checked before anything is invoiced', async () => {
  const w = fakeWhmcs(); const store = memStore([]); const d = mk(store, w);
  await assert.rejects(createFeeInvoice(d, 2, [{ l: L({ clientId: 1 }), kinds: ['listing'] }]), /another client/);
  await assert.rejects(createFeeInvoice(d, 1, [{ l: L({ status: 'live' }), kinds: ['listing'] }]), /cannot be invoiced/);
  await assert.rejects(createFeeInvoice(d, 1, [{ l: L({ status: 'live', featured: true, listedUntil: new Date(NOW + 100 * DAY) }), kinds: ['featured'] }]), /cannot be invoiced/);
  await assert.rejects(createFeeInvoice(d, 1, []), /Nothing/);
  assert.equal(w.log.filter((x) => x.a === 'CreateInvoice').length, 0, 'no invoice was created');
});
test('flow: poll fallback; cancelled invoice → back to draft (no refund logic)', async () => {
  const a = L(); const store = memStore([a]); const w = fakeWhmcs(); const d = mk(store, w);
  const { invoiceId } = await createFeeInvoice(d, 1, [{ l: a, kinds: ['listing'] }]);
  w.inv[invoiceId].status = 'Cancelled';
  assert.deepEqual(await pollPayments(d), { checked: 1, changed: 1, errors: 0 });
  assert.equal(a.status, 'draft'); assert.equal(a.invoiceId, null);
  const { invoiceId: i2 } = await createFeeInvoice(d, 1, [{ l: a, kinds: ['listing'] }]);
  w.inv[i2].status = 'Paid';
  assert.equal((await pollPayments(d)).changed, 1); assert.equal(a.status, 'in_review');
});
test('flow: renewal adds a year; expired + paid → live without review (or in_review with pending text)', async () => {
  const until = new Date(NOW + 20 * DAY);
  const a = L({ status: 'live', listedUntil: until, approvedAt: new Date(NOW - 345 * DAY), featured: true, featuredUntil: until });
  const b = L({ domain: 'second.com', status: 'expired', listedUntil: new Date(NOW - 2 * DAY), pending: { description: 'x' } });
  const c = L({ domain: 'third.com', status: 'expired', listedUntil: new Date(NOW - 2 * DAY) });
  const store = memStore([a, b, c]); const w = fakeWhmcs(); const d = mk(store, w);
  const r = await createFeeInvoice(d, 1, [{ l: a, kinds: linesFor(a, { renew: true, featured: true }) }, { l: b, kinds: ['renew'] }, { l: c, kinds: ['renew'] }]);
  assert.equal(r.total, 15 + 50 + 15 + 15);
  w.inv[r.invoiceId].status = 'Paid';
  await invoicePaid(d, r.invoiceId);
  assert.equal(new Date(a.listedUntil!).toISOString().slice(0, 10), iso(20 + 365)); assert.equal(a.featured, true); assert.equal(String(a.featuredUntil), String(a.listedUntil)); assert.equal(a.status, 'live');
  assert.equal(b.status, 'in_review', 'text changes waiting → review'); assert.equal(c.status, 'live', 'no changes → live, no review');
  assert.equal(new Date(c.listedUntil!).toISOString().slice(0, 10), '2027-11-04');
  assert.ok(d.mails.some((m) => /renewed/.test(m.subject)));
});
test('daily check: delists a domain that left the account, expires the year, reminds, never hides on a WHMCS error', async () => {
  const gone = L({ domain: 'other.com', status: 'live', listedUntil: new Date(NOW + 100 * DAY) });
  const ended = L({ domain: 'demo-brand.com', status: 'live', listedUntil: new Date(NOW - 1000), featured: true });
  const remind = L({ domain: 'demo-brand.com', status: 'live', listedUntil: new Date(NOW + 6 * DAY), reminders: [`${iso(6)}:30`] });
  const warn = L({ domain: 'soon.com', status: 'live', listedUntil: new Date(NOW + 100 * DAY) });
  const store = memStore([gone, ended, remind, warn]); const w = fakeWhmcs(); const d = mk(store, w);
  const r = await dailyCheck(d);
  assert.deepEqual({ ...r, checked: r.checked }, { checked: 4, hidden: 1, warned: 1, ended: 1, reminded: 1, errors: 0 });
  assert.equal(gone.status, 'suspended'); assert.equal(gone.hiddenReason, 'gone'); assert.match(gone.adminNote, /no longer in the seller account/);
  assert.equal(ended.status, 'expired'); assert.equal(ended.featured, false);
  assert.deepEqual(remind.reminders, [`${iso(6)}:30`, `${iso(6)}:7`]);
  assert.ok(warn.warnedAt); assert.equal(warn.status, 'live');
  assert.ok(d.mails.some((m) => /is hidden/.test(m.subject))); assert.ok(d.mails.some((m) => /has ended/.test(m.subject))); assert.ok(d.owner.some((s) => /hidden/.test(s)));
  assert.equal((await dailyCheck(d)).reminded, 0, 'reminder sent once');
  // WHMCS down for this client: nothing is hidden
  const safe = L({ domain: 'demo-brand.com', status: 'live', listedUntil: new Date(NOW + 100 * DAY) });
  const d2 = mk(memStore([safe]), { ...w, call: (async () => { throw new Error('timeout'); }) as any });
  assert.equal((await dailyCheck(d2)).errors, 1); assert.equal(safe.status, 'live');
});
