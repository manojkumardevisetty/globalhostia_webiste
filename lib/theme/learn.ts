// Search-traffic content pages: /compare/* and /guides/* plus an index for each section.
// This file is plain data (no server imports) so routes.ts, the sitemap and /llms.txt can all read it.
// The page bodies, with live catalog prices, are in lib/theme/pages/learn.ts.
// Rules: no competitor brand names ("typical providers", "other registrars"), no invented numbers.
export type LearnSection = 'compare' | 'guides';
export type LearnPage = {
  section: LearnSection; slug: string;
  /** visible H1 / breadcrumb label */
  title: string;
  /** short card and hero summary */
  description: string;
  /** <title> override (≤ 60 characters with the brand) */
  seoTitle: string;
  /** meta + OG description, 140-160 characters */
  meta: string;
  /** reading time in minutes, estimated from the copy */
  minutes: number;
};

export const LEARN_SECTIONS: Record<LearnSection, { title: string; description: string; seoTitle: string; meta: string; kicker: string }> = {
  compare: {
    title: 'Hosting comparisons',
    description: 'Side-by-side comparisons that help you pick the right kind of hosting, control panel, domain and billing period, with live prices from our catalog.',
    seoTitle: 'Hosting Comparisons: VPS, Cloud, Panels & Domains',
    meta: 'Compare shared, VPS, cloud and dedicated hosting, cPanel and DirectAdmin, .ae and .com domains and billing periods, with live prices from our catalog.',
    kicker: 'Comparison',
  },
  guides: {
    title: 'Hosting guides',
    description: 'Step-by-step guides for moving a website, pointing a domain, setting up business email, WordPress and SSL, sizing a VPS and registering a .ae domain.',
    seoTitle: 'Hosting Guides: Domains, Email, SSL & VPS How-tos',
    meta: 'Step-by-step hosting guides: move your website, change nameservers, set up business email, install WordPress and SSL, size a VPS and register a .ae domain.',
    kicker: 'Guide',
  },
};

