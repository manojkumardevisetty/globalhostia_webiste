// Site health: pure evaluation of the facts gathered by lib/hosting/health-probe.ts (DNS, website, SSL, email
// authentication, disk usage) into plain-English rows with ok / warn / fail and, where the panel can fix it, a fix.
// No I/O here so it is unit-tested (tests/health.test.mts).

export type HealthStatus = 'ok' | 'warn' | 'fail';
export type HealthSection = 'website' | 'security' | 'email' | 'storage';

export interface HealthRecord { type: 'TXT'; name: string; value: string; ttl: number }
export type HealthFix =
  | { kind: 'dns'; label: string; record: HealthRecord }
  | { kind: 'ssl'; label: string }
  | { kind: 'tab'; label: string; tab: string }
  | { kind: 'console'; label: string }
  | { kind: 'connect'; label: string };

export interface HealthItem {
  id: string; section: HealthSection; status: HealthStatus; title: string; detail: string;
  fix?: HealthFix;
  /** A record the customer can add by hand at their DNS provider when we cannot add it for them. */
  manual?: HealthRecord;
}

export interface WebFacts { ok: boolean; status?: number; ms?: number; finalUrl?: string; error?: string }
export interface HealthFacts {
  domain: string;
  serverIp?: string;
  /** Lower-case host names without trailing dot that count as "our" nameservers. */
  ourNs: string[];
  dns: { a: string[]; aaaa: string[]; ns: string[]; error?: string };
  web?: WebFacts & { httpsRedirect?: boolean | null; www?: WebFacts; skipped?: string };
  ssl?: { https: boolean; issuer?: string; daysLeft?: number; names?: string[]; error?: string };
  mail: { mx: { exchange: string; priority: number; ips?: string[] }[]; spf: string[]; dkim: string[]; dmarc: string[]; error?: string };
  usage?: { key: string; label: string; used: number; limit: number | null; unit?: string }[];
  checkedAt: string;
}
export interface HealthCaps { dnsAdd: boolean; sslIssue: boolean; redirects: boolean }
export interface HealthReport {
  domain: string; score: number; issues: number; checkedAt: string;
  connected: boolean; nsOurs: boolean;
  sections: { key: HealthSection; title: string; items: HealthItem[] }[];
}

const SECTION_TITLE: Record<HealthSection, string> = { website: 'Website', security: 'Security', email: 'Email', storage: 'Storage' };
/** How much each row weighs in the 0-100 score. */
const WEIGHT: Record<string, number> = { 'dns-a': 3, 'site-points': 3, 'web-status': 3, ssl: 3, 'web-redirect': 1, 'web-www': 1, 'web-speed': 1, 'dns-ns': 1, mx: 1, spf: 2, dkim: 1, dmarc: 1, disk: 1, inode: 1 };

const host = (s: string) => s.toLowerCase().replace(/\.$/, '');
export const nsIsOurs = (ns: string[], ours: string[]) => ns.length > 0 && ns.map(host).every((n) => ours.includes(n));
const certCovers = (names: string[] | undefined, d: string) => !names || !names.length || names.some((n) => { n = host(n); return n === d || (n.startsWith('*.') && d.endsWith(n.slice(1)) && d.split('.').length === n.split('.').length); });

/** SPF that authorises our server: the server IP, the a/mx mechanisms (when those point here) or an include. */
export function spfCovers(spf: string, serverIp: string | undefined, aHere: boolean, mxHere: boolean): boolean {
  const t = ' ' + spf.toLowerCase().replace(/\s+/g, ' ') + ' ';
  if (serverIp && (t.includes(` ip4:${serverIp} `) || t.includes(` +ip4:${serverIp} `) || t.includes(` ip4:${serverIp}/32 `))) return true;
  if (aHere && /\s\+?a(\s|:)/.test(t)) return true;
  if (mxHere && /\s\+?mx(\s|:)/.test(t)) return true;
  return false;
}

export const spfRecord = (ip: string | undefined): HealthRecord => ({ type: 'TXT', name: '@', value: `v=spf1 a mx${ip ? ` ip4:${ip}` : ''} ~all`, ttl: 3600 });
export const dmarcRecord = (domain: string): HealthRecord => ({ type: 'TXT', name: '_dmarc', value: `v=DMARC1; p=none; rua=mailto:postmaster@${domain}`, ttl: 3600 });

