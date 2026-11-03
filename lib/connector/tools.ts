// GlobalHostia connector tools (authenticated MCP server at /mcp and /mcp/chatgpt). Pure: every data access and
// validator is injected (lib/connector/deps.ts in production, mocks in tests/connector.test.mts).
// Rules every account tool follows, in order: kill switch → scope → per-client rate limit → input validation →
// ownership (the WHMCS client id comes only from the access token; ids and domain names from the model are checked
// against that client) → reviewer sandbox → explicit confirm for destructive tools → action → audit (client id, app, tool).
// No tool takes payments, changes passwords, deletes the account or returns secrets (service passwords never leave WHMCS).

export type Profile = 'claude' | 'chatgpt';
export type Access = { cid: number; scopes: string[]; clientId: string; grantId: string; platform: string; email: string };
export type DnsRec = { id: string; type: string; name: string; value: string; ttl: number; priority?: number; weight?: number; port?: number; readonly?: boolean };
export type Validators = {
  domainName(v: unknown): string;
  dnsRecord(v: unknown, zone: string): { type: string; name: string; value: string; ttl: number; priority?: number; weight?: number; port?: number };
  mailUser(v: unknown): string;
  quotaMb(v: unknown): number;
  nameservers(list: string[]): { ok: true; ns: string[] } | { ok: false; error: string };
};

export interface ConnectorDeps {
  v: Validators;
  limit(key: string, kind: 'read' | 'write' | 'domain'): number; // seconds to wait, 0 = allowed
  audit(e: { access: Access; tool: string; ok: boolean; detail: Record<string, unknown>; ip: string }): Promise<void>;
  /* public catalog (lib/agents) */
  searchPlans(a: Record<string, unknown>): Promise<Record<string, unknown>>;
  recommendPlan(a: Record<string, unknown>): Promise<Record<string, unknown>>;
  cartLink(a: { slug: string; cycle?: string; currency?: string; domain?: string }): Promise<Record<string, unknown>>;
  checkDomain(domain: string, currency?: string): Promise<Record<string, unknown>>;
  /** premium domains for sale (lib/premium); optional so older mocks keep working */
  premiumSearch?(a: { keyword?: string; tld?: string; maxPrice?: number; limit?: number }): Promise<{ total: number; url: string; items: Record<string, unknown>[] }>;
  policies(topic?: string): Promise<Record<string, unknown>>;
  /* account (WHMCS; every call scoped to the client id) */
  client(cid: number): Promise<any>;
  services(cid: number): Promise<any[]>;
  service(cid: number, id: number): Promise<any | null>;
  serviceUsage(cid: number, svc: any): Promise<any | null>;
  domains(cid: number): Promise<any[]>;
  nameservers(domainId: number): Promise<string[] | null>;
  dnsStatus(cid: number, domainRow: any, ns: string[] | null): Promise<{ managed: boolean; where: string; note?: string }>;
  setAutoRenew(cid: number, domainId: number, on: boolean): Promise<boolean>;
  setNameservers(domainId: number, ns: string[]): Promise<void>;
  invoices(cid: number, status?: string): Promise<any[]>;
  invoice(cid: number, id: number): Promise<any | null>;
  tickets(cid: number, status?: string): Promise<any[]>;
  ticket(cid: number, id: number): Promise<any | null>;
  departments(): Promise<{ id: number; name: string }[]>;
  openTicket(cid: number, t: { deptid: number; subject: string; message: string; priority: string; serviceid?: number }): Promise<{ id: number; tid: string }>;
  replyTicket(cid: number, id: number, message: string): Promise<void>;
  /* hosting / DNS (lib/portal/dns + lib/hosting providers, acting as the account's own panel user) */
  dnsList(cid: number, domain: string): Promise<{ records: DnsRec[]; editable: boolean; note?: string }>;
  dnsAdd(cid: number, domain: string, rec: ReturnType<Validators['dnsRecord']>): Promise<void>;
  dnsEdit(cid: number, domain: string, old: DnsRec, rec: ReturnType<Validators['dnsRecord']>): Promise<void>;
  dnsDelete(cid: number, domain: string, old: DnsRec): Promise<void>;
  mailboxes(cid: number, domain: string): Promise<{ email: string; quotaMb?: number; usedMb?: number }[] | null>;
  createMailbox(cid: number, domain: string, user: string, quotaMb: number): Promise<{ manageUrl: string }>;
  deleteMailbox(cid: number, domain: string, user: string): Promise<void>;
  issueSsl(cid: number, domain: string, www: boolean): Promise<string>;
  health(cid: number, domain: string): Promise<any>;
  mailSettings(cid: number, domain: string): Promise<any>;
  renewals(cid: number): Promise<any[]>;
  urls: { site: string; clientArea: string };
}

export interface ToolCtx {
  profile: Profile; access: Access | null; deps: ConnectorDeps; ip: string;
  enabled: boolean; commerce: boolean; reviewer: { clientIds: number[]; sandboxDomain: string };
}

/** Errors the model sees verbatim (no internals). `code` lets the transport turn auth problems into 401/403. */
export type FailCode = 'invalid' | 'not_found' | 'forbidden' | 'auth' | 'scope' | 'rate_limited' | 'confirm' | 'unavailable' | 'disabled';
export class ToolFail extends Error {
  code: FailCode; data?: Record<string, unknown>;
  constructor(message: string, code: FailCode = 'invalid', data?: Record<string, unknown>) { super(message); this.code = code; this.data = data; }
}

type Out = { summary: string; data: Record<string, unknown> };
type Ann = { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
export type ToolDef = {
  name: string; title: string; description: string; inputSchema: Record<string, unknown>; outputSchema: Record<string, unknown>;
  annotations: Ann & { title: string }; scope: string | null; commerce?: boolean; confirm?: boolean;
  run(a: Record<string, unknown>, ctx: ToolCtx): Promise<Out>;
};

/* ------------------------------------------------------------------ schema helpers */
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
/** Output schema: declared fields may be null when the billing system has no value (clients validate structuredContent). */
const out = (properties: Record<string, any>) => ({ type: 'object', properties: Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, v.type ? { ...v, type: [v.type, 'null'] } : v])) });
const ARR = { type: 'array' }, STR = { type: 'string' }, NUM = { type: 'number' }, BOOL = { type: 'boolean' }, OBJ = { type: 'object' };
const DOMAIN = { type: 'string', minLength: 3, maxLength: 253, description: 'A domain on your account, e.g. mybrand.com' };
const ID = (what: string) => ({ type: 'integer', minimum: 1, description: `${what} id, as returned by the matching list tool.` });
const CONFIRM = { type: 'boolean', const: true, description: 'Must be true. Set it only after the customer has explicitly confirmed this exact change.' };
const CUR = { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO 4217 currency code such as USD or AED (default USD).' };
const RO: Ann = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const W = (destructive: boolean, idempotent = false): Ann => ({ readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent, openWorldHint: false });

/* ------------------------------------------------------------------ input helpers */
const lc = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\.+$/, '');
function str(a: Record<string, unknown>, k: string, max: number, required = false): string | undefined {
  const v = a[k];
  if (v === undefined || v === null || v === '') { if (required) throw new ToolFail(`Missing required argument: ${k}`); return undefined; }
  if (typeof v !== 'string' || v.length > max) throw new ToolFail(`${k} must be text of at most ${max} characters`);
  return v.trim();
}
function intArg(a: Record<string, unknown>, k: string, min: number, max: number, required = false): number | undefined {
  const v = a[k];
  if (v === undefined || v === null || v === '') { if (required) throw new ToolFail(`Missing required argument: ${k}`); return undefined; }
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new ToolFail(`${k} must be a whole number between ${min} and ${max}`);
  return n;
}
const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== '').map((k) => [k, o[k]]));
const flag = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const day = (s: unknown) => (s && !/^0000/.test(String(s)) ? String(s).slice(0, 10) : null);
const daysLeft = (s: unknown) => { const d = day(s); return d ? Math.round((Date.parse(d) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000) : null; };
const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\r\n/g, '\n').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

