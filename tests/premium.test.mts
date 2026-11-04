// Premium domains (lib/premium/core.ts): config, price rules, tolerant Dynadot api3 parsing, feed filters, merge, filters,
// CSV import, AI search, and the Dynadot client against a mock api3 server, directly and through the real WHMCS proxy
// (docs/whmcs/gh_dynadot_proxy.php under `php -S`, skipped when php is not installed).
// Run: node --test --experimental-strip-types tests/premium.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import {
  normalizePremium, DEFAULT_PREMIUM, parsePrice, priceFor, registryPrice, parseListings, parseSearch, parseOwnDomains, unwrap, DynadotApiError,
  feedAllows, mergeItems, applyFilter, readFilter, layoutFor, categoriesOf, marqueePicks, parseCsv, searchPremium, cleanDomain, splitDomain,
  call, getListings, getListingItem, searchPrices, ownDomains, proxyPayload, PROXY_COMMANDS, fmtMoney, type OwnRow, type FeedRow, type Transport,
} from '../lib/premium/core.ts';

/* ---------------------------------------------------------------- config + money */
test('config: defaults (feed on, page on), clamps and cleans', () => {
  const d = normalizePremium(undefined);
  assert.equal(d.enabled, true); assert.equal(d.feed.enabled, true); assert.equal(normalizePremium({ feed: { enabled: false } }).feed.enabled, false); assert.equal(d.pricing.markupPct, 15); assert.equal(d.pricing.mode, 'markup'); assert.equal(d.home.position, 'after-domain');
  const c = normalizePremium(JSON.stringify({ feed: { enabled: true, tlds: 'com, .AI,bad tld!!', maxCount: 9999, keywords: ['Cloud', ''] }, pricing: { mode: 'fee', feePct: 500 }, proxyUrl: 'http://insecure', home: { position: 'nope' } }));
  assert.deepEqual(c.feed.tlds, ['.com', '.ai']); assert.equal(c.feed.maxCount, 2000); assert.equal(d.feed.brandable, false); assert.deepEqual(d.feed.tlds, []); assert.deepEqual(c.feed.keywords, ['cloud']);
  assert.equal(c.pricing.mode, 'fee'); assert.equal(c.pricing.feePct, 100); assert.equal(c.proxyUrl, ''); assert.equal(c.home.position, 'after-domain');
});

test('money: parses Dynadot price strings, applies markup or fee', () => {
  assert.deepEqual(parsePrice('$1,250.00'), { amount: 1250, currency: 'USD' });
  assert.deepEqual(parsePrice('77.00 in USD'), { amount: 77, currency: 'USD' });
  assert.deepEqual(parsePrice('1600 EUR'), { amount: 1600, currency: 'EUR' });
  assert.equal(parsePrice('n/a'), null); assert.equal(parsePrice(0), null);
  assert.deepEqual(priceFor(1000, { ...DEFAULT_PREMIUM.pricing, markupPct: 15, markupFixed: 0 }), { price: 1150, base: 1000, fee: 0, mode: 'markup' });
  assert.deepEqual(priceFor(400, { ...DEFAULT_PREMIUM.pricing, mode: 'fee', feePct: 15, feeMin: 100 }), { price: 500, base: 400, fee: 100, mode: 'fee' }, 'minimum fee applies');
  assert.deepEqual(priceFor(2000, { ...DEFAULT_PREMIUM.pricing, mode: 'fee', feePct: 15, feeMin: 100 }), { price: 2300, base: 2000, fee: 300, mode: 'fee' });
  assert.equal(registryPrice(99.99, 0), 99.99); assert.equal(registryPrice(1000, 10), 1100);
  assert.equal(fmtMoney(4500), '$4,500'); assert.equal(fmtMoney(12.5, 'AED'), 'AED 12.50');
});

test('domains: clean and split', () => {
  assert.equal(cleanDomain(' https://www.Brand.COM/x '), 'brand.com');
  assert.equal(cleanDomain('not a domain'), null); assert.equal(cleanDomain('a.b.c.d.com'), null);
  assert.deepEqual(splitDomain('brand.co.uk'), { sld: 'brand', tld: '.co.uk' });
  assert.deepEqual(splitDomain('my-brand.ai'), { sld: 'my-brand', tld: '.ai' });
});

