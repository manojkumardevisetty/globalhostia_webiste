// A/B tests (Admin → Marketing → Experiments). Pure module: used by middleware.ts (edge), the page renderers,
// the event API and the tests. No personal data: a visitor is a random first-party id (cookie gh_ab, 90 days) that only
// picks a variant; the database keeps daily counts per experiment and variant (lib/abtest/store.ts).
//
// How a test runs
//   1. middleware.ts (abAssign, lib/abtest/edge.ts) sees a request for a page with a running experiment. Bots, Do-Not-Track /
//      Global Privacy Control, and (when the cookie banner is active) visitors without analytics consent always get the
//      control and no cookie. Everyone else gets hash(id + experiment) → variant (weights), stable for 90 days.
//   2. A non-control variant is passed to the renderer in the x-gh-ab request header, and the rewritten URL gets
//      ?_ab=<exp>.<variant> so the CDN keeps one copy per variant next to the control copy (the same scheme as x-gh-cur /
//      ?_cur=). The control copy is also what Googlebot gets: no cloaking, canonical unchanged.
//   3. The page renderer applies the variant's text / layout to its slots (lib/abtest/apply.ts).
//   4. /hp/pages/ab.js reports view / CTA click / add-to-cart; the server recomputes the visitor's variant from the cookie, so
//      the browser cannot pick its own bucket. Orders: whmcs.js tags the signed WHMCS cart with the assignments; the
//      AfterShoppingCartCheckout webhook then counts the order and its total (lib/abtest/store.ts).

export const AB_COOKIE = 'gh_ab';       // random visitor id (HttpOnly, 90 days)
export const AB_ASSIGN_COOKIE = 'gh_abv'; // "<exp>.<variant>~…" for the experiments the visitor saw (read by whmcs.js on my.globalhostia.com)
export const AB_DAYS = 90;
export const AB_PARAM = '_ab';    // internal query on the rewritten URL (stripped from incoming requests by middleware)
export const AB_DRAFT_PARAM = '_abd'; // internal: draft variant preview allowed (admin session checked by middleware)
export const AB_PREVIEW = 'ab';   // public preview link: /web-hosting?ab=<exp>.<variant>
export const AB_HEADER = 'x-gh-ab';        // request header from middleware to the renderer (incoming copies are dropped)
export const AB_DRAFT_HEADER = 'x-gh-abd';

export type AbStatus = 'draft' | 'running' | 'stopped';
export type AbMetric = 'cta' | 'cart' | 'order' | 'revenue';
export type SlotKind = 'text' | 'longtext' | 'layout';
export type Slot = { key: string; label: string; kind: SlotKind; hint?: string; options?: { v: string; label: string }[]; max?: number };
export type Target = { key: string; label: string; paths: string[]; slots: Slot[] };

/** Pages that can be tested and the parts of them a variant may change. Defaults (control) live in the page renderers. */
export const TARGETS: Target[] = [
  {
    key: 'hosting', label: 'Web / shared hosting page', paths: ['/web-hosting', '/shared-hosting'],
    slots: [
      { key: 'hero.title', label: 'Hero headline', kind: 'text', max: 120 },
      { key: 'hero.lead', label: 'Hero subheadline', kind: 'longtext', max: 320, hint: 'Tokens: {locations} (datacenter list).' },
      { key: 'hero.cta', label: 'Hero main button text', kind: 'text', max: 40 },
      { key: 'plans.title', label: 'Plans section heading', kind: 'text', max: 90 },
      { key: 'plans.layout', label: 'Plan layout', kind: 'layout', options: [
        { v: 'cards', label: 'Plan cards, middle plan highlighted (current)' },
        { v: 'table', label: 'Comparison table with order buttons' },
        { v: 'plain', label: 'Plan cards, no highlighted plan' },
      ] },
      { key: 'cta.title', label: 'Closing call-to-action heading', kind: 'text', max: 90 },
    ],
  },
  {
    key: 'domains', label: 'Domain registration page', paths: ['/domains-registration'],
    slots: [
      { key: 'hero.title', label: 'Hero headline', kind: 'text', max: 120 },
      { key: 'hero.lead', label: 'Hero subheadline', kind: 'longtext', max: 320, hint: 'Tokens: {count} (number of extensions), {from} (cheapest first-year price).' },
      { key: 'page.layout', label: 'Page layout', kind: 'layout', options: [
        { v: 'default', label: 'Search, trust strip, then prices (current)' },
        { v: 'pricing-first', label: 'Price table straight under the search' },
      ] },
      { key: 'cta.title', label: 'Closing call-to-action heading', kind: 'text', max: 90 },
    ],
  },
];
export const targetOf = (key: string) => TARGETS.find((t) => t.key === key);
/** Every path an experiment can run on (middleware only looks up experiments for these). */
export const AB_PATHS = new Set(TARGETS.flatMap((t) => t.paths));
export const normPath = (p: string) => ((p || '/').toLowerCase().replace(/\/+$/, '') || '/');

