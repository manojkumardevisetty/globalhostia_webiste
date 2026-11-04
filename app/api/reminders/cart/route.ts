// Cart capture for abandoned-cart reminders, called by public/hp/whmcs.js on WHMCS cart pages (my.globalhostia.com).
//   POST {token, email?, consent?, whatsapp?, lang}   token = signed cart snapshot printed by the WHMCS hook
//        (docs/whmcs/globalhostia_reminders_hook.php): product ids, billing cycles, domains, currency, client id or a
//        session hash. No prices, card data or passwords. The HMAC proves the contents came from WHMCS's own session.
//   GET  ?restore=<restore token>                      the items of a reminded cart, so whmcs.js can put the rest back
// CORS for the WHMCS origin only; per-IP and per-cart rate limits; nothing is stored while the cart flow is off.
import { NextRequest } from 'next/server';
import { cors } from '@/lib/hosting/context';
import { ALLOWED_ORIGINS } from '@/lib/hosting/context';
import { limiter } from '@/lib/agents/http';
import { verifyCart, verifyRestore, cartFingerprint, EMAIL_RE } from '@/lib/reminders/core';
import { hookSecret, linkSecret, loadConfig, upsertCart, getCart, prefsFor, setPrefs, patchState } from '@/lib/reminders/store';
import { canEmailGuests } from '@/lib/reminders/send';
import { auditClient } from '@/lib/portal/session';
import { guard } from '@/lib/security/ratelimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ipLimit = limiter(40, 60_000);
const cartLimit = limiter(12, 60_000);
const guestEmailLimit = limiter(5, 60 * 60_000);
const out = (req: Request, body: unknown, status = 200) => Response.json(body, { status, headers: cors(req) });
const ipOf = (req: Request) => (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);

export function OPTIONS(req: Request) { return new Response(null, { status: 204, headers: cors(req) }); }

export async function POST(req: NextRequest) {
  { const blocked = await guard(req, 'reminders'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const origin = req.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return out(req, { error: 'origin' }, 403);
  const ip = ipOf(req);
  if (ipLimit(ip)) return out(req, { error: 'rate_limited' }, 429);
  let b: any;
  try { const raw = await req.text(); if (raw.length > 12_000) return out(req, { error: 'too_large' }, 413); b = JSON.parse(raw); } catch { return out(req, { error: 'invalid' }, 400); }
  const claims = verifyCart(b?.token, await hookSecret());
  if (!claims) return out(req, { error: 'unauthorized' }, 401);
  if (cartLimit(claims.sk)) return out(req, { error: 'rate_limited' }, 429);
  const cfg = await loadConfig();
  const lang: 'en' | 'ar' = b?.lang === 'ar' ? 'ar' : 'en';
  const signedIn = claims.cid > 0;

  // WhatsApp opt-in ticked at checkout (renewal / payment / domain reminders only; carts are email only)
  if (signedIn && b?.whatsapp === true) {
    await setPrefs(claims.cid, '', { whatsapp: true }, 'checkout').catch(() => {});
    await auditClient('reminder_whatsapp_optin', `client:${claims.cid}`, ip, { source: 'checkout' });
  }
  if (!cfg.enabled || !cfg.cart.enabled) return out(req, { ok: true, stored: false, reason: 'off' });

  const items = { p: claims.p, d: claims.d, lang };
  const fp = cartFingerprint(claims);
  if (signedIn) {
    const prefs = await prefsFor(claims.cid).catch(() => null);
    if (prefs && !prefs.cartEmail) return out(req, { ok: true, stored: false, reason: 'opted-out' });
    const consent = b?.consent === true ? 'checkbox' : 'client';
    const r = await upsertCart({ key: `c:${claims.cid}`, clientId: claims.cid, email: '', consent, currencyId: claims.cur, items, fingerprint: fp });
    await patchState({ lastCart: new Date().toISOString() });
    return out(req, { ok: true, stored: r.status !== 'emptied', status: r.status });
  }
  // guests: only with the box ticked, a valid email, guest capture on and a transport that can email non-clients
  const email = String(b?.email || '').trim().toLowerCase();
  const key = `g:${claims.sk}`;
  if (b?.consent !== true || !EMAIL_RE.test(email) || email.length > 254) {
    // box unticked (or never ticked): forget any guest cart under this session
    await upsertCart({ key, clientId: null, email: '', consent: '', currencyId: claims.cur, items: { p: [], d: [], lang }, fingerprint: '' }).catch(() => {});
    return out(req, { ok: true, stored: false, reason: 'no-consent' });
  }
  if (!cfg.cart.guests || !canEmailGuests(cfg)) return out(req, { ok: true, stored: false, reason: 'guests-off' });
  if (guestEmailLimit(`${email}|${ip}`)) return out(req, { error: 'rate_limited' }, 429);
  const r = await upsertCart({ key, clientId: null, email, consent: 'checkbox', currencyId: claims.cur, items, fingerprint: fp, whatsapp: b?.whatsapp === true });
  await patchState({ lastCart: new Date().toISOString() });
  return out(req, { ok: true, stored: r.status !== 'emptied', status: r.status });
}

export async function GET(req: NextRequest) {
  { const blocked = await guard(req, 'reminders'); if (blocked) return blocked; } // central limiter (lib/security/ratelimit.ts)
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return out(req, { error: 'origin' }, 403);
  if (ipLimit(ipOf(req))) return out(req, { error: 'rate_limited' }, 429);
  if (req.nextUrl.searchParams.get('config') === '1') {
    // what the checkout may offer (no secrets): cart capture on, guest capture possible, WhatsApp opt-in offered
    const cfg = await loadConfig().catch(() => null);
    if (!cfg || !cfg.enabled) return out(req, { cart: false, guests: false, wa: false });
    return out(req, { cart: cfg.cart.enabled, guests: cfg.cart.enabled && cfg.cart.guests && canEmailGuests(cfg),
      wa: cfg.whatsapp.enabled && (cfg.renewal.channels.whatsapp || cfg.overdue.channels.whatsapp || cfg.domain.channels.whatsapp) });
  }
  let c;
  try { c = verifyRestore(req.nextUrl.searchParams.get('restore'), linkSecret()); } catch { c = null; }
  if (!c) return out(req, { error: 'unauthorized' }, 401);
  const cart = await getCart(c.id);
  if (!cart || cart.status !== 'open') return out(req, { items: [] });
  const cfg = await loadConfig();
  const it = cart.items as any;
  return out(req, {
    promo: c.st === 'c3' && cfg.cart.thirdEnabled && cfg.cart.promoCode ? cfg.cart.promoCode : '',
    items: [...(it.p || []).map((p: any) => ({ t: 'p', pid: p.pid, cycle: p.cycle })), ...(it.d || []).map((d: any) => ({ t: 'd', domain: d.domain, type: d.type }))],
  });
}
