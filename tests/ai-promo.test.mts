// AI connector website promotion (settings.ai_promo): defaults, normalisation, menu injection, FAQ extras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAiPromo, DEFAULT_AI_PROMO, withAiMenu } from '../lib/connector/promo.ts';

const menus = () => [
  { id: 'hosting', label: 'Hosting', groups: [{ title: 'A', items: [{ label: 'Web', href: '/web-hosting', icon: 'globe' }] }] },
  { id: 'support', label: 'Support', groups: [{ title: 'Self-service', items: [{ label: 'Help', href: '/help-center', icon: 'life' }] }, { title: 'B', items: [] }] },
];

test('missing or broken setting gives the defaults (everything on)', () => {
  assert.deepEqual(normalizeAiPromo(undefined), DEFAULT_AI_PROMO);
  assert.deepEqual(normalizeAiPromo('not json'), DEFAULT_AI_PROMO);
  assert.equal(normalizeAiPromo({}).nav.enabled, true);
});

test('normalises copy, switches and position', () => {
  const p = normalizeAiPromo({ nav: { enabled: false, label: '  Connect\n AI ', badge: '', menu: 'bus<i>ness' }, footer: false,
    home: { position: 'nowhere', prompts: ['a', '', 'b', 'c', 'd', 'e'], title: 'x'.repeat(200) }, pill: { enabled: false, text: '' } });
  assert.equal(p.nav.enabled, false); assert.equal(p.nav.label, 'Connect AI'); assert.equal(p.nav.badge, ''); assert.equal(p.nav.menu, 'business');
  assert.equal(p.footer, false); assert.equal(p.home.position, 'after-plans'); assert.deepEqual(p.home.prompts, ['a', 'b', 'c', 'd']);
  assert.equal(p.home.title.length, 90); assert.equal(p.pill.enabled, false); assert.equal(p.pill.text, DEFAULT_AI_PROMO.pill.text);
  assert.equal(normalizeAiPromo({ home: { position: 'off' } }).home.position, 'off');
});

test('menu item goes into the chosen menu once, and not when /connectors is already linked', () => {
  const out = withAiMenu(menus(), DEFAULT_AI_PROMO);
  const items = out[1].groups[0].items as any[];
  assert.equal(items.at(-1).href, '/connectors'); assert.equal(items.at(-1).badge, 'New');
  assert.equal(out[0].groups[0].items.length, 1);
  assert.equal(withAiMenu(out, DEFAULT_AI_PROMO), out);
  assert.deepEqual(withAiMenu(menus(), normalizeAiPromo({ nav: { enabled: false } })), menus());
  // unknown menu id: falls back to the Support menu
  assert.equal(withAiMenu(menus(), normalizeAiPromo({ nav: { menu: 'nope' } }))[1].groups[0].items.length, 2);
});

