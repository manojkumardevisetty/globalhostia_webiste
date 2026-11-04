// Default mega-menu configuration. Featured panels are computed from live catalog prices.
// Admins can override the whole menu with settings.theme_menu (JSON array of ThemeMenu, same shape).
// Either way the menu follows the catalog (getMenu): links to hidden categories drop out, and categories that no
// hand-written page covers (new in admin or synced from WHMCS) are added to the menu of their family, in admin order,
// once approved (Admin → Site links). Categories another page already sells, or with machine names, are never added.
import { money } from '../pricing';
import { available, fromText } from './ui';
import { productsFor, categoryProducts, minFrom, pricedTlds, whmcsLinks, currencyPrefix, type Catalog } from './data';
import { CLAIMED, TYPE_ICON, TYPE_MENU, categoryHref, prettyName, FOOTER_EXTRA_DEFAULTS } from './sitelinks';
import { coveredBy } from './pseo';
import { storeView } from '../store/view';
import { HUB_PATH, sectionAnchor } from '../store/config';

export type MenuItem = { label: string; href: string; icon: string; desc?: string; cats?: string[]; soon?: boolean;
  /** set on items added automatically from a category (getMenu) */
  auto?: string };
export type MenuGroup = { title: string; items: MenuItem[] };
export type MenuFeatured = {
  tag?: string; title: string;
  big?: { amount: string; unit?: string }; // pre-formatted price, e.g. "$45.99" "/ month"
  text?: string; list?: [string, string][]; link?: { label: string; href: string };
};
export type ThemeMenu = { id: string; label: string; groups: MenuGroup[]; featured?: MenuFeatured };

const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];
const D = ['dedicated-servers', 'premiumdedicated-servers'];
const UNIT: Record<string, string> = { monthly: '/ month', quarterly: '/ quarter', semiannually: '/ 6 months', annually: '/ year', biennially: '/ 2 years', triennially: '/ 3 years', onetime: 'one-time' };

