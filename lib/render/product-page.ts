// Product detail page: /p/<slug>, rendered inside the real site header/footer.
import 'server-only';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { cachedRead } from '../lkg';
import { getSettings } from '../settings';
import { shell, siteVars } from './page';
import { renderProducts, cycles, orderUrl, type RProduct } from './products';
import { deriveSpecs, SPEC_LABEL } from './specs';
import { esc } from './util';
import { ogImageUrl, siteUrl } from '../seo';
import { money, CYCLE_LABEL } from '../pricing';

const CHECK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.2 3L15 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** /p/<slug> HTML (published products: cached 6h, tag `site`, snapshot-backed via lib/lkg.ts; previews read live). */
export async function renderProductPage(slug: string, preview: boolean) {
  return preview ? buildProductPage(slug, true) : cachedProductPage(slug);
}
export const cachedProductPage = cachedRead('product-page', (slug: string) => buildProductPage(slug, false));

async function buildProductPage(slug: string, preview: boolean): Promise<string | null> {
  const [p] = await db.select().from(schema.products).where(eq(schema.products.slug, slug)).limit(1);
  if (!p || (!preview && (p.status !== 'PUBLISHED' || p.whmcsRetired))) return null;
  const s = await getSettings();
  const { base, vars } = siteVars(s);
  const cur = s.currency || 'USD';
  const [cat] = p.categoryId ? await db.select().from(schema.categories).where(eq(schema.categories.id, p.categoryId)) : [];
  const prices = await db.select().from(schema.productPrices).where(eq(schema.productPrices.productId, p.id));
  const rp: RProduct = { ...p, features: p.features || [], attributes: p.attributes || {}, prices };

  // page that lists this category (for breadcrumb / back link)
  const [listing] = cat ? await db.select({ slug: schema.pages.slug, title: schema.pages.title }).from(schema.sections).innerJoin(schema.pages, eq(schema.pages.id, schema.sections.pageId))
    .where(and(eq(schema.sections.type, 'products'), eq(schema.sections.visible, true), eq(schema.pages.status, 'PUBLISHED'), sql`(${schema.sections.data}->'categories' ? ${cat.slug} or ${schema.sections.data}->>'category' = ${cat.slug})`)).limit(1) : [];

  // shell: use the light header of the Contact page (works on pages without a dark hero)
  const [tpl] = await db.select().from(schema.pages).where(inArray(schema.pages.slug, ['contact', 'index'])).orderBy(sql`case when slug = 'contact' then 0 else 1 end`).limit(1);
  const keys = [tpl.headBlock, tpl.bodyStartBlock, tpl.headerBlock, tpl.footerBlock, tpl.bodyEndBlock];
  const blocks = Object.fromEntries((await db.select().from(schema.blocks).where(inArray(schema.blocks.key, keys))).map((b) => [b.key, b.html]));

  const cs = cycles(rp, cur);
  const monthly = cs.find((c) => c.cycle === 'monthly');
  const best = cs.length ? cs.reduce((a, b) => (b.perMonth < a.perMonth ? b : a)) : null;
  const def = monthly || cs[0];
  const specs = Object.entries(deriveSpecs(rp.features, rp.attributes)).filter(([k]) => SPEC_LABEL[k]);
  const feats = rp.features;

  const buy = cs.length ? `<aside class="gh-buy" aria-labelledby="gh-buy-h">
    <h2 id="gh-buy-h">Choose your billing period</h2>
    <form>${cs.map((c) => {
      const save = monthly && c.cycle !== 'monthly' && c.perMonth < monthly.price ? Math.round((1 - c.perMonth / monthly.price) * 100) : 0;
      return `<label class="gh-opt"><span><b>${esc(CYCLE_LABEL[c.cycle] || c.cycle)}</b><small>${c.cycle === 'free' ? 'Free' : money(c.price, c.prefix)}${c.cycle !== 'monthly' && c.perMonth !== c.price ? ` · ${money(c.perMonth, c.prefix)}/mo` : ''}${c.setup > 0 ? ` · + ${money(c.setup, c.prefix)} setup` : ''}</small></span>
        <span>${save > 0 ? `<em>Save ${save}%</em> ` : ''}<input type="radio" name="cycle" value="${esc(orderUrl(rp, base, c.cycle))}"${c === def ? ' checked' : ''} aria-label="${esc(CYCLE_LABEL[c.cycle] || c.cycle)}"></span></label>`;
    }).join('')}</form>
    <a id="gh-buy-btn" class="gh-btn gh-btn-solid" href="${esc(orderUrl(rp, base, def?.cycle))}">${esc(s.order_button_label || 'Order Now')}</a>
    <p class="gh-note" style="text-align:center">Secure checkout in our client area. ${best && best.cycle !== 'monthly' && monthly ? `Best value: ${esc(CYCLE_LABEL[best.cycle])}.` : ''}</p>
  </aside>` : `<aside class="gh-buy"><h2>Pricing</h2><p class="gh-note">Contact our sales team for a quote.</p><a class="gh-btn gh-btn-solid" href="/contact">Contact sales</a></aside>`;

  const body = `<section class="gh-pd"><div class="gh-wrap">
  <nav class="gh-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / ${listing ? `<a href="/${esc(listing.slug)}">${esc(cat?.name || listing.title)}</a> / ` : cat ? `${esc(cat.name)} / ` : ''}<span aria-current="page">${esc(p.name)}</span></nav>
  <div class="gh-pd-top">
    <div>
      ${p.badge ? `<span class="gh-ribbon">${esc(p.badge)}</span>` : ''}
      <h1>${esc(p.name)}</h1>
      ${p.tagline ? `<p class="gh-pd-lead">${esc(p.tagline)}</p>` : ''}
      ${def ? `<div class="gh-price" style="margin-bottom:26px"><span class="gh-amt">${def.cycle === 'free' ? 'Free' : money(def.price, def.prefix)}</span><span class="gh-per">${def.cycle === 'monthly' ? '/mo' : ' ' + (CYCLE_LABEL[def.cycle] || '').toLowerCase()}</span></div>` : ''}
      ${specs.length ? `<dl class="gh-specs">${specs.map(([k, v]) => `<div><dt>${esc(SPEC_LABEL[k])}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${feats.length ? `<div class="gh-pd-sec"><h2>What's included</h2><ul class="gh-feat" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${feats.map((f) => f.startsWith('-') ? `<li class="is-off">${CROSS}<span>${esc(f.replace(/^-\s*/, ''))}</span></li>` : `<li>${CHECK}<span>${esc(f)}</span></li>`).join('')}</ul></div>` : ''}
      ${p.description && p.description.replace(/<[^>]+>/g, '').trim().length > 40 && !feats.some((f) => p.description.includes(f)) ? `<div class="gh-pd-sec"><h2>About this plan</h2><div class="gh-pd-desc">${p.description}</div></div>` : ''}
    </div>
    ${buy}
  </div>
</div></section>`;

  // related plans in the same category
  let related = '';
  if (cat) {
    const others = await db.select().from(schema.products).where(and(eq(schema.products.categoryId, cat.id), eq(schema.products.status, 'PUBLISHED'), eq(schema.products.whmcsRetired, false), ne(schema.products.id, p.id)));
    if (others.length) {
      const op = await db.select().from(schema.productPrices).where(inArray(schema.productPrices.productId, others.map((o) => o.id)));
      const list: RProduct[] = others.map((o) => ({ ...o, features: o.features || [], attributes: o.attributes || {}, prices: op.filter((x) => x.productId === o.id) }))
        .sort((a, b) => a.sortOrder - b.sortOrder || (cycles(a, cur)[0]?.perMonth ?? 1e9) - (cycles(b, cur)[0]?.perMonth ?? 1e9));
      related = renderProducts({ title: `More plans in ${cat.name}`, layout: list.length > 4 ? 'auto' : 'cards', template: cat.cardTemplate, wrapperClass: 'gh-related' }, `rel-${p.id}`, [{ ...cat }], list,
        { currency: cur, defaultCycle: s.default_cycle || 'auto', orderLabel: s.order_button_label || 'Order Now', cartBase: base }) || '';
    }
  }

  const url = `${(s.site_url || '').replace(/\/$/, '')}/p/${p.slug}`;
  const desc = (p.tagline || feats.filter((f) => !f.startsWith('-')).slice(0, 4).join(', ')).slice(0, 160);
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: desc, brand: { '@type': 'Brand', name: s.site_name }, url,
    ...(def ? { offers: { '@type': 'Offer', price: def.price.toFixed(2), priceCurrency: cur, availability: 'https://schema.org/InStock', url: orderUrl(rp, base, def.cycle) } } : {}) };
  const ogImg = ogImageUrl(siteUrl(s), p.name, cat?.name);
  const seo = `<title>${esc(`${p.name}${cat ? ` – ${cat.name}` : ''} | ${s.site_name}`)}</title>
<meta name="description" content="${esc(desc)}" /><link rel="canonical" href="${esc(url)}" />
<meta property="og:type" content="website" /><meta property="og:locale" content="en_AE" /><meta property="og:title" content="${esc(p.name)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:url" content="${esc(url)}" /><meta property="og:image" content="${esc(ogImg)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(p.name)}" /><meta name="twitter:description" content="${esc(desc)}" /><meta name="twitter:image" content="${esc(ogImg)}" />
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
  return shell({ page: tpl, blocks, s, vars, seo, body: body + related, ambKey: cat?.slug || p.slug });
}
