// SEO content engine: pure rules (no imports, so tests load it directly with --experimental-strip-types).
// Workflow states, calendar slots (Asia/Dubai), cron selection, settings, cost estimate, slug/meta limits,
// title overlap (cannibalization) and section replacement in a Markdown article.

export type Track = 'uae' | 'global';
export const TRACKS: Track[] = ['uae', 'global'];
export const TRACK_LABEL: Record<Track, string> = { uae: 'UAE / GCC', global: 'Global' };
export type Intent = 'informational' | 'commercial' | 'transactional';
export const INTENTS: Intent[] = ['informational', 'commercial', 'transactional'];

/* ------------------------------------------------------------------ workflow */
export type IdeaState = 'idea' | 'approved' | 'drafting' | 'draft_ready' | 'in_review' | 'scheduled' | 'published' | 'rejected';
export const STATES: IdeaState[] = ['idea', 'approved', 'drafting', 'draft_ready', 'in_review', 'scheduled', 'published', 'rejected'];
export const STATE_LABEL: Record<IdeaState, string> = {
  idea: 'Idea', approved: 'Approved', drafting: 'Drafting', draft_ready: 'Draft ready', in_review: 'In review',
  scheduled: 'Scheduled', published: 'Published', rejected: 'Rejected',
};
/** Badge tone per state (admin UI). */
export const STATE_TONE: Record<string, string> = { idea: 'gray', approved: 'blue', drafting: 'yellow', draft_ready: 'yellow', in_review: 'yellow', scheduled: 'blue', published: 'green', rejected: 'red' };
/** Allowed moves. Publishing always passes through an owner action (in_review/draft_ready → scheduled/published). */
const MOVES: Record<IdeaState, IdeaState[]> = {
  idea: ['approved', 'rejected'],
  approved: ['drafting', 'idea', 'rejected'],
  drafting: ['draft_ready', 'approved'], // approved again when generation failed
  draft_ready: ['in_review', 'drafting', 'scheduled', 'published', 'rejected'],
  in_review: ['draft_ready', 'drafting', 'scheduled', 'published', 'rejected'],
  scheduled: ['in_review', 'published'],
  published: ['in_review'], // unpublished from the blog
  rejected: ['idea'],
};
export const canMove = (from: string, to: string) => !!MOVES[from as IdeaState]?.includes(to as IdeaState);
export const nextStates = (from: string): IdeaState[] => MOVES[from as IdeaState] || [];
export class StateError extends Error {}
/** Throws StateError for a move the workflow does not allow. */
export function assertMove(from: string, to: string) {
  if (!canMove(from, to)) throw new StateError(`Cannot move from "${STATE_LABEL[from as IdeaState] || from}" to "${STATE_LABEL[to as IdeaState] || to}"`);
}

/** State an idea should show, given its linked post (the owner can also publish/unpublish from the blog editor). */
export function reconcileState(state: IdeaState, post: { status: string; publishAt: Date | string | null } | null, now = Date.now()): IdeaState {
  if (!post || state === 'rejected' || state === 'idea' || state === 'approved' || state === 'drafting') return state;
  if (post.status === 'PUBLISHED') {
    const at = post.publishAt ? new Date(post.publishAt).getTime() : 0;
    return at > now ? 'scheduled' : 'published';
  }
  if (state === 'scheduled' || state === 'published') return 'in_review';
  return state;
}

