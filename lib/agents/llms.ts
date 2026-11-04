// /llms.txt and /llms-full.txt (https://llmstxt.org): company facts, categories, products with real prices,
// TLD prices and how to order, generated from the catalog in the database (never a live WHMCS call).
// llms.txt follows the llmstxt.org layout: H1, blockquote, free-form notes without headings, then H2 sections
// that are lists of markdown links. llms-full.txt keeps per-plan detail under H3/H4 headings.
import 'server-only';
import { agentData, agentTlds, type AgentData, type AgentProduct } from './catalog';
import { SPEC_LABEL } from '../render/specs';
import { LEARN_SECTIONS, learnPages, learnPath, type LearnSection } from '../theme/learn';
import { helpTopics } from '../help/view';
import { helpPath } from '../help/topics';
import { locationGroups, useCasePages, tldHref } from '../theme/pseo';
import { FAMILY_IDS } from '../theme/sitelinks';
import { policies as termsPolicies } from './policies';
import { getSettings } from '../settings';
import { visibleCompetitors, vsPath } from '../compare/competitors';
import { enabledArDefs, arPathOf } from '../i18n/ar-pages';

/** Extra agent endpoints listed in llms-full.txt (data only; the llms routes and their caching live elsewhere). */
export function agentEndpoints(S: string) {
  return [
    `- [Ask endpoint (NLWeb)](${S}/ask?query=wordpress%20hosting): natural-language questions, ranked results with schema.org objects (GET ?query= or POST; mode=list|summarize; streaming=true for SSE)`,
    `- [A2A agent card](${S}/.well-known/agent-card.json): Agent2Agent JSON-RPC agent at ${S}/api/a2a (SendMessage)`,
    `- Markdown version of any page: add .md to the URL (home: ${S}/index.md) or send Accept: text/markdown`,
    `- [ChatGPT / OpenAI product feed (JSONL)](${S}/feeds/openai.jsonl) and [all feeds per currency](${S}/feeds/index.json)`,
    `- MCP Registry manifest: ${S}/server.json (name com.globalhostia/store)`,
    '- In-browser agents: pages register WebMCP tools (search_plans, recommend_plan, check_domain, build_cart_link, get_policies) when the browser supports document.modelContext',
  ];
}

