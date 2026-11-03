// OAuth 2.1 authorization server for the GlobalHostia connector (Claude / ChatGPT / any MCP client): the pure parts.
// Scopes, PKCE (S256 only), opaque token minting + hashing, redirect URI rules (Claude, ChatGPT, loopback for Claude Code
// and MCP Inspector), Client ID Metadata Documents, Dynamic Client Registration input checks, signed consent requests
// and the WWW-Authenticate challenge. Only node:crypto, so tests/oauth.test.mts imports it directly.
// Specs: OAuth 2.1 draft, RFC 7636 (PKCE), RFC 7591 (DCR), RFC 8414, RFC 9728, RFC 8707, RFC 9207, RFC 8252,
// RFC 7523 (private_key_jwt client assertions), MCP authorization 2025-06-18 / 2025-11-25, draft-ietf-oauth-client-id-metadata-document.
import { constants as cryptoConstants, createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import net from 'node:net';

/* ------------------------------------------------------------------ scopes */
export type ScopeDef = { label: string; detail: string; write: boolean };
/** Every scope, in the order the consent page lists them. Labels are shown to customers verbatim. */
export const SCOPES: Record<string, ScopeDef> = {
  'account:read': { label: 'See your services and domains', detail: 'Products and services, domains with expiry, auto-renew and nameservers, renewals, site health and email settings.', write: false },
  'billing:read': { label: 'See your invoices', detail: 'Invoice list, totals, due dates and line items. No card or bank details are ever shared.', write: false },
  'dns:read': { label: 'See DNS records', detail: 'DNS records of domains managed at GlobalHostia.', write: false },
  'support:read': { label: 'See your support tickets', detail: 'Ticket list, status and the conversation.', write: false },
  'dns:write': { label: 'Change DNS records', detail: 'Add, edit and delete DNS records on your domains.', write: true },
  'email:write': { label: 'Manage mailboxes', detail: 'Create and delete mailboxes on your hosting. Passwords are never sent through the assistant.', write: true },
  'ssl:write': { label: 'Issue free SSL certificates', detail: 'Request free certificates for domains on your hosting.', write: true },
  'domains:write': { label: 'Change domain settings', detail: 'Turn auto-renew on or off and change nameservers.', write: true },
  'support:write': { label: 'Open and reply to tickets', detail: 'Open support tickets and add replies in your name.', write: true },
  'cart:write': { label: 'Prepare renewal links', detail: 'Build links to renew your services and domains. You always review and pay on globalhostia.com yourself.', write: true },
};
export const SCOPE_NAMES = Object.keys(SCOPES);
/** Accepted on requests (Claude appends it when advertised) but adds nothing: refresh tokens are always issued. */
export const EXTRA_SCOPES = ['offline_access'];

/** Parse a space-separated scope string. Empty means "everything" (clients that send no scope). */
export function parseScope(raw: unknown): { ok: true; scopes: string[] } | { ok: false; unknown: string[] } {
  const parts = typeof raw === 'string' ? raw.split(/\s+/).filter(Boolean) : [];
  if (!parts.length) return { ok: true, scopes: [...SCOPE_NAMES] };
  const unknown = parts.filter((s) => !SCOPES[s] && !EXTRA_SCOPES.includes(s));
  if (unknown.length) return { ok: false, unknown };
  const scopes = SCOPE_NAMES.filter((s) => parts.includes(s));
  // only offline_access asked for: treat as "everything"
  return { ok: true, scopes: scopes.length ? scopes : [...SCOPE_NAMES] };
}
export const scopeString = (s: string[]) => SCOPE_NAMES.filter((x) => s.includes(x)).join(' ');

/* ------------------------------------------------------------------ tokens and PKCE */
const b64url = (b: Buffer) => b.toString('base64url');
export const randomToken = (prefix: string, bytes = 32) => `${prefix}${b64url(randomBytes(bytes))}`;
/** Tokens and codes are stored only as SHA-256 hashes. */
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export const PKCE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
export const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
export const s256 = (verifier: string) => b64url(createHash('sha256').update(verifier, 'ascii').digest());
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== 'string' || !PKCE_VERIFIER.test(verifier) || !PKCE_CHALLENGE.test(challenge)) return false;
  const a = Buffer.from(s256(verifier)), b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const ACCESS_TTL_S = 3600;
