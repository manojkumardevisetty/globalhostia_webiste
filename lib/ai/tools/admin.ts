// Read-only business tools for the owner's admin assistant (Admin > AI assistant). WHMCS read actions only (Get*),
// hosting server connection tests and site status. Nothing here writes; runTool also refuses non-read tools on this surface.
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { whmcs } from '../../whmcs';
import { loadServers } from '../../hosting/servers';
import { testServer } from '../../hosting/providers';
import { indexNowLog } from '../../indexnow';
import type { AiTool, ToolCtx } from '../agent';

const arr = (v: any): any[] => (Array.isArray(v) ? v : v ? [v] : []);
const S = (p: Record<string, unknown>, req: string[] = []) => ({ type: 'object' as const, additionalProperties: false, properties: p, ...(req.length ? { required: req } : {}) });
const days = (v: unknown, d: number) => Math.min(Math.max(Number(v) || d, 1), 365);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const sumBy = (l: any[], k: string) => {
  const m: Record<string, number> = {};
  for (const x of l) { const c = String(x.currencycode || x.currency || x.currencyprefix || 'default'); m[c] = Math.round(((m[c] || 0) + Number(x[k] || 0)) * 100) / 100; }
  return m;
};

export const adminTools: AiTool<ToolCtx>[] = [
  {
    name: 'business_stats', scope: 'admin', kind: 'read', description: 'WHMCS headline stats: income today / this month / this year, pending orders, active tickets, clients.',
    input_schema: S({}),
    async run() {
      const r = await whmcs('GetStats');
      const keep = Object.fromEntries(Object.entries(r).filter(([k]) => /income|orders|tickets|clients|invoices|cancellations|todo|services|domains/i.test(k) && typeof (r as any)[k] !== 'object'));
      return { text: JSON.stringify(keep) };
    },
  },
  {
    name: 'invoices_summary', scope: 'admin', kind: 'read', description: 'Unpaid, overdue or paid invoices: count, totals per currency and the largest ones.',
    input_schema: S({ status: { type: 'string', enum: ['Unpaid', 'Overdue', 'Paid', 'Cancelled', 'Refunded'] }, limit: { type: 'integer' } }, ['status']),
    async run(a) {
      const r = await whmcs('GetInvoices', { status: String(a.status), limitnum: 250, orderby: 'duedate', order: 'desc' });
      const l = arr(r.invoices?.invoice);
      const top = [...l].sort((x, y) => Number(y.total) - Number(x.total)).slice(0, Math.min(Number(a.limit) || 10, 25))
        .map((i) => ({ id: i.id, client: `${i.firstname || ''} ${i.lastname || ''}`.trim() || i.companyname, total: i.total, currency: i.currencycode, duedate: i.duedate, datepaid: i.datepaid || undefined }));
      return { text: JSON.stringify({ status: a.status, totalResults: Number(r.totalresults || l.length), shown: l.length, totals: sumBy(l, 'total'), top }) };
    },
  },
  {
    name: 'recent_transactions', scope: 'admin', kind: 'read', description: 'Payments received in the last N days (default 30): totals per gateway and currency.',
    input_schema: S({ days: { type: 'integer' } }),
    async run(a) {
      const since = Date.now() - days(a.days, 30) * 86_400_000;
      const r = await whmcs('GetTransactions', {});
      const l = arr(r.transactions?.transaction).filter((t) => Date.parse(String(t.date || '').replace(' ', 'T')) >= since);
      const byGw: Record<string, number> = {};
      for (const t of l) byGw[t.gateway || 'unknown'] = Math.round(((byGw[t.gateway || 'unknown'] || 0) + Number(t.amountin || 0) - Number(t.amountout || 0)) * 100) / 100;
      return { text: JSON.stringify({ since: iso(since), count: l.length, amountIn: sumBy(l, 'amountin'), refunds: sumBy(l, 'amountout'), byGateway: byGw, note: 'Currency per transaction follows the client currency.' }) };
    },
  },
  {
    name: 'renewals_due', scope: 'admin', kind: 'read', description: 'Services and domains due for renewal in the next N days (default 30), with amounts.',
    input_schema: S({ days: { type: 'integer' } }),
    async run(a) {
      const until = Date.now() + days(a.days, 30) * 86_400_000, from = Date.now() - 86_400_000;
      const due = (d: unknown) => { const t = Date.parse(String(d || '')); return t >= from && t <= until; };
      const [p, d] = await Promise.all([whmcs('GetClientsProducts', { limitnum: 500 }).catch(() => ({})), whmcs('GetClientsDomains', { limitnum: 500 }).catch(() => ({}))]);
      const svc = arr((p as any).products?.product).filter((x) => /active/i.test(x.status) && due(x.nextduedate) && !/free|one ?time/i.test(x.billingcycle));
      const dom = arr((d as any).domains?.domain).filter((x) => /active/i.test(x.status) && due(x.nextduedate || x.expirydate));
      return { text: JSON.stringify({
        window: `${iso(from)}..${iso(until)}`, services: svc.length, domains: dom.length,
        serviceAmounts: sumBy(svc, 'recurringamount'), domainAmounts: sumBy(dom, 'recurringamount'),
        list: [...svc.map((x) => ({ kind: 'service', name: x.name, domain: x.domain, due: x.nextduedate, amount: x.recurringamount, client: x.clientid })),
          ...dom.map((x) => ({ kind: 'domain', name: x.domainname, due: x.nextduedate || x.expirydate, amount: x.recurringamount, client: x.userid, autorenew: !x.donotrenew }))]
          .sort((x, y) => String(x.due).localeCompare(String(y.due))).slice(0, 40),
      }) };
    },
  },
  {
    name: 'recent_orders', scope: 'admin', kind: 'read', description: 'Orders from the last N days (default 14): count by status, totals, latest orders.',
    input_schema: S({ days: { type: 'integer' } }),
    async run(a) {
      const since = Date.now() - days(a.days, 14) * 86_400_000;
      const r = await whmcs('GetOrders', { limitnum: 100 });
      const l = arr(r.orders?.order).filter((o) => Date.parse(String(o.date || '').replace(' ', 'T')) >= since);
      const by: Record<string, number> = {};
      for (const o of l) by[o.status] = (by[o.status] || 0) + 1;
      return { text: JSON.stringify({ since: iso(since), count: l.length, byStatus: by, totals: sumBy(l, 'amount'), latest: l.slice(0, 15).map((o) => ({ id: o.id, date: o.date, client: o.name, amount: o.amount, status: o.status, paymentstatus: o.paymentstatus })) }) };
    },
  },
  {
    name: 'ticket_stats', scope: 'admin', kind: 'read', description: 'Active support tickets by status and department, oldest waiting, and the AI ticket assistant decisions this week.',
    input_schema: S({}),
    async run() {
      const r = await whmcs('GetTickets', { status: 'All Active Tickets', limitnum: 200, ignore_dept_assignments: true });
      const l = arr(r.tickets?.ticket);
      const by = (k: string) => { const m: Record<string, number> = {}; for (const t of l) m[t[k] || '-'] = (m[t[k] || '-'] || 0) + 1; return m; };
      const waiting = l.filter((t) => /open|customer-reply/i.test(t.status)).sort((x, y) => String(x.lastreply).localeCompare(String(y.lastreply)));
      let ai: unknown = null;
      try { ai = await db.execute(sql`select state, count(*)::int n from ai_ticket_runs where created_at > now() - interval '7 days' group by state`); } catch { /* table not there yet */ }
      return { text: JSON.stringify({ active: l.length, byStatus: by('status'), byDepartment: by('deptname'), oldestWaiting: waiting.slice(0, 5).map((t) => ({ tid: t.tid, subject: t.subject, lastreply: t.lastreply })), aiDecisions7d: ai }) };
    },
  },
  {
    name: 'hosting_health', scope: 'admin', kind: 'read', description: 'Connection test of every configured hosting server (DirectAdmin / cPanel / Plesk).',
    input_schema: S({}),
    async run() {
      const servers = (await loadServers()).filter((s) => s.enabled !== false).slice(0, 10);
      const res = await Promise.all(servers.map(async (s) => { try { return { server: s.name, ok: true, detail: await testServer(s) }; } catch (e: any) { return { server: s.name, ok: false, detail: String(e?.message || e).slice(0, 200) }; } }));
      return { text: res.length ? JSON.stringify(res) : 'No hosting servers are configured (Admin > Hosting panels).' };
    },
  },
  {
    name: 'seo_status', scope: 'admin', kind: 'read', description: 'Recent IndexNow submissions (search engine indexing pings) and sitemap location.',
    input_schema: S({}),
    async run() {
      const log = await indexNowLog().catch(() => []);
      return { text: JSON.stringify({ sitemap: 'https://globalhostia.com/sitemap.xml', indexNowRecent: log.slice(0, 8), note: 'Search Console / Bing Webmaster data is not connected; only IndexNow submissions are known here.' }) };
    },
  },
  {
    name: 'ai_usage', scope: 'admin', kind: 'read', description: 'AI assistant usage and cost this month by surface, and off-topic messages blocked.',
    input_schema: S({}),
    async run() {
      try {
        const rows = await db.execute(sql`select surface, status, count(*)::int n, coalesce(sum(cost_usd),0)::float usd from ai_usage where created_at >= date_trunc('month', now()) group by surface, status order by usd desc`);
        return { text: JSON.stringify(rows) };
      } catch { return { text: 'Usage table not created yet (deploy runs db-setup).' }; }
    },
  },
];
