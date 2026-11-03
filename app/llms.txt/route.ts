// /llms.txt — generated from the catalog in the database (cached 1h, tag 'site'; no WHMCS call).
import { cdnCache } from '@/lib/lkg';
import { buildLlms } from '@/lib/agents/llms';

export const dynamic = 'force-dynamic';

// built from the cached catalog (lib/theme/data.ts: data cache + snapshot); the CDN keeps it for an hour
const cached = () => buildLlms(false);

export async function GET() {
  return new Response(await cached(), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': cdnCache() },
  });
}