/* ---------------------------------------------------------------- Dynadot api3 parsing */
test('parseListings: tolerant of api3 shapes, skips rows without a domain or price', () => {
  const a = { GetListingsResponse: { ResponseCode: '0', Status: 'success', Listing: [
    { ListingId: '101', Domain: 'cloudly.com', Price: '$2,500.00', Currency: 'USD' },
    { ListingId: '102', Domain: 'Zap.AI', Price: '4800' },
    { ListingId: '103', Domain: 'nope', Price: '10' },
    { ListingId: '104', Domain: 'free.io', Price: '' },
  ] } };
  assert.deepEqual(parseListings(a), [{ id: '101', domain: 'cloudly.com', amount: 2500, currency: 'USD' }, { id: '102', domain: 'zap.ai', amount: 4800, currency: 'USD' }]);
  const b = { GetListingItemResponse: { GetListingItemHeader: { ResponseCode: 0, Status: 'success' }, ListingItem: { listing_id: 7, domain_name: 'one.co', buy_it_now_price: '950.00', currency: 'usd' } } };
  assert.deepEqual(parseListings(b), [{ id: '7', domain: 'one.co', amount: 950, currency: 'USD' }]);
  assert.throws(() => parseListings({ GetListingsResponse: { ResponseCode: '-1', Error: 'ip not in whitelist' } }), (e: any) => e instanceof DynadotApiError && e.code === 'ip');
  assert.throws(() => unwrap({ SearchResponse: { SearchHeader: { SuccessCode: -1, Status: 'error', Error: 'invalid key' } } }), (e: any) => e.code === 'key');
});

test('parseSearch: availability, price and the premium flag', () => {
  const r = parseSearch({ SearchResponse: { ResponseCode: 0, SearchResults: [
    { DomainName: 'gold.io', Available: 'yes', Price: '1,200.00 in USD', Premium: 'yes' },
    { DomainName: 'plain.io', Available: 'yes', Price: '39.99 in USD' },
    { DomainName: 'taken.io', Available: 'no' },
    { DomainName: 'flagged.io', Available: 'yes', Price: '899.00 in USD (Premium)' },
  ] } });
  assert.deepEqual(r.map((x) => [x.domain, x.available, x.premium, x.amount]), [['gold.io', true, true, 1200], ['plain.io', true, false, 39.99], ['taken.io', false, false, null], ['flagged.io', true, true, 899]]);
});

test('parseOwnDomains: names from list_domain', () => {
  assert.deepEqual(parseOwnDomains({ ListDomainInfoResponse: { ResponseCode: 0, MainDomains: [{ Name: 'b.com', Expiration: 1 }, { Name: 'a.ae' }, { Name: 'bad' }] } }), ['a.ae', 'b.com']);
});

/* ---------------------------------------------------------------- feed rules + merge + filters */
const cfg = normalizePremium({ feed: { enabled: true, tlds: ['.com', '.ai'], minPrice: 100, maxPrice: 5000, maxCount: 2 }, pricing: { mode: 'markup', markupPct: 10 } });
const own: OwnRow[] = [
  { domain: 'atlas.com', price: '9000', currency: 'USD', makeOffer: false, minOffer: null, tags: ['Brandable'], description: 'Classic.', status: 'for_sale', owned: true, featured: true },
  { domain: 'draft.com', price: '100', currency: 'USD', makeOffer: false, minOffer: null, tags: [], description: '', status: 'draft', owned: true, featured: false },
  { domain: 'gone.com', price: '100', currency: 'USD', makeOffer: false, minOffer: null, tags: [], description: '', status: 'sold', owned: true, featured: false },
  { domain: 'offer.ai', price: null, currency: 'USD', makeOffer: true, minOffer: '500', tags: ['AI'], description: '', status: 'under_offer', owned: false, featured: false },
];
const feed: FeedRow[] = [
  { domain: 'atlas.com', listingId: '1', price: '50', currency: 'USD' }, // own listing wins
  { domain: 'zing.com', listingId: '2', price: '1000', currency: 'USD' },
  { domain: 'cheap.com', listingId: '3', price: '20', currency: 'USD' }, // below min
  { domain: 'wrong.net', listingId: '4', price: '900', currency: 'USD' }, // tld not allowed
  { domain: 'zz.ai', listingId: '5', price: '3000', currency: 'USD' },
  { domain: 'over.ai', listingId: '6', price: '3500', currency: 'USD' }, // over maxCount
];

