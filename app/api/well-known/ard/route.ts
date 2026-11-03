// Agentic Resource Discovery manifest, served at /.well-known/ard.json (rewrite in next.config.mjs).
// Spec: https://agenticresourcediscovery.org/spec/ (checked by Lighthouse's "ard-schema" audit).
// Every entry: urn:air:<publisher>:<namespace>:<name> identifier, displayName, media type, exactly one of url/data,
// and 2–5 representativeQueries. Built from settings only (no catalog or WHMCS work), so it answers from cache.
import { getSettings } from '@/lib/settings';
import { json, preflight } from '@/lib/agents/http';
import { SERVER_INFO, TOOLS, MCP_VERSIONS } from '@/lib/agents/mcp';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const host = new URL(site).hostname.replace(/^www\./, '');
  const urn = (ns: string, name: string) => `urn:air:${host}:${ns}:${name}`;
  const updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tags = ['web hosting', 'vps', 'dedicated servers', 'domains', 'ssl', 'uae'];
  return json({
    specVersion: '0.91',
    publisher: { name: String(s.site_name || 'GlobalHostia'), url: site },
    entries: [
      {
        identifier: urn('mcp', SERVER_INFO.name),
        displayName: 'GlobalHostia store MCP server',
        type: 'application/mcp-server-card+json',
        url: `${site}/.well-known/mcp.json`,
        description: `Public, read-only Model Context Protocol server (Streamable HTTP at ${site}/api/mcp, no auth, protocol ${MCP_VERSIONS[0]}): search hosting, VPS and dedicated server plans with live prices, check domain availability and get cart links.`,
        representativeQueries: [
          'Find a cheap VPS with 4 GB RAM in the UAE',
          'Is example.com available to register, and how much does it cost?',
          'Compare GlobalHostia shared hosting plans',
          'Get an order link for a dedicated server billed annually',
        ],
        capabilities: TOOLS.map((t) => t.name),
        tags, version: SERVER_INFO.version, updatedAt,
      },
      {
        identifier: urn('api', 'store-openapi'),
        displayName: 'GlobalHostia Store API (OpenAPI 3.1)',
        type: 'application/vnd.oai.openapi+json',
        url: `${site}/openapi.json`,
        description: 'OpenAPI description of the public catalog, TLD price and domain availability endpoints.',
        representativeQueries: ['GlobalHostia product catalog API', 'API for domain prices and availability', 'Hosting plan prices as JSON'],
        capabilities: ['getCatalog', 'getTldPrices', 'checkDomain'],
        tags, version: '1.0.0', updatedAt,
      },
      {
        identifier: urn('catalog', 'products'),
        displayName: 'GlobalHostia product catalog (JSON)',
        type: 'application/json',
        url: `${site}/api/catalog`,
        description: 'Every category and plan with specs, location, prices per billing cycle, setup fees, product page and cart link (?currency=&category=&q=&max_price=&location=).',
        representativeQueries: ['List all GlobalHostia hosting plans with prices', 'Dedicated servers under 100 USD per month', 'Which hosting locations does GlobalHostia offer?'],
        // the same catalog as Markdown for language models (llmstxt.org). ARD has no media type for plain Markdown
        // documents (text/markdown is reserved for agent skills), so llms.txt is linked here rather than as its own entry.
        metadata: { llmsTxt: `${site}/llms.txt`, llmsFullTxt: `${site}/llms-full.txt`, productFeed: `${site}/feeds/products.xml` },
        tags, updatedAt,
      },
    ],
  }, { cache: 'public, s-maxage=3600, stale-while-revalidate=86400' });
}

export const OPTIONS = preflight;
