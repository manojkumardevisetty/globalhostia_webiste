// Runtime CSP mode for middleware.ts (Admin > Security): {mode, extra}. No secrets; cached 30s at the CDN.
import { securityConfig } from '@/lib/security/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const c = await securityConfig();
  return Response.json({ mode: c.csp.mode, extra: c.csp.extra }, { headers: { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' } });
}
