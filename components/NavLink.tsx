'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './icons';

export default function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const path = usePathname();
  const active = href === '/admin' ? path === '/admin' : path === href || path.startsWith(href + '/');
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-150 ${active ? 'bg-white/10 text-white shadow-[inset_2px_0_0_0_#8b83ff]' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'}`}>
      <Icon name={icon} className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-[#a9a3ff]' : 'text-slate-500 group-hover:text-slate-300'}`} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
