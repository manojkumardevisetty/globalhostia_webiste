import Link from 'next/link';
import { desc, sql, gte } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Stat, Card, Badge, statusTone, fmtDate } from '@/components/ui';
import { getStats, whmcsConfigured } from '@/lib/whmcs';
import { getSession } from '@/lib/session';
import { can } from '@/lib/auth';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const s = await getSession();
  const since = new Date(Date.now() - 24 * 3600e3);
  const [[pc], [cc], [pg], [tl], runs, [api], audit] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int`, pub: sql<number>`count(*) filter (where status='PUBLISHED')::int`, draft: sql<number>`count(*) filter (where status='DRAFT')::int`, linked: sql<number>`count(*) filter (where whmcs_pid is not null)::int`, noprice: sql<number>`count(*) filter (where not exists (select 1 from product_prices pp where pp.product_id = products.id))::int` }).from(schema.products),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.categories),
    db.select({ n: sql<number>`count(*)::int`, pub: sql<number>`count(*) filter (where status='PUBLISHED')::int` }).from(schema.pages),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.tlds),
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.startedAt)).limit(5),
    db.select({ n: sql<number>`count(*)::int`, fail: sql<number>`count(*) filter (where not ok)::int`, ms: sql<number>`coalesce(avg(ms),0)::int` }).from(schema.apiLogs).where(gte(schema.apiLogs.createdAt, since)),
    db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(8),
  ]);
  let stats: Record<string, any> | null = null, statsErr = '';
  if (whmcsConfigured() && can(s, 'commerce')) {
    try { stats = await getStats(); } catch (e: any) { statsErr = e.message; }
  }
  const health = !whmcsConfigured() ? ['red', 'Not configured'] : api.n === 0 ? ['gray', 'No calls in 24h'] : api.fail / api.n > 0.2 ? ['red', `${api.fail}/${api.n} calls failed`] : api.fail ? ['yellow', `${api.fail}/${api.n} calls failed`] : ['green', `Healthy · ${api.ms}ms avg`];

  return (
    <>
      <PageHeader title="Dashboard" desc="Your hosting business at a glance." />
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Income this month" value={stats.income_thismonth ?? '—'} sub={`Today: ${stats.income_today ?? '—'}`} />
          <Stat label="Pending orders" value={stats.orders_pending ?? '—'} sub={`Today: ${stats.orders_today_total ?? '—'} orders`} href="/admin/orders?status=Pending" />
          <Stat label="Active services" value={stats.services_active ?? stats.activeservices ?? '—'} />
          <Stat label="Open tickets" value={(stats.tickets_open ?? stats.tickets_allactive) ?? '—'} sub={`Awaiting reply: ${stats.tickets_awaitingreply ?? '—'}`} />
        </div>
      )}
      {statsErr && <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">WHMCS stats unavailable: {statsErr}</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Products" value={pc.total} sub={`${pc.pub} published · ${pc.draft} draft · ${pc.linked} WHMCS-linked`} href="/admin/products" />
        <Stat label="Categories" value={cc.n} href="/admin/categories" />
        <Stat label="Pages" value={pg.n} sub={`${pg.pub} published`} href="/admin/pages" />
        <Stat label="TLDs" value={tl.n} href="/admin/domains" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="WHMCS integration" actions={<Link href="/admin/whmcs" className="text-sm text-brand-600">Open →</Link>}>
          <div className="mb-3 flex items-center gap-2 text-sm">API health: <Badge tone={health[0]}>{health[1]}</Badge></div>
          {pc.noprice > 0 && <p className="mb-3 text-sm text-amber-700">{pc.noprice} product(s) have no price and won&apos;t show a price on the site.</p>}
          {runs.length ? (
            <table className="table"><thead><tr><th>Sync</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{runs.map((r) => <tr key={r.id}><td>{r.kind} <span className="text-xs text-slate-400">({r.trigger})</span></td><td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td><td className="text-xs">{fmtDate(r.startedAt)}</td></tr>)}</tbody></table>
          ) : <p className="text-sm text-slate-500">No sync has run yet. <Link href="/admin/whmcs" className="text-brand-600 underline">Run the first sync</Link> to import products and domain prices.</p>}
        </Card>
        <Card title="Recent activity" actions={<Link href="/admin/audit" className="text-sm text-brand-600">All →</Link>}>
          <ul className="space-y-2 text-sm">{audit.map((a) => <li key={a.id} className="flex justify-between gap-3"><span><b>{a.userEmail}</b> {a.action} {a.entity}</span><span className="shrink-0 text-xs text-slate-400">{fmtDate(a.createdAt)}</span></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
