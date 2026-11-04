import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Field, Flash, Badge, Empty, Stat, fmtDate } from '@/components/ui';
import { aiKeyPresent } from '@/lib/ai/server';
import { spamConfig, spamLog, spamSenders, spamStats, spamTablesExist } from '@/lib/ai/spam';
import { supportDepartments, supportStatuses, DEFAULT_STATUSES } from '@/lib/support-notify';
import { whmcsConfigured } from '@/lib/whmcs';
import PendingButton from '@/components/PendingButton';
import { saveSpam, restoreTicket, confirmTicket, removeSender, addSender, runNow, sendWeekly } from './actions';

export const metadata = { title: 'Ticket spam' };
export const dynamic = 'force-dynamic';

const LABEL_TONE: Record<string, string> = { scam: 'red', solicitation: 'yellow', junk: 'gray', legit: 'green' };
const ACTION: Record<string, [string, string]> = {
  close: ['Auto-closed', 'red'], flag: ['Flagged', 'yellow'], none: ['Left alone', 'green'], skip: ['Not screened', 'gray'], error: ['No action (error)', 'gray'], pending: ['Running', 'blue'],
};
const FILTERS = [['review', 'Needs review'], ['closed', 'Closed'], ['flagged', 'Flagged'], ['all', 'Everything']] as const;

