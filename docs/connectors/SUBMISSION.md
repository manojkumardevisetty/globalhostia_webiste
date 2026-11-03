# GlobalHostia connector: directory submission kit

Everything needed to list the GlobalHostia account connector in the **Claude Connectors Directory** and the **ChatGPT app directory**. Paste the fields as written. Specs checked on 2026-11-03 against claude.com/docs/connectors/building/{submission,authentication,lazy-authentication,review-criteria,testing} and developers.openai.com/apps-sdk/{build/auth,deploy/submission,app-submission-guidelines}.

| | Claude | ChatGPT |
|---|---|---|
| Server URL | `https://globalhostia.com/mcp` | `https://globalhostia.com/mcp/chatgpt` |
| Transport | Streamable HTTP (stateless, JSON responses) | same |
| Auth | OAuth 2.1, PKCE S256, DCR + CIMD, lazy ("Required when the server asks") | OAuth (DCR or CIMD), mixed: `securitySchemes` per tool + `_meta["mcp/www_authenticate"]` |
| Tools | 29 (incl. plan search, cart and renewal links) | 25 (no commerce tools; domain check without prices) |

---

## 0. Owner checklist (do these first, in order)

1. **Deploy** this commit (push to `main`). The deploy runs db-setup patches `032-oauth` (tables) and `033-connector-legal` (privacy/terms sections).
2. **Check the legal additions**: open `/privacy-policy` and `/terms-conditions`, read the new "AI assistant connectors" sections, adjust wording in Admin → Pages if needed. Retention wording for the activity log is general ("as part of our account security logs"); make it match what you actually keep.
3. **Smoke test**: `https://globalhostia.com/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server` return JSON; `/connectors` and `/docs/mcp` render.
4. **Create the reviewer account** (section 3), then Admin → **AI connectors** → Reviewer mode: enter its WHMCS client id and the sandbox domain. Save.
5. **Test it yourself** in Claude: Customize → Connectors → Add custom connector → `https://globalhostia.com/mcp` → run the five positive prompts below with the reviewer account. Then the same in ChatGPT developer mode with `/mcp/chatgpt`.
6. **Record the video** (section 5) with the reviewer account.
7. **Submit to Claude** (section 1) at claude.ai/directory/manage.
8. **Create the ChatGPT app** (section 2) on platform.openai.com, paste its **domain verification token** into Admin → AI connectors → "OpenAI domain verification token", Save, check `https://globalhostia.com/.well-known/openai-apps-challenge` shows only the token, verify in the portal, then submit.
9. Keep the reviewer account, its password and the sandbox domain unchanged until both reviews finish (and for later re-reviews).

Emergency controls (Admin → AI connectors): kill switch, block one app, revoke one connection, revoke everything.

---

## 1. Claude developer portal (claude.ai/directory/manage → Submit new → MCP connector)

**1. Connection**: Universal URL `https://globalhostia.com/mcp`.

**2. Tools**: sync automatically. Every tool has `title` and `readOnlyHint`/`destructiveHint` (plus `idempotentHint`, `openWorldHint`). 19 read-only (cart and renewal links only build URLs), 10 that change data; destructive: `update_dns_record`, `delete_dns_record`, `delete_mailbox`, `set_nameservers`.

**3. Listing**
- Server name (≤100): `GlobalHostia`
- One-liner (≤200): `Manage your GlobalHostia hosting from Claude: domains, DNS records, mailboxes, SSL, invoices, renewals and support tickets, with every change confirmed by you.`
- Description (≤2000):

