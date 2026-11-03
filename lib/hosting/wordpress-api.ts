// The "wordpress" section of /api/hosting (app/api/hosting/[section]/route.ts): reads and writes for the panel's
// WordPress tab, on top of the provider's `wordpress` adapter (Softaculous on DirectAdmin).
//   GET  ?op=list               sites (Softaculous installs + DirectAdmin's own list), what this account may do
//   GET  ?op=targets            domains + subdomains a site can be installed / staged on
//   GET  ?op=task&key=<32>      progress of a background job (staging, push to live, some backups)
//   POST {op:'install', domain, directory, title, adminUser, adminEmail, language, deliver:'show'|'email', autoUpdate}
//   POST {op:'login'|'backup'|'upgrade', id}   {op:'staging', id, mode:'sub'|'dir', label|directory}
//   POST {op:'push', id, confirm:true}        {op:'delete', id, confirm:'<site host>'}
// Ownership: every id must be in this account's own installation list (read as the account user); every domain must
// be one of the account's domains or a subdomain of one. The generated admin password goes to the customer once in
// the response; it is never put in the audit detail, a log line or an error message.
import 'server-only';
import { limiter } from '../agents/http';
import { getClientsDetails } from '../portal/api';
import { HttpError, ownedDomains, type Ctx } from './context';
import { probeSsl } from './ssl-probe';
import { InputError, ownedDomain } from './validate';
import { PanelError, type WpJob, type WpSite } from './types';
import { WP_LANGUAGES, hostOf, wpAdminUser, wpDirectory, wpEmail, wpInsid, wpLabel, wpLanguage, wpPassword, wpTaskKey, wpTitle } from './wordpress';

const heavy = limiter(10, 10 * 60_000); // installs, staging, push, delete, upgrade, backup per client
const logins = limiter(20, 60_000);
const busy = new Map<string, number>(); // one install / staging per target at a time (double clicks, two tabs)

const has = (ctx: Ctx, sub: string) => (ctx.p.caps.wordpress || []).includes(sub);
function need(ctx: Ctx, sub: string) {
  if (!has(ctx, sub) || !ctx.p.wordpress) throw new HttpError(501, 'This WordPress action is not available on your hosting plan.', 'unsupported');
}
function rate(lim: (k: string) => number, ctx: Ctx) { const w = lim(`c${ctx.claims.cid}`); if (w) throw new HttpError(429, `Too many WordPress actions. Try again in ${w}s.`, 'rate_limited'); }
function lock(key: string) {
  const now = Date.now();
  for (const [k, t] of busy) if (t < now) busy.delete(k);
  if (busy.has(key)) throw new HttpError(409, 'This is already running. Wait until it finishes, then refresh the list.', 'busy');
  busy.set(key, now + 90_000);
  return () => busy.delete(key);
}

/** Caps actually usable now: the detected ones (session) are trimmed by what the adapter implements. */
async function capsNow(ctx: Ctx): Promise<string[]> {
  let caps = ctx.p.caps.wordpress || [];
  if (ctx.p.detect) { try { const d = await ctx.p.detect(); if (d.wordpress) caps = d.wordpress; } catch { /* keep */ } }
  const w = ctx.p.wordpress as any;
  const impl: Record<string, string> = { install: 'install', login: 'signOn', staging: 'staging', push: 'pushLive', delete: 'remove', backup: 'backup', upgrade: 'upgrade' };
  return caps.filter((c) => c === 'list' || (w && typeof w[impl[c]] === 'function'));
}

async function sites(ctx: Ctx): Promise<WpSite[]> { return ctx.p.wordpress!.list(); }
async function site(ctx: Ctx, raw: unknown): Promise<WpSite> {
  const id = wpInsid(raw);
  const s = (await sites(ctx)).find((x) => x.id === id && x.managed);
  if (!s) throw new InputError('That WordPress site is not on this hosting account. Refresh the list.');
  return s;
}

