'use server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, str, int } from '@/lib/admin';
import { setSetting } from '@/lib/settings';

export async function saveTlds(fd: FormData) {
  const s = await requireSession('content');
  const ids = fd.getAll('ids').map(String);
  for (const id of ids) {
    await db.update(schema.tlds).set({ visible: fd.get(`visible_${id}`) === 'on', featured: fd.get(`featured_${id}`) === 'on', promo: str(fd, `promo_${id}`), sortOrder: int(fd, `sort_${id}`, 100) }).where(eq(schema.tlds.id, id));
  }
  await audit(s, 'update', 'tlds', null, { count: ids.length });
  done('/admin/domains', 'TLD settings saved');
}

export async function saveDomainSettings(fd: FormData) {
  const s = await requireSession('content');
  const list = str(fd, 'domain_suggest_tlds').split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean).map((t) => (t.startsWith('.') ? t : '.' + t));
  await setSetting('domain_suggest_tlds', [...new Set(list)].slice(0, 12));
  await audit(s, 'update', 'settings', 'domain_suggest_tlds');
  done('/admin/domains', 'Saved');
}
