import Link from 'next/link';
import { asc, desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Card, Field, Badge, Empty, fmtDate } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { premiumConfig, feedState, premiumItems } from '@/lib/premium/store';
import { transport, ownDomains, defaultProxyUrl } from '@/lib/premium/dynadot';
import { PREMIUM_STATUS_LABEL, PREMIUM_STATUSES, PREMIUM_CURRENCIES, HOME_POSITIONS, HOME_POSITION_LABEL, priceFor, fmtMoney, feedAllows, type PremiumStatus } from '@/lib/premium/core';
import { saveListing, quickListing, importCsv, importOwn, saveConfig, refreshNow, testConnection } from './actions';

export const metadata = { title: 'Premium domains' };
export const dynamic = 'force-dynamic';

const tone = (s: string) => (s === 'for_sale' ? 'green' : s === 'under_offer' ? 'yellow' : s === 'sold' ? 'blue' : 'gray');

export default async function PremiumDomains({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sess = await requireSession('content');
  const sp = await searchParams;
  const cfg = await premiumConfig();
  const t = await transport(cfg);
  const st = await feedState().catch(() => ({} as Awaited<ReturnType<typeof feedState>>));
  let rows: (typeof schema.premiumDomains.$inferSelect)[] = [], feed: (typeof schema.premiumFeed.$inferSelect)[] = [], missing = false;
  try {
    rows = await db.select().from(schema.premiumDomains).orderBy(desc(schema.premiumDomains.featured), asc(schema.premiumDomains.domain)).limit(2000);
    feed = await db.select().from(schema.premiumFeed).orderBy(asc(schema.premiumFeed.price)).limit(300);
  } catch { missing = true; }
  const live = await premiumItems().catch(() => []);
  const q = (sp.q || '').toLowerCase().trim().slice(0, 60);
  const fs = (PREMIUM_STATUSES as readonly string[]).includes(sp.status) ? sp.status : '';
  const shown = rows.filter((r) => (!q || r.domain.includes(q) || (r.tags || []).some((x) => x.toLowerCase().includes(q))) && (!fs || r.status === fs));
  const edit = sp.edit ? rows.find((r) => r.id === sp.edit) : undefined;
  let picker: { list: string[]; error?: string } | null = null;
  if (sp.import === '1') {
    try { const have = new Set(rows.map((r) => r.domain)); picker = { list: (await ownDomains(t)).filter((d) => !have.has(d)) }; }
    catch (e: any) { picker = { list: [], error: String(e?.message || e).slice(0, 240) }; }
  }
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const feedShown = live.filter((i) => i.source === 'dynadot').length;

  const ListingForm = ({ r }: { r?: (typeof rows)[number] }) => (
    <form action={saveListing} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      <Field label="Domain" className="lg:col-span-2"><input name="domain" required defaultValue={r?.domain} placeholder="brand.com" className="input" readOnly={!!r} /></Field>
      <Field label="Price" hint="empty = make an offer"><input name="price" inputMode="decimal" defaultValue={r?.price ?? ''} placeholder="4500" className="input" /></Field>
      <Field label="Currency"><select name="currency" defaultValue={r?.currency || 'USD'} className="input">{PREMIUM_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Minimum offer" hint="optional"><input name="min_offer" inputMode="decimal" defaultValue={r?.minOffer ?? ''} className="input" /></Field>
      <Field label="Status"><select name="status" defaultValue={r?.status || 'for_sale'} className="input">{PREMIUM_STATUSES.map((x) => <option key={x} value={x}>{PREMIUM_STATUS_LABEL[x]}</option>)}</select></Field>
      <Field label="Listing type"><select name="owned" defaultValue={r && !r.owned ? 'brokered' : 'owned'} className="input"><option value="owned">Owned by us</option><option value="brokered">Brokered for an owner</option></select></Field>
      <Field label="Tags" hint="comma separated, become categories"><input name="tags" defaultValue={(r?.tags || []).join(', ')} placeholder="AI, Finance" className="input" /></Field>
      <Field label="Description" hint="shown on the detail page; facts only" className="sm:col-span-2 lg:col-span-4"><textarea name="description" rows={2} defaultValue={r?.description} maxLength={1200} className="input" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="make_offer" defaultChecked={r?.makeOffer} /> Accept offers</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={r?.featured} /> Featured (homepage row first)</label>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-2 lg:justify-end"><button className="btn btn-primary">{r ? 'Save changes' : 'Add listing'}</button>{r && <Link href="/admin/premium-domains" className="btn btn-ghost">Cancel</Link>}</div>
    </form>
  );

  return (
    <>
      <PageHeader title="Premium domains" desc={<>Domains for sale on <a className="text-brand-600 underline" href="/premium-domains" target="_blank">/premium-domains</a> and the homepage row. Requests arrive in <Link className="text-brand-600 underline" href="/admin/domains/broker">Broker requests</Link> (reference PD-…) with a WHMCS ticket.</>}
        actions={<>
          <Link href="/admin/premium-domains?import=1#import" className="btn btn-secondary">Import my domains</Link>
          <a href="/premium-domains" target="_blank" className="btn btn-primary">View page</a>
        </>} />
      <Flash sp={sp} />
      {missing && <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">The premium tables do not exist yet. They are created by the next deploy (db-setup patch 036-premium-domains).</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[['Shown on the site', live.length], ['Your listings for sale', count('for_sale') + count('under_offer')], ['Dynadot listings shown', cfg.feed.enabled ? feedShown : 'feed off'], ['Sold', count('sold')]].map(([l, v]) => (
          <div key={String(l)} className="card p-4"><div className="text-xs font-medium text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v}</div></div>
        ))}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Dynadot connection">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Path</dt><dd>{t.mode === 'proxy' ? <Badge tone="green">WHMCS proxy (recommended)</Badge> : t.mode === 'direct' ? <Badge tone="yellow">Direct API key</Badge> : <Badge tone="red">Not connected</Badge>}</dd></div>
            {t.mode === 'proxy' && <div className="flex justify-between gap-4"><dt className="text-slate-500">Proxy URL</dt><dd className="break-all text-right">{t.url}</dd></div>}
            {t.mode === 'none' && <p className="text-red-700">{t.reason}</p>}
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Last feed refresh</dt><dd className="text-right">{st.at ? fmtDate(st.at) : 'never'}{st.ok === false && <span className="block text-red-700">{st.error} {st.advice}</span>}{st.ok && st.kept !== undefined && <span className="block text-slate-500">{st.read} read, {st.kept} kept</span>}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {can(sess, 'integration') && <form action={testConnection}><button className="btn btn-secondary" disabled={t.mode === 'none'}>Test connection</button></form>}
            <form action={refreshNow}><button className="btn btn-secondary" disabled={!cfg.feed.enabled || t.mode === 'none'}>Refresh Dynadot feed now</button></form>
          </div>
          <details className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-800">Setup (one upload)</summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4">
              <li>Upload <code>docs/whmcs/gh_dynadot_proxy.php</code> from the repository to the WHMCS root folder (next to <code>init.php</code>), so it opens at <b className="break-all">{defaultProxyUrl()}</b>.</li>
              <li>Nothing to fill in: it reads the Dynadot API key from WHMCS → Domain Registrars → Dynadot, and the shared secret from <code>globalhostia_hosting_hook.php</code> (the WHMCS hook secret in Admin → Hosting panels).</li>
              <li>The WHMCS server IP (216.158.237.114) must stay whitelisted in Dynadot → Settings → API. Click <b>Test connection</b>.</li>
              <li>Fallback only: set <code>DYNADOT_API_KEY</code> in Vercel; it works only from an IP Dynadot allows, and Vercel's IPs change.</li>
            </ol>
            <p className="mt-2">The proxy answers only signed, read-only requests (search, marketplace listings, your domain list). It cannot buy, register or change anything.</p>
          </details>
        </Card>

        {can(sess, 'settings') && (
          <Card title="Settings">
            <form action={saveConfig} className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} /> Premium domains page live (/premium-domains and detail pages)</label>
              <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Dynadot marketplace feed</legend>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="feed_enabled" defaultChecked={cfg.feed.enabled} /> Show Dynadot marketplace listings</label>
                <Field label="Extensions" hint="space or comma separated; empty = all"><input name="feed_tlds" defaultValue={cfg.feed.tlds.join(' ')} className="input" /></Field>
                <Field label="Keywords" hint="name must contain one; empty = any"><input name="feed_keywords" defaultValue={cfg.feed.keywords.join(', ')} className="input" /></Field>
                <Field label="Min price (USD)"><input name="feed_min" defaultValue={cfg.feed.minPrice} inputMode="decimal" className="input" /></Field>
                <Field label="Max price (USD)" hint="0 = no limit"><input name="feed_max" defaultValue={cfg.feed.maxPrice} inputMode="decimal" className="input" /></Field>
                <Field label="Exclude words"><input name="feed_exclude" defaultValue={cfg.feed.exclude.join(', ')} className="input" /></Field>
                <Field label="Max names shown"><input name="feed_max_count" defaultValue={cfg.feed.maxCount} inputMode="numeric" className="input" /></Field>
                <Field label="Pages to read (100 each)" hint="per refresh"><input name="feed_pages" defaultValue={cfg.feed.pages} inputMode="numeric" className="input" /></Field>
                <Field label="Refresh after (hours)" hint="also refreshed by the daily cron"><input name="cache_hours" defaultValue={cfg.cacheHours} inputMode="numeric" className="input" /></Field>
              </fieldset>
              <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Price of Dynadot listings</legend>
                <Field label="Pricing rule" className="sm:col-span-2"><select name="pricing_mode" defaultValue={cfg.pricing.mode} className="input"><option value="markup">Markup: one price (Dynadot price + %)</option><option value="fee">Dynadot price + broker fee shown separately</option></select></Field>
                <Field label="Markup (%)"><input name="markup_pct" defaultValue={cfg.pricing.markupPct} inputMode="decimal" className="input" /></Field>
                <Field label="Markup, fixed (USD)"><input name="markup_fixed" defaultValue={cfg.pricing.markupFixed} inputMode="decimal" className="input" /></Field>
                <Field label="Broker fee (%)"><input name="fee_pct" defaultValue={cfg.pricing.feePct} inputMode="decimal" className="input" /></Field>
                <Field label="Minimum broker fee (USD)"><input name="fee_min" defaultValue={cfg.pricing.feeMin} inputMode="decimal" className="input" /></Field>
                <p className="text-xs text-slate-500 sm:col-span-2">Example on a $1,000 Dynadot listing: {(() => { const v = priceFor(1000, cfg.pricing); return v.mode === 'fee' ? `$1,000 + $${v.fee} fee = ${fmtMoney(v.price)}` : `${fmtMoney(v.price)}`; })()}. Your own listings always show the price you enter.</p>
              </fieldset>
              <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Registry premium names on domain search</legend>
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="registry_enabled" defaultChecked={cfg.registry.enabled} /> Show the premium price and badge when Dynadot reports a registry premium name</label>
                <Field label="Markup (%)" hint="match WHMCS → Domain Pricing → Premium Domains" className="sm:col-span-2"><input name="registry_markup" defaultValue={cfg.registry.markupPct} inputMode="decimal" className="input" /></Field>
              </fieldset>
              <Field label="Homepage row"><select name="home_position" defaultValue={cfg.home.position} className="input">{HOME_POSITIONS.map((p) => <option key={p} value={p}>{HOME_POSITION_LABEL[p]}</option>)}</select></Field>
              <Field label="Names in the row" hint="4–40; shown with 3 or more"><input name="home_max" defaultValue={cfg.home.max} inputMode="numeric" className="input" /></Field>
              <Field label="Row title" className="sm:col-span-2"><input name="home_title" defaultValue={cfg.home.title} maxLength={60} className="input" /></Field>
              <Field label="Dynadot path"><select name="source" defaultValue={cfg.source} className="input"><option value="auto">Automatic (proxy, else key)</option><option value="proxy">WHMCS proxy only</option><option value="direct">Direct API key only</option></select></Field>
              <Field label="Proxy URL" hint={`empty = ${defaultProxyUrl()}`}><input name="proxy_url" defaultValue={cfg.proxyUrl} placeholder="https://…/gh_dynadot_proxy.php" className="input" /></Field>
              <button className="btn btn-primary sm:col-span-2">Save settings</button>
            </form>
          </Card>
        )}
      </div>

      <Card title={edit ? `Edit ${edit.domain}` : 'Add a listing'} className="mb-6"><ListingForm r={edit} /></Card>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search domain or tag" className="input max-w-xs" />
        <select name="status" defaultValue={fs} className="input w-48" aria-label="Filter by status"><option value="">All statuses</option>{PREMIUM_STATUSES.map((x) => <option key={x} value={x}>{PREMIUM_STATUS_LABEL[x]} ({count(x)})</option>)}</select>
        <button className="btn btn-secondary">Filter</button>
      </form>
      {!shown.length ? <Empty icon="globe">No listings{q || fs ? ' match this filter' : ' yet'}. Add one above, import a CSV, or pick from your Dynadot domains.</Empty> : (
        <div className="card mb-6 overflow-x-auto">
          <table className="table"><thead><tr><th>Domain</th><th>Status</th><th>Price</th><th>Type</th><th>Tags</th><th>Updated</th><th className="text-right">Actions</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id}>
                <td><a className="font-semibold hover:text-brand-600" href={`/premium-domains/${r.domain}`} target="_blank">{r.domain}</a>{r.featured && <span className="ml-2"><Badge tone="yellow">Featured</Badge></span>}</td>
                <td><Badge tone={tone(r.status)}>{PREMIUM_STATUS_LABEL[r.status as PremiumStatus] || r.status}</Badge></td>
                <td className="tabular-nums">{r.price ? fmtMoney(Number(r.price), r.currency) : 'Make an offer'}{r.minOffer && <div className="text-xs text-slate-500">min offer {fmtMoney(Number(r.minOffer), r.currency)}</div>}</td>
                <td>{r.owned ? 'Owned' : 'Brokered'}</td>
                <td className="text-xs text-slate-500">{(r.tags || []).join(', ')}</td>
                <td className="whitespace-nowrap text-slate-500">{fmtDate(r.updatedAt)}</td>
                <td><div className="flex flex-wrap justify-end gap-1">
                  <Link href={`/admin/premium-domains?edit=${r.id}`} className="btn btn-ghost h-8 px-2.5 text-xs">Edit</Link>
                  {([['feature', r.featured ? 'Unfeature' : 'Feature'], r.status !== 'for_sale' ? ['publish', 'For sale'] : ['hide', 'Hide'], ...(r.status !== 'sold' ? [['sold', 'Mark sold']] : []), ['delete', 'Delete']] as [string, string][]).map(([op, l]) => (
                    <form key={op} action={quickListing}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value={op} /><button className={`btn h-8 px-2.5 text-xs ${op === 'delete' ? 'btn-ghost text-red-600' : 'btn-secondary'}`}>{l}</button></form>
                  ))}
                </div></td>
              </tr>))}</tbody></table>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Import CSV">
          <form action={importCsv} className="grid gap-3">
            <p className="text-xs text-slate-500">Columns: <code>domain,price,currency,min_offer,tags,description,owned,featured</code>. Header optional; empty price = make an offer; tags separated by <code>|</code>; owned = yes/brokered. Existing domains are updated.</p>
            <textarea name="csv" rows={5} className="input font-mono text-xs" placeholder={'domain,price,currency,min_offer,tags,description,owned,featured\nbrand.com,4500,USD,3000,Brandable|Short,,yes,yes'} />
            <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
            <Field label="New rows"><select name="status" className="input" defaultValue="draft"><option value="draft">Add as drafts (hidden until published)</option><option value="for_sale">Add for sale</option></select></Field>
            <button className="btn btn-primary">Import</button>
          </form>
        </Card>
        <Card title="Dynadot feed preview">
          {!cfg.feed.enabled ? <p className="text-sm text-slate-500">The Dynadot marketplace feed is off. Switch it on in Settings, then Refresh.</p>
            : !feed.length ? <p className="text-sm text-slate-500">No cached listings yet. Click “Refresh Dynadot feed now”.</p>
            : <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">{feed.filter((f) => feedAllows({ domain: f.domain, amount: Number(f.price), currency: f.currency }, cfg.feed)).slice(0, cfg.feed.maxCount).map((f) => {
              const v = priceFor(Number(f.price), cfg.pricing);
              return <li key={f.domain} className="flex justify-between gap-3 py-1.5"><span className="break-all font-medium">{f.domain}</span><span className="whitespace-nowrap tabular-nums text-slate-600">Dynadot {fmtMoney(Number(f.price))} → site {fmtMoney(v.price)}</span></li>;
            })}</ul>}
        </Card>
      </div>

      <div id="import" className="mt-6">
        {picker && (
          <Card title="Import from my Dynadot account">
            {picker.error ? <p className="text-sm text-red-700">Could not load your domains: {picker.error}</p>
              : !picker.list.length ? <p className="text-sm text-slate-500">No domains to import (all are listed already, or the account has none).</p>
              : (
                <form action={importOwn} className="grid gap-3">
                  <p className="text-xs text-slate-500">Nothing is listed automatically. Tick only the names you want to sell.</p>
                  <div className="grid max-h-96 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {picker.list.map((d) => <label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" name="pick" value={d} /> <span className="break-all">{d}</span></label>)}
                  </div>
                  <Field label="Add as"><select name="status" className="input" defaultValue="draft"><option value="draft">Drafts (set a price, then publish)</option><option value="for_sale">For sale, make an offer</option></select></Field>
                  <button className="btn btn-primary">Add ticked domains</button>
                </form>
              )}
          </Card>
        )}
      </div>
    </>
  );
}
