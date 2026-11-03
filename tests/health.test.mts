// Site health evaluation, connect-wizard provider detection and the email setup profile.
// Run: node --test --experimental-strip-types tests/health.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, spfCovers, nsIsOurs, type HealthFacts } from '../lib/hosting/health.ts';
import { detectProvider, providerByName, rdapRegistrar, connectSteps, PROVIDERS } from '../lib/hosting/connect.ts';
import { mailSettings, mobileconfig, settingsText, stableUuid } from '../lib/hosting/mailsetup.ts';
import { dnsRecord } from '../lib/hosting/validate.ts';

const OURS = ['ns1.globalhostia.com', 'ns2.globalhostia.com'];
const IP = '216.158.237.114';
const CAPS = { dnsAdd: true, sslIssue: true, redirects: true };
const base = (o: Partial<HealthFacts> = {}): HealthFacts => ({
  domain: 'shop-example.com', serverIp: IP, ourNs: OURS,
  dns: { a: [IP], aaaa: [], ns: [...OURS] },
  web: { ok: true, status: 200, ms: 420, httpsRedirect: true, www: { ok: true, status: 200 } },
  ssl: { https: true, issuer: "Let's Encrypt", daysLeft: 70, names: ['shop-example.com', 'www.shop-example.com'] },
  mail: { mx: [{ exchange: 'mail.shop-example.com', priority: 10, ips: [IP] }], spf: [`v=spf1 a mx ip4:${IP} ~all`], dkim: ['v=DKIM1; k=rsa; p=MIIB'], dmarc: ['v=DMARC1; p=none'] },
  usage: [{ key: 'quota', label: 'Disk', used: 1000, limit: 20000, unit: 'MB' }, { key: 'inode', label: 'Inodes', used: 1000, limit: null }],
  checkedAt: '2026-11-03T10:00:00Z', ...o,
});
const item = (r: ReturnType<typeof evaluate>, id: string) => r.sections.flatMap((s) => s.items).find((i) => i.id === id);

test('health: a healthy site scores 100 with no issues', () => {
  const r = evaluate(base(), CAPS);
  assert.equal(r.score, 100); assert.equal(r.issues, 0); assert.equal(r.connected, true); assert.equal(r.nsOurs, true);
  assert.deepEqual(r.sections.map((s) => s.key), ['website', 'security', 'email', 'storage']);
});

test('health: missing SPF and DMARC get in-panel DNS fixes that pass the DNS validator', () => {
  const r = evaluate(base({ mail: { mx: [{ exchange: 'mail.shop-example.com', priority: 10, ips: [IP] }], spf: [], dkim: [], dmarc: [] } }), CAPS);
  const spf = item(r, 'spf')!, dmarc = item(r, 'dmarc')!, dkim = item(r, 'dkim')!;
  assert.equal(spf.status, 'fail'); assert.equal(spf.fix?.kind, 'dns');
  assert.deepEqual((spf.fix as any).record, { type: 'TXT', name: '@', value: `v=spf1 a mx ip4:${IP} ~all`, ttl: 3600 });
  assert.equal((dmarc.fix as any).record.value, 'v=DMARC1; p=none; rua=mailto:postmaster@shop-example.com');
  assert.equal(dmarc.status, 'warn'); assert.equal(dkim.status, 'warn'); assert.equal(dkim.fix?.kind, 'console');
  for (const rec of [(spf.fix as any).record, (dmarc.fix as any).record]) assert.doesNotThrow(() => dnsRecord(rec, 'shop-example.com'));
  assert.ok(r.score < 100 && r.issues === 3);
});

test('health: DNS fixes are not offered when DNS is hosted elsewhere (manual record instead)', () => {
  const r = evaluate(base({ dns: { a: [IP], aaaa: [], ns: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] }, mail: { mx: [], spf: [], dkim: [], dmarc: [] } }), CAPS);
  const spf = item(r, 'spf')!;
  assert.equal(spf.fix, undefined); assert.equal(spf.manual?.name, '@');
  assert.equal(item(r, 'dns-ns')!.title, 'DNS is managed elsewhere');
  assert.equal(r.connected, true); // A record points here
  assert.equal(item(r, 'site-points'), undefined);
});

