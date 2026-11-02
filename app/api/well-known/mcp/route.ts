// MCP discovery document, served at /.well-known/mcp.json (rewrite in next.config.mjs).
import { getSettings } from '@/lib/settings';
import { json, preflight } from '@/lib/agents/http';
import { MCP_VERSIONS, SERVER_INFO, TOOLS, INSTRUCTIONS } from '@/lib/agents/mcp';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  return json({
    name: SERVER_INFO.name, title: SERVER_INFO.title, version: SERVER_INFO.version,
    description: INSTRUCTIONS,
    url: `${site}/api/mcp`,
    transport: 'streamable-http',
    protocolVersions: MCP_VERSIONS,
    authentication: { type: 'none' },
    readOnly: true,
    servers: [{ name: SERVER_INFO.name, url: `${site}/api/mcp`, transport: 'streamable-http', authentication: 'none' }],
    capabilities: { tools: { listChanged: false } },
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description })),
    documentation: `${site}/ai`,
    links: { openapi: `${site}/openapi.json`, llms: `${site}/llms.txt`, llmsFull: `${site}/llms-full.txt`, catalog: `${site}/api/catalog`, feedXml: `${site}/feeds/products.xml`, feedJson: `${site}/feeds/products.json` },
    contact: { email: String(s.email || 'support@globalhostia.com'), url: `${site}/contact` },
  }, { cache: 'public, max-age=3600, s-maxage=86400' });
}

export const OPTIONS = preflight;
