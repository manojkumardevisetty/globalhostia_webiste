'use server';
import { and, eq, ne, asc, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail, bust, str, bool, int, slugify, isSlug } from '@/lib/admin';

const STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

export async function createPage(fd: FormData) {
  const s = await requireSession('content');
  const title = str(fd, 'title');
  const slug = slugify(str(fd, 'slug') || title);
  if (!title) fail('/admin/pages', 'Title is required');
  if (!isSlug(slug) || slug.startsWith('admin') || slug.startsWith('api')) fail('/admin/pages', 'Invalid or reserved URL');
  if ((await db.select({ id: schema.pages.id }).from(schema.pages).where(eq(schema.pages.slug, slug))).length) fail('/admin/pages', `/${slug} already exists`);
  const from = str(fd, 'copyFrom');
  let tpl: typeof schema.pages.$inferSelect | undefined;
  if (from) [tpl] = await db.select().from(schema.pages).where(eq(schema.pages.id, from));
  const { id: _i, createdAt: _c, updatedAt: _u, ...base } = tpl || ({} as any);
  const [p] = await db.insert(schema.pages).values({ ...(tpl ? base : {}), slug, title, seoTitle: title, status: 'DRAFT' }).returning();
  if (tpl) {
    const secs = await db.select().from(schema.sections).where(eq(schema.sections.pageId, tpl.id));
    if (secs.length) await db.insert(schema.sections).values(secs.map(({ id, pageId, ...x }) => ({ ...x, pageId: p.id })));
  }
  await audit(s, 'create', 'page', p.id, { slug });
  done(`/admin/pages/${p.id}`, 'Page created as draft');
}

export async function savePage(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const back = `/admin/pages/${id}`;
  const slug = slugify(str(fd, 'slug'));
  if (!isSlug(slug)) fail(back, 'Invalid URL slug');
  if ((await db.select({ id: schema.pages.id }).from(schema.pages).where(and(eq(schema.pages.slug, slug), ne(schema.pages.id, id)))).length) fail(back, `/${slug} is used by another page`);
  const [old] = await db.select().from(schema.pages).where(eq(schema.pages.id, id));
  if (!old) fail('/admin/pages', 'Page not found');
  const status = STATUS.includes(str(fd, 'status') as any) ? (str(fd, 'status') as (typeof STATUS)[number]) : 'DRAFT';
  const publishAt = str(fd, 'publishAt');
  await saveRevision(s, 'page', id, old);
  await db.update(schema.pages).set({
    slug, title: str(fd, 'title'), seoTitle: str(fd, 'seoTitle'), seoDescription: str(fd, 'seoDescription'), seoKeywords: str(fd, 'seoKeywords'),
    ogImage: str(fd, 'ogImage'), status, publishAt: publishAt ? new Date(publishAt) : null, inSitemap: bool(fd, 'inSitemap'),
    headerBlock: str(fd, 'headerBlock'), footerBlock: str(fd, 'footerBlock'), bodyStartBlock: str(fd, 'bodyStartBlock'), bodyEndBlock: str(fd, 'bodyEndBlock'),
    headBlock: str(fd, 'headBlock') || 'head', bodyClass: str(fd, 'bodyClass'), wrapperClass: str(fd, 'wrapperClass') || 'site-wrapper overflow-hidden',
    headExtra: str(fd, 'headExtra'), updatedAt: new Date(),
  }).where(eq(schema.pages.id, id));
  // keep old URL working
  if (old.slug !== slug && old.slug !== 'index') {
    await db.insert(schema.redirects).values({ from: `/${old.slug}`, to: `/${slug}`, code: 301 }).onConflictDoUpdate({ target: schema.redirects.from, set: { to: `/${slug}` } });
  }
  await audit(s, 'update', 'page', id, { slug, status });
  done(back, old.slug !== slug ? `Saved. Redirect /${old.slug} → /${slug} added.` : 'Page saved');
}

export async function deletePage(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const [p] = await db.select().from(schema.pages).where(eq(schema.pages.id, id));
  if (p?.slug === 'index') fail(`/admin/pages/${id}`, 'The homepage cannot be deleted');
  await db.delete(schema.pages).where(eq(schema.pages.id, id));
  await audit(s, 'delete', 'page', id, { slug: p?.slug });
  done('/admin/pages', 'Page deleted');
}

