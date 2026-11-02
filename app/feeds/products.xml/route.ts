// Google Merchant-style product feed (RSS 2.0 + g: namespace). ?currency=AED for another currency.
import { productsXml } from '@/lib/agents/feeds';
import { CORS, CACHE_1H } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cur = new URL(req.url).searchParams.get('currency');
  return new Response(await productsXml(cur), { headers: { 'content-type': 'application/xml; charset=utf-8', ...CORS, 'cache-control': CACHE_1H } });
}
