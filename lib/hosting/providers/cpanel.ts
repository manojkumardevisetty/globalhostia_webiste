// cPanel adapter (UNVERIFIED against a live server: no cPanel server is connected yet).
// Calls cPanel UAPI (and API 2 for Fileman mkdir/fileop) *as the account user* through WHM's documented passthrough:
//   GET https://<host>:2087/json-api/cpanel?cpanel_jsonapi_user=<user>&cpanel_jsonapi_apiversion=3
//       &cpanel_jsonapi_module=<Module>&cpanel_jsonapi_func=<function>&<args>
//   Authorization: whm <whm_user>:<API token>
// (api.docs.cpanel.net "Use WHM API to call cPanel API"). The WHM token needs the ACL to list accounts and to
// call cPanel API as users (root, or a reseller that owns the accounts).
import 'server-only';
import { PanelError, type Account, type Caps, type DnsRecord, type FileEntry, type HostingProvider, type ServerConfig } from '../types';
import { dnsName, fqdn, type DnsInput } from '../validate';
import { call, idOf, fromId } from './http';

export const CPANEL_CAPS: Caps = {
  dns: ['list', 'add', 'edit', 'delete'],
  email: ['list', 'create', 'delete', 'password', 'quota', 'forwarders'],
  files: ['list', 'read', 'write', 'mkdir', 'rename', 'delete'], // no binary upload/download through the WHM passthrough
  databases: ['list', 'create', 'delete', 'users', 'password'],
  ssl: ['status', 'issue'], // issue = run AutoSSL for the account
  backups: ['list', 'create'], // full restore is a WHM/root operation, not offered to customers here
  overview: ['usage'],
  subdomains: ['list', 'add', 'delete'],
  redirects: ['list', 'add', 'delete'],
  php: ['get', 'set'],
  autoresponders: ['list', 'create', 'delete'],
  ftp: ['list', 'create', 'delete', 'password'],
  cron: ['list', 'add', 'delete'],
};

const hdr = (s: ServerConfig) => ({ authorization: `whm ${s.apiUser}:${s.secret}`, accept: 'application/json' });

async function whm(s: ServerConfig, fn: string, args: Record<string, string> = {}) {
  const q = new URLSearchParams({ 'api.version': '1', ...args });
  const res = await call(`${s.url}/json-api/${fn}?${q}`, { headers: hdr(s) });
  if (res.status === 401 || res.status === 403) throw new PanelError('WHM refused the API token.', 502);
  const j: any = await res.json().catch(() => { throw new PanelError('WHM returned an unreadable answer.', 502); });
  if (j?.metadata?.result !== 1) throw new PanelError(String(j?.metadata?.reason || 'WHM API error').slice(0, 300), 502);
  return j.data;
}

/** Admin page connection test (WHM API 1 version). */
export async function testCpanel(s: ServerConfig) {
  const t0 = Date.now();
  const d = await whm(s, 'version');
  return { ms: Date.now() - t0, version: String(d?.version || '') };
}

