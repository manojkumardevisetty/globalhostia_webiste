'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, schema } from '@/lib/db';
import { COOKIE, signSession } from '@/lib/auth';
import { rateLimited } from '@/lib/render/domains';

export async function login(fd: FormData) {
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  let next = String(fd.get('next') || '/admin');
  if (!next.startsWith('/admin') || next.startsWith('//')) next = '/admin';
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0] || 'local';
  if (rateLimited('login:' + ip, 8, 10 * 60_000)) redirect('/admin/login?err=' + encodeURIComponent('Too many attempts. Try again in 10 minutes.'));

  const u = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, email)).limit(1).then((r) => r[0] ?? null, () => undefined);
  if (u === undefined) redirect('/admin/login?err=' + encodeURIComponent('Database unavailable. The website is still online; please try signing in again later.'));
  const ok = u && u.active && (await bcrypt.compare(password, u.passwordHash));
  await db.insert(schema.auditLogs).values({ userEmail: email || '(blank)', action: ok ? 'login' : 'login_failed', entity: 'auth', detail: { ip } }).catch(() => {});
  if (!ok) redirect('/admin/login?err=' + encodeURIComponent('Invalid email or password'));

  await db.update(schema.adminUsers).set({ lastLoginAt: new Date() }).where(eq(schema.adminUsers.id, u!.id)).catch(() => {});
  const token = await signSession({ uid: u!.id, email: u!.email, name: u!.name, role: u!.role });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12 });
  redirect(next);
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect('/admin/login');
}
