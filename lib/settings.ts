import { db, schema } from './db';
import { cachedRead } from './lkg';

export type Settings = {
  site_name: string; site_url: string; phone: string; email: string; company: string; currency: string; default_cycle: string;
  whmcs_base_url: string; order_button_label: string; custom_css: string; custom_head: string; maintenance: boolean;
  sync_auto: boolean; publish_new_products: boolean; domain_suggest_tlds: string[];
  [k: string]: any;
};

/** Used only when there is neither a database nor a snapshot (lib/lkg.ts): the site still renders. */
export const DEFAULT_SETTINGS: Settings = {
  site_name: 'GlobalHostia', site_url: 'https://globalhostia.com', phone: '(+971) 50-7341578', email: 'support@globalhostia.com',
  company: 'GlobalHostia', currency: 'USD', default_cycle: 'auto',
  whmcs_base_url: process.env.WHMCS_BASE_URL || 'https://my.globalhostia.com', order_button_label: 'Order Now', custom_css: '', custom_head: '',
  maintenance: false, sync_auto: true, publish_new_products: true, domain_suggest_tlds: ['.com', '.net', '.org', '.ae', '.io', '.shop', '.online', '.co'],
  site_theme: 'hostpen',
};
// logs and bookkeeping that pages never read stay out of the cache and the snapshot
const NOT_PUBLIC = new Set(['indexnow_log', 'patches', 'setup_fingerprint', 'hosting_servers', 'hosting_hmac_secret', 'hosting_dns_only']); // hosting_*: sealed panel secrets (lib/hosting/servers.ts)

/** All settings (cached 6h, tag `site`; snapshot-backed when the database is unavailable). */
export const getSettings = cachedRead('settings', async (): Promise<Settings> => {
  const rows = await db.select().from(schema.settings);
  return Object.fromEntries(rows.filter((r) => !NOT_PUBLIC.has(r.key)).map((r) => [r.key, r.value])) as Settings;
}, { fallback: () => ({ ...DEFAULT_SETTINGS }) });

export async function setSetting(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}
