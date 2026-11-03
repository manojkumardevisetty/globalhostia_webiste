// GlobalHostia v2 homepage (preview). Live data: categories, WHMCS prices, TLDs, settings.
import { and, eq, inArray, asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { CYCLE_MONTHS } from '@/lib/pricing';
import { AddressBar, PlanFinder, Plans } from './client';

export const revalidate = 21600;

const LINES: { slug: string; name: string; what: string; href: string }[] = [
  { slug: 'hostia-shared', name: 'Web hosting', what: 'Websites, blogs and small business sites with cPanel', href: '/web-hosting' },
  { slug: 'hostiavps', name: 'VPS servers', what: 'Root access, Linux or Windows, upgrade any time', href: '/vps-hosting' },
  { slug: 'forex-vps', name: 'Forex VPS', what: 'Always-on servers for MetaTrader and trading bots', href: '{{w}}/store/forex-vps' },
  { slug: 'dedicated-servers', name: 'Dedicated servers', what: 'A whole physical server reserved for you', href: '/dedicated-servers' },
  { slug: 'ai-llm', name: 'AI / LLM servers', what: 'Run your own models and AI apps', href: '{{w}}/store/ai-llm' },
  { slug: 'mcps', name: 'n8n automation', what: 'Hosted n8n for your workflows and integrations', href: '{{w}}/store/mcps' },
  { slug: 'ssl-certificates', name: 'SSL certificates', what: 'DV, wildcard and business-validated certificates', href: '/ssl-certificate' },
];

export default async function V2Home() {
  const s = await getSettings();
  const w = (s.whmcs_base_url || 'https://globalhostia.com/secure').replace(/\/$/, '');
  const cur = s.currency || 'USD';
  // preview page: an unavailable database renders it without plans instead of failing (or failing the build)
  const safe = <T,>(q: Promise<T[]>) => q.catch(() => [] as T[]);
  const cats = await safe(db.select().from(schema.categories).where(inArray(schema.categories.slug, LINES.map((l) => l.slug))));
  const prods = cats.length ? await safe(db.select().from(schema.products).where(and(inArray(schema.products.categoryId, cats.map((c) => c.id)), eq(schema.products.status, 'PUBLISHED'), eq(schema.products.whmcsRetired, false))).orderBy(asc(schema.products.sortOrder))) : [];
  const prices = prods.length ? await safe(db.select().from(schema.productPrices).where(and(inArray(schema.productPrices.productId, prods.map((p) => p.id)), eq(schema.productPrices.currency, cur)))) : [];
  // headline price per product: monthly if offered, otherwise the yearly price (shown as /yr)
  const headline = (pid: string): { v: number; unit: 'mo' | 'yr' } | null => {
    const rows = prices.filter((p) => p.productId === pid);
    const m = rows.find((r) => r.cycle === 'monthly');
    if (m) return { v: parseFloat(String(m.price)), unit: 'mo' };
    const a = rows.find((r) => r.cycle === 'annually');
    if (a) return { v: parseFloat(String(a.price)), unit: 'yr' };
    const any = rows.filter((r) => CYCLE_MONTHS[r.cycle] > 0).map((r) => parseFloat(String(r.price)) / CYCLE_MONTHS[r.cycle]);
    return any.length ? { v: Math.min(...any), unit: 'mo' } : null;
  };
  const perMonth = (pid: string) => { const h = headline(pid); return h ? (h.unit === 'yr' ? h.v / 12 : h.v) : null; };
  const prefix = prices[0]?.prefix || '$';
  const from = (slug: string) => {
    const c = cats.find((x) => x.slug === slug); if (!c) return null;
    const hs = prods.filter((p) => p.categoryId === c.id).map((p) => headline(p.id)).filter((x): x is { v: number; unit: 'mo' | 'yr' } => !!x);
    if (!hs.length) return null;
    const mo = hs.filter((h) => h.unit === 'mo');
    const pool = mo.length ? mo : hs;
    return pool.reduce((a, b) => (b.v < a.v ? b : a));
  };
  const fromPrice = (slug: string) => from(slug)?.v ?? null;
  const money = (n: number | null, slug?: string) => { const f = slug ? from(slug) : null; return n == null ? 'See plans' : `${prefix}${n.toFixed(2)}/${f?.unit || 'mo'}`; };
  const shared = (() => {
    const c = cats.find((x) => x.slug === 'hostia-shared');
    const list = c ? prods.filter((p) => p.categoryId === c.id).slice(0, 3) : [];
    const sorted = list.map((p) => ({ p, m: perMonth(p.id) ?? 1e9 })).sort((a, b) => a.m - b.m).map((x) => x.p);
    return sorted.map((p, i) => {
      const pr = prices.filter((x) => x.productId === p.id);
      const num = (c: string) => { const r = pr.find((x) => x.cycle === c); return r ? parseFloat(String(r.price)) : null; };
      return { name: p.name, tagline: p.tagline, features: p.features, monthly: num('monthly'), annually: num('annually'), prefix, url: p.orderUrl || `${w}/cart.php?a=add&pid=${p.whmcsPid}`, recommended: i === 1 };
    });
  })();
  const tldRows = await safe(db.select().from(schema.tlds).where(inArray(schema.tlds.tld, ['.com', '.ae', '.net', '.org', '.io', '.shop'])));
  const tlds = ['.com', '.ae', '.net', '.org', '.io', '.shop'].map((t) => tldRows.find((r) => r.tld === t)).filter((t) => t?.register && t.visible)
    .map((t) => ({ tld: t!.tld, price: `${prefix}${parseFloat(String(t!.register)).toFixed(2)}/yr` }));
  const href = (h: string) => h.replace('{{w}}', w);

  const goals = [
    { id: 'site', label: 'A business website', title: 'Your website, online today', body: 'Shared hosting with cPanel, free SSL and business email. Install WordPress in one click and move up to a bigger plan whenever you need to.', plan: 'Web hosting', price: money(fromPrice('hostia-shared'), 'hostia-shared'), href: '/web-hosting' },
    { id: 'shop', label: 'An online store', title: 'A fast, secure shop', body: 'WordPress and WooCommerce on NVMe storage, with SSL included so checkout is secure. Daily backups keep your orders safe.', plan: 'WordPress hosting', price: money(fromPrice('hostia-shared'), 'hostia-shared'), href: '/wordpress-hosting' },
    { id: 'trading', label: 'Trading bots', title: 'Always on for the markets', body: 'A dedicated VPS keeps MetaTrader and your trading bots running 24/7, even when your own computer is switched off.', plan: 'Forex VPS', price: money(fromPrice('forex-vps'), 'forex-vps'), href: href('{{w}}/store/forex-vps') },
    { id: 'ai', label: 'An AI app', title: 'Run your own models', body: 'Servers sized for AI and LLM workloads, plus hosted n8n to connect your models to the rest of your tools.', plan: 'AI / LLM servers', price: money(fromPrice('ai-llm'), 'ai-llm'), href: href('{{w}}/store/ai-llm') },
    { id: 'apps', label: 'Apps & databases', title: 'Full control, your way', body: 'A VPS with root access for your apps, APIs and databases. Pick Linux or Windows and scale CPU, RAM and storage as you grow.', plan: 'VPS servers', price: money(fromPrice('hostiavps'), 'hostiavps'), href: '/vps-hosting' },
  ];

  const nav = [['Hosting', '/web-hosting'], ['VPS', '/vps-hosting'], ['Dedicated', '/dedicated-servers'], ['Domains', '/domains-registration'], ['SSL', '/ssl-certificate'], ['Help', '/help-center']];
  const reasons = [
    ['Real people, around the clock', 'Our support team is available 24/7 by live chat, ticket and email — and we are based in Dubai, in your time zone.'],
    ['Free SSL on every plan', 'Every hosting plan includes an SSL certificate, so your site shows the padlock from day one.'],
    ['Daily backups, 30 days kept', 'Automated daily backups with 30-day retention, plus backups you can create yourself in cPanel.'],
    ['Try it without risk', '30-day money-back on shared and WordPress hosting, 7 days on VPS and dedicated servers.'],
    ['Fast NVMe storage', 'Websites and databases run on NVMe drives for quick page loads and snappy admin panels.'],
    ['Pay the way you like', 'Visa, Mastercard and other major cards, PayPal, or crypto — Bitcoin, Ethereum and USDT.'],
  ];
  const faqs = [
    ['How quickly is my hosting ready?', 'Most hosting accounts are set up automatically within 5–15 minutes of payment. Your login details arrive by email.'],
    ['Can you move my website from another host?', 'Yes. Our support team helps you migrate websites, email and databases from your previous provider.'],
    ['Which control panel do I get?', 'Shared hosting comes with cPanel. VPS and dedicated servers can have cPanel/WHM, DirectAdmin or Plesk.'],
    ['Can I upgrade later?', 'Yes — upgrade any time from your client area as your site grows.'],
  ];

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-8 px-5 sm:px-8">
          <a href="/v2" aria-label="GlobalHostia home"><img src="/image/logo-main-black.png" alt="GlobalHostia" className="h-8" /></a>
          <nav aria-label="Main" className="hidden items-center gap-7 text-[15px] font-medium text-ink-2 lg:flex">
            {nav.map(([l, h]) => <a key={h} href={h} className="transition hover:text-ink">{l}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <a href={`${w}/clientarea.php`} className="hidden text-[15px] font-semibold text-ink sm:inline">Sign in</a>
            <a href="#plans" className="whitespace-nowrap rounded-xl bg-ink px-3.5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-indigo sm:px-4 sm:text-[15px]">Get started</a>
            <details className="relative lg:hidden">
              <summary className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl border-2 border-line" aria-label="Menu">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
              </summary>
              <div className="absolute right-0 top-14 w-64 rounded-2xl border border-line bg-white p-2 shadow-xl">
                {nav.map(([l, h]) => <a key={h} href={h} className="block rounded-xl px-4 py-3 font-medium hover:bg-lilac">{l}</a>)}
                <a href={`${w}/clientarea.php`} className="block rounded-xl px-4 py-3 font-medium hover:bg-lilac">Sign in</a>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(60%_60%_at_80%_0%,#e4e1ff_0%,transparent_70%)]" aria-hidden />
          <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:pb-28">
            <h1 className="rise max-w-[15ch] font-display text-[46px] font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-[76px] lg:text-[92px]">Every website starts with an address.</h1>
            <p className="rise rise-2 mt-6 max-w-[54ch] text-[18px] leading-relaxed text-ink-2 sm:text-[20px]">Find yours, then host it on fast servers with free SSL and real 24/7 support from our team in Dubai.</p>
            <div className="mt-10 max-w-[900px]"><AddressBar examples={['yourbrand.ae', 'dubaibakery.com', 'mytradingbot.io', 'studio-noor.shop']} tlds={tlds} /></div>
          </div>
        </section>

        <section className="border-y border-line bg-[#fbfbff]">
          <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
            <h2 className="max-w-[20ch] font-display text-[34px] font-bold leading-tight tracking-[-0.025em] sm:text-[48px]">What are you building?</h2>
            <p className="mb-10 mt-3 max-w-[52ch] text-[17px] text-ink-2">Pick what you have in mind and we&apos;ll point you to the right plan.</p>
            <PlanFinder goals={goals} />
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28" aria-labelledby="range">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 id="range" className="font-display text-[34px] font-bold tracking-[-0.025em] sm:text-[48px]">Everything we host</h2>
            <p className="text-[15px] text-ink-2">Prices update live from our billing system.</p>
          </div>
          <ul className="border-t-2 border-ink">
            {LINES.map((l) => {
              const f = from(l.slug); const p = f?.v ?? null;
              return (
                <li key={l.slug} className="border-b border-line">
                  <a href={href(l.href)} className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-6 sm:grid-cols-[minmax(0,15rem)_1fr_auto] sm:py-7">
                    <span className="font-display text-[22px] font-bold tracking-[-0.01em] transition group-hover:text-indigo sm:text-[26px]">{l.name}</span>
                    <span className="col-span-2 row-start-2 text-[15px] text-ink-2 sm:col-span-1 sm:row-start-auto">{l.what}</span>
                    <span className="row-start-1 text-right sm:row-start-auto">
                      {p != null ? <><span className="block text-xs text-ink-2">from</span><span className="font-display text-[22px] font-bold">{prefix}{p.toFixed(2)}</span><span className="text-sm text-ink-2">/{f?.unit}</span></> : <span className="text-[15px] font-semibold text-indigo">See plans</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {shared.length > 0 && (
          <section id="plans" className="bg-lilac">
            <div className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
              <h2 className="font-display text-[34px] font-bold tracking-[-0.025em] sm:text-[48px]">Web hosting plans</h2>
              <p className="mb-8 mt-3 max-w-[52ch] text-[17px] text-ink-2">cPanel, free SSL and business email on every plan. Upgrade whenever you outgrow it.</p>
              <Plans plans={shared} />
            </div>
          </section>
        )}

        <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
          <h2 className="max-w-[18ch] font-display text-[34px] font-bold leading-tight tracking-[-0.025em] sm:text-[48px]">Why businesses host with us</h2>
          <dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {reasons.map(([t, d]) => (
              <div key={t} className="border-t-2 border-ink pt-5">
                <dt className="font-display text-[20px] font-bold">{t}</dt>
                <dd className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="bg-ink text-white">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.2fr] lg:py-28">
            <div>
              <h2 className="font-display text-[34px] font-bold tracking-[-0.025em] sm:text-[48px]">Questions</h2>
              <p className="mt-3 max-w-[40ch] text-[17px] text-white/70">Can&apos;t find your answer? Our team replies around the clock.</p>
              <a href="/contact" className="mt-8 inline-flex rounded-2xl bg-white px-6 py-3.5 text-[15px] font-semibold text-ink transition hover:bg-lilac">Contact support</a>
            </div>
            <div className="divide-y divide-white/15 border-y border-white/15">
              {faqs.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer items-center justify-between gap-6 font-display text-[19px] font-semibold">
                    {q}<span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/30 transition group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  <p className="mt-3 max-w-[60ch] text-[15.5px] leading-relaxed text-white/75">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <img src="/image/logo-main-black.png" alt="GlobalHostia" className="h-8" />
            <p className="mt-4 max-w-[32ch] text-[15px] text-ink-2">Web hosting, servers and domains from Dubai, United Arab Emirates.</p>
            <p className="mt-4 text-[15px]"><a href={`tel:${(s.phone || '').replace(/[^\d+]/g, '')}`} className="font-semibold">{s.phone}</a><br /><a href={`mailto:${s.email}`} className="text-ink-2">{s.email}</a></p>
          </div>
          {[['Hosting', [['Web hosting', '/web-hosting'], ['WordPress', '/wordpress-hosting'], ['VPS', '/vps-hosting'], ['Dedicated', '/dedicated-servers']]],
            ['Domains & security', [['Register a domain', '/domains-registration'], ['SSL certificates', '/ssl-certificate'], ['Google Workspace', '/google-workspace']]],
            ['Company', [['About', '/about'], ['Contact', '/contact'], ['Help center', '/help-center'], ['Terms', '/terms-conditions'], ['Privacy', '/privacy-policy']]]].map(([h, links]) => (
            <div key={h as string}>
              <h3 className="font-display text-[16px] font-bold">{h as string}</h3>
              <ul className="mt-4 space-y-2.5 text-[15px] text-ink-2">{(links as string[][]).map(([l, u]) => <li key={u}><a href={u} className="transition hover:text-ink">{l}</a></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-[1240px] px-5 py-6 text-sm text-ink-2 sm:px-8">© {new Date().getFullYear()} GlobalHostia, operated by {s.company}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
