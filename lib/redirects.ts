// Admin-managed redirects (Admin → SEO): one cached map, snapshot-backed when the database is unavailable (lib/lkg.ts).
import 'server-only';
import { db, schema } from './db';
import { cachedRead } from './lkg';

type RedirectMap = Record<string, readonly [string, number]>;
export const redirectMap = cachedRead('redirects', async (): Promise<RedirectMap> => {
  const rows = await db.select().from(schema.redirects);
  return Object.fromEntries(rows.map((r) => [r.from.toLowerCase(), [r.to, r.code] as const]));
}, { fallback: (): RedirectMap => ({}) });
