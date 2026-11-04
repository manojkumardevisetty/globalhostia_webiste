import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge, Flash } from '@/components/ui';
import { whmcsConfigured, getProducts, getServers, getModuleQueue, getModuleConfig, getServicesByProduct, whmcsBase } from '@/lib/whmcs';
import { runModuleAction } from './actions';

export const metadata = { title: 'VPS Automation' };
export const dynamic = 'force-dynamic';

const VPS_MODULE = /virtualizor|solus|proxmox|virtfusion|vultr|hetzner|digitalocean|linode|ovh|contabo|cloud|vps|kvm|xen|openstack|onapp/i;
const settle = async <T,>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; e: string }> => {
  try { return { ok: true, v: await p }; } catch (e: any) { return { ok: false, e: e?.message || String(e) }; }
};
const tone = (s: string) => (/active/i.test(s) ? 'green' : /suspend/i.test(s) ? 'amber' : /pending/i.test(s) ? 'blue' : /terminat|cancel|fraud/i.test(s) ? 'red' : 'slate');

export default async function VpsAutomation({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('integration');
  const sp = await searchParams;
  if (!whmcsConfigured()) return (<><PageHeader title="VPS Automation" desc="WHMCS is not configured." /></>);

  const [prods, servers, queue] = await Promise.all([settle(getProducts()), settle(getServers()), settle(getModuleQueue())]);
  const all = prods.ok ? prods.v : [];
  const vps = all.filter((p: any) => p.type === 'server' || VPS_MODULE.test(p.module || '') || /vps|cloud|forex|llm|ai/i.test(p.name));
  const modules = [...new Set(vps.map((p: any) => p.module).filter(Boolean))] as string[];
  const [configs, services] = await Promise.all([
    Promise.all(modules.map(async (m) => [m, await settle(getModuleConfig(m))] as const)),
    Promise.all(vps.slice(0, 40).map(async (p: any) => [p, await settle(getServicesByProduct(p.pid))] as const)),
  ]);
  const svcRows = services.flatMap(([p, r]) => (r.ok ? (r.v.products?.product || []).map((s: any) => ({ ...s, _product: p.name })) : []));
  const byModule = modules.map((m) => ({ m, products: vps.filter((p: any) => p.module === m) }));
  const noModule = vps.filter((p: any) => !p.module);

  return (
    <>
      <PageHeader title="VPS Automation" desc="Live from the WHMCS API: which provisioning module creates each VPS, the servers behind it, failed automation jobs and every VPS service with one-click module actions." />
      <Flash sp={sp} />
      <div className="mb-4 text-sm"><Link className="text-brand-600" href="/admin/whmcs">← WHMCS Integration Center</Link></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Provisioning modules (from GetProducts)">
          {!prods.ok ? <p className="text-sm text-red-600">GetProducts failed: {prods.e}</p> : (
            <div className="space-y-4 text-sm">
              {byModule.map(({ m, products }) => (
                <div key={m}>
                  <div className="flex items-center gap-2"><Badge tone="blue">{m}</Badge><span className="text-slate-500">{products.length} product(s)</span></div>
                  <ul className="mt-1 list-disc pl-5 text-slate-600">{products.map((p: any) => <li key={p.pid}>{p.name} <span className="text-slate-400">· pid {p.pid}{p.hidden ? ' · hidden' : ''}</span></li>)}</ul>
                </div>
              ))}
              {noModule.length > 0 && (
                <div><Badge tone="amber">No module — manual provisioning</Badge>
                  <ul className="mt-1 list-disc pl-5 text-slate-600">{noModule.map((p: any) => <li key={p.pid}>{p.name} <span className="text-slate-400">· pid {p.pid}</span></li>)}</ul></div>
              )}
              {!vps.length && <p className="text-slate-500">No VPS / server products found.</p>}
            </div>
          )}
        </Card>

        <Card title="Servers (GetServers)">
          {!servers.ok ? <p className="text-sm text-amber-700">GetServers unavailable: {servers.e}</p> : (
            <table className="table text-sm"><thead><tr><th>Server</th><th>Module</th><th>Accounts</th><th>Status</th></tr></thead>
              <tbody>{(servers.v.servers || []).map((s: any) => (
                <tr key={s.id}><td><div className="font-medium">{s.name}</div><div className="text-xs text-slate-400">{s.hostname || s.ipaddress}</div></td>
                  <td>{s.module}</td><td>{s.activeServices ?? s.numaccounts ?? '—'}{s.maxAllowedServices ? ` / ${s.maxAllowedServices}` : ''}</td>
                  <td>{s.status?.http !== undefined ? <Badge tone={s.status.http ? 'green' : 'red'}>{s.status.http ? 'Reachable' : 'Down'}</Badge> : s.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Disabled</Badge>}</td></tr>
              ))}</tbody></table>
          )}
        </Card>

        <Card title="Module settings fields (GetModuleConfigurationParameters)">
          <p className="mb-3 text-xs text-slate-500">The fields each module asks for. WHMCS never returns saved values or passwords through the API.</p>
          {configs.map(([m, r]) => (
            <div key={m} className="mb-3 text-sm"><div className="font-medium">{m}</div>
              {r.ok ? <div className="mt-1 flex flex-wrap gap-1.5">{(r.v.parameters || []).map((x) => <span key={x.name} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{x.displayName || x.name}</span>)}{!(r.v.parameters || []).length && <span className="text-xs text-slate-400">No fields</span>}</div>
                : <div className="text-xs text-amber-700">{r.e}</div>}
            </div>
          ))}
          {!configs.length && <p className="text-sm text-slate-500">No modules in use.</p>}
        </Card>

        <Card title="Failed automation jobs (GetModuleQueue)">
          {!queue.ok ? <p className="text-sm text-amber-700">{queue.e}</p> : (queue.v.queue || []).length === 0 ? <p className="text-sm text-green-700">Queue is empty — no failed module actions.</p> : (
            <table className="table text-sm"><thead><tr><th>Service</th><th>Action</th><th>Error</th><th>Last try</th></tr></thead>
              <tbody>{(queue.v.queue || []).map((q: any) => <tr key={q.id}><td>#{q.service_id}</td><td>{q.module_action}</td><td className="text-xs text-red-600">{q.last_attempt_error}</td><td className="text-xs">{q.last_attempt}</td></tr>)}</tbody></table>
          )}
          <p className="mt-2 text-xs text-slate-500">Retry queued jobs in WHMCS → Utilities → Module Queue.</p>
        </Card>

        <Card title={`VPS services (${svcRows.length})`} className="lg:col-span-2">
          <p className="mb-3 text-xs text-slate-500">Actions run instantly on the live server through WHMCS. Type the service ID to confirm. Terminate is not offered here — do it in WHMCS.</p>
          <div className="overflow-x-auto">
            <table className="table text-sm"><thead><tr><th>Service</th><th>Product</th><th>Status</th><th>Server / IP</th><th>Action</th></tr></thead>
              <tbody>{svcRows.map((s: any) => (
                <tr key={s.id}>
                  <td><a className="font-medium text-brand-600" href={`${whmcsBase()}/admin/clientsservices.php?userid=${s.clientid}&id=${s.id}`} target="_blank" rel="noopener">#{s.id}</a><div className="text-xs text-slate-400">{s.domain || '—'} · client {s.clientid}</div></td>
                  <td>{s._product}<div className="text-xs text-slate-400">{s.billingcycle} · next due {s.nextduedate}</div></td>
                  <td><Badge tone={tone(s.status)}>{s.status}</Badge></td>
                  <td className="text-xs">{s.servername || '—'}<div className="text-slate-400">{s.dedicatedip || s.serverip || ''}</div></td>
                  <td>
                    <form action={runModuleAction} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="serviceid" value={s.id} />
                      <select name="action" className="input !w-auto !py-1 text-xs" defaultValue={/pending/i.test(s.status) ? 'create' : /suspend/i.test(s.status) ? 'unsuspend' : 'suspend'}>
                        <option value="create">Create</option><option value="suspend">Suspend</option><option value="unsuspend">Unsuspend</option><option value="custom">Custom button…</option>
                      </select>
                      <input name="func" placeholder="e.g. reboot" className="input !w-24 !py-1 text-xs" aria-label="Custom function name" />
                      <input name="confirm" placeholder={`type ${s.id}`} className="input !w-20 !py-1 text-xs" aria-label="Confirm service ID" />
                      <button className="btn btn-secondary !py-1 text-xs">Run</button>
                    </form>
                  </td>
                </tr>
              ))}</tbody></table>
            {!svcRows.length && <p className="text-sm text-slate-500">No VPS services found{services.some(([, r]) => !r.ok) ? ' (some lookups failed — see API log)' : ''}.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
