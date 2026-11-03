// Site links: how catalog data (categories, products, TLDs, locations) turns into menus, footer columns,
// category pages and the programmatic SEO pages, plus the admin-editable editorial defaults
// (settings.site_links, edited in Admin → Website → Site links).
// Plain module: no server or catalog imports, so data.ts, routes and page modules can all use it.
import { ROUTES } from './routes';

/* ------------------------------------------------------------------ product families */
/** Families a category can belong to. The plan finder scores the first nine. */
export const FAMILY_IDS = ['shared', 'wp', 'reseller', 'vps', 'dedicated', 'rdp', 'forex', 'automation', 'ai', 'ssl', 'email', 'domain', 'tools', 'other'] as const;
export type FamilyId = (typeof FAMILY_IDS)[number];
/** Families scored by the plan finder (public/hp/pages/planfinder.js). */
export const FINDER_FAMILIES = ['shared', 'wp', 'reseller', 'vps', 'dedicated', 'rdp', 'forex', 'automation', 'ai'];

/** Category slug → family for the original categories. New categories are inferred (inferFamily) or set in admin. */
export const TYPE: Record<string, string> = {
  'hosting-usa': 'shared', 'hostia-shared': 'shared', 'hosting-singapore': 'shared',
  'wordpress-hosting': 'wp', 'cpanel-reseller': 'reseller',
  hostiavps: 'vps', 'high-performance-vps': 'vps',
  'dedicated-servers': 'dedicated', 'premiumdedicated-servers': 'dedicated',
  'windows-rdp': 'rdp', 'linux-rdp': 'rdp', 'forex-vps': 'forex', mcps: 'automation', 'ai-llm': 'ai',
  'ssl-certificates': 'ssl', 'business-email': 'email', 'project-management': 'tools',
};
export const TYPE_LABEL: Record<string, string> = {
  shared: 'Web hosting', wp: 'WordPress hosting', reseller: 'Reseller hosting', vps: 'VPS', dedicated: 'Dedicated server',
  rdp: 'Remote desktop (RDP)', forex: 'Forex VPS', automation: 'Automation server', ai: 'AI / LLM server',
  ssl: 'SSL certificate', email: 'Business email', domain: 'Domains', tools: 'Business tools', other: 'Other',
};
/** Main page of each family (hand-written theme pages). */
export const TYPE_PAGE: Record<string, string> = {
  shared: '/web-hosting', wp: '/wordpress-hosting', reseller: '/cpanel-reseller', vps: '/vps-hosting', dedicated: '/dedicated-servers',
  rdp: '/windows-rdp', forex: '/forex-vps', automation: '/n8n-automation', ai: '/ai-llm-hosting', ssl: '/ssl-certificate',
  email: '/google-workspace', domain: '/domains-registration', tools: '/projects',
};
export const TYPE_ICON: Record<string, string> = {
  shared: 'globe', wp: 'wp', reseller: 'users', vps: 'server', dedicated: 'cpu', rdp: 'monitor', forex: 'chart', automation: 'flow', ai: 'spark',
  ssl: 'lock', email: 'mail', domain: 'at', tools: 'grid', other: 'box',
};
/** Which mega menu (menu.ts ids) a family's new categories join. */
export const TYPE_MENU: Record<string, string> = {
  shared: 'hosting', wp: 'hosting', reseller: 'hosting', vps: 'servers', dedicated: 'servers', rdp: 'servers', forex: 'servers',
  automation: 'servers', ai: 'servers', ssl: 'security', domain: 'domains', email: 'business', tools: 'business', other: 'business',
};

/** Guess a family from a category's slug and name (used when the slug is new and the admin has not set one). */
export function inferFamily(slug: string, name = ''): FamilyId {
  const t = `${slug} ${name}`.toLowerCase();
  if (/wordpress|\bwp\b|woocommerce/.test(t)) return 'wp';
  if (/reseller/.test(t)) return 'reseller';
  if (/forex|\bmt[45]\b|metatrader|trading/.test(t)) return 'forex';
  if (/\brdp\b|remote desktop/.test(t)) return 'rdp';
  if (/dedicated|bare[ -]?metal/.test(t)) return 'dedicated';
  if (/\bai\b|\bllm|\bgpu\b|machine learning/.test(t)) return 'ai';
  if (/n8n|automation|\bmcps?\b/.test(t)) return 'automation';
  if (/\bvps\b|virtual (private )?server|cloud server|\bservers?\b/.test(t)) return 'vps';
  if (/\bssl\b|certificate/.test(t)) return 'ssl';
  if (/e-?mail|workspace|\bmail\b/.test(t)) return 'email';
  if (/domain/.test(t)) return 'domain';
  if (/hosting|shared|\bweb\b/.test(t)) return 'shared';
  return 'other';
}

