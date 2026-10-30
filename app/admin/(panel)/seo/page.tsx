import Link from 'next/link';
import { asc, desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Field, Flash, Badge } from '@/components/ui';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { saveRedirect, deleteRedirect, bulkSeo } from './actions';

export const metadata = { title: 'Marketing & SEO' };

export default async function Seo({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [pages, redirects] = await Promise.all([
    db.select().from(schema.pages).orderBy(asc(schema.pages.slug)),
    db.select().from(schema.redirects).orderBy(desc(schema.redirects.createdAt)),
  ]);
  let promos: any[] = [], promoErr = '';
  if (whmcsConfigured()) { try { promos = (await whmcs('GetPromotions')).promotions?.promotion ?? []; } catch (e: any) { promoErr = e.message; } }
  const issues = (p: (typeof pages)[0]) => [!p.seoTitle && 'no title', p.seoTitle.length > 65 && 'title long', !p.seoDescription && 'no description', p.seoDescription.length > 170 && 'description long'].filter(Boolean) as string[];

  return (
    <>
      <PageHeader title="Marketing & SEO" desc="Search metadata for every page, URL redirects, and WHMCS promotions/coupons." />
      <Flash sp={sp} />
      <div className="space-y-6">
        <form action={bulkSeo}>
          <Card title="Page metadata" actions={<button className="btn btn-primary">Save all</button>}>
            <div className="overflow-x-auto"><table className="table"><thead><tr><th>Page</th><th>SEO title</th><th>Meta description</th><th>Checks</th></tr></thead>
              <tbody>{pages.map((p) => { const is = issues(p); return (
                <tr key={p.id}><td className="text-xs"><Link className="text-brand-600" href={`/admin/pages/${p.id}`}>/{p.slug === 'index' ? '' : p.slug}</Link><input type="hidden" name="ids" value={p.id} /></td>
                  <td><input name={`t_${p.id}`} defaultValue={p.seoTitle} className="input min-w-64 text-xs" /></td>
                  <td><textarea name={`d_${p.id}`} defaultValue={p.seoDescription} rows={2} className="input min-w-80 text-xs" /></td>
                  <td>{is.length ? is.map((x) => <div key={x}><Badge tone="yellow">{x}</Badge></div>) : <Badge tone="green">good</Badge>}</td></tr>); })}</tbody></table></div>
          </Card>
        </form>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`Redirects (${redirects.length})`}>
            <form action={saveRedirect} className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto]">
              <input name="from" placeholder="/old-url" className="input" required /><input name="to" placeholder="/new-url or https://…" className="input" required />
              <select name="code" className="input"><option value="301">301</option><option value="302">302</option></select><button className="btn btn-secondary">Add</button>
            </form>
            <div className="max-h-96 overflow-y-auto"><table className="table"><tbody>{redirects.map((r) => (
              <tr key={r.id}><td className="font-mono text-xs">{r.from}</td><td className="font-mono text-xs">→ {r.to}</td><td className="text-xs">{r.code}</td>
                <td><form action={deleteRedirect}><input type="hidden" name="id" value={r.id} /><button className="text-xs text-red-500">delete</button></form></td></tr>))}</tbody></table></div>
          </Card>
          <Card title="Promotions & coupons (WHMCS)">
            {promoErr ? <p className="text-sm text-red-600">{promoErr}</p> : !promos.length ? <p className="text-sm text-slate-500">No promotions found{whmcsConfigured() ? '' : ' (WHMCS not configured)'}.</p> : (
              <table className="table"><thead><tr><th>Code</th><th>Value</th><th>Uses</th><th>Expires</th></tr></thead>
                <tbody>{promos.map((p) => <tr key={p.id}><td className="font-mono">{p.code}</td><td>{p.value} {p.type === 'Percentage' ? '%' : ''}</td><td>{p.uses}{Number(p.maxuses) ? ` / ${p.maxuses}` : ''}</td><td className="text-xs">{p.expirationdate?.startsWith('0000') ? 'never' : p.expirationdate}</td></tr>)}</tbody></table>
            )}
            <p className="mt-3 text-xs text-slate-500">Coupons are created in WHMCS (Promotions) so they apply at checkout. Show them on the site with an HTML section or banner.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
