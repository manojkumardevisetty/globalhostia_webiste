// n8n automation hosting (and the Binance MCP variant): animated workflow canvas hero, why self-host,
// plans from the mcps category, example workflows, setup steps, FAQ.
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, fromPrice, orderUrl, deriveSpecs, type TProduct, type Catalog } from '../data';
import { page } from '../shell';
import {
  pageHero, sectionHead, splitHead, planCards, plansNote, featureGrid, faq, faqJsonLd, ctaBand, breadcrumbJsonLd, ld, icon, bigTabs, available,
  type FeatureItem, type IconName,
} from '../ui';

type Node = { id: string; label: string; sub: string; icon: IconName; x: number; y: number; tone?: 'brand' | 'gold' };
type Flow = { nodes: Node[]; edges: [string, string][]; aria: string };

const N8N_FLOW: Flow = {
  aria: 'Illustration: an automation workflow. A webhook receives an event, a filter keeps the relevant ones, an AI step summarises them, and the result is posted to Slack and added to Google Sheets.',
  nodes: [
    { id: 'a', label: 'Webhook', sub: 'New lead', icon: 'plug', x: 14, y: 133 },
    { id: 'b', label: 'Filter', sub: 'Qualified only', icon: 'filter', x: 172, y: 133 },
    { id: 'c', label: 'AI agent', sub: 'Score lead', icon: 'spark', x: 330, y: 133, tone: 'brand' },
    { id: 'd', label: 'Slack', sub: 'Notify sales', icon: 'chat', x: 502, y: 40 },
    { id: 'e', label: 'Sheets', sub: 'Append row', icon: 'grid', x: 502, y: 226, tone: 'gold' },
  ],
  edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['c', 'e']],
};
const MCP_FLOW: Flow = {
  aria: 'Illustration: a trading automation. A signal arrives, risk rules check leverage and position size, Claude decides through the MCP server, the order is placed on Binance Futures and the trade is logged.',
  nodes: [
    { id: 'a', label: 'Signal', sub: 'New alert', icon: 'activity', x: 14, y: 133 },
    { id: 'b', label: 'Risk rules', sub: 'Size caps', icon: 'shield', x: 172, y: 133 },
    { id: 'c', label: 'Claude', sub: 'Via MCP', icon: 'bot', x: 330, y: 133, tone: 'brand' },
    { id: 'd', label: 'Binance', sub: 'Futures order', icon: 'trend', x: 502, y: 40, tone: 'gold' },
    { id: 'e', label: 'Trade log', sub: 'Append row', icon: 'grid', x: 502, y: 226 },
  ],
  edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['c', 'e']],
};