/* ------------------------------------------------------------------ settings */
export type ContentSettings = {
  enabled: boolean;
  perMonth: Record<Track, number>;
  autoDraft: boolean; // cron drafts approved calendar items due soon
  draftLeadDays: number;
  autoPublish: boolean; // autopilot: cron picks the next topics, drafts them and publishes drafts that pass every check (failed checks wait for the owner)
  perRun: number; // drafts per cron run
  minWords: number;
  maxWords: number;
  publishHour: number; // Asia/Dubai
  notify: boolean;
  arabicDefault: boolean;
  monthlyCapUsd: number; // content-engine spend cap on top of the AI assistant caps
  seedKeywords: string[];
};
export const DEFAULT_CONTENT: ContentSettings = {
  enabled: true, perMonth: { uae: 4, global: 4 }, autoDraft: true, draftLeadDays: 7, autoPublish: true, perRun: 2,
  minWords: 1200, maxWords: 2000, publishHour: 9, notify: true, arabicDefault: false, monthlyCapUsd: 10, seedKeywords: [],
};
const n = (v: unknown, d: number, lo: number, hi: number) => { const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x * 100) / 100)) : d; };
const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : v === 'true' || v === 'on' ? true : v === 'false' ? false : d);
export function normalizeContent(raw: unknown): ContentSettings {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_CONTENT;
  const minWords = Math.round(n(r.minWords, d.minWords, 300, 5000));
  return {
    enabled: b(r.enabled, d.enabled),
    perMonth: { uae: Math.round(n(r.perMonth?.uae, d.perMonth.uae, 0, 31)), global: Math.round(n(r.perMonth?.global, d.perMonth.global, 0, 31)) },
    autoDraft: b(r.autoDraft, d.autoDraft),
    draftLeadDays: Math.round(n(r.draftLeadDays, d.draftLeadDays, 1, 30)),
    autoPublish: b(r.autoPublish, d.autoPublish),
    perRun: Math.round(n(r.perRun, d.perRun, 1, 5)),
    minWords,
    maxWords: Math.max(minWords + 100, Math.round(n(r.maxWords, d.maxWords, 400, 8000))),
    publishHour: Math.round(n(r.publishHour, d.publishHour, 0, 23)),
    notify: b(r.notify, d.notify),
    arabicDefault: b(r.arabicDefault, d.arabicDefault),
    monthlyCapUsd: n(r.monthlyCapUsd, d.monthlyCapUsd, 0, 10_000),
    seedKeywords: (Array.isArray(r.seedKeywords) ? r.seedKeywords : String(r.seedKeywords || '').split(/\r?\n|,/))
      .map((x: unknown) => String(x).trim()).filter((x: string) => x.length >= 2 && x.length <= 80).slice(0, 60),
  };
}

/* ------------------------------------------------------------------ slugs and meta limits */
export const META_TITLE_MAX = 60;
export const META_DESC_MAX = 155;
export const SLUG_MAX = 75;
const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'with', 'your', 'you', 'is', 'are', 'how', 'what', 'why', 'do', 'does', 'it', 'its', 'at', 'by', 'from', 'guide']);
/** URL slug from a title or keyword: lowercase ASCII words joined by hyphens, filler words dropped when long. */
export function makeSlug(s: string, max = SLUG_MAX) {
  const words = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/\.(?=[a-z])/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const kept = words.length > 6 ? words.filter((w, i) => i === 0 || !STOP.has(w)) : words;
  let out = '';
  for (const w of kept) { const next = out ? `${out}-${w}` : w; if (next.length > max) break; out = next; }
  return out;
}
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const validSlug = (s: string) => SLUG_RE.test(s) && s.length <= 100;
/** Cut on a word boundary to at most `max` characters (no trailing punctuation, no ellipsis). */
export function clampText(s: string, max: number) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const i = cut.lastIndexOf(' ');
  return (i > max * 0.6 ? cut.slice(0, i) : t.slice(0, max)).replace(/[\s,;:.\-–—|]+$/, '');
}
export const metaTitle = (s: string) => clampText(s, META_TITLE_MAX);
export const metaDescription = (s: string) => clampText(s, META_DESC_MAX);

