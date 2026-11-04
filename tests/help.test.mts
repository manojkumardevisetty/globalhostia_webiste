// Help centre "Watch how" topics (lib/help): 20 unique tasks with English + Arabic steps, walkthrough frames per step,
// fictional demo data only, admin overrides (texts, steps, media URLs, hide) and safe media URLs.
// Run: node --test --experimental-strip-types tests/help.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(
  "export async function resolve(s, c, n) { if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$/.test(s)) { try { return await n(s + '.ts', c); } catch {} } return n(s, c); }"));
const T = await import('../lib/help/topics.ts');
const V = await import('../lib/help/view.ts');
const ROOT = path.resolve(import.meta.dirname, '..');
const ARABIC = /[؀-ۿ]/;
const NARRATION = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/help-videos/narration.json'), 'utf8'));

test('20 topics with unique slugs, English and Arabic texts and 3 to 6 steps', () => {
  assert.equal(T.HELP_TOPICS.length, 20);
  assert.equal(new Set(T.HELP_SLUGS).size, 20);
  for (const t of T.HELP_TOPICS) {
    assert.match(t.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(t.title && t.summary && ARABIC.test(t.titleAr) && ARABIC.test(t.summaryAr), t.slug);
    assert.ok(t.steps.length >= 3 && t.steps.length <= 6, `${t.slug}: ${t.steps.length} steps`);
    for (const s of t.steps) assert.ok(s.en && ARABIC.test(s.ar), `${t.slug}: step without Arabic`);
    assert.ok(T.HELP_GROUPS[t.group], t.slug);
    assert.ok(t.start.href.startsWith('/'), `${t.slug}: start link is one of our pages`);
    if (t.kind === 'walkthrough') assert.equal(t.frames?.length, t.steps.length, `${t.slug}: one frame per step`);
  }
});

test('every topic covers one of the required areas', () => {
  const slugs = new Set(T.HELP_SLUGS);
  for (const s of ['pay-an-invoice', 'renew-services', 'add-a-dns-record', 'change-nameservers', 'set-up-email', 'connect-a-domain', 'issue-ssl-certificate',
    'open-a-support-ticket', 'give-team-access', 'switch-language', 'sell-a-domain', 'upload-files', 'create-a-database', 'change-php-version',
    'restore-a-backup', 'install-wordpress', 'register-a-domain', 'buy-hosting', 'transfer-a-domain', 'connect-ai-assistant']) assert.ok(slugs.has(s), s);
});

test('media files referenced by the defaults exist and stay small', () => {
  for (const t of T.HELP_TOPICS) {
    if (t.kind === 'walkthrough') { for (const f of t.frames!) assert.ok(fs.existsSync(path.join(ROOT, 'public', T.frameUrl(f.src))), f.src); continue; }
    const m = T.helpMedia(t.slug);
    for (const u of [m.mp4, m.poster, m.vttEn, m.vttAr]) assert.ok(fs.existsSync(path.join(ROOT, 'public', u)), u);
    assert.ok(fs.statSync(path.join(ROOT, 'public', m.mp4)).size < 3.2 * 1024 * 1024, `${t.slug}: mp4 under ~3 MB`);
    const en = fs.readFileSync(path.join(ROOT, 'public', m.vttEn), 'utf8'), ar = fs.readFileSync(path.join(ROOT, 'public', m.vttAr), 'utf8');
    assert.match(en, /^WEBVTT/); assert.match(ar, /^WEBVTT/); assert.ok(ARABIC.test(ar), `${t.slug}: Arabic captions`);
    // English captions are the spoken voice-over (scripts/help-videos/narration.json, narrate.py); Arabic keeps the step text
    const said = NARRATION.videos[t.slug];
    assert.ok(said?.length === t.steps.length, `${t.slug}: one narration line per step`);
    const cap = (x: string) => Object.entries(NARRATION.captions as Record<string, string>).reduce((a, [k, v]) => a.split(k).join(v), x);
    for (const l of said) for (const s of l.text.split(/(?<=[.?!])\s+/)) assert.ok(en.includes(cap(s)), `${t.slug}: captions match the narration: ${s}`);
    assert.ok(t.steps.every((s) => ar.includes(s.ar)), `${t.slug}: Arabic captions match the steps on the page`);
  }
});

test('demo data is fictional: no real customer-looking domains in the texts', () => {
  const all = JSON.stringify(T.HELP_TOPICS);
  for (const m of all.matchAll(/\b[a-z0-9-]+\.(com|net|org|ae|io)\b/g)) assert.ok(/^(example|globalhostia)\./.test(m[0]) || /\.example\b/.test(m[0]), m[0]);
});

test('admin overrides: texts, steps, media URLs, hide, and unsafe URLs are ignored', () => {
  const s = { help_overrides: { 'pay-an-invoice': { title: 'Pay a bill', steps: [{ en: 'One', ar: 'واحد' }], mp4: '/help/videos/new.mp4', poster: 'javascript:alert(1)', duration: 42, updatedAt: '2026-12-01' }, 'buy-hosting': { hidden: true } } };
  const list = V.helpTopics(s);
  assert.equal(list.length, 19);
  const p = list.find((x) => x.slug === 'pay-an-invoice')!;
  assert.equal(p.title, 'Pay a bill'); assert.equal(p.steps.length, 1); assert.equal(p.media.mp4, '/help/videos/new.mp4');
  assert.equal(p.media.poster, '/help/videos/pay-an-invoice.jpg', 'unsafe poster falls back to the default');
  assert.equal(p.media.duration, 42); assert.equal(p.media.uploadDate, '2026-12-01'); assert.ok(p.edited);
  assert.equal(V.helpTopics(s, { includeHidden: true }).length, 20);
  assert.equal(V.safeMediaUrl('//evil.example/x.mp4'), ''); assert.equal(V.safeMediaUrl('http://x.example/a.mp4'), '');
  assert.equal(V.safeMediaUrl('https://cdn.example.net/v/a.mp4'), 'https://cdn.example.net/v/a.mp4');
  assert.equal(V.isoDuration(75), 'PT1M15S'); assert.equal(V.isoDuration(42), 'PT42S'); assert.equal(V.clock(65), '1:05');
});
