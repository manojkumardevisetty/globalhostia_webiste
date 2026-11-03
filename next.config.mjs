import fs from 'node:fs';
import { ALIAS_REDIRECTS } from './lib/aliases.mjs';

// scripts/build-assets.mjs (run by `npm run build`) writes minified copies next to public/hp/*.js|css.
// When they exist, shell.ts asset() links them (HP_MIN) and the URLs WHMCS loads cross-origin are rewritten to them.
const HP_MIN = fs.existsSync(new URL('./public/hp/theme.min.js', import.meta.url)) ? '1' : '';
const CROSS_ORIGIN_ASSETS = ['whmcs.js', 'whmcs.css', 'promo.js', 'promo.css', 'track.js'];

// Report-only CSP: the sources the site actually uses (theme, trackers in /hp/track.js, Google Fonts on the
// admin and legacy theme, WHMCS forms). Violations are reported by the browser console only; nothing is blocked.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://connect.facebook.net https://analytics.tiktok.com https://www.clarity.ms https://scripts.clarity.ms",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://my.globalhostia.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.clarity.ms https://www.facebook.com https://analytics.tiktok.com",
  "frame-src 'self' https://www.googletagmanager.com https://td.doubleclick.net https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self' https:",
  "worker-src 'self' blob:",
  "form-action 'self' https://my.globalhostia.com https://globalhostia.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Covers every subdomain (my., mail., panel. …): each must keep serving valid HTTPS before this is submitted to hstspreload.org.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP },
];
export default {
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
  outputFileTracingExcludes: { '*': ['public/**', 'legacy/html/**'] },
  env: { HP_MIN },
  // WHMCS moved from globalhostia.com/secure to my.globalhostia.com: 308 keeps the method, so payment
  // callbacks and form posts to old URLs still reach the client area.
  async redirects() {
    return [
      { source: '/secure', destination: 'https://my.globalhostia.com/', permanent: true },
      { source: '/secure/:path*', destination: 'https://my.globalhostia.com/:path*', permanent: true },
      // duplicate legacy template URLs -> their canonical page (one URL per page; query strings are kept)
      ...Object.entries(ALIAS_REDIRECTS).map(([slug, to]) => ({ source: `/${slug}`, destination: to, statusCode: 301 })),
    ];
  },
  // app/ ignores dot-folders, so the /.well-known files are served by rewrites
  async rewrites() {
    return {
      // the WHMCS skin loads /hp/whmcs.js etc. by fixed URL: serve the minified build there
      beforeFiles: HP_MIN ? CROSS_ORIGIN_ASSETS.map((f) => ({ source: `/hp/${f}`, destination: `/hp/${f.replace(/\.(js|css)$/, '.min.$1')}` })) : [],
      afterFiles: [
        { source: '/.well-known/mcp.json', destination: '/api/well-known/mcp' },
        { source: '/.well-known/ard.json', destination: '/api/well-known/ard' },
        // A2A agent card (v1.0 path, and the older agent.json path)
        { source: '/.well-known/agent-card.json', destination: '/api/well-known/agent-card' },
        { source: '/.well-known/agent.json', destination: '/api/well-known/agent-card' },
        // MCP Registry HTTP domain verification (value set by the owner in Admin > AI & MCP)
        { source: '/.well-known/mcp-registry-auth', destination: '/api/well-known/mcp-registry-auth' },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      // config headers win over route headers, so /account (which sends its own X-Frame-Options: DENY) is left out
      { source: '/((?!account(?:/|$)).*)', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      // machine endpoints (APIs, feeds, NLWeb /ask, OpenAPI/MCP manifests) are not search results pages
      { source: '/(api|feeds)/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      { source: '/(ask|openapi.json|server.json)', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      // *.vercel.app copies of the site (production alias, deployment URLs) must never be indexed next to globalhostia.com
      { source: '/:path*', has: [{ type: 'host', value: '(?<vhost>.*)\\.vercel\\.app' }], headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
      // Browser + CDN caching keeps Vercel transfer down. Later rules override earlier ones for the same header.
      { source: '/(css|js|fonts|plugins|assets|lang)/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }] },
      { source: '/image/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
      // theme assets are also loaded cross-origin by the WHMCS client area (my.globalhostia.com): CORS for scripts, styles and fonts.
      // Unversioned /hp/*.js|css (the WHMCS hook's fixed URLs): 1 hour, so a deploy reaches the client area quickly.
      { source: '/hp/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=604800' }] },
      // ?v=<build sha> (shell.ts asset()): the URL changes on every deploy, so cache it for a year
      { source: '/hp/:path*', has: [{ type: 'query', key: 'v' }], headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/hp/img/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
      // font files never change under the same name (new @fontsource versions get new files via the build script)
      { source: '/hp/fonts/:path*.woff2', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // crawler-heavy XML: answer from the CDN (the route handlers for feeds, llms*.txt and /api/catalog set the same themselves)
      { source: '/sitemap.xml', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' }] },
    ];
  },
};
