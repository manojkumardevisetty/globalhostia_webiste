// Website chat "Talk to a human" form (no model call): lead + Sales ticket with the transcript + WhatsApp link.
import { aiSettings, ipSubject } from '@/lib/ai/server';
import { cleanHistory } from '@/lib/ai/run';
import { createHandoff } from '@/lib/ai/handoff';
import { json, sameSite } from '@/lib/ai/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameSite(req)) return json({ error: 'forbidden' }, 403);
  let b: any;
  try { const raw = await req.text(); if (raw.length > 64_000) return json({ error: 'too_large' }, 413); b = JSON.parse(raw); } catch { return json({ error: 'bad_request' }, 400); }
  if (typeof b.hp === 'string' && b.hp.trim()) return json({ ok: true });
  const s = await aiSettings();
  const hist = cleanHistory(Array.isArray(b.messages) && b.messages.length ? [...b.messages, { role: 'user', content: '(asked for a person)' }] : [{ role: 'user', content: '(asked for a person)' }], 4000) || [];
  const r = await createHandoff(s, {
    name: String(b.name || ''), email: String(b.email || ''), phone: String(b.phone || ''), summary: String(b.summary || hist.find((m) => m.role === 'user')?.content || ''),
    transcript: hist, page: typeof b.page === 'string' ? b.page.slice(0, 200) : '/', ipHash: ipSubject(req).slice(3),
    country: (req.headers.get('x-vercel-ip-country') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
  });
  if ('error' in r && r.error) return json({ ok: false, error: r.error }, 422);
  return json({ ok: true, ...r });
}
