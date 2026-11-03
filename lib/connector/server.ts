// Authenticated GlobalHostia MCP server (Streamable HTTP, stateless, JSON responses) behind /mcp (Claude and other MCP
// clients) and /mcp/chatgpt (ChatGPT: no commerce tools unless the owner enables them).
// Lazy authentication: initialize, tools/list and the public tools work without a token; a tools/call for an account
// tool without a token is answered before any tool code runs with
//   /mcp          HTTP 401 + WWW-Authenticate: Bearer resource_metadata=… scope=…   (Claude's sign-in trigger)
//   /mcp/chatgpt  a tool error carrying _meta["mcp/www_authenticate"]              (ChatGPT's linking trigger)
// A token that is present but invalid, expired, revoked or minted for another resource is always HTTP 401.
// A token without the tool's scope gets 403 insufficient_scope (step-up) on /mcp, the _meta challenge on /mcp/chatgpt.
// Sign-in up front (HTTP 401 on the first request without a token, the standard MCP client trigger) for
//   /mcp/auth     always (same tools and token audience as /mcp, for CLI / IDE clients that only offer sign-in on a 401)
//   /mcp          when Claude Code initializes (clientInfo.name "claude-code"): Claude Code only offers
//                 "Authenticate" in /mcp for servers that answered 401, so lazy auth would leave it signed out for good.
import 'server-only';
import { SCOPE_NAMES, bearerToken, isClaudeCodeInit, resourceFor, wwwAuthenticate, type Profile } from '../oauth/core';
import { baseUrl, prmUrl } from '../oauth/http';
import { verifyAccess } from '../oauth/store';
import { MCP_VERSIONS, MCP_LATEST } from '../agents/mcp';
import { clientIp, limiter } from '../agents/http';
import { connectorConfig } from './config';
import { ToolFail, listEntries, needsAuth, runTool, type Access, type ToolCtx } from './tools';
import { connectorDeps, friendly } from './deps';

const ipLimit = limiter(240, 60_000);
const MAX_BODY = 64 * 1024;

export const SERVER = (p: Profile) => ({
  name: p === 'chatgpt' ? 'globalhostia-chatgpt' : 'globalhostia', title: 'GlobalHostia', version: '2.0.0', websiteUrl: 'https://globalhostia.com/connectors',
  description: 'Manage your GlobalHostia hosting, domains, DNS, email, SSL, invoices and support tickets.',
  icons: [{ src: 'https://globalhostia.com/connectors/globalhostia-icon.svg', mimeType: 'image/svg+xml', sizes: ['any'] }, { src: 'https://globalhostia.com/connectors/globalhostia-512.png', mimeType: 'image/png', sizes: ['512x512'] }],
});

export const INSTRUCTIONS = (p: Profile, commerce: boolean) => [
  'GlobalHostia (Dubai, UAE) hosting, VPS, servers, domains, DNS, email and SSL.',
  'Account tools act only on the signed-in customer\'s own account; ids and domain names come from the list tools (list_services, list_domains, list_dns_records, list_invoices, list_tickets, get_renewals).',
  'Changes ask the customer first. Destructive tools (delete_dns_record, update_dns_record, delete_mailbox, set_nameservers) refuse until called with confirm: true after the customer explicitly confirms the exact change.',
  commerce ? 'Prices come from the billing system: quote only prices these tools return. Purchases and renewals are completed by the customer on globalhostia.com; no tool takes payment.' : 'This server does not sell or take payments.',
  'For anything the tools cannot do (refunds, cancellations, server problems), offer open_ticket.',
].join(' ');

const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name, last-event-id',
  'access-control-expose-headers': 'mcp-protocol-version, www-authenticate, retry-after',
};
const reply = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...CORS, 'cache-control': 'no-store', ...(body === null ? {} : { 'content-type': 'application/json' }), ...extra } });

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const MAX_TEXT = 24_000;
function toolResult(summary: string, data: Record<string, unknown>) {
  let json = JSON.stringify(data);
  if (json.length > MAX_TEXT) json = `${json.slice(0, MAX_TEXT)}… (truncated; ask for fewer items)`;
  return { content: [{ type: 'text', text: `${summary}\n\n${json}` }], structuredContent: data };
}

export type McpOptions = { requireAuth?: boolean };

