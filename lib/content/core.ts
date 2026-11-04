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
  /** Daily cadence: articles per month, spread evenly over the days (1–2 a day for 50). Overridden by postsPerDay. */
  monthlyTarget: number;
  /** Fixed number of articles every day (0–10), or null = derive from monthlyTarget. */
  postsPerDay: number | null;
  /** Publish times (Dubai, "HH:MM"); with fewer posts than times the engine spreads them (first and last for 2 a day). */
  publishTimes: string[];
  jitterMin: number; // ± minutes around each publish time (deterministic per day, so times never repeat to the minute)
  minGapHours: number; // minimum hours between two publishes
  tracks: Track[]; // tracks the autopilot uses (both on: about 1 slot in 10 on the UAE track, see trackForSlot)
  categories: string[]; // enabled topic categories (CATEGORIES ids)
  clusterCooldownDays: number; // the same narrow topic cluster is not reused within this many days
  minQualityScore: number; // 0–100: autopilot publishes only drafts at or above this score and with no failed check
  /** legacy monthly quota per track (manual planning; the daily cadence replaces it) */
  perMonth: Record<Track, number>;
  autoDraft: boolean; // cron drafts approved calendar items due soon
  draftLeadDays: number;
  autoPublish: boolean; // autopilot: picks topics, drafts them and publishes drafts that pass every gate (failed ones wait for the owner)
  perRun: number; // drafts per run (legacy daily run)
  minWords: number;
  maxWords: number;
  publishHour: number; // Asia/Dubai (manual approvals without a daily cadence)
  notify: boolean;
  arabicDefault: boolean;
  /** autopilot: share of articles that also get an Arabic version (0–1; 0.2 = 1 in 5), within the monthly cap */
  arabicShare: number;
  monthlyCapUsd: number; // content-engine spend cap on top of the AI assistant caps
  seedKeywords: string[];
  /** settings schema version: saved settings older than 2 get the daily-cadence defaults (autopilot on, cap raised) */
  v: number;
  /** topic-mix version: a category list saved before 1 gets the categories added with it (infra-news) switched on */
  mixV?: number;
};
/** Categories added by topic-mix version 1: switched on in category lists saved before it. */
export const MIX_V1_ADDED = ['infra-news'];
export const SETTINGS_VERSION = 2;
/** Default cap: about 55 English articles a month cost ≈ $4–5 at the default prices; $12 leaves ≥30% headroom even when
 *  every article also gets an Arabic version (≈ $9.5 for 55), plus retries after failed gates. */
