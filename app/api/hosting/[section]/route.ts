// Customer hosting manager API, called from the WHMCS client area (public/hp/whmcs.js, hostingPanel) with the
// short-lived token the WHMCS hook prints (docs/whmcs/globalhostia_hosting_hook.php). See lib/hosting/context.ts for
// the guard: CORS for my.globalhostia.com only, HMAC token, WHMCS ownership + Active status, per-client rate limits.
//   GET  /api/hosting/<section>?op=…   reads      POST /api/hosting/<section>  {op, …} (JSON, or multipart for upload)
// Every value is validated (lib/hosting/validate.ts); every write is audit-logged without secrets or file contents.
import { auditHosting, cors, errorResponse, hostingCtx, HttpError, ownedDomains, type Ctx } from '@/lib/hosting/context';
import { probeSsl } from '@/lib/hosting/ssl-probe';
import { PANEL_LABEL, type Section } from '@/lib/hosting/types';
import {
  dbFullName, dbSuffix, dnsRecord, emailAddress, isEditable, joinPath, mailUser, MAX_EDIT_BYTES, MAX_TRANSFER_BYTES,
  ownedDomain, password, quotaMb, safeName, safePath, splitPath, InputError,
} from '@/lib/hosting/validate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECTIONS = ['session', 'dns', 'email', 'files', 'databases', 'ssl', 'backups'] as const;
type S = (typeof SECTIONS)[number];

const ok = (req: Request, data: unknown, status = 200) => Response.json(data, { status, headers: cors(req) });

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
        return ok(req, { panel: p.panel, panelLabel: PANEL_LABEL[p.panel], username: ctx.acct.username, domain: ctx.acct.domain, server: ctx.acct.server.name, caps: p.caps, domains,
          limits: { editBytes: MAX_EDIT_BYTES, transferBytes: MAX_TRANSFER_BYTES } });
      }
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
