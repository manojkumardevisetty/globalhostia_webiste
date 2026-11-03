// Which theme page module renders which URL. Pages not listed fall back to the original theme.
// title/description are shown on the page (hero, breadcrumbs, JSON-LD). seoTitle/meta, when set, replace them
// in <title> and the meta/OG description only (lib/theme/shell.ts), so search snippets can be longer and more
// specific without changing the visible copy. Keep meta 140-160 characters and only state what the page shows.
// Legacy alias URLs (/aws-pro-*, /vps-2) are 301-redirected to their main page: see lib/aliases.mjs.
import { LEARN_PAGES, LEARN_SECTIONS, LEARN_SLUGS, learnPath, type LearnSection } from './learn';
import { COMPETITORS, VS_SLUGS, vsSlug } from '../compare/competitors';

export type RouteDef = { kind: string; title: string; description: string; categories?: string[]; seoTitle?: string; meta?: string };

const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];
const D = ['dedicated-servers', 'premiumdedicated-servers'];

export const ROUTES: Record<string, RouteDef> = {
  index: { kind: 'home', title: 'Web Hosting, VPS & Dedicated Servers', description: 'NVMe web hosting, cloud VPS and dedicated servers in six datacenters, with free SSL, daily backups and 24/7 support.',
    meta: 'NVMe web hosting, cloud VPS, dedicated servers and domains from Dubai-based GlobalHostia. Free SSL, daily backups, upfront renewal prices and 24/7 support.' },
  'web-hosting': { kind: 'hosting', title: 'Web Hosting', description: 'Fast NVMe web hosting in the USA, Malaysia and Singapore with free SSL and daily backups.', categories: H,
    seoTitle: 'Web Hosting in the USA, Malaysia & Singapore',
    meta: 'Fast NVMe web hosting in the USA, Malaysia and Singapore. Free SSL, daily backups, email on your domain and free migration, with engineers on call 24/7.' },
  'shared-hosting': { kind: 'hosting', title: 'Shared Hosting', description: 'Affordable shared hosting on NVMe storage with free SSL, email and daily backups.', categories: H,
    seoTitle: 'Shared Hosting Plans: Lite, Ultra & Infinity',
    meta: 'Affordable shared hosting on NVMe storage: Lite, Ultra and Infinity plans with free SSL, email accounts and daily backups. Choose USA, Malaysia or Singapore.' },
  'wordpress-hosting': { kind: 'wordpress', title: 'Managed WordPress Hosting', description: 'WordPress hosting tuned for speed: caching, staging, automatic updates and backups.', categories: ['wordpress-hosting', ...H],
    meta: 'Managed WordPress hosting tuned for speed: caching, staging, automatic updates and daily backups on NVMe storage, plus free SSL and free migration of your site.' },
  'aws-pro-wordpress-ecommerce': { kind: 'wordpress', title: 'WordPress & WooCommerce Hosting', description: 'Hosting tuned for WooCommerce stores.', categories: ['wordpress-hosting', ...H],
    seoTitle: 'WooCommerce Hosting for WordPress Stores',
    meta: 'WooCommerce hosting for WordPress stores that cannot afford to stall: NVMe storage, caching, free SSL for checkout, daily backups and free store migration.' },
  'vps-hosting': { kind: 'vps', title: 'VPS Hosting', description: 'Linux and Windows VPS with dedicated vCPU, NVMe storage and full root access.', categories: ['hostiavps'],
    seoTitle: 'Linux & Windows VPS Hosting with Root Access',
    meta: 'Linux and Windows VPS hosting with reserved vCPU cores and memory, NVMe storage and full root access. Size your server, compare every plan and order online.' },
  'cloudvps-hosting': { kind: 'cloud', title: 'Cloud VPS', description: 'Fully managed SSD cloud VPS that scales with your traffic.', categories: ['hostiavps'],
    seoTitle: 'Managed Cloud VPS Hosting',
    meta: 'Fully managed cloud VPS on SSD storage that grows with your traffic. Reserved vCPU and RAM, scheduled backups and snapshots, run by engineers available 24/7.' },
  'cloud-servers': { kind: 'servers', title: 'Cloud VPS & Servers in Europe and USA', description: 'Classic and high-performance KVM VPS in Europe and the USA plus dedicated servers. Choose your OS, add RAM, vCPU or disk, automatic setup.', categories: ['hostiavps', 'dedicated-servers', 'windows-rdp', 'linux-rdp'],
    meta: 'Classic and high-performance KVM VPS in Europe and the USA, plus dedicated servers. Choose your OS, add RAM, vCPU or disk, with automatic setup after payment.' },
  'linux-rdp': { kind: 'servers', title: 'Linux RDP Server', description: 'Linux RDP servers with NVMe storage and full root access. Ubuntu, Debian and more; connect from anywhere, set up automatically after payment.', categories: ['linux-rdp'] },
  'windows-rdp': { kind: 'servers', title: 'Windows RDP Server', description: 'Always-on Windows RDP servers with NVMe storage and administrator access. Connect from any device; set up automatically after payment.', categories: ['windows-rdp'],
    meta: 'Always-on Windows RDP servers with NVMe storage and administrator access for trading platforms, bots and remote work. Set up automatically after payment.' },
  'dedicated-servers': { kind: 'dedicated', title: 'Dedicated Servers', description: 'Bare-metal Xeon and Ryzen servers with up to 10Gbps unmetered ports.', categories: D,
    seoTitle: 'Dedicated Servers: Bare-Metal Xeon & Ryzen',
    meta: 'Bare-metal Xeon and Ryzen dedicated servers with full root access and up to 10Gbps unmetered ports. Filter every model by CPU, RAM, storage and port speed.' },
  'ssl-certificate': { kind: 'ssl', title: 'SSL Certificates', description: 'DV, OV and EV SSL certificates from trusted authorities, issued in minutes.', categories: ['ssl-certificates'],
    seoTitle: 'SSL Certificates: DV, OV, EV & Wildcard',
    meta: 'Buy DV, OV, EV and wildcard SSL certificates from trusted authorities. Compare validation, coverage and warranty, then secure every login, form and checkout.' },
  'domains-registration': { kind: 'domains', title: 'Domain Registration', description: 'Search, register and transfer domains with transparent first-year and renewal prices.',
    seoTitle: 'Domain Name Search & Registration',
    meta: 'Search, register and transfer domain names with the first-year and renewal price shown upfront. DNS management included, all managed from one client area.' },
  'cpanel-reseller': { kind: 'reseller', title: 'cPanel Reseller Hosting', description: 'White-label cPanel reseller hosting to start your own hosting business.', categories: ['cpanel-reseller'],
    meta: 'White-label cPanel reseller hosting: split your resources into packages, put your brand on every account and set your own prices. We run the servers for you.' },
  'google-workspace': { kind: 'email', title: 'Business Email & Google Workspace', description: 'Professional email on your own domain with calendar, storage and collaboration.', categories: ['business-email'],
    meta: 'Professional business email on your own domain. Choose simple mailboxes with webmail for your team, or Google Workspace with calendar, documents and meetings.' },
  'n8n-automation': { kind: 'n8n', title: 'n8n Automation Hosting', description: 'Self-hosted n8n on NVMe servers: unlimited workflows, your data, your server.', categories: ['mcps'],
    meta: 'Self-hosted n8n automation on NVMe servers: unlimited workflows, your data kept on your own server, and engineers on hand at every step from order to first run.' },
  binance: { kind: 'n8n', title: 'Binance MCPs & Automation', description: 'Model Context Protocol servers and n8n automation for trading workflows.', categories: ['mcps'],
    seoTitle: 'Binance MCP Engine for Claude Trading',
    meta: 'Run your own Binance MCP engine: Model Context Protocol servers that connect Claude to your exchange account, with safety rails and n8n automation for trading.' },
  'ai-llm-hosting': { kind: 'ai', title: 'AI / LLM Hosting', description: 'Run Llama and other open models privately on servers sized for inference.', categories: ['ai-llm'],
    seoTitle: 'Private AI & LLM Hosting for Open Models',
    meta: 'Run Llama, Mistral, Qwen and other open models privately with Ollama on servers sized for inference. Your prompts and data stay on hardware you control.' },
  'forex-vps': { kind: 'forex', title: 'Forex VPS', description: 'Low-latency, always-on VPS for MetaTrader and trading bots.', categories: ['forex-vps'],
    seoTitle: 'Forex VPS for MetaTrader & Trading Bots',
    meta: 'Low-latency, always-on Windows VPS for MetaTrader terminals and trading bots, so your strategies keep running when your PC is off. Order online in minutes.' },
  projects: { kind: 'projects', title: 'Project Management Workspace', description: 'One workspace for every project: tasks, timelines and teams without per-seat costs.', categories: ['project-management'],
    meta: 'GlobalHostia PM, a hosted OpenProject workspace: boards, Gantt timelines, time tracking and a wiki for every project, priced per workspace instead of per seat.' },
  'sign-in': { kind: 'auth', title: 'Sign in', description: 'Sign in to your Globalhostia client area.', seoTitle: 'Sign in to Your Client Area' },
  'sign-up': { kind: 'auth', title: 'Create your account', description: 'Create your Globalhostia account.' },
  'forget-password': { kind: 'auth', title: 'Reset your password', description: 'Reset your Globalhostia password.' },
  about: { kind: 'content', title: 'About Globalhostia', description: 'Who we are: a Dubai-based hosting company running six datacenters on four continents.',
    seoTitle: 'About GlobalHostia: Dubai-Based Web Hosting Company',
    meta: 'Meet GlobalHostia, a Dubai-based hosting company offering web and WordPress hosting, VPS, dedicated servers, domains, SSL and business email worldwide.' },
  'help-center': { kind: 'content', title: 'Help Center', description: 'Guides and answers for hosting, domains, email and servers.',
    seoTitle: 'Help Center: Hosting, Domains & Email Support',
    meta: 'Find guides and answers for web hosting, domains, email, SSL and servers. Search popular support topics, browse the knowledge base or open a ticket, 24/7.' },
  'all-topics': { kind: 'content', title: 'All support topics', description: 'Browse every support topic.',
    seoTitle: 'All Support Topics: Hosting Knowledge Base',
    meta: 'Browse every GlobalHostia support topic in one list: WordPress, cPanel, backups, domain registration and transfers, email and servers, with step-by-step guides.' },
  'status-page': { kind: 'content', title: 'System status', description: 'Live status of Globalhostia services and datacenters.',
    seoTitle: 'System Status: Live Service & Network Checks',
    meta: 'Check the live status of GlobalHostia hosting, servers and network. Live checks and incident updates are published in our client area and announcements.' },
  'incident-history': { kind: 'content', title: 'Incident history', description: 'Past incidents and maintenance.',
    seoTitle: 'Incident History & Maintenance Reports',
    meta: 'Where to find past GlobalHostia incidents and scheduled maintenance: incident reports and maintenance notices are published in our client area announcements.' },
  'incident-post': { kind: 'content', title: 'Incident report', description: 'Incident details.',
    seoTitle: 'Incident Report and Service Updates',
    meta: 'Incident reports and service updates for GlobalHostia hosting and servers are published in our client area. Open live network status or read announcements.' },
  network: { kind: 'content', title: 'Our network', description: 'Datacenters and CDN locations.',
    seoTitle: 'Our Network & Datacenter Locations',
    meta: 'Where GlobalHostia servers run: shared hosting in the USA, Malaysia and Singapore, server datacenters from the USA and Brazil to India, supported from Dubai.' },
  'privacy-policy': { kind: 'content', title: 'Privacy policy', description: 'How Globalhostia handles your data.',
    seoTitle: 'Privacy Policy: How We Protect Your Data',
    meta: 'How GlobalHostia collects, uses, stores and protects your personal data when you visit our website or use our hosting, domain and server services.' },
  'terms-conditions': { kind: 'content', title: 'Terms & conditions', description: 'Terms of service.',
    seoTitle: 'Terms & Conditions of Service',
    meta: 'The terms and conditions for GlobalHostia hosting, domains, servers and other services: orders, billing and renewals, acceptable use, cancellations and refunds.' },
  'website-builder': { kind: 'content', title: 'Website Builder', description: 'Build your website with drag and drop.',
    seoTitle: 'Website Builder with Web Hosting Included',
    meta: 'Build your website with drag and drop on GlobalHostia web hosting. Every plan includes free SSL and backups; ask our team which builder tools fit your plan.' },
  'start-vpn': { kind: 'content', title: 'VPN', description: 'Private, fast VPN.',
    seoTitle: 'Run Your Own Private VPN on a VPS',
    meta: 'Run your own private VPN, such as WireGuard or OpenVPN, on a Linux or Windows VPS with full root access. Your server, your traffic, no shared VPN exit nodes.' },
  contact: { kind: 'contact', title: 'Contact us', description: 'Talk to Globalhostia sales or support by phone, email or ticket.',
    seoTitle: 'Contact Us: 24/7 Sales & Support',
    meta: 'Talk to GlobalHostia sales or technical support by phone, email, WhatsApp or ticket, every hour of every day. Our team is based in Dubai, United Arab Emirates.' },
  // growth pages (lib/theme/growth.ts helpers)
  'plan-finder': { kind: 'planfinder', title: 'Plan finder: which hosting do I need?', description: 'Answer four quick questions and get a hosting, VPS or server recommendation from our live catalog, with real prices and two alternatives.' },
  'free-migration': { kind: 'migration', title: 'Free website migration', description: 'Moving from another host? Our engineers copy your website, databases and email to Globalhostia for free, with no downtime. Request a migration in two minutes.' },
  'ae-domains': { kind: 'aedomains', title: '.ae Domains: register your UAE domain', description: 'Register a .ae domain for your UAE business. Live .ae price, eligibility requirements and help with the paperwork from a Dubai-based team.' },
  'domain-broker': { kind: 'broker', title: 'Domain broker service', description: 'The domain you want is taken? A dedicated broker contacts the owner anonymously, negotiates within your budget and secures the transfer through escrow.',
    seoTitle: 'Domain Broker Service: Buy a Taken Domain',
    meta: 'Buy a taken or premium domain: anonymous owner outreach, negotiation within your budget and escrow transfer. A fixed fee to start and a commission only if the deal closes.' },
  'premium-domains': { kind: 'premium', title: 'Premium domains for sale', description: 'Hand-picked premium domain names for sale, with the price shown upfront. Request a name and we confirm it, send a secure invoice and move it to your account.',
    seoTitle: 'Premium Domains for Sale: Short, Brandable Names',
    meta: 'Buy a premium domain name with the price shown upfront: short, brandable .com, .ai, .io and .ae names. We confirm, invoice securely and transfer it to you.' },
  'data-centers': { kind: 'datacenters', title: 'Data centers and network locations', description: 'Where our hosting, VPS and dedicated servers run, and a live test of the round-trip time from your browser to our network.' },
  'web-hosting-dubai': { kind: 'uae', title: 'Web Hosting in Dubai', description: 'Web hosting from a Dubai-based company: NVMe plans with free SSL, prices in AED, a price-locked renewal and support by WhatsApp and ticket around the clock.', categories: H },
  'vps-uae': { kind: 'uae', title: 'VPS Hosting UAE', description: 'Linux and Windows VPS for UAE businesses: dedicated vCPU and RAM, NVMe storage, root access and engineers on WhatsApp 24/7. Live prices in AED or USD.', categories: ['hostiavps', 'high-performance-vps'] },
  'windows-rdp-uae': { kind: 'uae', title: 'Windows RDP in the UAE', description: 'An always-on Windows desktop in the cloud for UAE teams and traders: administrator access, NVMe storage and setup after payment. Connect from any device.', categories: ['windows-rdp', 'linux-rdp'] },
  'best-hosting-uae': { kind: 'uae', title: 'Best Web Hosting in the UAE: how to choose', description: 'What to compare before you buy hosting in the UAE: renewal prices, support hours, data location, VAT invoices and migration. An honest checklist and our live plans.', categories: H },
  // /compare and /guides indexes and pages (lib/theme/learn.ts, rendered by lib/theme/pages/learn.ts)
  ...Object.fromEntries((Object.keys(LEARN_SECTIONS) as LearnSection[]).map((k) => [k, { kind: 'learn', title: LEARN_SECTIONS[k].title, description: LEARN_SECTIONS[k].description, seoTitle: LEARN_SECTIONS[k].seoTitle, meta: LEARN_SECTIONS[k].meta }])),
  ...Object.fromEntries(LEARN_PAGES.map((p) => [learnPath(p).slice(1), { kind: 'learn', title: p.title, description: p.description, seoTitle: p.seoTitle, meta: p.meta }])),
  // /compare/globalhostia-vs-<slug> (data: lib/compare/competitors.ts, page: lib/theme/pages/vs.ts; hidden ones answer 404)
  ...Object.fromEntries(COMPETITORS.map((c) => [vsSlug(c.slug), { kind: 'vs', title: `GlobalHostia vs ${c.name}`,
    description: `GlobalHostia and ${c.name} compared: entry shared hosting price and renewal, storage, backups, locations and support, with a source for every ${c.name} fact.`,
    seoTitle: `GlobalHostia vs ${c.seoName || c.name}: Prices, Renewals & Features`,
    meta: `GlobalHostia vs ${c.seoName || c.name}: entry hosting prices and renewals, storage, backups, data centres and support side by side, every fact sourced and dated.` }])),
};

