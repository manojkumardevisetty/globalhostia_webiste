'use client';
import { useEffect, useState } from 'react';

/** Hero: an oversized browser address bar. Cycles example names until the visitor types. */
export function AddressBar({ examples, tlds }: { examples: string[]; tlds: { tld: string; price: string }[] }) {
  const [value, setValue] = useState('');
  const [demo, setDemo] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDemo(examples[0]); return; }
    let i = 0, ch = 0, dir = 1, t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = examples[i % examples.length];
      ch += dir; setDemo(word.slice(0, ch));
      if (dir === 1 && ch === word.length) { dir = -1; t = setTimeout(tick, 1600); return; }
      if (dir === -1 && ch === 0) { dir = 1; i++; }
      t = setTimeout(tick, dir === 1 ? 85 : 35);
    };
    t = setTimeout(tick, 500);
    return () => clearTimeout(t);
  }, [touched, examples]);

  return (
    <form action="/domains-registration" method="get" className="rise rise-2" role="search">
      <div className="group flex items-center gap-2 rounded-[22px] border-2 border-ink bg-white p-2 shadow-[0_6px_0_0_var(--color-ink)] transition focus-within:shadow-[0_6px_0_0_var(--color-indigo)] focus-within:border-indigo sm:gap-3 sm:p-2.5">
        <span className="hidden items-center gap-1.5 pl-3 sm:flex" aria-hidden>
          <span className="h-3 w-3 rounded-full bg-coral" /><span className="h-3 w-3 rounded-full bg-[#f5b83d]" /><span className="h-3 w-3 rounded-full bg-mint" />
        </span>
        <span className="hidden pl-2 font-display text-lg font-medium text-ink-2/70 sm:inline" aria-hidden>https://</span>
        <label htmlFor="gh-domain" className="sr-only">Search for a domain name</label>
        <div className="relative min-w-0 flex-1">
          <input id="gh-domain" name="domain" value={value} required maxLength={80} autoComplete="off" spellCheck={false}
            onChange={(e) => { setValue(e.target.value); setTouched(true); }} onFocus={() => setTouched(true)}
            className="w-full bg-transparent px-2 py-3 font-display text-[22px] font-semibold text-ink outline-none sm:text-[30px]" />
          {!value && (
            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center font-display text-[22px] font-semibold text-ink-2/45 sm:text-[30px]" aria-hidden>
              {demo}<span className="caret ml-0.5 inline-block h-8 w-[3px] bg-indigo" />
            </span>
          )}
        </div>
        <button className="shrink-0 rounded-2xl bg-indigo px-5 py-4 text-[15px] font-semibold text-white transition hover:bg-indigo-d active:translate-y-px sm:px-8">Check name</button>
      </div>
      <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-ink-2">
        {tlds.map((t) => <span key={t.tld}><b className="font-semibold text-ink">{t.tld}</b> {t.price}</span>)}
      </p>
    </form>
  );
}

/** "What are you building?" — maps a goal to the right product line. */
export function PlanFinder({ goals }: { goals: { id: string; label: string; title: string; body: string; plan: string; price: string; href: string }[] }) {
  const [active, setActive] = useState(goals[0]?.id);
  const g = goals.find((x) => x.id === active) || goals[0];
  if (!g) return null;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
      <div role="tablist" aria-label="What are you building?" className="flex flex-wrap content-start gap-2.5">
        {goals.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === active} onClick={() => setActive(x.id)}
            className={`rounded-full border-2 px-5 py-3 text-[15px] font-semibold transition ${x.id === active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink'}`}>{x.label}</button>
        ))}
      </div>
      <div role="tabpanel" key={g.id} className="rise rounded-[28px] bg-lilac p-7 sm:p-10">
        <h3 className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em] sm:text-[34px]">{g.title}</h3>
        <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">{g.body}</p>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-lilac-2 pt-6">
          <div><div className="text-sm text-ink-2">We recommend</div><div className="font-display text-xl font-bold">{g.plan}</div></div>
          <div className="text-right"><div className="text-sm text-ink-2">Starting at</div><div className="font-display text-3xl font-extrabold tracking-tight">{g.price}</div></div>
        </div>
        <a href={g.href} className="mt-6 inline-flex rounded-2xl bg-indigo px-6 py-3.5 text-[15px] font-semibold text-white transition hover:bg-indigo-d">See {g.plan.toLowerCase()}</a>
      </div>
    </div>
  );
}

