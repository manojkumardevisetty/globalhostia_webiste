// Starter content for the Business services shop (/business-services), inserted by scripts/db-setup.mjs patch
// '022-business-services' only where missing. After that everything is edited in the admin:
//   - category names, intro text and SEO fields: Admin → Categories (rows below)
//   - sections, icons, WHMCS group names, FAQs, quote questions, bundles, publish switch: Admin → Business services
// Copy rules: describe the service plainly, no prices, no competitor names, no promises a plan may not include
// (plan details come from the WHMCS products once they exist).

/** Section rows (top-level categories that hold the shop categories). */
export const STORE_SECTIONS = [
  { slug: 'security-services', name: 'Security', icon: 'shield', description: 'Certificates, malware protection and backups that keep your website and your visitors safe.',
    seoTitle: 'Website Security Services: SSL, Malware Protection & Backups', seoDescription: 'Protect your website with SSL certificates, malware scanning and automatic website backups, managed from the same account as your hosting and domains.' },
  { slug: 'email-productivity', name: 'Email & productivity', icon: 'mail', description: 'Email on your own domain, collaboration suites and spam filtering for your team.',
    seoTitle: 'Business Email & Productivity: Professional Email, Spam Filtering', seoDescription: 'Professional email on your own domain, Google Workspace, Microsoft 365 and spam filtering for your team, billed with your hosting and domains.' },
  { slug: 'build-and-grow', name: 'Build & grow', icon: 'trend', description: 'Tools to build your website and bring visitors to it.',
    seoTitle: 'Website Builder, SEO Tools & Email Marketing', seoDescription: 'Build your website with a drag-and-drop builder, find what to improve with SEO tools and reach customers with email marketing, all from one account.' },
  { slug: 'done-for-you', name: 'Done-for-you services', icon: 'headset', description: 'Our team does the work: website design, branding, WordPress care and business setup on Google, payments and WhatsApp.',
    seoTitle: 'Done-for-You Website & Business Setup Services', seoDescription: 'Website design, logo and brand kits, WordPress care and setup of Google Business Profile, payment gateways and WhatsApp Business, quoted by our team.' },
  { slug: 'business-bundles', name: 'Business bundles', icon: 'layers', description: 'Ready-made combinations of domain, hosting and business services, priced from the live plans.',
    seoTitle: 'Business Bundles: Domain, Hosting & Email Together', seoDescription: 'Start online with a domain, hosting and business services in one go. Bundle totals are added up from the live prices of each plan.' },
];

const F = (q, a) => ({ q, a });