test('feedAllows: TLDs, price range, keywords, excluded words, USD only', () => {
  assert.equal(feedAllows({ domain: 'zing.com', amount: 1000, currency: 'USD' }, cfg.feed), true);
  assert.equal(feedAllows({ domain: 'zing.com', amount: 1000, currency: 'EUR' }, cfg.feed), false);
  assert.equal(feedAllows({ domain: 'zing.net', amount: 1000, currency: 'USD' }, cfg.feed), false);
  assert.equal(feedAllows({ domain: 'zing.com', amount: 6000, currency: 'USD' }, cfg.feed), false);
  assert.equal(feedAllows({ domain: 'cloudx.com', amount: 1000, currency: 'USD' }, { ...cfg.feed, keywords: ['cloud'], exclude: ['x'] }), false);
});

test('mergeItems: own first, drafts and sold hidden, feed priced and capped; feed off = own only', () => {
  const items = mergeItems(own, feed, cfg);
  assert.deepEqual(items.map((i) => i.domain), ['atlas.com', 'offer.ai', 'zing.com', 'zz.ai']);
  const atlas = items[0], zing = items.find((i) => i.domain === 'zing.com')!, offer = items[1];
  assert.equal(atlas.price, 9000); assert.equal(atlas.source, 'own');
  assert.equal(zing.price, 1100); assert.equal(zing.source, 'dynadot'); assert.equal(zing.listingId, '2');
  assert.equal(offer.price, null); assert.equal(offer.offers, true); assert.equal(offer.minOffer, 500); assert.equal(offer.owned, false);
  assert.deepEqual(mergeItems(own, feed, { ...cfg, feed: { ...cfg.feed, enabled: false } }).map((i) => i.domain), ['atlas.com', 'offer.ai']);
});

test('filters, sorting, layout, categories and the homepage picks', () => {
  const items = mergeItems(own, feed, cfg);
  assert.deepEqual(applyFilter(items, { tld: '.ai' }).map((i) => i.domain), ['offer.ai', 'zz.ai']);
  assert.deepEqual(applyFilter(items, { sort: 'price-asc' }).map((i) => i.domain), ['offer.ai', 'zing.com', 'zz.ai', 'atlas.com']);
  assert.deepEqual(applyFilter(items, { max: 2000 }).map((i) => i.domain), ['offer.ai', 'zing.com']);
  assert.deepEqual(applyFilter(items, { len: '1-4' }).map((i) => i.domain), ['zing.com', 'zz.ai']);
  assert.deepEqual(applyFilter(items, { cat: 'ai' }).map((i) => i.domain), ['offer.ai']);
  assert.equal(applyFilter(items, { sort: 'featured' })[0].domain, 'atlas.com');
  const f = readFilter(new URLSearchParams('q=Z!&tld=ai&min=10&max=x&len=1-4&sort=bogus'));
  assert.deepEqual(f, { q: 'z', tld: '.ai', min: 10, max: undefined, len: '1-4', cat: undefined, sort: undefined });
  assert.equal(layoutFor(1), 'feature'); assert.equal(layoutFor(3), 'feature'); assert.equal(layoutFor(4), 'grid'); assert.equal(layoutFor(25), 'list');
  assert.ok(categoriesOf(items).some((c) => c.slug === 'short' && c.n === 4));
  assert.deepEqual(marqueePicks(items, 2).map((i) => i.domain), ['atlas.com', 'zing.com'], 'under-offer names stay off the homepage row');
});

