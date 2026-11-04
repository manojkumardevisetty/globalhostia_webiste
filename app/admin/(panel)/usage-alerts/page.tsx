import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Badge, Flash, Field, fmtDate } from '@/components/ui';
import { Icon } from '@/components/icons';
import { METRICS, METRIC_LABEL, DEFAULT_USAGE_COPY } from '@/lib/cx/usage-core';
import { loadUsageConfig, usageState, usageLog, previewUsageEmail } from '@/lib/cx/usage';
import { composeFull, transportReady } from '@/lib/reminders/send';
import { loadConfig as remindersConfig } from '@/lib/reminders/store';
import { setAlerts, saveSettings, runNow } from './actions';

export const metadata = { title: 'Usage alerts' };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function UsageAlerts({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('commerce');
  const sp = await searchParams;
  const edit = can(s, 'settings');
  const tab = ['settings', 'email', 'log'].includes(sp.tab) ? sp.tab : 'settings';
  const pl = sp.pl === 'ar' ? 'ar' : 'en';
  const [cfg, st, rcfg, log] = await Promise.all([loadUsageConfig(), usageState(), remindersConfig().catch(() => null), tab === 'log' ? usageLog(150).catch(() => []) : Promise.resolve([])]);
  const last: any = st.lastResult || {};
  const ready = rcfg ? transportReady(rcfg) : false;
  const preview = tab === 'email' ? previewUsageEmail(pl, cfg) : null;
  const chk = (name: string, on: boolean, label: string, hint?: string) => (
    <label className="flex items-start gap-2.5 text-sm text-slate-700"><input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 h-4 w-4 accent-slate-900" disabled={!edit} /><span><b className="font-semibold">{label}</b>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span></label>
  );
  const tabLink = (k: string, label: string) => <Link href={`/admin/usage-alerts?tab=${k}`} className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{label}</Link>;

  return (
    <>
      <PageHeader title="Usage alerts & setup checklist"
        desc="Hosting usage (disk, bandwidth, files / inodes, mailboxes) is read from the hosting panel every 6 hours and shown as meters in the customer portal with a one-click Upgrade (next plans in the same WHMCS product group, prorated quote from WHMCS, the order is placed only after the customer confirms). Alerts email at most once per threshold per month, with the quiet hours, caps and unsubscribe links of Reminders."
        actions={<>
          <form action={runNow}><input type="hidden" name="dry" value="1" /><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="eye" /> Dry run</button></form>
          <form action={runNow}><button className="btn btn-secondary" disabled={!cfg.enabled}><Icon name="activity" /> Run now</button></form>
        </>} />
      <Flash sp={sp} />

      <section className={`mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${cfg.enabled ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
        <span className={`grid h-11 w-11 place-items-center rounded-full ${cfg.enabled ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}><Icon name="mail" className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-slate-900">{cfg.enabled ? 'Customer usage alerts are ON' : 'Customer usage alerts are OFF (meters and Upgrade still show in the portal)'}</p>
          <p className="text-sm text-slate-500">Thresholds {cfg.warn}% / {cfg.critical}% · email via <b>{rcfg?.transport === 'smtp' ? 'SMTP' : 'WHMCS SendEmail'}</b> {ready ? <Badge tone="green">ready</Badge> : <Badge tone="red">not configured</Badge>} · push {cfg.push ? <Badge tone="green">on</Badge> : <Badge tone="gray">off</Badge>} · last run {st.lastRun ? fmtDate(st.lastRun) : 'never'}{last.services !== undefined ? ` (${last.services} services, ${last.alerts ?? 0} alerts${last.deadline ? ', time budget reached' : ''})` : ''} · setup checklist {cfg.checklist ? <Badge tone="green">shown</Badge> : <Badge tone="gray">hidden</Badge>}</p>
        </div>
        {edit && <form action={setAlerts}><input type="hidden" name="on" value={cfg.enabled ? '0' : '1'} /><button className={`btn ${cfg.enabled ? 'btn-secondary' : 'btn-primary'}`}>{cfg.enabled ? 'Stop usage alerts' : 'Start usage alerts'}</button></form>}
      </section>

      <div className="mb-4 flex flex-wrap gap-2">{tabLink('settings', 'Settings')}{tabLink('email', 'Email preview')}{tabLink('log', 'Sent log')}</div>

      {tab === 'settings' && (
        <form action={saveSettings} className="grid gap-6 xl:grid-cols-2">
          <Card title="Thresholds and channels">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Warning at (%)" hint="Amber meter and the first email."><input name="warn" type="number" min={50} max={98} defaultValue={cfg.warn} className="input" disabled={!edit} /></Field>
              <Field label="Critical at (%)" hint="Red meter, strip on the dashboard, a second email."><input name="critical" type="number" min={51} max={100} defaultValue={cfg.critical} className="input" disabled={!edit} /></Field>
            </div>
            <div className="mt-4 grid gap-3">
              {chk('email', cfg.email, 'Email', 'Black-and-white reminders template, English or Arabic (the customer’s billing language).')}
              {chk('push', cfg.push, 'Web push', 'To devices that turned on the “Services” notifications in the portal.')}
              {chk('checklist', cfg.checklist, 'Show the “Get your site live” checklist', 'On the dashboard for customers with a service or domain bought in the last 60 days, until they finish or hide it.')}
            </div>
            <p className="mb-2 mt-5 text-[13px] font-semibold text-slate-600">Limits that alert</p>
            <div className="grid gap-2 sm:grid-cols-2">{METRICS.map((k) => <div key={k}>{chk(`m_${k}`, cfg.metrics[k], METRIC_LABEL[k].en.replace(/^./, (c) => c.toUpperCase()))}</div>)}</div>
            <p className="mt-4 text-xs text-slate-500">Never upgrades anything by itself. Unlimited limits and services on servers without a panel connection fall back to the WHMCS usage sync (disk and bandwidth only).</p>
          </Card>
          <Card title="Email copy" actions={edit ? <button className="btn btn-primary">Save settings</button> : undefined}>
            {(['en', 'ar'] as const).map((l) => (
              <div key={l} className="mb-5 grid gap-3" dir={l === 'ar' ? 'rtl' : 'ltr'}>
                <p className="text-[13px] font-semibold text-slate-600" dir="ltr">{l === 'en' ? 'English' : 'Arabic'}</p>
                <Field label="Subject (warning)" hint={l === 'en' ? 'Placeholders: {service}, {pct}, {metric}' : undefined}><input name={`${l}_subject`} defaultValue={cfg.copy[l].subject} placeholder={DEFAULT_USAGE_COPY[l].subject} className="input" disabled={!edit} /></Field>
                <Field label="Subject (critical)"><input name={`${l}_subject_crit`} defaultValue={cfg.copy[l].subjectCritical} placeholder={DEFAULT_USAGE_COPY[l].subjectCritical} className="input" disabled={!edit} /></Field>
                <Field label="Intro"><textarea name={`${l}_intro`} rows={4} defaultValue={cfg.copy[l].intro} className="input" disabled={!edit} /></Field>
              </div>
            ))}
            <p className="text-xs text-slate-500">Empty fields go back to the default text. The rest of the email (meters per limit, tips, Upgrade and Free up space buttons, unsubscribe) is fixed.</p>
          </Card>
        </form>
      )}

      {tab === 'email' && preview && (
        <Card title="Usage alert preview" actions={<Link href={`/admin/usage-alerts?tab=email&pl=${pl === 'en' ? 'ar' : 'en'}`} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{pl === 'en' ? 'العربية' : 'English'}</Link>}>
          <p className="mb-2 text-xs text-slate-500">Subject: <b className="text-slate-700">{preview.subject}</b>. Example figures; real emails show the customer’s own plan and limits.</p>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <iframe title="Usage alert preview (light)" srcDoc={composeFull(preview.html, { lang: pl })} sandbox="" className="h-[900px] w-full rounded-lg border border-slate-200" />
            <iframe title="Usage alert preview (dark, phone width)" srcDoc={composeFull(preview.html, { forceDark: true, lang: pl })} sandbox="" className="h-[900px] w-[390px] rounded-lg border border-slate-200" />
          </div>
        </Card>
      )}

      {tab === 'log' && (
        <Card title="Sent usage alerts (latest 150)">
          {log.length ? (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-2 pr-3">When</th><th className="pr-3">Client</th><th className="pr-3">Item</th><th className="pr-3">Level</th><th className="pr-3">Channel</th><th className="pr-3">Month</th><th>Status</th></tr></thead>
              <tbody>{log.map((r: any) => <tr key={r.id} className="border-t border-slate-100"><td className="py-2 pr-3 whitespace-nowrap">{fmtDate(r.sentAt || r.createdAt)}</td><td className="pr-3">#{r.clientId} <span className="text-slate-500">{r.email}</span></td><td className="pr-3 font-mono text-xs">{r.item}</td><td className="pr-3"><Badge tone={r.stage === 'critical' ? 'red' : 'yellow'}>{r.stage}</Badge></td><td className="pr-3">{r.channel}</td><td className="pr-3">{r.cycle}</td><td><Badge tone={r.status === 'sent' ? 'green' : r.status === 'failed' ? 'red' : 'gray'}>{r.status}</Badge>{r.error ? <span className="ml-2 text-xs text-red-600">{r.error}</span> : null}</td></tr>)}</tbody></table></div>
          ) : <p className="text-sm text-slate-500">No usage alerts sent yet.</p>}
        </Card>
      )}
    </>
  );
}
