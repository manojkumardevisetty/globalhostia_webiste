// GET /api/catalog/tlds — domain extension prices (register / transfer / renew) in one currency.
import { agentData, agentTlds, pickCurrency } from '@/lib/agents/catalog';
import { json, preflight } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const d0 = await agentData();
  const cur = pickCurrency(q.get('currency'), d0.currencies, d0.defaultCurrency);
  if (!cur) return json({ error: 'invalid_currency', message: `Supported currencies: ${d0.currencies.join(', ')}`, currencies: d0.currencies }, { status: 400 });
  const d = cur === d0.currency ? d0 : await agentData(cur);
  const tlds = agentTlds(d);
  return json({
    currency: d.currency, currencies: d.currencies, generatedAt: new Date().toISOString(),
    notes: 'Prices are per year. register = first-year registration, renew = yearly renewal, transfer = transfer-in. Null means not offered. Check a name with /api/domain-check?domain=.',
    count: tlds.length, tlds,
  });
}

export const OPTIONS = preflight;
