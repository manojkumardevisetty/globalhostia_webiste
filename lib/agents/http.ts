// Shared HTTP helpers for the public agent endpoints: CORS, cache headers, per-IP rate limits.
export const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-protocol-version, mcp-session-id, retry-after',
  'access-control-max-age': '86400',
};

export const CACHE_1H = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

export function json(data: unknown, init: { status?: number; cache?: string; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, 'cache-control': init.cache ?? CACHE_1H, ...(init.headers || {}) },
  });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function clientIp(req: Request) {
  const h = req.headers;
  return (h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);
}

/** Fixed-window in-memory limiter (per server instance). Returns seconds to wait, or 0 when allowed. */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; t: number }>();
  return (key: string) => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k);
    const h = hits.get(key);
    if (!h || now - h.t > windowMs) { hits.set(key, { n: 1, t: now }); return 0; }
    h.n++;
    return h.n > max ? Math.ceil((windowMs - (now - h.t)) / 1000) : 0;
  };
}

export const tooMany = (retry: number) => json({ error: 'rate_limited', message: `Too many requests. Try again in ${retry}s.` }, { status: 429, cache: 'no-store', headers: { 'retry-after': String(retry) } });