export default async function SpamPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await requireSession('commerce');
  const sp = await searchParams;
  const filter = (FILTERS.find(([k]) => k === sp.view)?.[0] || 'all') as (typeof FILTERS)[number][0];
  const canEdit = can(session, 'settings');
  const wh = whmcsConfigured();
  const [cfg, stats, log, senders, tables, depts, statuses] = await Promise.all([
    spamConfig(), spamStats(), spamLog(filter, 100), spamSenders(), spamTablesExist(),
    wh ? supportDepartments().catch(() => []) : Promise.resolve([]),
    wh ? supportStatuses().catch(() => DEFAULT_STATUSES) : Promise.resolve(DEFAULT_STATUSES),
  ]);
  const key = aiKeyPresent() || process.env.AI_MOCK === '1';
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const today = stats.days[0];
  const maxDay = Math.max(1, ...stats.days.map((d) => d.screened));
  const blocked = senders.filter((s) => s.list === 'block'), allowed = senders.filter((s) => s.list === 'allow');

  return (
    <>
      <Link href="/admin/assistant" className="mb-4 inline-flex text-sm text-slate-500 hover:text-slate-800">&larr; AI assistant</Link>
      <PageHeader title="Ticket spam"
        desc="Tickets from people who are not customers (sales pitches, scams, junk) are screened by rules, then Claude Haiku. Customers' tickets are never screened. Nothing is deleted and the sender never gets a reply."
        actions={<form action={runNow}><PendingButton className="btn btn-secondary" pending="Checking...">Check waiting tickets now</PendingButton></form>} />
      <Flash sp={sp} />

      <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-2xl border p-4 text-sm ${cfg.enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
        <Badge tone={cfg.enabled ? 'green' : 'gray'}>{cfg.enabled ? 'On' : 'Off'}</Badge>
        {cfg.enabled ? (
          <span>{cfg.mode === 'close'
            ? <>Auto-closes non-client tickets at confidence <b>{cfg.closeAt.toFixed(2)}</b> or more{cfg.spamDeptId ? <> and moves them to <b>{deptName.get(cfg.spamDeptId) || `department #${cfg.spamDeptId}`}</b></> : null} (status <b>{cfg.closeStatus}</b>); flags from <b>{cfg.flagAt.toFixed(2)}</b>.</>
            : <>Flag-only mode: nothing is closed; possible spam from <b>{cfg.flagAt.toFixed(2)}</b> gets a note and waits below.</>}
            {!key && <> AI key missing: only the rules run (they can flag, never close, unless a blocklist, phrase or lookalike rule matches).</>}</span>
        ) : <span>The spam filter is switched off. Tickets are not screened.</span>}
      </div>
      {!tables && <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">The spam tables are created on the next deploy (db-setup patch 040-ticket-spam). Until then nothing is screened.</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting for review" value={stats.queue} sub="flagged, still open" icon="alert" tone="amber" href="?view=review" />
        <Stat label="Closed (7 days)" value={stats.week.closed} sub={`${stats.week.restored} restored as not spam`} icon="shield" tone="rose" href="?view=closed" />
        <Stat label="Flagged (7 days)" value={stats.week.flagged} sub={`${stats.week.ai} AI checks, ${stats.week.skipped} skipped (clients, allowlist)`} icon="activity" tone="sky" href="?view=flagged" />
        <Stat label="Today" value={today ? `${today.closed + today.flagged}` : '0'} sub={today ? `${today.closed} closed · ${today.flagged} flagged · ${today.screened} looked at` : 'nothing yet today'} icon="check" tone="green" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Decisions" className="min-w-0">
          <nav className="-mt-1 mb-4 flex flex-wrap gap-1 text-xs" aria-label="Filter decisions">
          {FILTERS.map(([k, l]) => <Link key={k} href={`?view=${k}`} aria-current={filter === k ? 'page' : undefined} className={`rounded-full px-2.5 py-1 font-medium ${filter === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{l}</Link>)}
        </nav>
          {log.length ? (
            <ul className="-my-3 divide-y divide-slate-100">
              {log.map((d) => {
                const [al, at] = ACTION[d.action] || [d.action, 'gray'];
                const reviewable = (d.action === 'close' || d.action === 'flag') && d.state !== 'restored';
                return (
                  <li key={d.id} className="py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 basis-64">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/admin/support/${d.ticketId}`} className="truncate text-[14px] font-semibold text-slate-900 hover:underline">#{d.tid || d.ticketId} {d.subject || '(no subject)'}</Link>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <Badge tone={at}>{d.state === 'restored' ? 'Restored' : d.state === 'confirmed' ? 'Closed by you' : al}</Badge>
                          {d.label && <Badge tone={LABEL_TONE[d.label] || 'gray'}>{d.label}{d.confidence !== null ? ` ${d.confidence.toFixed(2)}` : ''}</Badge>}
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-500">{d.source || '-'}</span>
                          <span className="break-all">{d.email || 'unknown sender'}</span>
                          <span>· {fmtDate(d.createdAt as any)}</span>
                        </div>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{d.reason || '—'}</p>
                        {d.hints?.length ? <p className="mt-1 text-xs text-slate-400">Rule hints: {d.hints.join(', ')}</p> : null}
                        {d.reviewedBy && <p className="mt-1 text-xs text-slate-400">Reviewed by {d.reviewedBy}</p>}
                      </div>
                      {reviewable && (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <form action={restoreTicket}><input type="hidden" name="id" value={d.id} /><PendingButton className="btn btn-secondary px-3 py-1.5 text-xs" pending="Restoring...">Not spam, restore</PendingButton></form>
                          {d.action === 'flag' && d.state === 'active' && <form action={confirmTicket}><input type="hidden" name="id" value={d.id} /><PendingButton className="btn btn-danger px-3 py-1.5 text-xs" pending="Closing...">Spam, close it</PendingButton></form>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <Empty icon="shield">{filter === 'review' ? 'Nothing waiting for review.' : 'No decisions yet. New tickets from non-clients are screened as they arrive.'}</Empty>}
        </Card>

        <div className="min-w-0 space-y-6">
          <Card title="Last 14 days">
            {stats.days.length ? (
              <div className="space-y-1.5" role="table" aria-label="Tickets screened per day">
                {stats.days.map((d) => (
                  <div key={d.day} className="grid grid-cols-[52px_1fr_92px] items-center gap-3 text-[12.5px]" role="row">
                    <span className="tabular-nums text-slate-500" role="cell">{d.day.slice(5)}</span>
                    <span className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="cell" title={`${d.closed} closed, ${d.flagged} flagged, ${d.screened} looked at`}>
                      <i style={{ width: `${(d.closed / maxDay) * 100}%` }} className="bg-rose-500" />
                      <i style={{ width: `${(d.flagged / maxDay) * 100}%` }} className="bg-amber-400" />
                      <i style={{ width: `${((d.screened - d.closed - d.flagged) / maxDay) * 100}%` }} className="bg-slate-300" />
                    </span>
                    <span className="text-right tabular-nums text-slate-600" role="cell">{d.closed} / {d.flagged} / {d.screened}</span>
                  </div>
                ))}
                <p className="pt-2 text-[11.5px] text-slate-400"><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />closed <i className="mx-1 ml-3 inline-block h-2 w-2 rounded-full bg-amber-400" />flagged <i className="mx-1 ml-3 inline-block h-2 w-2 rounded-full bg-slate-300" />left alone / skipped</p>
              </div>
            ) : <p className="text-sm text-slate-500">No tickets screened yet.</p>}
          </Card>

          <Card title={`Sender lists (${blocked.length} blocked · ${allowed.length} allowed)`}>
            {canEdit && (
              <form action={addSender} className="mb-4 flex flex-wrap gap-2">
                <input className="input min-w-0 flex-1" name="value" placeholder="name@example.com or example.com" aria-label="Email or domain" required />
                <select className="input w-auto" name="list" aria-label="List" defaultValue="block"><option value="block">Block</option><option value="allow">Allow</option></select>
                <button className="btn btn-secondary">Add</button>
              </form>
            )}
            {senders.length ? (
              <ul className="max-h-80 space-y-1 overflow-auto text-[13px]">
                {senders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <span className="min-w-0 break-all"><Badge tone={r.list === 'block' ? 'red' : 'green'}>{r.list}</Badge> {r.value} <span className="text-[11px] text-slate-400">{r.source === 'auto' ? 'auto (2× spam)' : r.source === 'restore' ? 'restored' : 'you'}</span></span>
                    {canEdit && <form action={removeSender}><input type="hidden" name="id" value={r.id} /><button className="text-xs font-medium text-slate-500 hover:text-red-700" aria-label={`Remove ${r.value}`}>Remove</button></form>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">Senders confirmed as spam twice are blocked here automatically; &ldquo;Not spam, restore&rdquo; adds the sender to the allowlist.</p>}
          </Card>
        </div>
      </div>

      {canEdit && (
        <form action={saveSpam} className="mt-6 space-y-6">
          <Card title="Settings" actions={<button className="btn btn-primary">Save settings</button>}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 md:col-span-2 xl:col-span-1">
                <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="mt-0.5" />
                <span><span className="block text-sm font-semibold text-slate-800">Spam filter on</span><span className="block text-xs leading-relaxed text-slate-500">Screen new tickets and new replies from non-clients.</span></span>
              </label>
              <Field label="Mode" hint="Flag-only never closes anything.">
                <select className="input" name="mode" defaultValue={cfg.mode}><option value="close">Auto-close confident spam</option><option value="flag">Flag only</option></select>
              </Field>
              <Field label="Auto-close at confidence" hint="Default 0.95. Minimum 0.80."><input className="input" type="number" name="closeAt" defaultValue={cfg.closeAt} step="0.01" min={0.8} max={1} /></Field>
              <Field label="Flag at confidence" hint="Default 0.60. Below this: left alone."><input className="input" type="number" name="flagAt" defaultValue={cfg.flagAt} step="0.01" min={0.3} max={1} /></Field>
              <Field label="Spam department (WHMCS)" hint="Auto-closed tickets move here. Restore moves them back.">
                <select className="input" name="spamDeptId" defaultValue={String(cfg.spamDeptId)}>
                  <option value="0">Keep the ticket&apos;s department</option>
                  {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  {cfg.spamDeptId > 0 && !deptName.has(cfg.spamDeptId) && <option value={cfg.spamDeptId}>Department #{cfg.spamDeptId}</option>}
                </select>
              </Field>
              <Field label="Status on auto-close" hint="Closed, or a custom WHMCS status such as Spam.">
                <select className="input" name="closeStatus" defaultValue={cfg.closeStatus}>
                  {[...new Set([...statuses, cfg.closeStatus])].filter((x) => !/^(open|customer-reply|answered)$/i.test(x)).map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Tickets per run" hint="AI checks per run (cost cap)."><input className="input" type="number" name="perRun" defaultValue={cfg.perRun} min={1} max={20} /></Field>
              <Field label="Only activity newer than (hours)"><input className="input" type="number" name="maxAgeHours" defaultValue={cfg.maxAgeHours} min={1} max={720} /></Field>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {([['autoBlock', 'Auto-block repeat senders', cfg.autoBlock, 'A sender (or a company domain, never gmail.com-style) confirmed as spam twice goes on the blocklist: their next tickets close without an AI call.'],
                ['whmcsBlock', 'Also block in WHMCS Spam Control', cfg.whmcsBlock, 'Calls WHMCS BlockTicketSender (never deletes) when a sender is auto-blocked, so their emails stop opening tickets. Undo in WHMCS: Configuration > System Settings > Spam Control.'],
                ['weeklyEmail', 'Weekly summary email', cfg.weeklyEmail, 'One line a week to the owner email when tickets were closed or wait for review.']] as const).map(([n, l, c, h]) => (
                <label key={n} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                  <input type="checkbox" name={n} defaultChecked={c} className="mt-0.5" />
                  <span><span className="block text-sm font-semibold text-slate-800">{l}</span><span className="block text-xs leading-relaxed text-slate-500">{h}</span></span>
                </label>
              ))}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Field label="Spam phrases" hint="One per line, not case-sensitive. A match in the subject or message counts as spam (0.96) without an AI call."><textarea className="input min-h-36 font-mono text-[12.5px]" name="phrases" defaultValue={cfg.phrases.join('\n')} placeholder={'guest post opportunity\nseo services package'} /></Field>
              <Field label="Blocked senders" hint="Emails or domains, one per line. Always spam (confidence 1)."><textarea className="input min-h-36 font-mono text-[12.5px]" name="blockSenders" defaultValue={cfg.blockSenders.join('\n')} placeholder={'sales@spammy-agency.example\nleadlists.example'} /></Field>
              <Field label="Allowed senders" hint="Emails or domains that are never screened (partners, registrars, your other companies)."><textarea className="input min-h-36 font-mono text-[12.5px]" name="allowSenders" defaultValue={cfg.allowSenders.join('\n')} placeholder={'partner@registrar.example'} /></Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
              <p className="max-w-3xl">Never screened: tickets on a client account, senders whose email is a client or a user on a client account, our own domains and the allowlist. Never closed: tickets a staff member already replied to (flagged instead). Never: a reply to the sender, or deleting a ticket. AI: Claude Haiku only, the message cut to 2,000 characters, within the AI monthly and daily budget; a malformed AI answer does nothing.</p>
              <button formAction={sendWeekly} formNoValidate className="btn btn-secondary px-3 py-1.5 text-xs">Send the weekly summary now</button>
            </div>
          </Card>
        </form>
      )}
    </>
  );
}
