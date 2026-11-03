import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Card, Field, Badge, fmtDate } from '@/components/ui';
import { getSettings } from '@/lib/settings';
import { requireSession } from '@/lib/session';
import { brokerConfig, commissionFor, BROKER_STATUSES, BROKER_STATUS_LABEL, brokerTone, type BrokerStatus } from '@/lib/broker';
import { updateBroker } from '../actions';

export const metadata = { title: 'Broker request' };
export const dynamic = 'force-dynamic';

const amt = (v: string | null, cur: string) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`);
const localInput = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default async function BrokerRequest({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireSession('commerce');
  const { id } = await params;
  const sp = await searchParams;
  const [r] = await db.select().from(schema.brokerRequests).where(eq(schema.brokerRequests.id, id)).catch(() => []);
  if (!r) notFound();
  const s = await getSettings();
  const cfg = brokerConfig(s);
  const base = String(s.whmcs_base_url || 'https://globalhostia.com/secure').replace(/\/$/, '');
  const adminBase = String(s.whmcs_admin_url || `${base}/admin`).replace(/\/$/, '');
  const wa = r.phone.replace(/[^\d]/g, '');
  const msg = encodeURIComponent(`Hello ${r.name.split(' ')[0]}, this is Globalhostia about your domain broker request for ${r.domain} (ref ${r.ref}).`);
  const links: [string, string][] = [
    ...(wa ? [[`WhatsApp ${r.phone}`, `https://wa.me/${wa}?text=${msg}`] as [string, string]] : []),
    [`Email ${r.email}`, `mailto:${r.email}?subject=${encodeURIComponent(`Your domain broker request: ${r.domain} (${r.ref})`)}`],
    ['WHOIS lookup (ICANN)', `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(r.domain)}`],
    ...(r.ticketId ? [[`WHMCS ticket #${r.ticketNum || r.ticketId}`, `${adminBase}/supporttickets.php?action=view&id=${encodeURIComponent(r.ticketId)}`] as [string, string]] : []),
    ['Open the domain', `http://${r.domain}`],
  ];
  const history = await db.select().from(schema.auditLogs)
    .where(and(or(eq(schema.auditLogs.entity, 'broker_request')), eq(schema.auditLogs.entityId, r.ref)))
    .orderBy(desc(schema.auditLogs.createdAt)).limit(50).catch(() => []);
  const preview = r.agreedPrice ? commissionFor(Number(r.agreedPrice), cfg.pct, cfg.minUsd) : null;

  return (
    <>
      <PageHeader title={r.domain} desc={<>Reference <b>{r.ref}</b> · received {fmtDate(r.createdAt)} · <Badge tone={brokerTone(r.status)}>{BROKER_STATUS_LABEL[r.status as BrokerStatus] || r.status}</Badge></>}
        actions={<Link href="/admin/domains/broker" className="btn btn-secondary">All broker requests</Link>} />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Pipeline">
            <form action={updateBroker} className="grid gap-4 sm:grid-cols-2" data-broker-form>
              <input type="hidden" name="id" value={r.id} />
              <Field label="Status"><select name="status" defaultValue={r.status} className="input">{BROKER_STATUSES.map((st) => <option key={st} value={st}>{BROKER_STATUS_LABEL[st]}</option>)}</select></Field>
              <Field label="Assigned broker"><input name="assigned" defaultValue={r.assigned} className="input" placeholder="Name or email" maxLength={80} /></Field>
              <Field label={`Agreed purchase price (${r.currency})`} hint={`Commission is calculated on save: max(${cfg.pct}% × price, minimum ${cfg.minUsd} USD${r.currency === 'USD' ? '' : ' converted with our catalog ratio'}).`}>
                <input name="agreed_price" defaultValue={r.agreedPrice ?? ''} inputMode="decimal" className="input" placeholder="e.g. 2500" /></Field>
              <Field label={`Commission (${r.currency})`} hint="Calculated automatically, read-only."><input value={r.commission ?? ''} readOnly className="input bg-slate-50" aria-readonly placeholder="—" /></Field>
              <Field label="Owner contacted at" hint="Filled automatically when you move the request to “Contacting owner”."><input type="datetime-local" name="owner_contacted_at" defaultValue={localInput(r.ownerContactedAt)} className="input" /></Field>
              <div />
              <Field label="Notes" className="sm:col-span-2"><textarea name="notes" defaultValue={r.notes} rows={4} className="input" /></Field>
              <Field label="Outcome notes" hint="What happened: owner's answer, final price, escrow reference, reason for failure." className="sm:col-span-2"><textarea name="outcome_notes" defaultValue={r.outcomeNotes} rows={4} className="input" /></Field>
              <div className="flex items-center gap-3 sm:col-span-2">
                <button className="btn btn-primary">Save</button>
                {preview !== null && r.currency === 'USD' && <span className="text-xs text-slate-500">Current commission at {cfg.pct}%: {preview.toLocaleString('en-US')} USD</span>}
              </div>
            </form>
          </Card>
          <Card title="Activity">
            {!history.length ? <p className="text-sm text-slate-500">No activity yet.</p> : (
              <ul className="space-y-2 text-sm">{history.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-3"><span className="whitespace-nowrap text-slate-400">{fmtDate(h.createdAt)}</span><span className="font-medium text-slate-700">{h.userEmail}</span>
                  <span className="text-slate-600">{h.action === 'broker_request' ? 'request received from the website' : Object.entries((h.detail as Record<string, unknown>) || {}).filter(([k]) => k !== 'domain').map(([k, v]) => `${k}: ${String(v ?? '—')}`).join(', ') || h.action}</span></li>))}</ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Customer">
            <dl className="space-y-2 text-sm">
              {[['Name', r.name], ['Email', r.email], ['WhatsApp', r.phone || '—'], ['Budget', `${r.budgetMin ? `${Number(r.budgetMin).toLocaleString('en-US')} to ` : 'up to '}${amt(r.budgetMax, r.currency)}`], ['Intended use', r.use || '—'], ['Agreed price', amt(r.agreedPrice, r.currency)], ['Commission', amt(r.commission, r.currency)], ['WHMCS ticket', r.ticketNum || '— (not opened)'], ['Source', [r.utmSource, r.utmMedium, r.utmCampaign].filter(Boolean).join(' / ') || '—'], ['Referrer', r.referrer || '—'], ['Updated', fmtDate(r.updatedAt)]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="break-all text-right font-medium text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </Card>
          <Card title="Quick links">
            <ul className="space-y-1.5 text-sm">{links.map(([l, h]) => <li key={h}><a href={h} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline-offset-2 hover:underline">{l}</a></li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
