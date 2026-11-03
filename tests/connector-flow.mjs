// End-to-end check of the AI connector against a running app with the local mocks: discovery, lazy-auth 401, DCR,
// /oauth/authorize → portal sign-in → consent → code (+ iss), PKCE, code replay, token, MCP initialize / tools/list /
// tools/call (ownership, scopes, confirm, DNS write through the DirectAdmin mock), audience binding, refresh rotation and
// replay, RFC 7009 revocation, Account → Connected apps disconnect, ChatGPT profile, private_key_jwt (RFC 7523) clients,
// /mcp/auth (sign-in up front), Claude Code's 401-at-initialize, loopback port-agnostic redirects, protocol versions.
// Needs: the app on BASE with tests/mock-whmcs.mjs as WHMCS (client 1 = demo@example.com / demo-pass) and a database
// with db-setup patch 032-oauth. For the DNS write steps also tests/mock-da.mjs with DA_URL / DA_USER / DA_LOGIN_KEY /
// DA_WHMCS_SERVER_IDS=5 (otherwise they are reported as SKIP).
// Run: BASE=http://localhost:3612 node tests/connector-flow.mjs
import { createHash, randomBytes, generateKeyPairSync, sign as jwsSign } from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:3000';
const REDIRECT = 'http://localhost:6274/oauth/callback';
let failures = 0, skips = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; return c; };
const skip = (m) => { console.log(`SKIP  ${m}`); skips++; };
const IP = `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
async function req(path, o = {}) {
  const r = await fetch(path.startsWith('http') ? path : BASE + path, { redirect: 'manual', ...o, headers: { 'x-forwarded-for': IP, ...(jar.size ? { cookie: cookieHeader() } : {}), ...(o.headers || {}) } });
  for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
  return r;
}
const form = (o) => new URLSearchParams(o).toString();
const pkce = () => { const v = randomBytes(32).toString('base64url'); return { v, c: createHash('sha256').update(v).digest('base64url') }; };
const loc = (r) => new URL(r.headers.get('location') || '/', BASE);
let rpcId = 1;
async function mcp(token, method, params, path = '/mcp') {
  const r = await req(path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }) });
  let body = null; try { body = await r.json(); } catch {}
  return { status: r.status, headers: r.headers, body };
}
const call = (token, name, args = {}, path) => mcp(token, 'tools/call', { name, arguments: args }, path);

async function authorize(clientId, scopeSkip = [], o = {}) {
  const p = pkce(), state = randomBytes(8).toString('hex');
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: o.redirect || REDIRECT, code_challenge: p.c, code_challenge_method: 'S256', state, ...(o.resource === null ? {} : { resource: o.resource || `${BASE}/mcp` }) });
  let r = await req(`/oauth/authorize?${q}`);
  if (r.status === 303 && loc(r).pathname === '/account/login') return { needLogin: true, p, state, r };
  if (r.status === 303 && loc(r).pathname === '/oauth/authorize') r = await req(loc(r).pathname + loc(r).search);
  const html = await r.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1], blob = /name="r" value="([^"]+)"/.exec(html)?.[1];
  const scopes = [...html.matchAll(/name="scope" value="([^"]+)"/g)].map((m) => m[1]).filter((s) => !scopeSkip.includes(s));
  return { html, csrf, blob, scopes, p, state, status: r.status };
}
async function consent(a, decision = 'allow') {
  const body = new URLSearchParams({ csrf: a.csrf, r: a.blob, decision });
  for (const s of a.scopes) body.append('scope', s);
  const r = await req('/oauth/authorize', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: body.toString() });
  return { r, to: loc(r) };
}
const token = (o) => req('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(o) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  /* 1. discovery */
  const prm = await (await req('/.well-known/oauth-protected-resource/mcp')).json();
  ok(prm.resource === `${BASE}/mcp` && prm.authorization_servers?.[0] === BASE && prm.scopes_supported?.includes('dns:write'), 'protected resource metadata (RFC 9728) for /mcp');
  ok((await (await req('/.well-known/oauth-protected-resource/mcp/chatgpt')).json()).resource === `${BASE}/mcp/chatgpt`, 'path-suffixed metadata for /mcp/chatgpt');
  ok((await (await req('/.well-known/oauth-protected-resource')).json()).resource === `${BASE}/mcp`, 'bare /.well-known/oauth-protected-resource');
  const as = await (await req('/.well-known/oauth-authorization-server')).json();
  ok(['none', 'private_key_jwt'].every((m) => as.token_endpoint_auth_methods_supported?.includes(m)) && ['RS256', 'ES256'].every((a) => as.token_endpoint_auth_signing_alg_values_supported?.includes(a)), 'AS metadata: private_key_jwt with RS256 / ES256 advertised');
  ok((await (await req('/.well-known/oauth-protected-resource/mcp/auth')).json()).resource === `${BASE}/mcp`, '/mcp/auth shares the /mcp protected resource metadata');
  ok(as.issuer === BASE && as.code_challenge_methods_supported?.join() === 'S256' && as.client_id_metadata_document_supported === true && as.token_endpoint_auth_methods_supported?.includes('none')
    && as.registration_endpoint === `${BASE}/oauth/register` && as.authorization_response_iss_parameter_supported === true && as.scopes_supported?.includes('offline_access'), 'authorization server metadata (RFC 8414): S256, CIMD, DCR, none, iss');

  /* 2. lazy auth: public tools work, account tools challenge */
  const init = await mcp(null, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'flow-test', version: '1' } });
  ok(init.status === 200 && init.body?.result?.serverInfo?.name === 'globalhostia' && init.headers.get('mcp-protocol-version') === '2025-06-18', 'initialize without a token');
  const tl = await mcp(null, 'tools/list', {});
  const tools = tl.body?.result?.tools || [];
  ok(tools.length >= 28 && tools.every((t) => t.title && t.annotations && (t.annotations.readOnlyHint === true || t.annotations.destructiveHint !== undefined)), `tools/list without a token (${tools.length} tools, all with title + hints)`);
  const pol = await call(null, 'get_policies', {});
  ok(pol.status === 200 && !pol.body?.result?.isError, 'public tool (get_policies) runs without a token');
  const gate = await call(null, 'list_domains');
  ok(gate.status === 401 && /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/.test(gate.headers.get('www-authenticate') || '') && /scope="[^"]*account:read/.test(gate.headers.get('www-authenticate') || ''), 'account tool without a token → 401 + WWW-Authenticate resource_metadata + scope');
  const gpt = await call(null, 'list_domains', {}, '/mcp/chatgpt');
  ok(gpt.status === 200 && gpt.body?.result?.isError && /resource_metadata=/.test(gpt.body?.result?._meta?.['mcp/www_authenticate']?.[0] || ''), 'ChatGPT profile: _meta["mcp/www_authenticate"] tool error');
  const gptTools = (await mcp(null, 'tools/list', {}, '/mcp/chatgpt')).body?.result?.tools || [];
  ok(!gptTools.some((t) => ['create_cart_link', 'recommend_plan', 'search_plans', 'renew_items_link'].includes(t.name)) && gptTools.every((t) => Array.isArray(t._meta?.securitySchemes)), 'ChatGPT profile: no commerce tools, securitySchemes on every tool');
  const bad = await mcp('gha_not-a-real-token-at-all-xxxxxxxx', 'tools/list', {});
  ok(bad.status === 401 && /invalid_token/.test(bad.headers.get('www-authenticate') || ''), 'invalid bearer token → 401 even for tools/list');

  /* 2b. transport details and sign-in up front */
  for (const v of ['2025-03-26', '2025-06-18', '2025-11-25']) {
    const r = await req('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: v, capabilities: {}, clientInfo: { name: 'flow-test', version: '1' } } }) });
    const j = await r.json().catch(() => null);
    ok(r.status === 200 && j?.result?.protocolVersion === v && r.headers.get('mcp-protocol-version') === v, `initialize negotiates ${v}`);
  }
  const sse = await req('/mcp', { headers: { accept: 'text/event-stream' } });
  ok(sse.status === 405, 'GET /mcp with Accept: text/event-stream → 405 (no server stream)');
  const note = await req('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  ok(note.status === 202, 'notification → 202 Accepted');
  const cors = await req('/mcp', { method: 'OPTIONS', headers: { origin: 'http://localhost:6274', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id' } });
  ok(cors.status === 204 && cors.headers.get('access-control-allow-origin') === '*' && /mcp-session-id/.test(cors.headers.get('access-control-allow-headers') || '') && /www-authenticate/.test(cors.headers.get('access-control-expose-headers') || ''), 'CORS preflight for browser MCP clients');
  const cc = await req('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.0' } } }) });
  ok(cc.status === 401 && /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/mcp"/.test(cc.headers.get('www-authenticate') || ''), 'Claude Code initialize on /mcp without a token → 401 (its sign-in trigger)');
  const strict = await mcp(null, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'any-cli', version: '1' } }, '/mcp/auth');
  ok(strict.status === 401 && /resource_metadata="[^"]+\/oauth-protected-resource\/mcp"/.test(strict.headers.get('www-authenticate') || ''), '/mcp/auth: initialize without a token → 401 + WWW-Authenticate');
  const strictGet = await (await req('/mcp/auth')).json();
  ok(strictGet.authentication?.lazy === false && strictGet.endpoint === `${BASE}/mcp/auth`, 'GET /mcp/auth describes the sign-in-first endpoint');

  /* 3. dynamic client registration */
  const reg = await req('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Flow test (MCP Inspector)', redirect_uris: [REDIRECT], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }) });
  const client = await reg.json();
  ok(reg.status === 201 && /^ghc_/.test(client.client_id) && client.token_endpoint_auth_method === 'none' && !client.client_secret, 'DCR: public client registered (201)');
  const regBad = await req('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }) });
  ok(regBad.status === 400 && (await regBad.json()).error === 'invalid_redirect_uri', 'DCR: http non-loopback redirect refused');

  /* 4. authorize: bad requests */
  const p0 = pkce();
  const wrongRedirect = await req(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://evil.example/cb', code_challenge: p0.c, code_challenge_method: 'S256' })}`);
  ok(wrongRedirect.status === 400 && !wrongRedirect.headers.get('location'), 'unregistered redirect_uri → error page, never redirected');
  const noPkce = await req(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, state: 's1' })}`);
  const npl = loc(noPkce);
  ok(noPkce.status === 303 && npl.origin + npl.pathname === REDIRECT && npl.searchParams.get('error') === 'invalid_request' && npl.searchParams.get('state') === 's1' && npl.searchParams.get('iss') === BASE, 'missing PKCE → invalid_request back to the app with state and iss');
  const plain = await req(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p0.c, code_challenge_method: 'plain' })}`);
  ok(loc(plain).searchParams.get('error') === 'invalid_request', 'code_challenge_method=plain refused');
  const badRes = await req(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: p0.c, code_challenge_method: 'S256', resource: 'https://evil.example/mcp' })}`);
  ok(loc(badRes).searchParams.get('error') === 'invalid_target', 'foreign resource → invalid_target');

  /* 5. sign-in round trip and consent */
  const a0 = await authorize(client.client_id);
  ok(a0.needLogin && jar.has('gh_oauth_req') && loc(a0.r).searchParams.get('next') === '/account/apps/authorize', 'signed out → portal sign-in with the request parked in an HttpOnly cookie');
  const login = await req('/account/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: form({ email: 'demo@example.com', password: 'demo-pass', next: '/account/apps/authorize' }) });
  ok(login.status === 303 && loc(login).pathname === '/account/apps/authorize' && jar.has('gh_client'), 'portal sign-in returns to /account/apps/authorize');
  const resume = await req('/account/apps/authorize');
  ok(resume.status === 303 && loc(resume).pathname === '/oauth/authorize' && loc(resume).searchParams.get('r'), 'resume → /oauth/authorize?r=…');
  const consentPage = await req(loc(resume).pathname + loc(resume).search);
  const html = await consentPage.text();
  const a1 = { csrf: /name="csrf" value="([^"]+)"/.exec(html)?.[1], blob: /name="r" value="([^"]+)"/.exec(html)?.[1], scopes: [...html.matchAll(/name="scope" value="([^"]+)"/g)].map((m) => m[1]).filter((s) => s !== 'support:write') };
  ok(consentPage.status === 200 && html.includes('Flow test (MCP Inspector)') && html.includes('Allow access') && html.includes('localhost:6274') && a1.csrf && a1.blob, 'consent page: app name, return host, permissions, Allow');
  ok(/frame-ancestors 'none'/.test(consentPage.headers.get('content-security-policy') || '') && /no-store/.test(consentPage.headers.get('cache-control') || ''), 'consent page cannot be framed and is not cached');
  const forged = await req('/oauth/authorize', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: form({ csrf: 'nope', r: a1.blob, decision: 'allow', scope: 'account:read' }) });
  ok(forged.status === 403 && !forged.headers.get('location'), 'consent POST without a valid CSRF token is refused');
  const xo = await req('/oauth/authorize', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.example' }, body: form({ csrf: a1.csrf, r: a1.blob, decision: 'allow', scope: 'account:read' }) });
  ok(xo.status === 403, 'consent POST from another origin is refused');
  const c1 = await consent(a1);
  const code1 = c1.to.searchParams.get('code');
  ok(c1.r.status === 303 && c1.to.origin + c1.to.pathname === REDIRECT && /^ghac_/.test(code1 || '') && c1.to.searchParams.get('iss') === BASE, 'Allow → code back to the app with iss (RFC 9207)');

  /* 6. token endpoint: PKCE, replay */
  const wrongV = await token({ grant_type: 'authorization_code', code: code1, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: pkce().v });
  ok(wrongV.status === 400 && wrongV.body?.error === 'invalid_grant', 'wrong code_verifier → invalid_grant');
  const replay = await token({ grant_type: 'authorization_code', code: code1, redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: a0.p.v });
  ok(replay.status === 400 && replay.body?.error === 'invalid_grant', 'a used code cannot be redeemed again');
  const noVerifier = await token({ grant_type: 'authorization_code', code: 'ghac_x', redirect_uri: REDIRECT, client_id: client.client_id });
  ok(noVerifier.body?.error === 'invalid_request', 'missing code_verifier → invalid_request');
  const unknownClient = await token({ grant_type: 'authorization_code', code: 'x', redirect_uri: REDIRECT, client_id: 'ghc_unknown', code_verifier: pkce().v });
  ok(unknownClient.status === 401 && unknownClient.body?.error === 'invalid_client', 'unknown client → 401 invalid_client');

  // second authorization (already signed in → consent directly), without support:write
  const a2 = await authorize(client.client_id, ['support:write']);
  ok(a2.status === 200 && a2.csrf, 'signed in: consent shown straight away');
  const c2 = await consent(a2);
  const t1 = await token({ grant_type: 'authorization_code', code: c2.to.searchParams.get('code'), redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: a2.p.v, resource: `${BASE}/mcp` });
  ok(t1.status === 200 && /^gha_/.test(t1.body?.access_token) && /^ghr_/.test(t1.body?.refresh_token) && t1.body?.expires_in === 3600 && t1.body?.token_type === 'Bearer' && !t1.body.scope.includes('support:write'), 'code + PKCE → access (1 h) and refresh tokens, scope as approved');
  const AT = t1.body.access_token;

  /* 7. MCP with the token */
  const ov = await call(AT, 'get_account_overview');
  ok(ov.status === 200 && !ov.body?.result?.isError && ov.body?.result?.structuredContent?.name === 'Demo Customer', 'get_account_overview as client 1');
  const doms = await call(AT, 'list_domains');
  ok((doms.body?.result?.structuredContent?.domains || []).some((d) => d.domain === 'demo-brand.com'), 'list_domains returns the customer’s domains');
  const other = await call(AT, 'get_invoice', { invoice_id: 6001 });
  ok(other.body?.result?.isError && other.body.result.structuredContent?.error === 'not_found', 'another client’s invoice → not_found');
  const otherDns = await call(AT, 'list_dns_records', { domain: 'other-site.com' });
  ok(otherDns.body?.result?.isError && /not on your GlobalHostia account/.test(otherDns.body.result.content[0].text), 'another client’s domain → refused');
  const svc = await call(AT, 'get_service', { service_id: 101 });
  ok(!svc.body?.result?.isError && !JSON.stringify(svc.body).includes('NEVER-SHOW-THIS'), 'get_service never returns the service password');
  const step = await call(AT, 'open_ticket', { subject: 'Test', message: 'This should need support:write' });
  ok(step.status === 403 && /insufficient_scope/.test(step.headers.get('www-authenticate') || '') && /support:write/.test(step.headers.get('www-authenticate') || ''), 'tool outside the approved scopes → 403 insufficient_scope (step-up)');
  const dns = await call(AT, 'list_dns_records', { domain: 'demo-brand.com' });
  const editable = dns.body?.result?.structuredContent?.editable;
  if (!editable) skip(`DNS write steps (DNS for demo-brand.com not editable here: ${dns.body?.result?.structuredContent?.note || dns.body?.result?.content?.[0]?.text || 'no panel'})`);
  else {
    const add = await call(AT, 'add_dns_record', { domain: 'demo-brand.com', type: 'MX', name: '@', value: 'mail.mybrand-test.com', priority: 20 });
    ok(!add.body?.result?.isError && /Added MX/.test(add.body?.result?.content?.[0]?.text || ''), 'add_dns_record: "add an MX record" works');
    const after = await call(AT, 'list_dns_records', { domain: 'demo-brand.com', type: 'MX' });
    const rec = (after.body?.result?.structuredContent?.records || []).find((r) => /mail\.mybrand-test\.com/.test(r.value));
    ok(!!rec, 'the new MX record is listed');
    const del0 = await call(AT, 'delete_dns_record', { domain: 'demo-brand.com', record_id: rec?.id });
    ok(del0.body?.result?.isError && del0.body.result.structuredContent?.error === 'confirm', 'delete_dns_record without confirm → refused with a summary');
    const del1 = await call(AT, 'delete_dns_record', { domain: 'demo-brand.com', record_id: rec?.id, confirm: true });
    ok(!del1.body?.result?.isError, 'delete_dns_record with confirm: true');
  }
  ok((await mcp(AT, 'tools/list', {}, '/mcp/chatgpt')).status === 401, 'a /mcp token is refused by /mcp/chatgpt (audience binding)');

  /* 8. refresh rotation and replay */
  const r1 = await token({ grant_type: 'refresh_token', refresh_token: t1.body.refresh_token, client_id: client.client_id });
  ok(r1.status === 200 && r1.body.refresh_token !== t1.body.refresh_token && r1.body.access_token !== AT, 'refresh_token grant rotates both tokens');
  ok((await call(r1.body.access_token, 'list_domains')).status === 200, 'new access token works');
  const up = await token({ grant_type: 'refresh_token', refresh_token: r1.body.refresh_token, client_id: client.client_id, scope: 'account:read support:write' });
  ok(up.body?.error === 'invalid_scope', 'a refresh cannot add scopes');
  const rr = await token({ grant_type: 'refresh_token', refresh_token: t1.body.refresh_token, client_id: client.client_id });
  ok(rr.status === 400 && rr.body?.error === 'invalid_grant', 'reusing a rotated refresh token → invalid_grant');
  ok((await call(r1.body.access_token, 'list_domains')).status === 401, '… and revokes the whole connection (refresh replay detection)');

  /* 9. revocation: RFC 7009 and Connected apps */
  const a3 = await authorize(client.client_id); const c3 = await consent(a3);
  const t3 = await token({ grant_type: 'authorization_code', code: c3.to.searchParams.get('code'), redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: a3.p.v });
  const rv = await req('/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token: t3.body.refresh_token, client_id: client.client_id }) });
  ok(rv.status === 200 && (await call(t3.body.access_token, 'list_domains')).status === 401, '/oauth/revoke on the refresh token ends the connection');
  const a4 = await authorize(client.client_id); const c4 = await consent(a4);
  const t4 = await token({ grant_type: 'authorization_code', code: c4.to.searchParams.get('code'), redirect_uri: REDIRECT, client_id: client.client_id, code_verifier: a4.p.v });
  const apps = await req('/account/apps');
  const appsHtml = await apps.text();
  ok(apps.status === 200 && appsHtml.includes('Flow test (MCP Inspector)') && appsHtml.includes('Disconnect'), 'Account → Connected apps lists the connection');
  const gid = [...appsHtml.matchAll(/name="id" value="([a-z0-9]+)"/g)].map((m) => m[1]);
  const csrf = /name="csrf" value="([^"]+)"/.exec(appsHtml)?.[1];
  for (const id of gid) await req('/account/apps', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE }, body: form({ csrf, op: 'revoke', id }) });
  ok((await call(t4.body.access_token, 'list_domains')).status === 401, 'Disconnect in Connected apps revokes the token immediately');
  const deny = await authorize(client.client_id); const d = await consent(deny, 'deny');
  ok(d.to.searchParams.get('error') === 'access_denied' && d.to.searchParams.get('state') === deny.state, 'Cancel on the consent page → access_denied with state');

  /* 9b. loopback redirect with another port (Claude Code / RFC 8252) and no resource parameter */
  const LOOP = 'http://127.0.0.1:33418/callback';
  const regLoop = await (await req('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Flow test (Claude Code)', redirect_uris: ['http://127.0.0.1/callback', 'http://localhost/callback'], grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'], token_endpoint_auth_method: 'none' }) })).json();
  ok(/^ghc_/.test(regLoop.client_id) && regLoop.grant_types?.join() === 'authorization_code,refresh_token', 'DCR: unsupported extra grant types are dropped, not fatal');
  const aL = await authorize(regLoop.client_id, [], { redirect: LOOP, resource: null });
  const cL = await consent(aL);
  ok(cL.to.origin + cL.to.pathname === LOOP && /^ghac_/.test(cL.to.searchParams.get('code') || ''), 'loopback redirect on any port matches the port-less registration');
  const tL = await token({ grant_type: 'authorization_code', code: cL.to.searchParams.get('code'), redirect_uri: LOOP, client_id: regLoop.client_id, code_verifier: aL.p.v });
  ok(tL.status === 200 && (await call(tL.body?.access_token, 'list_domains')).status === 200, 'no resource parameter → token for /mcp');
  ok((await mcp(tL.body?.access_token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-code', version: '2' } }, '/mcp/auth')).status === 200, 'the /mcp token works on /mcp/auth');
  const aA = await authorize(regLoop.client_id, [], { redirect: LOOP, resource: `${BASE}/mcp/auth` });
  const cA = await consent(aA);
  const tA = await token({ grant_type: 'authorization_code', code: cA.to.searchParams.get('code'), redirect_uri: LOOP, client_id: regLoop.client_id, code_verifier: aA.p.v, resource: `${BASE}/mcp/auth` });
  ok(tA.status === 200 && (await call(tA.body?.access_token, 'list_domains')).status === 200, 'resource=/mcp/auth is accepted as /mcp');

  /* 9c. private_key_jwt client (RFC 7523): what ChatGPT's client metadata document uses */
  const kp = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = { ...kp.publicKey.export({ format: 'jwk' }), kid: 'flow-1', use: 'sig', alg: 'ES256' };
  const regJ = await req('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Flow test (private_key_jwt)', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'private_key_jwt', jwks: { keys: [pub] } }) });
  const cj = await regJ.json();
  ok(regJ.status === 201 && cj.token_endpoint_auth_method === 'private_key_jwt' && !cj.client_secret && cj.jwks?.keys?.length === 1, 'DCR: private_key_jwt client with jwks');
  const b64j = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const assertion = (o = {}) => { const now = Math.floor(Date.now() / 1000); const input = `${b64j({ alg: 'ES256', kid: 'flow-1', typ: 'JWT' })}.${b64j({ iss: cj.client_id, sub: cj.client_id, aud: `${BASE}/oauth/token`, iat: now, exp: now + 120, jti: randomBytes(12).toString('hex'), ...o })}`; return `${input}.${jwsSign('sha256', Buffer.from(input), { key: kp.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`; };
  const AT_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
  const aJ = await authorize(cj.client_id); const cJ = await consent(aJ);
  const codeJ = cJ.to.searchParams.get('code');
  const noAssert = await token({ grant_type: 'authorization_code', code: codeJ, redirect_uri: REDIRECT, client_id: cj.client_id, code_verifier: aJ.p.v });
  ok(noAssert.status === 401 && noAssert.body?.error === 'invalid_client' && /private_key_jwt/.test(noAssert.body?.error_description || ''), 'private_key_jwt client without an assertion → 401 invalid_client');
  const badAud = await token({ grant_type: 'authorization_code', code: codeJ, redirect_uri: REDIRECT, client_id: cj.client_id, code_verifier: aJ.p.v, client_assertion_type: AT_TYPE, client_assertion: assertion({ aud: 'https://evil.example/token' }) });
  ok(badAud.status === 401 && /aud/.test(badAud.body?.error_description || ''), 'assertion for another audience → 401');
  const expired = await token({ grant_type: 'authorization_code', code: codeJ, redirect_uri: REDIRECT, client_id: cj.client_id, code_verifier: aJ.p.v, client_assertion_type: AT_TYPE, client_assertion: assertion({ exp: Math.floor(Date.now() / 1000) - 600 }) });
  ok(expired.status === 401 && /expired/.test(expired.body?.error_description || ''), 'expired assertion → 401');
  const one = assertion();
  const tJ = await token({ grant_type: 'authorization_code', code: codeJ, redirect_uri: REDIRECT, code_verifier: aJ.p.v, client_assertion_type: AT_TYPE, client_assertion: one });
  ok(tJ.status === 200 && /^gha_/.test(tJ.body?.access_token || ''), 'code + valid ES256 client assertion (client_id taken from the assertion) → tokens');
  const replayJ = await token({ grant_type: 'refresh_token', refresh_token: tJ.body?.refresh_token, client_id: cj.client_id, client_assertion_type: AT_TYPE, client_assertion: one });
  ok(replayJ.status === 401 && /replay/.test(replayJ.body?.error_description || ''), 'the same assertion twice → 401 (jti replay)');
  const rJ = await token({ grant_type: 'refresh_token', refresh_token: tJ.body?.refresh_token, client_id: cj.client_id, client_assertion_type: AT_TYPE, client_assertion: assertion() });
  ok(rJ.status === 200 && rJ.body?.refresh_token !== tJ.body?.refresh_token, 'refresh with a fresh assertion rotates tokens');
  const rvJ = await req('/oauth/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token: rJ.body?.refresh_token, client_assertion_type: AT_TYPE, client_assertion: assertion({ aud: BASE }) }) });
  ok(rvJ.status === 200 && (await call(rJ.body?.access_token, 'list_domains')).status === 401, 'revocation authenticated with an assertion (aud = issuer)');

  /* 10. pages */
  for (const p of ['/connectors', '/docs/mcp']) { const r = await req(p); const h = await r.text(); ok(r.status === 200 && h.includes('/mcp') && !/noindex/.test(r.headers.get('x-robots-tag') || ''), `${p} renders and is indexable`); }
  const ch = await req('/.well-known/openai-apps-challenge');
  ok([200, 404].includes(ch.status) && /text\/plain/.test(ch.headers.get('content-type') || ''), `/.well-known/openai-apps-challenge answers plain text (${ch.status})`);

  console.log(`\n${failures ? `${failures} FAILED` : 'ALL PASSED'}${skips ? ` (${skips} skipped)` : ''}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
