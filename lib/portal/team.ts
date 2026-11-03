// Team access I/O (WHMCS 8 Users API). Calls used, all scoped to the signed-in client:
//   GetClientsDetails (client.users.user: id, name, email, is_owner)   — list the account's users
//   GetUserPermissions user_id + client_id                            — read one user's permissions
//   CreateClientInvite client_id + email + permissions (comma list)   — invite by email (stays pending until accepted)
//   UpdateUserPermissions user_id + client_id + permissions           — change a user's permissions
//   DeleteUserClient user_id + client_id                              — remove a user's access to this account
// Pending invitations cannot be listed through the API: the page links to the client area's user management (SSO).
// Write actions are sent once (lib/whmcs.ts never retries them).
import 'server-only';
import { whmcs } from '../whmcs';
import { membersFrom, parsePerms, type Member, type Perm } from './team-perms';

export async function listMembers(clientId: number): Promise<{ members: Member[]; clientEmail: string; permsReadable: boolean }> {
  const r = await whmcs('GetClientsDetails', { clientid: clientId, stats: false });
  const c = r.client ?? r;
  if (Number(c.id ?? c.userid ?? clientId) !== clientId) throw new Error('Client mismatch');
  const members = membersFrom(c.users ? c : r);
  let permsReadable = true;
  await Promise.all(members.filter((m) => !m.owner).map(async (m) => {
    try {
      const p = await whmcs<any>('GetUserPermissions', { user_id: m.id, client_id: clientId });
      // documented response is only "result"; installations return the list as "permissions" (string or array)
      if (p.permissions === undefined) { permsReadable = false; return; }
      m.perms = parsePerms(p.permissions);
    } catch { permsReadable = false; }
  }));
  return { members, clientEmail: String(c.email || ''), permsReadable };
}

export async function inviteUser(clientId: number, email: string, perms: Perm[]) {
  await whmcs('CreateClientInvite', { client_id: clientId, email, permissions: perms.join(',') });
}
export async function updatePermissions(clientId: number, userId: number, perms: Perm[]) {
  await whmcs('UpdateUserPermissions', { user_id: userId, client_id: clientId, permissions: perms.join(',') });
}
export async function removeUser(clientId: number, userId: number) {
  await whmcs('DeleteUserClient', { user_id: userId, client_id: clientId });
}
