// Domain health alerts, pure parts: thresholds, certificate expiry, SPF / DMARC parsing, issue rules, state change
// (new / worse / resolved, retry after a held-back alert), the check cursor, fix links, copy and the alert email.
// Run: node --test --experimental-strip-types tests/health-alerts.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expiryStage, daysTo, parseSpf, parseDmarc, spfCoversServer, evaluate, mergeIssues, dueAlerts, resolvedAlerts, markOf, level, pickDue, fixFor, issueCopy,
  normalizeHealth, stageList, nsKind, waWorthy, alertStage, buildTargets, runCycle, DEFAULT_HEALTH,
  type DomainFacts, type Target, type IssueMap, type HealthRow, type RunDeps, type PlannedAlert,
} from '../lib/health/core.ts';
import { healthEmail, WA_HEALTH } from '../lib/health/email.ts';
import { verifyUnsub, signUnsub } from '../lib/reminders/core.ts';

const NOW = Date.parse('2026-11-04T08:00:00Z');
const OURS = ['ns1.globalhostia.com', 'ns2.globalhostia.com'];
const IP = '216.158.237.114';
const cfg = normalizeHealth({});
const T: Target = { domain: 'shop.example', clientId: 1, sources: ['registered', 'service'], whmcsDomainId: 301, serviceId: 102, serverIp: IP, sslIssue: true, reg: { expiry: '2027-06-01', status: 'Active', autoRenew: true } };
const iso = (days: number) => new Date(NOW + days * 86400_000).toISOString();
const facts = (o: Partial<DomainFacts> = {}): DomainFacts => ({
  domain: 'shop.example', checkedAt: iso(0),
  dns: { ok: true, via: 'udp', ns: [...OURS], a: [IP], aaaa: [] },
  tls: { connected: true, authorized: true, validTo: iso(60), daysLeft: 60, names: ['shop.example', 'www.shop.example'], issuer: "Let's Encrypt", nameOk: true },
  web: { https: { status: 200, ms: 300 } },
  mail: { mx: [{ host: 'mail.shop.example', pri: 10, ips: [IP] }], spf: [`v=spf1 a mx ip4:${IP} ~all`], dmarc: ['v=DMARC1; p=none'], dkim: ['v=DKIM1; p=MIIB'] },
  ...o,
});
const keys = (f: DomainFacts, t = T, ext = false) => evaluate(t, f, { cfg, ourNs: OURS, external: ext, now: NOW }).map((i) => i.key).sort();

test('thresholds: SSL 21/7/2/0 and registration stages', () => {
  const s = [21, 7, 2, 0];
  assert.equal(expiryStage(25, s), null);
  assert.equal(expiryStage(21, s), 21); assert.equal(expiryStage(8, s), 21);
  assert.equal(expiryStage(7, s), 7); assert.equal(expiryStage(3, s), 7);
  assert.equal(expiryStage(2, s), 2); assert.equal(expiryStage(1, s), 2);
  assert.equal(expiryStage(0, s), 0); assert.equal(expiryStage(-1, s), null);
  assert.deepEqual(stageList('7, 21,2 0, 0, x', [1]), [21, 7, 2, 0]);
  assert.deepEqual(stageList('', [30, 7]), [30, 7]);
  assert.equal(daysTo('2026-11-11', NOW), 7); assert.equal(daysTo('0000-00-00', NOW), null);
  // later stage = worse
  assert.ok(level({ key: 'ssl_expiring', sev: 'warning', stage: 7 }) > level({ key: 'ssl_expiring', sev: 'warning', stage: 21 }));
  assert.ok(level({ key: 'ssl_expiring', sev: 'critical', stage: 2 }) > level({ key: 'ssl_expiring', sev: 'warning', stage: 7 }));
});