/** Account domains plus their subdomains ("blog.example.com"), for the install / staging pickers. */
async function targets(ctx: Ctx): Promise<string[]> {
  const owned = await ownedDomains(ctx);
  const out = [...owned];
  if (ctx.p.subdomains && (ctx.p.caps.subdomains || []).includes('list')) {
    const subs = await Promise.all(owned.slice(0, 15).map((d) => ctx.p.subdomains!.list(d).then((l) => l.map((x) => `${x}.${d}`), () => [] as string[])));
    out.push(...subs.flat());
  }
  return [...new Set(out)];
}
/** A domain the account owns, or `<label>.<owned domain>` when that subdomain exists. */
async function target(ctx: Ctx, raw: unknown): Promise<string> {
  const d = String(raw ?? '').trim().toLowerCase().replace(/\.+$/, '');
  const owned = await ownedDomains(ctx);
  if (owned.includes(d)) return d;
  const parent = owned.find((o) => d.endsWith(`.${o}`));
  if (parent && ctx.p.subdomains) {
    const label = d.slice(0, -(parent.length + 1));
    if (/^[a-z0-9-]{1,63}$/.test(label) && (await ctx.p.subdomains.list(parent)).includes(label)) return d;
  }
  return ownedDomain(d, owned); // throws the standard "not on this account" error
}
const httpsOk = async (domain: string) => (await probeSsl(domain, 5000).catch(() => ({ https: false }))).https;
const where = (domain: string, dir: string) => domain + (dir ? `/${dir}` : '');
const pub = (s: WpSite) => ({ id: s.id, url: s.url, adminUrl: s.adminUrl, domain: s.domain, directory: s.directory, path: s.path, version: s.version,
  newVersion: s.newVersion, siteName: s.siteName, created: s.created, staging: !!s.staging, parentId: s.parentId, managed: !!s.managed });

export async function wpGet(ctx: Ctx, op: string, q: URLSearchParams) {
  if (op === 'targets') {
    const [t, email] = await Promise.all([targets(ctx), getClientsDetails(ctx.claims.cid).then((c: any) => String(c.email || ''), () => '')]);
    return { targets: t, languages: WP_LANGUAGES, email };
  }
  if (op === 'task') {
    need(ctx, 'list');
    if (!ctx.p.wordpress?.task) throw new HttpError(501, 'Not available on your hosting plan.', 'unsupported');
    return ctx.p.wordpress.task(wpTaskKey(q.get('key')));
  }
  const caps = await capsNow(ctx);
  return { sites: (await sites(ctx)).map(pub), caps };
}

export interface WpPostResult { message: string; detail: Record<string, unknown>; extra: Record<string, unknown> }

