#!/usr/bin/env node
/*
 * Generates tests/fixtures/webhooks.json with the same signing algorithm as YouPI PG V2
 * (packages/core/src/webhook-engine.js + packages/common/src/crypto.js generateHmac):
 *
 *   payloadString = JSON.stringify(payloadObj)
 *   X-Gateway-Signature    = "sha256=" + HMAC_SHA256_hex(secret, payloadString)
 *   X-Gateway-Signature-V2 = "sha256=" + HMAC_SHA256_hex(secret, `${timestamp}.${payloadString}`)
 *
 * Usage:
 *   node tests/generate-fixtures.mjs                       # built-in copy of generateHmac
 *   node tests/generate-fixtures.mjs --youpi-crypto /path/to/YouPI-PG/packages/common/src/crypto.js
 *     (imports YouPI's own generateHmac and asserts it matches the built-in copy)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));

// Byte-for-byte copy of YouPI generateHmac.
function generateHmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

let sign = generateHmac;
const flag = process.argv.indexOf('--youpi-crypto');
if (flag !== -1) {
  const mod = await import(url.pathToFileURL(path.resolve(process.argv[flag + 1])).href);
  const probe = ['1730000000000.{"a":"₹1"}', 'secret'];
  if (mod.generateHmac(...probe) !== generateHmac(...probe)) {
    throw new Error('YouPI generateHmac differs from the built-in copy');
  }
  sign = mod.generateHmac;
  console.error('Using YouPI generateHmac from', process.argv[flag + 1]);
}

const SECRET = 'whsec_test_5f0c1e2d3c4b5a69788796a5b4c3d2e1f0';
const T0 = 1793000000000; // fixed epoch ms so fixtures are stable

// Same key order as WebhookEngine._buildPayload.
function payload(over = {}) {
  const deliveryId = over.deliveryId || 'b3f1c2d4-1111-4a2b-9c3d-0123456789ab';
  const timestamp = over.timestamp ?? T0;
  return {
    event: 'OBSERVED_SUCCESS',
    deliveryId,
    timestamp,
    paymentId: 'c7942127-14e3-469a-9e4a-9359a16f903a',
    orderId: 'WHMCS-1042-k3m7q2xa',
    attemptId: 'c7942127-14e3-469a-9e4a-9359a16f903a',
    amount: '1499.00',
    amountPaise: 149900,
    currency: 'INR',
    method: 'UPI',
    utr: '412345678901',
    verificationTag: 'SMS_OBSERVED',
    verificationLevel: 1,
    completedAt: '2026-10-26T09:33:20.000Z',
    metadata: { source: 'whmcs', whmcsInvoiceId: 1042, note: 'GlobalHostia ₹ invoice' },
    settlementState: 'NOT_RECONCILED',
    ...over,
  };
}

function delivery(obj, { secret = SECRET, headerTs, v2 = true, v1 = true } = {}) {
  const body = JSON.stringify(obj);
  const ts = String(headerTs ?? obj.timestamp);
  const headers = {
    'content-type': 'application/json',
    'x-gateway-event': obj.event,
    'x-gateway-delivery-id': obj.deliveryId,
    'x-gateway-timestamp': ts,
  };
  if (v1) headers['x-gateway-signature'] = `sha256=${sign(body, secret)}`;
  if (v2) headers['x-gateway-signature-v2'] = `sha256=${sign(`${ts}.${body}`, secret)}`;
  return { body, headers };
}

const cases = [];
const add = (name, d, nowMs, allowV1, expectOk, expectReason = '') =>
  cases.push({ name, body: d.body, headers: d.headers, nowMs, allowV1, maxSkewSec: 300, expectOk, expectReason });

const ok = delivery(payload());
add('valid V2 delivery', ok, T0 + 2000, false, true);
add('valid V2 retried 4 minutes later (same timestamp)', ok, T0 + 240000, false, true);
add('V2 retry 6 minutes later is stale', ok, T0 + 360000, false, false, 'timestamp outside');
add('clock 2 minutes behind sender still ok', ok, T0 - 120000, false, true);

const tampered = { ...ok, body: ok.body.replace('"amountPaise":149900', '"amountPaise":1') };
add('tampered amount', tampered, T0 + 2000, false, false, 'V2 signature mismatch');

add('wrong secret', delivery(payload(), { secret: 'not-the-secret-000000000000' }), T0 + 2000, false, false, 'V2 signature mismatch');

const replayTs = delivery(payload(), { headerTs: T0 + 100000 });
add('header timestamp re-signed but body timestamp differs', replayTs, T0 + 100000, false, false, 'body timestamp does not match');

const v1only = delivery(payload({ deliveryId: '9d0e7c6b-2222-4c1d-8e9f-abcdefabcdef' }), { v2: false });
add('V1 only, fallback disabled', v1only, T0 + 1000, false, false, 'fallback is disabled');
add('V1 only, fallback enabled', v1only, T0 + 1000, true, true);
add('V1 only, fallback enabled but body timestamp stale', v1only, T0 + 900000, true, false, 'timestamp outside');

const badDelivery = delivery(payload());
badDelivery.headers = { ...badDelivery.headers, 'x-gateway-delivery-id': 'ffffffff-3333-4444-5555-666666666666' };
add('delivery id header differs from body', badDelivery, T0 + 1000, false, false, 'deliveryId does not match');

const reconciled = delivery(payload({ event: 'RECONCILED', settlementState: 'RECONCILED', deliveryId: 'aa11bb22-cc33-4d44-8e55-ff6677889900', timestamp: T0 + 86400000 }));
add('RECONCILED event next day', reconciled, T0 + 86400000 + 500, false, true);

const out = {
  generatedBy: 'tests/generate-fixtures.mjs (YouPI webhook-engine algorithm)',
  secret: SECRET,
  cases,
  orderIds: {
    valid: ['WHMCS-1042-k3m7q2xa', 'WHMCS-1-abcdefgh', 'WHMCS-9999999999-22222222'],
    invalid: ['WHMCS-0-abcdefgh', 'WHMCS-1042-K3M7Q2XA', 'WHMCS-1042-k3m7q2x', 'WHMCS-1042-k3m7q2xa-R1', 'ORDER-1001', 'WHMCS-1042-k3m7q2x1', 'WHMCS-01-abcdefgh', ' WHMCS-1-abcdefgh'],
  },
};

const target = path.join(here, 'fixtures', 'webhooks.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.error(`Wrote ${cases.length} webhook cases to ${path.relative(process.cwd(), target)}`);