function acc(ctx: ToolCtx): Access {
  if (!ctx.access) throw new ToolFail('Sign in to GlobalHostia to use this tool.', 'auth');
  return ctx.access;
}

async function ownedDomainRow(ctx: ToolCtx, raw: unknown): Promise<{ name: string; row: any | null }> {
  const a = acc(ctx);
  let name: string;
  try { name = ctx.deps.v.domainName(raw); } catch (e) { throw new ToolFail(e instanceof Error ? e.message : 'Invalid domain name'); }
  const [doms, svcs] = await Promise.all([ctx.deps.domains(a.cid), ctx.deps.services(a.cid)]);
  const row = doms.find((d) => lc(d.domainname) === name) || null;
  if (!row && !svcs.some((s) => lc(s.domain) === name)) {
    const mine = [...new Set([...doms.map((d) => lc(d.domainname)), ...svcs.map((s) => lc(s.domain))].filter(Boolean))];
    throw new ToolFail(`${name} is not on your GlobalHostia account. Your domains: ${mine.slice(0, 20).join(', ') || 'none'}.`, 'not_found');
  }
  return { name, row };
}

/** Reviewer mode: a reviewer account may only change the sandbox domain. */
function sandbox(ctx: ToolCtx, domain: string | null, what: string) {
  const a = acc(ctx);
  if (!ctx.reviewer.clientIds.includes(a.cid)) return;
  const sb = ctx.reviewer.sandboxDomain;
  if (!sb || !domain || (domain !== sb && !domain.endsWith(`.${sb}`))) throw new ToolFail(`This is a review account: ${what} is only allowed on the demo domain${sb ? ` ${sb}` : ''}.`, 'forbidden');
}
const isReviewer = (ctx: ToolCtx) => !!ctx.access && ctx.reviewer.clientIds.includes(ctx.access.cid);

function needConfirm(a: Record<string, unknown>, summary: string) {
  if (a.confirm !== true) throw new ToolFail(`Not done. ${summary} Ask the customer to confirm, then call again with confirm: true.`, 'confirm', { needs_confirmation: true, change: summary });
}

const recOut = (r: DnsRec) => pick(r, ['id', 'type', 'name', 'value', 'ttl', 'priority', 'weight', 'port', 'readonly']);
async function findRecord(ctx: ToolCtx, domain: string, id: unknown) {
  const rid = str({ id }, 'id', 2000, true)!;
  const list = await ctx.deps.dnsList(acc(ctx).cid, domain);
  if (!list.editable) throw new ToolFail(list.note || `DNS for ${domain} is not managed at GlobalHostia, so it cannot be changed here.`, 'unavailable');
  const old = list.records.find((r) => r.id === rid);
  if (!old) throw new ToolFail('That record no longer exists. Call list_dns_records for the current ids.', 'not_found');
  if (old.readonly) throw new ToolFail('Nameserver records are managed by GlobalHostia and cannot be changed.', 'forbidden');
  return old;
}