export const LEARN_PAGES: LearnPage[] = [
  /* ---------------------------------------------------------------- comparisons */
  { section: 'compare', slug: 'shared-vs-vps-vs-cloud-vs-dedicated', minutes: 7,
    title: 'Shared vs VPS vs cloud vs dedicated hosting',
    description: 'What each type of hosting gives you, what it costs on our live catalog, and how to tell when it is time to move up.',
    seoTitle: 'Shared vs VPS vs Cloud vs Dedicated Hosting',
    meta: 'Shared, VPS, cloud or dedicated hosting? Compare resources, root access, management and live starting prices side by side, and see when to upgrade your site.' },
  { section: 'compare', slug: 'cpanel-vs-directadmin', minutes: 6,
    title: 'cPanel vs DirectAdmin',
    description: 'Two popular hosting control panels compared: features, server footprint, licensing and which one you get with each of our plans.',
    seoTitle: 'cPanel vs DirectAdmin: Which Control Panel?',
    meta: 'cPanel or DirectAdmin? Compare email, DNS, backups, app installers, server footprint and licensing, and see which control panel comes with each hosting plan.' },
  { section: 'compare', slug: 'managed-vs-unmanaged-vps', minutes: 6,
    title: 'Managed vs unmanaged VPS',
    description: 'Who patches the operating system, who watches the server at 3am and who fixes it when it breaks: managed and unmanaged VPS compared.',
    seoTitle: 'Managed vs Unmanaged VPS: Who Does What',
    meta: 'Managed or unmanaged VPS? See who handles updates, security, backups, monitoring and fixes, what each costs on our live catalog, and which suits your team.' },
  { section: 'compare', slug: 'ae-vs-com', minutes: 5,
    title: '.ae vs .com for UAE businesses',
    description: 'Eligibility, local trust, search targeting, availability and live prices for the UAE country domain and the global .com.',
    seoTitle: '.ae vs .com: Which Domain for a UAE Business?',
    meta: 'Choosing between .ae and .com for a UAE business? Compare eligibility, local trust, search targeting, availability and live registration and renewal prices.' },
  { section: 'compare', slug: 'uae-data-center-vs-overseas', minutes: 6,
    title: 'Local UAE data center vs overseas hosting',
    description: 'Latency, data residency, cost and choice: what really changes when your server is inside or outside the Emirates.',
    seoTitle: 'UAE Data Center vs Overseas Hosting Compared',
    meta: 'Should your server be in the UAE or overseas? Compare latency, data residency, cost and choice, then measure the speed from your own browser before you order.' },
  { section: 'compare', slug: 'monthly-vs-3-year-billing', minutes: 5,
    title: 'Monthly vs 3-year billing',
    description: 'How much each billing period really saves on our plans, calculated from live prices, and when paying monthly is still the better choice.',
    seoTitle: 'Monthly vs Annual vs 3-Year Hosting Billing',
    meta: 'Monthly, yearly or 3-year hosting billing? See the real savings on our plans, calculated from live prices in your currency, and when monthly is the better pick.' },

  /* ---------------------------------------------------------------- guides */
  { section: 'guides', slug: 'move-website-to-hostia', minutes: 8,
    title: 'How to move a website to Globalhostia',
    description: 'Move files, databases and email from another host without downtime, either yourself or with our free migration.',
    seoTitle: 'How to Move Your Website to a New Host',
    meta: 'Move your website to Globalhostia without downtime: back up, copy files and databases, test, lower the DNS TTL and switch. Or let our engineers do it for free.' },
  { section: 'guides', slug: 'change-nameservers', minutes: 6,
    title: 'How to point a domain or change nameservers',
    description: 'Change nameservers, or keep your DNS and point A, CNAME and MX records instead, with the checks to run before and after.',
    seoTitle: 'How to Change Nameservers or Point a Domain',
    meta: 'Point your domain to your hosting: change nameservers at your registrar, or set A, CNAME and MX records instead. Includes the checks to run before and after.' },
  { section: 'guides', slug: 'business-email-setup', minutes: 7,
    title: 'How to set up business email on your domain',
    description: 'Create mailboxes, add MX, SPF, DKIM and DMARC records, and connect phones and desktop apps to email on your own domain.',
    seoTitle: 'How to Set Up Business Email on Your Domain',
    meta: 'Set up email on your own domain: choose a mail service, create mailboxes, add MX, SPF, DKIM and DMARC records and connect phones and desktop apps step by step.' },
  { section: 'guides', slug: 'install-wordpress', minutes: 6,
    title: 'How to install WordPress',
    description: 'Install WordPress with the one-click installer or by hand, then secure it and finish the first settings.',
    seoTitle: 'How to Install WordPress on Your Hosting',
    meta: 'Install WordPress on your hosting with the one-click app installer or by hand: database, wp-config, first login, HTTPS and the settings to change on day one.' },
  { section: 'guides', slug: 'install-ssl', minutes: 6,
    title: 'How to install an SSL certificate',
    description: 'Turn on the free SSL that comes with hosting, or install a paid DV, OV or EV certificate, then force HTTPS and fix mixed content.',
    seoTitle: 'How to Install an SSL Certificate (HTTPS)',
    meta: 'Install SSL on your website: turn on the free certificate, or generate a CSR, validate and install a paid one, then force HTTPS and fix mixed content warnings.' },
  { section: 'guides', slug: 'choose-vps-size', minutes: 7,
    title: 'How to choose a VPS size',
    description: 'Work out the vCPU, memory and storage your project needs, check it on a running server, and compare our live VPS plans.',
    seoTitle: 'How to Choose a VPS Size: CPU, RAM & Storage',
    meta: 'Work out how much vCPU, RAM and storage your VPS needs, measure real usage on a running server, and compare live VPS plans before you upgrade or order.' },
  { section: 'guides', slug: 'register-ae-domain', minutes: 5,
    title: 'How to register a .ae domain',
    description: 'Who can register .ae, which details and documents to prepare, and the steps from search to a live domain.',
    seoTitle: 'How to Register a .ae Domain: Requirements',
    meta: 'Register a .ae domain step by step: who is eligible, which details and documents to prepare, the live .ae price and what happens after you place the order.' },
  { section: 'guides', slug: 'vat-on-hosting-uae', minutes: 5,
    title: 'VAT on hosting in the UAE',
    description: 'General information on how UAE VAT applies to hosting, domains and other digital services, and what appears on your invoice. Not tax advice.',
    seoTitle: 'VAT on Web Hosting in the UAE: General Guide',
    meta: 'General information on UAE VAT for web hosting, domains and digital services: the 5% rate, tax invoices, overseas suppliers and when to ask a tax adviser.' },
];

export const learnPath = (p: Pick<LearnPage, 'section' | 'slug'>) => `/${p.section}/${p.slug}`;
export const learnPages = (section: LearnSection) => LEARN_PAGES.filter((p) => p.section === section);
export const learnPage = (section: string, slug: string) => LEARN_PAGES.find((p) => p.section === section && p.slug === slug);
/** Every URL slug (without leading slash) these pages answer on: the two indexes and every page. */
export const LEARN_SLUGS = [...(Object.keys(LEARN_SECTIONS) as LearnSection[]), ...LEARN_PAGES.map((p) => learnPath(p).slice(1))];
