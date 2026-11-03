// Domain health alerts, integration: the real probes (node:dns over UDP, DNS-over-HTTPS fallback, TLS with SNI, HTTP)
// against local stubs (a UDP DNS server, a DoH JSON server, an HTTPS server with good / expiring / expired / wrong-name /
// incomplete-chain / self-signed certificates), and a full run against tests/mock-whmcs.mjs + tests/mock-da.mjs.
// Needs openssl on PATH. Run: node --test --experimental-strip-types tests/health-alerts-int.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { probeDomain, probeTls, lookup, txtData, resetUdpState, type ProbeOptions } from '../lib/health/probe.ts';
import { buildTargets, runCycle, normalizeHealth, pickDue, issueCopy, type HealthRow, type Target, type PlannedAlert } from '../lib/health/core.ts';
import { healthEmail } from '../lib/health/email.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OURS = ['ns1.globalhostia.com', 'ns2.globalhostia.com'];
const SERVER_IP = '203.0.113.10';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-health-'));
const sh = (args: string[], cwd = TMP) => execFileSync('openssl', args, { cwd, stdio: 'pipe' });

/* ---------------------------------------------------------------- PKI: root, intermediate, leaves */
function pki() {
  const cnf = `[ca]\ndefault_ca=ca\n[ca]\ndir=.\ndatabase=index.txt\nnew_certs_dir=.\nserial=serial\ndefault_md=sha256\npolicy=p\nunique_subject=no\ncopy_extensions=copy\n[p]\ncommonName=supplied\n[v3_ca]\nbasicConstraints=critical,CA:true\nkeyUsage=keyCertSign,cRLSign\n`;
  fs.writeFileSync(path.join(TMP, 'ca.cnf'), cnf); fs.writeFileSync(path.join(TMP, 'index.txt'), ''); fs.writeFileSync(path.join(TMP, 'serial'), '1000\n');
  sh(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'root.key', '-out', 'root.pem', '-subj', '/CN=GH Test Root', '-days', '30', '-addext', 'basicConstraints=critical,CA:true', '-addext', 'keyUsage=keyCertSign,cRLSign']);
  sh(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'int.key', '-out', 'int.csr', '-subj', '/CN=GH Test Intermediate']);
  sh(['ca', '-batch', '-config', 'ca.cnf', '-cert', 'root.pem', '-keyfile', 'root.key', '-in', 'int.csr', '-out', 'int.pem', '-days', '30', '-extensions', 'v3_ca', '-notext']);
  const leaf = (name: string, o: { signer?: 'root' | 'int'; start?: string; end?: string; days?: number; san?: string; self?: boolean }) => {
    const san = `subjectAltName=DNS:${o.san || name}`;
    if (o.self) { sh(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.pem`, '-subj', `/CN=${name}`, '-days', '30', '-addext', san]); return; }
    sh(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${o.san || name}`, '-addext', san]);
    const s = o.signer === 'int' ? ['int.pem', 'int.key'] : ['root.pem', 'root.key'];
    sh(['ca', '-batch', '-config', 'ca.cnf', '-cert', s[0], '-keyfile', s[1], '-in', `${name}.csr`, '-out', `${name}.pem`, '-notext',
      ...(o.start ? ['-startdate', o.start, '-enddate', o.end!] : ['-days', String(o.days ?? 60)])]);
  };
  leaf('good.test', { days: 60 });
  leaf('soon.test', { days: 2 });
  leaf('expired.test', { start: '20250101000000Z', end: '20250201000000Z' });
  leaf('wrong.test', { days: 60, san: 'something-else.test' });
  leaf('chain.test', { signer: 'int', days: 60 });
  leaf('self.test', { self: true });
  leaf('demo-brand.shop', { days: 5 });
  for (const n of ['ext.test', 'nomail.test', 'long.test', 'demo-brand.com', 'demo-blog.com', 'demo.ae', 'mail.demo-brand.com']) leaf(n, { days: 60 });
}
const LEAVES = ['good.test', 'soon.test', 'expired.test', 'wrong.test', 'chain.test', 'self.test', 'demo-brand.shop', 'ext.test', 'nomail.test', 'long.test', 'demo-brand.com', 'demo-blog.com', 'demo.ae', 'mail.demo-brand.com'];
const read = (f: string) => fs.readFileSync(path.join(TMP, f));

