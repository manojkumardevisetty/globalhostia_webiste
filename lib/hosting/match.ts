// Pure: which configured panel server hosts a WHMCS service. Unit-tested in tests/hosting.test.mts.
import type { ServerConfig } from './types';

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase();

/**
 * Pick the configured server for a WHMCS service (GetClientsProducts row): WHMCS server ID first, then host name,
 * then IP. Returns null when nothing matches (the service is not on a managed panel, e.g. a VPS reseller module).
 */
export function serverFor(svc: { serverid?: unknown; serverhostname?: unknown; serverip?: unknown }, servers: ServerConfig[]): ServerConfig | null {
  const live = servers.filter((s) => s.enabled && s.secret);
  const sid = Number(svc.serverid);
  const byId = sid > 0 ? live.find((s) => s.whmcsServerIds.includes(sid)) : undefined;
  if (byId) return byId;
  const keys = [lc(svc.serverhostname), lc(svc.serverip)].filter(Boolean);
  return live.find((s) => s.match.some((m) => keys.includes(lc(m))) || keys.includes(lc(new URL(s.url).hostname))) || null;
}
