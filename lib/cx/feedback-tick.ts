// Client-experience jobs on the shared schedulers: the WHMCS cron tick (/api/reminders/webhook, every ~5 minutes) and
// the daily Vercel cron (/api/cron/feedback). Ratings poll closed tickets at most every 10 minutes; the monthly site report
// only works during its window (the first days of the month) and keeps its own lock, queue and send log.
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { runRatings } from './ratings-engine';
import { runReports } from './report-engine';

const KEY = 'cx_tick', EVERY_MS = 10 * 60_000;

/** One claim per 10 minutes across all instances (conditional upsert on the settings row). */
async function claimTick(): Promise<boolean> {
  const r = await db.execute(sql`insert into settings (key, value) values (${KEY}, ${JSON.stringify({ at: new Date().toISOString() })}::jsonb)
    on conflict (key) do update set value = excluded.value
    where coalesce((settings.value->>'at')::timestamptz, 'epoch'::timestamptz) < now() - (${EVERY_MS / 1000} || ' seconds')::interval returning key`).catch(() => [] as any);
  return (r as any).length > 0;
}

export async function tickCx(reason = 'whmcs-cron') {
  if (!(await claimTick())) return { skipped: 'recent' };
  const ratings = await runRatings(reason, { deadlineMs: 25_000 }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
  const reports = await runReports(reason, { deadlineMs: 30_000 }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
  return { ratings, reports };
}

/** Daily cron: a longer run of both, regardless of the tick spacing. */
export async function cronCx() {
  const ratings = await runRatings('cron', { deadlineMs: 60_000 }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
  const reports = await runReports('cron', { deadlineMs: 200_000 }).catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
  return { ratings, reports };
}
