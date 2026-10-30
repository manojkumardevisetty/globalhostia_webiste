import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icons';

export function PageHeader({ title, desc, actions }: { title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-slate-900">{title}</h1>
        {desc && <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-slate-500">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <h2 className="text-[14px] font-semibold text-slate-900">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">{hint}</span>}
    </label>
  );
}

const tones: Record<string, [string, string]> = {
  green: ['bg-emerald-50 text-emerald-700 ring-emerald-600/15', 'bg-emerald-500'],
  yellow: ['bg-amber-50 text-amber-800 ring-amber-600/20', 'bg-amber-500'],
  red: ['bg-red-50 text-red-700 ring-red-600/15', 'bg-red-500'],
  gray: ['bg-slate-100 text-slate-600 ring-slate-500/15', 'bg-slate-400'],
  blue: ['bg-brand-50 text-brand-700 ring-brand-500/20', 'bg-brand-500'],
};
export function Badge({ tone = 'gray', children }: { tone?: string; children: ReactNode }) {
  const [c, dot] = tones[tone] || tones.gray;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${c}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />{children}
    </span>
  );
}
export const statusTone = (s: string) => (s === 'PUBLISHED' || s === 'ok' ? 'green' : s === 'DRAFT' || s === 'partial' || s === 'running' ? 'yellow' : s === 'failed' ? 'red' : 'gray');

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = sp.ok as string | undefined, err = sp.err as string | undefined;
  if (!ok && !err) return null;
  return (
    <div className={`gh-fade mb-6 flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ${err ? 'bg-red-50 text-red-800 ring-red-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'}`} role="status">
      <Icon name={err ? 'alert' : 'check'} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{err || ok}</span>
    </div>
  );
}

export function Empty({ children, icon = 'box' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-500">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-400"><Icon name={icon} className="h-5 w-5" /></span>
      {children}
    </div>
  );
}

export function LinkBtn({ href, children, variant = 'secondary', target }: { href: string; children: ReactNode; variant?: string; target?: string }) {
  return <Link href={href} target={target} className={`btn btn-${variant}`}>{children}</Link>;
}

const statTones: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600', rose: 'bg-rose-50 text-rose-600', slate: 'bg-slate-100 text-slate-600',
};
export function Stat({ label, value, sub, href, icon = 'activity', tone = 'brand' }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; icon?: string; tone?: string }) {
  const inner = (
    <div className={`card flex h-full items-start gap-4 p-5 ${href ? 'transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)]' : ''}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${statTones[tone] || statTones.brand}`}><Icon name={icon} className="h-5 w-5" /></span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-slate-500">{label}</div>
        <div className="mt-0.5 text-[24px] font-bold tracking-tight text-slate-900 tabular-nums">{value}</div>
        {sub && <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{sub}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200">{inner}</Link> : inner;
}

export const fmtDate = (d?: Date | string | null) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dubai' }) : '—');
