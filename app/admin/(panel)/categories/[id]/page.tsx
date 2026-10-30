import { notFound } from 'next/navigation';
import { asc, eq, sql, and, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Field, Flash, LinkBtn } from '@/components/ui';
import { chooseLayout } from '@/lib/render/layout';
import { saveCategory, deleteCategory, createCategoryPage } from '../actions';

const LAYOUTS = [
  ['auto', 'Automatic (recommended)'], ['featured', 'Featured — one big highlighted plan'], ['cards', 'Pricing cards — 2–4 plans + comparison'],
  ['grid', 'Grid — sorting & filters'], ['catalog', 'Catalogue — search, filters & pagination'],
];

export default async function EditCategory({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const isNew = id === 'new';
  const [c] = isNew ? [null] : await db.select().from(schema.categories).where(eq(schema.categories.id, id));
  if (!isNew && !c) notFound();
  const parents = await db.select().from(schema.categories).where(c ? ne(schema.categories.id, c.id) : undefined).orderBy(asc(schema.categories.name));
  const [{ n }] = c ? await db.select({ n: sql<number>`count(*)::int` }).from(schema.products).where(and(eq(schema.products.categoryId, c.id), eq(schema.products.status, 'PUBLISHED'))) : [{ n: 0 }];
  const L = chooseLayout({ count: n, override: c?.layout, template: c?.cardTemplate });
  const sim = [1, 3, 8, 20, 60].map((k) => [k, chooseLayout({ count: k }).mode]);

  return (
    <>
      <PageHeader title={isNew ? 'New category' : c!.name} actions={<>{c && <LinkBtn href={`/admin/products?cat=${c.id}`}>Products ({n})</LinkBtn>}<LinkBtn href="/admin/categories">← All</LinkBtn></>} />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <form action={saveCategory} className="space-y-6 lg:col-span-2">
          <input type="hidden" name="id" value={c?.id || ''} />
          <Card title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><input name="name" defaultValue={c?.name} required className="input" /></Field>
              <Field label="Slug" hint="Should match the WHMCS store group URL (…/store/<slug>/…) for automatic mapping"><input name="slug" defaultValue={c?.slug} className="input" /></Field>
              <Field label="Parent category"><select name="parentId" defaultValue={c?.parentId || ''} className="input"><option value="">— Top level —</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="WHMCS product group ID (gid)"><input name="whmcsGroupId" defaultValue={c?.whmcsGroupId ?? ''} className="input" inputMode="numeric" /></Field>
              <Field label="Description" className="sm:col-span-2"><textarea name="description" rows={3} defaultValue={c?.description} className="input" /></Field>
              <Field label="Sort order"><input name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 0} className="input" /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="visible" defaultChecked={c?.visible ?? true} /> Visible on website</label>
            </div>
          </Card>
          <Card title="Layout">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Layout"><select name="layout" defaultValue={c?.layout || 'auto'} className="input">{LAYOUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="Card style"><select name="cardTemplate" defaultValue={c?.cardTemplate || 'plan-card'} className="input"><option value="plan-card">Pricing card (shared/SSL style)</option><option value="server-row">Server table row (dedicated/VPS style)</option></select></Field>
            </div>
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Right now: {n} published product(s) → <b>{L.mode}</b> layout ({L.reason}){L.toolbar ? ', with sort/filter bar' : ''}{L.search ? ', search' : ''}{L.pageSize ? `, ${L.pageSize} per page` : ''}{L.compare ? ', comparison table' : ''}.</p>
            <p className="mt-2 text-xs text-slate-500">Automatic rules: {sim.map(([k, m]) => `${k} → ${m}`).join(' · ')}. Long feature lists collapse automatically.</p>
          </Card>
          <Card title="SEO">
            <div className="grid gap-4">
              <Field label="SEO title"><input name="seoTitle" defaultValue={c?.seoTitle} className="input" /></Field>
              <Field label="Meta description"><textarea name="seoDescription" rows={2} defaultValue={c?.seoDescription} className="input" /></Field>
            </div>
          </Card>
          <button className="btn btn-primary">Save category</button>
        </form>
        {c && (
          <div className="space-y-6">
            <Card title="Landing page">
              <p className="mb-3 text-sm text-slate-500">Generate a page (hero + live product section + FAQ) for this category. It&apos;s created as a draft for you to edit.</p>
              <form action={createCategoryPage}><input type="hidden" name="id" value={c.id} /><button className="btn btn-secondary w-full">Create landing page /{c.slug}</button></form>
            </Card>
            <Card title="Danger zone">
              <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="btn btn-danger w-full">Delete category</button></form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
