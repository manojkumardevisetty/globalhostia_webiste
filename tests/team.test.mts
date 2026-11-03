// Team access: permission presets, parsing of WHMCS responses, owner detection.
// Run: node --test --experimental-strip-types tests/team.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, PRESETS, presetFor, parsePerms, permsFromForm, membersFrom, viewerIsOwner, EMAIL_RE } from '../lib/portal/team-perms.ts';

test('presets map to WHMCS permission names', () => {
  for (const list of Object.values(PRESETS)) for (const p of list) assert.ok((PERMISSIONS as readonly string[]).includes(p), p);
  // developer: services + domains (manage), no billing
  assert.ok(PRESETS.developer.includes('manageproducts') && PRESETS.developer.includes('managedomains'));
  for (const b of ['invoices', 'quotes', 'orders']) assert.ok(!(PRESETS.developer as string[]).includes(b), b);
  // billing: invoices + quotes, no technical access
  assert.ok(PRESETS.billing.includes('invoices') && PRESETS.billing.includes('quotes'));
  for (const x of ['products', 'manageproducts', 'productsso', 'domains', 'managedomains']) assert.ok(!(PRESETS.billing as string[]).includes(x), x);
  assert.equal(PRESETS.full.length, 13);
});

test('presetFor recognises presets in any order, else custom', () => {
  assert.equal(presetFor(['managedomains', 'tickets', 'products', 'domains', 'productsso', 'manageproducts']), 'developer');
  assert.equal(presetFor(['emails', 'invoices', 'quotes']), 'billing');
  assert.equal(presetFor([...PERMISSIONS].reverse()), 'full');
  assert.equal(presetFor(['invoices']), 'custom');
  assert.equal(presetFor([]), 'custom');
});

test('parsePerms: comma list, arrays, WHMCS objects; unknown names dropped; canonical order', () => {
  assert.deepEqual(parsePerms('tickets, invoices,products,bogus'), ['products', 'invoices', 'tickets']);
  assert.deepEqual(parsePerms(['Domains', 'domains', 'profile']), ['profile', 'domains']);
  assert.deepEqual(parsePerms({ permission: ['quotes', 'orders'] }), ['quotes', 'orders']);
  assert.deepEqual(parsePerms({ invoices: true, tickets: 0, emails: '1' }), ['invoices', 'emails']);
  assert.deepEqual(parsePerms(undefined), []);
});

test('permsFromForm: presets win; custom needs at least one valid permission', () => {
  assert.deepEqual(permsFromForm('billing', ['products']), { ok: true, perms: PRESETS.billing, preset: 'billing' });
  assert.deepEqual(permsFromForm('custom', ['domains', 'managedomains']), { ok: true, perms: ['domains', 'managedomains'], preset: 'custom' });
  assert.deepEqual(permsFromForm('custom', ['invoices', 'quotes', 'emails']), { ok: true, perms: ['invoices', 'quotes', 'emails'], preset: 'billing' });
  assert.deepEqual(permsFromForm('custom', ['nope']), { ok: false, error: 'empty' });
  assert.deepEqual(permsFromForm('admin', []), { ok: false, error: 'preset' });
});

test('members and owner detection', () => {
  const details = { users: { user: [{ id: 11, name: 'Demo Customer', email: 'Demo@Example.com', is_owner: true }, { id: 21, name: 'Dev', email: 'dev@example.com', is_owner: false }] } };
  const m = membersFrom(details);
  assert.deepEqual(m.map((x) => [x.id, x.email, x.owner]), [[11, 'demo@example.com', true], [21, 'dev@example.com', false]]);
  assert.equal(viewerIsOwner(m, { userId: 11, email: 'x@y.z' }), true);
  assert.equal(viewerIsOwner(m, { userId: 21, email: 'demo@example.com' }), false);
  assert.equal(viewerIsOwner(m, { email: 'DEMO@example.com' }), true);
  assert.equal(viewerIsOwner([], { email: 'demo@example.com' }, 'demo@example.com'), true);
  assert.equal(viewerIsOwner([], { email: 'dev@example.com' }, 'demo@example.com'), false);
  assert.equal(membersFrom({ users: { user: { id: 5, name: 'Solo', email: 's@x.io', is_owner: '1' } } })[0].owner, true);
});

test('invite email check', () => {
  assert.ok(EMAIL_RE.test('dev@company.ae'));
  for (const bad of ['dev@', 'a b@c.com', 'x@y', '<a@b.com>', 'a@b.com,c@d.com']) assert.ok(!EMAIL_RE.test(bad), bad);
});
