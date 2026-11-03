// WordPress (Softaculous) for the Manage hosting panel: input validation, the admin password generator, the
// Softaculous answer parsers and the plain-language error map. Pure (node:crypto only) so tests import it directly.
// The HTTP client is lib/hosting/providers/softaculous.ts; the API is the "wordpress" section of app/api/hosting.
import { randomBytes, randomInt } from 'node:crypto';
import { InputError } from './validate';
import type { WpSite, WpTask } from './types';

/** Softaculous script id of WordPress. */
export const WP_SID = '26';

/** Languages offered in the install form: [Softaculous / WordPress locale, English name]. Validated server-side. */
export const WP_LANGUAGES: [string, string][] = [
  ['en', 'English'], ['ar', 'Arabic'], ['fr_FR', 'French'], ['de_DE', 'German'], ['es_ES', 'Spanish'], ['it_IT', 'Italian'],
  ['pt_BR', 'Portuguese (Brazil)'], ['nl_NL', 'Dutch'], ['ru_RU', 'Russian'], ['tr_TR', 'Turkish'], ['fa_IR', 'Persian'],
  ['ur', 'Urdu'], ['hi_IN', 'Hindi'], ['bn_BD', 'Bengali'], ['id_ID', 'Indonesian'], ['ms_MY', 'Malay'], ['zh_CN', 'Chinese (Simplified)'], ['ja', 'Japanese'],
];

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Install folder under the domain's web root: '' = the domain itself, else e.g. "blog" or "sites/shop". */
export function wpDirectory(v: unknown): string {
  const s = clean(v).replace(/^\/+|\/+$/g, '');
  if (!s) return '';
  if (s.length > 64 || !/^[a-z0-9_-]+(\/[a-z0-9_-]+){0,2}$/i.test(s)) throw new InputError('Folder: use letters, digits, - or _ (up to three levels, e.g. blog or shop/en)');
  if (/^(wp-admin|wp-includes|wp-content|cgi-bin|\.well-known)$/i.test(s.split('/')[0])) throw new InputError('Choose a different folder name');
  return s;
}

export function wpTitle(v: unknown): string {
  const s = clean(v).replace(/\s+/g, ' ');
  if (!s) throw new InputError('Fill in the site title');
  if (s.length > 80 || /[<>\u0000-\u001f]/.test(s)) throw new InputError('Site title: up to 80 characters, no < or >');
  return s;
}

export function wpAdminUser(v: unknown): string {
  const s = clean(v);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(s)) throw new InputError('Admin user name: 3-32 letters, digits, dot, - or _');
  if (/^(admin|administrator|root|wordpress|wp|test|user)$/i.test(s)) throw new InputError('Admin user name: pick something less guessable than "' + s + '"');
  return s;
}

export function wpEmail(v: unknown): string {
  const s = clean(v).toLowerCase();
  if (s.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) throw new InputError('Admin email: enter a valid address');
  return s;
}

export function wpLanguage(v: unknown): string {
  const s = clean(v) || 'en';
  if (!WP_LANGUAGES.some(([k]) => k === s)) throw new InputError('Choose a language from the list');
  return s;
}

/** Softaculous installation id: "<script id>_<number>", e.g. "26_12345". */
export function wpInsid(v: unknown): string {
  const s = clean(v);
  if (!/^\d{1,5}_\d{1,10}$/.test(s)) throw new InputError('Unknown WordPress installation. Refresh the list.');
  return s;
}

/** Background task key Softaculous returns for staging / push to live (32 characters). */
export function wpTaskKey(v: unknown): string {
  const s = clean(v);
  if (!/^[A-Za-z0-9]{16,64}$/.test(s)) throw new InputError('Unknown task');
  return s;
}

/** Subdomain label for a staging copy ("staging" -> staging.example.com). */
export function wpLabel(v: unknown): string {
  const s = clean(v).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(s) || s === 'www' || s === 'mail') throw new InputError('Subdomain: letters, digits and -, e.g. staging');
  return s;
}

/**
 * Strong admin password, generated on our server: 20 characters from four classes (no look-alikes), at least one of
 * each. Returned to the customer once and never stored or logged.
 */
