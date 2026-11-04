// Ticket spam filter, unit: rule layer, client bypass, thresholds and actions, restore, blocklist, strict JSON parsing
// (a bad AI answer does nothing). Pure lib/ai/spam-core.ts with an in-memory store and a recording WHMCS stub.
// Run: node --test --experimental-strip-types tests/ai-spam.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPAM, normalizeSpam, ruleCheck, isLookalike, extractHosts, parseSpamVerdict, decideSpam, fallbackVerdict, spamPrompt, screenTicket,
  restoreDecision, confirmDecision, maybeBlock, closeNote, senderEntry, holdFrom,
  type Decision, type SenderRow, type SpamConfig, type SpamDeps, type SpamStore, type Verdict, type Lists,
} from '../lib/ai/spam-core.ts';
import { memStore } from './ai-spam-store.mts';

const cfg = (o: Partial<SpamConfig> = {}) => normalizeSpam({ ...DEFAULT_SPAM, ...o });
const NO: Lists = { block: [], allow: [] };
const R = (subject: string, body: string, email = 'someone@agency.example') => ({ subject, body, raw: body, email });

type T = { userid?: number; email: string; name?: string; subject: string; message: string; status?: string; deptid?: number; staff?: boolean };
function stub(tickets: Record<number, T>, clients: string[] = [], opts: { failClients?: boolean; failUpdate?: boolean } = {}) {
  const calls: { action: string; p: any }[] = [];
  const call = async (action: string, p: any = {}) => {
    calls.push({ action, p });
    const t = tickets[Number(p.ticketid)];
    if (action === 'GetTicket') return { id: p.ticketid, userid: t.userid || 0, email: t.email, name: t.name || 'X', subject: t.subject, status: t.status || 'Open', deptid: t.deptid || 1,
      replies: { reply: [{ userid: t.userid || 0, email: t.email, name: t.name, message: t.message, admin: '' }, ...(t.staff ? [{ admin: 'Rahul', message: 'Hello' }, { userid: 0, email: t.email, message: 'again', admin: '' }] : [])] } };
    if (action === 'GetClients') { if (opts.failClients) throw new Error('WHMCS down'); return { clients: { client: clients.filter((c) => c.includes(String(p.search))).map((email) => ({ email })) } }; }
    if (action === 'GetUsers') return { users: [] };
    if (action === 'UpdateTicket') { if (opts.failUpdate) throw new Error('Permission denied'); if (p.status) t.status = p.status; if (p.deptid) t.deptid = p.deptid; return {}; }
    return {};
  };
  return { call, calls, writes: () => calls.filter((c) => ['UpdateTicket', 'AddTicketNote', 'AddTicketReply', 'BlockTicketSender', 'DeleteTicket'].includes(c.action)) };
}
const deps = (s: ReturnType<typeof stub>, m: ReturnType<typeof memStore>, c: SpamConfig, verdict: Verdict | null | 'unavailable' | string = null): SpamDeps & { aiCalls: number } => {
  const d: any = {
    call: s.call, store: m.store, cfg: c, aiCalls: 0,
    classify: verdict === 'unavailable' ? null : async () => { d.aiCalls++; return typeof verdict === 'string' ? { verdict: parseSpamVerdict(verdict), error: 'invalid JSON' } : { verdict }; },
  };
  d.saveCfg = async (x: SpamConfig) => { d.cfg = x; };
  return d;
};

