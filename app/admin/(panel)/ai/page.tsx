// Admin → AI & MCP: what the AI shopping server is, live self-test, and how to connect it to Claude / ChatGPT / others.
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge } from '@/components/ui';
import { TOOLS, SERVER_INFO, MCP_LATEST, callTool } from '@/lib/agents/mcp';

export const metadata = { title: 'AI & MCP' };
export const dynamic = 'force-dynamic';

const SITE = 'https://globalhostia.com';
const MCP = `${SITE}/api/mcp`;

async function selfTest() {
  const t0 = Date.now();
  try {
    const r: any = await callTool('search_products', { query: 'hosting', limit: 1 }, 'admin-selftest', () => 0);
    const text = r?.content?.[0]?.text || '';
    return { ok: !r?.isError && /found/i.test(text), ms: Date.now() - t0, sample: text.split('\n')[0] };
  } catch (e: any) { return { ok: false, ms: Date.now() - t0, sample: e?.message || 'error' }; }
}

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100"><code>{children}</code></pre>;
}

export default async function AiPage() {
  await requireSession('content');
  const st = await selfTest();
  const links: [string, string, string][] = [
    ['/api/mcp', 'MCP server (Streamable HTTP, JSON-RPC)', 'What AI assistants connect to'],
    ['/.well-known/mcp.json', 'MCP discovery file', 'Lets AI tools find the server automatically'],
    ['/llms.txt', 'AI summary of the site', 'Read by ChatGPT, Claude, Perplexity crawlers'],
    ['/llms-full.txt', 'Full AI catalogue', 'Every plan, spec and price'],
    ['/api/catalog', 'Catalogue API (JSON)', 'For apps and agents; ?currency=AED&category=&q='],
    ['/openapi.json', 'OpenAPI 3.1 spec', 'For GPT Actions and developers'],
    ['/feeds/products.xml', 'Product feed (Google Merchant format)', 'Google Shopping / AI shopping'],
    ['/feeds/products.json', 'Product feed (JSON)', 'Other shopping tools'],
    ['/ai', 'Public page for customers', '"Shop GlobalHostia with your AI assistant"'],
  ];
  return (
    <>
      <PageHeader title="AI & MCP" desc="Your store is open to AI assistants. Customers (and AI shopping agents) can search plans, check domains and get ready order links from Claude, ChatGPT and other AI apps. Everything here is read-only: AI tools can never change orders, prices or accounts." />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card title="Server status">
          <div className="flex items-center gap-2">{st.ok ? <Badge tone="green">Working</Badge> : <Badge tone="red">Problem</Badge>}<span className="text-sm text-slate-500">{st.ms} ms</span></div>
          <p className="mt-2 text-sm text-slate-600">Live self-test: {st.sample}</p>
        </Card>
        <Card title="Server address">
          <p className="break-all font-mono text-sm">{MCP}</p>
          <p className="mt-2 text-sm text-slate-500">{SERVER_INFO.title} · protocol {MCP_LATEST} · no sign-in needed</p>
        </Card>
        <Card title="Tools AI can use">
          <ul className="space-y-1 text-sm">{TOOLS.map((t: any) => <li key={t.name}><span className="font-mono">{t.name}</span></li>)}</ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1 · Connect in Claude (claude.ai, desktop and mobile)">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Open Claude → <b>Settings → Connectors</b> (on Team/Enterprise an owner does this in <b>Organization settings → Connectors</b>).</li>
            <li>Click <b>Add custom connector</b>.</li>
            <li>Name: <b>GlobalHostia</b> · URL: <span className="font-mono">{MCP}</span> · Authentication: <b>none</b>.</li>
            <li>Start a chat, enable the connector from the tools menu and ask: “Find me a Windows RDP in AED under 100 a month”.</li>
          </ol>
        </Card>
        <Card title="2 · Connect in Claude Code (developers)">
          <p className="text-sm">Run once in a terminal:</p>
          <Code>{`claude mcp add --transport http globalhostia ${MCP}`}</Code>
          <p className="mt-2 text-sm">Then ask Claude Code e.g. “check if mybrand.ae is available on GlobalHostia”.</p>
        </Card>
        <Card title="3 · Connect in ChatGPT (OpenAI)">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>ChatGPT → <b>Settings → Apps &amp; Connectors → Advanced</b> → turn on <b>Developer mode</b>.</li>
            <li>Back in <b>Apps &amp; Connectors</b> → <b>Create</b> (custom connector).</li>
            <li>Name <b>GlobalHostia</b>, MCP server URL <span className="font-mono">{MCP}</span>, authentication <b>No auth</b>.</li>
            <li>In a chat, choose the connector and ask for a plan. Menu names change often; if they differ, look for “connectors” or “MCP”.</li>
          </ol>
          <p className="mt-3 text-sm"><b>Custom GPT alternative:</b> create a GPT → Configure → <b>Add actions</b> → <b>Import from URL</b>: <span className="font-mono">{SITE}/openapi.json</span> (no auth). Publish it as “GlobalHostia Assistant”.</p>
        </Card>
        <Card title="4 · Any other MCP app (Cursor, VS Code, Windsurf, LM Studio…)">
          <p className="text-sm">Add a remote server of type <b>http</b> / “Streamable HTTP” with the URL above. Typical JSON config:</p>
          <Code>{`{
  "mcpServers": {
    "globalhostia": { "type": "http", "url": "${MCP}" }
  }
}`}</Code>
        </Card>
        <Card title="5 · Test it yourself in 10 seconds">
          <p className="text-sm">Paste in any terminal; you should see 5 tools listed:</p>
          <Code>{`curl -s ${MCP} -H 'content-type: application/json' \\
  -H 'accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</Code>
        </Card>
        <Card title="6 · Get listed so AI apps find you">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Submit the server to MCP directories (e.g. the official MCP Registry, Smithery, mcp.so, PulseMCP, Glama) with the URL above and the description from <span className="font-mono">/.well-known/mcp.json</span>.</li>
            <li>Google Merchant Center: add the feed <span className="font-mono">{SITE}/feeds/products.xml</span> (appears in Google Shopping and AI results).</li>
            <li>Bing Webmaster Tools / Google Search Console: submit the sitemap; AI crawlers are already allowed in robots.txt.</li>
            <li>Promote it: “Shop GlobalHostia straight from Claude or ChatGPT” → link to <span className="font-mono">{SITE}/ai</span>.</li>
          </ul>
        </Card>
      </div>

      <Card title="Everything AI can read" className="mt-6">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th className="py-2">Address</th><th>What</th><th>Used for</th></tr></thead>
          <tbody>{links.map(([u, w, f]) => (
            <tr key={u} className="border-t border-slate-100"><td className="py-2 font-mono"><a className="text-indigo-600 hover:underline" href={u} target="_blank" rel="noreferrer">{u}</a></td><td>{w}</td><td className="text-slate-500">{f}</td></tr>
          ))}</tbody>
        </table>
        <p className="mt-3 text-sm text-slate-500">All data comes live from your synced WHMCS catalogue, so prices and plans stay correct automatically. Nothing to run or restart: the server is part of the website and scales with it.</p>
      </Card>
    </>
  );
}