const SPEC_ORDER = ['cpu', 'ram', 'storage', 'bandwidth', 'ips', 'websites', 'email', 'os'];
const md = (s: string) => String(s || '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
const amt = (n: number, cur: string) => `${n.toFixed(2)} ${cur}`;
const unit = (months: number, cycle: string) => (months === 1 ? '/month' : months === 12 ? '/year' : months ? ` per ${months} months` : cycle === 'onetime' ? ' one-time' : '');

function fromText(p: AgentProduct, alt?: AgentProduct) {
  if (!p.from) return 'price on request (see page)';
  const c = p.prices.find((x) => x.cycle === p.from!.cycle)!;
  const a = alt?.from && alt.from.cycle === p.from.cycle ? ` (${amt(alt.from.price, alt.currency)})` : '';
  return `from ${amt(c.price, p.currency)}${a}${unit(c.months, c.cycle)}`;
}

function specLine(p: AgentProduct) {
  const parts = SPEC_ORDER.filter((k) => p.specs[k]).map((k) => `${SPEC_LABEL[k] || k}: ${md(p.specs[k])}`);
  return parts.join('; ');
}

/** Refund / price-lock statements, only when the owner set them in settings.trust_points. */
function policies(d: AgentData): string[] {
  const raw = d.cat.settings.trust_points;
  const list: string[] = Array.isArray(raw)
    ? raw.map((x: any) => (typeof x === 'string' ? x : [x?.title, x?.text || x?.description].filter(Boolean).join(': ')))
    : typeof raw === 'string' ? raw.split(/\r?\n/) : [];
  return list.map((x) => md(String(x))).filter((x) => x && /refund|money[- ]?back|price[- ]?lock|locked[- ]in price|same price on renewal/i.test(x));
}

export async function buildLlms(full: boolean) {
  const d = await agentData('USD');
  const aed = d.currencies.includes('AED') && d.currency !== 'AED' ? await agentData('AED') : null;
  const aedBy = new Map((aed?.products || []).map((p) => [p.slug, p]));
  const S = d.site;
  const company = d.company;
  const tlds = agentTlds(d);
  const L: string[] = [];

  // what the company sells, from the families of the published products (sitelinks.ts), plus domains when TLDs are priced
  const PLURAL: Record<string, string> = { shared: 'web hosting', wp: 'managed WordPress hosting', reseller: 'reseller hosting', vps: 'VPS and cloud servers', dedicated: 'dedicated servers', rdp: 'RDP servers', forex: 'forex VPS', automation: 'automation servers', ai: 'AI / LLM servers', ssl: 'SSL certificates', email: 'business email', tools: 'business tools' };
  const fams = FAMILY_IDS.filter((f) => PLURAL[f] && d.cat.products.some((p) => p.type === f)).map((f) => PLURAL[f]);
  const others = d.categories.filter((c) => d.cat.categories.find((x) => x.slug === c.slug)?.type === 'other').map((c) => c.name.toLowerCase());
  const sellList = [...(tlds.length ? ['domain names (registration and transfers)', 'premium domains'] : ['premium domains']), ...fams, ...others];
  const sells = sellList.length > 1 ? `${sellList.slice(0, -1).join(', ')} and ${sellList[sellList.length - 1]}` : sellList[0] || 'web hosting';
  L.push('# GlobalHostia', '');
  L.push(`> GlobalHostia (${S.replace(/^https?:\/\//, '')}) is a domain registrar reseller, premium domain marketplace and managed hosting partner for businesses worldwide, based in Dubai, United Arab Emirates. It sells ${sells}, with 24/7 support.`, '');
  L.push(`Prices below are generated from the GlobalHostia billing system (WHMCS), synced to our database, and refresh hourly (generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC). Quote only these prices or the live API, and link the customer to the product page or order link. Prices are in ${d.currency}${aed ? ' (AED in brackets where available)' : ''}${d.currencies.length > 1 ? `; the API also returns ${d.currencies.filter((c) => c !== d.currency).join(', ')}` : ''}.`, '');

  L.push('Company facts:', '');
  L.push(`- Name: GlobalHostia`);
  L.push('- Location: Dubai, United Arab Emirates');
  L.push(`- Website: ${S}/`);
  L.push(`- Client area, orders and invoices: ${d.cat.base}/`);
  L.push(`- Contact: ${d.phone} · ${d.email} · ${S}/contact`);
  L.push(`- Support: 24/7 by support ticket (${d.cat.base}/submitticket.php), email and phone`);
  if (d.locations.length) L.push(`- Datacenter locations (from the product catalog): ${d.locations.join(', ')}`);
  L.push(`- Currencies: ${d.currencies.join(', ')}`);
  L.push('- Billing cycles offered (vary by plan): monthly, quarterly, semi-annually, annually, biennially, triennially');
  L.push('');

  L.push('How to order:', '');
  L.push('1. Pick a plan below (or search with the API/MCP tools).');
  L.push('2. Open its order link: it adds the plan to the cart with the billing cycle selected. Add `&currency=<id>` links from the API for another currency.');
  L.push('3. Choose options (operating system, extra RAM or disk, domain) in the cart, sign in or create an account, and pay. Servers and hosting are set up automatically after payment.');
  L.push(`4. Domains: search on ${S}/domains-registration or open ${d.cat.base}/cart.php?a=add&domain=register&query=<name>.`);
  L.push(`   Domain transfers: steps, checklist and live transfer prices on ${S}/domain-transfer; start one at ${d.cat.base}/cart.php?a=add&domain=transfer&query=<name> (the EPP/auth code from the current registrar is entered in the order form).`);
  L.push(`5. Domain already taken: request the domain broker service at ${S}/domain-broker?domain=<name> (anonymous owner outreach, negotiation and escrow; a fixed service fee plus a commission only if a deal closes, details on that page).`);
  L.push(`6. Premium domains for sale (real listings with one-time prices): ${S}/premium-domains; each name has a page /premium-domains/<domain> with a purchase request form (we confirm, send a secure invoice and transfer the domain).`);
  L.push('');

  const pol = policies(d);
  if (full) {
    const tp = termsPolicies(d.cat.settings, S, d.cat.base);
    L.push('Policies (summary of the Terms & Conditions):', '', ...tp.policies.map((x) => `- ${x.title}: ${x.summary} (section ${x.section})`), `- Source: ${tp.source}`, '');
  } else if (pol.length) { L.push('Policies:', '', ...pol.map((x) => `- ${x}`), ''); }

  L.push('## For AI assistants and shopping agents', '');
  L.push(`- [MCP server](${S}/api/mcp): public, read-only Model Context Protocol endpoint (Streamable HTTP, no auth). Tools: recommend_plan, search_products, get_product, compare_plans, list_categories, check_domain, build_cart_link, get_policies, ask. Discovery: ${S}/.well-known/mcp.json`);
  if (full) L.push(...agentEndpoints(S));
  L.push(`- [How to connect your AI assistant](${S}/ai)`);
  L.push(`- [Account connector for Claude and ChatGPT](${S}/connectors): customers sign in with OAuth and manage their own services, domains, DNS, email, SSL, invoices and tickets (MCP: ${S}/mcp, ChatGPT: ${S}/mcp/chatgpt). Free for every customer. [Setup and tool reference](${S}/docs/mcp)`);
  L.push(`- [Catalog API](${S}/api/catalog): JSON of every category and product with specs and prices per billing cycle (?currency=USD&category=&q=)`);
  L.push(`- [TLD prices API](${S}/api/catalog/tlds): register, transfer and renewal prices`);
  L.push(`- [Domain availability](${S}/api/domain-check?domain=example.com): live check with price and add-to-cart link`);
  L.push(`- [OpenAPI 3.1 spec](${S}/openapi.json)`);
  L.push(`- [Product feed (XML, Google Merchant format)](${S}/feeds/products.xml) and [JSON feed](${S}/feeds/products.json)`);
  if (!full) L.push(`- [Full catalog for LLMs](${S}/llms-full.txt): every plan with all billing cycles, setup fees and features`);
  L.push('');

  L.push('## Categories', '');
  for (const c of d.categories) {
    const a = aed?.categories.find((x) => x.slug === c.slug);
    const from = c.from ? `; from ${amt(c.from.price, c.from.currency)}${a?.from && a.from.cycle === c.from.cycle ? ` (${amt(a.from.price, 'AED')})` : ''}${c.from.perMonth !== null && c.from.cycle === 'monthly' ? '/month' : ` (${c.from.cycle})`}` : '';
    L.push(`- [${md(c.name)}](${c.url || `${S}/`}):${c.summary ? ` ${md(c.summary)}` : ''} (${c.productCount} plan${c.productCount === 1 ? '' : 's'}${from})`);
  }
  L.push('');

  // hosting locations and use-case guides: the same generated pages as the site (lib/theme/pseo.ts)
  const groups = locationGroups(d.cat);
  if (groups.length) {
    L.push('## Hosting locations', '');
    for (const g of groups) L.push(`- [${md(g.loc.name)}](${S}/locations/${g.loc.slug}): ${g.products.length} plan${g.products.length === 1 ? '' : 's'} hosted in ${md(g.loc.the)}`);
    L.push('');
  }
  const uses = useCasePages(d.cat);
  if (uses.length) {
    L.push('## Hosting by use case', '');
    for (const x of uses) L.push(`- [${md(x.u.h1)}](${S}/hosting-for/${x.u.slug}): ${md(x.u.meta)}`);
    L.push('');
  }

  if (full) L.push('## Products (all billing cycles)', '');
  for (const c of d.categories) {
    const ps = d.products.filter((p) => p.category?.slug === c.slug);
    if (!ps.length) continue;
    L.push(full ? `### ${md(c.name)}` : `## ${md(c.name)} plans`, '');
    for (const p of ps) {
      const spec = specLine(p);
      if (!full) {
        L.push(`- [${md(p.name)}](${p.url}): ${[p.tagline && md(p.tagline), spec, p.location && !spec.includes(p.location) ? `Location: ${p.location}` : '', fromText(p, aedBy.get(p.slug))].filter(Boolean).join('; ')}${p.orderUrl ? `. Order: ${p.orderUrl}` : ''}`);
        continue;
      }
      L.push(`#### ${md(p.name)}`, '');
      L.push(`- Page: ${p.url}`);
      if (p.tagline) L.push(`- Summary: ${md(p.tagline)}`);
      if (p.description && p.description !== p.tagline) L.push(`- Description: ${md(p.description).slice(0, 600)}`);
      if (spec) L.push(`- Specs: ${spec}`);
      if (p.location) L.push(`- Location: ${p.location}`);
      if (p.features.length) L.push(`- Includes: ${p.features.map(md).join('; ')}`);
      if (p.notIncluded.length) L.push(`- Not included: ${p.notIncluded.map(md).join('; ')}`);
      if (p.configurable) L.push('- Configurable options (OS, resources, add-ons) are chosen in the cart');
      L.push(`- Availability: ${p.availability.replace(/_/g, ' ')}`);
      if (p.prices.length) {
        const a = aedBy.get(p.slug);
        L.push('- Prices:');
        for (const x of p.prices) {
          const ax = a?.prices.find((y) => y.cycle === x.cycle);
          L.push(`  - ${x.label}: ${amt(x.price, x.currency)}${ax ? ` (${amt(ax.price, 'AED')})` : ''}${x.setupFee ? ` + ${amt(x.setupFee, x.currency)} setup` : ''}${x.perMonth !== null && x.months > 1 ? ` (${amt(x.perMonth, x.currency)}/month equivalent)` : ''}. Order: ${x.orderUrl}`);
        }
      } else L.push(`- Price: on request. Order or ask: ${p.orderUrl || `${S}/contact`}`);
      L.push('');
    }
    if (!full) L.push('');
  }

  if (tlds.length) {
    const list = full ? tlds : tlds.slice(0, 20);
    L.push(full ? '## Domain prices (per year)' : '## Popular domain prices (per year)', '');
    for (const t of list) {
      L.push(`- [${t.tld} domains](${S}${tldHref(t.tld)}): register ${t.register !== null ? amt(t.register, t.currency) : 'n/a'}${t.renew !== null ? `, renew ${amt(t.renew, t.currency)}` : ''}${t.transfer !== null ? `, transfer ${amt(t.transfer, t.currency)}` : ''}${t.promo ? ` (${md(t.promo)})` : ''}`);
    }
    if (!full && tlds.length > list.length) L.push(`- [${tlds.length - list.length} more extensions](${S}/api/catalog/tlds): register, renewal and transfer prices as JSON`);
    L.push(`- [Domain transfer](${S}/domain-transfer): move a domain you own to GlobalHostia (unlock, EPP/auth code, start the transfer, approve), with live transfer prices`);
    L.push('');
  }

  // comparison and how-to pages (lib/theme/learn.ts)
  for (const k of Object.keys(LEARN_SECTIONS) as LearnSection[]) {
    L.push(`## ${LEARN_SECTIONS[k].title}`, '', `- [${LEARN_SECTIONS[k].title}](${S}/${k}): ${md(LEARN_SECTIONS[k].description)}`);
    for (const p of learnPages(k)) L.push(`- [${md(p.title)}](${S}${learnPath(p)}): ${md(p.description)}`);
    // GlobalHostia vs <host> (lib/compare/competitors.ts): only pages not hidden in admin
    if (k === 'compare') for (const c of visibleCompetitors(await getSettings().catch(() => null))) L.push(`- [GlobalHostia vs ${md(c.name)}](${S}${vsPath(c.slug)}): ${md(c.blurb)} Facts about ${md(c.name)} are from its own website, each with a source and date.`);
    L.push('');
  }

  // help centre how-tos (lib/help): short captioned videos and walkthroughs; the full file carries the steps so the
  // site search (lib/ai/site-search.ts) and the chat assistant can find and link the right one
  const how = helpTopics(await getSettings().catch(() => null));
  if (how.length) {
    L.push('## How-to videos', '', `- [Watch how: all how-to videos](${S}/help-center#watch-how)`);
    for (const t of how) {
      const name = `How to ${md(t.title.charAt(0).toLowerCase() + t.title.slice(1))}`;
      // full file: one heading per topic, so each how-to is its own search chunk
      if (full) L.push('', `### ${name}`, '', `- [${name}](${S}${helpPath(t.slug)}): ${md(t.summary)}${t.kind === 'video' ? ' Short captioned video.' : ' Illustrated steps.'}`, ...t.steps.map((x, i) => `  ${i + 1}. ${md(x.en)}`), `  Keywords: ${md(t.keywords)}`);
      else L.push(`- [${name}](${S}${helpPath(t.slug)}): ${md(t.summary)}${t.kind === 'video' ? ' (video)' : ' (step-by-step)'}`);
    }
    L.push('');
  }

  L.push('## Company and support', '');
  L.push(`- [About GlobalHostia](${S}/about)`);
  L.push(`- [Contact sales and support](${S}/contact)`);
  L.push(`- [Help center](${S}/help-center)`);
  L.push(`- [Network and datacenters](${S}/network)`);
  L.push(`- [System status](${S}/status-page)`);
  L.push(`- [Blog](${S}/blog)`);
  L.push('');
  // Arabic section (lib/i18n/ar-pages.ts): the Arabic equivalent of each page, with the searches it answers
  const ar = enabledArDefs((await getSettings().catch(() => ({} as Record<string, unknown>)) as any)?.ar_pages);
  if (ar.length) {
    L.push('## Arabic pages (العربية)', '');
    L.push('Modern Standard Arabic versions of the main pages for the UAE and GCC, with the same live prices as the English pages.', '');
    for (const p of ar) L.push(`- [${md(p.copy.seoTitle)}](${S}${arPathOf(p)}): ${md(p.copy.meta)} English: ${S}${p.en === '/' ? '/' : p.en}`);
    L.push('');
  }
  L.push('## Optional', '');
  L.push(`- [Terms and conditions](${S}/terms-conditions)`);
  L.push(`- [Privacy policy](${S}/privacy-policy)`);
  L.push(`- [Sitemap](${S}/sitemap.xml)`);
  return L.join('\n') + '\n';
}