test('config: defaults are safe (checks on, alerts off until the owner switches them on) and bad input is clamped', () => {
  assert.equal(DEFAULT_HEALTH.enabled, true); assert.equal(DEFAULT_HEALTH.alerts, false);
  const c = normalizeHealth({ concurrency: 999, perRun: -5, sslDays: 'abc', checks: { dmarc: false }, whatsapp: { enabled: true, template: 'Bad Name!' } });
  assert.equal(c.concurrency, 24); assert.equal(c.perRun, 1); assert.deepEqual(c.sslDays, [21, 7, 2, 0]);
  assert.equal(c.checks.dmarc, false); assert.equal(c.checks.ssl, true); assert.equal(c.whatsapp.template, '');
});

test('SPF parsing: valid, syntax errors, +all, lookup limit, server coverage', () => {
  const ok = parseSpf(`v=spf1 a mx ip4:${IP} include:_spf.google.com ~all`);
  assert.equal(ok.ok, true); assert.equal(ok.all, '~'); assert.equal(ok.lookups, 3); assert.deepEqual(ok.ip4, [IP]);
  assert.equal(parseSpf('v=spf2 a -all').ok, false);
  assert.match(parseSpf('v=spf1 ip4:300.1.1.1 -all').errors[0], /bad address/);
  assert.match(parseSpf('v=spf1 foo:bar -all').errors[0], /unknown mechanism/);
  assert.match(parseSpf('v=spf1 +all').errors.join(), /anyone/);
  const many = parseSpf(`v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(' ')} -all`);
  assert.match(many.errors.join(), /11 DNS lookups/);
  assert.equal(parseSpf('v=spf1 redirect=_spf.example.com').ok, true);
  assert.equal(spfCoversServer(parseSpf('v=spf1 ip4:216.158.237.0/24 -all'), IP, false, false), true);
  assert.equal(spfCoversServer(parseSpf('v=spf1 ip4:198.51.100.1 -all'), IP, false, false), false);
  assert.equal(spfCoversServer(parseSpf('v=spf1 mx -all'), IP, false, true), true);
});

test('DMARC parsing', () => {
  assert.deepEqual(parseDmarc('v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com; pct=50').errors, []);
  assert.equal(parseDmarc('v=DMARC1; p=reject').p, 'reject');
  assert.match(parseDmarc('v=DMARC1; rua=mailto:a@b.com').errors.join(), /p= tag is missing/);
  assert.match(parseDmarc('v=DMARC1; p=block').errors.join(), /not none, quarantine or reject/);
  assert.match(parseDmarc('v=DMARC1; p=none; rua=dmarc@example.com').errors.join(), /mailto/);
  assert.equal(parseDmarc('p=none; v=DMARC1').ok, false);
});

test('rules: a healthy domain has no issues', () => {
  assert.deepEqual(keys(facts()), []);
});

