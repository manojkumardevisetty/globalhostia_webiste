import { asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Field, Flash, Badge, fmtDate } from '@/components/ui';
import { createUser, updateUser } from './actions';

export const metadata = { title: 'Users & Roles' };

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireSession('users');
  const sp = await searchParams;
  const users = await db.select().from(schema.adminUsers).orderBy(asc(schema.adminUsers.createdAt));
  return (
    <>
      <PageHeader title="Users & Roles" desc="OWNER: everything · ADMIN: everything except users · EDITOR: website content & catalogue only." />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          <table className="table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}><td><b>{u.name || '—'}</b><div className="text-xs text-slate-500">{u.email}</div></td>
                <td colSpan={4}>
                  <form action={updateUser} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={u.id} />
                    <select name="role" defaultValue={u.role} className="input w-28" disabled={u.id === me.uid}><option>OWNER</option><option>ADMIN</option><option>EDITOR</option></select>
                    {u.active ? <Badge tone="green">active</Badge> : <Badge tone="red">disabled</Badge>}
                    <span className="text-xs text-slate-400">{fmtDate(u.lastLoginAt)}</span>
                    <input name="password" type="password" placeholder="new password" className="input w-36" autoComplete="new-password" />
                    <button name="op" value="save" className="btn btn-secondary text-xs">Save</button>
                    {u.id !== me.uid && <button name="op" value={u.active ? 'disable' : 'enable'} className="btn btn-ghost text-xs">{u.active ? 'Disable' : 'Enable'}</button>}
                  </form>
                </td></tr>))}</tbody></table>
        </div>
        <Card title="Invite a team member">
          <form action={createUser} className="space-y-3">
            <Field label="Name"><input name="name" className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Role"><select name="role" className="input"><option>EDITOR</option><option>ADMIN</option><option>OWNER</option></select></Field>
            <Field label="Temporary password" hint="Min 10 characters — share it securely"><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
            <button className="btn btn-primary w-full">Create user</button>
          </form>
        </Card>
      </div>
    </>
  );
}