/* ------------------------------------------------------------------ admin-editable config */
export type TldBlurb = { forWho?: string; facts?: string[]; related?: string[] };
export type UseCaseEdit = { hidden?: boolean; name?: string; h1?: string; lead?: string; meta?: string; intro?: string };
export type LocationEdit = { name?: string; note?: string; near?: string[] };
export type FooterColumn = { title: string; links: { label: string; href: string }[] };
export type SiteLinksConfig = {
  /** category slug → family (overrides TYPE and inferFamily); 'other' keeps a category out of shared pages */
  categoryTypes: Record<string, string>;
  /** add categories that no hand-written page covers to the mega menu automatically (default on) */
  autoMenu: boolean;
  /** TLD → editorial blurb; merged over the built-in facts (pseo.ts TLD_INFO) */
  tldBlurbs: Record<string, TldBlurb>;
  /** use-case slug → text overrides or hidden */
  useCases: Record<string, UseCaseEdit>;
  /** location slug → note / audience overrides */
  locations: Record<string, LocationEdit>;
  /** footer columns after the menu-derived ones; null = built-in defaults */
  footerExtra: FooterColumn[] | null;
  /** product slugs offered in the WHMCS cart ("Complete your setup"); '' = automatic */
  offers: { ssl: string; hosting: string };
  /** category slugs that existed when automatic surfacing shipped (DB patch 020): shown automatically unless switched off */
  seen: string[];
  /** category slug → shown automatically (menu, family pages, /category page) or not; set in Admin → Site links */
  show: Record<string, boolean>;
};

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const s = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, max = 8) => (Array.isArray(v) ? v.map((x) => s(x, 300)).filter(Boolean).slice(0, max) : []);
const safeHref = (h: string) => (/^(\/[^\s]*|https?:\/\/[^\s]+|#[\w-]*)$/i.test(h) ? h : '');

/** settings.site_links (JSON object or string), validated, with defaults. Never throws. */
export function siteLinks(settings: Record<string, any> | null | undefined): SiteLinksConfig {
  let raw: unknown = settings?.site_links;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const r = obj(raw);
  const categoryTypes: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(r.categoryTypes))) if ((FAMILY_IDS as readonly string[]).includes(String(v))) categoryTypes[k] = String(v);
  const tldBlurbs: Record<string, TldBlurb> = {};
  for (const [k, v] of Object.entries(obj(r.tldBlurbs))) {
    const tld = '.' + k.toLowerCase().replace(/^\.+/, '');
    const b = obj(v); const forWho = s(b.forWho), facts = list(b.facts, 4), related = list(b.related, 6).map((t) => '.' + t.toLowerCase().replace(/^\.+/, ''));
    if (forWho || facts.length || related.length) tldBlurbs[tld] = { ...(forWho && { forWho }), ...(facts.length && { facts }), ...(related.length && { related }) };
  }
  const useCases: Record<string, UseCaseEdit> = {};
  for (const [k, v] of Object.entries(obj(r.useCases))) {
    const u = obj(v); const e: UseCaseEdit = {};
    if (u.hidden === true) e.hidden = true;
    for (const f of ['name', 'h1', 'lead', 'meta', 'intro'] as const) { const x = s(u[f], f === 'intro' || f === 'lead' ? 900 : 200); if (x) e[f] = x; }
    if (Object.keys(e).length) useCases[k] = e;
  }
  const locations: Record<string, LocationEdit> = {};
  for (const [k, v] of Object.entries(obj(r.locations))) {
    const l = obj(v); const e: LocationEdit = {};
    const name = s(l.name, 60), note = s(l.note, 600), near = list(l.near, 6);
    if (name) e.name = name; if (note) e.note = note; if (near.length) e.near = near;
    if (Object.keys(e).length) locations[k] = e;
  }
  const footerExtra = Array.isArray(r.footerExtra)
    ? r.footerExtra.map((c: any) => ({ title: s(c?.title, 60), links: (Array.isArray(c?.links) ? c.links : []).map((l: any) => ({ label: s(l?.label, 80), href: safeHref(s(l?.href, 300)) })).filter((l: any) => l.label && l.href).slice(0, 12) }))
      .filter((c: FooterColumn) => c.title && c.links.length).slice(0, 4)
    : null;
  const o = obj(r.offers);
  const seen = Array.isArray(r.seen) ? r.seen.filter((x: unknown) => typeof x === 'string').slice(0, 2000) : [];
  const show: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(obj(r.show))) if (typeof v === 'boolean') show[k] = v;
  return { categoryTypes, autoMenu: r.autoMenu !== false, tldBlurbs, useCases, locations, footerExtra, offers: { ssl: s(o.ssl, 80), hosting: s(o.hosting, 80) }, seen, show };
}

