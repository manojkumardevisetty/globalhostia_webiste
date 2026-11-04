// Ticket spam filter, integration: lib/ai/spam-core.ts against tests/mock-whmcs.mjs (real HTTP, WHMCS API shapes) with
// sample tickets (fictional but realistic spam and legit messages). The Haiku call is replaced by canned raw model answers
// that still go through parseSpamVerdict. Checks GetTickets → GetTicket → GetClients / GetUsers → UpdateTicket /
// AddTicketNote, that no reply is ever sent, restore, and BlockTicketSender on a repeat sender.
// Run: node --test --experimental-strip-types tests/ai-spam-int.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { DEFAULT_SPAM, normalizeSpam, parseSpamVerdict, screenTicket, restoreDecision, type Call, type SpamDeps, type SpamConfig } from '../lib/ai/spam-core.ts';
import { memStore } from './ai-spam-store.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4900 + Math.floor(Math.random() * 90);
const URL_ = `http://127.0.0.1:${PORT}/includes/api.php`;
let proc: ChildProcess;

const call: Call = async (action, params = {}) => {
  const body = new URLSearchParams({ action, identifier: 'test', secret: 'test', responsetype: 'json' });
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const r = await (await fetch(URL_, { method: 'POST', body })).json() as any;
  if (r.result === 'error') throw new Error(r.message);
  return r;
};

