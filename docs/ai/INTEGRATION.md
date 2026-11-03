# GlobalHostia AI assistant: integration guide

Everything runs on our server with Claude through the Anthropic API. The key is the `ANTHROPIC_API_KEY` environment
variable only (Vercel > Settings > Environment Variables). It is never stored in the database or sent to a browser.
Without it, every surface answers "assistant offline" and points to support.

| Surface | UI | Server | Auth |
|---|---|---|---|
| Website chat (pre-sales) | `public/hp/ai-chat.js` + `.css`, loaded after idle by `lib/theme/shell.ts` | `POST /api/ai/chat`, `POST /api/ai/handoff`, `GET /ai/checkout` | public, same-site Origin |
| Customer assistant | `public/hp/ai-assist.js` + `.css` (mount it, see below) | `POST /api/ai/assist`, `POST /api/ai/assist/action` | portal session cookie or hosting-panel token |
| Ticket automation | Admin > Support > ticket ("AI assistant" card) | `lib/ai/tickets.ts`, run by the support notifier | server only |
| Admin assistant | `/admin/assistant`, settings, usage | `POST /api/ai/admin` | admin session (commerce role) |

Code map: `lib/ai/agent.ts` (tool loop, permission checks), `gate.ts` (scope filter), `policy.ts` (ticket rules),
`pricing.ts`, `settings-core.ts`, `server.ts` (client, logging, budgets), `prompts.ts`, `tools/*` (public, customer, admin).

## Mounting the customer assistant (account dashboard or hosting panel)

```html
<link rel="stylesheet" href="https://globalhostia.com/hp/ai-assist.css">
<script src="https://globalhostia.com/hp/ai-assist.js" defer></script>
<div id="gh-assist" style="height:560px"></div>
```

```js
// Hosting panel (WHMCS client area, my.globalhostia.com): pass the same short-lived token whmcs.js already uses
// for /api/hosting/*. A function is called before every request, so a refreshed token is picked up.
const assistant = GHAssist.mount(document.getElementById('gh-assist'), {
  auth: { type: 'hosting', token: () => currentHostingToken },
  context: { domain: 'example.com' },          // optional: what the customer is looking at
  apiBase: 'https://globalhostia.com',          // where proposal requests go (default: the script's origin)
});

// Account portal (/account, same origin): the session cookie authenticates; pass the page's CSRF token so
// confirmed DNS proposals can post to the existing /account/domains/<id>/dns form handler.
GHAssist.mount(el, { auth: { type: 'portal', csrf: document.querySelector('input[name=csrf]').value } });
```

Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `auth` | `{type:'hosting', token}` or `{type:'portal', csrf}` | required | who is asking; `token` may be a string or a (async) function |
| `endpoint` | string | `<script origin>/api/ai/assist` | assistant API |
| `apiBase` | string | script origin | base URL for hosting / assist proposal requests |
| `context` | `{domain?: string}` | `{}` | hint for the assistant; ownership is still checked server side |
| `title`, `placeholder`, `suggestions` | string, string, string[] | built-in | text |
| `onAction(proposal, inputs)` | async function | built-in executor | run a confirmed proposal yourself; return `{message}` |
| `onDone(proposal, result)` | function | none | e.g. reload the DNS list after a record was added |

Returned handle: `ask(text)`, `setContext(ctx)`, `reset()`, `destroy()`, `element`.
`GHAssist.execute(proposal, inputs, options)` is exported for custom UIs.

## Streaming protocol (`/api/ai/assist`, `/api/ai/chat`, `/api/ai/admin`)

Request: `POST` JSON `{ "messages": [{"role":"user","content":"..."}, ...], "context": {"domain": "..."} }`
(the whole conversation each time; the server trims it). Hosting auth: header `Authorization: GH-Hosting <token>`
(CORS allows `https://my.globalhostia.com`, same list as `/api/hosting`). Portal auth: cookie + same origin.

Response `text/event-stream` events:

