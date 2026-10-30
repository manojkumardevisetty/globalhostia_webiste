import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, verifySession, can, type Session } from './auth';
import { db, schema } from './db';

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
