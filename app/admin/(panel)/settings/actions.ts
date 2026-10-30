'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { setSetting } from '@/lib/settings';

export async function saveSettings(fd: FormData) {
  const s = await requireSession('settings');
  const text = ['site_name', 'site_url', 'phone', 'email', 'company', 'whmcs_base_url', 'currency', 'default_cycle', 'order_button_label'];
  for (const k of ['site_url', 'whmcs_base_url']) if (str(fd, k) && !/^https:\/\//.test(str(fd, k))) fail('/admin/settings', `${k} must start with https://`);
  if (str(fd, 'currency') && !/^[A-Z]{3}$/.test(str(fd, 'currency'))) fail('/admin/settings', 'Currency must be a 3-letter code like USD or AED');
  for (const k of text) await setSetting(k, str(fd, k));
  for (const k of ['maintenance', 'publish_new_products', 'sync_auto']) await setSetting(k, bool(fd, k));
  await setSetting('custom_head', String(fd.get('custom_head') ?? ''));
  await audit(s, 'update', 'settings');
  done('/admin/settings', 'Settings saved');
}
