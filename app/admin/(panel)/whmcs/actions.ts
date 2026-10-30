'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail } from '@/lib/admin';
import { testConnection } from '@/lib/whmcs';
import { syncProducts, syncTlds } from '@/lib/sync';

export async function testWhmcs() {
  const s = await requireSession('integration');
  let r: { version: string; ms: number };
  try { r = await testConnection(); } catch (e: any) { fail('/admin/whmcs', `Connection failed: ${e.message}`); }
  await audit(s, 'test_connection', 'whmcs');
  done('/admin/whmcs', `Connected to WHMCS ${r.version} in ${r.ms}ms`);
}

export async function runSync(fd: FormData) {
  const s = await requireSession('integration');
  const kind = String(fd.get('kind'));
  const r = kind === 'tlds' ? await syncTlds('manual') : await syncProducts('manual');
  await audit(s, `sync_${kind}`, 'whmcs', r.runId, r.stats);
  if (!r.ok) fail('/admin/whmcs', `Sync failed: ${r.error}`);
  done('/admin/whmcs', `Sync finished: ${JSON.stringify(r.stats).replace(/[{}"]/g, '').replace(/,/g, ', ')}`);
}
