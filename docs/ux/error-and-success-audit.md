# Error messages and success feedback: audit (November 2026)

Every customer-facing failure now says what happened and what to do next, offers "Try again" where retrying can help,
and offers WhatsApp / a support ticket when it keeps failing or the problem is on our side. Internal system names
(billing platform, control-panel software, hosting provider, database), raw status codes and stack traces stay in the
server logs. Success moments use the hexagon brand mark (never a tick character): a check that draws itself inside a
hexagon, small pulses, row highlights, and a purchase burst. All motion is transform / opacity (plus a one-off stroke
draw on small SVGs); `prefers-reduced-motion` shows the finished state with no motion.

## Shared pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Error kinds and copy | `lib/ux/errors.ts` | `errorKind(status, code)` → network / timeout / rate / auth / forbidden / validation / notfound / unavailable / server; `ERROR_COPY`; `scrubMessage()` (drops stack lines, `HTTP 502`, URLs, `ECONN…`, internal names and their `Name:` prefixes); `publicPanelError()` |
| Browser kit | `public/hp/fx.js`, `public/hp/fx.css` (loaded by `lib/theme/shell.ts` on every theme page and the account portal; CSS non-blocking) | `GHFx.errInfo / showError / fieldErrors / success / pop / bump / toast / spinner / flash`; strings come from the portal dictionary (`#ac-i18n`) when present |
| Client-area copy | `public/hp/whmcs.js` (`ghErr`, between the `err-map` markers) | Same kinds and copy as the server module, through `_t()` (Arabic in `whmcs-i18n.js`) |
| Stand-alone error page | `lib/ux/error-page.ts` | Branded HTML with no database or shell: hexagon mark, code label, "Try again", homepage, WhatsApp / email / account, optional reference |
| Tests | `tests/ux-errors.test.mts` | Kind mapping, parity of the three copies, scrubbing, panel errors, Arabic coverage of every new string, error page, no tick characters |

## 1. Marketing site

| Place | Before | After |
| --- | --- | --- |
| Free migration, broker request, business-services quote (`public/hp/pages/migration.js`, `broker.js`, `store.js`) | Generic "We could not send your request" or "Network error"; a non-JSON reply showed "Unexpected reply from the server."; no retry; no timeout | Status-aware message (offline, timeout, rate limit, busy, our side); our APIs' own sentences kept for 4xx/429/503; "Try again" re-submits; WhatsApp link after a second failure or on 5xx; 25 s timeout; field errors from the server still focus the first field and turn off the retry button. Success: hexagon check-morph in the done panel (also on the no-JavaScript `?ticket=` return) |
| Lead / newsletter forms (`public/hp/track.js`, every `form[data-gh-lead]`) | "Something went wrong" / "You seem to be offline" in a polite status line | Message box switches to `role=alert` with the GHFx copy, retry and help link; server field errors focus the first field. Success line uses the small hexagon check (plain hexagon SVG where `fx.js` is absent, e.g. the client area) |
| Domain search (theme `[data-domain-form]`) | Empty submit focused the field | Left as is: it hands off to the client-area domain checker, whose feedback is covered in section 3 |
| 404 (`app/[[...slug]]/route.ts`, `lib/theme/pages/notfound.ts`, `public/hp/pages/notfound.css`) | The CMS "404" page, or a bare "Page not found" | Themed 404 (site theme Hostpen): hero, "Were you looking for" guesses from the words in the broken URL, instant search over every menu/footer page, popular pages, help links; the stand-alone branded page when the theme is off and no CMS 404 exists |
| 503 when a page cannot be built (`unavailable()`), maintenance mode | Unstyled system-font text | Branded stand-alone page with "Try again", support links, `Retry-After` kept |
| React error boundary (`app/global-error.tsx`, new) | Next.js default screen | Same branded page, "Try again" calls `reset()`, digest shown as a reference |
| Offline page (`public/pwa-offline.htm`) | Its own dark design | Same style as the error pages (shared CSS / hexagon mark), English + Arabic, reloads by itself when back online; service-worker cache bumped to `gh-account-v2` |
| AI checkout (`app/ai/checkout/route.ts`) | Button text "Adding your items…" | Hexagon spinner, "Adding item 2 of 3…" progress, "Opening your secure cart…", back-button reset |

