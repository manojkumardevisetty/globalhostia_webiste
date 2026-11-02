// OpenAPI 3.1 description of the public agent endpoints (catalog, TLD prices, domain check).
import { getSettings } from '@/lib/settings';
import { json, preflight } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

const currency = { name: 'currency', in: 'query', required: false, description: 'ISO 4217 code. Defaults to USD. Only currencies with synced prices are accepted (see `currencies` in responses).', schema: { type: 'string', pattern: '^[A-Za-z]{3}$', examples: ['USD', 'AED'] } };
const err = { type: 'object', properties: { error: { type: 'string' }, message: { type: 'string' } }, required: ['error'] };
const nnum = { type: ['number', 'null'] };

export async function GET() {
  const s = await getSettings();
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'GlobalHostia Store API', version: '1.0.0',
      summary: 'Read-only catalog, prices and domain availability for AI assistants and shopping agents.',
      description: 'Public, unauthenticated and read-only. Prices are synced from the GlobalHostia billing system (WHMCS); do not quote prices from elsewhere. Orders are placed by the customer through the returned `orderUrl` / `addToCartUrl` links. An MCP server with the same capabilities is available at ' + `${site}/api/mcp` + '.',
      contact: { name: 'GlobalHostia support', email: String(s.email || 'support@globalhostia.com'), url: `${site}/contact` },
    },
    servers: [{ url: site }],
    externalDocs: { description: 'Using GlobalHostia with AI assistants', url: `${site}/ai` },
    paths: {
      '/api/catalog': {
        get: {
          operationId: 'getCatalog', summary: 'List or search products',
          description: 'Categories and products with specs, prices per billing cycle, setup fees, location, canonical page and cart link. Add filters to search.',
          parameters: [
            currency,
            { name: 'category', in: 'query', required: false, description: 'Category slug or name, e.g. hostiavps, dedicated-servers.', schema: { type: 'string', maxLength: 80 } },
            { name: 'q', in: 'query', required: false, description: 'Free-text search, e.g. "windows vps", "8gb ram".', schema: { type: 'string', maxLength: 200 } },
            { name: 'max_price', in: 'query', required: false, description: 'Maximum monthly-equivalent price.', schema: { type: 'number', minimum: 0 } },
            { name: 'location', in: 'query', required: false, description: 'Datacenter location, e.g. USA.', schema: { type: 'string', maxLength: 60 } },
          ],
          responses: {
            200: { description: 'Catalog', content: { 'application/json': { schema: { $ref: '#/components/schemas/Catalog' } } } },
            400: { description: 'Unsupported currency', content: { 'application/json': { schema: err } } },
          },
        },
      },
      '/api/catalog/tlds': {
        get: {
          operationId: 'getTldPrices', summary: 'Domain extension prices', parameters: [currency],
          responses: {
            200: { description: 'TLD prices (one year)', content: { 'application/json': { schema: { type: 'object', properties: {
              currency: { type: 'string' }, currencies: { type: 'array', items: { type: 'string' } }, count: { type: 'integer' },
              tlds: { type: 'array', items: { $ref: '#/components/schemas/Tld' } } } } } } },
            400: { description: 'Unsupported currency', content: { 'application/json': { schema: err } } },
          },
        },
      },
      '/api/domain-check': {
        get: {
          operationId: 'checkDomain', summary: 'Check domain availability',
          description: 'Registry lookup through WHMCS. Rate limited to 10 lookups per IP per minute; results are cached for up to 5 minutes.',
          parameters: [{ name: 'domain', in: 'query', required: true, schema: { type: 'string', minLength: 3, maxLength: 253, examples: ['mybrand.com'] } }, currency],
          responses: {
            200: { description: 'Result', content: { 'application/json': { schema: { $ref: '#/components/schemas/DomainCheck' } } } },
            400: { description: 'Invalid domain', content: { 'application/json': { schema: err } } },
            422: { description: 'Extension not sold', content: { 'application/json': { schema: err } } },
            429: { description: 'Rate limited', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: { 'application/json': { schema: err } } },
            502: { description: 'Registry lookup failed', content: { 'application/json': { schema: err } } },
            503: { description: 'Lookup unavailable', content: { 'application/json': { schema: err } } },
          },
        },
      },
    },
    components: {
      schemas: {
        Price: { type: 'object', required: ['cycle', 'price', 'currency', 'orderUrl'], properties: {
          cycle: { type: 'string', enum: ['monthly', 'quarterly', 'semiannually', 'annually', 'biennially', 'triennially', 'onetime', 'free'] },
          label: { type: 'string' }, months: { type: 'integer' }, price: { type: 'number' }, setupFee: { type: 'number' },
          perMonth: nnum, currency: { type: 'string' }, orderUrl: { type: 'string', format: 'uri' } } },
        Product: { type: 'object', required: ['slug', 'name', 'prices', 'url', 'availability'], properties: {
          slug: { type: 'string' }, name: { type: 'string' }, tagline: { type: 'string' }, description: { type: 'string' },
          category: { type: ['object', 'null'], properties: { slug: { type: 'string' }, name: { type: 'string' } } },
          type: { type: 'string' }, specs: { type: 'object', additionalProperties: { type: 'string' }, description: 'cpu, ram, storage, bandwidth, location… when known' },
          features: { type: 'array', items: { type: 'string' } }, notIncluded: { type: 'array', items: { type: 'string' } },
          location: { type: ['string', 'null'] }, currency: { type: 'string' },
          prices: { type: 'array', items: { $ref: '#/components/schemas/Price' } },
          from: { type: ['object', 'null'], properties: { price: { type: 'number' }, cycle: { type: 'string' }, perMonth: nnum } },
          availability: { type: 'string', enum: ['in_stock', 'out_of_stock', 'preorder', 'price_on_request'] },
          configurable: { type: 'boolean', description: 'Has options (OS, RAM, disk…) chosen in the cart' },
          url: { type: 'string', format: 'uri' }, categoryUrl: { type: ['string', 'null'] }, orderUrl: { type: 'string' } } },
        Category: { type: 'object', properties: {
          slug: { type: 'string' }, name: { type: 'string' }, summary: { type: 'string' }, url: { type: ['string', 'null'] }, productCount: { type: 'integer' }, parent: { type: ['string', 'null'] },
          from: { type: ['object', 'null'], properties: { price: { type: 'number' }, cycle: { type: 'string' }, perMonth: nnum, currency: { type: 'string' } } } } },
        Catalog: { type: 'object', properties: {
          brand: { type: 'string' }, site: { type: 'string' }, currency: { type: 'string' }, currencies: { type: 'array', items: { type: 'string' } },
          generatedAt: { type: 'string', format: 'date-time' }, locations: { type: 'array', items: { type: 'string' } }, count: { type: 'integer' },
          categories: { type: 'array', items: { $ref: '#/components/schemas/Category' } },
          products: { type: 'array', items: { $ref: '#/components/schemas/Product' } } } },
        Tld: { type: 'object', properties: { tld: { type: 'string' }, currency: { type: 'string' }, register: nnum, transfer: nnum, renew: nnum, promo: { type: 'string' }, registerUrl: { type: 'string' } } },
        DomainCheck: { type: 'object', required: ['domain', 'available'], properties: {
          domain: { type: 'string' }, tld: { type: 'string' }, available: { type: 'boolean' }, currency: { type: 'string' },
          register: nnum, renew: nnum, transfer: nnum, addToCartUrl: { type: ['string', 'null'] }, cached: { type: 'boolean' }, checkedAt: { type: 'string', format: 'date-time' } } },
      },
    },
  };
  return json(spec, { cache: 'public, max-age=3600, s-maxage=86400' });
}

export const OPTIONS = preflight;