/** Monthly / yearly switch for the featured shared plans. */
export function Plans({ plans }: { plans: { name: string; tagline: string; features: string[]; monthly: number | null; annually: number | null; prefix: string; url: string; recommended: boolean }[] }) {
  const hasYear = plans.some((p) => p.annually != null);
  const [yearly, setYearly] = useState(false);
  const fmt = (n: number, p: string) => `${p}${n.toFixed(2)}`;
  return (
    <>
      {hasYear && (
        <div className="mb-10 inline-flex rounded-full border-2 border-ink p-1" role="group" aria-label="Billing period">
          {[['Monthly', false], ['Yearly', true]].map(([l, y]) => (
            <button key={String(l)} onClick={() => setYearly(y as boolean)} aria-pressed={yearly === y}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${yearly === y ? 'bg-ink text-white' : 'text-ink'}`}>{l as string}</button>
          ))}
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((p) => {
          const price = yearly && p.annually != null ? p.annually / 12 : p.monthly ?? (p.annually != null ? p.annually / 12 : null);
          return (
            <article key={p.name} className={`relative flex flex-col rounded-[28px] p-7 sm:p-8 ${p.recommended ? 'bg-ink text-white' : 'border-2 border-line bg-white'}`}>
              {p.recommended && <span className="absolute -top-3.5 left-7 rounded-full bg-coral px-3 py-1 text-xs font-semibold text-white">Most chosen</span>}
              <h3 className="font-display text-2xl font-bold">{p.name}</h3>
              {p.tagline && <p className={`mt-1 text-[15px] ${p.recommended ? 'text-white/70' : 'text-ink-2'}`}>{p.tagline}</p>}
              <div className="mt-6 flex items-baseline gap-1">
                {price != null ? <><span className="font-display text-[44px] font-extrabold leading-none tracking-tight">{fmt(price, p.prefix)}</span><span className={p.recommended ? 'text-white/70' : 'text-ink-2'}>/month</span></> : <span className="font-display text-2xl font-bold">See pricing</span>}
              </div>
              <p className={`mt-1 h-5 text-sm ${p.recommended ? 'text-white/60' : 'text-ink-2'}`}>{yearly && p.annually != null ? `${fmt(p.annually, p.prefix)} billed yearly` : p.monthly != null ? 'Billed monthly, cancel anytime' : ''}</p>
              <ul className="mt-6 space-y-2.5 text-[15px]">
                {p.features.slice(0, 6).map((f) => (
                  <li key={f} className={`flex gap-2.5 ${f.startsWith('-') ? 'opacity-45 line-through' : ''}`}>
                    <svg viewBox="0 0 20 20" className={`mt-0.5 h-5 w-5 shrink-0 ${p.recommended ? 'text-[#8f88ff]' : 'text-indigo'}`} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="m5 10.5 3.2 3L15 6.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {f.replace(/^-\s*/, '')}
                  </li>
                ))}
              </ul>
              <a href={`${p.url}${yearly ? '&billingcycle=annually' : ''}`} className={`mt-8 inline-flex justify-center rounded-2xl px-6 py-3.5 text-[15px] font-semibold transition ${p.recommended ? 'bg-white text-ink hover:bg-lilac' : 'bg-indigo text-white hover:bg-indigo-d'}`}>Choose {p.name}</a>
            </article>
          );
        })}
      </div>
    </>
  );
}
