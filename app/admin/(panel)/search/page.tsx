import Link from 'next/link';
import { ilike, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { PageHeader, Card, Empty } from '@/components/ui';

export const metadata = { title: 'Search' };

export default async function Search({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = ((await searchParams).q || '').trim();
  if (!q) return <><PageHeader title="Search" /><Empty>Type in the search bar above.</Empty></>;
  const like = `%${q}%`;
  const [products, pages, cats, sections, blocks] = await Promise.all([
    db.select({ id: schema.products.id, name: schema.products.name, slug: schema.products.slug }).from(schema.products).where(or(ilike(schema.products.name, like), ilike(schema.products.slug, like))).limit(20),
    db.select({ id: schema.pages.id, title: schema.pages.title, slug: schema.pages.slug }).from(schema.pages).where(or(ilike(schema.pages.title, like), ilike(schema.pages.slug, like), ilike(schema.pages.seoDescription, like))).limit(20),
    db.select({ id: schema.categories.id, name: schema.categories.name }).from(schema.categories).where(ilike(schema.categories.name, like)).limit(20),
    db.select({ id: schema.sections.id, pageId: schema.sections.pageId, name: schema.sections.name }).from(schema.sections).where(ilike(schema.sections.html, like)).limit(20),
    db.select({ key: schema.blocks.key }).from(schema.blocks).where(ilike(schema.blocks.html, like)).limit(20),
  ]);
  const group = (title: string, items: { href: string; label: string }[]) => items.length > 0 && (
    <Card title={`${title} (${items.length})`}><ul className="space-y-1 text-sm">{items.map((i) => <li key={i.href}><Link className="text-brand-600" href={i.href}>{i.label}</Link></li>)}</ul></Card>
  );
  const none = !products.length && !pages.length && !cats.length && !sections.length && !blocks.length;
  return (
    <>
      <PageHeader title={`Search: “${q}”`} desc="Searches products, categories, pages, section content and header/footer blocks. Customers: use Customers search." />
      {none ? <Empty>No results.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-2">
          {group('Products', products.map((p) => ({ href: `/admin/products/${p.id}`, label: `${p.name} (${p.slug})` })))}
          {group('Pages', pages.map((p) => ({ href: `/admin/pages/${p.id}`, label: `/${p.slug} — ${p.title.slice(0, 60)}` })))}
          {group('Categories', cats.map((c) => ({ href: `/admin/categories/${c.id}`, label: c.name })))}
          {group('Text inside sections', sections.map((s) => ({ href: `/admin/pages/${s.pageId}/sections/${s.id}`, label: s.name })))}
          {group('Header / footer blocks', blocks.map((b) => ({ href: `/admin/blocks/${encodeURIComponent(b.key)}`, label: b.key })))}
        </div>
      )}
      <p className="mt-6 text-sm"><Link className="text-brand-600" href={`/admin/customers?q=${encodeURIComponent(q)}`}>Search “{q}” in WHMCS customers →</Link></p>
    </>
  );
}