/** Shop categories. existing: true = a category the site already has (never changed if present). */
export const STORE_ENTRIES = [
  /* ---------------- Security */
  { slug: 'ssl-certificates', section: 'security-services', existing: true, kind: 'whmcs', icon: 'lock', name: 'SSL Certificates',
    groups: ['SSL Certificates', 'SSL', 'ssl-certificates'],
    blurb: 'DV, OV, EV and wildcard certificates for the padlock and https.',
    description: 'Domain, organization and extended validation certificates, including wildcard options, from trusted certificate authorities.',
    seoTitle: 'SSL Certificates: DV, OV, EV & Wildcard', seoDescription: 'Buy DV, OV, EV and wildcard SSL certificates from trusted authorities. Compare validation, coverage and warranty, then secure every login, form and checkout.',
    included: [], faq: [] },
  { slug: 'website-security', section: 'security-services', kind: 'whmcs', icon: 'shield', name: 'Website Security & Malware Protection',
    groups: ['SiteLock', 'Website Security', 'Malware Protection'],
    blurb: 'Malware scanning and removal options for your website.',
    description: 'Website security plans that scan your site for malware and vulnerabilities, with removal and a firewall on higher plans. What each plan includes is listed on the plan itself.',
    seoTitle: 'Website Security & Malware Protection Plans', seoDescription: 'Scan your website for malware and vulnerabilities and choose a plan with removal and a web application firewall. Compare plans and order online.',
    included: ['Malware and vulnerability scanning of your website', 'Plans compared side by side, with what each one includes', 'Billed and managed from your client area'],
    faq: [
      F('Do I need website security if I already have an SSL certificate?', 'Yes, they do different jobs. An SSL certificate encrypts the connection between visitors and your site. Website security scans the site itself for malware and known vulnerabilities, and higher plans can remove infections and block attacks.'),
      F('Does it work with websites hosted somewhere else?', 'Website security services work at the website level, so they can usually protect sites hosted with us or elsewhere. Check the plan description, or ask our team before you order.'),
      F('Which plan should I choose?', 'Start with what you need: scanning only, scanning plus automatic malware removal, or a firewall as well. Each plan lists what it includes, and our team can recommend one for your site.'),
    ] },
  { slug: 'website-backup', section: 'security-services', kind: 'whmcs', icon: 'archive', name: 'Website Backup',
    groups: ['CodeGuard', 'Website Backup', 'Backups'],
    blurb: 'Automatic off-site backups with easy restore.',
    description: 'Automatic website and database backups stored off your server, so you can restore a working copy after a mistake, a bad update or an attack. Storage and retention depend on the plan.',
    seoTitle: 'Automatic Website Backup Plans', seoDescription: 'Automatic website and database backups stored off your server, with restore when you need it. Compare backup storage and retention, then order online.',
    included: ['Automatic backups of website files and databases', 'Copies stored away from your hosting server', 'Restore a previous version when something goes wrong'],
    faq: [
      F('My hosting already has backups. Why add another?', 'Hosting backups protect the server. A separate backup service keeps its own copies off the server, often with longer history and restore of individual files, which helps when you need to go back further or restore just part of a site.'),
      F('How long are backups kept?', 'Retention depends on the plan and is listed on each plan. If you need a longer history for compliance reasons, ask our team which option fits.'),
      F('Can I restore only one file or the database?', 'Most backup plans let you restore the whole site, individual files or the database. Check the plan description for the restore options it includes.'),
    ] },
  /* ---------------- Email & productivity */
  { slug: 'professional-email', section: 'email-productivity', kind: 'whmcs', icon: 'mail', name: 'Professional Email',
    groups: ['Professional Email', 'OX App Suite', 'Open-Xchange', 'professional-email'],
    blurb: 'Email on your domain with webmail, calendar and contacts.',
    description: 'Mailboxes on your own domain with webmail, calendar and contacts that work on desktop and mobile. Mailbox count and storage depend on the plan.',
    seoTitle: 'Professional Email on Your Own Domain', seoDescription: 'Professional email on your own domain with webmail, calendar and contacts on every device. Compare mailbox storage and plans, then order online.',
    included: ['Email addresses on your own domain', 'Webmail plus setup for phones and desktop apps', 'Calendar and contacts with your mailbox'],
    faq: [
      F('Can I keep my current domain?', 'Yes. Professional email works with a domain you already own, whether it is registered with us or elsewhere. We help you point the email records to the new mailboxes.'),
      F('Can I move my existing emails?', 'Usually yes, when your current provider allows IMAP access. Ask our team about moving existing mailboxes before you switch.'),
      F('How is this different from the email included with hosting?', 'Hosting email is good for basic mailboxes. Professional email is a dedicated mail service with more storage options, calendar and contacts, and it keeps working independently of your website hosting.'),
    ] },
  { slug: 'business-email', section: 'email-productivity', existing: true, kind: 'whmcs', icon: 'grid', name: 'Business Email',
    groups: ['Google Workspace', 'G Suite', 'business-email'],
    blurb: 'Google Workspace and business mailboxes on your domain.',
    description: 'Professional email on your own domain with calendar, storage and collaboration.',
    seoTitle: '', seoDescription: '', included: [], faq: [] },
  { slug: 'microsoft-365', section: 'email-productivity', kind: 'whmcs', icon: 'layers', name: 'Microsoft 365',
    groups: ['Microsoft 365', 'Office 365', 'microsoft-365', 'office-365'],
    blurb: 'Outlook, Teams and Office apps with email on your domain.',
    description: 'Microsoft 365 plans for business email in Outlook, Teams and the Office apps, set up on your own domain. Apps and storage depend on the plan.',
    seoTitle: 'Microsoft 365 for Business with Your Domain', seoDescription: 'Microsoft 365 business plans with Outlook email on your own domain, Teams and Office apps. Ask our team to set it up with your domain and DNS.',
    included: ['Business email in Outlook on your own domain', 'Domain and DNS setup help from our team', 'Billed with your hosting and domains'],
    faq: [
      F('Can you set up Microsoft 365 on my domain?', 'Yes. We add the DNS records Microsoft 365 needs to your domain so email, Teams and sign-in work with your own address.'),
      F('Which Microsoft 365 plan do I need?', 'It depends on whether your team needs the desktop Office apps or only email and online apps. Tell us how your team works and we will recommend a plan.'),
    ] },
  { slug: 'spam-filtering', section: 'email-productivity', kind: 'whmcs', icon: 'filter', name: 'Spam Filtering',
    groups: ['SpamExperts', 'Spam Experts', 'E-mail Services', 'Email Services', 'Spam Filtering'],
    blurb: 'Filter spam and malware before it reaches your inbox.',
    description: 'Incoming email filtering that stops spam, phishing and malware before it reaches your mailboxes. Outgoing filtering and archiving depend on the plan.',
    seoTitle: 'Email Spam Filtering for Your Domain', seoDescription: 'Filter spam, phishing and malware before it reaches your inbox. Email filtering for your own domain, set up with your existing mailboxes.',
    included: ['Incoming spam and malware filtering for your domain', 'Works with your existing mailboxes', 'Quarantine you can review'],
    faq: [
      F('Do I need to change my email provider?', 'No. Spam filtering sits in front of your existing mailboxes: we change your domain mail records so email is filtered first and then delivered as before.'),
      F('What happens to legitimate emails marked as spam?', 'Filtered messages are held in a quarantine you can review and release, so a wrongly flagged email is not lost.'),
    ] },
  /* ---------------- Build & grow */
  { slug: 'website-builder', section: 'build-and-grow', kind: 'whmcs', icon: 'pen', name: 'Website Builder',
    groups: ['Website Builder', 'Site Builder', 'sitebuilder', 'Weebly'],
    blurb: 'Drag-and-drop builder with templates, no coding needed.',
    description: 'Build your website with a drag-and-drop editor and ready-made templates, then publish it to your domain. Page limits and store features depend on the plan.',
    seoTitle: 'Drag-and-Drop Website Builder', seoDescription: 'Build your website with a drag-and-drop editor and ready-made templates, then publish to your own domain. Compare builder plans and order online.',
    included: ['Drag-and-drop editor with templates', 'Publish to your own domain', 'Mobile-friendly layouts'],
    faq: [
      F('Do I need hosting for the website builder?', 'It depends on the builder plan. Some builder plans publish to your hosting account, others include hosting. The plan description tells you, and our team can confirm before you order.'),
      F('Would you rather we build the site for you?', 'See our website design packages under Done-for-you services: our team designs and builds the site and hands it over to you.'),
    ] },
  { slug: 'seo-tools', section: 'build-and-grow', kind: 'whmcs', icon: 'trend', name: 'SEO Tools',
    groups: ['Marketgoo', 'SEO Tools', 'SEO'],
    blurb: 'Find and fix what holds your site back in search.',
    description: 'SEO tools that check your website, explain what to improve and track your progress in search results. Features depend on the plan.',
    seoTitle: 'SEO Tools to Improve Your Website in Search', seoDescription: 'Check your website for SEO issues, get a plan of what to fix and track your progress in search. Compare SEO tool plans and order online.',
    included: ['Website check with a list of improvements', 'Step-by-step tasks you can follow', 'Progress tracking over time'],
    faq: [
      F('Do I need to be an SEO expert?', 'No. SEO tools turn a site check into a list of tasks with explanations. If you would rather we do the setup, see our SEO and Google Business Profile setup service.'),
    ] },
  { slug: 'email-marketing', section: 'build-and-grow', kind: 'whmcs', icon: 'chat', name: 'Email Marketing',
    groups: ['Email Marketing', 'Newsletter'],
    blurb: 'Newsletters and campaigns to stay in touch with customers.',
    description: 'Send newsletters and campaigns to your customers from your own domain, with sign-up forms and reports. Contact and sending limits depend on the plan.',
    seoTitle: 'Email Marketing for Small Businesses', seoDescription: 'Send newsletters and campaigns from your own domain with sign-up forms and reports. Tell us your list size and we will recommend the right plan.',
    included: ['Newsletters and campaigns from your own domain', 'Sign-up forms for your website', 'Reports on opens and clicks'],
    faq: [
      F('Can I send to people who have not signed up?', 'No. Email marketing is for contacts who agreed to hear from you. Sending to bought or scraped lists breaks most providers’ rules and hurts your delivery.'),
    ] },
  /* ---------------- Done-for-you services (quoted) */
  { slug: 'website-design', section: 'done-for-you', kind: 'service', icon: 'monitor', name: 'Website Design Packages',
    groups: ['Website Design', 'Web Design'],
    blurb: 'A starter site, an online shop or a bilingual Arabic and English website.',
    description: 'Our team designs and builds your website on your hosting: a starter business site, an online shop, or a bilingual Arabic and English website. Tell us what you need and we send a quote with the scope and timeline.',
    seoTitle: 'Website Design Packages: Business Sites & Online Shops', seoDescription: 'A starter business website, an online shop or a bilingual Arabic and English site, designed and built by our team. Request a quote with your scope.',
    options: ['Starter website', 'Online shop', 'Arabic and English website', 'Not sure yet'],
    questions: ['How many pages or products do you expect?', 'Do you have a logo, text and photos ready?'],
    included: ['A quote with scope, timeline and price before any work starts', 'Design and build on your hosting account', 'Handover so you can update the site yourself'],
    faq: [
      F('How much does a website cost?', 'It depends on the number of pages, features such as a shop or booking, and languages. Send the form and we reply with a written quote before any work starts.'),
      F('Can the website be in Arabic and English?', 'Yes. A bilingual package includes both languages, with the Arabic version laid out right to left.'),
      F('Do I need hosting and a domain first?', 'Not before you ask for a quote. We include the hosting and domain you need in the proposal, or use the ones you already have.'),
    ] },
  { slug: 'logo-brand-kit', section: 'done-for-you', kind: 'service', icon: 'star', name: 'Logo & Brand Kit',
    groups: ['Logo Design', 'Brand Kit'],
    blurb: 'A logo with the colours and files you need for web and print.',
    description: 'A logo designed for your business with a simple brand kit: colours, fonts and the logo files you need for your website, social media and print. We quote after a short brief.',
    seoTitle: 'Logo Design & Brand Kit for Your Business', seoDescription: 'A logo for your business with a brand kit of colours, fonts and logo files for web, social media and print. Send a short brief and get a quote.',
    options: ['New logo and brand kit', 'Refresh of an existing logo', 'Brand kit for an existing logo'],
    questions: ['What does your business do, and who are your customers?', 'Any colours, styles or examples you like?'],
    included: ['A short brief before design starts', 'Logo files for web, social media and print', 'Colours and fonts written down in a simple guide'],
    faq: [
      F('Which files will I receive?', 'Logo files for the web and print, in light and dark versions, plus a one-page guide with your colours and fonts. The quote lists exactly what is included.'),
    ] },
  { slug: 'wordpress-care', section: 'done-for-you', kind: 'service', icon: 'wp', name: 'Managed WordPress Care',
    groups: ['WordPress Care', 'WordPress Maintenance'],
    blurb: 'Updates, checks and fixes for your WordPress site, done by our team.',
    description: 'Our team looks after your WordPress site: core, theme and plugin updates, checks that the site still works after them, and help when something breaks. We agree the scope and a monthly fee in a quote.',
    seoTitle: 'Managed WordPress Care & Maintenance', seoDescription: 'WordPress updates, checks after every update and help when something breaks, handled by our team. Tell us about your site and get a quote.',
    options: ['One website', 'Several websites', 'Online shop (WooCommerce)'],
    questions: ['Where is the site hosted today?', 'Roughly how many plugins does it use?'],
    included: ['A care plan agreed in writing before we start', 'Regular WordPress, theme and plugin updates', 'Checks after updates and help when something breaks'],
    faq: [
      F('Does my site need to be hosted with you?', 'No, but it is simpler: on our hosting we can take a backup before every update. For sites elsewhere we confirm the access we need in the quote.'),
    ] },
  { slug: 'seo-google-business', section: 'done-for-you', kind: 'service', icon: 'pin', name: 'SEO & Google Business Profile Setup',
    groups: ['SEO Setup', 'Google Business Profile'],
    blurb: 'Get found on Google Search and Maps with the basics done right.',
    description: 'We set up or tidy your Google Business Profile and the search basics on your website: page titles, descriptions, Search Console and a sitemap. You get a short report of what we changed.',
    seoTitle: 'SEO & Google Business Profile Setup Service', seoDescription: 'Set up your Google Business Profile and the search basics on your website: titles, descriptions, Search Console and sitemap. Request a quote.',
    options: ['Google Business Profile setup', 'Website SEO basics', 'Both'],
    questions: ['Do you already have a Google Business Profile?', 'Which areas or cities do you serve?'],
    included: ['Google Business Profile created or tidied up', 'Search Console and sitemap set up for your site', 'A short report of what we changed'],
    faq: [
      F('Can you guarantee first place on Google?', 'No one can honestly guarantee rankings. We set up the foundations Google looks for and show you what to keep doing.'),
      F('Google asks to verify my business. Can you do that for me?', 'Verification goes to the business owner, for example by phone, video or post. We guide you through it and finish the setup once it is verified.'),
    ] },
  { slug: 'payment-gateway-setup', section: 'done-for-you', kind: 'service', icon: 'card', name: 'Payment Gateway Setup',
    groups: ['Payment Gateway Setup'],
    blurb: 'Accept card payments on your website or online shop.',
    description: 'We connect the payment provider you choose to your website or online shop and test the checkout with you. You open the merchant account in your own name; we handle the technical setup.',
    seoTitle: 'Payment Gateway Setup for Your Website or Shop', seoDescription: 'Connect a payment provider to your website or online shop and test the checkout. You keep the merchant account in your name; we do the setup.',
    options: ['Online shop checkout', 'Payment links or invoices', 'Not sure yet'],
    questions: ['Which website platform do you use (for example WordPress or WooCommerce)?', 'Do you already have a merchant account with a payment provider?'],
    included: ['Setup of the provider you choose on your site', 'A test payment run with you before go-live', 'Your merchant account stays in your own name'],
    faq: [
      F('Do you hold my payments?', 'No. Payments go from your customers to your own merchant account with the payment provider. We only connect it to your website.'),
      F('Which payment provider should I use?', 'It depends on your country, your platform and the cards your customers use. Tell us what you sell and where, and we will suggest options to compare.'),
    ] },
  { slug: 'whatsapp-business-setup', section: 'done-for-you', kind: 'service', icon: 'whatsapp', name: 'WhatsApp Business Setup',
    groups: ['WhatsApp Business'],
    blurb: 'A business profile, quick replies and a chat button on your website.',
    description: 'We set up WhatsApp Business for your company: profile, greeting and quick replies, a catalogue if you need one, and a chat button on your website.',
    seoTitle: 'WhatsApp Business Setup for Your Company', seoDescription: 'Set up WhatsApp Business with a business profile, greeting and quick replies, a catalogue and a chat button on your website. Request a quote.',
    options: ['WhatsApp Business app setup', 'Chat button on my website', 'Both'],
    questions: ['How many people will answer chats?'],
    included: ['Business profile, greeting and quick replies', 'Chat button on your website', 'A short guide for your team'],
    faq: [
      F('Do I need a separate phone number?', 'A number used for WhatsApp Business cannot be used for a personal WhatsApp account at the same time. Many businesses use a dedicated number; we talk you through the options.'),
    ] },
];

