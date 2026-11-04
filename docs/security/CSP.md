# Content-Security-Policy

Source of truth: `lib/security/csp-policy.mjs` (one builder used by `middleware.ts`, `next.config.mjs` and the tests).

## Where it is sent

| Paths | Sent by | Mode comes from |
|---|---|---|
| Public pages, `/admin/*` (everything the middleware matcher sees) | `middleware.ts` | the least strict of env `CSP_MODE` and Admin > Security > Mode (read from `/api/security/csp`, cached 60 s per instance) |
| `/account/*`, `/oauth/*`, `/mcp*`, `/template-part/*` | `next.config.mjs` headers | env `CSP_MODE` only (applied at build: change it, then redeploy) |
| JSON APIs, images, scripts, feeds | none needed | |

Default: **enforced** (`Content-Security-Policy`). `report` sends `Content-Security-Policy-Report-Only`, `off` sends nothing.
Violations go to `/api/csp-report` (`report-uri` and `report-to` / `Reporting-Endpoints`), aggregated in the `csp_reports`
table and listed in Admin > Security. Browser-extension noise is dropped.

## The policy

```
default-src 'self'
script-src  'self' 'unsafe-inline' Google Tag Manager / Analytics / Ads, Microsoft Clarity, Meta Pixel, TikTok Pixel,
            Cloudflare Turnstile, Vercel preview toolbar, Crisp chat, Google Maps, Trustpilot  (+ admin extras)
style-src   'self' 'unsafe-inline' fonts.googleapis.com client.crisp.chat vercel.live
font-src    'self' data: fonts.gstatic.com client.crisp.chat vercel.live
img-src     'self' data: blob: https:
connect-src 'self' my.globalhostia.com, the analytics hosts above, Turnstile, vercel.live, Crisp relays, Google Maps
frame-src   'self' googletagmanager.com td.doubleclick.net youtube(-nocookie).com challenges.cloudflare.com vercel.live
            game.crisp.chat widget.trustpilot.com
media-src   'self' blob: https:
worker-src  'self' blob:
manifest-src 'self'
form-action 'self' https://my.globalhostia.com https://globalhostia.com https://www.globalhostia.com https://globalhostiawebiste.vercel.app
frame-ancestors 'self'      (kept, as before; X-Frame-Options SAMEORIGIN too)
base-uri 'self'
object-src 'none'
report-uri /api/csp-report; report-to csp
```

`'unsafe-eval'` is added only under `next dev` (React refresh needs it); never in production.

### Why no nonces

Public pages are rendered once and served to every visitor from the CDN cache (`s-maxage`, per-currency copies), so a
per-request nonce is impossible without giving up caching. The theme also uses a few small inline bootstraps
(reduced-motion class, AI chat loader, `window.GH_AI` config, `onload` on the deferred stylesheet) and the admin is
Next.js App Router, which inlines its RSC payload. `'unsafe-inline'` therefore stays for `script-src` and `style-src`; the
protection comes from the strict host allow-list (no wildcard script, frame or connect sources), `object-src 'none'`,
`base-uri 'self'`, `form-action` and `frame-ancestors`. Inline script in our own code is kept to those bootstraps;
new behaviour goes into `/public/hp/*.js` files.

## How it was checked (2026-11-04)

`tests/csp-crawl.cjs` opens every sitemap URL plus fixed extras (166–170 pages), 8 client-area pages (mock WHMCS demo
account) and 13 admin pages in Chromium with the **enforced** policy and records every `securitypolicyviolation`:

| Run | Result |
|---|---|
| Current theme (Hostpen), public + client area + admin, AI chat opened, help video played, premium marquee, OG image | **0 violations** |
| Original (legacy) theme, same pages | Crisp chat and Google Maps found → allowed. One remaining: `/aws-pro-wordpress-ecommerce` loads Trustpilot over **http://** — browsers already block that on https as mixed content; fix the URL to `https://` in that legacy block if the widget is wanted. |

Unrelated pre-existing finding: the legacy contact/product templates reference `/mailer/mailer.js`, which does not exist
(served as an HTML 404, refused by `nosniff`).

Run it again after adding trackers or embeds:

```sh
BASE=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... NODE_PATH=$(npm root -g) node tests/csp-crawl.cjs
```

## Adding a new third-party source

1. Admin > Security > Content-Security-Policy > *Extra … sources*: one `https://` origin per line (validated; keywords,
   paths and `http:` are refused). Takes effect within about a minute, no deploy.
2. Or add it permanently in `lib/security/csp-policy.mjs` with a comment saying what uses it.
3. Watch Admin > Security > CSP violation reports. If a page breaks right after a change, switch Mode to *Report only*.
