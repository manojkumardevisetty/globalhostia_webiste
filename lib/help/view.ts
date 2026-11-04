// Help topics as shown on the site: the defaults in lib/help/topics.ts plus the edits saved in Admin → Help videos
// (settings.help_overrides). Pure (no server imports) so the page, sitemaps, /llms-full.txt and tests share it.
import { HELP_TOPICS, helpMedia, type HelpStep, type HelpTopic } from './topics';
import { HELP_MEDIA } from './media';

export type HelpOverride = {
  title?: string; titleAr?: string; summary?: string; summaryAr?: string;
  steps?: HelpStep[];
  /** replacement media URLs (same-site path or https://) */
  mp4?: string; webm?: string; poster?: string; vttEn?: string; vttAr?: string;
  /** seconds, when a swapped video has another length */
  duration?: number;
  hidden?: boolean;
  updatedAt?: string;
};
export type HelpView = HelpTopic & {
  hidden: boolean; edited: boolean;
  media: { mp4: string; webm: string; poster: string; vttEn: string; vttAr: string; duration: number; bytes: number; hasWebm: boolean; uploadDate: string };
};

export const readHelpOverrides = (settings: Record<string, any> | null | undefined): Record<string, HelpOverride> => {
  const o = settings?.help_overrides;
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
};

/** a media URL the page may embed: our own path, or https */
export const safeMediaUrl = (u: unknown) => {
  const s = String(u ?? '').trim();
  return /^\/(?!\/)[A-Za-z0-9/_.,%-]+$/.test(s) || /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9/_.,%~+-]*)?$/.test(s) ? s : '';
};

export function helpView(t: HelpTopic, o: HelpOverride = {}): HelpView {
  const m = helpMedia(t.slug), info = HELP_MEDIA[t.slug];
  const steps = Array.isArray(o.steps) && o.steps.length ? o.steps.filter((x) => x && x.en).map((x) => ({ en: String(x.en), ar: String(x.ar || '') })) : t.steps;
  return {
    ...t,
    title: o.title || t.title, titleAr: o.titleAr || t.titleAr, summary: o.summary || t.summary, summaryAr: o.summaryAr || t.summaryAr,
    steps, hidden: !!o.hidden, edited: Object.keys(o).some((k) => k !== 'updatedAt'),
    media: {
      mp4: safeMediaUrl(o.mp4) || m.mp4, webm: safeMediaUrl(o.webm) || m.webm, poster: safeMediaUrl(o.poster) || m.poster,
      vttEn: safeMediaUrl(o.vttEn) || m.vttEn, vttAr: safeMediaUrl(o.vttAr) || m.vttAr,
      duration: Number(o.duration) > 0 ? Math.round(Number(o.duration)) : info?.duration || 0,
      bytes: o.mp4 ? 0 : info?.bytes || 0, hasWebm: !!o.webm || !!info?.webm,
      uploadDate: (o.mp4 && o.updatedAt) || info?.recorded || '2026-11-04',
    },
  };
}

/** every topic with its admin edits; hidden ones only when asked (admin) */
export function helpTopics(settings: Record<string, any> | null | undefined, o: { includeHidden?: boolean } = {}): HelpView[] {
  const ov = readHelpOverrides(settings);
  return HELP_TOPICS.map((t) => helpView(t, ov[t.slug])).filter((t) => o.includeHidden || !t.hidden);
}

export const isoDuration = (s: number) => `PT${Math.floor(s / 60) ? `${Math.floor(s / 60)}M` : ''}${s % 60}S`;
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
