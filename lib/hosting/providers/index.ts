// Provider registry: panel type -> adapter factory and admin connection test.
import 'server-only';
import type { Account, HostingProvider, PanelType, ServerConfig } from '../types';
import { directAdmin, testDirectAdmin } from './directadmin';
import { cpanel, testCpanel } from './cpanel';
import { plesk, testPlesk } from './plesk';

export function providerFor(acct: Account): HostingProvider {
  const make: Record<PanelType, (a: Account) => HostingProvider> = { directadmin: directAdmin, cpanel, plesk };
  return make[acct.server.panel](acct);
}

/** Admin "Test connection": a read-only call as the key owner. */
export async function testServer(s: ServerConfig): Promise<string> {
  if (s.panel === 'directadmin') { const r = await testDirectAdmin(s); return `DirectAdmin answered in ${r.ms}ms (${r.users} user${r.users === 1 ? '' : 's'} visible to ${s.apiUser})`; }
  if (s.panel === 'cpanel') { const r = await testCpanel(s); return `WHM ${r.version} answered in ${r.ms}ms`; }
  const r = await testPlesk(s); return `Plesk ${r.version} answered in ${r.ms}ms`;
}