/** Default menus. Links use theme routes (routes.ts); products without a page link to the WHMCS store. */
export function defaultMenu(cat: Catalog): ThemeMenu[] {
  const L = whmcsLinks(cat.base);
  return [
    { id: 'hosting', label: 'Hosting', groups: [
      { title: 'Website hosting', items: [
        { label: 'Web Hosting', href: '/web-hosting', icon: 'globe', desc: 'NVMe hosting in the USA, Malaysia and Singapore.', cats: H },
        { label: 'WordPress Hosting', href: '/wordpress-hosting', icon: 'wp', desc: 'WordPress installed, updated and backed up for you.', cats: ['wordpress-hosting'] },
      ] },
      { title: 'Shared and reseller', items: [
        { label: 'Shared Hosting', href: '/shared-hosting', icon: 'layers', desc: 'Lite, Ultra and Infinity plans with free SSL.', cats: H },
        { label: 'Reseller (cPanel)', href: '/cpanel-reseller', icon: 'users', desc: 'Host your own clients under your brand.', cats: ['cpanel-reseller'] },
      ] },
      { title: 'Get started', items: [
        { label: 'Plan finder', href: '/plan-finder', icon: 'filter', desc: 'Four questions, one recommendation from our live plans.' },
        { label: 'Free migration', href: '/free-migration', icon: 'move', desc: 'We move your site, databases and email for you.' },
      ] },
    ] },
    { id: 'servers', label: 'Servers', groups: [
      { title: 'Virtual servers', items: [
        { label: 'VPS', href: '/vps-hosting', icon: 'server', desc: 'Linux and Windows VPS with full root access.', cats: ['hostiavps'] },
        { label: 'Windows RDP', href: '/windows-rdp', icon: 'win', desc: 'Always-on Windows desktop in the cloud.', cats: ['windows-rdp'] },
        { label: 'All cloud servers', href: '/cloud-servers', icon: 'layers', desc: 'Compare VPS, dedicated and RDP plans.', cats: ['hostiavps'] },
        { label: 'Forex VPS', href: '/forex-vps', icon: 'chart', desc: 'Always-on servers for trading platforms.', cats: ['forex-vps'] },
      ] },
      { title: 'Dedicated and specialised', items: [
        { label: 'Dedicated Servers', href: '/dedicated-servers', icon: 'cpu', desc: 'Bare metal from Xeon to Ryzen 9, up to 10Gbps.', cats: D },
        { label: 'AI / LLM Hosting', href: '/ai-llm-hosting', icon: 'spark', desc: 'Servers sized for running language models.', cats: ['ai-llm'] },
        { label: 'n8n Automation', href: '/n8n-automation', icon: 'flow', desc: 'Self-hosted n8n on NVMe servers.', cats: ['mcps'] },
      ] },
    ] },
    { id: 'domains', label: 'Domains', groups: [
      { title: 'Domain names', items: [
        { label: 'Register a domain', href: '/domains-registration', icon: 'at', desc: 'Search extensions and register in minutes.' },
        { label: 'Transfer a domain', href: '/domain-transfer', icon: 'transfer', desc: 'Move a domain you own, keep your site online.' },
        { label: 'Domain pricing', href: '/domains-registration#pricing', icon: 'tag', desc: 'Registration, renewal and transfer prices.' },
        { label: '.ae domains', href: '/ae-domains', icon: 'globe', desc: 'The UAE country domain for local businesses.' },
        { label: 'Premium domains', href: '/premium-domains', icon: 'star', desc: 'Short, brandable names for sale, price upfront.' },
        { label: 'Domain broker', href: '/domain-broker', icon: 'key', desc: 'Want a taken domain? We negotiate it for you.' },
      ] },
    ] },
    { id: 'security', label: 'Security', groups: [
      { title: 'SSL certificates', items: [
        { label: 'SSL Certificates', href: '/ssl-certificate', icon: 'lock', desc: 'Domain, wildcard and organisation validated.', cats: ['ssl-certificates'] },
        { label: 'Domain validated (DV)', href: '/ssl-certificate#plans', icon: 'bolt', desc: 'Issued in minutes, secures your site fast.', cats: ['ssl-certificates'] },
      ] },
      { title: 'More protection', items: [
        { label: 'Wildcard SSL', href: '/ssl-certificate#plans', icon: 'layers', desc: 'One domain plus unlimited subdomains.', cats: ['ssl-certificates'] },
        { label: 'Organisation validated (OV)', href: '/ssl-certificate#plans', icon: 'shield', desc: 'Your company name in the certificate.', cats: ['ssl-certificates'] },
      ] },
    ] },
    { id: 'business', label: 'Business tools', groups: [
      { title: 'Work and collaboration', items: [
        { label: 'Project Management workspace', href: '/projects', icon: 'kanban', desc: 'Kanban boards, time tracking and a client portal.', cats: ['project-management'] },
        { label: 'Business Email', href: '/google-workspace', icon: 'grid', desc: 'Email, calendar and storage on your domain.', cats: ['business-email'] },
      ] },
      { title: 'Developers', items: [
        { label: 'Binance MCPs', href: '/binance', icon: 'plug', desc: 'Hosted MCP servers on NVMe VPS.', cats: ['mcps'] },
        { label: 'n8n Automation', href: '/n8n-automation', icon: 'flow', desc: 'Unlimited workflows on your own server.', cats: ['mcps'] },
      ] },
    ] },
    { id: 'support', label: 'Support', groups: [
      { title: 'Self-service', items: [
        { label: 'Help Center', href: '/help-center', icon: 'life', desc: 'Guides for hosting, domains, email and billing.' },
        { label: 'Knowledgebase', href: L.knowledgebase, icon: 'book', desc: 'Browse every article by product.' },
        { label: 'Blog', href: '/blog', icon: 'pen', desc: 'Hosting guides, how-tos and news.' },
      ] },
      { title: 'Service health', items: [
        { label: 'Status page', href: '/status-page', icon: 'activity', desc: 'Live status of every datacenter and service.' },
        { label: 'Data centers', href: '/data-centers', icon: 'pin', desc: 'Our locations and a live speed test from your browser.' },
        { label: 'Incident history', href: '/incident-history', icon: 'clock', desc: 'Past incidents and how they were resolved.' },
        { label: 'Contact', href: '/contact', icon: 'mail', desc: 'Sales, billing and technical support.' },
      ] },
    ] },
  ];
}

