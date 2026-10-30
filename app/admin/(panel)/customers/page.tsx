import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHeader, Badge, Empty } from '@/components/ui';
import { getClients, whmcsConfigured } from '@/lib/whmcs';

export const metadata = { title: 'Customers' };
export const dynamic = 'force-dynamic';

export default async function Customers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('commerce');
  const sp = await searchParams;
  const page = Math.max(0, parseInt(sp.p || '0', 10) || 0);
  if (!whmcsConfigured()) return <><PageHeader title="Customers" /><Empty>WHMCS is not configured.</Empty></>;
  let data: any = null, err = '';
  try { data = await getClients({ limitstart: page * 25, limitnum: 25, search: sp.q || undefined }); } catch (e: any) { err = e.message; }
  const rows = data?.clients?.client ?? [];
  const total = Number(data?.totalresults ?? 0);
  return (
    <>
      <PageHeader title="Customers" desc="Live from WHMCS — profiles, services, invoices and tickets stay in WHMCS." />
      <form className="mb-3 flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Search name, email, company" className="input max-w-sm" /><button className="btn btn-secondary">Search</button></form>
      {err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">WHMCS error: {err}</p>}
      {!err && !rows.length ? <Empty>No customers found.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table"><thead><tr><th>Customer</th><th>Company</th><th>Email</th><th>Since</th><th>Status</th></tr></thead>
            <tbody>{rows.map((c: any) => <tr key={c.id}><td><Link className="font-medium text-brand-600" href={`/admin/customers/${c.id}`}>{c.firstname} {c.lastname}</Link></td><td>{c.companyname}</td><td className="text-xs">{c.email}</td><td className="text-xs">{c.datecreated}</td><td><Badge tone={c.status === 'Active' ? 'green' : 'gray'}>{c.status}</Badge></td></tr>)}</tbody></table>
          <div className="flex items-center justify-between border-t p-3 text-sm text-slate-500"><span>{total} customers</span>
            <span className="flex gap-2">{page > 0 && <Link className="btn btn-secondary" href={`?p=${page - 1}&q=${sp.q || ''}`}>← Prev</Link>}{(page + 1) * 25 < total && <Link className="btn btn-secondary" href={`?p=${page + 1}&q=${sp.q || ''}`}>Next →</Link>}</span></div>
        </div>
      )}
    </>
  );
}
