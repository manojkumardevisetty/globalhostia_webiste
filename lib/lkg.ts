// Last-known-good (LKG) reads: the public site never answers 500 because Postgres is unavailable
// (Neon over quota, suspended, network). Every public read goes through cachedRead():
//
//   1. Next data cache (unstable_cache, tag 'site', 6h): crawlers and visitors never query Postgres per request;
//      admin saves call revalidateTag('site') so edits still show at once.
//   2. On a cache miss the loader queries Postgres. Success is remembered per instance (memory snapshot).
//   3. On failure: the per-instance memory snapshot, then the deployment snapshot (.snapshot/lkg.json, written at build
//      time by scripts/snapshot.mjs from the same loaders), then a safe default (empty catalog, default settings).
//
// After a database error the loaders skip Postgres for 30s (circuit breaker), so an outage costs one failed connect
// per instance, not one per request. The build snapshot is carried from deploy to deploy (GET /api/lkg) when the
// build cannot reach the database, so a deploy during an outage keeps the content.
import fs from 'node:fs';
import path from 'node:path';
import { unstable_cache } from 'next/cache';

export const REVALIDATE = 6 * 3600;
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';
const COOLDOWN = 30_000;

type State = { mem: Map<string, unknown>; file?: Record<string, unknown>; downUntil: number; lastFallback: number; warned: Map<string, number> };
const g = globalThis as unknown as { __lkg?: State };
const st: State = (g.__lkg ??= { mem: new Map(), downUntil: 0, lastFallback: 0, warned: new Map() });

export class DbUnavailableError extends Error {
  constructor(cause?: unknown) { super('Database unavailable'); this.name = 'DbUnavailableError'; (this as any).cause = cause; }
}

const CONN_CODES = /^(08|53|57P|XX000|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|CONNECT_TIMEOUT|CONNECTION_)/;
/** Connection / quota / shutdown errors (also when wrapped by drizzle as `cause`). */
export function isDbError(e: unknown): boolean {
  for (let x: any = e, i = 0; x && i < 5; x = x.cause, i++) {
    if (x instanceof DbUnavailableError) return true;
    if (typeof x.code === 'string' && CONN_CODES.test(x.code)) return true;
    if (typeof x.errno === 'string' && CONN_CODES.test(x.errno)) return true;
    if (/quota|too many connections|connect(ion)? (timeout|refused|terminated|ended|closed)|ECONNREFUSED|getaddrinfo|endpoint .*(disabled|suspended)|DATABASE_URL/i.test(String(x.message || ''))) return true;
  }
  return false;
}

/** True while the circuit breaker is open (a database error happened in the last 30s on this instance). */
export const dbDown = () => Date.now() < st.downUntil;
export function markDbDown(e?: unknown) {
  if (!dbDown()) console.warn('[lkg] database unavailable, serving cached/snapshot data for 30s:', String((e as any)?.message || e).slice(0, 200));
  st.downUntil = Date.now() + COOLDOWN;
}
/** A public read served snapshot/default data in the last 2 minutes (pages then use a short CDN TTL). */
export const degraded = () => Date.now() - st.lastFallback < 120_000;

function fileSnap(): Record<string, unknown> {
  if (st.file) return st.file;
  try { st.file = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.snapshot', 'lkg.json'), 'utf8')) || {}; }
  catch { st.file = {}; }
  return st.file!;
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** The last good value of a key: this instance's memory first, then the deployment snapshot. */
export function snapshotGet(key: string): { hit: boolean; value?: unknown } {
  if (st.mem.has(key)) return { hit: true, value: st.mem.get(key) };
  const f = fileSnap();
  return hasOwn(f, key) ? { hit: true, value: f[key] } : { hit: false };
}

/** Everything known: deployment snapshot overlaid with this instance's newer reads (for GET /api/lkg and the build). */
export function snapshotDump(memOnly = false): Record<string, unknown> {
  const out: Record<string, unknown> = memOnly ? {} : { ...fileSnap() };
  for (const [k, v] of st.mem) out[k] = v;
  return out;
}

function warn(key: string, how: string, e: unknown) {
  st.lastFallback = Date.now();
  const last = st.warned.get(key) || 0;
  if (Date.now() - last < 60_000) return;
  st.warned.set(key, Date.now());
  console.warn(`[lkg] ${key}: ${how} (${String((e as any)?.message || e).slice(0, 160)})`);
}

/** Run a read; remember its result; on failure answer with the last good value or the fallback. */
export async function lkg<T>(key: string, load: () => Promise<T>, fallback?: () => T): Promise<T> {
  try {
    const v = await load();
    st.mem.set(key, v);
    return v;
  } catch (e) {
    const s = snapshotGet(key);
    if (s.hit) { warn(key, 'served from snapshot', e); return s.value as T; }
    if (fallback) { warn(key, 'served default', e); return fallback(); }
    throw e;
  }
}

/** Wrap a database loader: fail fast while the circuit is open, open it on a connection/quota error. */
export function guard<A extends unknown[], T>(fn: (...a: A) => Promise<T>) {
  return async (...a: A): Promise<T> => {
    if (dbDown()) throw new DbUnavailableError();
    try { return await fn(...a); } catch (e) { if (isDbError(e)) markDbDown(e); throw e; }
  };
}

type Arg = string | number | boolean;
const keyOf = (name: string, a: Arg[]) => (a.length ? `${name}:${a.join('|')}` : name);

/**
 * A cached, snapshot-backed public read. Results must be JSON-serialisable (Dates come back as strings, as with
 * unstable_cache). `fallback` is used when there is neither a database nor a snapshot.
 */
export function cachedRead<A extends Arg[], T>(name: string, fn: (...a: A) => Promise<T>, o: { revalidate?: number; tags?: string[]; fallback?: (...a: A) => T } = {}) {
  const c = unstable_cache(guard(fn), [name, BUILD], { tags: o.tags ?? ['site'], revalidate: o.revalidate ?? REVALIDATE });
  return (...a: A): Promise<T> => lkg(keyOf(name, a), () => c(...a), o.fallback ? () => o.fallback!(...a) : undefined);
}

/** CDN caching for public HTML/feeds: 1h fresh + 1 day stale-while-revalidate; 1 minute while serving snapshot data. */
export const CDN_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
export const cdnCache = () => (degraded() ? 'public, s-maxage=60, stale-while-revalidate=600' : CDN_CACHE);
