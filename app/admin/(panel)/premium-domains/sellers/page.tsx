import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Card, Field, Badge, Empty, fmtDate } from '@/components/ui';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { whmcs, whmcsConfigured, whmcsBase } from '@/lib/whmcs';
import { SELL_STATUSES, SELL_STATUS_LABEL, SELL_CURRENCIES, SELL_CATEGORIES, featuredNow, daysLeft, type SellStatus } from '@/lib/sell/core';
import { sellConfig, missingTable } from '@/lib/sell/store';
import { fmtMoney } from '@/lib/premium/core';
import { approveListing, rejectListing, quickSeller, editSeller, saveSellConfig, runSellerCheck } from './actions';

export const metadata = { title: 'Seller submissions' };
export const dynamic = 'force-dynamic';

const BASE = '/admin/premium-domains/sellers';
const tone = (s: string) => (s === 'live' ? 'green' : s === 'in_review' || s === 'awaiting_payment' || s === 'expired' ? 'yellow' : s === 'rejected' || s === 'suspended' ? 'red' : s === 'sold' ? 'blue' : 'gray');
type Row = typeof schema.sellerListings.$inferSelect;
const arr = (v: any): any[] => (Array.isArray(v) ? v : v ? [v] : []);
const day = (d?: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** Live WHMCS state for the rows shown (domain status in the seller's account, fee invoice status). Read-only, best effort. */
async function whmcsState(rows: Row[]) {
  const dom = new Map<string, string>(), inv = new Map<number, string>();
  if (!whmcsConfigured()) return { dom, inv, off: true };
  const clients = [...new Set(rows.map((r) => r.clientId))].slice(0, 25);
  await Promise.all(clients.map(async (cid) => {
    try {
      const list = arr((await whmcs('GetClientsDomains', { clientid: cid, limitnum: 250 })).domains?.domain);
      for (const r of rows.filter((x) => x.clientId === cid)) {
        const d = list.find((x) => String(x.domainname || '').toLowerCase() === r.domain && (x.userid === undefined || Number(x.userid) === cid));
        dom.set(r.id, d ? `${d.status}${d.expirydate ? ` · expires ${String(d.expirydate).slice(0, 10)}` : ''}` : 'Not in this client account');
      }
    } catch { for (const r of rows.filter((x) => x.clientId === cid)) dom.set(r.id, 'WHMCS did not answer'); }
  }));
  const ids = [...new Set(rows.flatMap((r) => [r.invoiceId, r.featuredInvoiceId, r.renewInvoiceId]).filter((x): x is number => !!x))].slice(0, 30);
  await Promise.all(ids.map(async (id) => { try { inv.set(id, String((await whmcs('GetInvoice', { invoiceid: id })).status || '?')); } catch { inv.set(id, '?'); } }));
  return { dom, inv, off: false };
}

export default async function SellerSubmissions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sess = await requireSession('content');
  const sp = await searchParams;
  const cfg = await sellConfig();
  let rows: Row[] = [], missing = false;
  try { rows = await db.select().from(schema.sellerListings).orderBy(desc(schema.sellerListings.updatedAt)).limit(1000); }
  catch (e) { if (missingTable(e)) missing = true; else throw e; }
  const f = sp.status === 'all' || (SELL_STATUSES as readonly string[]).includes(sp.status) ? sp.status : 'queue';
  const q = (sp.q || '').toLowerCase().trim().slice(0, 60);
  const inQueue = (r: Row) => r.status === 'in_review' || r.status === 'suspended' || !!r.pending;
  const shown = rows.filter((r) => (f === 'all' ? true : f === 'queue' ? inQueue(r) : r.status === f) && (!q || r.domain.includes(q) || r.ref.toLowerCase().includes(q) || String(r.clientId) === q));
  const sel = sp.id ? rows.find((r) => r.id === sp.id) : undefined;
  const live = await whmcsState(sel ? [sel, ...shown.filter((r) => r.id !== sel.id).slice(0, 24)] : shown.slice(0, 25));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  let client: any = null;
  if (sel && whmcsConfigured()) { try { const c = await whmcs('GetClientsDetails', { clientid: sel.clientId }); client = c.client ?? c; } catch { client = null; } }
  const invCell = (id: number | null, label: string) => (id ? <div className="text-xs"><span className="text-slate-500">{label}</span> <a className="text-brand-600 underline" href={`${whmcsBase()}/admin/invoices.php?action=edit&id=${id}`} target="_blank">#{id}</a> {live.inv.get(id) && <Badge tone={live.inv.get(id) === 'Paid' ? 'green' : live.inv.get(id) === 'Unpaid' ? 'yellow' : 'gray'}>{live.inv.get(id)}</Badge>}</div> : null);
  const price = (r: Row) => (r.price ? fmtMoney(Number(r.price), r.currency) : 'Make an offer');

  return (
    <>
      <PageHeader title="Premium domains" desc={<>Customer listings from <b>Sell your domain</b> (portal → Sell domains). Paid listings arrive here for review; approved ones show on <a className="text-brand-600 underline" href="/premium-domains" target="_blank">/premium-domains</a> as brokered names for one year. Buyer requests go to <Link className="text-brand-600 underline" href="/admin/domains/broker">Broker requests</Link> and the seller is emailed without the buyer&apos;s details.</>}
        actions={<><form action={runSellerCheck}><button className="btn btn-secondary">Run daily check now</button></form><a href="/sell-domains" target="_blank" className="btn btn-primary">View seller page</a></>} />
      <nav className="mb-6 flex gap-1 border-b border-slate-200 text-sm" aria-label="Premium domains sections">
        <Link href="/admin/premium-domains" className="-mb-px border-b-2 border-transparent px-3 py-2 text-slate-500 hover:text-slate-900">Listings &amp; feed</Link>
        <Link href={BASE} aria-current="page" className="-mb-px border-b-2 border-brand-600 px-3 py-2 font-semibold text-slate-900">Seller submissions {rows.filter(inQueue).length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{rows.filter(inQueue).length}</span>}</Link>
      </nav>
      <Flash sp={sp} />
      {missing && <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">The seller_listings table is created by the next deploy (db-setup patch 038-seller-listings).</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-5">
        {([['To review', rows.filter(inQueue).length], ['Awaiting payment', count('awaiting_payment')], ['Live', count('live')], ['Expired / hidden', count('expired') + count('suspended')], ['Sold', count('sold')]] as [string, number][]).map(([l, v]) => (
          <div key={l} className="card p-4"><div className="text-xs font-medium text-slate-500">{l}</div><div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v}</div></div>
        ))}
      </div>

      {sel && (
        <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card title={<span className="flex flex-wrap items-center gap-2"><span className="break-all">{sel.domain}</span><Badge tone={tone(sel.status)}>{SELL_STATUS_LABEL[sel.status as SellStatus] || sel.status}</Badge>{featuredNow(sel as any) && <Badge tone="yellow">Featured</Badge>}<span className="text-xs font-normal text-slate-400">{sel.ref}</span></span>}
            actions={<Link href={BASE} className="btn btn-ghost h-8 px-2.5 text-xs">Close</Link>}>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Seller</dt><dd><Link className="text-brand-600 underline" href={`/admin/customers/${sel.clientId}`}>Client #{sel.clientId}</Link>{client && <span className="block text-slate-600">{`${client.firstname || ''} ${client.lastname || ''}`.trim()} · {client.email}</span>}</dd></div>
              <div><dt className="text-slate-500">WHMCS domain</dt><dd>{live.dom.get(sel.id) || (live.off ? 'WHMCS not configured' : '—')}</dd></div>
              <div><dt className="text-slate-500">Proposed price</dt><dd className="tabular-nums">{price(sel)}{sel.minOffer && <span className="block text-xs text-slate-500">min offer {fmtMoney(Number(sel.minOffer), sel.currency)}</span>}{sel.acceptOffers && sel.price && <span className="block text-xs text-slate-500">accepts offers</span>}</dd></div>
              <div><dt className="text-slate-500">Fees</dt><dd>{sel.feeAmount ? `${sel.feeCurrency} ${sel.feeAmount}` : '—'}{sel.featuredFeeAmount && ` + featured ${sel.feeCurrency} ${sel.featuredFeeAmount}`}<span className="block text-xs text-slate-500">{sel.feeMethod === 'order' ? 'WHMCS order' : sel.feeMethod === 'invoice' ? 'converted invoice' : ''}{sel.paidAt && ` · paid ${fmtDate(sel.paidAt)}`}</span>
                {invCell(sel.invoiceId, 'Listing')}{sel.featuredInvoiceId !== sel.invoiceId && invCell(sel.featuredInvoiceId, 'Featured')}{invCell(sel.renewInvoiceId, 'Renewal')}</dd></div>
              <div><dt className="text-slate-500">Listed until</dt><dd className="tabular-nums">{sel.listedUntil ? `${day(sel.listedUntil)} (${daysLeft(day(sel.listedUntil))} days)` : 'starts at approval'}{featuredNow(sel as any) && sel.featuredUntil && <span className="block text-xs text-slate-500">featured until {day(sel.featuredUntil)}</span>}</dd></div>
              <div><dt className="text-slate-500">Terms accepted</dt><dd>{sel.termsAt ? fmtDate(sel.termsAt) : '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Description</dt><dd className="whitespace-pre-wrap">{sel.description || '—'}{sel.category && <span className="block text-xs text-slate-500">{sel.category}{sel.tags?.length ? ` · ${sel.tags.join(', ')}` : ''}</span>}</dd></div>
              {sel.pending && <div className="rounded-lg bg-sky-50 p-3 ring-1 ring-sky-200 sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-sky-800">Changes waiting for review</dt><dd className="mt-1 whitespace-pre-wrap">{sel.pending.description}<span className="block text-xs text-slate-600">{sel.pending.category}{sel.pending.tags?.length ? ` · ${sel.pending.tags.join(', ')}` : ''}</span>
                <div className="mt-2 flex gap-2">{(['approve_changes', 'discard_changes'] as const).map((op) => <form key={op} action={quickSeller}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="op" value={op} /><button className={`btn h-8 px-2.5 text-xs ${op === 'approve_changes' ? 'btn-primary' : 'btn-ghost'}`}>{op === 'approve_changes' ? 'Publish changes' : 'Discard'}</button></form>)}</div></dd></div>}
              {sel.flags?.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200 sm:col-span-2"><b>Check before approving:</b> {sel.flags.map((x) => x.replace('trademark:', 'possible trademark "') + (x.startsWith('trademark:') ? '"' : '')).join(', ')}</div>}
              {sel.rejectReason && <div className="sm:col-span-2"><dt className="text-slate-500">Reject reason</dt><dd>{sel.rejectReason}</dd></div>}
              {sel.adminNote && <div className="sm:col-span-2"><dt className="text-slate-500">Admin notes</dt><dd className="whitespace-pre-wrap text-xs">{sel.adminNote}</dd></div>}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {(sel.status === 'in_review' || sel.status === 'suspended') && <form action={approveListing} className="flex items-center gap-2"><input type="hidden" name="id" value={sel.id} />{!sel.paidAt && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="override" /> approve without payment</label>}<button className="btn btn-primary">Approve (live 1 year)</button></form>}
              {(['feature', 'recheck', ...(sel.status === 'suspended' ? ['restore'] : []), ...(sel.status === 'live' ? ['sold'] : [])] as string[]).map((op) => (
                <form key={op} action={quickSeller}><input type="hidden" name="id" value={sel.id} /><input type="hidden" name="op" value={op} /><button className="btn btn-secondary">{op === 'feature' ? (featuredNow(sel as any) ? 'Unfeature' : 'Feature') : op === 'recheck' ? 'Re-check in WHMCS' : op === 'restore' ? 'Restore listing' : 'Mark sold'}</button></form>
              ))}
            </div>
            {sel.status === 'in_review' && <form action={rejectListing} className="mt-4 grid gap-2">
              <input type="hidden" name="id" value={sel.id} />
              <Field label="Reject with reason" hint="emailed to the seller with your refund policy; refunds are done manually in WHMCS"><textarea name="reason" rows={2} maxLength={600} required className="input" placeholder="For example: the name contains a registered trademark." /></Field>
              <div><button className="btn btn-ghost text-red-600">Reject listing</button></div>
            </form>}
          </Card>
          <Card title="Edit listing">
            <form action={editSeller} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={sel.id} />
              <Field label="Price" hint="empty = make an offer"><input name="price" defaultValue={sel.price ?? ''} inputMode="decimal" className="input" /></Field>
              <Field label="Currency"><select name="currency" defaultValue={sel.currency} className="input">{SELL_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Minimum offer"><input name="min_offer" defaultValue={sel.minOffer ?? ''} inputMode="decimal" className="input" /></Field>
              <Field label="Listed until" hint="YYYY-MM-DD"><input name="listed_until" type="date" defaultValue={day(sel.listedUntil)} className="input" /></Field>
              <Field label="Category"><select name="category" defaultValue={sel.category} className="input"><option value="">—</option>{SELL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Tags" hint="comma separated"><input name="tags" defaultValue={(sel.tags || []).join(', ')} className="input" /></Field>
              <Field label="Description" className="sm:col-span-2"><textarea name="description" rows={3} maxLength={1200} defaultValue={sel.description} className="input" /></Field>
              <Field label="Admin notes" hint="internal" className="sm:col-span-2"><textarea name="admin_note" rows={2} maxLength={2000} defaultValue={sel.adminNote} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="accept_offers" defaultChecked={sel.acceptOffers} /> Accept offers</label>
              <div className="sm:text-right"><button className="btn btn-primary">Save</button></div>
            </form>
          </Card>
        </div>
      )}

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Domain, SL- reference or client id" className="input max-w-xs" />
        <select name="status" defaultValue={f} className="input w-56" aria-label="Filter by status">
          <option value="queue">Review queue ({rows.filter(inQueue).length})</option><option value="all">All ({rows.length})</option>
          {SELL_STATUSES.map((x) => <option key={x} value={x}>{SELL_STATUS_LABEL[x]} ({count(x)})</option>)}
        </select>
        <button className="btn btn-secondary">Filter</button>
      </form>
      {!shown.length ? <Empty icon="globe">{f === 'queue' ? 'Nothing to review. New paid listings appear here.' : 'No listings match this filter.'}</Empty> : (
        <div className="card mb-6 overflow-x-auto">
          <table className="table"><thead><tr><th>Domain</th><th>Status</th><th>Seller</th><th>WHMCS domain</th><th>Invoice</th><th>Price</th><th>Listed until</th><th className="text-right">Actions</th></tr></thead>
            <tbody>{shown.slice(0, 300).map((r) => (
              <tr key={r.id} className={r.id === sel?.id ? 'bg-brand-50/40' : ''}>
                <td><Link className="font-semibold hover:text-brand-600" href={`${BASE}?id=${r.id}${f !== 'queue' ? `&status=${f}` : ''}`}>{r.domain}</Link>{featuredNow(r as any) && <span className="ml-2"><Badge tone="yellow">Featured</Badge></span>}<div className="text-xs text-slate-400">{r.ref}{r.flags?.length ? ' · flagged' : ''}{r.pending ? ' · changes' : ''}</div></td>
                <td><Badge tone={tone(r.status)}>{SELL_STATUS_LABEL[r.status as SellStatus] || r.status}</Badge></td>
                <td><Link className="text-brand-600 underline" href={`/admin/customers/${r.clientId}`}>#{r.clientId}</Link></td>
                <td className="text-xs text-slate-600">{live.dom.get(r.id) || '—'}</td>
                <td>{invCell(r.invoiceId, '') || <span className="text-xs text-slate-400">—</span>}</td>
                <td className="tabular-nums">{price(r)}</td>
                <td className="whitespace-nowrap tabular-nums text-slate-600">{day(r.listedUntil) || '—'}</td>
                <td className="text-right"><Link href={`${BASE}?id=${r.id}${f !== 'queue' ? `&status=${f}` : ''}`} className="btn btn-ghost h-8 px-2.5 text-xs">Review</Link></td>
              </tr>))}</tbody></table>
        </div>
      )}

      {can(sess, 'settings') && (
        <div id="settings"><Card title="Sell your domain: settings">
          <form action={saveSellConfig} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4"><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} /> Customers can list domains (portal → Sell domains)</label>
            <Field label="Listing fee (USD, per domain, 1 year)"><input name="listing_fee" defaultValue={cfg.listingFeeUsd} inputMode="decimal" className="input" /></Field>
            <Field label="Featured upgrade (USD)"><input name="featured_fee" defaultValue={cfg.featuredFeeUsd} inputMode="decimal" className="input" /></Field>
            <Field label="WHMCS pid: Premium listing fee" hint="one-time product, priced per currency"><input name="listing_pid" defaultValue={cfg.listingPid} inputMode="numeric" className="input" /></Field>
            <Field label="WHMCS pid: Featured listing"><input name="featured_pid" defaultValue={cfg.featuredPid} inputMode="numeric" className="input" /></Field>
            <Field label="Sale commission (%)" hint="deducted from the seller payout; 0 = none"><input name="commission_pct" defaultValue={cfg.commissionPct} inputMode="decimal" className="input" /></Field>
            <Field label="Minimum commission (USD)" hint="0 = no minimum"><input name="commission_min" defaultValue={cfg.commissionMinUsd} inputMode="decimal" className="input" /></Field>
            <Field label="Domain must not expire within (days)"><input name="min_expiry" defaultValue={cfg.minExpiryDays} inputMode="numeric" className="input" /></Field>
            <Field label="Open listings per customer"><input name="max_per_client" defaultValue={cfg.maxPerClient} inputMode="numeric" className="input" /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4"><input type="checkbox" name="taxed" defaultChecked={cfg.invoiceTaxed} /> Tax the fallback invoice lines (WHMCS applies tax only to taxable clients)</label>
            <Field label="Refund policy" hint="shown on the form and the seller page, and emailed with a rejection" className="sm:col-span-2 lg:col-span-4"><textarea name="refund_policy" rows={3} defaultValue={cfg.refundPolicy} maxLength={1500} className="input" /></Field>
            <Field label="Trademark words (flag for manual review)" hint="comma or space separated; names containing them are flagged, never auto-rejected" className="sm:col-span-2 lg:col-span-4"><textarea name="trademarks" rows={3} defaultValue={cfg.trademarkTerms.join(', ')} className="input" /></Field>
            <p className="text-xs leading-relaxed text-slate-500 sm:col-span-2 lg:col-span-3">With both product IDs set, fees are ordered with AddOrder and WHMCS prices them in the customer&apos;s currency (set a price for every currency on both products, payment type One Time). Without them, a CreateInvoice converts the USD fees with the WHMCS currency rates (whole units, e.g. AED 55).</p>
            <div className="lg:text-right"><button className="btn btn-primary">Save settings</button></div>
          </form>
        </Card></div>
      )}
    </>
  );
}
