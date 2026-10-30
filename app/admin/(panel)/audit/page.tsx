import { desc, ilike, or, and } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader, fmtDate } from '@/components/ui';

export const metadata = { title: 'Activity Log' };

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('settings');
  const sp = await searchParams;
  const rows = await db.select().from(schema.auditLogs)
    .where(sp.q ? or(ilike(schema.auditLogs.userEmail, `%${sp.q}%`), ilike(schema.auditLogs.action, `%${sp.q}%`), ilike(schema.auditLogs.entity, `%${sp.q}%`)) : undefined)
    .orderBy(desc(schema.auditLogs.createdAt)).limit(300);
  return (
    <>
      <PageHeader title="Activity Log" desc="Every admin change, login and sync is recorded." />
      <form className="mb-3"><input name="q" defaultValue={sp.q} placeholder="Filter by user, action, entity…" className="input max-w-sm" /></form>
      <div className="card overflow-x-auto">
        <table className="table"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</td><td className="text-xs">{r.userEmail}</td><td><code className="text-xs">{r.action}</code></td><td className="text-xs">{r.entity}{r.entityId ? <span className="text-slate-400"> · {r.entityId.slice(0, 14)}</span> : ''}</td>
            <td className="max-w-md truncate text-xs text-slate-500">{r.detail ? JSON.stringify(r.detail).slice(0, 200) : ''}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
