// whmcs.js on a WHMCS cart page (my.globalhostia.com): {token, ab}. token = the signed cart snapshot printed by the
// reminders hook (docs/whmcs/globalhostia_reminders_hook.php), ab = the gh_abv cookie ("<exp>.<variant>~…").
// Links this WHMCS cart session to the variants so the AfterShoppingCartCheckout webhook can count the order.
// CORS for the WHMCS origin only; per-IP limit. Stores the session hash and the assignment tokens, nothing personal.
import { NextRequest } from 'next/server';
import { cors, ALLOWED_ORIGINS } from '@/lib/hosting/context';
import { limiter } from '@/lib/agents/http';
import { verifyCart } from '@/lib/reminders/core';
import { hookSecret } from '@/lib/reminders/store';
import { tagCart } from '@/lib/abtest/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const limit = limiter(30, 60_000);
const out = (req: Request, body: unknown, status = 200) => Response.json(body, { status, headers: cors(req) });

export function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: cors(req) }); }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return out(req, { error: 'origin' }, 403);
  const ip = (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
  if (limit(ip)) return out(req, { error: 'rate_limited' }, 429);
  let b: any;
  try { const raw = await req.text(); if (raw.length > 10_000) return out(req, { error: 'too_large' }, 413); b = JSON.parse(raw); } catch { return out(req, { error: 'invalid' }, 400); }
  const claims = verifyCart(b?.token, await hookSecret());
  if (!claims) return out(req, { error: 'unauthorized' }, 401);
  try {
    const stored = await tagCart({ sk: claims.sk, cid: claims.cid, cur: claims.cur, ab: String(b?.ab || '').slice(0, 400) });
    return out(req, { ok: true, stored });
  } catch (e) {
    console.warn('[abtest] cart', (e as Error)?.message || e);
    return out(req, { ok: false }, 503);
  }
}
