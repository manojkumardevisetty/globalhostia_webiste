// Local mock of the DirectAdmin legacy API subset the portal DNS editor uses (login-as "owner|user", JSON answers).
// HTTPS (the app only talks to https panels): pass a cert/key, and start the app with NODE_EXTRA_CA_CERTS=<cert>.
// Usage: DA_CERT=cert.pem DA_KEY=key.pem node tests/mock-da.mjs   -> https://localhost:4556
import https from 'node:https';
import fs from 'node:fs';

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

https.createServer({ cert: fs.readFileSync(process.env.DA_CERT), key: fs.readFileSync(process.env.DA_KEY) }, async (req, res) => {
  const url = new URL(req.url, 'https://x');
  const a = who(req.headers.authorization);
  if (!a) { res.writeHead(401); return res.end(); }
  let body = ''; for await (const c of req) body += c;
  const f = Object.fromEntries(new URLSearchParams(body));
  const q = Object.fromEntries(url.searchParams);
  const u = a.as;
  console.log(req.method, url.pathname, u || '(owner)', req.method === 'POST' ? JSON.stringify(f).slice(0, 160) : '');
  const owns = (d) => (users[u] || []).includes(d);
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
}).listen(PORT, () => console.log(`mock DirectAdmin on https://localhost:${PORT}`));
