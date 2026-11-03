// Input validation for the hosting manager. Pure module (no imports) so tests/hosting.test.mts can load it.
// Every value that reaches a control panel goes through one of these; they throw InputError with a message that is
// safe to show to the customer.
export class InputError extends Error { status = 400; }
const bad = (m: string): never => { throw new InputError(m); };

/* ---------------- paths: always home-relative, "/" = the account's home directory ---------------- */

/**
 * Normalise a customer-supplied path to a home-relative absolute path ("/domains/x/public_html").
 * Rejects "..", NUL/control characters, backslashes and over-long input instead of trying to repair them,
 * so a crafted path can never resolve outside the home directory.
 */
export function safePath(input: unknown): string {
  if (input === undefined || input === null || input === '') return '/';
  if (typeof input !== 'string') bad('Invalid path');
  const s = input as string;
  if (s.length > 1024) bad('Path is too long');
  if (/[\x00-\x1f\x7f\\]/.test(s)) bad('Path contains invalid characters');
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' || /^\.{2,}$/.test(seg)) bad('Path may not contain ".."');
    if (seg.length > 255) bad('A file or folder name is too long');
    parts.push(seg);
  }
  return '/' + parts.join('/');
}

/** A single file/folder name (no slashes, not "." or ".."). */
export function safeName(input: unknown): string {
  if (typeof input !== 'string') bad('Invalid name');
  const s = (input as string).trim();
  if (!s || s.length > 255) bad('Name must be 1-255 characters');
  if (s === '.' || s === '..' || /^\.{2,}$/.test(s)) bad('Invalid name');
  if (/[\/\\\x00-\x1f\x7f]/.test(s)) bad('Name may not contain slashes or control characters');
  return s;
}

/** Split a safe path into parent dir + name. */
export function splitPath(p: string): { dir: string; name: string } {
  const sp = safePath(p);
  if (sp === '/') bad('The home folder itself cannot be changed');
  const i = sp.lastIndexOf('/');
  return { dir: i <= 0 ? '/' : sp.slice(0, i), name: sp.slice(i + 1) };
}

export const joinPath = (dir: string, name: string) => safePath(`${safePath(dir)}/${safeName(name)}`);

/** Absolute server path under a home directory, guaranteed to stay inside it. */
export function underHome(home: string, rel: string): string {
  const h = home.replace(/\/+$/, '');
  if (!/^\/[A-Za-z0-9._\/-]+$/.test(h)) bad('Invalid home directory');
  const r = safePath(rel);
  const abs = r === '/' ? h : h + r;
  if (abs !== h && !abs.startsWith(h + '/')) bad('Path is outside your home folder');
  return abs;
}

/* ---------------- identities ---------------- */

