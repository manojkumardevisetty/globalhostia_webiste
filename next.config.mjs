import { ALIAS_REDIRECTS } from './lib/aliases.mjs';

/** @type {import('next').NextConfig} */
const security = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // no includeSubDomains/preload: subdomains (mail, ftp, panel, my.) are served by the hosting server
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
export default {
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
  outputFileTracingExcludes: { '*': ['public/**', 'legacy/html/**'] },
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
  // app/ ignores dot-folders, so /.well-known/mcp.json is served by a rewrite
  async rewrites() {
    return [
      { source: '/.well-known/mcp.json', destination: '/api/well-known/mcp' },
      // A2A agent card (v1.0 path, and the older agent.json path)
      { source: '/.well-known/agent-card.json', destination: '/api/well-known/agent-card' },
      { source: '/.well-known/agent.json', destination: '/api/well-known/agent-card' },
      // MCP Registry HTTP domain verification (value set by the owner in Admin > AI & MCP)
      { source: '/.well-known/mcp-registry-auth', destination: '/api/well-known/mcp-registry-auth' },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/(css|js|fonts|plugins|image|assets|lang)/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }] },
    ];
  },
};
