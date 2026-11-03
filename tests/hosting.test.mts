// Unit checks for the hosting manager guard rails. Run: node --test --experimental-strip-types tests/hosting.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signToken, verifyToken, bearer } from '../lib/hosting/token.ts';
import { safePath, safeName, splitPath, underHome, ownedDomain, panelUser, dnsRecord, dnsName, mailUser, dbFullName, password, InputError } from '../lib/hosting/validate.ts';
import { seal, unseal, encKey } from '../lib/hosting/crypto.ts';
import { serverFor } from '../lib/hosting/match.ts';
import { parseDa, daError, toList, parseDaZone, attrs } from '../lib/hosting/providers/directadmin-parse.ts';

const SECRET = 'x'.repeat(40);
const NOW = 1_800_000_000;
const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** Same algorithm as docs/whmcs/globalhostia_hosting_hook.php */
const phpToken = (claims: object, secret: string) => { const p = b64url(Buffer.from(JSON.stringify(claims))); return `${p}.${b64url(createHmac('sha256', secret).update(p).digest())}`; };

test('token: valid round trip and PHP-compatible format', () => {
  const t = phpToken({ cid: 12, sid: 345, exp: NOW + 600 }, SECRET);
  assert.equal(t, signToken({ cid: 12, sid: 345, exp: NOW + 600 }, SECRET));
  assert.deepEqual(verifyToken(t, SECRET, NOW), { ok: true, claims: { cid: 12, sid: 345, exp: NOW + 600 } });
});

test('token: rejects tampering, wrong secret, expiry, long life, junk', () => {
  const t = signToken({ cid: 12, sid: 345, exp: NOW + 600 }, SECRET);
  const forged = b64url(Buffer.from(JSON.stringify({ cid: 13, sid: 345, exp: NOW + 600 }))) + '.' + t.split('.')[1];
  assert.equal((verifyToken(forged, SECRET, NOW) as any).error, 'signature');
  assert.equal((verifyToken(t, 'y'.repeat(40), NOW) as any).error, 'signature');
  assert.equal((verifyToken(t, SECRET, NOW + 601) as any).error, 'expired');
  assert.equal((verifyToken(signToken({ cid: 1, sid: 2, exp: NOW + 3600 }, SECRET), SECRET, NOW) as any).error, 'expired');
  assert.equal((verifyToken(signToken({ cid: -1, sid: 2, exp: NOW + 60 } as any, SECRET), SECRET, NOW) as any).error, 'malformed');
  assert.equal((verifyToken(signToken({ cid: '1 or 1=1', sid: 2, exp: NOW + 60 } as any, SECRET), SECRET, NOW) as any).error, 'malformed');
  assert.equal((verifyToken('abc', SECRET, NOW) as any).error, 'malformed');
  assert.equal((verifyToken(t + 'A', SECRET, NOW) as any).error, 'signature');
  assert.equal((verifyToken(t, 'short', NOW) as any).error, 'config');
  assert.equal((verifyToken(t, '', NOW) as any).error, 'config');
  assert.equal(bearer('Bearer ' + t), t); assert.equal(bearer('Basic abc'), null); assert.equal(bearer(null), null);
});

test('paths: normalised and confined to the home folder', () => {
  assert.equal(safePath(''), '/');
  assert.equal(safePath('domains//x.com/./public_html/'), '/domains/x.com/public_html');
  for (const bad of ['../etc/passwd', '/domains/../../etc', '/a/..', '..', '/a/.../b', 'a\\..\\b', '/a\u0000b', '/a\nb', 'x'.repeat(1100)]) assert.throws(() => safePath(bad), InputError, bad);
  assert.throws(() => safePath(42 as any), InputError);
  assert.equal(safeName(' index.php '), 'index.php');
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'a\u0001', 'x'.repeat(256)]) assert.throws(() => safeName(bad), InputError, bad);
  assert.deepEqual(splitPath('/domains/x.com/a.txt'), { dir: '/domains/x.com', name: 'a.txt' });
  assert.throws(() => splitPath('/'), InputError);
  assert.equal(underHome('/home/bob', '/domains/x'), '/home/bob/domains/x');
  assert.equal(underHome('/home/bob/', '/'), '/home/bob');
  assert.throws(() => underHome('/home/bob', '/../alice'), InputError);
  assert.throws(() => underHome('/home/b ob', '/x'), InputError);
});