| event | data |
|---|---|
| `text` | `{t}`: next piece of the answer (Markdown: links, bold, lists) |
| `tool` | `{name}`: a tool is running (show "checking...") |
| `ui` | card payloads, see below |
| `meta` | `{gate}` when the scope filter answered (no model call); `{pass}` (chat Turnstile pass) |
| `error` | `{message}` safe to show |
| `done` | `{}` |

Non-stream JSON errors: `401 unauthorized`, `403 forbidden`, `413 too_long`, `429 rate_limited|limit`,
`503 offline` (no key, switched off or budget reached) with a `message` to show.

### Proposals (`ui` with `type: "proposal"`)

The assistant never changes anything. It returns a proposal the customer confirms; the UI then calls the existing,
already-authenticated endpoint, which re-validates everything (ownership, record syntax, panel capability).

```json
{ "type": "proposal", "id": "p…", "kind": "dns.add | email.create | ssl.issue | ticket.open",
  "title": "Add TXT record", "summary": "…", "rows": [{"k":"Name","v":"_dmarc"}],
  "inputs": [{"name":"password","label":"Password for the new mailbox","type":"password"}],
  "confirmLabel": "Add record",
  "request": { "method": "POST", "path": "/api/hosting/dns", "auth": "hosting",
               "json": { "op": "add", "domain": "example.com", "record": {"type":"TXT","name":"_dmarc","value":"v=DMARC1; p=none","ttl":3600} } } }
```

| kind | via | request |
|---|---|---|
| `dns.add` | hosting | `POST /api/hosting/dns {op:'add', domain, record}` with the panel token |
| `dns.add` | portal | `POST /account/domains/<id>/dns` form `{op:'add', type, name, value, ttl, priority?, csrf}` |
| `email.create` | hosting | `POST /api/hosting/email {op:'create', domain, user, quota, password}`; `password` comes from `inputs` typed by the customer |
| `ssl.issue` | hosting | `POST /api/hosting/ssl {op:'issue', domain, www}` |
| `ticket.open` | both | `POST /api/ai/assist/action {token}`; the token is signed, bound to the client and expires in 30 minutes |

Mailbox and SSL proposals are only offered in the hosting panel (the portal has no endpoint for them).

### Website chat cards (`ui` events)

`plans` (items: name, specs, price, cycle, renew, cycles[], why, cartUrl, url), `domains` (domain, available, register,
renew, cartUrl), `broker` (taken domain, fee, url), `cart_add` (item for the chat cart), `bundle` (lines, total),
`handoff` (ticket, whatsapp), `chips` (quick replies). The chat cart turns into `/ai/checkout?c=p:<slug>:<cycle>,d:<domain>`,
which re-prices every item from the live catalog and adds them to the WHMCS cart.

## Scope filter and limits

1. Deterministic rules (`lib/ai/gate.ts`, EN / AR / Hindi-Urdu): clear off-topic messages (gold / crypto / stock prices,
   other shopping, homework, writing, advice, news, weather, sports...) get one fixed line and three chips, no model call.
   Greetings get a fixed greeting. Owner word lists in AI settings extend both lists.
2. Ambiguous messages: a 5-token Haiku ON/OFF check. Only ON reaches Sonnet.
3. Strikes: 3 off-topic messages in 10 minutes = 30 minute cooldown; 10 in a day = blocked for the day (canned line only).
4. Caps (AI settings): turns per conversation, characters per message, answer tokens, history turns, model calls per
   visitor / customer per day, burst per minute, minimum typing time, honeypot, optional Cloudflare Turnstile,
   daily and monthly budget.

## Adding a tool

Add an `AiTool` to `lib/ai/tools/*`: `name`, `description`, JSON `input_schema`, `scope` (`public` / `customer` /
`admin`), `kind` (`read` / `propose` / `action`) and `run(input, ctx)`. `runTool` refuses a tool whose scope the caller
lacks, customer tools without a verified client id, and anything but `read` on read-only surfaces (admin, ticket drafts).
Take the client id from `ctx`, never from `input`; check every domain with `ownedDomain()`.
