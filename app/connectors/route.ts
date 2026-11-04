// /connectors: connect your GlobalHostia account to Claude or ChatGPT (copy editable in Admin → AI connectors).
import { NextRequest, NextResponse } from 'next/server';
import { cdnCache } from '@/lib/lkg';
import { page } from '@/lib/theme/shell';
import { getCatalog } from '@/lib/theme/data';
import { connectorConfig } from '@/lib/connector/config';
import { connectorsBody } from '@/lib/connector/pages';
import { withArabicSwitch } from '@/lib/i18n/ar-chrome';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const [cat, cfg] = await Promise.all([getCatalog(), connectorConfig()]);
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const route = { kind: 'content', title: cfg.pages.headline, description: 'Connect your GlobalHostia account to Claude or ChatGPT and manage hosting, domains, DNS, email, SSL, invoices and support tickets in plain language.' };
  const b = connectorsBody(cfg, site);
  const html = await page({
    ctx: { slug: 'connectors', path: '/connectors', preview: false, query: req.nextUrl.searchParams, route }, catalog: cat, path: '/connectors',
    title: 'Claude & ChatGPT Connector for Your Hosting Account', description: route.description, ogKicker: 'AI connectors', jsonLd: b.jsonLd, body: b.body,
    css: ['aic'], js: ['aic'],
  });
  return new NextResponse(withArabicSwitch(html, { path: '/connectors', site, overrides: cat.settings.ar_pages }), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cdnCache() } });
}