## 2. Account portal (English and Arabic)

| Place | Before | After |
| --- | --- | --- |
| Flash messages (`lib/portal/views/frame.ts`) | Check / alert line icon | Success: hexagon draws in with one pulse; error: static hexagon with a short shake; `sso`, `failed`, `autorenew_failed`, `push_bad`, `push_unavailable` add "Contact support"; `csrf` adds "Reload the page". One-off `?ok` / `?err` / `?hl` keys are removed from the address bar so a reload does not replay them |
| DNS editor (`app/account/[[...slug]]/route.ts`, `lib/portal/views/dns.ts`) | Non-400 panel errors showed the panel's raw English text (for example the API-login wording) | Timeouts: "The DNS server took too long to answer…"; other 5xx: "We could not reach the DNS server right now…"; 400: "The DNS server refused the change: …" with the scrubbed reason. The added / edited record row flashes (`?hl=TYPE:name`, `data-rn` on rows) |
| Bulk domain actions (`lib/portal/views/domains.ts`) | Result list only | Hexagon mark on full success; the updated rows flash |
| Auto-renew switches (renewal centre) | Flash only | The changed row flashes and the switch knob settles with a small bounce |
| Sign in / password reset (`lib/portal/views/guest.ts`) | Alert without field links | Wrong email/password: both fields `aria-invalid` + `aria-describedby` to the alert; invalid reset email likewise (autofocus); "Check your email" and "You have signed out" use the hexagon success mark |
| Push settings (`public/hp/pages/account.js`) | "Something went wrong" for every failure | Offline-aware message, message box becomes `role=alert`; a stale form (401/403) reloads the page instead of a dead end |
| Strings | | Every new key has Arabic in `lib/portal/i18n.ts`; the `fx.js` strings are in `CLIENT_KEYS` |

## 3. Client area skin and Manage hosting

| Place | Before | After |
| --- | --- | --- |
| Hosting API errors (`lib/hosting/context.ts`) | `PanelError` messages went to the browser verbatim (panel names, "API login key", "HTTP 5xx") | 5xx: `panel_unreachable` with a friendly sentence (original logged); 504: `panel_timeout`; 4xx: scrubbed validation text |
| Manage hosting `api()` (`whmcs.js`) | Server text or "Request failed"; no timeout; a 504 HTML page showed "Unexpected answer from the server (504)" | `ghErr` maps status/code to the shared copy; 45 s timeout (180 s for uploads); titled error states ("You are offline", "Still waiting for your server", "Your hosting server is not answering"); help link after two failures in a row or on server-side problems; expired / unauthorized go to the reload screen |
| Panel forms | Empty required fields went to the server | "Fill in {field}." with focus and `aria-invalid`; server validation errors mark the matching field |
| Panel success | Toast | Toast hexagon pulses; the new row (DNS record, mailbox, forwarder, database, any list item) flashes after the list redraws |
| Order complete (`cart.php?a=complete`) | WHMCS confirmation text | Hexagon burst (outline draws, brand-gradient fill, check, pink/gold hexagon particles), then "Order confirmed / what happens next" card: check your email, set up your service or domain, get help. Unpaid orders: "Order placed: one step left" with "Pay invoice #N". GA4 `purchase` once per order (`sessionStorage`), only when `gtag` or `dataLayer` exists, with order number and amount when known |
| Invoice paid (`viewinvoice.php`) | Status text | Same burst + "Payment received" card when the page has `paymentsuccess=true` or the invoice was seen unpaid earlier in the visit; `purchase` once per invoice and never twice for an order already counted |
| Paying an invoice / placing the order | Blank wait | Full-screen hexagon spinner: "Opening the secure payment page…" / "Placing your order…", then progress text at 6 s and 20 s (with "Hide this message") |
| Checkout and form errors | WHMCS list | `role=alert`, focused; each problem that names a field gets "Fix this" and the field gets `aria-invalid` + `aria-describedby` |
| Ticket opened (`submitticket.php?step=3`) | WHMCS success alert | "Ticket opened" card with the hexagon check and the ticket number |
| WHMCS alerts (login errors, password reset sent, reply posted) | Bootstrap alerts | Danger / warning get `role=alert`; success gets `role=status` and a pulsing hexagon |
| Domain search / cart | No feedback | Available result and the add-to-cart button pop; cart badge bumps; "{domain} is in your cart." announced |
| Renewal carts (`/service-renewals`, domain renewals) | Title dark on the dark bar, summary column far below the list, plain rows, big "$0.00" | Readable title; top-aligned columns; brand cards (name, muted host name, due date + urgency pill, price, pink Add to Cart → added state with the hexagon check); "Add a service to renew" summary; View Cart becomes primary once filled; empty state with next steps; single column at 390 px |
| Page titles everywhere in the client area | Some theme titles matched their bar colour | CSS for `.header-lined` titles plus a contrast check (ratio < 3 → white or ink) on every page title |
| Strings | | Every new `_t()` string has Arabic in `whmcs-i18n.js` (tested) |

