import Link from 'next/link';
import { and, desc, eq, gt, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Badge, Empty, LinkBtn, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import { readingMinutes } from '@/lib/markdown-text';
import { setPostStatus, deletePost } from './actions';
import ConfirmSubmit from './confirm';
import RoadmapEditor from './roadmap';
import { Card } from '@/components/ui';
import { getSettings } from '@/lib/settings';
import { roadmapFrom } from '@/lib/blog';

export const metadata = { title: 'Blog' };

const TABS = [
  ['', 'All'], ['live', 'Live'], ['scheduled', 'Scheduled'], ['draft', 'Drafts'], ['archived', 'Archived'],
] as const;

export default async function BlogAdmin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const now = new Date();
  const P = schema.posts;
  const live = and(eq(P.status, 'PUBLISHED'), or(isNull(P.publishAt), lte(P.publishAt, now)));
  const scheduled = and(eq(P.status, 'PUBLISHED'), gt(P.publishAt, now));
  const byTab = { live, scheduled, draft: eq(P.status, 'DRAFT'), archived: eq(P.status, 'ARCHIVED') } as Record<string, any>;

  const [counts] = await db.select({
    all: sql<number>`count(*)::int`,
    live: sql<number>`count(*) filter (where status = 'PUBLISHED' and (publish_at is null or publish_at <= now()))::int`,
    scheduled: sql<number>`count(*) filter (where status = 'PUBLISHED' and publish_at > now())::int`,
    draft: sql<number>`count(*) filter (where status = 'DRAFT')::int`,
    archived: sql<number>`count(*) filter (where status = 'ARCHIVED')::int`,
  }).from(P);
  const cats = (await db.selectDistinct({ c: P.category }).from(P).where(sql`${P.category} <> ''`).orderBy(P.category)).map((r) => r.c);
  const q = (sp.q || '').trim();
  const rows = await db.select().from(P).where(and(
    q ? or(ilike(P.title, `%${q}%`), ilike(P.slug, `%${q}%`), ilike(P.category, `%${q}%`), sql`${P.tags}::text ilike ${'%' + q + '%'}`) : undefined,
    sp.cat ? eq(P.category, sp.cat) : undefined,
    sp.tab && byTab[sp.tab] ? byTab[sp.tab] : undefined,
  )).orderBy(desc(sql`coalesce(${P.publishAt}, ${P.updatedAt})`)).limit(500);

  const qs = (o: Record<string, string | undefined>) => {
    const u = new URLSearchParams(Object.entries({ q: sp.q, cat: sp.cat, tab: sp.tab, ...o }).filter(([, v]) => v) as [string, string][]).toString();
    return u ? `/admin/blog?${u}` : '/admin/blog';
  };
  const back = qs({});
  const stateOf = (p: typeof rows[number]) => p.status === 'PUBLISHED' ? (p.publishAt && p.publishAt > now ? 'scheduled' : 'live') : p.status === 'DRAFT' ? 'draft' : 'archived';
  const TONE: Record<string, string> = { live: 'green', scheduled: 'blue', draft: 'yellow', archived: 'gray' };
  const LABEL: Record<string, string> = { live: 'Live', scheduled: 'Scheduled', draft: 'Draft', archived: 'Archived' };

  return (
    <>
      <PageHeader title="Blog" desc="Write articles that help customers and bring visitors from Google. Live posts appear on /blog, on the homepage and in the client area."
        actions={<><a href="/blog" target="_blank" className="btn btn-secondary"><Icon name="external" /> View blog</a><LinkBtn href="/admin/blog/new" variant="primary"><Icon name="plus" /> New post</LinkBtn></>} />
      <Flash sp={sp} />

      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by status">
        {TABS.map(([k, label]) => {
          const n = k ? (counts as any)[k] : counts.all;
          const on = (sp.tab || '') === k;
          return (
            <Link key={k} href={qs({ tab: k || undefined })} aria-current={on ? 'page' : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition ${on ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-400'}`}>
              {label}<span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
        <input name="q" defaultValue={sp.q} placeholder="Search title, URL, category or tag" className="input max-w-xs" aria-label="Search posts" />
        <select name="cat" defaultValue={sp.cat} className="input max-w-[220px]" aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <button className="btn btn-secondary">Filter</button>
        {(sp.q || sp.cat) && <Link href={qs({ q: undefined, cat: undefined })} className="btn btn-ghost">Clear</Link>}
      </form>

      {!rows.length ? (
        <Empty icon="pen">
          {counts.all ? <>No posts match these filters. <Link href="/admin/blog" className="text-brand-600 underline">Show all posts</Link></> : <>
            <p className="mb-3 font-medium text-slate-700">No blog posts yet</p>
            <p className="mb-4">Articles answer customer questions and help people find GlobalHostia on Google.</p>
            <Link href="/admin/blog/new" className="btn btn-primary">Write your first post</Link></>}
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Post</th><th>Category</th><th>Status</th><th>Date</th><th className="text-right">Actions</th></tr></thead>
            <tbody>{rows.map((p) => {
              const st = stateOf(p);
              return (
                <tr key={p.id}>
                  <td className="min-w-[260px]">
                    <Link href={`/admin/blog/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.title}</Link>
                    {p.featured && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">Featured</span>}
                    <div className="mt-0.5 font-mono text-xs text-slate-400">/blog/{p.slug} · {readingMinutes(p.body)} min read</div>
                  </td>
                  <td className="text-slate-600">{p.category || <span className="text-slate-400">—</span>}</td>
                  <td><Badge tone={TONE[st]}>{LABEL[st]}</Badge></td>
                  <td className="whitespace-nowrap text-xs text-slate-500">
                    {st === 'scheduled' ? <>Goes live<br /><b className="text-slate-700">{fmtDate(p.publishAt)}</b></> : st === 'live' ? <>Published<br />{fmtDate(p.publishAt)}</> : <>Edited<br />{fmtDate(p.updatedAt)}</>}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1.5">
                      <a href={st === 'live' ? `/blog/${p.slug}` : `/blog/${p.slug}?preview`} target="_blank" className="btn btn-ghost h-9 px-2.5 text-xs" title={st === 'live' ? 'View on website' : 'Preview (only you can see it)'}>
                        <Icon name={st === 'live' ? 'external' : 'eye'} /> {st === 'live' ? 'View' : 'Preview'}
                      </a>
                      <form action={setPostStatus}>
                        <input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} />
                        <input type="hidden" name="op" value={p.status === 'PUBLISHED' ? 'unpublish' : 'publish'} />
                        {p.status === 'PUBLISHED'
                          ? <button className="btn btn-secondary h-9 px-2.5 text-xs">Unpublish</button>
                          : <button className="btn btn-secondary h-9 px-2.5 text-xs">{p.publishAt && p.publishAt > now ? 'Schedule' : 'Publish'}</button>}
                      </form>
                      <Link href={`/admin/blog/${p.id}`} className="btn btn-ghost h-9 px-2.5 text-xs"><Icon name="pen" /> Edit</Link>
                      <form action={deletePost}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmSubmit message={`Delete "${p.title}"? It disappears from the website immediately.`} className="btn btn-ghost h-9 px-2.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700" label={`Delete ${p.title}`}>
                          <Icon name="trash" />
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <Card title="What's coming next (roadmap)" className="mt-8">
        <RoadmapEditor initial={roadmapFrom((await getSettings()).roadmap)} />
      </Card>
      <p className="mt-4 text-xs text-slate-400">Tip: a post marked <b>Featured</b> is shown large at the top of the blog. Scheduled posts go live automatically at their publish time.</p>
    </>
  );
}
