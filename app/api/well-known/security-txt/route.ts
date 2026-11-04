// /.well-known/security.txt and /security.txt (rewrites in next.config.mjs): who to tell about a vulnerability.
// Contact: Admin > Security > "Security contact", else the site email from Settings.
import { getSettings } from '@/lib/settings';
import { securityConfig } from '@/lib/security/config';
import { securityTxt } from '@/lib/security/disclosure';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [s, c] = await Promise.all([getSettings(), securityConfig()]);
  const site = String(s.site_url || 'https://globalhostia.com');
  const body = securityTxt({ contact: c.disclosure.contact || String(s.email || 'support@globalhostia.com'), site, policyUrl: c.disclosure.policyUrl });
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600, s-maxage=86400' } });
}
