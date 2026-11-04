// Ticket ratings, pure parts: signed links (tamper, expiry, wrong secret), score / comment input, which closed tickets get
// a request (guests, spam, departments, age, switched on later), the staff name, review link validation, dashboard numbers,
// and the request / owner alert emails. Run: node --test --experimental-strip-types tests/cx-ratings.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signRate, verifyRate, parseScore, cleanComment, triage, staffOf, isLow, reviewUrl, normalizeRatings, summary, trend, perStaff, whmcsTime, type ClosedTicket } from '../lib/cx/ratings-core.ts';
import { ratingEmail, lowRatingAlert, SCORE_LABEL } from '../lib/cx/ratings-email.ts';
import { verifyUnsub, signUnsub } from '../lib/reminders/core.ts';

const S = 'k'.repeat(48);
const NOW = Date.parse('2026-11-04T08:00:00Z');
const nowS = Math.floor(NOW / 1000);

test('rating link: valid, tamper-proof, expires, needs the secret', () => {
  const tok = signRate({ ticketId: 7001, clientId: 1 }, S, nowS);
  assert.deepEqual(verifyRate(tok, S, nowS)?.k, 7001);
  assert.equal(verifyRate(tok, S, nowS)?.c, 1);
  const [p, sig] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ k: 7002, c: 1, exp: nowS + 999 })).toString('base64url');
  assert.equal(verifyRate(`${forged}.${sig}`, S, nowS), null, 'another ticket id with the old signature');
  assert.equal(verifyRate(`${p}.${sig.slice(0, -2)}AA`, S, nowS), null);
  assert.equal(verifyRate(tok, 'x'.repeat(48), nowS), null);
  assert.equal(verifyRate(tok, S, nowS + 46 * 86400), null, 'expired after 45 days');
  assert.equal(verifyRate('demo', S, nowS), null);
  assert.throws(() => signRate({ ticketId: 1, clientId: 1 }, 'short'));
});

test('score and comment input', () => {
  assert.equal(parseScore('5'), 5); assert.equal(parseScore('0'), null); assert.equal(parseScore('6'), null); assert.equal(parseScore('4.5'), null); assert.equal(parseScore(null), null);
  assert.equal(cleanComment('  hi\u0000 there\r\nok  '), 'hi there\nok');
  assert.equal(cleanComment('x'.repeat(3000)).length, 2000);
});

const cfg = normalizeRatings({ enabled: true, excludeDepts: '9, 12', since: '2026-11-01T00:00:00Z' });
const tk = (o: Partial<ClosedTicket> = {}): ClosedTicket => ({ id: 7001, tid: 'GHX-1', userid: 1, deptid: 1, subject: 'Mail', status: 'Closed', lastreply: '2026-11-03 10:00:00', date: '2026-11-02 09:00:00', ...o });

test('which closed tickets are asked: one rule each, all stored as skipped otherwise', () => {
  assert.deepEqual(triage(tk(), { cfg, now: NOW, spam: false }), { ask: true });
  const why = (o: Partial<ClosedTicket>, spam = false) => { const r = triage(tk(o), { cfg, now: NOW, spam }); return r.ask ? 'ask' : r.reason; };
  assert.equal(why({ userid: 0 }), 'guest');
  assert.equal(why({}, true), 'spam', 'the spam filter closed or flagged it');
  assert.equal(why({ deptid: 12 }), 'department');
  assert.equal(why({ status: 'Answered' }), 'not-closed');
  assert.equal(why({ lastreply: '2026-10-20 10:00:00' }), 'too-old');
  assert.equal(why({ lastreply: '2026-10-30 10:00:00' }), 'before-switch-on');
  assert.equal(why({ lastreply: '', date: '' }), 'no-date');
  assert.equal(whmcsTime('2026-11-03 10:00:00'), Date.parse('2026-11-03T10:00:00Z'));
});

test('staff name from the last staff reply; low = 1..2', () => {
  assert.equal(staffOf([{ admin: 'Aisha' }, { admin: '' }, { admin: 'Omar K' }, { admin: '' }]), 'Omar K');
  assert.equal(staffOf([{ admin: '' }]), '');
  assert.ok(isLow(1, cfg) && isLow(2, cfg) && !isLow(3, cfg));
});

