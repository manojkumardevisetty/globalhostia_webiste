// Middleware side of A/B tests (edge runtime): pick the visitor's variant for a page with a running experiment and
// hand it to the renderer as ?_ab= on the rewritten URL (one CDN copy per variant; the control copy is the normal page).
// The running config comes from /api/ab/config (CDN-cached 60 s) and is kept in memory for 60 s per edge instance, so
// most requests make no extra call. Only the testable paths (lib/abtest/core.ts TARGETS) ever look it up.
import {
  AB_COOKIE, AB_ASSIGN_COOKIE, AB_DAYS, AB_PARAM, AB_DRAFT_PARAM, AB_HEADER, AB_DRAFT_HEADER, AB_PREVIEW, AB_PATHS, AB_TOKEN_RE,
  assignFor, eligibility, isVisitorId, mergeAssignCookie, newVisitorId, normPath, type AbConfig,
} from './core';

type Req = { nextUrl: URL; headers: Headers; cookies: { get(name: string): { value: string } | undefined } };
export type AbResult = {
  /** value for ?_ab= (non-control variants only), '' = control */
  param: string; draft: boolean;
  /** cookies to set on the response */
  cookies: { name: string; value: string; httpOnly: boolean; domain?: string }[];
};

const TTL = 60_000, FAIL_TTL = 20_000;
let cache: { at: number; ttl: number; cfg: AbConfig } | null = null;

async function config(origin: string): Promise<AbConfig> {
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return cache.cfg;
  try {
    const r = await fetch(`${origin}/api/ab/config`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(800) });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json() as AbConfig;
    const cfg: AbConfig = { consent: !!j?.consent, exps: Array.isArray(j?.exps) ? j.exps : [] };
    cache = { at: now, ttl: TTL, cfg };
  } catch {
    // config unreachable: everyone sees the control for a little while (never blocks or breaks the page)
    cache = { at: now, ttl: FAIL_TTL, cfg: cache?.cfg || { consent: true, exps: [] } };
  }
  return cache.cfg;
}

/** Shared cookie domain so whmcs.js on my.globalhostia.com can read the assignments (purchase attribution). */
const cookieDomain = (host: string) => (/(^|\.)globalhostia\.com$/i.test(host) ? '.globalhostia.com' : undefined);

export async function abAssign(req: Req, isAdmin: () => Promise<boolean>): Promise<AbResult | null> {
  const path = normPath(req.nextUrl.pathname);
  if (!AB_PATHS.has(path)) return null;
  const out: AbResult = { param: '', draft: false, cookies: [] };

  // preview link from Admin → Experiments: /web-hosting?ab=<exp>.<variant> (never counted; drafts need an admin session)
  const pv = req.nextUrl.searchParams.get(AB_PREVIEW);
  if (pv && AB_TOKEN_RE.test(pv)) { out.param = pv; out.draft = await isAdmin().catch(() => false); return out; }

  const cfg = await config(req.nextUrl.origin);
  if (!cfg.exps.some((e) => e.paths.includes(path))) return out;
  const h = req.headers;
  const ok = eligibility({ ua: h.get('user-agent'), dnt: h.get('dnt'), gpc: h.get('sec-gpc'), consent: req.cookies.get('gh_consent')?.value, consentRequired: cfg.consent });
  if (ok !== 'ok') return out; // bots, Do-Not-Track / GPC, no consent: control, no cookie

  let id = req.cookies.get(AB_COOKIE)?.value || '';
  if (!isVisitorId(id)) { id = newVisitorId(); out.cookies.push({ name: AB_COOKIE, value: id, httpOnly: true }); }
  const got = assignFor(cfg, path, id);
  const ctl = new Map(cfg.exps.map((e) => [e.id, e.variants[0]?.key || 'a']));
  out.param = got.filter((a) => a.variant !== ctl.get(a.exp)).map((a) => `${a.exp}.${a.variant}`).join('~');
  const prev = req.cookies.get(AB_ASSIGN_COOKIE)?.value || '';
  const next = mergeAssignCookie(prev, got, new Set(cfg.exps.map((e) => e.id)));
  if (next !== prev) out.cookies.push({ name: AB_ASSIGN_COOKIE, value: next, httpOnly: false, domain: cookieDomain(req.nextUrl.hostname) });
  return out;
}

/** tests only */
export const __resetConfigCache = () => { cache = null; };

export const AB_COOKIE_MAX_AGE = 60 * 60 * 24 * AB_DAYS;
export { AB_PARAM, AB_DRAFT_PARAM, AB_HEADER, AB_DRAFT_HEADER };
