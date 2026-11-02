'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { TRUST_DEFAULTS } from '@/lib/theme/growth';

export async function saveSettings(fd: FormData) {
  const s = await requireSession('settings');
  const text = ['site_name', 'site_url', 'phone', 'email', 'company', 'whmcs_base_url', 'currency', 'default_cycle', 'order_button_label'];
  for (const k of ['site_url', 'whmcs_base_url']) if (str(fd, k) && !/^https:\/\//.test(str(fd, k))) fail('/admin/settings', `${k} must start with https://`);
  if (str(fd, 'currency') && !/^[A-Z]{3}$/.test(str(fd, 'currency'))) fail('/admin/settings', 'Currency must be a 3-letter code like USD or AED');
  for (const k of text) await setSetting(k, str(fd, k));
  for (const k of ['maintenance', 'publish_new_products', 'sync_auto']) await setSetting(k, bool(fd, k));
  await setSetting('custom_head', String(fd.get('custom_head') ?? ''));
  // Trust & conversion
  const wa = str(fd, 'whatsapp');
  if (wa && !/^\+?[\d\s()-]{7,20}$/.test(wa)) fail('/admin/settings', 'WhatsApp number: digits only, with country code, e.g. +971 50 734 1578');
  await setSetting('whatsapp', wa);
  await setSetting('whatsapp_float', bool(fd, 'whatsapp_float'));
  await setSetting('trust_points', TRUST_DEFAULTS.map((d) => ({ id: d.id, on: bool(fd, `trust_on_${d.id}`), text: str(fd, `trust_text_${d.id}`).slice(0, 120) || d.text })));
  const dept = str(fd, 'migration_department_id');
  if (dept && !/^\d+$/.test(dept)) fail('/admin/settings', 'Migration department ID must be a number (WHMCS → Support Departments)');
  await setSetting('migration_department_id', dept);
  const tests = String(fd.get('dc_test_urls') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const l of tests) if (!/^[^:]{1,40}:\s*https:\/\/\S+$/.test(l)) fail('/admin/settings', `Latency test line "${l.slice(0, 60)}" must look like "Germany: https://…"`);
  await setSetting('dc_test_urls', tests.join('\n'));
  await audit(s, 'update', 'settings');
  done('/admin/settings', 'Settings saved');
}
