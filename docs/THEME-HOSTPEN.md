# Theme "Hostpen Modern" — build contract

The approved design is `public/previews/5-hostpen.html` (static concept). We are turning it into a real,
data-driven site theme rendered by the Next.js app, switchable in Admin → Design. Visitors keep the
original theme until the owner flips the switch; `?theme=hostpen` previews it (sticky via cookie).

## Brand
Logo palette: charcoal `#23313d` / deep `#16212b`, raspberry `#c5386f` (hover `#a6225f`, light `#e14c7f`),
gold `#fdd700` (accents only, never text on white), neutrals `#f6f7f9` / `#e6e9ee` / `#5a6774`.
Fonts Manrope (headings) + Inter (body) with system fallbacks. Hexagon motif (logo) at low opacity.
Enterprise grade, calm, premium. No emoji, inline SVG icons only.

## Files and ownership
| Path | Purpose |
|---|---|
| `lib/theme/data.ts` | `getCatalog()` (cached, tag `site`, key includes `VERCEL_GIT_COMMIT_SHA`), product/price helpers |
| `lib/theme/menu.ts` | default mega-menu config (labels, groups, links, icons, descriptions, featured panel) |
| `lib/theme/ui.ts` | HTML-string components (see below) + `icon(name)` |
| `lib/theme/shell.ts` | `page(opts)` → full HTML document (head, utility bar, header + mega menus, drawer, main, footer) |
| `lib/theme/routes.ts` | slug → page module map (owned by coordinator) |
| `lib/theme/index.ts` | `renderTheme(slug, ctx)` (owned by coordinator) |
| `lib/theme/pages/<kind>.ts` | one module per page kind; `export default async function (ctx: PageCtx): Promise<string>` |
| `public/hp/theme.css`, `public/hp/theme.js` | shared styles + behaviours (all pages) |
| `public/hp/pages/<kind>.css/.js` | page-specific visuals, loaded via `page({ css: ['<kind>'], js: ['<kind>'] })` |
| `public/hp/img/` | optimised images (copy from `public/previews/hostpen/` or `public/image/unsplash/`, ≤1920px, q≈78) |

Page agents only create/edit their own `lib/theme/pages/<kind>.ts` and `public/hp/pages/<kind>.*` (+ images
in `public/hp/img/<kind>-*`). If a shared component is missing, write it locally in your page module;
do not edit shared files (report what you'd add instead).

## PageCtx
```ts
type PageCtx = { slug: string; path: string; preview: boolean; query: URLSearchParams; route: RouteDef };
type RouteDef = { kind: string; title: string; description: string; categories?: string[] };
```

## Data rules (critical)
- Prices ONLY from the database (`product_prices`, synced from WHMCS) and `tlds`. Never hard-code or invent
  prices. If a product has no price: show "See price" linking to its order URL.
- Products come from `getCatalog()` filtered by the route's `categories`; respect `status='PUBLISHED'`,
  `whmcsRetired=false`, sort by `sortOrder` then price. Layouts must adapt to 0, 1, 2–4, 5–12, 13+ products
  (empty state, featured, cards, grid, filterable list).
- Features: string[]; a leading `-` means *not included* (show muted with ✕).
- `attributes` / features carry specs (cpu, ram, storage, bandwidth, location…). Use `deriveSpecs` from
  `lib/render/specs.ts`.
- Order links: `orderUrl(product, base, cycle)` from `lib/render/products.ts`; WHMCS base from settings
  (`whmcs_base_url`). Domain search: GET `${base}/cart.php` with `a=add&domain=register&query=`.
- Text that is illustrative (sample reviews, latency numbers) must be labelled as such.

## Motion & quality bar
Only animate transform/opacity (stroke-dashoffset/canvas OK). IntersectionObserver reveals; every loop
paused off-screen and when `document.hidden`; full `prefers-reduced-motion` fallback; 60fps; no layout
shift; no horizontal scroll at 375/390/768/1024/1440; contrast ≥ 4.5:1; focus visible; touch targets ≥ 44px;
semantic HTML, one `<h1>` per page, JSON-LD where useful.

## Testing
Local DB with realistic fixture: `DATABASE_URL=$(cat /tmp/theme_db_url)`. Build `npx next build`,
run `PORT=<yourport> DATABASE_URL=$(cat /tmp/theme_db_url) npx next start` in background (each agent uses
its own port; the coordinator uses 3000). Preview: `http://localhost:<port>/<slug>?theme=hostpen`.
Screenshot with Playwright (1440 + 390), read the screenshots, fix issues. Scratch files go in
`/tmp/claude-0/-home-claude/dc90bf84-477a-5521-9892-a2238c45b993/scratchpad/` with your own prefix.
