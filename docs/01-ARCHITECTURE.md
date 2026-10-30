# GlobalHostia Platform — Phase 1: Discovery & Architecture

Date: 2026-10-30 · Status: for review before Phase 2

## 1. Discovery (existing site)

**Source:** globalhostia.zip (53 files, static HTML) + live site.
**WHMCS:** `https://globalhostia.com/secure/` (admin `/secure/admin/`, API `/secure/includes/api.php`).

### 1.1 Page inventory (static → new route)
| Existing page | New route | Notes |
|---|---|---|
| index.html | `/` | homepage |
| web-hosting.html, shared-hosting.html, web-hosting1.html | `/hosting/shared` | 3 duplicates → 1 + 301s |
| wordpress-hosting.html, aws-pro-wordpress*.html | `/hosting/wordpress` | |
| vps-hosting.html, vps-2.html, cloudvps-hosting.html, aws-pro-vps-hosting.html | `/hosting/vps` | |
| dedicated-servers.html, aws-pro-*dedicated-server.html | `/hosting/dedicated` | |
| cpanel-reseller.html, aws-pro-cpanel-hosting.html | `/hosting/reseller` | "coming soon" today |
| ssl-certificate.html | `/ssl` | |
| domains-registration.html, aws-pro-domains-search.html | `/domains` | |
| google-workspace.html, aws-pro-professional-business-email.html | `/email` | |
| website-builder.html, start-vpn.html, network.html, projects.html | `/solutions/*` (CMS landing pages) | |
| about, contact, blog*, help-center, all-topics, status-page, incident-* | CMS pages | |
| terms-conditions, privacy-policy | CMS legal pages | |
| sign-in, sign-up, forget-password | `/account/*` (WHMCS-backed) | |
| index1, index111111, index.html.moved, binance.html | drop (no redirect) | junk/dev copies |

Existing `.htaccess`, `sitemap.xml`, `robots.txt`, `llms.txt` preserved as inputs for the redirect map.

### 1.2 WHMCS product groups found in links (→ initial category mapping)
| WHMCS group slug | Products seen | Frontend category |
|---|---|---|
| hostia-shared | lite, ultra, ultra-usa, infinity | Shared Hosting |
| hosting-usa / hosting-singapore | lite/infinity-usa, lite/ultra/infinity-sg | Shared Hosting (location attribute) |
| hostiavps | h-linux-vps-01..06, h-windows-vps-01..04 | VPS (OS attribute) |
| dedicated-servers | 22 SKUs (hostia-air … hostia-spark-mini) | Dedicated |
| premiumdedicated-servers | premiuma/b/c, premium10g1 | Dedicated › Premium/10G |
| ssl-certificates | positivessl-dv, thawte-ssl123-flex, essentialssl-wildcard-dv, geotrust-true-businessid-flex | SSL |
| mcps | n8n-elite, n8n-pro | Automation / AI |
| ai-llm | starter/professional/enterprise AI | AI Servers |
| forex-vps | forex-vps | VPS › Forex |
| project-management | pm-shared/dedicated-workspace | Workspaces |

Group IDs/pricing will be pulled via `GetProducts` on first sync — no prices are hardcoded.

### 1.3 Known content issues to fix in migration
Broken prices ("$ .99"), conflicting domain prices (widget vs FAQ), "Lorem ipsum" in support widget, © 2021 footer.

## 2. Technology stack (confirmed)
- **Next.js 15 (App Router) + React + TypeScript**, Tailwind, shadcn-style component library (custom theme tokens).
- **PostgreSQL** (Supabase project — Postgres + Auth + Storage) + **Prisma**.
- **Redis** (Upstash) for cache, rate-limit, BullMQ sync jobs.
- **Vercel** hosting (connected). Cron → sync jobs. Docker Compose for self-host parity.
- Auth: NextAuth (admin staff, RBAC) + customer sessions mapped to WHMCS client IDs (SSO via `CreateSsoToken`).
- Validation: zod everywhere; audit log table for all admin writes.