/* ---------------------------------------------------------------- config */
test('defaults: on, auto-close at 0.95, flag from 0.6; thresholds clamped', () => {
  assert.deepEqual([DEFAULT_SPAM.enabled, DEFAULT_SPAM.mode, DEFAULT_SPAM.closeAt, DEFAULT_SPAM.flagAt], [true, 'close', 0.95, 0.6]);
  const c = normalizeSpam({ closeAt: 0.2, flagAt: 0.99, mode: 'nuke', phrases: 'Guest Post\nSEO package\nx', blockSenders: '@spam.example\nbad@x.example\nnot an email' });
  assert.equal(c.closeAt, 0.8, 'auto-close can never go below 0.8');
  assert.equal(c.flagAt, 0.8, 'flag threshold capped at the close threshold');
  assert.equal(c.mode, 'close');
  assert.deepEqual(c.phrases, ['guest post', 'seo package']);
  assert.deepEqual(c.blockSenders, ['spam.example', 'bad@x.example']);
  assert.equal(senderEntry('*.Spam.Example'), 'spam.example');
});

/* ---------------------------------------------------------------- rules */
test('lookalike domains of GlobalHostia are caught; ours and unrelated ones are not', () => {
  for (const h of ['gl0balhostia-billing.com', 'globalhostla.net', 'globalhostia.com.verify-account.top', 'global-hostia.support', 'secure-globalhostiaa.com', 'xn--globalhosta-4wf.com', 'budgetglobalhostlng.com'])
    assert.equal(isLookalike(h), true, h);
  for (const h of ['globalhostia.com', 'my.globalhostia.com', 'budgetglobalhosting.com', 'google.com', 'hostinger.com', 'global-shipping.com', 'example.org'])
    assert.equal(isLookalike(h), false, h);
});

test('extractHosts reads href links, bare www and plain domains', () => {
  const { urls, hosts } = extractHosts('<a href="https://Pay.Gl0balhostia-renew.com/x?id=1">pay</a> visit www.seo-kings.example or rank-now.com.');
  assert.equal(urls.length, 2);
  assert.ok(hosts.includes('pay.gl0balhostia-renew.com') && hosts.includes('www.seo-kings.example') && hosts.includes('rank-now.com'), hosts.join());
});

test('rule layer: allowlist / own domain bypass, blocklist and phrases decide, lookalike link = scam', () => {
  const c = cfg({ phrases: ['guest post opportunity'], blockSenders: ['leads.example'], allowSenders: ['partner@registrar.example'] });
  assert.equal(ruleCheck(R('Hi', 'anything', 'partner@registrar.example'), c, NO).bypass, 'sender on the allowlist');
  assert.equal(ruleCheck(R('Hi', 'anything', 'ops@restored.example'), c, { block: [], allow: ['ops@restored.example'] }).bypass, 'sender on the allowlist');
  assert.match(ruleCheck(R('Hi', 'x', 'staff@globalhostia.com'), c, NO).bypass!, /GlobalHostia domain/);
  const b = ruleCheck(R('Data', 'Buy our list', 'sam@leads.example'), c, NO).verdict!;
  assert.deepEqual([b.label, b.confidence], ['junk', 1]);
  const auto = ruleCheck(R('Hi', 'x', 'x@auto.example'), c, { block: [{ value: 'x@auto.example', label: 'scam' }], allow: [] }).verdict!;
  assert.deepEqual([auto.label, auto.confidence], ['scam', 1]);
  const p = ruleCheck(R('Guest Post Opportunity for your blog', 'Dear webmaster'), c, NO).verdict!;
  assert.deepEqual([p.label, p.confidence], ['solicitation', 0.96]);
  const l = ruleCheck(R('Domain suspended', 'Verify now: https://gl0balhostia-verify.com/login'), c, NO).verdict!;
  assert.equal(l.label, 'scam'); assert.match(l.reason, /lookalike domain gl0balhostia-verify\.com/);
  const s = ruleCheck(R('Billing', 'Please pay', 'billing@globalhostia-invoices.net'), c, NO).verdict!;
  assert.match(s.reason, /sender on lookalike/);
});

