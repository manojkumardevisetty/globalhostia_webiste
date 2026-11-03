// Agent shopping helpers shared by MCP, /ask (NLWeb), A2A and WebMCP: plan recommendation, comparison and cart links.
// Rules-based (no LLM). Prices only come from AgentData (synced from WHMCS); nothing is estimated.
import 'server-only';
import { searchProducts, priceText, domainCartLink, type AgentData, type AgentProduct } from './catalog';
import { validDomain } from './domain';

/** Need keywords -> product family (lib/theme/sitelinks.ts FAMILY_IDS). First match wins, so specific families come first. */
const FAMILY_HINTS: [string, RegExp][] = [
  ['forex', /\b(forex|mt4|mt5|metatrader|expert advisor|trading bot|trading)\b/],
  ['rdp', /\b(rdp|remote desktop)\b/],
  ['ai', /\b(ai|llm|gpu|ollama|machine learning|ml|inference|model hosting)\b/],
  ['automation', /\b(n8n|automation|workflow|zapier)\b/],
  ['wp', /\b(wordpress|woocommerce|wp|blog)\b/],
  ['reseller', /\b(reseller|resell|agency|whm|clients? sites?)\b/],
  ['dedicated', /\b(dedicated|bare ?metal|high traffic|enterprise server)\b/],
  ['vps', /\b(vps|virtual private|cloud server|cloud|docker|node(js)?|python|app server|api|root access|game server|minecraft|linux server|windows server)\b/],
  ['ssl', /\b(ssl|tls|https|certificate)\b/],
  ['email', /\b(email|e-mail|mailbox|workspace|mail)\b/],
  ['shared', /\b(website|web ?site|hosting|shared|cpanel|portfolio|landing page|small business|static site|php)\b/],
];

const FALLBACK: Record<string, string[]> = {
  wp: ['shared', 'vps'], reseller: ['shared'], shared: ['wp', 'vps'], forex: ['rdp', 'vps'], rdp: ['vps', 'forex'], automation: ['vps', 'ai'],
  ai: ['dedicated', 'vps'], vps: ['dedicated', 'rdp'], dedicated: ['vps'],
};
/** Families that are add-ons rather than hosting: never offered as a fallback for a hosting need. */
const ADDONS = new Set(['ssl', 'email', 'domain', 'tools', 'other']);

export function familyFor(need: string): string | null {
  const t = need.toLowerCase();
  for (const [f, re] of FAMILY_HINTS) if (re.test(t)) return f;
  return null;
}