export const REFRESH_TTL_S = 60 * 24 * 3600;
/** A grant (one consent) lives at most this long; refresh tokens never outlive it. */
export const GRANT_TTL_S = 90 * 24 * 3600;
export const CODE_TTL_S = 300;

/* ------------------------------------------------------------------ redirect URIs */
export type RedirectKind = 'claude' | 'chatgpt' | 'loopback' | 'https' | 'native';
export const CLAUDE_CALLBACKS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
export const CHATGPT_CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CHATGPT_CALLBACK_ID = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Classify one redirect URI. Claude, ChatGPT and loopback (Claude Code, MCP Inspector) are known; other https URIs and
 * private-use schemes are allowed but `flagged` (the consent page warns, the admin can block them). Plain http outside
 * loopback, fragments, credentials and dangerous schemes are refused.
 */
export function classifyRedirect(raw: unknown): { ok: true; uri: string; kind: RedirectKind; flagged: boolean } | { ok: false; reason: string } {
  if (typeof raw !== 'string' || !raw || raw.length > 512) return { ok: false, reason: 'redirect_uri must be a URL of at most 512 characters' };
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'redirect_uri is not a valid URL' }; }
  if (u.hash || raw.includes('#')) return { ok: false, reason: 'redirect_uri must not contain a fragment' };
  if (u.username || u.password) return { ok: false, reason: 'redirect_uri must not contain credentials' };
  if (CLAUDE_CALLBACKS.includes(raw)) return { ok: true, uri: raw, kind: 'claude', flagged: false };
  if (raw === CHATGPT_CALLBACK || CHATGPT_CALLBACK_ID.test(raw)) return { ok: true, uri: raw, kind: 'chatgpt', flagged: false };
  if (u.protocol === 'http:') {
    if (LOOPBACK_HOSTS.has(u.hostname)) return { ok: true, uri: raw, kind: 'loopback', flagged: false };
    return { ok: false, reason: 'http redirect URIs are only allowed for localhost / 127.0.0.1' };
  }
  if (u.protocol === 'https:') return { ok: true, uri: raw, kind: 'https', flagged: true };
  // RFC 8252 private-use scheme for native apps (reverse domain, e.g. com.example.app:/callback)
  if (/^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/.test(u.protocol) && !/^(javascript|data|vbscript|file|blob|about):$/.test(u.protocol)) return { ok: true, uri: raw, kind: 'native', flagged: true };
  return { ok: false, reason: 'redirect_uri scheme is not allowed' };
}

/** Exact match, except loopback URIs where the port is ignored (RFC 8252 7.3; Claude Code uses localhost too). */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let r: URL;
  try { r = new URL(requested); } catch { return false; }
  if (r.protocol !== 'http:' || !LOOPBACK_HOSTS.has(r.hostname)) return false;
  return registered.some((x) => {
    try {
      const g = new URL(x);
      return g.protocol === 'http:' && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search;
    } catch { return false; }
  });
}

