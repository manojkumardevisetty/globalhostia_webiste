// Default mega-menu configuration. Featured panels are computed from live catalog prices.
// Admins can override the whole menu with settings.theme_menu (JSON array of ThemeMenu, same shape).
import { money } from '../pricing';
import { available } from './ui';
import { productsFor, minFrom, pricedTlds, whmcsLinks, currencyPrefix, type Catalog } from './data';

export type MenuItem = { label: string; href: string; icon: string; desc?: string; cats?: string[]; soon?: boolean };
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
        { label: 'Transfer a domain', href: L.transfer, icon: 'transfer', desc: 'Move your domain to us at no cost.' },
        { label: 'Domain pricing', href: '/domains-registration#pricing', icon: 'tag', desc: 'Registration, renewal and transfer prices.' },
        { label: '.ae domains', href: '/ae-domains', icon: 'globe', desc: 'The UAE country domain for local businesses.' },
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

function valid(m: unknown): m is ThemeMenu[] {
  return Array.isArray(m) && m.length > 0 && m.every((x) => x && typeof x.id === 'string' && typeof x.label === 'string' && Array.isArray(x.groups)
    && x.groups.every((g: any) => g && Array.isArray(g.items) && g.items.every((i: any) => i && typeof i.label === 'string' && typeof i.href === 'string')));
}

/** Menus to render: settings.theme_menu override (JSON string or array) or defaults; featured panels filled from catalog. */
export function getMenu(cat: Catalog): ThemeMenu[] {
  let raw: unknown = cat.settings.theme_menu;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const menus = valid(raw) ? raw : defaultMenu(cat);
  return menus.map((m) => ({ ...m, id: m.id.replace(/[^a-z0-9-]/gi, '') || 'menu', featured: m.featured || featuredFor(m.id, cat) }));
}

/** Footer columns derived from the menu (Security folds into Domains, like the approved design). */
export function footerColumns(menus: ThemeMenu[]) {
  const cols = menus.map((m) => ({ title: m.label, links: dedupe(m.groups.flatMap((g) => g.items)).map((i) => ({ label: i.label, href: i.href })) }));
  const sec = cols.findIndex((c) => /security/i.test(c.title)), dom = cols.findIndex((c) => /domain/i.test(c.title));
  if (sec >= 0 && dom >= 0) { cols[dom].links.push(cols[sec].links[0]); cols.splice(sec, 1); }
  cols.push({ title: 'In the UAE', links: [
    { label: 'Web hosting in Dubai', href: '/web-hosting-dubai' }, { label: 'VPS hosting UAE', href: '/vps-uae' },
    { label: 'Windows RDP UAE', href: '/windows-rdp-uae' },
    { label: 'Choosing hosting in the UAE', href: '/best-hosting-uae' },
  ] });
  cols.push({ title: 'Learn', links: [
    { label: 'Hosting comparisons', href: '/compare' }, { label: 'Hosting guides', href: '/guides' },
    { label: 'Shared vs VPS vs cloud', href: '/compare/shared-vs-vps-vs-cloud-vs-dedicated' }, { label: 'Move your website', href: '/guides/move-website-to-hostia' },
  ] });
  return cols;
}
function dedupe(items: MenuItem[]) { const seen = new Set<string>(); return items.filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true))); }

