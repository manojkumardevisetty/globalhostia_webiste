// Programmatic SEO pages built only from real catalog data (lib/theme/data.ts):
//   /domains/<tld>, /domains/all              → pages/tld.ts
//   /locations/<loc>, /<type>/<loc>            → pages/location.ts
//   /hosting-for, /hosting-for/<usecase>       → pages/usecase.ts
// This module decides which pages exist (shared by the page modules, the router and the sitemap), and holds the
// curated, deliberately generic facts. Prices are never written here: they come from `tlds` / `product_prices`.
import { deriveSpecs, fromPrice, expandCategories, type Catalog, type TProduct, type TTld } from './data';
import { available } from './ui';
import { CLAIMED, TYPE_PAGE, routeForCategory, type TldBlurb } from './sitelinks';
import { ROUTES } from './routes';
import { storeHref } from '../store/view';

/* ------------------------------------------------------------------ helpers */
export const siteOf = (cat: Catalog) => String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** "a, b and c" */
export const andList = (xs: string[]) => (xs.length < 2 ? xs[0] || '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/* ------------------------------------------------------------------ TLDs */
/** ".co.uk" → "co-uk" (no dots in the path, so CDNs never mistake it for a file). */
export const tldSlug = (tld: string) => tld.replace(/^\./, '').toLowerCase().replace(/\./g, '-');

export type TldInfo = {
  kind: 'generic' | 'country';
  /** country or territory of a ccTLD */
  country?: string;
  /** one sentence: who the extension suits */
  forWho: string;
  /** 2–3 short, generic, verifiable facts (no legal claims) */
  facts: string[];
  /** curated related extensions */
  related: string[];
};

const CC_NOTE = 'Registration rules are set by the registry and may require a local presence or extra details; we confirm what applies before you pay.';

/** Curated facts for popular extensions. Kept generic and accurate on purpose. */
export const TLD_INFO: Record<string, TldInfo> = {
  '.com': { kind: 'generic', forWho: 'Businesses, brands and personal sites that want the address people type by default, whatever country they are in.',
    facts: ['One of the original generic extensions, introduced in 1985.', 'Open to anyone, anywhere: no residency or business proof needed.', 'The most registered extension in the world, so short single words are rarely free.'], related: ['.net', '.co', '.org'] },
  '.net': { kind: 'generic', forWho: 'Online services, software, networks and any brand whose .com is already taken.',
    facts: ['One of the original generic extensions from 1985, first meant for network providers.', 'Open to anyone, for any purpose.', 'Widely recognised, so it is the most common alternative when the .com is gone.'], related: ['.com', '.org', '.io'] },
  '.org': { kind: 'generic', forWho: 'Non-profits, charities, communities, open-source projects and clubs.',
    facts: ['One of the original generic extensions from 1985.', 'Open to anyone: you do not need to prove non-profit status.', 'Readers associate it with organisations rather than shops.'], related: ['.com', '.net', '.info'] },
  '.ae': { kind: 'country', country: 'the United Arab Emirates', forWho: 'Businesses and brands that trade in the UAE.',
    facts: ['The country-code extension of the United Arab Emirates.', 'Shows customers in the Emirates that you are local.'], related: ['.com', '.sa', '.qa'] },
  '.io': { kind: 'country', country: 'the British Indian Ocean Territory', forWho: 'Tech startups, developer tools, APIs and SaaS products.',
    facts: ['A country-code extension that is widely used by technology companies worldwide.', 'Short and easy to say, which suits product names.', 'Search engines generally treat it like a generic extension rather than a country one.'], related: ['.dev', '.app', '.ai'] },
  '.ai': { kind: 'country', country: 'Anguilla', forWho: 'Artificial intelligence products, machine learning research and data companies.',
    facts: ['The country-code extension of Anguilla, now strongly associated with AI.', 'Priced above most extensions; the registry sets the cost and terms.', 'Search engines generally treat it like a generic extension rather than a country one.'], related: ['.io', '.tech', '.app'] },
  '.co': { kind: 'country', country: 'Colombia', forWho: 'Companies, startups and brands that want a short alternative to .com.',
    facts: ['The country-code extension of Colombia, marketed worldwide as short for "company".', 'Two letters shorter than .com, which helps on business cards and adverts.', 'Easy to mistype as .com, so many owners register both.'], related: ['.com', '.io', '.biz'] },
  '.online': { kind: 'generic', forWho: 'Any business, service or personal project that lives mainly on the web.',
    facts: ['A newer generic extension launched in 2015.', 'Open to anyone for any purpose.', 'Plenty of short, descriptive names are still free.'], related: ['.site', '.store', '.com'] },
  '.store': { kind: 'generic', forWho: 'Online shops, retail brands and product catalogues.',
    facts: ['A newer generic extension launched in 2016.', 'Tells visitors before they click that they can buy something.', 'Open to anyone, from one-product shops to large retailers.'], related: ['.shop', '.online', '.com'] },
  '.shop': { kind: 'generic', forWho: 'E-commerce stores, boutiques and marketplaces.',
    facts: ['A newer generic extension launched in 2016.', 'Short and understood in many languages.', 'Open to anyone selling products or services.'], related: ['.store', '.online', '.com'] },
  '.tech': { kind: 'generic', forWho: 'Technology companies, hardware and software products, and tech media.',
    facts: ['A newer generic extension launched in 2015.', 'Signals a technical audience straight away.', 'Open to anyone for any purpose.'], related: ['.io', '.dev', '.ai'] },
  '.app': { kind: 'generic', forWho: 'Mobile and web applications, and the landing pages that promote them.',
    facts: ['A generic extension operated by Google Registry, launched in 2018.', 'Every .app site must use HTTPS: the extension is on browsers’ HSTS preload list, so an SSL certificate is required.', 'Open to anyone.'], related: ['.dev', '.io', '.tech'] },
  '.dev': { kind: 'generic', forWho: 'Developers, engineering teams, open-source projects and documentation sites.',
    facts: ['A generic extension operated by Google Registry, launched in 2019.', 'HTTPS is required: the extension is on browsers’ HSTS preload list.', 'Open to anyone.'], related: ['.app', '.io', '.tech'] },
  '.xyz': { kind: 'generic', forWho: 'Any idea that needs a flexible name: side projects, portfolios, communities and new brands.',
    facts: ['A newer generic extension launched in 2014.', 'One of the most registered new extensions.', 'Open to anyone, with no use restrictions.'], related: ['.online', '.site', '.live'] },
  '.info': { kind: 'generic', forWho: 'Information sites, guides, resources and documentation.',
    facts: ['A generic extension introduced in 2001.', 'Open to anyone for any purpose.', 'Reads naturally for reference and help content.'], related: ['.org', '.com', '.blog'] },
  '.biz': { kind: 'generic', forWho: 'Small businesses and commercial projects.',
    facts: ['A generic extension introduced in 2001, intended for business use.', 'Widely available when the .com is taken.', 'Short and clearly commercial.'], related: ['.com', '.co', '.online'] },
  '.in': { kind: 'country', country: 'India', forWho: 'Businesses, brands and individuals with an audience in India.',
    facts: ['The country-code extension of India.', 'Shows visitors in India that you serve them locally.', CC_NOTE], related: ['.com', '.co', '.pk'] },
  '.uk': { kind: 'country', country: 'the United Kingdom', forWho: 'Businesses and people in the United Kingdom who want the shortest UK address.',
    facts: ['The United Kingdom’s country-code extension; second-level .uk names became available in 2014.', 'Shorter than .co.uk while keeping the UK identity.', CC_NOTE], related: ['.co.uk', '.eu', '.com'] },
  '.co.uk': { kind: 'country', country: 'the United Kingdom', forWho: 'UK companies and sole traders: the long-established commercial UK address.',
    facts: ['The most familiar UK address, used by British businesses for decades.', 'Many owners register the matching .uk as well.', CC_NOTE], related: ['.uk', '.eu', '.com'] },
  '.eu': { kind: 'country', country: 'the European Union', forWho: 'Organisations and people who trade across the European Union.',
    facts: ['The extension of the European Union, available since 2006.', 'Eligibility may require residence or an establishment in the EU or EEA.', 'One address for customers in several EU countries.'], related: ['.de', '.com', '.uk'] },
  '.de': { kind: 'country', country: 'Germany', forWho: 'Businesses and people serving customers in Germany.',
    facts: ['The country-code extension of Germany, one of the largest country extensions in the world.', 'German-speaking visitors often trust a local address first.', CC_NOTE], related: ['.eu', '.com', '.online'] },
  '.us': { kind: 'country', country: 'the United States', forWho: 'Businesses, organisations and people connected to the United States.',
    facts: ['The country-code extension of the United States.', 'Registration may require a connection to the US (a "nexus").', 'Short and clearly American.'], related: ['.com', '.co', '.net'] },
  '.ca': { kind: 'country', country: 'Canada', forWho: 'Canadian businesses, organisations and residents.',
    facts: ['The country-code extension of Canada.', 'Registration may require a Canadian presence.', 'Shows Canadian visitors that you are local.'], related: ['.com', '.us', '.net'] },
  '.au': { kind: 'country', country: 'Australia', forWho: 'Businesses and people with a connection to Australia.',
    facts: ['Australia’s country-code extension; direct .au names became available in 2022.', 'Registration may require an Australian presence.', 'Shorter than the familiar .com.au.'], related: ['.com', '.co', '.net'] },
  '.sa': { kind: 'country', country: 'Saudi Arabia', forWho: 'Businesses and organisations serving customers in Saudi Arabia.',
    facts: ['The country-code extension of Saudi Arabia.', 'Shows Saudi visitors that you are local.', CC_NOTE], related: ['.ae', '.qa', '.com'] },
  '.qa': { kind: 'country', country: 'Qatar', forWho: 'Businesses and organisations serving customers in Qatar.',
    facts: ['The country-code extension of Qatar.', 'Shows visitors in Qatar that you are local.', CC_NOTE], related: ['.ae', '.sa', '.com'] },
  '.pk': { kind: 'country', country: 'Pakistan', forWho: 'Businesses and people serving an audience in Pakistan.',
    facts: ['The country-code extension of Pakistan.', 'Shows visitors in Pakistan that you are local.', CC_NOTE], related: ['.com', '.in', '.co'] },
  '.me': { kind: 'country', country: 'Montenegro', forWho: 'Personal brands, portfolios, CVs and blogs.',
    facts: ['The country-code extension of Montenegro, widely used for personal sites.', 'Reads naturally in phrases such as "about.me" or "hire.me".', 'Search engines generally treat it like a generic extension.'], related: ['.blog', '.online', '.co'] },
  '.tv': { kind: 'country', country: 'Tuvalu', forWho: 'Video creators, streaming channels, broadcasters and media brands.',
    facts: ['The country-code extension of Tuvalu, used worldwide for video and TV.', 'Short and instantly linked to video.', 'Search engines generally treat it like a generic extension.'], related: ['.live', '.news', '.media'] },
  '.cc': { kind: 'country', country: 'the Cocos (Keeling) Islands', forWho: 'Short brand names, communities and projects of any kind.',
    facts: ['The country-code extension of the Cocos (Keeling) Islands, used generically worldwide.', 'Two letters, so it is compact on any screen.', 'Search engines generally treat it like a generic extension.'], related: ['.co', '.io', '.xyz'] },
  '.live': { kind: 'generic', forWho: 'Live streams, events, venues, creators and news-as-it-happens.',
    facts: ['A newer generic extension launched in 2015.', 'Suggests something happening now.', 'Open to anyone.'], related: ['.tv', '.news', '.online'] },
  '.site': { kind: 'generic', forWho: 'Any website: portfolios, small businesses and landing pages.',
    facts: ['A newer generic extension launched in 2015.', 'Neutral and descriptive, so it suits almost any project.', 'Open to anyone.'], related: ['.online', '.xyz', '.com'] },
  '.cloud': { kind: 'generic', forWho: 'Cloud services, SaaS products, hosting and storage companies.',
    facts: ['A newer generic extension launched in 2016.', 'Tells visitors the product runs online.', 'Open to anyone.'], related: ['.tech', '.io', '.app'] },
  '.digital': { kind: 'generic', forWho: 'Digital agencies, marketing studios, creators and online services.',
    facts: ['A newer generic extension launched in 2014.', 'Describes the work rather than the location.', 'Open to anyone.'], related: ['.agency', '.online', '.tech'] },
  '.agency': { kind: 'generic', forWho: 'Marketing, design, recruitment, travel and other agencies.',
    facts: ['A newer generic extension launched in 2014.', 'Makes it clear you provide a service to clients.', 'Open to anyone.'], related: ['.digital', '.solutions', '.co'] },
  '.solutions': { kind: 'generic', forWho: 'Consultancies, IT service providers and B2B businesses.',
    facts: ['A newer generic extension launched in 2014.', 'Suits names that describe what you fix for customers.', 'Open to anyone.'], related: ['.agency', '.tech', '.biz'] },
  '.academy': { kind: 'generic', forWho: 'Online courses, training providers, coaches and schools.',
    facts: ['A newer generic extension launched in 2014.', 'Signals learning and teaching.', 'Open to anyone.'], related: ['.blog', '.online', '.org'] },
  '.blog': { kind: 'generic', forWho: 'Bloggers, writers, newsletters and company blogs.',
    facts: ['A newer generic extension launched in 2016.', 'Tells readers exactly what to expect.', 'Open to anyone.'], related: ['.me', '.news', '.online'] },
  '.news': { kind: 'generic', forWho: 'Publishers, newsletters, local news and press rooms.',
    facts: ['A newer generic extension launched in 2014.', 'Clear for readers and easy to remember.', 'Open to anyone.'], related: ['.blog', '.live', '.tv'] },
  '.art': { kind: 'generic', forWho: 'Artists, galleries, designers, museums and creative studios.',
    facts: ['A newer generic extension launched in 2017.', 'Short and recognised in many languages.', 'Open to anyone.'], related: ['.digital', '.blog', '.me'] },
};

/** Editorial facts of a TLD: built-in TLD_INFO with the admin's blurb (Admin → Site links) on top; null = generic copy. */
export function tldInfo(cat: { links?: Catalog['links'] }, tld: string): TldInfo | null {
  const base = TLD_INFO[tld];
  const ed: TldBlurb | undefined = cat.links?.tldBlurbs[tld];
  if (!ed) return base || null;
  const kind = base?.kind || (/^\.[a-z]{2}$/.test(tld) || /^\.(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(tld) ? 'country' : 'generic');
  return { kind, country: base?.country, forWho: ed.forWho || base?.forWho || '', facts: ed.facts || base?.facts || [], related: ed.related || base?.related || [] };
}

/** Two-letter extensions and second-level ones like .co.uk are country codes. */
export const isCountryTld = (tld: string) => TLD_INFO[tld]?.kind === 'country' || /^\.[a-z]{2}$/.test(tld) || /^\.(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(tld);

/** TLDs that already have a dedicated page: their programmatic URL redirects there. */
export const TLD_EXISTING: Record<string, string> = { '.ae': '/ae-domains' };

/** Every visible TLD with a register price in any currency gets a page. Sorted A–Z. */
export function tldPageList(cat: Catalog): string[] {
  const set = new Set<string>();
  for (const t of cat.tlds) if (t.register !== null && /^\.[a-z0-9.-]+$/i.test(t.tld)) set.add(t.tld.toLowerCase());
  return [...set].sort((a, b) => a.localeCompare(b));
}
export const tldHref = (tld: string) => TLD_EXISTING[tld] || `/domains/${tldSlug(tld)}`;
/** Slug → TLD (only TLDs that have a page). */
export function tldFromSlug(cat: Catalog, slug: string) {
  return tldPageList(cat).find((t) => tldSlug(t) === slug.toLowerCase()) || null;
}
/** The visitor-currency price row of a TLD, or null. */
export const tldRow = (cat: Catalog, tld: string): TTld | null =>
  cat.tlds.find((t) => t.tld.toLowerCase() === tld && (t.currency || 'USD') === cat.currency && t.register !== null) || null;

/* ------------------------------------------------------------------ locations */
export type LocInfo = {
  slug: string; name: string; the: string; region: string; syn: string[];
  /** where the audience is (honest geography, no latency numbers) */
  near: string[];
  /** 1–2 sentences of honest context */
  note: string;
};

const L = (slug: string, name: string, the: string, region: string, syn: string[], near: string[], note: string): LocInfo => ({ slug, name, the, region, syn, near, note });

export const LOCS: LocInfo[] = [
  L('usa', 'USA', 'the USA', 'North America', ['usa', 'us', 'united states', 'united states of america', 'america'], ['the United States', 'Canada', 'Mexico', 'Latin America'],
    'North America is home to a large share of the world’s internet users and online buyers, and transatlantic links also make the US East Coast a reasonable choice for audiences in Western Europe.'),
  L('canada', 'Canada', 'Canada', 'North America', ['canada', 'ca'], ['Canada', 'the United States'],
    'Hosting in Canada keeps data in the country for Canadian organisations that prefer it, and sits close to US visitors too.'),
  L('brazil', 'Brazil', 'Brazil', 'South America', ['brazil', 'brasil', 'br'], ['Brazil', 'Argentina', 'Chile', 'the rest of South America'],
    'South American traffic often travels to North America and back; a server in Brazil keeps that round trip inside the continent.'),
  L('europe', 'Europe', 'Europe', 'Europe', ['europe', 'eu', 'european union'], ['the European Union', 'the United Kingdom', 'the Middle East', 'North Africa'],
    'A European datacenter is central for visitors across the EU and UK, and is often closer to the Gulf than hosting in the Americas. Keeping data in the EU can simplify data-protection conversations, although location alone does not make a service compliant.'),
  L('germany', 'Germany', 'Germany', 'Europe', ['germany', 'deutschland', 'de', 'frankfurt', 'nuremberg', 'falkenstein'], ['Germany', 'Central and Western Europe', 'the United Kingdom', 'the Middle East'],
    'Germany is one of Europe’s busiest network hubs, with major internet exchanges, so servers here reach most of Europe well. Keeping data in the EU can simplify data-protection conversations, although location alone does not make a service compliant.'),
  L('france', 'France', 'France', 'Europe', ['france', 'fr', 'paris', 'roubaix', 'gravelines', 'strasbourg'], ['France', 'Western Europe', 'North Africa', 'the United Kingdom'],
    'France has strong connections to the rest of Europe and to North and West Africa through Mediterranean and Atlantic cables. Keeping data in the EU can simplify data-protection conversations, although location alone does not make a service compliant.'),
  L('netherlands', 'Netherlands', 'the Netherlands', 'Europe', ['netherlands', 'nl', 'holland', 'amsterdam'], ['the Netherlands', 'Western and Northern Europe', 'the United Kingdom'],
    'Amsterdam hosts one of the largest internet exchanges in the world, which makes the Netherlands a well-connected base for European traffic.'),
  L('uk', 'UK', 'the UK', 'Europe', ['uk', 'united kingdom', 'gb', 'great britain', 'england', 'london'], ['the United Kingdom', 'Ireland', 'Western Europe'],
    'London is a major interconnection point between Europe and North America, so UK servers suit British audiences and transatlantic projects.'),
  L('finland', 'Finland', 'Finland', 'Europe', ['finland', 'fi', 'helsinki'], ['Finland', 'the Nordics', 'the Baltics', 'Northern Europe'],
    'Finland is well placed for the Nordic and Baltic countries and is connected to Central Europe by subsea cable.'),
  L('poland', 'Poland', 'Poland', 'Europe', ['poland', 'pl', 'warsaw'], ['Poland', 'Central and Eastern Europe'],
    'Poland sits between Western and Eastern Europe, a central spot for audiences across both.'),
  L('spain', 'Spain', 'Spain', 'Europe', ['spain', 'es', 'madrid'], ['Spain', 'Portugal', 'Southern Europe'],
    'Spain is the natural choice for Spanish-speaking Europe and the Iberian peninsula.'),
  L('italy', 'Italy', 'Italy', 'Europe', ['italy', 'it', 'milan'], ['Italy', 'Southern and Central Europe'],
    'Italy serves Italian visitors directly and is well connected to Central Europe.'),
  L('russia', 'Russia', 'Russia', 'Europe', ['russia', 'ru', 'moscow'], ['Russia', 'Eastern Europe', 'Central Asia'],
    'Servers in Russia suit Russian-speaking audiences in Russia and neighbouring countries.'),
  L('turkey', 'Turkey', 'Turkey', 'Europe', ['turkey', 'turkiye', 'tr', 'istanbul'], ['Turkey', 'South-Eastern Europe', 'the Middle East'],
    'Istanbul links Europe and Asia, which suits audiences in Turkey and the surrounding region.'),
  L('algeria', 'Algeria', 'Algeria', 'Africa', ['algeria', 'dz', 'algiers'], ['Algeria', 'North Africa', 'Southern Europe'],
    'Algeria is close to North African audiences and connected to Southern Europe across the Mediterranean.'),
  L('south-africa', 'South Africa', 'South Africa', 'Africa', ['south africa', 'za', 'johannesburg', 'cape town'], ['South Africa', 'Southern and East Africa'],
    'Traffic from Southern Africa to Europe or the US crosses long cables; a server in South Africa keeps it local.'),
  L('uae', 'UAE', 'the UAE', 'Middle East', ['uae', 'united arab emirates', 'dubai', 'ae', 'abu dhabi'], ['the UAE', 'the wider Gulf region', 'South Asia'],
    'A server in the Emirates is as close as it gets for visitors in the UAE and nearby Gulf countries.'),
  L('saudi-arabia', 'Saudi Arabia', 'Saudi Arabia', 'Middle East', ['saudi arabia', 'ksa', 'sa', 'riyadh', 'jeddah'], ['Saudi Arabia', 'the Gulf region'],
    'Hosting in Saudi Arabia keeps traffic and data in the Kingdom for local audiences.'),
  L('india', 'India', 'India', 'Asia Pacific', ['india', 'in', 'mumbai', 'bangalore', 'delhi'], ['India', 'South Asia', 'the Gulf region'],
    'India is a large and fast-growing internet market, and servers there also reach the Gulf and the rest of South Asia.'),
  L('singapore', 'Singapore', 'Singapore', 'Asia Pacific', ['singapore', 'sg'], ['Singapore', 'Southeast Asia', 'India', 'Australia'],
    'Singapore is the main network hub of Southeast Asia, with cables to India, Australia, East Asia and the Middle East.'),
  L('malaysia', 'Malaysia', 'Malaysia', 'Asia Pacific', ['malaysia', 'my', 'kuala lumpur', 'johor'], ['Malaysia', 'Singapore', 'Indonesia', 'Southeast Asia'],
    'Malaysia sits next to Singapore’s network hub, which suits visitors in Malaysia and the rest of Southeast Asia.'),
  L('indonesia', 'Indonesia', 'Indonesia', 'Asia Pacific', ['indonesia', 'id', 'jakarta'], ['Indonesia', 'Southeast Asia'],
    'Indonesia is one of the largest internet markets in Southeast Asia; local servers keep traffic in the country.'),
  L('hong-kong', 'Hong Kong', 'Hong Kong', 'Asia Pacific', ['hong kong', 'hk'], ['Hong Kong', 'East and Southeast Asia'],
    'Hong Kong is a major interconnection hub for East Asia.'),
  L('japan', 'Japan', 'Japan', 'Asia Pacific', ['japan', 'jp', 'tokyo', 'osaka'], ['Japan', 'South Korea', 'East Asia'],
    'Tokyo is East Asia’s largest network hub, close to visitors in Japan and Korea, with transpacific links to the US.'),
  L('australia', 'Australia', 'Australia', 'Asia Pacific', ['australia', 'au', 'sydney', 'melbourne'], ['Australia', 'New Zealand'],
    'Australia is far from other hosting regions, so local servers make a noticeable difference for Australian and New Zealand visitors.'),
];

const LOC_BY_SYN = new Map<string, LocInfo>();
for (const l of LOCS) for (const s of [l.slug, l.name.toLowerCase(), ...l.syn]) LOC_BY_SYN.set(s, l);
/** Full names searched in product names ("Standard - Usa", "France - Ryzen 7"): no two-letter codes, to avoid false matches. */
const NAME_RE = new RegExp(`\\b(${LOCS.flatMap((l) => [l.name, ...l.syn]).filter((s) => s.length > 2).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i');

/** Normalised location of a product: attributes.location, then feature lines (deriveSpecs), then its name. */
export function locationOf(p: TProduct): LocInfo | null {
  const raw = (deriveSpecs(p.features, p.attributes).location || '').trim() || (p.name.match(NAME_RE)?.[1] || '');
  if (!raw) return null;
  const k = raw.toLowerCase().replace(/\s*(datacenter|data center|dc)$/i, '').trim();
  const known = LOC_BY_SYN.get(k) || LOC_BY_SYN.get(k.split(/[,(/-]/)[0].trim());
  if (known) return known;
  const slug = slugify(raw);
  if (!slug || slug.length > 40) return null;
  const name = raw.replace(/\b\w/g, (c) => c.toUpperCase());
  return { slug, name, the: name, region: '', syn: [], near: [], note: '' };
}

/** Product families shown on location pages, in display order. */
export const FAMILIES = [
  { id: 'shared', label: 'Shared hosting', short: 'Web Hosting', types: ['shared', 'wp', 'reseller'], page: '/web-hosting' },
  { id: 'vps', label: 'VPS', short: 'VPS', types: ['vps', 'forex', 'automation', 'ai'], page: '/vps-hosting' },
  { id: 'dedicated', label: 'Dedicated servers', short: 'Dedicated Servers', types: ['dedicated'], page: '/dedicated-servers' },
  { id: 'rdp', label: 'Remote desktop (RDP)', short: 'RDP', types: ['rdp'], page: '/windows-rdp' },
] as const;
export const familyOf = (p: TProduct) => FAMILIES.find((f) => (f.types as readonly string[]).includes(p.type))?.id || null;

/** Type-by-location URL prefixes. Each lists the products of `cats` (category slugs) or `types` (planfinder TYPE). */
export const TYPE_LOC: Record<string, { label: string; plural: string; types?: string[]; cats?: string[]; page: string }> = {
  'web-hosting': { label: 'Web Hosting', plural: 'web hosting plans', types: ['shared', 'wp'], page: '/web-hosting' },
  vps: { label: 'VPS Hosting', plural: 'VPS plans', types: ['vps'], page: '/vps-hosting' },
  'dedicated-servers': { label: 'Dedicated Servers', plural: 'dedicated servers', types: ['dedicated'], page: '/dedicated-servers' },
  'windows-rdp': { label: 'Windows RDP Servers', plural: 'Windows RDP plans', cats: ['windows-rdp'], page: '/windows-rdp' },
  'linux-rdp': { label: 'Linux RDP Servers', plural: 'Linux RDP plans', cats: ['linux-rdp'], page: '/linux-rdp' },
};
/** Combinations that already have a hand-written landing page: link there instead of generating a duplicate. */
export const TYPE_LOC_EXISTING: Record<string, string> = { 'web-hosting/uae': '/web-hosting-dubai', 'vps/uae': '/vps-uae', 'windows-rdp/uae': '/windows-rdp-uae' };
export const inTypeLoc = (prefix: string, p: TProduct) => {
  const d = TYPE_LOC[prefix];
  return !!d && (d.cats ? d.cats.includes(p.categorySlug) : (d.types || []).includes(p.type));
};

export type LocGroup = { loc: LocInfo; products: TProduct[] };

/** Every location that has at least one orderable product (synonyms merged), most plans first. */
export function locationGroups(cat: Catalog): LocGroup[] {
  const map = new Map<string, LocGroup>();
  for (const p of available(cat.products)) {
    if (!familyOf(p)) continue; // locations are about infrastructure; SSL, email etc. have none
    const loc = locationOf(p);
    if (!loc) continue;
    const g = map.get(loc.slug) || { loc, products: [] };
    g.products.push(p);
    map.set(loc.slug, g);
  }
  const per = (p: TProduct) => fromPrice(p, cat.currency)?.amount ?? 1e9;
  const ed = cat.links?.locations || {};
  for (const g of map.values()) {
    g.products.sort((a, b) => a.sortOrder - b.sortOrder || per(a) - per(b));
    const e = ed[g.loc.slug]; // admin notes (Admin → Site links) over the built-in LOCS text
    if (e) g.loc = { ...g.loc, ...(e.name && { name: e.name, the: e.name }), ...(e.note && { note: e.note }), ...(e.near && { near: e.near }) };
  }
  return [...map.values()].sort((a, b) => b.products.length - a.products.length || a.loc.name.localeCompare(b.loc.name));
}

/** Type-by-location pages: ≥2 products of the type there, and the location also has other products
 * (otherwise /locations/<loc> already lists exactly the same plans). */
export function typeLocPages(cat: Catalog, groups = locationGroups(cat)) {
  const out: { prefix: string; loc: LocInfo; products: TProduct[] }[] = [];
  for (const g of groups) for (const prefix of Object.keys(TYPE_LOC)) {
    if (TYPE_LOC_EXISTING[`${prefix}/${g.loc.slug}`]) continue;
    const ps = g.products.filter((p) => inTypeLoc(prefix, p));
    if (ps.length >= 2 && ps.length < g.products.length) out.push({ prefix, loc: g.loc, products: ps });
  }
  return out;
}

/* ------------------------------------------------------------------ use cases */
export type Spec = { ram: number; cores: number; disk: number; sites: number; os: string; loc: string; family: string | null; type: string };
const gbOf = (s?: string) => { const m = (s || '').match(/(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(TB|GB)/i); return m ? (m[1] ? +m[1] : 1) * parseFloat(m[2]) * (/tb/i.test(m[3]) ? 1024 : 1) : 0; };
export function specOf(p: TProduct): Spec {
  const s = deriveSpecs(p.features, p.attributes);
  const c = (s.cpu || '').match(/(\d+)\s*(?:c\b|c\/|v?cpu|v?cores?|core)/i) || (s.cpu || '').match(/(\d+)/);
  const w = (s.websites || '').match(/(unlimited|\d+)/i);
  const text = `${p.name} ${s.os || ''} ${p.categorySlug}`.toLowerCase();
  return {
    ram: gbOf(s.ram), cores: c ? +c[1] : 0, disk: gbOf(s.storage), sites: w ? (/unl/i.test(w[1]) ? 999 : +w[1]) : 0,
    os: /windows|win\b/.test(text) ? 'Windows' : /linux|ubuntu|debian/.test(text) ? 'Linux' : '',
    loc: locationOf(p)?.name || '', family: familyOf(p), type: p.type || p.categorySlug,
  };
}

export type Pick = { p: TProduct; why: string[] };
export type UseCase = {
  slug: string; name: string; h1: string; seoTitle: string; lead: string; meta: string;
  icon: string; intro: string; needs: { h: string; p: string }[];
  /** ordered candidate pools; the first plans that pass make the recommendation */
  select: (ps: TProduct[], cat: Catalog) => Pick[];
  steps: string[]; faqs: { q: string; a: string }[];
  links: { label: string; href: string }[];
};

const by = (types: string[]) => (p: TProduct) => types.includes(p.type);
const cheap = (cat: Catalog) => (a: TProduct, b: TProduct) => (fromPrice(a, cat.currency)?.amount ?? 1e9) - (fromPrice(b, cat.currency)?.amount ?? 1e9);
const gbTxt = (n: number) => (n >= 1024 ? `${+(n / 1024).toFixed(1)} TB` : `${+n.toFixed(1)} GB`);
/** Up to `n` plans spread across the price range (entry, middle, top) so the reader sees real choices. */
function spread(ps: TProduct[], n = 3) {
  if (ps.length <= n) return ps;
  if (n <= 1) return ps.slice(0, 1);
  const idx = [...new Set(Array.from({ length: n }, (_, i) => Math.round((i * (ps.length - 1)) / (n - 1))))];
  return idx.map((i) => ps[i]);
}
function pickFrom(ps: TProduct[], cat: Catalog, test: (p: TProduct, s: Spec) => boolean, why: (p: TProduct, s: Spec) => string[], n = 3): Pick[] {
  const ok = ps.filter((p) => test(p, specOf(p))).sort(cheap(cat));
  return spread(ok, n).map((p) => ({ p, why: why(p, specOf(p)).filter(Boolean).slice(0, 3) }));
}
const locWhy = (s: Spec) => (s.loc ? `Hosted in ${LOC_BY_SYN.get(s.loc.toLowerCase())?.the || s.loc}: pick it when most visitors are nearby.` : '');
const sitesWhy = (s: Spec) => (s.sites >= 999 ? 'Unlimited websites on one plan.' : s.sites > 1 ? `Room for ${s.sites} websites on one plan.` : s.sites === 1 ? 'One website: the simplest way to start.' : '');
const ramWhy = (s: Spec, need: string) => (s.ram ? `${gbTxt(s.ram)} RAM${s.cores ? ` and ${s.cores} CPU cores` : ''} ${need}.` : '');

export const USE_CASES: UseCase[] = [
  {
    slug: 'wordpress', name: 'WordPress', icon: 'wp', h1: 'Hosting for WordPress sites', seoTitle: 'Hosting for WordPress: Plans That Fit Your Site',
    lead: 'WordPress runs on PHP and MySQL, so almost any hosting plan can run it. What matters is fast storage, backups you can restore and enough room for every site you plan to build.',
    meta: 'Which hosting plan suits a WordPress site? Plans from our live catalog that fit, with reasons, setup steps and free migration of an existing WordPress site.',
    intro: 'A typical WordPress blog or company site does not need a server of its own. Shared or managed WordPress hosting gives you PHP, a MySQL database, free SSL and backups for a few dollars a month. Move to a VPS when traffic, plugins or WooCommerce outgrow it.',
    needs: [{ h: 'PHP and MySQL', p: 'Every plan below runs PHP with MySQL or MariaDB databases, which is all WordPress needs.' }, { h: 'Fast storage and caching', p: 'Page speed depends on disk and caching more than on CPU for most WordPress sites.' }, { h: 'Backups and SSL', p: 'Daily backups and a free SSL certificate cover the two things every site needs on day one.' }],
    select: (ps, cat) => {
      const wp = pickFrom(ps.filter(by(['wp'])), cat, () => true, (p, s) => ['Built for WordPress: installed and updated for you.', sitesWhy(s), locWhy(s)]);
      return wp.length ? wp : pickFrom(ps.filter(by(['shared'])), cat, () => true, (p, s) => ['Runs PHP and MySQL with a one-click WordPress installer.', sitesWhy(s), locWhy(s)]);
    },
    steps: ['Choose a plan below and register or connect your domain.', 'Install WordPress from the control panel in one click, or ask us to do it.', 'Pick a theme, add your pages and install a caching plugin.', 'Moving an existing site? Request a free migration and we copy it for you.'],
    faqs: [
      { q: 'Do I need a VPS for WordPress?', a: 'Not for most sites. A blog or business site runs well on shared or WordPress hosting. Consider a VPS for busy WooCommerce stores, membership sites or many plugins doing heavy work.' },
      { q: 'Can you move my WordPress site for me?', a: 'Yes. Our engineers copy your files, database and email from your current host for free, and you check the site before you switch the domain.' },
      { q: 'Can I host more than one WordPress site?', a: 'Yes, on plans with more than one website. The number of websites each plan allows is listed next to it.' },
    ],
    links: [{ label: 'WordPress hosting', href: '/wordpress-hosting' }, { label: 'Web hosting plans', href: '/web-hosting' }],
  },
  {
    slug: 'woocommerce', name: 'WooCommerce', icon: 'cart', h1: 'Hosting for WooCommerce stores', seoTitle: 'WooCommerce Hosting: Plans for Online Stores',
    lead: 'A WooCommerce store does more work than a blog: carts, checkouts and stock updates cannot be cached the same way. Start on a solid hosting plan and move to a VPS as orders grow.',
    meta: 'Hosting plans for WooCommerce stores, from first products to busy checkouts: real plans from our catalog with reasons, setup steps and free store migration.',
    intro: 'Product pages can be cached, but carts, checkouts and account pages are generated for each shopper. That is why a store needs more memory and faster storage than a brochure site of the same size, and why a VPS becomes worthwhile sooner.',
    needs: [{ h: 'Uncached checkout pages', p: 'Cart and checkout run PHP on every request, so CPU and RAM matter more than for a blog.' }, { h: 'SSL on every page', p: 'Payments and logins need HTTPS everywhere; every plan includes a free certificate.' }, { h: 'Room to grow', p: 'Start small and upgrade to a VPS with reserved resources when orders increase.' }],
    select: (ps, cat) => {
      const host = pickFrom(ps.filter(by(['wp', 'shared'])), cat, (p, s) => s.sites !== 1 || ps.filter(by(['wp', 'shared'])).length < 3, (p, s) => ['Runs WordPress and WooCommerce with a free SSL certificate for checkout.', sitesWhy(s), locWhy(s)], 2);
      const vps = pickFrom(ps.filter(by(['vps'])), cat, (p, s) => s.ram >= 4 && s.os !== 'Windows', (p, s) => [ramWhy(s, 'reserved for your store, so busy sales days do not slow it'), 'Full root access for Redis, object caching and custom PHP settings.', locWhy(s)], 1);
      return [...host, ...vps];
    },
    steps: ['Pick a plan below; choose the VPS if you already have steady daily orders.', 'Install WordPress and WooCommerce, then your payment gateway.', 'Enable page caching, but exclude cart, checkout and account pages.', 'Already selling elsewhere? Ask for a free migration of your store.'],
    faqs: [
      { q: 'When should a WooCommerce store move to a VPS?', a: 'When checkout slows down at busy times, when you run many plugins, or when you need Redis or custom server settings. A VPS gives the store reserved CPU and RAM.' },
      { q: 'Is SSL included?', a: 'Yes. Every hosting plan includes a free SSL certificate, which you need for payments and logins.' },
      { q: 'Will my store go offline during migration?', a: 'No. We copy the store first, you test it, and only then you point your domain to the new server.' },
    ],
    links: [{ label: 'WooCommerce hosting', href: '/aws-pro-wordpress-ecommerce' }, { label: 'VPS hosting', href: '/vps-hosting' }],
  },
  {
    slug: 'n8n-automation', name: 'n8n automation', icon: 'flow', h1: 'Hosting for n8n automation', seoTitle: 'n8n Hosting: Self-Hosted Workflow Automation',
    lead: 'Self-hosted n8n runs your workflows on a server you control, with no per-execution limits. It needs a Linux server that is always on, with enough memory for the workflows you run.',
    meta: 'Where to self-host n8n: always-on Linux servers from our live catalog that fit, why each one suits, setup steps and answers on memory, backups and updates.',
    intro: 'n8n is a Node.js application that usually runs in Docker with a database for workflow history. A small instance is comfortable with 2 GB of memory; workflows that process files, large JSON payloads or AI calls in parallel need more.',
    needs: [{ h: 'Always on', p: 'Triggers and schedules only fire while the server is running, so a server beats a laptop.' }, { h: 'Linux with Docker', p: 'The usual install is Docker Compose on Ubuntu or Debian, with root access.' }, { h: 'Memory for big runs', p: 'Large payloads and parallel executions use RAM; choose more if your workflows move files.' }],
    select: (ps, cat) => {
      const own = pickFrom(ps.filter(by(['automation'])), cat, () => true, (p, s) => ['Set up for n8n automation.', ramWhy(s, 'for parallel workflow runs'), locWhy(s)]);
      return own.length ? own : pickFrom(ps.filter(by(['vps'])), cat, (p, s) => s.ram >= 2 && s.os !== 'Windows', (p, s) => [ramWhy(s, 'for n8n, its database and parallel runs'), 'Root access to install Docker and n8n your way.', locWhy(s)]);
    },
    steps: ['Order a plan below with a Linux image such as Ubuntu.', 'Install Docker and run n8n with Docker Compose, or ask our team to set it up.', 'Point a subdomain at the server and enable HTTPS for webhooks.', 'Schedule backups of the n8n database and your credentials key.'],
    faqs: [
      { q: 'How much memory does n8n need?', a: 'A small instance runs with about 2 GB of RAM. Workflows that handle files, big JSON payloads or many parallel executions need more, so start with headroom.' },
      { q: 'Are there limits on workflows or executions?', a: 'Self-hosted n8n has no execution limits from us; you are limited only by the server resources you choose.' },
      { q: 'Can I move from n8n Cloud?', a: 'Yes. Export your workflows and re-create your credentials on the new server; our team can help with the setup.' },
    ],
    links: [{ label: 'n8n automation hosting', href: '/n8n-automation' }, { label: 'VPS hosting', href: '/vps-hosting' }],
  },
  {
    slug: 'ai-models', name: 'AI models', icon: 'spark', h1: 'Hosting for open AI models', seoTitle: 'Hosting for AI Models: Run Open LLMs Privately',
    lead: 'Running an open model such as Llama, Mistral or Qwen yourself keeps prompts and data on hardware you control. The main constraint is memory: the model has to fit in RAM, or in GPU memory when a GPU is listed.',
    meta: 'Servers that fit open AI models such as Llama, Mistral and Qwen: plans from our live catalog sized by memory, with honest notes on CPU inference and setup steps.',
    intro: 'Quantised 7 to 8 billion parameter models need roughly 5 to 8 GB of memory; larger models need proportionally more. Unless a plan lists a GPU, it runs models on the CPU, which works well for private assistants, batch jobs and embeddings, but answers more slowly than a GPU.',
    needs: [{ h: 'Enough memory', p: 'The model must fit in RAM with room for the operating system and your app.' }, { h: 'Many CPU cores', p: 'Without a GPU, more cores mean faster token generation.' }, { h: 'Private by design', p: 'Prompts and documents stay on your server instead of a third-party API.' }],
    select: (ps, cat) => {
      const own = pickFrom(ps.filter(by(['ai'])), cat, () => true, (p, s) => ['Sized for running language models.', ramWhy(s, 'for the model and your app'), locWhy(s)]);
      if (own.length) return own;
      return pickFrom(ps.filter(by(['dedicated', 'vps'])), cat, (p, s) => s.ram >= 32 && s.os !== 'Windows', (p, s) => [`${gbTxt(s.ram)} RAM fits quantised models of ${s.ram >= 96 ? '70 billion parameters' : s.ram >= 48 ? '30 billion parameters' : '7 to 13 billion parameters'} with room to spare.`, s.cores ? `${s.cores} CPU cores for CPU inference.` : '', s.family === 'dedicated' ? 'A whole physical server: no neighbours competing for memory bandwidth.' : 'Reserved memory and cores on a virtual server.']);
    },
    steps: ['Choose a plan below with enough memory for the model you want.', 'Install Ollama or llama.cpp on a Linux image.', 'Download a quantised model and test its speed with your own prompts.', 'Put an authenticated API or chat interface in front of it before exposing it to the internet.'],
    faqs: [
      { q: 'Do these servers have a GPU?', a: 'Only when the plan says so. Plans without a GPU run models on the CPU, which suits smaller quantised models, embeddings and batch work.' },
      { q: 'How big a model can I run?', a: 'As a rule of thumb, a 4-bit quantised model needs a little more than half a gigabyte of memory per billion parameters, plus room for the system and your app.' },
      { q: 'Is my data private?', a: 'The model runs on your server, so prompts and documents are not sent to an outside AI provider unless you set that up.' },
    ],
    links: [{ label: 'AI / LLM hosting', href: '/ai-llm-hosting' }, { label: 'Dedicated servers', href: '/dedicated-servers' }],
  },
  {
    slug: 'mt4-mt5-trading', name: 'MT4 / MT5 trading', icon: 'chart', h1: 'Hosting for MT4 and MT5 trading', seoTitle: 'MT4 & MT5 Hosting: Windows Servers for Trading',
    lead: 'Expert advisors and copy-trading terminals only work while MetaTrader is running. A Windows server keeps the terminal on around the clock, even when your own computer is off.',
    meta: 'Always-on Windows servers for MetaTrader 4 and 5 terminals and expert advisors: plans from our live catalog that fit, with reasons and simple setup steps.',
    intro: 'MetaTrader 4 and 5 are Windows applications. Each terminal uses a few hundred megabytes of memory, so the number of terminals and indicators you run decides the size. Choosing a server near your broker’s trade servers shortens the order round trip.',
    needs: [{ h: 'Windows desktop', p: 'MetaTrader runs natively on Windows; you connect by Remote Desktop from any device.' }, { h: 'Always on', p: 'Expert advisors and trade copiers stop when the terminal closes.' }, { h: 'Near your broker', p: 'Pick the location closest to your broker’s servers.' }],
    select: (ps, cat) => {
      const fx = pickFrom(ps.filter(by(['forex'])), cat, () => true, (p, s) => ['Built for trading terminals.', ramWhy(s, 'for several terminals and indicators'), locWhy(s)]);
      if (fx.length) return fx;
      const rdp = pickFrom(ps.filter((p) => p.categorySlug === 'windows-rdp'), cat, () => true, (p, s) => ['A Windows desktop that stays on when your PC is off.', ramWhy(s, 'for MetaTrader terminals'), locWhy(s)]);
      return rdp.length ? rdp : pickFrom(ps.filter(by(['vps'])), cat, (p, s) => s.os === 'Windows', (p, s) => ['Windows VPS with administrator access for MetaTrader.', ramWhy(s, 'for several terminals'), locWhy(s)]);
    },
    steps: ['Choose a plan below in the location nearest your broker.', 'Connect with Remote Desktop and install MetaTrader 4 or 5 from your broker.', 'Log in to your trading account and attach your expert advisors.', 'Turn on automatic restart of the terminal after Windows updates.'],
    faqs: [
      { q: 'How many MetaTrader terminals can I run?', a: 'Each terminal typically uses a few hundred megabytes of RAM, more with many charts and indicators. Plans with more memory run more terminals side by side.' },
      { q: 'Can I connect from my phone?', a: 'Yes. Any Remote Desktop app on Windows, macOS, iOS or Android can connect to the server.' },
      { q: 'Does the server trade for me?', a: 'No. It keeps your terminal and expert advisors running. Trading decisions and risk are yours.' },
    ],
    links: [{ label: 'Forex VPS', href: '/forex-vps' }, { label: 'Windows RDP', href: '/windows-rdp' }],
  },
  {
    slug: 'agencies-resellers', name: 'Agencies and resellers', icon: 'users', h1: 'Hosting for agencies and resellers', seoTitle: 'Hosting for Agencies & Resellers: Client Sites',
    lead: 'If you build sites for clients, hosting them yourself keeps everything in one place and can become a recurring income. Choose between reseller hosting with ready-made accounts and your own server.',
    meta: 'Host client websites under your own brand: reseller hosting and servers from our live catalog that fit agencies, with reasons, setup steps and free migration.',
    intro: 'Reseller hosting splits a server into separate control-panel accounts, so every client has their own login, email and backups and you never manage the operating system. A VPS or dedicated server gives you full control and more room, but you, or we, run the server.',
    needs: [{ h: 'Separate accounts', p: 'Each client gets their own space, so one site cannot affect another’s files.' }, { h: 'Your brand', p: 'Clients see your name and your prices.' }, { h: 'Room for every client', p: 'Plan for the number of sites you expect next year, not only today.' }],
    select: (ps, cat) => {
      const rs = pickFrom(ps.filter(by(['reseller'])), cat, () => true, (p, s) => ['White-label control-panel accounts for each client.', s.disk ? `${gbTxt(s.disk)} storage shared across your clients.` : '', locWhy(s)]);
      const srv = pickFrom(ps.filter(by(['vps', 'dedicated'])), cat, (p, s) => s.ram >= 8 && s.os !== 'Windows', (p, s) => [ramWhy(s, 'to host many client sites side by side'), s.family === 'dedicated' ? 'A whole physical server for your agency.' : 'Full root access to install the control panel you prefer.', locWhy(s)], rs.length ? 1 : 3);
      return [...rs, ...srv];
    },
    steps: ['Pick reseller hosting for ready-made client accounts, or a server for full control.', 'Create a package for each type of client you serve.', 'Move existing client sites over; we migrate them for free.', 'Bill clients on your own terms and keep one renewal with us.'],
    faqs: [
      { q: 'Reseller hosting or a VPS?', a: 'Reseller hosting is simpler: we run the server and you create accounts. A VPS or dedicated server gives more control and resources, but needs server management.' },
      { q: 'Will clients see Globalhostia?', a: 'Reseller hosting is white-label: clients see your brand and your prices.' },
      { q: 'Can you migrate my clients’ sites?', a: 'Yes. Send us the list and we move the sites, databases and email for free.' },
    ],
    links: [{ label: 'cPanel reseller hosting', href: '/cpanel-reseller' }, { label: 'Cloud servers', href: '/cloud-servers' }],
  },
  {
    slug: 'ecommerce-stores', name: 'Online stores', icon: 'store', h1: 'Hosting for online stores', seoTitle: 'E-commerce Hosting for Online Stores of Any Size',
    lead: 'Whether you sell with WooCommerce, PrestaShop, OpenCart or Magento, a store needs fast pages, an SSL certificate customers trust and room to grow when sales do.',
    meta: 'Hosting for online stores on WooCommerce, PrestaShop, OpenCart or Magento: real plans and SSL certificates from our catalog, with reasons and setup steps.',
    intro: 'Lightweight shop software runs comfortably on good hosting. Heavier platforms such as Magento, and stores with large catalogues or busy sales, need the reserved memory of a VPS. Customers also look for the padlock, and organisation-validated certificates add your company name.',
    needs: [{ h: 'The right platform size', p: 'Small catalogues fit on hosting; Magento and large catalogues need a VPS.' }, { h: 'Visible trust', p: 'HTTPS on every page, with an organisation-validated certificate if you want your company name shown.' }, { h: 'Backups before sales', p: 'Take a backup before every big promotion or plugin update.' }],
    select: (ps, cat) => {
      const host = pickFrom(ps.filter(by(['wp', 'shared'])), cat, (p, s) => s.sites !== 1, (p, s) => ['Runs PHP shop software with one-click installers and free SSL.', sitesWhy(s), locWhy(s)], 1);
      const vps = pickFrom(ps.filter(by(['vps'])), cat, (p, s) => s.ram >= 4 && s.os !== 'Windows', (p, s) => [ramWhy(s, 'for heavier stores and platforms such as Magento'), 'Root access for Redis, Elasticsearch or OpenSearch.', locWhy(s)], 1);
      const ssl = pickFrom(ps.filter((p) => p.categorySlug === 'ssl-certificates'), cat, (p) => /\b(OV|EV|organi[sz]ation)\b/i.test(p.name + ' ' + p.features.join(' ')), () => ['Shows your verified company name in the certificate details.', 'A step up from the free certificate for stores that want extra trust.'], 1);
      const base = [...host, ...vps];
      return base.length ? [...base, ...ssl] : [];
    },
    steps: ['Choose hosting for a small catalogue, or a VPS for Magento or a busy store.', 'Install your shop software and payment gateway.', 'Turn on HTTPS everywhere; add an OV certificate if you want your company verified.', 'Moving a store? Request a free migration and test before switching.'],
    faqs: [
      { q: 'Which plan do I need for Magento?', a: 'Magento needs more memory than most shop software and a search engine such as OpenSearch, so we recommend a VPS rather than shared hosting.' },
      { q: 'Do I need a paid SSL certificate?', a: 'No, a free certificate already encrypts checkout. A paid organisation-validated certificate adds your verified company name for customers who check.' },
      { q: 'Can I start small and upgrade?', a: 'Yes. Start on hosting and move to a VPS later; we migrate the store for you.' },
    ],
    links: [{ label: 'SSL certificates', href: '/ssl-certificate' }, { label: 'VPS hosting', href: '/vps-hosting' }],
  },
  {
    slug: 'small-business', name: 'Small business', icon: 'store', h1: 'Hosting for small businesses', seoTitle: 'Small Business Hosting: Website, Email & SSL',
    lead: 'A small business needs a fast website, email on its own domain and someone to call when something breaks, without paying for a server it does not use.',
    meta: 'Website hosting for small businesses: real plans from our catalog for your site and email on your domain, with reasons, setup steps and free website migration.',
    intro: 'Most small-business sites are a handful of pages, a contact form and perhaps a blog. Managed shared hosting covers that well, with free SSL and daily backups included. Professional email on your own domain builds trust with every message you send.',
    needs: [{ h: 'Managed for you', p: 'Managed shared hosting runs a professional business website while we look after the servers, security and backups.' }, { h: 'Email on your domain', p: 'you@yourcompany.com looks more trustworthy than a free webmail address.' }, { h: 'Help when you need it', p: 'Engineers on call by ticket and WhatsApp, around the clock.' }],
    select: (ps, cat) => {
      const host = pickFrom(ps.filter(by(['shared', 'wp'])), cat, () => true, (p, s) => ['Includes free SSL and daily backups.', sitesWhy(s), locWhy(s)], 2);
      const mail = pickFrom(ps.filter((p) => p.categorySlug === 'business-email'), cat, () => true, () => ['Professional email on your own domain.', 'Webmail and apps for every member of the team.'], 1);
      return host.length ? [...host, ...mail] : [];
    },
    steps: ['Register your domain or connect the one you have.', 'Choose a hosting plan below and build your site with WordPress or a builder.', 'Create mailboxes on your domain for the team.', 'Moving from another host? We migrate your site and email for free.'],
    faqs: [
      { q: 'Is shared hosting enough for a business website?', a: 'For most small-business sites, yes. Upgrade to a VPS only when traffic or custom software needs it.' },
      { q: 'Can I get email on my domain?', a: 'Yes. Hosting plans include email accounts, and business email or Google Workspace adds calendars and shared documents.' },
      { q: 'Do you build websites?', a: 'We host, migrate and support websites. Ask us about website builder options for your plan.' },
    ],
    links: [{ label: 'Business email', href: '/google-workspace' }, { label: 'Domain registration', href: '/domains-registration' }],
  },
  {
    slug: 'developers', name: 'Developers', icon: 'code', h1: 'Hosting for developers', seoTitle: 'Developer Hosting: Root Access VPS & Bare Metal',
    lead: 'Developers need root access, a clean Linux image and predictable resources for side projects, staging environments, APIs and CI runners.',
    meta: 'Servers for developers: root-access Linux VPS and bare-metal machines from our live catalog, picked for APIs, staging, containers and CI, with reasons.',
    intro: 'A VPS is the usual starting point: full root access, your choice of distribution, Docker and SSH keys. Move to a dedicated server when you need guaranteed CPU, lots of RAM for databases, or many containers on one machine.',
    needs: [{ h: 'Root and SSH', p: 'Install any language runtime, database or container engine you like.' }, { h: 'Predictable resources', p: 'Reserved vCPU and RAM, or a whole physical machine.' }, { h: 'Somewhere near your users', p: 'Choose the location your users or your other services are closest to.' }],
    select: (ps, cat) => {
      const vps = pickFrom(ps.filter(by(['vps'])), cat, (p, s) => s.os !== 'Windows', (p, s) => [ramWhy(s, 'for containers, databases and builds'), 'Full root access over SSH.', locWhy(s)], 2);
      const rdp = pickFrom(ps.filter((p) => p.categorySlug === 'linux-rdp'), cat, () => true, (p, s) => ['A Linux desktop in the cloud for remote development.', ramWhy(s, 'for IDEs and browsers'), locWhy(s)], 1);
      const ded = pickFrom(ps.filter(by(['dedicated'])), cat, () => true, (p, s) => [ramWhy(s, 'on a physical machine with no neighbours'), s.disk ? `${gbTxt(s.disk)} of storage for data and images.` : '', locWhy(s)], vps.length ? 1 : 3);
      return [...vps, ...rdp, ...ded];
    },
    steps: ['Pick a plan below and choose a Linux distribution at checkout.', 'Add your SSH key and disable password logins.', 'Install Docker or your runtime, and set up a firewall.', 'Automate deploys from Git and schedule backups.'],
    faqs: [
      { q: 'Do I get root access?', a: 'Yes. VPS and dedicated servers come with full root (or administrator) access.' },
      { q: 'Which operating systems can I choose?', a: 'The available images are listed in the order form for each plan; common Linux distributions such as Ubuntu and Debian are usually offered.' },
      { q: 'Can I upgrade later?', a: 'Yes. Open a ticket to move to a bigger plan; we explain any price difference first.' },
    ],
    links: [{ label: 'VPS hosting', href: '/vps-hosting' }, { label: 'Dedicated servers', href: '/dedicated-servers' }],
  },
  {
    slug: 'game-servers', name: 'Game servers', icon: 'server', h1: 'Hosting for game servers', seoTitle: 'Game Server Hosting: VPS & Dedicated Servers',
    lead: 'Game servers need strong single-core speed, enough memory for players and mods, and a location close to the people who play.',
    meta: 'Servers for hosting multiplayer game servers: plans from our live catalog that list game support, with reasons, setup steps and location advice for players.',
    intro: 'Only plans that mention game hosting are recommended here.',
    needs: [{ h: 'Fast cores', p: 'Most game servers rely on one or two fast cores.' }, { h: 'Memory for players', p: 'Mods and players add memory use.' }, { h: 'Close to players', p: 'Pick the location nearest most of your players.' }],
    // only when the catalog explicitly offers game hosting
    select: (ps, cat) => pickFrom(ps.filter((p) => /\bgam(e|ing)\b/i.test(`${p.name} ${p.tagline} ${p.features.join(' ')}`)), cat, () => true, (p, s) => ['Listed for game hosting.', ramWhy(s, 'for players and mods'), locWhy(s)]),
    steps: ['Choose a plan near your players.', 'Install the game server software.', 'Open the game ports in the firewall.', 'Schedule world backups.'],
    faqs: [{ q: 'Which location should I choose?', a: 'The one closest to most of your players.' }],
    links: [{ label: 'Dedicated servers', href: '/dedicated-servers' }],
  },
];

/** Use cases the catalog supports (at least one fitting plan). */
export function useCasePages(cat: Catalog) {
  const ps = available(cat.products);
  // a selector that fails on odd catalog data skips its page instead of breaking the hub or the sitemap
  const safe = (u: UseCase) => { try { return u.select(ps, cat); } catch { return []; } };
  const ed = cat.links?.useCases || {};
  return USE_CASES.filter((u) => !ed[u.slug]?.hidden)
    .map((u) => { const e = ed[u.slug]; return e ? { ...u, ...(e.name && { name: e.name }), ...(e.h1 && { h1: e.h1 }), ...(e.lead && { lead: e.lead }), ...(e.meta && { meta: e.meta }), ...(e.intro && { intro: e.intro }) } : u; })
    .map((u) => ({ u, picks: safe(u) })).filter((x) => x.picks.length > 0);
}

/* ------------------------------------------------------------------ redirects + sitemap */
/** Short paths that point to a better page (301). Keys are lower-case paths without the leading slash. */
export const PSEO_REDIRECTS: Record<string, string> = {
  domains: '/domains/all', locations: '/data-centers',
  ...Object.fromEntries(Object.entries(TLD_EXISTING).map(([t, to]) => [`domains/${tldSlug(t)}`, to])),
  ...Object.fromEntries(Object.entries(TYPE_LOC_EXISTING).map(([k, to]) => [k, to])),
};

/**
 * The hand-written page that already sells a category's products, or null. Either every product is also in a
 * category with a page (same WHMCS pid or name), or the category is approved and its family has a page that lists it
 * (data.ts expandCategories). Such a category gets no menu entry of its own and /category/<slug> 301s there.
 */
export function coveredBy(cat: Catalog, slug: string): string | null {
  if (CLAIMED.has(slug)) return routeForCategory(slug);
  // categories the published Business services shop lists live at /business-services/<slug> (lib/store/view.ts)
  const shop = storeHref(cat, slug);
  if (shop) return shop;
  const c = cat.categories.find((x) => x.slug === slug);
  const own = cat.products.filter((p) => p.categorySlug === slug);
  if (!c || !own.length) return null;
  const elsewhere = cat.products.filter((p) => p.categorySlug !== slug && CLAIMED.has(p.categorySlug));
  const twin = (p: TProduct) => elsewhere.find((q) => (p.whmcsPid && q.whmcsPid === p.whmcsPid) || q.name.trim().toLowerCase() === p.name.trim().toLowerCase());
  const twins = own.map(twin);
  if (twins.every(Boolean)) return routeForCategory(twins[0]!.categorySlug);
  if (!c.auto) return null;
  const page = TYPE_PAGE[c.type];
  const route = page && ROUTES[page.slice(1)];
  if (route && expandCategories(cat, route.categories || []).includes(slug)) return page;
  return null;
}

/** Categories that get a generated /category/<slug> page: approved, with products, no page that already sells them. */
export function categoryPages(cat: Catalog) {
  return cat.categories.filter((c) => c.auto && !CLAIMED.has(c.slug) && cat.products.some((p) => p.categorySlug === c.slug) && !coveredBy(cat, c.slug));
}

/** Where a category is listed: its hand-written or covering page, its generated page, or null when it is not surfaced. */
export function categoryHrefIn(cat: Catalog, slug: string): string | null {
  return coveredBy(cat, slug) || (categoryPages(cat).some((c) => c.slug === slug) ? `/category/${slug}` : null);
}

/** 301 target for /category/<slug> when another page already sells the category ('' = render or 404). */
export function categoryRedirect(cat: Catalog, slug: string): string {
  const c = cat.categories.find((x) => x.slug === slug);
  return c ? coveredBy(cat, slug) || '' : '';
}

/** Every programmatic URL path (for the sitemap and the crawl check). */
export function pseoPaths(cat: Catalog): string[] {
  const groups = locationGroups(cat);
  const uc = useCasePages(cat);
  return [
    ...categoryPages(cat).map((c) => `/category/${c.slug}`),
    '/domains/all',
    ...tldPageList(cat).filter((t) => !TLD_EXISTING[t]).map((t) => `/domains/${tldSlug(t)}`),
    ...groups.map((g) => `/locations/${g.loc.slug}`),
    ...typeLocPages(cat, groups).map((x) => `/${x.prefix}/${x.loc.slug}`),
    ...(uc.length ? ['/hosting-for', ...uc.map((x) => `/hosting-for/${x.u.slug}`)] : []),
  ];
}