/** Which assistant a client belongs to (for the connected-apps list and the admin page). */
export function platformOf(clientId: string, redirectUris: string[]): 'claude' | 'chatgpt' | 'inspector' | 'other' {
  if (/^https:\/\/(claude\.ai|claude\.com)\//.test(clientId)) return 'claude';
  if (/^https:\/\/chatgpt\.com\//.test(clientId)) return 'chatgpt';
  const kinds = redirectUris.map((u) => { const c = classifyRedirect(u); return c.ok ? c.kind : 'bad'; });
  if (kinds.includes('claude')) return 'claude';
  if (kinds.includes('chatgpt')) return 'chatgpt';
  if (kinds.length && kinds.every((k) => k === 'loopback')) return 'inspector';
  return 'other';
}
export const PLATFORM_LABEL = { claude: 'Claude', chatgpt: 'ChatGPT', inspector: 'Local app (MCP Inspector / Claude Code)', other: 'Other app' } as const;

/* ------------------------------------------------------------------ Client ID Metadata Documents */
/** A CIMD client_id is an https URL with a path (draft-ietf-oauth-client-id-metadata-document). */
export function isCimdClientId(id: unknown): id is string {
  if (typeof id !== 'string' || id.length > 512 || !id.startsWith('https://')) return false;
  try {
    const u = new URL(id);
    return u.protocol === 'https:' && !u.hash && !u.username && !u.password && u.pathname.length > 1 && u.href === id && !id.split(/[?#]/)[0].split('/').some((s) => s === '.' || s === '..');
  } catch { return false; }
}

export type AuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic' | 'private_key_jwt';
export type Jwks = { keys: Record<string, unknown>[] };
/**
 * authMethod is the preferred method; authMethods every method the client may use at the token endpoint (a CIMD can
 * declare several: ChatGPT publishes token_endpoint_auth_methods_supported plus a singular preference).
 */
export type ClientMeta = { name: string; redirectUris: string[]; clientUri?: string; logoUri?: string; authMethod: AuthMethod; authMethods: AuthMethod[]; jwks?: Jwks; jwksUri?: string };

/** Token endpoint client authentication this server implements (RFC 8414 token_endpoint_auth_methods_supported). */
export const TOKEN_AUTH_METHODS: AuthMethod[] = ['none', 'private_key_jwt', 'client_secret_post', 'client_secret_basic'];
/** JWS algorithms accepted for private_key_jwt client assertions. */
export const ASSERTION_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512'];
export const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

const httpsUrl = (v: unknown) => (typeof v === 'string' && v.length <= 512 && /^https:\/\/[^\s]+$/.test(v) ? v : undefined);
const cleanName = (v: unknown, fallback: string) => (typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 100) : '') || fallback;

/** A JWK Set with 1-20 public keys (private members are dropped). Null when unusable. */
export function cleanJwks(v: unknown): Jwks | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const keys = (v as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || !keys.length || keys.length > 20) return null;
  const PRIVATE = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']);
  const out = keys.filter((k) => k && typeof k === 'object' && !Array.isArray(k) && typeof (k as any).kty === 'string' && ['RSA', 'EC'].includes((k as any).kty))
    .map((k) => Object.fromEntries(Object.entries(k as Record<string, unknown>).filter(([n]) => !PRIVATE.has(n))));
  return out.length ? { keys: out } : null;
}

/** The token endpoint methods a client declares: token_endpoint_auth_methods_supported (array) and/or token_endpoint_auth_method. */
function declaredMethods(d: Record<string, unknown>): string[] {
  const list = Array.isArray(d.token_endpoint_auth_methods_supported) ? d.token_endpoint_auth_methods_supported.filter((m): m is string => typeof m === 'string') : [];
  const one = typeof d.token_endpoint_auth_method === 'string' ? d.token_endpoint_auth_method : undefined;
  const all = [...new Set([...(one ? [one] : []), ...list])];
  return all.length ? all : ['none'];
}

/**
 * Validate a fetched CIMD: its client_id must equal the URL, redirect URIs valid, and it must be able to authenticate
 * with "none" (public client) or "private_key_jwt" (keys in jwks or jwks_uri). Shared secrets cannot exist for a
 * metadata document, so client_secret_* alone is refused with the method named in the reason.
 */
export function validateCimd(doc: unknown, url: string): { ok: true; meta: ClientMeta } | { ok: false; reason: string } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'metadata document is not a JSON object' };
  const d = doc as Record<string, unknown>;
  if (d.client_id !== url) return { ok: false, reason: 'client_id in the metadata document does not match its URL' };
  const uris = Array.isArray(d.redirect_uris) ? d.redirect_uris : [];
  if (!uris.length || uris.length > 20) return { ok: false, reason: 'metadata document needs 1-20 redirect_uris' };
  const checked = uris.map(classifyRedirect);
  const bad = checked.find((c) => !c.ok);
  if (bad && !bad.ok) return { ok: false, reason: bad.reason };
  if ('client_secret' in d || 'client_secret_expires_at' in d) return { ok: false, reason: 'a client metadata document must not contain a client secret' };
  const declared = declaredMethods(d);
  const jwksUri = httpsUrl(d.jwks_uri);
  const jwks = jwksUri ? undefined : cleanJwks(d.jwks) || undefined;
  if (d.jwks_uri !== undefined && !jwksUri) return { ok: false, reason: 'jwks_uri must be an https URL' };
  const usable = declared.filter((m): m is AuthMethod => m === 'none' || (m === 'private_key_jwt' && !!(jwksUri || jwks)));
  if (!usable.length) {
    if (declared.includes('private_key_jwt')) return { ok: false, reason: 'token_endpoint_auth_method "private_key_jwt" needs a jwks_uri or jwks with RSA or EC public keys in the metadata document' };
    return { ok: false, reason: `token_endpoint_auth_method ${declared.map((m) => `"${String(m).slice(0, 40)}"`).join(', ')} is not supported for client metadata documents (no shared secret can exist); use "none" or "private_key_jwt"` };
  }
  const one = typeof d.token_endpoint_auth_method === 'string' ? d.token_endpoint_auth_method : undefined;
  const preferred: AuthMethod = one && usable.includes(one as AuthMethod) ? one as AuthMethod : usable.includes('private_key_jwt') ? 'private_key_jwt' : 'none';
  const authMethods = [preferred, ...usable.filter((m) => m !== preferred)];
  return { ok: true, meta: { name: cleanName(d.client_name, new URL(url).host), redirectUris: uris as string[], clientUri: httpsUrl(d.client_uri), logoUri: httpsUrl(d.logo_uri), authMethod: preferred, authMethods, ...(jwksUri ? { jwksUri } : {}), ...(jwks ? { jwks } : {}) } };
}

