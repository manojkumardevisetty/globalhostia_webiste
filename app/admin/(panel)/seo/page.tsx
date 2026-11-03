import Link from 'next/link';
import { asc, desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Field, Flash, Badge } from '@/components/ui';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { getSettings } from '@/lib/settings';
import { VERIFICATION_KEYS, INDEXNOW_KEY, verificationToken, siteUrl } from '@/lib/seo';
import { saveRedirect, deleteRedirect, bulkSeo, saveSearchEngines, notifySearchEngines, saveTracking } from './actions';
import { TRACKING_FIELDS, normTracking, anyTracker } from '@/lib/tracking';
import { indexNowLog } from '@/lib/indexnow';

export const metadata = { title: 'Marketing & SEO' };

export default async function Seo({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [settings, pages, redirects, inLog] = await Promise.all([
    getSettings(),
    db.select().from(schema.pages).orderBy(asc(schema.pages.slug)),
    db.select().from(schema.redirects).orderBy(desc(schema.redirects.createdAt)),
    indexNowLog(),
  ]);
  let promos: any[] = [], promoErr = '';
  if (whmcsConfigured()) { try { promos = (await whmcs('GetPromotions')).promotions?.promotion ?? []; } catch (e: any) { promoErr = e.message; } }
  const tracking = normTracking(settings.tracking);
  const issues = (p:(typeof pages)[0]) => [!p.seoTitle && 'no title', p.seoTitle.length > 65 && 'title long', !p.seoDescription && 'no description', p.seoDescription.length > 170 && 'description long'].filter(Boolean) as string[];

  return (
    <>
      <PageHeader title="Marketing & SEO" desc="Search metadata for every page, URL redirects, and WHMCS promotions/coupons."
        actions={<Link href="/admin/seo/content" className="btn btn-primary">Content engine: AI article calendar →</Link>} />
      <Flash sp={sp} />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <form action={saveSearchEngines}>
            <Card title="Search engine verification & profiles" actions={<button className="btn btn-primary">Save</button>}>
              <div className="grid gap-4">
                {VERIFICATION_KEYS.map((v) => (
                  <Field key={v.key} label={v.label} hint={<>Paste the token or the whole <code>&lt;meta name=&quot;{v.meta}&quot;…&gt;</code> tag. Leave empty to omit.</>}>
                    <input name={v.key} defaultValue={verificationToken(settings[v.key])} className="input code" placeholder="verification token" />
                  </Field>
                ))}
                <Field label="Official profile links" hint="One https:// URL per line (LinkedIn, X, Facebook, YouTube…). Used as sameAs in the Organization structured data.">
                  <textarea name="social_links" rows={3} className="input code" defaultValue={(Array.isArray(settings.social_links) ? settings.social_links : []).join('\n')} />
                </Field>
              </div>
            </Card>
          </form>
          <Card title="Notify search engines (IndexNow)" actions={<form action={notifySearchEngines}><button className="btn btn-primary">Submit now</button></form>}>
            <div className="space-y-2 text-sm text-slate-600">
              <p>Every URL in the <a className="text-brand-600" href="/sitemap.xml" target="_blank">sitemap</a> is sent to IndexNow (shared with Bing, Yandex, Seznam, Naver and others) automatically: once after every deployment, daily for pages whose content changed, and whenever a page, product, blog post or landing page is published or saved. <b>Submit now</b> sends the whole sitemap again.</p>
              <p className="text-xs">Key file: <a className="font-mono text-brand-600" href={`/${INDEXNOW_KEY}.txt`} target="_blank">{siteUrl(settings)}/{INDEXNOW_KEY}.txt</a></p>
              {inLog.length ? (
                <div className="overflow-x-auto"><table className="table text-xs"><thead><tr><th>When (Dubai)</th><th>Trigger</th><th>URLs</th><th>Result</th></tr></thead><tbody>
                  {inLog.slice(0, 12).map((l, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap">{new Date(l.at).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}</td>
                      <td>{l.trigger}</td>
                      <td>{l.submitted}</td>
                      <td>{l.status ? <Badge tone={l.ok ? 'green' : 'red'}>{`HTTP ${l.status}`}</Badge> : null} {l.message}</td>
                    </tr>
                  ))}
                </tbody></table></div>
              ) : <p className="text-xs">No submissions yet. The first one runs automatically after the next deployment.</p>}
              <p className="text-xs text-slate-400">Google does not use IndexNow: it reads the sitemap from the Sitemap: line in robots.txt. Submit the sitemap once in Google Search Console.</p>
            </div>
          </Card>
        </div>
        <form action={saveTracking} id="tracking">
          <Card title={<span className="flex items-center gap-2">Analytics &amp; conversion tracking {anyTracker(tracking) ? <Badge tone="green">active</Badge> : <Badge tone="gray">none configured</Badge>}</span>} actions={<button className="btn btn-primary">Save tracking</button>}>
            <p className="mb-4 max-w-3xl text-sm text-slate-600">
              Paste only the IDs; the website adds the official tags itself. Only filled-in trackers load. Visitors see a cookie banner (accept / reject) as soon as one ID is set:
              Google tags start with Consent Mode v2 set to <i>denied</i> and switch on when the visitor accepts; Meta, TikTok and Clarity load only after they accept.
              Events sent: <code>view_item</code>, <code>begin_checkout</code>, <code>add_to_cart</code>, <code>generate_lead</code>, <code>plan_finder_complete</code>, <code>whatsapp_click</code>, <code>currency_change</code>.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {TRACKING_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <input name={f.key} defaultValue={tracking[f.key]} className="input code" placeholder={f.placeholder} autoComplete="off" spellCheck={false} />
                </Field>
              ))}
              <Field label="Count a Google Ads conversion on" hint="Leads (sign-up forms) is the safest: orders are completed in WHMCS, so a click on Order is only an intention.">
                <select name="adsEvent" defaultValue={tracking.adsEvent} className="input">
                  <option value="generate_lead">Lead form submitted (generate_lead)</option>
                  <option value="begin_checkout">Order button clicked (begin_checkout)</option>
                  <option value="add_to_cart">Domain added to cart (add_to_cart)</option>
                </select>
              </Field>
            </div>
            <p className="mt-3 text-xs text-slate-500">Check it works: open the website with <code>?gh_debug=1</code> and watch the browser console, or use GA4 DebugView / Tag Assistant.</p>
          </Card>
        </form>
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
