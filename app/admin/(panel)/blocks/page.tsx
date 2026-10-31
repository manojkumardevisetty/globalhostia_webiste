import Link from 'next/link';
import { asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Flash, fmtDate } from '@/components/ui';

export const metadata = { title: 'Blocks' };

const GROUPS: [string, string, keyof typeof schema.pages.$inferSelect | null][] = [
  ['tp', 'Main menu, footer links & language selector (shared by every page)', null],
  ['header', 'Headers & navigation menus', 'headerBlock'], ['footer', 'Footers', 'footerBlock'],
  ['body_end', 'After content (scripts, popups, chat, GDPR)', 'bodyEndBlock'], ['body_start', 'Before content (page loader, tag manager)', 'bodyStartBlock'], ['head', 'Shared <head> (CSS, fonts, analytics)', 'headBlock'],
];

export default async function Blocks({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const blocks = await db.select({ key: schema.blocks.key, name: schema.blocks.name, updatedAt: schema.blocks.updatedAt }).from(schema.blocks).orderBy(asc(schema.blocks.key));
  const pages = await db.select().from(schema.pages);
  const kind = (k: string) => GROUPS.map((g) => g[0]).sort((a, b) => b.length - a.length).find((g) => k === g || k.startsWith(g + '-'));
  return (
    <>
      <PageHeader title="Header, Footer & Global Blocks" desc="Shared parts of the site. Edit once — every page that uses the block updates. Your original site had different header/footer copies per page; use “Use on all pages” to unify them." />
      <Flash sp={sp} />
      <div className="space-y-6">
        {GROUPS.map(([g, label, col]) => {
          const list = blocks.filter((b) => kind(b.key) === g);
          return (
            <section key={g} className="card overflow-x-auto">
              <h2 className="border-b px-5 py-3 text-sm font-semibold">{label}</h2>
              <table className="table"><thead><tr><th>Block</th><th>Used by</th><th>Updated</th></tr></thead>
                <tbody>{list.map((b) => {
                  const used = col ? pages.filter((p) => p[col] === b.key) : pages;
                  return <tr key={b.key}><td><Link className="font-medium hover:text-brand-600" href={`/admin/blocks/${encodeURIComponent(b.key)}`}>{b.key}</Link><div className="text-xs text-slate-400">{b.name}</div></td>
                    <td className="text-xs text-slate-500">{used.length} page(s){used.length > 0 && used.length <= 4 && `: ${used.map((p) => '/' + (p.slug === 'index' ? '' : p.slug)).join(', ')}`}</td><td className="text-xs">{fmtDate(b.updatedAt)}</td></tr>;
                })}</tbody></table>
            </section>
          );
        })}
      </div>
    </>
  );
}
