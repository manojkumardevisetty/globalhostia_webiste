// Blog data layer: one cached read of all PUBLISHED posts (tag `site`), filtered by publishAt per
// request so scheduled posts appear on time. Drafts are only read uncached, for admin previews.
import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from './db';
import { cachedRead, isDbError } from './lkg';
import { autoExcerpt, readingMinutes, markdownText } from './markdown-text';

export type BlogPost = {
  id: string; slug: string; title: string; excerpt: string; body: string; coverImage: string; coverAlt: string;
  category: string; categorySlug: string; tags: string[]; author: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; featured: boolean;
  seoTitle: string; seoDescription: string; ogImage: string; canonical: string;
  date: string; publishAt: string | null; updatedAt: string; readingMinutes: number;
  coverStyle: CoverStyle; takeaways: string[]; relatedProducts: string[];
  focusKeyword: string; keywords: string[]; tagLinks: { name: string; slug: string }[];
};
export type CoverStyle = 'branded' | 'plain' | 'hex';
export const COVER_STYLES: CoverStyle[] = ['branded', 'plain', 'hex'];

export const categorySlug = (name: string) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function toPost(r: typeof schema.posts.$inferSelect): BlogPost {
  const publishAt = r.publishAt ? new Date(r.publishAt).toISOString() : null;
  return {
    id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt.trim() || autoExcerpt(r.body), body: r.body,
    coverImage: r.coverImage, coverAlt: r.coverAlt, category: r.category.trim(), categorySlug: categorySlug(r.category), tags: (r.tags || []).filter((t) => typeof t === 'string' && t.trim()),
    author: r.author.trim(), status: r.status, featured: r.featured, seoTitle: r.seoTitle, seoDescription: r.seoDescription, ogImage: r.ogImage, canonical: r.canonical,
    date: publishAt || new Date(r.createdAt).toISOString(), publishAt, updatedAt: new Date(r.updatedAt).toISOString(), readingMinutes: readingMinutes(r.body),
    coverStyle: (COVER_STYLES as string[]).includes(r.coverStyle) ? (r.coverStyle as CoverStyle) : 'branded',
    takeaways: String(r.takeaways || '').split(/\r?\n/).map((t) => t.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 10),
    focusKeyword: r.focusKeyword.trim(),
    keywords: [...new Set([r.focusKeyword, ...r.secondaryKeywords.split(','), ...(r.tags || [])].map((k) => String(k || '').trim()).filter(Boolean))].slice(0, 20),
    tagLinks: (r.tags || []).filter((t) => typeof t === 'string' && t.trim()).map((t) => ({ name: t.trim(), slug: categorySlug(t) })).filter((t) => t.slug),
    relatedProducts: (r.relatedProducts || []).filter((x) => typeof x === 'string' && /^(cat|p):[a-z0-9-]+$/.test(x)),
  };
}

// cached 6h (tag `site`, admin saves revalidate it); snapshot-backed when the database is unavailable (lib/lkg.ts)
const loadPublished = cachedRead('blog-posts', async (): Promise<BlogPost[]> => {
  try {
    const rows = await db.select().from(schema.posts).where(eq(schema.posts.status, 'PUBLISHED')).orderBy(desc(schema.posts.publishAt), desc(schema.posts.createdAt));
    return rows.map(toPost);
  } catch (e) {
    if (isDbError(e)) throw e; // outage: last known good posts, never a cached empty blog
    // table not created yet (db-setup not run) → behave like an empty blog
    console.error('[blog] load failed', (e as Error).message);
    return [];
  }
}, { fallback: () => [] });

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

/** Tags with at least one visible post. */
export function blogTags(posts: BlogPost[]) {
  const m = new Map<string, { name: string; slug: string; count: number }>();
  for (const p of posts) for (const t of p.tagLinks) { const c = m.get(t.slug) || { ...t, count: 0 }; c.count++; m.set(t.slug, c); }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** FAQ items from a "## FAQ" (or "## Frequently asked questions") section with "### Question" headings. */
export function faqFromMarkdown(md: string): { q: string; a: string }[] {
  const m = String(md || '').match(/^##\s+(?:FAQ|FAQs|Frequently asked questions)\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im);
  if (!m) return [];
  return m[1].split(/^###\s+/m).slice(1).map((chunk) => {
    const [q, ...rest] = chunk.split('\n');
    return { q: q.trim(), a: markdownText(rest.join('\n')) };
  }).filter((x) => x.q && x.a).slice(0, 20);
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

/* ------------------------------------------------------------------ roadmap + trust points (settings) */
export type RoadmapStatus = 'planned' | 'in_progress' | 'launched';
export type RoadmapItem = { title: string; description: string; eta: string; status: RoadmapStatus };
export const ROADMAP_STATUS: RoadmapStatus[] = ['planned', 'in_progress', 'launched'];

/** settings.roadmap (array or JSON string) → valid items only; [] when unset. */
export function roadmapFrom(raw: unknown): RoadmapItem[] {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = []; } }
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x.title === 'string' && x.title.trim()).slice(0, 12).map((x) => ({
    title: String(x.title).trim(), description: String(x.description || '').trim(), eta: String(x.eta || '').trim(),
    status: (ROADMAP_STATUS as string[]).includes(x.status) ? x.status : 'planned',
  }));
}

export type TrustPoint = { title: string; text: string; icon?: string };
const DEFAULT_TRUST: TrustPoint[] = [
  { title: '24/7 support', text: 'Engineers on call by phone, email, WhatsApp and ticket, at any hour.', icon: 'headset' },
  { title: 'Automatic setup', text: 'Your service is set up automatically as soon as payment is confirmed.', icon: 'bolt' },
  { title: 'Global datacenters', text: 'Host close to your visitors in datacenters on several continents.', icon: 'globe' },
];
/** settings.trust_points (string[] or {title,text,icon}[] or JSON) → points; minimal default list otherwise. */
export function trustPointsFrom(raw: unknown): TrustPoint[] {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = String(v).split(/\r?\n/); } }
  if (!Array.isArray(v)) return DEFAULT_TRUST;
  const pts = v.map((x): TrustPoint | null => typeof x === 'string' ? (x.trim() ? { title: x.trim(), text: '' } : null)
    : x && typeof x === 'object' && (x.title || x.label) ? { title: String(x.title || x.label).trim(), text: String(x.text || x.description || '').trim(), icon: x.icon ? String(x.icon) : undefined } : null)
    .filter((x): x is TrustPoint => !!x).slice(0, 8);
  return pts.length ? pts : DEFAULT_TRUST;
}
