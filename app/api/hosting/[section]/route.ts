// Customer hosting manager API, called from the WHMCS client area (public/hp/whmcs.js, hostingPanel) with the
// short-lived token the WHMCS hook prints (docs/whmcs/globalhostia_hosting_hook.php). See lib/hosting/context.ts for
// the guard: CORS for my.globalhostia.com only, HMAC token, WHMCS ownership + Active status, per-client rate limits.
//   GET  /api/hosting/<section>?op=…   reads      POST /api/hosting/<section>  {op, …} (JSON, or multipart for upload)
// Every value is validated (lib/hosting/validate.ts); every write is audit-logged without secrets or file contents.
import { assistAvailable } from '@/lib/ai/server';
import { auditHosting, cors, errorResponse, hostingCtx, HttpError, ownedDomains, type Ctx } from '@/lib/hosting/context';
import { probeSsl } from '@/lib/hosting/ssl-probe';
import { limiter } from '@/lib/agents/http';
import { ourNameservers } from '@/lib/hosting/dns-plan';
import { evaluate } from '@/lib/hosting/health';
import { cachedHealth, connectStatus, gatherHealth, pool, scanDomains, serverIpFor, type ProbeEnv } from '@/lib/hosting/health-probe';
import { mailSettings, mobileconfig, settingsText } from '@/lib/hosting/mailsetup';
import { PANEL_LABEL, type Section } from '@/lib/hosting/types';
import {
  cronCommand, cronField, CRON_FIELDS, ftpUser, httpUrl, httpUser, isoDate, messageText, realm, redirectType, spamSettings, subLabel, urlPath, domainName,
  dbFullName, dbSuffix, dnsRecord, emailAddress, isEditable, joinPath, mailUser, MAX_EDIT_BYTES, MAX_TRANSFER_BYTES,
  ownedDomain, password, quotaMb, safeName, safePath, splitPath, InputError,
} from '@/lib/hosting/validate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECTIONS = ['session', 'overview', 'dns', 'subdomains', 'aliases', 'redirects', 'php', 'email', 'autoresponders', 'spam', 'files', 'ftp', 'protect', 'databases', 'cron', 'ssl', 'backups', 'wordpress', 'health', 'connect', 'mailsetup'] as const;
type S = (typeof SECTIONS)[number];

const ok = (req: Request, data: unknown, status = 200) => Response.json(data, { status, headers: cors(req) });

// Site health / connect wizard: live probes are limited per client (cached answers are free).
const healthLimit = limiter(10, 60_000);
const connectLimit = limiter(20, 60_000);
const HEALTH_ALL_MAX = 18; // 6 at a time, about 8 s each, inside maxDuration
const usageMemo = new Map<string, { v: any; until: number }>();
const hasCap = (ctx: Ctx, sec: Section, sub: string) => (ctx.p.caps[sec] || []).includes(sub);
async function probeEnv(ctx: Ctx): Promise<ProbeEnv> {
  const key = `${ctx.acct.server.id}|${ctx.acct.username}`;
  let u = usageMemo.get(key);
  if ((!u || u.until < Date.now()) && ctx.p.usage && hasCap(ctx, 'overview', 'usage')) {
    try { u = { v: await ctx.p.usage(), until: Date.now() + 60_000 }; if (usageMemo.size > 2000) usageMemo.clear(); usageMemo.set(key, u); } catch { /* storage rows are optional */ }
  }
  const usage = u?.v;
  const serverIp = await serverIpFor(key, ctx.acct.server.url, async () => usage?.ip || undefined);
  return { serverId: ctx.acct.server.id, serverIp, ourNs: ourNameservers([ctx.acct.server]), usage: usage?.items };
}
const rateOr429 = (lim: (k: string) => number, ctx: Ctx) => { const w = lim(`c${ctx.claims.cid}`); if (w) throw new HttpError(429, `Too many checks. Try again in ${w}s.`, 'rate_limited'); };