const DEFAULT_DATA: Record<string, object> = {
  products: { categories: [], layout: 'auto', template: 'plan-card', title: 'Choose your plan', subtitle: '', wrapperClass: 'pt-13 pb-13' },
  domain_search: { title: 'Find your perfect domain', placeholder: 'Find your perfect domain name…', button: 'Search', wrapperClass: 'pt-13 pb-6' },
  domain_results: { wrapperClass: 'pb-15' },
  tld_pricing: { title: 'Domain pricing', limit: 60, wrapperClass: 'pt-10 pb-15' },
  faq: { title: 'Frequently asked questions', items: [{ q: 'Question?', a: 'Answer.' }], wrapperClass: 'pt-13 pb-13' },
};
const DEFAULT_HTML = `<div class="pt-13 pb-13"><div class="container"><div class="row justify-content-center"><div class="col-lg-8 text-center">
  <h2 class="coodiv-text-4 font-weight-bold mb-5">New section</h2>
  <p class="coodiv-text-9">Edit this HTML. Tokens like {{site_name}}, {{phone}}, {{cart_url}} are replaced automatically.</p>
</div></div></div></div>`;

export async function addSection(fd: FormData) {
  const s = await requireSession('content');
  const pageId = str(fd, 'pageId');
  const type = str(fd, 'type');
  const copy = str(fd, 'copySection');
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(sort_order), -1)::int` }).from(schema.sections).where(eq(schema.sections.pageId, pageId));
  let row: any;
  if (copy) {
    const [src] = await db.select().from(schema.sections).where(eq(schema.sections.id, copy));
    if (!src) fail(`/admin/pages/${pageId}`, 'Section to copy not found');
    const { id: _id, pageId: _p, ...rest } = src;
    row = { ...rest, pageId, sortOrder: m + 1, name: `${src.name} (copy)` };
  } else {
    if (!['html', ...Object.keys(DEFAULT_DATA)].includes(type)) fail(`/admin/pages/${pageId}`, 'Unknown section type');
    row = { pageId, type, name: str(fd, 'name') || type.replace('_', ' '), sortOrder: m + 1, html: type === 'html' ? DEFAULT_HTML : '', data: DEFAULT_DATA[type] || {} };
  }
  const [sec] = await db.insert(schema.sections).values(row).returning();
  await audit(s, 'add_section', 'page', pageId, { type: sec.type });
  done(`/admin/pages/${pageId}/sections/${sec.id}`, 'Section added');
}

export async function saveSection(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id');
  const [old] = await db.select().from(schema.sections).where(eq(schema.sections.id, id));
  if (!old) fail('/admin/pages', 'Section not found');
  const back = `/admin/pages/${old.pageId}/sections/${id}`;
  let data: Record<string, any> = old.data;
  if (old.type === 'products') {
    data = { ...old.data, categories: fd.getAll('categories').map(String).filter(Boolean), layout: str(fd, 'layout') || 'auto', template: str(fd, 'template') || 'plan-card',
      title: str(fd, 'title'), subtitle: str(fd, 'subtitle'), wrapperClass: str(fd, 'wrapperClass'), fallbackHtml: String(fd.get('fallbackHtml') ?? '') };
  } else if (old.type === 'faq') {
    const items: { q: string; a: string }[] = [];
    let cur: { q: string; a: string } | null = null;
    for (const line of String(fd.get('items') || '').split(/\r?\n/)) {
      const m = line.match(/^\s*(Q|A)\s*:\s*(.*)$/i);
      if (m && m[1].toUpperCase() === 'Q') { cur = { q: m[2].trim(), a: '' }; items.push(cur); }
      else if (m && cur) cur.a = m[2].trim();
      else if (cur && line.trim()) cur.a += (cur.a ? ' ' : '') + line.trim();
    }
    data = { ...old.data, title: str(fd, 'title'), wrapperClass: str(fd, 'wrapperClass'), items };
  } else if (old.type !== 'html') {
    data = { ...old.data };
    for (const k of ['title', 'placeholder', 'button', 'action', 'wrapperClass']) if (fd.has(k)) data[k] = str(fd, k);
    if (fd.has('limit')) data.limit = int(fd, 'limit', 60);
  }
  await saveRevision(s, 'section', id, old);
  await db.update(schema.sections).set({ name: str(fd, 'name') || old.name, visible: bool(fd, 'visible'), html: old.type === 'html' ? String(fd.get('html') ?? '') : old.html, data }).where(eq(schema.sections.id, id));
  await db.update(schema.pages).set({ updatedAt: new Date() }).where(eq(schema.pages.id, old.pageId));
  await audit(s, 'update_section', 'page', old.pageId, { section: id });
  done(back, 'Section saved — live now');
}

export async function sectionOp(fd: FormData) {
  const s = await requireSession('content');
  const id = str(fd, 'id'), op = str(fd, 'op');
  const [sec] = await db.select().from(schema.sections).where(eq(schema.sections.id, id));
  if (!sec) fail('/admin/pages', 'Section not found');
  const back = `/admin/pages/${sec.pageId}`;
  if (op === 'toggle') await db.update(schema.sections).set({ visible: !sec.visible }).where(eq(schema.sections.id, id));
  else if (op === 'delete') { await saveRevision(s, 'section', id, sec); await db.delete(schema.sections).where(eq(schema.sections.id, id)); }
  else if (op === 'duplicate') {
    const { id: _id, ...rest } = sec;
    await db.update(schema.sections).set({ sortOrder: sql`sort_order + 1` }).where(and(eq(schema.sections.pageId, sec.pageId), sql`sort_order > ${sec.sortOrder}`));
    await db.insert(schema.sections).values({ ...rest, sortOrder: sec.sortOrder + 1, name: `${sec.name} (copy)` });
  } else if (op === 'up' || op === 'down') {
    const all = await db.select({ id: schema.sections.id }).from(schema.sections).where(eq(schema.sections.pageId, sec.pageId)).orderBy(asc(schema.sections.sortOrder));
    const ids = all.map((x) => x.id); const i = ids.indexOf(id), j = op === 'up' ? i - 1 : i + 1;
    if (j >= 0 && j < ids.length) { [ids[i], ids[j]] = [ids[j], ids[i]]; await writeOrder(ids); }
  }
  await audit(s, `section_${op}`, 'page', sec.pageId, { section: id });
  done(back, 'Updated');
}

async function writeOrder(ids: string[]) {
  for (let i = 0; i < ids.length; i++) await db.update(schema.sections).set({ sortOrder: i }).where(eq(schema.sections.id, ids[i]));
}

/** Called from the drag-and-drop list. */
export async function reorderSections(pageId: string, ids: string[]) {
  const s = await requireSession('content');
  const own = await db.select({ id: schema.sections.id }).from(schema.sections).where(and(eq(schema.sections.pageId, pageId), inArray(schema.sections.id, ids)));
  if (own.length !== ids.length) throw new Error('Section list mismatch — reload the page');
  await writeOrder(ids);
  await audit(s, 'reorder_sections', 'page', pageId);
  bust();
  return { ok: true };
}

export async function restoreRevision(fd: FormData) {
  const s = await requireSession('content');
  const [r] = await db.select().from(schema.revisions).where(eq(schema.revisions.id, str(fd, 'rev')));
  if (!r || r.entity !== 'section') fail('/admin/pages', 'Revision not found');
  const d = r.data as any;
  const [cur] = await db.select().from(schema.sections).where(eq(schema.sections.id, r.entityId));
  if (!cur) fail('/admin/pages', 'Section no longer exists');
  await saveRevision(s, 'section', cur.id, cur);
  await db.update(schema.sections).set({ html: d.html ?? cur.html, data: d.data ?? cur.data, name: d.name ?? cur.name }).where(eq(schema.sections.id, cur.id));
  await audit(s, 'restore_revision', 'page', cur.pageId, { section: cur.id, rev: r.id });
  done(`/admin/pages/${cur.pageId}/sections/${cur.id}`, 'Revision restored');
}
