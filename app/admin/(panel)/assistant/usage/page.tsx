import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Stat, Badge, Empty, fmtDate } from '@/components/ui';
import { aiSettings } from '@/lib/ai/server';
import { SURFACE_LABEL } from '@/lib/ai/settings-core';
import { per1k } from '@/lib/ai/pricing';

export const metadata = { title: 'AI usage' };
export const dynamic = 'force-dynamic';

const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
const q = async <T,>(p: Promise<unknown>, d: T): Promise<T> => { try { return (await p) as T; } catch { return d; } };

export default async function UsagePage() {
  await requireSession('commerce');
  const s = await aiSettings();
  type Row = { surface: string; requests: number; calls: number; usd: number; input: number; output: number; cache_read: number };
  const [bySurface, byDay, gate, runs, avg] = await Promise.all([
    q<Row[]>(db.execute(sql`select surface, count(*)::int requests, count(*) filter (where input_tokens + output_tokens > 0)::int calls, coalesce(sum(cost_usd),0)::float usd,
      coalesce(sum(input_tokens),0)::int input, coalesce(sum(output_tokens),0)::int output, coalesce(sum(cache_read),0)::int cache_read
      from ai_usage where created_at >= date_trunc('month', now()) group by surface order by usd desc`) as any, []),
    q<{ day: string; surface: string; usd: number; n: number }[]>(db.execute(sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, surface, coalesce(sum(cost_usd),0)::float usd, count(*)::int n
      from ai_usage where created_at > now() - interval '30 days' group by 1, 2 order by 1 desc`) as any, []),
    q<{ status: string; n: number }[]>(db.execute(sql`select status, count(*)::int n from ai_usage where created_at >= date_trunc('month', now()) and surface in ('chat','assist') group by status`) as any, []),
    q<any[]>(db.execute(sql`select ticket_id, tid, state, category, confidence::float confidence, sentiment, language, reasons, created_at from ai_ticket_runs order by created_at desc limit 25`) as any, []),
    q<{ usd: number; n: number }[]>(db.execute(sql`select coalesce(avg(cost_usd),0)::float usd, count(*)::int n from ai_usage where surface = 'chat' and status = 'ok' and created_at > now() - interval '30 days'`) as any, []),
  ]);
  const month = bySurface.reduce((t, r) => t + r.usd, 0);
  const g = Object.fromEntries(gate.map((r) => [r.status, r.n])) as Record<string, number>;
  const stopped = (g.offtopic || 0) + (g.blocked || 0) + (g.greeting || 0) + (g.limited || 0);
  const avgChat = avg[0]?.n ? avg[0].usd : 0.01;
  const chats = bySurface.find((r) => r.surface === 'chat');
  const days = [...new Set(byDay.map((r) => r.day))].slice(0, 30);
  const max = Math.max(0.0001, ...days.map((d) => byDay.filter((r) => r.day === d).reduce((t, r) => t + r.usd, 0)));
  const COLORS: Record<string, string> = { chat: '#c5386f', assist: '#473bf0', tickets: '#0f7a41', admin: '#16212b', gate: '#b54708', names: '#64748b', content: '#0e7490' };

  return (
    <>
      <Link href="/admin/assistant" className="mb-4 inline-flex text-sm text-slate-500 hover:text-slate-800">&larr; AI assistant</Link>
      <PageHeader title="AI usage & costs" desc="Tokens and cost by surface, the off-topic filter's savings and every ticket decision. Costs use the prices in AI settings." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="This month" value={usd(month)} sub={`budget $${s.monthlyBudgetUsd} · ${s.monthlyBudgetUsd ? Math.round((month / s.monthlyBudgetUsd) * 100) : 0}% used`} icon="dollar" />
        <Stat label="Cost per 1,000 chats" value={per1k(chats?.usd || 0, chats?.calls || 0) === null ? '—' : usd(per1k(chats!.usd, chats!.calls)!)} sub={`${chats?.calls || 0} answered chat messages this month`} icon="activity" tone="sky" />
        <Stat label="Stopped before the model" value={stopped.toLocaleString()} sub={`${g.offtopic || 0} off-topic · ${g.blocked || 0} cooldown · ${g.greeting || 0} greetings · ${g.limited || 0} over limits`} icon="shield" tone="amber" />
        <Stat label="Estimated credits saved" value={usd(stopped * avgChat)} sub={`at ${usd(avgChat)} per answered chat (30-day average)`} icon="check" tone="green" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card title="Last 30 days (USD per day)">
          {days.length ? (
            <div className="space-y-1.5" role="table" aria-label="Cost per day by surface">
              {days.map((d) => {
                const rows = byDay.filter((r) => r.day === d), tot = rows.reduce((t, r) => t + r.usd, 0);
                return (
                  <div key={d} className="grid grid-cols-[88px_1fr_72px] items-center gap-3 text-[13px]" role="row">
                    <span className="tabular-nums text-slate-500" role="cell">{d.slice(5)}</span>
                    <span className="flex h-3.5 overflow-hidden rounded-full bg-slate-100" role="cell" title={rows.map((r) => `${r.surface}: ${usd(r.usd)} (${r.n})`).join(', ')}>
                      {rows.map((r) => <i key={r.surface} style={{ width: `${(r.usd / max) * 100}%`, background: COLORS[r.surface] || '#94a3b8' }} />)}
                    </span>
                    <span className="text-right font-semibold tabular-nums text-slate-800" role="cell">{usd(tot)}</span>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-3 pt-3 text-xs text-slate-500">{Object.entries(COLORS).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{(SURFACE_LABEL as any)[k] || k}</span>)}</div>
            </div>
          ) : <Empty icon="activity">No AI usage recorded yet.</Empty>}
        </Card>
        <Card title="This month by surface">
          {bySurface.length ? (
            <div className="overflow-x-auto"><table className="table w-full text-[13px]">
              <thead><tr><th className="text-left">Surface</th><th className="text-right">Model calls</th><th className="text-right">Tokens in / out</th><th className="text-right">Cost</th></tr></thead>
              <tbody>{bySurface.map((r) => (
                <tr key={r.surface}><td>{(SURFACE_LABEL as any)[r.surface] || r.surface}<div className="text-[11px] text-slate-400">{r.requests} requests</div></td><td className="text-right tabular-nums">{r.calls}</td>
                  <td className="text-right tabular-nums">{Math.round((r.input + r.cache_read) / 1000)}k / {Math.round(r.output / 1000)}k</td><td className="text-right font-semibold tabular-nums">{usd(r.usd)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <p className="text-sm text-slate-500">Nothing yet this month.</p>}
        </Card>
      </div>

      <Card title="Ticket assistant decisions" className="mt-6">
        {runs.length ? (
          <div className="overflow-x-auto">
            <table className="table w-full text-[13px]">
              <thead><tr><th className="text-left">Ticket</th><th className="text-left">Decision</th><th className="text-left">Category</th><th className="text-right">Confidence</th><th className="text-left">Why</th><th className="text-left">When</th></tr></thead>
              <tbody>{runs.map((r, i) => (
                <tr key={i}>
                  <td><Link className="font-semibold text-brand-600" href={`/admin/support/${r.ticket_id}`}>#{r.tid || r.ticket_id}</Link></td>
                  <td><Badge tone={r.state === 'auto_sent' || r.state === 'sent' ? 'green' : r.state === 'drafted' ? 'yellow' : r.state === 'error' ? 'red' : 'gray'}>{String(r.state).replace('_', ' ')}</Badge></td>
                  <td>{r.category || '—'} <span className="text-slate-400">{r.language}</span></td>
                  <td className="text-right tabular-nums">{r.confidence != null ? Number(r.confidence).toFixed(2) : '—'}</td>
                  <td className="max-w-[420px] text-slate-500">{(r.reasons || []).join('; ')}</td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(r.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-slate-500">No tickets processed yet. New tickets and customer replies are picked up by the support notifier.</p>}
      </Card>
    </>
  );
}
