import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge, Flash, Field } from '@/components/ui';
import { serverViews, hmacSecret, hmacFromEnv, type ServerView } from '@/lib/hosting/servers';
import { PANEL_LABEL, PANEL_TYPES } from '@/lib/hosting/types';
import { DA_COMMANDS } from '@/lib/hosting/providers/directadmin';
import { ALLOWED_ORIGINS } from '@/lib/hosting/context';
import { saveServerAction, deleteServerAction, testServerAction, generateHmacAction, saveHmacAction } from './actions';

export const metadata = { title: 'Hosting panels' };
export const dynamic = 'force-dynamic';

const KEY_LABEL = { directadmin: 'Login Key', cpanel: 'WHM API token', plesk: 'Plesk API key' } as const;

function ServerForm({ s }: { s?: ServerView }) {
  const panel = s?.panel || 'directadmin';
  return (
    <form action={saveServerAction} className="grid gap-4 sm:grid-cols-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <Field label="Name"><input className="input" name="name" required defaultValue={s?.name} placeholder="Sonic USA" maxLength={80} /></Field>
      <Field label="Panel">
        <select className="input" name="panel" defaultValue={panel}>{PANEL_TYPES.map((p) => <option key={p} value={p}>{PANEL_LABEL[p]}</option>)}</select>
      </Field>
      <Field label="Panel URL" hint="https:// with the panel host name and port, e.g. https://da1.example.com:2222 (cPanel: :2087, Plesk: :8443). The host needs a valid TLS certificate.">
        <input className="input" name="url" type="url" required defaultValue={s?.url} placeholder="https://server.example.com:2222" />
      </Field>
      <Field label="API user" hint="DirectAdmin: the admin or reseller that owns the accounts. cPanel: the WHM user that owns the token. Plesk: admin."><input className="input" name="apiUser" required defaultValue={s?.apiUser} placeholder="admin" /></Field>
      <Field label={`Key (${s ? KEY_LABEL[panel] : 'Login Key / API token'}), stored encrypted`} hint={s ? 'Leave empty to keep the stored key.' : 'Never shown again after saving.'}>
        <input className="input font-mono" name="secret" type="password" autoComplete="new-password" required={!s} placeholder={s ? '•••••••• (unchanged)' : ''} />
      </Field>
      <Field label="WHMCS server IDs" hint="From WHMCS → System Settings → Servers (the id in the edit link). Comma separated."><input className="input" name="whmcsServerIds" defaultValue={s?.whmcsServerIds.join(', ')} placeholder="1, 3" /></Field>
      <Field label="Also match host names / IPs" hint="Fallback when the server ID is not set: WHMCS server host name or IP." className="sm:col-span-2">
        <input className="input" name="match" defaultValue={s?.match.join(', ')} placeholder="216.158.237.114, sonic.example.com" />
      </Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={s ? s.enabled : true} /> Enabled for customers</label>
      <div className="flex justify-end sm:col-span-1"><button className="btn btn-primary">{s ? 'Save changes' : 'Add server'}</button></div>
    </form>
  );
}

export default async function HostingAdmin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('integration');
  const sp = await searchParams;
  const [servers, secret] = await Promise.all([serverViews(), hmacSecret()]);
  const fromEnv = hmacFromEnv();
  return (
    <>
      <PageHeader title="Hosting panels" desc="Servers behind the customer “Manage hosting” panel in the WHMCS client area (DNS, email, files, databases, SSL, backups). Keys stay on this server, encrypted; customers never see them." />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {servers.map((s) => (
            <Card key={s.id} title={<span className="flex items-center gap-2">{s.name} <Badge tone={s.enabled ? 'green' : 'gray'}>{s.enabled ? 'enabled' : 'disabled'}</Badge> <Badge tone="blue">{PANEL_LABEL[s.panel]}</Badge></span>}
              actions={<>
                <form action={testServerAction}><input type="hidden" name="id" value={s.id} /><button className="btn btn-secondary">Test connection</button></form>
                {s.source === 'db' && <form action={deleteServerAction}><input type="hidden" name="id" value={s.id} /><button className="btn btn-ghost text-red-600">Remove</button></form>}
              </>}>
              <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">URL</dt><dd className="font-mono text-xs">{s.url}</dd></div>
                <div><dt className="text-xs text-slate-500">API user</dt><dd className="font-mono text-xs">{s.apiUser}</dd></div>
                <div><dt className="text-xs text-slate-500">WHMCS server IDs</dt><dd className="text-xs">{s.whmcsServerIds.join(', ') || '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Key</dt><dd className="text-xs">{s.secretHint}</dd></div>
              </dl>
              {s.source === 'db'
                ? <details><summary className="cursor-pointer text-sm font-medium text-brand-600">Edit</summary><div className="mt-4"><ServerForm s={s} /></div></details>
                : <p className="text-xs text-slate-500">From DA_URL / DA_USER / DA_LOGIN_KEY environment variables. Add a server here to replace it.</p>}
            </Card>
          ))}
          <Card title={servers.length ? 'Add another server' : 'Add your first server'}><ServerForm /></Card>
        </div>
        <div className="space-y-6">
          <Card title="WHMCS hook secret">
            <p className="mb-3 text-sm text-slate-600">The hook file <code className="text-xs">globalhostia_hosting_hook.php</code> signs a 10-minute token with this secret. Both sides must hold the same value.</p>
            <div className="mb-3 text-sm">Status: {secret ? <Badge tone="green">{fromEnv ? 'set in Vercel env' : 'set'}</Badge> : <Badge tone="red">not set</Badge>}</div>
            {secret && !fromEnv && (
              <details className="mb-3"><summary className="cursor-pointer text-sm font-medium text-brand-600">Reveal to copy into the hook file</summary>
                <input readOnly className="input mt-2 font-mono text-xs" value={secret} aria-label="Shared secret" />
              </details>
            )}
            {!fromEnv && <>
              <form action={generateHmacAction}><button className="btn btn-secondary w-full">{secret ? 'Rotate secret' : 'Generate secret'}</button></form>
              <form action={saveHmacAction} className="mt-3 flex gap-2"><input className="input font-mono text-xs" name="secret" placeholder="or paste your own (32+ chars)" autoComplete="off" /><button className="btn btn-secondary">Save</button></form>
            </>}
          </Card>
          <Card title="DirectAdmin Login Key: allowed commands">
            <p className="mb-2 text-sm text-slate-600">Create the key as the admin/reseller user (Login Keys → Create), tick only these commands, and restrict it to Vercel if you can:</p>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[11.5px] leading-relaxed text-slate-700">{DA_COMMANDS.join('\n')}</pre>
          </Card>
          <Card title="How it fits together">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Customer opens a hosting service in the client area.</li>
              <li>The WHMCS hook checks the service belongs to them and is a DirectAdmin / cPanel / Plesk product, then prints a signed token.</li>
              <li>The panel calls <code className="text-xs">/api/hosting/*</code> here (allowed origin: {ALLOWED_ORIGINS.join(', ')}). We re-check ownership and status in WHMCS, find the server by WHMCS server ID / host name, and act as that account only.</li>
              <li>Every change is written to the <a className="text-brand-600" href="/admin/audit">activity log</a>.</li>
            </ol>
            <p className="mt-3 text-xs text-slate-400">Full setup: docs/whmcs/HOSTING-SETUP.md</p>
          </Card>
        </div>
      </div>
    </>
  );
}
