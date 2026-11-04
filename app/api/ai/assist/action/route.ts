// Confirm button of a "ticket.open" proposal from the customer assistant: opens the ticket that the signed proposal
// describes, for the signed-in client only (token is bound to the client id and expires after 30 minutes).
import type { NextRequest } from 'next/server';
import { assistAuth } from '@/lib/ai/assist-auth';
import { verifyTicket } from '@/lib/ai/tools/customer';
import { openTicket } from '@/lib/portal/api';
import { cors } from '@/lib/hosting/context';
import { burst } from '@/lib/ai/server';
import { db, schema } from '@/lib/db';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: NextRequest) { return new Response(null, { status: 204, headers: cors(req) }); }

export async function POST(req: NextRequest) {
  { const blocked = await guard(req, 'ai'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const a = await assistAuth(req);
  if (!a.ok) return a.res;
  const H = a.who.headers;
  let b: any;
  try { b = JSON.parse((await req.text()).slice(0, 20_000)); } catch { return Response.json({ error: 'bad_request' }, { status: 400, headers: H }); }
  const t = verifyTicket(b?.token);
  if (!t || t.cid !== a.who.cid) return Response.json({ error: 'invalid', message: 'This request expired. Ask the assistant again.' }, { status: 400, headers: H });
  if (burst(`assist-ticket:${a.who.cid}`, 3, 3600_000)) return Response.json({ error: 'rate_limited', message: 'Several tickets were opened just now; please wait a little.' }, { status: 429, headers: H });
  try {
    const r = await openTicket(a.who.cid, { deptid: t.deptid, subject: t.subject, message: t.message, priority: 'Medium' });
    await db.insert(schema.auditLogs).values({ userEmail: `client#${a.who.cid}`, action: 'ai_ticket_open', entity: 'ticket', entityId: String(r.tid || r.id), detail: { via: a.who.via } as any }).catch(() => {});
    return Response.json({ ok: true, message: `Ticket #${r.tid || r.id} opened. We will reply by email.`, ticket: r.tid || String(r.id), url: `/account/support/${r.id}` }, { headers: H });
  } catch {
    return Response.json({ error: 'failed', message: 'The ticket could not be opened right now. Please try again or email support.' }, { status: 502, headers: H });
  }
}
