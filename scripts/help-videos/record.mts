// Records the help-centre how-to videos (lib/help/topics.ts) from the LOCAL app with fictional demo data:
//   1. ./scripts/help-videos/run-stack.sh            (mocks + next dev on :3411; local Postgres on 5433)
//   2. HELP_FX=<WHMCS skin fixture dir> node --experimental-strip-types scripts/help-videos/record.mts [slug,slug]
//      node --experimental-strip-types scripts/help-videos/frames.mts [slug]   (walkthrough screenshots)
//   3. node scripts/help-videos/encode.mjs raw --no-webm   (MP4 + poster + captions into public/help, lib/help/media.ts)
// Output goes to ./raw (webm + cue json + WebVTT). Captions come from the topic steps, so video, VTT and page match.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, OVERLAY, Rec, W, H, vtt } from './lib/rec.mts';
import { SCENES } from './scenes.mts';
const BASE = process.env.HELP_BASE || 'http://localhost:3411';
const OUT = path.resolve('raw'); fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] ? process.argv[2].split(',') : null;
const b = await chromium.launch();
async function login() {
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(`${BASE}/account/login`); await p.fill('#au-email', 'demo@example.com'); await p.fill('#au-pass', 'demo-pass');
  await Promise.all([p.waitForURL(/\/account(\?|$)/, { timeout: 90000 }), p.click('form button[type=submit]')]);
  const st = await ctx.storageState(); await ctx.close(); return st;
}
const state = await login();
for (const sc of SCENES) {
  if (only && !only.includes(sc.slug)) continue;
  const dir = path.join(OUT, 'tmp-' + sc.slug); fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } }, storageState: sc.kind === 'portal' ? state : undefined, reducedMotion: 'no-preference' });
  await ctx.addInitScript(OVERLAY);
  if (sc.setup) await sc.setup(ctx);
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on('pageerror', (e: any) => errs.push(e.message));
  const rec = new Rec(p);
  let ok = true;
  try { await sc.run(rec, p, BASE); } catch (e: any) { ok = false; console.log('FAIL', sc.slug, e.message.split('\n')[0]); await p.screenshot({ path: path.join(OUT, sc.slug + '-fail.png') }).catch(() => {}); }
  const dur = rec.end();
  const shots = sc.shots || [];
  await ctx.close();
  const v = fs.readdirSync(dir).find((f) => f.endsWith('.webm'));
  if (v) fs.renameSync(path.join(dir, v), path.join(OUT, sc.slug + '.webm'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.writeFileSync(path.join(OUT, sc.slug + '.json'), JSON.stringify({ slug: sc.slug, ok, start: rec.startAt, dur, cues: rec.cues }, null, 1));
  fs.writeFileSync(path.join(OUT, sc.slug + '.en.vtt'), vtt(rec.cues, 'en'));
  fs.writeFileSync(path.join(OUT, sc.slug + '.ar.vtt'), vtt(rec.cues, 'ar'));
  console.log(ok ? 'OK  ' : 'BAD ', sc.slug, dur.toFixed(1) + 's', errs.length ? 'errors: ' + errs.join(' | ').slice(0, 200) : '');
}
await b.close();