/* ------------------------------------------------------------------ the tools */
export const TOOLS: ToolDef[] = [
  /* ---------- public (no sign-in) ---------- */
  {
    name: 'search_plans', title: 'Search hosting plans', scope: null, commerce: true,
    description: 'Search GlobalHostia hosting, VPS, dedicated server, SSL and email plans by keyword, category, location and maximum monthly price. Returns plans with key specs, live price and product page. No sign-in needed.',
    inputSchema: obj({ query: { type: 'string', maxLength: 200, description: 'Keywords, e.g. "windows vps 8gb"' }, category: { type: 'string', maxLength: 80 }, location: { type: 'string', maxLength: 60 }, max_price: { type: 'number', minimum: 0, description: 'Maximum monthly price' }, currency: CUR, limit: { type: 'integer', minimum: 1, maximum: 20 } }),
    outputSchema: out({ currency: STR, count: NUM, results: ARR }), annotations: { title: 'Search hosting plans', ...RO },
    async run(a, ctx) {
      const r = await ctx.deps.searchPlans({ query: str(a, 'query', 200), category: str(a, 'category', 80), location: str(a, 'location', 60), max_price: a.max_price, currency: str(a, 'currency', 3), limit: intArg(a, 'limit', 1, 20) ?? 8 });
      return { summary: `${r.count} plan(s) found (prices in ${r.currency}).`, data: r };
    },
  },
  {
    name: 'recommend_plan', title: 'Recommend a hosting plan', scope: null, commerce: true,
    description: 'Pick the best GlobalHostia plans for a need described in words (e.g. "WordPress shop", "Windows VPS for MT5 under $20"), with optional budget, location, OS, RAM and number of websites. Returns ranked plans with reasons and live prices. No sign-in needed.',
    inputSchema: obj({ need: { type: 'string', minLength: 2, maxLength: 300 }, budget_monthly: { type: 'number', minimum: 0 }, currency: CUR, location: { type: 'string', maxLength: 60 }, os: { type: 'string', maxLength: 40 }, min_ram_gb: { type: 'number', minimum: 0, maximum: 4096 }, websites: { type: 'integer', minimum: 1, maximum: 10000 }, limit: { type: 'integer', minimum: 1, maximum: 5 } }, ['need']),
    outputSchema: out({ need: STR, recommendations: ARR }), annotations: { title: 'Recommend a hosting plan', ...RO },
    async run(a, ctx) {
      str(a, 'need', 300, true);
      const r = await ctx.deps.recommendPlan(a);
      const recs = (r.recommendations as any[]) || [];
      return { summary: recs.length ? `Top ${recs.length} plan(s): ${recs.map((x) => `${x.name} ${x.priceText || ''}`.trim()).join('; ')}.` : String(r.note || 'No plan matched.'), data: r };
    },
  },
  {
    name: 'check_domain_availability', title: 'Check domain availability', scope: null,
    description: 'Live registry check whether a domain name (e.g. mybrand.ae) is available to register at GlobalHostia (with the first-year and renewal price where shown). Limited to 10 checks per minute. No sign-in needed.',
    inputSchema: obj({ domain: { type: 'string', minLength: 3, maxLength: 253, description: 'Full domain, e.g. mybrand.com' }, currency: CUR }, ['domain']),
    outputSchema: out({ domain: STR, available: BOOL, currency: STR, register: {}, renew: {}, transfer: {} }),
    annotations: { title: 'Check domain availability', ...RO, idempotentHint: false, openWorldHint: true },
    async run(a, ctx) {
      const domain = str(a, 'domain', 253, true)!;
      const wait = ctx.deps.limit(ctx.access ? `c${ctx.access.cid}` : `ip${ctx.ip}`, 'domain');
      if (wait) throw new ToolFail(`Too many domain checks. Try again in ${wait}s.`, 'rate_limited', { retry_after: wait });
      const r = await ctx.deps.checkDomain(domain, str(a, 'currency', 3));
      if (r.ok === false) throw new ToolFail(String(r.message || 'That domain cannot be checked.'));
      // ChatGPT profile without commerce: availability only (no prices or cart links)
      const data: Record<string, unknown> = pick(r, ctx.commerce ? ['domain', 'tld', 'available', 'currency', 'register', 'renew', 'transfer', 'checkedAt'] : ['domain', 'tld', 'available', 'checkedAt']);
      if (ctx.commerce && r.available && r.addToCartUrl) data.add_to_cart_url = r.addToCartUrl;
      const price = ctx.commerce && r.register !== null && r.register !== undefined ? ` (${Number(r.register).toFixed(2)} ${r.currency} first year${r.renew != null ? `, renews at ${Number(r.renew).toFixed(2)}` : ''})` : '';
      return { summary: r.available ? `${r.domain} is available${price}.` : `${r.domain} is already registered.`, data };
    },
  },
  {
    name: 'search_premium_domains', title: 'Search premium domains for sale', scope: null, commerce: true,
    description: 'Premium domain names GlobalHostia has for sale (its own listings and selected registrar-marketplace listings), filtered by keyword, extension and maximum price (USD). Returns each name with its one-time price (or "make an offer") and the listing page, where the customer sends a purchase request; GlobalHostia confirms it, sends a secure invoice and transfers the domain. This tool never takes payment. No sign-in needed.',
    inputSchema: obj({ keyword: { type: 'string', maxLength: 40, description: 'Part of the name, e.g. "cloud"' }, tld: { type: 'string', maxLength: 24, description: 'Extension, e.g. ".ai"' }, max_price: { type: 'number', minimum: 0, description: 'Maximum price in USD' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }),
    outputSchema: out({ total: NUM, url: STR, items: ARR }), annotations: { title: 'Search premium domains for sale', ...RO },
    async run(a, ctx) {
      if (!ctx.deps.premiumSearch) throw new ToolFail('Premium domains are not available right now.');
      const max = typeof a.max_price === 'number' && a.max_price > 0 ? a.max_price : undefined;
      const r = await ctx.deps.premiumSearch({ keyword: str(a, 'keyword', 40), tld: str(a, 'tld', 24), maxPrice: max, limit: intArg(a, 'limit', 1, 20) ?? 8 });
      return { summary: r.items.length ? `${r.items.length} premium domain(s) for sale: ${r.items.map((x) => `${x.domain} ${x.price === null ? '(make an offer)' : `${x.price} ${x.currency}`}`).join('; ')}. Listing: ${r.url}` : `No premium domains for sale match. The domain broker can try to buy a taken name: ${r.url.replace(/\/premium-domains$/, '/domain-broker')}`, data: r };
    },
  },
  {
    name: 'create_cart_link', title: 'Create a checkout link', scope: null, commerce: true,
    description: 'Build a GlobalHostia cart link for one plan (slug from search_plans or recommend_plan) with the billing cycle and currency preselected, optionally attaching a domain. Returns the exact price for that cycle. The customer reviews and pays on globalhostia.com; this tool never takes payment. No sign-in needed.',
    inputSchema: obj({ slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,120}$' }, billing_cycle: { type: 'string', enum: ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially', 'onetime', 'free'] }, currency: CUR, domain: { type: 'string', maxLength: 253 } }, ['slug']),
    outputSchema: out({ name: STR, billingCycle: STR, price: NUM, setupFee: NUM, currency: STR, cartUrl: STR }), annotations: { title: 'Create a checkout link', ...RO },
    async run(a, ctx) {
      const slug = str(a, 'slug', 121, true)!.toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) throw new ToolFail('Invalid plan slug');
      const r = await ctx.deps.cartLink({ slug, cycle: str(a, 'billing_cycle', 20)?.toLowerCase(), currency: str(a, 'currency', 3), domain: str(a, 'domain', 253) });
      if (r.ok === false) throw new ToolFail(String(r.message), 'invalid', r);
      return { summary: `Checkout link for ${r.name} (${r.cycleLabel}, ${Number(r.price).toFixed(2)} ${r.currency}${r.setupFee ? ` + ${Number(r.setupFee).toFixed(2)} setup` : ''}): ${r.cartUrl}. The customer pays on globalhostia.com.`, data: r };
    },
  },
  {
    name: 'get_policies', title: 'Get refund, renewal and tax policies', scope: null,
    description: 'GlobalHostia customer policies from the published terms: money-back guarantee, domain and SSL refunds, cancellation, automatic renewal, billing, taxes and VAT, domain expiry, with the source link.',
    inputSchema: obj({ topic: { type: 'string', enum: ['all', 'refunds', 'renewal', 'taxes', 'cancellation', 'domains'] } }),
    outputSchema: out({ policies: ARR, source: STR }), annotations: { title: 'Get refund, renewal and tax policies', ...RO },
    async run(a, ctx) {
      const r = await ctx.deps.policies(str(a, 'topic', 20));
      return { summary: ((r.policies as any[]) || []).map((p) => `${p.title}: ${p.summary}`).join('\n'), data: r };
    },
  },

  /* ---------- account: read ---------- */
  {
    name: 'get_account_overview', title: 'Get account overview', scope: 'account:read',
    description: 'Summary of the signed-in GlobalHostia account: name and company, number of active services and domains, domains expiring within 30 days, and (with the matching permissions) unpaid invoices and open tickets.',
    inputSchema: obj({}), outputSchema: out({ name: STR, company: STR, currency: STR, services: OBJ, domains: OBJ, invoices: OBJ, tickets: OBJ }),
    annotations: { title: 'Get account overview', ...RO },
    async run(_a, ctx) {
      const a = acc(ctx), d = ctx.deps;
      const [c, svcs, doms] = await Promise.all([d.client(a.cid), d.services(a.cid), d.domains(a.cid)]);
      const active = svcs.filter((s) => /^active$/i.test(String(s.status)));
      const live = doms.filter((x) => /^(active|grace|redemption)$/i.test(String(x.status)));
      const soon = live.filter((x) => { const n = daysLeft(x.expirydate); return n !== null && n <= 30; });
      const data: Record<string, unknown> = {
        name: `${c?.firstname || ''} ${c?.lastname || ''}`.trim(), company: c?.companyname || '', currency: c?.currency_code || 'USD',
        services: { active: active.length, total: svcs.length, suspended: svcs.filter((s) => /suspend/i.test(String(s.status))).length },
        domains: { active: live.length, expiring_30_days: soon.map((x) => ({ domain: lc(x.domainname), expires: day(x.expirydate), auto_renew: !flag(x.donotrenew) })) },
        manage_url: `${d.urls.site}/account`,
      };
      if (a.scopes.includes('billing:read')) {
        const unpaid = await d.invoices(a.cid, 'Unpaid');
        data.invoices = { unpaid: unpaid.length, unpaid_total: Math.round(unpaid.reduce((t, i) => t + (num(i.total) || 0), 0) * 100) / 100, currency: unpaid[0]?.currencycode || data.currency };
      }
      if (a.scopes.includes('support:read')) {
        const tk = await d.tickets(a.cid);
        data.tickets = { open: tk.filter((t) => !/^closed$/i.test(String(t.status))).length, awaiting_your_reply: tk.filter((t) => /answered/i.test(String(t.status))).length };
      }
      return { summary: `${data.name || 'Account'}: ${active.length} active service(s), ${live.length} domain(s), ${soon.length} expiring within 30 days.`, data };
    },
  },
  {
    name: 'list_services', title: 'List services', scope: 'account:read',
    description: 'The hosting, VPS, server, SSL and email services on the signed-in account: id, product, domain, status, billing cycle, recurring amount and next due date.',
    inputSchema: obj({ status: { type: 'string', enum: ['active', 'all'], description: 'Default all (cancelled and terminated included).' } }),
    outputSchema: out({ count: NUM, services: ARR }), annotations: { title: 'List services', ...RO },
    async run(a, ctx) {
      const list = (await ctx.deps.services(acc(ctx).cid)).filter((s) => str(a, 'status', 10) !== 'active' || /^active$/i.test(String(s.status)));
      const services = list.slice(0, 60).map((s) => ({ id: Number(s.id), product: s.translated_name || s.name, group: s.translated_groupname || s.groupname, domain: s.domain || null, status: s.status, billing_cycle: s.billingcycle, amount: num(s.recurringamount), next_due: day(s.nextduedate) }));
      return { summary: `${list.length} service(s).`, data: { count: list.length, services } };
    },
  },
  {
    name: 'get_service', title: 'Get service details', scope: 'account:read',
    description: 'One service on the account by id: product, domain, status, billing, IP addresses, configuration (OS, location, CPU, RAM) and disk / bandwidth usage when the server reports it. Never includes passwords.',
    inputSchema: obj({ service_id: ID('Service') }, ['service_id']),
    outputSchema: out({ id: NUM, product: STR, status: STR, usage: {} }), annotations: { title: 'Get service details', ...RO },
    async run(a, ctx) {
      const ac = acc(ctx), id = intArg(a, 'service_id', 1, 2 ** 31, true)!;
      const s = await ctx.deps.service(ac.cid, id);
      if (!s) throw new ToolFail(`Service ${id} is not on your account. Use list_services.`, 'not_found');
      const cfg = (Array.isArray(s.configoptions?.configoption) ? s.configoptions.configoption : []).map((o: any) => ({ option: o.option, value: o.value })).filter((o: any) => o.value);
      const ips = [s.dedicatedip, ...String(s.assignedips || '').split(/[\s,]+/)].map((x) => String(x || '').trim()).filter(Boolean);
      const usage = await ctx.deps.serviceUsage(ac.cid, s).catch(() => null);
      const data = {
        id, product: s.translated_name || s.name, group: s.translated_groupname || s.groupname, domain: s.domain || null, status: s.status,
        billing_cycle: s.billingcycle, amount: num(s.recurringamount), next_due: day(s.nextduedate), registered: day(s.regdate), ips, configuration: cfg,
        usage: usage || (num(s.disklimit) ? { disk_mb: num(s.diskusage), disk_limit_mb: num(s.disklimit), bandwidth_mb: num(s.bwusage), bandwidth_limit_mb: num(s.bwlimit) || null, updated: s.lastupdate || null } : null),
        manage_url: `${ctx.deps.urls.site}/account/services/${id}`,
      };
      return { summary: `${data.product}${data.domain ? ` (${data.domain})` : ''}: ${data.status}, next due ${data.next_due || 'n/a'}.`, data };
    },
  },
  {
    name: 'list_domains', title: 'List domains', scope: 'account:read',
    description: 'Domains registered on the account with status, expiry date, days left and whether auto-renew is on.',
    inputSchema: obj({ expiring_within_days: { type: 'integer', minimum: 1, maximum: 3650, description: 'Only domains expiring within this many days.' } }),
    outputSchema: out({ count: NUM, domains: ARR }), annotations: { title: 'List domains', ...RO },
    async run(a, ctx) {
      const within = intArg(a, 'expiring_within_days', 1, 3650);
      const rows = (await ctx.deps.domains(acc(ctx).cid)).map((d) => ({ id: Number(d.id), domain: lc(d.domainname), status: d.status, expires: day(d.expirydate), days_left: daysLeft(d.expirydate), auto_renew: !flag(d.donotrenew), renewal_amount: num(d.recurringamount) }))
        .filter((d) => within === undefined || (d.days_left !== null && d.days_left <= within)).sort((x, y) => (x.days_left ?? 1e9) - (y.days_left ?? 1e9));
      return { summary: `${rows.length} domain(s)${within ? ` expiring within ${within} days` : ''}.`, data: { count: rows.length, domains: rows.slice(0, 100) } };
    },
  },
  {
    name: 'get_domain', title: 'Get domain details', scope: 'account:read',
    description: 'One domain on the account: status, registration and expiry dates, auto-renew, nameservers, and whether its DNS is managed at GlobalHostia (and can be edited with the DNS tools).',
    inputSchema: obj({ domain: DOMAIN }, ['domain']),
    outputSchema: out({ domain: STR, status: STR, expires: STR, auto_renew: BOOL, nameservers: ARR, dns: OBJ }), annotations: { title: 'Get domain details', ...RO },
    async run(a, ctx) {
      const ac = acc(ctx);
      const { name, row } = await ownedDomainRow(ctx, a.domain);
      const ns = row ? await ctx.deps.nameservers(Number(row.id)).catch(() => null) : null;
      const dns = await ctx.deps.dnsStatus(ac.cid, row || { domainname: name, status: 'Active' }, ns).catch(() => ({ managed: false, where: 'unknown' }));
      const data = row
        ? { domain: name, registered_here: true, status: row.status, registered: day(row.regdate), expires: day(row.expirydate), days_left: daysLeft(row.expirydate), auto_renew: !flag(row.donotrenew), renewal_amount: num(row.recurringamount), nameservers: ns, dns, manage_url: `${ctx.deps.urls.site}/account/domains/${row.id}` }
        : { domain: name, registered_here: false, note: 'This domain is used by a hosting service on your account but registered elsewhere.', nameservers: ns, dns };
      return { summary: `${name}: ${row ? `${row.status}, expires ${data.expires}, auto-renew ${(data as any).auto_renew ? 'on' : 'off'}` : 'registered elsewhere'}; DNS ${dns.managed ? 'managed at GlobalHostia' : dns.where}.`, data };
    },
  },
  {
    name: 'list_dns_records', title: 'List DNS records', scope: 'dns:read',
    description: 'DNS records (A, AAAA, CNAME, MX, TXT, SRV, NS) of a domain on the account when its DNS is managed at GlobalHostia, with the record ids needed by update_dns_record and delete_dns_record.',
    inputSchema: obj({ domain: DOMAIN, type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS', 'CAA'] } }, ['domain']),
    outputSchema: out({ domain: STR, editable: BOOL, records: ARR }), annotations: { title: 'List DNS records', ...RO },
    async run(a, ctx) {
      const { name } = await ownedDomainRow(ctx, a.domain);
      const type = str(a, 'type', 10)?.toUpperCase();
      const r = await ctx.deps.dnsList(acc(ctx).cid, name);
      const records = r.records.filter((x) => !type || x.type === type).slice(0, 150).map(recOut);
      return { summary: r.editable ? `${records.length} record(s) for ${name}.` : r.note || `DNS for ${name} is not managed at GlobalHostia.`, data: { domain: name, editable: r.editable, note: r.note, records } };
    },
  },
  {
    name: 'site_health', title: 'Check site health', scope: 'account:read',
    description: 'Health check for a domain on the account: DNS and nameservers, website reachability, SSL certificate, and email authentication (SPF, DKIM, DMARC), with a score and suggested fixes.',
    inputSchema: obj({ domain: DOMAIN }, ['domain']),
    outputSchema: out({ domain: STR, score: NUM, issues: ARR, passed: NUM }), annotations: { title: 'Check site health', ...RO, idempotentHint: false, openWorldHint: true },
    async run(a, ctx) {
      const { name } = await ownedDomainRow(ctx, a.domain);
      const w = ctx.deps.limit(`c${acc(ctx).cid}:health`, 'domain');
      if (w) throw new ToolFail(`Too many health checks. Try again in ${w}s.`, 'rate_limited');
      const h = await ctx.deps.health(acc(ctx).cid, name);
      const items = (h?.sections || []).flatMap((s: any) => (s.items || []).map((i: any) => ({ section: s.title || s.id, status: i.status, check: i.title, detail: clip(i.detail, 300), fix: i.fix?.kind === 'dns' ? { add_dns_record: i.fix.record } : undefined })));
      const issues = items.filter((i: any) => i.status !== 'ok' && i.status !== 'pass');
      return { summary: `${name}: score ${h?.score ?? '?'} / 100, ${issues.length} issue(s).`, data: { domain: name, score: h?.score ?? null, issues, passed: items.length - issues.length } };
    },
  },
  {
    name: 'email_settings', title: 'Get email settings', scope: 'account:read',
    description: 'Mail server settings (IMAP, POP3, SMTP host names, ports, encryption) for a domain on the account, and its mailboxes when the domain is on GlobalHostia hosting.',
    inputSchema: obj({ domain: DOMAIN }, ['domain']),
    outputSchema: out({ domain: STR, settings: OBJ, mailboxes: {} }), annotations: { title: 'Get email settings', ...RO },
    async run(a, ctx) {
      const { name } = await ownedDomainRow(ctx, a.domain);
      const [settings, boxes] = await Promise.all([ctx.deps.mailSettings(acc(ctx).cid, name), ctx.deps.mailboxes(acc(ctx).cid, name).catch(() => null)]);
      return { summary: `Email settings for ${name}${boxes ? `, ${boxes.length} mailbox(es)` : ''}.`, data: { domain: name, settings, mailboxes: boxes } };
    },
  },
  {
    name: 'list_invoices', title: 'List invoices', scope: 'billing:read',
    description: 'Invoices on the account (newest first), optionally only Unpaid, Paid, Overdue or Cancelled: number, dates, total, currency and status.',
    inputSchema: obj({ status: { type: 'string', enum: ['Unpaid', 'Paid', 'Overdue', 'Cancelled'] } }),
    outputSchema: out({ count: NUM, invoices: ARR }), annotations: { title: 'List invoices', ...RO },
    async run(a, ctx) {
      const status = str(a, 'status', 12);
      if (status && !['Unpaid', 'Paid', 'Overdue', 'Cancelled'].includes(status)) throw new ToolFail('status must be Unpaid, Paid, Overdue or Cancelled');
      const list = await ctx.deps.invoices(acc(ctx).cid, status);
      const invoices = list.slice(0, 40).map((i) => ({ id: Number(i.id), number: i.invoicenum || String(i.id), date: day(i.date), due: day(i.duedate), paid: day(i.datepaid), total: num(i.total), currency: i.currencycode, status: i.status }));
      return { summary: `${list.length} invoice(s)${status ? ` (${status})` : ''}.`, data: { count: list.length, invoices } };
    },
  },
  {
    name: 'get_invoice', title: 'Get invoice details', scope: 'billing:read',
    description: 'One invoice by id: line items, subtotal, tax, credit, total, balance, status and payments received. Card and bank details are never included.',
    inputSchema: obj({ invoice_id: ID('Invoice') }, ['invoice_id']),
    outputSchema: out({ id: NUM, status: STR, total: NUM, items: ARR }), annotations: { title: 'Get invoice details', ...RO },
    async run(a, ctx) {
      const id = intArg(a, 'invoice_id', 1, 2 ** 31, true)!;
      const i = await ctx.deps.invoice(acc(ctx).cid, id);
      if (!i) throw new ToolFail(`Invoice ${id} is not on your account. Use list_invoices.`, 'not_found');
      const data: Record<string, unknown> = {
        id, number: i.invoicenum || String(id), status: i.status, date: day(i.date), due: day(i.duedate), paid: day(i.datepaid), currency: i.currencycode,
        subtotal: num(i.subtotal), tax: num(i.tax), tax2: num(i.tax2), credit: num(i.credit), total: num(i.total), balance: num(i.balance),
        items: (i.items || []).slice(0, 50).map((x: any) => ({ description: clip(x.description, 300), amount: num(x.amount), type: x.type || undefined })),
        payments: (i.transactions || []).slice(0, 20).map((x: any) => ({ date: day(x.date), amount: num(x.amountin), method: x.gateway || undefined })),
        view_url: `${ctx.deps.urls.site}/account/invoices/${id}`,
      };
      return { summary: `Invoice #${data.number}: ${data.status}, total ${data.total} ${data.currency || ''}${data.balance ? `, balance ${data.balance}` : ''}.`, data };
    },
  },
  {
    name: 'list_tickets', title: 'List support tickets', scope: 'support:read',
    description: 'Support tickets on the account: id, ticket number, subject, department, status, priority and last reply time.',
    inputSchema: obj({ status: { type: 'string', enum: ['open', 'all'], description: 'Default all.' } }),
    outputSchema: out({ count: NUM, tickets: ARR }), annotations: { title: 'List support tickets', ...RO },
    async run(a, ctx) {
      const list = (await ctx.deps.tickets(acc(ctx).cid)).filter((t) => str(a, 'status', 6) !== 'open' || !/^closed$/i.test(String(t.status)));
      const tickets = list.slice(0, 40).map((t) => ({ id: Number(t.id), number: t.tid, subject: clip(t.subject, 200), department: t.deptname, status: t.status, priority: t.priority, last_reply: t.lastreply }));
      return { summary: `${list.length} ticket(s).`, data: { count: list.length, tickets } };
    },
  },
  {
    name: 'get_ticket', title: 'Get support ticket', scope: 'support:read',
    description: 'One support ticket by id with its conversation (latest 20 messages, each shortened to 2,000 characters).',
    inputSchema: obj({ ticket_id: ID('Ticket') }, ['ticket_id']),
    outputSchema: out({ id: NUM, subject: STR, status: STR, messages: ARR }), annotations: { title: 'Get support ticket', ...RO },
    async run(a, ctx) {
      const id = intArg(a, 'ticket_id', 1, 2 ** 31, true)!;
      const t = await ctx.deps.ticket(acc(ctx).cid, id);
      if (!t) throw new ToolFail(`Ticket ${id} is not on your account. Use list_tickets.`, 'not_found');
      const msgs = (t.replies || []).slice(-20).map((r: any) => ({ from: r.admin ? 'GlobalHostia support' : 'you', name: r.admin || r.name || undefined, date: r.date, message: clip(r.message, 2000) }));
      return { summary: `Ticket #${t.tid}: ${clip(t.subject, 120)} (${t.status}), ${msgs.length} message(s).`, data: { id, number: t.tid, subject: t.subject, department: t.deptname, status: t.status, priority: t.priority, messages: msgs, view_url: `${ctx.deps.urls.site}/account/support/${id}` } };
    },
  },
  {
    name: 'get_renewals', title: 'Get upcoming renewals', scope: 'account:read',
    description: 'Everything on the account that renews: services and domains with renewal date, days left, amount, billing cycle and auto-renew, soonest first.',
    inputSchema: obj({ within_days: { type: 'integer', minimum: 1, maximum: 3650, description: 'Default 90.' } }),
    outputSchema: out({ count: NUM, total: NUM, items: ARR }), annotations: { title: 'Get upcoming renewals', ...RO },
    async run(a, ctx) {
      const within = intArg(a, 'within_days', 1, 3650) ?? 90;
      const rows = (await ctx.deps.renewals(acc(ctx).cid)).filter((r) => r.days <= within);
      const items = rows.slice(0, 80).map((r) => ({ item: r.key, kind: r.kind, name: r.name, product: r.product || undefined, date: r.date, days_left: r.days, amount: r.amount, billing_cycle: r.cycle, auto_renew: r.autoRenew, unpaid_invoice_id: r.invoiceId }));
      const total = Math.round(rows.reduce((t, r) => t + (r.amount || 0), 0) * 100) / 100;
      return { summary: `${rows.length} item(s) renew within ${within} days, about ${total} in total.`, data: { count: rows.length, within_days: within, total, items } };
    },
  },

  /* ---------- account: write ---------- */
  {
    name: 'add_dns_record', title: 'Add a DNS record', scope: 'dns:write',
    description: 'Add one DNS record (A, AAAA, CNAME, MX, TXT or SRV) to a domain on the account whose DNS is managed at GlobalHostia. Name is relative to the domain ("@" for the domain itself, "www", "_dmarc").',
    inputSchema: obj({ domain: DOMAIN, type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV'] }, name: { type: 'string', maxLength: 255, description: '"@" for the domain itself, or a host such as www' }, value: { type: 'string', minLength: 1, maxLength: 2048 }, ttl: { type: 'integer', minimum: 60, maximum: 604800 }, priority: { type: 'integer', minimum: 0, maximum: 65535, description: 'MX and SRV' }, weight: { type: 'integer', minimum: 0, maximum: 65535, description: 'SRV' }, port: { type: 'integer', minimum: 1, maximum: 65535, description: 'SRV' } }, ['domain', 'type', 'name', 'value']),
    outputSchema: out({ domain: STR, added: OBJ }), annotations: { title: 'Add a DNS record', ...W(false) },
    async run(a, ctx) {
      const { name } = await ownedDomainRow(ctx, a.domain);
      let rec;
      try { rec = ctx.deps.v.dnsRecord({ type: a.type, name: a.name, value: a.value, ttl: a.ttl, priority: a.priority, weight: a.weight, port: a.port }, name); }
      catch (e) { throw new ToolFail(e instanceof Error ? e.message : 'Invalid record'); }
      sandbox(ctx, name, 'changing DNS');
      const list = await ctx.deps.dnsList(acc(ctx).cid, name);
      if (!list.editable) throw new ToolFail(list.note || `DNS for ${name} is not managed at GlobalHostia, so records must be added where it is hosted.`, 'unavailable');
      await ctx.deps.dnsAdd(acc(ctx).cid, name, rec);
      return { summary: `Added ${rec.type} ${rec.name} → ${rec.value}${rec.priority !== undefined ? ` (priority ${rec.priority})` : ''} on ${name}. Changes usually spread within an hour.`, data: { domain: name, added: rec } };
    },
  },
  {
    name: 'update_dns_record', title: 'Update a DNS record', scope: 'dns:write', confirm: true,
    description: 'Replace the value, TTL or priority of one existing DNS record (record_id from list_dns_records). Overwrites the old value, so it needs confirm: true after the customer approves.',
    inputSchema: obj({ domain: DOMAIN, record_id: { type: 'string', minLength: 1, maxLength: 2000 }, name: { type: 'string', maxLength: 255 }, value: { type: 'string', minLength: 1, maxLength: 2048 }, ttl: { type: 'integer', minimum: 60, maximum: 604800 }, priority: { type: 'integer', minimum: 0, maximum: 65535 }, weight: { type: 'integer', minimum: 0, maximum: 65535 }, port: { type: 'integer', minimum: 1, maximum: 65535 }, confirm: CONFIRM }, ['domain', 'record_id', 'value']),
    outputSchema: out({ domain: STR, old: OBJ, new: OBJ }), annotations: { title: 'Update a DNS record', ...W(true, true) },
    async run(a, ctx) {
      const { name } = await ownedDomainRow(ctx, a.domain);
      sandbox(ctx, name, 'changing DNS');
      const old = await findRecord(ctx, name, a.record_id);
      let rec;
      try { rec = ctx.deps.v.dnsRecord({ type: old.type, name: a.name ?? old.name, value: a.value, ttl: a.ttl ?? old.ttl, priority: a.priority ?? old.priority, weight: a.weight ?? old.weight, port: a.port ?? old.port }, name); }
      catch (e) { throw new ToolFail(e instanceof Error ? e.message : 'Invalid record'); }
      needConfirm(a, `This replaces ${old.type} ${old.name} "${old.value}" with "${rec.value}" on ${name}.`);
      await ctx.deps.dnsEdit(acc(ctx).cid, name, old, rec);
      return { summary: `Updated ${old.type} ${rec.name} on ${name}: "${old.value}" → "${rec.value}".`, data: { domain: name, old: recOut(old), new: rec } };
    },
  },
  {
    name: 'delete_dns_record', title: 'Delete a DNS record', scope: 'dns:write', confirm: true,
    description: 'Delete one DNS record (record_id from list_dns_records) from a domain on the account. Irreversible: needs confirm: true after the customer approves.',
    inputSchema: obj({ domain: DOMAIN, record_id: { type: 'string', minLength: 1, maxLength: 2000 }, confirm: CONFIRM }, ['domain', 'record_id']),
    outputSchema: out({ domain: STR, deleted: OBJ }), annotations: { title: 'Delete a DNS record', ...W(true, true) },
    async run(a, ctx) {
      const { name } = await ownedDomainRow(ctx, a.domain);
      sandbox(ctx, name, 'changing DNS');
      const old = await findRecord(ctx, name, a.record_id);
      needConfirm(a, `This deletes ${old.type} ${old.name} "${old.value}" from ${name}.`);
      await ctx.deps.dnsDelete(acc(ctx).cid, name, old);
      return { summary: `Deleted ${old.type} ${old.name} "${old.value}" from ${name}.`, data: { domain: name, deleted: recOut(old) } };
    },
  },
  {
    name: 'create_mailbox', title: 'Create a mailbox', scope: 'email:write',
    description: 'Create a mailbox such as sales@mybrand.com on GlobalHostia hosting. A strong random password is set and never shown; the customer sets their own password in the control panel (link returned).',
    inputSchema: obj({ email: { type: 'string', minLength: 3, maxLength: 254, description: 'Full address, e.g. sales@mybrand.com' }, quota_mb: { type: 'integer', minimum: 0, maximum: 102400, description: 'Mailbox size in MB, 0 = unlimited (default 1024).' } }, ['email']),
    outputSchema: out({ email: STR, quota_mb: NUM, set_password_url: STR }), annotations: { title: 'Create a mailbox', ...W(false) },
    async run(a, ctx) {
      const email = str(a, 'email', 254, true)!.toLowerCase();
      const at = email.lastIndexOf('@');
      if (at < 1) throw new ToolFail('Give the full address, e.g. sales@mybrand.com');
      const { name } = await ownedDomainRow(ctx, email.slice(at + 1));
      let user: string, quota: number;
      try { user = ctx.deps.v.mailUser(email.slice(0, at)); quota = ctx.deps.v.quotaMb(a.quota_mb ?? 1024); } catch (e) { throw new ToolFail(e instanceof Error ? e.message : 'Invalid mailbox'); }
      sandbox(ctx, name, 'creating mailboxes');
      const r = await ctx.deps.createMailbox(acc(ctx).cid, name, user, quota);
      return { summary: `Created ${user}@${name} (${quota ? `${quota} MB` : 'unlimited'}). Set its password in the control panel before use: ${r.manageUrl}`, data: { email: `${user}@${name}`, quota_mb: quota, set_password_url: r.manageUrl } };
    },
  },
  {
    name: 'delete_mailbox', title: 'Delete a mailbox', scope: 'email:write', confirm: true,
    description: 'Delete a mailbox and all of its email from GlobalHostia hosting. Irreversible: needs confirm: true after the customer approves.',
    inputSchema: obj({ email: { type: 'string', minLength: 3, maxLength: 254 }, confirm: CONFIRM }, ['email']),
    outputSchema: out({ deleted: STR }), annotations: { title: 'Delete a mailbox', ...W(true, true) },
    async run(a, ctx) {
      const email = str(a, 'email', 254, true)!.toLowerCase();
      const at = email.lastIndexOf('@');
      if (at < 1) throw new ToolFail('Give the full address, e.g. sales@mybrand.com');
      const { name } = await ownedDomainRow(ctx, email.slice(at + 1));
      let user: string;
      try { user = ctx.deps.v.mailUser(email.slice(0, at)); } catch (e) { throw new ToolFail(e instanceof Error ? e.message : 'Invalid mailbox'); }
      sandbox(ctx, name, 'deleting mailboxes');
      const boxes = await ctx.deps.mailboxes(acc(ctx).cid, name);
      if (boxes && !boxes.some((b) => b.email.toLowerCase() === `${user}@${name}`)) throw new ToolFail(`${user}@${name} does not exist. Mailboxes: ${boxes.map((b) => b.email).join(', ') || 'none'}.`, 'not_found');
      needConfirm(a, `This permanently deletes ${user}@${name} and all of its email.`);
      await ctx.deps.deleteMailbox(acc(ctx).cid, name, user);
      return { summary: `Deleted ${user}@${name}.`, data: { deleted: `${user}@${name}` } };
    },
  },
  {
    name: 'issue_ssl', title: 'Issue a free SSL certificate', scope: 'ssl:write',
    description: 'Request a free SSL certificate (Let\'s Encrypt) for a domain on GlobalHostia hosting, optionally including www. The domain must already point to the hosting server.',
    inputSchema: obj({ domain: DOMAIN, include_www: { type: 'boolean', description: 'Default true.' } }, ['domain']),
    outputSchema: out({ domain: STR, include_www: BOOL, result: STR }), annotations: { title: 'Issue a free SSL certificate', ...W(false, true) },
    async run(a, ctx) {
      const { name } = await ownedDomainRow(ctx, a.domain);
      sandbox(ctx, name, 'issuing certificates');
      const www = a.include_www !== false;
      const msg = await ctx.deps.issueSsl(acc(ctx).cid, name, www);
      return { summary: `SSL requested for ${name}${www ? ` and www.${name}` : ''}: ${msg}`, data: { domain: name, include_www: www, result: msg } };
    },
  },
  {
    name: 'open_ticket', title: 'Open a support ticket', scope: 'support:write',
    description: 'Open a support ticket in the customer\'s name (department Technical, Billing or Sales; default Technical). Use for anything the tools cannot do, such as refunds, cancellations or server problems.',
    inputSchema: obj({ subject: { type: 'string', minLength: 3, maxLength: 150 }, message: { type: 'string', minLength: 10, maxLength: 5000 }, department: { type: 'string', maxLength: 40 }, priority: { type: 'string', enum: ['Low', 'Medium', 'High'] }, service_id: ID('Related service') }, ['subject', 'message']),
    outputSchema: out({ id: NUM, number: STR, department: STR, view_url: STR }), annotations: { title: 'Open a support ticket', ...W(false) },
    async run(a, ctx) {
      const ac = acc(ctx);
      const subject = str(a, 'subject', 150, true)!, message = str(a, 'message', 5000, true)!;
      if (subject.length < 3 || message.length < 10) throw new ToolFail('Write a subject (3+ characters) and a message (10+ characters).');
      const priority = str(a, 'priority', 10) || 'Medium';
      if (!['Low', 'Medium', 'High'].includes(priority)) throw new ToolFail('priority must be Low, Medium or High');
      const sid = intArg(a, 'service_id', 1, 2 ** 31);
      if (sid && !(await ctx.deps.service(ac.cid, sid))) throw new ToolFail(`Service ${sid} is not on your account.`, 'not_found');
      const depts = await ctx.deps.departments();
      const want = (str(a, 'department', 40) || '').toLowerCase();
      const dept = depts.find((d) => want && d.name.toLowerCase().includes(want)) || depts.find((d) => /tech|support/i.test(d.name)) || depts[0];
      if (!dept) throw new ToolFail('Tickets cannot be opened right now. Email support@globalhostia.com instead.', 'unavailable');
      const r = await ctx.deps.openTicket(ac.cid, { deptid: dept.id, subject: isReviewer(ctx) ? `[Review] ${subject}`.slice(0, 150) : subject, message, priority, serviceid: sid });
      return { summary: `Opened ticket #${r.tid} (${dept.name}). Our team replies by email and in the account.`, data: { id: r.id, number: r.tid, department: dept.name, view_url: `${ctx.deps.urls.site}/account/support/${r.id}` } };
    },
  },
  {
    name: 'reply_ticket', title: 'Reply to a support ticket', scope: 'support:write',
    description: 'Add a reply in the customer\'s name to one of their support tickets (ticket_id from list_tickets).',
    inputSchema: obj({ ticket_id: ID('Ticket'), message: { type: 'string', minLength: 2, maxLength: 5000 } }, ['ticket_id', 'message']),
    outputSchema: out({ id: NUM, replied: BOOL }), annotations: { title: 'Reply to a support ticket', ...W(false) },
    async run(a, ctx) {
      const ac = acc(ctx), id = intArg(a, 'ticket_id', 1, 2 ** 31, true)!;
      const message = str(a, 'message', 5000, true)!;
      const t = await ctx.deps.ticket(ac.cid, id);
      if (!t) throw new ToolFail(`Ticket ${id} is not on your account. Use list_tickets.`, 'not_found');
      await ctx.deps.replyTicket(ac.cid, id, message);
      return { summary: `Reply added to ticket #${t.tid}.`, data: { id, number: t.tid, replied: true } };
    },
  },
  {
    name: 'set_domain_autorenew', title: 'Turn domain auto-renew on or off', scope: 'domains:write',
    description: 'Turn automatic renewal on or off for a domain registered at GlobalHostia. With auto-renew off, the domain expires unless renewed manually.',
    inputSchema: obj({ domain: DOMAIN, enabled: { type: 'boolean' } }, ['domain', 'enabled']),
    outputSchema: out({ domain: STR, auto_renew: BOOL }), annotations: { title: 'Turn domain auto-renew on or off', ...W(false, true) },
    async run(a, ctx) {
      if (typeof a.enabled !== 'boolean') throw new ToolFail('enabled must be true or false');
      const { name, row } = await ownedDomainRow(ctx, a.domain);
      if (!row) throw new ToolFail(`${name} is not registered at GlobalHostia, so auto-renew is set where it is registered.`, 'not_found');
      if (!/^(active|grace)$/i.test(String(row.status))) throw new ToolFail(`Auto-renew can only be changed while the domain is active (it is ${row.status}).`);
      sandbox(ctx, name, 'changing domain settings');
      const ok = await ctx.deps.setAutoRenew(acc(ctx).cid, Number(row.id), a.enabled);
      if (!ok) throw new ToolFail('The registry did not accept the change. Please try again or open a ticket.', 'unavailable');
      return { summary: `Auto-renew is now ${a.enabled ? 'on' : 'off'} for ${name}.${a.enabled ? '' : ` It expires ${day(row.expirydate) || 'at the end of its term'} unless renewed.`}`, data: { domain: name, auto_renew: a.enabled, expires: day(row.expirydate) } };
    },
  },
  {
    name: 'set_nameservers', title: 'Change domain nameservers', scope: 'domains:write', confirm: true,
    description: 'Replace the nameservers of a domain registered at GlobalHostia (2 to 5 host names). Wrong nameservers take the website and email offline, so it needs confirm: true after the customer approves.',
    inputSchema: obj({ domain: DOMAIN, nameservers: { type: 'array', minItems: 2, maxItems: 5, uniqueItems: true, items: { type: 'string', minLength: 4, maxLength: 253 } }, confirm: CONFIRM }, ['domain', 'nameservers']),
    outputSchema: out({ domain: STR, old: ARR, new: ARR }), annotations: { title: 'Change domain nameservers', ...W(true, true) },
    async run(a, ctx) {
      const { name, row } = await ownedDomainRow(ctx, a.domain);
      if (!row) throw new ToolFail(`${name} is not registered at GlobalHostia, so nameservers are changed where it is registered.`, 'not_found');
      if (!/^active$/i.test(String(row.status))) throw new ToolFail(`Nameservers can only be changed while the domain is active (it is ${row.status}).`);
      if (!Array.isArray(a.nameservers)) throw new ToolFail('nameservers must be a list of 2 to 5 host names');
      const v = ctx.deps.v.nameservers(a.nameservers.map((x) => String(x)));
      if (!v.ok) throw new ToolFail(v.error);
      sandbox(ctx, name, 'changing nameservers');
      const old = await ctx.deps.nameservers(Number(row.id)).catch(() => null);
      needConfirm(a, `This changes the nameservers of ${name} from ${(old || []).join(', ') || 'unknown'} to ${v.ns.join(', ')}. The website and email stop working if the new nameservers do not have the domain's DNS.`);
      await ctx.deps.setNameservers(Number(row.id), v.ns);
      return { summary: `Nameservers of ${name} changed to ${v.ns.join(', ')}. It can take up to 24 hours to spread.`, data: { domain: name, old: old || [], new: v.ns } };
    },
  },
  {
    name: 'renew_items_link', title: 'Get renewal links', scope: 'cart:write', commerce: true,
    description: 'Links where the customer renews services and domains on their account (items from get_renewals, or everything due within 30 days). Unpaid renewal invoices link to the invoice. Payment always happens on globalhostia.com; this tool never charges anything.',
    inputSchema: obj({ items: { type: 'array', maxItems: 50, items: { type: 'string', pattern: '^[sd]:\\d{1,10}$' }, description: 'Item keys from get_renewals, e.g. "d:301" or "s:102".' } }),
    outputSchema: out({ checkout_url: STR, items: ARR }), annotations: { title: 'Get renewal links', ...RO, idempotentHint: true },
    async run(a, ctx) {
      const rows = await ctx.deps.renewals(acc(ctx).cid);
      const want = Array.isArray(a.items) ? a.items.map(String) : null;
      if (want && want.some((k) => !/^[sd]:\d{1,10}$/.test(k))) throw new ToolFail('items must look like "d:301" or "s:102" (from get_renewals)');
      const sel = want ? rows.filter((r) => want.includes(r.key)) : rows.filter((r) => r.days <= 30);
      if (want && sel.length !== want.length) throw new ToolFail(`Not on your account: ${want.filter((k) => !rows.some((r) => r.key === k)).join(', ')}. Use get_renewals.`, 'not_found');
      const { site, clientArea } = ctx.deps.urls;
      const items = sel.map((r) => ({ item: r.key, name: r.name, amount: r.amount, date: r.date,
        url: r.invoiceId ? `${site}/account/invoices/${r.invoiceId}` : r.kind === 'domain' ? `${clientArea}/index.php?rp=/cart/domain/renew/${encodeURIComponent(r.name)}` : `${site}/account/renewals` }));
      return { summary: items.length ? `Renew ${items.length} item(s) in the renewal centre: ${site}/account/renewals (sign-in required; you review and pay there).` : 'Nothing is due for renewal in that selection.', data: { checkout_url: `${site}/account/renewals`, items } };
    },
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Tools offered on a profile: ChatGPT gets no commerce tools unless the owner switched them on. */
export const toolsFor = (profile: Profile, commerce: boolean) => TOOLS.filter((t) => !(t.commerce && profile === 'chatgpt' && !commerce));

/** MCP tools/list entries (ChatGPT also reads securitySchemes per tool). */
export function listEntries(profile: Profile, commerce: boolean) {
  return toolsFor(profile, commerce).map((t) => ({
    name: t.name, title: t.title, description: t.description, inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', ...t.inputSchema }, outputSchema: t.outputSchema,
    annotations: t.annotations,
    _meta: { securitySchemes: t.scope ? [{ type: 'oauth2', scopes: [t.scope] }] : [{ type: 'noauth' }, { type: 'oauth2', scopes: [] }] },
  }));
}

const RW = (t: ToolDef) => (t.annotations.readOnlyHint ? 'read' : 'write') as 'read' | 'write';

/**
 * Run one tool with every guard. Throws ToolFail; auth problems carry code 'auth' (no token) or 'scope' (missing
 * scope) so the transport can answer 401 / 403 with WWW-Authenticate before anything runs (see needsAuth).
 */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<Out> {
  const t = TOOL_BY_NAME.get(name);
  if (!t || !toolsFor(ctx.profile, ctx.commerce).includes(t)) throw new ToolFail(`Unknown tool: ${name}`, 'not_found');
  if (t.scope) {
    if (!ctx.access) throw new ToolFail('Sign in to GlobalHostia to use this tool.', 'auth');
    if (!ctx.enabled) throw new ToolFail('Account tools are temporarily turned off by GlobalHostia. Please use globalhostia.com/account meanwhile.', 'disabled');
    if (!ctx.access.scopes.includes(t.scope)) throw new ToolFail(`This needs the "${t.scope}" permission, which was not granted. Reconnect GlobalHostia and allow it.`, 'scope', { required_scope: t.scope });
    const wait = ctx.deps.limit(`c${ctx.access.cid}`, RW(t));
    if (wait) throw new ToolFail(`Too many requests. Try again in ${wait}s.`, 'rate_limited', { retry_after: wait });
  }
  const audited = !!t.scope && !t.annotations.readOnlyHint;
  try {
    const r = await t.run(args, ctx);
    if (ctx.access && t.scope) await ctx.deps.audit({ access: ctx.access, tool: name, ok: true, detail: auditDetail(name, args), ip: ctx.ip }).catch(() => {});
    return r;
  } catch (e) {
    if (audited && ctx.access && !(e instanceof ToolFail && e.code === 'confirm')) await ctx.deps.audit({ access: ctx.access, tool: name, ok: false, detail: { ...auditDetail(name, args), error: e instanceof Error ? e.message.slice(0, 200) : 'error' }, ip: ctx.ip }).catch(() => {});
    throw e;
  }
}

/** What goes into the audit log: identifiers only, never message bodies or record values beyond 200 characters. */
function auditDetail(name: string, a: Record<string, unknown>) {
  const keep = ['domain', 'type', 'name', 'record_id', 'email', 'service_id', 'invoice_id', 'ticket_id', 'enabled', 'nameservers', 'include_www', 'items', 'status', 'subject'];
  const d: Record<string, unknown> = {};
  for (const k of keep) if (a[k] !== undefined) d[k] = typeof a[k] === 'string' ? String(a[k]).slice(0, 200) : a[k];
  if (name === 'add_dns_record' || name === 'update_dns_record') d.value = String(a.value ?? '').slice(0, 200);
  return d;
}

/** Transport pre-check (before any tool runs): which auth challenge, if any, a tools/call needs. */
export function needsAuth(name: unknown, ctx: Pick<ToolCtx, 'profile' | 'commerce' | 'access'>): null | { kind: 'auth' | 'scope'; scope: string } {
  const t = typeof name === 'string' ? TOOL_BY_NAME.get(name) : undefined;
  if (!t || !t.scope || !toolsFor(ctx.profile, ctx.commerce).includes(t)) return null;
  if (!ctx.access) return { kind: 'auth', scope: t.scope };
  if (!ctx.access.scopes.includes(t.scope)) return { kind: 'scope', scope: t.scope };
  return null;
}
