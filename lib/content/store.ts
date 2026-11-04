// SEO content engine: settings, idea rows and the site inventory the engine works from (server only).
// The inventory is built from the live catalog (lib/agents/catalog.ts: real categories and prices), the sitemap
// (every URL that answers 200) and the blog, so drafts can only link to pages that exist.
import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { setSetting } from '../settings';
import { agentData } from '../agents/catalog';
import { sitemapEntries } from '../sitemap';
import { LEARN_PAGES, learnPath } from '../theme/learn';
import { ROUTES } from '../theme/routes';
import { normalizeContent, type ContentSettings, type Track, type Existing } from './core';
import type { LinkTarget, TargetOption } from './prompts';

export const CONTENT_KEY = 'content_engine';

export async function contentSettings(): Promise<ContentSettings> {
  try {
    const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, CONTENT_KEY));
    return normalizeContent(r?.value ?? null);
  } catch { return normalizeContent(null); }
}
export const saveContentSettings = (v: ContentSettings) => setSetting(CONTENT_KEY, v);

const noTable = (e: any) => String(e?.code || e?.cause?.code || '') === '42P01' || /relation "content_ideas"/.test(String(e?.message || e?.cause?.message || ''));
/** false until db-setup patch '031-content-engine' has run. */
export async function engineReady(): Promise<boolean> {
  try { await db.execute(sql`select 1 from content_ideas limit 1`); return true; } catch (e) { if (noTable(e)) return false; throw e; }
}

export type Idea = typeof schema.contentIdeas.$inferSelect;
export async function getIdea(id: string): Promise<Idea | null> {
  const [r] = await db.select().from(schema.contentIdeas).where(eq(schema.contentIdeas.id, id)).limit(1);
  return r || null;
}
export async function listIdeas(o: { track?: string; states?: string[]; limit?: number } = {}): Promise<Idea[]> {
  const I = schema.contentIdeas;
  return db.select().from(I).where(and(o.track ? eq(I.track, o.track) : undefined, o.states?.length ? inArray(I.state, o.states) : undefined))
    .orderBy(desc(I.priority), desc(I.createdAt)).limit(o.limit || 500);
}
export async function updateIdea(id: string, patch: Partial<typeof schema.contentIdeas.$inferInsert>) {
  await db.update(schema.contentIdeas).set({ ...patch, updatedAt: new Date() }).where(eq(schema.contentIdeas.id, id));
}
export async function addCost(id: string, usd: number) {
  if (usd > 0) await db.update(schema.contentIdeas).set({ costUsd: sql`${schema.contentIdeas.costUsd} + ${usd.toFixed(6)}::numeric` }).where(eq(schema.contentIdeas.id, id));
}
/** Content-engine AI spend this month (ai_usage rows with surface 'content'). */
export async function contentSpend(): Promise<{ month: number; articles: number; avg: number | null }> {
  try {
    const [r] = await db.execute(sql`select coalesce(sum(cost_usd), 0)::float as month from ai_usage where surface = 'content' and created_at >= date_trunc('month', now())`) as any[];
    const [a] = await db.execute(sql`select count(*)::int as n, coalesce(avg(cost_usd), 0)::float as avg from content_ideas where post_id is not null and cost_usd > 0`) as any[];
    return { month: Number(r?.month || 0), articles: Number(a?.n || 0), avg: Number(a?.n || 0) ? Math.round(Number(a.avg) * 1000) / 1000 : null };
  } catch { return { month: 0, articles: 0, avg: null }; }
}

/* ------------------------------------------------------------------ inventory */
export type Inventory = {
  site: string;
  knownPaths: Set<string>;
  targets: TargetOption[];
  links: LinkTarget[];
  existing: Existing[];
  catalogPrices: number[];
  /** category slug → products live (for the post's plan block) */
  liveCategories: Set<string>;
};

