// OAuth persistence: clients (DCR rows and cached Client ID Metadata Documents), grants (one consent each), one-time
// authorization codes and opaque access / refresh tokens, stored as SHA-256 hashes only.
// Code replay and refresh-token replay revoke the whole grant (OAuth 2.1 §4.3.1 / refresh rotation).
import 'server-only';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { db, schema } from '../db';
import { createId } from '../id';
import {
  ACCESS_TTL_S, ASSERTION_TYPE, CODE_TTL_S, GRANT_TTL_S, REFRESH_TTL_S, classifyRedirect, cleanJwks, hashToken, isCimdClientId, platformOf, randomToken,
  scopeString, validateCimd, verifyClientAssertion, verifyPkce, type ClientMeta, type Jwks,
} from './core';
import { CimdError, fetchCimd, fetchJwks } from './cimd';

export type Client = {
  id: string; kind: 'dcr' | 'cimd'; name: string; redirectUris: string[]; platform: string; flagged: boolean;
  /** preferred token endpoint method; authMethods lists every accepted one (CIMDs may declare several) */
  authMethod: string; authMethods: string[]; secretHash: string | null; disabled: boolean; clientUri: string | null; jwks: Jwks | null; jwksUri: string | null;
};
export class OAuthError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }

const T = schema.oauthTokens, G = schema.oauthGrants, C = schema.oauthCodes, CL = schema.oauthClients, A = schema.oauthAssertions;
const flaggedOf = (uris: string[]) => uris.some((u) => { const c = classifyRedirect(u); return !c.ok || c.flagged; });
const toClient = (r: typeof CL.$inferSelect): Client => {
  const methods = (r.authMethod || 'none').split(/\s+/).filter(Boolean);
  return { id: r.id, kind: r.kind as Client['kind'], name: r.name, redirectUris: r.redirectUris, platform: r.platform, flagged: r.flagged, authMethod: methods[0] || 'none', authMethods: methods.length ? methods : ['none'],
    secretHash: r.secretHash, disabled: r.disabled, clientUri: r.clientUri, jwks: cleanJwks(r.jwks), jwksUri: r.jwksUri ?? null };
};
const inS = (s: number) => new Date(Date.now() + s * 1000);

/* ------------------------------------------------------------------ clients */
const CIMD_FRESH_MS = 60 * 60_000, CIMD_STALE_MS = 24 * 60 * 60_000;

/** Look up a client: a DCR row, or a CIMD URL (fetched, validated and cached for an hour; a stale copy survives 24 h of fetch errors). */
export async function findClient(clientId: unknown): Promise<Client | null> {
  if (typeof clientId !== 'string' || !clientId || clientId.length > 512) return null;
  const [row] = await db.select().from(CL).where(eq(CL.id, clientId));
  if (!isCimdClientId(clientId)) return row && row.kind === 'dcr' ? toClient(row) : null;
  const age = row?.fetchedAt ? Date.now() - row.fetchedAt.getTime() : Infinity;
  if (row && age < CIMD_FRESH_MS) return toClient(row);
  let meta: ClientMeta;
  try {
    const v = validateCimd(await fetchCimd(clientId), clientId);
    if (!v.ok) throw new OAuthError('invalid_client', v.reason);
    meta = v.meta;
  } catch (e) {
    if (row && age < CIMD_STALE_MS) return toClient(row);
    if (e instanceof OAuthError) throw e;
    throw new OAuthError('invalid_client', e instanceof CimdError ? e.message : 'client metadata document could not be fetched');
  }
  const values = { id: clientId, kind: 'cimd', name: meta.name, redirectUris: meta.redirectUris, platform: platformOf(clientId, meta.redirectUris), flagged: flaggedOf(meta.redirectUris),
    authMethod: meta.authMethods.join(' '), jwks: meta.jwks ?? null, jwksUri: meta.jwksUri ?? null, clientUri: meta.clientUri ?? null, logoUri: meta.logoUri ?? null, fetchedAt: new Date() };
  const [saved] = await db.insert(CL).values(values).onConflictDoUpdate({ target: CL.id, set: { name: values.name, redirectUris: values.redirectUris, platform: values.platform, flagged: values.flagged,
    authMethod: values.authMethod, jwks: values.jwks, jwksUri: values.jwksUri, clientUri: values.clientUri, logoUri: values.logoUri, fetchedAt: values.fetchedAt } }).returning();
  if (meta.authMethod !== 'none') console.info('[oauth] cimd client', clientId, 'auth', values.authMethod, meta.jwksUri ? `jwks_uri ${meta.jwksUri}` : 'inline jwks');
  return toClient(saved);
}

