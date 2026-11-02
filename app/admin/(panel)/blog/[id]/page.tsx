import { notFound } from 'next/navigation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, LinkBtn, Card, fmtDate } from '@/components/ui';
import { getSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import PostEditor, { type EditorPost } from '../editor';
import { restorePost } from '../actions';

export const metadata = { title: 'Edit post' };

export default async function EditPost({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const isNew = id === 'new';
  const [p] = isNew ? [null] : await db.select().from(schema.posts).where(eq(schema.posts.id, id));
  if (!isNew && !p) notFound();
  const [session, settings] = await Promise.all([getSession(), getSettings()]);
  const cats = (await db.selectDistinct({ c: schema.posts.category }).from(schema.posts).where(sql`${schema.posts.category} <> ''`).orderBy(schema.posts.category)).map((r) => r.c);
  const authors = (await db.selectDistinct({ a: schema.posts.author }).from(schema.posts).where(sql`${schema.posts.author} <> ''`)).map((r) => r.a);
  const revs = p ? await db.select({ id: schema.revisions.id, createdAt: schema.revisions.createdAt, userEmail: schema.revisions.userEmail })
    .from(schema.revisions).where(and(eq(schema.revisions.entity, 'post'), eq(schema.revisions.entityId, p.id))).orderBy(desc(schema.revisions.createdAt)).limit(8) : [];

  const post: EditorPost = {
    id: p?.id || '', title: p?.title || '', slug: p?.slug || '', excerpt: p?.excerpt || '', body: p?.body || '', coverImage: p?.coverImage || '', coverAlt: p?.coverAlt || '',
    category: p?.category || '', tags: (p?.tags || []).join(', '), author: p?.author || session?.name || '', status: p?.status || 'DRAFT',
    publishAt: p?.publishAt ? new Date(p.publishAt).toISOString() : '', featured: !!p?.featured, seoTitle: p?.seoTitle || '', seoDescription: p?.seoDescription || '',
    ogImage: p?.ogImage || '', canonical: p?.canonical || '', updatedAt: p ? new Date(p.updatedAt).toISOString() : '',
  };
  const site = String(settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');

  return (
    <>
      <PageHeader title={isNew ? 'New blog post' : 'Edit post'} desc={p ? <>Last saved {fmtDate(p.updatedAt)}</> : 'Write in plain text with simple formatting. The preview shows exactly how it will look.'}
        actions={<LinkBtn href="/admin/blog">← All posts</LinkBtn>} />
      <Flash sp={sp} />
      <PostEditor post={post} categories={cats} authors={authors} siteUrl={site} siteName={String(settings.site_name || 'Globalhostia')} />
      {revs.length > 0 && (
        <Card title="Earlier versions" className="mt-6">
          <p className="mb-3 text-xs text-slate-500">A copy is saved every time you save. Restoring brings back the text and settings of that version (status and URL stay as they are).</p>
          <ul className="divide-y divide-slate-100 text-sm">{revs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-slate-600">{fmtDate(r.createdAt)} <span className="text-slate-400">· {r.userEmail}</span></span>
              <form action={restorePost}><input type="hidden" name="rev" value={r.id} /><button className="btn btn-ghost h-8 px-2.5 text-xs">Restore this version</button></form>
            </li>))}</ul>
        </Card>
      )}
    </>
  );
}
