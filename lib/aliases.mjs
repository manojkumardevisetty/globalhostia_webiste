// Legacy alias URLs (pages from the purchased "aws-pro" template, and the old /vps-2) that rendered the same
// page module and products as a main URL, so they competed with it in search under the same title.
// Each one 301-redirects to its canonical page (next.config.mjs), is left out of the sitemap
// (app/sitemap.xml/route.ts) and has its legacy *.html redirect re-pointed straight at the target (db-setup patch 015).
// Plain .mjs so next.config.mjs and scripts/db-setup.mjs can import it too.

/** @type {Readonly<Record<string, string>>} alias slug -> canonical path */
export const ALIAS_REDIRECTS = Object.freeze({
  'aws-pro-wordpress': '/wordpress-hosting',
  'aws-pro-vps-hosting': '/vps-hosting',
  'vps-2': '/vps-hosting',
  'aws-pro-dedicated-server': '/dedicated-servers',
  'aws-pro-fully-managed-dedicated-server': '/dedicated-servers',
  'aws-pro-domains-search': '/domains-registration',
  'aws-pro-cpanel-hosting': '/cpanel-reseller',
  'aws-pro-professional-business-email': '/google-workspace',
});

/** Slugs that are redirected away and must not be listed in the sitemap. */
export const ALIAS_SLUGS = Object.freeze(Object.keys(ALIAS_REDIRECTS));