/** Pages that only exist in the Hostpen theme: always rendered by it, whatever the site theme (like /blog). */
export const THEME_ONLY = new Set(['plan-finder', 'free-migration', 'ae-domains', 'data-centers', 'web-hosting-dubai', 'vps-uae', 'windows-rdp-uae', 'best-hosting-uae', ...LEARN_SLUGS, 'domain-broker', 'premium-domains']);
for (const v of VS_SLUGS) THEME_ONLY.add(v); // GlobalHostia vs <host> pages

/**
 * Programmatic SEO pages (lib/theme/pseo.ts): /domains/<tld>, /locations/<loc>, /<type>/<loc>, /hosting-for[/<usecase>],
 * and /category/<slug> for categories without a hand-written page (lib/theme/pages/category.ts).
 * Always rendered by the Hostpen theme (like THEME_ONLY). The page module returns null for an unknown slug → 404.
 */
const DYNAMIC_PREFIX: Record<string, string> = {
  domains: 'tld', locations: 'location', 'hosting-for': 'usecase', category: 'category', 'business-services': 'store',
  'web-hosting': 'location', vps: 'location', 'dedicated-servers': 'location', 'windows-rdp': 'location', 'linux-rdp': 'location',
};
export function dynamicRoute(segs: string[]): RouteDef | null {
  const s = segs.map((x) => x.toLowerCase());
  if (s.length === 1 && s[0] === 'hosting-for') return { kind: 'usecase', title: '', description: '' };
  // Business services shop: hub and category pages (lib/theme/pages/store.ts, config in Admin → Business services)
  if (s.length === 1 && s[0] === 'business-services') return { kind: 'store', title: '', description: '' };
  // Premium domain detail pages /premium-domains/<domain> (lib/theme/pages/premium.ts returns null for an unknown name → 404)
  if (s.length === 2 && s[0] === 'premium-domains' && /^[a-z0-9][a-z0-9-]{0,62}(\.[a-z0-9-]{1,63}){1,2}$/.test(s[1])) return { kind: 'premium', title: '', description: '' };
  if (s.length !== 2 || !DYNAMIC_PREFIX[s[0]] || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(s[1])) return null;
  return { kind: DYNAMIC_PREFIX[s[0]], title: '', description: '' };
}

/** product detail pages /p/<slug> use kind 'product' */
export const PRODUCT_ROUTE: RouteDef = { kind: 'product', title: '', description: '' };

/** /blog, /blog/<slug>, /blog/category/<slug>, /blog/rss.xml (lib/theme/pages/blog.ts) */
export const BLOG_ROUTE: RouteDef = { kind: 'blog', title: 'Blog', description: 'Hosting guides and news from Globalhostia.', seoTitle: 'Blog: Web Hosting Guides, Tutorials & News' };
