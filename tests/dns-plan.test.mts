// Portal DNS editor: zone resolution, delegation and quick templates (lib/hosting/dns-plan.ts).
// Run: node --test --experimental-strip-types tests/dns-plan.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OUR_NS, delegation, ourNameservers, hostingCandidates, planZone, templatePlan, sameRecord, dnsHostName, type PlanDeps, type PlanInput } from '../lib/hosting/dns-plan.ts';
import { serverFor } from '../lib/hosting/match.ts';
import { panelUser, dnsRecord, InputError } from '../lib/hosting/validate.ts';

const srv = (id: string, o: any = {}) => ({ id, name: id, panel: 'directadmin', url: `https://${id}.example.com:2222`, apiUser: 'ofgizflz', secret: 'k', enabled: true, whmcsServerIds: [], match: [], nameservers: [], ...o });
const SONIC = srv('sonic', { whmcsServerIds: [5] });
const OTHER = srv('other', { whmcsServerIds: [9], nameservers: ['ns3.globalhostia.com'] });
const svc = (id: number, domain: string, o: any = {}) => ({ id, domain, username: `u${id}`, status: 'Active', serverid: 5, ...o });

function deps(o: { products?: any[]; owned?: Record<string, string[]>; row?: any; failUser?: string; failProducts?: boolean }): PlanDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    products: async () => { if (o.failProducts) throw new Error('down'); return o.products || []; },
    domainsOf: async (c) => { calls.push(c.username); if (c.username === o.failUser) throw new Error('panel down'); return o.owned?.[c.username] || []; },
    zoneRow: async () => o.row || null,
  };
}
const input = (o: Partial<PlanInput> = {}): PlanInput => ({
  domain: 'shop.com', status: 'Active', ns: OUR_NS, cid: 1, servers: [SONIC, OTHER] as any, dnsOnly: { serverId: 'sonic', daUser: 'ghdns', allowCreate: true },
  match: serverFor, user: panelUser, ...o,
});

test('delegation: ours, mixed, external, unknown (case and trailing dots ignored)', () => {
  const ours = ourNameservers([SONIC, OTHER] as any);
  assert.deepEqual(ours, ['ns1.globalhostia.com', 'ns2.globalhostia.com', 'ns3.globalhostia.com']);
  assert.equal(delegation(['NS1.GlobalHostia.com.', 'ns2.globalhostia.com'], ours), 'ours');
  assert.equal(delegation(['ns3.globalhostia.com', 'ns1.globalhostia.com'], ours), 'ours');
  assert.equal(delegation(['ns1.globalhostia.com', 'ada.ns.cloudflare.com'], ours), 'mixed');
  assert.equal(delegation(['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'], ours), 'external');
  assert.equal(delegation(null, ours), 'unknown');
  assert.equal(delegation(['', ' '], ours), 'unknown');
  assert.deepEqual(ourNameservers([srv('x', { enabled: false, nameservers: ['ns9.x.com'] })] as any), OUR_NS);
});

test('hosting candidates: only Active services on configured servers, the matching domain first, deduplicated', () => {
  const list = hostingCandidates([
    svc(1, 'blog.com'), svc(2, 'shop.com'), svc(3, 'x.com', { status: 'Suspended' }), svc(4, 'y.com', { serverid: 77 }),
    svc(5, 'z.com', { username: 'bad|user' }), svc(6, 'blog.com', { username: 'u1' }),
  ], [SONIC] as any, serverFor, panelUser, 'shop.com');
  assert.deepEqual(list.map((c) => c.serviceId), [2, 1]);
});

test('plan: hosting customer whose account has the domain', async () => {
  const dp = deps({ products: [svc(1, 'blog.com'), svc(2, 'other.com')], owned: { u2: ['other.com', 'shop.com'] } });
  const p = await planZone(input({ ns: ['ada.ns.cloudflare.com'] }), dp);
  assert.equal(p.kind, 'hosting');
  if (p.kind === 'hosting') { assert.equal(p.username, 'u2'); assert.equal(p.serviceId, 2); assert.equal(p.deleg, 'external'); }
});

test('plan: primary-domain service is asked first and stops the search', async () => {
  const dp = deps({ products: [svc(1, 'blog.com'), svc(2, 'shop.com')], owned: { u2: ['shop.com'] } });
  assert.equal((await planZone(input(), dp)).kind, 'hosting');
  assert.deepEqual(dp.calls, ['u2']);
});

