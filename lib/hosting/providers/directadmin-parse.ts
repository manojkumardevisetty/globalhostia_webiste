// Pure parsers for DirectAdmin responses (legacy url-encoded, json=yes, and raw zone text). Unit-tested.

/** Parse a CMD_API_* body: JSON (json=yes) or url-encoded key=value&list[]=… */
export function parseDa(text: string): Record<string, any> {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) { try { const j = JSON.parse(t); return Array.isArray(j) ? { list: j } : j; } catch { /* fall through */ } }
  const out: Record<string, any> = {};
  const sp = new URLSearchParams(t);
  for (const [k, v] of sp) {
    if (k.endsWith('[]')) (out[k.slice(0, -2)] ||= []).push(v);
    else out[k] = v;
  }
  return out;
}

export const isHtml = (text: string) => /^\s*<(!doctype|html|head|body)/i.test(text);

/** DA error convention: error=1 + text/details. */
export function daError(o: Record<string, any>): string | null {
  const e = o?.error;
  if (e === undefined || e === 0 || e === '0' || e === false) return null;
  const msg = [o.text, o.details, o.result].filter((x) => typeof x === 'string' && x.trim()).join(': ');
  return (msg || (typeof e === 'string' && e !== '1' ? e : 'The hosting panel reported an error')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** A list from any of: {list:[…]}, […], {0:'a',1:'b'}, {a:'',b:''} (legacy keys-as-items). */
export function toList(o: any): string[] {
  if (Array.isArray(o)) return o.map(String);
  if (!o || typeof o !== 'object') return [];
  if (Array.isArray(o.list)) return o.list.map(String);
  const ks = Object.keys(o).filter((k) => !['error', 'text', 'details', 'success'].includes(k));
  if (ks.length && ks.every((k) => /^\d+$/.test(k))) return ks.map((k) => String(o[k]));
  return ks;
}

/** A value that may be a nested object (json=yes) or a url-encoded string (legacy). */
export const attrs = (v: any): Record<string, string> => (v && typeof v === 'object' ? v : Object.fromEntries(new URLSearchParams(String(v ?? ''))));

export interface RawRecord { type: string; name: string; value: string; ttl: number }

/** Records from CMD_API_DNS_CONTROL: json=yes {records:[{type,name,value,ttl}]} or a raw zone file. */
export function parseDaZone(text: string, zone: string): RawRecord[] {
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const recs = Array.isArray(j.records) ? j.records : Array.isArray(j) ? j : [];
      return recs.map((r: any) => ({ type: String(r.type || '').toUpperCase(), name: String(r.name ?? ''), value: String(r.value ?? ''), ttl: Number(r.ttl) || 0 }));
    } catch { /* fall through */ }
  }
  const out: RawRecord[] = []; let origin = zone + '.', last = origin, defTtl = 0;
  for (let line of t.split(/\r?\n/)) {
    line = line.replace(/;(?=(?:[^"]*"[^"]*")*[^"]*$).*/, '').trimEnd();
    if (!line.trim()) continue;
    if (/^\$ORIGIN\s+/i.test(line)) { origin = line.split(/\s+/)[1]; continue; }
    if (/^\$TTL\s+/i.test(line)) { defTtl = Number(line.split(/\s+/)[1]) || 0; continue; }
    const m = /^(\S+)?\s+(?:(\d+)\s+)?(?:IN\s+)?([A-Z]+)\s+(.+)$/i.exec(line.startsWith(' ') || line.startsWith('\t') ? ' ' + line.trim() : line.replace(/^(\S+)\s+/, '$1 '));
    if (!m) continue;
    const name = m[1] ? (m[1] === '@' ? origin : m[1]) : last;
    last = name;
    out.push({ type: m[3].toUpperCase(), name, value: m[4].trim(), ttl: Number(m[2]) || defTtl });
  }
  return out;
}

/* ---------------- second feature set ---------------- */
const META = new Set(['error', 'text', 'details', 'success']);
const entries = (o: Record<string, any>) => Object.entries(o || {}).filter(([k]) => !META.has(k));
const n = (v: unknown) => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return Number.isFinite(x) ? x : 0; };
const limitOf = (v: unknown) => (v === undefined || v === null || v === '' || /unlimited/i.test(String(v)) ? null : n(v));

/** CMD_API_SHOW_USER_USAGE + CMD_API_SHOW_USER_CONFIG -> overview rows (disk / bandwidth in MB). */
export function daUsage(use: Record<string, any>, conf: Record<string, any>) {
  const ROWS: [string, string, 'MB' | ''][] = [
    ['quota', 'Disk space', 'MB'], ['bandwidth', 'Bandwidth (this month)', 'MB'], ['inode', 'Files and folders (inodes)', ''],
    ['vdomains', 'Domains', ''], ['nsubdomains', 'Subdomains', ''], ['domainptr', 'Domain aliases', ''],
    ['nemails', 'Email accounts', ''], ['nemailf', 'Email forwarders', ''], ['nemailr', 'Autoresponders', ''],
    ['mysql', 'Databases', ''], ['ftp', 'FTP accounts', ''],
  ];
  const items = ROWS.filter(([k]) => use[k] !== undefined || conf[k] !== undefined).map(([key, label, unit]) => {
    let used = n(use[key]);
    if (key === 'quota' && use.db_quota !== undefined && use.quota_without_system === undefined) used = n(use.quota); // DA's quota already includes databases
    return { key, label, unit, used: Math.round(used * 10) / 10, limit: limitOf(conf[key]) };
  });
  return { items, plan: String(conf.package || ''), ip: String(conf.ip || ''), suspended: conf.suspended === 'yes' };
}

/** CMD_API_DOMAIN_POINTER?domain= : "pointer.com=alias" (alias) or "pointer.com=" / "=pointer" (redirecting pointer). */
export function parsePointers(o: Record<string, any>) {
  if (Array.isArray(o.list)) return o.list.map((x: string) => ({ name: String(x).toLowerCase(), type: 'pointer' as const }));
  return entries(o).filter(([k]) => /\./.test(k)).map(([k, v]) => ({ name: k.toLowerCase(), type: /alias/i.test(typeof v === 'object' ? JSON.stringify(v) : String(v)) ? 'alias' as const : 'pointer' as const }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** CMD_API_REDIRECT?domain= : "/old=type=301&url=https://…" (legacy) or {"/old": {type, url}} (json). */
export function parseRedirects(o: Record<string, any>) {
  return entries(o).filter(([k]) => k.startsWith('/')).map(([path, v]) => {
    const a = attrs(v);
    let to = a.url || a.destination || a.to || '', type = a.type || '';
    if (!to && typeof v === 'string') { const m = /^(30[1-8])?\s*(\S+)$/.exec(v.trim()); if (m) { type = m[1] || ''; to = m[2]; } }
    return { path, to, type: type || '301' };
  });
}

/** CMD_API_ADDITIONAL_DOMAINS?action=view : phpN_ver / phpN_info per slot, php1_select = slot in use. */
export function parsePhp(o: Record<string, any>) {
  const src = o.data && typeof o.data === 'object' ? { ...o, ...o.data } : o;
  const options: { id: string; label: string }[] = [];
  for (let i = 1; i <= 4; i++) {
    const ver = src[`php${i}_ver`] ?? src[`php${i}_release`], info = src[`php${i}_info`];
    if (ver === undefined && info === undefined) continue;
    if (/^no$/i.test(String(ver)) || /^no$/i.test(String(info))) continue;
    options.push({ id: String(i), label: String(info || `PHP ${ver}`).trim() });
  }
  return { current: String(src.php1_select ?? (options[0]?.id || '')), options: src.has_php_selector === 'no' ? [] : options };
}

/** CMD_API_EMAIL_VACATION?domain= : user=<url-encoded starttime/startday/…> */
export function parseVacations(o: Record<string, any>, domain: string) {
  return entries(o).map(([user, v]) => {
    const a = attrs(v);
    const d = (p: 'start' | 'end') => (a[`${p}year`] ? `${a[`${p}year`]}-${String(a[`${p}month`]).padStart(2, '0')}-${String(a[`${p}day`]).padStart(2, '0')}` : undefined);
    return { user, email: `${user}@${domain}`, start: d('start'), end: d('end') };
  });
}

/** CMD_API_SPAMASSASSIN?domain= */
export function spamFrom(o: Record<string, any>) {
  const where = ['inbox', 'spamfolder', 'userspamfolder', 'delete'].includes(o.where) ? o.where : 'inbox';
  return { available: true, enabled: o.is_on === 'yes', threshold: n(o.required_hits ?? o.required_score) || 5, where, highScore: Math.round(n(o.high_score)) || 15, highScoreBlock: o.high_score_block === 'yes' };
}

/** CMD_API_CRON_JOBS (no args): numeric cron id => "m h dom mon dow command" or url-encoded fields. MAILTO etc. are skipped. */
export function parseCron(o: Record<string, any>) {
  return entries(o).filter(([k]) => /^\d+$/.test(k)).map(([id, v]) => {
    const a = typeof v === 'object' ? attrs(v) : String(v).includes('command=') ? attrs(v) : null;
    if (a && a.command !== undefined) return { id, minute: a.minute, hour: a.hour, dayofmonth: a.dayofmonth, month: a.month, dayofweek: a.dayofweek, command: a.command };
    const p = String(v).trim().split(/\s+/);
    return { id, minute: p[0] || '', hour: p[1] || '', dayofmonth: p[2] || '', month: p[3] || '', dayofweek: p[4] || '', command: p.slice(5).join(' ') };
  });
}

/** FTP account type DirectAdmin expects when modifying, from the account's home-relative path. */
export function ftpTypeFor(path: string, domain: string): 'domain' | 'ftp' | 'user' | 'custom' {
  if (path === `/domains/${domain}/public_html`) return 'domain';
  if (path === `/domains/${domain}/public_ftp`) return 'ftp';
  if (path === '/' || path === '') return 'user';
  return 'custom';
}

/** GET /api/web-protect/list : array or {list|data|dirs:[…]} of {path|dir, realm|name, users}. Paths made home-relative. */
export function parseProtected(j: any, home: string) {
  const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.list) ? j.list : Array.isArray(j?.data) ? j.data : Array.isArray(j?.dirs) ? j.dirs : j && typeof j === 'object' ? Object.values(j) : [];
  return arr.filter((x) => x && typeof x === 'object').map((x) => {
    let p = String(x.path || x.dir || x.directory || '');
    if (p.startsWith(home + '/')) p = p.slice(home.length);
    return { path: p, realm: String(x.realm || x.name || ''), users: (Array.isArray(x.users) ? x.users : []).map((u: any) => String(typeof u === 'object' ? u.name || u.user || '' : u)).filter(Boolean) };
  }).filter((x) => x.path.startsWith('/'));
}

/** GET /api/wordpress/locations : installed sites only. */
export function parseWpSites(j: any) {
  const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.locations) ? j.locations : Array.isArray(j?.data) ? j.data : [];
  // field names vary across DirectAdmin builds: try the known ones, then any URL / home path found in the object
  const scan = (o: any, re: RegExp, d = 0): string => {
    if (!o || typeof o !== 'object' || d > 3) return '';
    for (const v of Object.values(o)) { if (typeof v === 'string' && re.test(v)) return v; }
    for (const v of Object.values(o)) { const r = scan(v, re, d + 1); if (r) return r; }
    return '';
  };
  return arr.filter((x) => x && (x.wordpress || x.version || x.installed === true || x.wpVersion)).map((x) => {
    const w = x.wordpress && typeof x.wordpress === 'object' ? x.wordpress : {};
    const dom = x.domain || x.domainName || w.domain;
    const web = x.webPath ?? x.webpath ?? x.web_path ?? w.webPath ?? '';
    const url = x.url || x.siteURL || x.siteUrl || x.siteurl || x.homeURL || w.siteURL || w.siteUrl || w.siteurl || w.homeURL || w.home
      || (dom ? `https://${dom}${web && web !== '/' ? web : ''}` : '') || scan(x, /^https?:\/\//i);
    const path = x.filesystemPath || x.fsPath || x.filePath || x.fullPath || x.directory || x.dir || w.path || x.path || scan(x, /^\/home\//);
    return { url: String(url || ''), path: String(path || ''), version: String(w.version || x.wpVersion || x.version || '') || undefined };
  });
}
