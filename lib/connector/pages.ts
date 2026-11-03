// Public pages for the account connector: /connectors (customers) and /docs/mcp (setup and tool reference).
// Copy comes from Admin → AI connectors (settings.connector.pages); tools, scopes and endpoints from the code itself,
// so the reference can never drift from what the server does.
import 'server-only';
import { esc } from '../render/util';
import { pageHero, sectionHead, section, faq, faqJsonLd, breadcrumbJsonLd, ctaBand, ld } from '../theme/ui';
import { SCOPES, CLAUDE_CALLBACKS, CHATGPT_CALLBACK, ACCESS_TTL_S, REFRESH_TTL_S, GRANT_TTL_S } from '../oauth/core';
import { TOOLS } from './tools';
import type { ConnectorConfig } from './config-core';

export const PAGE_CSS = `<style>.cn-pg ol,.cn-pg ul.hp-prose{list-style:revert;padding-left:1.3em}.cn-pg ol li{margin:.35em 0}
.cn-pg .hp-prose a{color:#a6225f;text-decoration:underline;text-underline-offset:2px}
.cn-grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.cn-card{border:1px solid #e6e9ee;border-radius:14px;padding:22px 22px 10px;background:#fff;min-width:0}.cn-card h3{margin:0 0 10px;font-size:1.15rem}
.cn-ex{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));list-style:none;padding:0;margin:0}
.cn-ex li{background:#fff;border:1px solid #e6e9ee;border-radius:12px;padding:14px 16px;font-size:1.02rem;line-height:1.45}.cn-ex li::before{content:"“";color:#a6225f;font-weight:800;margin-right:2px}
.cn-tbl{width:100%;border-collapse:collapse;font-size:.95rem}.cn-tbl th,.cn-tbl td{text-align:left;padding:10px 12px;border-top:1px solid #e6e9ee;vertical-align:top}
.cn-tbl th{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#5b6573;border-top:0}.cn-tbl code{font-size:.88em;word-break:break-word}
.cn-wrap{overflow-x:auto;border:1px solid #e6e9ee;border-radius:12px;background:#fff}
.cn-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.78rem;font-weight:600;background:#eef1f5;color:#2b3440;white-space:nowrap}.cn-pill--w{background:#fdf0f5;color:#8a1c4f}.cn-pill--d{background:#fff1e6;color:#9a3b00}
.cn-code{background:#16212b;color:#f6f7f9;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:8px 0 14px}
.cn-tool{border-top:1px solid #e6e9ee;padding:18px 0}.cn-tool:first-of-type{border-top:0}.cn-tool h3{margin:0 0 6px;font-size:1.08rem}.cn-tool h3 code{font-size:.95em}
.cn-params{margin:.5em 0 0;padding-left:1.2em;font-size:.94rem}.cn-params code{font-size:.92em}
@media (max-width:640px){.cn-tbl th,.cn-tbl td{padding:8px}}</style>`;

const code = (s: string) => `<pre class="cn-code"><code>${esc(s)}</code></pre>`;
const card = (title: string, html: string) => `<div class="cn-card"><h3>${esc(title)}</h3>${html}</div>`;
const pill = (t: string, k = '') => `<span class="cn-pill${k ? ` cn-pill--${k}` : ''}">${esc(t)}</span>`;
const days = (s: number) => Math.round(s / 86400);

