// Admin → AI connectors: the authenticated Claude / ChatGPT connector (OAuth + /mcp), its kill switch and settings,
// connected apps (OAuth clients) and customer connections (grants) with revocation, and the directory submission steps.
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Badge, Flash, fmtDate } from '@/components/ui';
import PendingButton from '@/components/PendingButton';
import { connectorConfig } from '@/lib/connector/config';
import { adminClients, adminGrants } from '@/lib/oauth/store';
import { SCOPES, PLATFORM_LABEL } from '@/lib/oauth/core';
import { TOOLS } from '@/lib/connector/tools';
import { saveConnector, revokeOne, toggleClient, revokeEverything, savePromo } from './actions';
import { getSettings } from '@/lib/settings';
import { normalizeAiPromo, HOME_POSITIONS, HOME_POSITION_LABEL } from '@/lib/connector/promo';

export const metadata = { title: 'AI connectors' };
export const dynamic = 'force-dynamic';

const SITE = 'https://globalhostia.com';
const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const plat = (p: string) => PLATFORM_LABEL[(p in PLATFORM_LABEL ? p : 'other') as keyof typeof PLATFORM_LABEL];

export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSession('settings');
  const sp = await searchParams;
  const [cfg, clients, grants, settings] = await Promise.all([
    connectorConfig(true), adminClients().catch(() => null), adminGrants({ limit: 200 }).catch(() => null), getSettings().catch(() => ({} as Record<string, any>)),
  ]);
  const promo = normalizeAiPromo(settings.ai_promo);
  const live = (grants || []).filter((g) => !g.revokedAt && g.expiresAt.getTime() > Date.now());
  const reads = TOOLS.filter((t) => t.annotations.readOnlyHint).length;
  return (
    <>
      <PageHeader title="AI connectors" desc="Customers connect their GlobalHostia account to Claude or ChatGPT and manage services, domains, DNS, email, SSL, invoices and tickets by chat. They sign in on globalhostia.com and approve each permission; assistants can never pay, change passwords or delete accounts." />
      <Flash sp={sp} />
      {(clients === null || grants === null) && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The connector tables are not available yet (the database patch 032-oauth runs on the next deploy).</p>}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card title="Status">{cfg.enabled ? <Badge tone="green">On</Badge> : <Badge tone="red">Switched off</Badge>}<p className="mt-2 text-sm text-slate-500">Kill switch below.</p></Card>
        <Card title="Claude / MCP URL"><p className="break-all font-mono text-sm">{SITE}/mcp</p></Card>
        <Card title="ChatGPT URL"><p className="break-all font-mono text-sm">{SITE}/mcp/chatgpt</p><p className="mt-1 text-xs text-slate-500">{cfg.chatgptCommerce ? 'Commerce tools on' : 'No commerce tools (ChatGPT rules)'}</p></Card>
        <Card title="Connections"><p className="text-2xl font-semibold">{live.length}</p><p className="text-sm text-slate-500">active · {TOOLS.length} tools ({reads} read-only)</p></Card>
      </div>

      <Card title="Settings" className="mb-6">
        <form action={saveConnector} className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="mt-1" /><span><b>Connectors on</b> (kill switch). Off: no new connections, no token refresh, account tools refuse at once. Public tools keep working.</span></label>
            <label className="flex items-start gap-2"><input type="checkbox" name="block_unknown" defaultChecked={cfg.blockUnknownRedirects} className="mt-1" /><span><b>Only Claude, ChatGPT and local apps.</b> Refuse other apps (custom redirect URIs). Off: they may connect, with a warning on the consent page.</span></label>
            <label className="flex items-start gap-2"><input type="checkbox" name="chatgpt_commerce" defaultChecked={cfg.chatgptCommerce} className="mt-1" /><span><b>Commerce tools on ChatGPT</b> (plan search, prices, cart and renewal links on /mcp/chatgpt). Keep off for the ChatGPT app directory: its rules do not allow selling digital services in chat.</span></label>
            <div><label className="font-medium" htmlFor="openai_challenge">OpenAI domain verification token</label>
              <input id="openai_challenge" name="openai_challenge" defaultValue={cfg.openaiChallenge} className={`${input} font-mono`} placeholder="paste the token from platform.openai.com" />
              <p className="mt-1 text-xs text-slate-500">Served as plain text at <a className="text-indigo-600 underline" href="/.well-known/openai-apps-challenge" target="_blank" rel="noreferrer">/.well-known/openai-apps-challenge</a>{cfg.openaiChallenge ? ' (set)' : ' (not set: 404)'}.</p></div>
            <fieldset className="rounded-lg border border-slate-200 p-3"><legend className="px-1 font-medium">Reviewer mode</legend>
              <p className="mb-2 text-xs text-slate-500">For the Anthropic / OpenAI reviewer account: these WHMCS clients can read everything on their account but only change DNS, mailboxes, SSL and domain settings on the sandbox domain. Tickets they open are prefixed [Review].</p>
              <label className="text-xs font-medium" htmlFor="reviewer_ids">WHMCS client ids</label>
              <input id="reviewer_ids" name="reviewer_ids" defaultValue={cfg.reviewer.clientIds.join(', ')} className={input} placeholder="e.g. 1234" />
              <label className="mt-2 block text-xs font-medium" htmlFor="sandbox_domain">Sandbox domain</label>
              <input id="sandbox_domain" name="sandbox_domain" defaultValue={cfg.reviewer.sandboxDomain} className={input} placeholder="e.g. globalhostia-demo.com" />
            </fieldset>
          </div>
          <div className="space-y-3 text-sm">
            <p className="font-medium">Public pages: <a className="text-indigo-600 underline" href="/connectors" target="_blank" rel="noreferrer">/connectors</a> and <a className="text-indigo-600 underline" href="/docs/mcp" target="_blank" rel="noreferrer">/docs/mcp</a></p>
            <div><label className="text-xs font-medium" htmlFor="headline">Headline</label><input id="headline" name="headline" defaultValue={cfg.pages.headline} className={input} /></div>
            <div><label className="text-xs font-medium" htmlFor="intro">Introduction</label><textarea id="intro" name="intro" defaultValue={cfg.pages.intro} rows={3} className={input} /></div>
            <div><label className="text-xs font-medium" htmlFor="examples">Example prompts (one per line)</label><textarea id="examples" name="examples" defaultValue={cfg.pages.examples.join('\n')} rows={6} className={input} /></div>
            <div><label className="text-xs font-medium" htmlFor="faq">FAQ (one per line: question | answer)</label><textarea id="faq" name="faq" defaultValue={cfg.pages.faq.map((f) => `${f.q} | ${f.a}`).join('\n')} rows={6} className={input} /></div>
            <div><label className="text-xs font-medium" htmlFor="support_email">Support email</label><input id="support_email" name="support_email" defaultValue={cfg.pages.supportEmail} className={input} /></div>
          </div>
          <div className="lg:col-span-2"><PendingButton>Save settings</PendingButton></div>
        </form>
      </Card>

      <Card title="Website promotion" className="mb-6">
        <form action={savePromo} id="promo" className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <p className="text-slate-500">Where customers find the connector on the website. Every link goes to <a className="text-indigo-600 underline" href="/connectors" target="_blank" rel="noreferrer">/connectors</a>.</p>
            <label className="flex items-start gap-2"><input type="checkbox" name="p_nav" defaultChecked={promo.nav.enabled} className="mt-1" /><span><b>Main navigation</b>: a top-level link on desktop (from 1100px wide), a highlighted row at the top of the phone menu, and an item in the menu below.</span></label>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs font-medium" htmlFor="p_label">Link label</label><input id="p_label" name="p_label" defaultValue={promo.nav.label} className={input} maxLength={28} /></div>
              <div><label className="text-xs font-medium" htmlFor="p_badge">Badge (empty: none)</label><input id="p_badge" name="p_badge" defaultValue={promo.nav.badge} className={input} maxLength={12} /></div>
              <div><label className="text-xs font-medium" htmlFor="p_menu">Also list in menu</label><input id="p_menu" name="p_menu" defaultValue={promo.nav.menu} className={input} placeholder="support" /></div>
            </div>
            <p className="text-xs text-slate-500">Menu ids: hosting, servers, domains, security, business, support (or the id of a custom menu in Site links). Not added again when a menu already links /connectors.</p>
            <label className="flex items-start gap-2"><input type="checkbox" name="p_footer" defaultChecked={promo.footer} className="mt-1" /><span><b>Footer link</b> (in the column of that menu)</span></label>
            <label className="flex items-start gap-2"><input type="checkbox" name="p_pill" defaultChecked={promo.pill.enabled} className="mt-1" /><span><b>&quot;New&quot; pill</b>: top bar on desktop, under the hero card on the phone homepage</span></label>
            <div><label className="text-xs font-medium" htmlFor="p_pill_text">Pill text</label><input id="p_pill_text" name="p_pill_text" defaultValue={promo.pill.text} className={input} maxLength={70} /></div>
          </div>
          <div className="space-y-3 text-sm">
            <div><label className="font-medium" htmlFor="p_position">Homepage section</label>
              <select id="p_position" name="p_position" defaultValue={promo.home.position} className={input}>{HOME_POSITIONS.map((k) => <option key={k} value={k}>{HOME_POSITION_LABEL[k]}</option>)}</select></div>
            <div><label className="text-xs font-medium" htmlFor="p_eyebrow">Eyebrow</label><input id="p_eyebrow" name="p_eyebrow" defaultValue={promo.home.eyebrow} className={input} maxLength={60} /></div>
            <div><label className="text-xs font-medium" htmlFor="p_title">Title</label><input id="p_title" name="p_title" defaultValue={promo.home.title} className={input} maxLength={90} /></div>
            <div><label className="text-xs font-medium" htmlFor="p_lead">Text</label><textarea id="p_lead" name="p_lead" defaultValue={promo.home.lead} rows={3} className={input} maxLength={320} /></div>
            <div><label className="text-xs font-medium" htmlFor="p_prompts">Example prompts, shown as chat bubbles (one per line, up to 4)</label><textarea id="p_prompts" name="p_prompts" defaultValue={promo.home.prompts.join('\n')} rows={4} className={input} /></div>
            <div><label className="text-xs font-medium" htmlFor="p_trust">Trust points (one per line, up to 4)</label><textarea id="p_trust" name="p_trust" defaultValue={promo.home.trust.join('\n')} rows={4} className={input} /></div>
          </div>
          <div className="lg:col-span-2"><PendingButton>Save website promotion</PendingButton> <a className="ml-3 text-sm text-indigo-600 underline" href="/#ai-connectors" target="_blank" rel="noreferrer">View on the homepage</a></div>
        </form>
      </Card>
      <Card title={`Customer connections (${live.length} active)`} className="mb-6">
        {!grants?.length ? <p className="text-sm text-slate-500">No customer has connected an assistant yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2 pr-3">Customer</th><th className="pr-3">App</th><th className="pr-3">Permissions</th><th className="pr-3">Connected</th><th className="pr-3">Last used</th><th className="pr-3">Status</th><th /></tr></thead>
            <tbody>{grants.map((g) => {
              const active = !g.revokedAt && g.expiresAt.getTime() > Date.now();
              return (
                <tr key={g.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3"><a className="text-indigo-600 hover:underline" href={`/admin/customers/${g.whmcsClientId}`}>#{g.whmcsClientId}</a><div className="text-xs text-slate-500">{g.userEmail}</div></td>
                  <td className="pr-3">{g.name || g.clientId.slice(0, 40)}<div className="text-xs text-slate-500">{plat(g.platform)}{g.flagged ? ' · unverified redirect' : ''}</div></td>
                  <td className="pr-3 text-xs">{g.scopes.map((s) => <span key={s} className={`mr-1 inline-block rounded px-1.5 py-0.5 ${SCOPES[s]?.write ? 'bg-rose-50 text-rose-800' : 'bg-slate-100'}`}>{s}</span>)}</td>
                  <td className="pr-3 text-xs">{fmtDate(g.createdAt)}</td>
                  <td className="pr-3 text-xs">{fmtDate(g.lastUsedAt)}</td>
                  <td className="pr-3">{active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">{g.revokedAt ? `Revoked${g.revokedBy ? ` (${g.revokedBy.split(':')[0]})` : ''}` : 'Expired'}</Badge>}</td>
                  <td className="py-2">{active && <form action={revokeOne}><input type="hidden" name="id" value={g.id} /><PendingButton className="btn btn-secondary h-8 text-xs" confirm="Revoke this connection?">Revoke</PendingButton></form>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title="Registered apps (OAuth clients)" className="mb-6">
        <p className="mb-3 text-sm text-slate-500">Claude and ChatGPT register automatically (Dynamic Client Registration, or a Client ID Metadata Document URL). Blocking an app revokes all of its connections.</p>
        {!clients?.length ? <p className="text-sm text-slate-500">None yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-2 pr-3">App</th><th className="pr-3">Type</th><th className="pr-3">Redirect URIs</th><th className="pr-3">Active</th><th className="pr-3">Registered</th><th /></tr></thead>
            <tbody>{clients.map(({ c, active }) => (
              <tr key={c.id} className="border-t border-slate-100 align-top">
                <td className="py-2 pr-3">{c.name}<div className="text-xs text-slate-500">{plat(c.platform)}{c.disabled ? ' · blocked' : ''}</div></td>
                <td className="pr-3 text-xs">{c.kind === 'cimd' ? 'Metadata URL' : 'Registered'}{c.flagged ? <div><Badge tone="yellow">Unverified redirect</Badge></div> : null}</td>
                <td className="max-w-xs break-all pr-3 font-mono text-xs">{c.redirectUris.slice(0, 3).join(' ')}</td>
                <td className="pr-3">{active}</td>
                <td className="pr-3 text-xs">{fmtDate(c.createdAt)}</td>
                <td className="py-2"><form action={toggleClient}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="disable" value={c.disabled ? '0' : '1'} /><PendingButton className="btn btn-secondary h-8 text-xs" confirm={c.disabled ? undefined : 'Block this app and revoke its connections?'}>{c.disabled ? 'Unblock' : 'Block'}</PendingButton></form></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Directory submission">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Create the reviewer account and sandbox domain (docs/connectors/SUBMISSION.md, owner checklist), then enter them in Reviewer mode above.</li>
            <li>Claude: submit <span className="font-mono">{SITE}/mcp</span> at <a className="text-indigo-600 underline" href="https://claude.ai/directory/manage" target="_blank" rel="noreferrer">claude.ai/directory/manage</a> (Authentication: OAuth, required when the server asks).</li>
            <li>ChatGPT: create the app on platform.openai.com with <span className="font-mono">{SITE}/mcp/chatgpt</span>, paste its domain token above, then submit for review.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">Discovery: <a className="underline" href="/.well-known/oauth-protected-resource/mcp" target="_blank" rel="noreferrer">protected resource</a> · <a className="underline" href="/.well-known/oauth-authorization-server" target="_blank" rel="noreferrer">authorization server</a></p>
        </Card>
        <Card title="Emergency: revoke every connection">
          <form action={revokeEverything} className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="confirm-all">Type REVOKE:</label><input id="confirm-all" name="confirm" className="w-32 rounded-lg border border-slate-300 px-2 py-1.5" autoComplete="off" />
            <PendingButton className="btn h-9 bg-red-600 text-white hover:bg-red-700" confirm="Revoke every customer connection now?">Revoke all</PendingButton>
          </form>
          <p className="mt-2 text-xs text-slate-500">Use with the kill switch if a client or token leak is suspected. Every action is in the Activity Log (connector.* entries).</p>
        </Card>
      </div>
    </>
  );
}
