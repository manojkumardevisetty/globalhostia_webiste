import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHeader, Badge, Empty } from '@/components/ui';
import { getOrders, whmcsBase, whmcsConfigured } from '@/lib/whmcs';

export const metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const tone = (s: string) => (/active|paid|complete/i.test(s) ? 'green' : /pending|unpaid/i.test(s) ? 'yellow' : /fraud|cancel|refund/i.test(s) ? 'red' : 'gray');

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('commerce');
  const sp = await searchParams;
  const page = Math.max(0, parseInt(sp.p || '0', 10) || 0);
  if (!whmcsConfigured()) return <><PageHeader title="Orders" /><Empty>WHMCS is not configured.</Empty></>;
  let data: Awaited<ReturnType<typeof getOrders>> | null = null, err = '';
  try { data = await getOrders({ limitstart: page * 25, limitnum: 25, status: sp.status || undefined }); } catch (e: any) { err = e.message; }
  const orders = data?.orders?.order ?? [];
  const total = Number(data?.totalresults ?? 0);
  return (
    <>
      <PageHeader title="Orders" desc="Live from WHMCS. Accept, provision and refund in WHMCS admin." actions={<a className="btn btn-secondary" href={`${whmcsBase()}/admin/orders.php`} target="_blank">Open in WHMCS ↗</a>} />
      <form className="mb-3 flex gap-2"><select name="status" defaultValue={sp.status} className="input max-w-[200px]"><option value="">All statuses</option>{['Pending', 'Active', 'Fraud', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select><button className="btn btn-secondary">Filter</button></form>
      {err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">WHMCS error: {err}</p>}
      {!err && !orders.length ? <Empty>No orders.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table"><thead><tr><th>#</th><th>Date</th><th>Client</th><th>Amount</th><th>Payment</th><th>Status</th><th></th></tr></thead>
            <tbody>{orders.map((o: any) => (
              <tr key={o.id}><td className="font-mono text-xs">{o.ordernum || o.id}</td><td className="text-xs">{o.date}</td>
                <td><Link className="text-brand-600" href={`/admin/customers/${o.userid}`}>{o.name}</Link></td><td>{o.amount} <span className="text-xs text-slate-400">{o.paymentmethod}</span></td>
                <td><Badge tone={tone(o.paymentstatus || '')}>{o.paymentstatus}</Badge></td><td><Badge tone={tone(o.status)}>{o.status}</Badge></td>
                <td><a className="text-xs text-brand-600" target="_blank" href={`${whmcsBase()}/admin/orders.php?action=view&id=${o.id}`}>manage ↗</a></td></tr>))}</tbody></table>
          <div className="flex items-center justify-between border-t p-3 text-sm text-slate-500">
            <span>{total} orders</span>
            <span className="flex gap-2">{page > 0 && <Link className="btn btn-secondary" href={`?p=${page - 1}&status=${sp.status || ''}`}>← Prev</Link>}{(page + 1) * 25 < total && <Link className="btn btn-secondary" href={`?p=${page + 1}&status=${sp.status || ''}`}>Next →</Link>}</span>
          </div>
        </div>
      )}
    </>
  );
}
