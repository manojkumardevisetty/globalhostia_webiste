// /ai — "Shop GlobalHostia with your AI assistant": how to connect the public MCP server and the other agent endpoints.
import { NextRequest, NextResponse } from 'next/server';
import { cdnCache } from '@/lib/lkg';
import { page } from '@/lib/theme/shell';
import { getCatalog } from '@/lib/theme/data';
import { pageHero, sectionHead, section, faq, faqJsonLd, breadcrumbJsonLd, ctaBand, ld } from '@/lib/theme/ui';
import { esc } from '@/lib/render/util';
import { TOOLS } from '@/lib/agents/mcp';

export const dynamic = 'force-dynamic';

const code = (s: string) => `<pre style="background:#16212b;color:#f6f7f9;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-all"><code>${esc(s)}</code></pre>`;
const card = (title: string, html: string) => `<div style="border:1px solid #e6e9ee;border-radius:14px;padding:22px 22px 8px;background:#fff;min-width:0"><h3 style="margin:0 0 10px;font-size:1.15rem">${esc(title)}</h3>${html}</div>`;
const grid = (items: string[]) => `<div style="display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))">${items.join('')}</div>`;

export async function GET(req: NextRequest) {
  const cat = await getCatalog();
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const mcp = `${site}/api/mcp`;
  const route = { kind: 'content', title: 'Shop GlobalHostia with your AI assistant', description: 'Connect Claude, ChatGPT or any MCP client to GlobalHostia to search plans, compare prices, check domains and get order links.' };
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'AI assistants' }];

  const hero = pageHero({
    eyebrow: 'For AI assistants', title: route.title, crumbs, network: false,
    lead: 'Ask your assistant to find the right hosting plan, compare live prices, check a domain and hand you a ready-to-pay cart link. Our public MCP server is read-only and needs no sign-in.',
    ctas: [{ label: 'Copy the MCP URL below', href: '#connect', variant: 'brand' }, { label: 'Browse the catalog API', href: '/api/catalog', variant: 'ghost' }],
  });

  const connect = section(`<div class="hp-container">
    ${sectionHead({ id: 'connect', title: 'Add GlobalHostia to your assistant', lead: 'Use this server URL in any client that supports remote MCP servers (Streamable HTTP). No API key or account is needed.' })}
    ${code(mcp)}
    ${grid([
      card('Claude (claude.ai and desktop)', `<ol class="hp-prose" style="padding-left:1.2em"><li>Open <b>Customize &gt; Connectors</b> (Team and Enterprise owners: <b>Organization settings &gt; Connectors</b>, then <b>Add &gt; Custom</b>).</li><li>Choose <b>Add custom connector</b>, name it GlobalHostia and paste the URL above.</li><li>Choose <b>No sign-in</b> if asked, then <b>Add</b>.</li><li>In a chat, enable it from the <b>+</b> menu under <b>Connectors</b>.</li></ol>`),
      card('Claude Code', `<p class="hp-prose">Run once in your terminal:</p>${code(`claude mcp add --transport http globalhostia ${mcp}`)}`),
      card('ChatGPT', `<ol class="hp-prose" style="padding-left:1.2em"><li>In <b>Settings</b>, open <b>Apps &amp; Connectors</b> and turn on developer mode under <b>Advanced settings</b> (on plans that offer custom connectors).</li><li>Create a connector, name it GlobalHostia, paste the URL above and choose no authentication.</li><li>Select it in a new chat.</li></ol>`),
      card('Other MCP clients', `<p class="hp-prose">Add a remote server with transport <b>streamable-http</b> and the URL above. A discovery document is published at <a href="/.well-known/mcp.json">/.well-known/mcp.json</a>.</p>${code(`{ "mcpServers": { "globalhostia": { "type": "http", "url": "${mcp}" } } }`)}`),
    ])}
  </div>`, { labelledby: 'connect' });

  const tools = section(`<div class="hp-container">
    ${sectionHead({ id: 'tools', title: 'What your assistant can do', lead: 'Every tool is read-only. Prices come from our live billing system, and orders are completed by you in the client area.' })}
    ${grid(TOOLS.map((t) => card(t.title, `<p class="hp-prose"><code>${esc(t.name)}</code>: ${esc(t.description)}</p>`)))}
    <p class="hp-prose" style="margin-top:22px">Try asking: <i>"Find me a Windows VPS in the USA under $30 a month on GlobalHostia"</i>, <i>"Is mybrand.ae available, and what does it cost to renew?"</i> or <i>"Give me the yearly order link for the cheapest WordPress plan."</i></p>
  </div>`, { labelledby: 'tools', tint: true });

  const devs = section(`<div class="hp-container">
    ${sectionHead({ id: 'devs', title: 'For developers and shopping agents', lead: 'The same data is available as plain HTTP and feeds. All endpoints are public, read-only and CORS-enabled.' })}
    <ul class="hp-prose" style="padding-left:1.2em;line-height:1.9">
      <li><a href="/api/catalog">/api/catalog</a>: categories and products with specs, prices per billing cycle and order links (<code>?currency=USD&amp;category=&amp;q=</code>)</li>
      <li><a href="/api/catalog/tlds">/api/catalog/tlds</a>: domain extension prices</li>
      <li><a href="/api/domain-check?domain=example.com">/api/domain-check?domain=</a>: live availability with price and add-to-cart link (rate limited)</li>
      <li><a href="/openapi.json">/openapi.json</a>: OpenAPI 3.1 description</li>
      <li><a href="/feeds/products.xml">/feeds/products.xml</a> (Google Merchant format) and <a href="/feeds/products.json">/feeds/products.json</a> (JSON Feed)</li>
      <li><a href="/llms.txt">/llms.txt</a> and <a href="/llms-full.txt">/llms-full.txt</a>: the catalog summarised for language models</li>
      <li><a href="/ask?query=wordpress%20hosting">/ask?query=</a>: NLWeb-style questions in plain language, ranked results with schema.org objects</li>
      <li><a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a>: A2A agent card (JSON-RPC agent at <code>/api/a2a</code>)</li>
      <li><a href="/feeds/openai.jsonl">/feeds/openai.jsonl</a> (OpenAI product feed spec) and <a href="/feeds/index.json">/feeds/index.json</a> (every feed in every currency)</li>
      <li>Any page as Markdown: add <code>.md</code> to the URL (<a href="/index.md">/index.md</a>) or send <code>Accept: text/markdown</code></li>
      <li>In-browser agents: pages register WebMCP tools when the browser supports <code>document.modelContext</code></li>
    </ul>
  </div>`, { labelledby: 'devs' });

  const qs = [
    { q: 'Can an AI assistant buy hosting for me?', a: 'It can find the plan, compare prices and give you a cart link with the plan and billing cycle already selected. You review the order, sign in and pay in our client area yourself; the MCP server cannot place orders or see your account.' },
    { q: 'Do I need an API key?', a: 'No. The MCP server, catalog API and feeds are public and read-only. Domain checks are limited to a few lookups per minute to protect the registry.' },
    { q: 'Are the prices accurate?', a: 'Yes. Prices are synced from our billing system and refreshed at least hourly. The cart always shows the final price, including any options you add.' },
  ];
  const faqHtml = section(`<div class="hp-container">${sectionHead({ id: 'ai-faq', title: 'Questions', align: 'left' })}${faq(qs, { id: 'ai-faq-list', single: true })}</div>`, { labelledby: 'ai-faq', tint: true });
  const cta = ctaBand({ title: 'Prefer to talk to a person?', text: 'Our team is available around the clock by ticket, email and phone.', primary: { label: 'Contact us', href: '/contact' }, secondary: { label: 'See all hosting plans', href: '/web-hosting' } });

  const webApi = ld({ '@context': 'https://schema.org', '@type': 'WebAPI', name: 'GlobalHostia MCP server', description: route.description, url: `${site}/ai`,
    documentation: `${site}/openapi.json`, provider: { '@id': `${site}/#organization` }, potentialAction: { '@type': 'ConsumeAction', target: mcp } });

  const out = await page({
    ctx: { slug: 'ai', path: '/ai', preview: false, query: req.nextUrl.searchParams, route }, catalog: cat, path: '/ai',
    title: 'Shop with your AI assistant', description: route.description, ogKicker: 'AI assistants',
    jsonLd: [breadcrumbJsonLd(crumbs.map((c) => ({ ...c, href: c.href || '/ai' })), site), faqJsonLd(qs), webApi],
    body: ['<style>.ai-pg ol,.ai-pg ul.hp-prose{list-style:revert;padding-left:1.3em}.ai-pg ol li{margin:.3em 0}.ai-pg .hp-prose a{color:#a6225f;text-decoration:underline;text-underline-offset:2px}</style><div class="ai-pg">', hero, connect, tools, devs, faqHtml, cta, '</div>'].join('\n'),
  });
  return new NextResponse(out, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cdnCache() } });
}