const NW = 124, NH = 64;
/** One SVG layout of the flow: horizontal (desktop) or vertical (phones; nodes re-placed in a column + final row). */
function flowSvg(f: Flow, vertical: boolean) {
  const VW = vertical ? 340 : 640, VH = vertical ? 400 : 330;
  const pos = (n: Node, i: number) => (vertical ? (i < 3 ? { x: (VW - NW) / 2, y: 14 + i * 100 } : { x: i === 3 ? 18 : VW - NW - 18, y: 316 }) : { x: n.x, y: n.y });
  const P = new Map(f.nodes.map((n, i) => [n.id, pos(n, i)]));
  const paths = f.edges.map(([s, t], i) => {
    const a = P.get(s)!, b = P.get(t)!;
    if (vertical) {
      const x1 = a.x + NW / 2, y1 = a.y + NH, x2 = b.x + NW / 2, y2 = b.y, dy = (y2 - y1) / 2;
      return `<path class="wf-edge" d="M${x1} ${y1} C${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}" data-from="${s}" data-to="${t}"/>`;
    }
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, dx = (x2 - x1) / 2;
    return `<path id="wf-e${i}" class="wf-edge" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}" data-from="${s}" data-to="${t}"/>`;
  }).join('');
  const ports = vertical ? `<circle class="wf-port" cx="${NW / 2}" cy="0" r="4"/><circle class="wf-port" cx="${NW / 2}" cy="${NH}" r="4"/>` : `<circle class="wf-port" cx="0" cy="${NH / 2}" r="4"/><circle class="wf-port" cx="${NW}" cy="${NH / 2}" r="4"/>`;
  const nodes = f.nodes.map((n) => { const q = P.get(n.id)!; return `<g class="wf-node${n.tone ? ` is-${n.tone}` : ''}" data-node="${n.id}" transform="translate(${q.x} ${q.y})">
      <rect class="wf-node__ring" x="-5" y="-5" width="${NW + 10}" height="${NH + 10}" rx="16"/>
      <rect class="wf-node__box" width="${NW}" height="${NH}" rx="12"/>
      <rect class="wf-node__ico" x="12" y="16" width="32" height="32" rx="8"/>
      <use href="#i-${n.icon}" x="18" y="22" width="20" height="20" class="wf-node__glyph"/>
      <text x="54" y="29" class="wf-node__t">${esc(n.label)}</text>
      <text x="54" y="45" class="wf-node__s">${esc(n.sub)}</text>
      <circle class="wf-node__ok" cx="${NW - 4}" cy="4" r="7"/><path class="wf-node__tick" d="M${NW - 7} 4l2 2 4-4"/>
      ${ports}
    </g>`; }).join('');
  const gid = vertical ? 'wf-grid-v' : 'wf-grid';
  return `<svg class="wf__svg wf__svg--${vertical ? 'v' : 'h'}" viewBox="0 0 ${VW} ${VH}" aria-hidden="true" focusable="false">
    <defs><pattern id="${gid}" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="wf-gridpt"/></pattern></defs>
    <rect width="${VW}" height="${VH}" fill="url(#${gid})"/>
    <g class="wf-edges">${paths}</g>
    <g class="wf-pulses" data-wf-pulses></g>
    ${nodes}
  </svg>`;
}
function canvas(f: Flow) {
  return `<figure class="wf" data-wf role="img" aria-label="${esc(f.aria)}">
  <div class="wf__bar" aria-hidden="true"><span class="wf__dot"></span><b>Workflow</b><span class="wf__state"><i></i>Active</span><span class="wf__runs">Runs <b class="num" data-wf-runs>0</b></span></div>
  ${flowSvg(f, false)}${flowSvg(f, true)}
  <figcaption class="wf__cap">Illustration</figcaption>
</figure>`;
}

/** Product names in the fixture can be broken (". .99"); fall back to a name built from the specs. */
function displayName(p: TProduct, kind: string) {
  if (/[a-z]{3,}/i.test(p.name)) return p.name;
  const s = deriveSpecs(p.features, p.attributes);
  const cpu = (s.cpu || '').match(/(\d+)\s*v?cpu/i)?.[1], ram = (s.ram || '').match(/(\d+)\s*GB/i)?.[1];
  return `${kind}${cpu ? ` ${cpu} vCPU` : ''}${ram ? ` / ${ram} GB` : ''}`.trim();
}

function offersLd(ps: TProduct[], cat: Catalog, site: string, name: string) {
  const items = ps.map((p) => ({ p, f: fromPrice(p, cat.currency) })).filter((x) => x.f);
  if (!items.length) return '';
  return ld({ '@context': 'https://schema.org', '@type': 'ItemList', name, itemListElement: items.map((x, i) => ({
    '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: x.p.name, url: `${site}/p/${x.p.slug}`,
      offers: { '@type': 'Offer', price: x.f!.price.toFixed(2), priceCurrency: cat.currency, url: orderUrl(x.p, cat.base, x.f!.cycle), availability: 'https://schema.org/InStock' } },
  })) });
}

/** Small inline chain of steps used in the example tabs. */
const chain = (steps: [IconName, string][]) =>
  `<ol class="wf-chain">${steps.map(([ic, t], i) => `<li style="--i:${i}"><span>${icon(ic)}</span>${esc(t)}</li>`).join('')}</ol>`;

