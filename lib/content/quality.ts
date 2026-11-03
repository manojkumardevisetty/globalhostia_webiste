// SEO content engine: deterministic quality checks for a drafted article (pure, no imports; tests load it directly).
// Each check is pass / warn / fail. "fail" blocks auto-publish; the owner can still publish after reviewing.

export type CheckStatus = 'pass' | 'warn' | 'fail';
export type Check = { id: string; label: string; status: CheckStatus; detail: string };

export type QualityInput = {
  body: string; // Markdown (no H1: the title is the H1)
  h1: string;
  metaTitle: string;
  metaDescription: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords?: string[];
  track?: string;
  lang?: 'en' | 'ar';
  minWords?: number;
  maxWords?: number;
  /** every internal path that answers 200 (sitemap + blog), without host: "/web-hosting" */
  knownPaths: Iterable<string>;
  /** published / drafted articles to compare against (this article excluded) */
  existing?: { slug: string; title: string; body: string }[];
  /** live catalog prices (numbers) an amount in the text may legitimately quote */
  catalogPrices?: number[];
  site?: string; // https://globalhostia.com
};

/* ------------------------------------------------------------------ text helpers */
export function plainText(md: string) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^\|?\s*:?-{3,}.*$/gm, ' ')
    .replace(/[|*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export const countWords = (md: string) => { const t = plainText(md); return t ? t.split(' ').length : 0; };
const norm = (t: string) => ' ' + String(t || '').toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim() + ' ';
/** Phrase match on normalised words (so "VPS hosting" matches "VPS-hosting" and "vps hosting,"). */
export const hasPhrase = (text: string, phrase: string) => !!phrase.trim() && norm(text).includes(norm(phrase));
const KW_STOP = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'with', 'your', 'how', 'what', 'vs', 'is']);
/** Keyword present: the exact phrase, or every significant word of it (so "spf dkim dmarc" matches "SPF, DKIM and DMARC"). */
export function hasKeyword(text: string, kw: string) {
  if (hasPhrase(text, kw)) return true;
  const need = norm(kw).trim().split(' ').filter((w) => w && !KW_STOP.has(w));
  if (!need.length) return false;
  const st = (w: string) => (w.length > 3 ? w.replace(/s$/, '') : w);
  const have = new Set(norm(text).trim().split(' ').map(st));
  return need.every((w) => have.has(st(w)));
}

