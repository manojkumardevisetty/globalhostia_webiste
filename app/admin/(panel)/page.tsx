import Link from 'next/link';
import { desc, sql, gte } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Stat, Card, Badge, statusTone, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
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
  const todo = await db.select({ id: schema.sections.id, pageId: schema.sections.pageId, name: schema.sections.name, slug: schema.pages.slug })
    .from(schema.sections).innerJoin(schema.pages, sql`${schema.pages.id} = ${schema.sections.pageId}`)
    .where(sql`${schema.sections.visible} and ${schema.sections.html} ~* '(dummy text|lorem ipsum)'`).orderBy(schema.pages.slug);
  let stats: Record<string, any> | null = null, statsErr = '';
  if (whmcsConfigured() && can(s, 'commerce')) {
    try { stats = await getStats(); } catch (e: any) { statsErr = e.message; }
  }
  const health = !whmcsConfigured() ? ['red', 'Not configured'] : api.n === 0 ? ['gray', 'No calls in 24h'] : api.fail / api.n > 0.2 ? ['red', `${api.fail}/${api.n} calls failed`] : api.fail ? ['yellow', `${api.fail}/${api.n} calls failed`] : ['green', `Healthy · ${api.ms}ms avg`];

  return (
    <>
      <div className="mb-7 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1450] via-[#2b22a8] to-[#473bf0] p-6 text-white shadow-[0_20px_50px_-20px_rgba(71,59,240,0.6)] sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-indigo-200">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dubai' })}</p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight">Welcome back{s?.name ? `, ${s.name.split(' ')[0]}` : ''}</h1>
            <p className="mt-1 text-sm text-indigo-100/90">Here&apos;s how GlobalHostia is doing today.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[['/admin/products/new', 'New product', 'plus'], ['/admin/pages', 'Edit pages', 'file'], ['/admin/whmcs', 'Sync WHMCS', 'refresh'], ['/', 'View site', 'external']].map(([h, l, i]) => (
              <Link key={h} href={h} target={h === '/' ? '_blank' : undefined} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-medium text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20"><Icon name={i} /> {l}</Link>
            ))}
          </div>
        </div>
      </div>
      {stats && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon="dollar" tone="green" label="Income this month" value={stats.income_thismonth ?? '—'} sub={`Today: ${stats.income_today ?? '—'}`} />
          <Stat icon="cart" tone="amber" label="Pending orders" value={stats.orders_pending ?? '—'} sub={`Today: ${stats.orders_today_total ?? '—'} orders`} href="/admin/orders?status=Pending" />
          <Stat icon="server" tone="sky" label="Active services" value={stats.services_active ?? stats.activeservices ?? '—'} />
          <Stat icon="ticket" tone="rose" label="Open tickets" value={(stats.tickets_open ?? stats.tickets_allactive) ?? '—'} sub={`Awaiting reply: ${stats.tickets_awaitingreply ?? '—'}`} />
        </div>
      )}
      {statsErr && <p className="mb-6 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200"><Icon name="alert" />WHMCS stats unavailable: {statsErr}</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="box" label="Products" value={pc.total} sub={`${pc.pub} published · ${pc.draft} draft · ${pc.linked} WHMCS-linked`} href="/admin/products" />
        <Stat icon="folder" tone="sky" label="Categories" value={cc.n} href="/admin/categories" />
        <Stat icon="file" tone="green" label="Pages" value={pg.n} sub={`${pg.pub} published`} href="/admin/pages" />
        <Stat icon="globe" tone="amber" label="Domain extensions" value={tl.n} href="/admin/domains" />
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
        {todo.length > 0 && (
          <Card title={<span className="flex items-center gap-2"><Icon name="alert" className="h-4 w-4 text-amber-500" /> Content to fix ({todo.length})</span>} className="lg:col-span-2">
            <p className="mb-3 text-sm text-slate-500">These sections still contain template placeholder text (“lorem ipsum” / “dummy text”) from the original theme. Rewrite or hide them so visitors only see real content.</p>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{todo.map((t) => (
              <Link key={t.id} href={`/admin/pages/${t.pageId}/sections/${t.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <span className="truncate"><span className="font-mono text-xs text-slate-400">/{t.slug === 'index' ? '' : t.slug}</span> {t.name}</span><Icon name="chevron" className="h-4 w-4 shrink-0 text-slate-300" /></Link>))}</div>
          </Card>
        )}
        <Card title="Recent activity" actions={<Link href="/admin/audit" className="text-sm text-brand-600">All →</Link>}>
          <ul className="space-y-2 text-sm">{audit.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0"><span className="min-w-0 truncate"><span className="font-medium text-slate-900">{a.userEmail.split('@')[0]}</span> <span className="text-slate-500">{a.action.replace(/_/g, ' ')} · {a.entity}</span></span><span className="shrink-0 text-xs text-slate-400">{fmtDate(a.createdAt)}</span></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
