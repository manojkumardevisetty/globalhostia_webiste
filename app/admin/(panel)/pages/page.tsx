import Link from 'next/link';
import { asc, sql, ilike, or, and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Badge, statusTone, fmtDate, Card, Field } from '@/components/ui';
import { createPage } from './actions';

export const metadata = { title: 'Pages' };

export default async function Pages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  let usesSlug: string | undefined;
  if (sp.usesCategory) usesSlug = (await db.select({ slug: schema.categories.slug }).from(schema.categories).where(eq(schema.categories.id, sp.usesCategory)))[0]?.slug;
  const rows = await db.select({ p: schema.pages, n: sql<number>`(select count(*) from sections s where s.page_id = pages.id)::int`, dyn: sql<number>`(select count(*) from sections s where s.page_id = pages.id and s.type <> 'html')::int` })
    .from(schema.pages)
    .where(and(
      sp.q ? or(ilike(schema.pages.title, `%${sp.q}%`), ilike(schema.pages.slug, `%${sp.q}%`)) : undefined,
      usesSlug ? sql`exists (select 1 from sections s where s.page_id = pages.id and s.type = 'products' and (s.data->'categories' ? ${usesSlug} or s.data->>'category' = ${usesSlug}))` : undefined,
    ))
    .orderBy(sql`case when ${schema.pages.slug} = 'index' then 0 else 1 end`, asc(schema.pages.slug));
  const all = await db.select({ id: schema.pages.id, title: schema.pages.title, slug: schema.pages.slug }).from(schema.pages).orderBy(asc(schema.pages.slug));

  return (
    <>
      <PageHeader title="Pages & Sections" desc="Every page of the website. Open one to reorder, edit, hide or add sections — with live preview." />
      <Flash sp={sp} />
      {usesSlug && <p className="mb-4 text-sm text-slate-500">Pages showing category <b>{usesSlug}</b> · <Link href="/admin/pages" className="text-brand-600">clear</Link></p>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form className="mb-3"><input name="q" defaultValue={sp.q} placeholder="Search pages…" className="input max-w-xs" /></form>
          <div className="card overflow-x-auto">
            <table className="table"><thead><tr><th>Page</th><th>URL</th><th>Sections</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>{rows.map(({ p, n, dyn }) => (
                <tr key={p.id}>
                  <td><Link href={`/admin/pages/${p.id}`} className="font-medium hover:text-brand-600">{p.title.slice(0, 70)}</Link></td>
                  <td><a href={p.slug === 'index' ? '/' : `/${p.slug}`} target="_blank" className="font-mono text-xs text-slate-500 hover:text-brand-600">/{p.slug === 'index' ? '' : p.slug}</a></td>
                  <td className="text-xs">{n}{dyn > 0 && <span className="ml-1 text-emerald-600">({dyn} dynamic)</span>}</td>
                  <td><Badge tone={statusTone(p.status)}>{p.status}</Badge>{p.publishAt && new Date(p.publishAt) > new Date() && <span className="ml-1 text-xs text-amber-600">scheduled</span>}</td>
                  <td className="text-xs text-slate-500">{fmtDate(p.updatedAt)}</td>
                </tr>))}</tbody></table>
          </div>
        </div>
        <Card title="Create a page">
          <form action={createPage} className="space-y-3">
            <Field label="Title"><input name="title" required className="input" placeholder="e.g. Black Friday Deals" /></Field>
            <Field label="URL" hint="e.g. black-friday → globalhostia.com/black-friday"><input name="slug" className="input" /></Field>
            <Field label="Start from"><select name="copyFrom" className="input"><option value="">Blank page (site header & footer)</option>{all.map((p) => <option key={p.id} value={p.id}>Copy of /{p.slug === 'index' ? '' : p.slug}</option>)}</select></Field>
            <button className="btn btn-primary w-full">Create draft page</button>
          </form>
        </Card>
      </div>
    </>
  );
}
