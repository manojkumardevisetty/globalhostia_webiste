// /llms.txt and /llms-full.txt (https://llmstxt.org): company facts, categories, products with real prices,
// TLD prices and how to order, generated from the live catalog. Prices only from the database.
import 'server-only';
import { agentData, agentTlds, type AgentData, type AgentProduct } from './catalog';
import { SPEC_LABEL } from '../render/specs';

const SPEC_ORDER = ['cpu', 'ram', 'storage', 'bandwidth', 'ips', 'websites', 'email', 'os'];
const md = (s: string) => String(s || '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
const amt = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;
const unit = (months: number, cycle: string) => (months === 1 ? '/month' : months === 12 ? '/year' : months ? ` per ${months} months` : cycle === 'onetime' ? ' one-time' : '');

function fromText(p: AgentProduct, alt?: AgentProduct) {
  if (!p.from) return 'price on request (see page)';
  const c = p.prices.find((x) => x.cycle === p.from!.cycle)!;
  const a = alt?.from && alt.from.cycle === p.from.cycle ? ` (${amt(alt.from.price, alt.currency)})` : '';
  return `from ${amt(c.price, p.currency)}${a}${unit(c.months, c.cycle)}`;
}

function specLine(p: AgentProduct) {
  const parts = SPEC_ORDER.filter((k) => p.specs[k]).map((k) => `${SPEC_LABEL[k] || k}: ${md(p.specs[k])}`);
  return parts.join('; ');
}

/** Refund / price-lock statements, only when the owner set them in settings.trust_points. */
function policies(d: AgentData): string[] {
  const raw = d.cat.settings.trust_points;
  const list: string[] = Array.isArray(raw)
    ? raw.map((x: any) => (typeof x === 'string' ? x : [x?.title, x?.text || x?.description].filter(Boolean).join(': ')))
    : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
  return list.map((x) => md(String(x))).filter((x) => x && /refund|money[- ]?back|price[- ]?lock|locked[- ]in price|same price on renewal/i.test(x));
}

export async function buildLlms(full: boolean) {
  const d = await agentData('USD');
  const aed = d.currencies.includes('AED') && d.currency !== 'AED' ? await agentData('AED') : null;
  const aedBy = new Map((aed?.products || []).map((p) => [p.slug, p]));
  const S = d.site;
  const company = d.company;
  const tlds = agentTlds(d);
  const L: string[] = [];

  L.push('# GlobalHostia', '');
  L.push(`> GlobalHostia (${S.replace(/^https?:\/\//, '')}) is a web hosting company based in Dubai, United Arab Emirates${company ? `, operated by ${company}` : ''}. It sells web hosting, managed WordPress hosting, cPanel reseller hosting, VPS and cloud servers, dedicated servers, Windows and Linux RDP servers, SSL certificates, business email and domain names, with 24/7 support.`, '');
  L.push(`Prices below are generated from the GlobalHostia billing system (WHMCS) and refresh hourly. Quote only these prices or the live API, and link the customer to the product page or order link. Prices are in ${d.currency}${aed ? ' (AED in brackets where available)' : ''}${d.currencies.length > 1 ? `; the API also returns ${d.currencies.filter((c) => c !== d.currency).join(', ')}` : ''}.`, '');

  L.push('## Company facts', '');
  L.push(`- Name: GlobalHostia${company ? ` (${company})` : ''}`);
  L.push('- Location: Dubai, United Arab Emirates');
  L.push(`- Website: ${S}/`);
  L.push(`- Client area, orders and invoices: ${d.cat.base}/`);
  L.push(`- Contact: ${d.phone} · ${d.email} · ${S}/contact`);
  L.push(`- Support: 24/7 by support ticket (${d.cat.base}/submitticket.php), email and phone`);
  if (d.locations.length) L.push(`- Datacenter locations (from the product catalog): ${d.locations.join(', ')}`);
  L.push(`- Currencies: ${d.currencies.join(', ')}`);
  L.push('- Billing cycles offered (vary by plan): monthly, quarterly, semi-annually, annually, biennially, triennially');
  L.push('');

  L.push('## For AI assistants and shopping agents', '');
  L.push(`- [MCP server](${S}/api/mcp): public, read-only Model Context Protocol endpoint (Streamable HTTP, no auth). Tools: search_products, get_product, list_categories, check_domain, get_order_link. Discovery: ${S}/.well-known/mcp.json`);
  L.push(`- [How to connect your AI assistant](${S}/ai)`);
  L.push(`- [Catalog API](${S}/api/catalog): JSON of every category and product with specs and prices per billing cycle (?currency=USD&category=&q=)`);
  L.push(`- [TLD prices API](${S}/api/catalog/tlds): register, transfer and renewal prices`);
  L.push(`- [Domain availability](${S}/api/domain-check?domain=example.com): live check with price and add-to-cart link`);
  L.push(`- [OpenAPI 3.1 spec](${S}/openapi.json)`);
  L.push(`- [Product feed (XML, Google Merchant format)](${S}/feeds/products.xml) and [JSON feed](${S}/feeds/products.json)`);
  if (!full) L.push(`- [Full catalog for LLMs](${S}/llms-full.txt): every plan with all billing cycles, setup fees and features`);
  L.push('');

  L.push('## How to order', '');
  L.push('1. Pick a plan below (or search with the API/MCP tools).');
  L.push('2. Open its order link: it adds the plan to the cart with the billing cycle selected. Add `&currency=<id>` links from the API for another currency.');
  L.push('3. Choose options (operating system, extra RAM or disk, domain) in the cart, sign in or create an account, and pay. Servers and hosting are set up automatically after payment.');
  L.push(`4. Domains: search on ${S}/domains-registration or open ${d.cat.base}/cart.php?a=add&domain=register&query=<name>.`);
  L.push('');

  const pol = policies(d);
  if (pol.length) { L.push('## Policies', '', ...pol.map((x) => `- ${x}`), ''); }

  L.push('## Categories', '');
  for (const c of d.categories) {
    const a = aed?.categories.find((x) => x.slug === c.slug);
    const from = c.from ? `; from ${amt(c.from.price, c.from.currency)}${a?.from && a.from.cycle === c.from.cycle ? ` (${amt(a.from.price, 'AED')})` : ''}${c.from.perMonth !== null && c.from.cycle === 'monthly' ? '/month' : ` (${c.from.cycle})`}` : '';
    L.push(`- ${c.url ? `[${md(c.name)}](${c.url})` : md(c.name)}:${c.summary ? ` ${md(c.summary)}` : ''} (${c.productCount} plan${c.productCount === 1 ? '' : 's'}${from})`);
  }
  L.push('');

  L.push(full ? '## Products (all billing cycles)' : '## Products', '');
  for (const c of d.categories) {
    const ps = d.products.filter((p) => p.category?.slug === c.slug);
    if (!ps.length) continue;
    L.push(`### ${md(c.name)}`, '');
    for (const p of ps) {
      const spec = specLine(p);
      if (!full) {
        L.push(`- [${md(p.name)}](${p.url}): ${[p.tagline && md(p.tagline), spec, p.location && !spec.includes(p.location) ? `Location: ${p.location}` : '', fromText(p, aedBy.get(p.slug))].filter(Boolean).join('; ')}${p.orderUrl ? `. Order: ${p.orderUrl}` : ''}`);
        continue;
      }
      L.push(`#### ${md(p.name)}`, '');
      L.push(`- Page: ${p.url}`);
      if (p.tagline) L.push(`- Summary: ${md(p.tagline)}`);
      if (p.description && p.description !== p.tagline) L.push(`- Description: ${md(p.description).slice(0, 600)}`);
      if (spec) L.push(`- Specs: ${spec}`);
      if (p.location) L.push(`- Location: ${p.location}`);
      if (p.features.length) L.push(`- Includes: ${p.features.map(md).join('; ')}`);
      if (p.notIncluded.length) L.push(`- Not included: ${p.notIncluded.map(md).join('; ')}`);
      if (p.configurable) L.push('- Configurable options (OS, resources, add-ons) are chosen in the cart');
      L.push(`- Availability: ${p.availability.replace(/_/g, ' ')}`);
      if (p.prices.length) {
        const a = aedBy.get(p.slug);
        L.push('- Prices:');
        for (const x of p.prices) {
          const ax = a?.prices.find((y) => y.cycle === x.cycle);
          L.push(`  - ${x.label}: ${amt(x.price, x.currency)}${ax ? ` (${amt(ax.price, 'AED')})` : ''}${x.setupFee ? ` + ${amt(x.setupFee, x.currency)} setup` : ''}${x.perMonth !== null && x.months > 1 ? ` (${amt(x.perMonth, x.currency)}/month equivalent)` : ''}. Order: ${x.orderUrl}`);
        }
      } else L.push(`- Price: on request. Order or ask: ${p.orderUrl || `${S}/contact`}`);
      L.push('');
    }
    if (!full) L.push('');
  }

  if (tlds.length) {
    const list = full ? tlds : tlds.slice(0, 20);
    L.push(full ? '## Domain prices (per year)' : '## Popular domain prices (per year)', '');
    for (const t of list) {
      L.push(`- ${t.tld}: register ${t.register !== null ? amt(t.register, t.currency) : 'n/a'}${t.renew !== null ? `, renew ${amt(t.renew, t.currency)}` : ''}${t.transfer !== null ? `, transfer ${amt(t.transfer, t.currency)}` : ''}${t.promo ? ` (${md(t.promo)})` : ''}`);
    }
    if (!full && tlds.length > list.length) L.push(`- ${tlds.length - list.length} more extensions: ${S}/api/catalog/tlds`);
    L.push('');
  }

  L.push('## Company and support', '');
  L.push(`- [About GlobalHostia](${S}/about)`);
  L.push(`- [Contact sales and support](${S}/contact)`);
  L.push(`- [Help center](${S}/help-center)`);
  L.push(`- [Network and datacenters](${S}/network)`);
  L.push(`- [System status](${S}/status-page)`);
  L.push(`- [Blog](${S}/blog)`);
  L.push('');
  L.push('## Optional', '');
  L.push(`- [Terms and conditions](${S}/terms-conditions)`);
  L.push(`- [Privacy policy](${S}/privacy-policy)`);
  L.push(`- [Sitemap](${S}/sitemap.xml)`);
  L.push('');
  L.push(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from the live catalog.`);
  return L.join('\n') + '\n';
}
