import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { Card, Badge, Flash, Empty } from '@/components/ui';
import { Icon } from '@/components/icons';
import { whmcsConfigured } from '@/lib/whmcs';
import { fullTicket, plainText, supportSettings, supportStatuses } from '@/lib/support-notify';
import { replyTicket, setTicketStatus } from '../actions';
import { ticketTone, priorityTone } from '../tones';
import TicketAiCard from '../../assistant/TicketAiCard';

export const metadata = { title: 'Ticket' };
export const dynamic = 'force-dynamic';

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireSession('commerce');
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  const id = /^\d{1,10}$/.test(raw) ? Number(raw) : 0;
  if (!id) notFound();
  if (!whmcsConfigured()) return <Empty icon="ticket">WHMCS is not configured.</Empty>;

  let t: Awaited<ReturnType<typeof fullTicket>> | null = null, err = '';
  try { t = await fullTicket(id); } catch (e: any) { err = e.message; }
  const [statuses, cfg] = await Promise.all([supportStatuses(), supportSettings()]);

  if (!t) return (
    <>
      <Link href="/admin/support" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><Icon name="chevron" className="h-4 w-4 rotate-90" /> Support</Link>
      <Empty icon="ticket">Ticket #{id} could not be loaded{err ? `: ${err}` : ''}.</Empty>
    </>
  );

  const status = String(t.status || '');
  const customer = String(t.requestor_name || t.name || '');
  const email = String(t.requestor_email || t.email || '');
  const thread = t.replies.length ? t.replies : [{ message: t.message, date: t.date, name: customer, admin: '' }];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/support" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><Icon name="chevron" className="h-4 w-4 rotate-90" /> Support</Link>
      <Flash sp={sp} />

      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Ticket #{String(t.tid || id)}</p>
        <h1 className="mt-1 break-words text-[22px] font-bold leading-snug tracking-[-0.01em] text-slate-900 sm:text-[26px]">{String(t.subject || '(no subject)')}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={ticketTone(status)}>{status}</Badge>
          {t.priority && <Badge tone={priorityTone(String(t.priority))}>{String(t.priority)} priority</Badge>}
          <Badge tone="blue">{String(t.deptname || 'No department')}</Badge>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {t.userid && Number(t.userid) > 0
            ? <Link href={`/admin/customers/${t.userid}`} className="font-semibold text-brand-600">{customer || `Client #${t.userid}`}</Link>
            : <b>{customer || 'Guest'}</b>}
          {email && <> · <a href={`mailto:${email}`} className="text-slate-500 underline-offset-2 hover:underline">{email}</a></>}
          <span className="text-slate-400"> · opened {String(t.date || '')}</span>
        </p>
      </header>

      <ol className="space-y-3">
        {thread.map((r: any, i: number) => {
          const staff = !!r.admin;
          return (
            <li key={r.replyid ?? i} className={`rounded-2xl border p-4 sm:p-5 ${staff ? 'ml-4 border-brand-100 bg-brand-50/50 sm:ml-12' : 'mr-4 border-slate-200 bg-white sm:mr-12'}`}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className="font-semibold text-slate-800">{staff ? `${r.admin} (staff)` : r.requestor_name || r.name || customer || 'Customer'}</span>
                <span className="text-slate-400">{r.date}</span>
              </div>
              <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-700">{plainText(String(r.message || '')) || <i className="text-slate-400">(empty)</i>}</div>
              {Array.isArray(r.attachments) && r.attachments.length > 0 && <p className="mt-2 text-xs text-slate-400">{r.attachments.length} attachment(s) — open in WHMCS to download.</p>}
            </li>
          );
        })}
      </ol>

      <TicketAiCard id={id} />

      <Card title="Reply" className="mt-6">
        {!cfg.adminUsername && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Set your WHMCS admin username on the <Link className="font-semibold underline" href="/admin/support">Support page</Link> before replying.</p>}
        <form action={replyTicket} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <textarea name="message" required minLength={2} rows={7} className="input min-h-[160px] text-[15px]" placeholder={`Hi ${customer.split(' ')[0] || 'there'},\n\n`} aria-label="Reply message" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="shrink-0">Then set status</span>
              <select name="status" defaultValue="keep" className="input h-11">
                <option value="keep">Answered (default)</option>
                {statuses.filter((x) => x !== 'Answered').map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <button className="btn btn-primary h-12 w-full text-[15px] sm:ml-auto sm:w-auto sm:px-8">Send reply</button>
          </div>
          <p className="text-xs text-slate-400">The customer gets the normal WHMCS reply email. Plain text; line breaks are kept.</p>
        </form>
      </Card>

      <Card title="Status" className="mt-6">
        <form action={setTicketStatus} className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="id" value={id} />
          <select name="status" defaultValue={status} className="input h-11 flex-1" aria-label="Ticket status">
            {[...new Set([status, ...statuses])].filter(Boolean).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="btn btn-secondary h-11">Update status</button>
        </form>
      </Card>
    </div>
  );
}
