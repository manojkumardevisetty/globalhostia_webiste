// GET /api/catalog — public, read-only product catalog for AI assistants and shopping agents (CORS *, cached 1h).
import { agentData, searchProducts, pickCurrency } from '@/lib/agents/catalog';
import { json, preflight } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const d = await agentData();
  const cur = pickCurrency(q.get('currency'), d.currencies, d.defaultCurrency);
  if (!cur) return json({ error: 'invalid_currency', message: `Supported currencies: ${d.currencies.join(', ')}`, currencies: d.currencies }, { status: 400 });
  const data = cur === d.currency ? d : await agentData(cur);
  const category = (q.get('category') || '').trim().slice(0, 80);
  const query = (q.get('q') || '').trim().slice(0, 200);
  const maxRaw = q.get('max_price');
  const maxPrice = maxRaw !== null && maxRaw !== '' && Number.isFinite(+maxRaw) && +maxRaw >= 0 ? +maxRaw : undefined;
  const location = (q.get('location') || '').trim().slice(0, 60) || undefined;
  const filtered = !!(category || query || maxPrice !== undefined || location);
  const products = filtered ? searchProducts(data, { query, category, maxPrice, location, limit: 100 }) : data.products;
  const used = new Set(products.map((p) => p.category?.slug));
  return json({
    brand: 'GlobalHostia', site: data.site, currency: data.currency, currencies: data.currencies,
    generatedAt: new Date().toISOString(),
    notes: 'Prices are synced from the GlobalHostia billing system (WHMCS) and are per billing cycle; perMonth is the monthly equivalent. orderUrl opens the cart with the product, billing cycle and currency selected; checkout and payment happen there.',
    docs: { openapi: `${data.site}/openapi.json`, mcp: `${data.site}/api/mcp`, llms: `${data.site}/llms.txt` },
    filters: { category: category || null, q: query || null, max_price: maxPrice ?? null, location: location || null },
    locations: data.locations,
    categories: filtered ? data.categories.filter((c) => used.has(c.slug)) : data.categories,
    count: products.length,
    products,
  });
}

export const OPTIONS = preflight;
