// Beacon from /hp/pages/ab.js: {e: "view" | "cta" | "cart", p: "/web-hosting", done: ["exp-id", ...]}.
// The variant is recomputed here from the gh_ab cookie (the browser cannot choose its bucket). Bots, Do-Not-Track / GPC
// and, when the cookie banner is active, visitors without analytics consent are never counted. Same-origin only.
import { NextRequest } from 'next/server';
import { getSettings } from '@/lib/settings';
import { AB_COOKIE, AB_PATHS, eligibility, isVisitorId, normPath } from '@/lib/abtest/core';
import { recordEvent, type EventKind } from '@/lib/abtest/store';
import { anyTracker, normTracking } from '@/lib/tracking';
import { limiter } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const limit = limiter(60, 60_000);
const KINDS: EventKind[] = ['view', 'cta', 'cart'];
const none = (extra: object = {}) => Response.json({ ok: true, on: [], counted: [], ...extra }, { headers: { 'cache-control': 'no-store' } });

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return Response.json({ error: 'origin' }, { status: 403 });
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
  if (limit(ip)) return Response.json({ error: 'rate_limited' }, { status: 429 });
  let b: any;
  try { const raw = await req.text(); if (raw.length > 2000) return Response.json({ error: 'too_large' }, { status: 413 }); b = JSON.parse(raw); } catch { return Response.json({ error: 'invalid' }, { status: 400 }); }
  const kind = KINDS.find((k) => k === b?.e);
  const path = normPath(String(b?.p || '').slice(0, 200));
  if (!kind || !AB_PATHS.has(path)) return Response.json({ error: 'invalid' }, { status: 400 });
  const id = req.cookies.get(AB_COOKIE)?.value;
  if (!isVisitorId(id)) return none({ reason: 'not-in-test' });
  const s = await getSettings();
  const ok = eligibility({ ua: req.headers.get('user-agent'), dnt: req.headers.get('dnt'), gpc: req.headers.get('sec-gpc'),
    consent: req.cookies.get('gh_consent')?.value, consentRequired: anyTracker(normTracking(s.tracking)) });
  if (ok !== 'ok') return none({ reason: ok });
  const done = (Array.isArray(b?.done) ? b.done : []).map((x: unknown) => String(x).slice(0, 40)).slice(0, 20);
  try {
    const r = await recordEvent({ kind, path, visitorId: id!, done });
    return Response.json({ ok: true, ...r }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.warn('[abtest] event', (e as Error)?.message || e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