export default async function render(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const { currency, base } = cat;
  const site = String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const mcp = ctx.slug === 'binance';
  // The WHMCS group "mcps" holds both the n8n servers and the Binance MCP engines: split them by name/slug.
  const isBinance = (p: TProduct) => /binance|mcp|engine/i.test(`${p.name} ${p.slug}`);
  const products = available(productsFor(cat, ctx.route.categories)).filter((p) => (mcp ? isBinance(p) : !isBinance(p))).map((p) => ({ ...p, name: displayName(p, mcp ? 'MCP Engine' : 'n8n Server') }));
  const specs = products.map((p) => deriveSpecs(p.features, p.attributes));
  const cpus = specs.map((s) => +((s.cpu || '').match(/(\d+)/)?.[1] || 0)).filter(Boolean);
  const rams = specs.map((s) => +((s.ram || '').match(/(\d+)/)?.[1] || 0)).filter(Boolean);
  const nvme = products.some((p) => p.features.some((f) => /nvme/i.test(f)));
  const freeSsl = products.some((p) => p.features.some((f) => /ssl/i.test(f) && !f.startsWith('-')));
  const bw = specs.map((s) => s.bandwidth).find(Boolean);
  const range = (a: number[], u: string) => (a.length ? (Math.min(...a) === Math.max(...a) ? `${a[0]} ${u}` : `${Math.min(...a)} to ${Math.max(...a)} ${u}`) : '');

  const trail = mcp
    ? [{ label: 'Home', href: '/' }, { label: 'n8n automation', href: '/n8n-automation' }, { label: 'Binance MCPs' }]
    : [{ label: 'Home', href: '/' }, { label: ctx.route.title }];

  /* hero */
  const hero = pageHero({
    crumbs: trail,
    eyebrow: mcp ? 'AI trading automation' : 'Self-hosted automation',
    title: mcp ? 'Binance MCPs and trading automation, on your own server.' : 'Your workflows, your server, no execution meter.',
    lead: mcp
      ? 'MCP server infrastructure that connects Claude to your Binance Futures account. Ask for analysis, place and manage orders, and automate strategies with risk limits you set. Your API keys and funds stay under your control.'
      : 'Run n8n on a server sized for automation. Connect your apps, add AI steps and trigger workflows from webhooks or schedules, with the data kept on infrastructure you choose.',
    ctas: [{ label: 'See plans', href: '#plans' }, { label: mcp ? 'How it works' : 'Why self-host', href: mcp ? '#how' : '#why', variant: 'ghost' }],
    trust: [cpus.length ? `${range(cpus, 'vCPU')} per server` : 'Dedicated resources', nvme ? 'NVMe storage' : 'Fast storage', freeSsl ? 'Free SSL certificate' : 'Secure HTTPS'],
    visualHtml: canvas(mcp ? MCP_FLOW : N8N_FLOW),
  });

  /* why self-host */
  const rows: [string, string, string][] = mcp ? [
    ['Your keys', 'Some trading bots ask you to hand over API keys to a shared service.', 'You create the Binance API keys and decide their permissions. We never hold withdrawal access or your funds.'],
    ['Risk limits', 'Fixed settings, or none at all.', 'Leverage caps, position size limits and a symbol whitelist that you configure.'],
    ['How you trade', 'Learn a bot builder or a scripting language.', 'Ask Claude in plain language, and combine it with other MCP servers for analysis.'],
    ['Resources', 'Shared with every other user of the service.', `Your own server${cpus.length ? ` with ${range(cpus, 'vCPU')}` : ''}${rams.length ? ` and ${range(rams, 'GB')} of memory` : ''}.`],
  ] : [
    ['Executions', 'Counted on every run and capped by your plan tier.', 'Not counted by us. Run as often as your server resources allow.'],
    ['Your data', 'Payloads and credentials stored on the provider’s cloud.', 'Workflow data and credentials stay on your server, in the datacenter you choose.'],
    ['Flexibility', 'Limited to the nodes and code the platform allows.', 'Install community nodes, run custom code and call any internal API.'],
    ['Cost as you grow', 'Rises with every extra task or operation.', 'A fixed monthly price for the server, whatever the run count.'],
  ];
  const colA = mcp ? 'Typical shared bot service' : 'Per-execution cloud plans', colB = mcp ? 'Your Globalhostia MCP engine' : 'Your n8n server at Globalhostia';
  const why = `<section class="hp-section" id="why" aria-labelledby="why-h"><div class="hp-container">
    ${splitHead({ id: 'why-h', title: mcp ? 'Why run your own MCP engine' : 'Why self-host n8n', lead: mcp ? 'The MCP server is the bridge between Claude and your exchange account. Running your own keeps control where it belongs.' : 'Hosted automation tools charge per task. Your own n8n server turns automation into a fixed cost and keeps the data with you.' })}
    <div class="wf-vs" data-reveal role="table" aria-label="${esc(mcp ? 'Shared trading bots compared with your own MCP engine' : 'Per-execution automation plans compared with your own n8n server')}">
      <div class="wf-vs__row wf-vs__head" role="row"><span role="columnheader"><span class="sr-only">Topic</span></span><span role="columnheader">${esc(colA)}</span><span role="columnheader">${esc(colB)}</span></div>
      ${rows.map(([k, a, b], i) => `<div class="wf-vs__row" role="row" style="--i:${i}"><span role="rowheader">${esc(k)}</span><span role="cell" class="wf-vs__them" data-label="${esc(colA)}">${icon('minus')}<span>${esc(a)}</span></span><span role="cell" class="wf-vs__us" data-label="${esc(colB)}">${icon('check')}<span>${esc(b)}</span></span></div>`).join('')}
    </div>
  </div></section>`;

  /* plans */
  const plans = `<section class="hp-section hp-section--tint" id="plans" aria-labelledby="plans-h"><div class="hp-container">
    ${sectionHead({ id: 'plans-h', title: mcp ? 'Choose your engine' : 'n8n servers sized for automation', lead: mcp ? 'Both plans include the same core trading features and safety rails. Pick the resources that match how often you trade.' : 'Pick the vCPU and memory for your workload. Heavy AI or data steps need more memory; simple app-to-app flows run well on the smaller server.' })}
    ${planCards(products, { currency, base, id: 'wf-plans', orderLabel: mcp ? 'Order engine' : 'Order server',
      note: 'Prices are confirmed live in the order form.',
      emptyTitle: 'Plans are being updated', emptyText: 'Tell us how many workflows you run and we will size a server for you.' })}
    ${plansNote(currency)}
  </div></section>`;

  /* examples */
  const examples = mcp ? [
    { label: 'Signal to order', icon: 'trend' as IconName, steps: [['activity', 'Analysis signal arrives'], ['shield', 'Risk rules check size and leverage'], ['bot', 'Claude confirms the setup'], ['trend', 'Order placed on Binance Futures']] as [IconName, string][], text: 'Combine an analysis MCP with your Binance MCP. Claude reads the signal, checks it against your limits and places a market or limit order, with stop-loss and take-profit.' },
    { label: 'Position watch', icon: 'eye' as IconName, steps: [['clock', 'Every few minutes'], ['chart', 'Read open positions and margin'], ['filter', 'Compare with your rules'], ['chat', 'Alert you or reduce exposure']] as [IconName, string][], text: 'Ask Claude to keep an eye on open positions, margin use and funding rates, and to tell you, or act, when something crosses a line you set.' },
    { label: 'Daily report', icon: 'calendar' as IconName, steps: [['calendar', 'End of the trading day'], ['database', 'Collect fills and balances'], ['spark', 'Summarise PnL and ROI'], ['grid', 'Save to your trade log']] as [IconName, string][], text: 'Turn the day’s trades into a short written summary with profit and loss, ROI and the positions still open.' },
  ] : [
    { label: 'Lead routing', icon: 'users' as IconName, steps: [['plug', 'Form webhook'], ['filter', 'Filter by budget'], ['spark', 'AI summary'], ['chat', 'Post to the sales channel']] as [IconName, string][], text: 'Every new enquiry is checked, summarised by an AI step and sent to the right person within seconds, with a copy in your CRM.' },
    { label: 'Support triage', icon: 'headset' as IconName, steps: [['mail', 'New support email'], ['bot', 'Classify topic and urgency'], ['ticket', 'Create a ticket'], ['chat', 'Alert on-call if urgent']] as [IconName, string][], text: 'Read incoming messages, tag them by topic and urgency, open tickets automatically and wake someone up only when it matters.' },
    { label: 'Reporting', icon: 'chart' as IconName, steps: [['clock', 'Every Monday 08:00'], ['database', 'Query your database'], ['chart', 'Build the numbers'], ['grid', 'Update the sheet and email it']] as [IconName, string][], text: 'Scheduled workflows pull figures from your systems, update a shared sheet and send the weekly summary before the team logs in.' },
  ];
  const ex = `<section class="hp-section" aria-labelledby="ex-h"><div class="hp-container">
    ${sectionHead({ id: 'ex-h', title: mcp ? 'What traders automate' : 'What teams automate with n8n', lead: mcp ? 'Examples of conversations and routines people run through their MCP engine.' : 'A few common workflows. Each runs on your server, as often as you need.' })}
    ${bigTabs(examples.map((e) => ({ label: e.label, icon: e.icon, panelHtml: `<div class="wf-ex" data-reveal>${chain(e.steps)}<p>${esc(e.text)}</p></div>` })), { label: 'Example workflows', id: 'wf-ex' })}
    ${mcp ? '<p class="wf-risk">Examples only. Futures trading carries a high risk of loss, and automation does not guarantee results. You are responsible for your trading decisions and risk settings.</p>' : ''}
  </div></section>`;

  /* features */
  const feats: FeatureItem[] = mcp ? [
    { icon: 'chat', title: 'Conversational trading', text: 'Trade by asking Claude in plain language. No order forms or scripting.' },
    { icon: 'bolt', title: 'Market and limit orders', text: 'Open and close positions, with stop-loss, take-profit and reduce-only orders.' },
    { icon: 'shield', title: 'Built-in risk limits', text: 'Configurable leverage caps, position size limits and a daily loss circuit breaker.' },
    { icon: 'filter', title: 'Symbol whitelist', text: 'Trade only the pairs you approve, so a typo never opens an unexpected position.' },
    { icon: 'key', title: 'Your keys, your control', text: 'API keys you create and can revoke at any time. We never have withdrawal access.' },
    { icon: 'net', title: 'Works with other MCPs', text: 'Combine with analysis MCP servers so Claude can read signals and act on them in one conversation.' },
    { icon: 'chart', title: 'Position analytics', text: 'Balances, margin use, PnL and ROI for your open and closed positions.' },
    { icon: 'lock', title: 'Private MCP URL', text: 'Token-authenticated endpoint for your MCP client, served over HTTPS.' },
    { icon: 'headset', title: 'Setup assistance', text: 'Our team helps connect your first Binance account and your MCP client.' },
  ] : [
    { icon: 'flow', title: 'Unlimited workflows', text: 'Build as many workflows as you like. The server, not a pricing tier, sets the pace.' },
    { icon: 'lock', title: 'Your data stays put', text: 'Credentials and run data live on your server, not on a third-party cloud.' },
    { icon: 'spark', title: 'AI steps', text: 'Add AI agents and chains that call the model provider you choose, with your own API keys.' },
    { icon: 'plug', title: 'Webhooks and schedules', text: 'Start workflows from webhooks, app events or cron-style schedules.' },
    { icon: 'code', title: 'Custom code', text: 'Drop into JavaScript or Python when a built-in node is not enough.' },
    ...(cpus.length ? [{ icon: 'cpu' as IconName, title: `${range(cpus, 'vCPU')}`, text: `${rams.length ? `With ${range(rams, 'GB')} of memory, so` : 'So'} parallel runs and heavy AI steps have room to work.` }] : []),
    ...(nvme ? [{ icon: 'drive' as IconName, title: 'NVMe storage', text: 'Fast disks for the n8n database, binary files and execution history.' }] : []),
    ...(freeSsl ? [{ icon: 'shield' as IconName, title: 'Free SSL certificate', text: 'Your editor and webhook URLs are served over HTTPS.' }] : []),
    ...(bw ? [{ icon: 'net' as IconName, title: `${bw}`, text: 'Plenty of transfer for API calls, webhooks and file syncs.' }] : []),
  ];
  const features = `<section class="hp-section hp-section--dark hp-on-dark" aria-labelledby="feat-h"><div class="hp-container">
    ${splitHead({ id: 'feat-h', title: mcp ? 'What you get with your MCP engine' : 'Everything your automations need', lead: mcp ? 'Trading power, safety rails and the infrastructure to keep it running.' : 'A server set up for n8n, with the resources and security to run it around the clock.' })}
    ${featureGrid(feats.slice(0, 9))}
  </div></section>`;

  /* steps */
  const steps = mcp ? [
    ['Choose a plan', 'Pick the engine that matches your trading volume and how fast you need responses.'],
    ['Connect your API', 'Create Binance API keys with futures trading enabled, and add them to your engine.'],
    ['Add it to Claude', 'Add your private MCP URL and token to Claude Desktop or another MCP client. We give you step-by-step instructions.'],
    ['Start trading', 'Ask Claude for analysis or an order, and watch it execute within the limits you set.'],
  ] : [
    ['Choose a server', 'Pick the vCPU and memory that match your workflows. You can move up later.'],
    ['We provision it', 'Your server is set up and you receive the login details by email.'],
    ['Open the editor', 'Sign in to n8n at your own HTTPS address and import or build your first workflow.'],
    ['Connect your apps', 'Add credentials for your tools and turn workflows on. They run around the clock.'],
  ];
  const how = `<section class="hp-section" id="how" aria-labelledby="how-h"><div class="hp-container">
    ${sectionHead({ id: 'how-h', title: 'From order to first run', lead: 'Four steps. Our team is on hand at each one.' })}
    <ol class="wf-steps">${steps.map(([t, d], i) => `<li data-reveal style="--i:${i}"><span class="wf-steps__n num" aria-hidden="true">${i + 1}</span><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('')}</ol>
  </div></section>`;

  /* FAQ */
  const faqs = mcp ? [
    { q: 'Do you have access to my Binance account or funds?', a: 'No. You create and manage your own Binance API keys with trading permissions. Your funds remain on Binance under your control. We provide the MCP server that connects Claude to your API, without custody or withdrawal access.' },
    { q: 'What is the difference between the plans?', a: 'Both include the same core trading features and safety rails. Larger plans give you more dedicated resources for faster responses and for running several strategies or accounts at once.' },
    { q: 'Which safety features are included?', a: 'Maximum leverage limits, per-trade position size caps, a symbol whitelist and a daily loss circuit breaker. All of them are configurable to match your risk tolerance.' },
    { q: 'Can I use it alongside other MCP servers?', a: 'Yes. Claude can combine your Binance MCP with other MCP servers, for example one that provides technical analysis signals, in a single conversation.' },
    { q: 'What happens to my positions if the server is unavailable?', a: 'Open positions stay on Binance. The MCP server only sends commands; it does not hold positions. You can always manage your account directly in the Binance app or website.' },
    { q: 'Can I upgrade later?', a: 'Yes. Upgrade from your client area at any time; the price difference is prorated.' },
  ] : [
    { q: 'Is n8n free to self-host?', a: 'n8n offers a self-hosted Community Edition under its fair-code license, which you can run on your own server. Check n8n’s license terms for your use case, especially if you plan to offer n8n as a service to others.' },
    { q: 'How many workflows and executions can I run?', a: 'We do not count or cap workflows or executions. The practical limit is the server’s CPU, memory and storage, so choose a larger plan for heavy or very frequent workflows.' },
    { q: 'Which plan do I need?', a: 'Simple app-to-app workflows run comfortably on the smaller server. Choose more vCPU and memory if you process large files, run AI steps on many items, or have many workflows running in parallel.' },
    { q: 'Can I use AI models in my workflows?', a: 'Yes. n8n has AI agent and chain nodes that connect to model providers with your own API keys. Running the models themselves on the server needs far more memory; see our AI and LLM servers for that.' },
    { q: 'Can I move my existing workflows here?', a: 'Yes. Export workflows as JSON from your current n8n instance and import them in the editor. Credentials need to be added again on the new server.' },
    { q: 'Who keeps n8n updated?', a: 'Contact our support team to agree how updates are handled for your server. We can help you update n8n and take a backup before you do.' },
  ];
  const faqSec = `<section class="hp-section hp-section--tint" aria-labelledby="faq-h"><div class="hp-container">
    ${sectionHead({ id: 'faq-h', title: mcp ? 'Binance MCP questions' : 'n8n hosting questions' })}
    ${faq(faqs, { id: 'wf-faq', single: true })}
  </div></section>`;

  const cta = ctaBand({ id: 'cta', title: mcp ? 'Put Claude to work on your trading' : 'Automate the busywork on your own server',
    text: mcp ? 'Order an engine, connect your API keys and start with the limits you choose.' : 'Choose a server, open the editor and switch on your first workflow today.',
    primary: { label: mcp ? 'Choose an engine' : 'Choose a server', href: '#plans' }, secondary: { label: 'Talk to our team', href: '/contact' } });

  return page({
    ctx, catalog: cat, path: `/${ctx.slug}`, title: ctx.route.title, description: ctx.route.description, css: ['n8n'], js: ['n8n'],
    jsonLd: [breadcrumbJsonLd(trail.map((c) => ({ ...c, href: c.href || `/${ctx.slug}` })), site), faqJsonLd(faqs), offersLd(products, cat, site, ctx.route.title)].filter(Boolean),
    body: [hero, why, plans, ex, features, how, faqSec, cta].join('\n'),
  });
}