export async function registerClient(meta: ClientMeta): Promise<{ client: Client; secret?: string; issuedAt: number }> {
  const id = `ghc_${randomToken('', 18)}`;
  const secret = meta.authMethod === 'client_secret_post' || meta.authMethod === 'client_secret_basic' ? randomToken('ghs_', 32) : undefined;
  const [row] = await db.insert(CL).values({
    id, kind: 'dcr', name: meta.name, redirectUris: meta.redirectUris, platform: platformOf(id, meta.redirectUris), flagged: flaggedOf(meta.redirectUris),
    authMethod: meta.authMethod, secretHash: secret ? hashToken(secret) : null, jwks: meta.jwks ?? null, jwksUri: meta.jwksUri ?? null, clientUri: meta.clientUri ?? null, logoUri: meta.logoUri ?? null,
  }).returning();
  if (Math.random() < 0.02) cleanup().catch(() => {});
  return { client: toClient(row), secret, issuedAt: Math.floor(row.createdAt.getTime() / 1000) };
}

/* ------------------------------------------------------------------ client authentication at the token / revocation endpoints */
export type ClientCredentials = { secret: string | null; assertion?: string | null; assertionType?: string | null };

const JWKS_FRESH_MS = 10 * 60_000, JWKS_REFETCH_MIN_MS = 30_000;
const jwksCache = new Map<string, { jwks: Jwks; at: number }>();
/** A jwks_uri's keys, cached for 10 minutes; `force` refetches (key rotation: unknown kid), at most every 30 s. */
async function jwksFor(url: string, force = false): Promise<Jwks> {
  const hit = jwksCache.get(url);
  if (hit && Date.now() - hit.at < (force ? JWKS_REFETCH_MIN_MS : JWKS_FRESH_MS)) return hit.jwks;
  let jwks: Jwks | null;
  try { jwks = cleanJwks(await fetchJwks(url)); }
  catch (e) { if (hit) return hit.jwks; throw new OAuthError('invalid_client', e instanceof CimdError ? e.message : 'JWK Set could not be fetched'); }
  if (!jwks) { if (hit) return hit.jwks; throw new OAuthError('invalid_client', 'jwks_uri did not return a JWK Set with RSA or EC public keys'); }
  if (jwksCache.size > 200) jwksCache.clear();
  jwksCache.set(url, { jwks, at: Date.now() });
  return jwks;
}

/** private_key_jwt (RFC 7523): verify the assertion with the client's keys and record its jti once (replay = refused). */
async function verifyAssertion(c: Client, assertion: string, audiences: string[]) {
  const run = (jwks: Jwks) => verifyClientAssertion({ assertion, clientId: c.id, audiences, jwks });
  let r = c.jwksUri ? run(await jwksFor(c.jwksUri)) : c.jwks ? run(c.jwks) : null;
  if (!r) throw new OAuthError('invalid_client', 'The client has no keys registered for private_key_jwt');
  if (!r.ok && r.unknownKid && c.jwksUri) r = run(await jwksFor(c.jwksUri, true));
  if (!r.ok) { console.warn('[oauth] client assertion refused', c.id, r.reason); throw new OAuthError('invalid_client', r.reason); }
  const [fresh] = await db.insert(A).values({ key: r.replayKey, clientId: c.id, expiresAt: new Date((r.exp + 120) * 1000) }).onConflictDoNothing().returning({ key: A.key });
  if (!fresh) { console.warn('[oauth] client assertion replay', c.id); throw new OAuthError('invalid_client', 'client_assertion was already used (jti replay)'); }
  if (Math.random() < 0.05) db.delete(A).where(lt(A.expiresAt, new Date())).catch(() => {});
}

/**
 * Authenticate the client the way it registered: "none" (public: nothing to prove), client_secret_post / _basic (DCR
 * secret) or private_key_jwt (client_assertion signed with a key from its jwks / jwks_uri, aud = one of `audiences`).
 * Throws OAuthError('invalid_client') with the reason on failure.
 */
