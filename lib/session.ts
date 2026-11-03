import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, verifySession, can, type Session } from './auth';
import { sql } from 'drizzle-orm';
import { db, schema } from './db';
import { dbDown, markDbDown } from './lkg';

export async function getSession() {
  return verifySession((await cookies()).get(COOKIE)?.value);
}

/** Use in admin pages and server actions. Redirects to login / throws on missing permission. */
export async function requireSession(perm = 'content'): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/admin/login');
  if (!can(s, perm)) throw new Error(`Forbidden: your role (${s.role}) cannot access "${perm}"`);
  return s;
}

export async function audit(s: Session, action: string, entity: string, entityId?: string | null, detail?: unknown) {
  await db.insert(schema.auditLogs).values({ userEmail: s.email, action, entity, entityId: entityId ?? null, detail: (detail ?? null) as any }).catch(() => {});
}

export async function saveRevision(s: Session, entity: string, entityId: string, data: unknown) {
  await db.insert(schema.revisions).values({ entity, entityId, data: data as any, userEmail: s.email }).catch(() => {});
}

let probe = { at: 0, ok: true };
/** Admin: is Postgres reachable? (one `select 1`, remembered for 20s per instance; false while lib/lkg.ts's breaker is open) */
export async function dbReachable(): Promise<boolean> {
  if (dbDown()) return false;
  if (Date.now() - probe.at < 20_000) return probe.ok;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([db.execute(sql`select 1`), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('connect timeout')), 6000); })]);
    probe = { at: Date.now(), ok: true };
  } catch (e) {
    markDbDown(e);
    probe = { at: Date.now(), ok: false };
  } finally { clearTimeout(timer); }
  return probe.ok;
}
