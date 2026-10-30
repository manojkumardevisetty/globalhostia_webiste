# Concept brief (shared by all 5 concepts)

Brand: **GlobalHostia** (globalhostia.com) — Dubai-based hosting & domains company. Competes with GoDaddy/Hostinger/Namecheap/IONOS.

## Real product structure (use these, with the prices shown; never invent other prices)
- Shared Hosting: Hostia Lite $2.99/mo, Hostia Ultra $5.99/mo, Hostia Infinity $9.99/mo (locations: UAE, USA, Singapore; cPanel, NVMe, free SSL)
- Managed WordPress: from $12.99/mo (1 site, 25GB NVMe, free SSL)
- VPS: Linux VPS 01–06 from $8/mo (2 vCPU/4GB → 16 vCPU/64GB), Windows VPS 01–04, Forex VPS $8/mo or $88/yr
- Dedicated: 22 SKUs (Hostia Air, Compact, Core, Edge, Flex, Go, Mini, Pocket, Prime, Spark + Plus variants) from $39.99/mo (4C/4T, 16GB, 160GB SSD, 5 IPs, 1Gbps); Premium A/B/C and 10G (32 cores, 256GB, 2x2TB SSD, 10Gbps)
- AI/LLM Servers: Starter AI $8.99, Professional AI $18.99, Enterprise AI $25.99 /mo
- Automation: n8n Pro, n8n Elite
- SSL: PositiveSSL DV $9.23/yr, Thawte SSL123 Flex $49.22/yr, EssentialSSL Wildcard $109.51/yr, GeoTrust TrueBusinessID Flex
- Domains: .com $13.65, .net $8.29, .org $8.65, .shop $1.20, .ae, .io
- Business Email / Google Workspace; cPanel Reseller (coming soon)

## Required screens in each concept (single self-contained HTML file, client-side "router" via hash or tabs)
1. Homepage 2. Hosting category page (Shared) 3. Product listing (VPS, 10 items → filters) 4. Product detail (Hostia Ultra) 5. Pricing comparison 6. Domain search + results 7. Cart & checkout 8. Customer dashboard 9. Mobile nav (responsive; include a visible mobile-frame preview toggle)

## Rules
- One file: `concepts/concept-N-<slug>.html`. Tailwind via CDN allowed + custom CSS; Google Fonts allowed; no other external deps. Inline SVG illustrations only (no stock images).
- Each concept must differ in layout strategy, typography, nav pattern, card structure and interaction — not just colors.
- Realistic copy, billing-cycle toggles (monthly/annual), renewal price shown, trust/location badges (UAE/USA/SG/IN).
- Fast, no heavy animation. Accessible contrast. Works at 375px and 1440px.
- Footer: © 2026 GlobalHostia · Desert Tech Cloud Services LLC, Dubai, UAE.
- Keep file ≤ 250KB.

## DIRECTION (v2, approved reference: GoDaddy)
All 5 themes follow the GoDaddy design language — inspired, not copied (no GoDaddy logo, name, fonts or exact colours):
- White background, lots of air, **very bold black display headlines** (use a heavy geometric sans: e.g. "Outfit" 800/900 or "Figtree" 900), medium-weight body.
- Hero = giant domain search bar (rounded, dark button) with TLD price chips underneath.
- Product cards: white, 1px light border, soft shadow on hover, "Starting at $X.XX/mo" with "renews at $Y" small text, green/teal "Save %" pill, solid dark CTA button.
- Simple top nav (logo, Domains, Websites & Hosting, Email, Security, Pricing ▾ mega-menu, Sign In, cart icon), dark charcoal footer with link columns.
- Rounded corners 8–12px, friendly illustrations as simple inline SVG, trust row (24/7 support, money-back, 99.9% uptime).
- Each theme must still differ clearly in: accent colour, nav/mega-menu pattern, hero composition, card style, and section rhythm — they are selectable themes in the admin.
