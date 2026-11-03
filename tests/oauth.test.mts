// OAuth core for the AI connector: PKCE, tokens, redirect URI rules, CIMD / DCR validation, signed consent requests,
// resource binding and challenges. Run: node --test --experimental-strip-types tests/oauth.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign as cryptoSign, constants as C } from 'node:crypto';
import {
  SCOPES, SCOPE_NAMES, parseScope, scopeString, randomToken, hashToken, s256, verifyPkce, classifyRedirect, redirectMatches, platformOf,
  isCimdClientId, validateCimd, validateDcr, resourceFor, profileForResource, signRequest, verifyRequest, wwwAuthenticate, bearerToken, isPublicIp,
  ACCESS_TTL_S, REFRESH_TTL_S, GRANT_TTL_S, CODE_TTL_S, verifyClientAssertion, assertionClientId, cleanJwks, canonicalResource, TOKEN_AUTH_METHODS, ASSERTION_ALGS, ASSERTION_TYPE, isClaudeCodeInit,
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

/* ------------------------------------------------------------------ private_key_jwt (ChatGPT CIMD) */
const GPT = 'https://chatgpt.com/oauth/client.json';
const TOKEN_EP = 'https://globalhostia.com/oauth/token';
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = (k: any, kid: string, extra = {}) => ({ ...k.publicKey.export({ format: 'jwk' }), kid, use: 'sig', ...extra });
const JWKS = { keys: [jwk(rsa, 'rsa-1', { alg: 'RS256' }), jwk(ec, 'ec-1')] };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(alg: string, key: any, claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
  const input = `${b64({ alg, typ: 'JWT', ...header })}.${b64(claims)}`;
  const hash = `sha${alg.slice(2)}`;
  const sig = alg.startsWith('ES') ? cryptoSign(hash, Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
    : alg.startsWith('PS') ? cryptoSign(hash, Buffer.from(input), { key, padding: C.RSA_PKCS1_PSS_PADDING, saltLength: C.RSA_PSS_SALTLEN_DIGEST })
    : cryptoSign(hash, Buffer.from(input), key);
  return `${input}.${sig.toString('base64url')}`;
}
const NOW = 1_900_000_000;
const claims = (o: Record<string, unknown> = {}) => ({ iss: GPT, sub: GPT, aud: TOKEN_EP, iat: NOW, exp: NOW + 300, jti: 'j-1', ...o });
const check = (assertion: string, o: Partial<Parameters<typeof verifyClientAssertion>[0]> = {}) =>
  verifyClientAssertion({ assertion, clientId: GPT, audiences: [TOKEN_EP, 'https://globalhostia.com'], jwks: JWKS, nowS: NOW, ...o });

test('CIMD: ChatGPT-style private_key_jwt documents (plural + singular methods, jwks_uri or jwks)', () => {
  const doc = { client_id: GPT, client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'private_key_jwt', jwks_uri: 'https://chatgpt.com/oauth/jwks.json' };
  const v = validateCimd(doc, GPT);
  assert.ok(v.ok, JSON.stringify(v));
  assert.equal(v.ok && v.meta.authMethod, 'private_key_jwt');
  assert.deepEqual(v.ok && v.meta.authMethods, ['private_key_jwt']);
  assert.equal(v.ok && v.meta.jwksUri, 'https://chatgpt.com/oauth/jwks.json');
  const both = validateCimd({ ...doc, token_endpoint_auth_method: undefined, token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'] }, GPT);
  assert.deepEqual(both.ok && both.meta.authMethods, ['private_key_jwt', 'none'], 'plural list without a preference: private_key_jwt first, none still accepted');
  const pref = validateCimd({ ...doc, token_endpoint_auth_method: 'none', token_endpoint_auth_methods_supported: ['private_key_jwt', 'none'] }, GPT);
  assert.deepEqual(pref.ok && pref.meta.authMethods, ['none', 'private_key_jwt'], 'singular preference wins when usable');
  const mixed = validateCimd({ ...doc, token_endpoint_auth_methods_supported: ['client_secret_basic', 'private_key_jwt'] }, GPT);
  assert.deepEqual(mixed.ok && mixed.meta.authMethods, ['private_key_jwt'], 'client_secret_* is ignored when a usable method is present');
  const inline = validateCimd({ ...doc, jwks_uri: undefined, jwks: { keys: [{ ...jwk(rsa, 'x'), d: 'PRIVATE' }] } }, GPT);
  assert.ok(inline.ok && inline.meta.jwks && !('d' in inline.meta.jwks.keys[0]), 'inline jwks accepted, private members dropped');
  const noKeys = validateCimd({ ...doc, jwks_uri: undefined }, GPT);
  assert.equal(noKeys.ok, false);
  assert.match(!noKeys.ok ? noKeys.reason : '', /private_key_jwt.*jwks/);
  const secret = validateCimd({ ...doc, token_endpoint_auth_method: 'client_secret_post' }, GPT);
  assert.equal(secret.ok, false);
  assert.match(!secret.ok ? secret.reason : '', /"client_secret_post" is not supported for client metadata documents/, 'the rejected method is named');
  assert.equal(validateCimd({ ...doc, jwks_uri: 'http://chatgpt.com/jwks' }, GPT).ok, false, 'jwks_uri must be https');
  // Claude's real document (extra jwt-bearer grant type) stays a public client
  const claude = validateCimd({ client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata', client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'], response_types: ['code'], token_endpoint_auth_method: 'none' }, 'https://claude.ai/oauth/mcp-oauth-client-metadata');
  assert.deepEqual(claude.ok && claude.meta.authMethods, ['none']);
});

test('DCR: private_key_jwt with jwks_uri / jwks, extra grant types narrowed', () => {
  const v = validateDcr({ redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'private_key_jwt', jwks_uri: 'https://chatgpt.com/oauth/jwks.json' });
  assert.ok(v.ok && v.meta.authMethod === 'private_key_jwt' && v.meta.jwksUri === 'https://chatgpt.com/oauth/jwks.json');
  assert.ok((validateDcr({ redirect_uris: ['https://a.example/cb'], token_endpoint_auth_method: 'private_key_jwt', jwks: JWKS }) as any).meta.jwks.keys.length === 2);
  const g = validateDcr({ redirect_uris: ['https://a.example/cb'], grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'] });
  assert.deepEqual(g.ok && g.grantTypes, ['authorization_code', 'refresh_token']);
  assert.equal(validateDcr({ redirect_uris: ['https://a.example/cb'], token_endpoint_auth_method: 'tls_client_auth' }).ok, false);
});

test('private_key_jwt: RS256, ES256 and PS256 assertions verify; claims checked', () => {
  const r = check(jwt('RS256', rsa.privateKey, claims(), { kid: 'rsa-1' }));
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(check(jwt('ES256', ec.privateKey, claims(), { kid: 'ec-1' })).ok, 'ES256 (ieee-p1363 signature)');
  assert.ok(check(jwt('PS256', rsa.privateKey, claims(), { kid: 'rsa-1' }), { jwks: { keys: [jwk(rsa, 'rsa-1')] } }).ok, 'PS256 with a key without alg');
  assert.ok(check(jwt('RS256', rsa.privateKey, claims())).ok, 'no kid: every matching key is tried');
  assert.ok(check(jwt('RS256', rsa.privateKey, claims({ aud: ['https://globalhostia.com/'] }), { kid: 'rsa-1' })).ok, 'aud = issuer (array, trailing slash) accepted');
  assert.equal(assertionClientId(jwt('RS256', rsa.privateKey, claims())), GPT);
  // replay keys: same jti → same key, different jti → different
  const k1 = (check(jwt('RS256', rsa.privateKey, claims(), { kid: 'rsa-1' })) as any).replayKey, k2 = (check(jwt('RS256', rsa.privateKey, claims({ jti: 'j-2' }), { kid: 'rsa-1' })) as any).replayKey;
  assert.equal(k1, (check(jwt('RS256', rsa.privateKey, claims({ iat: NOW + 1 }), { kid: 'rsa-1' })) as any).replayKey, 'jti identifies the assertion for replay detection');
  assert.notEqual(k1, k2);
  const noJti = { ...claims() } as any; delete noJti.jti;
  assert.ok(check(jwt('RS256', rsa.privateKey, noJti, { kid: 'rsa-1' })).ok, 'no jti: the whole assertion is the replay key');
});

test('private_key_jwt: bad signature, wrong key, aud, iss/sub, expiry, lifetime, alg and kid are refused', () => {
  const reason = (a: string, o = {}) => { const r = check(a, o); assert.equal(r.ok, false, a.slice(0, 40)); return !r.ok ? r.reason : ''; };
  const good = jwt('RS256', rsa.privateKey, claims(), { kid: 'rsa-1' });
  const [h, p, sg] = good.split('.');
  assert.match(reason(`${h}.${b64(claims({ sub: 'https://evil.example/x' }))}.${sg}`), /signature is invalid/, 'payload swapped under the old signature');
  assert.match(reason(`${h}.${p}.${Buffer.from('x'.repeat(256)).toString('base64url')}`), /signature is invalid/);
  assert.match(reason(jwt('RS256', other.privateKey, claims(), { kid: 'rsa-1' })), /signature is invalid/, 'signed by a key not in the JWK Set');
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ aud: 'https://evil.example/token' }), { kid: 'rsa-1' })), /aud must be/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ aud: 'https://globalhostia.com/oauth/authorize' }), { kid: 'rsa-1' })), /aud must be/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ iss: 'https://evil.example/c.json' }), { kid: 'rsa-1' })), /iss and sub/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ sub: 'other' }), { kid: 'rsa-1' })), /iss and sub/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ exp: NOW - 120 }), { kid: 'rsa-1' })), /expired/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ exp: undefined }), { kid: 'rsa-1' })), /no exp/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ exp: NOW + 86400 }), { kid: 'rsa-1' })), /too far/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ nbf: NOW + 600 }), { kid: 'rsa-1' })), /nbf/);
  assert.match(reason(jwt('RS256', rsa.privateKey, claims({ iat: NOW + 600 }), { kid: 'rsa-1' })), /iat/);
  assert.match(reason(jwt('HS256', rsa.privateKey.export({ format: 'pem', type: 'pkcs8' }), claims())), /alg "HS256" is not supported/);
  assert.match(reason(`${b64({ alg: 'none' })}.${b64(claims())}.x`), /alg "none" is not supported/);
  const unknown = check(jwt('RS256', rsa.privateKey, claims(), { kid: 'rotated-2' }));
  assert.ok(!unknown.ok && unknown.unknownKid, 'unknown kid is flagged so the caller refetches jwks_uri');
  assert.match(reason(jwt('ES256', ec.privateKey, claims(), { kid: 'rsa-1' })), /no usable ES256 key/, 'alg / key type mismatch');
  assert.match(reason(jwt('RS256', rsa.privateKey, claims(), { kid: 'rsa-1' }), { clientId: 'https://other.example/c.json' }), /iss and sub/);
  assert.match(reason('not.a.jwt'), /compact JWS/);
  const small = generateKeyPairSync('rsa', { modulusLength: 1024 });
  assert.match(reason(jwt('RS256', small.privateKey, claims(), { kid: 's' }), { jwks: { keys: [jwk(small, 's')] } }), /no usable RS256 key/, 'RSA keys under 2048 bits refused');
  assert.equal(cleanJwks({ keys: [{ kty: 'oct', k: 'secret' }] }), null, 'symmetric keys are never accepted');
});