test('plan: domain-only customer with a recorded zone, and a zone owned by someone else', async () => {
  const mine = await planZone(input(), deps({ row: { clientId: 1, serverId: 'sonic', daUser: 'ghdns' } }));
  assert.equal(mine.kind, 'dnsonly');
  if (mine.kind === 'dnsonly') { assert.equal(mine.username, 'ghdns'); assert.equal(mine.server.id, 'sonic'); }
  assert.equal((await planZone(input(), deps({ row: { clientId: 2, serverId: 'sonic', daUser: 'ghdns' } }))).kind, 'taken');
  assert.equal((await planZone(input(), deps({ row: { clientId: 1, serverId: 'gone', daUser: 'ghdns' } }))).kind, 'error');
});

test('plan: our nameservers and no zone -> turn on (only when the DNS-only account is configured and allowed)', async () => {
  const p = await planZone(input(), deps({}));
  assert.deepEqual(p, { kind: 'off', canCreate: true, deleg: 'ours' });
  assert.deepEqual(await planZone(input({ dnsOnly: null }), deps({})), { kind: 'off', canCreate: false, deleg: 'ours' });
  assert.deepEqual(await planZone(input({ dnsOnly: { serverId: 'sonic', daUser: 'ghdns', allowCreate: false } }), deps({})), { kind: 'off', canCreate: false, deleg: 'ours' });
  assert.deepEqual(await planZone(input({ dnsOnly: { serverId: 'nope', daUser: 'ghdns', allowCreate: true } }), deps({})), { kind: 'off', canCreate: false, deleg: 'ours' });
  assert.deepEqual(await planZone(input({ ns: null }), deps({})), { kind: 'off', canCreate: true, deleg: 'unknown' });
});