/** Control-panel usernames (DirectAdmin/cPanel/Plesk logins). Blocks "|" and ":" which would change the login-as identity. */
export function panelUser(input: unknown): string {
  const s = String(input ?? '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(s)) bad('This service has no valid control-panel username');
  return s;
}

export function domainName(input: unknown): string {
  const s = String(input ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (s.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(s)) bad('Invalid domain name');
  return s;
}

/** The domain must be one of the account's own domains (list fetched from the panel as that user). */
export function ownedDomain(input: unknown, owned: string[]): string {
  const d = domainName(input);
  if (!owned.map((x) => x.toLowerCase().replace(/\.$/, '')).includes(d)) bad('That domain is not part of this hosting account');
  return d;
}

export function mailUser(input: unknown): string {
  const s = String(input ?? '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(s) || s.includes('..')) bad('Mailbox name may use letters, digits, dot, dash, underscore and plus');
  return s;
}

export function emailAddress(input: unknown): string {
  const s = String(input ?? '').trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1 || s.length > 254) bad('Enter a valid email address');
  mailUser(s.slice(0, at)); domainName(s.slice(at + 1));
  return s;
}

export function password(input: unknown): string {
  const s = String(input ?? '');
  if (s.length < 8 || s.length > 128) bad('Password must be 8-128 characters');
  if (/[\x00-\x1f\x7f]/.test(s)) bad('Password contains invalid characters');
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/[0-9]/.test(s)) bad('Password needs upper and lower case letters and a digit');
  return s;
}

/** Quota in MB; 0 = unlimited. */
export function quotaMb(input: unknown): number {
  const n = Number(input ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 1_048_576) bad('Quota must be a whole number of MB (0 = unlimited)');
  return n;
}

/** Database / database-user suffix (the panel adds the account prefix). */
export function dbSuffix(input: unknown, label = 'Name'): string {
  const s = String(input ?? '').trim();
  if (!/^[A-Za-z0-9_]{1,32}$/.test(s)) bad(`${label} may use letters, digits and underscore (max 32)`);
  return s;
}

/** Full database or database-user name that must carry the account prefix, e.g. "bob_shop". */
export function dbFullName(input: unknown, prefix: string, label = 'Database'): string {
  const s = String(input ?? '').trim();
  if (!/^[A-Za-z0-9_]{1,64}$/.test(s) || !s.startsWith(prefix)) bad(`${label} does not belong to this account`);
  return s;
}

/* ---------------- DNS ---------------- */

export const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'] as const;
export type DnsType = (typeof DNS_TYPES)[number];
export interface DnsInput { type: DnsType; name: string; value: string; ttl: number; priority?: number; weight?: number; port?: number }

const HOST = /^(\*\.)?([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)(\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*\.?$/i;
const ipv4 = (s: string) => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);
function ipv6(s: string) {
  if (!/^[0-9a-f:.]+$/i.test(s) || s.length > 45 || (s.match(/::/g) || []).length > 1) return false;
  const tail4 = /\d+\.\d+\.\d+\.\d+$/.test(s);
  if (tail4 && !ipv4(s.slice(s.lastIndexOf(':') + 1))) return false;
  const groups = s.replace(/:?\d+\.\d+\.\d+\.\d+$/, '').split(':').filter((g, i, a) => g !== '' || (i > 0 && i < a.length - 1));
  if (!groups.every((g) => g === '' || /^[0-9a-f]{1,4}$/i.test(g))) return false;
  const n = groups.filter((g) => g !== '').length + (tail4 ? 2 : 0);
  return s.includes('::') ? n < 8 : n === 8;
}
const int = (v: unknown, lo: number, hi: number, label: string) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) bad(`${label} must be ${lo}-${hi}`); return n; };

/**
 * Record name relative to the zone: "@" for the apex, "www", "_sip._tcp", "*". A fully qualified name inside the
 * zone ("www.example.com." / "www.example.com") is converted; a name in another zone is refused.
 */
export function dnsName(input: unknown, zone: string): string {
  let s = String(input ?? '').trim().toLowerCase();
  if (s === '' || s === '@' || s === zone || s === zone + '.') return '@';
  if (s.endsWith('.' + zone + '.')) s = s.slice(0, -(zone.length + 2));
  else if (s.endsWith('.' + zone)) s = s.slice(0, -(zone.length + 1));
  else if (s.endsWith('.')) bad('Record name must be inside ' + zone);
  if (s !== '*' && !HOST.test(s)) bad('Invalid record name');
  if (s.length > 200) bad('Record name is too long');
  return s;
}

