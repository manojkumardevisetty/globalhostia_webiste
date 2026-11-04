// Site-wide technical SEO helpers: robots/verification meta, Organization + WebSite JSON-LD, IndexNow.
import type { Settings } from './settings';
import { esc } from './render/util';
import { ALIAS_SLUGS } from './aliases.mjs';

/** IndexNow key. The matching key file is served from public/<key>.txt. */
export const INDEXNOW_KEY = '6a67d36c3c478068d0f08ecff6923e8a';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
export const INDEXNOW_ENDPOINTS = [INDEXNOW_ENDPOINT, 'https://www.bing.com/indexnow', 'https://yandex.com/indexnow'];

export const ROBOTS_INDEX = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex,follow';

/**
 * Pages that must not be indexed: sign-in flows and error pages, plus the incident pages, which hold no incident
 * data of their own (the CMS copies are template samples, so the theme only links to the live status in WHMCS):
 * /incident-post is an empty "incident report" template and /incident-history repeats /status-page.
 */
export const NOINDEX_SLUGS = new Set(['sign-in', 'sign-up', 'forget-password', '404', 'incident-post', 'incident-history']);

/** CMS page slugs left out of the sitemap: noindex pages, the legacy template blog and 301-redirected aliases. */
export const SITEMAP_EXCLUDE = new Set<string>([...NOINDEX_SLUGS, 'blog', ...ALIAS_SLUGS]);

/** Fit `base` + one of `extras` into 140-160 characters (the longest extra that fits; base alone when none does). */
export function fitDescription(base: string, extras: string[], min = 140, max = 160) {
  const b = base.replace(/\s+/g, ' ').trim();
  if (b.length >= min) return b;
  const fits = extras.map((e) => `${b} ${e.trim()}`).filter((t) => t.length <= max);
  return fits.find((t) => t.length >= min) || fits.sort((x, y) => y.length - x.length)[0] || b;
}

/**
 * Blog listing pages (/blog, /blog/category/<slug>) get a short generated lead from lib/theme/pages/blog.ts
 * ("3 articles on servers from the Globalhostia team."). Extend it into a full-length meta description.
 */
export function blogListingDescription(desc: string, title: string) {
  const t = desc.replace(/\s+/g, ' ').trim();
  if (t.length >= 120) return t;
  const cat = title.replace(/\s*\(page \d+\)$/i, '').replace(/\s+articles( and guides)?$/i, '').trim();
  const topic = !cat || /^blog$/i.test(cat) ? 'web hosting, VPS, servers, domains and email' : cat.toLowerCase().replace(/\s+guides?$/, '') || 'web hosting';
  return fitDescription(t, [
    `Practical guides, tutorials and tips on ${topic} for businesses, site owners and developers, written by the engineers who run GlobalHostia.`,
    `Practical guides, tutorials and tips on ${topic}, written by the engineers who run GlobalHostia.`,
    'Step-by-step tutorials and tips for businesses, site owners and developers.',
    'Tutorials and tips for businesses and developers.',
    `Practical guides and tips on ${topic} from our engineers.`,
    'Guides and tips from the GlobalHostia engineers.',
  ]);
}

export const DEFAULT_DESCRIPTION = 'Domain names, premium domains and managed hosting for businesses worldwide: register and transfer domains, add VPS, servers and business email, 24/7 support.';

/** Positioning line (Organization.slogan): domains first, then managed hosting and business infrastructure. */
export const ORG_SLOGAN = 'Domain names, premium domains and managed hosting for businesses worldwide, based in Dubai.';
/** Organization.description: only services and support the site itself lists. */
export const ORG_DESCRIPTION = 'GlobalHostia is a Dubai-based domain registrar reseller, premium domain marketplace and managed hosting partner for businesses worldwide: domain registration and transfers, premium domains and brokerage, web and WordPress hosting, VPS, dedicated servers, SSL certificates and business email, with 24/7 support.';
export const DEFAULT_PHONE = '+971 50 734 1578';
export const DEFAULT_EMAIL = 'support@globalhostia.com';

export const VERIFICATION_KEYS = [
  { key: 'google_site_verification', meta: 'google-site-verification', label: 'Google Search Console' },
  { key: 'bing_site_verification', meta: 'msvalidate.01', label: 'Bing Webmaster Tools' },
  { key: 'yandex_verification', meta: 'yandex-verification', label: 'Yandex Webmaster' },
] as const;

export const siteUrl = (s: Partial<Settings>) => String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');

/** Accepts either the bare token or the full <meta ... content="..."> tag pasted from the search console. */
export function verificationToken(v: unknown) {
  const raw = String(v ?? '').trim();
  const m = raw.match(/content\s*=\s*["']([^"']+)["']/i);
  return (m ? m[1] : raw).replace(/[^A-Za-z0-9_\-:.=+/]/g, '').slice(0, 200);
}

