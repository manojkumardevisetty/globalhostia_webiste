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
  const cat = title.replace(/\s*\(page \d+\)$/i, '').replace(/\s+articles$/i, '').trim();
  const topic = !cat || /^blog$/i.test(cat) ? 'web hosting, VPS, servers, domains and email' : cat.toLowerCase().replace(/\s+guides?$/, '') || 'web hosting';
  return fitDescription(t, [
    `Practical guides, tutorials and tips on ${topic} for site owners and developers, written by the engineers who run GlobalHostia.`,
    `Practical guides, tutorials and tips on ${topic}, written by the engineers who run GlobalHostia.`,
    'Step-by-step tutorials and tips for site owners and developers.',
    'Tutorials and tips for site owners and developers.',
    `Practical guides and tips on ${topic} from our engineers.`,
    'Guides and tips from the GlobalHostia engineers.',
  ]);
}

export const DEFAULT_DESCRIPTION = 'NVMe web hosting, cloud VPS and dedicated servers in Dubai, Europe, the USA and Asia, with free SSL, daily backups and 24/7 support.';
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

/** Dynamic Open Graph image URL for a page. */
export function ogImageUrl(site: string, title: string, kicker?: string, v?: string) {
  const q = new URLSearchParams({ title: title.slice(0, 90) });
  if (kicker) q.set('kicker', kicker.slice(0, 40));
  if (v) q.set('v', v);
  return `${site}/og?${q.toString()}`;
}

const json = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

/** Organization + WebSite graph, emitted on every public page. */
export function siteJsonLd(s: Partial<Settings>, whmcsBase: string) {
  const site = siteUrl(s);
  const name = 'GlobalHostia';
  const alt = String(s.site_name || '').trim();
  const phone = String(s.phone || DEFAULT_PHONE).trim();
  const email = String(s.email || DEFAULT_EMAIL).trim();
  const links = sameAs(s);
  const base = String(whmcsBase || '').replace(/\/$/, '');
  const org = {
    '@type': 'Organization', '@id': `${site}/#organization`, name, ...(alt && alt !== name ? { alternateName: alt } : {}),
    url: `${site}/`, ...(s.company ? { legalName: String(s.company) } : {}),
    logo: { '@type': 'ImageObject', url: `${site}/icon-512.png`, width: 512, height: 512 },
    image: `${site}/og/default.png`,
    email, telephone: phone,
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', telephone: phone, email, areaServed: 'Worldwide', availableLanguage: ['English'] },
      { '@type': 'ContactPoint', contactType: 'sales', telephone: phone, email, areaServed: 'Worldwide', availableLanguage: ['English'] }],
    // the site footer states the company is in Dubai, UAE
    address: { '@type': 'PostalAddress', addressLocality: 'Dubai', addressCountry: 'AE' },
    ...(links.length ? { sameAs: links } : {}),
  };
  const website: Record<string, unknown> = {
    '@type': 'WebSite', '@id': `${site}/#website`, name, ...(alt && alt !== name ? { alternateName: alt } : {}), url: `${site}/`, inLanguage: 'en',
    publisher: { '@id': `${site}/#organization` },
  };
  if (/^https:\/\//.test(base)) {
    website.potentialAction = { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${base}/cart.php?a=add&domain=register&query={search_term_string}` }, 'query-input': 'required name=search_term_string' };
  }
  return json({ '@context': 'https://schema.org', '@graph': [org, website] });
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