test('identities: panel user, owned domain, mailbox, db names, passwords', () => {
  assert.equal(panelUser('shopex'), 'shopex');
  for (const bad of ['admin|root', 'a:b', '', ' ', 'a b', '../x', 'x'.repeat(40)]) assert.throws(() => panelUser(bad), InputError, bad);
  assert.equal(ownedDomain('Shop.COM.', ['shop.com', 'blog.net']), 'shop.com');
  assert.throws(() => ownedDomain('evil.com', ['shop.com']), InputError);
  assert.throws(() => ownedDomain('shop.com/../x', ['shop.com']), InputError);
  assert.equal(mailUser('Info.Sales+x'), 'info.sales+x');
  for (const bad of ['', 'a..b', '.a', 'a@b', 'a b', 'x'.repeat(70)]) assert.throws(() => mailUser(bad), InputError, bad);
  assert.equal(dbFullName('bob_wp', 'bob_'), 'bob_wp');
  assert.throws(() => dbFullName('alice_wp', 'bob_'), InputError);
  assert.throws(() => dbFullName('bob_wp;drop', 'bob_'), InputError);
  assert.equal(password('Abcdefg1'), 'Abcdefg1');
  for (const bad of ['short1A', 'alllowercase1', 'ALLUPPER1', 'NoDigitsHere', 'Abcdefg1\n']) assert.throws(() => password(bad), InputError, bad);
});

test('dns: record validation per type, names stay in the zone', () => {
  const z = 'shop.com';
  assert.equal(dnsName('', z), '@'); assert.equal(dnsName('shop.com.', z), '@'); assert.equal(dnsName('www.shop.com', z), 'www'); assert.equal(dnsName('WWW', z), 'www');
  assert.throws(() => dnsName('www.evil.com.', z), InputError);
  assert.deepEqual(dnsRecord({ type: 'a', name: 'www', value: '1.2.3.4' }, z), { type: 'A', name: 'www', value: '1.2.3.4', ttl: 3600 });
  assert.throws(() => dnsRecord({ type: 'A', name: '@', value: '1.2.3.256' }, z), InputError);
  assert.equal(dnsRecord({ type: 'AAAA', name: '@', value: '2001:DB8::1' }, z).value, '2001:db8::1');
  assert.throws(() => dnsRecord({ type: 'AAAA', name: '@', value: '2001:db8::1::2' }, z), InputError);
  assert.throws(() => dnsRecord({ type: 'CNAME', name: '@', value: 'x.com' }, z), InputError);
  assert.equal(dnsRecord({ type: 'MX', name: '@', value: 'mail.shop.com', priority: 5 }, z).priority, 5);
  assert.equal(dnsRecord({ type: 'TXT', name: '@', value: '"v=spf1 -all"' }, z).value, 'v=spf1 -all');
  assert.throws(() => dnsRecord({ type: 'TXT', name: '@', value: 'a"b' }, z), InputError);
  assert.throws(() => dnsRecord({ type: 'TXT', name: '@', value: 'a\nb' }, z), InputError);
  assert.equal(dnsRecord({ type: 'SRV', name: '_sip._tcp', value: 'sip.shop.com', priority: 1, weight: 2, port: 5060 }, z).port, 5060);
  assert.throws(() => dnsRecord({ type: 'SRV', name: 'sip', value: 'sip.shop.com', port: 5060 }, z), InputError);
  assert.throws(() => dnsRecord({ type: 'NS', name: '@', value: 'ns.evil.com' }, z), InputError);
  assert.throws(() => dnsRecord({ type: 'A', name: '@', value: '1.2.3.4', ttl: 5 }, z), InputError);
});

test('crypto: seal / unseal, tamper detection', () => {
  const key = encKey({ AUTH_SECRET: 'z'.repeat(40) });
  const s = seal('login-key-123', key);
  assert.notEqual(s.includes('login-key'), true);
  assert.equal(unseal(s, key), 'login-key-123');
  const parts = s.split(':'); parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'BB' : 'AA');
  assert.throws(() => unseal(parts.join(':'), key));
  assert.throws(() => unseal(s, encKey({ AUTH_SECRET: 'w'.repeat(40) })));
  assert.throws(() => encKey({}));
});

