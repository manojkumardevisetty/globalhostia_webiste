// Public: "a customer may have just opened or replied to a ticket" nudge from the WHMCS client area
// (public/hp/whmcs.js → navigator.sendBeacon). Takes no input, returns nothing useful, and only runs the
// idempotent, locked checkTickets() after the response is sent. Rate limited per IP and per instance.
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { checkTicketsSoon } from '@/lib/support-notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const l = (hits.get(key) || []).filter((t) => now - t < windowMs);
  l.push(now); hits.set(key, l);
  if (hits.size > 5000) hits.clear();
  return l.length > max;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const ipKey = createHash('sha256').update(`${ip}|${process.env.AUTH_SECRET || 'gh'}`).digest('hex').slice(0, 24);
  const headers = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
  if (limited(`ip:${ipKey}`, 12, 10 * 60_000) || limited('all', 120, 60_000)) return NextResponse.json({ ok: false }, { status: 429, headers });
  // a beacon sent on submit can arrive before WHMCS has saved the ticket — give it a few seconds
  checkTicketsSoon('ping', 5000);
  return NextResponse.json({ ok: true }, { status: 202, headers });
}