test('heuristics are hints for the AI, never a decision on their own', () => {
  const r = ruleCheck(R('SEO services for globalhostia.com', 'Hi, I came across your website. Our SEO services package will get you on the first page of Google. We also do link building and guest posts. Would you be interested? Reply STOP to unsubscribe.'), cfg(), NO);
  assert.equal(r.verdict, undefined);
  assert.ok(r.hints.includes('SEO offer') && r.hints.includes('link building / guest posts') && r.hints.includes('cold sales wording'), r.hints.join());
  assert.equal(r.lean, 'solicitation');
  const many = ruleCheck(R('Links', Array.from({ length: 11 }, (_, i) => `https://x${i}.example/`).join(' ')), cfg(), NO);
  assert.ok(many.hints.includes('11 links')); assert.equal(many.urls, 11);
  const legit = ruleCheck(R('Do you support Node.js?', 'Hello, I want to move my shop to you. Do your VPS plans support Node 22 and a UAE datacenter? Thanks, Priya', 'priya@gmail.com'), cfg(), NO);
  assert.deepEqual([legit.score, legit.hints.length, legit.verdict], [0, 0, undefined]);
  // fallback (no AI): strong heuristics flag at 0.7, weak ones do nothing
  assert.equal(fallbackVerdict(r)!.confidence, 0.7);
  assert.equal(fallbackVerdict(legit), null);
});

test('prompt is short: body cut to 2,000 characters, hints and link count included', () => {
  const body = 'x'.repeat(9000);
  const p = spamPrompt(R('Subj', body), ruleCheck(R('Subj', body), cfg(), NO));
  assert.ok(p.length < 2400, String(p.length));
  assert.match(p, /no customer account/); assert.match(p, /Rule hints: none/);
});

/* ---------------------------------------------------------------- AI answer parsing */
test('parseSpamVerdict is strict: anything off returns null', () => {
  assert.deepEqual(parseSpamVerdict('{"label":"scam","confidence":0.97,"reason":"fake invoice"}'), { label: 'scam', confidence: 0.97, reason: 'fake invoice' });
  assert.deepEqual(parseSpamVerdict('Sure! {"label":"junk","confidence":1,"reason":"casino"} done')?.label, 'junk');
  for (const bad of [null, '', 'not json', '{"label":"spam","confidence":0.9,"reason":"x"}', '{"label":"scam","confidence":"0.9","reason":"x"}', '{"label":"scam","confidence":1.4,"reason":"x"}',
    '{"label":"scam","reason":"x"}', '{"label":"scam","confidence":0.99}', '[1,2]', '{"label":"scam","confidence":NaN,"reason":"x"}', '{"label":"scam",'])
    assert.equal(parseSpamVerdict(bad), null, String(bad));
});

/* ---------------------------------------------------------------- decision */
test('thresholds and modes', () => {
  const v = (label: any, confidence: number): Verdict => ({ label, confidence, reason: 'r' });
  const c = cfg();
  assert.equal(decideSpam(v('scam', 0.97), c, { hasStaffReply: false }).action, 'close');
  assert.equal(decideSpam(v('solicitation', 0.95), c, { hasStaffReply: false }).action, 'close');
  assert.equal(decideSpam(v('junk', 0.94), c, { hasStaffReply: false }).action, 'flag');
  assert.equal(decideSpam(v('junk', 0.6), c, { hasStaffReply: false }).action, 'flag');
  assert.equal(decideSpam(v('junk', 0.59), c, { hasStaffReply: false }).action, 'none');
  assert.equal(decideSpam(v('legit', 0.99), c, { hasStaffReply: false }).action, 'none');
  assert.equal(decideSpam(v('scam', 1), cfg({ mode: 'flag' }), { hasStaffReply: false }).action, 'flag', 'flag-only mode never closes');
  assert.equal(decideSpam(v('scam', 1), c, { hasStaffReply: true }).action, 'flag', 'never close a ticket staff already answered');
  assert.equal(decideSpam(v('scam', 0.91), cfg({ closeAt: 0.9 }), { hasStaffReply: false }).action, 'close', 'owner can lower to 0.9');
  assert.equal(decideSpam(null, c, { hasStaffReply: false }).action, 'none');
});

