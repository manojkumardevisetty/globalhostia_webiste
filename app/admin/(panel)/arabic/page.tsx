import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Flash, Card, Field, Badge } from '@/components/ui';
import { AR_DEFS, AR_SETTINGS_KEY, arPage, arPathOf, overrideKey } from '@/lib/i18n/ar-pages';
import { saveArabicPage, resetArabicPage } from './actions';

export const metadata = { title: 'Arabic pages' };
export const dynamic = 'force-dynamic';

/** Admin → Arabic pages: the copy of /ar and every /ar/<page> (settings.ar_pages). Prices, plans, TLDs and fees are
 *  added by the page from the billing system, so the copy never holds a price. */
export default async function ArabicPages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('content');
  const sp = await searchParams;
  const s = await getSettings();
  const ov = s[AR_SETTINGS_KEY];
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const pages = AR_DEFS.map((d) => ({ d: arPage(d, ov), key: overrideKey(d), edited: !!(ov && typeof ov === 'object' && ov[overrideKey(d)]) }));
  const cur = pages.find((p) => p.key === sp.p) || pages[0];
  const c = cur.d.copy;
  const len = (v: string, max: number, min = 0) => <span className={v.length > max || v.length < min ? 'text-red-600' : 'text-slate-400'}>{v.length} / {max}</span>;
  const ta = 'input min-h-[120px] font-normal leading-relaxed';
  return (
    <>
      <PageHeader title="Arabic pages" desc={<>The Arabic section of the website (<a className="text-brand-600 hover:underline" href={`${site}/ar`} target="_blank">/ar</a>) for UAE and GCC search. Each page is the Arabic version of an English page: the language switcher and hreflang link the two. Prices, plans and domain prices are added live from the billing system, so never type a price here. Header, footer and plan-card labels are translated automatically.</>} />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card title="Pages">
          <ul className="-mx-2 space-y-0.5 text-sm">
            {pages.map((p) => (
              <li key={p.key}>
                <a href={`/admin/arabic?p=${p.key}`} aria-current={p.key === cur.key} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${p.key === cur.key ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}>
                  <span dir="rtl" className="truncate">{p.d.copy.crumb}</span>
                  <span className="flex gap-1">{!p.d.copy.enabled && <Badge tone="gray">Off</Badge>}{p.edited && <Badge tone="blue">Edited</Badge>}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
        <div className="min-w-0 space-y-6">
          <Card title={<span>{arPathOf(cur.d)} <span className="font-normal text-slate-500">↔ English {cur.d.en}</span></span>}
            actions={<a className="btn btn-secondary h-9" href={`${site}${arPathOf(cur.d)}`} target="_blank">View page</a>}>
            <form action={saveArabicPage} className="grid gap-4 sm:grid-cols-2" dir="rtl">
              <input type="hidden" name="page" value={cur.key} />
              <label className="inline-flex items-center gap-2 text-sm font-medium sm:col-span-2" dir="ltr"><input type="checkbox" name="enabled" defaultChecked={c.enabled} /> Page is live (off: 404, removed from the sitemap, hreflang and the language switcher)</label>
              <Field label="Heading (H1)" className="sm:col-span-2"><input className="input" name="title" defaultValue={c.title} maxLength={120} /></Field>
              <Field label="SEO title" hint={<>{len(c.seoTitle, 60)} · &quot;| GlobalHostia&quot; is added when it fits.</>}><input className="input" name="seoTitle" defaultValue={c.seoTitle} maxLength={70} /></Field>
              <Field label="Breadcrumb / menu label"><input className="input" name="crumb" defaultValue={c.crumb} maxLength={60} /></Field>
              <Field label="Meta description" className="sm:col-span-2" hint={len(c.meta, 160, 110)}><textarea className={ta} name="meta" defaultValue={c.meta} maxLength={170} /></Field>
              <Field label="Kicker (small line above the heading)"><input className="input" name="kicker" defaultValue={c.kicker} maxLength={80} /></Field>
              <Field label="Target searches (comma separated)" hint="Shown in llms.txt and the page's WebPage keywords."><input className="input" name="keywords" defaultValue={c.keywords.join('، ')} /></Field>
              <Field label="Intro paragraph" className="sm:col-span-2"><textarea className={ta} name="lead" defaultValue={c.lead} maxLength={500} /></Field>
              <Field label="Points section heading" className="sm:col-span-2"><input className="input" name="pointsTitle" defaultValue={c.pointsTitle} maxLength={120} /></Field>
              <Field label="Points: one per line, icon | heading | text" className="sm:col-span-2" hint="Icons: globe, server, cpu, lock, mail, shield, coin, users, move, key, bolt, archive, headset, pin, search, tag, transfer, pen, check, award, layers, filter, card, ticket, bot, win, wp.">
                <textarea className={`${ta} min-h-[180px]`} name="points" defaultValue={c.points.map((p) => `${p.icon} | ${p.h} | ${p.p}`).join('\n')} />
              </Field>
              <Field label="FAQ heading" className="sm:col-span-2"><input className="input" name="faqTitle" defaultValue={c.faqTitle} maxLength={120} /></Field>
              <Field label="FAQs: one per line, question || answer" className="sm:col-span-2" hint="Also published as FAQPage structured data. Price questions are added automatically with live prices.">
                <textarea className={`${ta} min-h-[200px]`} name="faqs" defaultValue={c.faqs.map((f) => `${f.q} || ${f.a}`).join('\n')} />
              </Field>
              <Field label="Call-to-action heading"><input className="input" name="ctaTitle" defaultValue={c.ctaTitle} maxLength={120} /></Field>
              <Field label="Call-to-action text"><input className="input" name="ctaText" defaultValue={c.ctaText} maxLength={300} /></Field>
              <div className="flex flex-wrap gap-3 sm:col-span-2" dir="ltr"><button className="btn btn-primary h-10">Save page</button></div>
            </form>
          </Card>
          {cur.edited && (
            <form action={resetArabicPage}><input type="hidden" name="page" value={cur.key} /><button className="btn btn-secondary h-10">Restore the default copy for this page</button></form>
          )}
        </div>
      </div>
    </>
  );
}
