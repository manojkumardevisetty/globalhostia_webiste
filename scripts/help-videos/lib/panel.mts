// Scripted /api/hosting backend + WHMCS client-area page for recording the Manage hosting panel (fictional data).
import fs from 'node:fs';
import path from 'node:path';
const REPO = process.env.REPO || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const { mailSettings, settingsText } = await import(REPO + '/lib/hosting/mailsetup.ts');
const { connectSteps, detectProvider } = await import(REPO + '/lib/hosting/connect.ts');
const { evaluate } = await import(REPO + '/lib/hosting/health.ts');
const FX = process.env.HELP_FX || path.join(REPO, 'tests/fixtures/whmcs-skin');
export const SITE = 'https://globalhostia.com';
const HP = REPO + '/public/hp';
const IP = '203.0.113.10', OURNS = ['ns1.globalhostia.com', 'ns2.globalhostia.com'];
const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

export function backend() {
  const st: any = {
    mail: [{ user: 'info', email: 'info@example.com', quotaMb: 2048, usedMb: 312 }, { user: 'sales', email: 'sales@example.com', quotaMb: 1024, usedMb: 88 }],
    files: {
      '/domains/example.com/public_html': [
        { name: 'assets', type: 'dir', size: 4096, modified: iso(-12) }, { name: 'index.html', type: 'file', size: 6120, modified: iso(-3) },
        { name: 'about.html', type: 'file', size: 4210, modified: iso(-3) }, { name: '.htaccess', type: 'file', size: 312, modified: iso(-40) }, { name: 'robots.txt', type: 'file', size: 68, modified: iso(-40) }],
      '/': [{ name: 'domains', type: 'dir', size: 4096, modified: iso(-200) }, { name: 'backups', type: 'dir', size: 4096, modified: iso(-3) }, { name: 'imap', type: 'dir', size: 4096, modified: iso(-200) }],
      '/domains': [{ name: 'example.com', type: 'dir', size: 4096, modified: iso(-200) }, { name: 'shop.example', type: 'dir', size: 4096, modified: iso(-90) }],
      '/domains/example.com': [{ name: 'public_html', type: 'dir', size: 4096, modified: iso(-3) }, { name: 'logs', type: 'dir', size: 4096, modified: iso(-1) }],
    },
    dbs: [{ name: 'examplec_site', users: ['examplec_site'], sizeMb: 18 }],
    php: { 'example.com': 'php81', 'shop.example': 'php83' },
    ssl: { 'example.com': true, 'shop.example': false },
    backups: [{ name: 'backup-Nov-01-2026-1.tar.zst', size: 412_000_000, created: iso(-3) }, { name: 'backup-Oct-25-2026-1.tar.zst', size: 405_000_000, created: iso(-10) }],
    connected: { 'example.com': true, 'shop.example': false }, connectChecks: 0,
    sites: [{ id: '26_11001', url: 'https://example.com', adminUrl: 'https://example.com/wp-admin/', domain: 'example.com', directory: '', version: '6.8.3', siteName: 'Example Co', created: iso(-120), staging: false, managed: true }],
    tasks: {} as Record<string, any>, connectAfter: 2,
  };
  const caps = { overview: ['usage'], dns: ['list', 'add', 'edit', 'delete'], email: ['list', 'create', 'delete', 'password', 'quota', 'forwarders'],
    files: ['list', 'read', 'write', 'upload', 'download', 'mkdir', 'rename', 'delete'], databases: ['list', 'create', 'delete', 'users', 'password'],
    php: ['get', 'set'], ssl: ['status', 'issue'], backups: ['list', 'create', 'restore'], subdomains: ['list', 'add'],
    wordpress: ['list', 'install', 'login', 'staging', 'push', 'delete', 'backup', 'upgrade'], health: ['check'], connect: ['check'] };
  const domains = ['example.com', 'shop.example'];
  const connFacts = (d: string) => { const on = st.connected[d]; return { domain: d, serverIp: IP, ourNs: OURNS, ns: on ? OURNS : ['ns1.other-dns.example', 'ns2.other-dns.example'], a: on ? [IP] : ['198.51.100.7'], www: on ? [IP] : [], https: { ok: on && st.ssl[d] } }; };
  const connect = (d: string) => {
    const f = connFacts(d); const s = connectSteps(f);
    return { domain: d, serverIp: IP, nameservers: OURNS, current: { ns: f.ns, a: f.a, www: f.www }, provider: detectProvider(f.ns), registrar: null, registrarProvider: null, ...s, checkedAt: new Date().toISOString() };
  };
  const health = (d: string) => evaluate({ domain: d, serverIp: IP, ourNs: OURNS, dns: { a: connFacts(d).a, aaaa: [], ns: connFacts(d).ns },
    web: { ok: true, status: 200, ms: 240, httpsRedirect: true, www: { ok: true, status: 200 } },
    ssl: st.ssl[d] ? { https: true, issuer: "Let's Encrypt", daysLeft: 71, names: [d, 'www.' + d] } : { https: false, error: 'No certificate' },
    mail: { mx: [{ exchange: 'mail.' + d, priority: 10, ips: [IP] }], spf: [`v=spf1 a mx ip4:${IP} ~all`], dkim: ['v=DKIM1; k=rsa; p=MIIB'], dmarc: [] },
    usage: [{ key: 'disk', label: 'Disk space', used: 2310, limit: 10240, unit: 'MB' }], checkedAt: new Date().toISOString() }, { dnsAdd: true, sslIssue: true, redirects: true });
  const task = (apply: () => void, kind: string) => { const key = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32); st.tasks[key] = { n: 0, apply, kind }; return key; };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    st,
    async handle(route: any) {
      const req = route.request(), u = new URL(req.url()), sec = u.pathname.split('/').pop()!;
      const hdr = { 'access-control-allow-origin': 'https://my.globalhostia.com', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
      const json = (o: any, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: hdr, body: JSON.stringify(o) });
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: hdr });
      const q = u.searchParams, d = q.get('domain') || 'example.com', op = q.get('op') || 'list';
      await wait(250);
      if (req.method() === 'GET') {
        switch (sec) {
          case 'session': return json({ panel: 'directadmin', panelLabel: 'DirectAdmin', username: 'examplec', domain: 'example.com', server: 'Globalhostia USA', caps, domains, limits: { editBytes: 1048576, transferBytes: 4194304 }, ai: false });
          case 'overview': return json({ items: [{ key: 'disk', label: 'Disk space', used: 2310, limit: 10240, unit: 'MB' }, { key: 'bandwidth', label: 'Bandwidth', used: 21000, limit: null, unit: 'MB' }, { key: 'email', label: 'Email accounts', used: st.mail.length, limit: null, unit: '' }, { key: 'databases', label: 'Databases', used: st.dbs.length, limit: null, unit: '' }], plan: 'Hostia Ultra', ip: IP });
          case 'email': return json(op === 'forwarders' ? { domain: d, forwarders: [] } : { domain: d, mailboxes: st.mail.filter((m: any) => m.email.endsWith('@' + d)) });
          case 'mailsetup': { const s = mailSettings(d, 'server1.example.net', q.get('user') ? `${q.get('user')}@${d}` : undefined); if (q.get('format') === 'mobileconfig') return route.fulfill({ status: 200, headers: { ...hdr, 'content-type': 'application/x-apple-aspen-config' }, body: '<plist/>' }); return json({ ...s, qrText: settingsText(s) }); }
          case 'files': { const p = q.get('path') || '/'; return json({ path: p, entries: (st.files[p] || []).map((e: any) => ({ ...e, path: (p === '/' ? '' : p) + '/' + e.name })) }); }
          case 'databases': return json({ prefix: 'examplec_', databases: st.dbs });
          case 'php': return json({ domain: d, current: st.php[d], options: [{ id: 'php74', label: 'PHP 7.4' }, { id: 'php81', label: 'PHP 8.1' }, { id: 'php82', label: 'PHP 8.2' }, { id: 'php83', label: 'PHP 8.3' }] });
          case 'ssl': return json({ canIssue: true, status: domains.map((x) => st.ssl[x] ? { domain: x, https: true, issuer: "Let's Encrypt", validTo: iso(71), daysLeft: 71, names: [x, 'www.' + x] } : { domain: x, https: false, error: 'No certificate installed' }) });
          case 'backups': return json({ canCreate: true, canRestore: true, backups: st.backups });
          case 'health': return json(q.get('all') === '1' ? { results: domains.map(health), more: 0 } : health(d));
          case 'connect': if (op === 'scan') return json({ serverIp: IP, domains: domains.filter((x) => !st.connected[x]).map((x) => ({ domain: x, connected: false, ns: connFacts(x).ns, a: connFacts(x).a })) });
            if (d === 'shop.example' && ++st.connectChecks > st.connectAfter) st.connected[d] = true;
            return json(connect(d));
          case 'dns': return json({ domain: d, records: [{ id: '1', type: 'A', name: '@', value: IP, ttl: 3600 }, { id: '2', type: 'CNAME', name: 'www', value: d + '.', ttl: 3600 }, { id: '3', type: 'MX', name: '@', value: 'mail.' + d + '.', priority: 10, ttl: 3600 }] });
          case 'subdomains': return json({ domain: d, subdomains: ['blog'] });
          case 'wordpress': {
            if (op === 'targets') return json({ targets: ['example.com', 'shop.example', 'blog.example.com'], languages: [['en', 'English'], ['ar', 'Arabic'], ['fr_FR', 'French']], email: 'owner@example.com' });
            if (op === 'task') { const t = st.tasks[q.get('key')!]; t.n++; if (t.n < 3) return json({ progress: t.n * 35, text: t.kind === 'staging' ? 'Copying files' : 'Working', done: false }); if (!t.applied) { t.applied = 1; t.apply(); } return json({ progress: 100, text: 'Staging Completed', done: true }); }
            return json({ sites: st.sites, caps: caps.wordpress });
          }
        }
        return json({ error: 'unsupported', message: 'Not available' }, 501);
      }
      let b: any = {};
      try { b = JSON.parse(req.postData() || '{}'); } catch { b = { op: 'upload' }; }
      if (/multipart/.test(req.headers()['content-type'] || '')) { const m = /filename="([^"]+)"/.exec(req.postData() || ''); const name = m ? m[1] : 'file'; const dir = '/domains/example.com/public_html'; await wait(900); st.files[dir].push({ name, type: 'file', size: 48211, modified: new Date().toISOString() }); return json({ ok: true, message: `${name} uploaded` }); }
      await wait(500);
      switch (sec) {
        case 'email': if (b.op === 'create') { st.mail.push({ user: b.user, email: `${b.user}@${b.domain}`, quotaMb: Number(b.quota) || 1024, usedMb: 0 }); return json({ ok: true, message: `${b.user}@${b.domain} created` }); } break;
        case 'databases': if (b.op === 'create') { st.dbs.push({ name: 'examplec_' + b.name, users: ['examplec_' + b.user], sizeMb: 0 }); return json({ ok: true, message: `Database examplec_${b.name} created` }); } break;
        case 'php': if (b.op === 'set') { st.php[b.domain] = b.id; return json({ ok: true, message: `${b.domain} now uses PHP ${b.id.replace('php', '').replace(/(\d)(\d)/, '$1.$2')}` }); } break;
        case 'ssl': if (b.op === 'issue') { await wait(1800); st.ssl[b.domain] = true; return json({ ok: true, message: `Certificate issued for ${b.domain}${b.www ? ' and www.' + b.domain : ''}` }); } break;
        case 'backups': if (b.op === 'restore') { await wait(1200); return json({ ok: true, message: `Restore of ${b.name} started. You get an email when it finishes.` }); }
          if (b.op === 'create') { await wait(1000); return json({ ok: true, message: 'Backup started. It appears in the list when it is ready.' }); } break;
        case 'wordpress': {
          if (b.op === 'install') { await wait(2500); const url = `https://${b.domain}${b.directory ? '/' + b.directory : ''}`; st.sites.push({ id: '26_12001', url, adminUrl: url + '/wp-admin/', domain: b.domain, directory: b.directory || '', version: '6.8.3', siteName: b.title, created: new Date().toISOString(), staging: false, managed: true }); return json({ ok: true, message: `WordPress is installed on ${b.domain}${b.directory ? '/' + b.directory : ''}.`, site: { url, adminUrl: url + '/wp-admin/' }, adminUser: b.adminUser, deliver: b.deliver, ...(b.deliver === 'show' ? { password: 'Demo-Only-Pass-0000' } : { emailedTo: b.adminEmail }) }); }
          if (b.op === 'staging') { const dom = b.mode === 'dir' ? 'example.com' : `${b.label}.example.com`, dir = b.mode === 'dir' ? b.directory : ''; return json({ ok: true, message: `Creating the staging copy on ${dom}${dir ? '/' + dir : ''}…`, task: task(() => st.sites.push({ id: '26_12002', url: `https://${dom}${dir ? '/' + dir : ''}`, domain: dom, directory: dir, version: '6.8.3', staging: true, parentId: b.id, managed: true }), 'staging') }); }
          if (b.op === 'login') return json({ ok: true, message: 'Opening WordPress admin', url: 'about:blank' });
          break;
        }
      }
      return json({ error: 'invalid', message: 'Not in this demo' }, 400);
    },
  };
}

