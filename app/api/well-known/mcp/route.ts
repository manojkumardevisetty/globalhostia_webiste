// MCP discovery document, served at /.well-known/mcp.json (rewrite in next.config.mjs).
import { getSettings } from '@/lib/settings';
import { json, preflight } from '@/lib/agents/http';
import { MCP_VERSIONS, SERVER_INFO, TOOLS, RESOURCES, PROMPTS, INSTRUCTIONS } from '@/lib/agents/mcp';
import { REGISTRY_NAME } from '@/lib/agents/registry';

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
    capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } },
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description })),
    resources: RESOURCES.map((r) => ({ uri: r.uri, name: r.name, description: r.description })),
    prompts: PROMPTS.map((p) => ({ name: p.name, description: p.description })),
    registry: { name: REGISTRY_NAME, manifest: `${site}/server.json` },
    documentation: `${site}/ai`,
    links: { openapi: `${site}/openapi.json`, llms: `${site}/llms.txt`, llmsFull: `${site}/llms-full.txt`, catalog: `${site}/api/catalog`, ask: `${site}/ask`, a2aAgentCard: `${site}/.well-known/agent-card.json`,
      feedXml: `${site}/feeds/products.xml`, feedJson: `${site}/feeds/products.json`, feedOpenAi: `${site}/feeds/openai.jsonl`, feeds: `${site}/feeds/index.json` },
    contact: { email: String(s.email || 'support@globalhostia.com'), url: `${site}/contact` },
  }, { cache: 'public, max-age=3600, s-maxage=86400' });
}

export const OPTIONS = preflight;
