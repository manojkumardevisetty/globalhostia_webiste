// GlobalHostia connector for ChatGPT (Apps SDK): same tools as /mcp minus commerce (plan search, cart and renewal
// links) unless switched on in Admin → AI connectors; auth challenges are returned in _meta["mcp/www_authenticate"].
import { handleMcpPost, mcpGet, mcpMethodNotAllowed, mcpOptions } from '@/lib/connector/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = (req: Request) => handleMcpPost(req, 'chatgpt');
export const GET = (req: Request) => mcpGet(req, 'chatgpt');
export const DELETE = mcpMethodNotAllowed;
export const OPTIONS = mcpOptions;
