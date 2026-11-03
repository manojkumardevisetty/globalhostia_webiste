// Connector tools (lib/connector/tools.ts) with mocked data access: scope enforcement, ownership checks, confirmations,
// reviewer sandbox, kill switch, ChatGPT profile, annotations, audit and rate limits.
// Run: node --test --experimental-strip-types tests/connector.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, toolsFor, listEntries, runTool, needsAuth, ToolFail, type ConnectorDeps, type ToolCtx, type Access, type DnsRec } from '../lib/connector/tools.ts';
import { SCOPES, SCOPE_NAMES } from '../lib/oauth/core.ts';
import { domainName, dnsRecord, mailUser, quotaMb } from '../lib/hosting/validate.ts';

type Log = { calls: string[]; audits: any[] };
function mockDeps(log: Log, over: Partial<ConnectorDeps> = {}): ConnectorDeps {
  const rec: DnsRec[] = [
    { id: 'r1', type: 'A', name: '@', value: '203.0.113.10', ttl: 3600 },
    { id: 'r2', type: 'MX', name: '@', value: 'mail.demo-brand.com', ttl: 3600, priority: 10 },
    { id: 'ns1', type: 'NS' as any, name: '@', value: 'ns1.globalhostia.com', ttl: 3600, readonly: true },
  ];
  const domains: Record<number, any[]> = {
    1: [{ id: 301, userid: 1, domainname: 'demo-brand.com', status: 'Active', expirydate: '2026-12-01', donotrenew: false, recurringamount: '13.99' },
      { id: 304, userid: 1, domainname: 'demo-store.com', status: 'Active', expirydate: '2027-05-01', donotrenew: true }],
    2: [{ id: 401, userid: 2, domainname: 'other-site.com', status: 'Active', expirydate: '2027-01-01' }],
  };
  const services: Record<number, any[]> = {
    1: [{ id: 102, name: 'Hostia Ultra', domain: 'demo-brand.com', status: 'Active', billingcycle: 'Annually', recurringamount: '59.99', nextduedate: '2027-03-01' },
      { id: 104, name: 'Hostia Lite', domain: 'demo-blog.com', status: 'Active' }],
    2: [{ id: 201, name: 'Hostia Lite', domain: 'other-site.com', status: 'Active' }],
  };
  const call = (n: string) => log.calls.push(n);
  return {
    v: { domainName, dnsRecord: (v, z) => dnsRecord(v, z), mailUser, quotaMb, nameservers: (l) => (l.length >= 2 && l.every((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)) ? { ok: true, ns: l } : { ok: false, error: 'bad ns' }) },
    limit: () => 0,
    audit: async (e) => { log.audits.push(e); },
    searchPlans: async () => ({ currency: 'USD', count: 1, results: [{ slug: 'hostia-lite' }] }),
    recommendPlan: async () => ({ need: 'x', recommendations: [{ name: 'Hostia Lite', priceText: '$2.99/mo' }] }),
    cartLink: async (a) => ({ ok: true, name: 'Hostia Lite', cycleLabel: 'Monthly', price: 2.99, setupFee: 0, currency: 'USD', cartUrl: `https://my.globalhostia.com/cart.php?a=add&pid=1&slug=${a.slug}` }),
    checkDomain: async (d) => ({ ok: true, domain: d, tld: '.com', available: true, currency: 'USD', register: 9.99, renew: 13.99, transfer: 9.99, addToCartUrl: 'https://my.globalhostia.com/cart.php?a=add&domain=register' }),
    policies: async () => ({ policies: [{ title: 'Refunds', summary: '30 days' }], source: 'https://globalhostia.com/terms-conditions' }),
    client: async (cid) => ({ id: cid, firstname: 'Demo', lastname: 'Customer', companyname: 'Demo Labs', currency_code: 'USD' }),
    services: async (cid) => services[cid] || [],
    service: async (cid, id) => (services[cid] || []).find((s) => s.id === id) || null,
    serviceUsage: async () => null,
    domains: async (cid) => domains[cid] || [],
    nameservers: async () => ['ns1.globalhostia.com', 'ns2.globalhostia.com'],
    dnsStatus: async () => ({ managed: true, where: 'GlobalHostia DNS' }),
    setAutoRenew: async () => { call('setAutoRenew'); return true; },
    setNameservers: async () => { call('setNameservers'); },
    invoices: async (cid) => (cid === 1 ? [{ id: 5001, invoicenum: '5001', total: '25.20', status: 'Unpaid', currencycode: 'USD' }] : []),
    invoice: async (cid, id) => (cid === 1 && id === 5001 ? { invoicenum: '5001', status: 'Unpaid', total: '25.20', items: [{ description: 'Cloud VPS 4', amount: '24.00' }], transactions: [] } : null),
    tickets: async (cid) => (cid === 1 ? [{ id: 7001, tid: 'ABC-1', subject: 'VPS reboot loop', status: 'Answered' }] : []),
    ticket: async (cid, id) => (cid === 1 && id === 7001 ? { tid: 'ABC-1', subject: 'VPS reboot loop', status: 'Answered', replies: [{ name: 'Demo', message: 'help', date: '2026-11-01' }] } : null),
    departments: async () => [{ id: 1, name: 'Technical Support' }, { id: 2, name: 'Billing' }],
    openTicket: async (_c, t) => { call(`openTicket:${t.subject}`); return { id: 7100, tid: 'NEW-1' }; },
    replyTicket: async () => { call('replyTicket'); },
    dnsList: async (_c, d) => (d === 'demo-store.com' ? { records: [], editable: false, note: 'DNS for demo-store.com is hosted elsewhere.' } : { records: rec, editable: true }),
    dnsAdd: async (_c, d, r) => { call(`dnsAdd:${d}:${r.type}:${r.name}:${r.value}`); },
    dnsEdit: async (_c, d, o) => { call(`dnsEdit:${d}:${o.id}`); },
    dnsDelete: async (_c, d, o) => { call(`dnsDelete:${d}:${o.id}`); },
    mailboxes: async (_c, d) => [{ email: `info@${d}` }],
    createMailbox: async (_c, d, u) => { call(`createMailbox:${u}@${d}`); return { manageUrl: 'https://my.globalhostia.com/clientarea.php?action=productdetails&id=102' }; },
    deleteMailbox: async (_c, d, u) => { call(`deleteMailbox:${u}@${d}`); },
    issueSsl: async (_c, d) => { call(`issueSsl:${d}`); return 'Certificate requested'; },
    health: async () => ({ score: 80, sections: [{ title: 'Email', items: [{ status: 'fail', title: 'DMARC', detail: 'missing', fix: { kind: 'dns', record: { type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=none' } } }, { status: 'ok', title: 'SPF', detail: 'ok' }] }] }),
    mailSettings: async (_c, d) => ({ imap: { host: `mail.${d}`, port: 993 } }),
    renewals: async () => [{ key: 'd:301', kind: 'domain', id: 301, name: 'demo-brand.com', date: '2026-12-01', days: 20, amount: 13.99, cycle: '1 year', autoRenew: true }, { key: 's:102', kind: 'service', id: 102, name: 'Hostia Ultra', date: '2027-03-01', days: 120, amount: 59.99, cycle: 'Annually', invoiceId: 5001 }],
    urls: { site: 'https://globalhostia.com', clientArea: 'https://my.globalhostia.com' },
    ...over,
  };
}
const access = (o: Partial<Access> = {}): Access => ({ cid: 1, scopes: [...SCOPE_NAMES], clientId: 'ghc_test', grantId: 'g1', platform: 'claude', email: 'demo@example.com', ...o });
function ctx(o: Partial<ToolCtx> & { log?: Log; over?: Partial<ConnectorDeps> } = {}): ToolCtx & { log: Log } {
  const log = o.log || { calls: [], audits: [] };
  return { profile: 'claude', access: access(), deps: mockDeps(log, o.over), ip: '203.0.113.5', enabled: true, commerce: true, reviewer: { clientIds: [], sandboxDomain: '' }, ...o, log } as any;
}
const fails = async (p: Promise<unknown>, code: string, re?: RegExp) => {
  await assert.rejects(p, (e: unknown) => { assert.ok(e instanceof ToolFail, String(e)); assert.equal((e as ToolFail).code, code, (e as Error).message); if (re) assert.match((e as Error).message, re); return true; });
};

test('every tool: title, read/destructive hints, schemas, known scope, short name; destructive ones need confirm', () => {
  const names = new Set<string>();
  for (const t of TOOLS) {
    assert.ok(!names.has(t.name)); names.add(t.name);
    assert.ok(t.name.length <= 64 && /^[a-z_]+$/.test(t.name), t.name);
    assert.ok(t.title && t.annotations.title === t.title, t.name);
    for (const k of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) assert.equal(typeof t.annotations[k], 'boolean', `${t.name}.${k}`);
    assert.ok(!(t.annotations.readOnlyHint && t.annotations.destructiveHint), t.name);
    assert.equal(t.inputSchema.type, 'object'); assert.equal(t.outputSchema.type, 'object');
    if (t.scope) assert.ok(SCOPES[t.scope], `${t.name} scope ${t.scope}`);
    if (t.scope && SCOPES[t.scope].write && !['renew_items_link'].includes(t.name)) assert.equal(t.annotations.readOnlyHint, false, `${t.name} writes`);
    if (t.annotations.destructiveHint) { assert.equal(t.confirm, true, t.name); assert.ok((t.inputSchema as any).properties.confirm, t.name); }
    assert.ok(t.description.length > 40 && t.description.length < 600, t.name);
    assert.doesNotMatch(t.description, /ignore (previous|all)|always call|you must/i, `${t.name}: no behavioural instructions`);
  }
  for (const n of ['get_account_overview', 'list_services', 'get_service', 'list_domains', 'get_domain', 'list_dns_records', 'list_invoices', 'get_invoice', 'list_tickets', 'get_ticket', 'site_health', 'email_settings', 'search_plans', 'recommend_plan', 'check_domain_availability', 'get_renewals',
    'add_dns_record', 'update_dns_record', 'delete_dns_record', 'create_mailbox', 'delete_mailbox', 'issue_ssl', 'open_ticket', 'reply_ticket', 'set_domain_autorenew', 'set_nameservers', 'create_cart_link', 'renew_items_link']) assert.ok(names.has(n), `missing ${n}`);
});

test('ChatGPT profile hides commerce tools unless enabled; securitySchemes per tool', () => {
  const g = toolsFor('chatgpt', false).map((t) => t.name);
  for (const n of ['search_plans', 'recommend_plan', 'create_cart_link', 'renew_items_link']) assert.ok(!g.includes(n), n);
  assert.ok(g.includes('check_domain_availability') && g.includes('add_dns_record'));
  assert.equal(toolsFor('chatgpt', true).length, TOOLS.length);
  assert.equal(toolsFor('claude', false).length, TOOLS.length, 'Claude profile always has all tools');
  const list = listEntries('chatgpt', false);
  const dns = list.find((t) => t.name === 'add_dns_record')!;
  assert.deepEqual(dns._meta.securitySchemes, [{ type: 'oauth2', scopes: ['dns:write'] }]);
  assert.deepEqual(list.find((t) => t.name === 'check_domain_availability')!._meta.securitySchemes[0], { type: 'noauth' });
});

test('chatgpt profile: commerce tool call is unknown; domain check has no prices or cart link', async () => {
  const c = ctx({ profile: 'chatgpt', commerce: false, access: null });
  await fails(runTool('create_cart_link', { slug: 'hostia-lite' }, c), 'not_found', /Unknown tool/);
  const r = await runTool('check_domain_availability', { domain: 'mybrand.com' }, c);
  assert.equal(r.data.available, true);
  assert.equal(r.data.register, undefined); assert.equal(r.data.add_to_cart_url, undefined);
  assert.doesNotMatch(r.summary, /\d+\.\d\d/);
  const claude = await runTool('check_domain_availability', { domain: 'mybrand.com' }, ctx({ access: null }));
  assert.equal(claude.data.register, 9.99); assert.ok(claude.data.add_to_cart_url);
});

test('auth: account tools need a token; public tools do not; needsAuth matches', async () => {
  const anon = ctx({ access: null });
  await fails(runTool('list_domains', {}, anon), 'auth');
  assert.deepEqual(needsAuth('list_domains', anon), { kind: 'auth', scope: 'account:read' });
  assert.equal(needsAuth('search_plans', anon), null);
  assert.equal(needsAuth('no_such_tool', anon), null);
  const r = await runTool('search_plans', { query: 'wordpress' }, anon);
  assert.equal(r.data.count, 1);
});

test('scope enforcement: missing scope → scope error, nothing executed, and needsAuth says step-up', async () => {
  const c = ctx({ access: access({ scopes: ['account:read', 'dns:read'] }) });
  await fails(runTool('add_dns_record', { domain: 'demo-brand.com', type: 'A', name: 'www', value: '203.0.113.9' }, c), 'scope', /dns:write/);
  assert.deepEqual(c.log.calls, []);
  assert.deepEqual(needsAuth('add_dns_record', c), { kind: 'scope', scope: 'dns:write' });
  await fails(runTool('list_invoices', {}, c), 'scope');
  const ov = await runTool('get_account_overview', {}, c);
  assert.equal(ov.data.invoices, undefined, 'overview omits invoices without billing:read');
  assert.equal(ov.data.tickets, undefined);
  const full = await runTool('get_account_overview', {}, ctx());
  assert.deepEqual(full.data.invoices, { unpaid: 1, unpaid_total: 25.2, currency: 'USD' });
});

test('ownership: another customer’s domain, service, invoice and ticket are refused', async () => {
  const c = ctx();
  await fails(runTool('list_dns_records', { domain: 'other-site.com' }, c), 'not_found', /not on your GlobalHostia account/);
  await fails(runTool('add_dns_record', { domain: 'other-site.com', type: 'A', name: '@', value: '1.2.3.4' }, c), 'not_found');
  await fails(runTool('get_service', { service_id: 201 }, c), 'not_found');
  await fails(runTool('get_invoice', { invoice_id: 6001 }, c), 'not_found');
  await fails(runTool('get_ticket', { ticket_id: 8001 }, c), 'not_found');
  await fails(runTool('reply_ticket', { ticket_id: 8001, message: 'hi there' }, c), 'not_found');
  await fails(runTool('open_ticket', { subject: 'Help me', message: 'Something is broken here', service_id: 201 }, c), 'not_found');
  await fails(runTool('delete_mailbox', { email: 'info@other-site.com', confirm: true }, c), 'not_found');
  assert.deepEqual(c.log.calls, [], 'nothing was changed');
  // hosting-only domain (service domain, not registered here) is owned
  const r = await runTool('get_domain', { domain: 'demo-blog.com' }, c);
  assert.equal(r.data.registered_here, false);
});

test('validation: bad record, bad domain, bad ids', async () => {
  const c = ctx();
  await fails(runTool('add_dns_record', { domain: 'demo-brand.com', type: 'A', name: 'www', value: 'not-an-ip' }, c), 'invalid', /IPv4/);
  await fails(runTool('add_dns_record', { domain: 'demo-brand.com', type: 'CNAME', name: '@', value: 'x.example.com' }, c), 'invalid', /apex/);
  await fails(runTool('list_dns_records', { domain: 'not a domain' }, c), 'invalid');
  await fails(runTool('get_service', { service_id: -3 }, c), 'invalid');
  await fails(runTool('get_service', {}, c), 'invalid', /Missing/);
  await fails(runTool('set_domain_autorenew', { domain: 'demo-brand.com', enabled: 'yes' }, c), 'invalid');
  await fails(runTool('set_nameservers', { domain: 'demo-brand.com', nameservers: ['only-one.example.com'], confirm: true }, c), 'invalid');
  await fails(runTool('create_mailbox', { email: 'bad..name@demo-brand.com' }, c), 'invalid');
});

test('add an MX record: validated, executed, audited with client and app', async () => {
  const c = ctx();
  const r = await runTool('add_dns_record', { domain: 'demo-brand.com', type: 'MX', name: '@', value: 'mail.mybrand.com', priority: 10 }, c);
  assert.deepEqual(c.log.calls, ['dnsAdd:demo-brand.com:MX:@:mail.mybrand.com']);
  assert.match(r.summary, /Added MX @ → mail\.mybrand\.com \(priority 10\)/);
  assert.equal(c.log.audits.length, 1);
  assert.equal(c.log.audits[0].tool, 'add_dns_record'); assert.equal(c.log.audits[0].ok, true); assert.equal(c.log.audits[0].access.cid, 1); assert.equal(c.log.audits[0].access.clientId, 'ghc_test');
  await fails(runTool('add_dns_record', { domain: 'demo-store.com', type: 'A', name: '@', value: '1.2.3.4' }, c), 'unavailable', /elsewhere/);
});

test('destructive tools refuse without confirm, then run with confirm: true', async () => {
  const c = ctx();
  await fails(runTool('delete_dns_record', { domain: 'demo-brand.com', record_id: 'r1' }, c), 'confirm', /deletes A @ "203\.0\.113\.10"/);
  await fails(runTool('update_dns_record', { domain: 'demo-brand.com', record_id: 'r1', value: '203.0.113.11' }, c), 'confirm');
  await fails(runTool('delete_mailbox', { email: 'info@demo-brand.com' }, c), 'confirm');
  await fails(runTool('set_nameservers', { domain: 'demo-brand.com', nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'] }, c), 'confirm', /stop working/);
  await fails(runTool('delete_dns_record', { domain: 'demo-brand.com', record_id: 'r1', confirm: 'true' }, c), 'confirm', undefined);
  assert.deepEqual(c.log.calls, []);
  assert.equal(c.log.audits.length, 0, 'confirmation requests are not logged as failures');
  await runTool('delete_dns_record', { domain: 'demo-brand.com', record_id: 'r1', confirm: true }, c);
  await runTool('update_dns_record', { domain: 'demo-brand.com', record_id: 'r2', value: 'mx2.demo-brand.com', confirm: true }, c);
  await runTool('delete_mailbox', { email: 'info@demo-brand.com', confirm: true }, c);
  await runTool('set_nameservers', { domain: 'demo-brand.com', nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'], confirm: true }, c);
  assert.deepEqual(c.log.calls, ['dnsDelete:demo-brand.com:r1', 'dnsEdit:demo-brand.com:r2', 'deleteMailbox:info@demo-brand.com', 'setNameservers']);
  await fails(runTool('delete_dns_record', { domain: 'demo-brand.com', record_id: 'ns1', confirm: true }, c), 'forbidden', /Nameserver records/);
  await fails(runTool('delete_dns_record', { domain: 'demo-brand.com', record_id: 'gone', confirm: true }, c), 'not_found');
});

test('reviewer mode: writes only on the sandbox domain; reads unaffected; tickets tagged', async () => {
  const reviewer = { clientIds: [1], sandboxDomain: 'demo-brand.com' };
  const c = ctx({ reviewer });
  await runTool('add_dns_record', { domain: 'demo-brand.com', type: 'TXT', name: 'test', value: 'hello' }, c);
  await fails(runTool('set_domain_autorenew', { domain: 'demo-store.com', enabled: true }, c), 'forbidden', /demo domain demo-brand\.com/);
  await fails(runTool('issue_ssl', { domain: 'demo-blog.com' }, c), 'forbidden');
  await fails(runTool('create_mailbox', { email: 'x@demo-blog.com' }, c), 'forbidden');
  await runTool('list_domains', {}, c);
  await runTool('open_ticket', { subject: 'Test ticket', message: 'Reviewer checking the ticket tool.' }, c);
  assert.deepEqual(c.log.calls, ['dnsAdd:demo-brand.com:TXT:test:hello', 'openTicket:[Review] Test ticket']);
  const other = ctx({ reviewer, access: access({ cid: 2 }) });
  await runTool('add_dns_record', { domain: 'other-site.com', type: 'A', name: 'www', value: '1.2.3.4' }, other);
  assert.equal(other.log.calls.length, 1, 'normal customers are not sandboxed');
});

test('kill switch: account tools disabled, public tools still work', async () => {
  const c = ctx({ enabled: false });
  await fails(runTool('list_domains', {}, c), 'disabled');
  await runTool('get_policies', {}, c);
});

test('rate limits: per client, by read/write class', async () => {
  const seen: string[] = [];
  const c = ctx({ over: { limit: (k, kind) => { seen.push(`${k}:${kind}`); return kind === 'write' ? 12 : 0; } } });
  await runTool('list_domains', {}, c);
  await fails(runTool('add_dns_record', { domain: 'demo-brand.com', type: 'A', name: 'x', value: '1.2.3.4' }, c), 'rate_limited', /12s/);
  assert.deepEqual(seen, ['c1:read', 'c1:write']);
});

test('responses carry no secrets and stay small', async () => {
  const c = ctx({ over: { service: async () => ({ id: 102, name: 'Hostia Ultra', status: 'Active', password: 'NEVER-SHOW-THIS', username: 'demobran', configoptions: { configoption: [{ option: 'OS', value: 'Ubuntu' }] } }) } });
  const r = await runTool('get_service', { service_id: 102 }, c);
  assert.doesNotMatch(JSON.stringify(r), /NEVER-SHOW-THIS/);
  const mb = await runTool('create_mailbox', { email: 'sales@demo-brand.com' }, c);
  assert.doesNotMatch(JSON.stringify(mb), /password"\s*:/i, 'mailbox password is never returned');
  assert.match(mb.summary, /Set its password/);
  const h = await runTool('site_health', { domain: 'demo-brand.com' }, c);
  assert.equal((h.data.issues as any[]).length, 1);
  assert.deepEqual((h.data.issues as any[])[0].fix, { add_dns_record: { type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=none' } });
});

test('renewal links never charge: invoice link for invoiced items, renewal centre otherwise; unknown items refused', async () => {
  const c = ctx();
  const r = await runTool('renew_items_link', { items: ['d:301', 's:102'] }, c);
  assert.equal(r.data.checkout_url, 'https://globalhostia.com/account/renewals');
  const items = r.data.items as any[];
  assert.equal(items[1].url, 'https://globalhostia.com/account/invoices/5001');
  assert.match(items[0].url, /cart\/domain\/renew\/demo-brand\.com/);
  await fails(runTool('renew_items_link', { items: ['d:999'] }, c), 'not_found');
  const def = await runTool('renew_items_link', {}, c);
  assert.equal((def.data.items as any[]).length, 1, 'default: due within 30 days');
});

test('failed writes are audited as failures', async () => {
  const c = ctx({ over: { dnsAdd: async () => { throw new Error('panel exploded'); } } });
  await assert.rejects(runTool('add_dns_record', { domain: 'demo-brand.com', type: 'A', name: 'x', value: '1.2.3.4' }, c));
  assert.equal(c.log.audits.length, 1); assert.equal(c.log.audits[0].ok, false);
});
