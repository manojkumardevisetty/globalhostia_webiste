'use server';
import { and, eq, ne, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail, bust, str } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { renderMarkdown } from '@/lib/markdown';
import { after } from 'next/server';
import { pingChanged } from '@/lib/indexnow';

export type SaveState = { error?: string; field?: string };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['category', 'tag', 'rss', 'rss-xml', 'page', 'feed', 'uae-guides', 'global-guides', 'arabic']);
const urlish = (label: string) => z.string().trim().max(2000).refine((v) => !v || /^\//.test(v) || /^https?:\/\/[^\s]+$/i.test(v), `${label} must be a full https:// address or start with /`);

const PostInput = z.object({
  id: z.string().trim(),
  title: z.string().trim().min(1, 'Give the post a title').max(200, 'The title is too long (200 characters max)'),
  slug: z.string().trim().toLowerCase().min(1, 'The URL is required').max(100, 'The URL is too long').regex(SLUG, 'The URL may only contain lowercase letters, numbers and single hyphens').refine((s) => !RESERVED.has(s), 'That URL is reserved, choose another one'),
  excerpt: z.string().trim().max(500, 'The summary is too long (500 characters max)'),
  body: z.string().max(200_000, 'The article is too long'),
  coverImage: urlish('Cover image'),
  coverAlt: z.string().trim().max(200),
  category: z.string().trim().max(60, 'Category name is too long'),
  tags: z.array(z.string().trim().min(1).max(40, 'A tag is too long (40 characters max)')).max(15, 'Use 15 tags or fewer'),
  author: z.string().trim().max(80),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  publishAt: z.string().trim().refine((v) => !v || !Number.isNaN(Date.parse(v)), 'The publish date is not valid'),
  featured: z.boolean(),
  seoTitle: z.string().trim().max(120, 'SEO title is too long (120 characters max)'),
  seoDescription: z.string().trim().max(320, 'Meta description is too long (320 characters max)'),
  ogImage: urlish('Social image'),
  canonical: z.string().trim().max(2000).refine((v) => !v || /^https:\/\/[^\s]+$/i.test(v), 'Canonical URL must be a full https:// address'),
  coverStyle: z.enum(['branded', 'plain', 'hex']),
  focusKeyword: z.string().trim().max(80, 'The focus keyword is too long (80 characters max)'),
  secondaryKeywords: z.string().trim().max(300, 'Secondary keywords are too long (300 characters max)'),
  takeaways: z.array(z.string().trim().min(1).max(200, 'A key takeaway is too long (200 characters max)')).max(8, 'Use 8 key takeaways or fewer'),
  relatedProducts: z.array(z.string().regex(/^(cat|p):[a-z0-9-]+$/, 'Unknown product selection')).max(12, 'Choose 12 products or categories at most'),
  track: z.enum(['', 'uae', 'global']),
  lang: z.enum(['en', 'ar']),
});

/** Create or update a post (used with useActionState: returns an error, or redirects on success). */
export async function savePost(_prev: SaveState, fd: FormData): Promise<SaveState> {
  const s = await requireSession('content');
  const parsed = PostInput.safeParse({
    id: str(fd, 'id'), title: str(fd, 'title'), slug: str(fd, 'slug'), excerpt: str(fd, 'excerpt'), body: String(fd.get('body') ?? '').replace(/\r\n/g, '\n'),
    coverImage: str(fd, 'coverImage'), coverAlt: str(fd, 'coverAlt'), category: str(fd, 'category').replace(/\s+/g, ' '),
    tags: [...new Set(str(fd, 'tags').split(',').map((t) => t.trim().replace(/^#/, '').replace(/\s+/g, ' ')).filter(Boolean))],
    author: str(fd, 'author'), status: str(fd, 'status') || 'DRAFT', publishAt: str(fd, 'publishAt'), featured: fd.get('featured') === 'on' || fd.get('featured') === 'true',
    seoTitle: str(fd, 'seoTitle'), seoDescription: str(fd, 'seoDescription'), ogImage: str(fd, 'ogImage'), canonical: str(fd, 'canonical'),
    coverStyle: str(fd, 'coverStyle') || 'branded', focusKeyword: str(fd, 'focusKeyword'), secondaryKeywords: str(fd, 'secondaryKeywords'),
    takeaways: str(fd, 'takeaways').split(/\r?\n/).map((t) => t.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean),
    relatedProducts: [...new Set(str(fd, 'relatedProducts').split(',').map((x) => x.trim()).filter(Boolean))],
    track: str(fd, 'track'), lang: str(fd, 'lang') || 'en',
  });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: i?.message || 'Please check the form', field: String(i?.path?.[0] ?? '') };
  }
  const v = parsed.data;
  if (v.status === 'PUBLISHED' && !v.body.trim()) return { error: 'Write the article before publishing it', field: 'body' };

  const clash = await db.select({ id: schema.posts.id }).from(schema.posts).where(and(eq(schema.posts.slug, v.slug), v.id ? ne(schema.posts.id, v.id) : undefined)).limit(1);
  if (clash.length) return { error: `Another post already uses the URL /blog/${v.slug}`, field: 'slug' };

  const [old] = v.id ? await db.select().from(schema.posts).where(eq(schema.posts.id, v.id)) : [];
  if (v.id && !old) return { error: 'This post no longer exists (it may have been deleted)' };

  // first publish without a date → stamp "now" so the article date is the day it went live
  let publishAt = v.publishAt ? new Date(v.publishAt) : null;
  if (v.status === 'PUBLISHED' && !publishAt) publishAt = new Date();

  const row = {
    slug: v.slug, title: v.title, excerpt: v.excerpt, body: v.body, coverImage: v.coverImage, coverAlt: v.coverAlt, category: v.category, tags: v.tags,
    author: v.author, status: v.status, publishAt, featured: v.featured, seoTitle: v.seoTitle, seoDescription: v.seoDescription, ogImage: v.ogImage, canonical: v.canonical,
    coverStyle: v.coverStyle, focusKeyword: v.focusKeyword, secondaryKeywords: v.secondaryKeywords, takeaways: v.takeaways.join('\n'), relatedProducts: v.relatedProducts,
    track: v.track, lang: v.lang,
  };
  let id = v.id;
  if (old) {
    await saveRevision(s, 'post', old.id, old);
    await db.update(schema.posts).set({ ...row, updatedAt: new Date() }).where(eq(schema.posts.id, old.id));
    if (old.slug !== v.slug && old.status === 'PUBLISHED') {
      // keep links to the old address working
      await db.insert(schema.redirects).values({ from: `/blog/${old.slug}`, to: `/blog/${v.slug}`, code: 301 })
        .onConflictDoUpdate({ target: schema.redirects.from, set: { to: `/blog/${v.slug}`, code: 301 } });
      await db.update(schema.redirects).set({ to: `/blog/${v.slug}` }).where(eq(schema.redirects.to, `/blog/${old.slug}`));
    }
    await audit(s, 'update', 'post', old.id, { slug: v.slug, status: v.status });
  } else {
    const [p] = await db.insert(schema.posts).values(row).returning({ id: schema.posts.id });
    id = p.id;
    await audit(s, 'create', 'post', id, { slug: v.slug, status: v.status });
  }
  // an old redirect from this address would hide the post
  await db.delete(schema.redirects).where(eq(schema.redirects.from, `/blog/${v.slug}`));
  bust();

  const live = v.status === 'PUBLISHED' && (!publishAt || publishAt.getTime() <= Date.now());
  if (live && !v.canonical) after(() => pingChanged([`/blog/${v.slug}`, '/blog'], 'blog post saved'));
  const msg = v.status === 'PUBLISHED' ? (live ? (old?.status === 'PUBLISHED' ? 'Saved. The live article is updated.' : 'Published. The article is live now.') : 'Scheduled. The article goes live at the publish time.')
    : v.status === 'ARCHIVED' ? 'Saved as archived (hidden from the website).' : old ? 'Draft saved.' : 'Draft created.';
  redirect(`/admin/blog/${id}?ok=${encodeURIComponent(msg)}`);
}

/** Quick publish / unpublish from the list. */
export async function setPostStatus(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id'), op = str(fd, 'op');
  const back = str(fd, 'back') || '/admin/blog';
  const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, id));
  if (!p) fail(back, 'Post not found');
  if (op === 'publish') {
    if (!p.body.trim()) fail(back, 'This post has no content yet. Write it before publishing.');
    await db.update(schema.posts).set({ status: 'PUBLISHED', publishAt: p.publishAt ?? new Date(), updatedAt: new Date() }).where(eq(schema.posts.id, id));
    await db.delete(schema.redirects).where(eq(schema.redirects.from, `/blog/${p.slug}`));
  } else if (op === 'unpublish') {
    await db.update(schema.posts).set({ status: 'DRAFT', updatedAt: new Date() }).where(eq(schema.posts.id, id));
  } else if (op === 'archive') {
    await db.update(schema.posts).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(schema.posts.id, id));
  } else fail(back, 'Unknown action');
  await audit(s, op, 'post', id, { slug: p.slug });
  if (op === 'publish' && !(p.publishAt && p.publishAt.getTime() > Date.now())) after(() => pingChanged([`/blog/${p.slug}`, '/blog'], 'blog post published'));
  const scheduled = op === 'publish' && p.publishAt && p.publishAt.getTime() > Date.now();
  done(back, op === 'publish' ? (scheduled ? `"${p.title}" is scheduled` : `"${p.title}" is live`) : op === 'archive' ? `"${p.title}" archived` : `"${p.title}" moved to drafts`);
}

