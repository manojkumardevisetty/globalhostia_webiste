// Premium domains: database reads (cached, tag `site`), the Dynadot feed refresh and the registry premium check.
// Server-only. Public pages read premiumItems(); the admin and the cron call refreshFeed().
import 'server-only';
import { readFileSync } from 'node:fs';
import { asc, desc, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from '../db';
import { cachedRead } from '../lkg';
import { getSettings, setSetting } from '../settings';
import { normalizePremium, mergeItems, feedAllows, brandable, registryPrice, PREMIUM_KEY, type PremiumConfig, type PItem, type OwnRow, type FeedRow } from './core';
import { transport, getListings, searchPrices, adviceFor } from './dynadot';

export const STATE_KEY = 'premium_state';
export type FeedState = { at?: string; ok?: boolean; mode?: string; read?: number; kept?: number; pages?: number; error?: string; advice?: string; by?: string; lock?: number };

// Local development only (never in production builds): PREMIUM_FIXTURE=<file.json> with { config, own, feed } renders
// clearly-labelled TEST data for screenshots and layout checks without touching a database.
type Fixture = { config?: unknown; own?: OwnRow[]; feed?: FeedRow[] };
function fixture(): Fixture | null {
  if (process.env.NODE_ENV === 'production' || !process.env.PREMIUM_FIXTURE) return null;
  try { return JSON.parse(readFileSync(process.env.PREMIUM_FIXTURE, 'utf8')) as Fixture; } catch { return null; }
}

export async function premiumConfig(): Promise<PremiumConfig> {
  const fx = fixture();
  if (fx?.config) return normalizePremium(fx.config);
  const s = await getSettings().catch(() => ({} as Record<string, unknown>));
  return normalizePremium((s as any)[PREMIUM_KEY]);
}

/** Own listings + the cached feed, merged with the admin rules (cached 1h, tag `site`; [] when the tables are missing). */
export const premiumItems = cachedRead('premium-items', async (): Promise<PItem[]> => {
  const cfg = await premiumConfig();
  const fx = fixture();
  if (fx) return mergeItems(fx.own || [], fx.feed || [], cfg);
  let own: OwnRow[] = [], feed: FeedRow[] = [];
  try {
    own = (await db.select().from(schema.premiumDomains).orderBy(desc(schema.premiumDomains.featured), asc(schema.premiumDomains.domain)).limit(2000)) as OwnRow[];
    if (cfg.feed.enabled) feed = (await db.select().from(schema.premiumFeed).orderBy(asc(schema.premiumFeed.price)).limit(2000)) as FeedRow[];
  } catch (e: any) {
    if (!/premium_(domains|feed)|does not exist/i.test(String(e?.message))) throw e;
  }
  return mergeItems(own, feed, cfg);
}, { revalidate: 3600, fallback: () => [] });

export async function feedState(): Promise<FeedState> {
  const [row] = await db.select().from(schema.settings).where(sql`${schema.settings.key} = ${STATE_KEY}`).catch(() => []);
  return (row?.value as FeedState) || {};
}
const saveState = (s: FeedState) => setSetting(STATE_KEY, s).catch(() => {});

/** True when the cached feed is older than cacheHours (the page then refreshes it after responding). */
export async function feedStale(cfg: PremiumConfig): Promise<boolean> {
  if (!cfg.feed.enabled) return false;
  const st = await feedState().catch(() => ({} as FeedState));
  if (st.lock && Date.now() - st.lock < 5 * 60_000) return false;
  return !st.at || Date.now() - new Date(st.at).getTime() > cfg.cacheHours * 3600_000;
}

/**
 * Pull Dynadot marketplace listings (up to feed.pages × 100), keep the ones that pass the admin filters (TLDs, price range,
 * keywords) up to 3 × maxCount, replace premium_feed. Never throws; returns the new state (also saved for Admin).
 */
export async function refreshFeed(by = 'system'): Promise<FeedState> {
  const cfg = await premiumConfig();
  if (!cfg.feed.enabled) return { ok: true, at: new Date().toISOString(), kept: 0, error: 'Dynadot feed is switched off', by };
  const prev = await feedState().catch(() => ({} as FeedState));
  if (prev.lock && Date.now() - prev.lock < 5 * 60_000) return { ...prev, error: 'A refresh is already running' };
  await saveState({ ...prev, lock: Date.now() });
  const t = await transport(cfg);
  try {
    const { items, pages } = await getListings(t, cfg.feed.pages);
    const keep = items.filter((l) => brandable(l.domain) && feedAllows(l, cfg.feed)).slice(0, Math.max(cfg.feed.maxCount * 3, 30));
    await db.transaction(async (tx) => {
      await tx.delete(schema.premiumFeed);
      for (let i = 0; i < keep.length; i += 200) {
        await tx.insert(schema.premiumFeed).values(keep.slice(i, i + 200).map((l) => ({ domain: l.domain, listingId: l.id, price: l.amount.toFixed(2), currency: l.currency })))
          .onConflictDoNothing();
      }
    });
    const st: FeedState = { at: new Date().toISOString(), ok: true, mode: t.mode, read: items.length, kept: keep.length, pages, by };
    await saveState(st);
    try { revalidateTag('site'); } catch { /* outside a request */ }
    return st;
  } catch (e: any) {
    const st: FeedState = { ...prev, lock: 0, ok: false, mode: t.mode, error: String(e?.message || e).slice(0, 300), advice: adviceFor(e), by, at: prev.at };
    await saveState({ ...st, at: prev.at });
    await db.insert(schema.auditLogs).values({ userEmail: by, action: 'premium_feed_error', entity: 'premium_feed', entityId: null, detail: { error: st.error, mode: t.mode } as any }).catch(() => {});
    return st;
  }
}

/* ------------------------------------------------------------------ registry premium on a domain search */
const premCache = new Map<string, { at: number; v: RegistryPremium | null }>();
export type RegistryPremium = { premium: true; price: number; renew: number | null; currency: 'USD'; source: 'registry' };
/**
 * Dynadot's view of one available name: { premium, price } when the registry marks it premium, else null.
 * Short timeout, 1h cache, never throws: a slow or missing Dynadot connection never blocks a domain check.
 */
export async function registryPremium(domain: string): Promise<RegistryPremium | null> {
  const hit = premCache.get(domain);
  if (hit && Date.now() - hit.at < 3600_000) return hit.v;
  try {
    const cfg = await premiumConfig();
    if (!cfg.registry.enabled) return null;
    const t = await transport(cfg);
    if (t.mode === 'none') return null;
    const [r] = await searchPrices(t, [domain], 4000);
    const v: RegistryPremium | null = r && r.domain === domain && r.premium && r.amount && r.currency === 'USD'
      ? { premium: true, price: registryPrice(r.amount, cfg.registry.markupPct), renew: r.renew ? registryPrice(r.renew, cfg.registry.markupPct) : null, currency: 'USD', source: 'registry' }
      : null;
    if (premCache.size > 3000) premCache.clear();
    premCache.set(domain, { at: Date.now(), v });
    return v;
  } catch { return null; }
}
