// Server-only WHMCS API client. Credentials never leave the server.
// Docs: https://developers.whmcs.com/api/
import 'server-only';
import { db, schema } from './db';

export class WhmcsError extends Error {
  constructor(message: string, public action: string, public kind: 'api' | 'network' | 'config' = 'api') { super(message); }
}

const cfg = () => {
  const url = process.env.WHMCS_API_URL;
  const identifier = process.env.WHMCS_API_IDENTIFIER;
  const secret = process.env.WHMCS_API_SECRET;
  if (!url || !identifier || !secret) throw new WhmcsError('WHMCS API is not configured (WHMCS_API_URL / IDENTIFIER / SECRET)', 'config', 'config');
  return { url, identifier, secret, accesskey: process.env.WHMCS_ACCESS_KEY };
};

export const whmcsConfigured = () => !!(process.env.WHMCS_API_URL && process.env.WHMCS_API_IDENTIFIER && process.env.WHMCS_API_SECRET);
export const whmcsBase = () => (process.env.WHMCS_BASE_URL || 'https://globalhostia.com/secure').replace(/\/$/, '');

function logCall(action: string, ok: boolean, ms: number, error = '') {
  db.insert(schema.apiLogs).values({ action, ok, ms, error: error.slice(0, 500) }).catch(() => {});
}

// Read-only actions are safe to retry; write actions are never retried automatically (idempotency).
const RETRYABLE = /^(Get|Domain(Whois|GetNameservers|GetWhoisInfo)|WhmcsDetails)/;

export async function whmcs<T = any>(action: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const c = cfg();
  const body = new URLSearchParams({ action, identifier: c.identifier, secret: c.secret, responsetype: 'json' });
  if (c.accesskey) body.set('accesskey', c.accesskey);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v));
  const attempts = RETRYABLE.test(action) ? 3 : 1;
  let lastErr: WhmcsError | null = null;
  for (let i = 0; i < attempts; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch(c.url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const txt = await res.text();
      let json: any;
      try { json = JSON.parse(txt); } catch { throw new WhmcsError(`HTTP ${res.status}: non-JSON response (${txt.slice(0, 160).replace(/\s+/g, ' ')})`, action, res.status >= 500 ? 'network' : 'api'); }
      if (json.result === 'error') throw new WhmcsError(json.message || 'Unknown WHMCS error', action, 'api');
      logCall(action, true, Date.now() - t0);
      return json as T;
    } catch (e: any) {
      lastErr = e instanceof WhmcsError ? e : new WhmcsError(e?.name === 'TimeoutError' ? 'Timed out after 20s' : e?.message || String(e), action, 'network');
      logCall(action, false, Date.now() - t0, lastErr.message);
      if (lastErr.kind !== 'network') break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw lastErr!;
}

// ---- typed helpers ----
export type WhmcsPricing = Record<string, Record<string, string>>; // { USD: { prefix, suffix, msetupfee, monthly, ... } }
export interface WhmcsProduct {
  pid: number; gid: number; type: string; name: string; slug?: string; product_url?: string; description: string;
  module: string; paytype: string; pricing: WhmcsPricing; hidden?: boolean | number; retired?: boolean | number;
}

export const getProducts = async () =>
  (await whmcs<{ products?: { product?: WhmcsProduct[] } }>('GetProducts')).products?.product ?? [];

export const getCurrencies = async () =>
  (await whmcs<{ currencies?: { currency?: { id: number; code: string; prefix: string; suffix: string; default?: number }[] } }>('GetCurrencies')).currencies?.currency ?? [];

export async function getTldPricing(currencyId?: number) {
  const r = await whmcs<{ pricing?: Record<string, { register?: Record<string, string>; transfer?: Record<string, string>; renew?: Record<string, string> }>; currency?: { code: string } }>(
    'GetTLDPricing', currencyId ? { currencyid: currencyId } : {});
  return { pricing: r.pricing ?? {}, currency: r.currency?.code };
}

export async function domainWhois(domain: string) {
  const r = await whmcs<{ status: string }>('DomainWhois', { domain });
  return r.status === 'available';
}

export const testConnection = async () => {
  const t0 = Date.now();
  const r = await whmcs<{ whmcs?: { version?: string } }>('WhmcsDetails');
  return { version: r.whmcs?.version ?? 'unknown', ms: Date.now() - t0 };
};

export const getStats = () => whmcs<Record<string, any>>('GetStats');
export const getOrders = (p: { limitstart?: number; limitnum?: number; status?: string } = {}) =>
  whmcs<{ totalresults: number; orders?: { order?: any[] } }>('GetOrders', { limitnum: 25, ...p });
export const getClients = (p: { limitstart?: number; limitnum?: number; search?: string } = {}) =>
  whmcs<{ totalresults: number; clients?: { client?: any[] } }>('GetClients', { limitnum: 25, ...p });
export const getClientProducts = (clientid: number) => whmcs<{ products?: { product?: any[] } }>('GetClientsProducts', { clientid });
export const getTickets = (p: { limitnum?: number; clientid?: number } = {}) => whmcs<{ tickets?: { ticket?: any[] } }>('GetTickets', { limitnum: 25, ...p });

// customer-facing links (WHMCS handles cart, checkout & payment — no card data touches this app)
export const cartUrl = (pid: number, cycle?: string) =>
  `${whmcsBase()}/cart.php?a=add&pid=${pid}${cycle && cycle !== 'auto' ? `&billingcycle=${cycle}` : ''}`;
export const domainCartUrl = (domain: string, type: 'register' | 'transfer' = 'register') =>
  `${whmcsBase()}/cart.php?a=add&domain=${type}&query=${encodeURIComponent(domain)}`;