/** Featured panel for a menu id, computed from real prices (price omitted when none is synced). */
export function featuredFor(id: string, cat: Catalog): MenuFeatured | undefined {
  const s = cat.settings, L = whmcsLinks(cat.base), cur = cat.currency;
  const fromCats = (slugs: string[]) => minFrom(available(productsFor(cat, slugs)), cur);
  const big = (f: ReturnType<typeof minFrom>) => f ? { amount: money(f.months > 1 ? f.price : f.amount, f.prefix), unit: UNIT[f.cycle] || '' } : undefined;
  switch (id) {
    case 'hosting': {
      const f = fromCats(H);
      return { tag: 'Free SSL included', title: 'Web hosting', big: big(f), text: 'NVMe storage, free SSL, daily backups and engineers on call around the clock.', link: { label: 'See all hosting plans', href: '/web-hosting' } };
    }
    case 'servers': {
      const ded = available(productsFor(cat, D)), f = minFrom(ded, cur);
      const tenG = ded.find((p) => /10\s*gbps/i.test(p.name + ' ' + p.features.join(' ')));
      return { tag: tenG ? 'Up to 10Gbps' : undefined, title: 'Dedicated servers', big: big(f), text: 'Bare-metal servers with 5 IPv4 addresses each, from Xeon to Ryzen 9.', link: { label: 'Compare dedicated servers', href: '/dedicated-servers' } };
    }
    case 'domains': {
      const prefix = currencyPrefix(cat) || '$';
      const tl = pricedTlds(cat);
      const pick = [...tl.filter((t) => t.featured), ...tl.filter((t) => !t.featured)].slice(0, 5);
      return { title: 'First-year prices', list: pick.map((t) => [t.tld, money(t.register!, prefix)]), text: pick.length ? undefined : 'Search any extension to see its live price.', link: { label: 'Search a domain', href: '/domains-registration' } };
    }
    case 'security': {
      const f = fromCats(['ssl-certificates']);
      return { title: 'Encryption your visitors can see', big: big(f), text: '256-bit encryption, wide browser recognition and free reissues on every certificate.', link: { label: 'Compare certificates', href: '/ssl-certificate' } };
    }
    case 'business': {
      const f = fromCats(['project-management']);
      return { title: 'Your own workspace address', big: big(f), text: 'Run projects on your own domain with your logo, client roles and daily backups.', link: { label: 'See workspace plans', href: '/projects' } };
    }
    case 'support': {
      const list: [string, string][] = [];
      if (s.phone) list.push(['Phone', String(s.phone)]);
      if (s.email) list.push(['Email', String(s.email)]);
      return { title: 'Engineers on call, 24/7', text: 'Call, email or open a ticket at any hour.', list, link: { label: 'Submit a ticket', href: L.ticket } };
    }
  }
  return undefined;
}

export function validMenu(m: unknown): m is ThemeMenu[] { return valid(m); }
function valid(m: unknown): m is ThemeMenu[] {
  return Array.isArray(m) && m.length > 0 && m.every((x) => x && typeof x.id === 'string' && typeof x.label === 'string' && Array.isArray(x.groups)
    && x.groups.every((g: any) => g && Array.isArray(g.items) && g.items.every((i: any) => i && typeof i.label === 'string' && typeof i.href === 'string')));
}

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const clip = (t: string, n = 64) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t);

/** Categories that should be in the menu but no item links to: approved, with products, not sold on another page. */
export function autoMenuItems(cat: Catalog, menus: ThemeMenu[]): { menu: string; item: MenuItem }[] {
  const linked = new Set(menus.flatMap((m) => m.groups.flatMap((g) => g.items.flatMap((i) => [...(i.cats || []), i.href]))));
  const withProducts = new Set(cat.products.map((p) => p.categorySlug));
  const out: { menu: string; item: MenuItem }[] = [];
  for (const c of cat.categories) {
    if (!c.auto || CLAIMED.has(c.slug) || !withProducts.has(c.slug) || coveredBy(cat, c.slug)) continue;
    const href = categoryHref(c.slug);
    if (linked.has(c.slug) || linked.has(href)) continue;
    // a subcategory is listed on its parent's page; only add it when the parent is not in the menu itself
    const parent = c.parentId ? cat.categories.find((x) => x.id === c.parentId) : undefined;
    if (parent && withProducts.has(parent.slug)) continue;
    const ps = categoryProducts(cat, c.slug);
    const from = minFrom(available(ps), cat.currency);
    const cheapest = from && ps.find((p) => fromText(p, cat.currency));
    const desc = clip(strip(c.seoDescription || c.description)) || (cheapest ? `From ${fromText(cheapest, cat.currency)}` : `${ps.length} plan${ps.length === 1 ? '' : 's'}`);
    out.push({ menu: TYPE_MENU[c.type] || 'business', item: { label: prettyName(c.name), href, icon: TYPE_ICON[c.type] || 'box', desc, cats: [c.slug], auto: c.slug } });
  }
  return out;
}

