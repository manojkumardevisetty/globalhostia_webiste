import Link from 'next/link';
import { asc, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Flash, Badge, Empty, fmtDate, statusTone } from '@/components/ui';
import { getCatalog } from '@/lib/theme/data';
import { resolveTarget } from '@/lib/theme/pages/landing';
import { createLanding } from './actions';

export const metadata = { title: 'Landing pages' };
export const dynamic = 'force-dynamic';

export default async function LandingPages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('content');
  const sp = await searchParams;
  let err = '';
  const [rows, cat, counts] = await Promise.all([
    db.select().from(schema.landingPages).orderBy(asc(schema.landingPages.slug)).catch((e) => { err = String(e?.message || e); return []; }),
    getCatalog(),
    db.select({ s: schema.leads.source, n: sql<number>`count(*)::int` }).from(schema.leads).where(sql`${schema.leads.source} like 'landing:%'`).groupBy(schema.leads.source).catch(() => []),
  ]);
  const leadsFor = (slug: string) => counts.find((c) => c.s === `landing:${slug}`)?.n || 0;

  return (
    <>
      <PageHeader title="Landing pages" desc={<>Distraction-free pages for paid ads at <code>/lp/&lt;address&gt;</code>: one offer, the live price from the catalog, one order button, an optional lead form and FAQ. Pages are <b>noindex</b> by default (ad traffic only) and stay invisible until you publish them. Tag your ad URLs with utm_source / utm_campaign to see results in <Link className="text-brand-600" href="/admin/leads">Leads</Link>.</>} />
      <Flash sp={sp} />
      {err && <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Could not read landing pages ({err}). The database patch 018-landing-pages runs on the next deploy.</p>}
      <form action={createLanding} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[220px] flex-1"><span className="field-label">Internal name</span><input name="name" className="input" placeholder="VPS UAE — Google Ads, November" maxLength={120} /></label>
        <label className="min-w-[220px]"><span className="field-label">Address</span><span className="flex items-center gap-1 text-sm text-slate-500">/lp/<input name="slug" className="input" placeholder="vps-uae" required pattern="[a-z0-9-]+" /></span></label>
        <button className="btn btn-primary">New landing page</button>
      </form>
      {!rows.length ? <Empty icon="file">No landing pages yet.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Page</th><th>Features</th><th>Price shown</th><th>Leads</th><th>Status</th><th>Updated</th><th /></tr></thead>
            <tbody>{rows.map((lp) => {
              const r = resolveTarget(cat, lp);
              return (
                <tr key={lp.id}>
                  <td><Link className="font-medium text-brand-600" href={`/admin/landing-pages/${lp.id}`}>{lp.name || lp.headline}</Link><span className="block font-mono text-xs text-slate-500">/lp/{lp.slug}</span></td>
                  <td className="text-xs">{r.kind === 'product' ? <>{r.label}<span className="block text-slate-500">{r.product.name}</span></> : r.kind === 'tld' ? `${r.tld} domains` : <span className="text-amber-700">{r.reason}</span>}</td>
                  <td className="text-xs">{r.kind !== 'none' && r.price ? `${r.price.amount} ${r.price.unit}` : <span className="text-amber-700">See price</span>}</td>
                  <td className="text-xs"><Link className="text-brand-600" href={`/admin/leads?source=landing:${lp.slug}&days=all`}>{leadsFor(lp.slug)}</Link></td>
                  <td><Badge tone={statusTone(lp.status)}>{lp.status === 'PUBLISHED' ? 'Live' : lp.status === 'DRAFT' ? 'Draft' : 'Archived'}</Badge>{lp.noindex && <span className="ml-1"><Badge tone="gray">noindex</Badge></span>}</td>
                  <td className="whitespace-nowrap text-xs">{fmtDate(lp.updatedAt)}</td>
                  <td className="whitespace-nowrap text-xs"><a className="text-brand-600" href={`/lp/${lp.slug}${lp.status === 'PUBLISHED' ? '' : '?preview=1'}`} target="_blank">{lp.status === 'PUBLISHED' ? 'Open' : 'Preview'}</a></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <Card title="Using them in ads" className="mt-6">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Final URL example: <code>https://globalhostia.com/lp/forex-vps?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign=forex-vps</code>. The first visit’s utm tags are kept for 30 days and saved with any lead.</li>
          <li>The order button opens the WHMCS order form in the visitor’s currency. Clicks are sent as <code>begin_checkout</code>, sign-ups as <code>generate_lead</code> to the trackers set in <Link className="text-brand-600" href="/admin/seo#tracking">Marketing &amp; SEO → Analytics</Link>.</li>
          <li>Prices are never typed here: they come from the synced catalog. If a plan has no price the page says “See price”.</li>
        </ul>
      </Card>
    </>
  );
}
