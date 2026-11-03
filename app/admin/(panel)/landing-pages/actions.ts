'use server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { normLanding, validateLanding, LP_SLUG } from '@/lib/landing';
import { getCatalog } from '@/lib/theme/data';

const LIST = '/admin/landing-pages';

export async function createLanding(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!LP_SLUG.test(slug)) fail(LIST, 'Address: lowercase letters, numbers and dashes only');
  const [exists] = await db.select({ id: schema.landingPages.id }).from(schema.landingPages).where(eq(schema.landingPages.slug, slug));
  if (exists) fail(LIST, `/lp/${slug} already exists`);
  const cat = await getCatalog();
  const first = cat.categories.find((c) => cat.products.some((p) => p.categorySlug === c.slug));
  const [row] = await db.insert(schema.landingPages).values({
    slug, name: str(fd, 'name').slice(0, 120) || slug, headline: str(fd, 'name').slice(0, 110) || 'Your headline', target: first ? `cat:${first.slug}` : '',
    ctaLabel: 'Order now', benefits: [], faq: [], status: 'DRAFT',
  }).returning({ id: schema.landingPages.id });
  await audit(s, 'create', 'landing_page', row.id, { slug });
  done(`${LIST}/${row.id}`, 'Draft created. Fill it in, preview it and publish when ready.');
}

export async function saveLanding(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const to = `${LIST}/${encodeURIComponent(id)}`;
  const [cur] = await db.select().from(schema.landingPages).where(eq(schema.landingPages.id, id));
  if (!cur) fail(LIST, 'Landing page not found');
  const next = normLanding({
    slug: str(fd, 'slug'), name: str(fd, 'name'), headline: str(fd, 'headline'), subheadline: str(fd, 'subheadline'),
    target: str(fd, 'target'), productSlug: str(fd, 'productSlug'), benefits: String(fd.get('benefits') ?? ''), faq: String(fd.get('faq') ?? ''),
    ctaLabel: str(fd, 'ctaLabel'), showLeadForm: bool(fd, 'showLeadForm'), showTrust: bool(fd, 'showTrust'), noindex: bool(fd, 'noindex'),
    status: str(fd, 'publish') === '1' ? 'PUBLISHED' : str(fd, 'publish') === '0' ? 'DRAFT' : cur.status,
    seoTitle: str(fd, 'seoTitle'), seoDescription: str(fd, 'seoDescription'),
  });
  const errors = validateLanding(next);
  if (next.productSlug && next.target.startsWith('cat:')) {
    const cat = await getCatalog();
    const p = cat.products.find((x) => x.slug === next.productSlug);
    if (!p || p.categorySlug !== next.target.slice(4)) errors.push('The pinned plan is not a published plan of the chosen category (leave it on "cheapest automatically")');
  }
  if (next.slug !== cur.slug) {
    const [clash] = await db.select({ id: schema.landingPages.id }).from(schema.landingPages).where(eq(schema.landingPages.slug, next.slug));
    if (clash) errors.push(`/lp/${next.slug} is already used by another landing page`);
  }
  if (errors.length) fail(to, errors.join(' · '));
  await saveRevision(s, 'landing_page', id, cur);
  await db.update(schema.landingPages).set({ ...next, updatedAt: new Date() }).where(eq(schema.landingPages.id, id));
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify((cur as any)[k]) !== JSON.stringify(next[k]));
  await audit(s, cur.status !== next.status ? (next.status === 'PUBLISHED' ? 'publish' : 'unpublish') : 'update', 'landing_page', id, { slug: next.slug, changed });
  done(to, next.status === 'PUBLISHED' ? (cur.status === 'PUBLISHED' ? 'Saved. Live within a minute.' : `Published at /lp/${next.slug}`) : cur.status === 'PUBLISHED' ? 'Unpublished: the page now shows "offer no longer available"' : 'Draft saved');
}

export async function deleteLanding(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const [cur] = await db.select().from(schema.landingPages).where(eq(schema.landingPages.id, id));
  if (!cur) fail(LIST, 'Landing page not found');
  await saveRevision(s, 'landing_page', id, cur);
  await db.delete(schema.landingPages).where(eq(schema.landingPages.id, id));
  await audit(s, 'delete', 'landing_page', id, { slug: cur.slug });
  done(LIST, `Deleted /lp/${cur.slug}`);
}

/** Button-specific actions (formAction): React does not always send the clicked button's value. */
export async function publishLanding(fd: FormData) { fd.set('publish', '1'); return saveLanding(fd); }
export async function unpublishLanding(fd: FormData) { fd.set('publish', '0'); return saveLanding(fd); }