export async function wpPost(ctx: Ctx, op: string, b: any): Promise<WpPostResult> {
  const detail: Record<string, unknown> = {};
  try {
    const w = ctx.p.wordpress;
    const jobOut = (j: WpJob, s?: WpSite) => ({ task: j.task, pending: j.pending || undefined, url: j.url || s?.url, continueUrl: j.continueUrl });
    switch (op) {
      case 'install': {
        need(ctx, 'install'); rate(heavy, ctx);
        const domain = await target(ctx, b.domain), directory = wpDirectory(b.directory);
        const title = wpTitle(b.title), adminUser = wpAdminUser(b.adminUser), adminEmail = wpEmail(b.adminEmail), language = wpLanguage(b.language);
        const deliver = b.deliver === 'email' ? 'email' : 'show';
        const au = b.autoUpdate && typeof b.autoUpdate === 'object' ? b.autoUpdate : {};
        const autoUpdate = { core: au.core !== false, plugins: au.plugins === true, themes: au.themes === true };
        Object.assign(detail, { domain, directory, adminUser, language, deliver, autoUpdate });
        const existing = (await sites(ctx)).find((s) => (s.domain || hostOf(s.url)) === domain && (s.directory || '') === directory);
        if (existing) throw new InputError(`WordPress is already installed at ${where(domain, directory)}. Choose another folder.`);
        const unlock = lock(`${ctx.acct.server.id}|${ctx.acct.username}|${domain}/${directory}`);
        const password = wpPassword();
        let job: WpJob;
        try {
          const https = await httpsOk(domain);
          detail.https = https;
          job = await w!.install!({ domain, directory, title, adminUser, adminEmail, language, password, https, emailTo: deliver === 'email' ? adminEmail : undefined, autoUpdate });
        } catch (e) {
          // the installer kept working after we stopped waiting: the site normally appears a minute later
          if (e instanceof PanelError && e.status === 504) job = { message: 'WordPress is still being installed.', pending: true };
          else throw e;
        } finally { unlock(); }
        const url = job.url || `https://${where(domain, directory)}`;
        detail.pending = !!job.pending;
        return {
          message: job.pending ? `WordPress is still being installed on ${where(domain, directory)}. It appears in the list in a minute or two.` : `WordPress is installed on ${where(domain, directory)}.`,
          detail,
          extra: { site: { url, adminUrl: `${url.replace(/\/+$/, '')}/wp-admin/` }, adminUser, deliver, emailedTo: deliver === 'email' ? adminEmail : undefined, ...(deliver === 'show' ? { password } : {}), ...jobOut(job) },
        };
      }
      case 'login': {
        need(ctx, 'login'); rate(logins, ctx);
        const s = await site(ctx, b.id); Object.assign(detail, { id: s.id, url: s.url });
        return { message: 'Opening WordPress admin', detail, extra: { url: await w!.signOn!(s.id!) } };
      }
      case 'staging': {
        need(ctx, 'staging'); rate(heavy, ctx);
        const s = await site(ctx, b.id);
        if (s.staging) throw new InputError('This is already a staging copy. Create staging from the live site.');
        const mode = b.mode === 'sub' ? 'sub' : 'dir';
        const base = s.domain || hostOf(s.url);
        let domain = base, directory = '';
        if (mode === 'sub') {
          const label = wpLabel(b.label);
          const parent = (await ownedDomains(ctx)).find((o) => base === o || base.endsWith(`.${o}`)) || base;
          domain = `${label}.${parent}`;
          const subs = ctx.p.subdomains && (ctx.p.caps.subdomains || []).includes('list') ? await ctx.p.subdomains.list(parent) : null;
          if (subs && !subs.includes(label)) {
            if (!(ctx.p.caps.subdomains || []).includes('add')) throw new InputError(`Create the subdomain ${domain} first (Subdomains tab).`);
            await ctx.p.subdomains!.add(parent, label); detail.createdSubdomain = domain;
          }
        } else {
          directory = wpDirectory(b.directory);
          if (!directory) throw new InputError('Choose a folder for the staging copy, e.g. staging');
          if (directory === (s.directory || '')) throw new InputError('The staging folder must be different from the live site folder');
          domain = await target(ctx, base);
        }
        Object.assign(detail, { id: s.id, live: s.url, domain, directory, mode });
        if ((await sites(ctx)).some((x) => (x.domain || hostOf(x.url)) === domain && (x.directory || '') === directory)) throw new InputError(`${where(domain, directory)} already has a WordPress site. Choose another name.`);
        const unlock = lock(`${ctx.acct.server.id}|${ctx.acct.username}|${domain}/${directory}`);
        try {
          const job = await w!.staging!(s.id!, domain, directory, mode === 'dir' ? /^https:/.test(s.url) : await httpsOk(domain));
          return { message: job.task ? `Creating the staging copy on ${where(domain, directory)}…` : `Staging copy created on ${where(domain, directory)}.`, detail, extra: { ...jobOut(job), url: job.url || `https://${where(domain, directory)}` } };
        } finally { unlock(); }
      }
      case 'push': {
        need(ctx, 'push'); rate(heavy, ctx);
        const s = await site(ctx, b.id);
        if (!s.staging) throw new InputError('Only a staging copy can be pushed to the live site.');
        if (b.confirm !== true) throw new InputError('Confirm that the live site may be overwritten.');
        Object.assign(detail, { id: s.id, staging: s.url, live: s.parentId });
        const job = await w!.pushLive!(s.id!);
        return { message: job.task ? 'Pushing staging to the live site…' : 'Staging is now live.', detail, extra: jobOut(job) };
      }
      case 'delete': {
        need(ctx, 'delete'); rate(heavy, ctx);
        const s = await site(ctx, b.id);
        const host = s.domain || hostOf(s.url);
        const want = where(host, s.directory || '');
        const typed = String(b.confirm ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        if (typed !== want && typed !== host) throw new InputError(`Type ${want} to confirm.`);
        Object.assign(detail, { id: s.id, url: s.url, staging: !!s.staging });
        const job = await w!.remove!(s.id!);
        return { message: `${s.staging ? 'Staging copy' : 'WordPress site'} ${want} deleted.`, detail, extra: jobOut(job) };
      }
      case 'backup': {
        need(ctx, 'backup'); rate(heavy, ctx);
        const s = await site(ctx, b.id); Object.assign(detail, { id: s.id, url: s.url });
        const job = await w!.backup!(s.id!);
        return { message: job.task ? 'Backing up the site…' : job.message, detail, extra: jobOut(job, s) };
      }
      case 'upgrade': {
        need(ctx, 'upgrade'); rate(heavy, ctx);
        const s = await site(ctx, b.id); Object.assign(detail, { id: s.id, url: s.url, from: s.version, to: s.newVersion });
        const job = await w!.upgrade!(s.id!);
        return { message: job.task ? 'Updating WordPress…' : s.newVersion ? `WordPress updated to ${s.newVersion}.` : job.message, detail, extra: jobOut(job, s) };
      }
    }
    throw new InputError('Unknown operation');
  } catch (e) { if (e && typeof e === 'object') (e as any).wpDetail = detail; throw e; }
}