const KEY_PAGES: [string, string][] = [
  ['/web-hosting', 'Web hosting plans'], ['/wordpress-hosting', 'WordPress hosting'], ['/vps-hosting', 'VPS hosting'], ['/dedicated-servers', 'Dedicated servers'],
  ['/domains-registration', 'Domain search and registration'], ['/ae-domains', '.ae domains for UAE businesses'], ['/ssl-certificate', 'SSL certificates'],
  ['/google-workspace', 'Business email and Google Workspace'], ['/free-migration', 'Free website migration'], ['/plan-finder', 'Plan finder'],
  ['/web-hosting-dubai', 'Web hosting in Dubai'], ['/vps-uae', 'VPS hosting UAE'], ['/best-hosting-uae', 'How to choose web hosting in the UAE'],
  ['/data-centers', 'Data centers and network latency test'], ['/cpanel-reseller', 'cPanel reseller hosting'], ['/business-services', 'Business services'],
  ['/contact', 'Contact sales and support'], ['/help-center', 'Help center'], ['/domain-broker', 'Domain broker service'], ['/compare', 'Hosting comparisons'], ['/guides', 'Hosting guides'],
];
const pathOf = (loc: string) => { try { const p = new URL(loc).pathname; return p.length > 1 ? p.replace(/\/+$/, '') : '/'; } catch { return loc; } };

let memo: { at: number; v: Inventory } | null = null;
export async function inventory(fresh = false): Promise<Inventory> {
  if (!fresh && memo && Date.now() - memo.at < 60_000) return memo.v;
  const [d, entries, posts] = await Promise.all([
    agentData(),
    sitemapEntries().catch(() => []),
    db.select({ slug: schema.posts.slug, title: schema.posts.title, status: schema.posts.status, publishAt: schema.posts.publishAt, lang: schema.posts.lang }).from(schema.posts).catch(() => []),
  ]);
  const knownPaths = new Set<string>(entries.map((e) => pathOf(e.loc)));
  for (const p of ['/', '/blog', '/contact', '/help-center']) knownPaths.add(p);
  const now = Date.now();
  const livePosts = posts.filter((p) => p.status === 'PUBLISHED' && (!p.publishAt || new Date(p.publishAt).getTime() <= now));
  for (const p of livePosts) knownPaths.add(`/blog/${p.slug}`);

  const targets: TargetOption[] = [];
  const seen = new Set<string>();
  for (const c of d.categories) {
    if (!c.url) continue;
    const path = pathOf(c.url);
    if (!knownPaths.has(path) || seen.has(`cat:${c.slug}`)) continue;
    seen.add(`cat:${c.slug}`);
    targets.push({ ref: `cat:${c.slug}`, label: c.name, path });
  }
  for (const s of d.services || []) {
    const path = pathOf(s.url);
    if (seen.has(`cat:${s.slug}`) || !knownPaths.has(path)) continue;
    seen.add(`cat:${s.slug}`);
    targets.push({ ref: `cat:${s.slug}`, label: `${s.name} (business service)`, path });
  }
  for (const [path, label] of KEY_PAGES) if (knownPaths.has(path) && !targets.some((t) => t.path === path)) targets.push({ ref: path, label, path });

  const links: LinkTarget[] = [
    ...targets.map((t) => ({ path: t.path, title: t.label, kind: (t.ref.startsWith('cat:') ? 'category' : 'page') as LinkTarget['kind'] })),
    ...LEARN_PAGES.map((p) => ({ path: learnPath(p), title: p.title, kind: 'guide' as const })).filter((l) => knownPaths.has(l.path)),
    ...livePosts.filter((p) => p.lang !== 'ar').slice(0, 40).map((p) => ({ path: `/blog/${p.slug}`, title: p.title, kind: 'post' as const })),
  ].filter((l, i, a) => a.findIndex((x) => x.path === l.path) === i).slice(0, 120);

  const existing: Existing[] = [
    ...posts.filter((p) => p.lang !== 'ar').map((p) => ({ path: `/blog/${p.slug}`, title: p.title, slug: p.slug })),
    ...LEARN_PAGES.map((p) => ({ path: learnPath(p), title: p.title, slug: p.slug })),
    ...Object.entries(ROUTES).filter(([, r]) => ['uae', 'aedomains', 'migration', 'planfinder', 'datacenters', 'broker'].includes(r.kind)).map(([slug, r]) => ({ path: `/${slug}`, title: r.title, slug })),
  ];
  const catalogPrices = [...new Set([
    ...d.products.flatMap((p) => p.prices.flatMap((x) => [x.price, ...(x.perMonth ? [x.perMonth] : [])])),
    ...d.cat.tlds.flatMap((t) => [t.register, t.transfer, t.renew].filter((x): x is number => typeof x === 'number')),
  ])];
  const liveCategories = new Set(d.categories.filter((c) => c.productCount > 0).map((c) => c.slug));
  const v: Inventory = { site: d.site, knownPaths, targets, links, existing, catalogPrices, liveCategories };
  memo = { at: Date.now(), v };
  return v;
}

