// Which theme page module renders which URL. Pages not listed fall back to the original theme.
export type RouteDef = { kind: string; title: string; description: string; categories?: string[] };

const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];
const D = ['dedicated-servers', 'premiumdedicated-servers'];

export const ROUTES: Record<string, RouteDef> = {
  index: { kind: 'home', title: 'Web Hosting, VPS & Dedicated Servers', description: 'NVMe web hosting, cloud VPS and dedicated servers in six datacenters, with free SSL, daily backups and 24/7 support.' },
  'web-hosting': { kind: 'hosting', title: 'Web Hosting', description: 'Fast NVMe web hosting in the USA, Malaysia and Singapore with free SSL and daily backups.', categories: H },
  'shared-hosting': { kind: 'hosting', title: 'Shared Hosting', description: 'Affordable shared hosting on NVMe storage with free SSL, email and daily backups.', categories: H },
  'wordpress-hosting': { kind: 'wordpress', title: 'Managed WordPress Hosting', description: 'WordPress hosting tuned for speed: caching, staging, automatic updates and backups.', categories: ['wordpress-hosting', ...H] },
  'aws-pro-wordpress': { kind: 'wordpress', title: 'Managed WordPress Hosting', description: 'WordPress hosting tuned for speed.', categories: ['wordpress-hosting', ...H] },
  'aws-pro-wordpress-ecommerce': { kind: 'wordpress', title: 'WordPress & WooCommerce Hosting', description: 'Hosting tuned for WooCommerce stores.', categories: ['wordpress-hosting', ...H] },
  'vps-hosting': { kind: 'vps', title: 'VPS Hosting', description: 'Linux and Windows VPS with dedicated vCPU, NVMe storage and full root access.', categories: ['hostiavps'] },
  'vps-2': { kind: 'vps', title: 'VPS Hosting', description: 'Linux and Windows VPS with dedicated vCPU, NVMe storage and full root access.', categories: ['hostiavps'] },
  'aws-pro-vps-hosting': { kind: 'vps', title: 'VPS Hosting', description: 'Linux and Windows VPS.', categories: ['hostiavps'] },
  'cloudvps-hosting': { kind: 'cloud', title: 'Cloud VPS', description: 'Fully managed SSD cloud VPS that scales with your traffic.', categories: ['hostiavps'] },
  'cloud-servers': { kind: 'servers', title: 'Cloud VPS & Servers in Europe and USA', description: 'Classic and high-performance KVM VPS in Europe and the USA plus dedicated servers. Choose your OS, add RAM, vCPU or disk, automatic setup.', categories: ['hostiavps', 'dedicated-servers', 'windows-rdp', 'linux-rdp'] },
  'linux-rdp': { kind: 'servers', title: 'Linux RDP Server', description: 'Linux RDP servers with NVMe storage and full root access. Ubuntu, Debian and more; connect from anywhere, set up automatically after payment.', categories: ['linux-rdp'] },
  'windows-rdp': { kind: 'servers', title: 'Windows RDP Server', description: 'Always-on Windows RDP servers with NVMe storage and administrator access. Connect from any device; set up automatically after payment.', categories: ['windows-rdp'] },
  'dedicated-servers': { kind: 'dedicated', title: 'Dedicated Servers', description: 'Bare-metal Xeon and Ryzen servers with up to 10Gbps unmetered ports.', categories: D },
  'aws-pro-dedicated-server': { kind: 'dedicated', title: 'Dedicated Servers', description: 'Bare-metal servers.', categories: D },
  'aws-pro-fully-managed-dedicated-server': { kind: 'dedicated', title: 'Fully Managed Dedicated Servers', description: 'Managed bare-metal servers.', categories: D },
  'ssl-certificate': { kind: 'ssl', title: 'SSL Certificates', description: 'DV, OV and EV SSL certificates from trusted authorities, issued in minutes.', categories: ['ssl-certificates'] },
  'domains-registration': { kind: 'domains', title: 'Domain Registration', description: 'Search, register and transfer domains with transparent first-year and renewal prices.' },
  'aws-pro-domains-search': { kind: 'domains', title: 'Domain Search', description: 'Find and register your domain.' },
  'cpanel-reseller': { kind: 'reseller', title: 'cPanel Reseller Hosting', description: 'White-label cPanel reseller hosting to start your own hosting business.', categories: ['cpanel-reseller'] },
  'aws-pro-cpanel-hosting': { kind: 'reseller', title: 'cPanel Hosting', description: 'cPanel hosting and reseller plans.', categories: ['cpanel-reseller'] },
  'google-workspace': { kind: 'email', title: 'Business Email & Google Workspace', description: 'Professional email on your own domain with calendar, storage and collaboration.', categories: ['business-email'] },
  'aws-pro-professional-business-email': { kind: 'email', title: 'Professional Business Email', description: 'Email on your own domain.', categories: ['business-email'] },
  'n8n-automation': { kind: 'n8n', title: 'n8n Automation Hosting', description: 'Self-hosted n8n on NVMe servers: unlimited workflows, your data, your server.', categories: ['mcps'] },
  binance: { kind: 'n8n', title: 'Binance MCPs & Automation', description: 'Model Context Protocol servers and n8n automation for trading workflows.', categories: ['mcps'] },
  'ai-llm-hosting': { kind: 'ai', title: 'AI / LLM Hosting', description: 'Run Llama and other open models privately on servers sized for inference.', categories: ['ai-llm'] },
  'forex-vps': { kind: 'forex', title: 'Forex VPS', description: 'Low-latency, always-on VPS for MetaTrader and trading bots.', categories: ['forex-vps'] },
  projects: { kind: 'projects', title: 'Project Management Workspace', description: 'One workspace for every project: tasks, timelines and teams without per-seat costs.', categories: ['project-management'] },
  'sign-in': { kind: 'auth', title: 'Sign in', description: 'Sign in to your Globalhostia client area.' },
  'sign-up': { kind: 'auth', title: 'Create your account', description: 'Create your Globalhostia account.' },
  'forget-password': { kind: 'auth', title: 'Reset your password', description: 'Reset your Globalhostia password.' },
  about: { kind: 'content', title: 'About Globalhostia', description: 'Who we are: a Dubai-based hosting company running six datacenters on four continents.' },
  'help-center': { kind: 'content', title: 'Help Center', description: 'Guides and answers for hosting, domains, email and servers.' },
  'all-topics': { kind: 'content', title: 'All support topics', description: 'Browse every support topic.' },
  'status-page': { kind: 'content', title: 'System status', description: 'Live status of Globalhostia services and datacenters.' },
  'incident-history': { kind: 'content', title: 'Incident history', description: 'Past incidents and maintenance.' },
  'incident-post': { kind: 'content', title: 'Incident report', description: 'Incident details.' },
  network: { kind: 'content', title: 'Our network', description: 'Datacenters and CDN locations.' },
  'privacy-policy': { kind: 'content', title: 'Privacy policy', description: 'How Globalhostia handles your data.' },
  'terms-conditions': { kind: 'content', title: 'Terms & conditions', description: 'Terms of service.' },
  'website-builder': { kind: 'content', title: 'Website Builder', description: 'Build your website with drag and drop.' },
  'start-vpn': { kind: 'content', title: 'VPN', description: 'Private, fast VPN.' },
  contact: { kind: 'contact', title: 'Contact us', description: 'Talk to Globalhostia sales or support by phone, email or ticket.' },
};

/** product detail pages /p/<slug> use kind 'product' */
export const PRODUCT_ROUTE: RouteDef = { kind: 'product', title: '', description: '' };

/** /blog, /blog/<slug>, /blog/category/<slug>, /blog/rss.xml (lib/theme/pages/blog.ts) */
export const BLOG_ROUTE: RouteDef = { kind: 'blog', title: 'Blog', description: 'Hosting guides and news from Globalhostia.' };
