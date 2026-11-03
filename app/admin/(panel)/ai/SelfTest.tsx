'use client';
import { useState } from 'react';

type Check = { id: string; label: string; url: string; init?: RequestInit; expect: (status: number, body: string, type: string) => string | null };

const mcp = (method: string, params: unknown = {}) => ({
  method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
});
const ok200 = (s: number) => (s === 200 ? null : `HTTP ${s}`);
const has = (re: RegExp, what: string) => (s: number, b: string) => ok200(s) || (re.test(b) ? null : `missing ${what}`);

const CHECKS: Check[] = [
  { id: 'mcp-init', label: 'MCP initialize', url: '/api/mcp', init: mcp('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'admin-selftest', version: '1' } }), expect: has(/"protocolVersion"/, 'protocolVersion') },
  { id: 'mcp-discover', label: 'MCP server/discover (2026-07-28)', url: '/api/mcp', init: mcp('server/discover'), expect: has(/"supportedVersions"/, 'supportedVersions') },
  { id: 'mcp-tools', label: 'MCP tools/list', url: '/api/mcp', init: mcp('tools/list'), expect: has(/recommend_plan[\s\S]*build_cart_link[\s\S]*get_policies/, 'new tools') },
  { id: 'mcp-call', label: 'MCP recommend_plan call', url: '/api/mcp', init: mcp('tools/call', { name: 'recommend_plan', arguments: { need: 'wordpress website' } }), expect: has(/"recommendations"/, 'recommendations') },
  { id: 'mcp-res', label: 'MCP resources/read policies', url: '/api/mcp', init: mcp('resources/read', { uri: 'globalhostia://policies' }), expect: has(/money|refund/i, 'policies') },
  { id: 'mcp-json', label: '/.well-known/mcp.json', url: '/.well-known/mcp.json', expect: has(/"tools"/, 'tools') },
  { id: 'server-json', label: '/server.json (registry manifest)', url: '/server.json', expect: has(/com\.globalhostia\/store/, 'name') },
  { id: 'reg-auth', label: '/.well-known/mcp-registry-auth', url: '/.well-known/mcp-registry-auth', expect: (s, b) => (s === 404 ? 'not set yet (owner step 3)' : ok200(s) || (/^v=MCPv1; k=ed25519; p=/.test(b) ? null : 'wrong format')) },
  { id: 'agent-card', label: '/.well-known/agent-card.json (A2A)', url: '/.well-known/agent-card.json', expect: has(/"supportedInterfaces"/, 'supportedInterfaces') },
  { id: 'a2a', label: 'A2A SendMessage', url: '/api/a2a', init: { method: 'POST', headers: { 'content-type': 'application/json', 'a2a-version': '1.0' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'SendMessage', params: { message: { messageId: 'selftest', role: 'ROLE_USER', parts: [{ text: 'vps hosting' }] } } }) }, expect: has(/"ROLE_AGENT"/, 'agent message') },
  { id: 'ask', label: 'NLWeb /ask', url: '/ask?query=wordpress%20hosting', expect: has(/"query_id"[\s\S]*"results"/, 'results') },
  { id: 'md', label: 'Markdown page (/index.md)', url: '/index.md', expect: (s, b, t) => ok200(s) || (t.includes('text/markdown') && /^---/.test(b) ? null : 'not markdown') },
  { id: 'md-accept', label: 'Accept: text/markdown on /web-hosting', url: '/web-hosting', init: { headers: { accept: 'text/markdown' } }, expect: (s, b, t) => ok200(s) || (t.includes('text/markdown') ? null : `got ${t}`) },
  { id: 'llms', label: '/llms.txt', url: '/llms.txt', expect: has(/^# GlobalHostia/m, 'title') },
  { id: 'llms-full', label: '/llms-full.txt', url: '/llms-full.txt', expect: has(/## Policies/, 'policies section') },
  { id: 'feed-openai', label: 'OpenAI feed (/feeds/openai.jsonl)', url: '/feeds/openai.jsonl', expect: has(/"item_id"[\s\S]*"price":"\d+\.\d\d [A-Z]{3}"/, 'priced rows') },
  { id: 'feed-google', label: 'Google feed (/feeds/products.xml)', url: '/feeds/products.xml', expect: has(/<g:price>/, 'g:price') },
  { id: 'feeds', label: 'Feed index (all currencies)', url: '/feeds/index.json', expect: has(/"openai_jsonl"/, 'feeds') },
  { id: 'webmcp', label: 'WebMCP script', url: '/hp/webmcp.js', expect: has(/registerTool/, 'registerTool') },
  { id: 'robots', label: 'robots.txt AI allow-list', url: '/robots.txt', expect: has(/GPTBot[\s\S]*ClaudeBot[\s\S]*PerplexityBot/, 'AI crawlers') },
  { id: 'openapi', label: '/openapi.json', url: '/openapi.json', expect: has(/"\/ask"/, '/ask path') },
];

export default function SelfTest() {
  const [res, setRes] = useState<Record<string, { ok: boolean; msg: string; ms: number }>>({});
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setRes({});
    for (const c of CHECKS) {
      const t0 = performance.now();
      try {
        const r = await fetch(c.url, { cache: 'no-store', ...c.init });
        const body = await r.text();
        const err = c.expect(r.status, body, r.headers.get('content-type') || '');
        setRes((x) => ({ ...x, [c.id]: { ok: !err, msg: err || 'OK', ms: Math.round(performance.now() - t0) } }));
      } catch (e: any) {
        setRes((x) => ({ ...x, [c.id]: { ok: false, msg: e?.message || 'failed', ms: Math.round(performance.now() - t0) } }));
      }
    }
    setBusy(false);
  }
  const done = Object.keys(res).length, passed = Object.values(res).filter((r) => r.ok).length;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? 'Testing…' : 'Run self-test'}</button>
        {done > 0 && <span className="text-sm text-slate-600">{passed} of {done} passed{busy ? ` (${CHECKS.length - done} left)` : ''}</span>}
      </div>
      <table className="mt-3 w-full text-sm">
        <tbody>{CHECKS.map((c) => { const r = res[c.id]; return (
          <tr key={c.id} className="border-t border-slate-100">
            <td className="py-1.5 pr-3">{c.label}</td>
            <td className="py-1.5 pr-3 font-mono text-xs"><a className="text-indigo-600 hover:underline" href={c.url} target="_blank" rel="noreferrer">{c.url}</a></td>
            <td className="py-1.5 text-right">{r ? <span className={r.ok ? 'text-emerald-700' : 'text-red-700'}>{r.ok ? '✓' : '✗'} {r.msg} <span className="text-slate-400">{r.ms} ms</span></span> : <span className="text-slate-400">–</span>}</td>
          </tr>); })}</tbody>
      </table>
    </div>
  );
}