/* ---------------------------------------------------------------- flow */
const SPAM: T = { status: 'Open', email: 'growth@rankboost.example', name: 'Kevin', subject: 'Get globalhostia.com to page 1 of Google', message: 'We are a leading SEO agency...' };

test('client tickets are never screened: no AI call, no WHMCS writes', async () => {
  const m = memStore();
  for (const [t, clients] of [[{ ...SPAM, userid: 7 }, []], [SPAM, ['growth@rankboost.example']]] as [T, string[]][]) {
    const s = stub({ 1: t }, clients);
    const d = deps(s, m, cfg(), { label: 'solicitation', confidence: 0.99, reason: 'seo pitch' });
    assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: String(Math.random()) }), 'skip');
    assert.equal(d.aiCalls, 0); assert.deepEqual(s.writes(), []);
  }
  assert.ok(m.rows.every((r) => r.action === 'skip' && /client/.test(r.reason)));
});

test('client lookup failure: fail safe, not screened', async () => {
  const m = memStore(), s = stub({ 1: SPAM }, [], { failClients: true });
  const d = deps(s, m, cfg(), { label: 'scam', confidence: 1, reason: 'x' });
  assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: 'a' }), 'skip');
  assert.equal(d.aiCalls, 0); assert.deepEqual(s.writes(), []);
});

test('confident spam from a non-client: closed with a note, never a reply, never deleted; claimed once', async () => {
  const m = memStore(), s = stub({ 1: { ...SPAM } });
  const d = deps(s, m, cfg(), { label: 'solicitation', confidence: 0.98, reason: 'SEO agency cold pitch' });
  assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: 'a' }), 'close');
  assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: 'a' }), 'claimed');
  const w = s.writes();
  assert.deepEqual(w.map((x) => x.action), ['UpdateTicket', 'AddTicketNote']);
  assert.equal(w[0].p.status, 'Closed'); assert.equal(w[0].p.deptid, undefined);
  assert.equal(w[1].p.message, closeNote('SEO agency cold pitch'));
  assert.match(w[1].p.message, /^Auto-closed as spam by GlobalHostia AI: SEO agency cold pitch \(restore in admin/);
  assert.equal(m.rows[0].action, 'close'); assert.equal(m.rows[0].prevStatus, 'Open');
});

test('spam department + custom status; restore moves it back and reopens', async () => {
  const m = memStore(), tk = { 1: { ...SPAM, deptid: 2 } }, s = stub(tk);
  const d = deps(s, m, cfg({ spamDeptId: 9, closeStatus: 'Spam' }), { label: 'scam', confidence: 0.99, reason: 'fake invoice' });
  await screenTicket(d, { id: 1, tid: 'A', activity: 'a' });
  assert.deepEqual([tk[1].status, tk[1].deptid], ['Spam', 9]);
  const r = await restoreDecision(d, m.rows[0].id, 'owner@globalhostia.com');
  assert.equal(r.state, 'restored');
  assert.deepEqual([tk[1].status, tk[1].deptid], ['Open', 2]);
  assert.ok(m.senders.some((x) => x.value === SPAM.email && x.list === 'allow'), 'sender allowlisted');
  // next ticket from the same sender is not screened at all
  tk[2 as 1] = { ...SPAM };
  assert.equal(await screenTicket(d, { id: 2, tid: 'B', activity: 'b' }), 'skip');
  assert.equal(s.calls.filter((c) => c.action === 'AddTicketReply').length, 0);
});

