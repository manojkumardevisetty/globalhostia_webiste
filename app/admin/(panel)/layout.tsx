import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { can } from '@/lib/auth';
import { Icon } from '@/components/icons';
import NavLink from '@/components/NavLink';
import { logout } from '../login/actions';

const NAV: { group: string; items: [string, string, string, string][] }[] = [
  { group: 'Overview', items: [['/admin', 'Dashboard', 'content', 'dashboard']] },
  { group: 'Catalog', items: [['/admin/products', 'Products', 'content', 'box'], ['/admin/categories', 'Categories', 'content', 'folder'], ['/admin/domains', 'Domains & TLDs', 'content', 'globe']] },
  { group: 'Website', items: [['/admin/pages', 'Pages & Sections', 'content', 'file'], ['/admin/blog', 'Blog', 'content', 'pen'], ['/admin/blocks', 'Header & Footer', 'content', 'layout'], ['/admin/design', 'Design', 'settings', 'palette'], ['/admin/concepts', 'Homepage Concepts', 'content', 'palette'], ['/admin/seo', 'Marketing & SEO', 'content', 'megaphone']] },
  { group: 'Marketing', items: [['/admin/promotions', 'Promotions', 'content', 'ticket'], ['/admin/ai', 'AI & MCP', 'content', 'server']] },
  { group: 'Business', items: [['/admin/whmcs', 'WHMCS', 'integration', 'plug'], ['/admin/emails', 'WHMCS Emails', 'integration', 'mail'], ['/admin/orders', 'Orders', 'commerce', 'cart'], ['/admin/customers', 'Customers', 'commerce', 'users'], ['/admin/support', 'Support', 'commerce', 'ticket']] },
  { group: 'System', items: [['/admin/users', 'Users & Roles', 'users', 'shield'], ['/admin/settings', 'Settings', 'settings', 'settings'], ['/admin/audit', 'Activity Log', 'settings', 'activity']] },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession('content');
  const initials = (s.name || s.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join('');
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter(([, , p]) => can(s, p)) })).filter((g) => g.items.length);
  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={`flex flex-col gap-5 px-3 ${mobile ? 'py-4' : 'pb-6'}`} aria-label="Admin">
      {nav.map((g) => (
        <div key={g.group}>
          <div className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{g.group}</div>
          <div className="space-y-0.5">{g.items.map(([href, label, , icon]) => <NavLink key={href} href={href} label={label} icon={icon} />)}</div>
        </div>
      ))}
    </nav>
  );
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col overflow-y-auto bg-[#0b1020] lg:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-6 py-6">
          <img src="/image/logo-main-white.png" alt="GlobalHostia" className="h-7" />
        </Link>
        <Sidebar />
        <div className="mt-auto border-t border-white/5 p-4">
          <a href="/" target="_blank" className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/10">
            <span>View live website</span><Icon name="external" className="h-4 w-4" />
          </a>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md lg:px-8">
          <details className="relative lg:hidden">
            <summary className="btn btn-ghost h-10 w-10 list-none p-0" aria-label="Open menu"><Icon name="menu" className="h-5 w-5" /></summary>
            <div className="fixed inset-x-0 top-16 z-40 max-h-[80vh] overflow-y-auto bg-[#0b1020] shadow-2xl"><Sidebar mobile /></div>
          </details>
          <form action="/admin/search" className="relative max-w-xl flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" placeholder="Search products, pages, categories…" className="input h-10 rounded-full border-slate-200 bg-slate-50 pl-9 focus:bg-white" aria-label="Global search" />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/admin/products/new" className="btn btn-primary hidden h-10 sm:inline-flex"><Icon name="plus" /> New product</Link>
            <details className="relative">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-slate-100" aria-label="Account menu">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-xs font-bold text-white">{initials}</span>
                <span className="hidden text-left leading-tight md:block"><span className="block text-[13px] font-semibold text-slate-800">{s.name || s.email.split('@')[0]}</span><span className="block text-[11px] text-slate-500">{s.role.toLowerCase()}</span></span>
              </summary>
              <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <div className="truncate px-3 py-2 text-xs text-slate-500">{s.email}</div>
                <Link href="/admin/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"><Icon name="user" /> My account</Link>
                <form action={logout}><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"><Icon name="logout" /> Sign out</button></form>
              </div>
            </details>
          </div>
        </header>
        <main className="gh-fade mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