export function wpPassword(): string {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!#%+=_-@'];
  const all = sets.join('');
  const out = sets.map((s) => s[randomInt(s.length)]);
  while (out.length < 20) out.push(all[randomInt(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join('');
}

/** Database name suffix / table prefix for a new install (the panel adds "<user>_" in front of the name). */
export const wpDbName = () => 'wp' + randomBytes(3).toString('hex').slice(0, 4);
export const wpTablePrefix = () => 'wp' + randomBytes(2).toString('hex').slice(0, 3) + '_';
/** 32-character random string Softaculous wants as `autoid` for an auto sign-on. */
export const wpAutoId = () => randomBytes(16).toString('hex');

/* ------------------------------------------------------------------ answers */
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const strip = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === 'yes' || v === 'true';
const verOk = (v: string) => (/^\d+(\.\d+){0,3}$/.test(v) ? v : '');

/**
 * act=installations answer -> WordPress sites. Shape (api=json): { installations: { "<sid>": { "<insid>": {...} } } }
 * (some builds return a flat { "<insid>": {...} } map). Only WordPress (sid 26) is kept. Field names vary slightly
 * across Softaculous versions, so each one has fallbacks. Database passwords in the answer are never copied.
 */
export function parseInstallations(j: any): WpSite[] {
  const root = j && typeof j === 'object' ? j.installations ?? j.data?.installations : null;
  if (!root || typeof root !== 'object') return [];
  const rows: any[] = [];
  const looksLikeIns = (o: any) => o && typeof o === 'object' && ('softurl' in o || 'softpath' in o || 'insid' in o);
  for (const [k, v] of Object.entries<any>(root)) {
    if (looksLikeIns(v)) rows.push({ ...v, insid: v.insid ?? k });
    else if (v && typeof v === 'object') for (const [k2, v2] of Object.entries<any>(v)) if (looksLikeIns(v2)) rows.push({ ...v2, insid: v2.insid ?? k2, sid: v2.sid ?? k });
  }
  const outdated = j?.outdated && typeof j.outdated === 'object' ? j.outdated : {};
  const latest = str(j?.scripts?.[WP_SID]?.ver ?? j?.iscripts?.[WP_SID]?.ver);
  const sites = rows.filter((r) => str(r.sid || str(r.insid).split('_')[0]) === WP_SID).map((r): WpSite => {
    const id = str(r.insid);
    const url = str(r.softurl).replace(/\/+$/, '');
    const version = verOk(str(r.ver ?? r.version));
    const parent = str(r.staging_parent ?? r.parent_insid ?? r.live_insid ?? r.stagingof ?? '');
    const staging = truthy(r.is_staging) || truthy(r.staging) && !!parent || /^\d+_\d+$/.test(parent);
    const o = outdated[id];
    const newer = verOk(str(o?.ver ?? o?.new_ver ?? r.new_ver ?? r.upgrade_ver ?? '')) || (latest && version && cmpVer(latest, version) > 0 ? latest : '');
    const t = Number(r.itime);
    return {
      id, url, path: str(r.softpath), version: version || undefined, managed: true,
      adminUrl: url ? `${url}/wp-admin/` : undefined,
      domain: str(r.softdomain).toLowerCase() || hostOf(url), directory: str(r.softdirectory).replace(/^\/+|\/+$/g, ''),
      siteName: strip(str(r.site_name)).slice(0, 120) || undefined,
      created: Number.isFinite(t) && t > 1e9 ? new Date(t * 1000).toISOString() : undefined,
      staging: !!staging, parentId: /^\d+_\d+$/.test(parent) ? parent : undefined,
      newVersion: newer && newer !== version ? newer : undefined,
    };
  });
  return sites.sort((a, b) => (a.domain || '').localeCompare(b.domain || '') || (a.staging ? 1 : 0) - (b.staging ? 1 : 0) || a.url.localeCompare(b.url));
}

export function cmpVer(a: string, b: string): number {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}
export const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };

/** Merge DirectAdmin's own WordPress list (installs made outside Softaculous) into the Softaculous list, unmanaged. */
export function mergeSites(managed: WpSite[], native: WpSite[]): WpSite[] {
  const key = (s: WpSite) => (s.path || '').replace(/\/+$/, '') || s.url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const seen = new Set(managed.map(key).concat(managed.map((s) => s.url.replace(/^https?:\/\//, '').replace(/\/+$/, ''))));
  return managed.concat(native.filter((s) => !seen.has(key(s)) && !seen.has(s.url.replace(/^https?:\/\//, '').replace(/\/+$/, ''))).map((s) => ({ ...s, managed: false, domain: s.domain || hostOf(s.url) })));
}

/** act=eu_tasklist answer -> progress. { status: { progress, current_status, completed, softurl } } (or a list of them). */
export function parseTask(j: any): WpTask {
  let st: any = j?.status ?? j?.task ?? j;
  if (Array.isArray(st)) st = st[st.length - 1];
  else if (st && typeof st === 'object' && !('progress' in st) && !('current_status' in st)) { const vals = Object.values(st).filter((x) => x && typeof x === 'object'); if (vals.length) st = vals[vals.length - 1]; }
  const progress = Math.max(0, Math.min(100, Math.round(Number(st?.progress) || 0)));
  const err = j?.error ? softError(j.error) : st?.error ? softError(st.error) : '';
  const text = strip(str(st?.completed || st?.current_status || st?.status_txt || '')).slice(0, 200);
  return { progress, text: err || text, done: progress >= 100 || !!str(st?.completed) || !!err, failed: !!err || undefined, url: /^https?:\/\//.test(str(st?.softurl)) ? str(st.softurl) : undefined };
}

/** A 32-character task key in `done` (staging / push to live / some backups run in the background), else ''. */
export const taskKeyOf = (done: unknown) => (typeof done === 'string' && /^[A-Za-z0-9]{32}$/.test(done) ? done : '');

/**
 * Softaculous error text (object of field -> message, list or string, often with HTML) -> one sentence a customer can act
 * on. Known problems get our own wording; anything else is the first message without markup, cut to 220 characters.
 */
export function softError(e: unknown, secret?: string): string {
  const parts: string[] = [];
  const walk = (v: unknown) => { if (typeof v === 'string') parts.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(e);
  let first = strip(parts.find((p) => strip(p)) || '');
  if (secret) first = first.split(secret).join('•••');
  const all = parts.map(strip).join(' ');
  const has = (re: RegExp) => re.test(all);
  if (has(/already (an? )?(installation|installed)|files? (already )?exist|has some files|files already|is not empty|already contains|overwrite/i)) return 'That folder already has a website in it. Choose an empty folder (for example "blog") or remove the existing files first.';
  if (has(/path of the domain|domain .*(could not be found|does not exist|invalid)|invalid domain|choose a domain/i)) return 'That domain is not set up on this hosting account yet. Add it first, then try again.';
  if (has(/(database|mysql).*(limit|maximum|max|exceed|quota)|(limit|maximum).*(database|mysql)|cannot create .*database/i)) return 'Your plan has no free databases left. Delete an unused database in the Databases tab or upgrade your plan.';
  if (has(/disk|quota|space|insufficient/i)) return 'There is not enough free disk space on your plan. Free some space or upgrade your plan, then try again.';
  if (has(/admin.*user ?name|username.*(invalid|not valid|allowed)/i)) return 'WordPress did not accept the admin user name. Use letters and digits only.';
  if (has(/e-?mail.*(invalid|not valid)|invalid.*e-?mail/i)) return 'WordPress did not accept the admin email address.';
  if (has(/staging.*(exist|already)|already .*staging/i)) return 'This site already has a staging copy. Use it, or delete it first.';
  if (has(/not.*(allowed|permitted|authori[sz]ed)|disabled|permission denied|access denied/i)) return 'WordPress tools are not switched on for this hosting plan. Contact support and we will enable them.';
  if (has(/no installation|installation.*(not found|does not exist|invalid|not valid)|invalid installation/i)) return 'That WordPress site no longer exists. Refresh the list.';
  if (has(/latest version|already .*up ?to ?date|no upgrade/i)) return 'WordPress is already up to date.';
  return first.slice(0, 220) || 'The WordPress installer could not finish this request. Please try again.';
}