test('mid confidence: flag only (note), ticket stays open; admin can confirm it', async () => {
  const m = memStore(), tk = { 1: { ...SPAM } }, s = stub(tk);
  const d = deps(s, m, cfg(), { label: 'solicitation', confidence: 0.8, reason: 'looks like a sales pitch' });
  assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: 'a' }), 'flag');
  assert.deepEqual(s.writes().map((x) => x.action), ['AddTicketNote']);
  assert.match(s.writes()[0].p.message, /Possible spam .*auto-reply is off/);
  assert.equal(tk[1].status, 'Open');
  await confirmDecision(d, m.rows[0].id, 'owner@globalhostia.com');
  assert.equal(tk[1].status, 'Closed');
  assert.deepEqual([m.rows[0].action, m.rows[0].state], ['close', 'confirmed']);
});

test('staff already replied: flagged, not closed', async () => {
  const m = memStore(), tk = { 1: { ...SPAM, staff: true } }, s = stub(tk);
  assert.equal(await screenTicket(deps(s, m, cfg(), { label: 'scam', confidence: 0.99, reason: 'x' }), { id: 1, tid: 'A', activity: 'a' }), 'flag');
  assert.equal(tk[1].status, 'Open');
});

test('bad AI JSON or API error: nothing at all is done (fail safe)', async () => {
  for (const v of ['{"label":"maybe","confidence":2}', 'I think this is spam']) {
    const m = memStore(), s = stub({ 1: { ...SPAM } });
    assert.equal(await screenTicket(deps(s, m, cfg(), v), { id: 1, tid: 'A', activity: 'a' }), 'error');
    assert.deepEqual(s.writes(), []);
    assert.match(m.rows[0].reason, /nothing done/);
  }
  const m = memStore(), s = stub({ 1: { ...SPAM } });
  const d = deps(s, m, cfg(), null); d.classify = async () => { throw new Error('boom'); };
  assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: 'a' }), 'error');
  assert.deepEqual(s.writes(), []);
});

test('close failure (API role without UpdateTicket): recorded, no note', async () => {
  const m = memStore(), s = stub({ 1: { ...SPAM } }, [], { failUpdate: true });
  assert.equal(await screenTicket(deps(s, m, cfg(), { label: 'scam', confidence: 1, reason: 'x' }), { id: 1, tid: 'A', activity: 'a' }), 'error');
  assert.deepEqual(s.writes().map((x) => x.action), ['UpdateTicket']);
  assert.match(m.rows[0].reason, /close failed: Permission denied/);
});

test('rules decide without an AI call (cost); AI unavailable: heuristics can flag, never close', async () => {
  const m = memStore(), s = stub({ 1: { ...SPAM, message: 'Guest post opportunity on your blog' }, 2: { ...SPAM, message: 'Our SEO services package puts you on the first page of Google, plus link building and guest posts.' }, 3: { ...SPAM, message: 'Hello, quick question about VPS pricing.' } });
  const d = deps(s, m, cfg({ phrases: ['guest post opportunity'] }), { label: 'legit', confidence: 0.9, reason: 'x' });
  assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: 'a' }), 'close');
  assert.equal(d.aiCalls, 0);
  const off = deps(s, m, cfg(), 'unavailable');
  assert.equal(await screenTicket(off, { id: 2, tid: 'B', activity: 'b' }), 'flag');
  assert.equal(await screenTicket(off, { id: 3, tid: 'C', activity: 'c' }), 'none');
  assert.equal(m.rows.find((r) => r.ticketId === 2)!.source, 'fallback');
});

test('off: nothing happens', async () => {
  const m = memStore(), s = stub({ 1: SPAM });
  assert.equal(await screenTicket(deps(s, m, cfg({ enabled: false }), { label: 'scam', confidence: 1, reason: 'x' }), { id: 1, tid: 'A', activity: 'a' }), 'off');
  assert.equal(s.calls.length, 0); assert.equal(m.rows.length, 0);
});

