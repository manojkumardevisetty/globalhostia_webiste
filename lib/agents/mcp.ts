// Public, read-only MCP server (Streamable HTTP, JSON responses, stateless). JSON-RPC 2.0.
// Spec: https://modelcontextprotocol.io/specification/2025-06-18
import 'server-only';
import { agentData, agentTlds, searchProducts, pickCurrency, priceText, type AgentProduct } from './catalog';
import { checkDomain } from './domain';

export const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const MCP_LATEST = '2025-06-18';
export const SERVER_INFO = { name: 'globalhostia', title: 'GlobalHostia store', version: '1.0.0', websiteUrl: 'https://globalhostia.com/ai' };

export const INSTRUCTIONS = 'Read-only shop assistant for GlobalHostia (Dubai, UAE): web hosting, WordPress, VPS, cloud and dedicated servers, RDP, SSL, email and domains. '
  + 'Use search_products or list_categories to find plans, get_product for full specs and every billing cycle, check_domain for domain availability and price, '
  + 'and get_order_link to give the customer a cart link. Prices come from the live billing system; never quote a price these tools did not return. '
  + 'The customer completes checkout and payment themselves on the GlobalHostia client area.';

const CYCLES = ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially', 'onetime', 'free'];
const ro = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'search_products', title: 'Search hosting products',
    description: 'Search GlobalHostia hosting, server, SSL and email plans. Returns matching plans with key specs, location, the cheapest price and links. Leave query empty to browse a category.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      query: { type: 'string', maxLength: 200, description: 'Free text, e.g. "windows vps 8gb ram", "wordpress", "dedicated server usa".' },
      category: { type: 'string', maxLength: 80, description: 'Category slug or name from list_categories.' },
      max_price: { type: 'number', minimum: 0, description: 'Maximum monthly-equivalent price in the chosen currency.' },
      currency: { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO currency code, e.g. USD or AED. Defaults to USD.' },
      location: { type: 'string', maxLength: 60, description: 'Datacenter location, e.g. USA, Germany, Singapore.' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum results (default 10).' },
    } },
    annotations: { title: 'Search hosting products', ...ro },
  },
  {
    name: 'get_product', title: 'Get product details',
    description: 'Full details of one plan by slug: description, specs, included and excluded features, every billing cycle with price, setup fee and order link.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['slug'], properties: {
      slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,120}$', description: 'Product slug from search_products.' },
      currency: { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO currency code (default USD).' },
    } },
    annotations: { title: 'Get product details', ...ro },
  },
  {
    name: 'list_categories', title: 'List product categories',
    description: 'All product categories with a one-line summary, number of plans, starting price and page link, plus datacenter locations and currencies.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {
      currency: { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO currency code (default USD).' },
    } },
    annotations: { title: 'List product categories', ...ro },
  },
  {
    name: 'check_domain', title: 'Check domain availability',
    description: 'Check whether a domain name is available to register, with the first-year and renewal price and an add-to-cart link.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['domain'], properties: {
      domain: { type: 'string', minLength: 3, maxLength: 253, description: 'Full domain, e.g. mybrand.com' },
      currency: { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO currency code (default USD).' },
    } },
    annotations: { title: 'Check domain availability', ...ro, idempotentHint: false, openWorldHint: true },
  },
  {
    name: 'get_order_link', title: 'Get order link',
    description: 'Cart link for a plan with the billing cycle and currency preselected, plus the price for that cycle. The customer opens it to configure options and pay.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['slug', 'billing_cycle'], properties: {
      slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,120}$', description: 'Product slug.' },
      billing_cycle: { type: 'string', enum: CYCLES, description: 'Billing cycle; must be one the product offers (see get_product).' },
      currency: { type: 'string', pattern: '^[A-Za-z]{3}$', description: 'ISO currency code (default USD).' },
    } },
    annotations: { title: 'Get order link', ...ro },
  },
] as const;

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