## 3. Database (Prisma, summary)
```
Admin: AdminUser, Role, Permission, AuditLog, Revision
Catalog: Category(tree, layoutOverride), ProductType(attributeSchema JSON),
         Product(status draft/published/archived, whmcsPid, typeId, attributes JSON, sortOrder),
         ProductPrice(currency, cycle, price, setupFee, renewPrice — synced), Addon, ConfigOption,
         ComparisonTable, Badge/Promo
Domains: Tld(whmcs synced pricing: register/renew/transfer), TldPromo, DomainBundle
CMS: Page(slug, status, seo), Section(type, props JSON, order), Navigation, Footer, Banner,
     Testimonial, Faq, Redirect, ThemeSettings(tokens JSON), MediaAsset
Integration: WhmcsSyncRun, WhmcsSyncLog, WhmcsMapping, WebhookEvent
Commerce (read-mirror only): OrderMirror, CustomerMirror — WHMCS is source of truth
```

## 4. WHMCS integration strategy
- Server-only client (`lib/whmcs/client.ts`), creds in Vercel env, never in browser. Every call logged (action, duration, status, error).
- **Verified API actions used:** GetProducts, GetTLDPricing, DomainWhois, GetClientsDetails, GetClientsProducts, GetClientsDomains, GetInvoices, AddClient, UpdateClient, ValidateLogin, CreateSsoToken, AddOrder, GetOrders, GetPromotions, GetSupportDepartments/OpenTicket/GetTickets, DomainGetNameservers/UpdateNameservers, DomainGetWhoisInfo, GetCurrencies, GetPaymentMethods.
- **Not in standard API:** product *creation* and config-option editing. Products are created in the admin as drafts and linked to an existing WHMCS pid; "create in WHMCS" button = guided deep link to WHMCS admin + sync-back. Checkout hands off to WHMCS cart (`AddOrder` → invoice → WHMCS gateway) — no card data touches the app.
- Sync: scheduled (every 15 min) + manual "Sync now"; idempotent upsert on `whmcsPid`; conflicts and failures surfaced in Integration Center with retry.
- **Blocker today:** the Claude cloud sandbox cannot reach globalhostia.com (proxy 403), so API test must run from Vercel or your machine (connect a folder and I'll run it via device shell).

## 5. Admin dashboard modules
Overview · Products · Categories · Website Builder (section-based page builder, live preview iframe, publish/schedule) · Design Manager (theme tokens → CSS vars) · WHMCS Integration Center · Domains (TLDs, promos, bundles) · Orders (mirror) · Customers (mirror) · Marketing & SEO (coupons via GetPromotions, metadata, redirects) · Users & Roles · System Settings.
Cross-cutting: global search (⌘K), bulk edit, drag-drop ordering, revisions, draft→review→published workflow.

## 6. Adaptive layout engine
Rules evaluated per category/listing at render (admin override wins):
| Condition | Template |
|---|---|
| 1 product | `featured-hero` (full detail + CTA) |
| 2–4 | `pricing-cards` + auto comparison table from type attributes |
| 5–12 | `grid` + sort + attribute filters |
| 13–49 | `grid` + category nav + pagination |
| ≥50 or nested subcats | `catalog` (search, facets, pagination, compare) |
| description > 1,200 chars | tabs/accordion content layout |
Filters/compare columns are generated from `ProductType.attributeSchema` (e.g. VPS: cpu, ram, storage, os, location).

## 7. Roadmap
| Phase | Deliverable | Est. |
|---|---|---|
| 1 Discovery/Arch | this doc | done |
| 2 Five UI concepts | 5 clickable HTML concept decks (desktop+mobile) | 2–3 days |
| 3 Backend/DB | Prisma schema, auth, RBAC, APIs, seed from zip inventory | 1 wk |
| 4 Admin | all 12 modules + page builder + preview | 2 wk |
| 5 WHMCS | sync, mapping, domains, orders, customer SSO, tickets | 1–1.5 wk |
| 6 Frontend | selected concept, all pages data-driven | 1.5 wk |
| 7 QA | e2e (Playwright), responsive, security, sync failure tests | 3–4 days |
| 8 Deploy | Vercel prod, env, backups, redirects, handover PDF | 2–3 days |

## 8. Decisions needed from you
1. Approve stack (Supabase Postgres vs plain Postgres on a VPS).
2. Confirm brand: **GlobalHostia** (doc says BudgetGlobalHosting).
3. Default currency/currencies (USD + AED?).
4. OK to start Phase 2 (5 concepts) immediately.