/* ------------------------------------------------------------------ calendar (Asia/Dubai, UTC+4, no DST) */
const DUBAI_OFFSET_MS = 4 * 3600_000;
/** "YYYY-MM" of a moment in Dubai. */
export const monthKey = (d: Date | number) => new Date(new Date(d).getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 7);
export function addMonths(key: string, k: number) {
  const [y, m] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  return t.toISOString().slice(0, 7);
}
/** A Dubai wall-clock date/time as a UTC Date. */
export const dubaiTime = (y: number, m: number, day: number, hour = 9, min = 0) => new Date(Date.UTC(y, m - 1, day, hour, min) - DUBAI_OFFSET_MS);
/** "2026-11-20T09:00" (Dubai) → Date; null when invalid. */
export function parseDubaiLocal(v: string): Date | null {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = dubaiTime(+m[1], +m[2], +m[3], +m[4], +m[5]);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Date → "2026-11-20T09:00" in Dubai (for datetime-local inputs). */
export const toDubaiLocal = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 16) : '');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Evenly spread publishing slots for a track in a month (UAE and Global offset by two days so they alternate). */
export function monthSlots(key: string, perMonth: number, track: Track, hour = 9): Date[] {
  if (perMonth <= 0) return [];
  const [y, m] = key.split('-').map(Number);
  const days = daysIn(y, m);
  const step = days / perMonth;
  const off = track === 'uae' ? 0 : 2;
  const out: Date[] = [];
  for (let i = 0; i < perMonth; i++) {
    const day = Math.min(days, Math.max(1, Math.round(step * i + step / 2) - 1 + off));
    out.push(dubaiTime(y, m, day, hour));
  }
  return out;
}
/** The first free slot for a track from `now` on (this month, then the following ones), or null when all are taken. */
export function nextFreeSlot(o: { track: Track; perMonth: number; taken: (Date | string | null)[]; now: Date | number; hour?: number; months?: number }): Date | null {
  const takenDays = new Set(o.taken.filter(Boolean).map((t) => new Date(new Date(t as any).getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10)));
  const now = new Date(o.now).getTime();
  let key = monthKey(now);
  for (let k = 0; k < (o.months || 6); k++, key = addMonths(key, 1)) {
    const slots = monthSlots(key, o.perMonth, o.track, o.hour ?? 9);
    const usedThisMonth = o.taken.filter((t) => t && monthKey(new Date(t as any)) === key).length;
    if (usedThisMonth >= o.perMonth) continue;
    for (const s of slots) {
      const day = new Date(s.getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
      if (s.getTime() > now + 3600_000 && !takenDays.has(day)) return s;
    }
  }
  return null;
}
/** Quota use per track for a month: planned items (approved or later, not rejected) with a slot in that month. */
export function quotaUse(ideas: { track: string; state: string; plannedFor: Date | string | null }[], key: string) {
  const out: Record<Track, number> = { uae: 0, global: 0 };
  for (const i of ideas) {
    if (!i.plannedFor || i.state === 'idea' || i.state === 'rejected') continue;
    if (monthKey(new Date(i.plannedFor)) === key && (i.track === 'uae' || i.track === 'global')) out[i.track]++;
  }
  return out;
}

/* ------------------------------------------------------------------ cron selection */
export type CronIdea = { id: string; state: string; plannedFor: Date | string | null; postId: string | null; priority: number; checks?: { status: string }[] };
/** Approved calendar items due within `leadDays` (or overdue) that have no draft yet: soonest first, then priority. */
export function selectForDrafting<T extends CronIdea>(ideas: T[], now: Date | number, leadDays: number, limit: number): T[] {
  const until = new Date(now).getTime() + leadDays * 86_400_000;
  return ideas.filter((i) => i.state === 'approved' && !i.postId && i.plannedFor && new Date(i.plannedFor).getTime() <= until)
    .sort((a, b) => new Date(a.plannedFor!).getTime() - new Date(b.plannedFor!).getTime() || b.priority - a.priority)
    .slice(0, Math.max(0, limit));
}
/** Scheduled items whose publish time has passed (their post goes live by itself; the cron records it and pings search engines). */
export function selectDuePublished<T extends CronIdea>(ideas: T[], now: Date | number): T[] {
  const t = new Date(now).getTime();
  return ideas.filter((i) => i.state === 'scheduled' && !!i.postId && !!i.plannedFor && new Date(i.plannedFor).getTime() <= t);
}
/** With auto-publish on: fresh drafts that passed every check (no "fail") get scheduled on their calendar slot. */
export function selectAutoSchedule<T extends CronIdea>(ideas: T[], autoPublish: boolean): T[] {
  if (!autoPublish) return [];
  return ideas.filter((i) => i.state === 'draft_ready' && !!i.postId && !!i.plannedFor && (i.checks || []).length > 0 && !(i.checks || []).some((c) => c.status === 'fail'));
}

/* ------------------------------------------------------------------ cost */
export type Price = { in: number; out: number; cacheWrite?: number; cacheRead?: number };
/** Typical token use per step (measured shape of the prompts; real numbers are logged per article). */
export const TYPICAL_TOKENS = {
  draft: { input: 7000, output: 4200 },
  arabic: { input: 5500, output: 6000 },
  review: { input: 4500, output: 500 },
  ideas: { input: 5000, output: 3500 }, // per batch of ~12 ideas
};
const usd = (p: Price, t: { input: number; output: number }) => (t.input * p.in + t.output * p.out) / 1e6;
/** Estimated USD for one article (draft + AI review, optionally the Arabic version). */
export function estimateArticleCost(prices: Record<string, Price>, models: { chat: string; fast: string }, arabic = false) {
  const big = prices[models.chat] || { in: 2, out: 10 }, small = prices[models.fast] || { in: 0.1, out: 0.5 };
  const en = usd(big, TYPICAL_TOKENS.draft) + usd(small, TYPICAL_TOKENS.review);
  const total = en + (arabic ? usd(big, TYPICAL_TOKENS.arabic) + usd(small, TYPICAL_TOKENS.review) : 0);
  return Math.round(total * 1000) / 1000;
}
export const estimateIdeasCost = (prices: Record<string, Price>, fast: string) => Math.round(usd(prices[fast] || { in: 0.1, out: 0.5 }, TYPICAL_TOKENS.ideas) * 10000) / 10000;

/* ------------------------------------------------------------------ overlap (cannibalization) */
export const words = (s: string) => String(s || '').toLowerCase().replace(/\.(?=[a-z]{2,})/g, ' dot').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim().split(' ').filter((w) => w && !STOP.has(w));
const stem = (w: string) => w.length > 4 ? w.replace(/(ing|es|s)$/, '') : w;
export function tokenJaccard(a: string, b: string) {
  const A = new Set(words(a).map(stem)), B = new Set(words(b).map(stem));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
export type Existing = { path: string; title: string; slug?: string };
/** Closest existing page for a working title/keyword/slug, with a 0-1 score. */
export function closestExisting(idea: { title: string; primaryKeyword?: string; slug?: string }, existing: Existing[]) {
  let best: { page: Existing; score: number } | null = null;
  for (const e of existing) {
    const s = Math.max(tokenJaccard(idea.title, e.title), idea.primaryKeyword ? tokenJaccard(idea.primaryKeyword, e.title) * 0.9 : 0,
      idea.slug && e.slug ? (idea.slug === e.slug ? 1 : tokenJaccard(idea.slug.replace(/-/g, ' '), e.slug.replace(/-/g, ' '))) : 0);
    if (!best || s > best.score) best = { page: e, score: Math.round(s * 100) / 100 };
  }
  return best;
}
/** drop: same topic as an existing page; warn: related page to link to instead of competing with. */
export const overlapLevel = (score: number): 'drop' | 'warn' | 'ok' => (score >= 0.7 ? 'drop' : score >= 0.4 ? 'warn' : 'ok');

/* ------------------------------------------------------------------ Markdown sections */
/** Split a Markdown body into the part before the first H2 and the H2 sections (heading text + body). */
export function splitSections(md: string): { head: string; sections: { heading: string; body: string }[] } {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const out: { heading: string; body: string }[] = [];
  const head: string[] = [];
  let cur: { heading: string; body: string[] } | null = null;
  let fence = false;
  for (const l of lines) {
    if (/^\s*```/.test(l)) fence = !fence;
    const m = !fence && l.match(/^##\s+(.+?)\s*#*\s*$/);
    if (m) { if (cur) out.push({ heading: cur.heading, body: cur.body.join('\n').trim() }); cur = { heading: m[1].trim(), body: [] }; continue; }
    (cur ? cur.body : head).push(l);
  }
  if (cur) out.push({ heading: cur.heading, body: cur.body.join('\n').trim() });
  return { head: head.join('\n').trim(), sections: out };
}
export function joinSections(p: { head: string; sections: { heading: string; body: string }[] }) {
  return [p.head, ...p.sections.map((s) => `## ${s.heading}\n\n${s.body}`.trim())].filter(Boolean).join('\n\n') + '\n';
}
/** Replace the body of the H2 section with this heading (case-insensitive). Returns null when there is no such section. */
export function replaceSection(md: string, heading: string, body: string, newHeading?: string): string | null {
  const p = splitSections(md);
  const i = p.sections.findIndex((s) => s.heading.toLowerCase() === heading.trim().toLowerCase());
  if (i < 0) return null;
  const clean = String(body || '').replace(/^##\s+.*\n+/, '').trim();
  p.sections[i] = { heading: (newHeading || p.sections[i].heading).trim(), body: clean };
  return joinSections(p);
}

/* ------------------------------------------------------------------ seasonal calendar */
// Months only, no invented dates. Lunar holidays move about 11 days earlier every year: confirm the dates before planning.
export const SEASONAL: Record<Track, Record<number, string[]>> = {
  uae: {
    1: ['Dubai Shopping Festival season (usually mid-December to January)', 'new-year budgets and website refresh for SMEs'],
    2: ['Ramadan preparation for online shops (lunar date, confirm the announced start)'],
    3: ['Ramadan and Eid al-Fitr traffic (lunar dates, confirm)', 'end of Q1 company setup and license renewals'],
    4: ['post-Eid sales', 'Q2 marketing plans for UAE SMEs'],
    5: ['Eid al-Adha preparation (lunar date, confirm)'],
    6: ['summer season: slower traffic, good time for migrations and redesigns'],
    7: ['summer sales and travel season'],
    8: ['back-to-school e-commerce'],
    9: ['back to business after summer', 'tech event season prep (GITEX is usually in October)'],
    10: ['GITEX season and tech launches', 'cybersecurity awareness month'],
    11: ['White Friday / Black Friday sales prep', 'UAE National Day campaigns (2 December)'],
    12: ['UAE National Day (2 December)', 'Dubai Shopping Festival begins (usually mid-December)', 'year-end VAT invoicing checks'],
  },
  global: {
    1: ['new-year website refresh', 'security and backup resolutions'],
    2: ['spring e-commerce prep'],
    3: ['spring cleanup: updates, plugins, unused accounts'],
    4: ['site speed before peak season'],
    5: ['mid-year planning for small businesses'],
    6: ['mid-year sales', 'migrations during quieter weeks'],
    7: ['summer projects: redesigns and replatforming'],
    8: ['back-to-school e-commerce'],
    9: ['Q4 readiness: capacity, backups and email deliverability'],
    10: ['Cybersecurity Awareness Month (October)', 'holiday season preparation'],
    11: ['Black Friday / Cyber Monday traffic readiness'],
    12: ['holiday traffic and year-end backups', 'planning next year’s website'],
  },
};
/** Seasonal hooks for the next `n` months from a month key. */
export function seasonalHints(track: Track, fromKey: string, nMonths = 3) {
  const out: { month: string; hints: string[] }[] = [];
  for (let k = 0; k < nMonths; k++) {
    const key = addMonths(fromKey, k);
    out.push({ month: key, hints: SEASONAL[track][Number(key.slice(5, 7))] || [] });
  }
  return out;
}
