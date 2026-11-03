// Reminders: scheduling (stages, quiet hours, caps, idempotent stage choice), consent rules in config, unsubscribe /
// restore / cart / webhook tokens, E.164 phone numbers, cart snapshot validation, email bodies, SMTP message + a mock
// SMTP server, WhatsApp request shape. Run: node --test --experimental-strip-types tests/reminders.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createHmac } from 'node:crypto';
import {
  normalizeConfig, DEFAULT_CONFIG, channelsFor, cartStages, dueCartStage, dueStage, overdueStage, daysUntil, inQuiet, sendableNow, zonesFor,
  withinCaps, spacedEnough, toE164, signUnsub, verifyUnsub, signRestore, verifyRestore, signValue, verifyCart, validateCart, signHook, verifyHook,
  cartFingerprint, productLink, domainLink, dayList, LATE_DAYS,
} from '../lib/reminders/core.ts';
import { cartEmail, renewalEmail, overdueEmail, domainEmail, money, niceDate, relDays, WA_TEMPLATES } from '../lib/reminders/email.ts';
import { buildMessage, dotStuff, encodeHeader, sendSmtp } from '../lib/reminders/smtp.ts';
import { templateRequest, sendTemplate, waParam, credsOk } from '../lib/reminders/whatsapp.ts';

const SECRET = 'x'.repeat(40);
const H = 3600_000, D = 86400_000;
const NOW = Date.parse('2026-11-03T10:00:00Z'); // 14:00 in Dubai

const on = (patch: any = {}) => normalizeConfig({ ...DEFAULT_CONFIG, enabled: true, ...patch });

/* ---------------------------------------------------------------- config */
test('config: defaults are off; carts are email only whatever is stored', () => {
  const d = normalizeConfig(undefined);
  assert.equal(d.enabled, false);
  for (const k of ['cart', 'renewal', 'overdue', 'domain'] as const) assert.equal(d[k].enabled, false);
  const c = normalizeConfig({ cart: { channels: { email: false, whatsapp: true } }, whatsapp: { templates: { cart: 'gh_cart', renewal: 'gh_renewal_reminder', overdue: 'BAD NAME' } } });
  assert.deepEqual(c.cart.channels, { email: true, whatsapp: false });
  assert.deepEqual(channelsFor(c, 'cart'), { email: true, whatsapp: false });
  assert.equal((c.whatsapp.templates as any).cart, undefined, 'no WhatsApp template slot for carts');
  assert.equal(c.whatsapp.templates.renewal, 'gh_renewal_reminder');
  assert.equal(c.whatsapp.templates.overdue, '', 'invalid template names are dropped');
  assert.equal((WA_TEMPLATES as any).cart, undefined);
});

test('config: timings are ordered, promo codes validated, day lists clean', () => {
  const c = normalizeConfig({ cart: { first: 5, second: 10, third: 20, promoCode: 'bad code!', thirdEnabled: true } });
  assert.ok(c.cart.first >= 15 && c.cart.second > c.cart.first && c.cart.third > c.cart.second);
  assert.equal(c.cart.promoCode, '');
  assert.deepEqual(cartStages(c).map((s) => s.stage), ['c1', 'c2'], 'reminder 3 needs a promo code');
  assert.deepEqual(cartStages(normalizeConfig({ cart: { thirdEnabled: true, promoCode: 'COMEBACK10' } })).map((s) => s.stage), ['c1', 'c2', 'c3']);
  assert.deepEqual(dayList('30, 14,7;1, 1, abc, 500', []), [30, 14, 7, 1]);
  assert.deepEqual(dayList('', [3]), [3]);
  assert.equal(normalizeConfig({ quiet: { tz: 'Mars/Base' } }).quiet.tz, 'Asia/Dubai');
});