export function verificationMeta(s: Partial<Settings>) {
  return VERIFICATION_KEYS.map(({ key, meta }) => {
    const t = verificationToken(s[key]);
    return t ? `<meta name="${meta}" content="${esc(t)}">` : '';
  }).join('');
}

/** Profile URLs (one per line) used as Organization.sameAs. */
export function sameAs(s: Partial<Settings>): string[] {
  const v = s.social_links;
  const list = Array.isArray(v) ? v : String(v ?? '').split(/[\r\n,]+/);
  return list.map((x) => String(x).trim()).filter((x) => /^https:\/\/[^\s"<>]+$/.test(x)).slice(0, 20);
}

/** Title for <title>: "Page | Brand", dropping the suffix when that would exceed ~60 characters. */
export function seoTitle(title: string, brand: string) {
  const t = title.replace(/\s+/g, ' ').trim();
  if (!t) return brand;
  if (t.toLowerCase().includes(brand.toLowerCase())) return t;
  const full = `${t} | ${brand}`;
  return full.length <= 60 ? full : t;
}

/** Meta description: fallback when empty, trimmed at a word boundary to ~160 characters. */
export function seoDescription(d: string | undefined, fallback = DEFAULT_DESCRIPTION) {
  const t = String(d || '').replace(/\s+/g, ' ').trim() || fallback;
  if (t.length <= 160) return t;
  const cut = t.slice(0, 157);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 120)).replace(/[\s,;:.-]+$/, '') + '…';
}

/** Brand name for og:site_name, Organization and image alts (public branding is always "GlobalHostia"). */
export const BRAND = 'GlobalHostia';

/**
 * Design version of the /og images (app/og/route.tsx). Bump it when the image layout changes: every og:image URL
 * then changes, so the immutable CDN / social-network copies are fetched again.
 */
export const OG_VERSION = '3';

/** Short stable hash (FNV-1a, base 36) — works in Node and the edge runtime. */
export function shortHash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

export type OgImageOpts = {
  /** small label above the title (section or product category) */ kicker?: string;
  /** line next to the gold bar (default: the data-centre regions) */ sub?: string;
  /** real "from" price of a product, e.g. "$2.99/mo" (only when it comes from the catalog) */ price?: string;
  /** 'ar' renders right to left with the Arabic font */ lang?: 'en' | 'ar';
};

/**
 * Dynamic Open Graph image URL for a page: /og?title=…&kicker=…&v=<hash>. The version is a hash of the design
 * version and every parameter, so the image is cached as immutable and the URL changes whenever its content does.
 * `opts` may also be a plain kicker string (older call sites).
 */
