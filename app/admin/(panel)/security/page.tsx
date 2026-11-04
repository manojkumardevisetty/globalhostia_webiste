import { desc, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { PageHeader, Card, Field, Flash, Badge, fmtDate } from '@/components/ui';
import { env2faDisabled, envRateOff, envTurnstileOff, securityConfig, turnstileKeys } from '@/lib/security/config';
import { effectiveMode, parseMode } from '@/lib/security/csp-policy.mjs';
import { TS_FORMS, type TsForm } from '@/lib/security/turnstile-core';
import { listSessions, isActive } from '@/lib/security/sessions';
import { saveSecurity, clearCspReports, revokeAny } from './actions';

export const metadata = { title: 'Security' };
export const dynamic = 'force-dynamic';

const Check = ({ name, on, label, hint }: { name: string; on: boolean; label: string; hint?: string }) => (
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={on} className="mt-0.5" /><span><b className="font-medium text-slate-800">{label}</b>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span></label>
);

export default async function Security({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('settings'); const sp = await searchParams;
  const c = await securityConfig();
  const envCsp = process.env.CSP_MODE ? parseMode(process.env.CSP_MODE) : null;
  const cspNow = effectiveMode(process.env.CSP_MODE, c.csp.mode);
  const keys = !!turnstileKeys();
  const reports = await db.select().from(schema.cspReports).orderBy(desc(schema.cspReports.lastSeen)).limit(100).catch(() => null);
  const [{ total } = { total: 0 }] = reports ? await db.select({ total: sql<number>`coalesce(sum(count),0)::int` }).from(schema.cspReports).catch(() => [{ total: 0 }]) : [{ total: 0 }];
  const sessions = can(s, 'users') ? await listSessions(undefined, 60) : null;
  const env = [
    ['ADMIN_2FA_DISABLED', env2faDisabled() ? 'set: two-factor is skipped at sign-in' : 'not set', env2faDisabled() ? 'red' : 'green'],
    ['CSP_MODE', envCsp ? envCsp : 'not set (enforce)', envCsp && envCsp !== 'enforce' ? 'yellow' : 'green'],
    ['RATE_LIMITS', envRateOff() ? 'off' : 'not set (on)', envRateOff() ? 'yellow' : 'green'],
    ['TURNSTILE_SITE_KEY / SECRET_KEY', keys ? 'both set' : 'not set: form check is off', keys ? 'green' : 'gray'],
    ['TURNSTILE_DISABLED', envTurnstileOff() ? 'set: form check is off' : 'not set', envTurnstileOff() ? 'yellow' : 'green'],
  ] as const;
  const ex = (k: string) => (c.csp.extra[k] || []).join('\n');
  return (
    <>
      <PageHeader title="Security" desc="Two-factor sign-in, sessions, Content-Security-Policy, rate limits and form spam protection. Every switch here can also be overridden from the server environment (docs/security/README.md)." />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Status" className="xl:col-span-1">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2"><span>Content-Security-Policy</span><Badge tone={cspNow === 'enforce' ? 'green' : cspNow === 'report' ? 'yellow' : 'red'}>{cspNow === 'report' ? 'report-only' : cspNow}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>Rate limits</span><Badge tone={c.rate.enabled && !envRateOff() ? 'green' : 'yellow'}>{c.rate.enabled && !envRateOff() ? `on ×${c.rate.multiplier}` : 'off'}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>Turnstile on forms</span><Badge tone={keys && c.turnstile.enabled && !envTurnstileOff() ? 'green' : 'gray'}>{keys && c.turnstile.enabled && !envTurnstileOff() ? 'on' : 'off'}</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>Two-factor required for all</span><Badge tone={c.mfa.requireAll ? 'green' : 'gray'}>{c.mfa.requireAll ? 'yes' : 'per admin'}</Badge></li>
          </ul>
          <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Server environment (Vercel)</h3>
          <ul className="mt-2 space-y-2 text-xs">{env.map(([k, v, tone]) => <li key={k}><code className="text-slate-800">{k}</code><div className="mt-0.5"><Badge tone={tone}>{v}</Badge></div></li>)}</ul>
          <p className="mt-4 text-xs text-slate-500">Locked out? Set <code>ADMIN_2FA_DISABLED=1</code> (two-factor) or <code>CSP_MODE=report</code> in Vercel → Settings → Environment Variables and redeploy. Remove it again afterwards.</p>
        </Card>

        <form action={saveSecurity} className="space-y-6 xl:col-span-2">
          <Card title="Admin sign-in">
            <div className="grid gap-4 md:grid-cols-2">
              <Check name="mfa_requireAll" on={c.mfa.requireAll} label="Require two-factor for every admin" hint="Admins without it set it up at their next sign-in. Per-admin requirement: Users & Roles." />
              <Check name="mfa_alert" on={c.mfa.newDeviceAlert} label="Email the owner on sign-in from a new browser" hint="Sent through WHMCS to the support-alert client account." />
              <Field label="Sign out after inactivity (minutes)" hint="0 = only the 12-hour session limit"><input name="mfa_idle" type="number" min={0} max={1440} defaultValue={c.mfa.idleMinutes} className="input" /></Field>
              <Field label="“Remember this browser” (days)" hint="0 = always ask for a code"><input name="mfa_remember" type="number" min={0} max={90} defaultValue={c.mfa.rememberDays} className="input" /></Field>
            </div>
          </Card>

          <Card title="Content-Security-Policy">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mode" hint="Report-only logs violations below without blocking. If CSP_MODE is set in the environment, the less strict of the two applies.">
                <select name="csp_mode" defaultValue={c.csp.mode} className="input"><option value="enforce">Enforce (block)</option><option value="report">Report only</option><option value="off">Off</option></select>
              </Field>
              <p className="text-xs text-slate-500 md:pt-6">Added a new tracker or embed in “Custom head” or a page? Add its https:// origin below so the policy allows it. One origin per line, e.g. <code>https://cdn.example.com</code>.</p>
              {[['csp_script', 'Extra script sources', 'script'], ['csp_connect', 'Extra connect (fetch/XHR) sources', 'connect'], ['csp_frame', 'Extra frame (embed) sources', 'frame'], ['csp_style', 'Extra stylesheet sources', 'style'], ['csp_font', 'Extra font sources', 'font'], ['csp_form', 'Extra form targets', 'form']].map(([n, l, k]) => (
                <Field key={n} label={l}><textarea name={n} rows={2} defaultValue={ex(k)} className="input font-mono text-xs" /></Field>
              ))}
            </div>
          </Card>

          <Card title="Rate limits & form spam protection">
            <div className="grid gap-4 md:grid-cols-2">
              <Check name="rate_enabled" on={c.rate.enabled} label="Rate-limit sensitive endpoints" hint="Sign-in, password reset, forms, AI chat, OAuth/MCP, reminders, domain search. Replies 429 with a friendly message." />
              <Field label="Limit multiplier" hint="2 = twice as many requests allowed (0.25–10)"><input name="rate_mult" type="number" step="0.25" min={0.25} max={10} defaultValue={c.rate.multiplier} className="input" /></Field>
              <div className="md:col-span-2">
                <Check name="ts_enabled" on={c.turnstile.enabled} label="Cloudflare Turnstile on public forms" hint={keys ? 'Keys found. Choose the forms:' : 'Inactive until TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set in Vercel (free: dash.cloudflare.com → Turnstile).'} />
                <div className="mt-3 grid gap-2 pl-6 md:grid-cols-2">{(Object.keys(TS_FORMS) as TsForm[]).map((k) => <Check key={k} name={`ts_${k}`} on={c.turnstile.forms[k]} label={TS_FORMS[k]} />)}</div>
              </div>
            </div>
          </Card>

          <Card title="Vulnerability disclosure (security.txt)">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Security contact" hint="Email or https:// URL. Empty: the site email from Settings."><input name="disc_contact" defaultValue={c.disclosure.contact} className="input" placeholder="security@globalhostia.com" /></Field>
              <Field label="Policy URL" hint="Empty: /security"><input name="disc_policy" defaultValue={c.disclosure.policyUrl} className="input" placeholder="https://globalhostia.com/security" /></Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">Served at <a className="underline" href="/.well-known/security.txt" target="_blank">/.well-known/security.txt</a>.</p>
          </Card>
          <button className="btn btn-primary">Save security settings</button>
        </form>
      </div>

      <Card title={`CSP violation reports${reports ? ` · ${reports.length} kinds, ${total} reports` : ''}`} className="mt-6" actions={reports?.length ? <form action={clearCspReports}><button className="btn btn-ghost text-xs">Clear</button></form> : null}>
        {!reports ? <p className="text-sm text-slate-500">Not available yet (database update 040-security).</p> : !reports.length ? <p className="text-sm text-slate-500">No violations reported. Browser extensions are filtered out.</p> : (
          <div className="overflow-x-auto"><table className="table text-xs"><thead><tr><th>Directive</th><th>Blocked</th><th>Page</th><th>Source</th><th>Mode</th><th>Count</th><th>Last seen</th></tr></thead>
            <tbody>{reports.map((r) => <tr key={r.key}><td><code>{r.directive}</code></td><td className="max-w-[16rem] break-all">{r.blocked}{r.sample && <div className="text-slate-400">{r.sample}</div>}</td><td className="break-all">{r.page}</td><td className="max-w-[14rem] break-all text-slate-500">{r.source}</td><td>{r.disposition}</td><td>{r.count}</td><td>{fmtDate(r.lastSeen)}</td></tr>)}</tbody></table></div>
        )}
      </Card>

      {sessions && (
        <Card title="Admin sessions (all users)" className="mt-6">
          <div className="overflow-x-auto"><table className="table text-xs"><thead><tr><th>Admin</th><th>IP</th><th>Browser</th><th>Two-factor</th><th>Signed in</th><th>Last active</th><th>Status</th><th></th></tr></thead>
            <tbody>{sessions.map((r) => {
              const active = isActive(r, c.mfa.idleMinutes);
              return <tr key={r.id}><td>{r.email}</td><td>{r.ip}{r.country ? ` · ${r.country}` : ''}</td><td className="max-w-[16rem] truncate" title={r.ua}>{r.ua}</td><td>{r.mfa}</td><td>{fmtDate(r.createdAt)}</td><td>{fmtDate(r.lastSeenAt)}</td>
                <td>{active ? <Badge tone="green">active</Badge> : <Badge tone="gray">{r.revokedReason || 'expired'}</Badge>}</td>
                <td>{active && <form action={revokeAny}><input type="hidden" name="sid" value={r.id} /><button className="btn btn-ghost text-xs text-red-600">Sign out</button></form>}</td></tr>;
            })}</tbody></table></div>
        </Card>
      )}
    </>
  );
}
