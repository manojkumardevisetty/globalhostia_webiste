// Server wiring for the customer assistant tools: real data access for the two sign-in paths.
//   portal  - account portal session (gh_client cookie, lib/portal/session.ts readClient), WHMCS via lib/portal/api.ts
//   hosting - hosting-panel token from the WHMCS hook (lib/hosting/context.ts hostingCtx), the panel as the account's user
// Everything here only reads; the lib/hosting and lib/portal modules are used as they are (read-only reuse).
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as api from '../../portal/api';
import { dnsState } from '../../portal/dns';
import { ownedDomains, type Ctx as HostingCtx } from '../../hosting/context';
import { loadServers, serverFor } from '../../hosting/servers';
import { ourNameservers } from '../../hosting/dns-plan';
import { evaluate } from '../../hosting/health';
import { gatherHealth, serverIpFor } from '../../hosting/health-probe';
import { mailSettings } from '../../hosting/mailsetup';
import type { CustomerCtx, CustomerDeps } from './customer-core';

const lc = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\.+$/, '');
const secret = () => process.env.AUTH_SECRET || '';
const b64 = (b: Buffer) => b.toString('base64url');

/* ---------------------------------------------------------------- signed ticket proposals */
export function signTicket(p: { cid: number; deptid: number; subject: string; message: string; exp: number }) {
  const body = b64(Buffer.from(JSON.stringify(p)));
  return `${body}.${b64(createHmac('sha256', secret()).update(`ai-ticket:${body}`).digest())}`;
}
export function verifyTicket(token: unknown): { cid: number; deptid: number; subject: string; message: string; exp: number } | null {
  if (typeof token !== 'string' || token.length > 12_000 || !/^[\w-]+\.[\w-]+$/.test(token) || secret().length < 32) return null;
  const [body, sig] = token.split('.');
  const want = createHmac('sha256', secret()).update(`ai-ticket:${body}`).digest(), got = Buffer.from(sig, 'base64url');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!(p.exp > Date.now() / 1000) || !Number.isInteger(p.cid) || !Number.isInteger(p.deptid)) return null;
    return p;
  } catch { return null; }
}

const common = (): Pick<CustomerDeps, 'services' | 'domains' | 'invoices' | 'tickets' | 'departments' | 'signTicket'> => ({
  services: (cid) => api.getClientsProducts(cid),
  domains: (cid) => api.getClientsDomains(cid),
  invoices: async (cid, status) => (await api.getInvoices(cid, status)).list,
  tickets: (cid) => api.getTickets(cid),
  departments: () => api.getSupportDepartments(),
  signTicket,
});

/* ---------------------------------------------------------------- portal */
export function portalDeps(): CustomerDeps {
  const domainRow = async (ctx: CustomerCtx, d: string) => (await api.getClientsDomains(ctx.clientId!)).find((x) => lc(x.domainname) === d) || null;
  const svcFor = async (ctx: CustomerCtx, d: string) => (await api.getClientsProducts(ctx.clientId!)).find((p) => lc(p.domain) === d && /active/i.test(String(p.status))) || null;
  return {
    ...common(),
    async owned(ctx) {
      const [doms, svcs] = await Promise.all([api.getClientsDomains(ctx.clientId!).catch(() => []), api.getClientsProducts(ctx.clientId!).catch(() => [])]);
      return [...new Set([...doms.map((d) => lc(d.domainname)), ...svcs.map((s) => lc(s.domain))].filter(Boolean))];
    },
    async dns(ctx, d) {
      const row = await domainRow(ctx, d);
      let ns: string[] | null = null;
      if (row) { try { ns = await api.domainGetNameservers(Number(row.id)); } catch { ns = null; } }
      const st = await dnsState(ctx.clientId!, row || { domainname: d, status: 'Active' }, ns);
      if (st.records) return { records: st.records };
      const why = st.plan.kind === 'external' ? `DNS for ${d} is managed elsewhere (nameservers ${(ns || []).join(', ') || 'unknown'}); records must be edited there.` : st.listError || ('message' in st.plan ? String((st.plan as any).message) : `DNS for ${d} is not managed here (${st.plan.kind}).`);
      return { records: [], note: why };
    },
    async health(ctx, d) {
      const servers = await loadServers().catch(() => []);
      const svc = await svcFor(ctx, d);
      const server = svc ? serverFor(svc, servers) : null;
      const serverIp = server ? await serverIpFor(`portal|${server.id}`, server.url).catch(() => undefined) : undefined;
      const f = await gatherHealth({ serverId: server?.id || 'portal', serverIp, ourNs: ourNameservers(servers) }, d);
      return evaluate(f, { dnsAdd: false, sslIssue: false, redirects: false });
    },
    async mail(ctx, d) {
      const svc = await svcFor(ctx, d);
      const server = svc ? serverFor(svc, await loadServers().catch(() => [])) : null;
      return mailSettings(d, server ? new URL(server.url).hostname : `mail.${d}`);
    },
    caps: async () => ({ dnsAdd: true, mailCreate: false, sslIssue: false }),
    async domainId(ctx, d) { const r = await domainRow(ctx, d); return r && /active/i.test(String(r.status)) ? Number(r.id) : null; },
  };
}

/* ---------------------------------------------------------------- hosting panel */
export function hostingDeps(h: HostingCtx): CustomerDeps {
  const has = (sec: string, sub: string) => ((h.p.caps as any)[sec] || []).includes(sub);
  return {
    ...common(),
    owned: async () => (await ownedDomains(h)).map(lc),
    async dns(_ctx, d) {
      if (!has('dns', 'list')) return { records: [], note: 'DNS is not available on this hosting panel.' };
      return { records: await h.p.dns!.list(d) };
    },
    async health(_ctx, d) {
      const key = `${h.acct.server.id}|${h.acct.username}`;
      const serverIp = await serverIpFor(key, h.acct.server.url).catch(() => undefined);
      const f = await gatherHealth({ serverId: h.acct.server.id, serverIp, ourNs: ourNameservers([h.acct.server]) }, d);
      return evaluate(f, { dnsAdd: has('dns', 'add'), sslIssue: has('ssl', 'issue'), redirects: has('redirects', 'add') });
    },
    mail: async (_ctx, d) => mailSettings(d, new URL(h.acct.server.url).hostname),
    mailboxes: async (_ctx, d) => (has('email', 'list') ? h.p.email!.list(d) : []),
    caps: async () => ({ dnsAdd: has('dns', 'add'), mailCreate: has('email', 'create'), sslIssue: has('ssl', 'issue'),
      // static caps say "install" for every DirectAdmin account; detect() knows whether Softaculous really answers
      wpInstall: has('wordpress', 'install') && !!h.p.wordpress?.install && (h.p.detect ? ((await h.p.detect().catch(() => ({}) as any)).wordpress ?? h.p.caps.wordpress ?? []).includes('install') : true) }),
    wordpress: async () => (has('wordpress', 'list') && h.p.wordpress ? h.p.wordpress.list() : []),
  };
}
