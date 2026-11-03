import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Card, Field, Badge, Stat, LinkBtn } from '@/components/ui';
import { getCatalog } from '@/lib/theme/data';
import { storeView } from '@/lib/store/view';
import { groupsSeen } from '@/lib/store/admin';
import { parseStoreConfig, mapEntries, faqToText, matchEntry, entryPath, HUB_PATH } from '@/lib/store/config';
import { TYPE_ATTRIBUTES, SPEC_LABEL } from '@/lib/render/specs';
import { money } from '@/lib/pricing';
import { saveShop, saveEntry, addEntry, removeEntry, saveBundle, deleteBundle, applyMapping } from './actions';

export const metadata = { title: 'Business services' };
export const dynamic = 'force-dynamic';

const ICONS = ['lock', 'shield', 'archive', 'mail', 'grid', 'layers', 'filter', 'pen', 'trend', 'chat', 'monitor', 'star', 'wp', 'pin', 'card', 'whatsapp', 'headset', 'store', 'box', 'globe', 'rocket', 'spark', 'cart', 'users', 'settings', 'bolt', 'award', 'code'];
const STATUS: Record<string, [string, string]> = { live: ['green', 'Plans live'], quote: ['blue', 'Request a quote'], soon: ['yellow', 'Coming soon · contact sales'] };
const ta = 'input code';

