// OpenAI app domain verification: the token from the OpenAI platform, pasted by the owner in Admin → AI connectors,
// served as plain text (nothing else) at /.well-known/openai-apps-challenge. 404 until it is set.
import { connectorConfig } from '@/lib/connector/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = (await connectorConfig(true)).openaiChallenge || process.env.OPENAI_APPS_CHALLENGE || '';
  if (!token) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  return new Response(token, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
