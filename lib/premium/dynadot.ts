// Dynadot API adapter (server-only). The API key never reaches a browser and, on the primary path, never leaves WHMCS.
//
// Primary: the WHMCS-server proxy docs/whmcs/gh_dynadot_proxy.php. The owner's WHMCS server IP is already whitelisted
// at Dynadot and WHMCS → Registrars → Dynadot holds the key, so the proxy reads the key there and calls
// https://api.dynadot.com/api3.json itself. Our requests to it are HMAC-signed and limited to read-only commands
// (lib/premium/core.ts PROXY_COMMANDS; the PHP file enforces the same list).
//   POST <proxy>  body {"cmd":"get_listings","params":{…}}  header X-GH-Signature: t=<unix>,v1=hex(HMAC-SHA256("gh-dynadot.v1.<t>.<body>", secret))
//   secret: env DYNADOT_PROXY_SECRET (≥32 chars), else the existing WHMCS hook secret (Admin → Hosting panels, GH_HOSTING_SECRET).
// Fallback: direct calls with env DYNADOT_API_KEY (only works from an IP Dynadot allows; Vercel egress IPs change).
//
// Dynadot api3 (JSON): GET https://api.dynadot.com/api3.json?key=…&command=…  Commands used, all read-only:
//   get_listings (marketplace listings, count_per_page/page_index/currency), get_listing_item (listing_id),
//   search (domain0..N, show_price=1: price + premium flag), list_domain (the account's own domains, for the import picker).
import 'server-only';
import { hmacSecret } from '../hosting/servers';
import { whmcsBase } from '../whmcs';
import type { PremiumConfig, Transport } from './core';

// the client itself is pure (lib/premium/core.ts) so tests can run it against a mock Dynadot / proxy
export { call, getListings, getListingItem, searchPrices, ownDomains, adviceFor } from './core';
export type { Transport } from './core';

export const defaultProxyUrl = () => `${whmcsBase()}/gh_dynadot_proxy.php`;

async function proxySecret(): Promise<string | null> {
  const e = process.env.DYNADOT_PROXY_SECRET;
  if (e && e.length >= 32) return e;
  const s = await hmacSecret().catch(() => null);
  return s && s.length >= 32 ? s : null;
}

/** Which path calls Dynadot, given the admin choice (auto = proxy when a secret exists, else direct key). */
export async function transport(cfg: Pick<PremiumConfig, 'source' | 'proxyUrl'>): Promise<Transport> {
  const url = cfg.proxyUrl || process.env.DYNADOT_PROXY_URL || defaultProxyUrl();
  const key = process.env.DYNADOT_API_KEY || '';
  if (cfg.source !== 'direct') {
    const secret = await proxySecret();
    if (secret && /^https:\/\//i.test(url)) return { mode: 'proxy', url, secret };
    if (cfg.source === 'proxy') return { mode: 'none', reason: 'No proxy secret: set the WHMCS hook secret in Admin → Hosting panels (or DYNADOT_PROXY_SECRET).' };
  }
  if (key) return { mode: 'direct', key };
  return { mode: 'none', reason: 'Dynadot is not connected: upload gh_dynadot_proxy.php to WHMCS (recommended) or set DYNADOT_API_KEY.' };
}

