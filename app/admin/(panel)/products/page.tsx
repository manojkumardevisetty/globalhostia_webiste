import Link from 'next/link';
import { and, asc, eq, ilike, or, inArray, desc, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Badge, statusTone, Flash, LinkBtn, Empty } from '@/components/ui';
import { pickPrice, money, CYCLE_SHORT } from '@/lib/pricing';
import { getSettings } from '@/lib/settings';
import { bulkProducts } from './actions';

export const metadata = { title: 'Products' };

export default async function Products({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const st = await getSettings();
  const cats = await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  const conds = [
    sp.q ? or(ilike(schema.products.name, `%${sp.q}%`), ilike(schema.products.slug, `%${sp.q}%`), sql`${schema.products.whmcsPid}::text = ${sp.q}`) : undefined,
    sp.cat ? (sp.cat === 'none' ? sql`${schema.products.categoryId} is null` : eq(schema.products.categoryId, sp.cat)) : undefined,
    sp.status ? eq(schema.products.status, sp.status as any) : undefined,
    sp.sync === 'retired' ? eq(schema.products.whmcsRetired, true) : sp.sync === 'local' ? sql`${schema.products.whmcsPid} is null` : undefined,
  ];
  const rows = await db.select().from(schema.products).where(and(...conds)).orderBy(asc(schema.products.sortOrder), asc(schema.products.name)).limit(500);
  const prices = rows.length ? await db.select().from(schema.productPrices).where(inArray(schema.productPrices.productId, rows.map((r) => r.id))) : [];
  const catName = Object.fromEntries(cats.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Products" desc="Everything shown on the website. Prices of WHMCS-linked products come from WHMCS automatically."
        actions={<><LinkBtn href="/admin/whmcs">Sync from WHMCS</LinkBtn><LinkBtn href="/admin/products/new" variant="primary">+ New product</LinkBtn></>} />
      <Flash sp={sp} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Search name, slug or WHMCS ID" className="input max-w-xs" />
        <select name="cat" defaultValue={sp.cat} className="input max-w-[220px]"><option value="">All categories</option><option value="none">— No category —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="status" defaultValue={sp.status} className="input max-w-[160px]"><option value="">Any status</option><option>PUBLISHED</option><option>DRAFT</option><option>ARCHIVED</option></select>
        <select name="sync" defaultValue={sp.sync} className="input max-w-[180px]"><option value="">Any source</option><option value="local">Not in WHMCS</option><option value="retired">Removed from WHMCS</option></select>
        <button className="btn btn-secondary">Filter</button>
      </form>
      {!rows.length ? <Empty>No products yet. Run <Link className="text-brand-600 underline" href="/admin/whmcs">a WHMCS sync</Link> to import your catalogue, or create one manually.</Empty> : (
        <form action={bulkProducts} className="card overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 text-sm">
            <span className="text-slate-500">With selected:</span>
            <select name="op" className="input max-w-[170px]"><option value="publish">Publish</option><option value="draft">Set draft</option><option value="archive">Archive</option><option value="feature">Mark featured</option><option value="unfeature">Unmark featured</option><option value="move">Move to category →</option><option value="delete">Delete (local only)</option></select>
            <select name="categoryId" className="input max-w-[200px]"><option value="">(category for move)</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button className="btn btn-secondary">Apply</button>
            <span className="ml-auto text-slate-400">{rows.length} products</span>
          </div>
          <table className="table">
            <thead><tr><th className="w-8"></th><th>Product</th><th>Category</th><th>Price</th><th>WHMCS</th><th>Status</th><th>Order</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const pr = pickPrice(prices.filter((x) => x.productId === p.id), st.currency || 'USD', p.displayCycle);
                return (
                  <tr key={p.id}>
                    <td><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.name}`} /></td>
                    <td><Link href={`/admin/products/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.name}</Link>{p.featured && <span className="ml-2">★</span>}<div className="text-xs text-slate-400">{p.slug}</div></td>
                    <td className="text-slate-600">{p.categoryId ? catName[p.categoryId] : <span className="text-amber-600">Unassigned</span>}</td>
                    <td>{pr ? <>{money(pr.price, pr.prefix || '$')}<span className="text-xs text-slate-400">{CYCLE_SHORT[pr.cycle]}</span></> : <span className="text-xs text-red-500">No price</span>}</td>
                    <td>{p.whmcsPid ? <span className="text-xs">#{p.whmcsPid} {p.whmcsRetired ? <Badge tone="red">removed</Badge> : p.whmcsHidden ? <Badge>hidden</Badge> : <Badge tone="green">linked</Badge>}</span> : <Badge tone="yellow">local</Badge>}{p.syncError && <div className="text-xs text-red-500" title={p.syncError}>sync error</div>}</td>
                    <td><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                    <td className="text-slate-400">{p.sortOrder}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </form>
      )}
    </>
  );
}
