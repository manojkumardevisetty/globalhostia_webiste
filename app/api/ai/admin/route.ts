// Owner's business assistant (Admin > AI assistant). Admin session (gh_admin cookie, role with "commerce") + same origin.
// Read-only tools only (lib/ai/tools/admin.ts); runTool refuses anything that is not a read on this surface.
import { getSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { aiClient, aiKeyPresent, aiSettings, budgetOk, burst, logUsage } from '@/lib/ai/server';
import { cleanHistory, sse } from '@/lib/ai/run';
import { runAgent, trimHistory } from '@/lib/ai/agent';
import { adminSystem } from '@/lib/ai/prompts';
import { adminTools } from '@/lib/ai/tools/admin';
import { json, sameSite } from '@/lib/ai/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const sess = await getSession();
  if (!sess || !can(sess, 'commerce')) return json({ error: 'unauthorized' }, 401);
  if (!sameSite(req)) return json({ error: 'forbidden' }, 403);
  const s = await aiSettings();
  if (!s.surfaces.admin) return json({ error: 'offline', message: 'The admin assistant is switched off in AI settings.' }, 503);
  if (!aiKeyPresent() && process.env.AI_MOCK !== '1') return json({ error: 'offline', message: 'Add ANTHROPIC_API_KEY in Vercel to use the assistant.' }, 503);
  if (burst(`admin:${sess.email}`, 20)) return json({ error: 'rate_limited', message: 'Too many questions in a minute.' }, 429);
  let body: any;
  try { body = JSON.parse((await req.text()).slice(0, 96_000)); } catch { return json({ error: 'bad_request' }, 400); }
  const hist = cleanHistory(body.messages, 4000);
  if (!hist) return json({ error: 'bad_request' }, 400);
  const b = await budgetOk(s);
  if (!b.ok) return json({ error: 'offline', message: `AI budget reached (${b.reason}). Raise it in AI settings.` }, 503);
  const client = (await aiClient())!;
  const subject = `admin:${sess.email}`;
  return sse(async (send) => {
    const t0 = Date.now();
    let status = 'ok', err = '';
    let r: Awaited<ReturnType<typeof runAgent>> | null = null;
    try {
      r = await runAgent({
        client, model: s.chatModel, system: adminSystem(`Today: ${new Date().toISOString().slice(0, 10)} (Dubai time zone for business days). Asked by ${sess.name || sess.email} (${sess.role}).`),
        tools: adminTools, messages: trimHistory(hist, 10), ctx: { surface: 'admin', scopes: ['admin'], readOnly: true }, maxTokens: 1500, effort: 'medium', thinking: true,
        maxIterations: 6, timeoutMs: 90_000, signal: req.signal, onText: (t) => send('text', { t }), onTool: (name) => send('tool', { name }),
      });
    } catch (e: any) { status = 'error'; err = `${e?.status || ''} ${e?.message || e}`; send('error', { message: `The assistant failed: ${String(e?.message || e).slice(0, 160)}` }); }
    await logUsage({ surface: 'admin', model: s.chatModel, subject, status, usage: r?.usage, ms: Date.now() - t0, tools: r?.tools, detail: err }, s);
  });
}