export function ogImageUrl(site: string, title: string, opts?: string | OgImageOpts, _v?: string) {
  const o: OgImageOpts = typeof opts === 'string' ? { kicker: opts } : opts || {};
  const q = new URLSearchParams({ title: ogClean(title, 90) });
  if (o.kicker) q.set('kicker', ogClean(o.kicker, 40));
  if (o.sub) q.set('sub', ogClean(o.sub, 60));
  if (o.price) q.set('price', ogClean(o.price, 24));
  if (o.lang === 'ar') q.set('lang', 'ar');
  q.set('v', shortHash(`${OG_VERSION}|${q.toString()}`));
  return `${site}/og?${q.toString()}`;
}
const ogClean = (v: string, max: number) => String(v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Section label printed above the title on a page's OG image, by theme route kind (lib/theme/routes.ts). */
const KICKER: Record<string, string> = {
  hosting: 'Managed web hosting', wordpress: 'Managed WordPress', reseller: 'Reseller hosting', vps: 'VPS hosting', cloud: 'Managed cloud', servers: 'Servers',
  dedicated: 'Dedicated servers', forex: 'Forex VPS', domains: 'Domains', aedomains: '.ae domains', tld: 'Domains', premium: 'Premium domains', broker: 'Domain broker',
  sell: 'Sell your domain', ssl: 'SSL certificates', email: 'Business email', store: 'Business services', projects: 'Project management', blog: 'Blog',
  learn: 'Guides', vs: 'Compare', help: 'Help centre', contact: 'Contact', datacenters: 'Data centres', migration: 'Free migration', planfinder: 'Plan finder',
  uae: 'UAE business hosting', usecase: 'Hosting for', location: 'Locations', category: 'Plans', ai: 'AI connectors', auth: 'Account', product: 'Plan', landing: 'Offer',
};
const KICKER_AR: Record<string, string> = { ar: 'GlobalHostia بالعربية' };
/** OG kicker for a page: the explicit one, else its section label. */
export function sectionKicker(kind: string | undefined, path: string, explicit?: string) {
  if (explicit) return explicit;
  if (/^\/(connectors|docs\/mcp|ai)(\/|$)/.test(path)) return 'AI connectors';
  if (/^\/help(-center)?(\/|$)/.test(path)) return 'Help centre';
  if (/^\/compare(\/|$)/.test(path)) return 'Compare';
  return KICKER[kind || ''] || KICKER_AR[kind || ''] || '';
}

/** Visible title without a trailing " | Brand" suffix (the generated OG image prints the brand itself). */
export const bareTitle = (t: string) => String(t || '').replace(/\s*\|\s*[^|]*$/, '').trim() || String(t || '').trim();

export type SocialMeta = {
  /** absolute canonical URL (og:url) */ url: string;
  /** full <title> text */ title: string;
  description: string;
  /** absolute image URL */ image: string;
  imageAlt: string;
  /** declared size and type; default 1200×630 PNG (the /og generator and public/og/default.png); 0 = unknown, omitted */
  imageWidth?: number; imageHeight?: number; imageType?: string;
  /** og:type (default "website") */ type?: string;
  /** 'ar' → og:locale ar_AE */ lang?: 'en' | 'ar';
  /** the page also exists in the other language (hreflang pair) → og:locale:alternate */ alternate?: boolean;
};

/** Open Graph + Twitter card tags for one page. Every renderer uses this, so no page misses a tag. */
export function socialMeta(m: SocialMeta) {
  const e = esc;
  const locale = m.lang === 'ar' ? 'ar_AE' : 'en_AE';
  const other = m.lang === 'ar' ? 'en_AE' : 'ar_AE';
  // 0 = size unknown (a custom image): no width/height tags rather than a wrong size
  const w = m.imageWidth ?? 1200, h = m.imageHeight ?? 630;
  const type = m.imageType || (/\.jpe?g(\?|$)/i.test(m.image) ? 'image/jpeg' : /\.webp(\?|$)/i.test(m.image) ? 'image/webp' : 'image/png');
  return `<meta property="og:type" content="${e(m.type || 'website')}"><meta property="og:site_name" content="${BRAND}"><meta property="og:locale" content="${locale}">${m.alternate ? `<meta property="og:locale:alternate" content="${other}">` : ''}`
    + `<meta property="og:url" content="${e(m.url)}"><meta property="og:title" content="${e(m.title)}"><meta property="og:description" content="${e(m.description)}">\n`
    + `<meta property="og:image" content="${e(m.image)}"><meta property="og:image:secure_url" content="${e(m.image)}"><meta property="og:image:type" content="${e(type)}">${w && h ? `<meta property="og:image:width" content="${w}"><meta property="og:image:height" content="${h}">` : ''}<meta property="og:image:alt" content="${e(m.imageAlt)}">\n`
    + `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(m.title)}"><meta name="twitter:description" content="${e(m.description)}"><meta name="twitter:image" content="${e(m.image)}"><meta name="twitter:image:alt" content="${e(m.imageAlt)}">`;
}

/**
 * Query parameters that make a URL a non-canonical variant which must stay out of the index even though the
 * canonical already points at the clean URL: A/B previews (?ab=), the internal per-variant CDN keys (?_ab=, ?_abd=),
 * theme previews and CMS previews.
 */
export const NOINDEX_PARAMS = ['ab', '_ab', '_abd', 'theme', 'preview'];
export const isNoindexQuery = (q: URLSearchParams | null | undefined) => !!q && NOINDEX_PARAMS.some((k) => q.has(k));

/** "Page title" + optional hint → a meta description of 70–160 characters (used where a page has none). */
export function descriptionFor(title: string, text?: string) {
  const t = bareTitle(title);
  const base = String(text || '').replace(/\s+/g, ' ').trim();
  if (base.length >= 70) return seoDescription(base);
  const lead = base ? `${base.replace(/[.\s]+$/, '')}.` : `${t} from GlobalHostia.`;
  return seoDescription(fitDescription(lead, [
    'Domain names, premium domains and managed hosting for businesses worldwide, from a Dubai-based team, with 24/7 support.',
    'Domains, managed hosting, VPS and business email from Dubai-based GlobalHostia, with 24/7 support.',
    'Domains, managed hosting and servers with 24/7 support from GlobalHostia.',
  ], 70, 160));
}

const json = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

/** Organization + WebSite graph, emitted on every public page (the only Organization node on a page: page modules
 *  reference it by @id; `orgExtra` adds properties such as the home page's hasOfferCatalog to it). */
export function siteJsonLd(s: Partial<Settings>, whmcsBase: string, orgExtra?: Record<string, unknown>) {
  const site = siteUrl(s);
  const name = 'GlobalHostia';
  const alt = String(s.site_name || '').trim();
  const phone = String(s.phone || DEFAULT_PHONE).trim();
  const email = String(s.email || DEFAULT_EMAIL).trim();
  const links = sameAs(s);
  const base = String(whmcsBase || '').replace(/\/$/, '');
  const org = {
    '@type': 'Organization', '@id': `${site}/#organization`, name, ...(alt && alt !== name ? { alternateName: alt } : {}),
    url: `${site}/`, description: ORG_DESCRIPTION, slogan: ORG_SLOGAN,
    logo: { '@type': 'ImageObject', url: `${site}/icon-512.png`, width: 512, height: 512 },
    image: `${site}/og/default.png`,
    email, telephone: phone,
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', telephone: phone, email, areaServed: 'Worldwide', availableLanguage: ['English'] },
      { '@type': 'ContactPoint', contactType: 'sales', telephone: phone, email, areaServed: 'Worldwide', availableLanguage: ['English'] }],
    // the site footer states the company is in Dubai, UAE
    address: { '@type': 'PostalAddress', addressLocality: 'Dubai', addressCountry: 'AE' },
    ...(links.length ? { sameAs: links } : {}),
    ...(orgExtra || {}),
  };
  const website: Record<string, unknown> = {
    '@type': 'WebSite', '@id': `${site}/#website`, name, ...(alt && alt !== name ? { alternateName: alt } : {}), url: `${site}/`, inLanguage: 'en', description: DEFAULT_DESCRIPTION,
    publisher: { '@id': `${site}/#organization` },
  };
  if (/^https:\/\//.test(base)) {
    website.potentialAction = { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}/cart.php?a=add&domain=register&query={search_term_string}` }, 'query-input': 'required name=search_term_string' };
  }
  return json({ '@context': 'https://schema.org', '@graph': [org, website] });
}

/**
 * Structured data hygiene for pages that include imported template blocks (lib/render/page.ts): drop JSON-LD blocks
 * that are not valid JSON, FAQPage blocks without questions, and extra Organization nodes for the site (the site
 * graph from siteJsonLd is the one Organization of a page).
 */
export function cleanJsonLd(html: string) {
  const hasGraph = /"@graph":\[\{"@type":"Organization"/.test(html);
  return html.replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>\s*/gi, (m, body: string) => {
    let j: any;
    try { j = JSON.parse(body); } catch { return ''; }
    const typesOf = (n: any): string[] => [].concat(n?.['@type'] || []);
    const nodes: any[] = [];
    const walk = (x: any) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { nodes.push(x); if (x['@graph']) walk(x['@graph']); } };
    walk(j);
    if (nodes.some((n) => typesOf(n).includes('FAQPage') && !(Array.isArray(n.mainEntity) ? n.mainEntity.length : n.mainEntity))) return '';
    // a template's own top-level Organization next to the site graph's
    if (hasGraph && !j['@graph'] && !Array.isArray(j) && typesOf(j).includes('Organization')) return '';
    return m;
  });
}

/** Favicon / manifest links shared by every renderer. */
export const ICON_LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
].join('');

/* ---------------- IndexNow ---------------- */

export type IndexNowResult = { ok: boolean; status: number; submitted: number; message: string };

/** Submit URLs (same host as site_url) to IndexNow (Bing, Yandex, Seznam, Naver and others share submissions). */
export async function submitIndexNow(site: string, urls: string[]): Promise<IndexNowResult> {
  const host = new URL(site).host;
  const list = [...new Set(urls)].filter((u) => { try { return new URL(u).host === host; } catch { return false; } }).slice(0, 10000);
  if (!list.length) return { ok: false, status: 0, submitted: 0, message: 'No URLs to submit' };
  const body = JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${site}/${INDEXNOW_KEY}.txt`, urlList: list });
  const notes: string[] = [];
  let last: IndexNowResult = { ok: false, status: 0, submitted: 0, message: '' };
  // api.indexnow.org shares with every engine; when it refuses, the engines' own endpoints are tried (each one
  // validates the key file itself), and every answer is kept for the log
  for (const endpoint of INDEXNOW_ENDPOINTS) {
    const name = new URL(endpoint).host;
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body, signal: AbortSignal.timeout(15000) });
      const detail = (await r.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 160);
      const msg = r.status === 200 || r.status === 202 ? 'Accepted' : r.status === 403 ? 'Key not valid or not verified yet' : r.status === 422 ? 'URLs rejected (host mismatch)' : r.status === 429 ? 'Too many requests, try later' : `HTTP ${r.status}`;
      notes.push(`${name}: ${r.status} ${msg}${detail && r.status >= 400 ? ` (${detail})` : ''}`);
      last = { ok: r.status === 200 || r.status === 202, status: r.status, submitted: list.length, message: notes.join(' | ') };
      if (last.ok) return last;
    } catch (e: any) {
      notes.push(`${name}: ${e?.message || 'request failed'}`);
      last = { ...last, message: notes.join(' | ') };
    }
  }
  return last;
}
