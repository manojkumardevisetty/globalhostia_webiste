// OAuth core for the AI connector: PKCE, tokens, redirect URI rules, CIMD / DCR validation, signed consent requests,
// resource binding and challenges. Run: node --test --experimental-strip-types tests/oauth.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  SCOPES, SCOPE_NAMES, parseScope, scopeString, randomToken, hashToken, s256, verifyPkce, classifyRedirect, redirectMatches, platformOf,
  isCimdClientId, validateCimd, validateDcr, resourceFor, profileForResource, signRequest, verifyRequest, wwwAuthenticate, bearerToken, isPublicIp,
  ACCESS_TTL_S, REFRESH_TTL_S, GRANT_TTL_S, CODE_TTL_S,
} from '../lib/oauth/core.ts';
import { normalizeConnector, DEFAULT_CONNECTOR } from '../lib/connector/config-core.ts';

const SECRET = 'k'.repeat(48);
const BASE = 'https://globalhostia.com';

test('PKCE S256: RFC 7636 appendix B vector, wrong verifier, plain-length rules', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.equal(s256(verifier), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(verifyPkce(verifier, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), true);
  assert.equal(verifyPkce(verifier + 'x', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), false);
  assert.equal(verifyPkce('short', s256('short')), false, 'verifier under 43 chars is refused');
  assert.equal(verifyPkce(undefined, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), false);
  assert.equal(verifyPkce(verifier, verifier), false, 'plain method (challenge = verifier) never passes');
});

test('tokens: random, prefixed, stored as sha256 hex; lifetimes', () => {
  const a = randomToken('gha_'), b = randomToken('gha_');
  assert.notEqual(a, b);
  assert.match(a, /^gha_[A-Za-z0-9_-]{43}$/);
  assert.equal(hashToken(a), createHash('sha256').update(a).digest('hex'));
  assert.equal(ACCESS_TTL_S, 3600);
  assert.ok(REFRESH_TTL_S >= 30 * 86400 && REFRESH_TTL_S <= 90 * 86400);
  assert.ok(GRANT_TTL_S <= 90 * 86400 && GRANT_TTL_S >= REFRESH_TTL_S);
  assert.ok(CODE_TTL_S <= 600);
});

test('scopes: parse, unknown refused, empty or offline_access only = all, canonical order', () => {
  assert.deepEqual(parseScope('dns:write account:read'), { ok: true, scopes: ['account:read', 'dns:write'] });
  assert.deepEqual(parseScope(''), { ok: true, scopes: SCOPE_NAMES });
  assert.deepEqual(parseScope('offline_access'), { ok: true, scopes: SCOPE_NAMES });
  assert.deepEqual(parseScope('account:read offline_access'), { ok: true, scopes: ['account:read'] });
  assert.deepEqual(parseScope('account:read admin'), { ok: false, unknown: ['admin'] });
  assert.equal(scopeString(['dns:write', 'account:read']), 'account:read dns:write');
  for (const [k, s] of Object.entries(SCOPES)) { assert.match(k, /^[a-z]+:(read|write)$/); assert.equal(s.write, k.endsWith(':write')); assert.ok(s.label && s.detail); }
});

