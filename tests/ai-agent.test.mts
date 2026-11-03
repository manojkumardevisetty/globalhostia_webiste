// Tool permission checks, customer ownership checks, proposals that never execute, budget cap, cost maths and the
// tool-use loop with a mocked Anthropic client. Run: node --test --experimental-strip-types tests/ai-agent.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { denied, runTool, runAgent, trimHistory, type AiTool, type ToolCtx } from '../lib/ai/agent.ts';
import { customerTools, type CustomerCtx, type CustomerDeps } from '../lib/ai/tools/customer-core.ts';
import { costUsd, budgetCheck, addUsage, ZERO_USAGE } from '../lib/ai/pricing.ts';
import { DEFAULT_PRICES, normalizeAi, DEFAULT_AI } from '../lib/ai/settings-core.ts';

const t = (name: string, scope: AiTool['scope'], kind: AiTool['kind']): AiTool => ({ name, scope, kind, description: '', input_schema: { type: 'object', properties: {} }, run: async () => ({ text: `${name} ran` }) });
const TOOLS = [t('pub', 'public', 'read'), t('cust', 'customer', 'read'), t('adm', 'admin', 'read'), t('act', 'public', 'action'), t('prop', 'customer', 'propose')];

test('permission checks', async () => {
  const visitor: ToolCtx = { surface: 'chat', scopes: ['public'] };
  assert.equal((await runTool(TOOLS, 'pub', {}, visitor)).text, 'pub ran');
  assert.equal((await runTool(TOOLS, 'cust', {}, visitor)).isError, true, 'visitor cannot use customer tools');
  assert.equal((await runTool(TOOLS, 'adm', {}, visitor)).isError, true, 'visitor cannot use admin tools');
  assert.equal((await runTool(TOOLS, 'nope', {}, visitor)).isError, true, 'unknown tool');
  assert.match(denied(TOOLS[1], { surface: 'assist', scopes: ['customer'] }) || '', /not signed in/, 'customer scope needs a verified client id');
  assert.equal(denied(TOOLS[1], { surface: 'assist', scopes: ['customer'], clientId: 7 }), null);
  const admin: ToolCtx = { surface: 'admin', scopes: ['admin'], readOnly: true };
  assert.equal(denied(TOOLS[2], admin), null);
  assert.match(denied({ ...TOOLS[2], kind: 'action' }, admin) || '', /read-only/, 'admin assistant runs read tools only');
  assert.match(denied(TOOLS[4], { surface: 'tickets', scopes: ['customer'], clientId: 1, readOnly: true }) || '', /read-only/, 'ticket drafting cannot propose changes');
  const boom: AiTool = { ...t('boom', 'public', 'read'), run: async () => { throw new Error('SQL password=secret'); } };
  const r = await runTool([boom], 'boom', {}, visitor);
  assert.equal(r.isError, true); assert.ok(!r.text.includes('secret'), 'internal errors are not shown to the model');
});

function deps(over: Partial<CustomerDeps> = {}): CustomerDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    services: async () => [{ id: 1, name: 'Starter', domain: 'mine.com', status: 'Active', password: 'never' }],
    domains: async () => [{ id: 9, domainname: 'mine.com', status: 'Active' }],
    invoices: async () => [], tickets: async () => [],
    owned: async () => ['mine.com', 'shop.mine.ae'],
    dns: async (_c, d) => { calls.push(`dns:${d}`); return { records: [{ type: 'A', name: '@', value: '1.2.3.4', ttl: 3600 }] }; },
    health: async () => ({ score: 90, sections: [] }), mail: async () => ({}),
    caps: async () => ({ dnsAdd: true, mailCreate: true, sslIssue: true }),
    domainId: async () => 9,
    departments: async () => [{ id: 2, name: 'Technical Support' }],
    signTicket: (p) => `signed:${p.cid}:${p.deptid}`,
    ...over,
  } as any;
}
const cctx = (d: CustomerDeps, via: 'portal' | 'hosting' = 'hosting'): CustomerCtx => ({ surface: 'assist', scopes: ['customer'], clientId: 42, via, deps: d });

test('ownership: only the signed-in client\'s domains', async () => {
  const d = deps();
  const ok = await runTool(customerTools, 'get_dns_records', { domain: 'MINE.com.' }, cctx(d));
  assert.ok(!ok.isError); assert.deepEqual(d.calls, ['dns:mine.com']);
  const other = await runTool(customerTools, 'get_dns_records', { domain: 'victim.com' }, cctx(d));
  assert.equal(other.isError, true); assert.match(other.text, /not on this account/);
  assert.deepEqual(d.calls, ['dns:mine.com'], 'no lookup for a domain the client does not own');
  const svc = await runTool(customerTools, 'list_services', {}, cctx(d));
  assert.ok(!svc.text.includes('never'), 'service passwords are not passed to the model');
});

