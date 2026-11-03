'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { createId } from '@/lib/id';
import { deleteServer, getServer, hmacFromEnv, saveServer, setHmacSecret, storedServers } from '@/lib/hosting/servers';
import { randomSecret } from '@/lib/hosting/crypto';
import { testServer } from '@/lib/hosting/providers';
import { PANEL_TYPES, type PanelType } from '@/lib/hosting/types';

const P = '/admin/hosting';

export async function saveServerAction(fd: FormData) {
  const s = await requireSession('integration');
  const id = str(fd, 'id') || createId();
  const panel = str(fd, 'panel') as PanelType;
  if (!PANEL_TYPES.includes(panel)) fail(P, 'Choose a panel type');
  const name = str(fd, 'name').slice(0, 80), url = str(fd, 'url'), apiUser = str(fd, 'apiUser');
  if (!name || !url || !apiUser) fail(P, 'Name, URL and API user are required');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(apiUser)) fail(P, 'API user may only use letters, digits, dot, dash and underscore');
  const ids = str(fd, 'whmcsServerIds').split(/[\s,]+/).filter(Boolean).map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) fail(P, 'WHMCS server IDs must be whole numbers, separated by commas');
  const match = str(fd, 'match').split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  if (match.some((m) => !/^[a-z0-9.:-]{1,253}$/.test(m))) fail(P, 'Host names / IPs may only use letters, digits, dot, dash and colon');
  try {
    await saveServer({ id, name, panel, url, apiUser, enabled: bool(fd, 'enabled'), whmcsServerIds: ids, match, secret: str(fd, 'secret') || undefined });
  } catch (e: any) { fail(P, e.message); }
  await audit(s, 'hosting_server_save', 'hosting_server', id, { name, panel, url, apiUser, whmcsServerIds: ids, match, secretChanged: !!str(fd, 'secret') });
  done(P, `Server "${name}" saved`);
}

export async function deleteServerAction(fd: FormData) {
  const s = await requireSession('integration');
  const id = str(fd, 'id');
  const row = (await storedServers()).find((x) => x.id === id);
  if (!row) fail(P, 'Server not found');
  await deleteServer(id);
  await audit(s, 'hosting_server_delete', 'hosting_server', id, { name: row.name });
  done(P, `Server "${row.name}" removed`);
}

export async function testServerAction(fd: FormData) {
  const s = await requireSession('integration');
  const id = str(fd, 'id');
  const srv = await getServer(id);
  if (!srv) fail(P, 'Server not found');
  if (!srv.secret) fail(P, `"${srv.name}": the stored key cannot be decrypted (was AUTH_SECRET / HOSTING_ENC_KEY changed?). Paste the key again.`);
  let msg = '';
  try { msg = await testServer(srv); } catch (e: any) {
    await audit(s, 'hosting_server_test_failed', 'hosting_server', id, { error: e?.message });
    fail(P, `"${srv.name}": ${e?.message || 'connection failed'}`);
  }
  await audit(s, 'hosting_server_test', 'hosting_server', id);
  done(P, `"${srv.name}" OK: ${msg}`);
}

export async function generateHmacAction() {
  const s = await requireSession('integration');
  if (hmacFromEnv()) fail(P, 'HOSTING_HMAC_SECRET is set in Vercel; change it there');
  await setHmacSecret(randomSecret(32));
  await audit(s, 'hosting_hmac_rotate', 'settings', 'hosting_hmac_secret');
  done(P, 'New shared secret generated. Copy it into the WHMCS hook file now; until then the Manage hosting panel stops working.');
}

export async function saveHmacAction(fd: FormData) {
  const s = await requireSession('integration');
  if (hmacFromEnv()) fail(P, 'HOSTING_HMAC_SECRET is set in Vercel; change it there');
  const v = str(fd, 'secret');
  if (v.length < 32 || v.length > 200 || /\s|['"\\]/.test(v)) fail(P, 'The secret must be 32-200 characters, without spaces or quotes');
  await setHmacSecret(v);
  await audit(s, 'hosting_hmac_set', 'settings', 'hosting_hmac_secret');
  done(P, 'Shared secret saved');
}