## 4. AI chat

| Place | Before | After |
| --- | --- | --- |
| `public/hp/ai-chat.js` | "Connection problem. Please try again." / "Something went wrong" | Status-aware message; "Try again" re-sends the same question without duplicating it; "Talk to a person" opens the hand-off form; offline / budget-offline answers keep their WhatsApp / email / contact buttons |
| Cart | Silent add | Cart summary bumps and is announced; "Add" on a domain chip pops |
| `public/hp/ai-assist.js` (portal / client-area assistant) | One generic message | Rate-limit, session-expired, offline and dropped-connection wording |

## Left as is (with reason)

- **Admin error boundary** (`app/admin/(panel)/error.tsx`): staff-only; it names the database on purpose so the owner knows what failed.
- **Admin / sync / AI ticket logs** (`lib/sync.ts`, `lib/ai/tickets.ts`): store raw upstream errors for the owner, never shown to customers.
- **`app/not-found.tsx`**: not added; the catch-all route handler answers every public URL (including 404s), and with several root layouts a root `not-found` is not reliable in Next 15.
- **Youpi payment gateway messages** (`docs/whmcs/youpi-gateway`): a separate WHMCS module with its own wording; out of scope.
- **Theme domain search form**: it only normalises the input and submits to the client area; feedback happens there.
- **Old dictionary keys** "Network problem…" and "Unexpected answer from the server ({status})" stay in `whmcs-i18n.js` (unused, harmless) so a cached old `whmcs.js` keeps its Arabic.

## Not verified against live WHMCS

The client-area enhancements were built against mock pages recreated from WHMCS 8.x standard templates. Check these
selectors on the live `my.globalhostia.com` (theme emyui-aws-pro, order form emyui_cart_aws / standard_cart):

- Order complete: `#order-standard_cart .order-confirmation` (order number in its `span`/`strong`), unpaid notice
  `.alert-warning a[href*="viewinvoice.php"]`. The amount is only used when the WHMCS hook prints
  `window.GH_ORDER = { number, amount, currency, amountText, invoiceId, paid }` on the complete page (not added to the
  hook yet), otherwise the event has no value.
- Invoice: `.invoice-status .paid`, `?paymentsuccess=true` after the gateway returns, total row `.total-row` / a row
  containing "Total"; gateway forms inside `.invoice-container`.
- Checkout errors: `.checkout-error-feedback li` and field ids `#inputFirstName`, `#inputEmail`, `#accepttos`, … (the
  emyui order form may use other ids; unmatched items simply get no "Fix this").
- Ticket confirmation: `submitticket.php?step=3` with a `viewticket.php` link carrying the ticket number.
- Renewals: `.service-renewal` / `.domain-renewal` items, `.btn-add-renewal-to-cart` gaining `.checkout` when added,
  `#orderSummary .total-due-today .amt`, `.header-lined h1`, `.cart-sidebar`, `.secondary-cart-body`,
  `.secondary-cart-sidebar`. The live page's exact 8.13 markup was recreated from memory of the template.
- Domain checker: `.btn-add-to-cart` / `#cartItemCount` / `#primaryLookupResult .domain-available`.
- GA4: fires only where the client area already has `gtag` or GTM's `dataLayer`.
