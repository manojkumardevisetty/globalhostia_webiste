// Page side of A/B tests: which text / layout a page slot shows for this request.
// Order: the variant of a running experiment (?_ab=<exp>.<variant>, set by middleware only) → a promoted winner
// (settings.page_copy, written by "Promote winner") → the renderer's own default. Pure (settings + query in).
import { AB_PARAM, AB_DRAFT_PARAM, AB_HEADER, AB_DRAFT_HEADER, TARGETS, isLive, normExperiments, normPath, parseTokens, fillTokens, type Experiment } from './core';

/** settings.page_copy: {path: {slot: text}} (promoted winners), only known pages / slots / layout values kept. */
export type PageCopy = Record<string, Record<string, string>>;
export function normCopy(raw: unknown): PageCopy {
  let x: any = raw;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = {}; } }
  const out: PageCopy = {};
  for (const [path, slots] of Object.entries(x && typeof x === 'object' ? x : {})) {
    const p = normPath(path);
    const target = TARGETS.find((t) => t.paths.includes(p));
    if (!target || !slots || typeof slots !== 'object') continue;
    for (const [k, v] of Object.entries(slots as Record<string, unknown>)) {
      const slot = target.slots.find((s) => s.key === k); if (!slot) continue;
      const text = String(v ?? '').trim().slice(0, slot.max || 320);
      if (!text || (slot.kind === 'layout' && !slot.options?.some((o) => o.v === text))) continue;
      (out[p] ||= {})[k] = text;
    }
  }
  return out;
}

export type PageAb = {
  /** slot text: variant → promoted copy → fallback; {tokens} filled from vars */
  text: (slot: string, fallback: string, vars?: Record<string, string>) => string;
  /** layout slot value (one of the slot's options) */
  layout: <T extends string>(slot: string, fallback: T) => T;
  /** the experiment variant applied to this render ('' = control / none) */
  applied: string;
  /** page JS key for ab.js (counts views and clicks; cheap no-op when the visitor takes part in nothing) */
  js: string;
};

/** The variant tokens for this request: x-gh-ab / x-gh-abd headers set by middleware (renderers pass `headers()`),
 *  falling back to the internal ?_ab= query (tests, direct renders). Middleware drops incoming copies of both. */
export function abRequest(query: URLSearchParams, h?: { get(name: string): string | null } | null): URLSearchParams {
  const q = new URLSearchParams();
  const v = h?.get(AB_HEADER) ?? query.get(AB_PARAM);
  if (v) q.set(AB_PARAM, v);
  if ((h?.get(AB_DRAFT_HEADER) ?? query.get(AB_DRAFT_PARAM)) === '1') q.set(AB_DRAFT_PARAM, '1');
  return q;
}

export function pageAb(settings: Record<string, any>, query: URLSearchParams, path: string, target: string): PageAb {
  const copy = normCopy(settings?.page_copy)[normPath(path)] || {};
  let set: Record<string, string> = {};
  let applied = '';
  const toks = parseTokens(query.get(AB_PARAM));
  if (toks.length) {
    const list = normExperiments(settings?.ab_experiments);
    const draftOk = query.get(AB_DRAFT_PARAM) === '1';
    const p = normPath(path);
    for (const t of toks) {
      const e: Experiment | undefined = list.find((x) => x.id === t.exp);
      if (!e || e.target !== target || !e.paths.includes(p) || !(isLive(e) || draftOk)) continue;
      const v = e.variants.find((x) => x.key === t.variant);
      if (!v || v === e.variants[0]) continue;
      set = { ...v.set, ...set };
      applied = applied ? `${applied}~${t.exp}.${t.variant}` : `${t.exp}.${t.variant}`;
    }
  }
  const pick = (slot: string) => set[slot] ?? copy[slot];
  return {
    text: (slot, fallback, vars) => { const v = pick(slot); return v ? fillTokens(v, vars) || fallback : fallback; },
    layout: <T extends string>(slot: string, fallback: T) => (pick(slot) as T) || fallback,
    applied,
    js: 'ab',
  };
}
