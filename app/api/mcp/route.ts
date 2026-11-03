// Public read-only MCP server for AI assistants: Streamable HTTP transport, stateless, JSON responses.
// POST JSON-RPC 2.0 (initialize or server/discover, tools/*, resources/*, prompts/*, ping). GET has no event stream (405), per spec.
// Limits: 60 messages per IP per minute, 10 domain lookups per IP per minute, 64 KB bodies, 20 messages per batch.
import { handleMessage, MCP_VERSIONS, MCP_LATEST, SERVER_INFO, TOOLS, RESOURCES, PROMPTS } from '@/lib/agents/mcp';
import { domainLimit } from '@/lib/agents/domain';
import { CORS, clientIp, limiter } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

const rpcLimit = limiter(60, 60_000);
const MAX_BODY = 64 * 1024;

const out = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status, headers: { ...CORS, 'cache-control': 'no-store', ...(body === null ? {} : { 'content-type': 'application/json' }), ...extra },
  });
const rpcError = (code: number, message: string, status: number, extra: Record<string, string> = {}, id: unknown = null) =>
  out({ jsonrpc: '2.0', id, error: { code, message } }, status, extra);

export async function POST(req: Request) {
  const ip = clientIp(req);
  const wait = rpcLimit(ip);
  if (wait) return rpcError(-32000, `Rate limit exceeded; retry in ${wait}s`, 429, { 'retry-after': String(wait) });
  const pv = req.headers.get('mcp-protocol-version');
  if (pv && !MCP_VERSIONS.includes(pv)) return rpcError(-32600, `Unsupported MCP-Protocol-Version ${pv}. Supported: ${MCP_VERSIONS.join(', ')}`, 400);
  const ct = req.headers.get('content-type') || '';
  if (ct && !ct.includes('application/json')) return rpcError(-32700, 'Content-Type must be application/json', 415);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return rpcError(-32600, 'Request too large', 413);
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return rpcError(-32700, 'Parse error', 400); }

  const batch = Array.isArray(msg);
  const list = batch ? msg.slice(0, 20) : [msg];
  if (batch && !list.length) return rpcError(-32600, 'Invalid Request', 400);
  // 2026-07-28: Mcp-Method / Mcp-Name headers mirror the body so gateways can route without parsing; reject a mismatch
  const hm = req.headers.get('mcp-method'), hn = req.headers.get('mcp-name');
  if (!batch && msg && typeof msg === 'object' && ((hm && hm !== msg.method) || (hm && hn && hn !== (msg.params?.name ?? msg.params?.uri)))) {
    return rpcError(-32600, 'HeaderMismatch: Mcp-Method/Mcp-Name headers do not match the request body', 400, {}, msg?.id ?? null);
  }
  const replies = (await Promise.all(list.map((m: any) => handleMessage(m, ip, domainLimit)))).filter(Boolean);
  if (!replies.length) return out(null, 202); // only notifications / responses
  const init = !batch && msg?.method === 'initialize' ? (replies[0] as any)?.result?.protocolVersion : null;
  return out(batch ? replies : replies[0], 200, { 'mcp-protocol-version': init || pv || MCP_LATEST });
}

/** Browsers and humans get a short description; MCP clients asking for an SSE stream get 405 (no server-initiated messages). */
export async function GET(req: Request) {
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/event-stream')) return new Response(null, { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS' } });
  const site = new URL(req.url).origin;
  return out({
    ...SERVER_INFO, transport: 'streamable-http', endpoint: `${site}/api/mcp`, protocolVersions: MCP_VERSIONS, authentication: 'none',
    readOnly: true, tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    resources: RESOURCES.map((r) => r.uri), prompts: PROMPTS.map((p) => p.name),
    howToConnect: `${site}/ai`,
  }, 200, { allow: 'GET, POST, OPTIONS' });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS' } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
