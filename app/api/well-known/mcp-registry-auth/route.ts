// /.well-known/mcp-registry-auth (rewrite in next.config.mjs): proves to the official MCP Registry that we own
// globalhostia.com, so the server can be published as com.globalhostia/store (HTTP domain verification).
// The value is the owner's Ed25519 PUBLIC key line, pasted once in Admin > AI & MCP (setting mcp_registry_auth),
// or the MCP_REGISTRY_AUTH env var. 404 until set. The private key never touches this site.
import { getSettings } from '@/lib/settings';
import { AUTH_LINE } from '@/lib/agents/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const line = String(s.mcp_registry_auth || process.env.MCP_REGISTRY_AUTH || '').trim();
  if (!AUTH_LINE.test(line)) return new Response('Not configured\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  return new Response(line + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
