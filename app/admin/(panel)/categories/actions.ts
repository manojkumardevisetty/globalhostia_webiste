'use server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool, int, slugify, isSlug } from '@/lib/admin';

export async function saveCategory(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const back = id ? `/admin/categories/${id}` : '/admin/categories/new';
  const name = str(fd, 'name');
  const slug = slugify(str(fd, 'slug') || name);
  if (!name) fail(back, 'Name is required');
  if (!isSlug(slug)) fail(back, 'Invalid slug');
  const dup = await db.select({ id: schema.categories.id }).from(schema.categories).where(and(eq(schema.categories.slug, slug), id ? ne(schema.categories.id, id) : undefined));
  if (dup.length) fail(back, `Slug "${slug}" already exists`);
  const parentId = str(fd, 'parentId') || null;
  if (parentId && parentId === id) fail(back, 'A category cannot be its own parent');
  const gid = str(fd, 'whmcsGroupId');
  const v = {
    name, slug, parentId, description: str(fd, 'description'), layout: str(fd, 'layout') || 'auto', cardTemplate: str(fd, 'cardTemplate') || 'plan-card',
    sortOrder: int(fd, 'sortOrder'), visible: bool(fd, 'visible'), whmcsGroupId: gid ? parseInt(gid, 10) : null,
    seoTitle: str(fd, 'seoTitle'), seoDescription: str(fd, 'seoDescription'), updatedAt: new Date(),
  };
  let cid = id;
  if (id) await db.update(schema.categories).set(v).where(eq(schema.categories.id, id));
  else cid = (await db.insert(schema.categories).values(v).returning({ id: schema.categories.id }))[0].id;
  await audit(s, id ? 'update' : 'create', 'category', cid, { name });
  done(`/admin/categories/${cid}`, 'Category saved');
}

export async function reorderCategories(fd: FormData) {
  const s = await requireSession('content');
  for (const [k, v] of fd.entries()) if (k.startsWith('order_')) await db.update(schema.categories).set({ sortOrder: parseInt(String(v), 10) || 0 }).where(eq(schema.categories.id, k.slice(6)));
  await audit(s, 'reorder', 'category');
  done('/admin/categories', 'Order saved');
}

export async function deleteCategory(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.categoryId, id));
  if (n > 0) fail(`/admin/categories/${id}`, `Move or remove its ${n} product(s) first`);
  await db.update(schema.categories).set({ parentId: null }).where(eq(schema.categories.parentId, id));
  await db.delete(schema.categories).where(eq(schema.categories.id, id));
  await audit(s, 'delete', 'category', id);
  done('/admin/categories', 'Category deleted');
}

/** Create a ready-made landing page for a category (hero + dynamic products + FAQ) — no code needed. */
export async function createCategoryPage(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const [c] = await db.select().from(schema.categories).where(eq(schema.categories.id, id));
  if (!c) fail('/admin/categories', 'Category not found');
  const slug = slugify(c.slug);
  const exists = await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.slug, slug));
  if (exists.length) fail(`/admin/categories/${id}`, `A page /${slug} already exists`);
  const [p] = await db.insert(schema.pages).values({ slug, title: c.name, seoTitle: c.seoTitle || `${c.name} | GlobalHostia`, seoDescription: c.seoDescription || c.description, status: 'DRAFT', headerBlock: 'header-web-hosting', footerBlock: 'footer' }).returning();
  const hero = `<div class="hero-area-coodiv mini-hero-text position-relative pt-25 pb-15 bg-default-4"><div class="container"><div class="row justify-content-center"><div class="col-xl-8 col-lg-10 text-center pt-15">
  <h1 class="coodiv-text-2 font-weight-bold mb-6">${c.name.replace(/</g, '&lt;')}</h1><p class="coodiv-text-8 mb-0">${(c.description || '').replace(/</g, '&lt;')}</p></div></div></div></div>`;
  await db.insert(schema.sections).values([
    { pageId: p.id, type: 'html', name: 'hero', sortOrder: 0, html: hero },
    { pageId: p.id, type: 'products', name: `Products: ${c.slug}`, sortOrder: 1, data: { categories: [c.slug], layout: 'auto', template: c.cardTemplate, title: 'Choose your plan', wrapperClass: 'pt-13 pb-13' } },
    { pageId: p.id, type: 'faq', name: 'FAQ', sortOrder: 2, data: { title: 'Frequently asked questions', items: [{ q: 'Can I upgrade later?', a: 'Yes — upgrade any time from your client area.' }] } },
  ]);
  await audit(s, 'create_landing_page', 'page', p.id, { category: c.slug });
  done(`/admin/pages/${p.id}`, 'Landing page created as draft — review and publish');
}
