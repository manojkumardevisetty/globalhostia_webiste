import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Homepage Concepts' };

const CONCEPTS = [
  { n: 1, file: '1-atlas', name: 'Atlas', tag: 'Swiss enterprise, light', desc: 'Stripe/Cloudflare-grade precision. Animated datacenter map in the hero, wide white mega menus.' },
  { n: 2, file: '2-nocturne', name: 'Nocturne', tag: 'Dark infrastructure', desc: 'Vercel/Linear-grade dark UI, aurora glow, command-bar domain search, live servers panel.' },
  { n: 3, file: '3-meridian', name: 'Meridian', tag: 'Corporate trust', desc: 'IONOS/IBM-grade navy & teal, tabbed mega menu, plan configurator, sortable server table.' },
  { n: 5, file: '5-hostpen', name: 'Hostpen Modern', tag: 'Your template, rebuilt', desc: 'Your Hostpen template modernised in your logo colours: photo hero slider, overlapping domain search, tabbed plans, infrastructure chart.' },
  { n: 4, file: '4-horizon', name: 'Horizon', tag: 'Premium commerce', desc: 'Your brand violet, rotating headline, TLD price ticker, conversion-first plans.' },
];

export default function Concepts() {
  return (
    <>
      <PageHeader title="Homepage Concepts" desc="Five complete redesign directions built on your real menu, products and prices. Previews only — your live homepage is unchanged. Tell us which one (or which mix) to build into the real site." />
      <div className="grid gap-6 md:grid-cols-2">
        {CONCEPTS.map((c) => (
          <div key={c.n} className="card overflow-hidden">
            <a href={`/previews/${c.file}.html`} target="_blank" rel="noopener" className="block border-b">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/previews/img/${c.n}.jpg`} alt={`${c.name} concept preview`} className="aspect-[16/10] w-full object-cover transition hover:opacity-90" />
            </a>
            <div className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-brand-600">Concept {c.n} · {c.tag}</div>
              <h2 className="mt-1 text-lg font-semibold">{c.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
              <div className="mt-4 flex gap-2">
                <a href={`/previews/${c.file}.html`} target="_blank" rel="noopener" className="btn btn-primary">Open preview</a>
                <a href="/previews/index.html" target="_blank" rel="noopener" className="btn btn-secondary">All concepts</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