function need(ctx: Ctx, section: Section, sub: string) {
  if (!ctx.acct.server || !(ctx.p.caps[section] || []).includes(sub)) throw new HttpError(501, 'This action is not available for your hosting panel.', 'unsupported');
}
const sectionOf = async (params: Promise<{ section: string }>): Promise<S> => {
  const { section } = await params;
  if (!(SECTIONS as readonly string[]).includes(section)) throw new HttpError(404, 'Unknown section', 'not_found');
  return section as S;
};

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

/* ------------------------------------------------------------------ reads */
export async function GET(req: Request, { params }: { params: Promise<{ section: string }> }) {
  try {
    const section = await sectionOf(params);
    const ctx = await hostingCtx(req, false);
    const q = new URL(req.url).searchParams;
    const op = q.get('op') || 'list';
    const p = ctx.p;
    switch (section) {
      case 'session': {
        const domains = await ownedDomains(ctx);
        const caps = { ...p.caps };
        if (p.detect) { try { Object.assign(caps, await p.detect()); } catch { /* keep static caps */ } }
        for (const k of Object.keys(caps) as Section[]) if (!caps[k]?.length) delete caps[k];
        Object.assign(caps, { health: ['check'], connect: ['check'] }); // panel-independent (public DNS / HTTPS probes)
        return ok(req, { panel: p.panel, panelLabel: PANEL_LABEL[p.panel], username: ctx.acct.username, domain: ctx.acct.domain, server: ctx.acct.server.name, caps, domains,
          limits: { editBytes: MAX_EDIT_BYTES, transferBytes: MAX_TRANSFER_BYTES }, ai: await assistAvailable() });
      }
      case 'overview': {
        need(ctx, 'overview', 'usage');
        return ok(req, await p.usage!());
      }
      case 'subdomains': {
        need(ctx, 'subdomains', 'list');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        return ok(req, { domain, subdomains: await p.subdomains!.list(domain) });
      }
      case 'aliases': {
        need(ctx, 'aliases', 'list');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        return ok(req, { domain, aliases: await p.aliases!.list(domain) });
      }
      case 'redirects': {
        need(ctx, 'redirects', 'list');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        return ok(req, { domain, redirects: await p.redirects!.list(domain) });
      }
      case 'php': {
        need(ctx, 'php', 'get');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        return ok(req, { domain, ...(await p.php!.get(domain)) });
      }
      case 'autoresponders': {
        need(ctx, 'autoresponders', 'list');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        const [auto, vac] = await Promise.all([p.autoresponders!.list(domain), (p.caps.autoresponders || []).includes('vacation') && p.autoresponders!.vacations ? p.autoresponders!.vacations(domain) : Promise.resolve([])]);
        return ok(req, { domain, autoresponders: auto, vacations: vac });
      }
      case 'spam': {
        need(ctx, 'spam', 'get');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        return ok(req, { domain, ...(await p.spam!.get(domain)) });
      }
      case 'ftp': {
        need(ctx, 'ftp', 'list');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        return ok(req, { domain, accounts: await p.ftp!.list(domain) });
      }
      case 'protect': { need(ctx, 'protect', 'list'); return ok(req, { folders: await p.protect!.list() }); }
      case 'cron': { need(ctx, 'cron', 'list'); return ok(req, { jobs: await p.cron!.list() }); }
      case 'wordpress': { need(ctx, 'wordpress', 'list'); return ok(req, { sites: await p.wordpress!.list() }); }
      case 'dns': {
        need(ctx, 'dns', 'list');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        return ok(req, { domain, records: await p.dns!.list(domain) });
      }
      case 'email': {
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        if (op === 'forwarders') { need(ctx, 'email', 'forwarders'); return ok(req, { domain, forwarders: await p.email!.forwarders(domain) }); }
        need(ctx, 'email', 'list');
        return ok(req, { domain, mailboxes: await p.email!.list(domain) });
      }
      case 'files': {
        const path = safePath(q.get('path'));
        if (op === 'list') { need(ctx, 'files', 'list'); return ok(req, { path, entries: await p.files!.list(path) }); }
        if (op === 'read') {
          need(ctx, 'files', 'read');
          const { name } = splitPath(path);
          if (!isEditable(name)) throw new InputError('Only text files can be opened in the editor');
          const data = await p.files!.read(path, MAX_EDIT_BYTES);
          const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
          if (text.includes('\u0000')) throw new InputError('This looks like a binary file');
          return ok(req, { path, content: text, size: data.byteLength });
        }
        if (op === 'download') {
          need(ctx, 'files', 'download');
          const { name } = splitPath(path);
          const data = await p.files!.read(path, MAX_TRANSFER_BYTES);
          await auditHosting(ctx, 'files.download', { path, bytes: data.byteLength });
          return new Response(data as BodyInit, { headers: { ...cors(req), 'content-type': 'application/octet-stream', 'content-length': String(data.byteLength),
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });
        }
        throw new HttpError(400, 'Unknown operation', 'invalid');
      }
      case 'databases': {
        need(ctx, 'databases', 'list');
        return ok(req, { prefix: await p.dbPrefix(), databases: await p.databases!.list() });
      }
      case 'ssl': {
        need(ctx, 'ssl', 'status');
        const domains = (await ownedDomains(ctx)).slice(0, 15);
        return ok(req, { canIssue: (p.caps.ssl || []).includes('issue'), status: await Promise.all(domains.map((d) => probeSsl(d))) });
      }
      case 'health': {
        const env = await probeEnv(ctx);
        const caps = { dnsAdd: hasCap(ctx, 'dns', 'add'), sslIssue: hasCap(ctx, 'ssl', 'issue'), redirects: hasCap(ctx, 'redirects', 'add') };
        const owned = await ownedDomains(ctx), all = q.get('all') === '1', fresh = q.get('fresh') === '1';
        const list = all ? owned.slice(0, HEALTH_ALL_MAX) : [ownedDomain(q.get('domain'), owned)];
        if (fresh || list.some((d) => !cachedHealth(env, d))) rateOr429(healthLimit, ctx);
        const reports = (await pool(list, 6, (d) => gatherHealth(env, d, fresh))).map((f) => evaluate(f, caps));
        return ok(req, all ? { results: reports, more: Math.max(0, owned.length - list.length) } : reports[0]);
      }
      case 'connect': {
        const env = await probeEnv(ctx);
        const owned = await ownedDomains(ctx);
        if (op === 'scan') return ok(req, { serverIp: env.serverIp || null, domains: (await scanDomains(env, owned)).filter((x) => !x.connected) });
        const domain = ownedDomain(q.get('domain'), owned);
        rateOr429(connectLimit, ctx);
        return ok(req, await connectStatus(env, domain));
      }
      case 'mailsetup': {
        if (!(p.caps.email || []).length) throw new HttpError(501, 'Email is not available for your hosting panel.', 'unsupported');
        const domain = ownedDomain(q.get('domain'), await ownedDomains(ctx));
        const user = q.get('user') ? mailUser(q.get('user')) : '';
        if (user && hasCap(ctx, 'email', 'list') && !(await p.email!.list(domain)).some((m) => m.user === user)) throw new InputError('That mailbox does not exist');
        const st = mailSettings(domain, new URL(ctx.acct.server.url).hostname, user ? `${user}@${domain}` : undefined);
        if (q.get('format') === 'mobileconfig') {
          if (!user) throw new InputError('Choose a mailbox');
          await auditHosting(ctx, 'mailsetup.profile', { domain, user });
          return new Response(mobileconfig(st), { headers: { ...cors(req), 'content-type': 'application/x-apple-aspen-config; charset=utf-8',
            'content-disposition': `attachment; filename="${user}@${domain}.mobileconfig"` } });
        }
        return ok(req, { ...st, qrText: settingsText(st) });
      }
      case 'backups': {
        need(ctx, 'backups', 'list');
        return ok(req, { canCreate: (p.caps.backups || []).includes('create'), canRestore: (p.caps.backups || []).includes('restore'), backups: await p.backups!.list() });
      }
    }
  } catch (e) { return errorResponse(req, e); }
}

/* ------------------------------------------------------------------ writes */
export async function POST(req: Request, { params }: { params: Promise<{ section: string }> }) {
  let ctx: Ctx | null = null; let action = ''; let detail: Record<string, unknown> = {};
  try {
    const section = await sectionOf(params);
    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_TRANSFER_BYTES + 64 * 1024) throw new HttpError(413, 'Upload is larger than 4 MB. Use DirectAdmin or FTP for big files.', 'too_large');
    ctx = await hostingCtx(req, true);
    const p = ctx.p;
    const multipart = /multipart\/form-data/i.test(req.headers.get('content-type') || '');
    let b: any;
    if (multipart) {
      const fd = await req.formData();
      b = { op: String(fd.get('op') || ''), path: fd.get('path'), file: fd.get('file') };
    } else {
      const ct = req.headers.get('content-type') || '';
      if (!/application\/json/i.test(ct)) throw new HttpError(415, 'Send JSON', 'invalid');
      b = await req.json().catch(() => { throw new InputError('Invalid JSON body'); });
      if (!b || typeof b !== 'object') throw new InputError('Invalid body');
    }
    const op = String(b.op || '');
    action = `${section}.${op}`;
    let message = 'Done';

    switch (section) {
      case 'dns': {
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        detail = { domain };
        if (op === 'add') {
          need(ctx, 'dns', 'add');
          const r = dnsRecord(b.record, domain); detail.record = r;
          await p.dns!.add(domain, r); message = `${r.type} record added`;
        } else if (op === 'edit' || op === 'delete') {
          need(ctx, 'dns', op);
          const old = (await p.dns!.list(domain)).find((x) => x.id === String(b.id || ''));
          if (!old) throw new InputError('That record no longer exists. Refresh the list.');
          if (old.readonly) throw new InputError('Name server records cannot be changed here');
          detail.old = { type: old.type, name: old.name, value: old.value };
          if (op === 'edit') { const r = dnsRecord(b.record, domain); detail.record = r; await p.dns!.edit(domain, old, r); message = 'Record updated'; }
          else { await p.dns!.remove(domain, old); message = 'Record deleted'; }
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'email': {
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const user = mailUser(b.user);
        detail = { domain, user };
        const exists = async () => {
          if (!(p.caps.email || []).includes('list')) return;
          if (!(await p.email!.list(domain)).some((m) => m.user === user)) throw new InputError('That mailbox does not exist');
        };
        if (op === 'create') { need(ctx, 'email', 'create'); await p.email!.create(domain, user, password(b.password), quotaMb(b.quota)); message = `${user}@${domain} created`; }
        else if (op === 'delete') { need(ctx, 'email', 'delete'); await exists(); await p.email!.remove(domain, user); message = 'Mailbox deleted'; }
        else if (op === 'password') { need(ctx, 'email', 'password'); await exists(); await p.email!.password(domain, user, password(b.password)); message = 'Password changed'; }
        else if (op === 'quota') { need(ctx, 'email', 'quota'); await exists(); const qm = quotaMb(b.quota); detail.quota = qm; await p.email!.quota(domain, user, qm); message = 'Quota updated'; }
        else if (op === 'addForwarder') { need(ctx, 'email', 'forwarders'); const to = emailAddress(b.to); detail.to = to; await p.email!.addForwarder(domain, user, to); message = 'Forwarder added'; }
        else if (op === 'removeForwarder') { need(ctx, 'email', 'forwarders'); const to = b.to ? emailAddress(b.to) : undefined; detail.to = to; await p.email!.removeForwarder(domain, user, to); message = 'Forwarder removed'; }
        else throw new InputError('Unknown operation');
        break;
      }
      case 'files': {
        if (op === 'upload') {
          need(ctx, 'files', 'upload');
          const dir = safePath(b.path);
          const f = b.file;
          if (!f || typeof f === 'string' || typeof f.arrayBuffer !== 'function') throw new InputError('Choose a file to upload');
          if (f.size > MAX_TRANSFER_BYTES) throw new HttpError(413, 'Upload is larger than 4 MB. Use DirectAdmin or FTP for big files.', 'too_large');
          const name = safeName(f.name);
          detail = { dir, name, bytes: f.size };
          await p.files!.upload!(dir, name, new Uint8Array(await f.arrayBuffer()));
          message = `${name} uploaded`;
        } else if (op === 'write') {
          need(ctx, 'files', 'write');
          const path = safePath(b.path); const { name } = splitPath(path);
          if (!isEditable(name)) throw new InputError('Only text files can be edited here');
          const content = String(b.content ?? '');
          if (Buffer.byteLength(content, 'utf8') > MAX_EDIT_BYTES) throw new InputError('Files over 1 MB cannot be edited in the browser');
          detail = { path, bytes: Buffer.byteLength(content, 'utf8') };
          await p.files!.write(path, content); message = 'File saved';
        } else if (op === 'mkdir') {
          need(ctx, 'files', 'mkdir');
          const dir = safePath(b.path), name = safeName(b.name); detail = { dir, name };
          await p.files!.mkdir(dir, name); message = 'Folder created';
        } else if (op === 'rename') {
          need(ctx, 'files', 'rename');
          const dir = safePath(b.path), from = safeName(b.from), to = safeName(b.to); detail = { dir, from, to };
          joinPath(dir, from); joinPath(dir, to);
          await p.files!.rename(dir, from, to); message = 'Renamed';
        } else if (op === 'delete') {
          need(ctx, 'files', 'delete');
          const dir = safePath(b.path);
          const names = (Array.isArray(b.names) ? b.names : []).slice(0, 100).map(safeName);
          if (!names.length) throw new InputError('Nothing selected');
          if (dir === '/' && names.some((n: string) => ['domains', 'public_html', 'imap', 'Maildir', 'mail', 'etc', 'backups', '.ssh'].includes(n))) throw new InputError('System folders in your home folder cannot be deleted here');
          detail = { dir, names };
          await p.files!.remove(dir, names); message = names.length === 1 ? 'Deleted' : `${names.length} items deleted`;
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'databases': {
        const prefix = await p.dbPrefix();
        const list = (p.caps.databases || []).includes('list') ? await p.databases!.list() : [];
        const findDb = (n: unknown) => { const name = dbFullName(n, prefix); const d = list.find((x) => x.name === name); if (!d) throw new InputError('That database does not exist'); return d; };
        if (op === 'create') {
          need(ctx, 'databases', 'create');
          const name = prefix + dbSuffix(b.name, 'Database name'), user = prefix + dbSuffix(b.user, 'User name');
          if (name.length > 64 || user.length > 32) throw new InputError('Name is too long once the account prefix is added');
          detail = { name, user };
          await p.databases!.create(name, user, password(b.password)); message = `Database ${name} created`;
        } else if (op === 'delete') {
          need(ctx, 'databases', 'delete'); const d = findDb(b.name); detail = { name: d.name };
          await p.databases!.remove(d.name); message = 'Database deleted';
        } else if (op === 'addUser') {
          need(ctx, 'databases', 'users'); const d = findDb(b.db); const user = prefix + dbSuffix(b.user, 'User name'); detail = { db: d.name, user };
          await p.databases!.addUser(d.name, user, password(b.password)); message = 'User added';
        } else if (op === 'removeUser' || op === 'password') {
          need(ctx, 'databases', op === 'password' ? 'password' : 'users');
          const d = findDb(b.db); const user = String(b.user || '');
          if (!d.users.includes(user)) throw new InputError('That user is not on this database');
          detail = { db: d.name, user };
          if (op === 'password') { await p.databases!.password(d.name, user, password(b.password)); message = 'Password changed'; }
          else { await p.databases!.removeUser(d.name, user); message = 'User removed'; }
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'subdomains': {
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const label = subLabel(b.label); detail = { domain, label };
        if (op === 'add') { need(ctx, 'subdomains', 'add'); await p.subdomains!.add(domain, label); message = `${label}.${domain} created`; }
        else if (op === 'delete') {
          need(ctx, 'subdomains', 'delete');
          if (!(await p.subdomains!.list(domain)).includes(label)) throw new InputError('That subdomain does not exist');
          detail.contents = !!b.contents; await p.subdomains!.remove(domain, label, !!b.contents); message = 'Subdomain deleted';
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'aliases': {
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const name = domainName(b.name); detail = { domain, name };
        if (name === domain) throw new InputError('An alias must be a different domain');
        if (op === 'add') { need(ctx, 'aliases', 'add'); detail.alias = b.alias !== false; await p.aliases!.add(domain, name, b.alias !== false); message = `${name} now points to ${domain}`; }
        else if (op === 'delete') {
          need(ctx, 'aliases', 'delete');
          if (!(await p.aliases!.list(domain)).some((a) => a.name === name)) throw new InputError('That alias does not exist');
          await p.aliases!.remove(domain, name); message = 'Alias removed';
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'redirects': {
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const path = urlPath(b.path); detail = { domain, path };
        if (op === 'add') { need(ctx, 'redirects', 'add'); const to = httpUrl(b.to), type = redirectType(b.type); Object.assign(detail, { to, type }); await p.redirects!.add(domain, path, to, type); message = 'Redirect added'; }
        else if (op === 'delete') {
          need(ctx, 'redirects', 'delete');
          const r = (await p.redirects!.list(domain)).find((x) => x.path === path);
          if (!r) throw new InputError('That redirect does not exist');
          await p.redirects!.remove(domain, r); message = 'Redirect removed';
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'php': {
        need(ctx, 'php', 'set');
        if (op !== 'set') throw new InputError('Unknown operation');
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const st = await p.php!.get(domain);
        const opt = st.options.find((o) => o.id === String(b.id));
        if (!opt) throw new InputError('That PHP version is not available');
        detail = { domain, from: st.current, to: opt.id, label: opt.label };
        await p.php!.set(domain, opt.id); message = `${domain} now uses ${opt.label}`;
        break;
      }
      case 'autoresponders': {
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const user = mailUser(b.user); detail = { domain, user };
        const ar = p.autoresponders!;
        if (op === 'create') { need(ctx, 'autoresponders', 'create'); const cc = b.cc ? emailAddress(b.cc) : ''; detail.cc = cc; await ar.create(domain, user, messageText(b.text), cc); message = 'Autoresponder saved'; }
        else if (op === 'delete') {
          need(ctx, 'autoresponders', 'delete');
          if (!(await ar.list(domain)).some((a) => a.user === user)) throw new InputError('That autoresponder does not exist');
          await ar.remove(domain, user); message = 'Autoresponder removed';
        } else if (op === 'vacation') {
          need(ctx, 'autoresponders', 'vacation');
          const start = isoDate(b.start, 'Start date'), end = isoDate(b.end, 'End date');
          if (Date.UTC(end.y, end.m - 1, end.d) < Date.UTC(start.y, start.m - 1, start.d)) throw new InputError('End date must be after the start date');
          detail.start = b.start; detail.end = b.end;
          await ar.setVacation!(domain, user, messageText(b.text), start, end); message = 'Vacation message saved';
        } else if (op === 'removeVacation') {
          need(ctx, 'autoresponders', 'vacation');
          if (!(await ar.vacations!(domain)).some((v) => v.user === user)) throw new InputError('That vacation message does not exist');
          await ar.removeVacation!(domain, user); message = 'Vacation message removed';
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'spam': {
        need(ctx, 'spam', 'set');
        if (op !== 'set') throw new InputError('Unknown operation');
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const v = spamSettings(b.settings); detail = { domain, ...v };
        await p.spam!.set(domain, v); message = v.enabled ? 'Spam filter settings saved' : 'Spam filter switched off';
        break;
      }
      case 'ftp': {
        const domain = ownedDomain(b.domain, await ownedDomains(ctx));
        const user = ftpUser(b.user); detail = { domain, user };
        const exists = async () => { if (!(await p.ftp!.list(domain)).some((a) => a.user === user)) throw new InputError('That FTP account does not exist'); };
        if (op === 'create') {
          need(ctx, 'ftp', 'create');
          const dir = b.dir === '@domain' || b.dir === '@ftp' ? b.dir : safePath(b.dir);
          detail.dir = dir; await p.ftp!.create(domain, user, password(b.password), dir); message = `FTP account ${user}@${domain} created`;
        } else if (op === 'password') { need(ctx, 'ftp', 'password'); await exists(); await p.ftp!.password(domain, user, password(b.password)); message = 'FTP password changed'; }
        else if (op === 'delete') { need(ctx, 'ftp', 'delete'); await exists(); await p.ftp!.remove(domain, user); message = 'FTP account deleted'; }
        else throw new InputError('Unknown operation');
        break;
      }
      case 'protect': {
        const path = safePath(b.path);
        if (!/^\/domains\/[^/]+\/(public_html|private_html)(\/|$)/.test(path)) throw new InputError('Choose a folder inside a website (domains/<domain>/public_html/...)');
        const dom = path.split('/')[2]; ownedDomain(dom, await ownedDomains(ctx));
        detail = { path };
        if (op === 'add') { need(ctx, 'protect', 'add'); const r = realm(b.realm), u = httpUser(b.user); Object.assign(detail, { realm: r, user: u }); await p.protect!.add(path, r, u, password(b.password)); message = 'Folder protected'; }
        else if (op === 'delete') { need(ctx, 'protect', 'delete'); await p.protect!.remove(path); message = 'Protection removed'; }
        else throw new InputError('Unknown operation');
        break;
      }
      case 'cron': {
        if (op === 'add') {
          need(ctx, 'cron', 'add');
          const j: any = {}; for (const f of CRON_FIELDS) j[f] = cronField(b[f], f);
          j.command = cronCommand(b.command); detail = { ...j };
          await p.cron!.add(j); message = 'Cron job added';
        } else if (op === 'delete') {
          need(ctx, 'cron', 'delete');
          const job = (await p.cron!.list()).find((x) => x.id === String(b.id || ''));
          if (!job) throw new InputError('That cron job no longer exists. Refresh the list.');
          detail = { id: job.id, command: job.command.slice(0, 200) };
          await p.cron!.remove(job.id); message = 'Cron job deleted';
        } else throw new InputError('Unknown operation');
        break;
      }
      case 'ssl': {
        need(ctx, 'ssl', 'issue');
        if (op !== 'issue') throw new InputError('Unknown operation');
        const domain = ownedDomain(b.domain, await ownedDomains(ctx)); detail = { domain, www: !!b.www };
        message = await p.ssl!.issue(domain, !!b.www);
        break;
      }
      case 'backups': {
        if (op === 'create') { need(ctx, 'backups', 'create'); message = await p.backups!.create(); }
        else if (op === 'restore') {
          need(ctx, 'backups', 'restore');
          const name = safeName(b.name);
          if (!(await p.backups!.list()).some((x) => x.name === name)) throw new InputError('That backup does not exist');
          detail = { name }; message = await p.backups!.restore!(name);
        } else throw new InputError('Unknown operation');
        break;
      }
      default: throw new HttpError(405, 'Read-only section', 'invalid');
    }
    await auditHosting(ctx, action, detail);
    return ok(req, { ok: true, message });
  } catch (e) {
    if (ctx && action) await auditHosting(ctx, action, { ...detail, error: String((e as any)?.message || e).slice(0, 200) }, false);
    return errorResponse(req, e);
  }
}
