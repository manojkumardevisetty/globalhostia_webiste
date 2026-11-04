import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Badge, Flash, Field, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import { loadReportConfig, reportState, reportLog, reportStats, previewFor } from '@/lib/cx/report-engine';
import { monthOf, prevMonth, windowMonth, MONTH_RE } from '@/lib/cx/report-core';
import { monthName } from '@/lib/cx/report-email';
import { composeFull, transportReady } from '@/lib/reminders/send';
import { loadConfig as remindersConfig } from '@/lib/reminders/store';
import { supportSettings } from '@/lib/support-notify';
import { setReportSwitch, saveReportSettings, sendReportTest, runReportsNow } from './actions';

export const metadata = { title: 'Site reports' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('commerce');
  const sp = await searchParams;
  const edit = can(s, 'settings');
  const tab = ['preview', 'settings', 'log'].includes(sp.tab) ? sp.tab : 'preview';
  const now = Date.now();
  const last = prevMonth(monthOf(now));
  const month = MONTH_RE.test(sp.m || '') ? sp.m : last;
  const [cfg, st, rcfg, owner] = await Promise.all([loadReportConfig(), reportState(), remindersConfig().catch(() => null), supportSettings().catch(() => ({ clientId: 1 }))]);
  const cid = Number(sp.cid) > 0 ? Number(sp.cid) : owner.clientId;
  const pl = sp.pl === 'ar' ? 'ar' : sp.pl === 'en' ? 'en' : undefined;
  const preview = tab === 'preview' ? await previewFor(cid, month, pl).catch((e: any) => ({ error: String(e?.message || e) })) : null;
  const [log, stats] = tab === 'log' ? await Promise.all([reportLog(200), reportStats(windowMonth(now, cfg) || last)]) : [[], {} as Record<string, number>];
  const ready = rcfg ? transportReady(rcfg) : false;
  const lr: any = st.lastResult || {};
  const months = Array.from({ length: 6 }, (_, i) => { let m = monthOf(now); for (let k = 0; k < i; k++) m = prevMonth(m); return m; });
  const tabLink = (k: string, label: string) => <Link href={`/admin/reports?tab=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{label}</Link>;

  return (
    <>
      <PageHeader title="Site reports" desc="The monthly “Your site report” email: per site, our health checks over the month, SSL, SPF / DKIM / DMARC, backups, disk and bandwidth, renewals in the next 60 days and 1–2 tips (help videos, or a plan with its real catalog price). Sections without data are left out. Sent on the 1st (Dubai time), spread over the first days, with the quiet hours, caps and unsubscribe from Reminders. Customers also see it under Account → Site reports."
        actions={<form action={runReportsNow}><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="activity" /> Run now</button></form>} />
      <Flash sp={sp} />

      <section className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${cfg.enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-full ${cfg.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}><Icon name={cfg.enabled ? 'check' : 'mail'} className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900">{cfg.enabled ? 'Monthly emails are ON' : 'Monthly emails are OFF (the portal page works either way)'}</p>
          <p className="text-sm text-slate-500">Email via <b>{rcfg?.transport === 'smtp' ? 'SMTP' : 'WHMCS SendEmail'}</b> {ready ? <Badge tone="green">ready</Badge> : <Badge tone="red">not configured</Badge>} · window days 1–{cfg.windowDays} (+1 catch-up day) · up to {cfg.perRun} per run · last run {st.lastRun ? fmtDate(st.lastRun) : 'never'}{lr.month ? ` (${lr.month}: ${lr.sent ?? 0} sent${lr.stopped ? `, ${lr.stopped}` : ''})` : lr.stopped ? ` (${lr.stopped})` : ''}</p>
        </div>
        {edit && <form action={setReportSwitch}><input type="hidden" name="on" value={cfg.enabled ? '0' : '1'} /><button className={`btn ${cfg.enabled ? 'btn-secondary' : 'btn-primary'}`}>{cfg.enabled ? 'Stop monthly emails' : 'Switch monthly emails on'}</button></form>}
      </section>

      <div className="mb-5 flex flex-wrap gap-2">{tabLink('preview', 'Preview & test')}{tabLink('settings', 'Settings')}{tabLink('log', 'Send log')}</div>

      {tab === 'preview' && (
        <Card title="Preview any customer’s report" actions={<span className="text-xs text-slate-500">Built live from real data. Nothing is stored or sent.</span>}>
          <form action="/admin/reports" className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="preview" />
            <Field label="WHMCS client ID"><input name="cid" defaultValue={cid} className="input w-36" inputMode="numeric" /></Field>
            <Field label="Month"><select name="m" defaultValue={month} className="input w-48">{months.map((m) => <option key={m} value={m}>{monthName(m, 'en')}{m === monthOf(now) ? ' (so far)' : ''}</option>)}</select></Field>
            <Field label="Language"><select name="pl" defaultValue={pl || ''} className="input w-44"><option value="">Client’s language</option><option value="en">English</option><option value="ar">Arabic</option></select></Field>
            <button className="btn btn-primary h-10"><Icon name="eye" /> Show</button>
          </form>
          {preview && 'error' in preview && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not build the report: {preview.error}</p>}
          {preview && !('error' in preview) && (<>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>Subject: <b className="text-slate-700">{preview.subject}</b></span>
              <span>· {preview.data.sites.length} site(s){preview.data.moreSites ? ` + ${preview.data.moreSites} more` : ''}, {preview.data.renewals.length} renewal(s), tips: {preview.data.tips.map((t) => t.key).join(', ') || 'none'}</span>
              <form action={sendReportTest} className="ml-auto flex items-center gap-2"><input type="hidden" name="cid" value={cid} /><input type="hidden" name="m" value={month} /><input type="hidden" name="lang" value={preview.lang} />
                <button className="btn btn-secondary h-9"><Icon name="mail" /> Send test to owner (#{owner.clientId})</button></form>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
              <iframe title="Report preview (light)" srcDoc={composeFull(preview.html, { lang: preview.lang })} sandbox="" className="h-[1100px] w-full rounded-lg border border-slate-200" />
              <iframe title="Report preview (dark, phone width)" srcDoc={composeFull(preview.html, { forceDark: true, lang: preview.lang })} sandbox="" className="h-[1100px] w-[390px] max-w-full rounded-lg border border-slate-200" />
            </div>
          </>)}
        </Card>
      )}

      {tab === 'settings' && (
        <form action={saveReportSettings} className="grid gap-6 xl:grid-cols-2">
          <Card title="Sending">
            <div className="space-y-4">
              <Field label="Spread over the first N days of the month" hint="Each customer gets a fixed slot between 08:00 on the 1st and 18:00 on the last day (Dubai time); quiet hours in their own country and the shared caps apply on top. One extra day catches anyone held back."><input name="window_days" defaultValue={cfg.windowDays} className="input w-28" inputMode="numeric" disabled={!edit} /></Field>
              <Field label="Max reports per run" hint="The WHMCS cron tick runs every few minutes; the daily cron adds a longer run."><input name="per_run" defaultValue={cfg.perRun} className="input w-28" inputMode="numeric" disabled={!edit} /></Field>
              <label className="flex items-start gap-2.5 text-sm text-slate-700"><input type="checkbox" name="product_tips" defaultChecked={cfg.productTips} className="mt-0.5 h-4 w-4 accent-slate-900" disabled={!edit} /><span><b className="font-semibold">Product tips</b><span className="block text-xs text-slate-500">When a hosting account is 80% full: the next plan in the same category, with its synced catalog price. For domain-only customers: the cheapest hosting plan. Never shown without a real price.</span></span></label>
            </div>
          </Card>
          <Card title="What the report uses">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              <li>Checks: the daily domain health run (Domain health page). Days are counted from the day this feature was installed; earlier months have no history.</li>
              <li>SSL and SPF / DKIM / DMARC: the latest check of each domain.</li>
              <li>Backups, disk and bandwidth: the hosting panel (DirectAdmin / cPanel / Plesk) as the account’s own user; WHMCS’s usage figures as fallback. Left out when the panel does not answer.</li>
              <li>Renewals: WHMCS services and domains due in the next 60 days with their recurring amounts.</li>
              <li>Unsubscribe: scope “report” (link in every email, and the switch in Account → App &amp; notifications).</li>
            </ul>
          </Card>
          <div className="xl:col-span-2">{edit ? <button className="btn btn-primary">Save settings</button> : <p className="text-xs text-slate-400">Only owners and admins with Settings access can change these.</p>}</div>
        </form>
      )}

      {tab === 'log' && (
        <Card title="Send log (latest 200)" actions={<span className="text-xs text-slate-500">{Object.entries(stats).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'Nothing for the current window yet'}</span>}>
          {!log.length ? <p className="text-sm text-slate-500">No reports sent yet.</p> : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2">When</th><th>Month</th><th>Client</th><th>Contents</th><th className="pr-5">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{log.map((r) => { const d: any = r.detail || {}; return (
                  <tr key={r.id}><td className="whitespace-nowrap px-5 py-2 text-slate-500">{fmtDate(r.sentAt || r.createdAt)}</td><td>{r.cycle}</td>
                    <td>{r.clientId ? <Link className="text-brand-600" href={`/admin/reports?tab=preview&cid=${r.clientId}&m=${r.cycle}`}>#{r.clientId}</Link> : '—'}<span className="block max-w-[200px] truncate text-xs text-slate-400">{r.email}</span></td>
                    <td className="text-xs text-slate-500">{d.sites !== undefined ? `${d.sites} site(s), ${d.renewals} renewal(s), tips: ${(d.tips || []).join(', ') || '—'}` : '—'}</td>
                    <td className="pr-5"><Badge tone={r.status === 'sent' ? 'green' : r.status === 'failed' ? 'red' : r.status === 'skipped' ? 'gray' : 'yellow'}>{r.status}</Badge>{r.error && <span className="block max-w-[240px] truncate text-xs text-slate-500" title={r.error}>{r.error}</span>}</td></tr>); })}</tbody>
              </table>
            </div>)}
        </Card>
      )}
    </>
  );
}