export function connectorsBody(cfg: ConnectorConfig, site: string) {
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'AI connectors' }];
  const p = cfg.pages;
  const hero = pageHero({
    eyebrow: 'Claude and ChatGPT connector', title: p.headline, crumbs, network: false, lead: p.intro,
    ctas: [{ label: 'Connect in Claude', href: '#claude', variant: 'brand' }, { label: 'Connect in ChatGPT', href: '#chatgpt', variant: 'ghost' }],
  });
  const examples = section(`<div class="hp-container">${sectionHead({ id: 'examples', title: 'Ask in plain language', lead: 'A few things customers ask their assistant once GlobalHostia is connected.' })}
    <ul class="cn-ex">${p.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`, { labelledby: 'examples' });
  const connect = section(`<div class="hp-container">${sectionHead({ id: 'connect', title: 'Connect in two minutes', lead: 'You sign in on globalhostia.com and choose what the assistant may do. Your password never goes to the assistant.' })}
    <div class="cn-grid">
      <div class="cn-card" id="claude"><h3>Claude (web, desktop and mobile)</h3><ol class="hp-prose">
        <li>In Claude, open <b>Customize &gt; Connectors</b> and search for <b>GlobalHostia</b>. If it is not listed yet, choose <b>Add custom connector</b> and paste the URL below.</li>
        <li>Choose <b>Connect</b>. A GlobalHostia window opens: sign in with your account email and password.</li>
        <li>Review the permissions, untick anything you do not want, and choose <b>Allow access</b>.</li>
        <li>In a chat, turn GlobalHostia on from the <b>+</b> menu and ask away.</li></ol>${code(`${site}/mcp`)}</div>
      <div class="cn-card" id="chatgpt"><h3>ChatGPT</h3><ol class="hp-prose">
        <li>In ChatGPT, open <b>Apps</b> and search for <b>GlobalHostia</b>, then choose <b>Connect</b>.</li>
        <li>If it is not listed yet: <b>Settings &gt; Apps &amp; Connectors &gt; Advanced</b>, turn on developer mode, then <b>Create</b> with the URL below and OAuth authentication.</li>
        <li>Sign in on globalhostia.com and choose <b>Allow access</b>.</li></ol>${code(`${site}/mcp/chatgpt`)}</div>
      <div class="cn-card"><h3>Claude Code and other MCP apps</h3><p class="hp-prose">Add the server, then sign in when your app asks:</p>${code(`claude mcp add --transport http globalhostia ${site}/mcp`)}
        <p class="hp-prose">Any client that supports remote MCP servers (Streamable HTTP) with OAuth works. Details: <a href="/docs/mcp">developer documentation</a>.</p></div>
    </div></div>`, { labelledby: 'connect', tint: true });
  const scopeRows = Object.entries(SCOPES).map(([k, s]) => `<tr><td><b>${esc(s.label)}</b><br><small>${esc(s.detail)}</small></td><td>${s.write ? pill('Change', 'w') : pill('See')}</td></tr>`).join('');
  const perms = section(`<div class="hp-container">${sectionHead({ id: 'permissions', title: 'You decide what it can do', lead: 'The consent page lists every permission in plain words. Untick any you do not want; you can reconnect later to add more.' })}
    <div class="cn-wrap"><table class="cn-tbl"><thead><tr><th>Permission</th><th>Type</th></tr></thead><tbody>${scopeRows}</tbody></table></div></div>`, { labelledby: 'permissions' });
  const security = section(`<div class="hp-container">${sectionHead({ id: 'security', title: 'Built to keep your account safe' })}
    <div class="cn-grid">
      ${card('Never payments or passwords', '<p class="hp-prose">Assistants cannot pay, place orders, see card details or service passwords, change your password or delete your account. Renewal and order links open on globalhostia.com, where you review and pay yourself.</p>')}
      ${card('Confirm before anything risky', '<p class="hp-prose">Claude and ChatGPT ask before every change. Deleting DNS records or mailboxes, overwriting a record and changing nameservers also need your explicit confirmation of the exact change.</p>')}
      ${card('Only your account, only what you allowed', `<p class="hp-prose">Every request is checked against the account you signed in with and the permissions you approved. Access tokens last one hour and are stored only as one-way hashes; a connection ends after ${days(GRANT_TTL_S)} days at the latest.</p>`)}
      ${card('Every change recorded, disconnect anytime', '<p class="hp-prose">Each change made through a connector is recorded with the app and time. Disconnect in <a href="/account/apps">your account under Connected apps</a>, and access ends immediately. See our <a href="/privacy-policy">privacy policy</a>.</p>')}
    </div></div>`, { labelledby: 'security', tint: true });
  const qs = p.faq;
  const faqHtml = section(`<div class="hp-container">${sectionHead({ id: 'cn-faq', title: 'Questions', align: 'left' })}${faq(qs, { id: 'cn-faq-list', single: true })}</div>`, { labelledby: 'cn-faq' });
  const cta = ctaBand({ title: 'Need a hand connecting?', text: `Our team is available around the clock. Email ${p.supportEmail} or open a ticket.`, primary: { label: 'Contact support', href: '/contact' }, secondary: { label: 'Developer documentation', href: '/docs/mcp' } });
  const webApi = ld({ '@context': 'https://schema.org', '@type': 'WebAPI', name: 'GlobalHostia account connector (MCP)', description: p.intro, url: `${site}/connectors`,
    documentation: `${site}/docs/mcp`, termsOfService: `${site}/terms-conditions`, provider: { '@id': `${site}/#organization` }, potentialAction: { '@type': 'ConsumeAction', target: `${site}/mcp` } });
  return {
    crumbs, jsonLd: [breadcrumbJsonLd(crumbs.map((c) => ({ ...c, href: c.href || '/connectors' })), site), faqJsonLd(qs), webApi],
    body: [PAGE_CSS, '<div class="cn-pg">', hero, examples, connect, perms, security, faqHtml, cta, '</div>'].join('\n'),
  };
}

