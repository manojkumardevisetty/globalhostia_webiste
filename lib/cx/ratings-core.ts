// Ticket ratings ("How did we do?"): the pure part (node:crypto only, so tests import it directly). Settings, the signed
// rating link (no login: HMAC with AUTH_SECRET, names the ticket and the client), which closed tickets get a request,
// and the numbers on the admin dashboard. Review invitations follow Google and Trustpilot rules: the same invitation
// is shown to everyone who answers, whatever the score, with no reward of any kind (no review gating, no incentives).
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Lang = 'en' | 'ar';

/* ================================================================ settings */
export type RatingsConfig = {
  /** send "How did we do?" emails after a ticket is closed (the portal rating card works either way) */
  enabled: boolean;
  /** public review pages, shown only when set (https only) */
  googleUrl: string; trustpilotUrl: string;
  /** WHMCS department ids that never get a rating request (e.g. abuse, sales) */
  excludeDepts: number[];
  /** tickets closed longer ago than this are not asked any more (also the retry window for quiet hours / caps) */
  maxAgeDays: number;
  /** 1..2 = "low": the owner is emailed at once */
  lowMax: number;
  /** ISO time the requests were switched on: tickets that were already closed then are never asked */
  since: string;
};
export const DEFAULT_RATINGS: RatingsConfig = { enabled: false, googleUrl: '', trustpilotUrl: '', excludeDepts: [], maxAgeDays: 7, lowMax: 2, since: '' };
const int = (v: unknown, d: number, min: number, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

/** Only real https review pages on the expected hosts are kept (anything else is dropped, never shown). */
export function reviewUrl(v: unknown, kind: 'google' | 'trustpilot'): string {
  const s = String(v ?? '').trim();
  if (!s || s.length > 500) return '';
  let u: URL;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password) return '';
  const h = u.hostname.toLowerCase();
  const ok = kind === 'google' ? /(^|\.)(google\.[a-z.]{2,6}|g\.page)$/.test(h) || h === 'g.co' || h === 'maps.app.goo.gl' || h === 'goo.gl'
    : /(^|\.)trustpilot\.com$/.test(h);
  return ok ? u.toString() : '';
}

export function normalizeRatings(v: any): RatingsConfig {
  const c = v && typeof v === 'object' ? v : {};
  const depts = (Array.isArray(c.excludeDepts) ? c.excludeDepts : typeof c.excludeDepts === 'string' ? c.excludeDepts.split(/[\s,;]+/) : [])
    .map((x: unknown) => Math.round(Number(x))).filter((n: number) => Number.isInteger(n) && n > 0 && n < 1e6);
  const since = typeof c.since === 'string' && !Number.isNaN(Date.parse(c.since)) ? new Date(c.since).toISOString() : '';
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : false,
    googleUrl: reviewUrl(c.googleUrl, 'google'), trustpilotUrl: reviewUrl(c.trustpilotUrl, 'trustpilot'),
    excludeDepts: [...new Set<number>(depts)].slice(0, 50), maxAgeDays: int(c.maxAgeDays, DEFAULT_RATINGS.maxAgeDays, 1, 30), lowMax: int(c.lowMax, 2, 1, 3), since,
  };
}