test('server mapping: WHMCS server id first, then host name / IP; disabled ignored', () => {
  const base = { panel: 'directadmin' as const, apiUser: 'admin', secret: 'k', enabled: true, match: [] as string[], whmcsServerIds: [] as number[] };
  const sonic = { ...base, id: 's', name: 'Sonic', url: 'https://sonic.example.com:2222', whmcsServerIds: [1], match: ['216.158.237.114'] };
  const sg = { ...base, id: 'g', name: 'SG', url: 'https://sg.example.com:2222', whmcsServerIds: [3] };
  const off = { ...base, id: 'o', name: 'Off', url: 'https://off.example.com:2222', whmcsServerIds: [9], enabled: false };
  const list = [sonic, sg, off];
  assert.equal(serverFor({ serverid: 3 }, list)?.id, 'g');
  assert.equal(serverFor({ serverid: 0, serverip: '216.158.237.114' }, list)?.id, 's');
  assert.equal(serverFor({ serverhostname: 'SG.example.com' }, list)?.id, 'g');
  assert.equal(serverFor({ serverid: 9 }, list), null);
  assert.equal(serverFor({ serverid: 7, serverhostname: 'resell.server.broker.vps' }, list), null);
});

test('DirectAdmin parsers: url-encoded, json, errors, zones', () => {
  assert.deepEqual(parseDa('list[]=a.com&list[]=b.com'), { list: ['a.com', 'b.com'] });
  assert.deepEqual(toList(parseDa('["a.com","b.com"]')), ['a.com', 'b.com']);
  assert.deepEqual(toList({ 'a.com': '', 'b.com': '' }), ['a.com', 'b.com']);
  assert.equal(daError(parseDa('error=1&text=Cannot%20create&details=exists')), 'Cannot create: exists');
  assert.equal(daError(parseDa('error=0&text=ok')), null);
  assert.deepEqual(attrs('name=x&type=folder'), { name: 'x', type: 'folder' });
  const zone = `$TTL 14400\nshop.com.\t14400\tIN\tSOA\tns1.x. host. (1 2 3 4 5)\nshop.com.\t14400\tIN\tA\t1.2.3.4\nwww\t3600\tIN\tCNAME\tshop.com.\nshop.com.\t14400\tIN\tMX\t10 mail\n_sip._tcp\t14400\tIN\tSRV\t1 2 5060 sip\nshop.com.\t14400\tIN\tTXT\t"v=spf1 a mx ~all ; not a comment"`;
  const r = parseDaZone(zone, 'shop.com');
  assert.deepEqual(r.find((x) => x.type === 'A'), { type: 'A', name: 'shop.com.', value: '1.2.3.4', ttl: 14400 });
  assert.equal(r.find((x) => x.type === 'CNAME')?.name, 'www');
  assert.equal(r.find((x) => x.type === 'TXT')?.value, '"v=spf1 a mx ~all ; not a comment"');
  assert.equal(parseDaZone('{"records":[{"type":"a","name":"www","value":"1.1.1.1","ttl":"60"}]}', 'shop.com')[0].type, 'A');
});

import { cronField, cronCommand, subLabel, urlPath, httpUrl, redirectType, ftpUser, realm, isoDate, spamSettings, messageText } from '../lib/hosting/validate.ts';
import { daUsage, parsePointers, parseRedirects, parsePhp, parseVacations, spamFrom, parseCron, ftpTypeFor, parseProtected, parseWpSites } from '../lib/hosting/providers/directadmin-parse.ts';

test('cron: strict schedule fields, single-line command', () => {
  for (const [v, f] of [['*', 'minute'], ['*/15', 'minute'], ['0-30/10', 'minute'], ['1,15,30', 'dayofmonth'], ['0', 'dayofweek'], ['7', 'dayofweek'], ['1-12', 'month']] as const) assert.equal(cronField(v, f), v);
  for (const [v, f] of [['60', 'minute'], ['24', 'hour'], ['0', 'dayofmonth'], ['13', 'month'], ['8', 'dayofweek'], ['5-1', 'hour'], ['*/0', 'minute'], ['mon', 'dayofweek'], ['@reboot', 'minute'], ['* *', 'minute'], ['1;rm', 'minute'], ['', 'hour']] as const) assert.throws(() => cronField(v, f), InputError, v);
  assert.equal(cronCommand(' php ~/cron.php '), 'php ~/cron.php');
  assert.throws(() => cronCommand('php a.php\n* * * * * evil'), InputError);
  assert.throws(() => cronCommand(''), InputError);
});

test('domains extras: subdomain, redirect path / URL / type', () => {
  assert.equal(subLabel('Shop'), 'shop');
  for (const bad of ['www', 'a.b', '-a', 'a_b', '*', '']) assert.throws(() => subLabel(bad), InputError, bad);
  assert.equal(urlPath('/old-page'), '/old-page');
  for (const bad of ['old', '/a b', '/../x', '//evil.com', '/a"b']) assert.throws(() => urlPath(bad), InputError, bad);
  assert.equal(httpUrl('https://shop.com/new?x=1'), 'https://shop.com/new?x=1');
  for (const bad of ['javascript:alert(1)', 'ftp://x.com', 'https://user:pw@x.com', 'https://x.com/a b', 'shop.com']) assert.throws(() => httpUrl(bad), InputError, bad);
  assert.equal(redirectType('302'), '302'); assert.throws(() => redirectType('307'), InputError);
});

