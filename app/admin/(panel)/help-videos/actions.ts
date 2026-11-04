'use server';
// Admin → Help videos: edits to the help centre how-to topics (lib/help/topics.ts) are stored in settings.help_overrides,
// on top of the defaults. Every save clears the site cache (done → bust) and pings IndexNow for the page and the hub.
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool, lines } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { pingChanged } from '@/lib/indexnow';
import { HELP_TOPICS, helpPath } from '@/lib/help/topics';
import { readHelpOverrides, safeMediaUrl, type HelpOverride } from '@/lib/help/view';

const BACK = '/admin/help-videos';
const cut = (t: string, n: number) => t.trim().slice(0, n);

async function write(slug: string, o: HelpOverride | null, by: Awaited<ReturnType<typeof requireSession>>, what: string) {
  const all = readHelpOverrides(await getSettings());
  if (o && Object.keys(o).some((k) => k !== 'updatedAt')) all[slug] = o; else delete all[slug];
  await setSetting('help_overrides', all);
  await audit(by, 'update', 'settings', 'help_overrides', { topic: slug, what });
  await pingChanged([helpPath(slug), '/help-center', '/sitemap.xml', '/sitemap-video.xml'], `help topic ${what}`).catch(() => undefined);
}

/** Save the texts, steps and media URLs of one topic. Fields equal to the default are not stored. */
export async function saveHelpTopic(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug');
  const base = HELP_TOPICS.find((t) => t.slug === slug);
  if (!base) fail(BACK, 'Unknown help topic');
  const t = base!;
  const prev = readHelpOverrides(await getSettings())[slug] || {};
  const next: HelpOverride = {};
  const text = (k: 'title' | 'titleAr' | 'summary' | 'summaryAr', n: number) => { const v = cut(str(fd, k), n); if (!v && (k === 'title' || k === 'summary')) fail(BACK, `${t.title}: the ${k} cannot be empty`); if (v && v !== t[k]) next[k] = v; };
  text('title', 90); text('titleAr', 90); text('summary', 220); text('summaryAr', 220);

  // one step per line: "English | Arabic"
  const steps = lines(String(fd.get('steps') ?? '')).map((l) => { const [en = '', ar = ''] = l.split('|').map((x) => x.trim()); return { en: cut(en, 240), ar: cut(ar, 240) }; }).filter((x) => x.en);
  if (!steps.length) fail(BACK, `${t.title}: add at least one step`);
  if (steps.length > 12) fail(BACK, `${t.title}: keep it to 12 steps or fewer`);
  if (JSON.stringify(steps) !== JSON.stringify(t.steps)) next.steps = steps;

  for (const k of ['mp4', 'webm', 'poster', 'vttEn', 'vttAr'] as const) {
    const v = str(fd, k);
    if (!v) continue;
    const u = safeMediaUrl(v);
    if (!u) fail(BACK, `${t.title}: ${k} must be a path on this site (/help/videos/…) or an https:// link`);
    if (k === 'mp4' && !/\.mp4(\?|$)/i.test(u)) fail(BACK, `${t.title}: the video file must be an .mp4`);
    if (k === 'poster' && !/\.(jpe?g|png|webp)(\?|$)/i.test(u)) fail(BACK, `${t.title}: the poster must be a .jpg, .png or .webp image`);
    if ((k === 'vttEn' || k === 'vttAr') && !/\.vtt(\?|$)/i.test(u)) fail(BACK, `${t.title}: captions must be a .vtt file`);
    next[k] = u;
  }
  const dur = Number(str(fd, 'duration'));
  if (str(fd, 'duration') && !(dur > 0 && dur <= 600)) fail(BACK, `${t.title}: the length must be between 1 and 600 seconds`);
  if (dur > 0 && next.mp4) next.duration = Math.round(dur);
  if (bool(fd, 'hidden')) next.hidden = true;
  next.updatedAt = next.mp4 && next.mp4 === prev.mp4 && prev.updatedAt ? prev.updatedAt : new Date().toISOString().slice(0, 10);

  await write(slug, next, s, next.hidden ? 'hidden' : 'saved');
  done(BACK, `${next.title || t.title} saved${next.hidden ? ' (hidden)' : ''}`);
}

/** Show or hide one topic without touching its texts. */
export async function setHelpHidden(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug');
  const t = HELP_TOPICS.find((x) => x.slug === slug);
  if (!t) fail(BACK, 'Unknown help topic');
  const hide = str(fd, 'hide') === '1';
  const { hidden: _h, ...rest } = readHelpOverrides(await getSettings())[slug] || {};
  await write(slug, hide ? { ...rest, hidden: true } : rest, s, hide ? 'hidden' : 'shown');
  done(BACK, hide ? `${t!.title} is hidden (404, out of the sitemaps)` : `${t!.title} is live`);
}

/** Drop every admin edit of one topic: the recorded video and default texts come back. */
export async function resetHelpTopic(fd: FormData) {
  const s = await requireSession('content');
  const slug = str(fd, 'slug');
  const t = HELP_TOPICS.find((x) => x.slug === slug);
  if (!t) fail(BACK, 'Unknown help topic');
  await write(slug, null, s, 'reset');
  done(BACK, `${t!.title} reset to the recorded video and default steps`);
}