/* ================================================================ signed link */
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (secret: string, data: string) => createHmac('sha256', secret).update(`gh-rate.v1.${data}`).digest().subarray(0, 16);
/** Rating link claims: ticket id, client id, expiry (unix s). The score is chosen by the customer, not signed. */
export type RateClaims = { k: number; c: number; exp: number };
export const RATE_TTL_S = 45 * 86400;
export function signRate(c: { ticketId: number; clientId: number }, secret: string, nowS = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('AUTH_SECRET must be set (min 32 chars)');
  const p = b64(JSON.stringify({ k: c.ticketId, c: c.clientId, exp: nowS + RATE_TTL_S }));
  return `${p}.${b64(mac(secret, p))}`;
}
export function verifyRate(token: unknown, secret: unknown, nowS = Math.floor(Date.now() / 1000)): RateClaims | null {
  if (typeof secret !== 'string' || secret.length < 32 || typeof token !== 'string' || token.length > 300 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [p, sig] = token.split('.');
  const want = mac(secret, p), got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let v: any;
  try { v = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch { return null; }
  if (!v || !Number.isSafeInteger(v.k) || v.k <= 0 || !Number.isSafeInteger(v.c) || v.c <= 0 || !Number.isSafeInteger(v.exp) || v.exp < nowS) return null;
  return { k: v.k, c: v.c, exp: v.exp };
}
/** Score from a link or form: an integer 1..5, else null. */
export const parseScore = (v: unknown): number | null => { const s = String(v ?? '').trim(); return /^[1-5]$/.test(s) ? Number(s) : null; };
/** Optional comment: plain text, control characters removed, at most 2000 characters. */
export const cleanComment = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n/g, '\n').trim().slice(0, 2000);

/* ================================================================ which tickets */
export type ClosedTicket = { id: number; tid: string; userid: number; deptid: number; subject: string; status: string; lastreply: string; date: string };
/**
 * WHMCS dates are in the WHMCS server's local time without a zone: read them as UTC with 14 hours of slack either way
 * (a ticket near the edge is at worst asked one run later, or not at all; never twice).
 */
export const whmcsTime = (s: string) => { const t = Date.parse(String(s || '').replace(' ', 'T') + 'Z'); return Number.isNaN(t) ? null : t; };
const SLACK = 14 * 3600_000;

/** First decision for a closed ticket we have not seen: ask, or skip with a reason (stored, so it is never asked later). */
export function triage(t: ClosedTicket, o: { cfg: RatingsConfig; now: number; spam: boolean }): { ask: true } | { ask: false; reason: string } {
  if (!/^closed$/i.test(t.status)) return { ask: false, reason: 'not-closed' };
  if (!(t.userid > 0)) return { ask: false, reason: 'guest' };
  if (o.spam) return { ask: false, reason: 'spam' };
  if (o.cfg.excludeDepts.includes(t.deptid)) return { ask: false, reason: 'department' };
  const last = whmcsTime(t.lastreply) ?? whmcsTime(t.date);
  if (last === null) return { ask: false, reason: 'no-date' };
  if (o.now - last > o.cfg.maxAgeDays * 86400_000 + SLACK) return { ask: false, reason: 'too-old' };
  const since = o.cfg.since ? Date.parse(o.cfg.since) : NaN;
  if (Number.isFinite(since) && last < since - SLACK) return { ask: false, reason: 'before-switch-on' };
  return { ask: true };
}
/** The support person who last replied (WHMCS replies carry the admin's name on staff replies). */
export function staffOf(replies: { admin?: unknown }[]): string {
  for (let i = replies.length - 1; i >= 0; i--) { const a = String(replies[i]?.admin ?? '').trim(); if (a) return a.slice(0, 80); }
  return '';
}
export const isLow = (score: number, cfg: Pick<RatingsConfig, 'lowMax'>) => score >= 1 && score <= cfg.lowMax;

/* ================================================================ dashboard numbers */
export type Rated = { score: number; ratedAt: number; staff: string };
export function summary(rows: Rated[]) {
  const n = rows.length;
  const avg = n ? Math.round((rows.reduce((a, r) => a + r.score, 0) / n) * 100) / 100 : null;
  const dist = [1, 2, 3, 4, 5].map((s) => rows.filter((r) => r.score === s).length);
  return { n, avg, dist, low: dist[0] + dist[1], high: dist[3] + dist[4] };
}
/** Weekly average for the last `weeks` weeks (oldest first); weeks start on Monday (UTC). Empty weeks: avg null. */
export function trend(rows: Rated[], now: number, weeks = 12) {
  const d = new Date(now); const dow = (d.getUTCDay() + 6) % 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * 86400_000;
  const out: { week: string; n: number; avg: number | null }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = monday - i * 7 * 86400_000, to = from + 7 * 86400_000;
    const w = rows.filter((r) => r.ratedAt >= from && r.ratedAt < to);
    out.push({ week: new Date(from).toISOString().slice(0, 10), n: w.length, avg: w.length ? Math.round((w.reduce((a, r) => a + r.score, 0) / w.length) * 100) / 100 : null });
  }
  return out;
}
export function perStaff(rows: Rated[]) {
  const m = new Map<string, number[]>();
  for (const r of rows) { const k = r.staff || ''; const l = m.get(k) || []; l.push(r.score); m.set(k, l); }
  return [...m.entries()].map(([staff, l]) => ({ staff, n: l.length, avg: Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 100) / 100, low: l.filter((s) => s <= 2).length }))
    .sort((a, b) => b.n - a.n || a.staff.localeCompare(b.staff));
}