test('review links: only real https Google / Trustpilot pages are kept', () => {
  assert.equal(reviewUrl('https://g.page/r/CabcDEF/review', 'google'), 'https://g.page/r/CabcDEF/review');
  assert.ok(reviewUrl('https://search.google.com/local/writereview?placeid=X', 'google'));
  assert.equal(reviewUrl('http://g.page/r/x/review', 'google'), '');
  assert.equal(reviewUrl('https://evil.example/google.com', 'google'), '');
  assert.equal(reviewUrl('https://www.trustpilot.com/evaluate/globalhostia.com', 'trustpilot'), 'https://www.trustpilot.com/evaluate/globalhostia.com');
  assert.equal(reviewUrl('https://trustpilot.com.evil.io/x', 'trustpilot'), '');
  assert.equal(normalizeRatings({ googleUrl: 'javascript:alert(1)' }).googleUrl, '');
  assert.deepEqual(normalizeRatings({ excludeDepts: 'a, 3, 3, -1' }).excludeDepts, [3]);
});

test('dashboard numbers: average, distribution, weekly trend, per staff', () => {
  const rows = [{ score: 5, ratedAt: NOW - 86400_000, staff: 'Aisha' }, { score: 4, ratedAt: NOW - 2 * 86400_000, staff: 'Aisha' }, { score: 1, ratedAt: NOW - 9 * 86400_000, staff: 'Omar' }];
  const s = summary(rows);
  assert.equal(s.n, 3); assert.equal(s.avg, 3.33); assert.deepEqual(s.dist, [1, 0, 0, 1, 1]); assert.equal(s.low, 1); assert.equal(s.high, 2);
  const tr = trend(rows, NOW, 4);
  assert.equal(tr.length, 4); assert.equal(tr[3].n, 2); assert.equal(tr[3].avg, 4.5); assert.equal(tr[2].avg, 1); assert.equal(tr[0].avg, null);
  assert.deepEqual(perStaff(rows).map((x) => [x.staff, x.n, x.avg, x.low]), [['Aisha', 2, 4.5, 0], ['Omar', 1, 1, 1]]);
  assert.equal(summary([]).avg, null);
});

test('request email: five one-tap scores, no login, unsubscribe scope "rating", EN + AR', () => {
  const u = signUnsub({ e: 'demo@example.com', c: 1, s: 'rating' }, S);
  assert.equal(verifyUnsub(u, S)!.s, 'rating');
  const base = 'https://globalhostia.com/account/rate?t=abc.def&lang=en';
  const m = ratingEmail({ lang: 'en', name: 'Demo', tid: 'GHX-1', subject: 'Mail <b>down</b>', staff: 'Aisha', rateUrl: base, footer: { unsubUrl: `https://globalhostia.com/account/unsubscribe?t=${u}`, prefsUrl: 'https://globalhostia.com/account/settings', why: 'Why' } });
  assert.equal(m.subject, 'How did we do? Ticket #GHX-1');
  for (let s = 1; s <= 5; s++) assert.ok(m.html.includes(`${base.replace(/&/g, '&amp;')}&amp;s=${s}`), `score link ${s}`);
  assert.ok(m.html.includes('Mail &lt;b&gt;down&lt;/b&gt;') && m.html.includes('Answered by Aisha') && m.html.includes('Unsubscribe'));
  assert.ok(!/review|google|trustpilot|discount|reward/i.test(m.html), 'no review ask or incentive in the request itself');
  const ar = ratingEmail({ lang: 'ar', name: '', tid: 'GHX-1', subject: 'x', staff: '', rateUrl: base, footer: { unsubUrl: 'https://globalhostia.com/u', prefsUrl: 'https://globalhostia.com/p', why: 'w' } });
  assert.ok(ar.html.startsWith('<div dir="rtl" lang="ar"') && ar.html.includes(SCORE_LABEL.ar[4]));
});

test('owner alert: score, ticket, client, comment and the admin ticket link', () => {
  const a = lowRatingAlert({ score: 2, tid: 'GHX-1', ticketId: 7001, subject: 'Mail', client: 'Demo Customer', clientId: 1, staff: 'Omar', comment: '', adminUrl: 'https://globalhostia.com/admin/support/7001' });
  assert.equal(a.subject, 'Low rating (2/5) on ticket #GHX-1');
  assert.ok(a.html.includes('https://globalhostia.com/admin/support/7001') && a.html.includes('Demo Customer (#1)'));
  const f = lowRatingAlert({ score: 1, tid: 'GHX-1', ticketId: 7001, subject: 'Mail', client: '', clientId: 1, staff: '', comment: 'Too slow', adminUrl: 'https://globalhostia.com/admin/support/7001', followUp: true });
  assert.ok(f.subject.startsWith('Comment added') && f.text.includes('Too slow'));
});
