// OpenAI Commerce (ChatGPT) product feed, JSONL per the file-upload spec. ?currency=AED for another currency.
import { productsOpenAi } from '@/lib/agents/feeds';
import { CORS, CACHE_1H } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cur = new URL(req.url).searchParams.get('currency');
  return new Response(await productsOpenAi(cur), { headers: { 'content-type': 'application/jsonl; charset=utf-8', ...CORS, 'cache-control': CACHE_1H } });
}
