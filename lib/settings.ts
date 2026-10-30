import { db, schema } from './db';
import { unstable_cache } from 'next/cache';

export type Settings = {
  site_name: string; site_url: string; phone: string; email: string; company: string; currency: string; default_cycle: string;
  whmcs_base_url: string; order_button_label: string; custom_css: string; custom_head: string; maintenance: boolean;
  sync_auto: boolean; publish_new_products: boolean; domain_suggest_tlds: string[];
  [k: string]: any;
};

export const getSettings = unstable_cache(async (): Promise<Settings> => {
  const rows = await db.select().from(schema.settings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Settings;
}, ['settings', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'] });

export async function setSetting(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}
