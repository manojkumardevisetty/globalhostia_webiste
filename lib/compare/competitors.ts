// "GlobalHostia vs <host>" comparison pages (/compare/globalhostia-vs-<slug>, rendered by lib/theme/pages/vs.ts).
// Plain data and pure helpers (no server imports) so routes.ts, the sitemap, /llms.txt, admin and tests can all read it.
//
// Rules for every fact below (owner's instructions, UAE comparative-advertising norms):
//  - only what the provider publishes on its own website, each with the exact source URL and the date it was checked
//  - quote the provider's own figures and conditions (term, currency, VAT) next to the price; never round or estimate
//  - null = the provider does not publish it on the pages we checked: shown as "Not stated", never guessed
//  - neutral wording, no ratings or reviews, no logos (names in plain text), and say where the provider is stronger
//  - GoDaddy is deliberately not covered (owner's decision)
// Our own column is never stored here: it is read from the live WHMCS-synced catalog when the page renders.
// Admin → Competitor pages can edit any fact, hide a page and mark a provider re-verified (settings.compare_overrides).

export const FACT_KEYS = ['plan', 'intro', 'renewal', 'storage', 'domain', 'ssl', 'backups', 'panel', 'locations', 'support', 'moneyBack'] as const;
export type FactKey = (typeof FACT_KEYS)[number];
export const FACT_LABEL: Record<FactKey, string> = {
  plan: 'Entry shared plan', intro: 'First-term price', renewal: 'Renewal price', storage: 'Storage', domain: 'Free domain', ssl: 'SSL certificate',
  backups: 'Backups', panel: 'Control panel', locations: 'Data-centre locations', support: 'Support channels', moneyBack: 'Money-back period',
};

/** One public fact: the text we show, the page it comes from and the day we read it there (YYYY-MM-DD). */
export type Fact = { value: string; source: string; checked: string };
/** A point where the provider may suit a customer better, with its source. */
export type Strength = { text: string; source: string; checked: string };
export type Competitor = {
  slug: string;
  /** brand name in plain text (no logo) */
  name: string;
  /** shorter name for <title> and meta when `name` is long (defaults to name) */
  seoName?: string;
  /** provider homepage, shown as plain text in the sources list */
  site: string;
  /** neutral one-line description for the hub card */
  blurb: string;
  /** "who it suits" line in the verdict box */
  suits: string;
  /** numbers behind the computed comparisons (same plan and term as the intro/renewal facts); null = not published */
  num: { currency: string; introMo: number | null; renewMo: number | null; storageGb: number | null; middleEast: boolean };
  facts: Record<FactKey, Fact | null>;
  stronger: Strength[];
};

const D = '2026-11-03';
const f = (value: string, source: string, checked = D): Fact => ({ value, source, checked });
const s = (text: string, source: string, checked = D): Strength => ({ text, source, checked });

