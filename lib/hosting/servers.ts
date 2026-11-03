// Hosting-panel server registry (admin: /admin/hosting). Stored in the settings table under keys that
// lib/settings.ts keeps out of the public settings cache and the build snapshot; secrets are AES-GCM sealed
// (lib/hosting/crypto.ts) and only ever decrypted here, on the server.
import 'server-only';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { seal, unseal } from './crypto';
import { PANEL_TYPES, type PanelType, type ServerConfig } from './types';

export const SERVERS_KEY = 'hosting_servers';
export const HMAC_KEY = 'hosting_hmac_secret';
export const DNS_ONLY_KEY = 'hosting_dns_only';

/** What is stored: the sealed secret instead of the secret. */
export interface StoredServer extends Omit<ServerConfig, 'secret'> { secretEnc: string; updatedAt?: string }
/** What the admin page may render: never the secret, only a hint. */
export interface ServerView extends Omit<ServerConfig, 'secret'> { secretHint: string; source: 'db' | 'env' }

async function readKey<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key));
  return row?.value as T | undefined;
}
async function writeKey(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as any }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as any } });
}

export const normUrl = (u: string) => {
  const url = new URL(u.trim());
  if (url.protocol !== 'https:') throw new Error('Panel URL must use https://');
  if (url.username || url.password) throw new Error('Do not put credentials in the URL');
  return `${url.protocol}//${url.host}`;
};

/** Optional single DirectAdmin server from env (DA_URL, DA_USER, DA_LOGIN_KEY), used when the admin list is empty. */
function envServer(): ServerConfig | null {
  const { DA_URL, DA_USER, DA_LOGIN_KEY } = process.env;
  if (!DA_URL || !DA_USER || !DA_LOGIN_KEY) return null;
  return { id: 'env', name: 'DirectAdmin (env)', panel: 'directadmin', url: normUrl(DA_URL), apiUser: DA_USER, secret: DA_LOGIN_KEY, enabled: true,
    whmcsServerIds: (process.env.DA_WHMCS_SERVER_IDS || '').split(',').map(Number).filter((n) => n > 0), match: [new URL(DA_URL).hostname],
    nameservers: (process.env.DA_NAMESERVERS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) };
}

export async function storedServers(): Promise<StoredServer[]> {
  const v = await readKey<StoredServer[]>(SERVERS_KEY);
  return Array.isArray(v) ? v.filter((s) => s && PANEL_TYPES.includes(s.panel)) : [];
}

/** Decrypted list for API use (server only). */
export async function loadServers(): Promise<ServerConfig[]> {
  const list = (await storedServers()).map(({ secretEnc, updatedAt: _u, ...s }) => {
    try { return { ...s, secret: unseal(secretEnc) }; } catch { return { ...s, secret: '', enabled: false }; }
  });
  const env = envServer();
  return list.length ? list : env ? [env] : [];
}

/** For the admin page: no secrets. */
export async function serverViews(): Promise<ServerView[]> {
  const list = await storedServers();
  if (list.length) return list.map(({ secretEnc, updatedAt: _u, ...s }) => ({ ...s, source: 'db' as const, secretHint: secretEnc ? 'stored (encrypted)' : 'missing' }));
  const env = envServer();
  return env ? [{ ...env, secret: undefined as never, source: 'env' as const, secretHint: 'from DA_LOGIN_KEY env' }].map(({ secret: _s, ...v }) => v) : [];
}

export async function saveServer(input: Omit<ServerConfig, 'secret'> & { secret?: string }) {
  const list = await storedServers();
  const i = list.findIndex((s) => s.id === input.id);
  const prev = i >= 0 ? list[i] : null;
  if (!input.secret && !prev?.secretEnc) throw new Error('Enter the login key / API token');
  const row: StoredServer = {
    id: input.id, name: input.name, panel: input.panel as PanelType, url: normUrl(input.url), apiUser: input.apiUser, enabled: input.enabled,
    whmcsServerIds: input.whmcsServerIds, match: input.match, nameservers: input.nameservers || [],
    secretEnc: input.secret ? seal(input.secret) : prev!.secretEnc, updatedAt: new Date().toISOString(),
  };
  if (i >= 0) list[i] = row; else list.push(row);
  await writeKey(SERVERS_KEY, list);
}

export async function deleteServer(id: string) {
  await writeKey(SERVERS_KEY, (await storedServers()).filter((s) => s.id !== id));
}

export async function getServer(id: string): Promise<ServerConfig | null> {
  return (await loadServers()).find((s) => s.id === id) || null;
}

/* ---------------- HMAC secret shared with the WHMCS hook ---------------- */
export async function hmacSecret(): Promise<string | null> {
  if (process.env.HOSTING_HMAC_SECRET) return process.env.HOSTING_HMAC_SECRET;
  const v = await readKey<string>(HMAC_KEY).catch(() => undefined);
  if (!v) return null;
  try { return unseal(v); } catch { return null; }
}
export const hmacFromEnv = () => !!process.env.HOSTING_HMAC_SECRET;
export async function setHmacSecret(secret: string) { await writeKey(HMAC_KEY, secret ? seal(secret) : ''); }

/* ---------------- DNS-only account (portal DNS editor for domain-only customers) ---------------- */
/** A DirectAdmin user (owned by the server's key owner) that holds zones for domains without hosting. */
export interface DnsOnlyConfig { serverId: string; daUser: string; allowCreate: boolean }
export async function dnsOnlyConfig(): Promise<DnsOnlyConfig | null> {
  const v = await readKey<Partial<DnsOnlyConfig>>(DNS_ONLY_KEY).catch(() => undefined);
  if (!v || typeof v !== 'object' || !v.serverId || !v.daUser) return null;
  return { serverId: String(v.serverId), daUser: String(v.daUser), allowCreate: v.allowCreate !== false };
}
export async function saveDnsOnlyConfig(c: DnsOnlyConfig | null) { await writeKey(DNS_ONLY_KEY, c || {}); }

export { serverFor } from './match';