const gb = (v: string | undefined) => {
  const m = String(v || '').match(/([\d.]+)\s*(tb|gb|mb)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 'tb' ? n * 1024 : m[2].toLowerCase() === 'mb' ? n / 1024 : n;
};
const perMonth = (p: AgentProduct) => (p.from ? p.from.perMonth ?? p.from.price : Infinity);

export type RecommendOpts = { need: string; budget?: number; location?: string; os?: string; minRamGb?: number; websites?: number; limit?: number };

export function recommend(d: AgentData, o: RecommendOpts) {
  const fam = familyFor(o.need);
  const famOf = new Map(d.cat.products.map((p) => [p.slug, p.type]));
  let pool = d.products.filter((p) => p.from && p.availability !== 'out_of_stock');
  if (fam) {
    // nearest family that has plans: a WordPress need falls back to shared hosting, forex to RDP/VPS, and so on
    const chain = [fam, ...(FALLBACK[fam] || [])];
    const hit = chain.map((f) => pool.filter((p) => famOf.get(p.slug) === f)).find((x) => x.length);
    pool = hit || pool.filter((p) => !ADDONS.has(famOf.get(p.slug) || ''));
  }
  const loc = o.location?.trim().toLowerCase();
  if (loc) pool = pool.filter((p) => `${p.location || ''} ${p.name}`.toLowerCase().includes(loc));
  const os = o.os?.trim().toLowerCase();
  if (os) pool = pool.filter((p) => `${p.name} ${p.specs.os || ''} ${p.features.join(' ')}`.toLowerCase().includes(os));
  if (o.minRamGb) pool = pool.filter((p) => (gb(p.specs.ram) ?? 0) >= o.minRamGb!);
  if (o.websites) pool = pool.filter((p) => { const w = p.specs.websites; if (!w) return true; if (/unlimited/i.test(w)) return true; const n = parseInt(w, 10); return !Number.isFinite(n) || n >= o.websites!; });
  const overBudget = o.budget !== undefined ? pool.filter((p) => perMonth(p) > o.budget!) : [];
  if (o.budget !== undefined) pool = pool.filter((p) => perMonth(p) <= o.budget!);
  // rank by text relevance to the need (same scorer as search_products), then by price
  const ranked = searchProducts({ ...d, products: pool }, { query: o.need, limit: 100 });
  const rest = pool.filter((p) => !ranked.includes(p)).sort((a, b) => perMonth(a) - perMonth(b));
  const picks = [...ranked, ...rest].slice(0, Math.min(Math.max(o.limit || 3, 1), 10));
  const cheapest = [...picks].sort((a, b) => perMonth(a) - perMonth(b))[0];
  return {
    need: o.need, family: fam, currency: d.currency,
    recommendations: picks.map((p, i) => ({
      rank: i + 1, slug: p.slug, name: p.name, category: p.category?.name || null, priceText: priceText(p),
      from: p.from ? { ...p.from, currency: p.currency } : null, specs: p.specs, location: p.location,
      why: [
        !fam ? '' : famOf.get(p.slug) === fam ? `matches "${fam}" plans` : `closest available: ${famOf.get(p.slug)} plan`,
        p === cheapest ? 'lowest price of these picks' : '',
        o.location && p.location ? `hosted in ${p.location}` : '',
        o.minRamGb && p.specs.ram ? `${p.specs.ram} RAM` : '',
      ].filter(Boolean),
      url: p.url, orderUrl: p.orderUrl,
    })),
    note: picks.length ? undefined : overBudget.length ? `No plan fits the budget; the cheapest match costs ${priceText(overBudget.sort((a, b) => perMonth(a) - perMonth(b))[0])}.` : 'No plan matched; try a broader need or list_categories.',
  };
}

export function compare(d: AgentData, slugs: string[]) {
  const found = slugs.map((s) => d.products.find((p) => p.slug === s)).filter(Boolean) as AgentProduct[];
  const missing = slugs.filter((s) => !found.some((p) => p.slug === s));
  const specKeys = [...new Set(found.flatMap((p) => Object.keys(p.specs)))];
  const cycles = [...new Set(found.flatMap((p) => p.prices.map((c) => c.cycle)))];
  return {
    currency: d.currency, missing,
    plans: found.map((p) => ({ slug: p.slug, name: p.name, category: p.category?.name || null, location: p.location, availability: p.availability, url: p.url })),
    specs: Object.fromEntries(specKeys.map((k) => [k, Object.fromEntries(found.map((p) => [p.slug, p.specs[k] ?? null]))])),
    prices: Object.fromEntries(cycles.map((c) => [c, Object.fromEntries(found.map((p) => { const x = p.prices.find((y) => y.cycle === c); return [p.slug, x ? { price: x.price, setupFee: x.setupFee, perMonth: x.perMonth } : null]; }))])),
    features: Object.fromEntries(found.map((p) => [p.slug, p.features.slice(0, 20)])),
  };
}

/** Cart deep link: plan + billing cycle + currency, optionally with a domain (WHMCS sld/tld params). */
export function cartLinkFor(d: AgentData, slug: string, cycle: string, domain?: string) {
  const p = d.products.find((x) => x.slug === slug);
  if (!p) return { ok: false as const, error: 'not_found', message: `No product with slug "${slug}".` };
  const c = p.prices.find((x) => x.cycle === cycle);
  if (!c) return { ok: false as const, error: 'cycle_unavailable', message: `${p.name} is not offered ${cycle} in ${d.currency}. Available: ${p.prices.map((x) => x.cycle).join(', ') || 'none (price on request)'}.`, available: p.prices.map((x) => x.cycle), productUrl: p.url };
  let url = c.orderUrl;
  let dom: string | null = null;
  if (domain) {
    dom = validDomain(domain);
    if (!dom) return { ok: false as const, error: 'invalid_domain', message: 'Give a full domain such as example.com.' };
    const i = dom.indexOf('.');
    if (/\/cart\.php\?/.test(url)) url += `&sld=${encodeURIComponent(dom.slice(0, i))}&tld=${encodeURIComponent(dom.slice(i))}`;
  }
  return {
    ok: true as const, slug: p.slug, name: p.name, billingCycle: c.cycle, cycleLabel: c.label, price: c.price, setupFee: c.setupFee, currency: c.currency,
    domain: dom, cartUrl: url, domainOnlyCartUrl: dom ? domainCartLink(d.cat, dom, d.currency) : undefined, productUrl: p.url, configurable: p.configurable,
    note: 'The customer reviews options, signs in and pays on the GlobalHostia client area. Taxes, if any, are shown at checkout.',
  };
}
