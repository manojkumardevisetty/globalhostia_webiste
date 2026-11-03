// DirectAdmin adapter. Acts as the hosting account's user through DirectAdmin "login-as": HTTP Basic auth
// "<admin_or_reseller>|<user>:<login key>" (docs.directadmin.com/developer/api). Uses the legacy CMD_API_* commands
// (documented and present on DirectAdmin 1.7x alongside the newer /api/* JSON API) with json=yes where accepted;
// parsers accept both JSON and the legacy url-encoded format.
import 'server-only';
import { PanelError, type Account, type Redirect, type Backup, type Caps, type DnsRecord, type FileEntry, type HostingProvider, type Mailbox, type ServerConfig } from '../types';
import { fqdn, dnsName, type DnsInput } from '../validate';
import { attrs, daError, isHtml, parseDa, parseDaZone, toList } from './directadmin-parse';
import { call, fromId, idOf, readCapped } from './http';
import { daUsage, parseCron, parsePhp, parsePointers, parseRedirects, parseVacations, parseWpSites, parseProtected, spamFrom, ftpTypeFor } from './directadmin-parse';

/** Every DirectAdmin command this adapter can send; the Login Key's "Commands" list should allow exactly these. */
export const DA_COMMANDS = [
  'CMD_API_SHOW_USERS', // admin page connection test only (sent as the key owner, not login-as)
  'CMD_API_SHOW_DOMAINS', 'CMD_API_DNS_CONTROL', 'CMD_API_POP', 'CMD_API_EMAIL_FORWARDERS',
  'CMD_API_FILE_MANAGER', 'CMD_FILE_MANAGER', 'CMD_API_DATABASES', 'CMD_API_DB_USER', 'CMD_API_SSL', 'CMD_API_SITE_BACKUP',
  // second feature set (overview, domains, email extras, FTP, cron, protected folders)
  'CMD_API_SHOW_USER_USAGE', 'CMD_API_SHOW_USER_CONFIG', // overview: sent as the key owner with user=<account>
  'CMD_API_SUBDOMAINS', 'CMD_API_DOMAIN_POINTER', 'CMD_API_REDIRECT',
  'CMD_API_ADDITIONAL_DOMAINS', 'CMD_API_DOMAIN', // PHP version: read (action=view) / switch (action=php_selector only)
  'CMD_API_EMAIL_AUTORESPONDER', 'CMD_API_EMAIL_VACATION', 'CMD_API_SPAMASSASSIN',
  'CMD_API_FTP', 'CMD_API_CRON_JOBS',
] as const;
/** New JSON API endpoints used (DirectAdmin 1.6x+), read-only, as the account user. */
export const DA_JSON_ENDPOINTS = ['GET /api/web-protect/list', 'GET /api/wordpress/locations'] as const;
type Cmd = (typeof DA_COMMANDS)[number];

const BACKUP_SELECT = ['domain', 'subdomain', 'email', 'forwarder', 'autoresponder', 'vacation', 'list', 'emailsettings', 'ftp', 'ftpsettings', 'database'];

const auth = (s: ServerConfig, as?: string) => 'Basic ' + Buffer.from(`${s.apiUser}${as ? '|' + as : ''}:${s.secret}`).toString('base64');

interface Req { method?: 'GET' | 'POST'; query?: Record<string, string>; form?: Record<string, string> | FormData; json?: boolean }

async function send(s: ServerConfig, as: string | undefined, cmd: Cmd, r: Req = {}): Promise<Response> {
  const q = new URLSearchParams(r.query || {});
  if (r.json !== false && r.method !== 'POST') q.set('json', 'yes');
  const url = `${s.url}/${cmd}${q.size ? '?' + q : ''}`;
  const body = r.form instanceof FormData ? r.form : r.form ? new URLSearchParams(r.form) : undefined;
  const res = await call(url, { method: r.method || 'GET', body, headers: { authorization: auth(s, as), accept: 'application/json, text/plain, */*' } });
  if (res.status === 401 || res.status === 403) throw new PanelError('The hosting panel refused the API login (check the login key and its allowed commands).', 502);
  if (res.status >= 300 && res.status < 400) throw new PanelError('The hosting panel redirected the API call (login key rejected or wrong URL).', 502);
  if (res.status >= 500) throw new PanelError(`The hosting panel failed (HTTP ${res.status}).`, 502);
  return res;
}