/* ---------------------------------------------------------------- DNS stub (UDP) + DoH stub */
type Zone = Record<string, { A?: string[]; NS?: string[]; MX?: [number, string][]; TXT?: string[] }>;
const ZONE: Zone = {};
const hosted = (d: string, o: { spf?: string | null; dmarc?: string | null; dkim?: boolean; mx?: [number, string][]; a?: string[]; ns?: string[] } = {}) => {
  ZONE[d] = { A: o.a || [SERVER_IP], NS: o.ns || OURS, MX: o.mx || [[10, `mail.${d}`]], TXT: o.spf === null ? [] : [o.spf || `v=spf1 a mx ip4:${SERVER_IP} ~all`] };
  ZONE[`mail.${d}`] = { A: [SERVER_IP] };
  ZONE[`_dmarc.${d}`] = { TXT: o.dmarc === null ? [] : [o.dmarc || 'v=DMARC1; p=none; rua=mailto:postmaster@' + d] };
  if (o.dkim !== false) ZONE[`x._domainkey.${d}`] = { TXT: ['v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'] };
};
for (const d of ['good.test', 'soon.test', 'expired.test', 'wrong.test', 'chain.test', 'self.test', 'down.test', 'nohttps.test']) hosted(d);
hosted('nomail.test', { spf: null, dmarc: null, dkim: false });
hosted('ext.test', { ns: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'], a: ['198.51.100.7'] });
ZONE['mail.long.test'] = { A: [SERVER_IP] };
ZONE['long.test'] = { NS: OURS, A: [SERVER_IP], MX: [[10, 'mail.long.test']], TXT: ['v=spf1 ' + Array.from({ length: 11 }, (_, i) => `include:_spf${i}.example-mail-provider.com `).join('') + '~all'] }; // > 255 chars (two TXT chunks), 11 lookups
hosted('demo-brand.com', { dmarc: null });
hosted('demo-brand.shop');
hosted('demo-blog.com');
hosted('demo.ae', { dkim: false });

const enc = (name: string) => Buffer.concat([...name.replace(/\.$/, '').split('.').filter(Boolean).map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])), Buffer.from([0])]);
function answer(msg: Buffer): Buffer {
  let o = 12; const labels: string[] = [];
  while (msg[o]) { labels.push(msg.subarray(o + 1, o + 1 + msg[o]).toString()); o += msg[o] + 1; }
  o++;
  const qtype = msg.readUInt16BE(o); o += 4;
  const name = labels.join('.').toLowerCase();
  const z = ZONE[name];
  const rr: Buffer[] = [];
  const add = (type: number, data: Buffer) => { const h = Buffer.alloc(12); h.writeUInt16BE(0xc00c, 0); h.writeUInt16BE(type, 2); h.writeUInt16BE(1, 4); h.writeUInt32BE(60, 6); h.writeUInt16BE(data.length, 10); rr.push(h, data); };
  if (z) {
    if (qtype === 1) for (const a of z.A || []) add(1, Buffer.from(a.split('.').map(Number)));
    if (qtype === 2) for (const n of z.NS || []) add(2, enc(n));
    if (qtype === 15) for (const [p, h] of z.MX || []) { const b = Buffer.alloc(2); b.writeUInt16BE(p); add(15, Buffer.concat([b, enc(h)])); }
    if (qtype === 16) for (const t of z.TXT || []) { const parts: Buffer[] = []; for (let i = 0; i < t.length; i += 255) { const c = Buffer.from(t.slice(i, i + 255)); parts.push(Buffer.from([c.length]), c); } add(16, Buffer.concat(parts)); }
  }
  const head = Buffer.alloc(12);
  msg.copy(head, 0, 0, 2);
  head.writeUInt16BE(0x8180 | (z ? 0 : 3), 2); head.writeUInt16BE(1, 4); head.writeUInt16BE(rr.length / 2, 6);
  return Buffer.concat([head, msg.subarray(12, o), ...rr]);
}
function dohJson(name: string, type: string) {
  const z = ZONE[name.toLowerCase().replace(/\.$/, '')];
  if (!z) return { Status: 3 };
  const T: Record<string, number> = { A: 1, NS: 2, MX: 15, TXT: 16, AAAA: 28 };
  const ans: any[] = [];
  if (type === 'A') for (const a of z.A || []) ans.push({ name, type: 1, data: a });
  if (type === 'NS') for (const n of z.NS || []) ans.push({ name, type: 2, data: n + '.' });
  if (type === 'MX') for (const [p, h] of z.MX || []) ans.push({ name, type: 15, data: `${p} ${h}.` });
  if (type === 'TXT') for (const t of z.TXT || []) ans.push({ name, type: 16, data: t.length > 255 ? `"${t.slice(0, 255)}" "${t.slice(255)}"` : `"${t}"` });
  return { Status: 0, Answer: ans.filter((a) => a.type === T[type]) };
}

