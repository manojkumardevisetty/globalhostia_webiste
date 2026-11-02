'use server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bust } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { VERIFICATION_KEYS, verificationToken, siteUrl, sitemapUrls, submitIndexNow } from '@/lib/seo';

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

export async function saveSearchEngines(fd: FormData) {
  const s = await requireSession('content');
  for (const { key } of VERIFICATION_KEYS) await setSetting(key, verificationToken(str(fd, key)));
  const links = str(fd, 'social_links').split(/[\r\n,]+/).map((x) => x.trim()).filter(Boolean);
  const bad = links.find((l) => !/^https:\/\/[^\s"<>]+$/.test(l));
  if (bad) fail('/admin/seo', `Profile links must start with https:// (${bad})`);
  await setSetting('social_links', links);
  await audit(s, 'update', 'settings', null, { seo: 'search_engines' });
  done('/admin/seo', 'Search engine settings saved');
}

export async function notifySearchEngines() {
  const s = await requireSession('content');
  const site = siteUrl(await getSettings());
  const urls = await sitemapUrls(site);
  const r = await submitIndexNow(site, urls);
  await setSetting('indexnow_last', { at: new Date().toISOString(), ...r });
  await audit(s, 'indexnow', 'seo', null, r);
  if (!r.ok) { bust(); fail('/admin/seo', `IndexNow: ${r.message}`); }
  done('/admin/seo', `Sent ${r.submitted} URLs to IndexNow (Bing, Yandex, Seznam, Naver…): ${r.message}`);
}