export function evaluate(f: HealthFacts, caps: HealthCaps): HealthReport {
  const d = f.domain, items: HealthItem[] = [];
  const add = (it: HealthItem) => items.push(it);
  const ours = nsIsOurs(f.dns.ns, f.ourNs);
  const resolves = f.dns.a.length + f.dns.aaaa.length > 0;
  const aHere = !!f.serverIp && f.dns.a.includes(f.serverIp);
  const connected = ours || aHere;
  const dnsFix = ours && caps.dnsAdd;

  /* ---- website ---- */
  if (!resolves) add({ id: 'dns-a', section: 'website', status: 'fail', title: `${d} does not point anywhere`, detail: f.dns.error === 'timeout' ? 'The DNS lookup timed out. Try again in a minute.' : 'There is no A or AAAA record, so browsers cannot find the website. Point the domain at this hosting to bring it online.', fix: ours ? undefined : { kind: 'connect', label: 'Connect domain' } });
  else add({ id: 'dns-a', section: 'website', status: 'ok', title: 'Domain resolves', detail: `Points to ${[...f.dns.a, ...f.dns.aaaa].slice(0, 3).join(', ')}.` });

  if (f.dns.ns.length) {
    add(ours ? { id: 'dns-ns', section: 'website', status: 'ok', title: 'Nameservers are GlobalHostia', detail: 'DNS is managed here, so changes in the DNS tab take effect straight away.' }
      : { id: 'dns-ns', section: 'website', status: 'ok', title: 'DNS is managed elsewhere', detail: `Nameservers: ${f.dns.ns.slice(0, 3).map(host).join(', ')}. Changes in the DNS tab here will not apply; edit records at that provider.` });
  }
  if (resolves && f.serverIp && !ours && !aHere) {
    add({ id: 'site-points', section: 'website', status: 'fail', title: 'The website is not served from this hosting', detail: `${d} points to ${f.dns.a.join(', ') || 'another address'}, not this server (${f.serverIp}). Visitors see whatever is hosted there.`, fix: { kind: 'connect', label: 'Connect domain' } });
  }

  const w = f.web;
  if (w?.skipped) add({ id: 'web-status', section: 'website', status: 'warn', title: 'Website not checked', detail: w.skipped });
  else if (w && resolves) {
    if (w.ok && w.status && w.status < 400) add({ id: 'web-status', section: 'website', status: 'ok', title: `Website is up (HTTP ${w.status})`, detail: `https://${d} answered in ${w.ms} ms.` });
    else if (w.status && w.status < 500) add({ id: 'web-status', section: 'website', status: 'warn', title: `Website answers with an error (HTTP ${w.status})`, detail: w.status === 403 || w.status === 404 ? 'The server answers but there is no page to show. Upload your site to public_html or install WordPress.' : 'Visitors see an error page instead of your site.' });
    else add({ id: 'web-status', section: 'website', status: 'fail', title: w.status ? `Website is failing (HTTP ${w.status})` : 'Website does not load over HTTPS', detail: w.status ? 'The server reports an internal error. Check recent changes to your site, PHP version or .htaccess.' : `${w.error || 'No answer'}.` });
    if (w.ok && w.ms && w.ms > 3000) add({ id: 'web-speed', section: 'website', status: 'warn', title: 'The home page is slow', detail: `It took ${(w.ms / 1000).toFixed(1)} s to answer. A caching plugin or a newer PHP version usually helps.` });
    if (w.httpsRedirect === false) add({ id: 'web-redirect', section: 'website', status: 'warn', title: 'Visitors are not sent to HTTPS', detail: `http://${d} does not redirect to https://. Add a redirect so every visit is encrypted.`, fix: caps.redirects ? { kind: 'tab', label: 'Open redirects', tab: 'redirects' } : undefined });
    else if (w.httpsRedirect === true) add({ id: 'web-redirect', section: 'website', status: 'ok', title: 'HTTP redirects to HTTPS', detail: 'Visitors who type the plain address end up on the secure one.' });
    if (w.www) add(w.www.ok ? { id: 'web-www', section: 'website', status: 'ok', title: `www.${d} works`, detail: 'The www address opens your site too.' }
      : { id: 'web-www', section: 'website', status: 'warn', title: `www.${d} does not work`, detail: `${w.www.error || (w.www.status ? 'HTTP ' + w.www.status : 'No answer')}. Many people type www first; add a www record pointing here.` });
  }

  /* ---- security ---- */
  const s = f.ssl;
  if (s && resolves) {
    const sslFix = caps.sslIssue && connected ? { kind: 'ssl' as const, label: s.https ? 'Renew certificate' : 'Issue free SSL' } : undefined;
    if (s.https && !certCovers(s.names, d)) add({ id: 'ssl', section: 'security', status: 'fail', title: 'Certificate is for a different name', detail: `The certificate served does not cover ${d}, so browsers show a warning.`, fix: sslFix });
    else if (s.https && (s.daysLeft ?? 0) > 14) add({ id: 'ssl', section: 'security', status: 'ok', title: 'SSL certificate is valid', detail: `${s.issuer || 'Certificate'}, ${s.daysLeft} days left.` });
    else if (s.https) add({ id: 'ssl', section: 'security', status: 'warn', title: `SSL certificate expires in ${Math.max(0, s.daysLeft ?? 0)} days`, detail: 'Renew it now so visitors never see a warning.', fix: sslFix });
    else add({ id: 'ssl', section: 'security', status: 'fail', title: 'No valid SSL certificate', detail: `${s.error || 'Certificate not trusted'}. Browsers mark the site as "Not secure".`, fix: sslFix });
  }

  /* ---- email ---- */
  const m = f.mail;
  const mxHere = m.mx.some((x) => (f.serverIp && x.ips?.includes(f.serverIp)) || host(x.exchange) === `mail.${d}` && aHere);
  if (!m.mx.length) add({ id: 'mx', section: 'email', status: 'warn', title: 'No mail server (MX) record', detail: `Email sent to addresses @${d} cannot be delivered. ${ours ? 'Add an MX record for mail.' + d + ' in the DNS tab.' : 'Add an MX record at your DNS provider.'}` });
  else {
    const where = m.mx.slice(0, 2).map((x) => host(x.exchange)).join(', ');
    const known = /google(mail)?\.com$|googlemail/.test(where) ? 'Google Workspace' : /outlook\.com$|protection\.outlook/.test(where) ? 'Microsoft 365' : /zoho\./.test(where) ? 'Zoho Mail' : '';
    add({ id: 'mx', section: 'email', status: 'ok', title: mxHere ? 'Email is delivered to this hosting' : known ? `Email is handled by ${known}` : 'Mail server (MX) is set', detail: `MX: ${where}.` });
  }
  const mailHere = mxHere || (!m.mx.length && connected);
  if (m.spf.length > 1) add({ id: 'spf', section: 'email', status: 'fail', title: 'More than one SPF record', detail: 'Receivers treat two SPF records as an error and may reject your mail. Merge them into one TXT record that starts with v=spf1.' });
  else if (!m.spf.length) {
    const rec = spfRecord(f.serverIp);
    add({ id: 'spf', section: 'email', status: mailHere ? 'fail' : 'warn', title: 'No SPF record', detail: 'Without SPF, mail from your domain is more likely to land in spam, and others can fake your address more easily.', fix: dnsFix ? { kind: 'dns', label: 'Add SPF record', record: rec } : undefined, manual: dnsFix ? undefined : rec });
  } else if (mailHere && !spfCovers(m.spf[0], f.serverIp, aHere, mxHere) && !/include:/i.test(m.spf[0])) {
    add({ id: 'spf', section: 'email', status: 'warn', title: 'SPF does not include this server', detail: `Your SPF record (${m.spf[0].slice(0, 120)}) does not list ${f.serverIp || 'this server'}, so mail sent from your hosting may be marked as spam.` });
  } else add({ id: 'spf', section: 'email', status: 'ok', title: 'SPF record is set', detail: m.spf[0].slice(0, 160) });
  if (mailHere) {
    add(m.dkim.length ? { id: 'dkim', section: 'email', status: 'ok', title: 'DKIM signing is set up', detail: 'Outgoing mail is signed (selector "x").' }
      : { id: 'dkim', section: 'email', status: 'warn', title: 'DKIM is not set up', detail: 'DKIM signs your outgoing mail so receivers can trust it. In the advanced console open Email Accounts, then DKIM (or Domain Setup), and enable DKIM for ' + d + '. The record is added to your DNS automatically when DNS is managed here.', fix: { kind: 'console', label: 'Open advanced console' } });
  }
  if (m.dmarc.length) add({ id: 'dmarc', section: 'email', status: 'ok', title: 'DMARC policy is set', detail: m.dmarc[0].slice(0, 160) });
  else {
    const rec = dmarcRecord(d);
    add({ id: 'dmarc', section: 'email', status: 'warn', title: 'No DMARC policy', detail: 'DMARC tells receivers what to do with mail that fails SPF or DKIM, and is required by Gmail and Yahoo for bulk senders. Start with a monitoring-only policy (p=none).', fix: dnsFix ? { kind: 'dns', label: 'Add DMARC record', record: rec } : undefined, manual: dnsFix ? undefined : rec });
  }

  /* ---- storage ---- */
  for (const u of f.usage || []) {
    if (u.key !== 'quota' && u.key !== 'inode') continue;
    const id = u.key === 'quota' ? 'disk' : 'inode', what = u.key === 'quota' ? 'Disk space' : 'Files and folders (inodes)';
    if (!u.limit) { add({ id, section: 'storage', status: 'ok', title: `${what}: unlimited`, detail: 'No limit on this plan.' }); continue; }
    const pct = Math.round(u.used / u.limit * 100);
    add({ id, section: 'storage', status: pct >= 98 ? 'fail' : pct > 85 ? 'warn' : 'ok', title: `${what}: ${pct}% used`, detail: pct > 85 ? (u.key === 'quota' ? 'Delete old backups and unused files, or upgrade your plan, before the account fills up and email stops arriving.' : 'Many small files (cache, sessions, old mail) use up the file limit. Clear caches or upgrade.') : 'Plenty of room left.' });
  }

  let got = 0, max = 0, issues = 0;
  for (const it of items) { const w8 = WEIGHT[it.id] ?? 1; max += w8; got += it.status === 'ok' ? w8 : it.status === 'warn' ? w8 / 2 : 0; if (it.status !== 'ok') issues++; }
  const order: HealthSection[] = ['website', 'security', 'email', 'storage'];
  return {
    domain: d, score: max ? Math.round(got / max * 100) : 0, issues, checkedAt: f.checkedAt, connected, nsOurs: ours,
    sections: order.map((k) => ({ key: k, title: SECTION_TITLE[k], items: items.filter((i) => i.section === k) })).filter((x) => x.items.length),
  };
}
