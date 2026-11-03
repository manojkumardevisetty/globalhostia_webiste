// A2A Agent Card, served at /.well-known/agent-card.json (v1.0) and /.well-known/agent.json (older clients)
// via rewrites in next.config.mjs. Spec: https://a2a-protocol.org/latest/specification/
import { getSettings } from '@/lib/settings';
import { json, preflight } from '@/lib/agents/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const a2a = `${site}/api/a2a`;
  return json({
    name: 'GlobalHostia store agent',
    description: 'Answers questions about GlobalHostia (Dubai, UAE) hosting, VPS, dedicated servers, SSL, email and domains: recommends plans with live prices, checks domain availability, and explains refund, tax and renewal policies. Read-only; returns cart links the customer pays through.',
    version: '1.0.0',
    // v1.0: protocol version per interface
    supportedInterfaces: [{ url: a2a, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    // v0.3 fields for older clients
    url: a2a, preferredTransport: 'JSONRPC', protocolVersion: '0.3.0',
    provider: { organization: 'GlobalHostia', url: `${site}/` },
    iconUrl: `${site}/icon-512.png`,
    documentationUrl: `${site}/ai`,
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      { id: 'recommend-hosting', name: 'Recommend hosting', description: 'Finds GlobalHostia plans for a described need and budget, with live prices and cart links.', tags: ['hosting', 'vps', 'wordpress', 'dedicated server', 'shopping'],
        examples: ['WordPress hosting under 10 USD a month', 'Windows VPS for MT5 in London', 'Dedicated server in Germany with 64 GB RAM'] },
      { id: 'domain-check', name: 'Check a domain', description: 'Checks whether a domain is available and returns the registration and renewal price.', tags: ['domains', 'registration'],
        examples: ['Is mybrand.ae available?', 'Check availability of example-shop.com'] },
      { id: 'policies', name: 'Refund, tax and renewal policies', description: 'Summarises the money-back guarantee, refunds, VAT and taxes, renewals and cancellation from the published terms.', tags: ['policy', 'refund', 'vat'],
        examples: ['Do you refund domains?', 'Are prices including VAT?'] },
    ],
  },{ cache: 'public, max-age=3600, s-maxage=86400' });
}

export const OPTIONS = preflight;
