// Admin > Support > ticket: what the AI ticket assistant decided for this ticket, with a one-click "Send draft".
import Link from 'next/link';
import { Card, Badge } from '@/components/ui';
import { runsFor } from '@/lib/ai/tickets';
import { sendAiDraft } from './actions';

export default async function TicketAiCard({ id }: { id: number }) {
  const runs = await runsFor(id);
  const r = runs.find((x) => x.draft) || runs[0];
  if (!r) return null;
  const tone = r.state === 'auto_sent' || r.state === 'sent' ? 'green' : r.state === 'drafted' ? 'yellow' : r.state === 'error' ? 'red' : 'gray';
  const label: Record<string, string> = { auto_sent: 'Answered automatically', sent: 'Draft sent', drafted: 'Draft waiting for you', skipped: 'Skipped', error: 'Failed', pending: 'Working' };
  return (
    <Card className="mt-6" title={<span className="flex items-center gap-2">AI assistant <Badge tone={tone}>{label[r.state] || r.state}</Badge></span>} actions={<Link href="/admin/assistant/usage" className="text-xs text-slate-500 hover:text-slate-800">All decisions</Link>}>
      <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
        {r.category && <Badge tone="blue">{r.category}</Badge>}
        {r.confidence !== null && <Badge>confidence {Number(r.confidence).toFixed(2)}</Badge>}
        {r.sentiment && <Badge tone={/angry|negative/.test(r.sentiment) ? 'red' : 'gray'}>{r.sentiment}</Badge>}
        {r.urgency && <Badge tone={/high|critical/.test(r.urgency) ? 'red' : 'gray'}>{r.urgency} urgency</Badge>}
        {r.language && <Badge>{r.language}</Badge>}
      </div>
      {r.summary && <p className="mb-2 text-sm text-slate-700">{r.summary}</p>}
      {r.reasons?.length > 0 && <p className="mb-3 text-xs leading-relaxed text-slate-500">{r.state === 'auto_sent' ? 'Sent because: ' : 'Not sent automatically because: '}{r.reasons.join('; ')}</p>}
      {r.error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{r.error}</p>}
      {r.draft && (r.state === 'drafted' || r.state === 'error') ? (
        <form action={sendAiDraft} className="space-y-3">
          <input type="hidden" name="run" value={r.id} />
          <input type="hidden" name="ticket" value={id} />
          <textarea name="message" defaultValue={r.draft} rows={9} className="input min-h-[200px] text-[15px]" aria-label="AI draft reply (edit before sending)" dir="auto" />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary">Send draft</button>
            <span className="text-xs text-slate-500">Sent as you, status Answered. Edit it first if needed.</span>
          </div>
        </form>
      ) : r.draft ? <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-[14px] leading-relaxed text-slate-700" dir="auto">{r.draft}</div> : null}
    </Card>
  );
}
