import { notFound } from 'next/navigation';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Field, Flash, LinkBtn, fmtDate } from '@/components/ui';
import { saveSection, restoreRevision } from '../../../actions';

export default async function EditSection({ params, searchParams }: { params: Promise<{ id: string; sid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id, sid } = await params; const sp = await searchParams;
  const [sec] = await db.select().from(schema.sections).where(and(eq(schema.sections.id, sid), eq(schema.sections.pageId, id)));
  if (!sec) notFound();
  const [page] = await db.select().from(schema.pages).where(eq(schema.pages.id, id));
  const cats = sec.type === 'products' ? await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)) : [];
  const revs = await db.select().from(schema.revisions).where(and(eq(schema.revisions.entity, 'section'), eq(schema.revisions.entityId, sid))).orderBy(desc(schema.revisions.createdAt)).limit(10);
  const d = sec.data || {};
  const selected: string[] = d.categories || (d.category ? [d.category] : []);
  const url = page.slug === 'index' ? '/' : `/${page.slug}`;

  return (
    <>
      <PageHeader title={`Edit section: ${sec.name || sec.type}`} desc={<>On page <a className="text-brand-600" href={`/admin/pages/${id}`}>{page.title.slice(0, 60)}</a> · type <b>{sec.type}</b></>}
        actions={<><LinkBtn href={`${url}?preview=1#`} target="_blank">Preview ↗</LinkBtn><LinkBtn href={`/admin/pages/${id}`}>← Back to page</LinkBtn></>} />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-3">
        <form action={saveSection} className="space-y-6 xl:col-span-2">
          <input type="hidden" name="id" value={sec.id} />
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Section name (admin only)" className="sm:col-span-2"><input name="name" defaultValue={sec.name} className="input" /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="visible" defaultChecked={sec.visible} /> Visible</label>
            </div>
          </Card>

          {sec.type === 'html' && (
            <Card title="HTML">
              <textarea name="html" defaultValue={sec.html} rows={30} spellCheck={false} className="input code" />
              <p className="mt-2 text-xs text-slate-500">Uses the site theme&apos;s CSS classes. Tokens: {'{{site_name}} {{phone}} {{email}} {{company}} {{year}} {{whmcs_url}} {{cart_url}} {{login_url}} {{register_url}}'}</p>
            </Card>
          )}

          {sec.type === 'products' && (
            <>
              <Card title="Which products">
                <Field label="Categories (one = single list, several = tabs)">
                  <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                    {cats.map((c) => <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="categories" value={c.slug} defaultChecked={selected.includes(c.slug)} /> {c.name} <span className="text-xs text-slate-400">{c.slug}</span></label>)}
                  </div>
                </Field>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Layout"><select name="layout" defaultValue={d.layout || 'auto'} className="input"><option value="auto">Automatic (by product count)</option><option value="featured">Featured</option><option value="cards">Pricing cards</option><option value="grid">Grid + filters</option><option value="catalog">Catalogue + search + pages</option></select></Field>
                  <Field label="Card style"><select name="template" defaultValue={d.template || 'plan-card'} className="input"><option value="plan-card">Pricing card</option><option value="server-row">Server table</option></select></Field>
                  <Field label="Heading"><input name="title" defaultValue={d.title} className="input" /></Field>
                  <Field label="Sub-heading"><input name="subtitle" defaultValue={d.subtitle} className="input" /></Field>
                  <Field label="Wrapper CSS classes" className="sm:col-span-2"><input name="wrapperClass" defaultValue={d.wrapperClass} className="input" /></Field>
                </div>
              </Card>
              <Card title="Fallback HTML">
                <p className="mb-2 text-xs text-slate-500">Shown only while the selected categories have no published products (e.g. before the first WHMCS sync). Imported from the original page.</p>
                <textarea name="fallbackHtml" defaultValue={d.fallbackHtml || ''} rows={10} spellCheck={false} className="input code" />
              </Card>
            </>
          )}

          {sec.type === 'faq' && (
            <Card title="Questions">
              <div className="grid gap-4">
                <Field label="Heading"><input name="title" defaultValue={d.title} className="input" /></Field>
                <Field label="Questions & answers" hint='Write "Q: …" then "A: …" lines. Adds FAQ rich-results schema for Google.'>
                  <textarea name="items" rows={16} defaultValue={(d.items || []).map((i: any) => `Q: ${i.q}\nA: ${i.a}`).join('\n\n')} className="input code" /></Field>
                <Field label="Wrapper CSS classes"><input name="wrapperClass" defaultValue={d.wrapperClass} className="input" /></Field>
              </div>
            </Card>
          )}

          {['domain_search', 'domain_results', 'tld_pricing'].includes(sec.type) && (
            <Card title="Settings">
              <div className="grid gap-4 sm:grid-cols-2">
                {sec.type !== 'domain_results' && <Field label="Heading"><input name="title" defaultValue={d.title} className="input" /></Field>}
                {sec.type === 'domain_search' && <>
                  <Field label="Placeholder"><input name="placeholder" defaultValue={d.placeholder} className="input" /></Field>
                  <Field label="Button text"><input name="button" defaultValue={d.button} className="input" /></Field>
                  <Field label="Results page URL" hint="Leave empty to show results on this page (add a 'Domain search results' section)"><input name="action" defaultValue={d.action} placeholder="/domains-registration" className="input" /></Field>
                </>}
                {sec.type === 'tld_pricing' && <Field label="Max rows"><input name="limit" type="number" defaultValue={d.limit || 60} className="input" /></Field>}
                <Field label="Wrapper CSS classes"><input name="wrapperClass" defaultValue={d.wrapperClass} className="input" /></Field>
              </div>
              {sec.type === 'domain_results' && <p className="mt-3 text-sm text-slate-500">Checks availability live via WHMCS for the searched name plus your suggested TLDs (Settings), with prices from Domains & TLDs.</p>}
            </Card>
          )}
          <button className="btn btn-primary">Save section</button>
        </form>
        <Card title="Revision history">
          {!revs.length ? <p className="text-sm text-slate-400">No earlier versions yet.</p> : (
            <ul className="space-y-2 text-sm">{revs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2"><span className="text-xs text-slate-500">{fmtDate(r.createdAt)}<br />{r.userEmail}</span>
                <form action={restoreRevision}><input type="hidden" name="rev" value={r.id} /><button className="btn btn-secondary text-xs">Restore</button></form></li>))}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
