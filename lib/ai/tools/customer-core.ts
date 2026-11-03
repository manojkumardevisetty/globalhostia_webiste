// Customer assistant tools (pure; the data access is injected so tests can check permissions and ownership with mocks).
// The client id always comes from the verified session (portal cookie or hosting-panel token), never from model input,
// and every domain the model names is checked against the domains this client owns before anything is read.
// Changes are never executed here: propose_* tools return a proposal card that the customer confirms in the UI, which
// then calls the existing authenticated endpoint (hosting panel API or account portal form) itself.
import type { AiTool, ToolCtx } from '../agent';

/** Same contract as ToolError in lib/ai/agent.ts (runTool shows `publicMessage` to the model); local so this file stays import-free for tests. */
class ToolError extends Error { publicMessage: string; constructor(m: string) { super(m); this.publicMessage = m; } }

export type Via = 'portal' | 'hosting';
export interface Proposal {
  [k: string]: unknown;
  type: 'proposal';
  id: string;
  kind: 'dns.add' | 'email.create' | 'ssl.issue' | 'ticket.open' | 'wp.install';
  title: string;
  summary: string;
  rows: { k: string; v: string }[];
  /** fields the customer types into the card (never filled by the assistant) */
  inputs?: { name: string; label: string; type: 'password' | 'text' }[];
  confirmLabel: string;
  /** what the UI sends on Confirm. auth "hosting" = Authorization: GH-Hosting <token>; "portal" = same-origin form with csrf. */
  request: { method: 'POST'; path: string; auth: 'hosting' | 'portal' | 'assist'; json?: Record<string, unknown>; form?: Record<string, string> };
}

export interface CustomerDeps {
  services(cid: number): Promise<any[]>;
  domains(cid: number): Promise<any[]>;
  invoices(cid: number, status?: string): Promise<any[]>;
  tickets(cid: number): Promise<any[]>;
  /** domain names this client may ask about (WHMCS domains + hosting service domains + panel domains) */
  owned(ctx: CustomerCtx): Promise<string[]>;
  dns(ctx: CustomerCtx, domain: string): Promise<{ records: any[]; note?: string }>;
  health(ctx: CustomerCtx, domain: string): Promise<any>;
  mail(ctx: CustomerCtx, domain: string): Promise<any>;
  mailboxes?(ctx: CustomerCtx, domain: string): Promise<any[]>;
  caps(ctx: CustomerCtx): Promise<{ dnsAdd: boolean; mailCreate: boolean; sslIssue: boolean; wpInstall?: boolean }>;
  /** hosting panel only: WordPress sites on the account (Softaculous + DirectAdmin list) */
  wordpress?(ctx: CustomerCtx): Promise<any[]>;
  /** portal only: WHMCS domain id for the account DNS editor form */
  domainId?(ctx: CustomerCtx, domain: string): Promise<number | null>;
  departments(): Promise<{ id: number; name: string }[]>;
  signTicket(p: { cid: number; deptid: number; subject: string; message: string; exp: number }): string;
}
export interface CustomerCtx extends ToolCtx { via: Via; serviceId?: number; deps: CustomerDeps }

const S = (p: Record<string, unknown>, req: string[] = []) => ({ type: 'object' as const, additionalProperties: false, properties: p, ...(req.length ? { required: req } : {}) });
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const lc = (v: unknown) => s(v, 253).toLowerCase().replace(/\.+$/, '');
let seq = 0;
const pid = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function ownedDomain(ctx: CustomerCtx, raw: unknown): Promise<string> {
  const d = lc(raw);
  if (!/^[a-z0-9.-]{3,253}$/.test(d)) throw new ToolError('Give one of your domain names.');
  const owned = (await ctx.deps.owned(ctx)).map((x) => String(x).toLowerCase());
  if (!owned.includes(d)) throw new ToolError(`${d} is not on this account. Your domains: ${owned.slice(0, 15).join(', ') || 'none'}.`);
  return d;
}

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'];
const pickFields = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined && o?.[k] !== '').map((k) => [k, o[k]]));

