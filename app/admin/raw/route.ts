// Admin-only diagnostics: raw read-only WHMCS API responses (Get* actions only), secrets never included.
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, can } from '@/lib/auth';
import { liveSession } from '@/lib/security/sessions';
import { whmcs } from '@/lib/whmcs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await liveSession(req.cookies.get(COOKIE)?.value);
  if (!s || !can(s, 'integration')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const action = q.get('action') || '';
  if (!/^Get[A-Za-z]+$/.test(action)) return NextResponse.json({ error: 'only Get* actions' }, { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of q) if (k !== 'action') params[k] = v;
  try { return NextResponse.json(await whmcs(action, params)); } catch (e: any) { return NextResponse.json({ error: e?.message }, { status: 502 }); }
}
