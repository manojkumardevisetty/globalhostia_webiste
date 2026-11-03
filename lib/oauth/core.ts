// OAuth 2.1 authorization server for the GlobalHostia connector (Claude / ChatGPT / any MCP client): the pure parts.
// Scopes, PKCE (S256 only), opaque token minting + hashing, redirect URI rules (Claude, ChatGPT, loopback for Claude Code
// and MCP Inspector), Client ID Metadata Documents, Dynamic Client Registration input checks, signed consent requests
// and the WWW-Authenticate challenge. Only node:crypto, so tests/oauth.test.mts imports it directly.
// Specs: OAuth 2.1 draft, RFC 7636 (PKCE), RFC 7591 (DCR), RFC 8414, RFC 9728, RFC 8707, RFC 9207, RFC 8252,
// MCP authorization 2025-06-18 / 2025-11-25, draft-ietf-oauth-client-id-metadata-document.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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

export type ClientMeta = { name: string; redirectUris: string[]; clientUri?: string; logoUri?: string; authMethod: 'none' | 'client_secret_post' | 'client_secret_basic' };

const httpsUrl = (v: unknown) => (typeof v === 'string' && v.length <= 512 && /^https:\/\/[^\s]+$/.test(v) ? v : undefined);
const cleanName = (v: unknown, fallback: string) => (typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 100) : '') || fallback;

/** Validate a fetched CIMD: its client_id must equal the URL, redirect URIs valid, public client (or private_key_jwt, unsupported). */
export function validateCimd(doc: unknown, url: string): { ok: true; meta: ClientMeta } | { ok: false; reason: string } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'metadata document is not a JSON object' };
  const d = doc as Record<string, unknown>;
  if (d.client_id !== url) return { ok: false, reason: 'client_id in the metadata document does not match its URL' };
  const uris = Array.isArray(d.redirect_uris) ? d.redirect_uris : [];
  if (!uris.length || uris.length > 20) return { ok: false, reason: 'metadata document needs 1-20 redirect_uris' };
  const checked = uris.map(classifyRedirect);
  const bad = checked.find((c) => !c.ok);
  if (bad && !bad.ok) return { ok: false, reason: bad.reason };
  const method = d.token_endpoint_auth_method ?? 'none';
  if (method !== 'none') return { ok: false, reason: 'only public clients (token_endpoint_auth_method "none") are supported for client metadata documents' };
  if ('client_secret' in d || 'client_secret_expires_at' in d) return { ok: false, reason: 'a client metadata document must not contain a client secret' };
  return { ok: true, meta: { name: cleanName(d.client_name, new URL(url).host), redirectUris: uris as string[], clientUri: httpsUrl(d.client_uri), logoUri: httpsUrl(d.logo_uri), authMethod: 'none' } };
}

/* ------------------------------------------------------------------ Dynamic Client Registration (RFC 7591) */
export function validateDcr(body: unknown): { ok: true; meta: ClientMeta; grantTypes: string[] } | { ok: false; error: 'invalid_redirect_uri' | 'invalid_client_metadata'; description: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'invalid_client_metadata', description: 'Body must be a JSON object' };
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 10) return { ok: false, error: 'invalid_redirect_uri', description: 'redirect_uris must list 1-10 URIs' };
  for (const u of uris) { const c = classifyRedirect(u); if (!c.ok) return { ok: false, error: 'invalid_redirect_uri', description: `${String(u).slice(0, 80)}: ${c.reason}` }; }
  const grants = b.grant_types === undefined ? ['authorization_code', 'refresh_token'] : b.grant_types;
  if (!Array.isArray(grants) || !grants.length || grants.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) return { ok: false, error: 'invalid_client_metadata', description: 'grant_types may only contain authorization_code and refresh_token' };
  if (!grants.includes('authorization_code')) return { ok: false, error: 'invalid_client_metadata', description: 'grant_types must include authorization_code' };
  const rts = b.response_types === undefined ? ['code'] : b.response_types;
  if (!Array.isArray(rts) || rts.some((r) => r !== 'code')) return { ok: false, error: 'invalid_client_metadata', description: 'response_types may only contain code' };
  const method = b.token_endpoint_auth_method ?? 'none';
  if (method !== 'none' && method !== 'client_secret_post' && method !== 'client_secret_basic') return { ok: false, error: 'invalid_client_metadata', description: 'token_endpoint_auth_method must be none, client_secret_post or client_secret_basic' };
  if (b.scope !== undefined && !parseScope(b.scope).ok) return { ok: false, error: 'invalid_client_metadata', description: 'scope contains unknown values' };
  return { ok: true, meta: { name: cleanName(b.client_name, 'Unnamed app'), redirectUris: uris as string[], clientUri: httpsUrl(b.client_uri), logoUri: httpsUrl(b.logo_uri), authMethod: method as ClientMeta['authMethod'] }, grantTypes: grants as string[] };
}

/* ------------------------------------------------------------------ resource indicators (RFC 8707) */
/** The MCP endpoints this server protects. "claude" is /mcp, "chatgpt" is /mcp/chatgpt (no commerce tools). */
export type Profile = 'claude' | 'chatgpt';
export const PROFILE_PATH: Record<Profile, string> = { claude: '/mcp', chatgpt: '/mcp/chatgpt' };
export const resourceFor = (base: string, p: Profile) => `${base.replace(/\/$/, '')}${PROFILE_PATH[p]}`;
const normRes = (s: string) => s.replace(/\/+$/, '');
/** Which profile a requested `resource` names (trailing slash ignored), or null when it is not one of ours. */
export function profileForResource(base: string, resource: unknown): Profile | null {
  if (typeof resource !== 'string') return null;
  const r = normRes(resource);
  return (Object.keys(PROFILE_PATH) as Profile[]).find((p) => normRes(resourceFor(base, p)) === r) || null;
}

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