/* ------------------------------------------------------------------ Dynamic Client Registration (RFC 7591) */
const DCR_GRANTS = ['authorization_code', 'refresh_token'];
export function validateDcr(body: unknown): { ok: true; meta: ClientMeta; grantTypes: string[] } | { ok: false; error: 'invalid_redirect_uri' | 'invalid_client_metadata'; description: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_client_metadata', description: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10) return { ok: false, error: 'invalid_redirect_uri', description: 'redirect_uris must list 1-10 URIs' };
  for (const u of uris) { const c = classifyRedirect(u); if (!c.ok) return { ok: false, error: 'invalid_redirect_uri', description: `${String(u).slice(0, 80)}: ${c.reason}` }; }
  const asked = b.grant_types === undefined ? DCR_GRANTS : b.grant_types;
  if (!Array.isArray(asked) || !asked.length || asked.some((g) => typeof g !== 'string')) return { ok: false, error: 'invalid_client_metadata', description: 'grant_types must be an array of strings' };
  // RFC 7591 §3.2.1 lets the server narrow the metadata: unsupported extra grants (e.g. jwt-bearer) are dropped, not fatal
  const grants = DCR_GRANTS.filter((g) => asked.includes(g));
  if (!grants.includes('authorization_code')) return { ok: false, error: 'invalid_client_metadata', description: 'grant_types must include authorization_code (refresh_token is also supported)' };
  const rts = b.response_types === undefined ? ['code'] : b.response_types;
  if (!Array.isArray(rts) || rts.some((r) => r !== 'code')) return { ok: false, error: 'invalid_client_metadata', description: 'response_types may only contain code' };
  const method = b.token_endpoint_auth_method ?? 'none';
  if (typeof method !== 'string' || !TOKEN_AUTH_METHODS.includes(method as AuthMethod)) return { ok: false, error: 'invalid_client_metadata', description: `token_endpoint_auth_method must be one of ${TOKEN_AUTH_METHODS.join(', ')}` };
  let jwks: Jwks | undefined, jwksUri: string | undefined;
  if (method === 'private_key_jwt') {
    jwksUri = httpsUrl(b.jwks_uri);
    jwks = jwksUri ? undefined : cleanJwks(b.jwks) || undefined;
    if (!jwksUri && !jwks) return { ok: false, error: 'invalid_client_metadata', description: 'private_key_jwt needs jwks_uri (https) or jwks with RSA or EC public keys' };
  }
  if (b.scope !== undefined && !parseScope(b.scope).ok) return { ok: false, error: 'invalid_client_metadata', description: 'scope contains unknown values' };
  return { ok: true, meta: { name: cleanName(b.client_name, 'Unnamed app'), redirectUris: uris as string[], clientUri: httpsUrl(b.client_uri), logoUri: httpsUrl(b.logo_uri), authMethod: method as AuthMethod, authMethods: [method as AuthMethod], ...(jwksUri ? { jwksUri } : {}), ...(jwks ? { jwks } : {}) }, grantTypes: grants };
}

