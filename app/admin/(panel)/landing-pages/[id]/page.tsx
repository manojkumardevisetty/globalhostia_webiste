import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PageHeader, Card, Field, Flash, Badge, fmtDate, statusTone } from '@/components/ui';
import { getCatalog, pricedTlds } from '@/lib/theme/data';
import { resolveTarget } from '@/lib/theme/pages/landing';
import { faqText } from '@/lib/landing';
import { saveLanding, deleteLanding, publishLanding, unpublishLanding } from '../actions';
import Preview from './Preview';

export const metadata = { title: 'Edit landing page' };
export const dynamic = 'force-dynamic';

export default async function EditLanding({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireSession('content');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [lp] = await db.select().from(schema.landingPages).where(eq(schema.landingPages.id, id));
  if (!lp) notFound();
  const cat = await getCatalog();
  const r = resolveTarget(cat, lp);
  const live = lp.status === 'PUBLISHED';
  const cats = cat.categories.map((c) => ({ ...c, n: cat.products.filter((p) => p.categorySlug === c.slug).length })).filter((c) => c.n > 0 || `cat:${c.slug}` === lp.target);
  const tlds = pricedTlds(cat);
  const leadsN = await db.select({ id: schema.leads.id }).from(schema.leads).where(eq(schema.leads.source, `landing:${lp.slug}`)).then((x) => x.length).catch(() => 0);
  const warn: string[] = [];
  if (r.kind === 'none') warn.push(r.reason);
  if (r.kind !== 'none' && !r.price) warn.push('No synced price in the default currency: the page shows “See price”. Run a WHMCS sync or pick another plan.');

  return (
    <>
      <PageHeader title={lp.name || lp.headline} desc={<><span className="font-mono">/lp/{lp.slug}</span> · <Badge tone={statusTone(lp.status)}>{live ? 'Live' : 'Draft'}</Badge>{lp.noindex ? <> <Badge tone="gray">noindex</Badge></> : null} · updated {fmtDate(lp.updatedAt)} · <Link className="text-brand-600" href={`/admin/leads?source=landing:${lp.slug}&days=all`}>{leadsN} lead{leadsN === 1 ? '' : 's'}</Link></>}
        actions={<Link href="/admin/landing-pages" className="btn btn-ghost">All landing pages</Link>} />
      <Flash sp={sp} />
      {warn.map((w) => <p key={w} className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">{w}</p>)}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,580px)]">
        <form action={saveLanding} className="min-w-0 space-y-6">
          <input type="hidden" name="id" value={lp.id} />
          <Card title="Offer">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Internal name" hint="Only shown in the admin."><input name="name" defaultValue={lp.name} maxLength={120} className="input" /></Field>
              <Field label="Address" hint={live ? 'Changing it breaks ads that use the old address.' : 'Lowercase letters, numbers and dashes.'}><span className="flex items-center gap-1 text-sm text-slate-500">/lp/<input name="slug" defaultValue={lp.slug} required pattern="[a-z0-9-]+" maxLength={60} className="input font-mono" /></span></Field>
              <Field label="Headline (H1)" className="sm:col-span-2" hint="Match the ad’s promise; up to 110 characters."><input name="headline" defaultValue={lp.headline} required maxLength={110} className="input" /></Field>
              <Field label="Subheadline" className="sm:col-span-2"><textarea name="subheadline" defaultValue={lp.subheadline} rows={2} maxLength={260} className="input" /></Field>
              <Field label="Feature on this page" hint="The price and order link come from this catalog entry.">
                <select name="target" defaultValue={lp.target} className="input" required>
                  <optgroup label="Category (cheapest plan, or pin one below)">{cats.map((c) => <option key={c.slug} value={`cat:${c.slug}`}>{c.name} ({c.n} plan{c.n === 1 ? '' : 's'})</option>)}</optgroup>
                  <optgroup label="One plan">{cat.products.map((p) => <option key={p.slug} value={`p:${p.slug}`}>{p.name} · {cat.categories.find((c) => c.slug === p.categorySlug)?.name || 'no category'}</option>)}</optgroup>
                  <optgroup label="Domain extension">{tlds.map((t) => <option key={t.tld} value={`tld:${t.tld}`}>{t.tld}</option>)}</optgroup>
                  {!lp.target.match(/^(cat|p|tld):/) && <option value="">Choose…</option>}
                </select>
              </Field>
              <Field label="Pin a plan (category pages only)" hint="Leave on automatic to show the cheapest priced plan of the category.">
                <select name="productSlug" defaultValue={lp.productSlug} className="input">
                  <option value="">Cheapest plan automatically</option>
                  {cats.map((c) => <optgroup key={c.slug} label={c.name}>{cat.products.filter((p) => p.categorySlug === c.slug).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</optgroup>)}
                </select>
              </Field>
              <Field label="Button label"><input name="ctaLabel" defaultValue={lp.ctaLabel} required maxLength={40} className="input" placeholder="Order now" /></Field>
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                <b className="block text-slate-800">Shown now</b>
                {r.kind === 'product' ? <>{r.product.name}: {r.price ? `${r.price.amount} ${r.price.unit}` : 'See price'}<span className="block truncate font-mono text-[11px] text-slate-500">{r.orderHref}</span></>
                  : r.kind === 'tld' ? <>{r.tld}: {r.price ? `${r.price.amount} ${r.price.unit}` : 'See price'} · domain search to the WHMCS cart</> : r.reason}
              </div>
              <Field label="Benefits (one per line, up to 8)" className="sm:col-span-2" hint="The first four appear in the hero, the rest under “What is included”. Only promise what the plan really includes.">
                <textarea name="benefits" defaultValue={(lp.benefits || []).join('\n')} rows={6} className="input" />
              </Field>
            </div>
          </Card>
          <Card title="Sections">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="showLeadForm" defaultChecked={lp.showLeadForm} className="mt-0.5" /><span><b className="block text-slate-800">Lead form</b><span className="text-xs text-slate-500">“Not ready yet? Get the details by email”</span></span></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="showTrust" defaultChecked={lp.showTrust} className="mt-0.5" /><span><b className="block text-slate-800">Trust points</b><span className="text-xs text-slate-500">From Settings → Trust &amp; conversion</span></span></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={lp.noindex} className="mt-0.5" /><span><b className="block text-slate-800">Hide from search engines</b><span className="text-xs text-slate-500">Recommended for paid traffic</span></span></label>
            </div>
            <Field label="FAQ" className="mt-4" hint="Question on the first line, answer below it; leave an empty line between questions.">
              <textarea name="faq" defaultValue={faqText(lp.faq || [])} rows={9} className="input text-sm" />
            </Field>
          </Card>
          <Card title="Search & sharing (optional)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Page title" hint="Defaults to the headline."><input name="seoTitle" defaultValue={lp.seoTitle} maxLength={70} className="input" /></Field>
              <Field label="Meta description" hint="Defaults to the subheadline."><input name="seoDescription" defaultValue={lp.seoDescription} maxLength={170} className="input" /></Field>
            </div>
          </Card>
          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl bg-white/90 px-1 py-3 backdrop-blur">
            <button className="btn btn-primary">{live ? 'Save (stays live)' : 'Save draft'}</button>
            {live ? <button className="btn btn-secondary" formAction={unpublishLanding}>Unpublish</button> : <button className="btn btn-secondary" formAction={publishLanding}>Save &amp; publish</button>}
            <a className="btn btn-ghost" href={`/lp/${lp.slug}${live ? '' : '?preview=1'}`} target="_blank">Open page</a>
          </div>
        </form>
        <div className="min-w-0 space-y-6">
          <Preview src={`/lp/${lp.slug}?preview=1&v=${new Date(lp.updatedAt).getTime()}`} />
          <Card title="Delete">
            <form action={deleteLanding} className="flex items-center justify-between gap-3">
              <input type="hidden" name="id" value={lp.id} />
              <p className="text-sm text-slate-600">Removes the page. Ads pointing at it will show “offer no longer available”.</p>
              <button className="btn btn-secondary text-red-600">Delete</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