export async function deletePost(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const [p] = await db.select().from(schema.posts).where(eq(schema.posts.id, id));
  if (!p) fail('/admin/blog', 'Post not found');
  await saveRevision(s, 'post', id, p);
  await db.delete(schema.posts).where(eq(schema.posts.id, id));
  await audit(s, 'delete', 'post', id, { slug: p.slug, title: p.title });
  done('/admin/blog', `Deleted "${p.title}". A copy is kept in the revision history.`);
}

/** Live preview in the editor: same Markdown renderer and sanitizer as the public page. */
export async function previewMarkdown(md: string): Promise<string> {
  await requireSession('content');
  return renderMarkdown(String(md || '').slice(0, 200_000)).html;
}

/** Slug check while typing. */
export async function checkSlug(slug: string, id: string): Promise<{ ok: boolean; message: string }> {
  await requireSession('content');
  const v = String(slug || '').trim().toLowerCase();
  if (!v) return { ok: false, message: 'The URL is required' };
  if (!SLUG.test(v)) return { ok: false, message: 'Use lowercase letters, numbers and hyphens only' };
  if (RESERVED.has(v)) return { ok: false, message: 'That URL is reserved' };
  const [hit] = await db.select({ id: schema.posts.id, title: schema.posts.title }).from(schema.posts).where(and(eq(schema.posts.slug, v), id ? ne(schema.posts.id, id) : undefined)).limit(1);
  return hit ? { ok: false, message: `Already used by "${hit.title}"` } : { ok: true, message: 'Available' };
}

