// Local mock of the DirectAdmin legacy API subset the portal DNS editor uses (login-as "owner|user", JSON answers).
// HTTPS (the app only talks to https panels): pass a cert/key, and start the app with NODE_EXTRA_CA_CERTS=<cert>.
// Usage: DA_CERT=cert.pem DA_KEY=key.pem node tests/mock-da.mjs   -> https://localhost:4556
// Without DA_CERT it serves plain HTTP (unit tests: tests/wordpress.test.mts talks to the Softaculous mock directly).
// Softaculous (DirectAdmin plugin, /CMD_PLUGINS/softaculous/index.raw?api=json&act=…): installations, software (install),
// sign_on, staging + pushtolive (background tasks polled with eu_tasklist), remove, backup, upgrade. Error triggers:
// install into folder "taken" (files exist), site title "FAIL DB" (database limit); user "nosoft" has no Softaculous.
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';

const PORT = Number(process.env.DA_PORT || 4556);
const KEY = process.env.DA_LOGIN_KEY || 'mock-key';
// user -> domains; zone -> records
const users = { demobran: ['demo-brand.com', 'demo-brand.shop'], demoblog: ['demo-blog.com'], ghdns: [] };
const def = (z) => [
  { type: 'NS', name: `${z}.`, value: 'ns1.globalhostia.com.', ttl: 14400 }, { type: 'NS', name: `${z}.`, value: 'ns2.globalhostia.com.', ttl: 14400 },
  { type: 'A', name: `${z}.`, value: '216.158.237.114', ttl: 14400 }, { type: 'A', name: 'www', value: '216.158.237.114', ttl: 14400 },
  { type: 'A', name: 'mail', value: '216.158.237.114', ttl: 14400 }, { type: 'MX', name: `${z}.`, value: `10 mail.${z}.`, ttl: 14400 },
  { type: 'TXT', name: `${z}.`, value: '"v=spf1 a mx ip4:216.158.237.114 ~all"', ttl: 14400 },
];
const zones = {
  'demo-brand.com': [...def('demo-brand.com'), { type: 'CNAME', name: 'shop', value: 'shops.myshopify.com.', ttl: 3600 },
    { type: 'TXT', name: 'x._domainkey', value: '"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0gunVTLw7onLRnrq0/IzW7yWR7QkrmBL7jTKEn5u+qKhbwKfBstIs+bMY2Zkp18gnTxKLxoS2tFczGkPLPgizskuemMghRniWaoLcyehkd3qqGElvW/VDL5AaWTg0nLVkjRo9z+40RQzuVaE8AkAFmxZzow3x+VJYKdx"', ttl: 3600 },
    { type: 'SRV', name: '_sip._tcp', value: '10 5 5060 sip.demo-brand.com.', ttl: 3600 }],
  'demo-brand.shop': def('demo-brand.shop'), 'demo-blog.com': def('demo-blog.com'),
};
const who = (h) => {
  const m = /^Basic (.+)$/.exec(h || ''); if (!m) return null;
  const [u, k] = Buffer.from(m[1], 'base64').toString().split(':');
  if (k !== KEY) return null;
  const [owner, as] = u.split('|');
  return { owner, as };
};
const send = (res, body, type = 'application/json') => { res.writeHead(200, { 'content-type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

/* ------------------------------------------------------------------ Softaculous mock */
const WP_LATEST = '6.8.3';
let insSeq = 12000;
const soft = { // user -> insid -> installation (fields as Softaculous returns them; softdbpass is there on purpose: never forwarded)
  demobran: {
    '26_11001': { insid: '26_11001', sid: '26', ver: '6.7.1', itime: 1767225600, softpath: '/home/demobran/domains/demo-brand.com/public_html', softurl: 'https://demo-brand.com', softdomain: 'demo-brand.com', softdirectory: '', site_name: 'Demo Brand', softdb: 'demobran_wp1', softdbpass: 'db-secret-never-shown' },
    '26_11002': { insid: '26_11002', sid: '26', ver: '6.7.1', itime: 1769904000, softpath: '/home/demobran/domains/demo-brand.com/public_html/staging', softurl: 'https://demo-brand.com/staging', softdomain: 'demo-brand.com', softdirectory: 'staging', site_name: 'Demo Brand', is_staging: 1, staging_parent: '26_11001' },
    '26_11003': { insid: '26_11003', sid: '26', ver: WP_LATEST, itime: 1772323200, softpath: '/home/demobran/domains/demo-brand.shop/public_html', softurl: 'https://demo-brand.shop', softdomain: 'demo-brand.shop', softdirectory: '', site_name: 'Demo Shop' },
  },
  demoblog: {},
};
const tasks = {}; // key -> { user, n, kind, apply }
const softLog = []; // what tests check: [act, user, form keys]
function softaculousMock(res, u, q, f, method) {
  const j = (o) => send(res, o);
  if (u === 'nosoft') { res.writeHead(404); return res.end(); }
  const mine = (soft[u] ||= {});
  softLog.push({ act: q.act, user: u, insid: q.insid, keys: Object.keys(f) });
  if (q.api !== 'json') return send(res, 'a:0:{}', 'text/plain');
  const ins = q.insid ? mine[q.insid] : null;
  const needIns = () => { if (!ins) { j({ error: { noins: 'The installation you specified is not valid' } }); return false; } return true; };
  const task = (kind, apply) => { const key = crypto.randomBytes(16).toString('hex'); tasks[key] = { user: u, n: 0, kind, apply }; return key; };
  switch (q.act) {
    case 'installations': return j({ title: 'Softaculous - Installations', installations: { 26: mine }, scripts: { 26: { name: 'WordPress', ver: WP_LATEST } } });
    case 'software': {
      if (q.soft !== '26' || method !== 'POST' || f.softsubmit !== '1') return j({ error: { soft: 'Invalid request' } });
      if (!(users[u] || []).some((d) => f.softdomain === d || f.softdomain.endsWith('.' + d))) return j({ error: { softdomain: 'The path of the domain you selected could not be found.' } });
      if (f.softdirectory === 'taken') return j({ error: { softdirectory: 'The installation path has some files already. <b>' + f.admin_pass + '</b> Please choose another directory.' } });
      if (f.site_name === 'FAIL DB') return j({ error: { db: 'You have reached the maximum number of MySQL databases allowed.' } });
      if (!f.admin_pass || f.admin_pass.length < 12) return j({ error: { admin_pass: 'Password too weak' } });
      const id = `26_${++insSeq}`, url = `${f.softproto === '3' ? 'https' : 'http'}://${f.softdomain}${f.softdirectory ? '/' + f.softdirectory : ''}`;
      mine[id] = { insid: id, sid: '26', ver: WP_LATEST, itime: Math.floor(Date.now() / 1000), softpath: `/home/${u}/domains/${f.softdomain}/public_html${f.softdirectory ? '/' + f.softdirectory : ''}`, softurl: url, softdomain: f.softdomain, softdirectory: f.softdirectory, site_name: f.site_name, language: f.language, emailto: f.emailto || '' };
      return j({ done: true, insid: id, __settings: { softurl: url } });
    }
    case 'sign_on': if (!needIns()) return; if (!/^[0-9a-f]{32}$/.test(q.autoid || '')) return j({ error: { autoid: 'Invalid autoid' } }); return j({ done: 1, sign_on_url: `${ins.softurl}/wp-admin/?softaculous_auto=${q.autoid}` });
    case 'staging': {
      if (!needIns()) return;
      if (Object.values(mine).some((x) => x.softdomain === f.softdomain && (x.softdirectory || '') === (f.softdirectory || ''))) return j({ error: { softdirectory: 'The installation path has some files already.' } });
      const id = `26_${++insSeq}`, url = `https://${f.softdomain}${f.softdirectory ? '/' + f.softdirectory : ''}`;
      return j({ done: task('staging', () => { mine[id] = { ...ins, insid: id, softurl: url, softdomain: f.softdomain, softdirectory: f.softdirectory, is_staging: 1, staging_parent: ins.insid, softpath: `/home/${u}/domains/${f.softdomain}/public_html${f.softdirectory ? '/' + f.softdirectory : ''}` }; return url; }) });
    }
    case 'pushtolive': {
      if (!needIns()) return;
      if (!ins.is_staging) return j({ error: { insid: 'This installation is not a staging installation' } });
      return j({ done: task('pushtolive', () => { const live = mine[ins.staging_parent]; if (live) live.ver = ins.ver; return live ? live.softurl : ''; }) });
    }
    case 'eu_tasklist': {
      const t = tasks[q.ssk];
      if (!t || t.user !== u) return j({ error: { ssk: 'Task not found' } });
      t.n++;
      if (t.n < 2) return j({ title: 'Softaculous - Task List', status: { process: t.kind, current_status: t.kind === 'staging' ? 'Copying files' : 'Propagating the database', progress: 50 } });
      const url = t.done ?? (t.done = t.apply());
      return j({ title: 'Softaculous - Task List', status: { process: t.kind, current_status: 'Done', completed: t.kind === 'staging' ? 'Staging Completed' : 'Push to live Completed', progress: 100, softurl: url } });
    }
    case 'remove': if (!needIns()) return; if (f.removeins !== '1') return j({ error: { removeins: 'Not confirmed' } }); delete mine[q.insid]; return j({ done: 1 });
    case 'backup': if (!needIns()) return; if (f.backupins !== '1') return j({ error: { backupins: 'Not confirmed' } }); return j({ done: 1 });
    case 'upgrade': if (!needIns()) return; if (ins.ver === WP_LATEST) return j({ error: { upgrade: 'This installation is already at the latest version' } }); ins.ver = WP_LATEST; return j({ done: 1, __settings: { softurl: ins.softurl } });
  }
  return j({ error: { act: 'Unknown act' } });
}

const handler = async (req, res) => {
  const url = new URL(req.url, 'https://x');
  const a = who(req.headers.authorization);
  if (!a) { res.writeHead(401); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  const f = Object.fromEntries(new URLSearchParams(body));
  const q = Object.fromEntries(url.searchParams);
  const u = a.as;
  console.log(req.method, url.pathname, u || '(owner)', req.method === 'POST' ? JSON.stringify(f).slice(0, 160) : '');
  const owns = (d) => (users[u] || []).includes(d);
  if (url.pathname === '/CMD_PLUGINS/softaculous/index.raw') return softaculousMock(res, u, q, f, req.method);
  if (url.pathname === '/__softlog') return send(res, softLog);
  switch (url.pathname) {
    case '/CMD_API_SHOW_USERS': return send(res, Object.keys(users));
    case '/CMD_API_SHOW_DOMAINS': return send(res, users[u] || []);
    case '/CMD_API_DOMAIN':
      if (f.action === 'create') {
        if (Object.values(users).flat().includes(f.domain)) return send(res, 'error=1&text=That domain already exists', 'text/plain');
        users[u].push(f.domain); zones[f.domain] = def(f.domain); return send(res, 'error=0&text=Domain Created', 'text/plain');
      }
      if (f.delete) { users[u] = users[u].filter((d) => d !== f.select0); delete zones[f.select0]; return send(res, 'error=0&text=Deleted', 'text/plain'); }
      return send(res, 'error=1&text=bad', 'text/plain');
    case '/CMD_API_DNS_CONTROL': {
      const z = req.method === 'GET' ? q.domain : f.domain;
      if (!owns(z)) return send(res, 'error=1&text=You do not own that domain', 'text/plain');
      if (req.method === 'GET') return send(res, { records: zones[z] });
      if (f.action === 'add') {
        if (f.value === '6.6.6.6') return send(res, 'error=1&text=Mock panel rejected this value', 'text/plain');
        zones[z].push({ type: f.type, name: f.name, value: f.type === 'MX' ? `${f.value} ${f.mx_value}` : f.type === 'TXT' ? `"${f.value}"` : f.value, ttl: Number(f.ttl) || 14400 });
        return send(res, 'error=0&text=Record added', 'text/plain');
      }
      if (f.action === 'select' && f.delete) {
        for (const [k, v] of Object.entries(f)) {
          const m = /^([a-z]+)recs0$/.exec(k); if (!m) continue;
          const p = Object.fromEntries(new URLSearchParams(v));
          const i = zones[z].findIndex((r) => r.type.toLowerCase() === m[1] && r.name === p.name && r.value === p.value);
          if (i >= 0) zones[z].splice(i, 1);
        }
        return send(res, 'error=0&text=Records deleted', 'text/plain');
      }
      return send(res, 'error=1&text=bad', 'text/plain');
    }
  }
  res.writeHead(404); res.end();
};
const tls = process.env.DA_CERT ? { cert: fs.readFileSync(process.env.DA_CERT), key: fs.readFileSync(process.env.DA_KEY) } : null;
(tls ? https.createServer(tls, handler) : http.createServer(handler))
  .listen(PORT, () => console.log(`mock DirectAdmin on ${tls ? 'https' : 'http'}://localhost:${PORT}`));
