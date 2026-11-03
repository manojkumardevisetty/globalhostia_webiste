// Ticket automation routing (which tickets auto-send vs draft) and PII-safe logging.
// Run: node --test --experimental-strip-types tests/ai-policy.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideTicket, parseClassification, riskHits, wantsHuman, redact, AUTO_SIGNATURE, type TicketFacts } from '../lib/ai/policy.ts';

const DRAFT = 'Hi Sam, to add a mailbox open Manage hosting, then Email, choose your domain and click Create. Then use the settings card on your phone.';
const base = (o: Partial<TicketFacts> = {}, cls: any = {}): TicketFacts => ({
  cls: { category: 'how-to', simple: true, sentiment: 'neutral', urgency: 'normal', language: 'en', confidence: 0.92, summary: '', ...cls },
  text: 'Subject: New mailbox\n\nHow do I create info@mysite.com?', draft: DRAFT, isVip: false, priorAutoReplies: 0, autoSendOn: true, threshold: 0.85, hasAdminUser: true, ...o,
});

test('simple how-to above threshold is auto-sent', () => {
  assert.equal(decideTicket(base()).action, 'auto_send');
  assert.equal(decideTicket(base({}, { category: 'technical', simple: true })).action, 'auto_send');
});

test('everything else becomes a draft, with reasons', () => {
  const cases: [string, TicketFacts][] = [
    ['low confidence', base({}, { confidence: 0.6 })],
    ['threshold is the admin setting', base({ threshold: 0.95 })],
    ['technical but not simple', base({}, { category: 'technical', simple: false })],
    ['billing', base({}, { category: 'billing' })],
    ['abuse', base({}, { category: 'abuse' })],
    ['cancellation', base({}, { category: 'cancellation' })],
    ['refund wording in a how-to', base({ text: 'How do I get a refund for my plan?' })],
    ['invoice wording', base({ text: 'how to download my invoice' })],
    ['security wording', base({ text: 'my site was hacked, how to clean it' })],
    ['legal wording', base({ text: 'my lawyer says the domain is ours' })],
    ['arabic refund', base({ text: 'كيف أحصل على استرداد المبلغ' })],
    ['VIP', base({ isVip: true })],
    ['kill switch', base({ autoSendOn: false })],
    ['already auto-replied once', base({ priorAutoReplies: 1 })],
    ['customer wants a human', base({ text: 'human please' })],
    ['angry', base({}, { sentiment: 'angry' })],
    ['urgent', base({}, { urgency: 'critical' })],
    ['draft promises a refund', base({ draft: DRAFT + ' We will refund you today.' })],
    ['no admin username for WHMCS', base({ hasAdminUser: false })],
    ['empty draft', base({ draft: '' })],
  ];
  for (const [why, f] of cases) {
    const d = decideTicket(f);
    assert.equal(d.action, 'draft', why);
    assert.ok(d.reasons.length > 0, why);
  }
});

test('classifier output is validated', () => {
  assert.equal(parseClassification('{"category":"how-to","simple":true,"sentiment":"neutral","urgency":"low","language":"ar","confidence":0.9,"summary":"x"}').confidence, 0.9);
  const bad = parseClassification('{"category":"free-money","confidence":0.99}');
  assert.equal(bad.category, 'other'); assert.equal(bad.confidence, 0);
  assert.equal(parseClassification('not json').confidence, 0);
  assert.equal(parseClassification({ category: 'billing', confidence: 7 }).confidence, 1);
});

test('keywords, human requests, signature', () => {
  assert.deepEqual(riskHits('Please cancel and refund'), ['cancel', 'refund']);
  assert.equal(riskHits('How do I point my domain to the hosting?').length, 0);
  assert.ok(wantsHuman('Can I talk to a real person?'));
  assert.ok(wantsHuman('موظف'));
  assert.ok(!wantsHuman('how to install wordpress'));
  assert.match(AUTO_SIGNATURE('en'), /Reply 'human' to reach our team/);
  assert.match(AUTO_SIGNATURE('ar'), /human/);
});

test('redact removes secrets before logging', () => {
  const r = redact('password: hunter2 key sk-ant-api03-abcdefghijklmnop card 4111 1111 1111 1111 token=abcdefghijklmnopqrstuvwxyz0123456789ABCD');
  assert.ok(!r.includes('hunter2')); assert.ok(!r.includes('sk-ant')); assert.ok(!r.includes('4111')); assert.ok(!r.includes('abcdefghijklmnopqrstuvwxyz0123456789'));
});
