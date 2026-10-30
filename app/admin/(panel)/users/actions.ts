'use server';
import { eq, and, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';

const ROLES = ['OWNER', 'ADMIN', 'EDITOR'] as const;
type R = (typeof ROLES)[number];

export async function createUser(fd: FormData) {
  const s = await requireSession('users');
  const email = str(fd, 'email').toLowerCase(), pw = str(fd, 'password');
  const role = (ROLES.includes(str(fd, 'role') as R) ? str(fd, 'role') : 'EDITOR') as R;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('/admin/users', 'Invalid email');
  if (pw.length < 10) fail('/admin/users', 'Password must be at least 10 characters');
  if ((await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, email))).length) fail('/admin/users', 'User already exists');
  await db.insert(schema.adminUsers).values({ email, name: str(fd, 'name'), role, passwordHash: await bcrypt.hash(pw, 12) });
  await audit(s, 'create', 'user', email, { role });
  done('/admin/users', `${email} created`);
}

export async function updateUser(fd: FormData) {
  const s = await requireSession('users');
  const id = str(fd, 'id'), op = str(fd, 'op'), pw = str(fd, 'password');
  const set: Partial<typeof schema.adminUsers.$inferInsert> = {};
  if (op === 'disable' || op === 'enable') {
    if (id === s.uid) fail('/admin/users', 'You cannot disable yourself');
    set.active = op === 'enable';
  } else {
    const role = str(fd, 'role') as R;
    if (role && ROLES.includes(role) && id !== s.uid) set.role = role;
    if (pw) { if (pw.length < 10) fail('/admin/users', 'Password must be at least 10 characters'); set.passwordHash = await bcrypt.hash(pw, 12); }
  }
  if (set.role && set.role !== 'OWNER' || set.active === false) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.adminUsers).where(and(eq(schema.adminUsers.role, 'OWNER'), eq(schema.adminUsers.active, true), sql`${schema.adminUsers.id} <> ${id}`));
    if (n === 0) fail('/admin/users', 'At least one active OWNER is required');
  }
  if (Object.keys(set).length) await db.update(schema.adminUsers).set(set).where(eq(schema.adminUsers.id, id));
  await audit(s, `user_${op}`, 'user', id, { role: set.role, passwordChanged: !!set.passwordHash });
  done('/admin/users', 'User updated');
}

export async function changeOwnPassword(fd: FormData) {
  const s = await requireSession('content');
  const cur = str(fd, 'current'), pw = str(fd, 'password');
  const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, s.uid));
  if (!u || !(await bcrypt.compare(cur, u.passwordHash))) fail('/admin/account', 'Current password is wrong');
  if (pw.length < 10) fail('/admin/account', 'New password must be at least 10 characters');
  if (pw !== str(fd, 'confirm')) fail('/admin/account', 'Passwords do not match');
  await db.update(schema.adminUsers).set({ passwordHash: await bcrypt.hash(pw, 12), name: str(fd, 'name') || u.name }).where(eq(schema.adminUsers.id, s.uid));
  await audit(s, 'change_password', 'user', s.uid);
  done('/admin/account', 'Password changed');
}
