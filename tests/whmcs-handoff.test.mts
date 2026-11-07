import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { HANDOFF_AUD, verifyHandoff } from '../lib/portal/whmcs-handoff-core.ts';
const secret = 'local-test-secret-'.repeat(3), now = 1800000000;
const state = 's'.repeat(43);
const claim = { aud: HANDOFF_AUD, cid: 123, admin: 9, state, jti: 'n'.repeat(43), iat: now, exp: now + 60 };
function sign(c: unknown, key = secret, purpose = HANDOFF_AUD) {
  const body = Buffer.from(JSON.stringify(c)).toString('base64url');
  return body + '.' + createHmac('sha256', key).update(purpose + ':' + body).digest('base64url');
}
test('WHMCS admin handoff accepts the PHP-compatible signature and exact browser challenge', () => {
  assert.deepEqual(verifyHandoff(sign(claim), secret, state, now), claim);
});
test('handoff rejects forged client/admin ids, wrong secrets, other browsers and missing challenges', () => {
  const valid = sign(claim), [body, sig] = valid.split('.');
  assert.equal(verifyHandoff(Buffer.from(JSON.stringify({ ...claim, cid: 456 })).toString('base64url') + '.' + sig, secret, state, now), null);
  for (const challenge of [undefined, '', 'x'.repeat(43)]) assert.equal(verifyHandoff(valid, secret, challenge, now), null);
  assert.equal(verifyHandoff(valid, 'wrong'.repeat(10), state, now), null);
  assert.equal(verifyHandoff(valid, null, state, now), null);
  assert.equal(verifyHandoff(body + '.bad', secret, state, now), null);
  for (const field of ['cid', 'admin']) for (const v of [0, -1, '123', 1.5]) assert.equal(verifyHandoff(sign({ ...claim, [field]: v }), secret, state, now), null);
});
test('handoff rejects expiry, oversized lifetimes, future issue times and cross-purpose token reuse', () => {
  for (const c of [{ ...claim, exp: now }, { ...claim, exp: now + 121 }, { ...claim, iat: now + 30 }, { ...claim, aud: 'hosting' }, { ...claim, jti: '' }]) assert.equal(verifyHandoff(sign(c), secret, state, now), null);
  assert.equal(verifyHandoff(sign(claim, secret, 'hosting' as typeof HANDOFF_AUD), secret, state, now), null);
  for (const t of [null, '', 'x'.repeat(3000), 'x.y', sign(null)]) assert.equal(verifyHandoff(t, secret, state, now), null);
});
