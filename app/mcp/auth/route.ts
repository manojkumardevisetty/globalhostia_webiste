// GlobalHostia connector with sign-in required up front: the same server, tools and token audience as /mcp
// (resource https://globalhostia.com/mcp), but every request without a token gets HTTP 401 + WWW-Authenticate.
// For MCP clients (CLI and IDE apps) that only start OAuth when the server answers 401. See lib/connector/server.ts.
import { handleMcpPost, mcpGet, mcpMethodNotAllowed, mcpOptions } from '@/lib/connector/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = (req: Request) => handleMcpPost(req, 'claude', { requireAuth: true });
export const GET = (req: Request) => mcpGet(req, 'claude', { requireAuth: true });
export const DELETE = mcpMethodNotAllowed;
export const OPTIONS = mcpOptions;
