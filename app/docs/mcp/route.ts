// /docs/mcp: developer setup and the full tool reference for the GlobalHostia MCP server (generated from the code).
import { NextRequest, NextResponse } from 'next/server';
import { cdnCache } from '@/lib/lkg';
import { page } from '@/lib/theme/shell';
import { getCatalog } from '@/lib/theme/data';
import { docsBody } from '@/lib/connector/pages';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cat = await getCatalog();
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const route = { kind: 'content', title: 'GlobalHostia MCP server documentation', description: 'Set up the GlobalHostia MCP server in Claude, ChatGPT, Claude Code or MCP Inspector: endpoints, OAuth 2.1 sign-in, scopes and every tool with its parameters.' };
  const b = docsBody(site);
  const html = await page({
    ctx: { slug: 'docs/mcp', path: '/docs/mcp', preview: false, query: req.nextUrl.searchParams, route }, catalog: cat, path: '/docs/mcp',
    title: 'MCP Server Docs: OAuth Setup & Tool Reference', description: route.description, ogKicker: 'Developers', jsonLd: b.jsonLd, body: b.body,
  });
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cdnCache() } });
}
