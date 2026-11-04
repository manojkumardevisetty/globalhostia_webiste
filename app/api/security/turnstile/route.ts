// The Turnstile form script (lib/security/turnstile-client.ts) with the site key and the forms switched on. Empty when off.
import { securityConfig, envTurnstileOff, turnstileKeys } from '@/lib/security/config';
import { turnstileScript } from '@/lib/security/turnstile-client';
import type { TsForm } from '@/lib/security/turnstile-core';

export const dynamic = 'force-dynamic';

export async function GET() {
  const keys = turnstileKeys();
  const c = await securityConfig();
  const forms = keys && !envTurnstileOff() && c.turnstile.enabled ? (Object.keys(c.turnstile.forms) as TsForm[]).filter((f) => c.turnstile.forms[f]) : [];
  const js = keys && forms.length ? turnstileScript(keys.site, forms) : '/* form check off */\n';
  return new Response(js, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=300', 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff' } });
}
