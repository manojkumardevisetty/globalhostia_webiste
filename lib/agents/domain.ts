// Domain availability for agents: strict validation, WHMCS DomainWhois server-side, short result cache.
import 'server-only';
import { domainWhois, whmcsConfigured } from '../whmcs';
import { agentData, agentTlds, domainCartLink } from './catalog';
import { limiter } from './http';

/** 10 WHOIS lookups per IP per minute (shared by /api/domain-check and the MCP check_domain tool). */
export const domainLimit = limiter(10, 60_000);

const cache = new Map<string, { at: number; available: boolean }>();
const TTL = 5 * 60_000;

/** Lower-case ASCII (or punycode) hostname with at least one dot, 1–63 char labels, no leading/trailing hyphen. */
export function validDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const d = raw.trim().toLowerCase().replace(/\.$/, '');
  if (d.length < 3 || d.length > 253) return null;
  const labels = d.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return null;
  if (!/^[a-z]{2,}$|^xn--[a-z0-9-]+$/.test(labels[labels.length - 1])) return null;
  return d;
}

export type DomainResult =
  | { ok: true; domain: string; tld: string; available: boolean; currency: string; register: number | null; renew: number | null; transfer: number | null; addToCartUrl: string | null; cached: boolean; checkedAt: string }
  | { ok: false; status: number; error: string; message: string; supportedTlds?: string[] };

export async function checkDomain(raw: unknown, currency?: string | null): Promise<DomainResult> {
  const domain = validDomain(raw);
  if (!domain) return { ok: false, status: 400, error: 'invalid_domain', message: 'Give a full domain name such as example.com (letters, digits and hyphens only).' };
  const d = await agentData(currency);
  const tlds = agentTlds(d);
  // longest matching suffix we sell (".co.uk" before ".uk")
  const tld = tlds.map((t) => t.tld).filter((t) => domain.endsWith(t) && domain.length > t.length && domain[domain.length - t.length] === '.').sort((a, b) => b.length - a.length)[0];
  if (!tld) return { ok: false, status: 422, error: 'unsupported_tld', message: `We do not sell this extension in ${d.currency}.`, supportedTlds: tlds.slice(0, 40).map((t) => t.tld) };
  const sld = domain.slice(0, -tld.length);
  if (sld.includes('.')) return { ok: false, status: 400, error: 'invalid_domain', message: 'Check the registrable domain only (no subdomains).' };
  if (!whmcsConfigured()) return { ok: false, status: 503, error: 'unavailable', message: 'Domain lookup is temporarily unavailable.' };
  const hit = cache.get(domain);
  let available: boolean, cached = false;
  if (hit && Date.now() - hit.at < TTL) { available = hit.available; cached = true; }
  else {
    try { available = await domainWhois(domain); }
    catch { return { ok: false, status: 502, error: 'lookup_failed', message: 'The registry lookup failed. Try again shortly.' }; }
    if (cache.size > 2000) cache.clear();
    cache.set(domain, { at: Date.now(), available });
  }
  const t = tlds.find((x) => x.tld === tld)!;
  return {
    ok: true, domain, tld, available, currency: d.currency, register: t.register, renew: t.renew, transfer: t.transfer,
    addToCartUrl: available ? domainCartLink(d.cat, domain, d.currency) : null, cached, checkedAt: new Date().toISOString(),
  };
}
