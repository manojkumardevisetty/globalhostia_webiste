import fs from 'node:fs';
import { ALIAS_REDIRECTS } from './lib/aliases.mjs';
import { buildCsp, cspHeaderName, parseMode, reportingEndpoints } from './lib/security/csp-policy.mjs';

// scripts/build-assets.mjs (run by `npm run build`) writes minified copies next to public/hp/*.js|css.
// When they exist, shell.ts asset() links them (HP_MIN) and the URLs WHMCS loads cross-origin are rewritten to them.
const HP_MIN = fs.existsSync(new URL('./public/hp/theme.min.js', import.meta.url)) ? '1' : '';
const CROSS_ORIGIN_ASSETS = ['whmcs.js', 'whmcs-i18n.js', 'whmcs.css', 'promo.js', 'promo.css', 'track.js', 'ai-assist.js', 'ai-assist.css'];

// Content-Security-Policy (lib/security/csp-policy.mjs, docs/security/CSP.md). middleware.ts sends it on public pages and
// the admin (with the Admin > Security mode); this static copy covers what middleware does not see (/account, /oauth, /mcp,
// /template-part). CSP_MODE=report|off (Vercel env, then redeploy) stops enforcing here and in middleware.
const CSP_MODE = parseMode(process.env.CSP_MODE);
const CSP_HEADER = cspHeaderName(CSP_MODE);
const CSP_STATIC = CSP_HEADER ? [{ key: CSP_HEADER, value: buildCsp({ dev: process.env.NODE_ENV === 'development' }) }, { key: 'Reporting-Endpoints', value: reportingEndpoints() }] : [];

/** @type {import('next').NextConfig} */
const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Covers every subdomain (my., mail., panel. …): each must keep serving valid HTTPS before this is submitted to hstspreload.org.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
];
export default {
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
  outputFileTracingExcludes: { '*': ['public/**', 'legacy/html/**'] },
  // last-known-good snapshot (scripts/snapshot.mjs, read by lib/lkg.ts when the database is unavailable)
  outputFileTracingIncludes: { '/**/*': ['./.snapshot/lkg.json'] },
  env: { HP_MIN },
  // WHMCS moved from globalhostia.com/secure to my.globalhostia.com: 308 keeps the method, so payment
  // callbacks and form posts to old URLs still reach the client area.
  async redirects() {
    return [
      { source: '/secure', destination: 'https://my.globalhostia.com/', permanent: true },
      { source: '/secure/:path*', destination: 'https://my.globalhostia.com/:path*', permanent: true },
      // legacy static URLs: /page.html -> /page (one canonical URL; Bing/Google drop the old .html copies);
      // the old home page /index.html -> / (not /index)
      { source: '/index.html', destination: '/', statusCode: 301 },
      { source: '/index', destination: '/', statusCode: 301 },
      { source: '/:slug((?!google)[a-zA-Z0-9-]+)\\.html', destination: '/:slug', statusCode: 301 },
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
        // AI connector OAuth: RFC 9728 protected resource metadata (bare and path-suffixed), RFC 8414 server metadata,
        // OpenAI app domain verification (lib/oauth/*, app/oauth/*, app/mcp/*)
        { source: '/.well-known/oauth-protected-resource', destination: '/api/well-known/oauth-protected-resource' },
        { source: '/.well-known/oauth-protected-resource/mcp', destination: '/api/well-known/oauth-protected-resource' },
        { source: '/.well-known/oauth-protected-resource/mcp/chatgpt', destination: '/api/well-known/oauth-protected-resource/chatgpt' },
        // /mcp/auth (sign-in up front) shares /mcp's resource and metadata
        { source: '/.well-known/oauth-protected-resource/mcp/auth', destination: '/api/well-known/oauth-protected-resource' },
        { source: '/.well-known/oauth-authorization-server', destination: '/api/well-known/oauth-authorization-server' },
        { source: '/.well-known/openai-apps-challenge', destination: '/api/well-known/openai-apps-challenge' },
        // RFC 9116 security contact (lib/security/disclosure.ts)
        { source: '/.well-known/security.txt', destination: '/api/well-known/security-txt' },
        { source: '/security.txt', destination: '/api/well-known/security-txt' },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      ...(CSP_STATIC.length ? [{ source: '/:p(account|oauth|mcp|template-part)', headers: CSP_STATIC }, { source: '/:p(account|oauth|mcp|template-part)/:path*', headers: CSP_STATIC }] : []),
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
      // The WHMCS hook versions its skin by date (?v=YYYYMMDD), not by build: never cache those for a year.
      { source: '/hp/:file(whmcs.js|whmcs-i18n.js|whmcs.css|promo.js|promo.css|ai-assist.js|ai-assist.css|whmcs.min.js|whmcs-i18n.min.js|whmcs.min.css|promo.min.js|promo.min.css|ai-assist.min.js|ai-assist.min.css)', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=3600' }] },
      // help videos, posters, captions and walkthrough frames are embedded in the WHMCS knowledgebase
      // (docs/whmcs/kb-help-videos.sql, <video crossorigin>): cross-origin <track> captions need CORS
      { source: '/help/:dir(videos|frames)/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: 'https://my.globalhostia.com' }] },
      { source: '/hp/img/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
      // font files never change under the same name (new @fontsource versions get new files via the build script)
      { source: '/hp/fonts/:path*.woff2', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // crawler-heavy XML: answer from the CDN (the route handlers for feeds, llms*.txt and /api/catalog set the same themselves)
      { source: '/sitemap.xml', headers: [{ key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' }] },
    ];
  },
};
