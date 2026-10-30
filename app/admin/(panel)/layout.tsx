import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { logout } from '../login/actions';

const NAV: { group: string; items: [string, string, string][] }[] = [
  { group: 'Overview', items: [['/admin', 'Dashboard', 'content']] },
  { group: 'Catalog', items: [['/admin/products', 'Products', 'content'], ['/admin/categories', 'Categories', 'content'], ['/admin/domains', 'Domains & TLDs', 'content']] },
  { group: 'Website', items: [['/admin/pages', 'Pages & Sections', 'content'], ['/admin/blocks', 'Header / Footer / Blocks', 'content'], ['/admin/design', 'Design Manager', 'settings'], ['/admin/seo', 'Marketing & SEO', 'content']] },
  { group: 'Business (WHMCS)', items: [['/admin/whmcs', 'WHMCS Integration', 'integration'], ['/admin/orders', 'Orders', 'commerce'], ['/admin/customers', 'Customers', 'commerce']] },
  { group: 'System', items: [['/admin/users', 'Users & Roles', 'users'], ['/admin/settings', 'Settings', 'settings'], ['/admin/audit', 'Activity Log', 'settings']] },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession('content');
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white lg:block">
        <Link href="/admin" className="flex items-center gap-2 px-5 py-5">
          <img src="/image/logo-main-black.png" alt="GlobalHostia" className="h-7" />
        </Link>
        <nav className="px-3 pb-8">
          {NAV.map((g) => {
            const items = g.items.filter(([, , p]) => can(s, p));
            if (!items.length) return null;
            return (
              <div key={g.group} className="mb-4">
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</div>
                {items.map(([href, label]) => (
                  <Link key={href} href={href} className="block rounded-lg px-2.5 py-1.5 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700">{label}</Link>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <details className="relative lg:hidden">
            <summary className="btn btn-ghost list-none">☰</summary>
            <div className="absolute left-0 top-10 z-30 w-64 rounded-xl border bg-white p-3 shadow-lg">
              {NAV.flatMap((g) => g.items).filter(([, , p]) => can(s, p)).map(([h, l]) => <Link key={h} href={h} className="block rounded px-2 py-1.5 text-sm hover:bg-slate-50">{l}</Link>)}
            </div>
          </details>
          <form action="/admin/search" className="flex-1">
            <input name="q" placeholder="Search products, pages, categories, customers…" className="input max-w-xl" aria-label="Global search" />
          </form>
          <a href="/" target="_blank" className="btn btn-secondary hidden sm:inline-flex">View site ↗</a>
          <details className="relative">
            <summary className="btn btn-ghost list-none">{s.name || s.email} · <span className="text-xs text-slate-400">{s.role}</span></summary>
            <div className="absolute right-0 top-10 z-30 w-48 rounded-xl border bg-white p-2 shadow-lg">
              <Link href="/admin/account" className="block rounded px-2 py-1.5 text-sm hover:bg-slate-50">My account</Link>
              <form action={logout}><button className="w-full rounded px-2 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">Sign out</button></form>
            </div>
          </details>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