export type Variant = { key: string; name: string; weight: number; set: Record<string, string> };
export type Experiment = {
  id: string; name: string; target: string; paths: string[]; status: AbStatus; metric: AbMetric;
  variants: Variant[]; // variants[0] is the control (no changes)
  startAt: string; endAt: string; // optional schedule (ISO); empty = start / stop by hand
  notes: string; createdAt: string; startedAt: string; stoppedAt: string; winner: string;
};
export const VARIANT_KEYS = ['a', 'b', 'c', 'd'];
export const METRICS: { v: AbMetric; label: string }[] = [
  { v: 'cart', label: 'Add to cart (order button clicked)' },
  { v: 'order', label: 'Orders placed (WHMCS checkout)' },
  { v: 'cta', label: 'Any call-to-action click' },
  { v: 'revenue', label: 'Revenue per visitor' },
];

const s = (v: unknown, max = 400) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const iso = (v: unknown) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };
export const EXP_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** One experiment from stored / submitted JSON: unknown slots and values are dropped, weights clamped. */
export function normExperiment(raw: any): Experiment | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = s(raw.id, 40).toLowerCase();
  const target = targetOf(s(raw.target, 20));
  if (!EXP_ID_RE.test(id) || !target) return null;
  const paths = (Array.isArray(raw.paths) ? raw.paths : []).map((p: unknown) => normPath(s(p, 80))).filter((p: string) => target.paths.includes(p));
  const slots = new Map(target.slots.map((x) => [x.key, x]));
  const variants: Variant[] = (Array.isArray(raw.variants) ? raw.variants : []).slice(0, VARIANT_KEYS.length).map((v: any, i: number) => {
    const set: Record<string, string> = {};
    if (i > 0 && v?.set && typeof v.set === 'object') {
      for (const [k, val] of Object.entries(v.set)) {
        const slot = slots.get(k); if (!slot) continue;
        const t = s(val, slot.max || 320);
        if (!t) continue;
        if (slot.kind === 'layout' && !slot.options?.some((o) => o.v === t)) continue;
        set[k] = t;
      }
    }
    const w = Number(v?.weight);
    return { key: VARIANT_KEYS[i], name: s(v?.name, 60) || (i ? `Variant ${VARIANT_KEYS[i].toUpperCase()}` : 'Control'), weight: Number.isFinite(w) ? Math.max(0, Math.min(100, Math.round(w))) : 50, set };
  });
  const status: AbStatus = raw.status === 'running' || raw.status === 'stopped' ? raw.status : 'draft';
  const metric: AbMetric = METRICS.some((m) => m.v === raw.metric) ? raw.metric : 'cart';
  return {
    id, name: s(raw.name, 100) || id, target: target.key, paths: paths.length ? [...new Set<string>(paths)] : [...target.paths], status, metric, variants,
    startAt: iso(raw.startAt), endAt: iso(raw.endAt), notes: s(raw.notes, 1000), createdAt: iso(raw.createdAt), startedAt: iso(raw.startedAt), stoppedAt: iso(raw.stoppedAt),
    winner: VARIANT_KEYS.includes(raw.winner) ? raw.winner : '',
  };
}
export function normExperiments(raw: unknown): Experiment[] {
  let x: any = raw;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = []; } }
  const list = (Array.isArray(x) ? x : []).map(normExperiment).filter((e): e is Experiment => !!e);
  const seen = new Set<string>();
  return list.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

/** Problems that stop an experiment from being saved (draft) or started (strict). */
export function validateExperiment(e: Experiment, all: Experiment[], strict = false): string[] {
  const err: string[] = [];
  if (e.variants.length < 2) err.push('Add at least one variant next to the control');
  const total = e.variants.reduce((n, v) => n + v.weight, 0);
  if (total <= 0) err.push('Give at least one variant a traffic weight above 0');
  if (e.variants[0] && e.variants[0].weight <= 0) err.push('The control needs some traffic (weight above 0) to compare against');
  e.variants.slice(1).forEach((v) => { if (!Object.keys(v.set).length) err.push(`${v.name}: change at least one text or layout, otherwise it is the same as the control`); });
  const sig = (v: Variant) => JSON.stringify(Object.entries(v.set).sort());
  const sigs = e.variants.slice(1).map(sig);
  if (new Set(sigs).size !== sigs.length) err.push('Two variants are identical');
  if (e.startAt && e.endAt && Date.parse(e.endAt) <= Date.parse(e.startAt)) err.push('The end date must be after the start date');
  if (strict) {
    const clash = all.find((o) => o.id !== e.id && isLive(o) && o.paths.some((p) => e.paths.includes(p)));
    if (clash) err.push(`"${clash.name}" is already running on ${clash.paths.filter((p) => e.paths.includes(p)).join(', ')}. Stop it first: one test per page keeps the results clean.`);
  }
  return err;
}

/** Running now (status running and inside the optional start / end window). */
export function isLive(e: Experiment, now = Date.now()) {
  if (e.status !== 'running') return false;
  if (e.startAt && Date.parse(e.startAt) > now) return false;
  if (e.endAt && Date.parse(e.endAt) <= now) return false;
  return true;
}

