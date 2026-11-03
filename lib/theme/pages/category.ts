// /category/<slug>: the generated page of a category that no hand-written page covers (new in admin or synced
// from WHMCS). Everything comes from the catalog: name, description, products, prices, locations, subcategories.
// A hidden category, or one without published products, has no page (404) and is not in the sitemap (pseo.ts).
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, categoryProducts, minFrom, fromPrice, type Catalog, type TCategory, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, sectionHead, planCards, plansNote, ctaBand, breadcrumbJsonLd, link, fromText, available } from '../ui';
import { trustStrip } from '../growth';
import { productsLd } from './vps';
import { locationOf, siteOf } from '../pseo';
import { CLAIMED, TYPE_LABEL, TYPE_PAGE, categoryHref } from '../sitelinks';

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export default async function render(ctx: PageCtx): Promise<string | null> {
  const slug = ctx.slug.split('/')[1] || '';
  const cat = await getCatalog();
  const c = cat.categories.find((x) => x.slug === slug);
  if (!c) return null;
  const products = categoryProducts(cat, c.slug);
  if (!products.length) return null;
  return renderCategory(ctx, cat, c, products);
}

function renderCategory(ctx: PageCtx, cat: Catalog, c: TCategory, products: TProduct[]) {
  const site = siteOf(cat);
  const path = `/category/${c.slug}`;
  // a category that also has a hand-written page keeps that page as the canonical URL
  const canonical = CLAIMED.has(c.slug) ? site + categoryHref(c.slug) : undefined;
  const fam = c.type !== 'other' ? TYPE_LABEL[c.type] : '';
  const famPage = TYPE_PAGE[c.type];
  const parent = c.parentId ? cat.categories.find((x) => x.id === c.parentId) : undefined;
  const subs = cat.categories.filter((x) => x.parentId === c.id && products.some((p) => p.categorySlug === x.slug));
  const desc = strip(c.description) || strip(c.seoDescription) || `${products.length} ${products.length === 1 ? 'plan' : 'plans'} with live prices from our billing system.`;
  const from = minFrom(available(products), cat.currency);
  const cheapest = from ? products.find((p) => fromPrice(p, cat.currency)?.amount === from.amount) : undefined;
  const fromTxt = cheapest ? fromText(cheapest, cat.currency) : '';
  const locs = [...new Map(products.map((p) => locationOf(p)).filter(Boolean).map((l) => [l!.slug, l!])).values()];

  const crumbs = [{ label: 'Home', href: '/' }, ...(parent ? [{ label: parent.name, href: categoryHref(parent.slug) }] : famPage && fam ? [{ label: fam, href: famPage }] : []), { label: c.name }];
  const hero = pageHero({
    eyebrow: fam || 'Plans', title: c.name, lead: desc, crumbs,
    ctas: [{ label: 'See the plans', href: '#plans' }, { label: 'Talk to sales', href: '/contact', variant: 'ghost' }],
    fromHtml: fromTxt ? `From <b>${esc(fromTxt)}</b>` : '',
  });
  const plans = `<section class="hp-section" id="plans" aria-labelledby="cat-plans-h"><div class="hp-container">
    ${sectionHead({ id: 'cat-plans-h', title: products.length === 1 ? 'The plan' : 'Choose your plan', lead: 'Live prices from our billing system. Pick a billing period and order in a few clicks.' })}
    ${planCards(products, { currency: cat.currency, base: cat.base, id: 'cat-plans', cycleSwitch: true, details: true, groupBy: subs.length ? 'category' : locs.length > 1 ? 'location' : undefined, categoryNames: Object.fromEntries(cat.categories.map((x) => [x.id, x.name])) })}
    ${plansNote(cat.currency)}
  </div></section>`;
  const more = [
    ...subs.map((x) => link(x.name, categoryHref(x.slug))),
    ...locs.map((l) => link(`Plans in ${l.the}`, `/locations/${l.slug}`)),
    ...(famPage && fam ? [link(`All ${fam.toLowerCase()} plans`, famPage)] : []),
    link('Not sure? Try the plan finder', '/plan-finder'),
  ];
  const body = `${hero}${plans}${trustStrip(cat.settings, { tone: 'tint' })}
<section class="hp-section" aria-labelledby="cat-more-h"><div class="hp-container">${sectionHead({ id: 'cat-more-h', title: 'Related', level: 2 })}
  <p class="hp-pf-links" style="display:flex;flex-wrap:wrap;gap:12px 28px">${more.join('')}</p></div></section>
${ctaBand({ title: `Questions about ${c.name}?`, text: 'Our engineers answer by ticket, phone and WhatsApp, around the clock.', primary: { label: 'See the plans', href: '#plans' }, secondary: { label: 'Contact us', href: '/contact' } })}`;

  const route = { ...ctx.route, title: c.name, description: desc, categories: [c.slug] };
  return page({
    title: c.seoTitle || c.name, description: c.seoDescription ? strip(c.seoDescription) : desc, path, body, ctx: { ...ctx, route }, catalog: cat, canonical,
    ogKicker: fam || undefined,
    jsonLd: [breadcrumbJsonLd(crumbs, site), productsLd(products, cat, c.name)].filter(Boolean) as string[],
  });
}