function params(schema: any) {
  const props = Object.entries((schema?.properties || {}) as Record<string, any>);
  if (!props.length) return '<p class="hp-prose"><small>No parameters.</small></p>';
  const req = new Set<string>(schema.required || []);
  return `<ul class="cn-params">${props.map(([k, v]) => {
    const type = v.enum ? v.enum.map((x: string) => `"${x}"`).join(' | ') : v.type === 'array' ? `array of ${v.items?.type || 'string'}` : v.const !== undefined ? `${v.type} (${JSON.stringify(v.const)})` : v.type;
    return `<li><code>${esc(k)}</code>${req.has(k) ? ' <b>required</b>' : ''} · <small>${esc(type)}</small>${v.description ? `: ${esc(v.description)}` : ''}</li>`;
  }).join('')}</ul>`;
}

export function docsBody(site: string) {
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'AI connectors', href: '/connectors' }, { label: 'Developer documentation' }];
  const hero = pageHero({
    eyebrow: 'Developers', title: 'GlobalHostia MCP server: setup and tool reference', crumbs, network: false,
    lead: 'A remote MCP server (Streamable HTTP) with OAuth 2.1 sign-in. Public tools work without signing in; account tools ask the customer to sign in on globalhostia.com the first time they are used.',
    ctas: [{ label: 'Tool reference', href: '#tools', variant: 'brand' }, { label: 'Customer guide', href: '/connectors', variant: 'ghost' }],
  });
  const ep = [
    ['MCP server (Claude, Claude Code, other clients)', `${site}/mcp`],
    ['MCP server for ChatGPT (no commerce tools)', `${site}/mcp/chatgpt`],
    ['Public read-only shopping server (no sign-in)', `${site}/api/mcp`],
    ['Protected resource metadata (RFC 9728)', `${site}/.well-known/oauth-protected-resource/mcp`],
    ['Authorization server metadata (RFC 8414)', `${site}/.well-known/oauth-authorization-server`],
    ['Authorization endpoint', `${site}/oauth/authorize`], ['Token endpoint', `${site}/oauth/token`],
    ['Dynamic client registration (RFC 7591)', `${site}/oauth/register`], ['Token revocation (RFC 7009)', `${site}/oauth/revoke`],
  ];
  const setup = section(`<div class="hp-container">${sectionHead({ id: 'endpoints', title: 'Endpoints' })}
    <div class="cn-wrap"><table class="cn-tbl"><thead><tr><th>What</th><th>URL</th></tr></thead><tbody>${ep.map(([a, b]) => `<tr><td>${esc(a)}</td><td><code>${esc(b)}</code></td></tr>`).join('')}</tbody></table></div>
    <div class="cn-grid" style="margin-top:22px">
      ${card('Claude', `<p class="hp-prose">Add a custom connector with <code>${esc(site)}/mcp</code>. Claude registers itself (Client ID Metadata Document or Dynamic Client Registration) and signs in on first use of an account tool.</p>`)}
      ${card('Claude Code', code(`claude mcp add --transport http globalhostia ${site}/mcp`) + '<p class="hp-prose">Then run <code>/mcp</code> and choose Authenticate.</p>')}
      ${card('ChatGPT', `<p class="hp-prose">Use <code>${esc(site)}/mcp/chatgpt</code> with OAuth. Tools declare <code>securitySchemes</code>; a signed-out call to an account tool returns <code>_meta["mcp/www_authenticate"]</code> so ChatGPT shows the connect button.</p>`)}
      ${card('MCP Inspector', code(`npx @modelcontextprotocol/inspector --cli ${site}/mcp --transport http --method tools/list`) + '<p class="hp-prose">For account tools, use the Inspector UI: it completes the OAuth flow with a localhost redirect.</p>')}
    </div></div>`, { labelledby: 'endpoints' });
  const auth = section(`<div class="hp-container">${sectionHead({ id: 'auth', title: 'Authentication' })}
    <ul class="hp-prose">
      <li><b>OAuth 2.1, authorization code with PKCE (S256 only)</b>. Public clients (<code>token_endpoint_auth_method: none</code>); confidential DCR clients may use <code>client_secret_post</code> or <code>client_secret_basic</code>.</li>
      <li><b>Client registration</b>: Dynamic Client Registration, or an https <code>client_id</code> pointing to a Client ID Metadata Document (<code>client_id_metadata_document_supported: true</code>).</li>
      <li><b>Redirect URIs</b>: ${CLAUDE_CALLBACKS.map((u) => `<code>${esc(u)}</code>`).join(', ')}, <code>${esc(CHATGPT_CALLBACK)}</code>, <code>https://chatgpt.com/connector/oauth/{id}</code>, and loopback <code>http://localhost</code> / <code>127.0.0.1</code> on any port. Other https redirect URIs are accepted with a warning on the consent page (or refused when the store owner restricts them).</li>
      <li><b>Resource indicators (RFC 8707)</b>: send <code>resource=${esc(site)}/mcp</code> (or <code>/mcp/chatgpt</code>). Tokens are bound to that resource and refused by the other endpoint.</li>
      <li><b>Tokens</b>: opaque bearer tokens in the <code>Authorization</code> header only. Access tokens last ${ACCESS_TTL_S / 60} minutes; refresh tokens ${days(REFRESH_TTL_S)} days and rotate on every use (a reused refresh token revokes the connection). A connection lasts at most ${days(GRANT_TTL_S)} days.</li>
      <li><b>Challenges</b>: a missing token on an account tool gives <code>401</code> with <code>WWW-Authenticate: Bearer resource_metadata="…", scope="…"</code>; a token lacking the tool's scope gives <code>403</code> with <code>error="insufficient_scope"</code>. The authorization response includes <code>iss</code> (RFC 9207).</li>
      <li><b>Scopes</b>: ${Object.keys(SCOPES).map((s) => `<code>${esc(s)}</code>`).join(', ')}. <code>offline_access</code> is accepted.</li>
      <li><b>Accounts with two-factor authentication</b> cannot complete the connector sign-in yet.</li>
    </ul></div>`, { labelledby: 'auth', tint: true });
  const tools = section(`<div class="hp-container">${sectionHead({ id: 'tools', title: `Tool reference (${TOOLS.length} tools)`, lead: 'Read-only tools are marked readOnlyHint; tools that overwrite or delete are marked destructiveHint and refuse until called with confirm: true after the customer confirms.' })}
    ${TOOLS.map((t) => `<div class="cn-tool" id="tool-${esc(t.name)}"><h3><code>${esc(t.name)}</code> · ${esc(t.title)}</h3>
      <p>${t.scope ? pill(`scope ${t.scope}`, SCOPES[t.scope]?.write ? 'w' : '') : pill('no sign-in')} ${t.annotations.readOnlyHint ? pill('read-only') : pill('changes data', 'w')} ${t.annotations.destructiveHint ? pill('destructive: confirm required', 'd') : ''} ${t.commerce ? pill('not on /mcp/chatgpt') : ''}</p>
      <p class="hp-prose">${esc(t.description)}</p>${params(t.inputSchema)}</div>`).join('')}
  </div>`, { labelledby: 'tools' });
  const limits = section(`<div class="hp-container">${sectionHead({ id: 'limits', title: 'Errors and limits' })}
    <ul class="hp-prose">
      <li>Tool failures return <code>isError: true</code> with a plain-language message and <code>structuredContent.error</code>: <code>invalid</code>, <code>not_found</code>, <code>forbidden</code>, <code>confirm</code>, <code>rate_limited</code>, <code>unavailable</code> or <code>disabled</code>.</li>
      <li>Per customer: 120 reads and 30 changes per minute; 10 domain availability checks per minute. Per IP: 240 MCP requests per minute.</li>
      <li>Every change is written to the account's audit log with the app, the tool and the target (never message bodies or secrets).</li>
      <li>Support: <a href="/contact">contact</a> · <a href="/privacy-policy">privacy policy</a> · <a href="/terms-conditions">terms</a>.</li>
    </ul></div>`, { labelledby: 'limits', tint: true });
  const doc = ld({ '@context': 'https://schema.org', '@type': 'TechArticle', headline: 'GlobalHostia MCP server: setup and tool reference', url: `${site}/docs/mcp`, about: { '@type': 'WebAPI', name: 'GlobalHostia MCP server', url: `${site}/mcp` }, publisher: { '@id': `${site}/#organization` } });
  return { crumbs, jsonLd: [breadcrumbJsonLd(crumbs.map((c) => ({ ...c, href: c.href || '/docs/mcp' })), site), doc], body: [PAGE_CSS, '<div class="cn-pg">', hero, setup, auth, tools, limits, '</div>'].join('\n') };
}
