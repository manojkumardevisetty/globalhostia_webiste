// OAuth 2.0 Token Revocation (RFC 7009). Revoking a refresh token ends the whole connection (grant); an access token
// only itself. Always 200 for unknown tokens, as the RFC requires.
import { assertionClientId } from '@/lib/oauth/core';
import { OAuthError, authenticateClient, findClient, revokeToken } from '@/lib/oauth/store';
import { baseUrl, basicAuth, formBody, oauthError, preflight, OAUTH_CORS } from '@/lib/oauth/http';
import { clientIp, limiter } from '@/lib/agents/http';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const revokeLimit = limiter(120, 60_000);

export async function POST(req: Request) {
  { const blocked = await guard(req, 'oauth'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const wait = revokeLimit(clientIp(req));
  if (wait) return oauthError('slow_down', `Too many requests; retry in ${wait}s`, 429, { 'retry-after': String(wait) });
  const b = await formBody(req);
  const basic = basicAuth(req);
  if (!b.token || b.token.length > 512) return oauthError('invalid_request', 'token is required');
  try {
    const client = await findClient(b.client_id || basic?.id || (b.client_assertion ? assertionClientId(b.client_assertion) : null) || '');
    if (!client) return oauthError('invalid_client', 'Unknown client', 401);
    const base = baseUrl(req);
    await authenticateClient(client, { secret: b.client_secret || basic?.secret || null, assertion: b.client_assertion, assertionType: b.client_assertion_type }, [`${base}/oauth/revoke`, `${base}/oauth/token`, base]);
    await revokeToken(b.token, client.id);
  } catch (e) {
    if (e instanceof OAuthError) return oauthError(e.code, e.message, e.code === 'invalid_client' ? 401 : e.status);
    console.error('[oauth] revoke', e);
    return oauthError('server_error', 'Revocation failed; please retry.', 500);
  }
  return new Response(null, { status: 200, headers: { 'cache-control': 'no-store', ...OAUTH_CORS } });
}

export const OPTIONS = preflight;
