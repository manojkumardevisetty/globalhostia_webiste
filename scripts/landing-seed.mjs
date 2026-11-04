// Starter ad landing pages (/lp/<slug>), inserted once as DRAFTS by scripts/db-setup.mjs (patch 018-landing-pages).
// The owner reviews and publishes them in Admin → Marketing → Landing pages.
// `targets` lists candidate catalog references in order of preference; the first one with published products
// (or a priced TLD) at seed time is stored. Copy only states what the site shows elsewhere: no prices, no reviews.

export const LANDING_SEED = [
  {
    // the slug stays (it may already be used in an ad group); the copy follows the premium positioning
    slug: 'cheap-hosting-uae', name: 'Web hosting UAE (Google Ads)',
    headline: 'Managed web hosting for UAE businesses',
    subheadline: 'NVMe hosting with free SSL and daily backups, run by a Dubai-based team. See the live price and order online in minutes.',
    targets: ['cat:hostia-shared', 'cat:hosting-usa', 'cat:hosting-singapore'],
    benefits: ['Free SSL certificate on every site', 'Daily backups', 'NVMe storage for fast page loads', 'Email accounts on your own domain', 'Support by WhatsApp and ticket around the clock'],
    ctaLabel: 'Get started',
    faq: [
      { q: 'Is the price shown the full price?', a: 'The price comes live from our billing system. The order form shows the exact total for your billing period, including any setup fee and VAT where it applies, before you pay.' },
      { q: 'Can you move my existing website?', a: 'Yes. Our engineers can copy your website, databases and email from your current host. Ask for a free migration after you order.' },
      { q: 'Which payment methods do you accept?', a: 'Major cards and cryptocurrency. The order form lists every method available for your plan.' },
    ],
  },
  {
    slug: 'forex-vps', name: 'Forex VPS (Google Ads)',
    headline: 'Forex VPS for MetaTrader, always on',
    subheadline: 'Run MT4, MT5 and your expert advisors around the clock on a server with NVMe storage and administrator access.',
    targets: ['cat:forex-vps', 'cat:windows-rdp', 'cat:hostiavps'],
    benefits: ['Your terminals and expert advisors keep running when your PC is off', 'Full administrator access', 'NVMe storage', 'Connect from your phone, tablet or computer', 'Set up automatically after payment'],
    ctaLabel: 'Order your VPS',
    faq: [
      { q: 'Which trading platforms can I run?', a: 'Any platform you are licensed to use on the server operating system, such as MetaTrader 4 or MetaTrader 5, along with your expert advisors.' },
      { q: 'How soon can I log in?', a: 'Servers are set up automatically after payment. Your login details arrive by email from our billing system.' },
      { q: 'Can I upgrade later?', a: 'Yes. Ask support from your client area and we explain any price difference before anything changes.' },
    ],
  },
  {
    slug: 'windows-rdp', name: 'Windows RDP (Google Ads)',
    headline: 'Windows RDP server, ready when you are',
    subheadline: 'An always-on Windows desktop in the cloud with administrator access and NVMe storage. Connect from any device.',
    targets: ['cat:windows-rdp', 'cat:forex-vps'],
    benefits: ['Always-on Windows desktop in the cloud', 'Administrator access', 'NVMe storage', 'Connect from Windows, Mac, iPhone or Android', 'Set up automatically after payment'],
    ctaLabel: 'Order Windows RDP',
    faq: [
      { q: 'How do I connect?', a: 'Use any Remote Desktop app: the one built into Windows, or the free Microsoft Remote Desktop app on Mac, iPhone and Android.' },
      { q: 'How soon can I log in?', a: 'Servers are set up automatically after payment. Your login details arrive by email from our billing system.' },
      { q: 'Is the price shown the full price?', a: 'The price comes live from our billing system. The order form shows the exact total, including any setup fee and VAT where it applies, before you pay.' },
    ],
  },
  {
    slug: 'wordpress-hosting-dubai', name: 'WordPress hosting Dubai (Google Ads)',
    headline: 'WordPress hosting from a Dubai-based team',
    subheadline: 'Fast NVMe hosting for WordPress with free SSL, daily backups and engineers on WhatsApp around the clock.',
    targets: ['cat:wordpress-hosting', 'cat:hostia-shared', 'cat:hosting-usa'],
    benefits: ['Free SSL certificate', 'Daily backups', 'NVMe storage for faster pages', 'Free migration of your existing WordPress site', 'Support by WhatsApp and ticket'],
    ctaLabel: 'Start your WordPress site',
    faq: [
      { q: 'Can you move my WordPress site for me?', a: 'Yes. Our engineers copy your files, database and email from your current host. Ask for a free migration after you order.' },
      { q: 'Is WordPress installed for me?', a: 'You can install WordPress in a few clicks from your control panel, or ask support and we will set it up.' },
      { q: 'Is the price shown the full price?', a: 'The price comes live from our billing system. The order form shows the exact total, including VAT where it applies, before you pay.' },
    ],
  },
  {
    slug: 'domain-ae', name: '.ae domains (Google Ads)',
    headline: 'Register your .ae domain',
    subheadline: 'Show customers you are a UAE business. Live .ae price, and help with the eligibility paperwork from our Dubai team.',
    targets: ['tld:.ae'],
    benefits: ['Live .ae price from our registrar system', 'Help with the .ae eligibility documents', 'Manage DNS and renewals from your client area', 'Add hosting and email in the same order'],
    ctaLabel: 'Search .ae domains',
    faq: [
      { q: 'Who can register a .ae domain?', a: 'The .ae registry sets its own rules and they can change. A presence in the UAE, such as a trade licence, may be required. Ask us first and we confirm the current requirements for your case.' },
      { q: 'What if the registry asks for documents?', a: 'We tell you exactly what is needed and submit it for you.' },
      { q: 'Can I transfer an existing .ae domain?', a: 'Yes. Contact our team with the domain name and we explain the steps.' },
    ],
  },
];