export const STORE_BUNDLES = [
  { slug: 'start-business-online-uae', name: 'Start your business online (UAE)', summary: 'A .ae domain, web hosting and professional email on your domain.',
    items: ['tld:.ae', 'cat:hostia-shared', 'cat:professional-email'], whmcsBundleId: null, published: true },
  { slug: 'secure-business-website', name: 'Secure business website', summary: 'Web hosting with an SSL certificate and automatic off-site backups.',
    items: ['cat:hostia-shared', 'cat:ssl-certificates', 'cat:website-backup'], whmcsBundleId: null, published: true },
];

/** settings.business_services: unpublished until the owner switches it on in Admin → Business services. */
export function storeConfigSeed() {
  return {
    published: false,
    title: 'Business services',
    lead: 'Security, email, website tools and hands-on help from our team, next to your hosting and domains in one account.',
    seoTitle: 'Business Services: Security, Email, Website Tools & Setup',
    meta: 'SSL certificates, website security, backups, professional email, website tools and done-for-you setup services, alongside your hosting and domains.',
    menuLabel: 'Business services', inNav: true, salesDepartmentId: '',
    faq: [
      F('Can I add these services to hosting I already have?', 'Yes. Order any service from this page and it is added to the same client account as your hosting and domains, managed from one client area.'),
      F('Why do some services say "Request a quote"?', 'Done-for-you services depend on your business, so our team replies with a written quote before any work starts. Services shown with prices can be ordered online straight away.'),
      F('Why is a service marked as coming soon?', 'We only show prices once a plan is live in our billing system. Until then, send a request and our sales team will help you directly.'),
      F('Do prices include VAT?', 'Prices are shown before VAT. VAT at 5% is added where it applies, and every price shown comes from our billing system.'),
    ],
    sections: STORE_SECTIONS.map((s, i) => ({ slug: s.slug, icon: s.icon, order: i })),
    entries: STORE_ENTRIES.map((e, i) => ({ slug: e.slug, section: e.section, kind: e.kind, icon: e.icon, groups: e.groups, blurb: e.blurb, included: e.included || [], faq: e.faq || [],
      options: e.options || [], questions: e.questions || [], hidden: false, order: i })),
    bundles: STORE_BUNDLES.map((b, i) => ({ ...b, order: i })),
  };
}
