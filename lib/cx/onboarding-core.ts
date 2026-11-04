// Welcome setup checklist ("Get your site live") on the portal dashboard: the pure part (no imports, tests load it).
// Who sees it, which service / domain it is about, the steps and their status (auto-detected from real data, or marked
// done / skipped by the customer), progress, and the "is this the panel's default page?" check for "website live".
// lib/cx/onboarding.ts gathers the facts (DNS, TLS, the site, the hosting panel, team, AI connections) and stores state.

export type StepId = 'domain' | 'ssl' | 'email' | 'site' | 'wordpress' | 'backups' | 'team' | 'ai';
/** auto-detection: done / todo, unknown = could not check right now, na = does not apply (e.g. no hosting) */
export type Detect = 'done' | 'todo' | 'unknown' | 'na';
export type Manual = 'done' | 'skipped';
export type Status = 'done' | 'todo' | 'checking' | 'skipped';
/** what the action button opens: a portal page, or a tab of Manage hosting in the client area (single sign-on) */
export type Action = { kind: 'link'; href: string } | { kind: 'panel'; tab: PanelTab };
export const PANEL_TABS = ['overview', 'health', 'email', 'files', 'ssl', 'backups', 'wordpress', 'dns'] as const;
export type PanelTab = (typeof PANEL_TABS)[number];

export interface StepDef { id: StepId; optional: boolean; hosting: boolean; help: string }
/** Order = the order a new customer does things. help = /help/<slug> how-to video (lib/help/topics.ts). */
export const STEPS: StepDef[] = [
  { id: 'domain', optional: false, hosting: false, help: 'connect-a-domain' },
  { id: 'ssl', optional: false, hosting: true, help: 'issue-ssl-certificate' },
  { id: 'email', optional: false, hosting: true, help: 'set-up-email' },
  { id: 'site', optional: false, hosting: true, help: 'upload-files' },
  { id: 'wordpress', optional: true, hosting: true, help: 'install-wordpress' },
  { id: 'backups', optional: false, hosting: true, help: 'restore-a-backup' },
  { id: 'team', optional: true, hosting: false, help: 'give-team-access' },
  { id: 'ai', optional: true, hosting: false, help: 'connect-ai-assistant' },
];
export const STEP_IDS = STEPS.map((s) => s.id);
export const isStep = (v: unknown): v is StepId => typeof v === 'string' && (STEP_IDS as string[]).includes(v);

export interface ObState {
  startedAt: string | null; dismissedAt: string | null; completedAt: string | null; celebratedAt: string | null;
  manual: Partial<Record<StepId, Manual>>; detected: Partial<Record<StepId, Detect>>; detectedAt: string | null;
  target: Target | null;
}
export const EMPTY_STATE: ObState = { startedAt: null, dismissedAt: null, completedAt: null, celebratedAt: null, manual: {}, detected: {}, detectedAt: null, target: null };

/** What the checklist is about: the newest hosting service (with its domain), else the newest domain. */
export interface Target { serviceId: number | null; domain: string; domainId: number | null; hosting: boolean }

export const WINDOW_DAYS = 60;
/** a checklist that was started keeps showing until done or dismissed, but not for ever */
export const MAX_DAYS = 120;
const DAY = 86400_000;
const ts = (s: unknown) => { const v = String(s || ''); if (!v || /^0000/.test(v)) return NaN; return Date.parse(v.length === 10 ? v + 'T00:00:00Z' : v.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) || v.length <= 10 ? '' : 'Z')); };
const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const live = (s: unknown) => /^(active|pending)$/i.test(String(s || ''));

/** Purchases (services and domains) made in the last `days` days, newest first. */
export function recentPurchases(products: any[], domains: any[], now: number, days = WINDOW_DAYS) {
  const fresh = (d: unknown) => { const t = ts(d); return Number.isFinite(t) && now - t <= days * DAY && t <= now + DAY; };
  const svc = products.filter((p) => live(p.status) && fresh(p.regdate)).sort((a, b) => ts(b.regdate) - ts(a.regdate));
  const dom = domains.filter((d) => /^(active|pending|pending registration|pending transfer)$/i.test(String(d.status || '')) && fresh(d.regdate)).sort((a, b) => ts(b.regdate) - ts(a.regdate));
  return { services: svc, domains: dom, any: svc.length + dom.length > 0 };
}

/**
 * Pick the target. Hosting first (that is where "live" happens): the newest recent active hosting service with a
 * domain, else any active hosting service with a domain, else the newest recent domain. `isHosting` decides which
 * services count (shared / WordPress / reseller hosting, not VPS or SSL). null = nothing to set up.
 */
export function pickTarget(products: any[], domains: any[], now: number, isHosting: (p: any) => boolean): Target | null {
  const rec = recentPurchases(products, domains, now);
  const host = (list: any[]) => list.find((p) => isHosting(p) && /^active$/i.test(String(p.status)) && DOMAIN_RE.test(String(p.domain || '').toLowerCase()));
  const p = host(rec.services) || host([...products].sort((a, b) => ts(b.regdate) - ts(a.regdate)));
  const domId = (name: string) => { const d = domains.find((x) => String(x.domainname || '').toLowerCase() === name); return d ? Number(d.id) : null; };
  if (p) { const d = String(p.domain).toLowerCase(); return { serviceId: Number(p.id), domain: d, domainId: domId(d), hosting: true }; }
  const d = rec.domains[0] || domains.find((x) => /^active$/i.test(String(x.status)));
  if (d && DOMAIN_RE.test(String(d.domainname || '').toLowerCase())) return { serviceId: null, domain: String(d.domainname).toLowerCase(), domainId: Number(d.id) || null, hosting: false };
  return null;
}