/** WHMCS client area "Product details" page (fixture skin) with the panel script. */
export function clientArea(lang = 'en') {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manage hosting - Globalhostia</title>
<link rel="stylesheet" href="https://my.globalhostia.com/fx/bootstrap.min.css"><link rel="stylesheet" href="https://my.globalhostia.com/fx/theme-emul.css"><link rel="stylesheet" href="${SITE}/hp/whmcs.css?v=rec">
<script>window.GH_HOSTING={token:"t.t",sid:102};window.GH_LANG=${JSON.stringify(lang === 'ar' ? 'arabic' : 'english')};</script></head>
<body class="coodiv-clouds-theme"><header class="site-header"><div class="container-fluid"><nav class="navbar site-navbar px-0"><div class="brand-logo mr-3"><a href="#"><img src="https://my.globalhostia.com/img/logo-main-black.png" alt="Globalhostia" style="height:30px"></a></div><div class="header-btn ml-auto"><a class="btn btn-black client-login-header-btn" href="clientarea.php"><span>Demo Customer</span></a> <a href="logout.php" style="margin-left:12px">Logout</a></div></nav></div></header>
<section id="main-body"><div class="container"><div class="row"><div class="col-12 primary-content"><div class="card"><div class="card-body" style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h3 style="margin:0;font-size:18px">Hostia Ultra · example.com</h3><small style="color:#6b7785">Shared Hosting · Active · renews annually</small></div><a class="btn btn-default gh-console-btn" href="#">Login to DirectAdmin</a></div></div></div></div></div></section>
<script src="${SITE}/hp/whmcs.js?v=rec"></script></body></html>`;
}

export async function routes(ctx: any, be: any, lang = 'en') {
  await ctx.route('https://fonts.googleapis.com/**', (r: any) => r.abort());
  await ctx.route('https://fonts.gstatic.com/**', (r: any) => r.abort());
  await ctx.route(`${SITE}/api/hosting/**`, (r: any) => be.handle(r));
  await ctx.route(`${SITE}/hp/**`, (r: any) => {
    const f = path.join(HP, new URL(r.request().url()).pathname.replace(/^\/hp\//, ''));
    if (!f.startsWith(HP) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    const type = /\.css$/.test(f) ? 'text/css' : /\.js$/.test(f) ? 'application/javascript' : /\.svg$/.test(f) ? 'image/svg+xml' : /\.woff2$/.test(f) ? 'font/woff2' : 'application/octet-stream';
    return r.fulfill({ status: 200, contentType: type, headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
  });
  await ctx.route('https://my.globalhostia.com/**', (r: any) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/img/')) return r.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(REPO, 'public/image', u.pathname.slice(5))) });
    if (u.pathname.startsWith('/fx/')) return r.fulfill({ status: 200, contentType: 'text/css', body: fs.readFileSync(path.join(FX, u.pathname.slice(4))) });
    return r.fulfill({ contentType: 'text/html', body: clientArea(lang) });
  });
}
