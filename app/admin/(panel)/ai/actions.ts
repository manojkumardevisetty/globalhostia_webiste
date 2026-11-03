'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { AUTH_LINE } from '@/lib/agents/registry';

/** Save the MCP Registry public-key line served at /.well-known/mcp-registry-auth (empty clears it). */
export async function saveRegistryKey(fd: FormData) {
  const s = await requireSession('settings');
  let v = str(fd, 'mcp_registry_auth').replace(/\s+/g, ' ').trim();
  if (v && !v.startsWith('v=')) v = `v=MCPv1; k=ed25519; p=${v}`; // a bare base64 key is accepted too
  if (v && !AUTH_LINE.test(v)) fail('/admin/ai', 'Paste the line printed by step 3: v=MCPv1; k=ed25519; p=… (a 44-character public key). Never paste the private key.');
  await setSetting('mcp_registry_auth', v);
  await audit(s, 'update', 'settings', 'mcp_registry_auth');
  done('/admin/ai', v ? 'Registry key saved; it is now served at /.well-known/mcp-registry-auth' : 'Registry key removed');
}
