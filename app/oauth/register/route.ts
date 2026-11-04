// OAuth 2.0 Dynamic Client Registration (RFC 7591) for MCP clients (Claude, ChatGPT, MCP Inspector, others).
// Public clients by default (confidential: client_secret_post / _basic, or private_key_jwt with jwks_uri / jwks); redirect URIs outside Claude / ChatGPT / loopback are accepted but flagged (or refused
// when Admin → AI connectors → "Only Claude, ChatGPT and local apps" is on).
import { classifyRedirect, validateDcr } from '@/lib/oauth/core';
import { registerClient } from '@/lib/oauth/store';
import { noStore, oauthError, preflight } from '@/lib/oauth/http';
import { connectorConfig } from '@/lib/connector/config';
import { clientIp, limiter } from '@/lib/agents/http';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
// Claude registers once per connection from a shared egress range: keep this generous
const regLimit = limiter(120, 60_000);

export async function POST(req: Request) {
  { const blocked = await guard(req, 'oauth'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const wait = regLimit(clientIp(req));
  if (wait) return oauthError('slow_down', `Too many registrations; retry in ${wait}s`, 429, { 'retry-after': String(wait) });
  const cfg = await connectorConfig();
  if (!cfg.enabled) return oauthError('temporarily_unavailable', 'Connecting new apps is paused. Please try again later.', 503);
  if (!/application\/json/i.test(req.headers.get('content-type') || '')) return oauthError('invalid_client_metadata', 'Content-Type must be application/json');
  let body: unknown;
  try { body = JSON.parse((await req.text()).slice(0, 16_384)); } catch { return oauthError('invalid_client_metadata', 'Body is not valid JSON'); }
  const v = validateDcr(body);
  if (!v.ok) return oauthError(v.error, v.description);
  if (cfg.blockUnknownRedirects && v.meta.redirectUris.some((u) => { const c = classifyRedirect(u); return !c.ok || c.flagged; })) {
    return oauthError('invalid_redirect_uri', 'Only Claude, ChatGPT and local (loopback) redirect URIs are accepted');
  }
  const { client, secret, issuedAt } = await registerClient(v.meta);
  return noStore({
    client_id: client.id, client_id_issued_at: issuedAt, client_name: client.name, redirect_uris: client.redirectUris,
    grant_types: v.grantTypes, response_types: ['code'], token_endpoint_auth_method: client.authMethod,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    ...(v.meta.jwksUri ? { jwks_uri: v.meta.jwksUri } : {}), ...(v.meta.jwks ? { jwks: v.meta.jwks } : {}),
    ...(v.meta.clientUri ? { client_uri: v.meta.clientUri } : {}), ...(v.meta.logoUri ? { logo_uri: v.meta.logoUri } : {}),
  }, 201);
}

export const OPTIONS = preflight;
