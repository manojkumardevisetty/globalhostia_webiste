// Who is asking the customer assistant: the hosting-panel token (Authorization: GH-Hosting|Bearer <token>, from the WHMCS
// hook, CORS for my.globalhostia.com) or the account portal session (gh_client cookie, same origin only).
// Both are verified with the existing helpers, used read-only.
import 'server-only';
import type { NextRequest } from 'next/server';
import { cors, errorResponse, hostingCtx, type Ctx as HostingCtx } from '../hosting/context';
import { bearer } from '../hosting/token';
import { readClient, sameOrigin } from '../portal/session';
import { hostingDeps, portalDeps } from './tools/customer';
import type { CustomerDeps, Via } from './tools/customer-core';

export type AssistWho = { via: Via; cid: number; deps: CustomerDeps; headers: Record<string, string>; hosting?: HostingCtx; email?: string };

export async function assistAuth(req: NextRequest): Promise<{ ok: true; who: AssistWho } | { ok: false; res: Response }> {
  if (bearer(req.headers.get('authorization'))) {
    try {
      const h = await hostingCtx(req, false);
      return { ok: true, who: { via: 'hosting', cid: h.claims.cid, deps: hostingDeps(h), headers: cors(req), hosting: h } };
    } catch (e) { return { ok: false, res: errorResponse(req, e) }; }
  }
  const sess = await readClient(req);
  if (!sess) return { ok: false, res: Response.json({ error: 'unauthorized', message: 'Sign in to use the assistant.' }, { status: 401, headers: { 'cache-control': 'no-store' } }) };
  if (!sameOrigin(req)) return { ok: false, res: Response.json({ error: 'forbidden' }, { status: 403, headers: { 'cache-control': 'no-store' } }) };
  return { ok: true, who: { via: 'portal', cid: sess.clientId, deps: portalDeps(), headers: { 'cache-control': 'no-store' }, email: sess.email } };
}