/* ------------------------------------------------------------------ assignment */
/** 32-bit FNV-1a with a murmur3 finaliser: fast, dependency-free, identical on the edge, in Node and in tests. */
export function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
/** Deterministic variant for (visitor id, experiment): the same visitor always lands in the same bucket. */
export function pickVariant(visitorId: string, exp: { id: string; variants: { key: string; weight: number }[] }): string {
  const vs = exp.variants.filter((v) => v.weight > 0);
  if (!vs.length) return exp.variants[0]?.key || 'a';
  const total = vs.reduce((n, v) => n + v.weight, 0);
  let x = (hash32(`${visitorId}:${exp.id}`) / 0x100000000) * total;
  for (const v of vs) { if (x < v.weight) return v.key; x -= v.weight; }
  return vs[vs.length - 1].key;
}
export const isVisitorId = (v?: string | null) => !!v && /^[a-z0-9]{16,40}$/.test(v);
export function newVisitorId() {
  const b = new Uint8Array(12); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ who takes part */
// Search engines, link previews, monitors, scripts and AI crawlers always see the control and are never counted.
const BOT_RE = /bot\/|\bbot\b|bot[;)]|\+https?:|crawl|spider|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|facebot|embedly|quora link|whatsapp|telegram|discord|slack|skype|preview|headless|lighthouse|pagespeed|chrome-lighthouse|gtmetrix|pingdom|uptime|monitor|statuscake|site24x7|curl\/|wget|python|httpx|aiohttp|requests|httpclient|okhttp|axios|node-fetch|undici|go-http|java\/|libwww|scrapy|phantomjs|selenium|puppeteer|playwright|chatgpt|gptbot|oai-searchbot|claude|anthropic|perplexity|bytespider|petalbot|yandex|baiduspider|duckduckbot|semrush|ahrefs|mj12|dotbot|applebot|archive\.org|feedfetcher|validator/i;
export const isBot = (ua?: string | null) => !ua || ua.length < 20 || BOT_RE.test(ua);

export type Eligibility = 'ok' | 'bot' | 'dnt' | 'consent';
/** Whether this visitor may be assigned and counted. Consent: only enforced when the site shows its cookie banner. */
export function eligibility(o: { ua?: string | null; dnt?: string | null; gpc?: string | null; consent?: string | null; consentRequired: boolean }): Eligibility {
  if (isBot(o.ua)) return 'bot';
  if (o.dnt === '1' || o.gpc === '1') return 'dnt';
  if (o.consentRequired && o.consent !== 'granted') return 'consent';
  return 'ok';
}

/** Compact running config for middleware (no texts): /api/ab/config. */
export type AbConfig = { consent: boolean; exps: { id: string; paths: string[]; variants: { key: string; weight: number }[] }[] };
export function edgeConfig(list: Experiment[], consentRequired: boolean, now = Date.now()): AbConfig {
  return { consent: consentRequired, exps: list.filter((e) => isLive(e, now)).map((e) => ({ id: e.id, paths: e.paths, variants: e.variants.map((v) => ({ key: v.key, weight: v.weight })) })) };
}

/** Assignments for one request path: [{exp, variant}] (control included). */
export function assignFor(cfg: AbConfig, path: string, visitorId: string) {
  const p = normPath(path);
  return cfg.exps.filter((e) => e.paths.includes(p)).map((e) => ({ exp: e.id, variant: pickVariant(visitorId, e) }));
}

/** "<exp>.<variant>" tokens (the _ab query and the gh_abv cookie). */
export const AB_TOKEN_RE = /^([a-z0-9][a-z0-9-]{1,39})\.([a-d])$/;
export function parseTokens(v?: string | null, max = 8): { exp: string; variant: string }[] {
  const out: { exp: string; variant: string }[] = [];
  for (const t of String(v || '').split(/[~,\s]+/)) {
    const m = t.match(AB_TOKEN_RE);
    if (m && !out.some((o) => o.exp === m[1])) out.push({ exp: m[1], variant: m[2] });
    if (out.length >= max) break;
  }
  return out;
}
export const tokens = (list: { exp: string; variant: string }[]) => list.map((x) => `${x.exp}.${x.variant}`).join('~');

/** Merge new assignments into the gh_abv cookie value, keeping only experiments that are still running. */
export function mergeAssignCookie(prev: string | undefined | null, add: { exp: string; variant: string }[], liveIds: Set<string>) {
  const keep = parseTokens(prev).filter((x) => liveIds.has(x.exp) && !add.some((a) => a.exp === x.exp));
  return tokens([...add, ...keep].slice(0, 8));
}

/** Fill {tokens} in admin-written copy with values the renderer provides (unknown tokens are removed). */
export function fillTokens(text: string, vars: Record<string, string> = {}) {
  return text.replace(/\{([a-z]+)\}/g, (_, k) => vars[k] ?? '').replace(/\s{2,}/g, ' ').trim();
}