test('plan: nameservers elsewhere -> external card, switch offered only when the zone can be created first', async () => {
  const p = await planZone(input({ ns: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] }), deps({}));
  assert.deepEqual(p, { kind: 'external', ns: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'], canSwitch: true });
  const q = await planZone(input({ ns: ['a.dns.net'], dnsOnly: null }), deps({}));
  assert.equal(q.kind === 'external' && q.canSwitch, false);
});

test('plan: an unreachable hosting panel is an error, never an offer to create a duplicate zone', async () => {
  const p = await planZone(input(), deps({ products: [svc(1, 'shop.com')], failUser: 'u1' }));
  assert.equal(p.kind, 'error');
  assert.equal((await planZone(input(), deps({ failProducts: true }))).kind, 'error');
});

test('plan: inactive domains and disabled servers', async () => {
  assert.equal((await planZone(input({ status: 'Pending Transfer' }), deps({}))).kind, 'inactive');
  const off = srv('sonic', { whmcsServerIds: [5], enabled: false });
  const p = await planZone(input({ servers: [off] as any }), deps({ products: [svc(1, 'shop.com')], owned: { u1: ['shop.com'] } }));
  assert.deepEqual(p, { kind: 'off', canCreate: false, deleg: 'ours' });
});

const rec = (type: string, name: string, value: string, o: any = {}) => ({ id: `${type}|${name}|${value}`, type, name, value, ttl: 3600, ...o });
const ZONE = [
  rec('A', '@', '1.1.1.1'), rec('A', 'www', '1.1.1.1'), rec('CNAME', 'ftp', 'shop.com.'),
  rec('MX', '@', 'mail.shop.com.', { priority: 10 }), rec('TXT', '@', 'v=spf1 a mx ~all'), rec('TXT', '@', 'google-site-verification=abc'),
  rec('NS', '@', 'ns1.globalhostia.com.', { readonly: true }), rec('A', 'autodiscover', '1.1.1.1'),
];

test('template: Google Workspace replaces MX and SPF, keeps other TXT and NS', () => {
  const t = templatePlan('google', 'shop.com', {}, ZONE as any);
  assert.deepEqual(t.add.map((r) => `${r.type} ${r.name} ${r.value} ${r.priority ?? ''}`.trim()), ['MX @ smtp.google.com 1', 'TXT @ v=spf1 include:_spf.google.com ~all']);
  assert.deepEqual(t.remove.map((r) => r.value), ['mail.shop.com.', 'v=spf1 a mx ~all']);
  for (const r of t.add) assert.doesNotThrow(() => dnsRecord(r, 'shop.com'));
  // applying twice changes nothing
  const after = [...ZONE.filter((r) => !t.remove.includes(r as any)), ...t.add.map((r, i) => ({ ...r, id: `n${i}` }))];
  assert.deepEqual(templatePlan('google', 'shop.com', {}, after as any), { add: [], remove: [] });
});

test('template: Microsoft 365 MX host derives from the domain, autodiscover replaced', () => {
  const t = templatePlan('microsoft', 'my-shop.co.uk', {}, ZONE.map((r) => ({ ...r })) as any);
  assert.equal(t.add[0].value, 'my-shop-co-uk.mail.protection.outlook.com');
  assert.equal(t.add[0].priority, 0);
  assert.ok(t.add.some((r) => r.type === 'CNAME' && r.name === 'autodiscover' && r.value === 'autodiscover.outlook.com'));
  assert.ok(t.remove.some((r) => r.name === 'autodiscover' && r.type === 'A'));
  assert.ok(!t.remove.some((r) => r.type === 'NS'));
  for (const r of t.add) assert.doesNotThrow(() => dnsRecord(r, 'my-shop.co.uk'));
});

test('template: point to IP (v4 and v6) replaces apex/www address records and a www CNAME', () => {
  const zone = [...ZONE, rec('AAAA', '@', '2001:db8::1'), rec('CNAME', 'www', 'shop.com.')];
  const t = templatePlan('ip', 'shop.com', { ip: '203.0.113.9' }, zone as any);
  assert.deepEqual(t.add.map((r) => `${r.type} ${r.name}`), ['A @', 'A www']);
  assert.deepEqual(t.remove.map((r) => `${r.type} ${r.name}`).sort(), ['A @', 'A www', 'AAAA @', 'CNAME www']);
  assert.equal(templatePlan('ip', 'shop.com', { ip: '2001:db8::9' }, []).add[0].type, 'AAAA');
  assert.throws(() => templatePlan('ip', 'shop.com', { ip: '' }, []));
  assert.throws(() => dnsRecord(templatePlan('ip', 'shop.com', { ip: '999.1.1.1' }, []).add[0], 'shop.com'), InputError);
});

test('template: verification TXT adds only, dedupes, strips quotes, custom name', () => {
  assert.deepEqual(templatePlan('verify', 'shop.com', { txt: '"google-site-verification=abc"' }, ZONE as any), { add: [], remove: [] });
  const t = templatePlan('verify', 'shop.com', { txt: 'MS=ms123', name: '_ms' }, ZONE as any);
  assert.deepEqual(t, { add: [{ type: 'TXT', name: '_ms', value: 'MS=ms123', ttl: 3600 }], remove: [] });
  assert.throws(() => templatePlan('verify', 'shop.com', { txt: ' ' }, []));
  assert.throws(() => templatePlan('nope' as any, 'shop.com', {}, []));
});

test('sameRecord ignores case and trailing dots on host values, compares MX priority', () => {
  assert.ok(sameRecord({ type: 'MX', name: '@', value: 'SMTP.google.com.', priority: 1 }, { type: 'MX', name: '@', value: 'smtp.google.com', priority: 1 }));
  assert.ok(!sameRecord({ type: 'MX', name: '@', value: 'smtp.google.com', priority: 5 }, { type: 'MX', name: '@', value: 'smtp.google.com', priority: 1 }));
  assert.ok(!sameRecord({ type: 'TXT', name: '@', value: 'ABC' }, { type: 'TXT', name: '@', value: 'abc' }));
});

test('external DNS host names', () => {
  assert.equal(dnsHostName(['ada.ns.cloudflare.com']), 'Cloudflare');
  assert.equal(dnsHostName(['ns51.domaincontrol.com']), 'GoDaddy');
  assert.equal(dnsHostName(['dns1.registrar-servers.com']), 'Namecheap');
  assert.equal(dnsHostName(['ns-12.awsdns-01.com']), 'Amazon Route 53');
  assert.equal(dnsHostName(['ns1.example-host.net']), 'example-host.net');
  assert.equal(dnsHostName([]), 'another provider');
});