test('CSV import: header optional, make-offer rows, errors reported', () => {
  const { rows, errors } = parseCsv('domain,price,currency,min_offer,tags,description,owned,featured\nbrand.com,"4,500",USD,3000,Short|Brandable,"Nice, short",yes,yes\nofferme.ai,,AED,,,,brokered,\nnot a domain,1,USD');
  assert.equal(rows.length, 2); assert.equal(errors.length, 1);
  assert.deepEqual(rows[0], { domain: 'brand.com', price: 4500, currency: 'USD', makeOffer: false, minOffer: 3000, tags: ['Short', 'Brandable'], description: 'Nice, short', owned: true, featured: true });
  assert.equal(rows[1].makeOffer, true); assert.equal(rows[1].price, null); assert.equal(rows[1].currency, 'AED'); assert.equal(rows[1].owned, false);
});

test('searchPremium (AI + MCP): filters and absolute links', () => {
  const r = searchPremium(mergeItems(own, feed, cfg), { keyword: 'Z', tld: 'com', maxPrice: 5000, limit: 5 }, 'https://globalhostia.com/');
  assert.equal(r.url, 'https://globalhostia.com/premium-domains');
  assert.deepEqual(r.items.map((i) => [i.domain, i.price, i.listing, i.url]), [['zing.com', 1100, 'marketplace', 'https://globalhostia.com/premium-domains/zing.com']]);
});

/* ---------------------------------------------------------------- Dynadot client against a mock api3 server */
const KEY = 'TESTKEY-' + 'k'.repeat(24);
function mockDynadot() {
  const seen: { command: string; key: string; q: URLSearchParams }[] = [];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    const q = u.searchParams, command = q.get('command') || '';
    seen.push({ command, key: q.get('key') || '', q });
    const send = (o: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (u.pathname !== '/api3.json') { res.statusCode = 404; return res.end('nope'); }
    if (q.get('key') !== KEY) return send({ Response: { ResponseCode: '-1', Error: 'invalid key' } });
    if (command === 'get_listings') {
      const page = Number(q.get('page_index') || 1);
      const n = page === 1 ? 100 : 7; // two pages: 100 + 7
      return send({ GetListingsResponse: { ResponseCode: '0', Status: 'success', Listing: Array.from({ length: n }, (_, i) => ({ ListingId: `${page}-${i}`, Domain: `name${page}x${i}.com`, Price: `$${100 + i}.00`, Currency: 'USD', Note: `echo ${KEY}` })) } });
    }
    if (command === 'get_listing_item') return send({ GetListingItemResponse: { ResponseCode: 0, Status: 'success', Listing: { ListingId: q.get('listing_id'), Domain: 'zing.com', Price: '1000.00' } } });
    if (command === 'search') return send({ SearchResponse: { ResponseCode: 0, SearchResults: [{ DomainName: q.get('domain0'), Available: 'yes', Price: '1,200.00 in USD', Premium: 'yes' }] } });
    if (command === 'list_domain') return send({ ListDomainInfoResponse: { ResponseCode: 0, MainDomains: [{ Name: 'mine.com' }, { Name: 'also-mine.ae' }] } });
    send({ Response: { ResponseCode: '-1', Error: 'unknown command' } });
  });
  return new Promise<{ base: string; seen: typeof seen; close: () => void }>((ok) => srv.listen(0, '127.0.0.1', () => {
    const a = srv.address() as any; ok({ base: `http://127.0.0.1:${a.port}`, seen, close: () => srv.close() });
  }));
}

test('client (direct key): listings paged, single listing, premium search, own domains; read-only allow-list', async () => {
  const m = await mockDynadot();
  try {
    const t: Transport = { mode: 'direct', key: KEY, apiBase: m.base };
    const l = await getListings(t, 5);
    assert.equal(l.pages, 2, 'stops after a short page'); assert.equal(l.items.length, 107);
    assert.equal(m.seen[0].q.get('count_per_page'), '100'); assert.equal(m.seen[0].q.get('currency'), 'usd');
    assert.deepEqual(await getListingItem(t, '9'), { id: '9', domain: 'zing.com', amount: 1000, currency: 'USD' });
    assert.equal(await getListingItem(t, 'bad id!'), null);
    const [s] = await searchPrices(t, ['gold.io']);
    assert.equal(s.premium, true); assert.equal(s.amount, 1200);
    assert.deepEqual(await ownDomains(t), ['also-mine.ae', 'mine.com']);
    await assert.rejects(call(t, 'register', { domain: 'x.com' }), /not allowed/);
    await assert.rejects(call(t, 'search', { key: 'x' }), /not allowed/);
    await assert.rejects(ownDomains({ mode: 'direct', key: 'wrong', apiBase: m.base }), (e: any) => e.code === 'key');
    await assert.rejects(call({ mode: 'none', reason: 'not set up' }, 'list_domain'), /not set up/);
    assert.ok(Object.keys(PROXY_COMMANDS).every((c) => ['search', 'get_listings', 'get_listing_item', 'list_domain'].includes(c)));
  } finally { m.close(); }
});

