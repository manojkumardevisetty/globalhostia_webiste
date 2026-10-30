import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge, LinkBtn } from '@/components/ui';
import { whmcs, getClientProducts, getTickets, whmcsBase } from '@/lib/whmcs';

export const dynamic = 'force-dynamic';

export default async function Customer({ params }: { params: Promise<{ id: string }> }) {
  await requireSession('commerce');
  const id = parseInt((await params).id, 10);
  const [c, prods, tickets, invoices, domains] = await Promise.allSettled([
    whmcs('GetClientsDetails', { clientid: id, stats: true }), getClientProducts(id), getTickets({ clientid: id, limitnum: 10 }),
    whmcs('GetInvoices', { userid: id, limitnum: 10 }), whmcs('GetClientsDomains', { clientid: id, limitnum: 25 }),
  ]);
  const v = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
  const client: any = v(c)?.client || v(c) || {};
  const err = c.status === 'rejected' ? String(c.reason?.message) : '';
  const svc = (v(prods) as any)?.products?.product ?? [];
  const tk = (v(tickets) as any)?.tickets?.ticket ?? [];
  const inv = (v(invoices) as any)?.invoices?.invoice ?? [];
  const dom = (v(domains) as any)?.domains?.domain ?? [];
  return (
    <>
      <PageHeader title={err ? `Customer #${id}` : `${client.firstname ?? ''} ${client.lastname ?? ''}`} desc={client.email}
        actions={<><a className="btn btn-secondary" target="_blank" href={`${whmcsBase()}/admin/clientssummary.php?userid=${id}`}>Open in WHMCS ↗</a><LinkBtn href="/admin/customers">← Customers</LinkBtn></>} />
      {err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile"><dl className="grid grid-cols-2 gap-2 text-sm">{['companyname', 'phonenumber', 'country', 'city', 'status', 'currency_code'].map((k) => <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd>{String(client[k] ?? '—')}</dd></div>)}</dl></Card>
        <Card title={`Services (${svc.length})`}><table className="table"><tbody>{svc.map((p: any) => <tr key={p.id}><td>{p.name}<div className="text-xs text-slate-400">{p.domain}</div></td><td className="text-xs">{p.recurringamount} {p.billingcycle}</td><td className="text-xs">due {p.nextduedate}</td><td><Badge tone={p.status === 'Active' ? 'green' : 'gray'}>{p.status}</Badge></td></tr>)}</tbody></table></Card>
        <Card title={`Domains (${dom.length})`}><table className="table"><tbody>{dom.map((d: any) => <tr key={d.id}><td>{d.domainname}</td><td className="text-xs">expires {d.expirydate}</td><td><Badge tone={d.status === 'Active' ? 'green' : 'gray'}>{d.status}</Badge></td></tr>)}</tbody></table></Card>
        <Card title="Recent invoices"><table className="table"><tbody>{inv.map((i: any) => <tr key={i.id}><td>#{i.invoicenum || i.id}</td><td className="text-xs">{i.date}</td><td>{i.total}</td><td><Badge tone={i.status === 'Paid' ? 'green' : i.status === 'Unpaid' ? 'yellow' : 'gray'}>{i.status}</Badge></td></tr>)}</tbody></table></Card>
        <Card title="Support tickets" className="lg:col-span-2"><table className="table"><tbody>{tk.map((t: any) => <tr key={t.id}><td>#{t.tid} {t.subject}</td><td className="text-xs">{t.lastreply}</td><td><Badge>{t.status}</Badge></td></tr>)}{!tk.length && <tr><td className="text-sm text-slate-400">No tickets</td></tr>}</tbody></table></Card>
      </div>
    </>
  );
}
