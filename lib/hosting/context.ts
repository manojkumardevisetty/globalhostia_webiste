// Request guard for /api/hosting/*: CORS (my.globalhostia.com only, no credentials), the WHMCS-hook token,
// rate limits, WHMCS ownership + status check, server lookup, panel adapter as the account's own user, audit.
import 'server-only';
import { db, schema } from '../db';
import { getService } from '../portal/api';
import { limiter } from '../agents/http';
import { bearer, verifyToken, type HostingToken } from './token';
import { hmacSecret, loadServers } from './servers';
import { serverFor } from './match';
import { providerFor } from './providers';
import { InputError, panelUser } from './validate';
import { PanelError, type Account, type HostingProvider } from './types';

export const ALLOWED_ORIGINS = (process.env.HOSTING_ALLOWED_ORIGINS || 'https://my.globalhostia.com').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

export function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin');
  const h: Record<string, string> = { 'cache-control': 'no-store', vary: 'Origin', 'x-content-type-options': 'nosniff' };
  if (o && ALLOWED_ORIGINS.includes(o)) {
    h['access-control-allow-origin'] = o;
    h['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    h['access-control-allow-headers'] = 'authorization, content-type';
    h['access-control-expose-headers'] = 'content-disposition, retry-after';
    h['access-control-max-age'] = '600';
  }
  return h;
}

export class HttpError extends Error { constructor(public status: number, message: string, public code = 'error') { super(message); } }

export function errorResponse(req: Request, e: unknown) {
  const h = cors(req);
  if (e instanceof HttpError) return Response.json({ error: e.code, message: e.message }, { status: e.status, headers: h });
  if (e instanceof InputError) return Response.json({ error: 'invalid', message: e.message }, { status: 400, headers: h });
  if (e instanceof PanelError) return Response.json({ error: 'panel', message: e.message }, { status: e.status, headers: h });
  console.error('[hosting]', e);
  return Response.json({ error: 'server', message: 'Something went wrong. Please try again.' }, { status: 500, headers: h });
}

const readLimit = limiter(120, 60_000);
const writeLimit = limiter(30, 60_000);
const ipLimit = limiter(300, 60_000);

export interface Ctx { claims: HostingToken; acct: Account; p: HostingProvider; ip: string }

const verified = new Map<string, { ctx: Omit<Ctx, 'ip'>; until: number }>();
const domainCache = new Map<string, { list: string[]; until: number }>();

const clientIp = (req: Request) => (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);

/** Authenticate a request. `write` selects the stricter rate limit. */
export async function hostingCtx(req: Request, write: boolean): Promise<Ctx> {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) throw new HttpError(403, 'Origin not allowed', 'origin');
  const ip = clientIp(req);
  const wIp = ipLimit(ip); if (wIp) throw new HttpError(429, `Too many requests. Try again in ${wIp}s.`, 'rate_limited');

  const token = bearer(req.headers.get('authorization'));
  const v = verifyToken(token, await hmacSecret());
  if (!v.ok) {
    if (v.error === 'config') throw new HttpError(503, 'Hosting management is not configured yet.', 'not_configured');
    if (v.error === 'expired') throw new HttpError(401, 'Your session expired. Reload the page to continue.', 'expired');
    throw new HttpError(401, 'Not signed in.', 'unauthorized');
  }
  const { cid, sid } = v.claims;
  const wait = (write ? writeLimit : readLimit)(`c${cid}`);
  if (wait) throw new HttpError(429, `Too many requests. Try again in ${wait}s.`, 'rate_limited');

  const now = Date.now();
  const hit = verified.get(token!);
  if (hit && hit.until > now) return { ...hit.ctx, ip };

  const svc = await getService(cid, sid);
  if (!svc) throw new HttpError(404, 'Service not found on your account.', 'not_found');
  if (String(svc.status) !== 'Active') throw new HttpError(409, `This service is ${String(svc.status || 'not active').toLowerCase()}, so it cannot be managed right now.`, 'inactive');
  const server = serverFor(svc, await loadServers());
  if (!server) throw new HttpError(409, 'This service is not on a server that can be managed here.', 'unmanaged');
  const acct: Account = { username: panelUser(svc.username), domain: String(svc.domain || '').toLowerCase(), server };
  const ctx = { claims: v.claims, acct, p: providerFor(acct) };
  if (verified.size > 2000) verified.clear();
  verified.set(token!, { ctx, until: Math.min(now + 60_000, v.claims.exp * 1000) });
  return { ...ctx, ip };
}

/** The account's domains as reported by the panel (cached 60s per server+user). */
export async function ownedDomains(ctx: Ctx): Promise<string[]> {
  const k = `${ctx.acct.server.id}|${ctx.acct.username}`;
  const c = domainCache.get(k);
  if (c && c.until > Date.now()) return c.list;
  const list = await ctx.p.domains();
  if (domainCache.size > 2000) domainCache.clear();
  domainCache.set(k, { list, until: Date.now() + 60_000 });
  return list;
}

/** Audit every mutating action. Never pass passwords or file contents in `detail`. */
export async function auditHosting(ctx: Ctx, action: string, detail: Record<string, unknown>, ok = true) {
  await db.insert(schema.auditLogs).values({
    userEmail: `client#${ctx.claims.cid}`, action: `hosting.${action}${ok ? '' : '.failed'}`, entity: 'hosting_service', entityId: String(ctx.claims.sid),
    detail: { server: ctx.acct.server.id, panel: ctx.acct.server.panel, user: ctx.acct.username, ip: ctx.ip, ...detail } as any,
  }).catch(() => {});
}
