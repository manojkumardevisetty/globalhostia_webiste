import 'server-only';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';

/** Invalidate the public site cache so admin changes appear immediately. */
export const bust = () => revalidateTag('site');

export function done(path: string, msg: string): never {
  bust();
  redirect(`${path}${path.includes('?') ? '&' : '?'}ok=${encodeURIComponent(msg)}`);
}
export function fail(path: string, msg: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}err=${encodeURIComponent(msg)}`);
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
export const bool = (fd: FormData, k: string) => fd.get(k) === 'on' || fd.get(k) === 'true';
export const int = (fd: FormData, k: string, d = 0) => { const n = parseInt(str(fd, k), 10); return Number.isFinite(n) ? n : d; };
export const slugify = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9/]+/g, '-').replace(/^-+|-+$/g, '').replace(/\/+/g, '/').slice(0, 80);
export const isSlug = (s: string) => /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(s);
export const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
export function kv(s: string): Record<string, string> {
  return Object.fromEntries(lines(s).map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : [l, '']; }).filter(([k]) => k));
}
export const toKv = (o: Record<string, string>) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
