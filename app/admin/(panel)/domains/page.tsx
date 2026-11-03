import { asc, desc, ilike } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Card, Field, fmtDate, Empty } from '@/components/ui';
import { getSettings } from '@/lib/settings';
import { money } from '@/lib/pricing';
import { saveTlds, saveDomainSettings } from './actions';
import { runSync } from '../whmcs/actions';

export const metadata = { title: 'Domains & TLDs' };

export default async function Domains({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const rows = await db.select().from(schema.tlds).where(sp.q ? ilike(schema.tlds.tld, `%${sp.q}%`) : undefined).orderBy(desc(schema.tlds.featured), asc(schema.tlds.sortOrder), asc(schema.tlds.tld));
  return (
    <>
      <PageHeader title="Domains & TLDs" desc="Prices come from WHMCS (GetTLDPricing). Control which extensions are shown, featured or promoted." actions={<><a href="/admin/domains/broker" className="btn btn-secondary">Broker requests</a><form action={runSync}><input type="hidden" name="kind" value="tlds" /><button className="btn btn-primary">Sync TLD prices</button></form></>} />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <form className="mb-3"><input name="q" defaultValue={sp.q} placeholder="Search .com, .ae…" className="input max-w-xs" /></form>
          {!rows.length ? <Empty>No TLDs yet — press <b>Sync TLD prices</b>.</Empty> : (
            <form action={saveTlds} className="card overflow-x-auto">
              <table className="table"><thead><tr><th>TLD</th><th>Register</th><th>Transfer</th><th>Renew</th><th>Show</th><th>Featured</th><th>Promo label</th><th>Order</th></tr></thead>
                <tbody>{rows.map((t) => (
                  <tr key={t.id}><td className="font-semibold">{t.tld}<input type="hidden" name="ids" value={t.id} /></td>
                    <td>{t.register ? money(t.register) : '—'}</td><td>{t.transfer ? money(t.transfer) : '—'}</td><td>{t.renew ? money(t.renew) : '—'}</td>
                    <td><input type="checkbox" name={`visible_${t.id}`} defaultChecked={t.visible} /></td>
                    <td><input type="checkbox" name={`featured_${t.id}`} defaultChecked={t.featured} /></td>
                    <td><input name={`promo_${t.id}`} defaultValue={t.promo} className="input w-32" placeholder="e.g. -50%" /></td>
                    <td><input name={`sort_${t.id}`} defaultValue={t.sortOrder} type="number" className="input w-20" /></td></tr>))}</tbody></table>
              <div className="flex justify-between border-t p-3 text-xs text-slate-400"><span>Last synced: {fmtDate(rows[0]?.syncedAt)}</span><button className="btn btn-primary">Save TLD settings</button></div>
            </form>
          )}
        </div>
        <Card title="Domain search settings">
          <form action={saveDomainSettings} className="space-y-3">
            <Field label="Suggested extensions" hint="Checked alongside every search, in this order. Comma separated."><input name="domain_suggest_tlds" defaultValue={(s.domain_suggest_tlds || []).join(', ')} className="input" /></Field>
            <button className="btn btn-secondary w-full">Save</button>
          </form>
          <p className="mt-4 text-xs text-slate-500">To add domain search to any page: Pages → open page → add <b>Domain search box</b> and <b>Domain search results</b> sections, or a <b>Domain price table</b>. Registration, transfer, renewals, contacts and nameservers are handled by WHMCS checkout and client area.</p>
        </Card>
      </div>
    </>
  );
}
