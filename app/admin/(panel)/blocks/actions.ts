'use server';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';

const COL: Record<string, 'headerBlock' | 'footerBlock' | 'bodyStartBlock' | 'bodyEndBlock' | 'headBlock'> = {
  header: 'headerBlock', footer: 'footerBlock', body_start: 'bodyStartBlock', body_end: 'bodyEndBlock', head: 'headBlock',
};
export const kindOf = async (key: string) => (key.startsWith('tp-') ? 'tp' : Object.keys(COL).sort((a, b) => b.length - a.length).find((k) => key === k || key.startsWith(k + '-')) || 'header');

export async function saveBlock(fd: FormData) {
  const s = await requireSession('content');
  const key = str(fd, 'key');
  const [old] = await db.select().from(schema.blocks).where(eq(schema.blocks.key, key));
  if (!old) fail('/admin/blocks', 'Block not found');
  await saveRevision(s, 'block', key, old);
  await db.update(schema.blocks).set({ name: str(fd, 'name') || old.name, html: String(fd.get('html') ?? ''), updatedAt: new Date() }).where(eq(schema.blocks.key, key));
  await audit(s, 'update', 'block', key);
  done(`/admin/blocks/${encodeURIComponent(key)}`, 'Block saved — updated on every page that uses it');
}

export async function duplicateBlock(fd: FormData) {
  const s = await requireSession('content');
  const key = str(fd, 'key');
  const [b] = await db.select().from(schema.blocks).where(eq(schema.blocks.key, key));
  if (!b) fail('/admin/blocks', 'Block not found');
  const kind = await kindOf(key);
  const nk = `${kind}-custom-${Date.now().toString(36)}`;
  await db.insert(schema.blocks).values({ key: nk, name: `${b.name} (copy)`, html: b.html });
  await audit(s, 'duplicate', 'block', nk, { from: key });
  done(`/admin/blocks/${encodeURIComponent(nk)}`, 'Copy created');
}

/** Consolidate: make every page use this block for its slot (e.g. one header site-wide). */
export async function assignToAll(fd: FormData) {
  const s = await requireSession('content');
  const key = str(fd, 'key');
  const col = COL[await kindOf(key)];
  if (!col) fail(`/admin/blocks/${encodeURIComponent(key)}`, 'This block is already shared by every page');
  await db.update(schema.pages).set({ [col]: key });
  await audit(s, 'assign_all', 'block', key);
  done(`/admin/blocks/${encodeURIComponent(key)}`, 'All pages now use this block');
}

export async function deleteBlock(fd: FormData) {
  const s = await requireSession('content');
  const key = str(fd, 'key');
  const col = COL[await kindOf(key)];
  if (!col || Object.keys(COL).includes(key)) fail(`/admin/blocks/${encodeURIComponent(key)}`, 'Default blocks cannot be deleted');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.pages).where(eq(schema.pages[col], key));
  if (n) fail(`/admin/blocks/${encodeURIComponent(key)}`, `Still used by ${n} page(s)`);
  await db.delete(schema.blocks).where(eq(schema.blocks.key, key));
  await audit(s, 'delete', 'block', key);
  done('/admin/blocks', 'Block deleted');
}
