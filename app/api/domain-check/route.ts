// GET /api/domain-check?domain=example.com&currency=USD — availability via WHMCS DomainWhois (server-side),
// strict validation, 10 lookups per IP per minute, results cached for 5 minutes.
import { checkDomain, domainLimit } from '@/lib/agents/domain';
import { json, preflight, clientIp, tooMany } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const domain = q.get('domain');
  if (!domain) return json({ error: 'missing_domain', message: 'Add ?domain=example.com' }, { status: 400, cache: 'no-store' });
  const wait = domainLimit(clientIp(req));
  if (wait) return tooMany(wait);
  const r = await checkDomain(domain, q.get('currency'));
  if (!r.ok) {
    const { ok: _ok, status, ...body } = r;
    return json(body, { status, cache: 'no-store' });
  }
  const { ok: _ok, ...body } = r;
  return json(body, { cache: 'public, max-age=60, s-maxage=300' });
}

export const OPTIONS = preflight;
