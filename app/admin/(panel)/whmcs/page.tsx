import Link from 'next/link';
import { desc, sql, eq, isNull, and, asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge, statusTone, Flash, fmtDate } from '@/components/ui';
import { whmcsConfigured, whmcsBase } from '@/lib/whmcs';
import { testWhmcs, runSync } from './actions';

export const metadata = { title: 'WHMCS Integration' };
export const dynamic = 'force-dynamic';

const mask = (v?: string) => (v ? `${v.slice(0, 4)}••••${v.slice(-3)}` : 'not set');

export default async function Whmcs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('integration');
  const sp = await searchParams;
  const [runs, logs, [calls], unmapped, cats, [prod]] = await Promise.all([
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.startedAt)).limit(15),
    db.select().from(schema.apiLogs).orderBy(desc(schema.apiLogs.createdAt)).limit(sp.errors ? 100 : 30).then((r) => (sp.errors ? r.filter((x) => !x.ok) : r)),
    db.select({ n: sql<number>`count(*)::int`, fail: sql<number>`count(*) filter (where not ok)::int` }).from(schema.apiLogs).where(sql`created_at > now() - interval '24 hours'`),
    db.select().from(schema.products).where(isNull(schema.products.categoryId)).limit(50),
    db.select({ id: schema.categories.id, name: schema.categories.name, slug: schema.categories.slug, gid: schema.categories.whmcsGroupId, n: sql<number>`(select count(*) from products p where p.category_id = categories.id)::int` }).from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
    db.select({ linked: sql<number>`count(*) filter (where whmcs_pid is not null)::int`, local: sql<number>`count(*) filter (where whmcs_pid is null)::int`, retired: sql<number>`count(*) filter (where whmcs_retired)::int`, errors: sql<number>`count(*) filter (where sync_error <> '')::int` }).from(schema.products),
  ]);
  const ok = whmcsConfigured();
  return (
    <>
      <PageHeader title="WHMCS Integration Center" desc="WHMCS is the source of truth for prices, billing, provisioning, orders and customers. Content and design live here." actions={<Link className="btn btn-secondary" href="/admin/whmcs/vps">VPS Automation →</Link>} />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Connection" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd>{ok ? <Badge tone="green">Configured</Badge> : <Badge tone="red">Missing credentials</Badge>}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">API URL</dt><dd className="truncate text-right text-xs">{process.env.WHMCS_API_URL || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Identifier</dt><dd className="font-mono text-xs">{mask(process.env.WHMCS_API_IDENTIFIER)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Secret</dt><dd className="font-mono text-xs">{mask(process.env.WHMCS_API_SECRET)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Access key</dt><dd className="text-xs">{process.env.WHMCS_ACCESS_KEY ? 'set' : 'not set'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Client area</dt><dd className="text-xs"><a className="text-brand-600" href={whmcsBase()} target="_blank">{whmcsBase()}</a></dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">API calls (24h)</dt><dd className="text-xs">{calls.n} · <span className={calls.fail ? 'text-red-600' : ''}>{calls.fail} failed</span></dd></div>
          </dl>
          <form action={testWhmcs} className="mt-4"><button className="btn btn-secondary w-full" disabled={!ok}>Test connection</button></form>
          <p className="mt-3 text-xs text-slate-400">Credentials are stored as encrypted server environment variables on Vercel and are never sent to browsers. To rotate them, update them in Vercel → Settings → Environment Variables.</p>
        </Card>
        <Card title="Synchronisation" className="lg:col-span-2">
          <div className="mb-4 grid gap-3 sm:grid-cols-4 text-center text-sm">
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xl font-bold">{prod.linked}</div>linked products</div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xl font-bold">{prod.local}</div>local only</div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xl font-bold text-amber-600">{prod.retired}</div>removed in WHMCS</div>
            <div className="rounded-lg bg-slate-50 p-3"><div className="text-xl font-bold text-red-600">{prod.errors}</div>with errors</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={runSync}><input type="hidden" name="kind" value="products" /><button className="btn btn-primary" disabled={!ok}>Sync products & prices</button></form>
            <form action={runSync}><input type="hidden" name="kind" value="tlds" /><button className="btn btn-secondary" disabled={!ok}>Sync domain (TLD) prices</button></form>
          </div>
          <p className="mt-2 text-xs text-slate-500">Automatic sync runs daily (Vercel Cron). New WHMCS products are imported into their store group&apos;s category; existing ones get fresh prices. Products removed in WHMCS are flagged, never deleted.</p>
          <table className="table mt-4"><thead><tr><th>Run</th><th>Status</th><th>Result</th><th>Started</th></tr></thead>
            <tbody>{runs.map((r) => <tr key={r.id}><td>{r.kind} <span className="text-xs text-slate-400">{r.trigger}</span></td><td><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
              <td className="max-w-md text-xs">{r.error ? <span className="text-red-600">{r.error}</span> : <span className="text-slate-500">{JSON.stringify(r.stats).replace(/[{}"[\]]/g, '').replace(/,/g, ', ').slice(0, 300)}</span>}</td><td className="text-xs">{fmtDate(r.startedAt)}</td></tr>)}
              {!runs.length && <tr><td colSpan={4} className="text-center text-slate-400">No runs yet</td></tr>}</tbody></table>
        </Card>
        <Card title="Category ↔ WHMCS group mapping" className="lg:col-span-2" actions={<Link className="text-sm text-brand-600" href="/admin/categories">Edit categories →</Link>}>
          <table className="table"><thead><tr><th>Category</th><th>Slug (store URL group)</th><th>WHMCS gid</th><th>Products</th></tr></thead>
            <tbody>{cats.map((c) => <tr key={c.id}><td>{c.name}</td><td className="font-mono text-xs">{c.slug}</td><td>{c.gid ?? <Badge tone="yellow">unmapped</Badge>}</td><td>{c.n}</td></tr>)}</tbody></table>
          {unmapped.length > 0 && <p className="mt-3 text-sm text-amber-700">{unmapped.length} product(s) have no category: {unmapped.slice(0, 8).map((p) => <Link key={p.id} href={`/admin/products/${p.id}`} className="mr-2 underline">{p.name}</Link>)}</p>}
        </Card>
        <Card title="Setup checklist (one-time, in WHMCS)">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>WHMCS Admin → System Settings → <b>API Credentials</b>: the API role needs <i>Products, Orders, Clients, Domains, System (WhmcsDetails/GetStats), Support</i>.</li>
            <li>Vercel servers use changing IPs. In WHMCS <code>configuration.php</code> add <code className="text-xs">$api_access_key = &apos;long-random-key&apos;;</code> and put the same value in Vercel env <b>WHMCS_ACCESS_KEY</b>. (Or allow the IPs under General Settings → Security → API IP Access Restriction.)</li>
            <li>Press <b>Test connection</b>, then <b>Sync products</b>.</li>
          </ol>
        </Card>
        <Card title="API log" className="lg:col-span-3" actions={<Link className="text-sm text-brand-600" href={sp.errors ? '/admin/whmcs' : '/admin/whmcs?errors=1'}>{sp.errors ? 'Show all' : 'Errors only'}</Link>}>
          <table className="table"><thead><tr><th>Action</th><th>Result</th><th>Time</th><th>When</th></tr></thead>
            <tbody>{logs.map((l) => <tr key={l.id}><td className="font-mono text-xs">{l.action}</td><td>{l.ok ? <Badge tone="green">ok</Badge> : <span className="text-xs text-red-600">{l.error}</span>}</td><td className="text-xs">{l.ms}ms</td><td className="text-xs">{fmtDate(l.createdAt)}</td></tr>)}
              {!logs.length && <tr><td colSpan={4} className="text-center text-slate-400">No API calls logged</td></tr>}</tbody></table>
        </Card>
      </div>
    </>
  );
}
