import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Card, Field, Flash, Badge, fmtDate } from '@/components/ui';
import { LEAD_STATUSES, STATUS_LABEL, sourceLabel, waChat, type LeadStatus } from '@/lib/leads';
import { saveLead, deleteLead } from '../actions';
import ConfirmDelete from './ConfirmDelete';

export const metadata = { title: 'Lead' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = { new: 'blue', contacted: 'yellow', won: 'green', lost: 'gray' };

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireSession('commerce');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!lead) notFound();
  const [settings, history, others] = await Promise.all([
    getSettings(),
    db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entity, 'lead'), eq(schema.auditLogs.entityId, id))).orderBy(desc(schema.auditLogs.createdAt)).limit(50),
    db.select({ id: schema.leads.id, source: schema.leads.source, createdAt: schema.leads.createdAt, status: schema.leads.status }).from(schema.leads)
      .where(or(eq(schema.leads.email, lead.email), lead.phone ? eq(schema.leads.phone, lead.phone) : eq(schema.leads.id, '-'))).orderBy(desc(schema.leads.createdAt)).limit(20),
  ]);
  const site = String(settings.site_name || 'GlobalHostia');
  const greet = `Hello${lead.name ? ' ' + lead.name : ''}, this is ${site}. Thanks for your interest${lead.interest ? ` (${lead.interest.slice(0, 120)})` : ''}. How can we help?`;
  const mail = `mailto:${lead.email}?subject=${encodeURIComponent(`Your enquiry with ${site}`)}&body=${encodeURIComponent(`${greet}\n\n`)}`;
  const row = (k: string, v: React.ReactNode) => <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-slate-100 py-2 text-sm last:border-0"><dt className="text-slate-500">{k}</dt><dd className="min-w-0 break-words text-slate-800">{v || <span className="text-slate-400">—</span>}</dd></div>;
  const ACTION: Record<string, string> = { lead_create: 'Signed up', status: 'Status changed', update: 'Updated', delete: 'Deleted' };

  return (
    <>
      <PageHeader title={lead.email} desc={<>Lead from {sourceLabel(lead.source)} · {fmtDate(lead.createdAt)} · <Badge tone={TONE[lead.status] || 'gray'}>{STATUS_LABEL[lead.status as LeadStatus] || lead.status}</Badge></>}
        actions={<>
          {lead.phone && <a className="btn btn-primary" href={waChat(lead.phone, greet)} target="_blank" rel="noopener noreferrer">Open in WhatsApp</a>}
          <a className="btn btn-secondary" href={mail}>Email</a>
          <Link className="btn btn-ghost" href="/admin/leads">All leads</Link>
        </>} />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-6">
          <form action={saveLead}>
            <input type="hidden" name="id" value={lead.id} />
            <Card title="Follow-up" actions={<button className="btn btn-primary">Save</button>}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Status">
                  <select name="status" defaultValue={lead.status} className="input">{LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
                </Field>
                <Field label="Name"><input name="name" defaultValue={lead.name} maxLength={80} className="input" /></Field>
                <Field label="Notes" className="sm:col-span-2" hint="Internal only. Every change is kept in the history on the right.">
                  <textarea name="notes" rows={7} defaultValue={lead.notes} maxLength={5000} className="input" placeholder="Called on WhatsApp, interested in the Ultra plan, follow up next week…" />
                </Field>
              </div>
            </Card>
          </form>
          <Card title="Details">
            <dl>
              {row('Email', <a className="text-brand-600" href={mail}>{lead.email}</a>)}
              {row('WhatsApp / phone', lead.phone ? <a className="text-emerald-700" href={waChat(lead.phone, greet)} target="_blank" rel="noopener noreferrer">{lead.phone}</a> : '')}
              {row('Interest', lead.interest)}
              {row('Source', sourceLabel(lead.source))}
              {row('Page', lead.page ? <a className="text-brand-600" href={lead.page} target="_blank">{lead.page}</a> : '')}
              {row('Country', lead.country)}
              {row('Campaign', lead.utmSource ? <span className="font-mono text-xs">utm_source={lead.utmSource}{lead.utmMedium && <> · utm_medium={lead.utmMedium}</>}{lead.utmCampaign && <> · utm_campaign={lead.utmCampaign}</>}{lead.utmTerm && <> · utm_term={lead.utmTerm}</>}{lead.utmContent && <> · utm_content={lead.utmContent}</>}</span> : 'Direct / organic (no utm tags)')}
              {row('Consent', lead.consent ? 'Yes, ticked the consent box' : 'No')}
              {row('Received', fmtDate(lead.createdAt))}
              {row('Last change', fmtDate(lead.updatedAt))}
            </dl>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="History">
            {!history.length ? <p className="text-sm text-slate-500">No history yet.</p> : (
              <ol className="space-y-3">{history.map((h) => {
                const d = (h.detail || {}) as Record<string, any>;
                const what = h.action === 'status' ? `${d.from} → ${d.to}` : h.action === 'update' ? Object.keys(d).filter((k) => k !== 'email').map((k) => k === 'status' ? `status ${d.status.from} → ${d.status.to}` : k).join(', ') : h.action === 'lead_create' ? `${sourceLabel(d.source || '')}${d.utm_source ? ` · ${d.utm_source}` : ''}` : '';
                return <li key={h.id} className="text-sm"><div className="font-medium text-slate-800">{ACTION[h.action] || h.action}{what ? <span className="font-normal text-slate-600"> · {what}</span> : null}</div><div className="text-xs text-slate-500">{fmtDate(h.createdAt)} · {h.userEmail}</div></li>;
              })}</ol>
            )}
          </Card>
          {others.length > 1 && (
            <Card title="Other sign-ups from this person">
              <ul className="space-y-2 text-sm">{others.filter((o) => o.id !== lead.id).map((o) => <li key={o.id}><Link className="text-brand-600" href={`/admin/leads/${o.id}`}>{sourceLabel(o.source)}</Link> <span className="text-xs text-slate-500">· {fmtDate(o.createdAt)} · {o.status}</span></li>)}</ul>
            </Card>
          )}
          <Card title="Remove">
            <p className="mb-3 text-sm text-slate-600">Delete this lead permanently, for example when the person asks to be removed. This cannot be undone.</p>
            <form action={deleteLead}><input type="hidden" name="id" value={lead.id} /><ConfirmDelete /></form>
          </Card>
        </div>
      </div>
    </>
  );
}
