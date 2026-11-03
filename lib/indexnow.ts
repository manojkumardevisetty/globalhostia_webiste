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

let deployChecked = false;
/**
 * Once per production deployment: the first request after a deploy claims a lock keyed by the commit SHA
 * (settings.indexnow_deploy) and submits the whole sitemap. Call it from after(), so it never delays a response.
 */
export async function onDeploy() {
  if (deployChecked) return;
  deployChecked = true;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.VERCEL_ENV !== 'production' || !sha) return;
  try {
    const value = JSON.stringify({ sha, at: new Date().toISOString() });
    // the conditional upsert returns a row only for the one request that moves the lock to this SHA
    const r = await db.execute(sql`insert into settings (key, value) values ('indexnow_deploy', ${value}::jsonb)
      on conflict (key) do update set value = excluded.value where settings.value->>'sha' is distinct from excluded.value->>'sha'
      returning key`);
    const claimed = Array.from(r as unknown as ArrayLike<unknown>).length > 0;
    if (claimed) {
      revalidateTag('site'); // the sitemap's <lastmod> for hand-written pages uses the deploy time
      await submitSitemap(`deploy ${sha.slice(0, 7)}`);
    }
  } catch { /* retried by the daily cron */ }
}