/** New JSON API (/api/...), as the account user. Only the read-only endpoints in DA_JSON_ENDPOINTS are used. */
async function jsonApi(s: ServerConfig, as: string, path: '/api/web-protect/list' | '/api/wordpress/locations'): Promise<any> {
  const res = await call(`${s.url}${path}`, { headers: { authorization: auth(s, as), accept: 'application/json' }, timeout: 12_000 });
  if (res.status === 404) throw new PanelError('Not available on this server', 501);
  if (res.status === 401 || res.status === 403) throw new PanelError('The hosting panel refused this request.', 502);
  if (!res.ok) throw new PanelError(`The hosting panel failed (HTTP ${res.status}).`, 502);
  return res.json().catch(() => { throw new PanelError('Unreadable answer from the hosting panel', 502); });
}

async function api(s: ServerConfig, as: string | undefined, cmd: Cmd, r: Req = {}): Promise<Record<string, any>> {
  const res = await send(s, as, cmd, r);
  const text = await res.text();
  if (isHtml(text)) throw new PanelError('The hosting panel returned a web page instead of API data (login key rejected or command not allowed).', 502);
  const o = parseDa(text);
  const err = daError(o);
  if (err) throw new PanelError(err, 400);
  return o;
}

/** Admin page: verify URL + key by listing users as the key owner. */
export async function testDirectAdmin(s: ServerConfig) {
  const t0 = Date.now();
  const o = await api(s, undefined, 'CMD_API_SHOW_USERS');
  return { ms: Date.now() - t0, users: toList(o).length };
}

export const DA_CAPS: Caps = {
  dns: ['list', 'add', 'edit', 'delete'],
  email: ['list', 'create', 'delete', 'password', 'quota', 'forwarders'],
  files: ['list', 'read', 'write', 'upload', 'download', 'mkdir', 'rename', 'delete'],
  databases: ['list', 'create', 'delete', 'users', 'password'],
  ssl: ['status', 'issue'],
  backups: ['list', 'create', 'restore'],
  overview: ['usage'],
  subdomains: ['list', 'add', 'delete'],
  aliases: ['list', 'add', 'delete'],
  redirects: ['list', 'add', 'delete'],
  php: ['get', 'set'],
  autoresponders: ['list', 'create', 'delete', 'vacation'],
  spam: ['get', 'set'],
  ftp: ['list', 'create', 'delete', 'password'],
  cron: ['list', 'add', 'delete'],
  protect: ['list', 'add', 'delete'],
  wordpress: ['list'], // kept only when detect() finds DirectAdmin's WordPress manager
};

