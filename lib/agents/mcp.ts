// Public, read-only MCP server (Streamable HTTP, JSON responses, stateless). JSON-RPC 2.0.
// Spec: https://modelcontextprotocol.io/specification/2025-11-25 (initialize handshake, the most widely deployed revision),
// plus the stateless 2026-07-28 revision: server/discover, per-request MCP-Protocol-Version, ttlMs on list results.
// No session state is kept, so both styles work against the same endpoint.
import 'server-only';
import { agentData, agentTlds, searchProducts, pickCurrency, priceText, type AgentProduct } from './catalog';
import { checkDomain } from './domain';
import { recommend, compare, cartLinkFor } from './shop';
import { policies } from './policies';
import { ask } from './ask';
import { buildLlms } from './llms';

export const MCP_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
/** Version answered to an initialize request for a version we do not know (newest handshake-based revision). */
export const MCP_LATEST = '2025-11-25';
export const MCP_NEWEST = MCP_VERSIONS[0];
export const SERVER_INFO = {
  name: 'globalhostia', title: 'GlobalHostia store', version: '1.1.0', websiteUrl: 'https://globalhostia.com/ai',
  description: 'Hosting, VPS, dedicated servers, SSL, email and domains from GlobalHostia (Dubai, UAE): live prices, domain checks and cart links.',
  icons: [{ src: 'https://globalhostia.com/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] }, { src: 'https://globalhostia.com/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] }],
};
/** How long clients may cache tools/resources/prompts lists (2026-07-28 ttlMs). */
export const LIST_TTL_MS = 3_600_000;

export const INSTRUCTIONS = 'Read-only shopping server for GlobalHostia, a hosting company in Dubai, UAE: shared and WordPress hosting, reseller hosting, VPS and cloud servers, dedicated servers, RDP and forex VPS, SSL certificates, business email and domain names. '
  + 'Start with recommend_plan when the user describes a need ("a WordPress site", "Windows VPS for MT5 under $20"), search_products for keyword search, list_categories to browse, get_product for every billing cycle and spec, compare_plans to put 2 to 5 plans side by side, '
  + 'check_domain for live availability and price of one domain, build_cart_link for a ready-to-pay cart link (plan, billing cycle, currency and optional domain), and get_policies for refunds, VAT/taxes, renewals and cancellation. '
  + 'Prices are synced from the billing system (WHMCS): never quote a price these tools did not return, and say that any taxes are shown at checkout. The customer signs in and pays on the GlobalHostia client area; this server cannot place orders or see accounts.';

const CYCLES = ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially', 'onetime', 'free'];
const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const CUR = { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO 4217 currency code, e.g. USD or AED. Defaults to USD. An unsupported code returns an error listing the valid ones.' };
const SLUG = { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,120}$', description: 'Product slug as returned by search_products, recommend_plan or list_categories.' };
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });

export const TOOLS = [
  {
    name: 'recommend_plan', title: 'Recommend a hosting plan',
    description: 'Best first call when the user describes what they need in words. Picks up to 10 live GlobalHostia plans that fit a need (e.g. "WordPress blog", "Windows VPS for MT5", "n8n automation", "reseller hosting for 20 clients", "dedicated server in Germany"), with an optional monthly budget, location, OS, minimum RAM and number of websites. Returns ranked plans with the reason for each, live price, specs and cart link.',
    inputSchema: schema({
      need: { type: 'string', minLength: 2, maxLength: 300, description: 'What the customer wants to run or host, in plain words.' },
      budget_monthly: { type: 'number', minimum: 0, description: 'Maximum monthly-equivalent price in the chosen currency.' },
      currency: CUR,
      location: { type: 'string', maxLength: 60, description: 'Preferred datacenter location, e.g. USA, Germany, Singapore.' },
      os: { type: 'string', maxLength: 40, description: 'Operating system preference, e.g. Windows, Ubuntu, Linux.' },
      min_ram_gb: { type: 'number', minimum: 0, maximum: 4096, description: 'Minimum RAM in GB (servers).' },
      websites: { type: 'integer', minimum: 1, maximum: 10000, description: 'Number of websites to host (shared, WordPress, reseller).' },
      limit: { type: 'integer', minimum: 1, maximum: 10, description: 'How many plans to return (default 3).' },
    }, ['need']),
    annotations: { title: 'Recommend a hosting plan', ...ro },
  },
  {
    name: 'search_products', title: 'Search hosting products',
    description: 'Keyword search over every GlobalHostia hosting, server, SSL and email plan, with filters for category, location and maximum monthly price. Returns matching plans with key specs, location, cheapest live price, product page and cart link. Prefer recommend_plan when the user describes a need rather than keywords.',
    inputSchema: schema({
      query: { type: 'string', maxLength: 200, description: 'Free text, e.g. "windows vps 8gb ram", "wordpress", "dedicated server usa". Leave empty to browse a category.' },
      category: { type: 'string', maxLength: 80, description: 'Category slug or name from list_categories.' },
      max_price: { type: 'number', minimum: 0, description: 'Maximum monthly-equivalent price in the chosen currency.' },
      currency: CUR,
      location: { type: 'string', maxLength: 60, description: 'Datacenter location, e.g. USA, Germany, Singapore.' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum results (default 10).' },
    }),
    annotations: { title: 'Search hosting products', ...ro },
  },
  {
    name: 'get_product', title: 'Get product details',
    description: 'Everything about one plan by slug: description, specs, included and excluded features, location, availability, and every billing cycle with its price, setup fee, monthly equivalent and cart link.',
    inputSchema: schema({ slug: SLUG, currency: CUR }, ['slug']),
    annotations: { title: 'Get product details', ...ro },
  },
  {
    name: 'compare_plans', title: 'Compare plans side by side',
    description: 'Side-by-side comparison of 2 to 5 plans by slug: specs, price for every billing cycle (with setup fee and monthly equivalent), location and top features. Use after search_products or recommend_plan when the user is choosing between options.',
    inputSchema: schema({ slugs: { type: 'array', minItems: 2, maxItems: 5, uniqueItems: true, items: SLUG, description: 'Product slugs to compare.' }, currency: CUR }, ['slugs']),
    annotations: { title: 'Compare plans side by side', ...ro },
  },
  {
    name: 'list_categories', title: 'List product categories',
    description: 'Every product category with a one-line summary, number of plans, starting price and page link, plus all datacenter locations and supported currencies. Good for browsing or when a search returns nothing.',
    inputSchema: schema({ currency: CUR }),
    annotations: { title: 'List product categories', ...ro },
  },
  {
    name: 'check_domain', title: 'Check domain availability',
    description: 'Live registry check of one domain name (e.g. mybrand.com, mybrand.ae): whether it is available, first-year registration price, renewal and transfer price, and an add-to-cart link. If taken, returns a link to the domain broker service. Limited to 10 checks per minute.',
    inputSchema: schema({ domain: { type: 'string', minLength: 3, maxLength: 253, description: 'Full domain, e.g. mybrand.com' }, currency: CUR }, ['domain']),
    annotations: { title: 'Check domain availability', ...ro, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'build_cart_link', title: 'Build a cart link',
    description: 'Ready-to-pay cart deep link for one plan with the billing cycle and currency preselected, optionally attaching a domain to the hosting order. Returns the exact price and setup fee for that cycle. Give the link to the customer to finish checkout. To register a new domain, use the link from check_domain (domainOnlyCartUrl is also returned).',
    inputSchema: schema({
      slug: SLUG,
      billing_cycle: { type: 'string', enum: CYCLES, description: 'Billing cycle; must be one the plan offers (see get_product). Defaults to monthly when offered, else the shortest cycle.' },
      currency: CUR,
      domain: { type: 'string', maxLength: 253, description: 'Optional domain to use with the hosting plan, e.g. mybrand.com.' },
    }, ['slug']),
    annotations: { title: 'Build a cart link', ...ro },
  },
  {
    name: 'get_policies', title: 'Get refund, tax and renewal policies',
    description: 'GlobalHostia customer policies summarised from the published Terms & Conditions: money-back guarantee, domain and SSL refunds, cancellation, automatic renewal and price changes, billing, taxes and VAT, domain expiry and data retention, with the source link. Use before answering any refund, VAT or renewal question.',
    inputSchema: schema({ topic: { type: 'string', enum: ['all', 'refunds', 'renewal', 'taxes', 'cancellation', 'domains'], description: 'Optional filter (default all).' } }),
    annotations: { title: 'Get refund, tax and renewal policies', ...ro },
  },
  {
    name: 'ask', title: 'Ask the store',
    description: 'NLWeb-style question answering over the GlobalHostia site: a natural-language question returns ranked results (plans, domain prices, policies), each with a schema.org object. Use when no more specific tool fits.',
    inputSchema: schema({ query: { type: 'string', minLength: 2, maxLength: 300, description: 'The question, e.g. "cheapest VPS in Singapore" or "do you refund domains?"' }, currency: CUR }, ['query']),
    annotations: { title: 'Ask the store', ...ro },
  },
  {
    name: 'get_order_link', title: 'Get order link (legacy)',
    description: 'Same as build_cart_link without a domain; kept for existing clients.',
    inputSchema: schema({ slug: SLUG, billing_cycle: { type: 'string', enum: CYCLES, description: 'Billing cycle the plan offers.' }, currency: CUR }, ['slug', 'billing_cycle']),
    annotations: { title: 'Get order link (legacy)', ...ro },
  },
] as const;

export const RESOURCES = [
  { uri: 'globalhostia://catalog/categories', name: 'categories', title: 'Product categories', description: 'All categories with plan counts, starting prices (USD), locations and currencies.', mimeType: 'application/json' },
  { uri: 'globalhostia://domains/tlds', name: 'tlds', title: 'Domain extension prices', description: 'Register, renew and transfer prices per year for every extension sold (USD).', mimeType: 'application/json' },
  { uri: 'globalhostia://policies', name: 'policies', title: 'Customer policies', description: 'Refunds, renewals, taxes and VAT, cancellation and data retention, from the Terms & Conditions.', mimeType: 'application/json' },
  { uri: 'globalhostia://llms-full.txt', name: 'llms-full', title: 'Full catalog for language models', description: 'Every plan with all billing cycles, setup fees and features, as Markdown.', mimeType: 'text/markdown' },
];
export const RESOURCE_TEMPLATES = [
  { uriTemplate: 'globalhostia://products/{slug}', name: 'product', title: 'Product by slug', description: 'One plan with specs and every billing cycle price (USD).', mimeType: 'application/json' },
];
export const PROMPTS = [
  { name: 'find_hosting', title: 'Find the right hosting plan', description: 'Guided plan recommendation for a described need and budget.',
    arguments: [{ name: 'need', description: 'What to host, e.g. "WooCommerce shop"', required: true }, { name: 'budget', description: 'Monthly budget, e.g. "20 USD"', required: false }] },
  { name: 'register_domain', title: 'Register a domain', description: 'Check a domain, suggest alternatives if it is taken, and give the cart link.',
    arguments: [{ name: 'domain', description: 'Domain to check, e.g. mybrand.ae', required: true }] },
  { name: 'compare_hosting', title: 'Compare plans', description: 'Compare plans and explain the trade-offs, including renewal prices and policies.',
    arguments: [{ name: 'plans', description: 'Comma-separated plan names or slugs', required: true }] },
];

export class RpcError extends Error { constructor(public code: number, message: string, public data?: unknown) { super(message); } }

type Args = Record<string, unknown>;
const str = (a: Args, k: string, max: number, required = false) => {
  const v = a[k];
  if (v === undefined || v === null || v === '') { if (required) throw new RpcError(-32602, `Missing required argument: ${k}`); return undefined; }
  if (typeof v !== 'string' || v.length > max) throw new RpcError(-32602, `Invalid argument: ${k} must be a string of at most ${max} characters`);
  return v.trim();
};
const numArg = (a: Args, k: string, min: number, max: number) => {
  const v = a[k];
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) throw new RpcError(-32602, `Invalid argument: ${k} must be a number between ${min} and ${max}`);
  return n;
};
const slugArg = (a: Args, k = 'slug') => {
  const s = str(a, k, 121, true)!.toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(s)) throw new RpcError(-32602, `Invalid ${k}`);
  return s;
};

async function dataFor(a: Args) {
  const d = await agentData();
  const want = str(a, 'currency', 3);
  const cur = pickCurrency(want, d.currencies, d.defaultCurrency);
  if (!cur) throw new RpcError(-32602, `Unsupported currency. Use one of: ${d.currencies.join(', ')}`);
  return cur === d.currency ? d : agentData(cur);
}

const brief = (p: AgentProduct) => ({
  slug: p.slug, name: p.name, category: p.category?.name || null, tagline: p.tagline || undefined,
  specs: p.specs, location: p.location, from: p.from ? { ...p.from, currency: p.currency } : null, priceText: priceText(p),
  availability: p.availability, url: p.url, orderUrl: p.orderUrl,
});

function textOf(summary: string, data: unknown) {
  return { content: [{ type: 'text', text: `${summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data as Record<string, unknown> };
}
const fail = (summary: string, data: unknown) => ({ ...textOf(summary, data), isError: true });

const POLICY_TOPICS: Record<string, string[]> = {
  refunds: ['money_back', 'domain_refunds', 'ssl_refunds', 'cancellation'], renewal: ['renewal', 'billing', 'domain_renewal'],
  taxes: ['taxes', 'billing'], cancellation: ['cancellation', 'data_retention', 'money_back'], domains: ['domain_refunds', 'domain_renewal'],
};

export async function callTool(name: string, a: Args, ip: string, domainLimit: (k: string) => number) {
  switch (name) {
    case 'recommend_plan': {
      const d = await dataFor(a);
      const r = recommend(d, {
        need: str(a, 'need', 300, true)!, budget: numArg(a, 'budget_monthly', 0, 1e7), location: str(a, 'location', 60), os: str(a, 'os', 40),
        minRamGb: numArg(a, 'min_ram_gb', 0, 4096), websites: numArg(a, 'websites', 1, 10000), limit: numArg(a, 'limit', 1, 10),
      });
      return textOf(r.recommendations.length
        ? `Top ${r.recommendations.length} plan(s) for "${r.need}" (prices in ${d.currency}): ${r.recommendations.map((x) => `${x.name} ${x.priceText}`).join('; ')}.`
        : r.note || 'No plan matched.', r);
    }
    case 'search_products': {
      const d = await dataFor(a);
      const query = str(a, 'query', 200), category = str(a, 'category', 80), location = str(a, 'location', 60);
      const maxPrice = numArg(a, 'max_price', 0, 1e7), limit = numArg(a, 'limit', 1, 50) ?? 10;
      const items = searchProducts(d, { query, category, location, maxPrice, limit: Math.floor(limit) });
      const out = { currency: d.currency, count: items.length, results: items.map(brief) };
      return textOf(items.length ? `${items.length} plan(s) found. Prices in ${d.currency}.` : 'No plans matched. Try a broader query, recommend_plan or list_categories.', out);
    }
    case 'get_product': {
      const slug = slugArg(a);
      const d = await dataFor(a);
      const p = d.products.find((x) => x.slug === slug);
      if (!p) return fail(`No product with slug "${slug}". Use search_products to find slugs.`, { error: 'not_found', slug });
      return textOf(`${p.name}: ${priceText(p)}. Page: ${p.url}`, { product: p });
    }
    case 'compare_plans': {
      const raw = a.slugs;
      if (!Array.isArray(raw) || raw.length < 2 || raw.length > 5) throw new RpcError(-32602, 'slugs must be an array of 2 to 5 product slugs');
      const slugs = [...new Set(raw.map((x) => String(x).toLowerCase().trim()))];
      if (!slugs.every((x) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(x))) throw new RpcError(-32602, 'Invalid slug in slugs');
      const d = await dataFor(a);
      const c = compare(d, slugs);
      if (c.plans.length < 2) return fail(`Need at least two known plans; not found: ${c.missing.join(', ')}.`, c);
      return textOf(`Comparing ${c.plans.map((p) => p.name).join(' vs ')} (prices in ${d.currency}).`, c);
    }
    case 'list_categories': {
      const d = await dataFor(a);
      const out = { currency: d.currency, currencies: d.currencies, locations: d.locations, categories: d.categories, domains: { page: `${d.site}/domains-registration`, tldCount: agentTlds(d).length } };
      return textOf(`${d.categories.length} categories. Prices in ${d.currency}.`, out);
    }
    case 'check_domain': {
      const domain = str(a, 'domain', 253, true);
      const wait = domainLimit(ip);
      if (wait) return fail(`Rate limit reached; try again in ${wait}s.`, { error: 'rate_limited', retryAfter: wait });
      const r = await checkDomain(domain, str(a, 'currency', 3));
      if (!r.ok) { const { ok: _o, status: _s, ...body } = r; return fail(r.message, body); }
      const { ok: _o, ...body } = r;
      const broker = r.available ? '' : `${(await dataFor(a)).site}/domain-broker?domain=${encodeURIComponent(r.domain)}`;
      return textOf(r.available
        ? `${r.domain} is available. Registration ${r.register !== null ? `${r.register.toFixed(2)} ${r.currency} for the first year` : 'price shown in cart'}${r.renew !== null ? `, renews at ${r.renew.toFixed(2)} ${r.currency}/year` : ''}. Add to cart: ${r.addToCartUrl}`
        : `${r.domain} is already registered. Taken? Request our broker: ${broker}`,
        r.available ? body : { ...body, request_domain_broker: broker });
    }
    case 'build_cart_link':
    case 'get_order_link': {
      const slug = slugArg(a);
      const d = await dataFor(a);
      let cycle = str(a, 'billing_cycle', 20, name === 'get_order_link')?.toLowerCase();
      if (cycle && !CYCLES.includes(cycle)) throw new RpcError(-32602, `billing_cycle must be one of ${CYCLES.join(', ')}`);
      if (!cycle) { const p = d.products.find((x) => x.slug === slug); cycle = p?.prices.find((x) => x.cycle === 'monthly')?.cycle || p?.prices[0]?.cycle || 'monthly'; }
      const r = cartLinkFor(d, slug, cycle, name === 'build_cart_link' ? str(a, 'domain', 253) : undefined);
      if (!r.ok) return fail(r.message, r);
      const out = name === 'get_order_link'
        ? { slug: r.slug, name: r.name, billingCycle: r.billingCycle, price: r.price, setupFee: r.setupFee, currency: r.currency, orderUrl: r.cartUrl, productUrl: r.productUrl, configurable: r.configurable }
        : r;
      return textOf(`Order ${r.name} (${r.cycleLabel}, ${r.price.toFixed(2)} ${r.currency}${r.setupFee ? ` + ${r.setupFee.toFixed(2)} setup` : ''}${r.domain ? `, domain ${r.domain}` : ''}): ${r.cartUrl}`, out);
    }
    case 'get_policies': {
      const d = await agentData();
      const topic = str(a, 'topic', 20) || 'all';
      const all = policies(d.cat.settings, d.site, d.cat.base);
      const keep = POLICY_TOPICS[topic];
      const out = { ...all, policies: keep ? all.policies.filter((p) => keep.includes(p.id)) : all.policies };
      return textOf(`${out.policies.map((p) => `${p.title}: ${p.summary}`).join('\n')}\nSource: ${all.source}`, out);
    }
    case 'ask': {
      const query = str(a, 'query', 300, true)!;
      const d = await dataFor(a);
      const r = await ask(query, { currency: d.currency, limit: 8 });
      return textOf(r.results.length ? r.results.map((x, i) => `${i + 1}. ${x.name}: ${x.description} (${x.url})`).join('\n') : 'Nothing matched; try recommend_plan or list_categories.', r);
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${name}`);
  }
}

async function readResource(uri: string) {
  const json = (data: unknown) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] });
  if (uri === 'globalhostia://llms-full.txt') return { contents: [{ uri, mimeType: 'text/markdown', text: await buildLlms(true) }] };
  const d = await agentData('USD');
  if (uri === 'globalhostia://catalog/categories') return json({ currency: d.currency, currencies: d.currencies, locations: d.locations, categories: d.categories });
  if (uri === 'globalhostia://domains/tlds') return json({ currency: d.currency, tlds: agentTlds(d) });
  if (uri === 'globalhostia://policies') return json(policies(d.cat.settings, d.site, d.cat.base));
  const m = uri.match(/^globalhostia:\/\/products\/([a-z0-9][a-z0-9-]{0,120})$/);
  if (m) {
    const p = d.products.find((x) => x.slug === m[1]);
    if (p) return json(p);
  }
  throw new RpcError(-32002, 'Resource not found', { uri });
}