/** Restore a post from a revision. */
export async function restorePost(fd: FormData) {
  const s = await requireSession('content');
  const [r] = await db.select().from(schema.revisions).where(and(eq(schema.revisions.id, str(fd, 'rev')), eq(schema.revisions.entity, 'post')));
  if (!r) fail('/admin/blog', 'Revision not found');
  const d = r.data as Record<string, any>;
  const [cur] = await db.select().from(schema.posts).where(eq(schema.posts.id, r.entityId));
  const fields = { title: d.title, excerpt: d.excerpt ?? '', body: d.body ?? '', coverImage: d.coverImage ?? '', coverAlt: d.coverAlt ?? '', category: d.category ?? '', tags: d.tags ?? [], author: d.author ?? '',
    featured: !!d.featured, seoTitle: d.seoTitle ?? '', seoDescription: d.seoDescription ?? '', ogImage: d.ogImage ?? '', canonical: d.canonical ?? '',
    coverStyle: d.coverStyle ?? 'branded', focusKeyword: d.focusKeyword ?? '', secondaryKeywords: d.secondaryKeywords ?? '', takeaways: d.takeaways ?? '', relatedProducts: d.relatedProducts ?? [] };
  if (cur) {
    await saveRevision(s, 'post', cur.id, cur);
    await db.update(schema.posts).set({ ...fields, updatedAt: new Date() }).where(eq(schema.posts.id, cur.id));
    await audit(s, 'restore_revision', 'post', cur.id, { rev: r.id });
    done(`/admin/blog/${cur.id}`, 'Earlier version restored (status and URL unchanged)');
  }
  // deleted post → bring it back as a draft (new URL if the old one is taken)
  const taken = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.posts).where(eq(schema.posts.slug, d.slug)))[0].n > 0;
  const [p] = await db.insert(schema.posts).values({ ...fields, id: r.entityId, slug: taken ? `${d.slug}-restored` : d.slug, status: 'DRAFT', publishAt: d.publishAt ? new Date(d.publishAt) : null }).returning({ id: schema.posts.id });
  await audit(s, 'restore_deleted', 'post', p.id, { rev: r.id });
  done(`/admin/blog/${p.id}`, 'Deleted post restored as a draft');
}

const RoadmapInput = z.array(z.object({
  title: z.string().trim().min(1, 'Every roadmap item needs a title').max(80, 'A roadmap title is too long (80 characters max)'),
  description: z.string().trim().max(240, 'A roadmap description is too long (240 characters max)'),
  eta: z.string().trim().max(40, 'The timing text is too long (40 characters max)'),
  status: z.enum(['planned', 'in_progress', 'launched']),
})).max(12, 'Use 12 roadmap items or fewer');

/** "What's coming next" items (settings.roadmap), shown on the blog and article pages. */
export async function saveRoadmap(_prev: { error?: string; ok?: string }, fd: FormData): Promise<{ error?: string; ok?: string }> {
  const s = await requireSession('content');
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get('items') || '[]')); } catch { return { error: 'Could not read the roadmap items' }; }
  const items = Array.isArray(raw) ? raw.filter((x) => x && (String(x.title || '').trim() || String(x.description || '').trim())) : [];
  const r = RoadmapInput.safeParse(items);
  if (!r.success) return { error: r.error.issues[0]?.message || 'Please check the roadmap items' };
  await setSetting('roadmap', r.data);
  await audit(s, 'update', 'roadmap', null, { items: r.data.length });
  bust();
  return { ok: r.data.length ? `Saved ${r.data.length} item${r.data.length === 1 ? '' : 's'}. They show on the blog now.` : 'Roadmap cleared. The section is hidden.' };
}