export async function handleMcpPost(req: Request, profile: Profile, opts: McpOptions = {}): Promise<Response> {
  const ip = clientIp(req);
  const wait = ipLimit(ip);
  if (wait) return reply({ jsonrpc: '2.0', id: null, error: { code: -32000, message: `Rate limit exceeded; retry in ${wait}s` } }, 429, { 'retry-after': String(wait) });
  const pv = req.headers.get('mcp-protocol-version');
  if (pv && !MCP_VERSIONS.includes(pv)) return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `Unsupported MCP-Protocol-Version ${pv}. Supported: ${MCP_VERSIONS.join(', ')}` } }, 400);
  const ct = req.headers.get('content-type') || '';
  if (ct && !ct.includes('application/json')) return reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Content-Type must be application/json' } }, 415);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, 413);
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return reply({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const batch = Array.isArray(msg);
  const list: Msg[] = batch ? msg.slice(0, 20) : [msg];
  if (batch && !list.length) return reply({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);

  const base = baseUrl(req);
  const resource = resourceFor(base, profile);
  const prm = prmUrl(base, profile);
  const challenge = (o: Parameters<typeof wwwAuthenticate>[0]) => wwwAuthenticate(o);

  // 1. a presented token must be valid and minted for this endpoint (RFC 8707 audience)
  let access: Access | null = null;
  const tok = bearerToken(req.headers.get('authorization'));
  if (req.headers.get('authorization') && !tok) {
    return reply({ error: 'invalid_token', error_description: 'Malformed Authorization header' }, 401, { 'www-authenticate': challenge({ resourceMetadata: prm, error: 'invalid_token', description: 'Malformed Authorization header' }) });
  }
  if (tok) {
    const info = await verifyAccess(tok).catch((e) => { console.error('[connector] verify', e); return 'error' as const; });
    if (info === 'error') return reply({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Sign-in could not be checked right now. Please retry.' } }, 503, { 'retry-after': '5' });
    if (!info || info.resource.replace(/\/+$/, '') !== resource) {
      return reply({ error: 'invalid_token', error_description: 'The access token is invalid, expired, revoked or for another resource' }, 401,
        { 'www-authenticate': challenge({ resourceMetadata: prm, error: 'invalid_token', description: 'The access token is invalid, expired, revoked or for another resource', scope: SCOPE_NAMES }) });
    }
    access = { cid: info.cid, scopes: info.scopes, clientId: info.clientId, grantId: info.grantId, platform: info.platform, email: info.email };
  }

  // 2a. sign-in up front: /mcp/auth always, /mcp for Claude Code's initialize
  if (!access && profile === 'claude' && (opts.requireAuth || isClaudeCodeInit(list, req.headers.get('user-agent')))) {
    return reply({ error: 'invalid_token', error_description: 'Sign in to GlobalHostia to use this server' }, 401,
      { 'www-authenticate': challenge({ resourceMetadata: prm, error: 'invalid_token', description: 'Sign in to GlobalHostia to use this server', scope: SCOPE_NAMES }) });
  }

  const cfg = await connectorConfig();
  const commerce = profile === 'claude' || cfg.chatgptCommerce;

  // 2. lazy auth gate (Claude): answer before any tool runs
  if (profile === 'claude') {
    for (const m of list) {
      if (m?.method !== 'tools/call') continue;
      const need = needsAuth(m.params?.name, { profile, commerce, access });
      if (need?.kind === 'auth') {
        return reply({ error: 'invalid_token', error_description: 'Sign in to GlobalHostia to use this tool' }, 401,
          { 'www-authenticate': challenge({ resourceMetadata: prm, error: 'invalid_token', description: 'Sign in to GlobalHostia to use this tool', scope: SCOPE_NAMES }) });
      }
      if (need?.kind === 'scope') {
        const want = [...new Set([...(access?.scopes || []), need.scope])];
        return reply({ error: 'insufficient_scope', error_description: `This tool needs the ${need.scope} permission` }, 403,
          { 'www-authenticate': challenge({ resourceMetadata: prm, error: 'insufficient_scope', description: `This tool needs the ${need.scope} permission`, scope: want }) });
      }
    }
  }

  let deps: Awaited<ReturnType<typeof connectorDeps>> | null = null;
  const ctxFor = async (): Promise<ToolCtx> => {
    deps ||= await connectorDeps({ base, ip });
    return { profile, access, deps, ip, enabled: cfg.enabled, commerce, reviewer: cfg.reviewer };
  };

  const handle = async (m: Msg) => {
    const isReq = m && typeof m === 'object' && 'id' in m && m.id !== null && m.id !== undefined;
    const id = isReq ? m.id! : null;
    const err = (code: number, message: string, data?: unknown) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
    if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return err(-32600, 'Invalid Request');
    if (!isReq) return null;
    const p = m.params && typeof m.params === 'object' ? m.params : {};
    switch (m.method) {
      case 'initialize': {
        const want = String(p.protocolVersion || '');
        return { jsonrpc: '2.0', id, result: { protocolVersion: MCP_VERSIONS.includes(want) ? want : MCP_LATEST, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER(profile), instructions: INSTRUCTIONS(profile, commerce) } };
      }
      case 'ping': return { jsonrpc: '2.0', id, result: {} };
      case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: listEntries(profile, commerce) } };
      case 'resources/list': return { jsonrpc: '2.0', id, result: { resources: [] } };
      case 'resources/templates/list': return { jsonrpc: '2.0', id, result: { resourceTemplates: [] } };
      case 'prompts/list': return { jsonrpc: '2.0', id, result: { prompts: [] } };
      case 'tools/call': {
        if (typeof p.name !== 'string') return err(-32602, 'params.name is required');
        const args = p.arguments && typeof p.arguments === 'object' && !Array.isArray(p.arguments) ? p.arguments : {};
        try {
          const r = await runTool(p.name, args, await ctxFor());
          return { jsonrpc: '2.0', id, result: toolResult(r.summary, r.data) };
        } catch (e) {
          const f = friendly(e);
          if (!f) {
            console.error('[connector] tool', p.name, e);
            return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'GlobalHostia could not complete this right now. Please try again in a moment.' }], isError: true } };
          }
          if (f.code === 'not_found' && f.message.startsWith('Unknown tool')) return err(-32602, f.message);
          const result: Record<string, unknown> = { content: [{ type: 'text', text: f.message }], structuredContent: { error: f.code, message: f.message, ...(f.data || {}) }, isError: true };
          if (f.code === 'auth' || f.code === 'scope') {
            result._meta = { 'mcp/www_authenticate': [challenge({ resourceMetadata: prm, error: f.code === 'auth' ? 'invalid_token' : 'insufficient_scope', description: f.message, scope: f.code === 'scope' ? [...new Set([...(access?.scopes || []), String(f.data?.required_scope || '')])].filter(Boolean) : SCOPE_NAMES })] };
          }
          return { jsonrpc: '2.0', id, result };
        }
      }
      default: return err(-32601, `Method not found: ${m.method}`);
    }
  };

  const replies = (await Promise.all(list.map(handle))).filter(Boolean);
  if (!replies.length) return reply(null, 202);
  const init = !batch && msg?.method === 'initialize' ? (replies[0] as any)?.result?.protocolVersion : null;
  return reply(batch ? replies : replies[0], 200, { 'mcp-protocol-version': init || pv || MCP_LATEST });
}

export function mcpGet(req: Request, profile: Profile, opts: McpOptions = {}) {
  // no server-initiated SSE stream (stateless JSON server): 405 is the Streamable HTTP answer
  if ((req.headers.get('accept') || '').includes('text/event-stream')) return new Response(null, { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS' } });
  const base = baseUrl(req);
  return reply({
    ...SERVER(profile), transport: 'streamable-http', endpoint: opts.requireAuth ? `${base}/mcp/auth` : resourceFor(base, profile), protocolVersions: MCP_VERSIONS,
    authentication: { type: 'oauth2', protectedResourceMetadata: prmUrl(base, profile), authorizationServer: base, lazy: !opts.requireAuth, ...(opts.requireAuth ? { resource: resourceFor(base, profile) } : {}) },
    documentation: `${base}/docs/mcp`,
  }, 200, { allow: 'GET, POST, OPTIONS' });
}

export const mcpOptions = () => new Response(null, { status: 204, headers: CORS });
export const mcpMethodNotAllowed = () => new Response(null, { status: 405, headers: { ...CORS, allow: 'GET, POST, OPTIONS' } });