export const customerTools: AiTool<CustomerCtx>[] = [
  {
    name: 'list_services', scope: 'customer', kind: 'read', description: 'The customer\'s hosting/server/SSL services: product, domain, status, billing cycle, amount, next due date.',
    input_schema: S({}),
    async run(_a, ctx) {
      const l = await ctx.deps.services(ctx.clientId!);
      return { text: JSON.stringify(l.slice(0, 40).map((p) => pickFields(p, ['id', 'name', 'groupname', 'domain', 'status', 'billingcycle', 'recurringamount', 'nextduedate', 'regdate']))) };
    },
  },
  {
    name: 'list_domains', scope: 'customer', kind: 'read', description: 'The customer\'s domains with status, expiry and auto-renew.',
    input_schema: S({}),
    async run(_a, ctx) {
      const l = await ctx.deps.domains(ctx.clientId!);
      return { text: JSON.stringify(l.slice(0, 60).map((d) => pickFields(d, ['id', 'domainname', 'status', 'expirydate', 'nextduedate', 'recurringamount', 'donotrenew', 'registrar']))) };
    },
  },
  {
    name: 'list_invoices', scope: 'customer', kind: 'read', description: 'The customer\'s invoices (optionally only Unpaid / Paid / Overdue).',
    input_schema: S({ status: { type: 'string', enum: ['Unpaid', 'Paid', 'Overdue', 'Cancelled'] } }),
    async run(a, ctx) {
      const l = await ctx.deps.invoices(ctx.clientId!, s(a.status, 20) || undefined);
      return { text: JSON.stringify(l.slice(0, 30).map((i) => ({ ...pickFields(i, ['id', 'invoicenum', 'date', 'duedate', 'datepaid', 'total', 'status', 'currencycode']), link: `/account/invoices/${i.id}` }))) };
    },
  },
  {
    name: 'list_tickets', scope: 'customer', kind: 'read', description: 'The customer\'s support tickets with status and last reply.',
    input_schema: S({}),
    async run(_a, ctx) {
      const l = await ctx.deps.tickets(ctx.clientId!);
      return { text: JSON.stringify(l.slice(0, 30).map((t) => pickFields(t, ['id', 'tid', 'subject', 'status', 'priority', 'deptname', 'lastreply']))) };
    },
  },
  {
    name: 'get_dns_records', scope: 'customer', kind: 'read', description: 'DNS records of one of the customer\'s domains (when DNS is managed at GlobalHostia).',
    input_schema: S({ domain: { type: 'string' } }, ['domain']),
    async run(a, ctx) {
      const d = await ownedDomain(ctx, a.domain);
      const r = await ctx.deps.dns(ctx, d);
      return { text: (r.note ? r.note + '\n' : '') + JSON.stringify(r.records.slice(0, 80).map((x) => pickFields(x, ['type', 'name', 'value', 'ttl', 'priority']))) };
    },
  },
  {
    name: 'site_health', scope: 'customer', kind: 'read', description: 'Health check of one of the customer\'s domains: DNS, website up, SSL, email authentication (SPF/DKIM/DMARC), storage.',
    input_schema: S({ domain: { type: 'string' } }, ['domain']),
    async run(a, ctx) {
      const d = await ownedDomain(ctx, a.domain);
      const h = await ctx.deps.health(ctx, d);
      const items = (h?.sections || []).flatMap((x: any) => x.items.map((i: any) => `${i.status.toUpperCase()} ${i.title}: ${i.detail}${i.fix?.kind === 'dns' ? ` (fix: add ${i.fix.record.type} ${i.fix.record.name} "${i.fix.record.value}")` : ''}`));
      return { text: `Score ${h?.score ?? '?'} / 100 for ${d}.\n${items.join('\n')}`.slice(0, 6000) };
    },
  },
  {
    name: 'email_settings', scope: 'customer', kind: 'read', description: 'IMAP/SMTP/POP settings for email on one of the customer\'s domains.',
    input_schema: S({ domain: { type: 'string' } }, ['domain']),
    async run(a, ctx) {
      const d = await ownedDomain(ctx, a.domain);
      const m = await ctx.deps.mail(ctx, d);
      const boxes = ctx.deps.mailboxes ? await ctx.deps.mailboxes(ctx, d).catch(() => null) : null;
      return { text: JSON.stringify({ settings: m, mailboxes: boxes ? boxes.map((b: any) => b.email || b.user) : undefined }) };
    },
  },
  {
    name: 'propose_dns_record', scope: 'customer', kind: 'propose',
    description: 'Propose adding one DNS record; the customer confirms it in a card. Does not change anything by itself.',
    input_schema: S({ domain: { type: 'string' }, type: { type: 'string', enum: DNS_TYPES }, name: { type: 'string', description: '@ for the root, or a host like www' }, value: { type: 'string' }, ttl: { type: 'integer' }, priority: { type: 'integer' } }, ['domain', 'type', 'name', 'value']),
    async run(a, ctx) {
      const d = await ownedDomain(ctx, a.domain);
      const type = s(a.type, 10).toUpperCase();
      if (!DNS_TYPES.includes(type)) throw new ToolError('Unsupported record type.');
      const rec = { type, name: s(a.name, 255) || '@', value: s(a.value, 2048), ttl: Number(a.ttl) || 3600, ...(a.priority !== undefined ? { priority: Number(a.priority) } : {}) };
      if (!rec.value) throw new ToolError('The record needs a value.');
      const caps = await ctx.deps.caps(ctx);
      let request: Proposal['request'];
      if (ctx.via === 'hosting') {
        if (!caps.dnsAdd) throw new ToolError('DNS for this domain cannot be edited here; tell the customer where DNS is managed.');
        request = { method: 'POST', path: '/api/hosting/dns', auth: 'hosting', json: { op: 'add', domain: d, record: rec } };
      } else {
        const id = await ctx.deps.domainId?.(ctx, d);
        if (!id) throw new ToolError('This domain\'s DNS is not managed in the account area; propose a ticket instead.');
        request = { method: 'POST', path: `/account/domains/${id}/dns`, auth: 'portal', form: { op: 'add', type, name: rec.name, value: rec.value, ttl: String(rec.ttl), ...(rec.priority !== undefined ? { priority: String(rec.priority) } : {}) } };
      }
      const p: Proposal = { type: 'proposal', id: pid(), kind: 'dns.add', title: `Add ${type} record`, summary: `Add a ${type} record to ${d}.`,
        rows: [{ k: 'Domain', v: d }, { k: 'Type', v: type }, { k: 'Name', v: rec.name }, { k: 'Value', v: rec.value }, { k: 'TTL', v: String(rec.ttl) }, ...(rec.priority !== undefined ? [{ k: 'Priority', v: String(rec.priority) }] : [])],
        confirmLabel: 'Add record', request };
      return { text: 'Proposal shown; nothing changes until the customer clicks Add record.', ui: [p] };
    },
  },
  {
    name: 'propose_mailbox', scope: 'customer', kind: 'propose',
    description: 'Propose creating a mailbox (user@domain). The customer types the password in the card and confirms. Hosting panel only.',
    input_schema: S({ domain: { type: 'string' }, user: { type: 'string', description: 'part before @' }, quota_mb: { type: 'integer' } }, ['domain', 'user']),
    async run(a, ctx) {
      if (ctx.via !== 'hosting') throw new ToolError('Mailboxes are created in the hosting panel (Manage hosting > Email). Tell the customer where to go.');
      const d = await ownedDomain(ctx, a.domain);
      const user = s(a.user, 64).toLowerCase();
      if (!/^[a-z0-9._-]{1,64}$/.test(user)) throw new ToolError('Use letters, digits, dot, dash or underscore before the @.');
      if (!(await ctx.deps.caps(ctx)).mailCreate) throw new ToolError('Mailbox creation is not available on this hosting panel.');
      const quota = Math.min(Math.max(Number(a.quota_mb) || 1024, 50), 102400);
      const p: Proposal = { type: 'proposal', id: pid(), kind: 'email.create', title: 'Create mailbox', summary: `Create ${user}@${d}.`,
        rows: [{ k: 'Address', v: `${user}@${d}` }, { k: 'Quota', v: `${quota} MB` }], inputs: [{ name: 'password', label: 'Password for the new mailbox', type: 'password' }],
        confirmLabel: 'Create mailbox', request: { method: 'POST', path: '/api/hosting/email', auth: 'hosting', json: { op: 'create', domain: d, user, quota } } };
      return { text: 'Proposal shown; the customer sets the password in the card and confirms.', ui: [p] };
    },
  },
  {
    name: 'propose_ssl', scope: 'customer', kind: 'propose',
    description: 'Propose issuing a free SSL certificate for one of the customer\'s domains (hosting panel only).',
    input_schema: S({ domain: { type: 'string' }, www: { type: 'boolean' } }, ['domain']),
    async run(a, ctx) {
      if (ctx.via !== 'hosting') throw new ToolError('SSL is issued from the hosting panel (Manage hosting > SSL).');
      const d = await ownedDomain(ctx, a.domain);
      if (!(await ctx.deps.caps(ctx)).sslIssue) throw new ToolError('SSL issuing is not available on this hosting panel.');
      const www = a.www !== false;
      const p: Proposal = { type: 'proposal', id: pid(), kind: 'ssl.issue', title: 'Issue free SSL', summary: `Issue a free certificate for ${d}${www ? ` and www.${d}` : ''}.`,
        rows: [{ k: 'Domain', v: d }, { k: 'Include www', v: www ? 'Yes' : 'No' }], confirmLabel: 'Issue certificate',
        request: { method: 'POST', path: '/api/hosting/ssl', auth: 'hosting', json: { op: 'issue', domain: d, www } } };
      return { text: 'Proposal shown; nothing changes until the customer confirms.', ui: [p] };
    },
  },
  {
    name: 'list_wordpress_sites', scope: 'customer', kind: 'read', description: 'WordPress sites on this hosting account: address, version, available update, staging copies. Hosting panel only.',
    input_schema: S({}),
    async run(_a, ctx) {
      if (ctx.via !== 'hosting' || !ctx.deps.wordpress) throw new ToolError('WordPress sites are listed in the hosting panel (Manage hosting > WordPress).');
      const l = await ctx.deps.wordpress(ctx);
      return { text: JSON.stringify(l.slice(0, 40).map((w) => pickFields(w, ['url', 'version', 'newVersion', 'staging', 'siteName', 'managed']))) || '[]' };
    },
  },
  {
    name: 'propose_wordpress_install', scope: 'customer', kind: 'propose',
    description: 'Propose installing WordPress on one of the customer\'s domains (optional folder). The customer confirms in a card; the login details are emailed to the admin email (never shown in chat). Hosting panel only.',
    input_schema: S({ domain: { type: 'string' }, directory: { type: 'string', description: 'folder, empty for the domain itself' }, title: { type: 'string' }, admin_user: { type: 'string' }, admin_email: { type: 'string' }, language: { type: 'string', description: 'e.g. en, ar, fr_FR' } }, ['domain', 'title', 'admin_user', 'admin_email']),
    async run(a, ctx) {
      if (ctx.via !== 'hosting') throw new ToolError('WordPress is installed from the hosting panel (Manage hosting > WordPress).');
      const d = await ownedDomain(ctx, a.domain);
      if (!(await ctx.deps.caps(ctx)).wpInstall) throw new ToolError('One-click WordPress install is not available on this hosting plan.');
      const dir = s(a.directory, 64).replace(/^\/+|\/+$/g, '');
      if (dir && !/^[a-z0-9_-]+(\/[a-z0-9_-]+){0,2}$/i.test(dir)) throw new ToolError('Folder: letters, digits, - or _.');
      const title = s(a.title, 80), user = s(a.admin_user, 32), email = s(a.admin_email, 254).toLowerCase(), language = s(a.language, 10) || 'en';
      if (!title || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(user) || /^(admin|administrator|root)$/i.test(user)) throw new ToolError('Give a site title and an admin user name (3-32 letters or digits, not "admin").');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ToolError('Give a valid admin email.');
      const where = d + (dir ? `/${dir}` : '');
      const p: Proposal = { type: 'proposal', id: pid(), kind: 'wp.install', title: 'Install WordPress', summary: `Install WordPress on ${where}.`,
        rows: [{ k: 'Address', v: where }, { k: 'Site title', v: title }, { k: 'Admin user', v: user }, { k: 'Admin email', v: email }, { k: 'Language', v: language }],
        confirmLabel: 'Install WordPress',
        request: { method: 'POST', path: '/api/hosting/wordpress', auth: 'hosting', json: { op: 'install', domain: d, directory: dir, title, adminUser: user, adminEmail: email, language, deliver: 'email' } } };
      return { text: 'Proposal shown; WordPress is installed only when the customer confirms. The login details go to the admin email.', ui: [p] };
    },
  },
  {
    name: 'propose_ticket', scope: 'customer', kind: 'propose',
    description: 'Propose opening a support ticket (billing, refunds, cancellations, problems you cannot solve). The customer reviews and confirms.',
    input_schema: S({ subject: { type: 'string' }, message: { type: 'string' }, department: { type: 'string', description: 'e.g. Technical, Billing, Sales' } }, ['subject', 'message']),
    async run(a, ctx) {
      const subject = s(a.subject, 150), message = s(a.message, 4000);
      if (subject.length < 3 || message.length < 10) throw new ToolError('Write a clear subject and message.');
      const depts = await ctx.deps.departments().catch(() => []);
      const want = s(a.department, 40).toLowerCase();
      const dept = depts.find((d) => want && d.name.toLowerCase().includes(want)) || depts.find((d) => /tech|support/i.test(d.name)) || depts[0];
      if (!dept) throw new ToolError('Tickets cannot be opened right now; suggest WhatsApp or email.');
      const token = ctx.deps.signTicket({ cid: ctx.clientId!, deptid: dept.id, subject, message, exp: Math.floor(Date.now() / 1000) + 1800 });
      const p: Proposal = { type: 'proposal', id: pid(), kind: 'ticket.open', title: 'Open a ticket', summary: subject,
        rows: [{ k: 'Department', v: dept.name }, { k: 'Subject', v: subject }, { k: 'Message', v: message }], confirmLabel: 'Open ticket',
        request: { method: 'POST', path: '/api/ai/assist/action', auth: 'assist', json: { token } } };
      return { text: 'Ticket proposal shown; it opens when the customer confirms.', ui: [p] };
    },
  },
];
