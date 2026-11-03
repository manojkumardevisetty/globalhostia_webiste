import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Card, Flash, Badge, Empty, fmtDate } from '@/components/ui';
import { LEAD_STATUSES, STATUS_LABEL, sourceLabel, waChat, type LeadStatus } from '@/lib/leads';
import { DAYS, readFilter, listLeads, countLeads, countBy, filterQs } from './query';
import { setLeadStatus, setFooterForm } from './actions';

export const metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = { new: 'blue', contacted: 'yellow', won: 'green', lost: 'gray' };
const PER = 50;

export default async function Leads({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('commerce');
  const sp = await searchParams;
  const f = readFilter(sp);
  const page = Math.max(0, parseInt(sp.p || '0', 10) || 0);
  let err = '';
  const [settings, rows, total, bySource, byUtm, byMedium, byCampaign, byStatus] = await Promise.all([
    getSettings(),
    listLeads(f, PER, page * PER).catch((e) => { err = String(e?.message || e); return []; }),
    countLeads(f).catch(() => 0),
    countBy(f, 'source').catch(() => []), countBy(f, 'utm_source').catch(() => []), countBy(f, 'utm_medium').catch(() => []),
    countBy(f, 'utm_campaign').catch(() => []), countBy(f, 'status').catch(() => []),
  ]);
  const footerOn = !(settings.lead_footer === false || settings.lead_footer === 'false');
  const here = `/admin/leads${filterQs(f, { p: page ? String(page) : '' })}`.replace(/\?$/, '');
  const rangeTotal = byStatus.reduce((a, x) => a + x.n, 0);
  const statusN = (s: string) => byStatus.find((x) => x.k === s)?.n || 0;
  const rangeLabel = DAYS.find(([d]) => d === f.days)?.[1].toLowerCase() || '';

  const Breakdown = ({ title, rows: list, param, label = (k: string) => k || '(none)' }: { title: string; rows: { k: string; n: number }[]; param: 'source' | 'utm' | 'medium' | 'campaign'; label?: (k: string) => string }) => (
    <section className="card p-4">
      <h2 className="mb-2 text-[13px] font-semibold text-slate-900">{title}</h2>
      {!list.length ? <p className="text-xs text-slate-400">No leads yet.</p> : (
        <ul className="space-y-1">{list.map((x) => {
          const v = x.k || (param === 'source' ? '' : '(none)');
          const pct = rangeTotal ? Math.round((x.n / rangeTotal) * 100) : 0;
          return (
            <li key={x.k || '-'}>
              <Link href={`/admin/leads${filterQs(f, { [param]: v, p: '' } as any)}`} className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
                <span className="min-w-0 flex-1 truncate text-slate-700 group-hover:text-brand-700">{label(x.k)}</span>
                <span className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block" aria-hidden><span className="absolute inset-y-0 left-0 rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></span>
                <span className="w-8 text-right font-semibold tabular-nums text-slate-900">{x.n}</span>
              </Link>
            </li>
          );
        })}</ul>
      )}
    </section>
  );

  return (
    <>
      <PageHeader title="Leads" desc={<>Email and WhatsApp sign-ups from the footer form, pop-ups, the plan finder and ad landing pages. Leads are only stored here: nothing is emailed automatically and nothing is sent to WHMCS. Follow up by WhatsApp or email from each lead.</>}
        actions={<a className="btn btn-secondary" href={`/admin/leads/export${filterQs(f)}`.replace(/\?$/, '')}>Export CSV</a>} />
      <Flash sp={sp} />
      {err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Could not read leads ({err}). The database patch 017-leads runs on the next deploy.</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['Total', rangeTotal, ''], ...LEAD_STATUSES.map((s) => [STATUS_LABEL[s], statusN(s), s] as const)].map(([label, n, s]) => (
          <Link key={String(label)} href={`/admin/leads${filterQs(f, { status: String(s), p: '' })}`} className={`card p-4 transition hover:ring-2 hover:ring-brand-500/20 ${f.status === s && s ? 'ring-2 ring-brand-500/40' : ''}`}>
            <div className="text-xs text-slate-500">{label} · {rangeLabel}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{n}</div>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Breakdown title="By source" rows={bySource} param="source" label={sourceLabel} />
        <Breakdown title="By utm_source" rows={byUtm} param="utm" />
        <Breakdown title="By utm_medium" rows={byMedium} param="medium" />
        <Breakdown title="By utm_campaign" rows={byCampaign} param="campaign" />
      </div>

      <form className="mb-3 flex flex-wrap items-end gap-2" role="search" aria-label="Filter leads">
        <label className="min-w-[220px] flex-1"><span className="field-label">Search</span><input name="q" defaultValue={f.q} placeholder="Email, name, phone, interest or notes" className="input" /></label>
        <label><span className="field-label">Status</span><select name="status" defaultValue={f.status} className="input"><option value="">Any status</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
        <label><span className="field-label">Source</span><select name="source" defaultValue={f.source} className="input"><option value="">Any source</option>{[...new Set(['footer', 'popup', 'plan-finder', 'landing:*', ...bySource.map((x) => x.k), f.source].filter(Boolean))].map((s) => <option key={s} value={s}>{s === 'landing:*' ? 'Any landing page' : sourceLabel(s)}</option>)}</select></label>
        <label><span className="field-label">Period</span><select name="days" defaultValue={f.days} className="input">{DAYS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></label>
        {f.utm && <input type="hidden" name="utm" value={f.utm} />}{f.medium && <input type="hidden" name="medium" value={f.medium} />}{f.campaign && <input type="hidden" name="campaign" value={f.campaign} />}
        <button className="btn btn-primary">Filter</button>
        {(f.q || f.status || f.source || f.utm || f.medium || f.campaign || f.days !== '30') && <Link href="/admin/leads" className="btn btn-ghost">Reset</Link>}
      </form>
      {(f.utm || f.medium || f.campaign) && <p className="mb-3 text-xs text-slate-500">Filtered by {f.medium ? <>utm_medium <b>{f.medium}</b> </> : null}{f.utm ? <>utm_source <b>{f.utm}</b></> : null}{f.utm && f.campaign ? ' and ' : ''}{f.campaign ? <>utm_campaign <b>{f.campaign}</b></> : null}. <Link className="text-brand-600" href={`/admin/leads${filterQs(f, { utm: '', medium: '', campaign: '', p: '' })}`}>Clear</Link></p>}

      {!rows.length ? <Empty icon="users">No leads match these filters yet.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Lead</th><th>Source</th><th>Campaign</th><th>Interest</th><th>Received</th><th>Status</th><th><span className="sr-only">Contact</span></th></tr></thead>
            <tbody>{rows.map((l) => (
              <tr key={l.id}>
                <td className="max-w-[260px]">
                  <Link className="block truncate font-medium text-brand-600" href={`/admin/leads/${l.id}`}>{l.email}</Link>
                  <span className="block truncate text-xs text-slate-500">{[l.name, l.phone, l.country].filter(Boolean).join(' · ') || '—'}</span>
                </td>
                <td className="text-xs">{sourceLabel(l.source)}<span className="block max-w-[180px] truncate text-slate-400">{l.page}</span></td>
                <td className="text-xs">{l.utmSource ? <>{l.utmSource}{l.utmMedium ? ` / ${l.utmMedium}` : ''}<span className="block max-w-[160px] truncate text-slate-400">{l.utmCampaign}</span></> : <span className="text-slate-400">direct</span>}</td>
                <td className="max-w-[240px] text-xs"><span className="line-clamp-2">{l.interest || '—'}</span></td>
                <td className="whitespace-nowrap text-xs">{fmtDate(l.createdAt)}</td>
                <td>
                  <form action={setLeadStatus} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={l.id} /><input type="hidden" name="back" value={here} />
                    <select name="status" defaultValue={l.status} className="input h-8 w-[118px] py-0 text-xs" aria-label={`Status of ${l.email}`}>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
                    <button className="btn btn-secondary h-8 px-2.5 text-xs">Save</button>
                  </form>
                  <span className="mt-1 block"><Badge tone={TONE[l.status] || 'gray'}>{STATUS_LABEL[l.status as LeadStatus] || l.status}</Badge></span>
                </td>
                <td className="whitespace-nowrap text-xs">
                  {l.phone && <a className="mr-3 font-medium text-emerald-700 hover:underline" href={waChat(l.phone, `Hello${l.name ? ' ' + l.name : ''}, this is ${settings.site_name || 'GlobalHostia'}. Thanks for your interest`)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                  <a className="font-medium text-brand-600 hover:underline" href={`mailto:${l.email}?subject=${encodeURIComponent(`Your enquiry with ${settings.site_name || 'GlobalHostia'}`)}`}>Email</a>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <div className="flex items-center justify-between border-t p-3 text-sm text-slate-500">
            <span>{total} lead{total === 1 ? '' : 's'}</span>
            <span className="flex gap-2">
              {page > 0 && <Link className="btn btn-secondary" href={`/admin/leads${filterQs(f, { p: String(page - 1) })}`}>← Prev</Link>}
              {(page + 1) * PER < total && <Link className="btn btn-secondary" href={`/admin/leads${filterQs(f, { p: String(page + 1) })}`}>Next →</Link>}
            </span>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Where visitors can sign up">
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex items-center justify-between gap-3">
              <span><b className="text-slate-800">Footer form</b> “Get hosting deals &amp; guides”, on every page of the website.</span>
              <form action={setFooterForm}><input type="hidden" name="on" value={footerOn ? '0' : '1'} /><button className={`btn h-9 ${footerOn ? 'btn-secondary' : 'btn-primary'}`}>{footerOn ? 'Hide' : 'Show'}</button></form>
            </li>
            <li><b className="text-slate-800">Pop-ups</b>: switch on “Collect email addresses” in <Link className="text-brand-600" href="/admin/promotions">Promotions</Link>.</li>
            <li><b className="text-slate-800">Plan finder</b>: “Email me this recommendation” after the result on <a className="text-brand-600" href="/plan-finder" target="_blank">/plan-finder</a>.</li>
            <li><b className="text-slate-800">Ad landing pages</b>: the lead form toggle on each page in <Link className="text-brand-600" href="/admin/landing-pages">Landing pages</Link>.</li>
          </ul>
        </Card>
        <Card title="Privacy">
          <p className="text-sm text-slate-600">Every lead ticked a consent box. The visitor’s IP address is never stored (only a salted hash used for spam limits), the country comes from the network, and the campaign comes from the utm_* tags of their first visit in the last 30 days. Delete a lead from its page when someone asks to be removed. Exports and changes are recorded in the <Link className="text-brand-600" href="/admin/audit">Activity log</Link>.</p>
        </Card>
      </div>
    </>
  );
}