test('health: domain pointing elsewhere is not connected and offers the connect wizard', () => {
  const r = evaluate(base({ dns: { a: ['198.51.100.7'], aaaa: [], ns: ['ns11.domaincontrol.com', 'ns12.domaincontrol.com'] } }), CAPS);
  assert.equal(r.connected, false);
  const sp = item(r, 'site-points')!;
  assert.equal(sp.status, 'fail'); assert.equal(sp.fix?.kind, 'connect');
  assert.equal(item(r, 'ssl')!.fix, undefined); // cannot issue SSL for a domain that is not here
});

test('health: SSL states, redirect and www, disk thresholds', () => {
  assert.equal(item(evaluate(base({ ssl: { https: true, daysLeft: 9, names: ['shop-example.com'] } }), CAPS), 'ssl')!.status, 'warn');
  const bad = item(evaluate(base({ ssl: { https: false, error: 'Certificate not trusted' } }), CAPS), 'ssl')!;
  assert.equal(bad.status, 'fail'); assert.equal(bad.fix?.kind, 'ssl');
  assert.equal(item(evaluate(base({ ssl: { https: true, daysLeft: 50, names: ['other.com'] } }), CAPS), 'ssl')!.status, 'fail');
  assert.equal(item(evaluate(base({ ssl: { https: true, daysLeft: 50, names: ['*.shop-example.com', 'shop-example.com'] } }), CAPS), 'ssl')!.status, 'ok');
  const r = evaluate(base({ web: { ok: true, status: 200, ms: 4200, httpsRedirect: false, www: { ok: false, error: 'www does not resolve' } } }), CAPS);
  assert.equal(item(r, 'web-redirect')!.fix?.kind, 'tab'); assert.equal(item(r, 'web-www')!.status, 'warn'); assert.equal(item(r, 'web-speed')!.status, 'warn');
  assert.equal(item(evaluate(base({ web: { ok: false, status: 503, ms: 100 } }), CAPS), 'web-status')!.status, 'fail');
  assert.equal(item(evaluate(base({ web: { ok: false, status: 403, ms: 100 } }), CAPS), 'web-status')!.status, 'warn');
  const disk = (used: number) => item(evaluate(base({ usage: [{ key: 'quota', label: 'Disk', used, limit: 1000 }] }), CAPS), 'disk')!.status;
  assert.equal(disk(500), 'ok'); assert.equal(disk(860), 'warn'); assert.equal(disk(990), 'fail');
});

test('health: no DNS at all, two SPF records, SPF without our server', () => {
  const r = evaluate(base({ dns: { a: [], aaaa: [], ns: [] }, web: undefined, ssl: undefined }), CAPS);
  assert.equal(item(r, 'dns-a')!.status, 'fail');
  assert.equal(item(evaluate(base({ mail: { ...base().mail, spf: ['v=spf1 a ~all', 'v=spf1 mx ~all'] } }), CAPS), 'spf')!.status, 'fail');
  assert.equal(item(evaluate(base({ mail: { ...base().mail, spf: ['v=spf1 ip4:203.0.113.5 -all'] } }), CAPS), 'spf')!.status, 'warn');
  assert.equal(spfCovers(`v=spf1 ip4:${IP} -all`, IP, false, false), true);
  assert.equal(spfCovers('v=spf1 a -all', IP, true, false), true);
  assert.equal(spfCovers('v=spf1 a -all', IP, false, false), false);
  assert.equal(nsIsOurs(['NS1.GlobalHostia.com.', 'ns2.globalhostia.com'], OURS), true);
  assert.equal(nsIsOurs(['ns1.globalhostia.com', 'ns1.other.net'], OURS), false);
});

