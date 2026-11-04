// OAuth 2.1 token endpoint: authorization_code (PKCE S256 required) and refresh_token (rotated on every use).
// application/x-www-form-urlencoded per RFC 6749 §4.1.3 (JSON tolerated). Errors are RFC 6749 codes (invalid_grant …).
// Client authentication: none (public), client_secret_post / _basic (DCR secret) or private_key_jwt (RFC 7523
// client_assertion, e.g. ChatGPT's client metadata document); the client_id may come from the assertion alone.
import { assertionClientId, canonicalResource, parseScope } from '@/lib/oauth/core';
import { OAuthError, authenticateClient, findClient, redeemCode, refreshTokens } from '@/lib/oauth/store';
import { baseUrl, basicAuth, formBody, noStore, oauthError, preflight } from '@/lib/oauth/http';
import { connectorConfig } from '@/lib/connector/config';
import { clientIp, limiter } from '@/lib/agents/http';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const tokenLimit = limiter(300, 60_000);

export async function POST(req: Request) {
  { const blocked = await guard(req, 'oauth'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const wait = tokenLimit(clientIp(req));
  if (wait) return oauthError('slow_down', `Too many requests; retry in ${wait}s`, 429, { 'retry-after': String(wait) });
  const b = await formBody(req);
  const basic = basicAuth(req);
  const clientId = b.client_id || basic?.id || (b.client_assertion ? assertionClientId(b.client_assertion) : null) || '';
  if (basic && b.client_id && basic.id !== b.client_id) return oauthError('invalid_request', 'client_id differs between the body and the Authorization header');
  const base = baseUrl(req);
  const resource = b.resource ? canonicalResource(base, b.resource) : null;
  try {
    const client = await findClient(clientId);
    if (!client || client.disabled) return oauthError('invalid_client', 'Unknown or disabled client', 401);
    try {
      await authenticateClient(client, { secret: b.client_secret || basic?.secret || null, assertion: b.client_assertion, assertionType: b.client_assertion_type }, [`${base}/oauth/token`, base]);
    } catch (e) {
      if (!(e instanceof OAuthError)) throw e;
      console.warn('[oauth] token client auth failed', client.id, client.authMethods.join(' '), e.message);
      return oauthError('invalid_client', e.message, 401, basic ? { 'www-authenticate': 'Basic realm="globalhostia"' } : {});
    }
    const cfg = await connectorConfig();
    if (!cfg.enabled) return oauthError('temporarily_unavailable', 'Connectors are paused by GlobalHostia. Please try again later.', 503);
    if (b.grant_type === 'authorization_code') {
      if (!b.code || !b.redirect_uri) return oauthError('invalid_request', 'code and redirect_uri are required');
      if (!b.code_verifier) return oauthError('invalid_request', 'code_verifier is required (PKCE)');
      return noStore(await redeemCode({ code: b.code, clientId: client.id, redirectUri: b.redirect_uri, verifier: b.code_verifier, resource }));
    }
    if (b.grant_type === 'refresh_token') {
      if (!b.refresh_token) return oauthError('invalid_request', 'refresh_token is required');
      let scope: string[] | null = null;
      if (b.scope) { const p = parseScope(b.scope); if (!p.ok) return oauthError('invalid_scope', `Unknown scope: ${p.unknown.join(' ')}`); scope = p.scopes; }
      return noStore(await refreshTokens({ refreshToken: b.refresh_token, clientId: client.id, scope, resource }));
    }
    return oauthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  } catch (e) {
    if (e instanceof OAuthError) return oauthError(e.code, e.message, e.code === 'invalid_client' ? 401 : e.status);
    console.error('[oauth] token', e);
    return oauthError('server_error', 'The token request could not be completed. Please try again.', 500);
  }
}

export const OPTIONS = preflight;
