// Product <title> text (lib/seo-product.ts). Run: node --test --experimental-strip-types tests/seo-product.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productTitle, inLoc, nounOf } from '../lib/seo-product.ts';

const withBrand = (t: string) => (`${t} | GlobalHostia`.length <= 60 ? `${t} | GlobalHostia` : t);

test('spec-style dedicated server names become cpu + RAM + noun + location', () => {
  assert.equal(productTitle('France - AMD Ryzen 7 3700X - 128GB DDR4 - 1TB NVME', 'Dedicated Servers'), 'Ryzen 7 3700X 128GB Dedicated Server – France');
  assert.equal(productTitle('France - AMD Ryzen 7 3700X - 64GB DDR4 - 1TB NVME', 'Dedicated Servers'), 'Ryzen 7 3700X 64GB Dedicated Server – France');
  assert.equal(productTitle('France - 1x Xeon Silver 4208 - 128GB DDR4', 'Dedicated Servers'), 'Xeon Silver 4208 128GB Dedicated Server – France');
  assert.equal(productTitle('France - 2x Xeon E5-2640v3 - 256GB DDR4 - 2x 960GB SSD', 'Dedicated Servers'), '2x Xeon E5-2640v3 256GB Dedicated Server – France');
  assert.equal(withBrand(productTitle('France - AMD Ryzen 7 3700X - 128GB DDR4 - 1TB NVME', 'Dedicated Servers')), 'Ryzen 7 3700X 128GB Dedicated Server – France | GlobalHostia');
});

test('short names keep "Name | Category"', () => {
  assert.equal(productTitle('Hostia Lite', 'Shared Hosting – Malaysia'), 'Hostia Lite | Shared Hosting – Malaysia');
  assert.equal(productTitle('Hostia Dedicated 3', 'Dedicated Servers'), 'Hostia Dedicated 3 | Dedicated Servers');
  assert.equal(productTitle('Custom', ''), 'Custom');
});

test('every title fits in 60 characters', () => {
  for (const n of ['USA - 2x Intel Xeon E5-2690v4 - 256GB DDR4 - 2x 1.92TB NVMe - 10Gbps unmetered', 'A very long product name without any separators that keeps going on and on and on', 'Medium name that is quite long here | x'])
    for (const c of ['Premium Dedicated Servers', 'Dedicated Servers', ''])
      assert.ok(productTitle(n, c).length <= 60, productTitle(n, c));
});

test('helpers', () => {
  assert.equal(inLoc('USA'), 'in the USA');
  assert.equal(inLoc('Malaysia'), 'in Malaysia');
  assert.equal(nounOf('Shared Hosting – Malaysia'), 'Shared Hosting');
  assert.equal(nounOf('SSL Certificates'), 'SSL Certificate');
});
