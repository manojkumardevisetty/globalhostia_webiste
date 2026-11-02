import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Badge, Flash, Empty, Field, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { supportDepartments, supportSettings, checkTicketsSoon } from '@/lib/support-notify';
import { saveSupportSettings, sendTest, checkNow } from './actions';
import { AWAITING, ticketTone as statusTone, priorityTone } from './tones';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

const arr = (v: any): any[] => (Array.isArray(v) ? v : v ? [v] : []);

export default async function Support({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('commerce');
  const sp = await searchParams;
  const all = sp.view === 'all';
  if (!whmcsConfigured()) return <><PageHeader title="Support" /><Empty icon="ticket">WHMCS is not configured.</Empty></>;
  checkTicketsSoon('admin-support'); // every visit doubles as a notifier run

  const cfg = await supportSettings();
  const [tk, depts, owner, recent] = await Promise.all([
    whmcs('GetTickets', { status: all ? undefined : 'All Active Tickets', limitnum: 100, ignore_dept_assignments: true }).then((r) => ({ list: arr(r.tickets?.ticket), err: '' })).catch((e: any) => ({ list: [] as any[], err: String(e.message) })),
    supportDepartments().then((d) => ({ list: d, err: '' })).catch((e: any) => ({ list: [] as { id: number; name: string; email: string }[], err: String(e.message) })),
    whmcs('GetClientsDetails', { clientid: cfg.clientId }).then((r) => { const c = r.client ?? r; return { email: String(c.email || ''), name: `${c.firstname || ''} ${c.lastname || ''}`.trim() || String(c.companyname || '') }; }).catch(() => null),
    db.select().from(schema.ticketNotify).orderBy(desc(schema.ticketNotify.notifiedAt)).limit(5).catch(() => []),
  ]);
  const deptName = new Map(depts.list.map((d) => [d.id, d.name]));
  const tickets = tk.list.map((t) => ({
    id: Number(t.id), tid: String(t.tid || ''), subject: String(t.subject || '(no subject)'), status: String(t.status || ''), priority: String(t.priority || ''),
    name: String(t.requestor_name || t.name || t.owner_name || ''), email: String(t.requestor_email || t.email || ''),
    dept: deptName.get(Number(t.deptid)) || '', last: String(t.lastreply || t.date || ''),
  })).sort((a, b) => Number(AWAITING.test(b.status)) - Number(AWAITING.test(a.status)) || b.last.localeCompare(a.last));
  const waiting = tickets.filter((t) => AWAITING.test(t.status)).length;
  const noDepts = !depts.err && depts.list.length === 0;

  return (
    <>
      <PageHeader title="Support" desc="Customer tickets from WHMCS. Tickets waiting for your reply are listed first; you get an email for every new ticket or customer reply."
        actions={<form action={checkNow}><button className="btn btn-secondary"><Icon name="refresh" /> Check now</button></form>} />
      <Flash sp={sp} />

      {noDepts && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          <p className="flex items-center gap-2 font-semibold"><Icon name="alert" className="h-4 w-4" /> No support departments exist in WHMCS — customers cannot open tickets.</p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 leading-relaxed">
            <li>Sign in to the WHMCS admin area.</li>
            <li>Go to <b>Configuration (wrench icon) → System Settings → Support Departments</b>.</li>
            <li>Click <b>Add New Department</b>. Name it e.g. <i>Technical Support</i>, set the department email (e.g. support@globalhostia.com) and tick your admin user under <b>Assigned Admins</b>.</li>
            <li>Repeat for <i>Billing</i> and <i>Sales</i> if you want separate queues, then reload this page.</li>
          </ol>
        </div>
      )}
      {depts.err && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Could not load departments: {depts.err}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Link href="/admin/support" className={`rounded-full px-3 py-1.5 font-medium ${!all ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>Active</Link>
            <Link href="/admin/support?view=all" className={`rounded-full px-3 py-1.5 font-medium ${all ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>All incl. closed</Link>
            <span className="ml-auto text-slate-500">{waiting ? <b className="text-red-600">{waiting} awaiting reply</b> : 'Nothing waiting'} · {tickets.length} shown</span>
          </div>
          {tk.err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">WHMCS error: {tk.err}</p>}
          {!tk.err && !tickets.length ? <Empty icon="ticket">No tickets{all ? '' : ' open right now'}.</Empty> : (
            <ul className="card divide-y divide-slate-100 overflow-hidden">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/support/${t.id}`} className={`flex items-start gap-3 px-4 py-3.5 transition hover:bg-brand-50/40 sm:px-5 ${AWAITING.test(t.status) ? 'bg-amber-50/40' : ''}`}>
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${AWAITING.test(t.status) ? 'bg-red-500' : 'bg-slate-300'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-[15px] font-semibold text-slate-900">{t.subject}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-slate-500">#{t.tid} · {t.name || t.email || 'Guest'}{t.dept ? ` · ${t.dept}` : ''}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                        {t.priority && <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>}
                        <span className="text-xs text-slate-400">{t.last}</span>
                      </span>
                    </span>
                    <Icon name="chevron" className="mt-1 h-4 w-4 shrink-0 -rotate-90 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <Card title="Email notifications">
            <form action={saveSupportSettings} className="space-y-4">
              <Field label="Notify WHMCS client ID" hint={owner ? <>Emails go to <b className="text-slate-600">{owner.email || 'no email on file'}</b>{owner.name ? ` (${owner.name})` : ''}. Change the address on that client in WHMCS.</> : 'Could not load this client from WHMCS — check the ID.'}>
                <input name="support_notify_clientid" defaultValue={cfg.clientId} inputMode="numeric" className="input" required />
              </Field>
              <Field label="WHMCS admin username for replies" hint="Your WHMCS admin login name. Replies you send here appear in WHMCS as this admin.">
                <input name="support_admin_username" defaultValue={cfg.adminUsername} className="input" placeholder="e.g. manoj" autoComplete="off" />
              </Field>
              {can(s, 'settings') ? <button className="btn btn-primary w-full">Save settings</button> : <p className="text-xs text-slate-400">Only owners and admins with Settings access can change these.</p>}
            </form>
            <form action={sendTest} className="mt-3"><button className="btn btn-secondary w-full"><Icon name="check" /> Send test notification</button></form>
            {!cfg.adminUsername && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Set the admin username to reply from this page.</p>}
            {recent.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
                <p className="mb-1 font-semibold text-slate-600">Last notifications</p>
                {recent.map((r) => <p key={r.ticketId} className="flex justify-between gap-2"><Link href={`/admin/support/${r.ticketId}`} className="text-brand-600">#{r.tid || r.ticketId}</Link><span>{fmtDate(r.notifiedAt)}</span></p>)}
              </div>
            )}
          </Card>

          <Card title="Also turn on WHMCS's own alerts">
            <p className="mb-3 text-sm text-slate-500">Belt and braces: WHMCS can email you directly too. Check these once:</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
              <li>WHMCS Admin → <b>My Account</b> (your name, top right) → under <b>Support Ticket Notifications</b> tick <b>every department</b> → Save.</li>
              <li>Configuration → System Settings → <b>Email Templates</b> → <b>Admin Messages</b>: make sure <b>Support Ticket Created</b> and <b>Support Ticket Response</b> are <b>not disabled</b>.</li>
              <li>Configuration → System Settings → <b>Support Departments</b>: each department should list you under <b>Assigned Admins</b>.</li>
              <li>Configuration → System Settings → General Settings → <b>Mail</b>: use <i>Send Test Email</i> to confirm WHMCS mail works.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-400">Departments found: {depts.err ? 'unknown' : depts.list.length ? depts.list.map((d) => d.name).join(', ') : 'none'}</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