export async function authenticateClient(c: Client, cred: ClientCredentials, audiences: string[]): Promise<void> {
  const m = c.authMethods;
  if (cred.assertion || cred.assertionType) {
    if (cred.assertionType !== ASSERTION_TYPE) throw new OAuthError('invalid_client', `client_assertion_type must be ${ASSERTION_TYPE}`);
    if (!cred.assertion) throw new OAuthError('invalid_client', 'client_assertion is required with client_assertion_type');
    if (!m.includes('private_key_jwt')) throw new OAuthError('invalid_client', `This client is registered for ${m.join(' / ')}, not private_key_jwt`);
    return verifyAssertion(c, cred.assertion, audiences);
  }
  if (m.includes('client_secret_post') || m.includes('client_secret_basic')) {
    if (!cred.secret || !c.secretHash) throw new OAuthError('invalid_client', 'Client authentication failed');
    const a = Buffer.from(hashToken(cred.secret)), b = Buffer.from(c.secretHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new OAuthError('invalid_client', 'Client authentication failed');
    return;
  }
  if (m.includes('none')) return;
  throw new OAuthError('invalid_client', 'This client must authenticate with private_key_jwt (client_assertion and client_assertion_type)');
}

/* ------------------------------------------------------------------ grants and codes */
export async function createGrantAndCode(o: { clientId: string; cid: number; email: string; scopes: string[]; resource: string; redirectUri: string; codeChallenge: string }) {
  const grantId = createId();
  await db.insert(G).values({ id: grantId, clientId: o.clientId, whmcsClientId: o.cid, userEmail: o.email.slice(0, 254), scopes: o.scopes, resource: o.resource, expiresAt: inS(GRANT_TTL_S) });
  const code = randomToken('ghac_', 32);
  await db.insert(C).values({ hash: hashToken(code), grantId, clientId: o.clientId, redirectUri: o.redirectUri, codeChallenge: o.codeChallenge, expiresAt: inS(CODE_TTL_S) });
  await db.update(CL).set({ lastUsedAt: new Date() }).where(eq(CL.id, o.clientId)).catch(() => {});
  return { code, grantId };
}

export type TokenSet = { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string };

async function liveGrant(id: string) {
  const [g] = await db.select().from(G).where(eq(G.id, id));
  if (!g || g.revokedAt || g.expiresAt.getTime() <= Date.now()) return null;
  return g;
}

async function issue(g: typeof G.$inferSelect, scopes: string[]): Promise<TokenSet> {
  const access = randomToken('gha_', 32), refresh = randomToken('ghr_', 32);
  const refreshExp = new Date(Math.min(Date.now() + REFRESH_TTL_S * 1000, g.expiresAt.getTime()));
  const base = { grantId: g.id, clientId: g.clientId, whmcsClientId: g.whmcsClientId, scopes, resource: g.resource };
  await db.insert(T).values([{ ...base, hash: hashToken(access), kind: 'access', expiresAt: inS(ACCESS_TTL_S) }, { ...base, hash: hashToken(refresh), kind: 'refresh', expiresAt: refreshExp }]);
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopeString(scopes) };
}

export async function revokeGrant(id: string, by: string, onlyCid?: number) {
  const where = onlyCid ? and(eq(G.id, id), eq(G.whmcsClientId, onlyCid)) : eq(G.id, id);
  const rows = await db.update(G).set({ revokedAt: new Date(), revokedBy: by.slice(0, 120) }).where(and(where, isNull(G.revokedAt))).returning({ id: G.id });
  await db.update(T).set({ revokedAt: new Date() }).where(and(eq(T.grantId, id), isNull(T.revokedAt)));
  return rows.length > 0;
}