/* ------------------------------------------------------------------ private_key_jwt client assertions (RFC 7523 §2.2, RFC 7521) */
type Jwt = { header: Record<string, unknown>; payload: Record<string, unknown>; signingInput: string; signature: Buffer };
export function decodeJwt(token: unknown): Jwt | null {
  if (typeof token !== 'string' || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p)) || !parts[0] || !parts[1] || !parts[2]) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!header || typeof header !== 'object' || Array.isArray(header) || !payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], 'base64url') };
  } catch { return null; }
}

/** The client a (not yet verified) assertion claims to be: sub, else iss. Only used to look the client up. */
export const assertionClientId = (assertion: unknown) => { const j = decodeJwt(assertion); const v = j?.payload.sub ?? j?.payload.iss; return typeof v === 'string' ? v : null; };

const CURVE: Record<string, string> = { ES256: 'P-256', ES384: 'P-384', ES512: 'P-521' };
function keyFor(alg: string, jwk: Record<string, unknown>): KeyObject | null {
  const family = alg.slice(0, 2);
  if ((family === 'RS' || family === 'PS') !== (jwk.kty === 'RSA')) return null;
  if (family === 'ES' && (jwk.kty !== 'EC' || jwk.crv !== CURVE[alg])) return null;
  if (jwk.use !== undefined && jwk.use !== 'sig') return null;
  if (jwk.alg !== undefined && jwk.alg !== alg) return null;
  if (Array.isArray(jwk.key_ops) && !jwk.key_ops.includes('verify')) return null;
  try {
    const k = createPublicKey({ key: jwk as any, format: 'jwk' });
    if (jwk.kty === 'RSA' && (k.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) return null;
    return k;
  } catch { return null; }
}
function sigOk(alg: string, key: KeyObject, data: string, sig: Buffer): boolean {
  const hash = `sha${alg.slice(2)}`;
  try {
    if (alg.startsWith('RS')) return cryptoVerify(hash, Buffer.from(data), key, sig);
    if (alg.startsWith('PS')) return cryptoVerify(hash, Buffer.from(data), { key, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST }, sig);
    return cryptoVerify(hash, Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }, sig);
  } catch { return false; }
}

export const ASSERTION_MAX_LIFETIME_S = 3600;
const SKEW_S = 60;
const normAud = (s: string) => s.replace(/\/+$/, '');

export type AssertionResult = { ok: true; replayKey: string; exp: number; kid?: string } | { ok: false; reason: string; unknownKid?: boolean };

/**
 * Verify a private_key_jwt client assertion against the client's JWK Set: algorithm on the allow list, signature by a
 * matching key (kid, kty/crv, use/alg), iss = sub = client_id, aud contains one of `audiences` (token endpoint or
 * issuer), exp in the future and at most an hour away, nbf / iat not in the future. The replay key (jti, or the hash
 * of the whole assertion when there is no jti) must then be recorded once by the caller.
 */