test('redirect URIs: Claude, ChatGPT, loopback known; https flagged; http and dangerous schemes refused', () => {
  for (const u of ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']) assert.deepEqual(classifyRedirect(u), { ok: true, uri: u, kind: 'claude', flagged: false });
  assert.equal((classifyRedirect('https://chatgpt.com/connector_platform_oauth_redirect') as any).kind, 'chatgpt');
  assert.equal((classifyRedirect('https://chatgpt.com/connector/oauth/abc_123-XYZ') as any).kind, 'chatgpt');
  assert.equal((classifyRedirect('https://chatgpt.com/connector/oauth/../evil') as any).kind, 'https', 'not the ChatGPT pattern → just https (flagged)');
  assert.deepEqual(classifyRedirect('http://localhost:6274/oauth/callback'), { ok: true, uri: 'http://localhost:6274/oauth/callback', kind: 'loopback', flagged: false });
  assert.equal((classifyRedirect('http://127.0.0.1:33418/callback') as any).kind, 'loopback');
  assert.deepEqual(classifyRedirect('https://example.com/cb'), { ok: true, uri: 'https://example.com/cb', kind: 'https', flagged: true });
  assert.equal((classifyRedirect('com.example.app:/oauth') as any).kind, 'native');
  for (const bad of ['http://evil.example/cb', 'javascript:alert(1)', 'data:text/html,x', 'https://a.example/cb#frag', 'https://user:pw@a.example/cb', 'not a url', '', 'file:///etc/passwd']) assert.equal(classifyRedirect(bad).ok, false, bad);
});

test('redirect matching: exact, loopback port-agnostic (RFC 8252), path and host must match', () => {
  const reg = ['http://localhost/callback', 'http://127.0.0.1/callback', 'https://claude.ai/api/mcp/auth_callback'];
  assert.equal(redirectMatches(reg, 'https://claude.ai/api/mcp/auth_callback'), true);
  assert.equal(redirectMatches(reg, 'http://localhost:3118/callback'), true);
  assert.equal(redirectMatches(reg, 'http://127.0.0.1:55555/callback'), true);
  assert.equal(redirectMatches(reg, 'http://localhost:3118/other'), false);
  assert.equal(redirectMatches(reg, 'http://[::1]:3118/callback'), false, 'loopback host must be one that was registered');
  assert.equal(redirectMatches(reg, 'https://claude.ai/api/mcp/auth_callback?x=1'), false);
  assert.equal(redirectMatches(['https://app.example/cb'], 'https://app.example:444/cb'), false, 'no port slack outside loopback');
});

test('platform detection', () => {
  assert.equal(platformOf('https://claude.ai/oauth/claude-code-client-metadata', []), 'claude');
  assert.equal(platformOf('https://chatgpt.com/oauth/client.json', []), 'chatgpt');
  assert.equal(platformOf('ghc_x', ['https://claude.ai/api/mcp/auth_callback']), 'claude');
  assert.equal(platformOf('ghc_x', ['https://chatgpt.com/connector_platform_oauth_redirect']), 'chatgpt');
  assert.equal(platformOf('ghc_x', ['http://localhost:6274/oauth/callback']), 'inspector');
  assert.equal(platformOf('ghc_x', ['https://example.com/cb']), 'other');
});

test('CIMD: client_id URL rules and document validation', () => {
  assert.equal(isCimdClientId('https://claude.ai/oauth/claude-code-client-metadata'), true);
  assert.equal(isCimdClientId('https://chatgpt.com/oauth/client.json'), true);
  for (const bad of ['http://claude.ai/x', 'https://claude.ai', 'https://claude.ai/', 'https://claude.ai/a/../b', 'ghc_abc', 'https://u:p@x.com/a']) assert.equal(isCimdClientId(bad), false, bad);
  const url = 'https://claude.ai/oauth/claude-code-client-metadata';
  const doc = { client_id: url, client_name: 'Claude Code', redirect_uris: ['http://localhost/callback', 'http://127.0.0.1/callback'], token_endpoint_auth_method: 'none' };
  const v = validateCimd(doc, url);
  assert.ok(v.ok);
  assert.deepEqual(v.ok && v.meta.redirectUris, doc.redirect_uris);
  assert.equal(validateCimd({ ...doc, client_id: 'https://evil.example/x' }, url).ok, false, 'client_id must equal the URL');
  assert.equal(validateCimd({ ...doc, redirect_uris: [] }, url).ok, false);
  assert.equal(validateCimd({ ...doc, redirect_uris: ['http://evil.example/cb'] }, url).ok, false);
  assert.equal(validateCimd({ ...doc, token_endpoint_auth_method: 'private_key_jwt' }, url).ok, false);
  assert.equal(validateCimd({ ...doc, client_secret: 'x' }, url).ok, false);
  assert.equal(validateCimd({ ...doc, client_name: '<script>x</script>' }, url).ok && (validateCimd({ ...doc, client_name: '<b>Evil</b>' }, url) as any).meta.name.includes('<'), false, 'angle brackets are stripped from names');
  assert.equal(validateCimd([], url).ok, false);
});

test('DCR: valid public client, confidential client, and every rejection', () => {
  const ok = validateDcr({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' });
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.meta.authMethod, 'none');
  assert.deepEqual(validateDcr({ redirect_uris: ['http://localhost:6274/oauth/callback'] }).ok, true, 'defaults are filled in');
  assert.equal((validateDcr({ redirect_uris: ['https://x.example/cb'], token_endpoint_auth_method: 'client_secret_post' }) as any).meta.authMethod, 'client_secret_post');
  const bad: [unknown, string][] = [
    [null, 'invalid_client_metadata'], [{}, 'invalid_redirect_uri'], [{ redirect_uris: [] }, 'invalid_redirect_uri'],
    [{ redirect_uris: ['http://evil.example/cb'] }, 'invalid_redirect_uri'], [{ redirect_uris: Array(11).fill('https://a.example/cb') }, 'invalid_redirect_uri'],
    [{ redirect_uris: ['https://a.example/cb'], grant_types: ['client_credentials'] }, 'invalid_client_metadata'],
    [{ redirect_uris: ['https://a.example/cb'], grant_types: ['refresh_token'] }, 'invalid_client_metadata'],
    [{ redirect_uris: ['https://a.example/cb'], response_types: ['token'] }, 'invalid_client_metadata'],
    [{ redirect_uris: ['https://a.example/cb'], token_endpoint_auth_method: 'private_key_jwt' }, 'invalid_client_metadata'],
    [{ redirect_uris: ['https://a.example/cb'], scope: 'root' }, 'invalid_client_metadata'],
  ];
  for (const [b, err] of bad) { const r = validateDcr(b); assert.equal(r.ok, false, JSON.stringify(b)); assert.equal(!r.ok && r.error, err, JSON.stringify(b)); }
});

test('resource indicators: two protected resources, trailing slash tolerated, others refused', () => {
  assert.equal(resourceFor(BASE, 'claude'), 'https://globalhostia.com/mcp');
  assert.equal(resourceFor(BASE + '/', 'chatgpt'), 'https://globalhostia.com/mcp/chatgpt');
  assert.equal(profileForResource(BASE, 'https://globalhostia.com/mcp'), 'claude');
  assert.equal(profileForResource(BASE, 'https://globalhostia.com/mcp/'), 'claude');
  assert.equal(profileForResource(BASE, 'https://globalhostia.com/mcp/chatgpt'), 'chatgpt');
  for (const bad of ['https://globalhostia.com/api/mcp', 'https://evil.example/mcp', 'https://globalhostia.com', null]) assert.equal(profileForResource(BASE, bad), null, String(bad));
});

test('signed consent request: round trip, tamper, expiry, wrong secret, URL-safe', () => {
  const now = 1_900_000_000;
  const r = { cid: 'ghc_abc', ru: 'https://claude.ai/api/mcp/auth_callback', st: 'xyz', cc: s256('v'.repeat(43)), sc: ['account:read'], rs: 'https://globalhostia.com/mcp', exp: now + 600 };
  const blob = signRequest(r, SECRET);
  assert.match(blob, /^[A-Za-z0-9_-]+$/, 'fits the portal sign-in next= rules and a cookie');
  assert.deepEqual(verifyRequest(blob, SECRET, now), r);
  const tampered = blob.slice(0, 10) + (blob[10] === 'A' ? 'B' : 'A') + blob.slice(11);
  assert.equal(verifyRequest(tampered, SECRET, now), null);
  assert.equal(verifyRequest(blob, SECRET, now + 601), null, 'expired');
  assert.equal(verifyRequest(blob, 'z'.repeat(48), now), null, 'other secret');
  assert.equal(verifyRequest(blob, 'short', now), null, 'weak secret refused');
  assert.equal(verifyRequest('x'.repeat(80), SECRET, now), null);
});

test('WWW-Authenticate and bearer parsing', () => {
  assert.equal(wwwAuthenticate({ resourceMetadata: 'https://globalhostia.com/.well-known/oauth-protected-resource/mcp' }), 'Bearer resource_metadata="https://globalhostia.com/.well-known/oauth-protected-resource/mcp"');
  assert.equal(wwwAuthenticate({ resourceMetadata: 'https://x/m', error: 'insufficient_scope', description: 'needs "dns:write"', scope: ['dns:write', 'account:read'] }),
    'Bearer error="insufficient_scope", error_description="needs dns:write", resource_metadata="https://x/m", scope="account:read dns:write"');
  assert.equal(bearerToken('Bearer gha_abcdefghijklmnopqrstuvwxyz'), 'gha_abcdefghijklmnopqrstuvwxyz');
  assert.equal(bearerToken('bearer   gha_abcdefghijklmnopqrstuvwxyz'), 'gha_abcdefghijklmnopqrstuvwxyz');
  assert.equal(bearerToken('Basic abc'), null);
  assert.equal(bearerToken('Bearer short'), null);
  assert.equal(bearerToken(null), null);
});

test('SSRF guard for metadata fetches', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '160.79.104.10']) assert.equal(isPublicIp(ip), true, ip);
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '2001:db8::1', 'not-an-ip'])
    assert.equal(isPublicIp(ip), false, ip);
});

test('connector settings: defaults, normalisation and junk input', () => {
  assert.deepEqual(normalizeConnector(undefined), DEFAULT_CONNECTOR);
  const n = normalizeConnector({ enabled: false, chatgptCommerce: 'yes', openaiChallenge: 'tok en', reviewer: { clientIds: ['12', -1, 'x', 7], sandboxDomain: 'Demo-Brand.COM.' }, pages: { examples: ['', 'a'], faq: [{ q: 'q', a: '' }] } });
  assert.equal(n.enabled, false);
  assert.equal(n.chatgptCommerce, false, 'only literal true switches commerce on');
  assert.equal(n.openaiChallenge, '', 'tokens with spaces are refused');
  assert.deepEqual(n.reviewer, { clientIds: [12, 7], sandboxDomain: 'demo-brand.com' });
  assert.deepEqual(n.pages.examples, ['a']);
  assert.deepEqual(n.pages.faq, DEFAULT_CONNECTOR.pages.faq, 'empty FAQ falls back to defaults');
  assert.equal(normalizeConnector({ openaiChallenge: 'abc123_-.~+/=' }).openaiChallenge, 'abc123_-.~+/=');
});