before(async () => {
  proc = spawn(process.execPath, [path.join(ROOT, 'tests/mock-whmcs.mjs')], { env: { ...process.env, MOCK_PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await call('WhmcsDetails'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('mock WHMCS did not start');
});
after(() => { proc?.kill(); });

// Fictional samples. Spam wording modelled on what hosting companies receive; senders use reserved example domains.
const SAMPLES = [
  { id: 9101, name: 'Kevin Brooks', email: 'kevin@rankrocket-seo.example', subject: 'Get globalhostia.com on page 1 of Google',
    message: 'Hi,<br>I came across your website and noticed it is not ranking for "web hosting Dubai". We are a leading digital marketing agency. Our SEO services package (on-page, link building, 50 guest posts on DA 60+ sites) will get you to the first page of Google in 90 days.<br>Would you be interested in a quick call this week?<br>Reply STOP to unsubscribe.' },
  { id: 9102, name: 'Domain Services', email: 'notice@domain-registry-services.example', subject: 'FINAL NOTICE: globalhostia.com expiration',
    message: 'Your domain globalhostia.com will expire. Renew your search engine listing today to avoid losing customers. Pay now at <a href="https://gl0balhostia-renewals.com/pay?d=globalhostia.com">secure payment</a>.' },
  { id: 9103, name: 'Priya Nair', email: 'priya.nair@gmail.com', subject: 'VPS for a Node.js shop',
    message: 'Hello, I run a small online store and want to move from shared hosting. Do your VPS plans include a UAE location and can I run Node 22 with PM2? Also, do you migrate the database for free? Thanks, Priya' },
  { id: 9104, userid: 1, name: 'Demo Customer', email: 'demo@example.com', subject: 'Invoice overdue? click link in your email',
    message: 'I got an email saying my invoice is overdue and to click a link to verify your account. Is this from you? It looks like phishing.' },
  { id: 9105, name: 'Other Person', email: 'other@example.com', subject: 'Partnership offer',
    message: 'We are a web development agency offering white label services at $15 per hour rate. Would you be interested?' },
  { id: 9106, name: 'Alex', email: 'alex.trader@protonmail.com', subject: 'Business proposal',
    message: 'Dear CEO, I have an investment opportunity in USDT staking with guaranteed returns of 8% weekly. Contact me on Telegram.' },
  { id: 9107, name: 'Sam', email: 'sam@appforge.example', subject: 'Mobile app for your customers',
    message: 'We build iOS and Android apps for hosting companies. Can I send you our portfolio?' },
  { id: 9108, name: 'Kevin Brooks', email: 'kevin@rankrocket-seo.example', subject: 'Following up: SEO proposal',
    message: 'Just following up on my previous email about our SEO services package. Still interested?' },
];
// canned raw answers from the "model", by ticket id (9102 and 9104/9105 never reach the model)
const MODEL: Record<number, string> = {
  9101: '{"label":"solicitation","confidence":0.98,"reason":"SEO agency cold pitch"}',
  9103: '{"label":"legit","confidence":0.97,"reason":"pre-sales VPS question"}',
  9106: '{"label":"scam","confidence":0.82,"reason":"crypto investment offer"}',
  9107: 'Sure, here you go: label=solicitation', // malformed: must do nothing
  9108: '{"label":"solicitation","confidence":0.97,"reason":"SEO follow-up pitch"}',
};

test('sample tickets: spam closed / flagged, legit and clients untouched, never a reply', async () => {
  await call('MockReset');
  await call('MockSeedTickets', { json: JSON.stringify(SAMPLES.slice(0, 7)) });
  const m = memStore();
  const asked: number[] = [];
  const cfg: SpamConfig = normalizeSpam({ ...DEFAULT_SPAM, whmcsBlock: true });
  const d: SpamDeps = {
    call, store: m.store, cfg,
    classify: async (prompt, id) => { asked.push(id); assert.ok(prompt.length < 2600); assert.doesNotMatch(prompt, /<br>/); return { verdict: parseSpamVerdict(MODEL[id]), error: 'invalid JSON' }; },
  };
  const open = await call('GetTickets', { status: 'Open', limitnum: 100 });
  const list = open.tickets.ticket as any[];
  assert.equal(list.length, 7);
  const out: Record<number, string> = {};
  for (const t of list) out[t.id] = await screenTicket(d, { id: Number(t.id), tid: t.tid, activity: t.lastreply });
  assert.deepEqual(out, { 9101: 'close', 9102: 'close', 9103: 'none', 9104: 'skip', 9105: 'skip', 9106: 'flag', 9107: 'error' });
  assert.deepEqual(asked.sort(), [9101, 9103, 9106, 9107], 'rules / client checks spared the AI call for the others');

  const tk = async (id: number) => (await call('MockTicket', { ticketid: id })).ticket;
  assert.equal((await tk(9101)).status, 'Closed');
  assert.match((await tk(9101)).notes[0].message, /^Auto-closed as spam by GlobalHostia AI: SEO agency cold pitch/);
  assert.equal((await tk(9102)).status, 'Closed');
  assert.match((await tk(9102)).notes[0].message, /lookalike domain gl0balhostia-renewals\.com/);
  for (const id of [9103, 9104, 9105, 9107]) { assert.equal((await tk(id)).status, 'Open', String(id)); assert.equal((await tk(id)).notes.length, 0, String(id)); }
  assert.equal((await tk(9106)).status, 'Open');
  assert.match((await tk(9106)).notes[0].message, /Possible spam .*scam, confidence 0\.82/);
  // never a reply to anyone, never a delete
  for (const id of [9101, 9102, 9106, 9107]) assert.equal((await tk(id)).replies.length, 1);
  const { calls } = await call('MockCalls');
  assert.ok(!calls.some((c: any) => /AddTicketReply|DeleteTicket/.test(c.action)));
  assert.equal(m.rows.find((r) => r.ticketId === 9105)!.reason, 'sender email belongs to a client');

  // a closed ticket leaves the awaiting list (no owner email / AI draft afterwards)
  const still = (await call('GetTickets', { status: 'Open', limitnum: 100 })).tickets.ticket.map((t: any) => Number(t.id));
  assert.deepEqual(still.sort(), [9103, 9104, 9105, 9106, 9107]);

  // the same sender again: second confirmed spam → internal blocklist + WHMCS BlockTicketSender (no delete)
  await call('MockSeedTickets', { json: JSON.stringify([SAMPLES[7]]) });
  assert.equal(await screenTicket(d, { id: 9108, tid: 'GHX-9108', activity: 'x' }), 'close');
  assert.ok(m.senders.some((s) => s.value === 'kevin@rankrocket-seo.example' && s.list === 'block'));
  assert.ok(m.senders.some((s) => s.value === 'rankrocket-seo.example' && s.list === 'block'));
  const blocked = await call('MockCalls');
  assert.deepEqual(blocked.blockedSenders, ['kevin@rankrocket-seo.example']);
  assert.ok(await tk(9108), 'ticket kept (delete=false)');

  // owner: "Not spam, restore" → reopened, note, unblocked, allowlisted
  await restoreDecision(d, m.rows.find((r) => r.ticketId === 9101)!.id, 'owner@globalhostia.com');
  assert.equal((await tk(9101)).status, 'Open');
  assert.match((await tk(9101)).notes.at(-1).message, /Marked "not spam" by owner@globalhostia\.com/);
  assert.ok(!m.senders.some((s) => s.list === 'block' && s.value.includes('rankrocket')));
  assert.ok(m.senders.some((s) => s.list === 'allow' && s.value === 'kevin@rankrocket-seo.example'));
});

test('spam department: moved on close, moved back on restore', async () => {
  await call('MockReset');
  await call('MockSeedTickets', { json: JSON.stringify([{ ...SAMPLES[1], id: 9201, deptid: 1 }]) });
  const m = memStore();
  const d: SpamDeps = { call, store: m.store, cfg: normalizeSpam({ ...DEFAULT_SPAM, spamDeptId: 3 }), classify: null };
  assert.equal(await screenTicket(d, { id: 9201, tid: 'X', activity: 'a' }), 'close', 'lookalike rule works without the AI');
  let t = (await call('MockTicket', { ticketid: 9201 })).ticket;
  assert.deepEqual([t.status, t.deptid], ['Closed', 3]);
  await restoreDecision(d, m.rows[0].id, 'owner');
  t = (await call('MockTicket', { ticketid: 9201 })).ticket;
  assert.deepEqual([t.status, t.deptid], ['Open', 1]);
});
