import Link from 'next/link';
import { desc, ilike, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Card, Field, Badge, Empty, fmtDate } from '@/components/ui';
import { getSettings } from '@/lib/settings';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { brokerConfig, commissionFor, isBrokerStatus, BROKER_STATUSES, BROKER_STATUS_LABEL, BROKER_OPEN, BROKER_CLOSED, brokerTone as statusToneOf, type BrokerStatus } from '@/lib/broker';
import { whmcsConfigured } from '@/lib/whmcs';
import { quickStatus, saveBrokerSettings, createBrokerProduct } from './actions';

export const metadata = { title: 'Broker requests' };
export const dynamic = 'force-dynamic';

const amt = (v: string | null, cur: string) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`);

export default async function BrokerRequests({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sess = await requireSession('commerce');
  const sp = await searchParams;
  const s = await getSettings();
  const cfg = brokerConfig(s);
  const view = sp.view === 'table' || sp.status ? 'table' : 'board';
  const status = isBrokerStatus(sp.status) ? sp.status : '';
  const q = (sp.q || '').trim().slice(0, 80);
  let all: (typeof schema.brokerRequests.$inferSelect)[] = [];
  let tableMissing = false;
  try {
    const where = q ? or(ilike(schema.brokerRequests.domain, `%${q}%`), ilike(schema.brokerRequests.email, `%${q}%`), ilike(schema.brokerRequests.name, `%${q}%`), ilike(schema.brokerRequests.ref, `%${q}%`)) : undefined;
    all = await db.select().from(schema.brokerRequests).where(where).orderBy(desc(schema.brokerRequests.createdAt)).limit(1000);
  } catch { tableMissing = true; }
  const rows = status ? all.filter((r) => r.status === status) : all;
  const count = (st: BrokerStatus) => all.filter((r) => r.status === st).length;
  const pipeline = all.filter((r) => BROKER_OPEN.includes(r.status as BrokerStatus));
  const won = all.filter((r) => r.status === 'transferred');
  const commissionWon = won.reduce((a, r) => a + (r.commission ? Number(r.commission) : 0), 0);
  const ex = commissionFor(2000, cfg.pct, cfg.minUsd), exLow = commissionFor(500, cfg.pct, cfg.minUsd);

  const Quick = ({ r }: { r: (typeof rows)[number] }) => (
    <form action={quickStatus} className="mt-2 flex gap-1.5">
      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value="/admin/domains/broker" />
      <select name="status" defaultValue={r.status} className="input h-8 min-w-0 flex-1 py-0 pl-2 text-xs" aria-label={`Status of ${r.domain}`}>
        {BROKER_STATUSES.map((st) => <option key={st} value={st}>{BROKER_STATUS_LABEL[st]}</option>)}
      </select>
      <button className="btn btn-secondary h-8 px-2.5 text-xs">Move</button>
    </form>
  );

  return (
    <>
      <PageHeader title="Broker requests" desc={<>Domain Broker Service leads from <a className="text-brand-600 underline" href="/domain-broker" target="_blank">/domain-broker</a>. Fee: ${cfg.feeUsd} non-refundable, then {cfg.pct}% of the agreed price (minimum ${cfg.minUsd}) only on success.</>}
        actions={<>
          <Link href="/admin/domains" className="btn btn-ghost">Domains &amp; TLDs</Link>
          <Link href={view === 'board' ? '/admin/domains/broker?view=table' : '/admin/domains/broker'} className="btn btn-secondary">{view === 'board' ? 'Table view' : 'Pipeline view'}</Link>
          <a href={`/admin/domains/broker/export${status ? `?status=${status}` : ''}`} className="btn btn-primary">Export CSV</a>
        </>} />
      <Flash sp={sp} />
      {tableMissing && <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">The broker_requests table does not exist yet. It is created by the next deploy (db-setup patch 018-broker).</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[['Open requests', pipeline.length], ['New, not yet handled', count('new')], ['Deals in escrow', count('in_escrow')], ['Commission earned (closed deals)', commissionWon ? commissionWon.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0']].map(([l, v]) => (
          <div key={String(l)} className="card p-4"><div className="text-xs font-medium text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v}</div></div>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search domain, name, email or reference" className="input max-w-xs" />
        <select name="status" defaultValue={status} className="input w-48" aria-label="Filter by status">
          <option value="">All statuses</option>
          {BROKER_STATUSES.map((st) => <option key={st} value={st}>{BROKER_STATUS_LABEL[st]} ({count(st)})</option>)}
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>

      {!rows.length ? <Empty icon="globe">No broker requests{status || q ? ' match this filter' : ' yet'}. They appear here as soon as a visitor sends the form on /domain-broker.</Empty>
        : view === 'board' ? (
          <>
            <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
              <div className="flex gap-3">
                {BROKER_OPEN.map((st) => {
                  const list = rows.filter((r) => r.status === st);
                  return (
                    <section key={st} className="w-[236px] shrink-0 rounded-xl bg-slate-100/70 p-2.5" aria-label={BROKER_STATUS_LABEL[st]}>
                      <h2 className="flex items-center justify-between px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-slate-600"><span>{BROKER_STATUS_LABEL[st]}</span><span className="rounded-full bg-white px-2 text-slate-500">{list.length}</span></h2>
                      <div className="space-y-2">
                        {list.map((r) => (
                          <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-[13px] shadow-sm">
                            <Link href={`/admin/domains/broker/${r.id}`} className="block break-all font-semibold text-slate-900 hover:text-brand-600">{r.domain}</Link>
                            <div className="mt-1 text-slate-500">{r.name}</div>
                            <div className="mt-1 tabular-nums text-slate-600">Max {amt(r.budgetMax, r.currency)}</div>
                            {r.agreedPrice && <div className="tabular-nums text-emerald-700">Agreed {amt(r.agreedPrice, r.currency)}</div>}
                            <div className="mt-1 text-[11px] text-slate-400">{r.ref} · {fmtDate(r.createdAt)}</div>
                            <Quick r={r} />
                          </div>
                        ))}
                        {!list.length && <p className="px-1 py-3 text-center text-xs text-slate-400">Empty</p>}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
            {rows.some((r) => BROKER_CLOSED.includes(r.status as BrokerStatus)) && (
              <Card title="Closed" className="mt-6">
                <ul className="divide-y divide-slate-100 text-sm">
                  {rows.filter((r) => BROKER_CLOSED.includes(r.status as BrokerStatus)).slice(0, 30).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-2"><Badge tone={statusToneOf(r.status)}>{BROKER_STATUS_LABEL[r.status as BrokerStatus]}</Badge>
                      <Link className="font-semibold hover:text-brand-600" href={`/admin/domains/broker/${r.id}`}>{r.domain}</Link><span className="text-slate-500">{r.name}</span>
                      <span className="ml-auto tabular-nums text-slate-600">{r.commission ? `Commission ${amt(r.commission, r.currency)}` : ''}</span></li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ) : (
          <div className="card overflow-x-auto">
            <table className="table"><thead><tr><th>Domain</th><th>Status</th><th>Customer</th><th>Budget</th><th>Agreed</th><th>Commission</th><th>Ticket</th><th>Received</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/admin/domains/broker/${r.id}`} className="font-semibold hover:text-brand-600">{r.domain}</Link><div className="text-xs text-slate-400">{r.ref}</div></td>
                  <td><Badge tone={statusToneOf(r.status)}>{BROKER_STATUS_LABEL[r.status as BrokerStatus] || r.status}</Badge></td>
                  <td>{r.name}<div className="text-xs text-slate-500">{r.email}</div></td>
                  <td className="tabular-nums">{r.budgetMin ? `${Number(r.budgetMin).toLocaleString('en-US')}–` : 'up to '}{amt(r.budgetMax, r.currency)}</td>
                  <td className="tabular-nums">{amt(r.agreedPrice, r.currency)}</td>
                  <td className="tabular-nums">{amt(r.commission, r.currency)}</td>
                  <td>{r.ticketNum || '—'}</td>
                  <td className="whitespace-nowrap text-slate-500">{fmtDate(r.createdAt)}</td>
                </tr>))}</tbody></table>
          </div>
        )}

      {can(sess, 'settings') && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card title="Broker fees and WHMCS">
            <form action={saveBrokerSettings} className="grid gap-3 sm:grid-cols-2">
              <Field label="Service fee (USD)" hint="broker_fee_usd · non-refundable, paid to start"><input name="broker_fee_usd" defaultValue={cfg.feeUsd} inputMode="decimal" className="input" /></Field>
              <Field label="Success commission (%)" hint="broker_commission_pct"><input name="broker_commission_pct" defaultValue={cfg.pct} inputMode="decimal" className="input" /></Field>
              <Field label="Minimum commission (USD)" hint="broker_min_commission_usd"><input name="broker_min_commission_usd" defaultValue={cfg.minUsd} inputMode="decimal" className="input" /></Field>
              <Field label="WHMCS product ID" hint="broker_whmcs_pid · empty = success screen says we'll send the invoice"><input name="broker_whmcs_pid" defaultValue={cfg.pid} inputMode="numeric" className="input" /></Field>
              <Field label="Ticket department ID" hint="broker_department_id · empty = a Domains/Sales/Support department" className="sm:col-span-2"><input name="broker_department_id" defaultValue={cfg.dept} inputMode="numeric" className="input" /></Field>
              <Field label="Broker name (shown to customers)" hint="broker_name · e.g. Manoj"><input name="broker_name" defaultValue={String(s.broker_name ?? '')} className="input" /></Field>
              <Field label="Broker title" hint="broker_title · e.g. Domain broker, GlobalHostia"><input name="broker_title" defaultValue={String(s.broker_title ?? '')} className="input" /></Field>
              <Field label="Broker photo URL" hint="broker_photo · square headshot, https:// or /hp/img/… · empty = illustrated avatar" className="sm:col-span-2"><input name="broker_photo" defaultValue={String(s.broker_photo ?? '')} className="input" /></Field>
              <Field label="Broker team (one shown at random on each search)" hint="broker_team · one per line: Name | Title | Photo URL · real team members only, with their consent" className="sm:col-span-2"><textarea name="broker_team" defaultValue={String(s.broker_team ?? '')} rows={4} className="input" placeholder={'Manoj | Domain broker | https://…/manoj.jpg\nAisha | Domain broker | https://…/aisha.jpg'} /></Field>
              <p className="text-xs text-slate-500 sm:col-span-2">Example with these values: agreed price $2,000 → commission ${ex.toLocaleString('en-US')} ; agreed price $500 → commission ${exLow.toLocaleString('en-US')}{exLow > 500 * cfg.pct / 100 ? ' (minimum applies)' : ''}.</p>
              <button className="btn btn-primary sm:col-span-2">Save broker settings</button>
            </form>
          </Card>
          <Card title="WHMCS service-fee product">
            <p className="text-sm text-slate-600">{cfg.pid ? <>Linked to WHMCS product <b>#{cfg.pid}</b>{s.broker_whmcs_gid ? <> in group #{String(s.broker_whmcs_gid)}</> : null}. Visitors see “Pay the ${cfg.feeUsd} service fee to start” after sending a request.</> : <>No product linked yet. Visitors are told “We'll email/WhatsApp you within 1 business day to confirm and send the fee invoice”.</>}</p>
            {can(sess, 'integration') && (
              <form action={createBrokerProduct} className="mt-4">
                <button className="btn btn-primary" disabled={!whmcsConfigured()}>{cfg.pid ? 'Check / re-link WHMCS product' : 'Create / link WHMCS product'}</button>
                {!whmcsConfigured() && <span className="ml-3 text-xs text-red-600">WHMCS API is not configured.</span>}
              </form>
            )}
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
              <p><b className="text-slate-700">Automatic:</b> the button (and, once per deploy, the first page view or request while the ID is empty) finds a product named “Domain Broker Service” or creates one through the API: type Other, one-time ${cfg.feeUsd} USD (other currencies converted with the WHMCS currency rates), hidden, no domain options, in your “Domain…” product group. It needs AddProduct, GetProducts and GetCurrencies allowed for the API credential (WHMCS → System Settings → API Roles).</p>
              <p><b className="text-slate-700">Manual alternative:</b> WHMCS → System Settings → Products/Services → Create a New Product → type <b>Other</b>, name “Domain Broker Service”, Pricing tab: <b>One Time</b>, ${cfg.feeUsd} in USD; Custom Fields tab: add “Domain wanted” and “Max budget” (text, required, show on order form); Other tab: <b>Require Domain = off</b>. Save, then paste the product ID (pid in the URL) above.</p>
              <p>Custom fields cannot be created through the WHMCS API, so add “Domain wanted” and “Max budget” by hand if you want them on the invoice; the request details are always in the support ticket.</p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