export const resolveTarget = (inv: Inventory, ref: string) => inv.targets.find((t) => t.ref === ref || t.path === ref) || null;

/** Blog category for an article from its target (keeps the blog's existing category names). */
export function blogCategoryFor(target: string, track: Track) {
  const t = target.toLowerCase();
  if (/domain|\/ae-domains/.test(t)) return 'Domains';
  if (/email|workspace/.test(t)) return 'Email';
  if (/ssl|security/.test(t)) return 'Security';
  if (/wordpress/.test(t)) return 'WordPress';
  if (/vps|dedicated|server|rdp/.test(t)) return 'Servers';
  if (/payment|whatsapp|seo|marketing/.test(t)) return 'Grow online';
  return track === 'uae' ? 'UAE business' : 'Hosting guides';
}

/** A post slug that is free (the idea's slug, else "-2", "-3"…). */
export async function freeSlug(want: string, exceptId?: string): Promise<string> {
  const base = want.slice(0, 90).replace(/-+$/, '') || 'article';
  const rows = await db.select({ slug: schema.posts.slug, id: schema.posts.id }).from(schema.posts).where(sql`${schema.posts.slug} like ${base + '%'}`);
  const taken = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/* ------------------------------------------------------------------ daily autopilot state */
export const DAILY_KEY = 'content_daily';
export type DailyEvent = { at: string; kind: 'published' | 'scheduled' | 'held' | 'failed' | 'skipped' | 'cap'; slotAt?: string; ideaId?: string; title?: string; reason?: string };
export type DailyState = { events: DailyEvent[]; capNotified?: string; lastRun?: { at: string; trigger: string; summary: string; ms: number } };
export async function dailyState(): Promise<DailyState> {
  try {
    const [r] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, DAILY_KEY));
    const v: any = r?.value;
    return { events: Array.isArray(v?.events) ? v.events : [], capNotified: v?.capNotified, lastRun: v?.lastRun };
  } catch { return { events: [] }; }
}
/** Append events (newest first, last 200 kept) and/or patch fields. */
export async function patchDaily(p: { events?: DailyEvent[]; capNotified?: string; lastRun?: DailyState['lastRun'] }) {
  const cur = await dailyState();
  await setSetting(DAILY_KEY, { ...cur, ...(p.capNotified ? { capNotified: p.capNotified } : {}), ...(p.lastRun ? { lastRun: p.lastRun } : {}), events: [...(p.events || []), ...cur.events].slice(0, 200) });
}
/** Lock for one tick at a time (conditional upsert: only the caller that takes it gets a row back). */
export async function takeTickLock(ttlMs: number, force = false): Promise<boolean> {
  const until = new Date(Date.now() + ttlMs).toISOString();
  const r = await db.execute(sql`insert into settings (key, value) values ('content_tick_lock', ${JSON.stringify({ until })}::jsonb)
    on conflict (key) do update set value = excluded.value
    where ${force} or (settings.value->>'until')::timestamptz < now()
    returning key`);
  return Array.from(r as unknown as ArrayLike<unknown>).length > 0;
}
export async function releaseTickLock() {
  await setSetting('content_tick_lock', { until: new Date(0).toISOString() }).catch(() => {});
}