/** authorization_code grant: one use, PKCE S256, same client and redirect URI, resource (if sent) must match. */
export async function redeemCode(o: { code: string; clientId: string; redirectUri: string; verifier: unknown; resource?: string | null }): Promise<TokenSet> {
  const h = hashToken(o.code);
  const [row] = await db.update(C).set({ usedAt: new Date() }).where(and(eq(C.hash, h), isNull(C.usedAt))).returning();
  if (!row) {
    const [seen] = await db.select().from(C).where(eq(C.hash, h));
    if (seen?.usedAt) await revokeGrant(seen.grantId, 'code_replay');
    throw new OAuthError('invalid_grant', 'Authorization code is invalid, expired or already used');
  }
  if (row.expiresAt.getTime() <= Date.now()) throw new OAuthError('invalid_grant', 'Authorization code expired');
  if (row.clientId !== o.clientId) throw new OAuthError('invalid_grant', 'Authorization code was issued to another client');
  if (row.redirectUri !== o.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri does not match the authorization request');
  if (!verifyPkce(o.verifier, row.codeChallenge)) throw new OAuthError('invalid_grant', 'PKCE verification failed (code_verifier does not match the S256 code_challenge)');
  const g = await liveGrant(row.grantId);
  if (!g) throw new OAuthError('invalid_grant', 'The authorization was revoked');
  if (o.resource && o.resource.replace(/\/+$/, '') !== g.resource.replace(/\/+$/, '')) throw new OAuthError('invalid_target', 'resource does not match the authorization request');
  return issue(g, g.scopes);
}

/** refresh_token grant with rotation. A rotated (already used) refresh token revokes the grant. Scope may only narrow. */
export async function refreshTokens(o: { refreshToken: string; clientId: string; scope?: string[] | null; resource?: string | null }): Promise<TokenSet> {
  const h = hashToken(o.refreshToken);
  const [row] = await db.update(T).set({ usedAt: new Date() })
    .where(and(eq(T.hash, h), eq(T.kind, 'refresh'), isNull(T.usedAt), isNull(T.revokedAt), gt(T.expiresAt, new Date()))).returning();
  if (!row) {
    const [seen] = await db.select().from(T).where(and(eq(T.hash, h), eq(T.kind, 'refresh')));
    if (seen?.usedAt && !seen.revokedAt) await revokeGrant(seen.grantId, 'refresh_replay');
    throw new OAuthError('invalid_grant', 'Refresh token is invalid, expired, revoked or already used');
  }
  if (row.clientId !== o.clientId) { await revokeGrant(row.grantId, 'refresh_wrong_client'); throw new OAuthError('invalid_grant', 'Refresh token was issued to another client'); }
  const g = await liveGrant(row.grantId);
  if (!g) throw new OAuthError('invalid_grant', 'The authorization was revoked or expired');
  if (o.resource && o.resource.replace(/\/+$/, '') !== g.resource.replace(/\/+$/, '')) throw new OAuthError('invalid_target', 'resource does not match the authorization');
  let scopes = row.scopes;
  if (o.scope?.length) {
    if (o.scope.some((s) => !row.scopes.includes(s))) throw new OAuthError('invalid_scope', 'A refresh cannot add scopes; authorize again');
    scopes = o.scope;
  }
  return issue(g, scopes);
}

/** RFC 7009: revoking a refresh token revokes the grant; an access token only itself. Unknown tokens are not an error. */
export async function revokeToken(token: string, clientId: string | null) {
  const [row] = await db.select().from(T).where(eq(T.hash, hashToken(token)));
  if (!row || (clientId && row.clientId !== clientId)) return;
  if (row.kind === 'refresh') await revokeGrant(row.grantId, 'client_revoke');
  else await db.update(T).set({ revokedAt: new Date() }).where(eq(T.hash, row.hash));
}

/* ------------------------------------------------------------------ resource server */
export type AccessInfo = { grantId: string; clientId: string; cid: number; scopes: string[]; resource: string; platform: string; email: string };
const touched = new Map<string, number>();

/** Verify an access token: known, not expired or revoked, grant live, client not disabled. Audience is checked by the caller. */
export async function verifyAccess(token: string): Promise<AccessInfo | null> {
  const rows = await db.select({ t: T, g: G, c: { platform: CL.platform, disabled: CL.disabled } }).from(T)
    .innerJoin(G, eq(G.id, T.grantId)).leftJoin(CL, eq(CL.id, T.clientId))
    .where(and(eq(T.hash, hashToken(token)), eq(T.kind, 'access'))).limit(1);
  const r = rows[0];
  if (!r || r.t.revokedAt || r.t.expiresAt.getTime() <= Date.now() || r.g.revokedAt || r.g.expiresAt.getTime() <= Date.now() || r.c?.disabled) return null;
  const last = touched.get(r.g.id) || 0;
  if (Date.now() - last > 5 * 60_000) {
    if (touched.size > 5000) touched.clear();
    touched.set(r.g.id, Date.now());
    db.update(G).set({ lastUsedAt: new Date() }).where(eq(G.id, r.g.id)).catch(() => {});
  }
  return { grantId: r.g.id, clientId: r.t.clientId, cid: r.t.whmcsClientId, scopes: r.t.scopes, resource: r.t.resource, platform: r.c?.platform || 'other', email: r.g.userEmail };
}

/* ------------------------------------------------------------------ listings */
export type GrantRow = { id: string; clientId: string; name: string; platform: string; flagged: boolean; scopes: string[]; createdAt: Date; lastUsedAt: Date | null; expiresAt: Date; revokedAt: Date | null; whmcsClientId: number; userEmail: string; revokedBy: string };

const grantCols = { id: G.id, clientId: G.clientId, name: sql<string>`coalesce(${CL.name}, '')`, platform: sql<string>`coalesce(${CL.platform}, 'other')`, flagged: sql<boolean>`coalesce(${CL.flagged}, false)`,
  scopes: G.scopes, createdAt: G.createdAt, lastUsedAt: G.lastUsedAt, expiresAt: G.expiresAt, revokedAt: G.revokedAt, whmcsClientId: G.whmcsClientId, userEmail: G.userEmail, revokedBy: G.revokedBy };

/** A customer's active connections (Account → Connected apps). */
export async function customerGrants(cid: number): Promise<GrantRow[]> {
  return db.select(grantCols).from(G).leftJoin(CL, eq(CL.id, G.clientId))
    .where(and(eq(G.whmcsClientId, cid), isNull(G.revokedAt), gt(G.expiresAt, new Date()))).orderBy(desc(G.createdAt)).limit(100);
}

export async function adminGrants(o: { activeOnly?: boolean; limit?: number } = {}): Promise<GrantRow[]> {
  const where = o.activeOnly ? and(isNull(G.revokedAt), gt(G.expiresAt, new Date())) : undefined;
  return db.select(grantCols).from(G).leftJoin(CL, eq(CL.id, G.clientId)).where(where).orderBy(desc(G.createdAt)).limit(o.limit ?? 200);
}

export async function adminClients(limit = 200) {
  const active = db.$with('active').as(db.select({ clientId: G.clientId, n: sql<number>`count(*)::int`.as('n') }).from(G).where(and(isNull(G.revokedAt), gt(G.expiresAt, new Date()))).groupBy(G.clientId));
  return db.with(active).select({ c: CL, active: sql<number>`coalesce(${active.n}, 0)` }).from(CL).leftJoin(active, eq(active.clientId, CL.id)).orderBy(desc(CL.createdAt)).limit(limit);
}

export async function setClientDisabled(id: string, disabled: boolean) {
  await db.update(CL).set({ disabled }).where(eq(CL.id, id));
  if (disabled) {
    const gs = await db.select({ id: G.id }).from(G).where(and(eq(G.clientId, id), isNull(G.revokedAt)));
    for (const g of gs) await revokeGrant(g.id, 'admin_disable_client');
  }
}

/** Admin kill-everything: revoke every live grant (and so every token). */
export async function revokeAll(by: string) {
  const gs = await db.select({ id: G.id }).from(G).where(isNull(G.revokedAt));
  await db.update(G).set({ revokedAt: new Date(), revokedBy: by.slice(0, 120) }).where(isNull(G.revokedAt));
  await db.update(T).set({ revokedAt: new Date() }).where(isNull(T.revokedAt));
  return gs.length;
}

/** Housekeeping: expired codes, tokens past expiry for a week, DCR clients never used for 30 days. */
export async function cleanup() {
  const week = new Date(Date.now() - 7 * 86400_000), month = new Date(Date.now() - 30 * 86400_000);
  await db.delete(C).where(lt(C.expiresAt, new Date()));
  await db.delete(T).where(lt(T.expiresAt, week));
  await db.delete(A).where(lt(A.expiresAt, new Date()));
  const unused = db.select({ id: G.clientId }).from(G);
  await db.delete(CL).where(and(eq(CL.kind, 'dcr'), lt(CL.createdAt, month), or(isNull(CL.lastUsedAt), lt(CL.lastUsedAt, month)), sql`${CL.id} not in ${unused}`));
}

export async function grantById(id: string) { const [g] = await db.select().from(G).where(eq(G.id, id)); return g || null; }
