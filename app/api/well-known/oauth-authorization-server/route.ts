// RFC 8414 Authorization Server Metadata at /.well-known/oauth-authorization-server (rewrite in next.config.mjs).
import { authServerMetadata, baseUrl, OAUTH_CORS, preflight } from '@/lib/oauth/http';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return new Response(JSON.stringify(authServerMetadata(baseUrl(req)), null, 2), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...OAUTH_CORS },
  });
}
export const OPTIONS = preflight;