test('rules: certificate expiry stages, expired, wrong name, chain, self-signed', () => {
  const at = (d: number) => evaluate(T, facts({ tls: { connected: true, authorized: true, validTo: iso(d), daysLeft: d, names: ['shop.example'], nameOk: true } }), { cfg, ourNs: OURS, now: NOW }).find((i) => i.key === 'ssl_expiring');
  assert.equal(at(30), undefined);
  assert.deepEqual([at(20)?.stage, at(20)?.sev], [21, 'warning']);
  assert.deepEqual([at(6)?.stage, at(6)?.sev], [7, 'warning']);
  assert.deepEqual([at(1)?.stage, at(1)?.sev], [2, 'critical']);
  assert.deepEqual([at(0)?.stage, at(0)?.sev], [0, 'critical']);
  assert.deepEqual(keys(facts({ tls: { connected: true, authorized: false, authError: 'CERT_HAS_EXPIRED', validTo: iso(-2), daysLeft: -2, names: ['shop.example'], nameOk: true } })), ['ssl_expired']);
  assert.deepEqual(keys(facts({ tls: { connected: true, authorized: true, validTo: iso(60), daysLeft: 60, names: ['other.example'], nameOk: false } })), ['ssl_name']);
  assert.deepEqual(keys(facts({ tls: { connected: true, authorized: false, authError: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', validTo: iso(60), daysLeft: 60, names: ['shop.example'], nameOk: true } })), ['ssl_chain']);
  const self = evaluate(T, facts({ tls: { connected: true, authorized: false, authError: 'DEPTH_ZERO_SELF_SIGNED_CERT', validTo: iso(60), daysLeft: 60, names: ['shop.example'], nameOk: true } }), { cfg, ourNs: OURS, now: NOW });
  assert.deepEqual(self.map((i) => [i.key, i.sev, i.params.reason]), [['ssl_untrusted', 'critical', 'self-signed']]);
});

test('rules: no HTTPS vs site down, server errors', () => {
  assert.deepEqual(keys(facts({ tls: { connected: false, error: 'refused' }, web: { http: { status: 200 } } })), ['ssl_missing']);
  const down = evaluate(T, facts({ tls: { connected: false, error: 'timeout' }, web: { http: { error: 'timeout' } } }), { cfg, ourNs: OURS, now: NOW });
  assert.deepEqual(down.map((i) => [i.key, i.sev]), [['site_down', 'critical']]);
  assert.deepEqual(keys(facts({ web: { https: { status: 503 } } })), ['site_error']);
  // a private address is never fetched: no web issues
  assert.deepEqual(keys(facts({ tls: undefined, web: undefined, skipped: 'private-address' })), []);
});

test('rules: DNS, nameservers ours or declared external, A record to the hosting server', () => {
  assert.deepEqual(keys(facts({ dns: { ok: true, via: 'udp', nx: true, ns: [], a: [], aaaa: [] }, tls: undefined, web: undefined, mail: undefined })), ['ns_none']);
  assert.deepEqual(keys(facts({ dns: { ok: true, via: 'udp', ns: [...OURS], a: [], aaaa: [] }, tls: undefined, web: undefined })), ['dns_unresolved']);
  const ext = facts({ dns: { ok: true, via: 'doh', ns: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'], a: ['104.21.1.1'], aaaa: [] }, mail: undefined });
  assert.deepEqual(keys(ext), ['a_mismatch', 'ns_external']);
  assert.equal(evaluate(T, ext, { cfg, ourNs: OURS, now: NOW }).find((i) => i.key === 'ns_external')!.sev, 'info');
  assert.deepEqual(keys(ext, T, true), [], 'declared external: no notes');
  assert.deepEqual(keys(facts({ dns: { ok: true, via: 'udp', ns: ['ns1.globalhostia.com', 'ns1.other.net'], a: [IP], aaaa: [] } })), ['ns_mixed']);
  // our own lookup failed (UDP and DoH): unknown, never an alert
  assert.deepEqual(keys(facts({ dns: { ok: false, via: 'none', error: 'timeout', ns: [], a: [], aaaa: [] } }), { ...T, reg: null }), []);
  // registered-only domain (no hosting here): no A-record rule, unresolved is a warning
  const reg: Target = { domain: 'parked.example', clientId: 1, sources: ['registered'], reg: { expiry: '2027-06-01', status: 'Active', autoRenew: true } };
  const r = evaluate(reg, facts({ dns: { ok: true, via: 'udp', ns: [...OURS], a: [], aaaa: [] }, tls: undefined, web: undefined, mail: undefined }), { cfg, ourNs: OURS, now: NOW });
  assert.deepEqual(r.map((i) => [i.key, i.sev]), [['dns_unresolved', 'warning']]);
});

test('rules: MX when using our email, SPF / DKIM / DMARC', () => {
  const m = (mail: DomainFacts['mail']) => keys(facts({ mail }));
  assert.deepEqual(m({ mx: [], spf: [], dmarc: [], dkim: [] }), ['mx_missing']);
  assert.deepEqual(m({ mx: [{ host: 'mail.gone.example', pri: 10, ips: [] }], spf: ['v=spf1 mx -all'], dmarc: ['v=DMARC1; p=none'], dkim: [] }), ['mx_broken']);
  assert.deepEqual(m({ mx: [{ host: 'mail.shop.example', pri: 10, ips: [IP] }], spf: [], dmarc: [], dkim: [] }), ['dkim_missing', 'dmarc_missing', 'spf_missing']);
  assert.deepEqual(m({ mx: [{ host: 'mail.shop.example', pri: 10, ips: [IP] }], spf: ['v=spf1 a -all', 'v=spf1 mx -all'], dmarc: ['v=DMARC1; p=none'], dkim: ['p=x'] }), ['spf_multiple']);
  assert.deepEqual(m({ mx: [{ host: 'mail.shop.example', pri: 10, ips: [IP] }], spf: ['v=spf1 ip4:198.51.100.9 -all'], dmarc: ['v=DMARC1; p=none'], dkim: ['p=x'] }), ['spf_server']);
  assert.deepEqual(m({ mx: [{ host: 'mail.shop.example', pri: 10, ips: [IP] }], spf: ['v=spf1 bogus -all'], dmarc: ['v=DMARC1; p=bad'], dkim: ['p=x'] }), ['dmarc_invalid', 'spf_invalid']);
  // Google Workspace mail (not ours): SPF + DMARC checked, DKIM not (we cannot know their selector)
  assert.deepEqual(m({ mx: [{ host: 'smtp.google.com', pri: 1, ips: ['142.250.1.27'] }], spf: ['v=spf1 include:_spf.google.com ~all'], dmarc: [], dkim: [] }), ['dmarc_missing']);
  const spf = evaluate(T, facts({ mail: { mx: [{ host: 'mail.shop.example', pri: 10, ips: [IP] }], spf: [], dmarc: ['v=DMARC1; p=none'], dkim: ['p=x'] } }), { cfg, ourNs: OURS, now: NOW })[0];
  assert.equal(spf.params.value, `v=spf1 a mx ip4:${IP} ~all`);
  // a switched-off check produces nothing
  assert.deepEqual(evaluate(T, facts({ mail: { mx: [{ host: 'mail.shop.example', pri: 10, ips: [IP] }], spf: [], dmarc: [], dkim: [] } }), { cfg: normalizeHealth({ checks: { spf: false, dkim: false, dmarc: false } }), ourNs: OURS, now: NOW }), []);
});

test('rules: domain registration expiry (WHMCS)', () => {
  const r = (reg: Target['reg']) => evaluate({ ...T, reg }, facts(), { cfg, ourNs: OURS, now: NOW }).map((i) => [i.key, i.sev, i.stage]);
  assert.deepEqual(r({ expiry: '2026-11-24', status: 'Active', autoRenew: false }), [['reg_expiring', 'warning', 30]]);
  assert.deepEqual(r({ expiry: '2026-11-24', status: 'Active', autoRenew: true }), [], 'auto-renew on, 20 days: WHMCS renews it');
  assert.deepEqual(r({ expiry: '2026-11-09', status: 'Active', autoRenew: true }), [['reg_expiring', 'critical', 7]], 'last week: renewal not paid yet');
  assert.deepEqual(r({ expiry: '2026-11-01', status: 'Grace', autoRenew: false }), [['reg_expired', 'critical', 0]]);
});

test('state change: new, worse, same (no alert), resolved; held-back alerts are retried', () => {
  const at1 = iso(0), at2 = iso(1), at3 = iso(2);
  const ssl = (stage: number, sev: 'warning' | 'critical', days: number) => ({ key: 'ssl_expiring' as const, check: 'ssl' as const, sev, stage, params: { domain: 'shop.example', days } });
  let s = mergeIssues({}, [ssl(21, 'warning', 20)], at1);
  assert.deepEqual(s.opened, ['ssl_expiring']);
  assert.deepEqual(dueAlerts(s.issues, {}), ['ssl_expiring'], 'new issue: alert');
  const marks = { ssl_expiring: markOf(s.issues.ssl_expiring!, at1) };
  s = mergeIssues(s.issues, [ssl(21, 'warning', 19)], at2);
  assert.deepEqual([s.opened, s.worse], [[], []]);
  assert.deepEqual(dueAlerts(s.issues, marks), [], 'same stage: no second alert');
  assert.equal(s.issues.ssl_expiring!.first, at1, 'first seen is kept');
  s = mergeIssues(s.issues, [ssl(7, 'warning', 6)], at3);
  assert.deepEqual(s.worse, ['ssl_expiring']);
  assert.deepEqual(dueAlerts(s.issues, marks), ['ssl_expiring'], 'worse stage: alert again');
  // not delivered (quiet hours): still due on the next run, because it is compared with the last ALERT
  const s2 = mergeIssues(s.issues, [ssl(7, 'warning', 5)], iso(3));
  assert.deepEqual(dueAlerts(s2.issues, marks), ['ssl_expiring']);
  // resolved
  const s3 = mergeIssues(s2.issues, [], iso(4));
  assert.deepEqual(s3.resolved, ['ssl_expiring']);
  assert.deepEqual(resolvedAlerts(s3.issues, marks), ['ssl_expiring']);
  // comes back later: a new occurrence (new first-seen) alerts again even at the same stage
  const s4 = mergeIssues(s3.issues, [ssl(21, 'warning', 20)], iso(5));
  assert.deepEqual(dueAlerts(s4.issues, { ssl_expiring: { at: at1, sev: 'warning', stage: 21, first: at1 } }), ['ssl_expiring']);
  // info never alerts; critical first
  const mixed: IssueMap = { ns_external: { sev: 'info', stage: 0, first: at1, last: at1, params: {}, check: 'ns' }, dmarc_missing: { sev: 'warning', stage: 0, first: at1, last: at1, params: {}, check: 'dmarc' }, site_down: { sev: 'critical', stage: 0, first: at1, last: at1, params: {}, check: 'https' } };
  assert.deepEqual(dueAlerts(mixed, {}), ['site_down', 'dmarc_missing']);
  assert.equal(alertStage('ssl_expiring', { sev: 'warning', stage: 7 }), 'ssl_expiring:warning:7');
  assert.equal(waWorthy('ssl_expired', { sev: 'critical' }), true);
  assert.equal(waWorthy('dmarc_missing', { sev: 'warning' }), false);
});

test('cursor: never-checked first, then oldest; fresh rows wait', () => {
  const H = 3600_000;
  const rows = [
    { id: 'a', active: true, lastChecked: NOW - 2 * H }, { id: 'b', active: true, lastChecked: null }, { id: 'c', active: true, lastChecked: NOW - 30 * H },
    { id: 'd', active: false, lastChecked: null }, { id: 'e', active: true, lastChecked: NOW - 25 * H },
  ];
  assert.deepEqual(pickDue(rows, NOW, 20 * H, 10).map((r) => r.id), ['b', 'c', 'e']);
  assert.deepEqual(pickDue(rows, NOW, 20 * H, 2).map((r) => r.id), ['b', 'c']);
  // every domain is reached within a day when runs keep coming: simulate 24 hourly runs of 2 domains over 30 rows
  const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), active: true, lastChecked: null as number | null }));
  for (let h = 0; h < 24; h++) for (const r of pickDue(many, NOW + h * H, 20 * H, 2)) r.lastChecked = NOW + h * H;
  assert.ok(many.slice(0, 24).every((r) => r.lastChecked !== null));
});

test('fix links: free SSL, DNS editor pre-filled for SPF / DMARC, renew, help page', () => {
  const site = 'https://globalhostia.com';
  const ssl = fixFor('ssl_expired', { params: {} }, T, { site, nsOurs: true });
  assert.equal(ssl.kind, 'ssl'); assert.equal(ssl.href, 'https://globalhostia.com/account/health?d=shop.example&fix=ssl#fix');
  const dmarc = fixFor('dmarc_missing', { params: { value: 'v=DMARC1; p=none; rua=mailto:postmaster@shop.example' } }, T, { site, nsOurs: true });
  const u = new URL(dmarc.href);
  assert.equal(u.pathname, '/account/domains/301'); assert.equal(u.hash, '#dns-add');
  assert.deepEqual([u.searchParams.get('add'), u.searchParams.get('type'), u.searchParams.get('name'), u.searchParams.get('value')], ['1', 'TXT', '_dmarc', 'v=DMARC1; p=none; rua=mailto:postmaster@shop.example']);
  assert.equal(fixFor('spf_missing', { params: {} }, T, { site, nsOurs: false }).kind, 'help', 'DNS elsewhere: show the record instead');
  assert.equal(fixFor('reg_expiring', { params: {} }, T, { site, nsOurs: true }).href, `${site}/account/renewals`);
  assert.equal(fixFor('ssl_missing', { params: {} }, { ...T, sslIssue: false }, { site, nsOurs: true }).kind, 'help');
});

test('copy: plain language in English and Arabic, every placeholder filled', () => {
  const p = { domain: 'shop.example', days: 7, date: '2026-11-11', reason: 'timeout', names: 'a.example', code: 502, ns: 'x', ips: '1.2.3.4', ip: IP, host: 'mail.x', n: 2, auto: 'off' };
  for (const k of ['ssl_missing', 'ssl_expired', 'ssl_expiring', 'ssl_name', 'ssl_chain', 'ssl_untrusted', 'site_down', 'site_error', 'dns_unresolved', 'ns_none', 'ns_mixed', 'ns_external', 'a_mismatch', 'mx_missing', 'mx_broken', 'spf_missing', 'spf_multiple', 'spf_invalid', 'spf_server', 'dkim_missing', 'dmarc_missing', 'dmarc_invalid', 'reg_expiring', 'reg_expired'] as const) {
    for (const l of ['en', 'ar'] as const) {
      const c = issueCopy(k, p, l);
      assert.ok(c.title && c.explain, `${k}/${l}`);
      assert.doesNotMatch(c.title + c.explain, /\{\w+\}/, `${k}/${l} placeholder left`);
      if (l === 'ar') assert.match(c.title, /[؀-ۿ]/);
    }
  }
  assert.equal(issueCopy('ssl_expiring', { days: 0 }, 'en').title, 'SSL certificate expires today');
  assert.match(issueCopy('site_down', { domain: 'a.example', reason: 'refused' }, 'ar').explain, /تم رفض الاتصال/);
});

test('inventory merge: registered + service + addon + alias, statuses filtered', () => {
  const doms = [
    { id: 301, userid: 1, domainname: 'Demo-Brand.com', status: 'Active', expirydate: '2026-11-24', donotrenew: false },
    { id: 305, userid: 1, domainname: 'demo-legacy.org', status: 'Grace', expirydate: '2026-11-01', donotrenew: true },
    { id: 307, userid: 1, domainname: 'gone.org', status: 'Transferred Away', expirydate: '2026-11-01' },
    { id: 308, userid: 1, domainname: 'old.org', status: 'Expired', expirydate: '2026-01-01' },
  ];
  const prods = [
    { id: 102, clientid: 1, domain: 'demo-brand.com', status: 'Active', module: 'directadmin', serverid: 5 },
    { id: 101, clientid: 1, domain: 'vps1.demo-brand.com', status: 'Active', module: 'vpsautomation' },
    { id: 106, clientid: 1, domain: 'old-campaign.com', status: 'Suspended', module: 'cpanel' },
  ];
  const t = buildTargets(doms, prods, { now: NOW, addon: true, alias: true, managed: (p) => p.serverid === 5 || /cpanel/.test(p.module), panel: (p) => (p.id === 102 ? { domains: ['demo-brand.com', 'demo-brand.shop'], aliases: ['demo-brand.net'], ip: IP, ssl: true, serverId: 'da1' } : null) });
  const by = Object.fromEntries(t.map((x) => [x.domain, x]));
  assert.deepEqual(Object.keys(by).sort(), ['demo-brand.com', 'demo-brand.net', 'demo-brand.shop', 'demo-legacy.org']);
  assert.deepEqual(by['demo-brand.com'].sources, ['registered', 'service']);
  assert.equal(by['demo-brand.com'].whmcsDomainId, 301); assert.equal(by['demo-brand.com'].serverIp, IP); assert.equal(by['demo-brand.com'].sslIssue, true);
  assert.deepEqual(by['demo-brand.shop'].sources, ['addon']); assert.deepEqual(by['demo-brand.net'].sources, ['alias']);
  assert.deepEqual(by['demo-legacy.org'].reg, { expiry: '2026-11-01', status: 'Grace', autoRenew: false });
});

test('runCycle: one email per client for new issues, nothing twice, resolved notice, deadline and kill switch', async () => {
  const rows: HealthRow[] = [
    { id: 'r1', domain: 'a.example', clientId: 1, active: true, external: false, target: { ...T, domain: 'a.example' }, issues: {}, marks: {}, lastChecked: null, status: 'unknown' },
    { id: 'r2', domain: 'b.example', clientId: 1, active: true, external: false, target: { ...T, domain: 'b.example' }, issues: {}, marks: {}, lastChecked: null, status: 'unknown' },
    { id: 'r3', domain: 'c.example', clientId: 2, active: true, external: false, target: { ...T, domain: 'c.example', clientId: 2 }, issues: {}, marks: {}, lastChecked: null, status: 'unknown' },
  ];
  let clock = NOW;
  let broken = new Set(['a.example', 'c.example']);
  const sent: { cid: number; keys: string[]; fixed: string[] }[] = [];
  const deps = (): RunDeps => ({
    now: () => clock, deadline: clock + 60_000, site: 'https://globalhostia.com', ourNs: OURS,
    inventory: async () => null,
    store: {
      sync: async () => ({ added: 0, removed: 0 }),
      due: async (limit, age) => pickDue(rows, clock, age, limit),
      saveCheck: async (id, p) => { const r = rows.find((x) => x.id === id)!; r.issues = p.issues; r.lastChecked = p.checkedAt; r.status = p.status; },
      saveMarks: async (id, m) => { rows.find((x) => x.id === id)!.marks = m; },
    },
    probe: async (t) => (broken.has(t.domain) ? facts({ domain: t.domain, tls: { connected: true, authorized: false, authError: 'CERT_HAS_EXPIRED', validTo: iso(-1), daysLeft: -1, names: [t.domain], nameOk: true } }) : facts({ domain: t.domain })),
    deliver: async (cid, alerts: PlannedAlert[], resolved: PlannedAlert[]) => { sent.push({ cid, keys: alerts.map((a) => `${a.domain}:${a.key}`), fixed: resolved.map((a) => `${a.domain}:${a.key}`) }); return { delivered: [...alerts.map((a) => `${a.rowId}:${a.key}`), ...resolved.map((a) => `${a.rowId}:${a.key}:resolved`)] }; },
  });
  const on = normalizeHealth({ alerts: true });
  let r = await runCycle(on, deps());
  assert.equal(r.checked, 3); assert.equal(r.alerts, 2);
  assert.deepEqual(sent, [{ cid: 1, keys: ['a.example:ssl_expired'], fixed: [] }, { cid: 2, keys: ['c.example:ssl_expired'], fixed: [] }]);
  assert.equal(rows[0].status, 'critical'); assert.equal(rows[1].status, 'ok');
  // next day, still broken: checked again, no second email
  clock += 25 * 3600_000; sent.length = 0;
  r = await runCycle(on, deps());
  assert.equal(r.checked, 3); assert.deepEqual(sent, []);
  // fixed: one "fixed" notice, marks cleared
  clock += 25 * 3600_000; broken = new Set(['c.example']);
  r = await runCycle(on, deps());
  assert.deepEqual(sent, [{ cid: 1, keys: [], fixed: ['a.example:ssl_expired'] }]);
  assert.deepEqual(rows[0].marks, {}); assert.equal(r.resolved, 1);
  // alerts off: checks run, nothing sent, marks untouched
  clock += 25 * 3600_000; sent.length = 0; broken = new Set(['b.example']);
  r = await runCycle(normalizeHealth({ alerts: false }), deps());
  assert.equal(r.checked, 3); assert.deepEqual(sent, []); assert.ok(r.skipped['alerts-off'] >= 1);
  // kill switch
  r = await runCycle(normalizeHealth({ enabled: false }), deps());
  assert.equal(r.checked, 0); assert.equal(r.skipped.disabled, 1);
  // deadline already passed: nothing probed
  clock += 25 * 3600_000;
  const d = deps(); d.deadline = clock - 1;
  r = await runCycle(on, d);
  assert.equal(r.checked, 0); assert.equal(r.deadline, true);
});

test('alert email: black-and-white template, grouped by domain, fix buttons, unsubscribe; Arabic is RTL', () => {
  const footer = { unsubUrl: 'https://globalhostia.com/account/unsubscribe?t=x', prefsUrl: 'https://globalhostia.com/account/settings#reminders', why: 'Because.' };
  const m = healthEmail({ lang: 'en', name: 'Manoj', panelUrl: 'https://globalhostia.com/account/health', footer, fixed: [{ domain: 'b.example', title: 'Website is not reachable' }], alerts: [
    { domain: 'a.example', sev: 'critical', title: 'SSL certificate has expired', explain: 'It expired {oops}.', fix: { href: 'https://globalhostia.com/account/health?d=a.example&fix=ssl#fix', label: 'Issue free SSL' } },
    { domain: 'a.example', sev: 'warning', title: 'No DMARC policy', explain: 'x', fix: null, record: { name: '_dmarc', value: 'v=DMARC1; p=none' } },
  ] });
  assert.equal(m.subject, 'Urgent: 2 problems found on your domains');
  assert.ok(m.html.includes('#111111') && m.html.includes('gh-panel') && m.html.includes('Issue free SSL'));
  assert.ok(!/[{}]/.test(m.html), 'no raw braces (WHMCS Smarty)');
  assert.ok(m.html.includes('unsubscribe?t=x') && m.text.includes('Fixed since our last email'));
  assert.ok(m.html.includes('v=DMARC1; p=none'));
  const ar = healthEmail({ lang: 'ar', name: '', panelUrl: 'https://globalhostia.com/account/health', footer, fixed: [], alerts: [{ domain: 'a.example', sev: 'critical', title: 'انتهت صلاحية شهادة SSL', explain: '...', fix: null }] });
  assert.ok(ar.html.startsWith('<div dir="rtl"')); assert.equal(ar.subject, 'انتهت صلاحية شهادة SSL: a.example');
  assert.match(WA_HEALTH.en, /\{\{4\}\}/);
});

test('unsubscribe tokens accept the health scope', () => {
  const secret = 'x'.repeat(40);
  assert.deepEqual(verifyUnsub(signUnsub({ e: 'A@b.com', c: 3, s: 'health' }, secret), secret), { e: 'a@b.com', c: 3, s: 'health' });
  assert.equal(nsKind([], OURS), 'none');
});

test('runCycle: when most domains suddenly look unreachable, nothing is sent about it (our network, not theirs)', async () => {
  const rows: HealthRow[] = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, domain: `d${i}.example`, clientId: i + 1, active: true, external: false, target: { ...T, domain: `d${i}.example`, clientId: i + 1 }, issues: {}, marks: {}, lastChecked: null, status: 'unknown' }));
  const sent: string[] = [];
  const down = facts({ tls: { connected: false, error: 'timeout' }, web: { http: { error: 'timeout' } } });
  const r = await runCycle(normalizeHealth({ alerts: true }), {
    now: () => NOW, deadline: NOW + 60_000, site: 'https://globalhostia.com', ourNs: OURS, inventory: async () => null,
    store: { sync: async () => ({ added: 0, removed: 0 }), due: async () => rows, saveCheck: async (id, p) => { rows.find((x) => x.id === id)!.issues = p.issues; }, saveMarks: async () => {} },
    probe: async (t) => ({ ...down, domain: t.domain }),
    deliver: async (_c, a) => { sent.push(...a.map((x) => x.key)); return { delivered: [] }; },
  });
  assert.equal(r.checked, 10); assert.equal(r.skipped['suspected-network'], 10); assert.deepEqual(sent, []);
  assert.ok(rows.every((x) => x.issues.site_down), 'results are still stored');
});