> GlobalHostia is a web hosting, VPS, dedicated server and domain company based in Dubai, UAE. This connector lets GlobalHostia customers manage their account in plain language.
>
> What you can do:
> • See your services, domains, expiry dates, auto-renew status, nameservers and upcoming renewals
> • List, add, update and delete DNS records ("add an MX record for mybrand.com")
> • Check site health: DNS, website, SSL and email authentication (SPF, DKIM, DMARC) with suggested fixes
> • Create and delete mailboxes, and get IMAP/SMTP settings
> • Issue free SSL certificates
> • Turn domain auto-renew on or off and change nameservers
> • See invoices and support tickets, open tickets and reply
> • Search plans, check domain availability and get checkout or renewal links (you always pay on globalhostia.com)
>
> Without signing in, you can search plans, check domains and read our refund and renewal policies. Account tools ask you to sign in on globalhostia.com the first time, where you choose exactly which permissions to grant.
>
> Safety: the connector cannot pay, place orders, see card details or service passwords, change your password or delete your account. Deleting records or mailboxes, overwriting a record and changing nameservers require your explicit confirmation. Every change is recorded in your account, and you can disconnect at any time under Account → Connected apps.

- Categories (1–5, pick the closest the portal offers): Developer tools / IT & infrastructure, Productivity, Business operations.
- Documentation URL: `https://globalhostia.com/docs/mcp`
- Privacy policy URL: `https://globalhostia.com/privacy-policy`
- Support contact: `support@globalhostia.com`
- Icon: `https://globalhostia.com/connectors/globalhostia-512.png` (SVG: `/connectors/globalhostia-icon.svg`; repo `public/connectors/`)
- Slug (permanent): `globalhostia`
- Allowed link URIs (optional, owned origins only): `https://globalhostia.com`, `https://my.globalhostia.com`

**4. Use cases**
- Primary: manage DNS records; check domain expiry and renewals; diagnose website/email issues; manage mailboxes and SSL; follow up invoices and support tickets; find a plan and get a checkout link.
- Users need: a GlobalHostia customer account (email + password) without two-factor authentication. Public tools need nothing.
- Reads and writes data.

**5. Company**: GlobalHostia (Desert Tech Cloud Services LLC), `https://globalhostia.com`, primary contact: owner email.

**6. Authentication**: Authentication requirement **Required when the server asks**. Method: **OAuth sign-in** with the server's own registration (no Anthropic-held client needed): DCR at `/oauth/register` and CIMD (`client_id_metadata_document_supported: true`, `none` auth). Redirect URIs accepted: `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`, loopback on any port (Claude Code).

**Claude Code**: `claude mcp add --transport http globalhostia https://globalhostia.com/mcp`, then `/mcp` → globalhostia → **Authenticate**. Claude Code only offers Authenticate for a server that answered 401 at connect, so `/mcp` answers 401 + `WWW-Authenticate` to an `initialize` without a token whose `clientInfo.name` is `claude-code` (claude.ai keeps lazy auth). It registers with its CIMD `https://claude.ai/oauth/claude-code-client-metadata` (redirects `http://localhost/callback`, `http://127.0.0.1/callback`, matched on any port). `https://globalhostia.com/mcp/auth` is the same server with sign-in always required up front (same `/mcp` token audience) for other CLI / IDE clients.

**7. Data handling**: the API is our own (WHMCS billing and our hosting panels, behind globalhostia.com). No personal health data. No sponsored content.

**8. Test & launch**: paste section 3 (reviewer instructions). Confirm: every tool was run via MCP Inspector and as a custom connector in Claude.

**9. Compliance**: acknowledge all seven. Notes if asked: no financial transactions (links only; payment happens on globalhostia.com by the customer), no AI media generation, tool descriptions contain no behavioural instructions, no conversation data collected (only tool arguments), public docs at `/docs/mcp` and `/connectors`.

---

## 2. ChatGPT / OpenAI platform

**MCP server**: URL `https://globalhostia.com/mcp/chatgpt`; Authentication **OAuth**; registration method **CIMD** (preferred by OpenAI) or **DCR**; both advertised. No custom headers. No client secret.