/** Show the card? Recent purchase, or a checklist already under way; never after dismiss; once more after completion (to celebrate). */
export function shouldShow(st: ObState, recent: boolean, now: number): boolean {
  if (st.dismissedAt) return false;
  if (st.completedAt) return !st.celebratedAt;
  if (recent) return true;
  const s = ts(st.startedAt);
  return Number.isFinite(s) && now - s <= MAX_DAYS * DAY;
}

export interface StepView extends StepDef { status: Status; auto: boolean; action: Action | null }
/** Where each step's button goes. Panel tabs need a hosting service; domain fixes go to the portal's domain page. */
export function actionFor(id: StepId, t: Target): Action | null {
  switch (id) {
    case 'domain': return t.domainId ? { kind: 'link', href: `/account/domains/${t.domainId}#ac-ns-h` } : t.hosting ? { kind: 'panel', tab: 'health' } : null;
    case 'ssl': return t.hosting ? { kind: 'panel', tab: 'ssl' } : { kind: 'link', href: `/account/health?d=${encodeURIComponent(t.domain)}` };
    case 'email': return { kind: 'panel', tab: 'email' };
    case 'site': return { kind: 'panel', tab: 'files' };
    case 'wordpress': return { kind: 'panel', tab: 'wordpress' };
    case 'backups': return { kind: 'panel', tab: 'backups' };
    case 'team': return { kind: 'link', href: '/account/team' };
    case 'ai': return { kind: 'link', href: '/connectors' };
  }
}

/** Steps for this target with their status. A manual choice wins over detection; hosting steps drop out without hosting. */
export function buildSteps(t: Target, st: Pick<ObState, 'manual' | 'detected'>): StepView[] {
  return STEPS.filter((s) => t.hosting || !s.hosting).map((s) => {
    const m = st.manual[s.id], d = st.detected[s.id];
    const status: Status = m === 'done' || d === 'done' ? 'done' : m === 'skipped' ? 'skipped' : d === undefined ? 'checking' : 'todo';
    return { ...s, status, auto: d === 'done' && m !== 'done', action: actionFor(s.id, t) };
  });
}
/** Required steps decide completion; optional ones only add to the count when done. */
export function progress(steps: StepView[]) {
  const req = steps.filter((s) => !s.optional);
  const closed = (s: StepView) => s.status === 'done' || s.status === 'skipped';
  const done = steps.filter(closed).length;
  return { done, total: steps.length, pct: steps.length ? Math.round((done / steps.length) * 100) : 0, complete: req.length > 0 && req.every(closed), next: steps.find((s) => s.status === 'todo' && !s.optional) || steps.find((s) => s.status === 'todo') || null };
}

/** Detection is reused for 10 minutes; older results are shown and refreshed in the background (account.js). */
export const DETECT_TTL_MS = 10 * 60_000;
export const stale = (st: Pick<ObState, 'detectedAt'>, now: number, t: Target | null, prev: Target | null) =>
  !st.detectedAt || now - ts(st.detectedAt) > DETECT_TTL_MS || !t || !prev || prev.domain !== t.domain || prev.serviceId !== t.serviceId;

/* ---------------------------------------------------------------- "website live" */
// Placeholder pages shipped by hosting panels, web servers and registrars: a 200 with one of these is not a live site.
const PANEL_NAME = /directadmin|cpanel|plesk|webuzo|cyberpanel|hestia|vesta|interworx|litespeed|apache|nginx|iis/i;
const DEFAULT_MARKERS: RegExp[] = [
  /default (web ?)?page|default index|placeholder page/i,
  /(this|the) (domain|site|website|account) (has been|was|is) (successfully )?(set ?up|created|configured|registered|parked)/i,
  /(website|site|domain) (is )?(coming soon|under construction|not (yet )?(configured|published))/i,
  /(future home of|parked (free|domain)|domain (is )?parked|this domain may be for sale|buy this domain)/i,
  /apache2? [a-z ]*default page|welcome to nginx|it works!|test page for the (apache|nginx|http)|iis windows server/i,
  /^\s*index of \//i,
];
/**
 * 'live' when the home page answers 200 with real content. Placeholder pages are short: a known placeholder phrase
 * near the top, or a panel / web server name in the title or main heading, on a short page counts as the default page
 * (a real page that merely mentions "cPanel" in its footer is not flagged).
 */
export function siteLive(status: number | undefined, html: string): 'live' | 'default' | 'down' {
  if (!status || status >= 400) return 'down';
  if (status >= 300) return 'down';
  const body = String(html || '');
  const text = body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 40 && !/<(img|video|canvas|iframe|main|article)\b/i.test(body)) return 'default';
  if (text.length > 2500) return 'live';
  const heads = [...body.matchAll(/<(title|h1)[^>]*>([\s\S]{0,300}?)<\/\1>/gi)].map((m) => m[2].replace(/<[^>]+>/g, ' ').trim());
  const top = [...heads, text.slice(0, 600)];
  if (top.some((x) => DEFAULT_MARKERS.some((r) => r.test(x)))) return 'default';
  if (text.length < 800 && heads.some((x) => PANEL_NAME.test(x))) return 'default';
  return 'live';
}