/* ---------------------------------------------------------------- the real PHP proxy, between our client and the mock */
const hasPhp = spawnSync('php', ['-v']).status === 0;
test('WHMCS proxy (php): signed read-only requests pass through, the key never leaks, bad requests are refused', { skip: !hasPhp && 'php not installed' }, async () => {
  const m = await mockDynadot();
  const SECRET = 's'.repeat(40);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-proxy-'));
  fs.copyFileSync(new URL('../docs/whmcs/gh_dynadot_proxy.php', import.meta.url), path.join(root, 'gh_dynadot_proxy.php'));
  // stub WHMCS: init.php defines ROOTDIR and the registrar config reader; the hosting hook holds the shared secret
  fs.writeFileSync(path.join(root, 'init.php'), `<?php define('ROOTDIR', __DIR__); function getRegistrarConfigOptions($m) { return $m === 'dynadot' ? ['Username' => 'x', 'apikey' => '${KEY}'] : []; }`);
  fs.mkdirSync(path.join(root, 'includes', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'includes', 'hooks', 'globalhostia_hosting_hook.php'), `<?php\nconst GH_HOSTING_SECRET = '${SECRET}';\n`);
  const port = 20000 + Math.floor(Math.random() * 20000);
  const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { env: { ...process.env, GH_DYNADOT_TEST_BASE: m.base }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/gh_dynadot_proxy.php`;
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(url); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const t: Transport = { mode: 'proxy', url, secret: SECRET };
    const l = await getListings(t, 1);
    assert.equal(l.items.length, 100);
    assert.ok(m.seen.every((x) => x.key === KEY), 'the proxy used the key from the WHMCS registrar config');
    const raw = await call(t, 'get_listings', { currency: 'usd', count_per_page: '100', page_index: '1' });
    assert.ok(!JSON.stringify(raw).includes(KEY), 'the key is scrubbed from the answer');
    const [s] = await searchPrices(t, ['gold.io']); assert.equal(s.premium, true);
    await assert.rejects(call({ ...t, secret: 'x'.repeat(40) }, 'list_domain'), (e: any) => e.code === 'signature');
    // a hand-made request for a write command, correctly signed, is still refused by the PHP allow-list
    const body = JSON.stringify({ cmd: 'register', params: { domain: 'x.com', duration: '1' } }), ts = Math.floor(Date.now() / 1000);
    const r = await fetch(url, { method: 'POST', body, headers: { 'x-gh-signature': `t=${ts},v1=${createHmac('sha256', SECRET).update(proxyPayload(ts, body)).digest('hex')}` } });
    assert.equal(r.status, 400); assert.match(await r.text(), /not allowed/);
    const old = Math.floor(Date.now() / 1000) - 3600, b2 = JSON.stringify({ cmd: 'list_domain', params: {} });
    const r2 = await fetch(url, { method: 'POST', body: b2, headers: { 'x-gh-signature': `t=${old},v1=${createHmac('sha256', SECRET).update(proxyPayload(old, b2)).digest('hex')}` } });
    assert.equal(r2.status, 401, 'expired signatures are refused');
    assert.equal((await fetch(url)).status, 405);
    assert.ok(!m.seen.some((x) => x.command === 'register'), 'no write command ever reached Dynadot');
  } finally { php.kill(); m.close(); fs.rmSync(root, { recursive: true, force: true }); }
});