export function verifyClientAssertion(o: { assertion: unknown; clientId: string; audiences: string[]; jwks: Jwks; nowS?: number }): AssertionResult {
  const now = o.nowS ?? Math.floor(Date.now() / 1000);
  const j = decodeJwt(o.assertion);
  if (!j) return { ok: false, reason: 'client_assertion is not a compact JWS (header.payload.signature)' };
  const alg = j.header.alg;
  if (typeof alg !== 'string' || !ASSERTION_ALGS.includes(alg)) return { ok: false, reason: `client_assertion alg ${JSON.stringify(String(alg ?? '')).slice(0, 20)} is not supported (use ${ASSERTION_ALGS.join(', ')})` };
  if (j.header.crit !== undefined) return { ok: false, reason: 'client_assertion has unsupported crit header parameters' };
  const kid = typeof j.header.kid === 'string' ? j.header.kid : undefined;
  const candidates = o.jwks.keys.filter((k) => kid === undefined || k.kid === kid);
  if (!candidates.length) return { ok: false, reason: `no key with kid ${JSON.stringify(kid).slice(0, 80)} in the client's JWK Set`, unknownKid: true };
  const keys = candidates.map((k) => keyFor(alg, k)).filter((k): k is KeyObject => !!k);
  if (!keys.length) return { ok: false, reason: `no usable ${alg} key in the client's JWK Set`, unknownKid: kid !== undefined };
  if (!keys.some((k) => sigOk(alg, k, j.signingInput, j.signature))) return { ok: false, reason: 'client_assertion signature is invalid' };
  const p = j.payload;
  if (p.iss !== o.clientId || p.sub !== o.clientId) return { ok: false, reason: 'client_assertion iss and sub must both equal the client_id' };
  const auds = (Array.isArray(p.aud) ? p.aud : [p.aud]).filter((a): a is string => typeof a === 'string').map(normAud);
  if (!auds.some((a) => o.audiences.map(normAud).includes(a))) return { ok: false, reason: `client_assertion aud must be ${o.audiences[0]} (or the issuer)` };
  if (typeof p.exp !== 'number' || !Number.isFinite(p.exp)) return { ok: false, reason: 'client_assertion has no exp' };
  if (p.exp <= now - SKEW_S) return { ok: false, reason: 'client_assertion has expired' };
  if (p.exp > now + ASSERTION_MAX_LIFETIME_S + SKEW_S) return { ok: false, reason: 'client_assertion exp is too far in the future (at most one hour)' };
  if (p.nbf !== undefined && (typeof p.nbf !== 'number' || p.nbf > now + SKEW_S)) return { ok: false, reason: 'client_assertion is not valid yet (nbf)' };
  if (p.iat !== undefined && (typeof p.iat !== 'number' || p.iat > now + SKEW_S)) return { ok: false, reason: 'client_assertion iat is in the future' };
  if (p.jti !== undefined && (typeof p.jti !== 'string' || !p.jti || p.jti.length > 256)) return { ok: false, reason: 'client_assertion jti must be a string of at most 256 characters' };
  const replayKey = hashToken(`${o.clientId}\n${typeof p.jti === 'string' ? `jti:${p.jti}` : `jwt:${o.assertion}`}`);
  return { ok: true, replayKey, exp: Math.floor(p.exp), kid };
}

