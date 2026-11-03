// NLWeb-style /ask endpoint (https://github.com/nlweb-ai/NLWeb, docs/nlweb-rest-api.md): natural-language
// question -> ranked results with schema.org objects, from the live catalog (rules-based; no LLM key needed).
// GET  /ask?query=...&mode=list|summarize&streaming=false&currency=USD
// POST /ask  {"query":{"text":"..."},"prefer":{"mode":"list","streaming":false},"meta":{"version":"0.55"}}  (or {"query":"..."})
// Streaming (SSE) when streaming=true or Accept: text/event-stream.
import { ask } from '@/lib/agents/ask';
import { CORS, clientIp, limiter, json, tooMany } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

const askLimit = limiter(30, 60_000);

type Q = { query: string; mode: string; streaming: boolean; currency: string | null; prev: string; limit: number };

async function answer(req: Request, q: Q) {
  const wait = askLimit(clientIp(req));
  if (wait) return tooMany(wait);
  if (!q.query || q.query.length < 2) return json({ error: 'missing_query', message: 'Pass ?query=your question (2 to 300 characters).' }, { status: 400, cache: 'no-store' });
  const r = await ask(q.query, { currency: q.currency, limit: q.limit });
  const query_id = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const summary = q.mode === 'summarize' || q.mode === 'generate'
    ? r.results.length ? `Top matches for "${r.query}": ${r.results.slice(0, 3).map((x) => `${x.name} (${x.description})`).join('; ')}.` : `Nothing on GlobalHostia matched "${r.query}".`
    : undefined;
  if (q.streaming) {
    const enc = new TextEncoder();
    const ev = (o: unknown) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
    const body = new ReadableStream({ start(c) {
      c.enqueue(ev({ message_type: 'begin-nlweb-response', query_id, query: r.query }));
      if (summary) c.enqueue(ev({ message_type: 'summary', query_id, message: summary }));
      c.enqueue(ev({ message_type: 'result_batch', query_id, results: r.results }));
      c.enqueue(ev({ message_type: 'end-nlweb-response', query_id }));
      c.close();
    } });
    return new Response(body, { headers: { ...CORS, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return json({ query_id, query: r.query, mode: q.mode, currency: r.currency, ...(summary ? { summary } : {}), results: r.results,
    _meta: { version: '0.55', site: 'https://globalhostia.com', source: 'live catalog; prices synced from the billing system' } },
  { cache: 'public, max-age=60, s-maxage=300' });
}

const bool = (v: unknown) => v === true || v === 'true' || v === '1';

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  return answer(req, {
    query: String(u.get('query') || u.get('q') || '').trim().slice(0, 300), mode: u.get('mode') || 'list',
    streaming: bool(u.get('streaming')) || (req.headers.get('accept') || '').includes('text/event-stream'),
    currency: u.get('currency'), prev: u.get('prev') || '', limit: Math.min(parseInt(u.get('limit') || '10', 10) || 10, 50),
  });
}

export async function POST(req: Request) {
  let b: any = {};
  try { const raw = await req.text(); if (raw.length > 16_384) return json({ error: 'too_large' }, { status: 413, cache: 'no-store' }); b = raw ? JSON.parse(raw) : {}; }
  catch { return json({ error: 'invalid_json' }, { status: 400, cache: 'no-store' }); }
  const text = typeof b.query === 'string' ? b.query : String(b.query?.text || '');
  return answer(req, {
    query: text.trim().slice(0, 300), mode: String(b.prefer?.mode || b.mode || 'list'),
    streaming: bool(b.prefer?.streaming ?? b.streaming) || (req.headers.get('accept') || '').includes('text/event-stream'),
    currency: b.currency || b.context?.currency || null, prev: '', limit: Math.min(Number(b.limit) || 10, 50),
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
