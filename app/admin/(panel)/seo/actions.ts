'use server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';

export async function saveRedirect(fd: FormData) {
  const s = await requireSession('content');
  let from = str(fd, 'from'); const to = str(fd, 'to'); const code = str(fd, 'code') === '302' ? 302 : 301;
  if (!from.startsWith('/')) from = '/' + from;
  if (from.startsWith('/admin') || from.startsWith('/api')) fail('/admin/seo', 'Cannot redirect admin/api URLs');
  if (!/^(\/|https:\/\/)/.test(to)) fail('/admin/seo', 'Target must start with / or https://');
  if (from === to) fail('/admin/seo', 'Source and target are the same');
  await db.insert(schema.redirects).values({ from: from.toLowerCase(), to, code }).onConflictDoUpdate({ target: schema.redirects.from, set: { to, code } });
  await audit(s, 'save', 'redirect', null, { from, to, code });
  done('/admin/seo', 'Redirect saved');
}

export async function deleteRedirect(fd: FormData) {
  const s = await requireSession('content');
  await db.delete(schema.redirects).where(eq(schema.redirects.id, str(fd, 'id')));
  await audit(s, 'delete', 'redirect', str(fd, 'id'));
  done('/admin/seo', 'Redirect deleted');
}

export async function bulkSeo(fd: FormData) {
  const s = await requireSession('content');
  const ids = fd.getAll('ids').map(String);
  for (const id of ids) await db.update(schema.pages).set({ seoTitle: str(fd, `t_${id}`), seoDescription: str(fd, `d_${id}`) }).where(eq(schema.pages.id, id));
  await audit(s, 'bulk_update', 'seo', null, { pages: ids.length });
  done('/admin/seo', 'SEO metadata saved');
}
