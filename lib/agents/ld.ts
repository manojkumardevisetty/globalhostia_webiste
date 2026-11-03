// Shared schema.org helpers: category ItemList and the home page OfferCatalog. Prices only from the catalog; no ratings or reviews.
import { cycles, orderUrl, productsFor, categoryProducts, type Catalog, type TProduct } from '../theme/data';
import { categoryPath, ISO_DURATION } from './catalog';
import { isMachineName, prettyName } from '../theme/sitelinks';

const siteOf = (cat: Catalog) => String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
const tag = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const availability = (p: TProduct) => /^(out|sold ?out)$/i.test((p.badge || '').trim()) ? 'https://schema.org/OutOfStock' : /pre-?order/i.test(p.badge || '') ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock';

function productNode(p: TProduct, cat: Catalog, site: string) {
  const cs = cycles(p, cat.currency).filter((c) => Number.isFinite(c.price) && c.cycle !== 'onetime');
  if (!cs.length) return null;
  const head = cs[0]; // shortest billing cycle (monthly when offered)
  const prices = cs.map((c) => c.price);
  return {
    '@type': 'Product', name: p.name, url: `${site}/p/${p.slug}`, ...(p.tagline ? { description: p.tagline } : {}),
    brand: { '@type': 'Brand', name: 'GlobalHostia' },
    offers: { '@type': 'AggregateOffer', priceCurrency: cat.currency, lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: cs.length,
      availability: availability(p), url: orderUrl(p, cat.base, head.cycle), seller: { '@id': `${site}/#organization` },
      // one Offer per billing cycle with its subscription period, so agents can read monthly vs yearly prices
      offers: cs.filter((c) => ISO_DURATION[c.cycle]).map((c) => ({ '@type': 'Offer', price: c.price.toFixed(2), priceCurrency: cat.currency, availability: availability(p), url: orderUrl(p, cat.base, c.cycle),
        priceSpecification: { '@type': 'UnitPriceSpecification', price: c.price.toFixed(2), priceCurrency: cat.currency, billingDuration: ISO_DURATION[c.cycle], valueAddedTaxIncluded: false } })) },
  };
}

/** ItemList of the priced products on a category page ('' when none). */
export function itemListLd(cat: Catalog, ps: TProduct[], name: string, url: string) {
  const site = siteOf(cat);
  const items = ps.map((p) => productNode(p, cat, site)).filter(Boolean);
  if (!items.length) return '';
  return tag({ '@context': 'https://schema.org', '@type': 'ItemList', name, url, numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })) });
}

/** Organization.hasOfferCatalog for the home page: one sub-catalog per category with its priced products. */
export function offerCatalogLd(cat: Catalog) {
  const site = siteOf(cat);
  const subs = cat.categories.filter((c) => !isMachineName(c.slug, c.name)).map((c) => {
    const items = categoryProducts(cat, c.slug).map((p) => {
      const n = productNode(p, cat, site);
      return n ? { '@type': 'Offer', itemOffered: { '@type': 'Service', name: n.name, url: n.url }, price: n.offers.lowPrice, priceCurrency: cat.currency, availability: n.offers.availability, url: n.url } : null;
    }).filter(Boolean);
    if (!items.length) return null;
    const path = categoryPath(c.slug, cat);
    return { '@type': 'OfferCatalog', name: prettyName(c.name), ...(path ? { url: site + path } : {}), itemListElement: items };
  }).filter(Boolean);
  if (!subs.length) return '';
  return tag({ '@context': 'https://schema.org', '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/`,
    hasOfferCatalog: { '@type': 'OfferCatalog', name: 'GlobalHostia hosting, servers and domains', itemListElement: subs } });
}
