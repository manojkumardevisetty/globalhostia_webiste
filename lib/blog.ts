// Blog data layer: one cached read of all PUBLISHED posts (tag `site`), filtered by publishAt per
// request so scheduled posts appear on time. Drafts are only read uncached, for admin previews.
import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, schema } from './db';
import { autoExcerpt, readingMinutes } from './markdown-text';

export type BlogPost = {
  id: string; slug: string; title: string; excerpt: string; body: string; coverImage: string; coverAlt: string;
  category: string; categorySlug: string; tags: string[]; author: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; featured: boolean;
  seoTitle: string; seoDescription: string; ogImage: string; canonical: string;
  date: string; publishAt: string | null; updatedAt: string; readingMinutes: number;
};

export const categorySlug = (name: string) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function toPost(r: typeof schema.posts.$inferSelect): BlogPost {
  const publishAt = r.publishAt ? new Date(r.publishAt).toISOString() : null;
  return {
    id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt.trim() || autoExcerpt(r.body), body: r.body,
    coverImage: r.coverImage, coverAlt: r.coverAlt, category: r.category.trim(), categorySlug: categorySlug(r.category), tags: (r.tags || []).filter((t) => typeof t === 'string' && t.trim()),
    author: r.author.trim(), status: r.status, featured: r.featured, seoTitle: r.seoTitle, seoDescription: r.seoDescription, ogImage: r.ogImage, canonical: r.canonical,
    date: publishAt || new Date(r.createdAt).toISOString(), publishAt, updatedAt: new Date(r.updatedAt).toISOString(), readingMinutes: readingMinutes(r.body),
  };
}

const loadPublished = unstable_cache(async (): Promise<BlogPost[]> => {
  try {
    const rows = await db.select().from(schema.posts).where(eq(schema.posts.status, 'PUBLISHED')).orderBy(desc(schema.posts.publishAt), desc(schema.posts.createdAt));
    return rows.map(toPost);
  } catch (e) {
    // table not created yet (db-setup not run) → behave like an empty blog
    console.error('[blog] load failed', (e as Error).message);
    return [];
  }
}, ['blog-posts', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'], revalidate: 300 });

/** Published posts whose publish time has passed, newest first. */
export async function getPosts(): Promise<BlogPost[]> {
  const now = Date.now();
  return (await loadPublished()).filter((p) => !p.publishAt || Date.parse(p.publishAt) <= now).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export async function getLatestPosts(limit = 3) {
  return (await getPosts()).slice(0, Math.max(0, limit));
}

/** A post by slug. With `preview` (valid admin session) drafts, scheduled and archived posts are returned too. */
export async function getPost(slug: string, preview = false): Promise<BlogPost | null> {
  if (preview) {
    const [r] = await db.select().from(schema.posts).where(eq(schema.posts.slug, slug)).limit(1).catch(() => []);
    return r ? toPost(r) : null;
  }
  return (await getPosts()).find((p) => p.slug === slug) || null;
}

/** Categories that have at least one visible post, by post count. */
export function blogCategories(posts: BlogPost[]) {
  const m = new Map<string, { name: string; slug: string; count: number }>();
  for (const p of posts) {
    if (!p.category || !p.categorySlug) continue;
    const c = m.get(p.categorySlug) || { name: p.category, slug: p.categorySlug, count: 0 };
    c.count++; m.set(p.categorySlug, c);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Related posts: same category first, then shared tags, then newest. */
export function relatedPosts(all: BlogPost[], post: BlogPost, n = 3) {
  const tags = new Set(post.tags.map((t) => t.toLowerCase()));
  return all.filter((p) => p.slug !== post.slug)
    .map((p) => ({ p, s: (p.categorySlug && p.categorySlug === post.categorySlug ? 3 : 0) + p.tags.filter((t) => tags.has(t.toLowerCase())).length }))
    .sort((a, b) => b.s - a.s || Date.parse(b.p.date) - Date.parse(a.p.date)).slice(0, n).map((x) => x.p);
}

export const postPath = (slug: string) => `/blog/${slug}`;
export const absUrl = (site: string, u: string) => (!u ? '' : /^https?:\/\//i.test(u) ? u : new URL(u, site.replace(/\/$/, '') + '/').toString());
export const fmtPostDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' });
