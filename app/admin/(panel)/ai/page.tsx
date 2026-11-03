// Admin → AI & MCP: what the AI shopping server is, live self-test, and how to connect it to Claude / ChatGPT / others.
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge } from '@/components/ui';
import { TOOLS, SERVER_INFO, MCP_VERSIONS, callTool } from '@/lib/agents/mcp';
import { STANDARDS, REGISTRY_STEPS, REGISTRY_NAME, AUTH_LINE } from '@/lib/agents/registry';
import { getSettings } from '@/lib/settings';
import manifest from '@/server.json';
import SelfTest from './SelfTest';
import { saveRegistryKey } from './actions';

const STATUS: Record<string, [string, string]> = { live: ['Live', 'green'], owner: ['Needs you', 'yellow'], na: ['Not applicable yet', 'gray'] };

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
  const [st, settings] = await Promise.all([selfTest(), getSettings()]);
  const regKey = String(settings.mcp_registry_auth || '');
  const regOk = AUTH_LINE.test(regKey) || AUTH_LINE.test(String(process.env.MCP_REGISTRY_AUTH || ''));
  const links: [string, string, string][] = [
    ['/api/mcp', 'MCP server (Streamable HTTP, JSON-RPC)', 'What AI assistants connect to'],
    ['/.well-known/mcp.json', 'MCP discovery file', 'Lets AI tools find the server automatically'],
    ['/llms.txt', 'AI summary of the site', 'Read by ChatGPT, Claude, Perplexity crawlers'],
    ['/llms-full.txt', 'Full AI catalogue', 'Every plan, spec and price'],
    ['/api/catalog', 'Catalogue API (JSON)', 'For apps and agents; ?currency=AED&category=&q='],
    ['/openapi.json', 'OpenAPI 3.1 spec', 'For GPT Actions and developers'],
    ['/feeds/products.xml', 'Product feed (Google Merchant format)', 'Google Shopping / AI shopping'],
    ['/feeds/products.json', 'Product feed (JSON)', 'Other shopping tools'],
    ['/feeds/openai.jsonl', 'ChatGPT product feed (OpenAI spec)', 'ChatGPT shopping (after merchant approval)'],
    ['/feeds/index.json', 'All feeds in every currency', 'One feed per currency for Merchant Center'],
    ['/ask?query=vps', 'Ask endpoint (NLWeb)', 'Questions in plain language → ranked plans'],
    ['/.well-known/agent-card.json', 'A2A agent card', 'Agent-to-agent discovery'],
    ['/index.md', 'Markdown pages', 'Any page + .md, or Accept: text/markdown'],
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
          <p className="mt-2 text-sm text-slate-500">{SERVER_INFO.title} · MCP {MCP_VERSIONS.slice(0, 2).join(' and ')} · no sign-in needed</p>
        </Card>
        <Card title="Tools AI can use">
          <ul className="space-y-1 text-sm">{TOOLS.map((t: any) => <li key={t.name}><span className="font-mono">{t.name}</span></li>)}</ul>
        </Card>
      </div>

      <Card title="Agent visibility" className="mb-6">
        <p className="mb-3 text-sm text-slate-600">Each standard AI assistants, shopping agents and AI search use to find and sell your plans. <b>Live</b> works now; <b>Needs you</b> needs a one-time step with your own account; <b>Not applicable yet</b> needs checkout outside the client area first.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2 pr-3">Standard</th><th className="pr-3">Status</th><th className="pr-3">What it does / what to do</th><th>Check</th></tr></thead>
            <tbody>{STANDARDS.map((x) => {
              const st = x.id === 'mcp-registry' && regOk ? 'owner' : x.status;
              const [label, tone] = STATUS[st];
              return (
                <tr key={x.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3"><a className="font-medium text-slate-900 hover:underline" href={x.spec} target="_blank" rel="noreferrer">{x.name}</a></td>
                  <td className="py-2 pr-3"><Badge tone={tone}>{label}</Badge></td>
                  <td className="py-2 pr-3 text-slate-600">{x.detail}{x.id === 'mcp-registry' && regOk ? ' Key is set; run the login and publish steps.' : ''}</td>
                  <td className="py-2 font-mono text-xs">{x.test ? <a className="text-indigo-600 hover:underline" href={x.test} target="_blank" rel="noreferrer">{x.test}</a> : '–'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Self-test (fetches every endpoint from your browser)</h3>
          <SelfTest />
        </div>
      </Card>

      <Card title="Publish to the official MCP Registry (one-time, about 10 minutes)" className="mb-6">
        <p className="text-sm text-slate-600">Listing as <span className="font-mono">{REGISTRY_NAME}</span> lets Claude, ChatGPT, VS Code and other MCP clients find your store in their connector directories. The registry checks you own globalhostia.com with a key only you hold. Run these on your own computer:</p>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
          {REGISTRY_STEPS.map((s, i) => (
            <li key={i}>
              <span>{s.title}</span>
              {s.cmd && <Code>{s.cmd}</Code>}
              {s.note && <p className="mt-1 text-slate-500">{s.note}</p>}
              {i === 2 && (
                <form action={saveRegistryKey} className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor="mcp_registry_auth">Registry key</label>
                  <input id="mcp_registry_auth" name="mcp_registry_auth" defaultValue={regKey} placeholder="v=MCPv1; k=ed25519; p=…" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs" />
                  <button className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Save key</button>
                  <span className="text-xs">{regOk ? <Badge tone="green">Served at /.well-known/mcp-registry-auth</Badge> : <Badge tone="yellow">Not set</Badge>}</span>
                </form>
              )}
            </li>
          ))}
        </ol>
        <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">server.json (what gets published)</summary><Code>{JSON.stringify(manifest, null, 2)}</Code></details>
      </Card>

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
          <p className="text-sm">Paste in any terminal; you should see {TOOLS.length} tools listed:</p>
          <Code>{`curl -s ${MCP} -H 'content-type: application/json' \\
  -H 'accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</Code>
        </Card>
        <Card title="6 · Get listed so AI apps find you">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Official MCP Registry: follow “Publish to the MCP Registry” below (one-time). Other directories (Smithery, mcp.so, PulseMCP, Glama) take the URL above and the description from <span className="font-mono">/.well-known/mcp.json</span>.</li>
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