/* ---------------------------------------------------------------- stages */
test('cart stages: 1h, 24h, never twice, never backwards, expire, empty', () => {
  const cfg = on({ cart: { enabled: true, thirdEnabled: true, promoCode: 'COMEBACK10' } });
  const at = (ageMs: number, sent: string[] = [], items = 2) => dueCartStage({ lastActivity: NOW - ageMs, now: NOW, sent, cfg, items });
  assert.equal(at(30 * 60_000), null);
  assert.equal(at(61 * 60_000), 'c1');
  assert.equal(at(2 * H, ['c1']), null);
  assert.equal(at(25 * H, ['c1']), 'c2');
  assert.equal(at(25 * H), 'c2', 'a late run sends only the latest due stage');
  assert.equal(at(30 * H, ['c2']), null, 'never goes back to c1');
  assert.equal(at(73 * H, ['c1', 'c2']), 'c3');
  assert.equal(at(73 * H, ['c1', 'c2', 'c3']), null);
  assert.equal(at(8 * D), null, 'expired carts get nothing');
  assert.equal(at(2 * H, [], 0), null, 'empty carts get nothing');
  const noPromo = on({ cart: { enabled: true, thirdEnabled: true, promoCode: '' } });
  assert.equal(dueCartStage({ lastActivity: NOW - 80 * H, now: NOW, sent: ['c1', 'c2'], cfg: noPromo, items: 1 }), null, 'no promo → no third reminder');
});

test('due stages before a date: most urgent applicable, once per cycle, late tolerance', () => {
  const days = [30, 14, 7, 1];
  assert.equal(dueStage(45, days, []), null);
  assert.equal(dueStage(30, days, []), 'd30');
  assert.equal(dueStage(28, days, []), 'd30');
  assert.equal(dueStage(26, days, []), null, `more than ${LATE_DAYS} days late for d30 and not yet d14`);
  assert.equal(dueStage(14, days, ['d30']), 'd14');
  assert.equal(dueStage(13, days, ['d14']), null);
  assert.equal(dueStage(6, days, ['d30', 'd14']), 'd7');
  assert.equal(dueStage(0, days, ['d7']), 'd1', 'due today still gets the 1-day reminder');
  assert.equal(dueStage(5, days, ['d1']), null, 'never send a less urgent stage after a more urgent one');
  assert.equal(dueStage(-1, days, []), null);
  assert.equal(dueStage(null, days, []), null);
  assert.equal(dueStage(7, [30, 7, 1], [], 'x'), 'x7');
});

test('overdue stages after a date', () => {
  const days = [1, 3, 7];
  assert.equal(overdueStage(0, days, []), null);
  assert.equal(overdueStage(1, days, []), 'o1');
  assert.equal(overdueStage(2, days, ['o1']), null);
  assert.equal(overdueStage(4, days, ['o1']), 'o3');
  assert.equal(overdueStage(9, days, ['o1', 'o3']), 'o7');
  assert.equal(overdueStage(9, days, ['o7']), null);
  assert.equal(overdueStage(30, days, []), null, 'stale invoices are not nagged when the reminders are first switched on');
});

test('daysUntil uses the calendar day of the time zone', () => {
  const late = Date.parse('2026-11-03T21:30:00Z'); // already 4 Nov in Dubai
  assert.equal(daysUntil('2026-11-05', late, 'Asia/Dubai'), 1);
  assert.equal(daysUntil('2026-11-05', late, 'UTC'), 2);
  assert.equal(daysUntil('0000-00-00', late), null);
});

/* ---------------------------------------------------------------- quiet hours, caps */
test('quiet hours 22:00–08:00 in every zone of the country (Dubai default)', () => {
  assert.equal(inQuiet(22, 22, 8), true);
  assert.equal(inQuiet(7, 22, 8), true);
  assert.equal(inQuiet(8, 22, 8), false);
  assert.equal(inQuiet(12, 12, 12), false, 'start = end: no quiet hours');
  const q = DEFAULT_CONFIG.quiet;
  assert.equal(sendableNow(NOW, 'AE', q), true); // 14:00 Dubai
  assert.equal(sendableNow(Date.parse('2026-11-03T19:00:00Z'), 'AE', q), false); // 23:00 Dubai
  assert.equal(sendableNow(Date.parse('2026-11-03T02:00:00Z'), 'XX', q), false, 'unknown country → Dubai: 06:00');
  // 14:00 UTC = 09:00 New York but 06:00 Los Angeles → wait
  assert.equal(sendableNow(Date.parse('2026-11-03T14:00:00Z'), 'US', q), false);
  assert.equal(sendableNow(Date.parse('2026-11-03T18:00:00Z'), 'US', q), true);
  assert.ok(zonesFor('us').length === 4);
});