test('connect: provider detection, registrar mapping, RDAP parsing', () => {
  assert.equal(detectProvider(['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com']).id, 'cloudflare');
  assert.equal(detectProvider(['NS51.DOMAINCONTROL.COM.']).id, 'godaddy');
  assert.equal(detectProvider(['dns1.registrar-servers.com']).id, 'namecheap');
  assert.equal(detectProvider(['ns-cloud-a1.googledomains.com']).id, 'squarespace');
  assert.equal(detectProvider(['ns1.dns-parking.com']).id, 'hostinger');
  assert.equal(detectProvider(['curitiba.ns.porkbun.com']).id, 'porkbun');
  assert.equal(detectProvider(['ns1qsy.name.com']).id, 'namecom');
  assert.equal(detectProvider(['ns1045.ui-dns.com']).id, 'ionos');
  assert.equal(detectProvider(['ns-1234.awsdns-26.org']).id, 'route53');
  assert.equal(detectProvider(['ns2.wixdns.net']).id, 'wix');
  assert.equal(detectProvider(['ns1.example-host.net']).id, 'generic');
  for (const p of PROVIDERS) { assert.ok(p.ns.length >= 2 && p.dns.length >= 2, p.id); assert.match(p.url, /^https:\/\//); }
  assert.equal(providerByName('GoDaddy.com, LLC')!.id, 'godaddy');
  assert.equal(providerByName('Unknown Registrar Ltd'), null);
  assert.equal(rdapRegistrar({ entities: [{ roles: ['registrant'] }, { roles: ['registrar'], vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'NameCheap, Inc.']]] }] }), 'NameCheap, Inc.');
  assert.equal(rdapRegistrar({}), '');
});

test('connect: step progress', () => {
  const f = { domain: 'shop-example.com', serverIp: IP, ourNs: OURS, ns: ['ns11.domaincontrol.com'], a: ['198.51.100.7'], www: [], https: { ok: false } };
  let r = connectSteps(f);
  assert.equal(r.connected, false); assert.deepEqual(r.steps.map((s) => s.ok), [false, false, false, false]);
  r = connectSteps({ ...f, a: [IP], wwwCname: ['shop-example.com.'] });
  assert.equal(r.connected, true); assert.deepEqual(r.steps.map((s) => s.ok), [false, true, true, false]);
  r = connectSteps({ ...f, ns: [...OURS], a: [IP], www: [IP], https: { ok: true } });
  assert.equal(r.nsOurs, true); assert.ok(r.steps.every((s) => s.ok));
});

test('mailsetup: settings and the Apple profile', () => {
  const s = mailSettings('shop-example.com', 'sonic.globalhostia.com', 'info@shop-example.com');
  assert.equal(s.incoming.imap.host, 'mail.shop-example.com'); assert.equal(s.incoming.imap.port, 993); assert.equal(s.incoming.pop3.port, 995);
  assert.equal(s.outgoing.port, 465); assert.equal(s.outgoing.alt.port, 587); assert.equal(s.username, 'info@shop-example.com');
  assert.equal(s.webmail, 'https://sonic.globalhostia.com/roundcube'); assert.equal(s.altHost, 'sonic.globalhostia.com');
  assert.equal(mailSettings('a.com', '203.0.113.9').webmail, 'https://mail.a.com/roundcube');
  assert.match(settingsText(s), /IMAP: mail\.shop-example\.com port 993/);
  const xml = mobileconfig(s);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<!DOCTYPE plist/);
  assert.match(xml, /<key>PayloadType<\/key>\s*<string>com\.apple\.mail\.managed<\/string>/);
  assert.match(xml, /<key>IncomingMailServerPortNumber<\/key>\s*<integer>993<\/integer>/);
  assert.match(xml, /<key>OutgoingMailServerPortNumber<\/key>\s*<integer>465<\/integer>/);
  assert.match(xml, /<key>EmailAddress<\/key>\s*<string>info@shop-example\.com<\/string>/);
  assert.doesNotMatch(xml, /<key>(IncomingPassword|OutgoingPassword)<\/key>/); // no password in the profile
  assert.equal((xml.match(/<dict>/g) || []).length, 2); assert.equal((xml.match(/<\/dict>/g) || []).length, 2);
  assert.equal(mobileconfig(s), xml); // stable UUIDs: reinstall replaces
  assert.match(stableUuid('x'), /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/);
  assert.throws(() => mobileconfig(mailSettings('a.com', 'h.example.com')));
  assert.match(mobileconfig(mailSettings('a&b.com', 'h.example.com', 'x@a&b.com')), /x@a&amp;b\.com/);
});
