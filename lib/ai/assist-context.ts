// Page context for the customer assistant (account portal and Manage hosting panel).
// The browser tells the assistant what the customer is looking at (page, domain id, service id, panel tab, language);
// nothing here is trusted: ids are re-resolved against the signed-in client's own domains / services and a domain name
// is kept only when the client owns it, so the context can steer the tools but never widen what they can reach.
// Pure module (no imports) so tests/ai-assist.test.mts can load it directly.

export type AssistPage = 'dashboard' | 'services' | 'service' | 'domains' | 'domain' | 'invoices' | 'invoice' | 'renewals' | 'support' | 'hosting' | 'other';
export const ASSIST_PAGES: AssistPage[] = ['dashboard', 'services', 'service', 'domains', 'domain', 'invoices', 'invoice', 'renewals', 'support', 'hosting', 'other'];
/** Manage hosting panel tabs the assistant knows about (whmcs.js show()). */
export const PANEL_TABS = ['overview', 'health', 'dns', 'subdomains', 'aliases', 'redirects', 'php', 'email', 'forwarders', 'autoresponders', 'spam', 'files', 'ftp', 'protect', 'databases', 'cron', 'ssl', 'backups', 'wordpress'];

export interface AssistContext {
  page: AssistPage;
  domain?: string;
  domainId?: number;
  serviceId?: number;
  invoiceId?: number;
  tab?: string;
  lang: 'en' | 'ar';
}

const id = (v: unknown) => { const n = typeof v === 'string' && /^\d{1,10}$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isSafeInteger(n) && n > 0 ? n : undefined; };
const dom = (v: unknown) => {
  if (typeof v !== 'string') return undefined;
  const d = v.trim().toLowerCase().replace(/\.+$/, '').slice(0, 253);
  return /^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z0-9-]{2,63}$/.test(d) ? d : undefined;
};

/** Untrusted `context` from the request body -> a clean, bounded shape (unknown keys dropped). */
export function parseAssistContext(raw: unknown): AssistContext {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const page = ASSIST_PAGES.includes(r.page as AssistPage) ? (r.page as AssistPage) : 'other';
  const tab = typeof r.tab === 'string' && PANEL_TABS.includes(r.tab) ? r.tab : undefined;
  const out: AssistContext = { page, lang: r.lang === 'ar' ? 'ar' : 'en' };
  const d = dom(r.domain); if (d) out.domain = d;
  const di = id(r.domainId); if (di) out.domainId = di;
  const si = id(r.serviceId); if (si) out.serviceId = si;
  const ii = id(r.invoiceId); if (ii) out.invoiceId = ii;
  if (tab) out.tab = tab;
  return out;
}

export interface ResolveInput {
  via: 'portal' | 'hosting';
  /** the client's WHMCS domains ({id, domainname}) */
  domains: { id: unknown; domainname?: unknown }[];
  /** the client's WHMCS services ({id, domain, name}) */
  services: { id: unknown; domain?: unknown; name?: unknown; translated_name?: unknown }[];
  /** every domain name the client may ask about (lower case) */
  owned: string[];
  /** hosting panel: the service id from the verified token (the browser's serviceId is ignored) */
  tokenServiceId?: number;
}
export interface Resolved extends AssistContext { serviceName?: string }

/** Keep only what belongs to this client: ids are looked up in the client's own lists, names checked against `owned`. */
export function resolveAssistContext(c: AssistContext, r: ResolveInput): Resolved {
  const owned = new Set(r.owned.map((x) => String(x).toLowerCase()));
  const out: Resolved = { page: c.page, lang: c.lang, ...(c.tab && r.via === 'hosting' ? { tab: c.tab } : {}) };
  if (c.invoiceId && r.via === 'portal') out.invoiceId = c.invoiceId; // invoice tools are client-scoped already
  if (r.via === 'portal' && c.domainId) {
    const row = r.domains.find((x) => Number(x.id) === c.domainId);
    if (row) { out.domainId = c.domainId; out.domain = String(row.domainname || '').toLowerCase() || undefined; }
  }
  const sid = r.via === 'hosting' ? r.tokenServiceId : c.serviceId;
  if (sid) {
    const svc = r.services.find((x) => Number(x.id) === sid);
    if (svc) {
      out.serviceId = sid;
      out.serviceName = String(svc.translated_name || svc.name || '').slice(0, 120) || undefined;
      const sd = String(svc.domain || '').toLowerCase();
      if (!out.domain && sd && owned.has(sd)) out.domain = sd;
    }
  }
  // an explicit domain (panel domain selector, portal page) wins over the service's main domain, if the client owns it
  if (c.domain && owned.has(c.domain) && !(r.via === 'portal' && out.domainId)) out.domain = c.domain;
  if (out.domain && !owned.has(out.domain) && !out.domainId) delete out.domain;
  return out;
}

const PAGE_LABEL: Record<AssistPage, string> = {
  dashboard: 'the account dashboard', services: 'the list of services', service: 'a service page', domains: 'the domain list', domain: 'a domain page (with its DNS records editor)',
  invoices: 'the invoices list', invoice: 'an invoice', renewals: 'the renewals page', support: 'the support tickets page', hosting: 'the Manage hosting panel', other: 'their account',
};

/** One line for the system prompt: where the customer is, what to target by default, and the reply language. */
export function contextLine(c: Resolved): string {
  const bits = [`The customer is on ${PAGE_LABEL[c.page]}${c.tab ? ` (${c.tab} tab)` : ''}.`];
  if (c.domain) bits.push(`Current domain: ${c.domain}${c.domainId ? ` (domain id ${c.domainId})` : ''}; use it when they say "my domain" or "this domain".`);
  if (c.serviceId) bits.push(`Current service: #${c.serviceId}${c.serviceName ? ` ${c.serviceName}` : ''}.`);
  if (c.invoiceId) bits.push(`Current invoice: #${c.invoiceId}.`);
  bits.push(c.lang === 'ar'
    ? 'Their interface is in Arabic: reply in Arabic (Modern Standard Arabic) unless they write in another language; keep domain names, record values and product names in Latin script.'
    : 'Reply in the language of the customer\'s latest message.');
  return bits.join(' ');
}

/** Portal page -> context the frame renders as data attributes (lib/portal/views/frame.ts). */
export function portalPageContext(active: string, path: string, extra: { domainId?: number; domain?: string; serviceId?: number } = {}): { page: AssistPage; domainId?: number; domain?: string; serviceId?: number; invoiceId?: number } {
  const seg = path.replace(/^\/account\/?/, '').split('/').filter(Boolean);
  const n = (s?: string) => (s && /^\d{1,10}$/.test(s) ? Number(s) : undefined);
  if (active === 'dashboard') return { page: 'dashboard' };
  if (active === 'domains') return seg[0] === 'domains' && n(seg[1]) ? { page: 'domain', domainId: extra.domainId ?? n(seg[1]), ...(extra.domain ? { domain: extra.domain } : {}) } : { page: 'domains' };
  if (active === 'services') return seg[0] === 'services' && n(seg[1]) ? { page: 'service', serviceId: extra.serviceId ?? n(seg[1]), ...(extra.domain ? { domain: extra.domain } : {}) } : { page: 'services' };
  if (active === 'billing') return seg[0] === 'invoices' && n(seg[1]) ? { page: 'invoice', invoiceId: n(seg[1]) } : { page: 'invoices' };
  if (active === 'renewals') return { page: 'renewals' };
  if (active === 'support') return { page: 'support' };
  return { page: 'other' };
}