test('frequency caps and minimum spacing', () => {
  const caps = { perDay: 2, perWeek: 5, perRun: 60 };
  assert.equal(withinCaps([], NOW, caps), true);
  assert.equal(withinCaps([NOW - 5 * H], NOW, caps), true);
  assert.equal(withinCaps([NOW - 5 * H, NOW - 10 * H], NOW, caps), false);
  assert.equal(withinCaps([NOW - 2 * D, NOW - 3 * D, NOW - 4 * D, NOW - 5 * D, NOW - 6 * D], NOW, caps), false);
  assert.equal(withinCaps([NOW - 8 * D, NOW - 9 * D], NOW, caps), true);
  assert.equal(spacedEnough([NOW - 2 * H], NOW), false);
  assert.equal(spacedEnough([NOW - 5 * H], NOW), true);
});

/* ---------------------------------------------------------------- phone numbers */
test('E.164 from WHMCS phone formats', () => {
  assert.equal(toE164('+971.501234567'), '+971501234567');
  assert.equal(toE164('+971 50 123 4567'), '+971501234567');
  assert.equal(toE164('00971501234567'), '+971501234567');
  assert.equal(toE164('050 123 4567', { country: 'AE' }), '+971501234567');
  assert.equal(toE164('971501234567', { country: 'AE' }), '+971501234567');
  assert.equal(toE164('(512) 555-0100', { country: 'US' }), '+15125550100');
  assert.equal(toE164('07700 900123', { country: 'GB' }), '+447700900123');
  assert.equal(toE164('501234567', { cc: '971' }), '+971501234567');
  assert.equal(toE164('501234567'), null, 'no country: no guess');
  assert.equal(toE164('12', { country: 'AE' }), null);
  assert.equal(toE164(''), null);
  assert.equal(toE164('+0123456789'), null);
});

/* ---------------------------------------------------------------- tokens */
test('unsubscribe token: round trip, tamper, wrong secret', () => {
  const t = signUnsub({ e: 'Aisha@Example.com', c: 12, s: 'cart' }, SECRET);
  assert.deepEqual(verifyUnsub(t, SECRET), { e: 'aisha@example.com', c: 12, s: 'cart' });
  assert.equal(verifyUnsub(t, 'y'.repeat(40)), null);
  const [p, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ e: 'victim@example.com', c: 12, s: 'all' })).toString('base64url');
  assert.equal(verifyUnsub(`${forged}.${sig}`, SECRET), null);
  assert.equal(verifyUnsub(`${p}.${sig.slice(0, -1)}A`, SECRET), null);
  assert.equal(verifyUnsub(t, 'short'), null);
  assert.ok(t.length < 200, 'short enough for an email link');
});

test('restore token expires; signatures are domain-separated', () => {
  const t = signRestore({ id: 'abc12345xyz', st: 'c3', exp: 2_000_000_000 }, SECRET);
  assert.equal(verifyRestore(t, SECRET, 1_900_000_000)?.st, 'c3');
  assert.equal(verifyRestore(t, SECRET, 2_000_000_001), null);
  // an unsubscribe token can never be used as a restore token (different HMAC domain)
  const u = signValue('gh-unsub.v1', { id: 'abc12345xyz', st: 'c1', exp: 2_000_000_000 }, SECRET, 16);
  assert.equal(verifyRestore(u, SECRET, 1_900_000_000), null);
});

