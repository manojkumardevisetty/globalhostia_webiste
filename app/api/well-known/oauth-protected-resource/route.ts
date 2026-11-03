// RFC 9728 Protected Resource Metadata. /.well-known/oauth-protected-resource and …/mcp describe /mcp;
// …/mcp/chatgpt is served by ./chatgpt (rewrites in next.config.mjs).
import { prmResponse, preflight } from '@/lib/oauth/http';

export const dynamic = 'force-dynamic';

export const GET = (req: Request) => prmResponse(req, 'claude');
export const OPTIONS = preflight;