test('changes are proposals; nothing executes', async () => {
  const d = deps();
  const r = await runTool(customerTools, 'propose_dns_record', { domain: 'mine.com', type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=none' }, cctx(d));
  const p: any = r.ui?.[0];
  assert.equal(p.type, 'proposal'); assert.equal(p.kind, 'dns.add');
  assert.deepEqual(p.request, { method: 'POST', path: '/api/hosting/dns', auth: 'hosting', json: { op: 'add', domain: 'mine.com', record: { type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=none', ttl: 3600 } } });
  const portal = await runTool(customerTools, 'propose_dns_record', { domain: 'mine.com', type: 'A', name: 'www', value: '1.2.3.4' }, cctx(d, 'portal'));
  assert.equal((portal.ui?.[0] as any).request.path, '/account/domains/9/dns');
  const mb = await runTool(customerTools, 'propose_mailbox', { domain: 'mine.com', user: 'info' }, cctx(d));
  assert.deepEqual((mb.ui?.[0] as any).inputs?.map((i: any) => i.type), ['password'], 'password is typed by the customer, not the assistant');
  assert.ok(!JSON.stringify(mb.ui).includes('"password":"'), 'no password in the proposal');
  assert.equal((await runTool(customerTools, 'propose_mailbox', { domain: 'mine.com', user: 'info' }, cctx(d, 'portal'))).isError, true, 'portal cannot create mailboxes');
  assert.equal((await runTool(customerTools, 'propose_ssl', { domain: 'evil.com' }, cctx(d))).isError, true);
  const tk = await runTool(customerTools, 'propose_ticket', { subject: 'Refund please', message: 'I want a refund for invoice 12' }, cctx(d));
  assert.deepEqual((tk.ui?.[0] as any).request.json, { token: 'signed:42:2' });
  assert.deepEqual(d.calls, [], 'proposals never call the panel');
});

test('cost and budget cap', () => {
  const u = { input: 1_000_000, output: 100_000, cacheRead: 2_000_000, cacheWrite: 0 };
  assert.equal(costUsd('claude-sonnet-5-5', u, DEFAULT_PRICES), 2 + 1 + 0.2);
  assert.equal(costUsd('claude-haiku-5-5', { input: 1000, output: 10, cacheRead: 0, cacheWrite: 0 }, DEFAULT_PRICES), 0.000105);
  assert.equal(costUsd('claude-haiku-5-5', { input: 200_000, output: 0, cacheRead: 0, cacheWrite: 0 }, DEFAULT_PRICES), 0.1, 'Haiku long-prompt tier x5');
  assert.deepEqual(budgetCheck(49.99, 1, { monthlyBudgetUsd: 50, dailyBudgetUsd: 5 }), { ok: true, monthPct: 100 });
  assert.deepEqual(budgetCheck(50, 1, { monthlyBudgetUsd: 50, dailyBudgetUsd: 5 }), { ok: false, reason: 'monthly' });
  assert.deepEqual(budgetCheck(10, 5, { monthlyBudgetUsd: 50, dailyBudgetUsd: 5 }), { ok: false, reason: 'daily' });
  assert.deepEqual(budgetCheck(0, 0, { monthlyBudgetUsd: 0, dailyBudgetUsd: 5 }), { ok: false, reason: 'zero' });
  assert.deepEqual(addUsage(ZERO_USAGE, { input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 1 }), { input: 5, output: 2, cacheRead: 1, cacheWrite: 0 });
});

test('settings normalisation clamps and keeps defaults', () => {
  const s = normalizeAi({ chat: { maxChars: 99999, ipDailyCalls: -4 }, tickets: { threshold: 3, vipClientIds: '12, x, 15' }, chatModel: 'gpt-4' });
  assert.equal(s.chat.maxChars, 4000); assert.equal(s.chat.ipDailyCalls, 1); assert.equal(s.tickets.threshold, 1);
  assert.deepEqual(s.tickets.vipClientIds, [12, 15]); assert.equal(s.chatModel, DEFAULT_AI.chatModel);
  assert.equal(normalizeAi(null).tickets.threshold, 0.85);
  assert.equal(normalizeAi(null).chat.maxTurns, 12);
});

test('tool loop with a mocked client: tools run server side, usage is summed, cache breakpoint on the last tool', async () => {
  const seen: any[] = [];
  const replies = [
    { content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'a', name: 'pub', input: {} }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 500 } },
    { content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: { input_tokens: 120, output_tokens: 20, cache_read_input_tokens: 500 } },
  ];
  const client = { messages: { create: async (p: any) => { seen.push(structuredClone(p)); return replies.shift(); } } };
  const out: string[] = [];
  const r = await runAgent({ client, model: 'claude-sonnet-5-5', system: [{ type: 'text', text: 'x' }], tools: TOOLS.slice(0, 1), messages: [{ role: 'user', content: 'hi' }], ctx: { surface: 'chat', scopes: ['public'] }, maxTokens: 500, onText: (t) => out.push(t) });
  assert.equal(r.text, 'Checking.\n\nDone.');
  assert.deepEqual(r.usage, { input: 220, output: 30, cacheRead: 500, cacheWrite: 500 });
  assert.deepEqual(r.tools, ['pub']);
  assert.deepEqual(seen[0].tools[0].cache_control, { type: 'ephemeral' });
  assert.equal(seen[1].messages[2].content[0].type, 'tool_result');
  assert.equal(seen[1].messages[2].content[0].content, 'pub ran');
  assert.deepEqual(out, ['Checking.', 'Done.']);
});

test('tool loop stops calling tools after maxIterations', async () => {
  let n = 0;
  const client = { messages: { create: async (p: any) => { n++; return p.tool_choice?.type === 'none' ? { content: [{ type: 'text', text: 'final' }], stop_reason: 'end_turn', usage: {} } : { content: [{ type: 'tool_use', id: String(n), name: 'pub', input: {} }], stop_reason: 'tool_use', usage: {} }; } } };
  const r = await runAgent({ client, model: 'm', system: [], tools: TOOLS.slice(0, 1), messages: [{ role: 'user', content: 'x' }], ctx: { surface: 'chat', scopes: ['public'] }, maxTokens: 100, maxIterations: 2 });
  assert.equal(n, 3); assert.equal(r.text, 'final');
});

test('history trimming keeps the last N user turns', () => {
  const h = [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }, { role: 'assistant' }, { role: 'user' }];
  assert.equal(trimHistory(h, 2).length, 3); assert.equal(trimHistory(h, 2)[0].role, 'user'); assert.equal(trimHistory(h, 10).length, 5);
});
