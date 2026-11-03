// GlobalHostia connector for Claude and other MCP clients: authenticated (OAuth 2.1, lazy) Streamable HTTP MCP server.
// The public read-only shopping server stays at /api/mcp. See lib/connector/server.ts and /docs/mcp.
import { handleMcpPost, mcpGet, mcpMethodNotAllowed, mcpOptions } from '@/lib/connector/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = (req: Request) => handleMcpPost(req, 'claude');
export const GET = (req: Request) => mcpGet(req, 'claude');
export const DELETE = mcpMethodNotAllowed;
export const OPTIONS = mcpOptions;
