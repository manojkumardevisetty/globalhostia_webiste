import { notFound } from 'next/navigation';
import { eq, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Field, Flash, LinkBtn } from '@/components/ui';
import { saveBlock, duplicateBlock, assignToAll, deleteBlock } from '../actions';

export default async function EditBlock({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string>> }) {
  const key = decodeURIComponent((await params).key); const sp = await searchParams;
  const [b] = await db.select().from(schema.blocks).where(eq(schema.blocks.key, key));
  if (!b) notFound();
  const [usedBy] = await db.select({ slug: schema.pages.slug }).from(schema.pages).where(or(eq(schema.pages.headerBlock, key), eq(schema.pages.footerBlock, key), eq(schema.pages.bodyEndBlock, key), eq(schema.pages.bodyStartBlock, key))).limit(1);
  const previewUrl = usedBy ? (usedBy.slug === 'index' ? '/?preview=1' : `/${usedBy.slug}?preview=1`) : '/?preview=1';
  return (
    <>
      <PageHeader title={`Block: ${b.key}`} desc={b.name} actions={<><LinkBtn href={previewUrl} target="_blank">Preview ↗</LinkBtn><LinkBtn href="/admin/blocks">← All blocks</LinkBtn></>} />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-4">
        <form action={saveBlock} className="space-y-4 xl:col-span-3">
          <input type="hidden" name="key" value={b.key} />
          <Card>
            <Field label="Label"><input name="name" defaultValue={b.name} className="input mb-4" /></Field>
            <Field label="HTML" hint="Menus, links, phone number, logo — all editable here. Tokens like {{phone}} and {{login_url}} are filled from Settings.">
              <textarea name="html" defaultValue={b.html} rows={34} spellCheck={false} className="input code" /></Field>
          </Card>
          <button className="btn btn-primary">Save block</button>
        </form>
        <div className="space-y-4">
          <Card title="Actions">
            <div className="space-y-2">
              <form action={assignToAll}><input type="hidden" name="key" value={b.key} /><button className="btn btn-secondary w-full">Use on all pages</button></form>
              <form action={duplicateBlock}><input type="hidden" name="key" value={b.key} /><button className="btn btn-secondary w-full">Duplicate as new variant</button></form>
              <form action={deleteBlock}><input type="hidden" name="key" value={b.key} /><button className="btn btn-ghost w-full text-red-600">Delete (if unused)</button></form>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