function getPrompt(name: string, args: Record<string, string>) {
  const msg = (text: string) => ({ messages: [{ role: 'user', content: { type: 'text', text } }] });
  const need = (k: string) => { const v = String(args[k] || '').trim().slice(0, 300); if (!v) throw new RpcError(-32602, `Missing required argument: ${k}`); return v; };
  switch (name) {
    case 'find_hosting': return { description: 'Find the right GlobalHostia plan', ...msg(`I need hosting for: ${need('need')}.${args.budget ? ` My budget is ${String(args.budget).slice(0, 40)} per month.` : ''} Use recommend_plan (and compare_plans if there are close options) to suggest up to three GlobalHostia plans. For each, give the live price per month and the renewal terms from get_policies, explain why it fits, and finish with a build_cart_link link for the best one. Quote only prices the tools return.`) };
    case 'register_domain': return { description: 'Register a domain at GlobalHostia', ...msg(`Check whether ${need('domain')} is available with check_domain. If it is, give the first-year and renewal price and the add-to-cart link. If it is taken, suggest up to five close alternatives on extensions GlobalHostia sells (check each one) and mention the domain broker link.`) };
    case 'compare_hosting': return { description: 'Compare GlobalHostia plans', ...msg(`Compare these GlobalHostia plans: ${need('plans')}. Find their slugs with search_products if needed, then call compare_plans. Summarise specs, monthly and yearly prices (including setup fees) and who each plan suits, and include the refund and renewal points from get_policies.`) };
    default: throw new RpcError(-32602, `Unknown prompt: ${name}`);
  }
}

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const capabilities = { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false }, prompts: { listChanged: false } };

