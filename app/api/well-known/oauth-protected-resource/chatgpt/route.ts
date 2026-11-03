// RFC 9728 Protected Resource Metadata for /mcp/chatgpt (served at /.well-known/oauth-protected-resource/mcp/chatgpt).
import { prmResponse, preflight } from '@/lib/oauth/http';

export const dynamic = 'force-dynamic';

export const GET = (req: Request) => prmResponse(req, 'chatgpt');
export const OPTIONS = preflight;
