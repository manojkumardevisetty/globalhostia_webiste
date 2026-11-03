// Domain Broker Service ↔ WHMCS: idempotent creation/linking of the one-time "Domain Broker Service" product.
// Server-only. Credentials stay in lib/whmcs.ts. Guarded by a settings lock so two requests never create it twice.
import 'server-only';
import { sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db, schema } from './db';
import { getSettings, setSetting } from './settings';
import { whmcs, whmcsConfigured, getProducts, WhmcsError, type WhmcsProduct } from './whmcs';
import { brokerConfig, BROKER_PRODUCT_NAME } from './broker';

export type EnsureResult = { ok: true; pid: string; gid: string; created: boolean; linked: boolean } | { ok: false; error: string; permission?: boolean };

const LOCK = 'broker_product_lock';
const DEPLOY = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12);

/** Take the settings lock (expires after 2 minutes). Returns false when someone else holds it. */
async function lock(): Promise<boolean> {
  const now = Date.now();
  const rows = await db.execute(sql`insert into settings (key, value) values (${LOCK}, ${JSON.stringify(now)}::jsonb)
    on conflict (key) do update set value = excluded.value
    where (settings.value #>> '{}')::bigint < ${now - 120_000}
    returning key`);
  return ((rows as any).rows ?? rows).length > 0;
}
const unlock = () => db.execute(sql`update settings set value = '0'::jsonb where key = ${LOCK}`).catch(() => {});

const isPermission = (m: string) => /permission|not allowed|access denied|unauthori[sz]ed|invalid permissions|api role/i.test(m);
const audit = (who: string, action: string, detail: unknown, entityId: string | null = null) =>
  db.insert(schema.auditLogs).values({ userEmail: who, action, entity: 'broker_product', entityId, detail: detail as any }).catch(() => {});

/** Product group for the broker product: a group named like "domain", else the group of an SSL/other product, else any. */
function pickGroup(list: WhmcsProduct[], groups: { id: number | string; name: string }[]): string {
  const g = groups.find((x) => /domain/i.test(x.name));
  if (g) return String(g.id);
  const p = list.find((x) => /ssl/i.test(x.name) || /ssl/i.test(String(x.module || ''))) || list.find((x) => x.type === 'other') || list[0];
  return p ? String(p.gid) : '';
}

/**
 * 1. settings.broker_whmcs_pid still exists in WHMCS → use it.
 * 2. a product named "Domain Broker Service" exists → link it.
 * 3. otherwise AddProduct (type other, one-time, hidden, USD fee + every WHMCS currency converted with its rate).
 * Saves broker_whmcs_pid / broker_whmcs_gid and writes an audit entry. Never throws.
 */
export async function ensureBrokerProduct(who = 'system'): Promise<EnsureResult> {
  if (!whmcsConfigured()) return { ok: false, error: 'WHMCS API is not configured on the server.' };
  if (!(await lock().catch(() => false))) return { ok: false, error: 'Another request is creating the product right now. Try again in a minute.' };
  try {
    const s = await getSettings();
    const cfg = brokerConfig(s);
    if (cfg.pid) {
      const r = await whmcs<{ products?: { product?: WhmcsProduct[] } }>('GetProducts', { pid: cfg.pid });
      const p = (r.products?.product || []).find((x) => String(x.pid) === cfg.pid);
      if (p) return { ok: true, pid: cfg.pid, gid: String(p.gid), created: false, linked: false };
    }
    const all = await getProducts();
    const found = all.find((p) => p.name.trim().toLowerCase() === BROKER_PRODUCT_NAME.toLowerCase());
    if (found) {
      await save(String(found.pid), String(found.gid));
      await audit(who, 'broker_product_link', { pid: found.pid, gid: found.gid }, String(found.pid));
      return { ok: true, pid: String(found.pid), gid: String(found.gid), created: false, linked: true };
    }

    let groups: { id: number | string; name: string }[] = [];
    try { groups = (await whmcs<{ groups?: { group?: { id: number; name: string }[] } }>('GetProductGroups')).groups?.group || []; }
    catch { /* GetProductGroups is not in every WHMCS version / API role: fall back to product gids */ }
    const gid = pickGroup(all, groups);
    if (!gid) return { ok: false, error: 'No product group found in WHMCS. Create any product group first, then try again.' };

    // fee in every WHMCS currency: rates are relative to the WHMCS default currency
    const curs = (await whmcs<{ currencies?: { currency?: { id: number | string; code: string; rate?: string | number }[] } }>('GetCurrencies')).currencies?.currency || [];
    const usd = curs.find((c) => c.code === 'USD');
    const usdRate = usd ? parseFloat(String(usd.rate ?? 1)) || 1 : 1;
    const params: Record<string, string | number | boolean> = {
      type: 'other', gid, name: BROKER_PRODUCT_NAME, paytype: 'onetime', hidden: true, showdomainoptions: false,
      description: `Domain acquisition (broker) service. $${cfg.feeUsd} non-refundable service fee; ${cfg.pct}% commission (min $${cfg.minUsd}) only if a deal closes. The purchase price is paid by the customer.`,
    };
    for (const c of curs) {
      const rate = parseFloat(String(c.rate ?? 1)) || 1;
      const amount = c.code === 'USD' ? cfg.feeUsd : Math.round(((cfg.feeUsd / usdRate) * rate) * 100) / 100;
      params[`pricing[${c.id}][monthly]`] = amount.toFixed(2);
    }
    if (!curs.length) params['pricing[1][monthly]'] = cfg.feeUsd.toFixed(2);
    const r = await whmcs<{ pid?: number | string }>('AddProduct', params);
    const pid = String(r.pid || '');
    if (!/^\d+$/.test(pid)) return { ok: false, error: 'WHMCS did not return a product ID.' };
    await save(pid, gid);
    await audit(who, 'broker_product_create', { pid, gid, currencies: curs.map((c) => c.code) }, pid);
    return { ok: true, pid, gid, created: true, linked: false };
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    const permission = e instanceof WhmcsError && isPermission(msg);
    await audit(who, 'broker_product_error', { error: msg, permission });
    return { ok: false, permission, error: permission ? `The WHMCS API role does not allow this (${msg}). In WHMCS → System Settings → API Roles, allow AddProduct, GetProducts and GetCurrencies for this credential.` : msg };
  } finally { await unlock(); }
}

async function save(pid: string, gid: string) {
  await setSetting('broker_whmcs_pid', pid);
  await setSetting('broker_whmcs_gid', gid);
  try { revalidateTag('site'); } catch { /* outside a request */ }
}

let triedThisProcess = false;
/** Automatic, once per deploy: when the pid is empty and this deploy hasn't tried yet. Swallows every error. */
export async function autoEnsureBrokerProduct(): Promise<string> {
  try {
    const s = await getSettings();
    const cfg = brokerConfig(s);
    if (cfg.pid || triedThisProcess || !whmcsConfigured()) return cfg.pid;
    triedThisProcess = true;
    const [row] = await db.select().from(schema.settings).where(sql`${schema.settings.key} = 'broker_auto_deploy'`);
    if (row && row.value === DEPLOY) return '';
    await setSetting('broker_auto_deploy', DEPLOY);
    const r = await ensureBrokerProduct('auto');
    return r.ok ? r.pid : '';
  } catch { return ''; }
}