**Client authentication**: ChatGPT's CIMD (`https://chatgpt.com/oauth/client.json`) authenticates at the token endpoint with **`private_key_jwt`** (RFC 7523 client assertion signed with OpenAI's managed key, public JWKS from the document's `jwks_uri`). We advertise `token_endpoint_auth_methods_supported: ["none", "private_key_jwt", "client_secret_post", "client_secret_basic"]` and `token_endpoint_auth_signing_alg_values_supported` (RS256 … ES512); the assertion must have `iss` = `sub` = the client_id, `aud` = `https://globalhostia.com/oauth/token` (or the issuer), `exp` within an hour, and a `jti` used once (table `oauth_assertions`, patch `034-oauth-private-key-jwt`). CIMDs declaring only `client_secret_*` are refused with the method named on the error page. If ChatGPT falls back to DCR it may register as `none`, `client_secret_*` or `private_key_jwt` (with `jwks_uri` / `jwks`); unsupported extra `grant_types` are dropped, not fatal. Rejections are logged as `[oauth] authorize: client lookup failed …` / `[oauth] token client auth failed …` / `[oauth] client assertion refused …` in the Vercel runtime logs.

**Domain verification**: the portal shows a token → Admin → AI connectors → "OpenAI domain verification token" → Save → served as plain text at `https://globalhostia.com/.well-known/openai-apps-challenge`.

**Redirect URIs** (accepted automatically, nothing to configure): `https://chatgpt.com/connector_platform_oauth_redirect` (we return `iss`, RFC 9207) and `https://chatgpt.com/connector/oauth/{callback_id}`. CIMD client ids `https://chatgpt.com/oauth/client.json` and `https://chatgpt.com/oauth/{id}/client.json` work too.

**Listing fields**
| Field | Value |
|---|---|
| name | `globalhostia` |
| displayName (≤30) | `GlobalHostia` |
| shortDescription (≤30) | `Manage hosting, domains & DNS` |
| longDescription (≤4000) | the Claude description above, with the bullet "Search plans, check domain availability and get checkout or renewal links" replaced by "Check whether a domain name is available", and without "Without signing in, you can search plans…" (use: "Account tools ask you to sign in on globalhostia.com, where you choose exactly which permissions to grant.") |
| developerName | GlobalHostia (from verified identity) |
| category | Productivity (or Business / Developer tools, closest offered) |
| websiteURL | `https://globalhostia.com/connectors` |
| supportURL | `https://globalhostia.com/contact` |
| privacyPolicyURL | `https://globalhostia.com/privacy-policy` |
| termsOfServiceURL | `https://globalhostia.com/terms-conditions` |
| logo | `public/connectors/globalhostia-512.png` (square 512×512) |
| defaultPrompt (≤3, ≤128 chars) | `Which of my domains expire in the next 60 days?` · `Add an MX record for my domain` · `Check my website and email health` |
| brandColor | `#C4366C` (dark `#E14E7D`) |
| version | `2.0.0` |
| countries | all countries you serve; at minimum `AE`, `SA`, `QA`, `KW`, `BH`, `OM`, `US`, `GB`, `IN`, `PK`, `MY`, `SG` |
| release_notes | `First release: manage GlobalHostia services, domains, DNS, mailboxes, SSL, invoices, renewals and support tickets with OAuth sign-in and per-permission consent.` |

**Commerce declaration**: `commerce: false`. Description: "The app does not sell, take payments or link to checkout. Plan search, prices, cart and renewal links are not exposed on the ChatGPT endpoint." (Admin switch "Commerce tools on ChatGPT" must stay off: OpenAI only allows commerce for physical goods.)

**Test cases** (run each with the reviewer account first; `<demo>` = the sandbox domain)

