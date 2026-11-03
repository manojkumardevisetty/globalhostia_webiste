import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Badge, Flash, Field, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import { CHECKS, CHECK_LABEL, issueCopy, SEV_RANK, type IssueKey, type IssueState } from '@/lib/health/core';
import { WA_HEALTH } from '@/lib/health/email';
import { loadHealthConfig, healthState, adminList, adminCounts, alertLog, testDomain, previewEmail } from '@/lib/health/engine';
import { composeFull, transportReady } from '@/lib/reminders/send';
import { loadConfig as remindersConfig } from '@/lib/reminders/store';
import { setSwitch, saveSettings, runNow } from './actions';
import CopyButton from '../emails/CopyButton';

export const metadata = { title: 'Domain health' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TONE: Record<string, string> = { critical: 'red', warning: 'yellow', ok: 'green', unknown: 'gray' };
const LABEL: Record<string, string> = { critical: 'Urgent', warning: 'Needs attention', ok: 'Healthy', unknown: 'Unknown' };
const FILTERS = ['all', 'critical', 'warning', 'ok', 'unknown', 'unchecked'];

export default async function Health({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('commerce');
  const sp = await searchParams;
  const edit = can(s, 'settings');
  const tab = ['domains', 'settings', 'test', 'log', 'email'].includes(sp.tab) ? sp.tab : 'domains';
  const status = FILTERS.includes(sp.status) ? sp.status : 'all';
  const pl = sp.pl === 'ar' ? 'ar' : 'en';
  const [cfg, st, counts, rows, log, rcfg] = await Promise.all([
    loadHealthConfig(), healthState(), adminCounts().catch(() => ({ total: 0, stale: 0 } as Record<string, number>)),
    tab === 'domains' ? adminList({ status: status === 'all' ? undefined : status, q: sp.q || undefined, limit: 300 }).catch(() => []) : Promise.resolve([]),
    tab === 'log' ? alertLog(150).catch(() => []) : Promise.resolve([]), remindersConfig().catch(() => null),
  ]);
  const test = tab === 'test' && sp.d ? await testDomain(sp.d).catch((e: any) => ({ error: String(e?.message || e) })) : null;
  const last: any = st.lastResult || {};
  const preview = tab === 'email' ? previewEmail(pl) : null;
  const ready = rcfg ? transportReady(rcfg) : false;
  const chk = (name: string, on: boolean, label: string, hint?: string) => (
    <label className="flex items-start gap-2.5 text-sm text-slate-700"><input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 h-4 w-4 accent-slate-900" disabled={!edit} /><span><b className="font-semibold">{label}</b>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span></label>
  );
  const tabLink = (k: string, label: string) => <Link href={`/admin/health?tab=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{label}</Link>;
  const issuesOf = (r: any) => (Object.entries(r.issues || {}) as [IssueKey, IssueState][]).filter(([, i]) => i).sort(([, a], [, b]) => SEV_RANK[b.sev] - SEV_RANK[a.sev]);

  return (
    <>
      <PageHeader title="Domain health" desc="Daily SSL, HTTPS, DNS, nameserver, A record, MX, SPF / DKIM / DMARC and registration checks for every customer domain (registered, hosting service, addon and alias). Customers are emailed only about new or worse problems, in the black-and-white reminders template, with quiet hours, caps and unsubscribe from Reminders."
        actions={<>
          <form action={runNow}><input type="hidden" name="sync" value="1" /><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="refresh" /> Update list + run</button></form>
          <form action={runNow}><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="activity" /> Run now</button></form>
        </>} />
      <Flash sp={sp} />

      <section className={`mb-4 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${cfg.enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-full ${cfg.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}><Icon name={cfg.enabled ? 'check' : 'alert'} className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900">{cfg.enabled ? 'Checks are ON' : 'Checks are OFF: nothing is checked or sent'}</p>
          <p className="text-sm text-slate-500">Last run {st.lastRun ? fmtDate(st.lastRun) : 'never'}{last.checked !== undefined ? ` · ${last.checked} checked, ${last.alerts ?? 0} alerts${last.deadline ? ', time budget reached' : ''}` : ''}{last.reason ? ` (${last.reason})` : ''} · WHMCS cron tick {st.lastTick ? fmtDate(st.lastTick) : 'never'}</p>
        </div>
        {edit && <form action={setSwitch}><input type="hidden" name="which" value="enabled" /><input type="hidden" name="on" value={cfg.enabled ? '0' : '1'} />
          <button className={`btn ${cfg.enabled ? 'bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}`}>{cfg.enabled ? 'Kill switch: stop checks and alerts' : 'Switch checks on'}</button></form>}
      </section>
      <section className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${cfg.alerts ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-full ${cfg.alerts ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}><Icon name="mail" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900">{cfg.alerts ? 'Customer alerts are ON' : 'Customer alerts are OFF (results show in the portal only)'}</p>
          <p className="text-sm text-slate-500">Email via <b>{rcfg?.transport === 'smtp' ? 'SMTP' : 'WHMCS SendEmail'}</b> {ready ? <Badge tone="green">ready</Badge> : <Badge tone="red">not configured</Badge>} · quiet {rcfg ? `${rcfg.quiet.start}:00–${rcfg.quiet.end}:00` : '—'} · caps {rcfg ? `${rcfg.caps.perDay}/day, ${rcfg.caps.perWeek}/week` : '—'} (shared with Reminders) · WhatsApp {cfg.whatsapp.enabled && cfg.whatsapp.template ? <Badge tone="green">on</Badge> : <Badge tone="gray">off</Badge>}</p>
        </div>
        {edit && <form action={setSwitch} className="flex flex-wrap items-center gap-3"><input type="hidden" name="which" value="alerts" /><input type="hidden" name="on" value={cfg.alerts ? '0' : '1'} />
          {!cfg.alerts && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" name="baseline" defaultChecked className="h-4 w-4 accent-slate-900" /> Don’t email about problems that are already open</label>}
          <button className={`btn ${cfg.alerts ? 'btn-secondary' : 'btn-primary'}`}>{cfg.alerts ? 'Stop customer alerts' : 'Start customer alerts'}</button></form>}
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[['all', 'Domains', counts.total], ['critical', 'Urgent', counts.critical || 0], ['warning', 'Needs attention', counts.warning || 0], ['ok', 'Healthy', counts.ok || 0], ['unchecked', 'Not checked in 24 h', counts.stale || 0]].map(([k, l, n]) => (
          <Link key={String(k)} href={`/admin/health?status=${k}`} className={`card p-4 transition hover:ring-2 hover:ring-slate-200 ${status === k && tab === 'domains' ? 'ring-2 ring-slate-900' : ''}`}>
            <span className="text-[13px] font-semibold text-slate-600">{l}</span>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${k === 'critical' && Number(n) ? 'text-red-600' : k === 'warning' && Number(n) ? 'text-amber-600' : 'text-slate-900'}`}>{n}</p>
          </Link>))}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">{tabLink('domains', 'Domains')}{tabLink('settings', 'Thresholds & checks')}{tabLink('test', 'Test a domain')}{tabLink('log', 'Alert log')}{tabLink('email', 'Email preview')}</div>

      {tab === 'domains' && (
        <Card title="Customer domains" actions={<form className="flex flex-wrap items-center gap-2" action="/admin/health">
          <select name="status" defaultValue={status} className="input h-9 w-auto py-1 text-sm">{FILTERS.map((f) => <option key={f} value={f}>{f === 'all' ? 'All statuses' : LABEL[f] || 'Never checked'}</option>)}</select>
          <input name="q" defaultValue={sp.q || ''} placeholder="Search domain" className="input h-9 w-44 py-1 text-sm" /><button className="btn btn-secondary h-9">Filter</button></form>}>
          {!rows.length ? <p className="text-sm text-slate-500">{counts.total ? 'No domains match this filter.' : 'No domains yet. Use “Update list + run” to build the list from WHMCS and the hosting panels.'}</p> : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2">Domain</th><th>Client</th><th>Status</th><th>Open issues</th><th>Since</th><th>Last checked</th><th className="pr-5"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">{rows.map((r) => { const list = issuesOf(r); return (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-2.5"><b className="font-mono text-[13px]">{r.domain}</b><span className="block text-xs text-slate-400">{(r.sources as string[]).join(' · ')}{r.external ? ' · external on purpose' : ''}</span></td>
                    <td><Link className="text-brand-600" href={`/admin/customers/${r.clientId}`}>#{r.clientId}</Link></td>
                    <td><Badge tone={TONE[r.status] || 'gray'}>{LABEL[r.status] || r.status}</Badge></td>
                    <td className="max-w-[340px] py-2.5">{list.length ? <ul className="space-y-0.5">{list.slice(0, 4).map(([k, i]) => <li key={k} className="text-xs"><span className={i.sev === 'critical' ? 'font-semibold text-red-700' : i.sev === 'warning' ? 'text-amber-700' : 'text-slate-500'}>{issueCopy(k, i.params, 'en').title}</span>{(r.lastAlerted as any)?.[k] ? <span className="ml-1 text-slate-400">· alerted</span> : null}</li>)}</ul> : <span className="text-slate-300">—</span>}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{r.firstSeenIssue ? fmtDate(r.firstSeenIssue) : '—'}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{r.lastChecked ? fmtDate(r.lastChecked) : 'never'}</td>
                    <td className="pr-5"><Link className="btn btn-secondary h-8 px-3 text-xs" href={`/admin/health?tab=test&d=${encodeURIComponent(r.domain)}`}>Test</Link></td>
                  </tr>); })}</tbody>
              </table>
            </div>)}
        </Card>
      )}

      {tab === 'settings' && (
        <form action={saveSettings} className="grid gap-6 xl:grid-cols-2">
          <Card title="Checks">
            <div className="space-y-3">{CHECKS.map((k) => <div key={k}>{chk(`check_${k}`, cfg.checks[k], CHECK_LABEL[k])}</div>)}
              <div className="flex flex-wrap gap-5 border-t border-slate-100 pt-3">{chk('src_addon', cfg.sources.addon, 'Addon domains', 'From the hosting panel (DirectAdmin domain list).')}{chk('src_alias', cfg.sources.alias, 'Alias / pointer domains')}</div>
            </div>
          </Card>
          <Card title="Thresholds">
            <div className="space-y-4">
              <Field label="SSL expiry alerts (days left)" hint="One alert per stage, e.g. 21, 7, 2, 0. 2 and 0 are urgent (WhatsApp for opted-in customers once expired)."><input name="ssl_days" defaultValue={cfg.sslDays.join(', ')} className="input" disabled={!edit} /></Field>
              <Field label="Domain expiry alerts (days left)" hint="Only for domains with auto-renew off, or within 7 days when the renewal is not paid. The Reminders “domain at risk” flow covers the same domains: keep one of them on to avoid two emails."><input name="domain_days" defaultValue={cfg.domainDays.join(', ')} className="input" disabled={!edit} /></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Re-check after (hours)" hint="Cursor: oldest first, at least daily."><input name="recheck_hours" defaultValue={cfg.recheckHours} className="input" inputMode="numeric" disabled={!edit} /></Field>
                <Field label="In parallel"><input name="concurrency" defaultValue={cfg.concurrency} className="input" inputMode="numeric" disabled={!edit} /></Field>
                <Field label="Max domains per run"><input name="per_run" defaultValue={cfg.perRun} className="input" inputMode="numeric" disabled={!edit} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="DNS timeout (ms)"><input name="t_dns" defaultValue={cfg.timeouts.dns} className="input" inputMode="numeric" disabled={!edit} /></Field>
                <Field label="TLS timeout (ms)"><input name="t_tls" defaultValue={cfg.timeouts.tls} className="input" inputMode="numeric" disabled={!edit} /></Field>
                <Field label="HTTP timeout (ms)"><input name="t_http" defaultValue={cfg.timeouts.http} className="input" inputMode="numeric" disabled={!edit} /></Field>
              </div>
            </div>
          </Card>
          <Card title="Delivery">
            <div className="space-y-4">
              {chk('resolved', cfg.resolvedNotice, 'Send a short “fixed” notice', 'When a problem we emailed about is gone.')}
              {chk('push', cfg.push, 'Web push for urgent problems', 'To devices with the “Domains” notification topic on.')}
              {chk('wa_on', cfg.whatsapp.enabled, 'WhatsApp for urgent problems (opted-in customers only)', 'SSL expired, site down, no nameservers, domain expiring / expired. Uses the WhatsApp connection from Reminders.')}
              <Field label="Approved WhatsApp template name"><input name="wa_template" defaultValue={cfg.whatsapp.template} placeholder={WA_HEALTH.name} className="input font-mono" disabled={!edit} /></Field>
              <div className="grid gap-3 lg:grid-cols-2">
                {(['en', 'ar'] as const).map((l) => <div key={l} dir={l === 'ar' ? 'rtl' : 'ltr'} className="rounded-lg bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-700"><div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">{l === 'en' ? `English · ${WA_HEALTH.category}` : 'Arabic'}<CopyButton target={`wa-health-${l}`} label="Copy" /></div><pre className="whitespace-pre-wrap font-sans">{WA_HEALTH[l]}</pre><textarea id={`wa-health-${l}`} readOnly defaultValue={WA_HEALTH[l]} className="sr-only" aria-hidden tabIndex={-1} /></div>)}
              </div>
              <p className="text-xs text-slate-500">Parameters: {WA_HEALTH.params.map((p, i) => `{{${i + 1}}} ${p}`).join(', ')}. Quiet hours, caps, unsubscribe and the email transport are the ones on the Reminders page.</p>
            </div>
          </Card>
          <div className="xl:col-span-2">{edit ? <button className="btn btn-primary">Save settings</button> : <p className="text-xs text-slate-400">Only owners and admins with Settings access can change these.</p>}</div>
        </form>
      )}

      {tab === 'test' && (
        <Card title="Test one domain" actions={<span className="text-xs text-slate-500">A fresh check: nothing is saved and nothing is sent.</span>}>
          <form action="/admin/health" className="mb-5 flex flex-wrap gap-2"><input type="hidden" name="tab" value="test" /><input name="d" defaultValue={sp.d || ''} placeholder="example.com" className="input max-w-sm font-mono" required /><button className="btn btn-primary"><Icon name="search" /> Check</button></form>
          {test && 'error' in test && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{test.error}</p>}
          {test && !('error' in test) && (
            <div className="space-y-4 text-sm">
              <p className="text-slate-600"><b className="font-mono">{test.domain}</b> · {test.ms} ms · {test.known ? `known (${test.target.sources.join(', ')}, client #${test.target.clientId})` : 'not a customer domain: checked as a registered domain'} · DNS via {test.facts.dns.via}</p>
              {!test.issues.length ? <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">No issues found.</p> : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{test.issues.map((i) => (
                  <li key={i.key} className="p-3"><div className="flex flex-wrap items-center gap-2"><Badge tone={i.sev === 'critical' ? 'red' : i.sev === 'warning' ? 'yellow' : 'gray'}>{i.sev}</Badge><b>{i.copy.title}</b><code className="text-xs text-slate-400">{i.key}{i.stage ? `:${i.stage}` : ''}</code></div>
                    <p className="mt-1 text-slate-600">{i.copy.explain}</p><p className="mt-1 text-xs text-slate-500">Fix link: <span className="font-mono">{i.fix.href || '—'}</span></p></li>))}</ul>)}
              <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Raw facts</summary><pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(test.facts, null, 2)}</pre></details>
            </div>)}
        </Card>
      )}

      {tab === 'log' && (
        <Card title="Alert log (latest 150)">
          {!log.length ? <p className="text-sm text-slate-500">No alerts sent yet.</p> : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-2">When</th><th>Client</th><th>Domain</th><th>Issue</th><th>Channel</th><th className="pr-5">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{log.map((r) => { const d: any = r.detail || {}; const [key, sev] = r.stage.split(':'); return (
                  <tr key={r.id}><td className="whitespace-nowrap px-5 py-2 text-slate-500">{fmtDate(r.sentAt || r.createdAt)}</td>
                    <td>{r.clientId ? <Link className="text-brand-600" href={`/admin/customers/${r.clientId}`}>#{r.clientId}</Link> : '—'}<span className="block max-w-[180px] truncate text-xs text-slate-400">{r.email}</span></td>
                    <td className="font-mono text-xs">{d.domain || r.item}</td>
                    <td className="text-xs">{sev === 'resolved' ? <Badge tone="green">fixed</Badge> : <Badge tone={sev === 'critical' ? 'red' : 'yellow'}>{sev}</Badge>} {issueCopy(key as IssueKey, { domain: d.domain || '' }, 'en').title}</td>
                    <td>{r.channel}</td>
                    <td className="pr-5"><Badge tone={r.status === 'sent' ? 'green' : r.status === 'failed' ? 'red' : 'yellow'}>{r.status}</Badge>{r.error && <span className="block max-w-[220px] truncate text-xs text-red-600" title={r.error}>{r.error}</span>}</td></tr>); })}</tbody>
              </table>
            </div>)}
        </Card>
      )}

      {tab === 'email' && preview && (
        <Card title="Alert email preview" actions={<Link href={`/admin/health?tab=email&pl=${pl === 'en' ? 'ar' : 'en'}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{pl === 'en' ? 'العربية' : 'English'}</Link>}>
          <p className="mb-2 text-xs text-slate-500">Subject: <b className="text-slate-700">{preview.subject}</b>. Example problems on yourbrand.com; real emails list the customer’s own domains, grouped, most urgent first.</p>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <iframe title="Alert preview (light)" srcDoc={composeFull(preview.html, { lang: pl })} sandbox="" className="h-[980px] w-full rounded-lg border border-slate-200" />
            <iframe title="Alert preview (dark, phone width)" srcDoc={composeFull(preview.html, { forceDark: true, lang: pl })} sandbox="" className="h-[980px] w-[390px] rounded-lg border border-slate-200" />
          </div>
        </Card>
      )}
    </>
  );
}
