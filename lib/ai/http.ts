// Small HTTP helpers for the AI routes.
import 'server-only';
import { getSettings } from '../settings';
import { waLink } from '../theme/growth';

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function offline(reason: string) {
  const st = await getSettings().catch(() => ({} as any));
  return json({ error: 'offline', reason, message: 'The assistant is offline right now. Our team is happy to help.', whatsapp: waLink(st, 'Hello GlobalHostia, I have a question.') || null, email: String(st.email || 'support@globalhostia.com'), contact: '/contact' }, 503);
}

export function sameSite(req: Request) {
  const o = req.headers.get('origin');
  if (!o) return false;
  try {
    const host = new URL(o).host.toLowerCase();
    const self = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim().toLowerCase();
    return host === self || /(^|\.)globalhostia\.com$/.test(host.replace(/:\d+$/, ''));
  } catch { return false; }
}

