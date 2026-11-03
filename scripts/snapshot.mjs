// Build step (after db-setup, before next build): writes .snapshot/lkg.json, the last-known-good copy of every public
// read (settings, catalog, CMS pages, blog, landing pages, redirects, sitemap rows, TLD prices). Deployed with the
// functions (next.config.mjs outputFileTracingIncludes) and served by lib/lkg.ts whenever Postgres is unavailable.
//  1. Database reachable → lib/lkg-build.ts reads everything through the site's own loaders.
//  2. Not reachable (over quota, suspended, no URL) → the snapshot of the live production deployment (GET /api/lkg,
//     authorised with CRON_SECRET), so a deploy during an outage keeps the content.
//  3. Neither → no snapshot; the site still answers 200 with defaults (empty catalog, static sitemap).
// Never fails the build.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const OUT = '.snapshot/lkg.json';
const TMP = '.snapshot/lkg.tmp.json';
const t0 = Date.now();
fs.mkdirSync('.snapshot', { recursive: true });

async function fromDatabase() {
  if (!(process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL)) { console.warn('[snapshot] no DATABASE_URL'); return false; }
  await build({
    entryPoints: ['lib/lkg-build.ts'], outfile: '.snapshot/build.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22',
    packages: 'external', logLevel: 'error', tsconfig: 'tsconfig.json',
    // outside Next: no React server condition, no request scope, no data cache
    alias: { 'server-only': './scripts/shims/empty.mjs', 'next/cache': './scripts/shims/next-cache.mjs', 'next/headers': './scripts/shims/next-headers.mjs' },
  });
  const r = spawnSync(process.execPath, ['.snapshot/build.mjs', TMP], { stdio: 'inherit', timeout: 150_000, env: process.env });
  if (r.status === 0 && fs.existsSync(TMP)) { fs.renameSync(TMP, OUT); return true; }
  return false;
}

async function fromProduction() {
  const secret = process.env.CRON_SECRET;
  const host = process.env.LKG_SOURCE_HOST || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'globalhostia.com';
  if (!secret || !process.env.VERCEL) return false;
  try {
    const res = await fetch(`https://${host}/api/lkg`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { console.warn(`[snapshot] ${host}/api/lkg answered ${res.status}`); return false; }
    const json = await res.json();
    if (!json || typeof json !== 'object' || !('settings' in json) || !('theme-catalog' in json)) { console.warn('[snapshot] production snapshot is empty'); return false; }
    fs.writeFileSync(OUT, JSON.stringify(json));
    console.log(`[snapshot] carried over the production snapshot (${Object.keys(json).length} entries, from ${json.__meta?.at || 'unknown'})`);
    return true;
  } catch (e) {
    console.warn('[snapshot] could not fetch the production snapshot:', e?.message || e);
    return false;
  }
}

try {
  if (await fromDatabase()) console.log(`[snapshot] written from the database in ${Date.now() - t0}ms`);
  else if (!(await fromProduction())) console.warn('[snapshot] WARNING: no snapshot for this deployment; pages fall back to defaults while the database is unavailable');
} catch (e) {
  console.warn('[snapshot] WARNING: skipped:', e?.message || e);
}
try { fs.rmSync('.snapshot/build.mjs', { force: true }); fs.rmSync(TMP, { force: true }); } catch {}
if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, '{}'); // the traced file always exists
