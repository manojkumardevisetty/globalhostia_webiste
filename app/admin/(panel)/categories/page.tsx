import Link from 'next/link';
import { asc, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, LinkBtn, Badge } from '@/components/ui';
import { chooseLayout } from '@/lib/render/layout';
import { reorderCategories } from './actions';

export const metadata = { title: 'Categories' };

export default async function Categories({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const rows = await db.select({ c: schema.categories, n: sql<number>`(select count(*) from products p where p.category_id = categories.id and p.status = 'PUBLISHED')::int` })
    .from(schema.categories).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  const byParent = new Map<string | null, typeof rows>();
  rows.forEach((r) => { const k = r.c.parentId; byParent.set(k, [...(byParent.get(k) || []), r]); });
  const ordered: { r: (typeof rows)[0]; depth: number }[] = [];
  const walk = (pid: string | null, d: number) => (byParent.get(pid) || []).forEach((r) => { ordered.push({ r, depth: d }); walk(r.c.id, d + 1); });
  walk(null, 0);
  rows.filter((r) => r.c.parentId && !rows.some((x) => x.c.id === r.c.parentId)).forEach((r) => ordered.push({ r, depth: 0 }));

  return (
    <>
      <PageHeader title="Categories" desc="Unlimited nested categories. Each controls how its products are laid out on the website." actions={<LinkBtn href="/admin/categories/new" variant="primary">+ New category</LinkBtn>} />
      <Flash sp={sp} />
      <form action={reorderCategories} className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Category</th><th>Slug</th><th>Live products</th><th>Layout</th><th>WHMCS group</th><th>Visible</th><th className="w-24">Order</th></tr></thead>
          <tbody>
            {ordered.map(({ r: { c, n }, depth }) => {
              const L = chooseLayout({ count: n, override: c.layout, template: c.cardTemplate });
              return (
                <tr key={c.id}>
                  <td style={{ paddingLeft: 12 + depth * 22 }}>{depth > 0 && <span className="text-slate-300">└ </span>}<Link href={`/admin/categories/${c.id}`} className="font-medium hover:text-brand-600">{c.name}</Link></td>
                  <td className="font-mono text-xs text-slate-500">{c.slug}</td>
                  <td><Link className="text-brand-600" href={`/admin/products?cat=${c.id}`}>{n}</Link></td>
                  <td className="text-xs">{c.layout === 'auto' ? <>auto → <b>{L.mode}</b></> : <Badge tone="blue">{c.layout}</Badge>}<span className="text-slate-400"> · {c.cardTemplate}</span></td>
                  <td>{c.whmcsGroupId ?? <span className="text-xs text-amber-600">—</span>}</td>
                  <td>{c.visible ? <Badge tone="green">yes</Badge> : <Badge>hidden</Badge>}</td>
                  <td><input name={`order_${c.id}`} defaultValue={c.sortOrder} type="number" className="input w-20" aria-label="Sort order" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-end border-t p-3"><button className="btn btn-secondary">Save order</button></div>
      </form>
    </>
  );
}
