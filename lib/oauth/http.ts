// HTTP helpers for the OAuth endpoints and discovery documents: the canonical base URL (issuer), CORS (browser-based
// clients such as MCP Inspector call /oauth/token and /oauth/register), no-store JSON and RFC 6749 error bodies.
import 'server-only';
import { PROFILE_PATH, SCOPE_NAMES, EXTRA_SCOPES, resourceFor, type Profile } from './core';

/**
 * Issuer / resource base. Production is pinned to https://globalhostia.com (never the Host header), so tokens and
 * metadata cannot be minted for another origin. CONNECTOR_BASE_URL overrides; previews and local dev use their own origin.
 */
export function baseUrl(req: Request): string {
  const env = process.env.CONNECTOR_BASE_URL;
  if (env && /^https?:\/\/[^/]+$/.test(env.replace(/\/$/, ''))) return env.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://globalhostia.com';
  const u = new URL(req.url);
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || u.host).split(',')[0].trim();
  const proto = (req.headers.get('x-forwarded-proto') || u.protocol.replace(':', '')).split(',')[0].trim();
  return `${proto === 'http' && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'https' : proto}://${host}`;
}

/** HttpOnly cookie holding the signed authorize request while the customer signs in (15 minutes). */
export const PENDING_COOKIE = 'gh_oauth_req';

export const OAUTH_CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version',
  'access-control-max-age': '86400',
};

export const noStore = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache', ...OAUTH_CORS, ...extra } });

export const oauthError = (error: string, description: string, status = 400, extra: Record<string, string> = {}) => noStore({ error, error_description: description }, status, extra);

export const preflight = () => new Response(null, { status: 204, headers: OAUTH_CORS });

/** Read a form-urlencoded body (RFC 6749 §4.1.3); JSON is accepted too for lenient clients. */
export async function formBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') || '';
  const raw = (await req.text()).slice(0, 16_384);
  if (/application\/json/i.test(ct)) {
    try { const j = JSON.parse(raw); return Object.fromEntries(Object.entries(j || {}).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)])); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/** client_secret_basic credentials, if sent. */
export function basicAuth(req: Request): { id: string; secret: string } | null {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const s = Buffer.from(m[1], 'base64').toString('utf8');
  const i = s.indexOf(':');
  if (i < 1) return null;
  try { return { id: decodeURIComponent(s.slice(0, i)), secret: decodeURIComponent(s.slice(i + 1)) }; } catch { return null; }
}

/* ------------------------------------------------------------------ discovery documents */
export const prmUrl = (base: string, p: Profile) => `${base}/.well-known/oauth-protected-resource${PROFILE_PATH[p]}`;

/** RFC 9728 Protected Resource Metadata for one MCP endpoint. */
export const protectedResourceMetadata = (base: string, p: Profile) => ({
  resource: resourceFor(base, p),
  authorization_servers: [base],
  scopes_supported: SCOPE_NAMES,
  bearer_methods_supported: ['header'],
  resource_name: p === 'chatgpt' ? 'GlobalHostia (ChatGPT)' : 'GlobalHostia',
  resource_documentation: `${base}/docs/mcp`,
  resource_policy_uri: `${base}/privacy-policy`,
  resource_tos_uri: `${base}/terms-conditions`,
});

/** RFC 8414 Authorization Server Metadata. */
export const authServerMetadata = (base: string) => ({
  issuer: base,
  authorization_endpoint: `${base}/oauth/authorize`,
  token_endpoint: `${base}/oauth/token`,
  registration_endpoint: `${base}/oauth/register`,
  revocation_endpoint: `${base}/oauth/revoke`,
  scopes_supported: [...SCOPE_NAMES, ...EXTRA_SCOPES],
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  code_challenge_methods_supported: ['S256'],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
  service_documentation: `${base}/docs/mcp`,
  op_policy_uri: `${base}/privacy-policy`,
  op_tos_uri: `${base}/terms-conditions`,
});

export const prmResponse = (req: Request, p: Profile) => new Response(JSON.stringify(protectedResourceMetadata(baseUrl(req), p), null, 2), {
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300', ...OAUTH_CORS },
});
