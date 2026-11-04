import { requireSession } from '@/lib/session';
import { PageHeader, Card, Field, Flash, Badge, fmtDate } from '@/components/ui';
import { changeOwnPassword } from '../users/actions';
import { getMfa, recoveryLeft } from '@/lib/security/mfa';
import { listSessions, isActive } from '@/lib/security/sessions';
import { env2faDisabled, securityConfig } from '@/lib/security/config';
import { beginEnrol, newRecoveryCodes, turnOffMfa, forgetMyDevices, revokeMine, revokeMyOthers } from './security-actions';

export const metadata = { title: 'My account' };
export const dynamic = 'force-dynamic';

const device = (ua: string) => {
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const o = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return o ? `${b} on ${o}` : b;
};

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const s = await requireSession('content'); const sp = await searchParams;
  const [mfa, sessions, cfg] = await Promise.all([getMfa(s.uid), listSessions(s.uid, 20), securityConfig()]);
  const required = !!mfa?.required || cfg.mfa.requireAll;
  return (
    <>
      <PageHeader title="My account" desc={`${s.email} · ${s.role}`} />
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Profile & password">
          <form action={changeOwnPassword} className="space-y-3">
            <Field label="Display name"><input name="name" defaultValue={s.name} className="input" /></Field>
            <Field label="Current password"><input name="current" type="password" required className="input" autoComplete="current-password" /></Field>
            <Field label="New password"><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
            <Field label="Confirm new password"><input name="confirm" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
            <button className="btn btn-primary">Update</button>
          </form>
        </Card>

        <Card title="Two-factor sign-in" actions={mfa?.enabled ? <Badge tone="green">on</Badge> : <Badge tone={required ? 'red' : 'gray'}>{required ? 'required' : 'off'}</Badge>}>
          {env2faDisabled() && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">ADMIN_2FA_DISABLED is set in the server environment: codes are not asked for at sign-in until it is removed.</p>}
          {mfa === undefined ? (
            <p className="text-sm text-slate-600">Not available yet: the database update for admin security has not run. It runs on the next deploy while the database is reachable.</p>
          ) : mfa?.enabled ? (
            <div className="space-y-4 text-sm">
              <p className="text-slate-600">On since {fmtDate(mfa.enabledAt)}. Recovery codes left: <b>{recoveryLeft(mfa)}</b> of 10.</p>
              <form action={newRecoveryCodes} className="flex flex-wrap items-end gap-2">
                <Field label="Current code" className="w-40"><input name="code" required autoComplete="one-time-code" className="input" placeholder="123 456" /></Field>
                <button className="btn btn-secondary">New recovery codes</button>
              </form>
              <form action={forgetMyDevices}><button className="btn btn-ghost">Forget remembered browsers</button></form>
              {!required && (
                <form action={turnOffMfa} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
                  <Field label="Code to confirm" className="w-40"><input name="code" required autoComplete="one-time-code" className="input" /></Field>
                  <button className="btn btn-ghost text-red-600">Turn off two-factor</button>
                </form>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm text-slate-600">
              <p>Protect the admin with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) in addition to your password. You get 10 one-time recovery codes for when your phone is not at hand.</p>
              <form action={beginEnrol}><button className="btn btn-primary">Set up two-factor</button></form>
            </div>
          )}
        </Card>
      </div>

      <Card title="Where you are signed in" className="mt-6" actions={<form action={revokeMyOthers}><button className="btn btn-secondary text-xs">Sign out everywhere else</button></form>}>
        {!sessions ? <p className="text-sm text-slate-500">Session tracking is not available yet.</p> : (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Device</th><th>IP</th><th>Signed in</th><th>Last active</th><th>Status</th><th></th></tr></thead>
            <tbody>{sessions.map((r) => {
              const active = isActive(r, cfg.mfa.idleMinutes);
              return (
                <tr key={r.id}>
                  <td><b>{device(r.ua)}</b>{r.id === s.sid && <span className="ml-2"><Badge tone="blue">this browser</Badge></span>}<div className="text-xs text-slate-500">two-factor: {r.mfa}</div></td>
                  <td className="text-xs">{r.ip}{r.country ? ` · ${r.country}` : ''}</td>
                  <td className="text-xs">{fmtDate(r.createdAt)}</td>
                  <td className="text-xs">{fmtDate(r.lastSeenAt)}</td>
                  <td>{active ? <Badge tone="green">active</Badge> : <Badge tone="gray">{r.revokedReason || 'expired'}</Badge>}</td>
                  <td>{active && <form action={revokeMine}><input type="hidden" name="sid" value={r.id} /><button className="btn btn-ghost text-xs text-red-600">Sign out</button></form>}</td>
                </tr>
              );
            })}</tbody></table></div>
        )}
      </Card>
    </>
  );
}
