import 'server-only';
import { and, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { LEAD_STATUSES } from '@/lib/leads';

export type LeadFilter = { q: string; status: string; source: string; utm: string; medium: string; campaign: string; days: string };
export const DAYS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']] as const;

export function readFilter(sp: Record<string, string | undefined>): LeadFilter {
  return {
    q: String(sp.q || '').trim().slice(0, 100), status: (LEAD_STATUSES as readonly string[]).includes(sp.status || '') ? sp.status! : '',
    source: String(sp.source || '').slice(0, 80), utm: String(sp.utm || '').slice(0, 120), medium: String(sp.medium || '').slice(0, 120), campaign: String(sp.campaign || '').slice(0, 120),
    days: DAYS.some(([d]) => d === sp.days) ? sp.days! : '30',
  };
}

const L = schema.leads;
/** Date range only (used for the source / UTM counts). */
export function rangeWhere(f: LeadFilter): SQL | undefined {
  return f.days === 'all' ? undefined : gte(L.createdAt, new Date(Date.now() - Number(f.days) * 864e5));
}
export function leadWhere(f: LeadFilter): SQL | undefined {
  const c: (SQL | undefined)[] = [rangeWhere(f)];
  if (f.q) { const like = `%${f.q.replace(/[%_\\]/g, '\\$&')}%`; c.push(or(ilike(L.email, like), ilike(L.name, like), ilike(L.phone, like), ilike(L.interest, like), ilike(L.notes, like))); }
  if (f.status) c.push(eq(L.status, f.status));
  if (f.source) c.push(f.source === 'landing:*' ? sql`${L.source} like 'landing:%'` : f.source === 'quote:*' ? sql`${L.source} like 'quote:%'` : eq(L.source, f.source));
  if (f.utm) c.push(f.utm === '(none)' ? eq(L.utmSource, '') : eq(L.utmSource, f.utm));
  if (f.medium) c.push(f.medium === '(none)' ? eq(L.utmMedium, '') : eq(L.utmMedium, f.medium));
  if (f.campaign) c.push(f.campaign === '(none)' ? eq(L.utmCampaign, '') : eq(L.utmCampaign, f.campaign));
  const list = c.filter(Boolean) as SQL[];
  return list.length ? and(...list) : undefined;
}

export async function listLeads(f: LeadFilter, limit: number, offset = 0) {
  return db.select().from(L).where(leadWhere(f)).orderBy(desc(L.createdAt)).limit(limit).offset(offset);
}
export async function countLeads(f: LeadFilter) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(L).where(leadWhere(f));
  return n;
}
/** Counts grouped by a column within the date range. */
export async function countBy(f: LeadFilter, col: 'source' | 'utm_source' | 'utm_medium' | 'utm_campaign' | 'status') {
  const column = { source: L.source, utm_source: L.utmSource, utm_medium: L.utmMedium, utm_campaign: L.utmCampaign, status: L.status }[col];
  return db.select({ k: column, n: sql<number>`count(*)::int` }).from(L).where(rangeWhere(f)).groupBy(column).orderBy(sql`2 desc`).limit(12);
}

export const filterQs = (f: LeadFilter, patch: Partial<LeadFilter & { p: string }> = {}) => {
  const o = { ...f, ...patch } as Record<string, string>;
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v && !(k === 'days' && v === '30')) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '?';
};
