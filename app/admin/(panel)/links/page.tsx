import { asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, Card, Field, Badge, Stat } from '@/components/ui';
import { getCatalog, pricedTlds, categoryProducts } from '@/lib/theme/data';
import { getMenu, footerColumns, defaultMenu } from '@/lib/theme/menu';
import { siteLinks, FAMILY_IDS, TYPE, TYPE_LABEL, TYPE_PAGE, inferFamily, CLAIMED, categoryHref, FOOTER_EXTRA_DEFAULTS, FINDER_FAMILIES } from '@/lib/theme/sitelinks';
import { TLD_INFO, LOCS, USE_CASES, locationGroups, typeLocPages, tldPageList, useCasePages, categoryPages, pseoPaths, TLD_EXISTING, tldHref } from '@/lib/theme/pseo';
import { offerProduct } from '@/lib/theme/offers';
import { saveSiteLinks } from './actions';

export const metadata = { title: 'Site links' };
export const dynamic = 'force-dynamic';

const Src = ({ k, children }: { k: 'catalog' | 'setting' | 'editorial' | 'auto'; children?: React.ReactNode }) => (
  <Badge tone={k === 'catalog' ? 'green' : k === 'auto' ? 'blue' : k === 'setting' ? 'yellow' : 'gray'}>{children || (k === 'catalog' ? 'Catalog' : k === 'auto' ? 'Auto from catalog' : k === 'setting' ? 'Setting' : 'Editorial default')}</Badge>
);
const A = ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href} target={href.startsWith('/admin') ? undefined : '_blank'} className="text-brand-600 hover:underline">{children}</a>;