/** Menus to render: settings.theme_menu override (JSON string or array) or defaults; featured panels filled from catalog. */
export function getMenu(cat: Catalog): ThemeMenu[] {
  let raw: unknown = cat.settings.theme_menu;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const base = valid(raw) ? raw : defaultMenu(cat);
  // links whose categories all exist but are hidden in admin drop out (unknown slugs are treated as editorial links)
  const hidden = new Set(cat.hiddenCategories || []);
  const menus: ThemeMenu[] = base.map((m) => ({ ...m, groups: m.groups.map((g) => ({ ...g, items: g.items.filter((i) => !(i.cats?.length && i.cats.every((c) => hidden.has(c)))) })).filter((g) => g.items.length) }));
  if (cat.links?.autoMenu !== false) {
    for (const { menu, item } of autoMenuItems(cat, menus)) {
      const m = menus.find((x) => x.id === menu) || menus.find((x) => x.id === 'business') || menus.find((x) => !/support/i.test(x.id)) || menus[0];
      if (!m) continue;
      // join the group that already lists the same family, else the last group
      const fam = cat.categories.find((c) => c.slug === item.auto)?.type;
      const g = m.groups.find((gr) => gr.items.some((i) => i.cats?.some((s) => cat.categories.find((c) => c.slug === s)?.type === fam))) || m.groups[m.groups.length - 1];
      if (g) g.items.push(item); else m.groups.push({ title: 'More', items: [item] });
    }
  }
  // Business services shop (Admin → Business services): when published, a group in the Business tools menu with the hub and
  // its sections; label and on/off are shop settings. Skipped when the menu already links the hub (custom menus).
  const shop = storeView(cat);
  if (shop.live && shop.cfg.inNav && !menus.some((m) => m.groups.some((g) => g.items.some((i) => String(i.href).split('#')[0] === HUB_PATH)))) {
    const m = menus.find((x) => x.id === 'business') || menus.find((x) => !/support/i.test(x.id)) || menus[0];
    const secs = shop.sections.filter((x) => x.items.length || x.bundles.length);
    if (m) m.groups.push({ title: shop.cfg.menuLabel, items: [
      { label: `All ${shop.cfg.menuLabel.toLowerCase()}`, href: HUB_PATH, icon: 'store', desc: clip(shop.cfg.lead || 'Security, email, website tools and setup services.') },
      ...secs.slice(0, 5).map((x) => ({ label: x.name, href: sectionAnchor(x.slug), icon: x.icon, desc: clip(x.description) })),
    ] });
  }
  // a saved custom menu predates the domain broker page: add it to the Domains menu unless it's already linked anywhere
  if (valid(raw) && !menus.some((m) => m.groups.some((g) => g.items.some((i) => String(i.href).startsWith('/domain-broker'))))) {
    const dm = menus.find((m) => /domain/i.test(m.id) || /domain/i.test(m.label));
    if (dm?.groups[0]) dm.groups[0] = { ...dm.groups[0], items: [...dm.groups[0].items, { label: 'Domain broker', href: '/domain-broker', icon: 'key', desc: 'Want a taken domain? We negotiate it for you.' }] };
  }
  // …and the premium domains marketplace (lib/premium), same rule
  if (valid(raw) && !menus.some((m) => m.groups.some((g) => g.items.some((i) => String(i.href).startsWith('/premium-domains'))))) {
    const dm = menus.find((m) => /domain/i.test(m.id) || /domain/i.test(m.label));
    if (dm?.groups[0]) dm.groups[0] = { ...dm.groups[0], items: [...dm.groups[0].items, { label: 'Premium domains', href: '/premium-domains', icon: 'star', desc: 'Short, brandable names for sale, price upfront.' }] };
  }
  return menus.map((m) => ({ ...m, id: m.id.replace(/[^a-z0-9-]/gi, '') || 'menu', featured: m.featured || featuredFor(m.id, cat) }));
}

/** Footer columns derived from the menu (Security folds into Domains, like the approved design). */
export function footerColumns(menus: ThemeMenu[], extra?: { title: string; links: { label: string; href: string }[] }[] | null) {
  const cols = menus.map((m) => ({ title: m.label, links: dedupe(m.groups.flatMap((g) => g.items)).map((i) => ({ label: i.label, href: i.href })) }));
  const sec = cols.findIndex((c) => /security/i.test(c.title)), dom = cols.findIndex((c) => /domain/i.test(c.title));
  if (sec >= 0 && dom >= 0) { cols[dom].links.push(cols[sec].links[0]); cols.splice(sec, 1); }
  // hubs of the programmatic SEO pages (lib/theme/pseo.ts)
  const col = (re: RegExp) => cols.find((c) => re.test(c.title));
  col(/domain/i)?.links.push({ label: 'Domains A–Z', href: '/domains/all' });
  col(/server/i)?.links.push({ label: 'Locations', href: '/data-centers#dc-loc-h' });
  col(/hosting/i)?.links.push({ label: 'Hosting for…', href: '/hosting-for' });
  // editorial columns: Admin → Site links (settings.site_links.footerExtra), else the defaults
  for (const c of extra || FOOTER_EXTRA_DEFAULTS) cols.push({ title: c.title, links: c.links.map((l) => ({ ...l })) });
  // the owner keeps learning/guide links out of the footer (they stay in the menu and on /guides, /compare)
  return cols.filter((c) => !/^(learn|learning|resources|guides)$/i.test(c.title.trim()));
}
function dedupe(items: MenuItem[]) { const seen = new Set<string>(); return items.filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true))); }