/** 2026-07-28 server/discover (also useful to any client as a one-call summary). */
export const discover = () => ({
  supportedVersions: MCP_VERSIONS, protocolVersion: MCP_NEWEST, capabilities, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS,
  ttlMs: LIST_TTL_MS, cacheScope: 'public',
});

/** Handle one JSON-RPC message. Returns null for notifications. */
export async function handleMessage(m: Msg, ip: string, domainLimit: (k: string) => number) {
  const isReq = m && typeof m === 'object' && 'id' in m && m.id !== null && m.id !== undefined;
  const id = isReq ? m.id! : null;
  try {
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') throw new RpcError(-32600, 'Invalid Request');
    if (!isReq) return null; // notifications (initialized, cancelled, …) need no reply
    const p = m.params && typeof m.params === 'object' ? m.params : {};
    const list = (key: string, items: unknown) => ({ jsonrpc: '2.0', id, result: { [key]: items, ttlMs: LIST_TTL_MS, cacheScope: 'public' } });
    switch (m.method) {
      case 'initialize': {
        const want = String(p.protocolVersion || '');
        return { jsonrpc: '2.0', id, result: {
          protocolVersion: MCP_VERSIONS.includes(want) ? want : MCP_LATEST,
          capabilities, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS,
        } };
      }
      case 'server/discover': return { jsonrpc: '2.0', id, result: discover() };
      case 'ping': return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list': return list('tools', TOOLS);
      case 'resources/list': return list('resources', RESOURCES);
      case 'resources/templates/list': return list('resourceTemplates', RESOURCE_TEMPLATES);
      case 'resources/read': {
        if (typeof p.uri !== 'string' || p.uri.length > 300) throw new RpcError(-32602, 'params.uri is required');
        return { jsonrpc: '2.0', id, result: await readResource(p.uri) };
      }
      case 'prompts/list': return list('prompts', PROMPTS);
      case 'prompts/get': {
        if (typeof p.name !== 'string') throw new RpcError(-32602, 'params.name is required');
        const args = p.arguments && typeof p.arguments === 'object' ? p.arguments : {};
        return { jsonrpc: '2.0', id, result: getPrompt(p.name, args) };
      }
      case 'completion/complete': return { jsonrpc: '2.0', id, result: { completion: { values: [], hasMore: false } } };
      case 'tools/call': {
        if (typeof p.name !== 'string') throw new RpcError(-32602, 'params.name is required');
        const args = p.arguments && typeof p.arguments === 'object' && !Array.isArray(p.arguments) ? p.arguments : {};
        try { return { jsonrpc: '2.0', id, result: await callTool(p.name, args, ip, domainLimit) }; }
        catch (e) {
          if (e instanceof RpcError) throw e;
          return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'The store is temporarily unavailable. Try again shortly.' }], isError: true } };
        }
      }
      default: throw new RpcError(-32601, `Method not found: ${m.method}`);
    }
  } catch (e) {
    const err = e instanceof RpcError ? e : new RpcError(-32603, 'Internal error');
    return { jsonrpc: '2.0', id, error: { code: err.code, message: err.message, ...(err.data !== undefined ? { data: err.data } : {}) } };
  }
}