Positive:
| # | Scenario | Prompt | Expected tools | Expected result |
|---|---|---|---|---|
| 1 | Domain expiry | "Which of my GlobalHostia domains expire in the next 60 days, and is auto-renew on?" | `list_domains` (`expiring_within_days: 60`) | Domains with expiry date, days left and auto-renew |
| 2 | Add an MX record | "Add an MX record for `<demo>` pointing to mail.`<demo>` with priority 10" | `add_dns_record` (after confirming) | "Added MX @ → mail.`<demo>` (priority 10)" |
| 3 | Email deliverability | "Is email for `<demo>` set up correctly? Check SPF, DKIM and DMARC." | `site_health` | Score and issues, e.g. missing DMARC with the TXT record to add |
| 4 | Billing | "Do I have any unpaid invoices? Show me the details of the latest one." | `list_invoices` (`Unpaid`), `get_invoice` | Invoice number, total, due date, line items |
| 5 | Support | "Open a support ticket: my website shows a 500 error since this morning." | `open_ticket` | Ticket number, department; ticket subject prefixed `[Review]` |

Negative:
| # | Prompt | Why the app should not act | Expected behaviour |
|---|---|---|---|
| 1 | "Pay my unpaid GlobalHostia invoice with my saved card." | No payment tool; payments only on globalhostia.com | Explains it cannot pay; may show the invoice details |
| 2 | "Delete all DNS records for example.org." (not on the account) | Ownership check | Tool returns "example.org is not on your GlobalHostia account. Your domains: …"; nothing changes |
| 3 | "Change my GlobalHostia password to Summer2026!" | No password tool by design | Declines and points to the account profile page |

Extra (for reviewers who probe): "Delete the TXT record test on `<demo>`" → the tool first refuses with "Not done. This deletes … Ask the customer to confirm" and runs only after the user confirms (`confirm: true`).

**Video walkthrough**: section 5. Upload unlisted (YouTube/Drive) and paste the URL.

---

## 3. Reviewer test account (both directories)

What the owner creates (all free, no registrar or payment cost):
1. **WHMCS client** (Admin → Clients → Add): name "Directory Reviewer", email e.g. `review@globalhostia.com`, a strong password, **two-factor authentication off**, currency USD. Note the client id.
2. **Sandbox domain**: a domain GlobalHostia already owns (spare), e.g. `globalhostia-demo.com`. In WHMCS add it to the reviewer client as a domain (Admin → client → Domains → Add, status Active, registrar "none", price 0, auto-renew as you like). Its DNS must be on our DNS-only DirectAdmin account (in the portal: Domains → the domain → DNS → Turn on) or on a hosting account below.
3. **Hosting service**: add a $0 "Hostia Lite" (or an internal free product) to the client on the DirectAdmin server, domain = sandbox domain, status Active, Create the account (module create). This enables mailboxes, SSL and site health.
4. **Sample data**: one Paid and one Unpaid invoice of small amounts (Admin → Billing → Create invoice; do not send), one support ticket with a staff reply.
5. Admin → **AI connectors** → Reviewer mode: client id + sandbox domain → Save. Reviewer accounts can read everything on their account but can change DNS, mailboxes, SSL and domain settings only on the sandbox domain; their tickets are prefixed `[Review]`.

Instructions to paste for reviewers:
> 1. Add the connector (Claude: `https://globalhostia.com/mcp`; ChatGPT: `https://globalhostia.com/mcp/chatgpt`).
> 2. When a GlobalHostia tool asks you to connect, a globalhostia.com window opens. Sign in with: email `<reviewer email>`, password `<password>` (no two-factor, no email codes).
> 3. On the consent page, keep all permissions ticked and choose **Allow access**.
> 4. Try the test prompts. The account holds sample services, domains, invoices and a ticket. Changes are allowed on the demo domain `<demo>` only; other changes are refused by design.
> 5. To disconnect: globalhostia.com/account/apps → Disconnect.

---

## 4. Security and compliance answers (reuse in forms)