export function cpanel(acct: Account): HostingProvider {
  const s = acct.server, u = acct.username;
  async function uapi(mod: string, fn: string, args: Record<string, string | string[]> = {}): Promise<any> {
    const q = new URLSearchParams({ cpanel_jsonapi_user: u, cpanel_jsonapi_apiversion: '3', cpanel_jsonapi_module: mod, cpanel_jsonapi_func: fn });
    for (const [k, v] of Object.entries(args)) (Array.isArray(v) ? v : [v]).forEach((x) => q.append(k, x));
    const res = await call(`${s.url}/json-api/cpanel`, { method: 'POST', body: q, headers: { ...hdr(s), 'content-type': 'application/x-www-form-urlencoded' } });
    if (res.status === 401 || res.status === 403) throw new PanelError('cPanel refused the API token.', 502);
    const j: any = await res.json().catch(() => { throw new PanelError('cPanel returned an unreadable answer.', 502); });
    const r = j?.result ?? j;
    if (!r || r.status === 0 || r.status === '0') throw new PanelError(String((r?.errors || [])[0] || j?.error || 'cPanel API error').slice(0, 300), 400);
    return r.data;
  }
  async function api2(mod: string, fn: string, args: Record<string, string>): Promise<any> {
    const q = new URLSearchParams({ cpanel_jsonapi_user: u, cpanel_jsonapi_apiversion: '2', cpanel_jsonapi_module: mod, cpanel_jsonapi_func: fn, ...args });
    const res = await call(`${s.url}/json-api/cpanel`, { method: 'POST', body: q, headers: { ...hdr(s), 'content-type': 'application/x-www-form-urlencoded' } });
    const j: any = await res.json().catch(() => ({}));
    const r = j?.cpanelresult;
    if (!r || r.error || r.event?.result === 0) throw new PanelError(String(r?.error || 'cPanel API error').slice(0, 300), 400);
    return r.data;
  }
  const home = `/home/${u}`;
  const absDir = (dir: string) => (dir === '/' ? home : home + dir);
  const unb64 = (x: unknown) => Buffer.from(String(x ?? ''), 'base64').toString('utf8');

  async function zone(domain: string) {
    const rows: any[] = await uapi('DNS', 'parse_zone', { zone: domain });
    const soa = rows.find((r) => r.record_type === 'SOA');
    const serial = soa ? unb64(soa.data_b64?.[2]) : '';
    return { rows, serial };
  }
  const toCp = (r: DnsInput, zoneName: string) => {
    const dname = r.name === '@' ? `${zoneName}.` : r.name;
    const data = r.type === 'MX' ? [String(r.priority), fqdn(r.value, zoneName)]
      : r.type === 'SRV' ? [String(r.priority), String(r.weight), String(r.port), fqdn(r.value, zoneName)]
      : r.type === 'CNAME' ? [fqdn(r.value, zoneName)] : [r.value];
    return { dname, ttl: r.ttl, record_type: r.type, data };
  };

  const P: HostingProvider = {
    panel: 'cpanel',
    caps: CPANEL_CAPS,
    async dbPrefix() { const r = await uapi('Mysql', 'get_restrictions'); return String(r?.prefix || `${u}_`); },
    async domains() {
      const d = await uapi('DomainInfo', 'list_domains');
      return [d.main_domain, ...(d.addon_domains || []), ...(d.sub_domains || []), ...(d.parked_domains || [])].filter(Boolean).map((x: string) => x.toLowerCase());
    },
    dns: {
      async list(domain) {
        const { rows } = await zone(domain);
        const out: DnsRecord[] = [];
        for (const r of rows) {
          if (r.type !== 'record' || !['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'].includes(r.record_type)) continue;
          const data: string[] = (r.data_b64 || []).map(unb64);
          let name: string; try { name = dnsName(unb64(r.dname_b64), domain); } catch { continue; }
          const rec: DnsRecord = { id: idOf({ l: r.line_index }), type: r.record_type, name, value: data.join(' '), ttl: Number(r.ttl) || 3600 };
          if (r.record_type === 'MX') { rec.priority = Number(data[0]); rec.value = data[1]; }
          if (r.record_type === 'SRV') { rec.priority = Number(data[0]); rec.weight = Number(data[1]); rec.port = Number(data[2]); rec.value = data[3]; }
          if (r.record_type === 'TXT') rec.value = data.join('');
          if (r.record_type === 'NS') rec.readonly = true;
          out.push(rec);
        }
        return out;
      },
      async add(domain, r) { const { serial } = await zone(domain); await uapi('DNS', 'mass_edit_zone', { zone: domain, serial, add: JSON.stringify(toCp(r, domain)) }); },
      async edit(domain, old, r) {
        const l = fromId<{ l: number }>(old.id)?.l; if (l === undefined) throw new PanelError('Unknown record', 400);
        const { serial } = await zone(domain);
        await uapi('DNS', 'mass_edit_zone', { zone: domain, serial, edit: JSON.stringify({ line_index: l, ...toCp(r, domain) }) });
      },
      async remove(domain, old) {
        const l = fromId<{ l: number }>(old.id)?.l; if (l === undefined) throw new PanelError('Unknown record', 400);
        const { serial } = await zone(domain);
        await uapi('DNS', 'mass_edit_zone', { zone: domain, serial, remove: String(l) });
      },
    },
    email: {
      async list(domain) {
        const rows: any[] = await uapi('Email', 'list_pops_with_disk', { domain });
        return rows.filter((r) => String(r.domain).toLowerCase() === domain).map((r) => ({
          user: String(r.user), email: String(r.email), quotaMb: Number(r.diskquota) > 0 ? Number(r.diskquota) : 0, usedMb: Math.round(Number(r.diskused || 0) * 10) / 10, suspended: !!Number(r.suspended_login),
        }));
      },
      create: async (domain, user, pass, quota) => { await uapi('Email', 'add_pop', { domain, email: user, password: pass, quota: String(quota) }); },
      remove: async (domain, user) => { await uapi('Email', 'delete_pop', { domain, email: user }); },
      password: async (domain, user, pass) => { await uapi('Email', 'passwd_pop', { domain, email: user, password: pass }); },
      quota: async (domain, user, quota) => { await uapi('Email', 'edit_pop_quota', { domain, email: user, quota: String(quota) }); },
      async forwarders(domain) {
        const rows: any[] = await uapi('Email', 'list_forwarders', { domain });
        const by = new Map<string, string[]>();
        for (const r of rows) { const from = String(r.dest || '').toLowerCase(); if (!from.endsWith('@' + domain)) continue; by.set(from, [...(by.get(from) || []), String(r.forward)]); }
        return [...by].map(([email, to]) => ({ user: email.split('@')[0], email, to }));
      },
      addForwarder: async (domain, user, to) => { await uapi('Email', 'add_forwarder', { domain, email: `${user}@${domain}`, fwdopt: 'fwd', fwdemail: to }); },
      async removeForwarder(domain, user, to) {
        const f = (await P.email!.forwarders(domain)).find((x) => x.user === user);
        for (const t of to ? [to] : f?.to || []) await uapi('Email', 'delete_forwarder', { address: `${user}@${domain}`, forwarder: t });
      },
    },
    files: {
      async list(dir) {
        const rows: any[] = await uapi('Fileman', 'list_files', { dir: absDir(dir), include_mime: '0', include_permissions: '1' });
        return rows.map((r): FileEntry => ({ name: String(r.file), path: (dir === '/' ? '' : dir) + '/' + r.file, type: r.type === 'dir' ? 'dir' : r.type === 'link' ? 'link' : 'file',
          size: Number(r.size) || 0, modified: r.mtime ? new Date(Number(r.mtime) * 1000).toISOString() : '', perms: r.nicemode || undefined }))
          .sort((x, y) => (x.type === 'dir' ? 0 : 1) - (y.type === 'dir' ? 0 : 1) || x.name.localeCompare(y.name));
      },
      async read(path, max) {
        const i = path.lastIndexOf('/');
        const r = await uapi('Fileman', 'get_file_content', { dir: absDir(i <= 0 ? '/' : path.slice(0, i)), file: path.slice(i + 1) });
        const buf = Buffer.from(String(r?.content ?? ''), 'utf8');
        if (buf.byteLength > max) throw new PanelError('File is too large to open here', 413);
        return new Uint8Array(buf);
      },
      async write(path, text) {
        const i = path.lastIndexOf('/');
        await uapi('Fileman', 'save_file_content', { dir: absDir(i <= 0 ? '/' : path.slice(0, i)), file: path.slice(i + 1), content: text, fallback: '1' });
      },
      mkdir: async (dir, name) => { await api2('Fileman', 'mkdir', { path: absDir(dir), name }); },
      rename: async (dir, from, to) => { await api2('Fileman', 'fileop', { op: 'rename', sourcefiles: `${absDir(dir)}/${from}`, destfiles: `${absDir(dir)}/${to}`, doubledecode: '0' }); },
      remove: async (dir, names) => { await api2('Fileman', 'fileop', { op: 'unlink', sourcefiles: names.map((n) => `${absDir(dir)}/${n}`).join(','), doubledecode: '0' }); },
    },
    databases: {
      async list() { const rows: any[] = await uapi('Mysql', 'list_databases'); return rows.map((r) => ({ name: String(r.database), users: (r.users || []).map(String), sizeMb: r.disk_usage ? Math.round(Number(r.disk_usage) / 1048576) : undefined })); },
      async create(name, user, pass) {
        await uapi('Mysql', 'create_database', { name });
        await P.databases!.addUser(name, user, pass);
      },
      remove: async (name) => { await uapi('Mysql', 'delete_database', { name }); },
      async addUser(db, user, pass) {
        const users: any[] = await uapi('Mysql', 'list_users');
        if (!users.some((x) => x.user === user)) await uapi('Mysql', 'create_user', { name: user, password: pass });
        await uapi('Mysql', 'set_privileges_on_database', { user, database: db, privileges: 'ALL PRIVILEGES' });
      },
      removeUser: async (db, user) => { await uapi('Mysql', 'revoke_access_to_database', { user, database: db }); },
      password: async (_db, user, pass) => { await uapi('Mysql', 'set_password', { user, password: pass }); },
    },
    ssl: {
      async issue() { await uapi('SSL', 'start_autossl_check'); return 'AutoSSL check started. Certificates usually appear within a few minutes.'; },
    },
    backups: {
      async list() {
        const files = await P.files!.list('/').catch(() => [] as FileEntry[]);
        return files.filter((f) => f.type === 'file' && /^backup-.*\.tar\.gz$/i.test(f.name)).map((f) => ({ name: f.name, size: f.size, created: f.modified }));
      },
      async create() { await uapi('Backup', 'fullbackup_to_homedir'); return 'Full backup started. The archive appears in your home folder when it is ready.'; },
    },
  };
  const MBy = 1048576;
  P.usage = async () => {
    const rows: any[] = await uapi('ResourceUsage', 'get_usages');
    const MAP: Record<string, [string, string, 'MB' | '']> = {
      disk_usage: ['quota', 'Disk space', 'MB'], bandwidth: ['bandwidth', 'Bandwidth (this month)', 'MB'], filesusage: ['inode', 'Files and folders (inodes)', ''],
      addon_domains: ['vdomains', 'Addon domains', ''], subdomains: ['nsubdomains', 'Subdomains', ''], parked_domains: ['domainptr', 'Domain aliases', ''],
      email_accounts: ['nemails', 'Email accounts', ''], email_forwarders: ['nemailf', 'Email forwarders', ''], mysql_databases: ['mysql', 'Databases', ''], ftp_accounts: ['ftp', 'FTP accounts', ''],
    };
    const items = rows.filter((r) => MAP[r.id]).map((r) => {
      const [key, label, unit] = MAP[r.id];
      const conv = (v: any) => (v === null || v === undefined || v === '' ? null : unit === 'MB' ? Math.round((Number(v) / MBy) * 10) / 10 : Number(v));
      return { key, label, unit, used: conv(r.usage) ?? 0, limit: conv(r.maximum) };
    });
    return { items };
  };
  P.subdomains = {
    async list(domain) { const d = await uapi('DomainInfo', 'list_domains'); return (d.sub_domains || []).map((x: string) => x.toLowerCase()).filter((x: string) => x.endsWith('.' + domain)).map((x: string) => x.slice(0, -(domain.length + 1))).sort(); },
    add: async (domain, label) => { await uapi('SubDomain', 'addsubdomain', { domain: label, rootdomain: domain, dir: `public_html/${label}` }); },
    remove: async (domain, label) => { await api2('SubDomain', 'delsubdomain', { domain: `${label}.${domain}` }); },
  };
  P.redirects = {
    async list(domain) {
      const rows: any[] = await uapi('Mime', 'list_redirects', { domain });
      return rows.filter((r) => String(r.domain).toLowerCase() === domain || r.domain === '.*').map((r) => ({ path: String(r.sourceurl || '/'), to: String(r.destination || ''), type: /temp/i.test(String(r.type)) ? '302' : '301' }));
    },
    add: async (domain, path, to, type) => { await uapi('Mime', 'add_redirect', { domain, src: path, redirect: to, type: type === '301' ? 'permanent' : 'temp', redirect_wildcard: '0', redirect_www: '0' }); },
    remove: async (domain, r) => { await uapi('Mime', 'delete_redirect', { domain, src: r.path }); },
  };
  P.php = {
    async get(domain) {
      const [vh, inst]: [any[], any] = await Promise.all([uapi('LangPHP', 'php_get_vhost_versions'), uapi('LangPHP', 'php_get_installed_versions')]);
      const cur = vh.find((v) => String(v.vhost).toLowerCase() === domain);
      const versions: string[] = inst?.versions || [];
      return { current: String(cur?.version || ''), options: versions.map((v) => ({ id: v, label: v.replace(/^ea-php(\d)(\d+)$/, 'PHP $1.$2') })) };
    },
    set: async (domain, id) => { await uapi('LangPHP', 'php_set_vhost_versions', { vhost: domain, version: id }); },
  };
  P.autoresponders = {
    async list(domain) { const rows: any[] = await uapi('Email', 'list_auto_responders', { domain }); return rows.map((r) => ({ user: String(r.email).split('@')[0], email: String(r.email), cc: '' })); },
    create: async (domain, user, text) => { await uapi('Email', 'add_auto_responder', { email: user, domain, from: `${user}@${domain}`, subject: 'Auto reply', body: text, is_html: '0', interval: '8', start: '0', stop: '0' }); },
    remove: async (domain, user) => { await uapi('Email', 'delete_auto_responder', { email: `${user}@${domain}` }); },
  };
  P.ftp = {
    async list(domain) {
      const rows: any[] = await uapi('Ftp', 'list_ftp_with_disk');
      return rows.filter((r) => r.type === 'sub' && String(r.login || r.user).toLowerCase().endsWith('@' + domain)).map((r) => ({
        user: String(r.login || r.user).split('@')[0], login: String(r.login || r.user), path: String(r.dir || '').startsWith(home) ? String(r.dir).slice(home.length) || '/' : String(r.dir || ''),
      }));
    },
    async create(domain, user, pass, dir) {
      const hd = dir === '@domain' ? 'public_html' : dir === '@ftp' ? `public_ftp/${user}` : dir.replace(/^\//, '');
      await uapi('Ftp', 'add_ftp', { user, domain, pass, homedir: hd });
    },
    password: async (domain, user, pass) => { await uapi('Ftp', 'passwd', { user, domain, pass }); },
    remove: async (domain, user) => { await uapi('Ftp', 'delete_ftp', { user, domain, destroy: '0' }); },
  };
  P.cron = {
    async list() {
      const rows: any[] = await api2('Cron', 'listcron', {});
      return (rows || []).filter((r) => r.linekey && r.command).map((r) => ({ id: String(r.linekey), minute: String(r.minute), hour: String(r.hour), dayofmonth: String(r.day), month: String(r.month), dayofweek: String(r.weekday), command: String(r.command) }));
    },
    add: async (j) => { await api2('Cron', 'add_line', { minute: j.minute, hour: j.hour, day: j.dayofmonth, month: j.month, weekday: j.dayofweek, command: j.command }); },
    remove: async (id) => { await api2('Cron', 'remove_line', { linekey: id }); },
  };
  return P;
}