export default async function BusinessServices({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, 'business_services'));
  const cfg = parseStoreConfig(row?.value);
  const cat = await getCatalog();
  const view = storeView({ ...cat, settings: { ...cat.settings, business_services: row?.value } });
  const cats = await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  const groups = await groupsSeen();
  const mapping = mapEntries(cfg, cats, groups);
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const unmatched = groups.filter((g) => !mapping.some((m) => m.gid === g.gid) && !cats.some((c) => c.whmcsGroupId === g.gid && cfg.entries.some((e) => e.slug === c.slug)));
  const live = view.items.filter((i) => i.status === 'live').length;
  const visibleBundles = view.bundles.filter((b) => b.visible).length;
  const prefix = cat.currency === 'USD' ? '$' : `${cat.currency} `;
  const notIn = cats.filter((c) => !cfg.entries.some((e) => e.slug === c.slug) && !cfg.sections.some((s) => s.slug === c.slug));
  const secName = (slug: string) => { const c = bySlug.get(slug); return c ? c.name : slug; };

  return (
    <>
      <PageHeader title="Business services" desc={<>The shop at <a className="text-brand-600 hover:underline" href={HUB_PATH} target="_blank">{HUB_PATH}</a>: sections, categories mapped to WHMCS product groups, quote forms and bundles. Prices only come from WHMCS.</>}
        actions={<LinkBtn href={`${HUB_PATH}?preview=1`} target="_blank">{cfg.published ? 'View shop' : 'Preview shop'}</LinkBtn>} />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Shop" value={cfg.published ? 'Published' : 'Not published'} sub={cfg.published ? (view.live ? 'In the menu, footer and sitemap' : 'Nothing to show yet') : 'Only admins can preview it'} icon="globe" tone={cfg.published ? 'green' : 'amber'} />
        <Stat label="Categories" value={view.items.length} sub={`${live} with live plans · ${view.items.filter((i) => i.status === 'quote').length} by quote · ${view.items.filter((i) => i.status === 'soon').length} coming soon`} icon="folder" />
        <Stat label="WHMCS groups linked" value={`${mapping.filter((m) => m.gid != null).length} / ${cfg.entries.length}`} sub={`${unmatched.length} synced group${unmatched.length === 1 ? '' : 's'} not in the shop`} icon="plug" />
        <Stat label="Bundles shown" value={`${visibleBundles} / ${cfg.bundles.length}`} sub="Only complete bundles (every item priced) show" icon="box" />
      </div>

      <Card title="Owner checklist" className="mb-6">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li><b>Activate the services you want to sell in WHMCS</b> (this website never does it for you): WHMCS admin → <b>Configuration (wrench) → System Settings → MarketConnect</b>, sign in to MarketConnect, then <b>Activate</b> SSL Certificates, SiteLock, CodeGuard, Site Builder, Professional Email (OX App Suite), Marketgoo and/or SpamExperts.
            <span className="mt-1 block text-xs text-amber-700">Activation itself is free, but each sale is charged at wholesale from your MarketConnect balance, so fund the balance and set your retail prices in the activation dialog (or Manage → pricing) before you publish.</span></li>
          <li>Run a product sync: <Link className="text-brand-600" href="/admin/whmcs">Admin → WHMCS → Sync now</Link>. Products of groups whose name matches a shop category below are placed there automatically.</li>
          <li>Check <b>Categories &amp; WHMCS mapping</b> below. If a group was already synced into its own category, press <b>Apply mapping</b>; to override, type the WHMCS group ID on the category.</li>
          <li>For done-for-you services, create a <b>Sales</b> support department in WHMCS (Configuration → System Settings → Support Departments) or enter its ID under Shop settings. Quote requests are also saved in <Link className="text-brand-600" href="/admin/leads?source=quote:*">Leads</Link>. When you later create a WHMCS product for a service, put it in a group named like the category (or set the group ID) and it becomes orderable.</li>
          <li>Optional: native WHMCS bundles (Configuration → System Settings → Products/Services → Product Bundles) give one-click checkout and WHMCS&apos;s own discount; enter the bundle ID on the bundle below. Without one, the bundle shows the total of the live plan prices and a step-by-step order.</li>
          <li>Review the text of each category in <Link className="text-brand-600" href="/admin/categories">Categories</Link> (name, description, SEO), then switch on <b>Published</b> below.</li>
        </ol>
      </Card>

      <Card title="Shop settings" className="mb-6">
        <form action={saveShop} className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" name="published" defaultChecked={cfg.published} /> Published (hub, category pages, menu entry, sitemap and IndexNow)</label>
          <Field label="Page title"><input name="title" defaultValue={cfg.title} className="input" /></Field>
          <Field label="SEO title" hint="Shown in search results; the page title when empty"><input name="seoTitle" defaultValue={cfg.seoTitle} className="input" /></Field>
          <Field label="Intro" className="sm:col-span-2"><textarea name="lead" rows={2} defaultValue={cfg.lead} className="input" /></Field>
          <Field label="Meta description" className="sm:col-span-2" hint="140-160 characters; only state what the page shows"><textarea name="meta" rows={2} defaultValue={cfg.meta} className="input" /></Field>
          <Field label="Menu label"><input name="menuLabel" defaultValue={cfg.menuLabel} className="input" /></Field>
          <Field label="WHMCS sales department ID" hint="Empty = the first department named like “Sales”"><input name="salesDepartmentId" defaultValue={cfg.salesDepartmentId} className="input" inputMode="numeric" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="inNav" defaultChecked={cfg.inNav} /> Show in the main menu (Business tools) and the footer</label>
          <Field label="Hub FAQ" className="sm:col-span-2" hint='Blocks of "Q: question" and "A: answer", separated by a blank line'><textarea name="faq" rows={8} defaultValue={faqToText(cfg.faq)} className={ta} /></Field>
          <div className="sm:col-span-2"><button className="btn btn-primary">Save shop settings</button></div>
        </form>
      </Card>

      <Card title="Categories & WHMCS mapping" className="mb-6" actions={<form action={applyMapping}><button className="btn btn-secondary">Apply mapping</button></form>}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Section</th><th>Category</th><th>Kind</th><th>WHMCS group</th><th>Products</th><th>Public</th><th>Page</th></tr></thead>
            <tbody>
              {cfg.entries.map((e) => {
                const m = mapping.find((x) => x.slug === e.slug)!;
                const c = bySlug.get(e.slug);
                const it = view.items.find((i) => i.cat.slug === e.slug);
                const st = it ? STATUS[it.status] : null;
                return (
                  <tr key={e.slug}>
                    <td className="text-xs text-slate-500">{secName(e.section)}</td>
                    <td>{c ? <Link className="font-medium hover:text-brand-600" href={`/admin/categories/${c.id}`}>{c.name}</Link> : <span className="text-red-600">missing category “{e.slug}”</span>}
                      <span className="block font-mono text-[11px] text-slate-400">{e.slug}</span></td>
                    <td className="text-xs">{e.kind === 'service' ? 'Done-for-you (quote)' : 'WHMCS products'}</td>
                    <td className="text-xs">{m.gid != null ? <><Badge tone={m.matchedBy === 'gid' ? 'green' : 'blue'}>{m.matchedBy === 'gid' ? 'linked' : 'matches'}</Badge> gid {m.gid}{m.group ? <> · {m.group}</> : ''}{m.matchedBy === 'name' && <span className="block text-blue-700">Press Apply mapping to link it</span>}</> : <Badge tone="yellow">unmapped</Badge>}
                      {m.gid == null && <span className="block text-slate-400">looks for: {e.groups.join(', ') || e.slug}</span>}</td>
                    <td className="text-xs">{m.gid != null ? `${m.priced} priced / ${m.products}` : '—'}{it && it.priced.length > 0 && <span className="block text-slate-500">{it.priced.length} on the shop</span>}</td>
                    <td className="text-xs">{!c?.visible ? <Badge>category hidden</Badge> : e.hidden ? <Badge>hidden in shop</Badge> : st ? <Badge tone={st[0]}>{st[1]}</Badge> : <Badge>not shown</Badge>}</td>
                    <td className="text-xs">{it ? <a className="text-brand-600 hover:underline" href={`${it.href}${cfg.published ? '' : '?preview=1'}`} target="_blank">{it.href}</a> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {groups.length > 0 && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <b>WHMCS groups seen in the last sync:</b> {groups.map((g) => {
              const e = matchEntry(cfg, { slug: g.slug });
              return <span key={g.gid} className="mr-3 inline-block">gid {g.gid} <span className="font-mono">{g.slug || '(no store URL)'}</span> ({g.priced}/{g.products} priced){e ? <> → {e.slug}</> : ''}</span>;
            })}
          </div>
        )}
      </Card>

      <Card title="Edit shop categories" className="mb-6">
        <p className="mb-3 text-sm text-slate-500">Name, intro text and SEO fields are edited on the category itself (Admin → Categories). Here: section, card text, group names for WHMCS mapping, what&apos;s included, quote questions and FAQ.</p>
        <div className="space-y-2">
          {cfg.entries.map((e) => {
            const c = bySlug.get(e.slug);
            return (
              <details key={e.slug} id={`e-${e.slug}`} className="rounded-lg border border-slate-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{c?.name || e.slug} <span className="text-xs font-normal text-slate-400">· {secName(e.section)} · {e.kind === 'service' ? 'quote' : 'WHMCS'}{e.hidden ? ' · hidden' : ''}</span></summary>
                <form action={saveEntry} className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-3">
                  <input type="hidden" name="slug" value={e.slug} />
                  <Field label="Section"><select name="section" defaultValue={e.section} className="input">{cfg.sections.map((s) => <option key={s.slug} value={s.slug}>{secName(s.slug)}</option>)}</select></Field>
                  <Field label="Kind"><select name="kind" defaultValue={e.kind} className="input"><option value="whmcs">WHMCS products (coming soon until priced)</option><option value="service">Done-for-you service (quote until a product exists)</option></select></Field>
                  <Field label="Icon"><select name="icon" defaultValue={e.icon} className="input">{ICONS.map((i) => <option key={i}>{i}</option>)}</select></Field>
                  <Field label="WHMCS group ID" hint="Empty = automatic by group name"><input name="gid" defaultValue={c?.whmcsGroupId ?? ''} className="input" inputMode="numeric" /></Field>
                  <Field label="Sort order"><input name="order" type="number" defaultValue={e.order} className="input" /></Field>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="hidden" defaultChecked={e.hidden} /> Hide from the shop</label>
                  <Field label="Card text" className="sm:col-span-3"><input name="blurb" defaultValue={e.blurb} className="input" /></Field>
                  <Field label="WHMCS group names" hint="One per line, case-insensitive (e.g. SiteLock)"><textarea name="groups" rows={4} defaultValue={e.groups.join('\n')} className={ta} /></Field>
                  <Field label="What's included" hint="One per line, no prices"><textarea name="included" rows={4} defaultValue={e.included.join('\n')} className={ta} /></Field>
                  <Field label="Quote: package choices" hint="One per line (optional)"><textarea name="options" rows={4} defaultValue={e.options.join('\n')} className={ta} /></Field>
                  <Field label="Quote: extra questions" hint="Up to 4, one per line" className="sm:col-span-3"><textarea name="questions" rows={3} defaultValue={e.questions.join('\n')} className={ta} /></Field>
                  <Field label="FAQ" className="sm:col-span-3" hint='"Q: …" and "A: …" blocks separated by a blank line'><textarea name="faq" rows={6} defaultValue={faqToText(e.faq)} className={ta} /></Field>
                  <div className="flex gap-3 sm:col-span-3"><button className="btn btn-primary">Save</button>{c && <LinkBtn href={`/admin/categories/${c.id}`}>Edit name, intro &amp; SEO</LinkBtn>}</div>
                </form>
                <form action={removeEntry} className="border-t border-slate-100 px-4 py-2"><input type="hidden" name="slug" value={e.slug} /><button className="text-xs text-red-600 hover:underline">Remove from the shop (keeps the category)</button></form>
              </details>
            );
          })}
        </div>
        <form action={addEntry} className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-4">
          <Field label="Add a category to the shop"><select name="categoryId" className="input" defaultValue=""><option value="">Choose a category</option>{notIn.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>)}</select></Field>
          <Field label="Section"><select name="section" className="input">{cfg.sections.map((s) => <option key={s.slug} value={s.slug}>{secName(s.slug)}</option>)}</select></Field>
          <Field label="Kind"><select name="kind" className="input"><option value="whmcs">WHMCS products</option><option value="service">Done-for-you service</option></select></Field>
          <div className="self-end"><button className="btn btn-secondary w-full">Add</button></div>
          <p className="text-xs text-slate-500 sm:col-span-4">New categories: create them in <Link className="text-brand-600" href="/admin/categories/new">Categories</Link> first (a parent of one of the shop sections keeps the tree tidy), then add them here.</p>
        </form>
      </Card>

      <Card title="Bundles" className="mb-6">
        <div id="bundles" className="space-y-2">
          {view.bundles.map(({ bundle: b, total, visible, orderHref }) => (
            <details key={b.slug} className="rounded-lg border border-slate-200">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{b.name} <span className="ml-2">{visible ? <Badge tone="green">shown</Badge> : !b.published ? <Badge>unpublished</Badge> : <Badge tone="yellow">incomplete</Badge>}</span>
                <span className="ml-2 text-xs font-normal text-slate-500">{total.total != null ? `first year ${money(total.total, prefix)}` : `missing: ${total.missing.join(', ')}`}{orderHref ? ' · WHMCS bundle' : ''}</span></summary>
              <div className="border-t border-slate-100 p-4">
                {total.lines.length > 0 && <ul className="mb-3 text-xs text-slate-600">{total.lines.map((l) => <li key={l.ref}>{l.ref} → {l.name}: {money(l.amount, prefix)} ({l.basis})</li>)}</ul>}
                <BundleForm b={b} />
                <form action={deleteBundle} className="mt-2"><input type="hidden" name="slug" value={b.slug} /><button className="text-xs text-red-600 hover:underline">Delete bundle</button></form>
              </div>
            </details>
          ))}
        </div>
        <details className="mt-4 rounded-lg bg-slate-50"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">+ New bundle</summary><div className="p-4"><BundleForm /></div></details>
        <p className="mt-3 text-xs text-slate-500">Items: <code>p:&lt;product slug&gt;</code>, <code>cat:&lt;category slug&gt;</code> (its lowest-priced plan) or <code>tld:.ae</code> (domain registration). The total is the first-year sum of live prices; a saving is only shown when WHMCS reports a bundle discount, never estimated.</p>
      </Card>

      <Card title="Attributes for comparison tables">
        <p className="mb-2 text-sm text-slate-500">Add these keys to a product&apos;s Specifications (Admin → Products, one <code>key: value</code> per line). Comparison tables on shop pages are generated from them; common ones are also read from WHMCS feature lines automatically.</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(TYPE_ATTRIBUTES).map(([t, keys]) => <div key={t}><dt className="font-medium capitalize">{t}</dt><dd className="text-slate-600">{keys.map((k) => <span key={k} className="mr-3 inline-block"><code>{k}</code> <span className="text-xs text-slate-400">({SPEC_LABEL[k] || k})</span></span>)}</dd></div>)}</dl>
        <p className="mt-3 text-xs text-slate-500">Shop pages: {cfg.entries.map((e) => <a key={e.slug} className="mr-2 text-brand-600 hover:underline" href={entryPath(e.slug)} target="_blank">{e.slug}</a>)}</p>
      </Card>
    </>
  );
}

function BundleForm({ b }: { b?: { slug: string; name: string; summary: string; items: string[]; whmcsBundleId: number | null; published: boolean; order: number } }) {
  return (
    <form action={saveBundle} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="orig" value={b?.slug || ''} />
      <Field label="Name"><input name="name" defaultValue={b?.name} required className="input" /></Field>
      <Field label="Slug"><input name="slug" defaultValue={b?.slug} className="input" /></Field>
      <Field label="WHMCS bundle ID" hint="Optional: one-click order with WHMCS's own pricing"><input name="whmcsBundleId" defaultValue={b?.whmcsBundleId ?? ''} className="input" inputMode="numeric" /></Field>
      <Field label="Summary" className="sm:col-span-3"><input name="summary" defaultValue={b?.summary} className="input" /></Field>
      <Field label="Items" hint="One per line" className="sm:col-span-2"><textarea name="items" rows={4} defaultValue={(b?.items || []).join('\n')} className="input code" placeholder={'tld:.ae\ncat:hostia-shared\ncat:professional-email'} /></Field>
      <div className="space-y-3">
        <Field label="Sort order"><input name="order" type="number" defaultValue={b?.order ?? 0} className="input" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={b?.published ?? true} /> Show when complete</label>
      </div>
      <div className="sm:col-span-3"><button className="btn btn-primary">{b ? 'Save bundle' : 'Create bundle'}</button></div>
    </form>
  );
}