export async function callTool(name: string, a: Args, ip: string, domainLimit: (k: string) => number) {
  switch (name) {
    case 'search_products': {
      const d = await dataFor(a);
      const query = str(a, 'query', 200), category = str(a, 'category', 80), location = str(a, 'location', 60);
      const maxPrice = numArg(a, 'max_price', 0, 1e7), limit = numArg(a, 'limit', 1, 50) ?? 10;
      const items = searchProducts(d, { query, category, location, maxPrice, limit: Math.floor(limit) });
      const out = { currency: d.currency, count: items.length, results: items.map(brief) };
      return textOf(items.length ? `${items.length} plan(s) found. Prices in ${d.currency}.` : 'No plans matched. Try a broader query or call list_categories.', out);
    }
    case 'get_product': {
      const slug = str(a, 'slug', 121, true)!.toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(slug)) throw new RpcError(-32602, 'Invalid slug');
      const d = await dataFor(a);
      const p = d.products.find((x) => x.slug === slug);
      if (!p) return { ...textOf(`No product with slug "${slug}". Use search_products to find slugs.`, { error: 'not_found', slug }), isError: true };
      return textOf(`${p.name}: ${priceText(p)}. Page: ${p.url}`, { product: p });
    }
    case 'list_categories': {
      const d = await dataFor(a);
      const out = { currency: d.currency, currencies: d.currencies, locations: d.locations, categories: d.categories, domains: { page: `${d.site}/domains-registration`, tldCount: agentTlds(d).length } };
      return textOf(`${d.categories.length} categories. Prices in ${d.currency}.`, out);
    }
    case 'check_domain': {
      const domain = str(a, 'domain', 253, true);
      const wait = domainLimit(ip);
      if (wait) return { ...textOf(`Rate limit reached; try again in ${wait}s.`, { error: 'rate_limited', retryAfter: wait }), isError: true };
      const r = await checkDomain(domain, str(a, 'currency', 3));
      if (!r.ok) { const { ok: _o, status: _s, ...body } = r; return { ...textOf(r.message, body), isError: true }; }
      const { ok: _o, ...body } = r;
      const broker = r.available ? '' : `${(await dataFor(a)).site}/domain-broker?domain=${encodeURIComponent(r.domain)}`;
      return textOf(r.available
        ? `${r.domain} is available. Registration ${r.register !== null ? `${r.register.toFixed(2)} ${r.currency} for the first year` : 'price shown in cart'}${r.renew !== null ? `, renews at ${r.renew.toFixed(2)} ${r.currency}/year` : ''}. Add to cart: ${r.addToCartUrl}`
        : `${r.domain} is already registered. Taken? Request our broker: ${broker}`,
        r.available ? body : { ...body, request_domain_broker: broker });
    }
    case 'get_order_link': {
      const slug = str(a, 'slug', 121, true)!.toLowerCase();
      const cycle = str(a, 'billing_cycle', 20, true)!.toLowerCase();
      if (!CYCLES.includes(cycle)) throw new RpcError(-32602, `billing_cycle must be one of ${CYCLES.join(', ')}`);
      const d = await dataFor(a);
      const p = d.products.find((x) => x.slug === slug);
      if (!p) return { ...textOf(`No product with slug "${slug}".`, { error: 'not_found', slug }), isError: true };
      const c = p.prices.find((x) => x.cycle === cycle);
      if (!c) return { ...textOf(`${p.name} is not offered ${cycle} in ${d.currency}. Available: ${p.prices.map((x) => x.cycle).join(', ') || 'none (price on request)'}.`, { error: 'cycle_unavailable', available: p.prices.map((x) => x.cycle), productUrl: p.url }), isError: true };
      const out = { slug: p.slug, name: p.name, billingCycle: c.cycle, price: c.price, setupFee: c.setupFee, currency: c.currency, orderUrl: c.orderUrl, productUrl: p.url, configurable: p.configurable };
      return textOf(`Order ${p.name} (${c.label}, ${c.price.toFixed(2)} ${c.currency}${c.setupFee ? ` + ${c.setupFee.toFixed(2)} setup` : ''}): ${c.orderUrl}`, out);
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${name}`);
  }
}

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

/** Handle one JSON-RPC message. Returns null for notifications. */
export async function handleMessage(m: Msg, ip: string, domainLimit: (k: string) => number) {
  const isReq = m && typeof m === 'object' && 'id' in m && m.id !== null && m.id !== undefined;
  const id = isReq ? m.id! : null;
  try {
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') throw new RpcError(-32600, 'Invalid Request');
    if (!isReq) return null; // notifications (initialized, cancelled, …) need no reply
    const p = m.params && typeof m.params === 'object' ? m.params : {};
    switch (m.method) {
      case 'initialize': {
        const want = String(p.protocolVersion || '');
        return { jsonrpc: '2.0', id, result: {
          protocolVersion: MCP_VERSIONS.includes(want) ? want : MCP_LATEST,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO, instructions: INSTRUCTIONS,
        } };
      }
      case 'ping': return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
      case 'resources/list': return { jsonrpc: '2.0', id, result: { resources: [] } };
      case 'prompts/list': return { jsonrpc: '2.0', id, result: { prompts: [] } };
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
