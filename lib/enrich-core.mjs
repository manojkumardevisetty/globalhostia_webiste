// Product details recovered from the original website (legacy/product-details.json),
// merged onto WHMCS products so the live product sections are as detailed as the old pages.
// Shared by the WHMCS sync (lib/sync.ts) and the deploy-time patch (scripts/db-setup.mjs).

const GROUP_LOCATION = { 'hosting-usa': 'USA', 'hostia-shared': 'Malaysia', 'hosting-singapore': 'Singapore' };

export function storeKey(whmcsUrl, slug, details) {
  const m = (whmcsUrl || '').match(/\/store\/([\w-]+)\/([\w-]+)/);
  if (m && details[`${m[1]}/${m[2]}`]) return `${m[1]}/${m[2]}`;
  if (slug) for (const k of Object.keys(details)) if (k.endsWith('/' + slug)) return k;
  return null;
}

/** Returns { tagline, features, attributes, badge } recovered for a product, or null. */
export function enrichment(details, whmcsUrl, slug) {
  const key = storeKey(whmcsUrl, slug, details);
  if (!key) return null;
  const d = details[key];
  const group = key.split('/')[0];
  const attributes = { ...(d.specs || {}) };
  if (GROUP_LOCATION[group] && !attributes.location) attributes.location = GROUP_LOCATION[group];
  if (d.kind === 'row') {
    const s = d.specs || {};
    const features = [
      s.cpu && `${s.cpu}${/core|cpu/i.test(s.cpu) ? '' : ' processor'}`,
      s.ram && `${s.ram}${/ram/i.test(s.ram) ? '' : ' RAM'}`,
      s.storage && `${s.storage}${/storage/i.test(s.storage) ? '' : ' storage'}`,
      s.os && `${s.os} operating system`,
      s.ips, s.bandwidth && (/unmetered|unlimited/i.test(s.bandwidth) ? `${s.bandwidth} bandwidth`.replace(/bandwidth bandwidth/i, 'bandwidth') : s.bandwidth),
    ].filter(Boolean);
    return { tagline: d.model || '', features, attributes, badge: d.badge || '' };
  }
  const features = (d.features || []).filter((f) => !/^all important features$/i.test(f.replace(/^-/, '')));
  return { tagline: d.description || '', features, attributes, badge: /most popular/i.test(d.name || '') ? 'Most popular' : '' };
}
