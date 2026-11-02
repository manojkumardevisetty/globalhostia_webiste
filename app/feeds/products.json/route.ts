// JSON Feed 1.1 of priced products, with offer details under `_offer`. ?currency=AED for another currency.
import { productsJson } from '@/lib/agents/feeds';
import { json, preflight } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cur = new URL(req.url).searchParams.get('currency');
  return json(await productsJson(cur), { headers: { 'content-type': 'application/feed+json; charset=utf-8' } });
}

export const OPTIONS = preflight;