test('ftp, protect, vacation, spam validators', () => {
  assert.equal(ftpUser('Designer'), 'designer'); assert.throws(() => ftpUser('a@b'), InputError); assert.throws(() => ftpUser('a b'), InputError);
  assert.equal(realm('Members only'), 'Members only'); assert.throws(() => realm('a"b'), InputError);
  assert.deepEqual(isoDate('2026-12-20'), { y: 2026, m: 12, d: 20 }); assert.throws(() => isoDate('2026-02-30'), InputError); assert.throws(() => isoDate('20/12/2026'), InputError);
  assert.deepEqual(spamSettings({ enabled: true, threshold: '4.55', where: 'spamfolder', highScore: 12, highScoreBlock: 1 }), { enabled: true, threshold: 4.6, where: 'spamfolder', highScore: 12, highScoreBlock: true });
  assert.throws(() => spamSettings({ threshold: 0.5 }), InputError); assert.throws(() => spamSettings({ where: 'trash' }), InputError);
  assert.throws(() => messageText('a\u0000b'), InputError); assert.equal(messageText('Hi\r\nthere'), 'Hi\nthere');
});

test('DirectAdmin parsers for the second feature set', () => {
  const u = daUsage(parseDa('quota=8340.5&bandwidth=48210&vdomains=2&nemails=3&mysql=3&inode=1200'), parseDa('quota=20480&bandwidth=unlimited&vdomains=5&nemails=50&mysql=10&inode=200000&package=Pro&ip=1.2.3.4&suspended=no'));
  assert.equal(u.plan, 'Pro'); assert.equal(u.suspended, false);
  assert.deepEqual(u.items.find((x) => x.key === 'quota'), { key: 'quota', label: 'Disk space', unit: 'MB', used: 8340.5, limit: 20480 });
  assert.equal(u.items.find((x) => x.key === 'bandwidth')?.limit, null);
  assert.deepEqual(parsePointers(parseDa('b.net=alias&c.org=')), [{ name: 'b.net', type: 'alias' }, { name: 'c.org', type: 'pointer' }]);
  assert.deepEqual(parseRedirects(parseDa('%2Fold=type%3D301%26url%3Dhttps%3A%2F%2Fx.com%2Fnew')), [{ path: '/old', to: 'https://x.com/new', type: '301' }]);
  assert.deepEqual(parsePhp(parseDa('has_php_selector=yes&php1_select=2&php1_ver=8.1&php1_info=PHP%208.1%20php-fpm&php2_ver=8.2&php2_info=PHP%208.2%20php-fpm&php3_ver=no')), { current: '2', options: [{ id: '1', label: 'PHP 8.1 php-fpm' }, { id: '2', label: 'PHP 8.2 php-fpm' }] });
  assert.deepEqual(parseVacations(parseDa('bob=startday%3D5%26startmonth%3D1%26startyear%3D2027%26endday%3D9%26endmonth%3D1%26endyear%3D2027'), 'x.com'), [{ user: 'bob', email: 'bob@x.com', start: '2027-01-05', end: '2027-01-09' }]);
  assert.equal(spamFrom(parseDa('is_on=yes&required_hits=4.5&where=delete&high_score=12&high_score_block=yes')).threshold, 4.5);
  assert.deepEqual(parseCron(parseDa('MAILTO=&0=*%2F5%20*%20*%20*%20*%20php%20%2Fhome%2Fa%2Fc.php')), [{ id: '0', minute: '*/5', hour: '*', dayofmonth: '*', month: '*', dayofweek: '*', command: 'php /home/a/c.php' }]);
  assert.equal(ftpTypeFor('/domains/x.com/public_html', 'x.com'), 'domain'); assert.equal(ftpTypeFor('/domains/x.com/public_html/a', 'x.com'), 'custom');
  assert.deepEqual(parseProtected([{ path: '/home/bob/domains/x.com/public_html/a', realm: 'R', users: ['u'] }, { path: '/etc' }], '/home/bob'), [{ path: '/domains/x.com/public_html/a', realm: 'R', users: ['u'] }, { path: '/etc', realm: '', users: [] }]);
  assert.equal(parseWpSites([{ domain: 'x.com', path: '/', wordpress: { version: '6.8' } }, { domain: 'y.com', path: '/blog' }]).length, 1);
});