/** The WHMCS hook builds the cart token exactly like this (PHP: hash_hmac('sha256', 'gh-cart.v1.' . $payload, $secret, true)). */
function phpCartToken(claims: unknown, secret = SECRET) {
  const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${p}.${createHmac('sha256', secret).update(`gh-cart.v1.${p}`).digest('base64url')}`;
}
const nowS = Math.floor(NOW / 1000);
const goodCart = { v: 1, cid: 1, sk: 'a'.repeat(32), cur: 1, p: [{ pid: 2, cycle: 'annually', domain: 'demo-brand.com', options: false }], d: [{ domain: 'yourbrand.ae', type: 'register', years: 1 }], iat: nowS, exp: nowS + 7200 };

test('cart token from the WHMCS hook: signature, expiry, strict validation', () => {
  const v = verifyCart(phpCartToken(goodCart), SECRET, nowS);
  assert.ok(v);
  assert.deepEqual(v!.p, [{ pid: 2, cycle: 'annually', domain: 'demo-brand.com', options: false }]);
  assert.equal(verifyCart(phpCartToken(goodCart, 'z'.repeat(40)), SECRET, nowS), null, 'wrong secret');
  assert.equal(verifyCart(phpCartToken({ ...goodCart, exp: nowS - 1 }), SECRET, nowS), null, 'expired');
  assert.equal(verifyCart(phpCartToken({ ...goodCart, exp: nowS + 5 * 3600 }), SECRET, nowS), null, 'lifetime too long');
  // the hosting-hook token format (HMAC over the bare payload) is not accepted here
  const p = Buffer.from(JSON.stringify(goodCart)).toString('base64url');
  assert.equal(verifyCart(`${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}`, SECRET, nowS), null);
  for (const bad of [{ cycle: 'weekly' }, { pid: -1 }, { pid: 'x' }, { domain: 'not a domain' }]) assert.equal(validateCart({ ...goodCart, p: [{ ...goodCart.p[0], ...bad }] }), null, JSON.stringify(bad));
  assert.equal(validateCart({ ...goodCart, d: [{ domain: 'a.com', type: 'steal', years: 1 }] }), null);
  assert.equal(validateCart({ ...goodCart, d: [{ domain: 'a.com', type: 'register', years: 50 }] }), null);
  assert.equal(validateCart({ ...goodCart, sk: 'nothex!' }), null);
  // unknown fields (prices, card numbers) are dropped
  const extra = validateCart({ ...goodCart, price: '1.00', card: '4111', p: [{ ...goodCart.p[0], price: '0.01' }] })!;
  assert.equal((extra as any).price, undefined); assert.equal((extra.p[0] as any).price, undefined);
  assert.equal(validateCart({ ...goodCart, p: Array.from({ length: 50 }, (_, i) => ({ pid: i + 1, cycle: 'monthly' })) })!.p.length, 20);
  assert.equal(cartFingerprint(v!), cartFingerprint({ ...v!, iat: 1 } as any), 'fingerprint ignores issue time');
  assert.notEqual(cartFingerprint(v!), cartFingerprint({ ...v!, p: [{ ...v!.p[0], cycle: 'monthly' }] }));
});

test('webhook signature (WHMCS hook → /api/reminders/webhook)', () => {
  const body = JSON.stringify({ event: 'order', orderid: 5, cid: 1 });
  const h = signHook(body, SECRET, nowS);
  // same as PHP: 't=' . $t . ',v1=' . hash_hmac('sha256', 'gh-hook.v1.' . $t . '.' . $body, $secret)
  assert.equal(h, `t=${nowS},v1=${createHmac('sha256', SECRET).update(`gh-hook.v1.${nowS}.${body}`).digest('hex')}`);
  assert.equal(verifyHook(h, body, SECRET, nowS + 60), true);
  assert.equal(verifyHook(h, body + ' ', SECRET, nowS), false, 'body changed');
  assert.equal(verifyHook(h, body, SECRET, nowS + 301), false, 'replayed after 5 minutes');
  assert.equal(verifyHook(h, body, 'q'.repeat(40), nowS), false);
  assert.equal(verifyHook('garbage', body, SECRET, nowS), false);
  assert.equal(verifyHook(h, body, '', nowS), false, 'no secret configured → rejected');
});

test('WHMCS order links (documented cart.php?a=add)', () => {
  assert.equal(productLink('https://my.globalhostia.com/', { pid: 2, cycle: 'annually' }, { promo: 'COMEBACK10', currency: 1 }), 'https://my.globalhostia.com/cart.php?a=add&pid=2&billingcycle=annually&promocode=COMEBACK10&currency=1');
  assert.equal(domainLink('https://my.globalhostia.com', { domain: 'yourbrand.ae', type: 'register' }), 'https://my.globalhostia.com/cart.php?a=add&domain=register&query=yourbrand.ae');
});

/* ---------------------------------------------------------------- email bodies */
const footer = { unsubUrl: 'https://globalhostia.com/account/unsubscribe?t=abc.def', prefsUrl: 'https://globalhostia.com/account/settings#reminders', why: 'You get this because you started an order at GlobalHostia.' };
const copy = { subject: 'You left something in your cart', intro: 'Your order is saved.' };

test('cart email: real lines, unsubscribe link, Smarty-safe, never an invented total', () => {
  const m = cartEmail({ lang: 'en', name: 'Aisha', copy, stage: 'c1', footer, cta: 'https://globalhostia.com/api/reminders/restore?t=x',
    lines: [{ title: 'Hostia Ultra {$client}', detail: 'demo-brand.com · Yearly', price: '$59.99 USD', link: 'https://my.globalhostia.com/cart.php?a=add&pid=2' }, { title: 'yourbrand.ae', detail: 'Domain registration · 1 year', price: null, link: 'javascript:alert(1)' }], total: null });
  assert.match(m.html, /Hostia Ultra &#123;\$client&#125;/);
  assert.doesNotMatch(m.html, /[{}]/, 'no raw braces for WHMCS Smarty');
  assert.match(m.html, /\$59\.99 USD/);
  assert.match(m.html, /account\/unsubscribe\?t=abc\.def/);
  assert.doesNotMatch(m.html, /javascript:/);
  assert.doesNotMatch(m.html, />Total</, 'no total when a price is unknown');
  assert.match(m.html, /gh-btn/);
  assert.match(m.text, /Unsubscribe: https:\/\/globalhostia\.com\/account\/unsubscribe/);
  assert.doesNotMatch(m.html, /whatsapp/i, 'cart reminders say nothing about WhatsApp');
  const promo = cartEmail({ lang: 'en', name: '', copy, stage: 'c3', footer, cta: 'https://x.example/', lines: [], total: '$1.00 USD', promo: 'COMEBACK10' });
  assert.match(promo.html, /COMEBACK10/);
  assert.match(promo.html, /Hi there,/);
});

test('Arabic emails are right-to-left; renewal / overdue / domain bodies', () => {
  const r = renewalEmail({ lang: 'ar', name: 'عائشة', copy: { subject: 'تجديداتك القادمة', intro: 'x' }, footer, cta: 'https://globalhostia.com/account/renewals', total: '$83.99 USD',
    lines: [{ title: 'Cloud VPS 4', detail: 'Servers', date: niceDate('2026-11-15', 'ar'), rel: relDays(12, 'ar'), price: '$24.00 USD', auto: null, invoice: { num: '5001', url: 'https://globalhostia.com/account/invoices/5001' } }] });
  assert.match(r.html, /dir="rtl"/); assert.match(r.html, /نوفمبر/); assert.match(r.html, /5001/); assert.match(r.html, /account\/renewals/);
  const o = overdueEmail({ lang: 'en', name: 'Aisha', copy: { subject: 'Payment reminder', intro: 'x' }, footer, items: ['Cloud VPS 4 - vps1'], invoice: { num: '5001', date: '1 Nov 2026', due: '3 Nov 2026', days: 3, total: '$25.20 USD', url: 'https://globalhostia.com/account/invoices/5001' } });
  assert.match(o.subject, /#5001$/); assert.match(o.html, /3 days/); assert.match(o.html, /Pay invoice/);
  const d = domainEmail({ lang: 'en', name: 'A', copy: { subject: 'Domain at risk', intro: 'x' }, footer, cta: 'https://globalhostia.com/account/renewals', lines: [{ domain: 'demo-legacy.org', date: '31 Oct 2026', rel: '3 days ago', price: '$12.65 USD', grace: true, url: 'https://globalhostia.com/account/domains/305' }] });
  assert.match(d.html, /grace period/); assert.match(d.html, /Auto-renew off/);
  assert.equal(money(1234.5, { code: 'USD', prefix: '$', suffix: ' USD' }), '$1,234.50 USD');
  assert.equal(money(35, { code: 'AED', prefix: '', suffix: '' }), '35.00 AED');
  assert.equal(relDays(0, 'en', 'expires'), 'expires today');
});

/* ---------------------------------------------------------------- SMTP */
test('SMTP message: headers, one-click unsubscribe, Arabic subject, dot-stuffing', () => {
  const msg = buildMessage('GlobalHostia <billing@globalhostia.com>', { to: 'a@example.com', subject: 'تجديداتك', html: '<p>x</p>', text: 'x',
    headers: { 'List-Unsubscribe': '<https://globalhostia.com/account/unsubscribe?t=a&one-click=1>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', 'X-Evil': 'a\r\nBcc: x@evil.com' } }, new Date(NOW));
  assert.match(msg, /^From: GlobalHostia <billing@globalhostia\.com>\r\n/);
  assert.match(msg, /\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(msg, /\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n/);
  assert.doesNotMatch(msg, /\r\nBcc:/, 'header injection is neutralised');
  assert.equal(encodeHeader('Plain'), 'Plain');
  assert.equal(dotStuff('a\n.b\n..c'), 'a\r\n..b\r\n...c');
});

test('SMTP client talks to a mock server (AUTH LOGIN, DATA)', async () => {
  const seen: string[] = [];
  let data = '';
  const srv = net.createServer((s) => {
    let inData = false, buf = '';
    s.write('220 mock ESMTP\r\n');
    s.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; s.write('250 queued\r\n'); } else data += line + '\n'; continue; }
        seen.push(line);
        if (/^EHLO/.test(line)) s.write('250-mock\r\n250 AUTH LOGIN\r\n');
        else if (line === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n');
        else if (seen.length === 3 || seen.length === 4) s.write(seen.length === 3 ? '334 UGFzc3dvcmQ6\r\n' : '235 ok\r\n');
        else if (/^MAIL FROM/.test(line) || /^RCPT TO/.test(line)) s.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
      }
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as net.AddressInfo).port;
  await sendSmtp({ host: '127.0.0.1', port, user: 'u@globalhostia.com', pass: 'p', from: 'GlobalHostia <u@globalhostia.com>', secure: 'none' }, { to: 'a@example.com', subject: 'Hi', html: '<p>.</p>', text: '.start' });
  srv.close();
  assert.equal(seen[0], 'EHLO globalhostia.com');
  assert.equal(Buffer.from(seen[2], 'base64').toString(), 'u@globalhostia.com');
  assert.ok(seen.includes('MAIL FROM:<u@globalhostia.com>') && seen.includes('RCPT TO:<a@example.com>'));
  assert.match(data, /Subject: Hi/);
});

/* ---------------------------------------------------------------- WhatsApp */
test('WhatsApp Cloud API request: template, E.164 without +, cleaned parameters', async () => {
  const r = templateRequest('+971501234567', 'gh_renewal_reminder', 'ar', ['عائشة', 'Cloud VPS 4\nand more', '15 Nov 2026', 'https://globalhostia.com/account/renewals']);
  assert.equal(r.to, '971501234567'); assert.equal(r.type, 'template'); assert.equal(r.template.language.code, 'ar');
  assert.equal(r.template.components[0].parameters[1].text, 'Cloud VPS 4 and more');
  assert.equal(waParam(''), '-');
  assert.equal(credsOk({ phoneId: '123', token: 'x' }), false);
  const creds = { phoneId: '1234567890123', token: 'EAAG' + 'x'.repeat(40) };
  let call: any;
  const ok = await sendTemplate(creds, '+971501234567', 'gh_renewal_reminder', 'en', ['a'], (async (url: string, init: any) => { call = { url, init }; return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 }); }) as any);
  assert.deepEqual(ok, { ok: true, id: 'wamid.X' });
  assert.match(call.url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/1234567890123\/messages$/);
  assert.equal(call.init.headers.authorization, `Bearer ${creds.token}`);
  const bad = await sendTemplate(creds, '+971501234567', 't', 'en', [], (async () => new Response(JSON.stringify({ error: { message: 'Template not approved' } }), { status: 400 })) as any);
  assert.deepEqual(bad, { ok: false, status: 400, error: 'Template not approved' });
  assert.deepEqual(await sendTemplate(creds, '0501234567', 't', 'en', []), { ok: false, error: 'bad-number' });
});