export const DEFAULT_CAP_USD = 12;
export const DEFAULT_CONTENT: ContentSettings = {
  enabled: true, monthlyTarget: 50, postsPerDay: null, publishTimes: ['09:00', '13:30', '18:00'], jitterMin: 20, minGapHours: 4,
  tracks: ['uae', 'global'], categories: [], clusterCooldownDays: 14, minQualityScore: 80,
  perMonth: { uae: 4, global: 4 }, autoDraft: true, draftLeadDays: 7, autoPublish: true, perRun: 2,
  minWords: 1200, maxWords: 2000, publishHour: 9, notify: true, arabicDefault: false, arabicShare: 0.2, monthlyCapUsd: DEFAULT_CAP_USD, seedKeywords: [], v: SETTINGS_VERSION,
};
const n = (v: unknown, d: number, lo: number, hi: number) => { const x = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x * 100) / 100)) : d; };
const b = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : v === 'true' || v === 'on' ? true : v === 'false' ? false : d);
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
export const timeToMin = (t: string) => { const m = String(t).trim().match(TIME_RE); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; };
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const list = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split(/\r?\n|,|\s+/)).map((x) => String(x).trim()).filter(Boolean);
export function normalizeContent(raw: unknown): ContentSettings {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_CONTENT;
  const legacy = r && Object.keys(r).length > 0 && !(Number(r.v) >= SETTINGS_VERSION);
  const minWords = Math.round(n(r.minWords, d.minWords, 300, 5000));
  const times = [...new Set(list(r.publishTimes).map(timeToMin).filter((m) => m >= 0))].sort((a, c) => a - c).slice(0, 10).map(minToTime);
  const ppd = r.postsPerDay === null || r.postsPerDay === undefined || r.postsPerDay === '' ? null : Math.round(n(r.postsPerDay, -1, -1, 10));
  const tracks = (Array.isArray(r.tracks) ? r.tracks : d.tracks).filter((t: unknown): t is Track => t === 'uae' || t === 'global');
  const saved = (Array.isArray(r.categories) ? r.categories : []).map(String).filter((c: string) => CATEGORY_IDS.has(c));
  const cats = saved.length && !(Number(r.mixV) >= 1) ? [...saved, ...MIX_V1_ADDED] : saved;
  const cap = n(r.monthlyCapUsd, d.monthlyCapUsd, 0, 10_000);
  return {
    enabled: b(r.enabled, d.enabled),
    monthlyTarget: Math.round(n(r.monthlyTarget, d.monthlyTarget, 0, 310)),
    postsPerDay: ppd === null || ppd < 0 ? null : ppd,
    publishTimes: times.length ? times : d.publishTimes,
    jitterMin: Math.round(n(r.jitterMin, d.jitterMin, 0, 60)),
    minGapHours: n(r.minGapHours, d.minGapHours, 0, 12),
    tracks: tracks.length ? [...new Set(tracks)] as Track[] : d.tracks,
    categories: cats.length ? [...new Set(cats)] as string[] : CATEGORIES.map((c) => c.id),
    clusterCooldownDays: Math.round(n(r.clusterCooldownDays, d.clusterCooldownDays, 0, 90)),
    minQualityScore: Math.round(n(r.minQualityScore, d.minQualityScore, 0, 100)),
    perMonth: { uae: Math.round(n(r.perMonth?.uae, d.perMonth.uae, 0, 31)), global: Math.round(n(r.perMonth?.global, d.perMonth.global, 0, 31)) },
    autoDraft: b(r.autoDraft, d.autoDraft),
    draftLeadDays: Math.round(n(r.draftLeadDays, d.draftLeadDays, 1, 30)),
    // settings saved before the daily cadence existed: the autopilot is switched on with the new defaults
    autoPublish: legacy ? true : b(r.autoPublish, d.autoPublish),
    perRun: Math.round(n(r.perRun, d.perRun, 1, 5)),
    minWords,
    maxWords: Math.max(minWords + 100, Math.round(n(r.maxWords, d.maxWords, 400, 8000))),
    publishHour: Math.round(n(r.publishHour, d.publishHour, 0, 23)),
    notify: b(r.notify, d.notify),
    arabicDefault: b(r.arabicDefault, d.arabicDefault),
    arabicShare: n(r.arabicShare, d.arabicShare, 0, 1),
    monthlyCapUsd: legacy ? Math.max(cap, d.monthlyCapUsd) : cap,
    seedKeywords: (Array.isArray(r.seedKeywords) ? r.seedKeywords : String(r.seedKeywords || '').split(/\r?\n|,/))
      .map((x: unknown) => String(x).trim()).filter((x: string) => x.length >= 2 && x.length <= 80).slice(0, 60),
    v: SETTINGS_VERSION,
    mixV: 1,
  };
}

/* ------------------------------------------------------------------ topic categories */
export type Category = { id: string; label: string; tracks: Track[]; blog: string; brief: string; needsSources?: boolean;
  /** timely news: ideas and drafts come from a web search at generation time, sourced, recent; no story → the slot is skipped */ news?: boolean };