test('AS metadata advertises the token endpoint methods and assertion algorithms; resource aliases', () => {
  assert.deepEqual(TOKEN_AUTH_METHODS.slice(0, 2), ['none', 'private_key_jwt']);
  assert.ok(ASSERTION_ALGS.includes('RS256') && ASSERTION_ALGS.includes('ES256') && !ASSERTION_ALGS.some((a) => a.startsWith('HS') || a === 'none'));
  assert.equal(ASSERTION_TYPE, 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
  assert.equal(profileForResource(BASE, 'https://globalhostia.com/mcp/auth'), 'claude', '/mcp/auth shares /mcp\'s audience');
  assert.equal(canonicalResource(BASE, 'https://globalhostia.com/mcp/auth/'), 'https://globalhostia.com/mcp');
  assert.equal(canonicalResource(BASE, 'https://evil.example/mcp'), 'https://evil.example/mcp');
});

test('loopback redirects (Claude Code CIMD): any port on localhost / 127.0.0.1, scheme, host and path exact', () => {
  const reg = ['http://localhost/callback', 'http://127.0.0.1/callback'];
  for (const port of [1024, 3118, 49152, 65535]) { assert.equal(redirectMatches(reg, `http://localhost:${port}/callback`), true); assert.equal(redirectMatches(reg, `http://127.0.0.1:${port}/callback`), true); }
  assert.equal(redirectMatches(reg, 'http://localhost/callback'), true);
  assert.equal(redirectMatches(['http://localhost:6274/oauth/callback'], 'http://localhost:9999/oauth/callback'), true, 'a registered port is not binding either (DCR)');
  assert.equal(redirectMatches(reg, 'https://localhost:3118/callback'), false, 'https on loopback is not the registered URI');
  assert.equal(redirectMatches(reg, 'http://localhost.evil.example:3118/callback'), false);
  assert.equal(redirectMatches(reg, 'http://127.0.0.2:3118/callback'), false);
  assert.equal(redirectMatches(reg, 'http://localhost:3118/callback/x'), false);
  assert.equal(redirectMatches(reg, 'http://localhost:3118/callback?next=evil'), false);
});

test('Claude Code detection (sign-in up front on /mcp)', () => {
  const init = (name: string) => [{ method: 'initialize', params: { clientInfo: { name, version: '2.1.0' } } }];
  assert.equal(isClaudeCodeInit(init('claude-code'), null), true);
  assert.equal(isClaudeCodeInit(init('Claude-Code'), null), true);
  assert.equal(isClaudeCodeInit(init('claude-ai'), null), false, 'claude.ai web stays lazy');
  assert.equal(isClaudeCodeInit(init('openai-mcp'), null), false);
  assert.equal(isClaudeCodeInit(init('x'), 'claude-code/2.1.0 (external, cli)'), true);
  assert.equal(isClaudeCodeInit([{ method: 'tools/list', params: {} }], 'claude-code/2.1.0'), false, 'only the initialize request');
});
