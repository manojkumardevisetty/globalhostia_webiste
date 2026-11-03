// Official MCP Registry (https://registry.modelcontextprotocol.io) publishing data and the agent-visibility checklist
// shown in Admin > AI & MCP. Statuses reflect research in Nov 2026; update when standards move.

/** Registry HTTP-verification line: "v=MCPv1; k=ed25519; p=<base64 32-byte public key>". */
export const AUTH_LINE = /^v=MCPv1; k=ed25519; p=[A-Za-z0-9+/]{43}=$/;
export const REGISTRY_NAME = 'com.globalhostia/store';

export const REGISTRY_STEPS: { title: string; cmd?: string; note?: string }[] = [
  { title: 'Install the publisher CLI (macOS/Linux; Windows: download mcp-publisher from the registry GitHub releases)', cmd: 'brew install mcp-publisher' },
  { title: 'Create a signing key pair on your own computer (keep key.pem private, never upload it)', cmd: 'openssl genpkey -algorithm Ed25519 -out key.pem' },
  { title: 'Print the public-key line and paste it into the "Registry key" box on this page, then Save', cmd: 'echo "v=MCPv1; k=ed25519; p=$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"', note: 'The site then serves it at https://globalhostia.com/.well-known/mcp-registry-auth (check the link shows the same line).' },
  { title: 'Download server.json from this page (or the repository root) into the same folder', cmd: 'curl -o server.json https://globalhostia.com/server.json' },
  { title: 'Sign in to the registry with the domain proof', cmd: 'mcp-publisher login http --domain globalhostia.com --private-key "$(openssl pkey -in key.pem -noout -text | grep -A3 \'priv:\' | tail -n +2 | tr -d \' :\\n\')"' },
  { title: 'Publish', cmd: 'mcp-publisher publish' },
  { title: 'Confirm the listing', cmd: 'curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.globalhostia/store"', note: 'For each new release, raise "version" in server.json and run login + publish again. DNS alternative: add a TXT record on globalhostia.com with the same v=MCPv1 line and use "mcp-publisher login dns" instead.' },
];

export type Standard = { id: string; name: string; status: 'live' | 'owner' | 'na'; spec: string; detail: string; test?: string };

export const STANDARDS: Standard[] = [
  { id: 'mcp', name: 'MCP server (Streamable HTTP, 2025-11-25 + 2026-07-28 stateless)', status: 'live', spec: 'https://modelcontextprotocol.io/specification/2026-07-28', detail: '10 read-only tools, resources and prompts at /api/mcp; discovery at /.well-known/mcp.json.', test: '/api/mcp' },
  { id: 'mcp-registry', name: 'Official MCP Registry listing', status: 'owner', spec: 'https://registry.modelcontextprotocol.io', detail: 'server.json is ready. Publishing needs your key and a one-time login: follow the steps below.', test: '/server.json' },
  { id: 'llms', name: 'llms.txt and llms-full.txt', status: 'live', spec: 'https://llmstxt.org', detail: 'Generated from the live catalog with real prices, policies and agent endpoints.', test: '/llms.txt' },
  { id: 'markdown', name: 'Markdown version of every page', status: 'live', spec: 'https://llmstxt.org/#proposal', detail: 'Any public URL + ".md" (home: /index.md), or request with Accept: text/markdown. Pages link it with rel="alternate".', test: '/index.md' },
  { id: 'nlweb', name: 'NLWeb /ask endpoint', status: 'live', spec: 'https://github.com/nlweb-ai/NLWeb/blob/main/docs/nlweb-rest-api.md', detail: 'Natural-language questions return ranked results with schema.org objects (list and summarize modes, JSON or SSE). Early-pilot standard.', test: '/ask?query=wordpress%20hosting' },
  { id: 'a2a', name: 'A2A agent card + JSON-RPC agent', status: 'live', spec: 'https://a2a-protocol.org/latest/specification/', detail: '/.well-known/agent-card.json describes a small read-only agent at /api/a2a (SendMessage).', test: '/.well-known/agent-card.json' },
  { id: 'webmcp', name: 'WebMCP tools for in-browser agents', status: 'live', spec: 'https://developer.chrome.com/docs/ai/webmcp/imperative-api', detail: 'Pages register search_plans, recommend_plan, check_domain and build_cart_link with document.modelContext when the browser supports it (Chrome origin trial). Nothing loads in other browsers.', test: '/hp/webmcp.js' },
  { id: 'openai-feed', name: 'ChatGPT product feed (OpenAI Commerce, file upload spec)', status: 'owner', spec: 'https://developers.openai.com/commerce/specs/feed', detail: 'JSONL feed with one row per plan and billing cycle is live. ChatGPT merchant onboarding (and Instant Checkout) needs an application at chatgpt.com/merchants; checkout stays off.', test: '/feeds/openai.jsonl' },
  { id: 'acp', name: 'Agentic Commerce Protocol checkout (ChatGPT Instant Checkout)', status: 'na', spec: 'https://developers.openai.com/commerce', detail: 'Needs an approved merchant account and a checkout API on the billing system with a supported payment provider. Orders stay on the client area for now.' },
  { id: 'google-feed', name: 'Google Merchant Center feed (Shopping / AI Mode)', status: 'owner', spec: 'https://support.google.com/merchants/answer/7052112', detail: 'RSS feed with product_highlight and product_detail attributes, one per currency. Add it in Merchant Center; check eligibility, as Google Shopping restricts some services.', test: '/feeds/products.xml' },
  { id: 'ucp', name: 'Google Universal Commerce Protocol (UCP) / AP2', status: 'na', spec: 'https://ucp.dev/specification/overview/', detail: 'Requires a checkout API (/.well-known/ucp profile with checkout endpoints and payment handlers) and Merchant Center onboarding. Not possible until checkout runs outside the client area.' },
  { id: 'jsonld', name: 'schema.org JSON-LD', status: 'live', spec: 'https://schema.org/Product', detail: 'Organization (contactPoint, sameAs), WebSite SearchAction, OfferCatalog, ItemList and Product offers with billing-period price specifications.' },
  { id: 'robots', name: 'AI crawler allow-list in robots.txt', status: 'live', spec: 'https://www.rfc-editor.org/rfc/rfc9309', detail: 'GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, Bingbot, CCBot and more are allowed.', test: '/robots.txt' },
  { id: 'bing', name: 'Bing / Copilot (IndexNow, Bing Webmaster Tools)', status: 'owner', spec: 'https://www.bing.com/webmasters', detail: 'IndexNow pings run automatically. Verify the site in Bing Webmaster Tools and submit the sitemap; Copilot answers come from the Bing index.', test: '/sitemap.xml' },
];
