// Automatic IndexNow submissions (Bing, Yandex, Seznam, Naver and the other engines that share IndexNow):
//  - every sitemap URL once per production deployment (first request after the deploy, lib/indexnow.ts onDeploy)
//  - URLs whose <lastmod> moved since the previous daily cron run (app/api/cron/sync)
//  - the page, product, post or landing page an admin publishes or edits
// Each submission is logged (settings.indexnow_log) and shown on Admin > SEO.
// Google does not use IndexNow; it reads the Sitemap: line in robots.txt.
import 'server-only';
import { sql, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from './db';
import { dbDown } from './lkg';
import { getSettings, setSetting } from './settings';
import { siteUrl, submitIndexNow, type IndexNowResult } from './seo';
import { sitemapEntries } from './sitemap';

export type IndexNowLog = IndexNowResult & { at: string; trigger: string };
const LOG_KEY = 'indexnow_log';
const LOG_MAX = 30;

async function readKey<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}

/** Latest submissions, newest first (read from the database, not the settings cache). */
export async function indexNowLog(): Promise<IndexNowLog[]> {
  const v = await readKey<IndexNowLog[]>(LOG_KEY).catch(() => undefined);
  return Array.isArray(v) ? v : [];
}

async function log(entry: IndexNowLog) {
  const list = [entry, ...(await indexNowLog())].slice(0, LOG_MAX);
  await setSetting(LOG_KEY, list);
}

/** Submit URLs and log the answer. Never throws. */
export async function submitAndLog(urls: string[], trigger: string): Promise<IndexNowLog> {
  let entry: IndexNowLog;
  try {
    const site = siteUrl(await getSettings());
    entry = { at: new Date().toISOString(), trigger, ...(await submitIndexNow(site, urls)) };
  } catch (e: any) {
    entry = { at: new Date().toISOString(), trigger, ok: false, status: 0, submitted: 0, message: e?.message || 'Failed' };
  }
  await log(entry).catch(() => undefined);
  return entry;
}

/** Every sitemap URL. */
export async function submitSitemap(trigger: string) {
  const entries = await sitemapEntries();
  return submitAndLog(entries.map((e) => e.loc), trigger);
}

/** Sitemap URLs whose <lastmod> is newer than the previous run of this trigger (daily cron). */
export async function submitChanged(trigger = 'daily cron') {
  const key = 'indexnow_changed_since';
  const since = Date.parse(String((await readKey<string>(key).catch(() => '')) || '')) || Date.now() - 864e5;
  const now = new Date().toISOString();
  const urls = (await sitemapEntries()).filter((e) => Date.parse(e.lastmod) > since).map((e) => e.loc);
  await setSetting(key, now);
  if (!urls.length) {
    const entry: IndexNowLog = { at: now, trigger, ok: true, status: 0, submitted: 0, message: 'No changed URLs since the last run' };
    await log(entry).catch(() => undefined);
    return entry;
  }
  return submitAndLog(urls, trigger);
}

/** Admin edits: only on the production deployment, so previews and local runs never submit. */
export async function pingChanged(paths: string[], trigger: string) {
  if (process.env.VERCEL_ENV !== 'production') return;
  const site = siteUrl(await getSettings());
  await submitAndLog(paths.map((p) => (p.startsWith('http') ? p : site + (p.startsWith('/') ? p : `/${p}`))), trigger);
}

let nextDeployCheck = 0;
/**
 * Once per production deployment: the first request after a deploy claims a lock keyed by the commit SHA
 * (settings.indexnow_deploy) and submits the whole sitemap. When that submission failed, a request at least
 * 30 minutes later retries it (a new key can take a while to verify). Call it from after(): it never delays a page.
 */
export async function onDeploy() {
  if (Date.now() < nextDeployCheck || dbDown()) return;
  nextDeployCheck = Date.now() + 10 * 60e3; // each server instance looks at the lock at most every 10 minutes
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.VERCEL_ENV !== 'production' || !sha) { nextDeployCheck = Infinity; return; }
  try {
    const value = JSON.stringify({ sha, at: new Date().toISOString(), ok: null });
    // the conditional upsert returns a row only for the one request that takes the lock
    const r = await db.execute(sql`insert into settings (key, value) values ('indexnow_deploy', ${value}::jsonb)
      on conflict (key) do update set value = excluded.value
      where settings.value->>'sha' is distinct from excluded.value->>'sha'
         or (settings.value->>'ok' = 'false' and (settings.value->>'at')::timestamptz < now() - interval '30 minutes')
      returning key`);
    if (!Array.from(r as unknown as ArrayLike<unknown>).length) {
      // another request holds this deploy's lock: once it has succeeded, this instance never looks again
      // (previously every instance re-ran the upsert every 10 minutes for its whole life, keeping Postgres awake)
      const cur = await readKey<{ sha?: string; ok?: boolean | null }>('indexnow_deploy').catch(() => undefined);
      nextDeployCheck = cur?.sha === sha && cur.ok === true ? Infinity : Date.now() + 30 * 60e3;
      return;
    }
    revalidateTag('site'); // the sitemap's <lastmod> for hand-written pages uses the deploy time
    const res = await submitSitemap(`deploy ${sha.slice(0, 7)}`);
    await setSetting('indexnow_deploy', { sha, at: new Date().toISOString(), ok: res.ok });
    if (res.ok) nextDeployCheck = Infinity;
  } catch { nextDeployCheck = Date.now() + 30 * 60e3; /* database unavailable: retry later; the daily cron still submits changed URLs */ }
}