/* ---------------------------------------------------------------- servers */
let dns: dgram.Socket, dnsPort = 0, doh: http.Server, dohUrl = '', dohHits = 0, tlsSrv: https.Server, tlsPort = 0, web: http.Server, webPort = 0, deadPort = 0;
const procs: ChildProcess[] = [];
let whmcsUrl = '', daUrl = '';
const listen = (s: http.Server | https.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as any).port)));
const freePort = () => new Promise<number>((r) => { const s = http.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as any).port; s.close(() => r(p)); }); });
const waitFor = async (url: string, init?: RequestInit, ca?: Buffer) => {
  for (let i = 0; i < 60; i++) {
    try { if (ca) { await httpsGet(url, ca, ''); return; } await fetch(url, init); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error(`not up: ${url}`);
};
const httpsGet = (url: string, ca: Buffer, auth: string) => new Promise<string>((res, rej) => {
  const u = new URL(url);
  https.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, ca, servername: 'localhost', headers: auth ? { authorization: auth } : {} }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(b)); }).on('error', rej);
});

before(async () => {
  pki();
  dns = dgram.createSocket('udp4');
  dns.on('message', (m, r) => { try { dns.send(answer(m), r.port, r.address); } catch { /* malformed */ } });
  await new Promise<void>((r) => dns.bind(0, '127.0.0.1', () => r()));
  dnsPort = dns.address().port;
  doh = http.createServer((req, res) => { dohHits++; const u = new URL(req.url!, 'http://x'); res.setHeader('content-type', 'application/dns-json'); res.end(JSON.stringify(dohJson(u.searchParams.get('name')!, u.searchParams.get('type')!))); });
  dohUrl = `http://127.0.0.1:${await listen(doh)}/dns-query`;
  const ctxs: Record<string, tls.SecureContext> = {};
  for (const n of LEAVES) ctxs[n] = tls.createSecureContext({ key: read(`${n}.key`), cert: read(`${n}.pem`) });
  tlsSrv = https.createServer({ key: read('good.test.key'), cert: read('good.test.pem'), SNICallback: (sn, cb) => cb(null, ctxs[sn] || ctxs['good.test']) }, (req, res) => { res.writeHead(req.headers.host === 'err.test' ? 503 : 200); res.end('ok'); });
  tlsPort = await listen(tlsSrv);
  web = http.createServer((_req, res) => { res.writeHead(301, { location: 'https://x/' }); res.end(); });
  webPort = await listen(web);
  deadPort = await freePort();

  // mock WHMCS + mock DirectAdmin (HTTPS with a cert from our root)
  const wp = await freePort(), dp = await freePort();
  sh(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'da.key', '-out', 'da.csr', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost']);
  sh(['ca', '-batch', '-config', 'ca.cnf', '-cert', 'root.pem', '-keyfile', 'root.key', '-in', 'da.csr', '-out', 'da.pem', '-days', '5', '-notext']);
  procs.push(spawn(process.execPath, [path.join(ROOT, 'tests/mock-whmcs.mjs')], { env: { ...process.env, MOCK_PORT: String(wp) }, stdio: 'ignore' }));
  procs.push(spawn(process.execPath, [path.join(ROOT, 'tests/mock-da.mjs')], { env: { ...process.env, DA_PORT: String(dp), DA_CERT: path.join(TMP, 'da.pem'), DA_KEY: path.join(TMP, 'da.key') }, stdio: 'ignore' }));
  whmcsUrl = `http://127.0.0.1:${wp}/includes/api.php`; daUrl = `https://localhost:${dp}`;
  await waitFor(whmcsUrl, { method: 'POST', body: 'action=WhmcsDetails' });
  await waitFor(`${daUrl}/CMD_API_SHOW_USERS`, undefined, read('root.pem'));
});
after(() => {
  for (const p of procs) p.kill();
  dns?.close(); doh?.close(); tlsSrv?.close(); web?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

const opts = (o: Partial<ProbeOptions> = {}): ProbeOptions => ({
  timeouts: { dns: 1500, tls: 3000, http: 3000 }, dnsServers: [`127.0.0.1:${dnsPort}`], doh: [dohUrl], canary: 'good.test', mail: true, dkimSelectors: ['x'], allowPrivate: true, ca: read('root.pem'),
  connect: (d) => ({ host: '127.0.0.1', tlsPort: d === 'down.test' ? deadPort : d === 'nohttps.test' ? deadPort : tlsPort, httpPort: d === 'down.test' ? deadPort : webPort }),
  ...o,
});

test('DNS over UDP: NS, A, MX with addresses, SPF, DMARC, DKIM, NXDOMAIN; TXT chunks joined', async () => {
  resetUdpState();
  const f = await probeDomain('good.test', opts({ web: false, tlsCheck: false }));
  assert.equal(f.dns.ok, true); assert.equal(f.dns.via, 'udp');
  assert.deepEqual(f.dns.ns, OURS); assert.deepEqual(f.dns.a, [SERVER_IP]);
  assert.deepEqual(f.mail!.mx, [{ host: 'mail.good.test', pri: 10, ips: [SERVER_IP] }]);
  assert.equal(f.mail!.spf.length, 1); assert.equal(f.mail!.dmarc.length, 1); assert.equal(f.mail!.dkim.length, 1);
  const nx = await probeDomain('missing.test', opts({ web: false }));
  assert.equal(nx.dns.ok, true); assert.equal(nx.dns.nx, true);
  const long = await lookup('long.test', 'TXT', opts());
  assert.ok(long.values[0].length > 255 && long.values[0].endsWith('~all'));
  assert.equal(txtData('"v=spf1 " "a -all"'), 'v=spf1 a -all');
});

test('DNS falls back to DoH when UDP is blocked, and stays on DoH for a while', async () => {
  resetUdpState();
  const before = dohHits;
  const f = await probeDomain('good.test', opts({ dnsServers: [`127.0.0.1:${deadPort}`], web: false, tlsCheck: false, timeouts: { dns: 600, tls: 2000, http: 2000 } }));
  assert.equal(f.dns.ok, true); assert.equal(f.dns.via, 'doh');
  assert.deepEqual(f.dns.a, [SERVER_IP]); assert.equal(f.mail!.spf.length, 1);
  assert.ok(dohHits > before);
  const again = await lookup('good.test', 'A', opts({ dnsServers: [`127.0.0.1:${dnsPort}`] }));
  assert.equal(again.via, 'doh', 'UDP marked broken for this instance');
  resetUdpState();
  const forced = await lookup('nx-name.test', 'A', opts({ forceDoh: true }));
  assert.equal(forced.nx, true);
});

test('DNS that answers NXDOMAIN for everything (blocked network) is not trusted: unknown, no issues', async () => {
  resetUdpState();
  const f = await probeDomain('good.test', opts({ canary: 'no-such-canary.test', doh: [`http://127.0.0.1:${deadPort}/dns-query`], web: false }));
  assert.equal(f.dns.ok, false, 'canary failed on UDP and DoH: DNS reported down, not NXDOMAIN');
  resetUdpState();
  // canary fails on UDP only → DoH is used
  const g = await probeDomain('good.test', opts({ canary: 'good.test', dnsServers: [`127.0.0.1:${deadPort}`], web: false, tlsCheck: false, timeouts: { dns: 600, tls: 2000, http: 2000 } }));
  assert.equal(g.dns.ok, true); assert.equal(g.dns.via, 'doh');
  resetUdpState();
});

test('TLS: valid, expiring, expired, wrong name, incomplete chain, self-signed, no HTTPS', async () => {
  const o = { timeouts: { dns: 1000, tls: 3000, http: 3000 }, ca: read('root.pem') };
  const good = await probeTls('good.test', '127.0.0.1', tlsPort, o);
  assert.equal(good.authorized, true); assert.equal(good.nameOk, true); assert.ok(good.daysLeft! >= 58 && good.daysLeft! <= 60);
  assert.ok((await probeTls('soon.test', '127.0.0.1', tlsPort, o)).daysLeft! <= 2);
  assert.equal((await probeTls('expired.test', '127.0.0.1', tlsPort, o)).authError, 'CERT_HAS_EXPIRED');
  const wrong = await probeTls('wrong.test', '127.0.0.1', tlsPort, o);
  assert.equal(wrong.nameOk, false); assert.deepEqual(wrong.names, ['something-else.test']);
  assert.equal((await probeTls('chain.test', '127.0.0.1', tlsPort, o)).authError, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE');
  assert.equal((await probeTls('self.test', '127.0.0.1', tlsPort, o)).authError, 'DEPTH_ZERO_SELF_SIGNED_CERT');
  const none = await probeTls('x.test', '127.0.0.1', deadPort, o);
  assert.deepEqual(none, { connected: false, error: 'refused' });
});

test('probe → rules: each domain gets the right issues', async () => {
  resetUdpState();
  const cfg = normalizeHealth({});
  const { evaluate } = await import('../lib/health/core.ts');
  const t = (d: string): Target => ({ domain: d, clientId: 1, sources: ['service'], serviceId: 1, serverIp: SERVER_IP, sslIssue: true });
  const run = async (d: string) => evaluate(t(d), await probeDomain(d, opts()), { cfg, ourNs: OURS, now: Date.now() }).map((i) => `${i.key}:${i.sev}`).sort();
  assert.deepEqual(await run('good.test'), []);
  assert.deepEqual(await run('soon.test'), ['ssl_expiring:critical']);
  assert.deepEqual(await run('expired.test'), ['ssl_expired:critical']);
  assert.deepEqual(await run('wrong.test'), ['ssl_name:critical']);
  assert.deepEqual(await run('chain.test'), ['ssl_chain:warning']);
  assert.deepEqual(await run('self.test'), ['ssl_untrusted:critical']);
  assert.deepEqual(await run('down.test'), ['site_down:critical']);
  assert.deepEqual(await run('nomail.test'), ['dkim_missing:warning', 'dmarc_missing:warning', 'spf_missing:warning']);
  assert.deepEqual(await run('ext.test'), ['a_mismatch:warning', 'ns_external:info']);
  assert.deepEqual(await run('long.test'), ['dkim_missing:warning', 'dmarc_missing:warning', 'spf_invalid:warning']);
  assert.deepEqual(await run('missing.test'), ['ns_none:critical']);
});

test('private addresses are never probed (no requests into our own network)', async () => {
  ZONE['intranet.test'] = { NS: OURS, A: ['10.0.0.5'] };
  const p = await probeDomain('intranet.test', opts({ connect: undefined, allowPrivate: false }));
  assert.equal(p.skipped, 'private-address'); assert.equal(p.tls, undefined);
});

/* ---------------------------------------------------------------- full run with the WHMCS + DirectAdmin mocks */
async function whmcs(action: string, params: Record<string, string | number> = {}) {
  const r = await fetch(whmcsUrl, { method: 'POST', body: new URLSearchParams({ action, identifier: 'test', secret: 'test', responsetype: 'json', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) }) });
  return r.json() as Promise<any>;
}
const daDomains = async (user: string) => JSON.parse(await httpsGet(`${daUrl}/CMD_API_SHOW_DOMAINS?json=yes`, read('root.pem'), 'Basic ' + Buffer.from(`admin|${user}:mock-key`).toString('base64'))) as string[];

test('full run: WHMCS + DirectAdmin inventory → checks → one digest per client → no repeats → fixed notice', async () => {
  resetUdpState();
  const doms = (await whmcs('GetClientsDomains', { limitstart: 0, limitnum: 250 })).domains.domain;
  const prods = (await whmcs('GetClientsProducts', { limitstart: 0, limitnum: 250 })).products.product;
  const panel = new Map<number, { domains: string[]; aliases: string[]; ip: string; ssl: boolean; serverId: string }>();
  for (const p of prods) if (Number(p.serverid) === 5 && p.username && /^active$/i.test(p.status)) panel.set(Number(p.id), { domains: await daDomains(p.username), aliases: [], ip: SERVER_IP, ssl: true, serverId: 'da' });
  const targets = buildTargets(doms, prods, { now: Date.now(), addon: true, alias: true, managed: (p) => panel.has(Number(p.id)) || /cpanel|directadmin/.test(p.module), panel: (p) => panel.get(Number(p.id)) || null });
  const names = targets.filter((t) => t.clientId === 1).map((t) => t.domain).sort();
  for (const d of ['demo-brand.com', 'demo-brand.shop', 'demo-blog.com', 'demo.ae']) assert.ok(names.includes(d), `inventory has ${d}`);
  const shop = targets.find((t) => t.domain === 'demo-brand.shop')!;
  assert.deepEqual(shop.sources, ['addon'], 'addon domain from DirectAdmin CMD_API_SHOW_DOMAINS');
  const brand = targets.find((t) => t.domain === 'demo-brand.com')!;
  assert.deepEqual(brand.sources, ['registered', 'service']); assert.equal(brand.whmcsDomainId, 301);

  // in-memory domain_health
  const rows: HealthRow[] = [];
  const store = {
    sync: async (ts: Target[]) => { let added = 0; for (const t of ts) { const r = rows.find((x) => x.domain === t.domain && x.clientId === t.clientId); if (r) { r.target = t; r.active = true; } else { added++; rows.push({ id: `r${rows.length}`, domain: t.domain, clientId: t.clientId, active: true, external: false, target: t, issues: {}, marks: {}, lastChecked: null, status: 'unknown' }); } } return { added, removed: 0 }; },
    due: async (limit: number, age: number) => pickDue(rows, clock, age, limit),
    saveCheck: async (id: string, p: any) => { const r = rows.find((x) => x.id === id)!; r.issues = p.issues; r.status = p.status; r.lastChecked = p.checkedAt; },
    saveMarks: async (id: string, m: any) => { rows.find((x) => x.id === id)!.marks = m; },
  };
  let clock = Date.now();
  const mails: { cid: number; subject: string; html: string; text: string; keys: string[] }[] = [];
  const known = new Set(Object.keys(ZONE));
  const deps = () => ({
    now: () => clock, deadline: clock + 120_000, site: 'https://globalhostia.com', ourNs: OURS, inventory: async () => targets, store,
    probe: (t: Target, o: { mailNeeded: boolean }) => (known.has(t.domain) ? probeDomain(t.domain, opts({ mail: o.mailNeeded, now: () => clock })) : Promise.resolve({ domain: t.domain, checkedAt: '', dns: { ok: false, via: 'none' as const, ns: [], a: [], aaaa: [] } })),
    deliver: async (cid: number, alerts: PlannedAlert[], fixed: PlannedAlert[]) => {
      const m = healthEmail({ lang: 'en', name: 'Demo', panelUrl: 'https://globalhostia.com/account/health', footer: { unsubUrl: 'https://globalhostia.com/account/unsubscribe?t=t', prefsUrl: 'https://globalhostia.com/account/settings#reminders', why: 'x' },
        alerts: alerts.map((a) => ({ domain: a.domain, sev: a.issue.sev, ...issueCopy(a.key, a.issue.params, 'en'), fix: { href: a.fix.href, label: a.fix.label.en } })), fixed: fixed.map((g) => ({ domain: g.domain, title: issueCopy(g.key, g.issue.params, 'en').title })) });
      mails.push({ cid, ...m, keys: [...alerts.map((a) => `${a.domain}:${a.key}`), ...fixed.map((g) => `${g.domain}:${g.key}:fixed`)] });
      return { delivered: [...alerts.map((a) => `${a.rowId}:${a.key}`), ...fixed.map((g) => `${g.rowId}:${g.key}:resolved`)] };
    },
  });
  const cfg = normalizeHealth({ alerts: true, concurrency: 4 });
  const r1 = await runCycle(cfg, deps());
  assert.ok(r1.checked >= 4, `checked ${r1.checked}`);
  const c1 = mails.filter((m) => m.cid === 1);
  assert.equal(c1.length, 1, 'one digest for client 1');
  assert.ok(c1[0].keys.includes('demo-brand.shop:ssl_expiring'), c1[0].keys.join());
  assert.ok(c1[0].keys.includes('demo-brand.com:dmarc_missing'));
  assert.ok(c1[0].keys.includes('demo-legacy.org:reg_expired'), 'grace-period domain from WHMCS');
  assert.ok(!c1[0].keys.some((k) => k.startsWith('demo-blog.com')), 'healthy domain not mentioned');
  // the DMARC fix opens the portal DNS editor pre-filled (domain 301 is registered here, nameservers ours)
  assert.match(c1[0].html, /\/account\/domains\/301\?add=1&amp;type=TXT&amp;name=_dmarc&amp;value=v%3DDMARC1/);
  assert.match(c1[0].html, /account\/health\?d=demo-brand\.shop&amp;fix=ssl#fix/);
  assert.equal(rows.find((r) => r.domain === 'demo-brand.shop')!.status, 'warning');

  // same problems tomorrow: checked again, no email
  clock += 21 * 3600_000; mails.length = 0;
  const r2 = await runCycle(cfg, deps());
  assert.ok(r2.checked >= 4); assert.deepEqual(mails, []);

  // DMARC added: the next run sends a "fixed" notice only
  ZONE['_dmarc.demo-brand.com'] = { TXT: ['v=DMARC1; p=quarantine'] };
  clock += 21 * 3600_000;
  await runCycle(cfg, deps());
  const c3 = mails.filter((m) => m.cid === 1);
  assert.equal(c3.length, 1); assert.deepEqual(c3[0].keys, ['demo-brand.com:dmarc_missing:fixed']);
  assert.match(c3[0].subject, /^Fixed: demo-brand\.com/);
});
