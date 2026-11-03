'use server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { brokerConfig, commissionFor, isBrokerStatus, catalogRate } from '@/lib/broker';
import { ensureBrokerProduct } from '@/lib/broker-whmcs';

const BASE = '/admin/domains/broker';
const money = (v: string) => { const s = v.replace(/[,\s]/g, ''); if (!s) return null; return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };

/** Commission in the request currency: pct × price, at least the USD minimum converted with our catalog ratio (or 1:1 for USD). */
async function minIn(currency: string, minUsd: number) {
  if (currency === 'USD') return minUsd;
  const { getCatalog } = await import('@/lib/theme/data');
  const cat = await getCatalog().catch(() => null);
  const r = cat ? catalogRate(cat.products, currency) : null;
  return r === null ? null : Math.round(minUsd * r * 100) / 100;
}

export async function updateBroker(fd: FormData) {
  const s = await requireSession('commerce');
  const id = str(fd, 'id');
  const back = `${BASE}/${encodeURIComponent(id)}`;
  const [row] = await db.select().from(schema.brokerRequests).where(eq(schema.brokerRequests.id, id));
  if (!row) fail(BASE, 'Request not found');
  const status = str(fd, 'status');
  if (!isBrokerStatus(status)) fail(back, 'Unknown status');
  const price = money(str(fd, 'agreed_price'));
  if (Number.isNaN(price) || (price !== null && price < 0)) fail(back, 'Agreed price must be a number such as 2500 or 2500.00');
  const cfg = brokerConfig(await getSettings());
  let commission: string | null = null;
  if (price !== null && price > 0) {
    const min = (await minIn(row.currency, cfg.minUsd)) ?? cfg.minUsd;
    commission = commissionFor(price, cfg.pct, min).toFixed(2);
  }
  const contacted = str(fd, 'owner_contacted_at');
  const ownerAt = contacted ? new Date(contacted) : (status === 'contacting_owner' && !row.ownerContactedAt ? new Date() : row.ownerContactedAt);
  if (ownerAt && Number.isNaN(ownerAt.getTime())) fail(back, 'Owner contacted date is not valid');
  const next = {
    status, assigned: str(fd, 'assigned').slice(0, 80), agreedPrice: price === null ? null : price.toFixed(2), commission,
    notes: str(fd, 'notes').slice(0, 4000), outcomeNotes: str(fd, 'outcome_notes').slice(0, 4000), ownerContactedAt: ownerAt, updatedAt: new Date(),
  };
  await db.update(schema.brokerRequests).set(next).where(eq(schema.brokerRequests.id, id));
  const changed = Object.fromEntries(Object.entries({ status, assigned: next.assigned, agreedPrice: next.agreedPrice, commission })
    .filter(([k, v]) => String((row as any)[k] ?? '') !== String(v ?? '')));
  await audit(s, 'update', 'broker_request', row.ref, { domain: row.domain, ...changed });
  done(back, `Saved${commission ? `: commission ${commission} ${row.currency}` : ''}`);
}

export async function quickStatus(fd: FormData) {
  const s = await requireSession('commerce');
  const id = str(fd, 'id'), status = str(fd, 'status');
  if (!isBrokerStatus(status)) fail(BASE, 'Unknown status');
  const [row] = await db.select().from(schema.brokerRequests).where(eq(schema.brokerRequests.id, id));
  if (!row) fail(BASE, 'Request not found');
  await db.update(schema.brokerRequests).set({ status, updatedAt: new Date(), ...(status === 'contacting_owner' && !row.ownerContactedAt ? { ownerContactedAt: new Date() } : {}) }).where(eq(schema.brokerRequests.id, id));
  await audit(s, 'update', 'broker_request', row.ref, { domain: row.domain, status, from: row.status });
  done(str(fd, 'back') || BASE, `${row.domain}: status updated`);
}

export async function saveBrokerSettings(fd: FormData) {
  const s = await requireSession('settings');
  const n = (k: string, max: number) => { const v = str(fd, k); const x = Number(v); if (!/^\d+(\.\d{1,2})?$/.test(v) || x > max) fail(BASE, `${k}: enter a number up to ${max}`); return x; };
  const fee = n('broker_fee_usd', 100000), pct = n('broker_commission_pct', 100), min = n('broker_min_commission_usd', 1000000);
  const pid = str(fd, 'broker_whmcs_pid'), dept = str(fd, 'broker_department_id');
  if (pid && !/^\d+$/.test(pid)) fail(BASE, 'WHMCS product ID must be a number');
  if (dept && !/^\d+$/.test(dept)) fail(BASE, 'Department ID must be a number');
  await setSetting('broker_fee_usd', fee);
  await setSetting('broker_commission_pct', pct);
  await setSetting('broker_min_commission_usd', min);
  await setSetting('broker_whmcs_pid', pid);
  await setSetting('broker_department_id', dept);
  const photo = str(fd, 'broker_photo');
  if (photo && !/^(https:\/\/|\/)[^\s"'<>]{1,500}$/.test(photo)) fail(BASE, 'Broker photo must be an https:// or /path image URL');
  await setSetting('broker_name', str(fd, 'broker_name').slice(0, 60));
  await setSetting('broker_title', str(fd, 'broker_title').slice(0, 80));
  await setSetting('broker_photo', photo);
  await audit(s, 'update', 'settings', 'broker', { fee, pct, min, pid, dept });
  done(BASE, 'Broker settings saved');
}

export async function createBrokerProduct() {
  const s = await requireSession('integration');
  const r = await ensureBrokerProduct(s.email);
  if (!r.ok) fail(BASE, `${r.permission ? 'Permission error: ' : 'Could not create the WHMCS product: '}${r.error}`);
  done(BASE, r.created ? `Created WHMCS product #${r.pid} (group ${r.gid})` : r.linked ? `Linked existing WHMCS product #${r.pid}` : `WHMCS product #${r.pid} is linked and exists`);
}