- OAuth 2.1 authorization code + PKCE (S256 only); RFC 8414 / RFC 9728 discovery; RFC 7591 DCR; Client ID Metadata Documents (SSRF-guarded fetch: https/443 only, public IPs only, pinned socket, 5 s, 16 KB); RFC 8707 resource-bound tokens (a `/mcp` token is refused by `/mcp/chatgpt` and vice versa); RFC 9207 `iss`; RFC 7009 revocation.
- Opaque tokens, stored as SHA-256 hashes. Access 1 h, refresh 60 days with rotation (reuse revokes the connection), connection max 90 days. Codes single use, 5 minutes; replay revokes the connection.
- Consent on our domain with CSRF + same-origin checks, `frame-ancestors 'none'`, per-scope opt-out, app identity and return host shown, warning for non-Claude/ChatGPT and loopback-only apps.
- Every tool: scope check → per-customer rate limit → validation (lib/hosting/validate.ts) → ownership check (client id only from the token) → reviewer sandbox → confirm for destructive tools → audit log (`connector.<tool>`, client id, app, grant, IP; no message bodies or secrets).
- No payments, password changes, account deletion, card data or service passwords. Mailboxes get a random password that is never returned.
- Admin kill switch, per-app block, per-connection and global revocation; customers disconnect at /account/apps.
- Known limitation: customer accounts with WHMCS two-factor authentication cannot complete the connector sign-in (the portal sign-in does not support 2FA yet).

---

## 5. Video script (3–4 minutes, reviewer account, screen recording)

1. (0:00) globalhostia.com/connectors: "GlobalHostia lets customers manage hosting from ChatGPT/Claude."
2. (0:20) In ChatGPT (developer mode or the submitted app) add/connect GlobalHostia.
3. (0:40) Prompt 1 → the app shows Connect → globalhostia.com sign-in → consent page (scroll the permissions and "It can never") → Allow → the answer lists domains with expiry and auto-renew.
4. (1:30) Prompt 2 (MX record) → confirmation → success message. Open globalhostia.com/account → Domains → `<demo>` → DNS to show the record.
5. (2:10) Prompt 3 (email health) and prompt 4 (unpaid invoice).
6. (2:40) Prompt 5 (ticket) → show it in /account/support.
7. (3:00) Negative 1 (pay invoice) and negative 2 (foreign domain): the refusals.
8. (3:30) /account/apps → Disconnect → the next tool call asks to connect again.

---

## 6. Verification log (local, 2026-11-03)

- Unit tests: `node --test --experimental-strip-types tests/*.test.mts` → 189 pass (new: `tests/oauth.test.mts` 13, `tests/connector.test.mts` 15).
- End-to-end: `BASE=… node tests/connector-flow.mjs` against `next dev` with `tests/mock-whmcs.mjs` and `tests/mock-da.mjs` → 75/75 pass, 1 DNS step skipped without the DirectAdmin mock (discovery, protocol versions 2025-03-26 / 06-18 / 11-25, SSE GET 405, CORS, Claude Code 401 at initialize, /mcp/auth, 401 gate, ChatGPT `_meta` challenge, DCR, sign-in round trip, consent CSRF/origin, PKCE, code replay, token, ownership, 403 step-up, MX add/list/delete through DirectAdmin, audience binding, refresh rotation + replay revocation, RFC 7009, Connected apps disconnect, access_denied, loopback any-port redirect without resource, private_key_jwt DCR client: missing / wrong-aud / expired / replayed assertion refused, valid ES256 assertion for code, refresh and revocation). Claude Code emulation with the official MCP SDK client (1.32): 401 at connect → CIMD `claude-code-client-metadata` (fetched live) and DCR → sign-in → token → tools on `/mcp` and `/mcp/auth`.
- MCP Inspector CLI (`npx @modelcontextprotocol/inspector --cli <url>/mcp --transport http`): `tools/list` OK; with `--header "Authorization: Bearer …"`: `get_account_overview`, `list_dns_records`, `add_dns_record`, `get_domain` OK (structuredContent validates against outputSchema); without a token the CLI detects the OAuth requirement (`auth_required`).
- Not verified here: a live connection from claude.ai / ChatGPT (needs the production URL), CIMD fetch of the real Claude/ChatGPT metadata documents (sandbox has no direct outbound HTTPS), the WHMCS production API for `UpdateClientDomain`/`DomainUpdateNameservers` on a real registrar.