/** Family of a category: admin choice, then the built-in map, then a guess from its slug and name. */
export function familyFor(slug: string, name: string, cfg: Pick<SiteLinksConfig, 'categoryTypes'>): FamilyId {
  return (cfg.categoryTypes[slug] || TYPE[slug] || inferFamily(slug, name)) as FamilyId;
}

/* ------------------------------------------------------------------ automatic surfacing */
/** Raw names from WHMCS sync ("Whmcs Group 1", "whmcs-group-3") or no real title: never surfaced until renamed in admin. */
export function isMachineName(slug: string, name: string) {
  const n = (name || '').trim();
  // empty, "Whmcs Group 1", only digits/symbols, or the untouched name sync gives a "whmcs-group-<id>" slug
  return !n || /^whmcs[- _]?group\b/i.test(n) || /^[\d\W_]+$/.test(n) || (/^whmcs-group-\d+$/i.test(slug) && n.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug.toLowerCase());
}
/**
 * May this category surface automatically (menu, family pages, /category page, sitemap)? Not with a machine name.
 * Otherwise the admin's switch, else on for categories that already existed when this shipped and off for new ones,
 * which wait in Admin → Site links → "New categories: review".
 */
export function isApproved(slug: string, name: string, cfg: Pick<SiteLinksConfig, 'seen' | 'show'>) {
  if (isMachineName(slug, name)) return false;
  return cfg.show[slug] ?? cfg.seen.includes(slug);
}

const WORDS: Record<string, string> = {
  wordpress: 'WordPress', woocommerce: 'WooCommerce', vps: 'VPS', rdp: 'RDP', ssl: 'SSL', tls: 'TLS', dns: 'DNS', ai: 'AI', llm: 'LLM', llms: 'LLMs',
  cpanel: 'cPanel', whm: 'WHM', directadmin: 'DirectAdmin', n8n: 'n8n', mcp: 'MCP', mcps: 'MCPs', api: 'API', nvme: 'NVMe', ssd: 'SSD', gpu: 'GPU', cpu: 'CPU',
  usa: 'USA', us: 'US', uk: 'UK', uae: 'UAE', eu: 'EU', ksa: 'KSA', ip: 'IP', ipv4: 'IPv4', ipv6: 'IPv6', vpn: 'VPN', seo: 'SEO', crm: 'CRM', erp: 'ERP',
  whmcs: 'WHMCS', dv: 'DV', ov: 'OV', ev: 'EV', os: 'OS', kvm: 'KVM', mt4: 'MT4', mt5: 'MT5', saas: 'SaaS', smtp: 'SMTP', php: 'PHP',
};
/** Display label for automatic links and pages: "Windows Vps" → "Windows VPS", "wordpress" → "WordPress". */
export function prettyName(name: string) {
  return String(name || '').trim().replace(/[A-Za-z][A-Za-z0-9]*/g, (w) => WORDS[w.toLowerCase()] || (w === w.toLowerCase() || w === w.toUpperCase() && w.length > 3 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w));
}

/* ------------------------------------------------------------------ category pages */
/** Categories a hand-written page module lists in code although its route does not name them. */
const PAGE_OWNED: Record<string, string> = { servers: '/cloud-servers' }; // pages/servers.ts: unmatched VPS Automation products
/** Category slugs a hand-written page (routes.ts) already lists. */
export const CLAIMED = new Set([...Object.values(ROUTES).flatMap((r) => r.categories || []), ...Object.keys(PAGE_OWNED)]);

/** Hand-written page of a category: first route whose categories include it, preferring routes where it is first. */
export function routeForCategory(slug: string): string | null {
  if (PAGE_OWNED[slug]) return PAGE_OWNED[slug];
  const entries = Object.entries(ROUTES).filter(([k, r]) => r.categories?.includes(slug) && !/^aws-pro-|^vps-2$/.test(k));
  const best = entries.find(([, r]) => r.categories![0] === slug) || entries[0];
  return best ? `/${best[0]}` : null;
}
/** The page that lists a category: its hand-written page, else the generated /category/<slug>. */
export const categoryHref = (slug: string) => routeForCategory(slug) || `/category/${slug}`;

/** Footer columns used when the admin has not saved their own (editorial defaults). */
export const FOOTER_EXTRA_DEFAULTS: FooterColumn[] = [
  { title: 'In the UAE', links: [
    { label: 'Web hosting in Dubai', href: '/web-hosting-dubai' }, { label: 'VPS hosting UAE', href: '/vps-uae' },
    { label: 'Windows RDP UAE', href: '/windows-rdp-uae' }, { label: 'Choosing hosting in the UAE', href: '/best-hosting-uae' },
  ] },
];
