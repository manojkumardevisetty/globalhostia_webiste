// Web push crypto: RFC 8291 test vector, round trip, VAPID JWT, subscription validation.
// Run: node --test --experimental-strip-types tests/push.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { b64u, unb64u, encryptPayload, decryptPayload, generateVapidKeys, validVapid, vapidAuth, verifyVapid, parseSubscription, parseCategories } from '../lib/portal/push-crypto.ts';

test('aes128gcm matches the RFC 8291 section 5 example', () => {
  const asPriv = unb64u('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
  const as = createECDH('prime256v1'); as.setPrivateKey(asPriv);
  const body = encryptPayload('When I grow up, I want to be a watermelon',
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
    { salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw'), sender: { pub: as.getPublicKey(), priv: asPriv } });
  assert.equal(b64u(body), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  const ua = unb64u('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94');
  assert.equal(decryptPayload(body, ua, 'BTBZMqHH6r4Tts7J_aSIgg').toString(), 'When I grow up, I want to be a watermelon');
});

test('round trip with fresh keys, Arabic text', () => {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const auth = b64u(randomBytes(16));
  const msg = JSON.stringify({ title: 'رد جديد على التذكرة رقم GHX-1', url: '/account/support/1' });
  assert.equal(decryptPayload(encryptPayload(msg, b64u(ua.getPublicKey()), auth), ua.getPrivateKey(), auth).toString(), msg);
  assert.throws(() => encryptPayload('x'.repeat(4000), b64u(ua.getPublicKey()), auth), /too large/);
});

test('VAPID keys and JWT', () => {
  const k = generateVapidKeys();
  assert.ok(validVapid(k.publicKey, k.privateKey));
  const h = vapidAuth('https://fcm.googleapis.com/fcm/send/abc', 'mailto:support@globalhostia.com', k.publicKey, k.privateKey, 3600, Date.parse('2026-11-03T00:00:00Z'));
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
  assert.equal(m[2], k.publicKey);
  assert.ok(verifyVapid(m[1], k.publicKey));
  const claims = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString());
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: Date.parse('2026-11-03T00:00:00Z') / 1000 + 3600, sub: 'mailto:support@globalhostia.com' });
  assert.ok(!verifyVapid(m[1], generateVapidKeys().publicKey));
});

test('subscriptions from the browser are validated', () => {
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const keys = { p256dh: b64u(ua.getPublicKey()), auth: b64u(randomBytes(16)) };
  assert.ok(parseSubscription(JSON.stringify({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', keys })));
  assert.equal(parseSubscription({ endpoint: 'http://push.example.com/x', keys }), null);
  assert.equal(parseSubscription({ endpoint: 'https://127.0.0.1/x', keys }), null);
  assert.equal(parseSubscription({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'short', auth: keys.auth } }), null);
  assert.equal(parseSubscription('not json'), null);
  assert.deepEqual(parseCategories(['tickets', 'tickets', 'spam', 'domains']), ['tickets', 'domains']);
});
