import { notFound } from 'next/navigation';
import { asc, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Field, Flash, Badge, statusTone, LinkBtn } from '@/components/ui';
import SortableSections from '@/components/SortableSections';
import { savePage, deletePage, addSection, sectionOp, reorderSections } from '../actions';

export default async function EditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const [p] = await db.select().from(schema.pages).where(eq(schema.pages.id, id));
  if (!p) notFound();
  const secs = await db.select({ id: schema.sections.id, name: schema.sections.name, type: schema.sections.type, visible: schema.sections.visible }).from(schema.sections).where(eq(schema.sections.pageId, id)).orderBy(asc(schema.sections.sortOrder));
  const blocks = await db.select({ key: schema.blocks.key, name: schema.blocks.name }).from(schema.blocks).orderBy(asc(schema.blocks.key));
  const others = await db.select({ id: schema.sections.id, name: schema.sections.name, slug: schema.pages.slug }).from(schema.sections).innerJoin(schema.pages, eq(schema.pages.id, schema.sections.pageId)).where(ne(schema.sections.pageId, id)).orderBy(asc(schema.pages.slug)).limit(400);
  const url = p.slug === 'index' ? '/' : `/${p.slug}`;
  const opt = (prefix: string) => blocks.filter((b) => b.key === prefix || b.key.startsWith(prefix + '-'));
  const dt = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 16) : '');

  return (
    <>
      <PageHeader title={p.title.slice(0, 80)} desc={<><a href={url} target="_blank" className="font-mono text-brand-600">{url}</a> · <Badge tone={statusTone(p.status)}>{p.status}</Badge></>}
        actions={<><LinkBtn href={`${url}?preview=1`} target="_blank">Open preview ↗</LinkBtn><LinkBtn href="/admin/pages">← All pages</LinkBtn></>} />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-2">
          <Card title={`Sections (${secs.length})`}>
            <SortableSections pageId={p.id} items={secs} reorder={reorderSections} opAction={sectionOp} />
            <form action={addSection} className="mt-4 space-y-2 border-t pt-4">
              <input type="hidden" name="pageId" value={p.id} />
              <div className="flex gap-2">
                <select name="type" className="input"><option value="html">HTML block (any design)</option><option value="products">Products (live from catalog)</option><option value="domain_search">Domain search box</option><option value="domain_results">Domain search results</option><option value="tld_pricing">Domain price table</option><option value="faq">FAQ (with SEO schema)</option></select>
                <button className="btn btn-primary shrink-0">+ Add</button>
              </div>
              <select name="copySection" className="input text-xs"><option value="">…or copy an existing section from another page</option>{others.map((o) => <option key={o.id} value={o.id}>/{o.slug} — {o.name}</option>)}</select>
            </form>
          </Card>
          <form action={savePage} className="space-y-6">
            <input type="hidden" name="id" value={p.id} />
            <Card title="Page settings & SEO">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title (admin)" className="sm:col-span-2"><input name="title" defaultValue={p.title} className="input" /></Field>
                <Field label="URL slug"><input name="slug" defaultValue={p.slug} className="input" readOnly={p.slug === 'index'} /></Field>
                <Field label="Status"><select name="status" defaultValue={p.status} className="input"><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></Field>
                <Field label="Publish at (schedule)"><input type="datetime-local" name="publishAt" defaultValue={dt(p.publishAt)} className="input" /></Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="inSitemap" defaultChecked={p.inSitemap} /> In sitemap.xml</label>
                <Field label="SEO title" className="sm:col-span-2" hint={`${p.seoTitle.length}/60 characters`}><input name="seoTitle" defaultValue={p.seoTitle} className="input" /></Field>
                <Field label="Meta description" className="sm:col-span-2" hint={`${p.seoDescription.length}/160 characters`}><textarea name="seoDescription" rows={3} defaultValue={p.seoDescription} className="input" /></Field>
                <Field label="Keywords" className="sm:col-span-2"><input name="seoKeywords" defaultValue={p.seoKeywords} className="input" /></Field>
                <Field label="Social share image URL" className="sm:col-span-2"><input name="ogImage" defaultValue={p.ogImage} className="input" /></Field>
              </div>
            </Card>
            <Card title="Layout blocks">
              <div className="grid gap-3 sm:grid-cols-2">
                {([['headerBlock', 'header', 'Header'], ['footerBlock', 'footer', 'Footer'], ['bodyStartBlock', 'body_start', 'Before content (loader, GTM)'], ['bodyEndBlock', 'body_end', 'After content (scripts, popups)']] as const).map(([k, pre, label]) => (
                  <Field key={k} label={label}><select name={k} defaultValue={(p as any)[k]} className="input">{opt(pre).map((b) => <option key={b.key} value={b.key}>{b.key}</option>)}</select></Field>
                ))}
                <input type="hidden" name="headBlock" value={p.headBlock} />
                <Field label="Body CSS class"><input name="bodyClass" defaultValue={p.bodyClass} className="input" /></Field>
                <Field label="Wrapper CSS class"><input name="wrapperClass" defaultValue={p.wrapperClass} className="input" /></Field>
                <Field label="Extra <head> HTML (page-specific CSS/JS)" className="sm:col-span-2"><textarea name="headExtra" rows={4} defaultValue={p.headExtra} className="input code" /></Field>
              </div>
            </Card>
            <button className="btn btn-primary">Save page</button>
          </form>
          {p.slug !== 'index' && <form action={deletePage}><input type="hidden" name="id" value={p.id} /><button className="btn btn-danger">Delete page</button></form>}
        </div>
        <div className="xl:col-span-3">
          <div className="card sticky top-20 overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-slate-500"><span>Live preview (includes drafts & hidden sections)</span><a href={`${url}?preview=1`} target="_blank" className="text-brand-600">Full screen ↗</a></div>
            <iframe id="gh-preview" src={`${url}?preview=1`} className="h-[78vh] w-full bg-white" title="Page preview" />
          </div>
        </div>
      </div>
    </>
  );
}