export function headings(md: string, level: 2 | 3 = 2) {
  const re = level === 2 ? /^##\s+(.+?)\s*#*\s*$/ : /^###\s+(.+?)\s*#*\s*$/;
  let fence = false;
  const out: string[] = [];
  for (const l of String(md || '').split('\n')) {
    if (/^\s*```/.test(l)) fence = !fence;
    const m = !fence && l.match(re);
    if (m) out.push(m[1].replace(/[*_`]/g, '').trim());
  }
  return out;
}
/** First prose paragraph (not a heading, list, table, quote, image or code). */
export function introParagraph(md: string) {
  return String(md || '').split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !/^(#|!\[|\||>|```|[-*+]\s|\d+\.\s)/.test(x)) || '';
}

/** Markdown links (not images): text + href. */
export function extractLinks(md: string): { text: string; href: string }[] {
  return [...String(md || '').matchAll(/(?<!!)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => ({ text: m[1], href: m[2] }));
}
/** Internal path of a link ("/web-hosting" from "https://globalhostia.com/web-hosting#x"), or null for external/mailto. */
export function internalPath(href: string, site = 'https://globalhostia.com'): string | null {
  const h = String(href || '').trim();
  if (!h || h.startsWith('#') || /^(mailto|tel):/i.test(h)) return null;
  const host = site.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  let path: string;
  if (h.startsWith('/')) path = h;
  else {
    const m = h.match(/^https?:\/\/(?:www\.)?([^/?#]+)(\/[^?#]*)?/i);
    if (!m || m[1].toLowerCase() !== host.toLowerCase()) return null;
    path = m[2] || '/';
  }
  path = path.replace(/[?#].*$/, '');
  return path.length > 1 ? path.replace(/\/+$/, '') : '/';
}
/** Internal links whose path is not a known live page. */
export function brokenInternalLinks(md: string, known: Iterable<string>, site?: string) {
  const set = new Set([...known].map((p) => (p.length > 1 ? p.replace(/\/+$/, '') : p)));
  return extractLinks(md).map((l) => ({ ...l, path: internalPath(l.href, site) })).filter((l) => l.path !== null && !set.has(l.path!)) as { text: string; href: string; path: string }[];
}

/** Official / reference domains the drafts may cite (the owner still verifies each reference). */
export const OFFICIAL_DOMAINS = ['u.ae', 'tax.gov.ae', 'mof.gov.ae', 'tdra.gov.ae', 'aeda.ae', 'nic.ae', 'economy.gov.ae', 'dubaided.gov.ae', 'ded.ae', 'moec.gov.ae',
  'centralbank.ae', 'dubaichamber.com', 'adgm.com', 'difc.ae', 'uaelegislation.gov.ae', 'icann.org', 'iana.org', 'w3.org', 'developer.mozilla.org', 'wordpress.org',
  'developer.wordpress.org', 'web.dev', 'developers.google.com', 'support.google.com', 'learn.microsoft.com', 'rfc-editor.org', 'datatracker.ietf.org', 'letsencrypt.org',
  'cabforum.org', 'owasp.org', 'php.net', 'nginx.org', 'httpd.apache.org', 'dmarc.org', 'm3aawg.org', 'ncsc.gov.uk', 'cisa.gov', 'gdpr.eu', 'europa.eu'];
const officialHost = (href: string) => {
  const m = href.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i);
  if (!m) return false;
  const h = m[1].toLowerCase();
  return OFFICIAL_DOMAINS.some((d) => h === d || h.endsWith('.' + d)) || /\.gov(\.[a-z]{2})?$/.test(h);
};

/* ------------------------------------------------------------------ claims */
/** Hosting brands we never name in our own articles (comparisons use "typical providers"). */
export const COMPETITORS = ['godaddy', 'hostinger', 'namecheap', 'bluehost', 'ionos', 'siteground', 'hostgator', 'dreamhost', 'a2 hosting', 'inmotion', 'hostpapa',
  'kinsta', 'wp engine', 'wpengine', 'cloudways', 'digitalocean', 'linode', 'vultr', 'hetzner', 'ovh', 'contabo', 'greengeeks', 'interserver', 'scala hosting', 'liquid web',
  'domain.com', 'name.com', 'porkbun', 'dynadot', 'squarespace', 'wix', 'shopify hosting', 'etisalat hosting', 'du hosting', 'tasjeel', 'ae servers'];
type Claim = { re: RegExp; label: string; status: CheckStatus };
export const FORBIDDEN: Claim[] = [
  { re: /(^|[^\w&])#\s?1\b|\bnumber[ -]one\b|\bno\.\s?1\b/i, label: '"#1" / "number one" claim', status: 'fail' },
  { re: /\bguarantee(d|s)?\b/i, label: '"guaranteed" (only for terms we actually publish)', status: 'fail' },
  { re: /\bbest in the (world|uae|region|market|industry)\b|\bworld[- ]class\b|\bunbeatable\b|\bcheapest\b/i, label: 'superlative claim ("best in the world", "cheapest", "unbeatable")', status: 'fail' },
  { re: /\b100\s?%\s?(uptime|secure|safe|satisfaction)\b/i, label: '"100% uptime/secure" claim', status: 'fail' },
  { re: /\b(studies|study|research|survey|surveys|a report) (show|shows|found|finds|suggests?|reveal(s|ed)?)\b|\baccording to (a|one|recent) (study|survey|report)\b|\bexperts (say|agree)\b/i, label: 'appeal to an unnamed study/survey/expert', status: 'fail' },
  { re: /\b(trusted by|used by|chosen by|serving)\s+[\d,.]+\s*(k|\+)?\s*(customers|businesses|clients|websites|users)\b|\b\d[\d,.]*\+?\s+(happy|satisfied) (customers|clients)\b/i, label: 'customer-count claim', status: 'fail' },
  { re: /^\s*>\s*["“][^"”]{10,}["”]\s*[-—–]\s*\S+/m, label: 'quote attributed to a person (possible testimonial)', status: 'fail' },
  { re: /\b(always|never) (goes|go) down\b|\bzero downtime\b|\bunlimited\s+(cpu|ram|resources)\b/i, label: 'absolute performance claim', status: 'warn' },
];

/** Sentences with a percentage and no link or official source next to it. */
export function unsourcedPercentages(md: string) {
  const out: string[] = [];
  for (const para of String(md || '').split(/\n\s*\n/)) {
    if (/^\s*(\||```)/.test(para)) continue; // tables and code: config values like "VAT 5%" are checked below
    for (const s of para.split(/(?<=[.!?])\s+/)) {
      if (!/\b\d{1,3}(\.\d+)?\s?%/.test(s)) continue;
      if (/\]\(https?:\/\//.test(s) || /\b5\s?%\s*(UAE\s*)?VAT\b|\bVAT\b[^.]{0,40}\b5\s?%/i.test(s)) continue; // linked, or the published UAE VAT rate
      out.push(s.trim().slice(0, 160));
    }
  }
  return out;
}

/** Money amounts in the text ("$4.99", "AED 25", "25 AED", "USD 10") that are not live catalog prices. */
export function unknownPrices(md: string, catalog: number[] = []) {
  const text = plainText(md);
  const out: string[] = [];
  const re = /(?:\$|US\$|USD\s?|AED\s?|EUR\s?|€|£|GBP\s?|INR\s?|₹)\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s?(?:AED|USD|dirhams?)\b/gi;
  for (const m of text.matchAll(re)) {
    const v = Number(String(m[1] || m[2]).replace(/,/g, ''));
    if (!catalog.some((c) => Math.abs(c - v) < 0.005)) out.push(m[0].trim());
  }
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ readability */
export function readability(md: string, lang: 'en' | 'ar' = 'en') {
  const text = plainText(md.split('\n').filter((l) => !/^\s*\|/.test(l)).join('\n'));
  const sentences = text.split(/(?<=[.!?؟])\s+/).filter((s) => s.split(' ').length >= 3);
  const ws = text.split(' ').filter(Boolean);
  const avg = sentences.length ? ws.length / sentences.length : 0;
  const longShare = sentences.length ? sentences.filter((s) => s.split(' ').length > 30).length / sentences.length : 0;
  let flesch: number | null = null;
  if (lang === 'en' && ws.length && sentences.length) {
    const syl = (w: string) => { const x = w.toLowerCase().replace(/[^a-z]/g, ''); if (x.length <= 3) return 1; const g = x.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g); return Math.max(1, g ? g.length : 1); };
    const s = ws.reduce((a, w) => a + syl(w), 0);
    flesch = Math.round(206.835 - 1.015 * (ws.length / sentences.length) - 84.6 * (s / ws.length));
  }
  return { avgSentence: Math.round(avg * 10) / 10, longShare: Math.round(longShare * 100) / 100, flesch };
}

/* ------------------------------------------------------------------ similarity */
export function shingles(text: string, k = 5) {
  const w = plainText(text).toLowerCase().replace(/[^a-z0-9؀-ۿ ]+/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(' '));
  return out;
}
export function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [s, l] = a.size < b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
export function mostSimilar(body: string, existing: { slug: string; title: string; body: string }[]) {
  const me = shingles(body);
  let best: { slug: string; title: string; score: number } | null = null;
  for (const e of existing) {
    const s = jaccard(me, shingles(e.body));
    if (!best || s > best.score) best = { slug: e.slug, title: e.title, score: Math.round(s * 1000) / 1000 };
  }
  return best;
}

/* ------------------------------------------------------------------ FAQ */
const FAQ_H = /^##\s+(?:FAQ|FAQs|Frequently asked questions|الأسئلة الشائعة|أسئلة شائعة)\s*$/im;
export function faqCount(md: string) {
  const m = String(md || '').match(new RegExp(FAQ_H.source + '([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))', 'im'));
  return m ? (m[1].match(/^###\s+\S/gm) || []).length : 0;
}

/* ------------------------------------------------------------------ the checklist */
const ck = (id: string, label: string, status: CheckStatus, detail = ''): Check => ({ id, label, status, detail });

export function runQualityChecks(q: QualityInput): Check[] {
  const lang = q.lang || 'en';
  const out: Check[] = [];
  const minW = q.minWords ?? 1200, maxW = q.maxWords ?? 2000;
  const wc = countWords(q.body);
  out.push(ck('words', `Length ${minW.toLocaleString('en')}–${maxW.toLocaleString('en')} words`, wc >= minW && wc <= maxW ? 'pass' : wc < minW * 0.6 ? 'fail' : 'warn', `${wc.toLocaleString('en')} words`));

  const mt = q.metaTitle.trim(), md = q.metaDescription.trim();
  out.push(ck('meta-title', 'Meta title ≤ 60 characters', !mt ? 'fail' : mt.length > 60 ? 'fail' : mt.length < 30 ? 'warn' : 'pass', `${mt.length} characters`));
  out.push(ck('meta-desc', 'Meta description ≤ 155 characters', !md ? 'fail' : md.length > 155 ? 'fail' : md.length < 110 ? 'warn' : 'pass', `${md.length} characters`));
  const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(q.slug);
  out.push(ck('slug', 'URL slug is short and clean', !slugOk ? 'fail' : q.slug.length > 75 || q.slug.split('-').length > 9 ? 'warn' : 'pass', `/blog/${q.slug}`));

  const kw = q.primaryKeyword.trim();
  if (lang === 'en') {
    const h2 = headings(q.body, 2);
    const places: [string, boolean][] = [['title', hasKeyword(mt, kw) || hasKeyword(q.h1, kw)], ['H1', hasKeyword(q.h1, kw)], ['intro', hasKeyword(introParagraph(q.body), kw)], ['an H2', h2.some((h) => hasKeyword(h, kw))]];
    const missing = places.filter(([, ok]) => !ok).map(([p]) => p);
    out.push(ck('keyword', 'Primary keyword in title, H1, intro and one H2', !kw ? 'fail' : !missing.length ? 'pass' : missing.length >= 3 ? 'fail' : 'warn', kw ? (missing.length ? `Missing in: ${missing.join(', ')}` : `“${kw}”`) : 'No primary keyword'));
    const sec = (q.secondaryKeywords || []).filter(Boolean);
    if (sec.length) { const used = sec.filter((s) => hasKeyword(q.body, s)).length; out.push(ck('secondary', 'Secondary keywords used', used >= Math.ceil(sec.length / 2) ? 'pass' : 'warn', `${used} of ${sec.length}`)); }
  }

  const h2s = headings(q.body, 2);
  out.push(ck('structure', 'At least 4 H2 sections', h2s.length >= 4 ? 'pass' : h2s.length >= 2 ? 'warn' : 'fail', `${h2s.length} sections`));
  const seen = new Map<string, number>();
  for (const h of [...h2s, ...headings(q.body, 3).map((x) => `h3:${x}`)]) seen.set(h.toLowerCase(), (seen.get(h.toLowerCase()) || 0) + 1);
  const dups = [...seen].filter(([, c]) => c > 1).map(([h]) => h.replace(/^h3:/, ''));
  out.push(ck('dup-headings', 'No duplicate headings', dups.length ? 'fail' : 'pass', dups.length ? dups.slice(0, 3).join(' · ') : ''));

  const r = readability(q.body, lang);
  out.push(ck('readability', 'Readable sentences', r.avgSentence > 26 || r.longShare > 0.25 ? 'warn' : 'pass',
    `${r.avgSentence} words per sentence${r.flesch !== null ? ` · reading ease ${r.flesch}` : ''}`));

  const links = extractLinks(q.body);
  const broken = brokenInternalLinks(q.body, q.knownPaths, q.site);
  const internal = links.filter((l) => internalPath(l.href, q.site) !== null);
  out.push(ck('links-broken', 'Every internal link points to a live page', broken.length ? 'fail' : 'pass', broken.length ? broken.slice(0, 4).map((b) => b.path).join(', ') : `${internal.length} internal links checked`));
  out.push(ck('links-internal', 'At least 3 internal links', internal.length >= 3 ? 'pass' : 'warn', `${internal.length} internal links`));
  const external = links.filter((l) => /^https?:\/\//i.test(l.href) && internalPath(l.href, q.site) === null);
  const unofficial = external.filter((l) => !officialHost(l.href));
  out.push(ck('links-external', 'External references are official sources', unofficial.length ? 'warn' : 'pass',
    unofficial.length ? `Check: ${unofficial.slice(0, 3).map((l) => l.href).join(', ')}` : external.length ? `${external.length} reference${external.length === 1 ? '' : 's'} to verify` : 'No external references'));

  const text = plainText(q.body);
  const low = ` ${text.toLowerCase()} `;
  const comp = COMPETITORS.filter((c) => new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(low));
  out.push(ck('competitors', 'No competitor names', comp.length ? 'fail' : 'pass', comp.join(', ')));
  for (const f of FORBIDDEN) {
    const m = q.body.match(f.re) || `${q.h1}\n${mt}\n${md}`.match(f.re);
    if (m) out.push(ck(`claim-${FORBIDDEN.indexOf(f)}`, `No ${f.label}`, f.status, `“${m[0].trim().slice(0, 80)}”`));
  }
  if (!FORBIDDEN.some((f) => f.re.test(q.body) || f.re.test(`${q.h1}\n${mt}\n${md}`))) out.push(ck('claims', 'No forbidden claims (#1, guaranteed, superlatives, unnamed studies)', 'pass'));
  const pct = unsourcedPercentages(q.body);
  out.push(ck('percentages', 'Percentages have a source', pct.length ? 'warn' : 'pass', pct.length ? pct[0] : ''));
  const prices = unknownPrices(q.body, q.catalogPrices);
  out.push(ck('prices', 'No prices outside the live catalog', prices.length ? 'fail' : 'pass', prices.length ? `${prices.slice(0, 4).join(', ')} (prices are shown live in the plan block)` : ''));

  if (q.track === 'uae' && /\b(vat|tax|law|legal|licen[cs]e|regulat|data protection|pdpl|tdra|ministry|fta)\b|ضريب|قانون|ترخيص/i.test(text)) {
    const caveat = /(check|confirm|verify|consult|speak|talk)\b[^.]{0,80}\b(accountant|tax (adviser|advisor|agent)|authority|fta|ministry|lawyer|legal adviser|official)|راجع|استشر|تحقق/i.test(text);
    out.push(ck('uae-caveat', 'UAE legal/tax statements suggest checking with the authority or an accountant', caveat ? 'pass' : 'warn', caveat ? '' : 'Add a line such as "check the current rules with the FTA or your accountant"'));
  }

  const faqs = faqCount(q.body);
  out.push(ck('faq', 'FAQ section with 4–6 questions', faqs >= 4 && faqs <= 6 ? 'pass' : faqs ? 'warn' : 'warn', `${faqs} questions`));

  if (q.existing?.length) {
    const sim = mostSimilar(q.body, q.existing);
    out.push(ck('similarity', 'Not a near-duplicate of an existing article', !sim || sim.score < 0.2 ? 'pass' : sim.score < 0.45 ? 'warn' : 'fail',
      sim ? `Closest: /blog/${sim.slug} (${Math.round(sim.score * 100)}% overlap)` : ''));
  }
  return out;
}

export function summarize(checks: { status: CheckStatus | string }[]) {
  const s = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) if (c.status in s) s[c.status as CheckStatus]++;
  return s;
}
