// Natural-language question -> ranked catalog results (NLWeb /ask, MCP "ask" tool, A2A SendMessage).
// Rules-based retrieval over the live catalog; no LLM or API key. Each result carries a schema.org object.
import 'server-only';
import { agentData, agentTlds, searchProducts, priceText, ISO_DURATION, type AgentData, type AgentProduct } from './catalog';
import { recommend, familyFor } from './shop';
import { policies } from './policies';
import { validDomain } from './domain';

export type AskResult = { url: string; name: string; site: string; score: number; description: string; schema_object: Record<string, unknown> };

const SITE_HOSTS = /(^|\.)globalhostia\.com$/;
const STOP = new Set(['a', 'an', 'the', 'do', 'does', 'you', 'your', 'we', 'i', 'me', 'my', 'is', 'are', 'can', 'what', 'which', 'how', 'much', 'for', 'to', 'of', 'in', 'on', 'with', 'and', 'or', 'it', 'any', 'have', 'has', 'need', 'want', 'best', 'cheap', 'cheapest', 'good', 'get', 'buy', 'price', 'prices', 'cost', 'under', 'below', 'less', 'than', 'per', 'month', 'monthly', 'year', 'usd', 'aed', 'please', 'show', 'find', 'there', 'about', 'globalhostia', 'free', 'available', 'availability', 'check', 'register', 'taken']);

export function productSchema(p: AgentProduct, site: string) {
  return {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, url: p.url, sku: p.slug,
    ...(p.tagline || p.description ? { description: (p.tagline || p.description).slice(0, 500) } : {}),
    ...(p.category ? { category: p.category.name } : {}),
    brand: { '@type': 'Brand', name: 'GlobalHostia' },
    additionalProperty: Object.entries(p.specs).filter(([, v]) => v).map(([k, v]) => ({ '@type': 'PropertyValue', name: k, value: v })),
    offers: p.prices.filter((c) => c.price > 0).map((c) => ({
      '@type': 'Offer', price: c.price.toFixed(2), priceCurrency: c.currency, url: c.orderUrl,
      availability: p.availability === 'out_of_stock' ? 'https://schema.org/OutOfStock' : p.availability === 'preorder' ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'GlobalHostia', url: `${site}/` },
      ...(ISO_DURATION[c.cycle] ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: c.price.toFixed(2), priceCurrency: c.currency, billingDuration: ISO_DURATION[c.cycle], referenceQuantity: { '@type': 'QuantitativeValue', value: c.months, unitCode: 'MON' } } } : {}),
    })),
  };
}

function domainIn(q: string, sold: string[]) {
  for (const m of q.toLowerCase().matchAll(/\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,}){1,2})\b/g)) {
    const d = validDomain(m[1]);
    if (d && !SITE_HOSTS.test(d) && sold.some((t) => d.endsWith(t) && d.length > t.length)) return d;
  }
  return null;
}

export async function ask(query: string, opts: { currency?: string | null; limit?: number } = {}) {
  const d: AgentData = await agentData(opts.currency);
  const S = d.site;
  const q = query.trim().slice(0, 300);
  const limit = Math.min(Math.max(opts.limit || 10, 1), 50);
  const out: AskResult[] = [];

  const tlds = agentTlds(d);
  const dom = domainIn(q, tlds.map((t) => t.tld));
  if (dom || /\b(domain|tld|register a name)\b/i.test(q)) {
    const t = dom ? tlds.filter((x) => dom.endsWith(x.tld)).sort((a, b) => b.tld.length - a.tld.length)[0] : undefined;
    out.push({
      url: dom ? `${S}/domains-registration?domain=${encodeURIComponent(dom)}` : `${S}/domains-registration`,
      name: dom ? `Register ${dom}` : 'Domain registration', site: S, score: 0.95,
      description: dom
        ? t ? `${t.tld} registration ${t.register !== null ? `${t.register.toFixed(2)} ${d.currency}` : 'price in cart'} first year${t.renew !== null ? `, renews at ${t.renew.toFixed(2)} ${d.currency}/year` : ''}. Live availability: ${S}/api/domain-check?domain=${encodeURIComponent(dom)}` : `We do not sell this extension in ${d.currency}.`
        : `${tlds.length} extensions with live register, renew and transfer prices: ${S}/api/catalog/tlds`,
      schema_object: { '@context': 'https://schema.org', '@type': 'Service', name: dom ? `Domain registration: ${dom}` : 'Domain registration', provider: { '@type': 'Organization', name: 'GlobalHostia', url: `${S}/` },
        ...(t && t.register !== null ? { offers: { '@type': 'Offer', price: t.register.toFixed(2), priceCurrency: d.currency, url: dom ? `${d.cat.base}/cart.php?a=add&domain=register&query=${encodeURIComponent(dom)}` : `${S}/domains-registration` } } : {}) },
    });
  }

  const policyQ = /\b(refunds?|money.?back|vat|tax(es)?|renew(al|s)?|cancel(lation)?|polic(y|ies)|terms)\b/i.test(q);
  if (policyQ) {
    const pol = policies(d.cat.settings, S, d.cat.base);
    const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOP.has(w));
    for (const p of pol.policies) {
      const hay = `${p.title} ${p.summary}`.toLowerCase();
      const hit = words.filter((w) => hay.includes(w.replace(/s$/, ''))).length;
      if (hit) out.push({ url: `${pol.source}#${p.id}`, name: p.title, site: S, score: Math.min(0.99, 0.85 + hit * 0.05), description: p.summary,
        schema_object: { '@context': 'https://schema.org', '@type': p.id.includes('refund') || p.id === 'money_back' ? 'MerchantReturnPolicy' : 'WebPageElement', name: p.title, text: p.summary, url: pol.source } });
    }
  }

  const fam = familyFor(q);
  const money = q.match(/(?:under|below|less than|max(?:imum)?|<)\s*\$?\s*(\d+(?:\.\d+)?)/i);
  const terms = q.toLowerCase().split(/[^a-z0-9.+]+/).filter((w) => w.length > 1 && !STOP.has(w)).join(' ');
  const products = fam
    ? recommend(d, { need: terms || q, budget: money ? parseFloat(money[1]) : undefined, limit }).recommendations.map((r) => d.products.find((p) => p.slug === r.slug)!).filter(Boolean)
    : terms && !(policyQ && out.length) ? searchProducts(d, { query: terms, limit }) : [];
  products.forEach((p, i) => out.push({
    url: p.url, name: p.name, site: S, score: Math.round((0.85 - i * (0.5 / Math.max(products.length, 1))) * 100) / 100,
    description: [p.tagline, priceText(p), p.location ? `Location: ${p.location}` : ''].filter(Boolean).join('. '),
    schema_object: productSchema(p, S),
  }));

  return { query: q, currency: d.currency, results: out.sort((a, b) => b.score - a.score).slice(0, limit) };
}
