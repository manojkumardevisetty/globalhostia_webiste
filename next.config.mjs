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
    ];
  },
  // app/ ignores dot-folders, so /.well-known/mcp.json is served by a rewrite
  async rewrites() {
    return [{ source: '/.well-known/mcp.json', destination: '/api/well-known/mcp' }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: security },
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/(css|js|fonts|plugins|image|assets|lang)/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' }] },
    ];
  },
};
