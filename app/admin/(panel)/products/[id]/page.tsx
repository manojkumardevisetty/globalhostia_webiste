import { notFound } from 'next/navigation';
import { asc, desc, eq, and } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Field, Badge, statusTone, Flash, fmtDate, LinkBtn } from '@/components/ui';
import { CYCLES, CYCLE_LABEL, money } from '@/lib/pricing';
import { toKv } from '@/lib/admin';
import { getSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { saveProduct, createInWhmcs } from '../actions';

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const isNew = id === 'new';
  const [p] = isNew ? [null] : await db.select().from(schema.products).where(eq(schema.products.id, id));
  if (!isNew && !p) notFound();
  const cats = await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder));
  const prices = p ? await db.select().from(schema.productPrices).where(eq(schema.productPrices.productId, p.id)) : [];
  const revs = p ? await db.select().from(schema.revisions).where(and(eq(schema.revisions.entity, 'product'), eq(schema.revisions.entityId, p.id))).orderBy(desc(schema.revisions.createdAt)).limit(5) : [];
  const session = await getSession();
  const linked = !!p?.whmcsPid;
  const currencies = [...new Set(prices.map((x) => x.currency))];
  const local = (c: string) => prices.find((x) => x.cycle === c);
  const dt = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 16) : '');

  return (
    <>
      <PageHeader title={isNew ? 'New product' : p!.name} desc={p ? <>/{p.slug} · updated {fmtDate(p.updatedAt)}</> : 'Create a product for the website. Link it to WHMCS for live pricing & ordering.'}
        actions={<LinkBtn href="/admin/products">← All products</LinkBtn>} />
      <Flash sp={sp} />
      <form action={saveProduct} className="grid gap-6 lg:grid-cols-3">
        <input type="hidden" name="id" value={p?.id || ''} />
        <div className="space-y-6 lg:col-span-2">
          <Card title="Content">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name"><input name="name" defaultValue={p?.name} required className="input" /></Field>
              <Field label="URL slug" hint="Auto-generated from name if empty"><input name="slug" defaultValue={p?.slug} className="input" /></Field>
              <Field label="Tagline" className="sm:col-span-2" hint="Short line under the price"><input name="tagline" defaultValue={p?.tagline} className="input" /></Field>
              <Field label="Features" className="sm:col-span-2" hint='One per line. Start with "-" to show as not included.'><textarea name="features" rows={8} defaultValue={(p?.features || []).join('\n')} className="input code" /></Field>
              <Field label="Specifications (attributes)" className="sm:col-span-2" hint='One "key: value" per line, e.g. cpu: 4 vCPU · ram: 8GB · storage: 160GB NVMe · location: UAE. Used for filters, comparison tables and server tables.'>
                <textarea name="attributes" rows={5} defaultValue={toKv(p?.attributes || {})} className="input code" /></Field>
              <Field label="Long description (HTML allowed)" className="sm:col-span-2"><textarea name="description" rows={4} defaultValue={p?.description} className="input code" /></Field>
            </div>
          </Card>
          <Card title="Pricing" actions={linked ? <Badge tone="green">Synced from WHMCS</Badge> : <Badge tone="yellow">Manual</Badge>}>
            {linked ? (
              prices.length ? (
                <table className="table"><thead><tr><th>Cycle</th>{currencies.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{[...new Set(prices.map((x) => x.cycle))].map((cy) => <tr key={cy}><td>{CYCLE_LABEL[cy] || cy}</td>{currencies.map((c) => { const r = prices.find((x) => x.cycle === cy && x.currency === c); return <td key={c}>{r ? <>{money(r.price, r.prefix)}{Number(r.setupFee) > 0 && <span className="text-xs text-slate-400"> + {money(r.setupFee, r.prefix)} setup</span>}</> : '—'}</td>; })}</tr>)}</tbody></table>
              ) : <p className="text-sm text-amber-600">No prices received from WHMCS yet — run a sync.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-500">This product isn&apos;t linked to WHMCS. Enter validated prices, then use <b>Create in WHMCS</b> (right) so customers can order it.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Currency"><input name="currency" defaultValue={prices[0]?.currency || 'USD'} className="input" /></Field>
                  {CYCLES.map((c) => (
                    <div key={c} className="grid grid-cols-2 gap-2">
                      <Field label={CYCLE_LABEL[c]}><input name={`price_${c}`} defaultValue={local(c)?.price ?? ''} placeholder="—" inputMode="decimal" className="input" /></Field>
                      <Field label="Setup fee"><input name={`setup_${c}`} defaultValue={local(c)?.setupFee ?? ''} placeholder="0" inputMode="decimal" className="input" /></Field>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Cycle shown on website"><select name="displayCycle" defaultValue={p?.displayCycle || 'auto'} className="input"><option value="auto">Automatic (monthly first)</option>{CYCLES.map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}</select></Field>
              <Field label="Custom order URL" hint="Leave empty to use the WHMCS cart"><input name="orderUrl" defaultValue={p?.orderUrl} placeholder="https://…" className="input" /></Field>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Publishing">
            <div className="space-y-4">
              <Field label="Status"><select name="status" defaultValue={p?.status || 'DRAFT'} className="input"><option value="DRAFT">Draft (hidden)</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></Field>
              <Field label="Publish at (optional)" hint="Schedule — shown from this time (Dubai time zone of your browser)"><input type="datetime-local" name="publishAt" defaultValue={dt(p?.publishAt)} className="input" /></Field>
              <Field label="Category"><select name="categoryId" defaultValue={p?.categoryId || ''} className="input"><option value="">— None —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Badge text" hint="Defaults to name"><input name="badge" defaultValue={p?.badge} className="input" /></Field>
                <Field label="Badge colour"><select name="badgeColor" defaultValue={p?.badgeColor || 'primary'} className="input">{['primary', 'warning', 'success', 'danger', 'info', 'dark'].map((c) => <option key={c}>{c}</option>)}</select></Field>
              </div>
              <Field label="Sort order"><input name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="featured" defaultChecked={p?.featured} /> Featured / highlighted</label>
              <button className="btn btn-primary w-full">Save product</button>
              {p && <a href={`/admin/pages?usesCategory=${p.categoryId || ''}`} className="block text-center text-xs text-brand-600">Where is this shown?</a>}
            </div>
          </Card>
          <Card title="WHMCS link">
            <Field label="WHMCS product ID (pid)" hint="Linking makes WHMCS the source of prices & checkout"><input name="whmcsPid" defaultValue={p?.whmcsPid ?? ''} className="input" /></Field>
            {linked && <>
              <dl className="mt-3 space-y-1 text-xs text-slate-500">
                <div>WHMCS name: <b>{p!.whmcsName}</b></div><div>Type: {p!.whmcsType} · pay: {p!.payType}</div>
                <div>Last sync: {fmtDate(p!.syncedAt)}</div>
                {p!.whmcsRetired && <div className="text-red-600">Not returned by WHMCS anymore — check if it was deleted.</div>}
                {p!.syncError && <div className="text-red-600">{p!.syncError}</div>}
              </dl>
              <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" name="contentLocked" defaultChecked={p!.contentLocked} className="mt-1" /> <span>Keep my text — don&apos;t overwrite name/features from WHMCS on sync <span className="block text-xs text-slate-400">Prices always sync.</span></span></label>
            </>}
          </Card>
          {revs.length > 0 && <Card title="Revision history"><ul className="space-y-1 text-xs text-slate-500">{revs.map((r) => <li key={r.id}>{fmtDate(r.createdAt)} — {r.userEmail}</li>)}</ul></Card>}
        </div>
      </form>
      {p && !linked && can(session, 'integration') && (
        <form action={createInWhmcs} className="card mt-6 flex flex-wrap items-end gap-3 p-5">
          <input type="hidden" name="id" value={p.id} />
          <div className="flex-1"><h3 className="text-sm font-semibold">Create in WHMCS</h3><p className="text-xs text-slate-500">Uses the WHMCS AddProduct API in this category&apos;s WHMCS group with the prices above, then links it. Save first.</p></div>
          <Field label="Product type"><select name="type" className="input"><option value="hostingaccount">Shared hosting</option><option value="reselleraccount">Reseller</option><option value="server">Server / VPS</option><option value="other">Other</option></select></Field>
          <Field label="Server module (optional)"><input name="module" placeholder="cpanel, directadmin…" className="input" /></Field>
          <button className="btn btn-secondary">Create in WHMCS</button>
        </form>
      )}
    </>
  );
}