/* ------------------------------------------------------------------ resource indicators (RFC 8707) */
/** The MCP endpoints this server protects. "claude" is /mcp, "chatgpt" is /mcp/chatgpt (no commerce tools). */
export type Profile = 'claude' | 'chatgpt';
export const PROFILE_PATH: Record<Profile, string> = { claude: '/mcp', chatgpt: '/mcp/chatgpt' };
export const resourceFor = (base: string, p: Profile) => `${base.replace(/\/$/, '')}${PROFILE_PATH[p]}`;
const normRes = (s: string) => s.replace(/\/+$/, '');
/** Which profile a requested `resource` names (trailing slash ignored), or null when it is not one of ours. */
/** Extra MCP endpoints that share a profile's resource (audience): /mcp/auth is /mcp with sign-in required up front. */
export const RESOURCE_ALIASES: Record<string, Profile> = { '/mcp/auth': 'claude' };
export function profileForResource(base: string, resource: unknown): Profile | null {
  if (typeof resource !== 'string') return null;
  const r = normRes(resource);
  const b = base.replace(/\/$/, '');
  return (Object.keys(PROFILE_PATH) as Profile[]).find((p) => normRes(resourceFor(base, p)) === r)
    || Object.entries(RESOURCE_ALIASES).find(([path]) => normRes(`${b}${path}`) === r)?.[1] || null;
}
/** The canonical resource for a requested one (aliases and trailing slashes folded), or the input when it is not ours. */
export const canonicalResource = (base: string, resource: string) => { const p = profileForResource(base, resource); return p ? resourceFor(base, p) : resource; };

/* ------------------------------------------------------------------ signed consent request */
export type AuthRequest = { cid: string; ru: string; st?: string; cc: string; sc: string[]; rs: string; exp: number };

/** The validated /oauth/authorize request, carried through sign-in as one URL-safe value: base64url(JSON) + hex HMAC. */
export function signRequest(r: AuthRequest, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(r)));
  return body + createHmac('sha256', secret).update(`oauth-req:${body}`).digest('hex');
}
export function verifyRequest(blob: unknown, secret: string, nowS = Math.floor(Date.now() / 1000)): AuthRequest | null {
  if (typeof blob !== 'string' || blob.length < 70 || blob.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(blob) || secret.length < 32) return null;
  const body = blob.slice(0, -64), sig = blob.slice(-64);
  if (!/^[0-9a-f]{64}$/.test(sig)) return null;
  const want = Buffer.from(createHmac('sha256', secret).update(`oauth-req:${body}`).digest('hex')), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const r = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AuthRequest;
    if (!r || typeof r.cid !== 'string' || typeof r.ru !== 'string' || typeof r.cc !== 'string' || !Array.isArray(r.sc) || typeof r.rs !== 'string' || !(r.exp > nowS)) return null;
    return r;
  } catch { return null; }
}

/* ------------------------------------------------------------------ challenges */
const q = (s: string) => s.replace(/["\\]/g, '');
/** RFC 6750 / RFC 9728 challenge for 401 and 403 responses. */
export function wwwAuthenticate(o: { resourceMetadata: string; error?: 'invalid_token' | 'insufficient_scope' | 'invalid_request'; description?: string; scope?: string[] }) {
  const parts = [`resource_metadata="${q(o.resourceMetadata)}"`];
  if (o.error) parts.unshift(`error="${o.error}"`);
  if (o.description) parts.splice(o.error ? 1 : 0, 0, `error_description="${q(o.description)}"`);
  if (o.scope?.length) parts.push(`scope="${q(scopeString(o.scope))}"`);
  return `Bearer ${parts.join(', ')}`;
}

/** Bearer token from an Authorization header (never from the query string). */
export const bearerToken = (h: string | null | undefined) => (h && /^Bearer\s+([A-Za-z0-9._~+/=-]{20,512})$/i.exec(h.trim())?.[1]) || null;

/** Claude Code (CLI / IDE) initializing an MCP session: it starts sign-in only when the server answers 401 at connect. */
export const isClaudeCodeInit = (list: { method?: string; params?: any }[], userAgent: string | null) =>
  list.some((m) => m?.method === 'initialize' && (/^claude-code$/i.test(String(m.params?.clientInfo?.name || '')) || /(^|\s)claude-code\//i.test(userAgent || '')));

/* ------------------------------------------------------------------ SSRF guard (CIMD fetches) */
/** Private, loopback, link-local, CGNAT, multicast, documentation and other non-public ranges (v4 and v6). */
export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPublicIp(mapped[1]);
    if (/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith('2001:db8') || s.startsWith('64:ff9b') || s.startsWith('2002:')) return false;
    return true;
  }
  return false;
}

