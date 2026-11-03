// Plesk adapter (UNVERIFIED against a live server; partial). Uses the Plesk REST API v2 (https://<host>:8443/api/v2,
// header X-API-Key from `plesk bin secret_key -c`), including its documented CLI gateway POST /api/v2/cli/<cmd>/call.
// The REST API is admin-level, so every call here is scoped explicitly to the subscription's domain(s) from WHMCS.
// Email, files and backups are not offered for Plesk (no per-user REST endpoints); the client-area panel hides those tabs.
import 'server-only';
import { PanelError, type Account, type Caps, type DnsRecord, type HostingProvider, type ServerConfig } from '../types';
import { dnsName, fqdn, type DnsInput } from '../validate';
import { call } from './http';

export const PLESK_CAPS: Caps = {
  dns: ['list', 'add', 'edit', 'delete'],
  databases: ['list', 'create', 'delete', 'users', 'password'],
  ssl: ['status', 'issue'],
};

async function rest(s: ServerConfig, method: string, path: string, body?: unknown): Promise<any> {
  const res = await call(`${s.url}/api/v2${path}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'x-api-key': s.secret, accept: 'application/json', 'content-type': 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new PanelError('Plesk refused the API key.', 502);
  const j: any = await res.json().catch(() => null);
  if (!res.ok) throw new PanelError(String(j?.message || j?.errors?.[0] || `Plesk error (HTTP ${res.status})`).slice(0, 300), res.status >= 500 ? 502 : 400);
  return j;
}
async function cli(s: ServerConfig, cmd: string, params: string[]) {
  const r = await rest(s, 'POST', `/cli/${cmd}/call`, { params });
  if (Number(r?.code) !== 0) throw new PanelError(String(r?.stderr || r?.stdout || 'Plesk command failed').trim().slice(0, 300), 400);
  return String(r?.stdout || '');
}

export async function testPlesk(s: ServerConfig) {
  const t0 = Date.now();
  const r = await rest(s, 'GET', '/server');
  return { ms: Date.now() - t0, version: String(r?.panel_version || r?.platform || '') };
}

export function plesk(acct: Account): HostingProvider {
  const s = acct.server, main = acct.domain.toLowerCase();
  const recs = async (domain: string) => (await rest(s, 'GET', `/dns/records?domain=${encodeURIComponent(domain)}`)) as any[];
  const toPlesk = (r: DnsInput, zone: string) => ({
    type: r.type, host: r.name === '@' ? `${zone}.` : `${r.name}.${zone}.`, ttl: r.ttl,
    value: r.type === 'SRV' ? fqdn(r.value, zone) : r.type === 'CNAME' || r.type === 'MX' ? fqdn(r.value, zone) : r.value,
    opt: r.type === 'MX' ? String(r.priority) : r.type === 'SRV' ? `${r.priority} ${r.weight} ${r.port}` : '',
  });
  const owned = async (domain: string, id: string) => {
    const r = (await recs(domain)).find((x) => String(x.id) === String(id));
    if (!r) throw new PanelError('Unknown record', 400);
    return r;
  };
  const dbOf = async (name: string) => {
    const list: any[] = await rest(s, 'GET', `/databases?domain=${encodeURIComponent(main)}`);
    const d = list.find((x) => x.name === name);
    if (!d) throw new PanelError('Unknown database', 400);
    return d;
  };

  const P: HostingProvider = {
    panel: 'plesk',
    caps: PLESK_CAPS,
    dbPrefix: async () => '',
    async domains() {
      const all: any[] = await rest(s, 'GET', '/domains');
      return all.map((d) => String(d.name).toLowerCase()).filter((n) => n === main || n.endsWith('.' + main));
    },
    dns: {
      async list(domain) {
        return (await recs(domain)).flatMap((r): DnsRecord[] => {
          if (!['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'].includes(r.type)) return [];
          let name: string; try { name = dnsName(r.host, domain); } catch { return []; }
          const rec: DnsRecord = { id: String(r.id), type: r.type, name, value: String(r.value || ''), ttl: Number(r.ttl) || 3600 };
          if (r.type === 'MX') rec.priority = Number(r.opt) || 0;
          if (r.type === 'SRV') { const [p, w, port] = String(r.opt || '').split(/\s+/).map(Number); rec.priority = p || 0; rec.weight = w || 0; rec.port = port || 0; }
          if (r.type === 'NS') rec.readonly = true;
          return [rec];
        });
      },
      add: async (domain, r) => { await rest(s, 'POST', `/dns/records?domain=${encodeURIComponent(domain)}`, toPlesk(r, domain)); },
      edit: async (domain, old, r) => { await owned(domain, old.id); await rest(s, 'PUT', `/dns/records/${encodeURIComponent(old.id)}`, toPlesk(r, domain)); },
      remove: async (domain, old) => { await owned(domain, old.id); await rest(s, 'DELETE', `/dns/records/${encodeURIComponent(old.id)}`); },
    },
    databases: {
      async list() {
        const list: any[] = await rest(s, 'GET', `/databases?domain=${encodeURIComponent(main)}`);
        return Promise.all(list.map(async (d) => ({ name: String(d.name), users: ((await rest(s, 'GET', `/dbusers?dbId=${d.id}`).catch(() => [])) as any[]).map((x) => String(x.login)) })));
      },
      async create(name, user, pass) {
        const servers: any[] = await rest(s, 'GET', '/dbservers');
        const srv = servers.find((x) => x.type === 'mysql' && x.is_default) || servers.find((x) => x.type === 'mysql');
        if (!srv) throw new PanelError('No MySQL server is configured in Plesk', 400);
        const d = await rest(s, 'POST', '/databases', { name, type: 'mysql', parent_domain: { name: main }, server_id: srv.id });
        await rest(s, 'POST', '/dbusers', { login: user, password: pass, database_id: d.id });
      },
      remove: async (name) => { const d = await dbOf(name); await rest(s, 'DELETE', `/databases/${d.id}`); },
      addUser: async (db, user, pass) => { const d = await dbOf(db); await rest(s, 'POST', '/dbusers', { login: user, password: pass, database_id: d.id }); },
      async removeUser(db, user) {
        const d = await dbOf(db); const us: any[] = await rest(s, 'GET', `/dbusers?dbId=${d.id}`);
        const x = us.find((y) => y.login === user); if (!x) throw new PanelError('Unknown database user', 400);
        await rest(s, 'DELETE', `/dbusers/${x.id}`);
      },
      async password(db, user, pass) {
        const d = await dbOf(db); const us: any[] = await rest(s, 'GET', `/dbusers?dbId=${d.id}`);
        const x = us.find((y) => y.login === user); if (!x) throw new PanelError('Unknown database user', 400);
        await rest(s, 'PUT', `/dbusers/${x.id}`, { password: pass });
      },
    },
    ssl: {
      async issue(domain, withWww) {
        await cli(s, 'extension', ['--exec', 'letsencrypt', 'cli.php', '-d', domain, ...(withWww ? ['-d', `www.${domain}`] : [])]);
        return 'Let\'s Encrypt certificate requested.';
      },
    },
  };
  return P;
}