export function dnsRecord(input: any, zone: string): DnsInput {
  const type = String(input?.type || '').toUpperCase() as DnsType;
  if (!DNS_TYPES.includes(type)) bad('Record type must be one of ' + DNS_TYPES.join(', '));
  const name = dnsName(input?.name, zone);
  const ttl = input?.ttl === undefined || input?.ttl === '' ? 3600 : int(input.ttl, 60, 604800, 'TTL');
  let value = String(input?.value ?? '').trim();
  const out: DnsInput = { type, name, value, ttl };
  switch (type) {
    case 'A': if (!ipv4(value)) bad('A record needs an IPv4 address'); break;
    case 'AAAA': if (!ipv6(value)) bad('AAAA record needs an IPv6 address'); value = value.toLowerCase(); break;
    case 'CNAME': if (name === '@') bad('The zone apex cannot be a CNAME'); if (!HOST.test(value) || value.length > 253) bad('CNAME target must be a host name'); break;
    case 'MX': out.priority = int(input?.priority ?? 10, 0, 65535, 'Priority'); if (!HOST.test(value) || value.length > 253) bad('Mail server must be a host name'); break;
    case 'TXT':
      value = value.replace(/^"(.*)"$/s, '$1');
      if (!value || value.length > 2048) bad('TXT value must be 1-2048 characters');
      if (/[\x00-\x1f\x7f"\\]/.test(value)) bad('TXT value may not contain quotes, backslashes or line breaks');
      break;
    case 'SRV':
      if (!/^_[a-z0-9-]+\._(tcp|udp|tls)(\.|$)/i.test(name)) bad('SRV name must look like _service._tcp');
      out.priority = int(input?.priority ?? 0, 0, 65535, 'Priority'); out.weight = int(input?.weight ?? 0, 0, 65535, 'Weight'); out.port = int(input?.port, 1, 65535, 'Port');
      if (value !== '.' && (!HOST.test(value) || value.length > 253)) bad('SRV target must be a host name');
      break;
  }
  out.value = value;
  return out;
}

/** Fully qualify a host name value for zone-file style panels (adds the trailing dot; relative names get the zone). */
export const fqdn = (v: string, zone: string) => (v === '.' ? '.' : v.endsWith('.') ? v : v.includes('.') ? v + '.' : `${v}.${zone}.`);

/* ---------------- files ---------------- */
export const MAX_EDIT_BYTES = 1024 * 1024;
export const MAX_TRANSFER_BYTES = 4 * 1024 * 1024; // Vercel request/response body limit is 4.5 MB

/** Only these look like text we let the customer edit in the browser. */
export const isEditable = (name: string) => /\.(txt|html?|css|js|mjs|json|xml|php\d?|phtml|md|ini|conf|htaccess|env|ya?ml|csv|svg|py|rb|pl|sh|log|sql|tpl|twig|vue|ts|tsx|jsx)$|^\.(htaccess|user\.ini|htpasswd)$/i.test(name);

/* ---------------- subdomains, aliases, redirects ---------------- */

/** A subdomain label under one of the account's domains ("shop", "dev-1"); no dots, no wildcard. */
export function subLabel(input: unknown): string {
  const s = String(input ?? '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)) bad('Subdomain may use letters, digits and dashes (max 63)');
  if (s === 'www') bad('"www" is reserved');
  return s;
}

/** URL path on the site: starts with "/", no spaces, quotes, "..", or control characters. */
export function urlPath(input: unknown): string {
  const s = String(input ?? '').trim();
  if (!/^\/[A-Za-z0-9._~%!$&()*+,;=:@\/-]{0,500}$/.test(s) || s.includes('..') || s.includes('//')) bad('Path must start with / and contain no spaces or quotes');
  return s;
}

/** Absolute http(s) URL for redirect targets / forwarders. */
export function httpUrl(input: unknown): string {
  const s = String(input ?? '').trim();
  let u: URL;
  try { u = new URL(s); } catch { return bad('Enter a full URL starting with https://'); }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || s.length > 1000 || /[\s"'<>\\]/.test(s)) bad('Enter a full URL starting with https://');
  domainName(u.hostname);
  return s;
}

export const REDIRECT_TYPES = ['301', '302', '303'] as const;
export function redirectType(input: unknown): string {
  const s = String(input ?? '301');
  if (!(REDIRECT_TYPES as readonly string[]).includes(s)) bad('Redirect type must be 301, 302 or 303');
  return s;
}

/* ---------------- FTP, protected folders ---------------- */

export function ftpUser(input: unknown): string {
  const s = String(input ?? '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/.test(s) || s.includes('..')) bad('FTP user may use letters, digits, dot, dash and underscore (max 32)');
  return s;
}

/** Folder protection realm / label shown in the browser's login prompt. */
export function realm(input: unknown): string {
  const s = String(input ?? '').trim();
  if (!s || s.length > 80 || /[\x00-\x1f\x7f"\\<>]/.test(s)) bad('Name must be 1-80 characters without quotes');
  return s;
}

/** A plain login name for HTTP auth (protected folders). */
export function httpUser(input: unknown): string {
  const s = String(input ?? '').trim();
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(s)) bad('User name may use letters, digits, dot, dash and underscore (max 32)');
  return s;
}

/* ---------------- cron ---------------- */

const CRON_RANGES = { minute: [0, 59], hour: [0, 23], dayofmonth: [1, 31], month: [1, 12], dayofweek: [0, 7] } as const;
export type CronField = keyof typeof CRON_RANGES;
export const CRON_FIELDS = Object.keys(CRON_RANGES) as CronField[];

/** Strict numeric cron field: "*", "5", "1-5", "*\/15", "0-30/10", "1,15,30" within the field's range. */
export function cronField(input: unknown, field: CronField): string {
  const s = String(input ?? '').trim();
  const [lo, hi] = CRON_RANGES[field];
  if (!s || s.length > 60) bad(`Invalid ${field}`);
  for (const part of s.split(',')) {
    const m = /^(\*|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/.exec(part);
    if (!m) bad(`Invalid ${field}: use numbers, *, ranges (1-5), lists (1,2) or steps (*/15)`);
    const a = m![2] !== undefined ? Number(m![2]) : lo, b = m![3] !== undefined ? Number(m![3]) : m![2] !== undefined ? a : hi;
    const step = m![4] !== undefined ? Number(m![4]) : 1;
    if (a < lo || b > hi || a > b || step < 1 || step > hi) bad(`${field} must be within ${lo}-${hi}`);
  }
  return s;
}

/** Command: free text (it runs as the account user), single line, bounded. */
export function cronCommand(input: unknown): string {
  const s = String(input ?? '').trim();
  if (!s || s.length > 1000) bad('Command must be 1-1000 characters');
  if (/[\x00-\x1f\x7f]/.test(s)) bad('Command must be a single line');
  return s;
}

/* ---------------- email extras ---------------- */

export function messageText(input: unknown, max = 4000): string {
  const s = String(input ?? '').replace(/\r\n/g, '\n');
  if (!s.trim() || s.length > max) bad(`Message must be 1-${max} characters`);
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(s)) bad('Message contains invalid characters');
  return s;
}

/** YYYY-MM-DD, within a sane window. */
export function isoDate(input: unknown, label = 'Date'): { y: number; m: number; d: number } {
  const s = String(input ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) bad(`${label} must be a date`);
  const y = Number(m![1]), mo = Number(m![2]), d = Number(m![3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || y < 2000 || y > 2100) bad(`${label} is not a valid date`);
  return { y, m: mo, d };
}

export const SPAM_WHERE = ['inbox', 'spamfolder', 'userspamfolder', 'delete'] as const;
export interface SpamInput { enabled: boolean; threshold: number; where: (typeof SPAM_WHERE)[number]; highScore: number; highScoreBlock: boolean }
export function spamSettings(input: any): SpamInput {
  const enabled = !!input?.enabled;
  const threshold = Number(input?.threshold ?? 5);
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 50) bad('Spam score must be between 1 and 50');
  const where = String(input?.where || 'inbox') as SpamInput['where'];
  if (!SPAM_WHERE.includes(where)) bad('Choose where spam goes');
  const highScore = Number(input?.highScore ?? 15);
  if (!Number.isInteger(highScore) || highScore < 1 || highScore > 100) bad('High score must be a whole number 1-100');
  return { enabled, threshold: Math.round(threshold * 10) / 10, where, highScore, highScoreBlock: !!input?.highScoreBlock };
}