const MB = 1048576;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export function directAdmin(acct: Account): HostingProvider {
  const s = acct.server, u = acct.username;
  const A = (cmd: Cmd, r?: Req) => api(s, u, cmd, r);
  const strip = (n: string) => (n.startsWith(`${u}_`) ? n.slice(u.length + 1) : n);
  const post = (cmd: Cmd, form: Record<string, string> | FormData) => A(cmd, { method: 'POST', form });

  const recName = (r: DnsInput, zone: string) => (r.name === '@' ? `${zone}.` : r.name);
  const recValue = (r: DnsInput, zone: string) => {
    if (r.type === 'CNAME' || r.type === 'MX') return fqdn(r.value, zone);
    if (r.type === 'SRV') return `${r.priority} ${r.weight} ${r.port} ${fqdn(r.value, zone)}`;
    return r.value;
  };
  const addRec = (zone: string, r: DnsInput) => {
    const f: Record<string, string> = { action: 'add', domain: zone, type: r.type, name: recName(r, zone), ttl: String(r.ttl) };
    if (r.type === 'MX') { f.value = String(r.priority); f.mx_value = fqdn(r.value, zone); } // DA form: value = priority, mx_value = host
    else f.value = recValue(r, zone);
    return post('CMD_API_DNS_CONTROL', f);
  };

  const listFiles = async (dir: string): Promise<FileEntry[]> => {
    const o = await A('CMD_API_FILE_MANAGER', { query: { path: dir } });
    const out: FileEntry[] = [];
    for (const [k, v] of Object.entries(o)) {
      if (!k.startsWith('/')) continue;
      const a = attrs(v);
      const name = a.name || k.slice(k.lastIndexOf('/') + 1);
      if (!name || name === '.' || name === '..') continue;
      const t = String(a.type || '').toLowerCase();
      out.push({ name, path: (dir === '/' ? '' : dir) + '/' + name, type: a.islink === 'yes' || t === 'link' ? 'link' : t === 'folder' || t === 'dir' || t === 'directory' ? 'dir' : 'file',
        size: num(a.size), modified: a.date && /^\d+$/.test(a.date) ? new Date(num(a.date) * 1000).toISOString() : String(a.date || ''), perms: a.permission || undefined });
    }
    return out.sort((x, y) => (x.type === 'dir' ? 0 : 1) - (y.type === 'dir' ? 0 : 1) || x.name.localeCompare(y.name));
  };

  const P: HostingProvider = {
    panel: 'directadmin',
    caps: DA_CAPS,
    dbPrefix: async () => `${u}_`,
    domains: async () => toList(await A('CMD_API_SHOW_DOMAINS')).map((d) => d.toLowerCase()),

    dns: {
      async list(zone) {
        const res = await send(s, u, 'CMD_API_DNS_CONTROL', { query: { domain: zone } });
        const text = await res.text();
        if (isHtml(text)) throw new PanelError('Could not read the DNS zone.', 502);
        if (/^\s*error=1/.test(text)) throw new PanelError(daError(parseDa(text)) || 'Could not read the DNS zone.', 400);
        const out: DnsRecord[] = [];
        for (const r of parseDaZone(text, zone)) {
          if (!['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'].includes(r.type)) continue;
          let name: string; try { name = dnsName(r.name, zone); } catch { continue; }
          const rec: DnsRecord = { id: idOf({ t: r.type, n: r.name, v: r.value }), type: r.type as DnsRecord['type'], name, value: r.value, ttl: r.ttl || 3600 };
          if (r.type === 'MX') { const [p, ...h] = r.value.split(/\s+/); rec.priority = num(p); rec.value = h.join(' '); }
          if (r.type === 'SRV') { const [p, w, port, ...h] = r.value.split(/\s+/); rec.priority = num(p); rec.weight = num(w); rec.port = num(port); rec.value = h.join(' '); }
          if (r.type === 'TXT') rec.value = r.value.replace(/^"|"$/g, '').replace(/"\s+"/g, '');
          if (r.type === 'NS') rec.readonly = true;
          out.push(rec);
        }
        return out;
      },
      add: async (zone, r) => { await addRec(zone, r); },
      async edit(zone, old, r) {
        // add-then-delete so a failed add never leaves the name without a record
        await addRec(zone, r);
        await P.dns!.remove(zone, old);
      },
      async remove(zone, old) {
        const raw = fromId<{ t: string; n: string; v: string }>(old.id);
        if (!raw) throw new PanelError('Unknown record', 400);
        const f = new URLSearchParams({ action: 'select', delete: 'yes', domain: zone });
        f.set(`${raw.t.toLowerCase()}recs0`, new URLSearchParams({ name: raw.n, value: raw.v }).toString());
        await A('CMD_API_DNS_CONTROL', { method: 'POST', form: Object.fromEntries(f) });
      },
    },

    email: {
      async list(domain) {
        let o: Record<string, any>;
        try { o = await A('CMD_API_POP', { query: { action: 'full_list', domain } }); }
        catch { o = Object.fromEntries(toList(await A('CMD_API_POP', { query: { action: 'list', domain } })).map((x) => [x, ''])); }
        const out: Mailbox[] = [];
        for (const [user, v] of Object.entries(o)) {
          if (Array.isArray(v)) { v.forEach((x) => out.push({ user: String(x), email: `${x}@${domain}`, quotaMb: 0, usedMb: 0 })); continue; }
          if (['error', 'text', 'details'].includes(user)) continue;
          const a = attrs(v);
          const used = a.usage_bytes ? num(a.usage_bytes) / MB : num(a.usage);
          const q = num(a.quota); // DA reports quota in bytes in full_list (0 = unlimited); older builds in MB
          out.push({ user, email: `${user}@${domain}`, quotaMb: q > 100000 ? Math.round(q / MB) : q, usedMb: Math.round(used * 10) / 10, suspended: a.suspended === 'yes' });
        }
        return out.sort((x, y) => x.user.localeCompare(y.user));
      },
      create: async (domain, user, pass, quota) => { await post('CMD_API_POP', { action: 'create', domain, user, passwd: pass, passwd2: pass, quota: String(quota), limit: '0' }); },
      remove: async (domain, user) => { await post('CMD_API_POP', { action: 'delete', domain, user }); },
      password: async (domain, user, pass) => {
        const cur = (await P.email!.list(domain)).find((m) => m.user === user);
        await post('CMD_API_POP', { action: 'modify', domain, user, passwd: pass, passwd2: pass, quota: String(cur?.quotaMb ?? 0) });
      },
      quota: async (domain, user, quota) => { await post('CMD_API_POP', { action: 'modify', domain, user, quota: String(quota) }); },
      async forwarders(domain) {
        const o = await A('CMD_API_EMAIL_FORWARDERS', { query: { domain } });
        return Object.entries(o).filter(([k]) => !['error', 'text', 'details'].includes(k)).map(([user, v]) => ({
          user, email: `${user}@${domain}`, to: (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x: string) => x.trim()).filter(Boolean),
        }));
      },
      async addForwarder(domain, user, to) {
        const cur = (await P.email!.forwarders(domain)).find((f) => f.user === user);
        if (cur) { // DirectAdmin keeps one forwarder per name with a comma separated target list
          if (cur.to.includes(to)) return;
          await post('CMD_API_EMAIL_FORWARDERS', { action: 'modify', domain, user, email: [...cur.to, to].join(',') });
        } else await post('CMD_API_EMAIL_FORWARDERS', { action: 'create', domain, user, email: to });
      },
      async removeForwarder(domain, user, to) {
        const cur = (await P.email!.forwarders(domain)).find((f) => f.user === user);
        if (!cur) return;
        const rest = to ? cur.to.filter((x) => x !== to) : [];
        if (rest.length) await post('CMD_API_EMAIL_FORWARDERS', { action: 'modify', domain, user, email: rest.join(',') });
        else await post('CMD_API_EMAIL_FORWARDERS', { action: 'delete', domain, select0: user });
      },
    },

    files: {
      list: listFiles,
      async read(path, max) {
        // DirectAdmin recommends CMD_FILE_MANAGER (raw file data) over CMD_API_FILE_MANAGER for downloads
        const res = await send(s, u, 'CMD_FILE_MANAGER', { query: { path }, json: false });
        const ct = res.headers.get('content-type') || '';
        if (res.status !== 200) throw new PanelError('Could not read the file', 400);
        const data = await readCapped(res, max);
        if (/text\/html/.test(ct) && !/\.html?$/i.test(path) && isHtml(new TextDecoder().decode(data.slice(0, 200)))) throw new PanelError('Could not read the file', 400);
        return data;
      },
      async write(path, text) {
        const i = path.lastIndexOf('/');
        // documented: POST with no GET values; action=edit, path (folder), filename, text
        await post('CMD_API_FILE_MANAGER', { action: 'edit', path: i <= 0 ? '/' : path.slice(0, i), filename: path.slice(i + 1), text });
      },
      async upload(dir, name, data) {
        const fd = new FormData();
        fd.set('action', 'upload'); fd.set('path', dir);
        fd.set('file1', new Blob([data as BlobPart]), name);
        await post('CMD_API_FILE_MANAGER', fd);
      },
      mkdir: async (dir, name) => { await post('CMD_API_FILE_MANAGER', { action: 'folder', path: dir, name }); },
      rename: async (dir, from, to) => { await post('CMD_API_FILE_MANAGER', { action: 'rename', path: dir, old: from, filename: to, overwrite: 'no' }); },
      async remove(dir, names) {
        const f: Record<string, string> = { action: 'multiple', button: 'delete', path: dir };
        names.forEach((n, i) => (f[`select${i}`] = (dir === '/' ? '' : dir) + '/' + n));
        await post('CMD_API_FILE_MANAGER', f);
      },
    },

    databases: {
      async list() {
        const names = toList(await A('CMD_API_DATABASES'));
        return Promise.all(names.map(async (name) => ({ name, users: await A('CMD_API_DB_USER', { query: { name } }).then(toList).catch(() => []) })));
      },
      // the interface passes full names ("bob_shop"); DirectAdmin's create forms take the part after "<user>_"
      create: async (name, user, pass) => { await post('CMD_API_DATABASES', { action: 'create', name: strip(name), user: strip(user), passwd: pass, passwd2: pass }); },
      remove: async (name) => { await post('CMD_API_DATABASES', { action: 'delete', select0: name }); },
      addUser: async (db, user, pass) => { await post('CMD_API_DB_USER', { action: 'create', name: db, user: strip(user), passwd: pass, passwd2: pass }); },
      removeUser: async (db, user) => { await post('CMD_API_DB_USER', { action: 'delete', name: db, select0: user }); },
      password: async (db, user, pass) => { await post('CMD_API_DB_USER', { action: 'modify', name: db, user, passwd: pass, passwd2: pass }); },
    },

    ssl: {
      async issue(domain, withWww) {
        const f: Record<string, string> = { domain, action: 'save', type: 'create', request: 'letsencrypt', name: domain, keysize: 'secp384r1', encryption: 'sha256', le_select0: domain, submit: 'save' };
        if (withWww) f.le_select1 = `www.${domain}`;
        const o = await post('CMD_API_SSL', f);
        return String(o.text || o.details || 'Certificate requested. It is usually active within a few minutes.').replace(/<[^>]+>/g, ' ').trim().slice(0, 300);
      },
    },

    backups: {
      async list(): Promise<Backup[]> {
        const files = await listFiles('/backups').catch(() => [] as FileEntry[]);
        return files.filter((f) => f.type === 'file' && /\.tar(\.gz|\.zst)?$/i.test(f.name)).map((f) => ({ name: f.name, size: f.size, created: f.modified }))
          .sort((a, b) => String(b.created).localeCompare(String(a.created)));
      },
      async create() {
        const f: Record<string, string> = { action: 'backup', form_version: '4' };
        BACKUP_SELECT.forEach((x, i) => (f[`select${i}`] = x));
        const o = await post('CMD_API_SITE_BACKUP', f);
        return String(o.text || 'Backup started. It appears in the list when finished; you will also get a message in DirectAdmin.').trim().slice(0, 300);
      },
      async restore(name) {
        const f: Record<string, string> = { action: 'restore', file: name, form_version: '3' };
        BACKUP_SELECT.forEach((x, i) => (f[`select${i}`] = x));
        const o = await post('CMD_API_SITE_BACKUP', f);
        return String(o.text || 'Restore started. It can take several minutes.').trim().slice(0, 300);
      },
    },
  };
  const NOT_META = (k: string) => !['error', 'text', 'details', 'success'].includes(k);
  const home = `/home/${u}`;

  P.usage = async () => {
    const [use, conf] = await Promise.all([api(s, undefined, 'CMD_API_SHOW_USER_USAGE', { query: { user: u } }), api(s, undefined, 'CMD_API_SHOW_USER_CONFIG', { query: { user: u } })]);
    return daUsage(use, conf);
  };

  P.detect = async () => {
    const drop: Caps = {};
    const wp = await jsonApi(s, u, '/api/wordpress/locations').then(() => true, () => false);
    if (!wp) drop.wordpress = [];
    return drop;
  };

  P.subdomains = {
    list: async (domain) => toList(await A('CMD_API_SUBDOMAINS', { query: { domain } })).map((x) => x.toLowerCase()).sort(),
    add: async (domain, label) => { await post('CMD_API_SUBDOMAINS', { action: 'create', domain, subdomain: label }); },
    remove: async (domain, label, contents) => { await post('CMD_API_SUBDOMAINS', { action: 'delete', domain, select0: label, contents: contents ? 'yes' : 'no' }); },
  };

  P.aliases = {
    list: async (domain) => parsePointers(await A('CMD_API_DOMAIN_POINTER', { query: { domain } })),
    add: async (domain, from, alias) => { await post('CMD_API_DOMAIN_POINTER', { action: 'add', domain, from, alias: alias ? 'yes' : 'no' }); },
    remove: async (domain, name) => { await post('CMD_API_DOMAIN_POINTER', { action: 'delete', delete: 'yes', domain, select0: name }); },
  };

  P.redirects = {
    list: async (domain) => parseRedirects(await A('CMD_API_REDIRECT', { query: { domain } })),
    add: async (domain, path, to, type) => { await post('CMD_API_REDIRECT', { action: 'add', domain, path, url: to, type }); },
    remove: async (domain, r: Redirect) => { await post('CMD_API_REDIRECT', { action: 'delete', domain, select0: r.path }); },
  };

  P.php = {
    get: async (domain) => parsePhp(await A('CMD_API_ADDITIONAL_DOMAINS', { query: { action: 'view', domain } })),
    set: async (domain, id) => { await post('CMD_API_DOMAIN', { action: 'php_selector', domain, php1_select: id, save: 'Save' }); },
  };

  P.autoresponders = {
    async list(domain) {
      const o = await A('CMD_API_EMAIL_AUTORESPONDER', { query: { domain } });
      return Object.entries(o).filter(([k]) => NOT_META(k)).map(([user, cc]) => ({ user, email: `${user}@${domain}`, cc: typeof cc === 'string' ? cc : '' }));
    },
    create: async (domain, user, text, cc) => { await post('CMD_API_EMAIL_AUTORESPONDER', { action: 'create', domain, user, text, cc: cc ? 'ON' : 'OFF', ...(cc ? { email: cc } : {}), create: 'Create' }); },
    remove: async (domain, user) => { await post('CMD_API_EMAIL_AUTORESPONDER', { action: 'delete', domain, select0: user }); },
    vacations: async (domain) => parseVacations(await A('CMD_API_EMAIL_VACATION', { query: { domain } }), domain),
    async setVacation(domain, user, text, a, b) {
      const exists = (await P.autoresponders!.vacations!(domain)).some((v) => v.user === user);
      await post('CMD_API_EMAIL_VACATION', {
        action: exists ? 'modify' : 'create', domain, user, text,
        starttime: 'morning', startday: String(a.d), startmonth: String(a.m), startyear: String(a.y),
        endtime: 'evening', endday: String(b.d), endmonth: String(b.m), endyear: String(b.y), ...(exists ? {} : { create: 'Create' }),
      });
    },
    removeVacation: async (domain, user) => { await post('CMD_API_EMAIL_VACATION', { action: 'delete', domain, select0: user }); },
  };

  P.spam = {
    async get(domain) {
      try { return spamFrom(await A('CMD_API_SPAMASSASSIN', { query: { domain } })); }
      catch (e) { if (e instanceof PanelError && e.status === 400) return { available: false, enabled: false, threshold: 5, where: 'inbox', highScore: 15, highScoreBlock: false }; throw e; }
    },
    async set(domain, v) {
      if (!v.enabled) { await post('CMD_API_SPAMASSASSIN', { action: 'disable', domain }); return; }
      await post('CMD_API_SPAMASSASSIN', { action: 'save', domain, is_on: 'yes', required_hits: String(v.threshold), where: v.where, high_score: String(v.highScore), high_score_block: v.highScoreBlock ? 'yes' : 'no', report_safe: '1', rewrite_subject: '1', subject_tag: '*****SPAM*****' });
    },
  };

  P.ftp = {
    async list(domain) {
      const o = await A('CMD_API_FTP', { query: { domain } });
      return Object.entries(o).filter(([k]) => NOT_META(k)).map(([user, v]) => {
        const a = typeof v === 'object' ? attrs(v) : null;
        const path = String(a ? a.path || a.directory || '' : v ?? '');
        const name = user.includes('@') ? user.split('@')[0] : user;
        return { user: name, login: user.includes('@') ? user : `${user}@${domain}`, path: path.startsWith(home) ? path.slice(home.length) || '/' : path };
      }).sort((x, y) => x.user.localeCompare(y.user));
    },
    async create(domain, user, pass, dir) {
      const f: Record<string, string> = { action: 'create', domain, user, passwd: pass, passwd2: pass, type: dir === '@ftp' ? 'ftp' : dir === '@domain' ? 'domain' : 'custom' };
      if (f.type === 'custom') f.custom_val = dir === '/' ? home : home + dir;
      await post('CMD_API_FTP', f);
    },
    async password(domain, user, pass) {
      const acct = (await P.ftp!.list(domain)).find((x) => x.user === user);
      if (!acct) throw new PanelError('Unknown FTP account', 400);
      const t = ftpTypeFor(acct.path, domain);
      await post('CMD_API_FTP', { action: 'modify', domain, user, passwd: pass, passwd2: pass, type: t, ...(t === 'custom' ? { custom_val: home + (acct.path === '/' ? '' : acct.path) } : {}) });
    },
    remove: async (domain, user) => { await post('CMD_API_FTP', { action: 'delete', domain, select0: user }); },
  };

  P.cron = {
    list: async () => parseCron(await A('CMD_API_CRON_JOBS')),
    add: async (j) => { await post('CMD_API_CRON_JOBS', { action: 'create', minute: j.minute, hour: j.hour, dayofmonth: j.dayofmonth, month: j.month, dayofweek: j.dayofweek, command: j.command }); },
    remove: async (id) => { await post('CMD_API_CRON_JOBS', { action: 'delete', select0: id }); },
  };

  P.protect = {
    list: async () => parseProtected(await jsonApi(s, u, '/api/web-protect/list'), home),
    add: async (path, realm, user, pass) => { await post('CMD_API_FILE_MANAGER', { action: 'protect', path, enabled: 'yes', name: realm, user, passwd: pass, passwd2: pass }); },
    // DirectAdmin: posting the protect form without "enabled" switches protection off
    remove: async (path) => { await post('CMD_API_FILE_MANAGER', { action: 'protect', path, name: 'Protected' }); },
  };

  P.wordpress = { list: async () => { const j = await jsonApi(s, u, '/api/wordpress/locations'); const a = Array.isArray(j) ? j : j?.locations || j?.data || []; if (a[0]) console.log('[hosting] wp keys', JSON.stringify(Object.keys(a[0])), a[0]?.wordpress ? JSON.stringify(Object.keys(a[0].wordpress)) : ''); return parseWpSites(j); } };

  return P;
}
