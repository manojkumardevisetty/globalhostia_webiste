// CSP violation reports (report-uri and report-to). Aggregated: one csp_reports row per directive + blocked origin + page +
// disposition with a counter, so a noisy page cannot fill the database. Per-IP limit, 64 KB body cap, at most 2000 rows
// (new kinds are dropped beyond that; counters still rise). Viewed and cleared in Admin > Security.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { parseCspReports } from '@/lib/security/csp-report';
import { limit, ipOf } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
const MAX_ROWS = 2000;
const ok = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export async function POST(req: Request) {
  const rl = await limit('csp-report', ipOf(req));
  if (!rl.ok) return new Response(null, { status: 429, headers: { 'retry-after': String(rl.retryAfter) } });
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 64_000) return new Response(null, { status: 413 });
  const body = await req.text().catch(() => '');
  const list = parseCspReports(body, req.headers.get('content-type') || '');
  if (!list.length) return ok();
  try {
    const [{ n }] = await db.execute(sql`select count(*)::int n from csp_reports`) as unknown as { n: number }[];
    for (const v of list) {
      if (n >= MAX_ROWS) await db.execute(sql`update csp_reports set count = count + 1, last_seen = now() where key = ${v.key}`);
      else await db.execute(sql`insert into csp_reports (key, directive, blocked, page, source, disposition, sample) values (${v.key}, ${v.directive}, ${v.blocked}, ${v.page}, ${v.source}, ${v.disposition}, ${v.sample})
        on conflict (key) do update set count = csp_reports.count + 1, last_seen = now(), source = case when csp_reports.source = '' then excluded.source else csp_reports.source end`);
    }
  } catch { /* table not there yet: drop */ }
  return ok();
}

export function OPTIONS() { return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } }); }
