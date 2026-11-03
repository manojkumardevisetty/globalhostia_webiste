// GET /api/lkg — this deployment's last-known-good snapshot (lib/lkg.ts), for the next build when it cannot reach the
// database (scripts/snapshot.mjs). Private: Authorization: Bearer CRON_SECRET. Never touches the database.
import { snapshotDump } from '@/lib/lkg';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  return new Response(JSON.stringify(snapshotDump()), { headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });
}
