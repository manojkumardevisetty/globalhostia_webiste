// Product feeds for AI shopping surfaces: Google Merchant-style RSS 2.0 (g: namespace) and JSON Feed 1.1.
import 'server-only';
import { agentData, type AgentProduct } from './catalog';
import { ogImageUrl } from '../seo';
import { SPEC_LABEL } from '../render/specs';

const x = (s: unknown) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Google product taxonomy has no hosting node; 2092 = "Software" is the closest. Exact type goes in product_type. */
export const GOOGLE_CATEGORY = '2092';

const describe = (p: AgentProduct) => {
  const spec = Object.entries(p.specs).filter(([, v]) => v).map(([k, v]) => `${SPEC_LABEL[k] || k}: ${v}`).join('; ');
  return [p.tagline, p.description !== p.tagline ? p.description : '', spec, p.features.slice(0, 12).join(', ')].filter(Boolean).join('. ').slice(0, 4900) || p.name;
};
const avail = (p: AgentProduct) => (p.availability === 'out_of_stock' ? 'out_of_stock' : p.availability === 'preorder' ? 'preorder' : 'in_stock');

export async function feedData(currency: string | null) {
  const d = await agentData(currency);
  const items = d.products.filter((p) => p.from); // unpriced products are left out, never given a price
  return { d, items };
}

export async function productsXml(currency: string | null) {
  const { d, items } = await feedData(currency);
  const S = d.site;
  const body = items.map((p) => {
    const head = p.prices.find((c) => c.cycle === p.from!.cycle)!;
    const sub = head.months === 1 || head.months === 12
      ? `\n      <g:subscription_cost><g:period>${head.months === 1 ? 'month' : 'year'}</g:period><g:period_length>1</g:period_length><g:amount>${head.price.toFixed(2)} ${d.currency}</g:amount></g:subscription_cost>` : '';
    return `    <item>
      <g:id>${x(p.slug)}</g:id>
      <title>${x(p.name)}</title>
      <g:title>${x(p.name)}</g:title>
      <description>${x(describe(p))}</description>
      <g:description>${x(describe(p))}</g:description>
      <link>${x(p.url)}</link>
      <g:link>${x(p.url)}</g:link>
      <g:image_link>${x(ogImageUrl(S, p.name, p.category?.name))}</g:image_link>
      <g:price>${head.price.toFixed(2)} ${d.currency}</g:price>${sub}
      <g:availability>${avail(p)}</g:availability>
      <g:condition>new</g:condition>
      <g:brand>GlobalHostia</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:google_product_category>${GOOGLE_CATEGORY}</g:google_product_category>
      <g:product_type>${x(['Web hosting services', p.category?.name].filter(Boolean).join(' > '))}</g:product_type>${p.location ? `\n      <g:custom_label_0>${x(p.location)}</g:custom_label_0>` : ''}
      <g:custom_label_1>${x(head.cycle)}</g:custom_label_1>
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>GlobalHostia products</title>
    <link>${x(S)}/</link>
    <description>Web hosting, VPS, cloud and dedicated servers, SSL and email from GlobalHostia (Dubai, UAE). Prices in ${d.currency}, synced from the billing system.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${body}
  </channel>
</rss>
`;
}

export async function productsJson(currency: string | null) {
  const { d, items } = await feedData(currency);
  const S = d.site;
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'GlobalHostia products',
    home_page_url: `${S}/`,
    feed_url: `${S}/feeds/products.json${d.currency !== d.defaultCurrency ? `?currency=${d.currency}` : ''}`,
    description: `Hosting, servers, SSL and email plans with live prices in ${d.currency}.`,
    language: 'en',
    authors: [{ name: 'GlobalHostia', url: `${S}/` }],
    _globalhostia: { currency: d.currency, currencies: d.currencies, brand: 'GlobalHostia', api: `${S}/api/catalog`, mcp: `${S}/api/mcp`, generatedAt: new Date().toISOString() },
    items: items.map((p) => ({
      id: p.slug, url: p.url, title: p.name,
      content_text: describe(p), summary: p.tagline || undefined,
      image: ogImageUrl(S, p.name, p.category?.name),
      tags: [p.category?.name, p.location].filter(Boolean),
      _offer: {
        brand: 'GlobalHostia', category: p.category, availability: avail(p), currency: p.currency,
        price: p.from!.price, billingCycle: p.from!.cycle, perMonth: p.from!.perMonth,
        prices: p.prices.map((c) => ({ cycle: c.cycle, price: c.price, setupFee: c.setupFee, orderUrl: c.orderUrl })),
        specs: p.specs, location: p.location, orderUrl: p.orderUrl,
      },
    })),
  };
}