/** Broad categories the autopilot rotates through so consecutive articles are unrelated. */
export const CATEGORIES: Category[] = [
  { id: 'hosting', label: 'Web hosting', tracks: ['uae', 'global'], blog: 'Hosting guides', brief: 'choosing, running and troubleshooting web hosting and WordPress sites' },
  { id: 'domains', label: 'Domains', tracks: ['uae', 'global'], blog: 'Domains', brief: 'domain names for businesses: naming a brand, choosing a TLD (.com, .net, .io, .ai, .ae and others), registration, transfers, renewals, buying and selling premium domains, DNS and brand protection' },
  { id: 'infra-news', label: 'Global internet & infrastructure news', tracks: ['global'], blog: 'Internet news', needsSources: true, news: true,
    brief: 'one real, recent event (found by web search, sourced) in global internet infrastructure: subsea cables and outages, data-centre builds and AI compute, cloud and CDN outages and their lessons, ICANN, new gTLD and registry policy changes, major DNS or BGP incidents, big ransomware attacks or breaches with lessons for businesses, AI regulation and data-residency laws, data-centre energy and cooling; told as what happened, why it matters for a business website, domain or email, and what to do' },
  { id: 'email', label: 'Business email', tracks: ['uae', 'global'], blog: 'Email', brief: 'business email, deliverability, mailbox management and email etiquette for teams' },
  { id: 'security', label: 'Security', tracks: ['uae', 'global'], blog: 'Security', brief: 'website and small-business cyber security, SSL, passwords, backups, phishing' },
  { id: 'ai-tools', label: 'AI tools for business', tracks: ['uae', 'global'], blog: 'AI for business', brief: 'practical, honest use of AI tools in small businesses (writing, support, analysis), with limits and privacy cautions; no hype' },
  { id: 'uae-business', label: 'UAE business setup & rules', tracks: ['uae'], blog: 'UAE business', needsSources: true, brief: 'UAE company setup, licences, VAT, e-invoicing, data protection and online-business rules: general, factual, citing official UAE government sources, telling readers to confirm with the authority' },
  { id: 'ecommerce', label: 'E-commerce', tracks: ['uae', 'global'], blog: 'E-commerce', brief: 'online shops: payments, checkout, product pages, shipping, returns, seasonal sales' },
  { id: 'marketing-seo', label: 'Marketing & SEO', tracks: ['uae', 'global'], blog: 'Grow online', brief: 'SEO, content, local search, social media and analytics for small businesses' },
  { id: 'productivity', label: 'Productivity', tracks: ['uae', 'global'], blog: 'Productivity', brief: 'tools and habits for small teams: collaboration, file sharing, remote work, calendars, documentation' },
  { id: 'cloud-vps', label: 'Cloud & VPS', tracks: ['uae', 'global'], blog: 'Servers', brief: 'VPS, dedicated servers, cloud concepts, Linux administration and scaling' },
  { id: 'developers', label: 'Developers', tracks: ['global'], blog: 'Developers', brief: 'web development workflows: Git deployment, staging, PHP/Node versions, databases, APIs, performance' },
  { id: 'startups', label: 'Startups & freelancers', tracks: ['uae', 'global'], blog: 'Startups', brief: 'launching and running a small online business or freelance practice: planning, tooling, budgeting the website' },
  { id: 'how-to', label: 'Step-by-step how-tos', tracks: ['uae', 'global'], blog: 'How-to', brief: 'one concrete task solved end to end (scenario-style walkthrough with a fictional, clearly hypothetical example business; never presented as a real customer)' },
  { id: 'tech-explainers', label: 'Tech explainers', tracks: ['global'], blog: 'Tech explained', needsSources: true, brief: 'plain-language explainers of internet technology and well-established industry changes (protocols, standards, browser or platform policy changes), citing the official announcement or specification; no speculation or unverified news' },
];
export const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));
export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id) || null;
/** Best-guess category for an idea without a tag (seed ideas, owner ideas). */
export function inferCategory(text: string): string {
  const t = String(text || '').toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(vat|licen[cs]e|trade licen|free zone|mainland|company setup|pdpl|e-?invoic|tdra|regulat)/, 'uae-business'],
    [/\b(spf|dkim|dmarc|email|mailbox|inbox|workspace)\b/, 'email'],
    [/\b(ssl|https|malware|phishing|password|2fa|security|backup|firewall|ddos)\b/, 'security'],
    [/\b(domain|dns|\.ae|registrar|nameserver|whois)\b/, 'domains'],
    [/\b(vps|dedicated|server|cloud|linux|ssh|rdp)\b/, 'cloud-vps'],
    [/\b(shop|store|e-?commerce|checkout|payment|woocommerce|cart)\b/, 'ecommerce'],
    [/\b(seo|marketing|google business|social|analytics|ads?)\b/, 'marketing-seo'],
    [/\b(ai|chatgpt|assistant|automation)\b/, 'ai-tools'],
    [/\b(git|staging|php|node|api|database|developer)\b/, 'developers'],
  ];
  for (const [re, id] of rules) if (re.test(t)) return id;
  return 'hosting';
}
/** Category and narrow topic cluster are kept as a tag at the start of the idea's rationale: "[cat:email|cl:dmarc reports] …". */
export function tagRationale(cat: string, cluster: string, text: string, max = 400) {
  const cl = String(cluster || '').toLowerCase().replace(/[|\]\[]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `[cat:${cat}${cl ? `|cl:${cl}` : ''}] ${String(text || '').replace(/^\[cat:[^\]]*\]\s*/, '')}`.slice(0, max);
}
export function readTags(rationale: string): { category: string; cluster: string; text: string } {
  const m = String(rationale || '').match(/^\[cat:([a-z-]+)(?:\|cl:([^\]]*))?\]\s*/);
  return m ? { category: m[1], cluster: (m[2] || '').trim(), text: rationale.slice(m[0].length) } : { category: '', cluster: '', text: String(rationale || '') };
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

/* ------------------------------------------------------------------ daily cadence */
/** "YYYY-MM-DD" of a moment in Dubai. */
export const dayKey = (d: Date | number | string) => new Date(new Date(d).getTime() + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
export const addDays = (key: string, k: number) => new Date(Date.parse(`${key}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const dayNumber = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86_400_000);
/** Small deterministic hash (FNV-1a) → [0, 1). */
export function hash01(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0) / 0x100000000;
}
/** Articles on a Dubai day: postsPerDay when set, else the monthly target spread evenly (50 in 30 days → 1,2,2,1,2…, exactly 50). */
export function postsForDay(key: string, cs: Pick<ContentSettings, 'monthlyTarget' | 'postsPerDay'>) {
  if (cs.postsPerDay !== null && cs.postsPerDay !== undefined) return Math.max(0, Math.min(10, cs.postsPerDay));
  const [y, m, d] = key.split('-').map(Number);
  const days = daysIn(y, m), t = Math.max(0, cs.monthlyTarget);
  return Math.min(10, Math.floor((t * d) / days) - Math.floor((t * (d - 1)) / days));
}
export const postsInMonth = (key: string, cs: Pick<ContentSettings, 'monthlyTarget' | 'postsPerDay'>) => {
  const [y, m] = key.split('-').map(Number);
  let sum = 0;
  for (let d = 1; d <= daysIn(y, m); d++) sum += postsForDay(`${key}-${String(d).padStart(2, '0')}`, cs);
  return sum;
};
export type DaySlot = { at: Date; track: Track; index: number; key: string };
const LATEST_MIN = 22 * 60 + 30; // nothing after 22:30 Dubai
/** Share of autopilot slots on the UAE track when both tracks are on (the rest is the global track): 1 slot in UAE_EVERY. */
export const UAE_EVERY = 10;
/** Track of the n-th slot of the calendar (n = day number × 3 + slot index): UAE for 1 slot in UAE_EVERY, else global. */
export function trackForSlot(n: number, tracks: Track[]): Track {
  if (tracks.length === 1) return tracks[0];
  if (!tracks.includes('uae') || !tracks.includes('global')) return tracks[((n % tracks.length) + tracks.length) % tracks.length];
  return ((n % UAE_EVERY) + UAE_EVERY) % UAE_EVERY === 0 ? 'uae' : 'global';
}
/** Publish slots of a Dubai day: spread over the configured times, at least minGapHours apart where the day allows it,
 *  ±jitterMin minutes (stable per day); about 1 slot in UAE_EVERY on the UAE track, the rest global (trackForSlot). */
export function dailySlots(key: string, cs: Pick<ContentSettings, 'monthlyTarget' | 'postsPerDay' | 'publishTimes' | 'jitterMin' | 'minGapHours' | 'tracks'>): DaySlot[] {
  const count = postsForDay(key, cs);
  if (count <= 0) return [];
  const times = (cs.publishTimes.length ? cs.publishTimes : DEFAULT_CONTENT.publishTimes).map(timeToMin).filter((x) => x >= 0).sort((a, c) => a - c);
  let mins: number[];
  if (count <= times.length) {
    mins = count === 1 ? [times[Math.floor((times.length - 1) / 2)]] : Array.from({ length: count }, (_, i) => times[Math.round((i * (times.length - 1)) / (count - 1))]);
  } else {
    const start = times[0], end = Math.max(times[times.length - 1], Math.min(LATEST_MIN, start + (count - 1) * cs.minGapHours * 60));
    mins = Array.from({ length: count }, (_, i) => Math.round(start + (i * (end - start)) / (count - 1)));
  }
  const gap = cs.minGapHours * 60;
  mins = mins.map((m, i) => Math.round(m + (hash01(`${key}#${i}`) * 2 - 1) * cs.jitterMin));
  for (let i = 1; i < mins.length; i++) if (mins[i] < mins[i - 1] + gap && mins[i - 1] + gap <= LATEST_MIN) mins[i] = mins[i - 1] + gap;
  for (let i = 1; i < mins.length; i++) if (mins[i] <= mins[i - 1]) mins[i] = mins[i - 1] + 1;
  const tracks = cs.tracks.length ? cs.tracks : TRACKS;
  const [y, mo, d] = key.split('-').map(Number);
  const off = dayNumber(key);
  return mins.map((m, i) => ({ at: dubaiTime(y, mo, d, Math.floor(Math.max(0, Math.min(m, 24 * 60 - 1)) / 60), Math.max(0, Math.min(m, 24 * 60 - 1)) % 60), track: trackForSlot(off * 3 + i, tracks), index: i, key }));
}
/** Half the distance to the neighbouring slot: an idea planned within it belongs to the slot. */
export function slotWindowMs(slots: DaySlot[], i: number) {
  const prev = i > 0 ? slots[i].at.getTime() - slots[i - 1].at.getTime() : Infinity;
  const next = i < slots.length - 1 ? slots[i + 1].at.getTime() - slots[i].at.getTime() : Infinity;
  return Math.min(3 * 3600_000, prev / 2, next / 2);
}
export type SlotIdea = { id: string; state: string; plannedFor: Date | string | null; title?: string; error?: string; postId?: string | null; checks?: { status: string }[] };
/** Pair each slot with the planned idea nearest to it (approved or later, same Dubai day, inside the slot window). */
export function matchSlots<T extends SlotIdea>(slots: DaySlot[], ideas: T[]): { slot: DaySlot; idea: T | null }[] {
  const used = new Set<string>();
  const live = ideas.filter((i) => i.plannedFor && !['idea', 'rejected'].includes(i.state));
  return slots.map((slot, k) => {
    const w = slotWindowMs(slots, k);
    let best: T | null = null, dist = Infinity;
    for (const i of live) {
      if (used.has(i.id)) continue;
      const t = new Date(i.plannedFor!).getTime();
      const dd = Math.abs(t - slot.at.getTime());
      if (dayKey(t) === slot.key && dd <= w && dd < dist) { best = i; dist = dd; }
    }
    if (best) used.add(best.id);
    return { slot, idea: best };
  });
}
export type SlotStatus = 'open' | 'idea' | 'drafting' | 'held' | 'ready' | 'scheduled' | 'published' | 'failed' | 'missed';
export const SLOT_LABEL: Record<SlotStatus, string> = { open: 'Topic not picked yet', idea: 'Topic picked', drafting: 'Drafting', held: 'Held: failed a quality gate', ready: 'Draft ready', scheduled: 'Scheduled', published: 'Published', failed: 'Failed', missed: 'Missed' };
export function slotStatus(idea: SlotIdea | null, slotAt: Date, now: number, failedReason?: string): SlotStatus {
  if (!idea) return failedReason ? 'failed' : slotAt.getTime() < now - 3600_000 ? 'missed' : 'open';
  if (idea.state === 'published') return 'published';
  if (idea.state === 'scheduled') return 'scheduled';
  if (idea.state === 'drafting') return 'drafting';
  if (idea.state === 'approved') return 'idea';
  if ((idea.checks || []).some((c) => c.status === 'fail')) return 'held';
  return 'ready';
}
/** The first free daily slot of a track from `now` on (or of any track when the track has none in the window). */
export function nextDailySlot(o: { cs: Parameters<typeof dailySlots>[1]; track?: Track; planned: SlotIdea[]; now: Date | number; days?: number; leadMs?: number }): DaySlot | null {
  const now = new Date(o.now).getTime();
  const lead = o.leadMs ?? 3600_000;
  let fallback: DaySlot | null = null;
  for (let k = 0; k < (o.days ?? 14); k++) {
    const key = addDays(dayKey(now), k);
    const slots = dailySlots(key, o.cs);
    for (const { slot, idea } of matchSlots(slots, o.planned)) {
      if (idea || slot.at.getTime() <= now + lead) continue;
      if (!o.track || slot.track === o.track) return slot;
      fallback ||= slot;
    }
  }
  return fallback;
}

/* ------------------------------------------------------------------ topic diversity */
export type TopicRef = { title: string; primaryKeyword?: string; slug?: string; category?: string; cluster?: string; at?: Date | string | null; where?: string };
const normKw = (s: string) => words(s).map(stem).sort().join(' ');
/** Reject a candidate topic that repeats or closely relates to anything published, drafted or queued:
 *  same primary keyword, same slug, near-duplicate title (token Jaccard ≥ 0.5), keyword ≈ another keyword (≥ 0.6),
 *  or the same narrow topic cluster within the cooldown. */
export function diversityCheck(c: TopicRef, refs: TopicRef[], o: { now: Date | number; cooldownDays: number }): { ok: true } | { ok: false; reason: string } {
  const now = new Date(o.now).getTime();
  const kw = c.primaryKeyword ? normKw(c.primaryKeyword) : '';
  const cl = c.cluster ? normKw(c.cluster) : '';
  for (const r of refs) {
    const label = `“${r.title}”${r.where ? ` (${r.where})` : ''}`;
    if (kw && r.primaryKeyword && normKw(r.primaryKeyword) === kw) return { ok: false, reason: `same primary keyword as ${label}` };
    if (c.slug && r.slug && c.slug === r.slug) return { ok: false, reason: `same URL slug as ${label}` };
    const tj = tokenJaccard(c.title, r.title);
    if (tj >= 0.5) return { ok: false, reason: `title too close to ${label} (${Math.round(tj * 100)}% overlap)` };
    if (c.primaryKeyword && r.primaryKeyword && tokenJaccard(c.primaryKeyword, r.primaryKeyword) >= 0.6) return { ok: false, reason: `keyword too close to ${label}` };
    if (c.primaryKeyword && tokenJaccard(c.primaryKeyword, r.title) >= 0.75) return { ok: false, reason: `keyword already covered by ${label}` };
    if (cl && r.cluster && o.cooldownDays > 0) {
      const at = r.at ? new Date(r.at).getTime() : now;
      const close = normKw(r.cluster) === cl || tokenJaccard(c.cluster!, r.cluster) >= 0.6;
      if (close && Math.abs(now - at) <= o.cooldownDays * 86_400_000) return { ok: false, reason: `topic cluster “${r.cluster}” used within ${o.cooldownDays} days (${label})` };
    }
  }
  return { ok: true };
}
/**
 * Editorial mix of the autopilot (owner's targets): domains ~40% (naming, TLD choice, transfers, premium domain buying
 * and selling, DNS, brand protection), global internet & infrastructure news ~25%, hosting / security / how-to and the
 * other categories ~25%, the UAE track ~10% (dailySlots). Shares are measured over the last MIX_WINDOW categorised
 * articles of every track.
 */
export const MIX_TARGETS: Record<string, number> = { domains: 0.4, 'infra-news': 0.25 };
export const DOMAIN_SHARE = MIX_TARGETS.domains;
export const MIX_WINDOW = 20;
/**
 * Category for the next slot: enabled for the track, never the same as the previous article. A MIX_TARGETS category
 * below its share comes first (the one furthest below); otherwise the least recently used of the other categories.
 */
export function pickCategory(o: { track: Track; enabled: string[]; recent: { category: string; at: Date | string | number }[]; avoid?: string[]; seed?: string }): string | null {
  const ok = CATEGORIES.filter((c) => c.tracks.includes(o.track) && (!o.enabled.length || o.enabled.includes(c.id)));
  if (!ok.length) return null;
  const sorted = [...o.recent].filter((r) => r.category).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const last = sorted[0]?.category;
  const lastUse = (id: string) => { const r = sorted.find((x) => x.category === id); return r ? new Date(r.at).getTime() : -Infinity; };
  const pool = ok.filter((c) => c.id !== last && !(o.avoid || []).includes(c.id));
  const from = pool.length ? pool : ok;
  const window = sorted.slice(0, MIX_WINDOW);
  const share = (id: string) => (window.length ? window.filter((r) => r.category === id).length / window.length : 0);
  const behind = from.filter((c) => MIX_TARGETS[c.id] && share(c.id) < MIX_TARGETS[c.id])
    .sort((a, b) => (MIX_TARGETS[b.id] - share(b.id)) - (MIX_TARGETS[a.id] - share(a.id)));
  if (behind.length) return behind[0].id;
  const rest = from.filter((c) => !MIX_TARGETS[c.id]);
  return [...(rest.length ? rest : from)].sort((a, b) => lastUse(a.id) - lastUse(b.id) || hash01(`${o.seed || ''}${a.id}`) - hash01(`${o.seed || ''}${b.id}`))[0].id;
}

/* ------------------------------------------------------------------ budget */
/** Why the content engine must stop spending (null = keep going). */
/**
 * Autopilot Arabic mix: does the next article get an Arabic version? `recent` = wantArabic of the latest autopilot
 * articles, newest first. Spaced evenly: one Arabic version every round(1 / share) articles (0.2 → 1 in 5, 0.5 →
 * every other one), and never a burst to "catch up" after the share is raised. The Arabic draft itself still passes
 * budgetGate(), so the monthly cap always wins.
 */
export function wantArabicNext(recent: boolean[], share: number): boolean {
  if (!(share > 0)) return false;
  if (share >= 1) return true;
  const gap = Math.max(1, Math.round(1 / share));
  return !recent.slice(0, gap - 1).some(Boolean);
}

export function capBlock(spentUsd: number, capUsd: number): string | null {
  if (capUsd <= 0) return 'The content engine budget is set to 0 (Content engine → Settings).';
  if (spentUsd >= capUsd) return `This month's content engine budget ($${capUsd}) is used up.`;
  return null;
}

/* ------------------------------------------------------------------ quality score */
/** 0–100: 100 minus 30 per failed check and 5 per warning. Autopilot publishes only with no fail and score ≥ threshold. */
export function qualityScore(checks: { status: string }[]) {
  if (!checks.length) return 0;
  const f = checks.filter((c) => c.status === 'fail').length, w = checks.filter((c) => c.status === 'warn').length;
  return Math.max(0, 100 - 30 * f - 5 * w);
}
export const passesGate = (checks: { status: string }[], minScore: number) => checks.length > 0 && !checks.some((c) => c.status === 'fail') && qualityScore(checks) >= minScore;

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
export function selectAutoSchedule<T extends CronIdea>(ideas: T[], autoPublish: boolean, minScore = 0): T[] {
  if (!autoPublish) return [];
  return ideas.filter((i) => i.state === 'draft_ready' && !!i.postId && !!i.plannedFor && passesGate(i.checks || [], minScore));
}

/* ------------------------------------------------------------------ cost */
export type Price = { in: number; out: number; cacheWrite?: number; cacheRead?: number };
/** Typical token use per step (measured shape of the prompts; real numbers are logged per article). */
export const TYPICAL_TOKENS = {
  draft: { input: 7000, output: 4200 },
  arabic: { input: 5500, output: 6000 },
  review: { input: 4500, output: 500 },
  ideas: { input: 7000, output: 2000 }, // per batch of ~5 ideas (prompt carries the list of previous titles)
};
const usd = (p: Price, t: { input: number; output: number }) => (t.input * p.in + t.output * p.out) / 1e6;
/** Estimated USD for one article (draft + AI review, optionally the Arabic version). */
export function estimateArticleCost(prices: Record<string, Price>, models: { chat: string; fast: string }, arabic = false) {
  const big = prices[models.chat] || { in: 2, out: 10 }, small = prices[models.fast] || { in: 0.1, out: 0.5 };
  const en = usd(big, TYPICAL_TOKENS.draft) + usd(small, TYPICAL_TOKENS.review);
  const total = en + (arabic ? usd(big, TYPICAL_TOKENS.arabic) + usd(small, TYPICAL_TOKENS.review) : 0);
  return Math.round(total * 1000) / 1000;
}
/** Monthly estimate for the daily cadence: articles × (article + a share of idea batches) × retry factor for drafts that fail a gate. */
export function estimateMonthlyCost(prices: Record<string, Price>, models: { chat: string; fast: string }, o: { articles: number; arabicShare?: number; retry?: number }) {
  const en = estimateArticleCost(prices, models), ar = estimateArticleCost(prices, models, true) - en;
  const ideas = estimateIdeasCost(prices, models.fast) / 2; // one 4–6 idea batch per ~2 articles
  const per = (en + ar * (o.arabicShare ?? 0)) * (o.retry ?? 1.2) + ideas;
  return { perArticle: Math.round(per * 1000) / 1000, month: Math.round(per * o.articles * 100) / 100 };
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