export default async function SiteLinks({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const cat = await getCatalog();
  const cfg = siteLinks(cat.settings);
  const allCats = await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
  const catId = new Map(allCats.map((c) => [c.slug, c.id]));
  const menuOverride = (() => { const r = cat.settings.theme_menu; return typeof r === 'string' ? r.trim() : r ? JSON.stringify(r, null, 2) : ''; })();
  const menus = getMenu(cat);
  const menuSrc = menuOverride ? 'setting' : 'editorial';
  const footer = footerColumns(menus, cfg.footerExtra);
  const menuCols = new Set(menus.map((m) => m.label));
  const groups = locationGroups(cat);
  const tl = typeLocPages(cat, groups);
  const tlds = tldPageList(cat);
  const uses = useCasePages(cat);
  const cps = categoryPages(cat);
  const paths = pseoPaths(cat);
  const finder = cat.products.filter((p) => FINDER_FAMILIES.includes(p.type));
  const ssl = offerProduct(cat, 'ssl', cfg.offers.ssl), hosting = offerProduct(cat, 'shared', cfg.offers.hosting);
  const autoItems = menus.flatMap((m) => m.groups.flatMap((g) => g.items)).filter((i) => i.auto);
  const priced = pricedTlds(cat);
  const footerText = (cfg.footerExtra || []).map((c) => [`## ${c.title}`, ...c.links.map((l) => `${l.label} | ${l.href}`)].join('\n')).join('\n\n');
  const tldText = Object.entries(cfg.tldBlurbs).map(([t, b]) => [t, b.forWho || '', (b.facts || []).join('; '), (b.related || []).join(', ')].join(' | ').replace(/( \| )+$/, '')).join('\n');
  const locText = Object.entries(cfg.locations).map(([k, l]) => [k, l.note || '', (l.near || []).join(', '), l.name || ''].join(' | ').replace(/( \| )+$/, '')).join('\n');

  return (
    <>
      <PageHeader title="Site links" desc="Where every menu link, footer link and generated page comes from. Products, categories and TLDs flow in automatically; the editorial text below is optional." />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Menu links" value={menus.reduce((n, m) => n + m.groups.reduce((k, g) => k + g.items.length, 0), 0)} sub={`${autoItems.length} added from categories`} icon="layout" />
        <Stat label="Footer links" value={footer.reduce((n, c) => n + c.links.length, 0)} sub={`${footer.length} columns`} icon="file" />
        <Stat label="Generated pages" value={paths.length} sub="in the sitemap" icon="globe" />
        <Stat label="Plan finder pool" value={finder.length} sub="published plans scored" icon="box" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Mega menu and mobile drawer" actions={<Src k={menuSrc} />}>
          <p className="mb-3 text-xs text-slate-500">Links to hidden categories drop out. Categories without a hand-written page are added to the menu of their family (<Badge tone="blue">Auto from catalog</Badge>), in category order. {menuOverride ? 'A custom menu (below) replaces the default links.' : 'Default links are editorial; replace them with the menu override below.'}</p>
          <div className="space-y-4">{menus.map((m) => (
            <div key={m.id}><div className="mb-1 text-sm font-semibold">{m.label}</div>
              <table className="table text-xs"><tbody>{m.groups.flatMap((g) => g.items.map((i) => (
                <tr key={g.title + i.label}><td className="w-1/3">{i.label}<div className="text-slate-400">{g.title}</div></td><td><A href={i.href}>{i.href.replace(/^https?:\/\/[^/]+/, '')}</A></td>
                  <td>{i.auto ? <Src k="auto" /> : i.cats?.length ? <Src k="catalog">Catalog: {i.cats.join(', ')}</Src> : <Src k={menuSrc} />}</td>
                  <td>{i.auto && catId.get(i.auto) ? <A href={`/admin/categories/${catId.get(i.auto)}`}>Edit</A> : i.cats?.[0] && catId.get(i.cats[0]) ? <A href={`/admin/categories/${catId.get(i.cats[0])}`}>Edit</A> : <A href="#menu-override">Edit</A>}</td></tr>)))}</tbody></table>
              {m.featured && <div className="mt-1 text-xs text-slate-400">Featured panel: “{m.featured.title}” {m.featured.big ? `with live price ${m.featured.big.amount}` : ''} <Src k="catalog">Live price</Src></div>}
            </div>))}</div>
        </Card>

        <div className="space-y-6">
          <Card title="Footer">
            <table className="table text-xs"><tbody>{footer.map((c) => (
              <tr key={c.title}><td className="w-1/4 font-semibold">{c.title}</td><td>{c.links.map((l) => l.label).join(' · ')}</td>
                <td>{menuCols.has(c.title) || /domain/i.test(c.title) ? <Src k={menuSrc}>Same as menu</Src> : cfg.footerExtra ? <Src k="setting" /> : <Src k="editorial" />}</td></tr>))}</tbody></table>
          </Card>

          <Card title="Generated pages">
            <table className="table text-xs"><tbody>
              <tr><td className="font-semibold">Category pages</td><td>{cps.length ? cps.map((c) => <span key={c.slug} className="mr-2"><A href={`/category/${c.slug}`}>/category/{c.slug}</A></span>) : 'None: every category with products has a hand-written page'}</td><td><Src k="catalog">Categories without a page</Src></td></tr>
              <tr><td className="font-semibold">Locations</td><td>{groups.map((g) => <span key={g.loc.slug} className="mr-2"><A href={`/locations/${g.loc.slug}`}>{g.loc.name}</A> ({g.products.length})</span>)}</td><td><Src k="catalog">Product location</Src></td></tr>
              <tr><td className="font-semibold">Type × location</td><td>{tl.length ? tl.map((x) => <span key={x.prefix + x.loc.slug} className="mr-2"><A href={`/${x.prefix}/${x.loc.slug}`}>/{x.prefix}/{x.loc.slug}</A></span>) : '—'}</td><td><Src k="catalog">2+ plans of a type</Src></td></tr>
              <tr><td className="font-semibold">Domain pages</td><td>{tlds.length} extensions with a price · <A href="/domains/all">/domains/all</A>{Object.keys(TLD_EXISTING).length ? <> · {Object.keys(TLD_EXISTING).map((t) => <span key={t}> {t} → {tldHref(t)}</span>)}</> : null}</td><td><Src k="catalog">Priced TLDs</Src> <A href="/admin/domains">Edit</A></td></tr>
              <tr><td className="font-semibold">Use cases</td><td>{uses.map((x) => <span key={x.u.slug} className="mr-2"><A href={`/hosting-for/${x.u.slug}`}>{x.u.name}</A> ({x.picks.length})</span>)}</td><td><Src k="catalog">Shown when plans fit</Src></td></tr>
              <tr><td className="font-semibold">Plan finder</td><td>{FINDER_FAMILIES.map((f) => `${TYPE_LABEL[f]}: ${finder.filter((p) => p.type === f).length}`).join(' · ')}</td><td><Src k="catalog">Category family</Src></td></tr>
              <tr><td className="font-semibold">Compare &amp; guides picks</td><td>Cheapest plan of each family page (web hosting, VPS, dedicated…), including new categories of that family</td><td><Src k="catalog" /></td></tr>
              <tr><td className="font-semibold">llms.txt, MCP, feeds</td><td>{cat.categories.filter((c) => cat.products.some((p) => p.categorySlug === c.slug)).length} categories, {cat.products.length} products, {groups.length} locations, {priced.length} TLD prices · <A href="/llms.txt">llms.txt</A> · <A href="/feeds/products.json">feed</A></td><td><Src k="catalog" /></td></tr>
              <tr><td className="font-semibold">Cart offers (client area)</td><td>SSL: {ssl ? `${ssl.name} (pid ${ssl.whmcsPid})` : 'none'} · Hosting: {hosting ? `${hosting.name} (pid ${hosting.whmcsPid})` : 'none'}</td><td>{cfg.offers.ssl || cfg.offers.hosting ? <Src k="setting" /> : <Src k="auto">Cheapest plan</Src>}</td></tr>
            </tbody></table>
            <p className="mt-2 text-xs text-slate-400">Pages with no products are not generated and are left out of the sitemap. Every save in admin (products, categories, TLDs, this page) refreshes the site within a minute.</p>
          </Card>
        </div>
      </div>

      <form action={saveSiteLinks} className="mt-6 space-y-6">
        <Card title="Category families" actions={<button className="btn btn-primary">Save site links</button>}>
          <p className="mb-3 text-xs text-slate-500">The family decides which menu, family pages (web hosting, VPS…), plan finder, location and use-case pages a category&apos;s products appear on. New categories get a family from their name; choose <b>Other</b> to keep one on its own page only.</p>
          <div className="overflow-x-auto"><table className="table text-sm"><thead><tr><th>Category</th><th>Plans</th><th>Page</th><th>Family</th></tr></thead><tbody>{allCats.map((c) => {
            const n = c.visible ? categoryProducts(cat, c.slug).length : 0;
            const guess = TYPE[c.slug] || inferFamily(c.slug, c.name);
            return (
              <tr key={c.id}><td><A href={`/admin/categories/${c.id}`}>{c.name}</A><div className="text-xs text-slate-400">{c.slug}{!c.visible && ' · hidden'}</div></td><td>{n}</td>
                <td className="text-xs">{c.visible && n ? <A href={categoryHref(c.slug)}>{categoryHref(c.slug)}</A> : '—'} {CLAIMED.has(c.slug) ? <Badge>hand-written</Badge> : n ? <Badge tone="blue">generated</Badge> : null}</td>
                <td><select name={`type_${c.slug}`} defaultValue={cfg.categoryTypes[c.slug] || ''} className="input w-48"><option value="">Automatic ({TYPE_LABEL[guess]})</option>{FAMILY_IDS.map((f) => <option key={f} value={f}>{TYPE_LABEL[f]}</option>)}</select></td></tr>);
          })}</tbody></table></div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Menu and cart offers">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="autoMenu" defaultChecked={cfg.autoMenu} /> Add new categories to the menu and footer automatically</label>
              <Field label="SSL offered in the cart" hint="Shown when hosting is in the cart without SSL. Automatic = cheapest SSL plan."><select name="offer_ssl" defaultValue={cfg.offers.ssl} className="input"><option value="">Automatic{ssl && !cfg.offers.ssl ? ` (${ssl.name})` : ''}</option>{cat.products.filter((p) => p.type === 'ssl' && p.whmcsPid).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></Field>
              <Field label="Hosting offered with a domain" hint="Shown when a domain is in the cart without hosting. Automatic = cheapest web hosting plan."><select name="offer_hosting" defaultValue={cfg.offers.hosting} className="input"><option value="">Automatic{hosting && !cfg.offers.hosting ? ` (${hosting.name})` : ''}</option>{cat.products.filter((p) => ['shared', 'wp'].includes(p.type) && p.whmcsPid).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></Field>
            </div>
          </Card>
          <Card title="Footer columns">
            <Field label="Extra columns after the menu columns" hint={<>One <code>## Column title</code> line per column, then <code>Label | /path</code> lines. Leave empty for the defaults: {FOOTER_EXTRA_DEFAULTS.map((c) => c.title).join(', ')}.</>}>
              <textarea name="footerExtra" defaultValue={footerText} rows={10} className="input font-mono text-xs" placeholder={FOOTER_EXTRA_DEFAULTS.map((c) => [`## ${c.title}`, ...c.links.map((l) => `${l.label} | ${l.href}`)].join('\n')).join('\n\n')} />
            </Field>
          </Card>
        </div>

        <Card title="Domain extension text">
          <Field label="Your own text per extension (optional)" hint={<>One line per extension: <code>.shop | Who it suits | fact one; fact two | .store, .online</code>. Extensions without a line use the built-in text ({Object.keys(TLD_INFO).length} popular ones) or a generic description. Pages are created for every extension with a price ({tlds.length} today).</>}>
            <textarea name="tldBlurbs" defaultValue={tldText} rows={5} className="input font-mono text-xs" placeholder=".shop | Online shops and marketplaces. | Launched in 2016.; Open to anyone. | .store, .online" />
          </Field>
          <p className="mt-2 text-xs text-slate-400">Priced extensions without any text yet: {tlds.filter((t) => !TLD_INFO[t] && !cfg.tldBlurbs[t]).join(', ') || 'none'}.</p>
        </Card>

        <Card title="Use-case pages">
          <p className="mb-3 text-xs text-slate-500">Each page recommends real plans picked by rules in code. A page only exists while at least one plan fits. Leave a field empty to keep the default text.</p>
          <div className="space-y-4">{USE_CASES.map((u) => { const e = cfg.useCases[u.slug] || {}; const live = uses.find((x) => x.u.slug === u.slug); return (
            <div key={u.slug} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between text-sm"><b>/hosting-for/{u.slug}</b><span className="flex items-center gap-3">{live ? <Badge tone="green">{live.picks.length} plans</Badge> : <Badge>no fitting plans</Badge>}<label className="flex items-center gap-1 text-xs"><input type="checkbox" name={`uc_hidden_${u.slug}`} defaultChecked={!!e.hidden} /> Hide</label></span></div>
              <div className="grid gap-2 md:grid-cols-2">
                <input name={`uc_name_${u.slug}`} defaultValue={e.name || ''} placeholder={`Name: ${u.name}`} className="input text-xs" />
                <input name={`uc_h1_${u.slug}`} defaultValue={e.h1 || ''} placeholder={`Heading: ${u.h1}`} className="input text-xs" />
                <textarea name={`uc_lead_${u.slug}`} defaultValue={e.lead || ''} placeholder={u.lead} rows={2} className="input text-xs" />
                <textarea name={`uc_meta_${u.slug}`} defaultValue={e.meta || ''} placeholder={u.meta} rows={2} className="input text-xs" />
              </div>
            </div>); })}</div>
        </Card>

        <Card title="Location notes">
          <Field label="Your own text per location (optional)" hint={<>One line per location: <code>slug | note | audience one, audience two | Display name</code>. Locations come from the products&apos; location; {LOCS.length} common ones have built-in notes, others get a plain page.</>}>
            <textarea name="locations" defaultValue={locText} rows={4} className="input font-mono text-xs" placeholder="germany | Frankfurt is one of Europe's busiest network hubs. | Germany, Central Europe" />
          </Field>
          <p className="mt-2 text-xs text-slate-400">Locations in the catalog: {groups.map((g) => `${g.loc.slug}${LOCS.some((l) => l.slug === g.loc.slug) ? '' : ' (no built-in note)'}`).join(', ') || 'none'}.</p>
        </Card>

        <Card title="Menu override (advanced)">
          <div id="menu-override" />
          <Field label="Replace the default menu links (JSON)" hint={<>Empty = default menu. Same shape as the default: <code>[{'{'} &quot;id&quot;: &quot;hosting&quot;, &quot;label&quot;: &quot;Hosting&quot;, &quot;groups&quot;: [{'{'} &quot;title&quot;, &quot;items&quot;: [{'{'} &quot;label&quot;, &quot;href&quot;, &quot;icon&quot;, &quot;desc&quot;, &quot;cats&quot; {'}'}] {'}'}] {'}'}]</code>. Price panels and new categories are still added automatically. Family pages: {Object.entries(TYPE_PAGE).map(([k, v]) => `${TYPE_LABEL[k]} ${v}`).join(', ')}.</>}>
            <textarea name="theme_menu" defaultValue={menuOverride} rows={8} className="input font-mono text-xs" placeholder={JSON.stringify(defaultMenu(cat).slice(0, 1), null, 1).slice(0, 600)} />
          </Field>
        </Card>
        <div className="flex justify-end"><button className="btn btn-primary">Save site links</button></div>
      </form>
    </>
  );
}