export const COMPETITORS: Competitor[] = [
  {
    slug: 'hostinger', name: 'Hostinger', site: 'https://www.hostinger.com',
    blurb: 'Large international host with its own dashboard, long prepaid terms and data centres in Europe, Asia and the Americas.',
    suits: 'Customers who want the lowest first-term price on a long prepaid term and are happy to manage everything in a custom dashboard.',
    num: { currency: 'USD', introMo: 1.99, renewMo: 10.99, storageGb: 20, middleEast: false },
    facts: {
      plan: f('Premium web hosting (3 websites)', 'https://www.hostinger.com/pricing?content=web-hosting'),
      intro: f('$1.99/mo on a 48-month term ($95.52 paid upfront), shown as a limited-time offer, excluding VAT', 'https://www.hostinger.com/pricing?content=web-hosting'),
      renewal: f('$10.99/mo', 'https://www.hostinger.com/pricing?content=web-hosting'),
      storage: f('20 GB SSD', 'https://www.hostinger.com/pricing?content=web-hosting'),
      domain: f('Free for 1 year with annual and longer plans', 'https://www.hostinger.com/pricing?content=web-hosting'),
      ssl: f('Unlimited free SSL', 'https://www.hostinger.com/pricing?content=web-hosting'),
      backups: f('Weekly on Premium; daily on the Unlimited plan', 'https://www.hostinger.com/pricing?content=web-hosting'),
      panel: f('Hostinger’s own custom dashboard (hPanel); cPanel is not the default', 'https://www.hostinger.com/support/1583483-comprehensive-guide-to-hostinger-dashboard-at-hostinger/'),
      locations: f('France, Germany, Lithuania, Netherlands, UK, India, Indonesia, Malaysia, USA and Brazil; no Middle East location listed', 'https://www.hostinger.com/support/1583267-where-are-hostinger-servers-located/'),
      support: f('Live chat (starts with the Hostinger Agent AI assistant), WhatsApp and email; no phone support', 'https://www.hostinger.com/support/1583780-how-to-contact-hostinger-support/'),
      moneyBack: f('30 days', 'https://www.hostinger.com/pricing?content=web-hosting'),
    },
    stronger: [
      s('More data-centre choices for web hosting: ten countries across Europe, Asia and the Americas.', 'https://www.hostinger.com/support/1583267-where-are-hostinger-servers-located/'),
      s('Its AI assistant replies in nearly any language, Arabic included, and replies from human agents are machine-translated into your language.', 'https://www.hostinger.com/support/1583778-how-to-get-support-in-your-language-at-hostinger/'),
    ],
  },
  {
    slug: 'namecheap', name: 'Namecheap', site: 'https://www.namecheap.com',
    blurb: 'Domain registrar and host with low-cost cPanel shared plans and data centres in the US, Europe, the UK and Singapore.',
    suits: 'Customers who keep their domains at the same company and want a low first-year price on a cPanel plan.',
    num: { currency: 'USD', introMo: 1.91, renewMo: 4.66, storageGb: 20, middleEast: false },
    facts: {
      plan: f('Stellar (3 hosted domains)', 'https://www.namecheap.com/hosting/shared/eu/'),
      intro: f('$22.92 for the first year (1-year term)', 'https://www.namecheap.com/hosting/shared/eu/'),
      renewal: f('$55.88/year ($5.88 billed monthly); renewal prices effective 19 May 2026', 'https://www.namecheap.com/support/knowledgebase/article.aspx/10780/22/shared-hosting-pricing-changes-may-2026/'),
      storage: f('20 GB SSD', 'https://www.namecheap.com/hosting/shared/eu/'),
      domain: f('One free non-premium domain for the first year with 2-year plans', 'https://www.namecheap.com/hosting/shared/eu/'),
      ssl: f('50 free PositiveSSL certificates for the first year', 'https://www.namecheap.com/hosting/shared/eu/'),
      backups: f('Twice a week on Stellar (“ideally… not guaranteed”); daily, weekly and monthly AutoBackup on higher plans', 'https://www.namecheap.com/hosting/shared/eu/'),
      panel: f('cPanel', 'https://www.namecheap.com/hosting/shared/eu/'),
      locations: f('Shared hosting in the USA (Phoenix) and Europe (Amsterdam); the UK (Farnborough) and Singapore are also listed; no Middle East location', 'https://www.namecheap.com/support/knowledgebase/article.aspx/136/22/where-are-your-datacenters-located-how-can-i-request-to-change-the-datacenter/'),
      support: f('24/7 live chat', 'https://www.namecheap.com/hosting/shared/eu/'),
      moneyBack: f('30 days', 'https://www.namecheap.com/hosting/shared/eu/'),
    },
    stronger: [
      s('A choice of US, European, UK and Singapore data centres.', 'https://www.namecheap.com/support/knowledgebase/article.aspx/136/22/where-are-your-datacenters-located-how-can-i-request-to-change-the-datacenter/'),
      s('cPanel, the widely documented control panel, on every shared plan.', 'https://www.namecheap.com/hosting/shared/eu/'),
    ],
  },
  {
    slug: 'bluehost', name: 'Bluehost', site: 'https://www.bluehost.com',
    blurb: 'US-based host focused on WordPress, with NVMe shared plans, 36-month terms and VPS locations on three continents.',
    suits: 'WordPress site owners in North America who want phone support on mid-tier plans and a 36-month prepaid price.',
    num: { currency: 'USD', introMo: 3.99, renewMo: 9.99, storageGb: 10, middleEast: false },
    facts: {
      plan: f('Starter (10 websites)', 'https://www.bluehost.com/pricing/web-hosting'),
      intro: f('$3.99/mo on a 36-month term', 'https://www.bluehost.com/pricing/web-hosting'),
      renewal: f('$9.99/mo on the 36-month term ($11.99/mo on 12 months, $15.99 monthly)', 'https://www.bluehost.com/help/article/renewal-price-faq'),
      storage: f('10 GB NVMe SSD', 'https://www.bluehost.com/pricing/web-hosting'),
      domain: f('Free for the first year with 12- or 36-month terms, redeemed within 90 days', 'https://www.bluehost.com/pricing/web-hosting'),
      ssl: f('Free Let’s Encrypt SSL', 'https://www.bluehost.com/pricing/web-hosting'),
      backups: f('Weekly website backups (plan list)', 'https://www.bluehost.com/pricing/web-hosting'),
      panel: null,
      locations: f('Not stated for shared hosting; managed VPS in nine locations (Ashburn, Phoenix, Amsterdam, Singapore, London, Toronto, Frankfurt, Sydney, Mumbai); no Middle East location', 'https://www.bluehost.com/blog/bluehost-data-center-locations/'),
      support: f('24/7 chat; phone support from the Business plan up (not on Starter)', 'https://www.bluehost.com/pricing/web-hosting'),
      moneyBack: f('30 days on hosting (domain fees not refunded)', 'https://www.bluehost.com/pricing/web-hosting'),
    },
    stronger: [
      s('Phone support is included from the Business plan up.', 'https://www.bluehost.com/pricing/web-hosting'),
      s('Managed VPS in nine locations across North America, Europe and Asia-Pacific, including Mumbai.', 'https://www.bluehost.com/blog/bluehost-data-center-locations/'),
    ],
  },
  {
    slug: 'siteground', name: 'SiteGround', site: 'https://www.siteground.com',
    blurb: 'Managed host on Google Cloud with its own Site Tools panel, daily backups and eleven data-centre locations.',
    suits: 'Customers who want daily backups, a built-in CDN and a choice of eleven data centres, and accept a higher renewal price.',
    num: { currency: 'USD', introMo: 1.99, renewMo: 17.99, storageGb: 10, middleEast: false },
    facts: {
      plan: f('StartUp (1 website)', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      intro: f('$1.99/mo prepaid for 12 months', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      renewal: f('$17.99/mo prepaid for 12 months ($24.99 monthly), excluding VAT', 'https://www.siteground.com/kb/current-rates-shared-hosting-plans'),
      storage: f('10 GB', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      domain: f('Free for one year', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      ssl: f('Free SSL', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      backups: f('Daily backups included', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      panel: f('Site Tools (SiteGround’s own panel)', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      locations: f('Eleven locations: Ashburn, Council Bluffs, Dallas, Los Angeles, London, Madrid, Eemshaven, Frankfurt, Paris, Sydney and Singapore; no Middle East location', 'https://www.siteground.com/kb/where_are_sitegrounds_servers'),
      support: f('24/7 live chat, tickets and phone', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      moneyBack: f('30 days', 'https://siteground.com/web-hosting.htm?amp=&amp='),
    },
    stronger: [
      s('Daily backups and a CDN are included on every plan.', 'https://siteground.com/web-hosting.htm?amp=&amp='),
      s('Eleven data-centre locations across North America, Europe, Asia and Australia.', 'https://www.siteground.com/kb/where_are_sitegrounds_servers'),
      s('Phone support alongside live chat and tickets.', 'https://siteground.com/web-hosting.htm?amp=&amp='),
    ],
  },
  {
    slug: 'ionos', name: 'IONOS', site: 'https://www.ionos.com',
    blurb: 'German-headquartered host with large-storage web hosting plans, daily backups and its own data centres in the US and Europe.',
    suits: 'Customers who need a lot of storage on an entry plan and want a personal consultant by phone, chat or email.',
    num: { currency: 'USD', introMo: 4, renewMo: 8, storageGb: 100, middleEast: false },
    facts: {
      plan: f('Essential (unlimited websites)', 'https://www.ionos.com/hosting/web-hosting'),
      intro: f('$4/month with a 1-year term; state and local sales taxes may apply', 'https://www.ionos.com/hosting/web-hosting'),
      renewal: f('$8/month after the first term', 'https://www.ionos.com/hosting/web-hosting'),
      storage: f('100 GB NVMe SSD', 'https://www.ionos.com/hosting/web-hosting'),
      domain: f('1 domain free for 1 year', 'https://www.ionos.com/hosting/web-hosting'),
      ssl: f('1 DV wildcard SSL certificate', 'https://www.ionos.com/hosting/web-hosting'),
      backups: f('Daily backup of storage and databases', 'https://www.ionos.com/hosting/web-hosting'),
      panel: null,
      locations: f('Its own regional data centres in the US and Europe; no Middle East location mentioned', 'https://www.ionos.com/about'),
      support: f('24/7 support by phone, chat or email, with a free personal consultant', 'https://www.ionos.com/hosting/web-hosting'),
      moneyBack: f('30 days', 'https://www.ionos.com/hosting/web-hosting'),
    },
    stronger: [
      s('100 GB of NVMe storage and unlimited websites on its entry plan.', 'https://www.ionos.com/hosting/web-hosting'),
      s('Daily backups and a wildcard SSL certificate are included.', 'https://www.ionos.com/hosting/web-hosting'),
      s('A personal consultant is included at no charge.', 'https://www.ionos.com/hosting/web-hosting'),
    ],
  },
  {
    slug: 'hostgator', name: 'HostGator', site: 'https://www.hostgator.com',
    blurb: 'US host with cPanel shared plans, phone and live chat support and a 45-day money-back period.',
    suits: 'Customers who want phone support on every shared plan and the longest money-back period in this comparison.',
    num: { currency: 'USD', introMo: 2.75, renewMo: 10.99, storageGb: null, middleEast: false },
    facts: {
      plan: f('Hatchling (single domain)', 'https://www.hostgator.com/web-hosting.html'),
      intro: f('From $2.75/mo; the discount applies to the first term (term not stated on the plan card)', 'https://www.hostgator.com/web-hosting.html'),
      renewal: f('Regular price $10.99/mo on a 3-year term ($13.19/mo on 1 year, $17.59 monthly)', 'https://www.hostgator.com/help/article/hosting-price-chart'),
      storage: f('Unmetered', 'https://www.hostgator.com/web-hosting.html'),
      domain: f('Free domain included', 'https://www.hostgator.com/web-hosting.html'),
      ssl: f('Free SSL certificate', 'https://www.hostgator.com/web-hosting.html'),
      backups: f('Automatic weekly off-site backups; daily backups are a paid add-on', 'https://www.hostgator.com/web-hosting.html'),
      panel: f('cPanel', 'https://www.hostgator.com/web-hosting.html'),
      locations: null,
      support: f('24/7/365 by phone and live chat', 'https://www.hostgator.com/web-hosting.html'),
      moneyBack: f('45 days', 'https://www.hostgator.com/web-hosting.html'),
    },
    stronger: [
      s('A 45-day money-back period on all shared plans.', 'https://www.hostgator.com/web-hosting.html'),
      s('Phone support around the clock on every shared plan.', 'https://www.hostgator.com/web-hosting.html'),
    ],
  },
  {
    slug: 'dreamhost', name: 'DreamHost', site: 'https://www.dreamhost.com',
    blurb: 'US host with NVMe shared plans for many websites, daily backups and data centres in the US, Amsterdam and Singapore.',
    suits: 'Customers who run several small websites on one plan and want daily backups without an add-on.',
    num: { currency: 'USD', introMo: 2.89, renewMo: 10.99, storageGb: 25, middleEast: false },
    facts: {
      plan: f('Launch (25 websites)', 'https://www.dreamhost.com/hosting/web-hosting/'),
      intro: f('$2.89/mo for the first year on a 1-year term ($1.99/mo on a 4-year term); the full term plus taxes is charged at checkout', 'https://www.dreamhost.com/hosting/web-hosting/'),
      renewal: f('$10.99/mo after the first year ($7.99/mo after a 4-year term)', 'https://www.dreamhost.com/hosting/web-hosting/'),
      storage: f('25 GB NVMe SSD', 'https://www.dreamhost.com/hosting/web-hosting/'),
      domain: f('Free for the first year of an annual or multi-year plan', 'https://www.dreamhost.com/hosting/web-hosting/'),
      ssl: f('Unlimited free SSL', 'https://www.dreamhost.com/hosting/web-hosting/'),
      backups: f('Daily automated backups', 'https://www.dreamhost.com/hosting/web-hosting/'),
      panel: f('DreamHost panel (its own)', 'https://www.dreamhost.com/hosting/web-hosting/'),
      locations: f('USA (Oregon, Virginia), Europe (Amsterdam) and Asia (Singapore); no Middle East location', 'https://www.dreamhost.com/hosting/web-hosting/'),
      support: f('24/7 chat (may start with AI; you can ask for a person) and email', 'https://www.dreamhost.com/hosting/web-hosting/'),
      moneyBack: f('30 days', 'https://www.dreamhost.com/hosting/web-hosting/'),
    },
    stronger: [
      s('Up to 25 websites and 25 GB of NVMe storage on its entry plan.', 'https://www.dreamhost.com/hosting/web-hosting/'),
      s('Daily automated backups on every shared plan.', 'https://www.dreamhost.com/hosting/web-hosting/'),
    ],
  },
  {
    slug: 'a2-hosting', name: 'Hosting.com (formerly A2 Hosting)', seoName: 'A2 Hosting', site: 'https://hosting.com',
    blurb: 'A2 Hosting now trades as hosting.com: NVMe shared plans on LiteSpeed with daily backups and 24/7 phone, chat and email.',
    suits: 'Former A2 Hosting customers and anyone who wants daily backups with 30-day restores and phone support.',
    num: { currency: 'USD', introMo: 3.99, renewMo: null, storageGb: 15, middleEast: false },
    facts: {
      plan: f('Starter shared web hosting (a2hosting.com now redirects to hosting.com)', 'https://hosting.com/a2-vs-hosting-com/'),
      intro: f('$3.99/mo on a 1-year term', 'https://hosting.com/a2-vs-hosting-com/'),
      renewal: null,
      storage: f('15 GB NVMe', 'https://hosting.com/a2-vs-hosting-com/'),
      domain: f('Free domain name registration', 'https://hosting.com/hosting/'),
      ssl: f('Free SSL certificate', 'https://hosting.com/hosting/'),
      backups: f('Daily backups with 30-day restore', 'https://hosting.com/a2-vs-hosting-com/'),
      panel: null,
      locations: null,
      support: f('24/7/365 live chat, email and phone', 'https://hosting.com/hosting/'),
      moneyBack: f('30 days for new customers', 'https://hosting.com/about/money-back-guarantee/'),
    },
    stronger: [
      s('Daily backups with a 30-day restore window on every shared plan.', 'https://hosting.com/a2-vs-hosting-com/'),
      s('Phone support alongside live chat and email.', 'https://hosting.com/hosting/'),
    ],
  },
  {
    slug: 'aeserver', name: 'AEserver', site: 'https://www.aeserver.com',
    blurb: 'UAE domain registrar and host with cPanel plans in AED and a choice of a Dubai or European data centre.',
    suits: 'UAE businesses that need their website on a server inside the UAE and want a local toll-free phone line.',
    num: { currency: 'AED', introMo: 19, renewMo: null, storageGb: 10, middleEast: true },
    facts: {
      plan: f('Essentials (1 website), UAE (Dubai) server', 'https://aeserver.com/hosting.php'),
      intro: f('AED 19/mo with 36-month billing (AED 15/mo on a European server), excluding UAE VAT', 'https://aeserver.com/hosting.php'),
      renewal: null,
      storage: f('10 GB', 'https://aeserver.com/hosting.php'),
      domain: f('Not on Essentials; free for the first year from the Advanced plan with a 12-month or longer term', 'https://aeserver.com/hosting.php'),
      ssl: f('Free SSL certificate for every site', 'https://aeserver.com/hosting.php'),
      backups: f('Not listed in the plan features; website backup is sold as a separate product', 'https://aeserver.com/hosting.php'),
      panel: f('cPanel', 'https://aeserver.com/hosting.php'),
      locations: f('UAE (Dubai) or Europe', 'https://aeserver.com/hosting.php'),
      support: f('24/7 live chat and tickets from a UAE-based team; toll-free phone 800 123 123 (9am to 6pm, Monday to Saturday); WhatsApp', 'https://aeserver.com/hosting.php'),
      moneyBack: f('30 days on Linux packages', 'https://aeserver.com/hosting.php'),
    },
    stronger: [
      s('Shared hosting on a server in Dubai, inside the UAE.', 'https://aeserver.com/hosting.php'),
      s('A toll-free phone line inside the UAE during business hours.', 'https://aeserver.com/hosting.php'),
    ],
  },
];

/* ------------------------------------------------------------------ admin overrides (settings.compare_overrides) */

export type Override = { hidden?: boolean; verifiedAt?: string; facts?: Partial<Record<FactKey, Fact | null>>; stronger?: Strength[]; suits?: string };
export type Overrides = Record<string, Override>;

const DAY = 86_400_000;
export const STALE_DAYS = 90;
export const isoDay = (d: Date | number = Date.now()) => new Date(d).toISOString().slice(0, 10);
export const validDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s));
export const validUrl = (s: unknown): s is string => typeof s === 'string' && /^https:\/\/[^\s"<>]+$/.test(s) && s.length <= 500;

export function readOverrides(settings: Record<string, unknown> | null | undefined): Overrides {
  let raw = settings?.compare_overrides as unknown;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Overrides) : {};
}

/** The later of two YYYY-MM-DD dates. */
const later = (a: string, b?: string) => (validDay(b) && b > a ? b : a);

/** Data file + admin edits. "Mark re-verified" moves every fact's checked date forward to that day. */
export function mergeCompetitor(c: Competitor, o: Override = {}): Competitor & { hidden: boolean } {
  const facts = { ...c.facts } as Record<FactKey, Fact | null>;
  for (const k of FACT_KEYS) {
    if (o.facts && k in o.facts) {
      const v = o.facts[k];
      facts[k] = v && v.value && validUrl(v.source) && validDay(v.checked) ? v : null;
    }
    if (facts[k]) facts[k] = { ...facts[k]!, checked: later(facts[k]!.checked, o.verifiedAt) };
  }
  const stronger = (Array.isArray(o.stronger) ? o.stronger.filter((x) => x?.text && validUrl(x.source) && validDay(x.checked)) : c.stronger)
    .map((x) => ({ ...x, checked: later(x.checked, o.verifiedAt) }));
  return { ...c, suits: o.suits?.trim() || c.suits, facts, stronger, hidden: !!o.hidden };
}

export function competitors(settings?: Record<string, unknown> | null) {
  const o = readOverrides(settings);
  return COMPETITORS.map((c) => mergeCompetitor(c, o[c.slug]));
}
export const visibleCompetitors = (settings?: Record<string, unknown> | null) => competitors(settings).filter((c) => !c.hidden);
export const competitor = (slug: string, settings?: Record<string, unknown> | null) => competitors(settings).find((c) => c.slug === slug);

/** URL of a comparison page, and the reverse. */
export const vsSlug = (slug: string) => `compare/globalhostia-vs-${slug}`;
export const vsPath = (slug: string) => `/${vsSlug(slug)}`;
export const VS_SLUGS = COMPETITORS.map((c) => vsSlug(c.slug));
export const slugFromVs = (path: string) => { const m = /^\/?compare\/globalhostia-vs-([a-z0-9-]+)$/.exec(path); return m ? m[1] : null; };
export const isHiddenVs = (path: string, settings?: Record<string, unknown> | null) => { const k = slugFromVs(path); return !!k && !!competitor(k, settings)?.hidden; };

/** Facts and strengths whose checked date is older than STALE_DAYS (admin review list and the monthly reminder). */
export function staleItems(c: Pick<Competitor, 'facts' | 'stronger'>, now = Date.now()) {
  const old = (d: string) => now - Date.parse(d) > STALE_DAYS * DAY;
  const facts = FACT_KEYS.filter((k) => c.facts[k] && old(c.facts[k]!.checked));
  const stronger = c.stronger.filter((x) => old(x.checked)).length;
  return { facts, stronger, any: facts.length > 0 || stronger > 0 };
}
/** Newest and oldest checked date on a page (WebPage dateModified, "as of" line). */
export function checkedRange(c: Pick<Competitor, 'facts' | 'stronger'>) {
  const ds = [...FACT_KEYS.map((k) => c.facts[k]?.checked).filter(Boolean) as string[], ...c.stronger.map((x) => x.checked)].sort();
  return { oldest: ds[0] || D, newest: ds[ds.length - 1] || D };
}
/** Unique source URLs of a page, in first-use order, with the latest checked date for each. */
export function sourcesOf(c: Pick<Competitor, 'facts' | 'stronger'>) {
  const m = new Map<string, string>();
  const add = (u: string, d: string) => m.set(u, m.has(u) && m.get(u)! > d ? m.get(u)! : d);
  for (const k of FACT_KEYS) if (c.facts[k]) add(c.facts[k]!.source, c.facts[k]!.checked);
  for (const x of c.stronger) add(x.source, x.checked);
  return [...m].map(([url, checked]) => ({ url, checked }));
}
/** "3 November 2026" */
export const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Owner-facing wording rules, checked by tests and by the admin save action. */
export const BANNED = [/\bgodaddy\b/i, /\b(scam|terrible|awful|worst|rip-?off|fraud|cheat)\b/i, /\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i];
export const bannedIn = (t: string) => BANNED.find((r) => r.test(t)) || null;