/* ---------------------------------------------------------------- blocklist */
test('second confirmed spam blocks the sender (and a company domain, never freemail); restore unblocks', async () => {
  const m = memStore();
  const tk: Record<number, T> = { 1: { ...SPAM }, 2: { ...SPAM }, 3: { ...SPAM, email: 'other@rankboost.example' }, 4: { ...SPAM, email: 'x@gmail.com' }, 5: { ...SPAM, email: 'y@gmail.com' }, 6: { ...SPAM, email: 'new@rankboost.example' } };
  const s = stub(tk);
  const d = deps(s, m, cfg({ whmcsBlock: true }), { label: 'solicitation', confidence: 0.99, reason: 'pitch' });
  await screenTicket(d, { id: 1, tid: 'A', activity: 'a' });
  assert.equal(m.senders.length, 0, 'one is not enough');
  await screenTicket(d, { id: 2, tid: 'B', activity: 'b' });
  assert.deepEqual(m.senders.map((x) => [x.value, x.list, x.source]), [['growth@rankboost.example', 'block', 'auto'], ['rankboost.example', 'block', 'auto']]);
  assert.equal(s.calls.filter((c) => c.action === 'BlockTicketSender').length, 1);
  assert.equal(s.calls.find((c) => c.action === 'BlockTicketSender')!.p.delete, false, 'never deletes');
  // blocked domain: next ticket closes on rules, no AI call
  const before = d.aiCalls;
  assert.equal(await screenTicket(d, { id: 6, tid: 'F', activity: 'f' }), 'close');
  assert.equal(d.aiCalls, before);
  // freemail domain never blocked as a whole
  await screenTicket(d, { id: 4, tid: 'D', activity: 'd' }); await screenTicket(d, { id: 5, tid: 'E', activity: 'e' });
  assert.ok(!m.senders.some((x) => x.value === 'gmail.com'));
  // restore: email unblocked, auto domain entry removed, sender allowlisted
  await restoreDecision(d, m.rows.find((r) => r.ticketId === 2)!.id, 'owner');
  assert.ok(!m.senders.some((x) => x.list === 'block' && (x.value === 'growth@rankboost.example' || x.value === 'rankboost.example')));
  assert.ok(m.senders.some((x) => x.list === 'allow' && x.value === 'growth@rankboost.example'));
});

test('restore also removes the sender from the owner blocklist; allowlisted senders are never auto-blocked', async () => {
  const m = memStore(), s = stub({ 1: { ...SPAM } });
  const d = deps(s, m, cfg({ blockSenders: [SPAM.email] }), null);
  assert.equal(await screenTicket(d, { id: 1, tid: 'A', activity: 'a' }), 'close');
  await restoreDecision(d, m.rows[0].id, 'owner');
  assert.deepEqual(d.cfg.blockSenders, []);
  await m.store.addSender({ value: 'z@q.example', kind: 'email', list: 'allow', source: 'owner', label: 'legit' });
  assert.deepEqual(await maybeBlock(d, { ticketId: 1, email: 'z@q.example', label: 'junk' }), []);
});

test('AI ticket assistant hold: flagged / closed spam and unscreened non-client activity are held; clients never', () => {
  const on = { enabled: true, userid: 0 };
  assert.equal(holdFrom([], 'a', on), true, 'not screened yet');
  assert.equal(holdFrom([{ action: 'pending', state: 'active', activity: 'a' }], 'a', on), true);
  assert.equal(holdFrom([{ action: 'none', state: 'active', activity: 'a' }], 'a', on), false);
  assert.equal(holdFrom([{ action: 'error', state: 'active', activity: 'a' }], 'a', on), false, 'filter error: assistant works as before');
  assert.equal(holdFrom([{ action: 'flag', state: 'active', activity: 'old' }, { action: 'none', state: 'active', activity: 'a' }], 'a', on), true, 'once flagged, held until restored');
  assert.equal(holdFrom([{ action: 'close', state: 'restored', activity: 'old' }, { action: 'skip', state: 'active', activity: 'a' }], 'a', on), false);
  assert.equal(holdFrom([], 'a', { enabled: true, userid: 7 }), false, 'client ticket');
  assert.equal(holdFrom([], 'a', { enabled: false }), false, 'filter off');
});
