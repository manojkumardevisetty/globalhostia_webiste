'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { ARTS, GRADIENTS, TOKENS_HELP, normalize, validate, liveSlides, resolveTokens, onOffer, slideStatus, type HeroSlide, type MobileHero, type PriceCtx, type TldPrice } from '@/lib/mobile-hero';
import { fromDubaiLocal } from '@/lib/promo';
import { saveMobileHero } from './actions';

export type Prices = { currency: string; prefix: string; tlds: Record<string, TldPrice>; from: Record<string, string | null> };

const BG: Record<string, string> = {
  raspberry: 'radial-gradient(90% 60% at 85% 8%,rgba(253,215,0,.28),transparent 60%),linear-gradient(165deg,#e14c7f 0%,#c5386f 38%,#8e1d52 100%)',
  midnight: 'radial-gradient(80% 55% at 90% 4%,rgba(197,56,111,.55),transparent 65%),linear-gradient(170deg,#24384a 0%,#16212b 55%,#0d151b 100%)',
  gold: 'linear-gradient(160deg,#fdd700 0%,#f08a4b 40%,#c5386f 75%,#8e1d52 100%)',
};
const STATUS: Record<string, [string, string]> = { live: ['Live', 'bg-emerald-50 text-emerald-700'], scheduled: ['Scheduled', 'bg-blue-50 text-blue-700'], ended: ['Ended', 'bg-slate-100 text-slate-600'], off: ['Hidden', 'bg-slate-100 text-slate-600'] };

function F({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="field-label">{label}</span>{children}{hint && <span className="mt-1.5 block text-xs leading-relaxed text-slate-400">{hint}</span>}</label>;
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} /></span>
      {label}
    </button>
  );
}

const blank = (n: number): HeroSlide => ({ id: `s${Date.now().toString(36)}${n}`, enabled: true, headline: '', fallback: '', offerTld: '', ctaLabel: '', ctaHref: '', finePrint: '', media: 'gradient', gradient: 'midnight', art: 'none', imageUrl: '', videoUrl: '', posterUrl: '', scrim: 40, start: '', end: '' });

export default function HeroForm({ initial, prices }: { initial: MobileHero; prices: Prices }) {
  const [st, setSt] = useState<MobileHero>(initial);
  const [sel, setSel] = useState(0);
  const [touched, setTouched] = useState(false);
  const ctx: PriceCtx = useMemo(() => ({
    currency: prices.currency, money: (v) => `${prices.prefix}${v.toFixed(2)}`,
    tld: (t) => prices.tlds[t] || null, from: (k) => prices.from[k] ?? null,
  }), [prices]);
  const asStored = useMemo(() => {
    const conv = (x: HeroSlide) => { try { return { ...x, start: fromDubaiLocal(x.start), end: fromDubaiLocal(x.end) }; } catch { return { ...x, start: 'bad', end: '' }; } };
    return normalize({ ...st, slides: st.slides.map(conv) });
  }, [st]);
  const errors = validate(asStored);
  const live = liveSlides(asStored, ctx);
  const dirty = JSON.stringify(st) !== JSON.stringify(initial);
  const slide = st.slides[sel];
  const set = (patch: Partial<HeroSlide>) => setSt((s) => ({ ...s, slides: s.slides.map((x, i) => (i === sel ? { ...x, ...patch } : x)) }));
  const move = (d: number) => setSt((s) => { const a = [...s.slides]; const j = sel + d; if (j < 0 || j >= a.length) return s; [a[sel], a[j]] = [a[j], a[sel]]; setSel(j); return { ...s, slides: a }; });
  const remove = () => setSt((s) => { const a = s.slides.filter((_, i) => i !== sel); setSel(Math.max(0, sel - 1)); return { ...s, slides: a }; });
  const add = () => setSt((s) => { if (s.slides.length >= 8) return s; setSel(s.slides.length); return { ...s, slides: [...s.slides, blank(s.slides.length)] }; });

  // preview of the selected slide as the website resolves it
  const pv = slide ? (() => {
    const offerOk = !slide.offerTld || onOffer(ctx.tld(slide.offerTld));
    const head = slide.headline && offerOk ? resolveTokens(slide.headline, ctx) : null;
    const title = head || (slide.fallback ? resolveTokens(slide.fallback, ctx) : null) || '';
    const fine = slide.finePrint ? resolveTokens(slide.finePrint, ctx) || '' : '';
    const note = !slide.headline ? '' : !offerOk ? `${slide.offerTld} has no promo label and no first-year discount right now, so the fallback headline shows.` : head ? 'Showing the price headline.' : 'A price in the headline is not available, so the fallback headline shows.';
    return { title, fine, note };
  })() : null;
  const img = slide && (slide.media === 'image' ? slide.imageUrl : slide.media === 'video' ? slide.posterUrl || slide.imageUrl : '');

  return (
    <form action={saveMobileHero} onSubmit={(e) => { setTouched(true); if (errors.length) e.preventDefault(); }} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <input type="hidden" name="data" value={JSON.stringify(st)} />
      <div className="min-w-0 space-y-6">
        <section className="card">
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <h2 className="text-[14px] font-semibold text-slate-900">Carousel</h2>
            <Toggle on={st.enabled} onChange={(v) => setSt((s) => ({ ...s, enabled: v }))} label={st.enabled ? 'Shown on phones' : 'Hidden'} />
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <F label="Seconds per slide" hint="Autoplay pauses while a visitor touches or focuses the card."><input className="input" type="number" min={3} max={20} value={st.interval} onChange={(e) => setSt((s) => ({ ...s, interval: +e.target.value }))} /></F>
            <F label="Header deals icon links to"><input className="input" value={st.dealsHref} onChange={(e) => setSt((s) => ({ ...s, dealsHref: e.target.value.trim() }))} /></F>
            <F label="Header help icon links to"><input className="input" value={st.helpHref} onChange={(e) => setSt((s) => ({ ...s, helpHref: e.target.value.trim() }))} /></F>
          </div>
        </section>

        <section className="card">
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <h2 className="text-[14px] font-semibold text-slate-900">Slides <span className="font-normal text-slate-500">({live.length} live)</span></h2>
            <button type="button" className="btn btn-secondary h-9" onClick={add} disabled={st.slides.length >= 8}>Add slide</button>
          </div>
          <ol className="divide-y divide-slate-100">
            {st.slides.map((x, i) => {
              const s = slideStatus(asStored.slides[i] || x);
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => setSel(i)} aria-current={i === sel} className={`flex w-full items-center gap-3 px-5 py-3 text-left text-sm ${i === sel ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-xs font-semibold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{x.headline || x.fallback || 'Untitled slide'}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[s][1]}`}>{STATUS[s][0]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {slide && (
          <section className="card">
            <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <h2 className="text-[14px] font-semibold text-slate-900">Slide {sel + 1}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Toggle on={slide.enabled} onChange={(v) => set({ enabled: v })} label={slide.enabled ? 'Visible' : 'Hidden'} />
                <button type="button" className="btn btn-secondary h-9" onClick={() => move(-1)} disabled={sel === 0} aria-label="Move slide up">Up</button>
                <button type="button" className="btn btn-secondary h-9" onClick={() => move(1)} disabled={sel === st.slides.length - 1} aria-label="Move slide down">Down</button>
                <button type="button" className="btn btn-secondary h-9 text-red-600" onClick={remove}>Remove</button>
              </div>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <F label="Headline" className="sm:col-span-2" hint={<>Tokens: {TOKENS_HELP}. Never type a price by hand.</>}>
                <input className="input" value={slide.headline} maxLength={120} placeholder="Get a .com for only {price:.com}/1st yr" onChange={(e) => set({ headline: e.target.value })} />
              </F>
              <F label="Fallback headline" hint="Used when a price is not available, or when the offer condition below is not met.">
                <input className="input" value={slide.fallback} maxLength={120} placeholder="Find the perfect .com for your business" onChange={(e) => set({ fallback: e.target.value })} />
              </F>
              <F label="Only show the price headline while this TLD is on offer" hint="e.g. .com — on offer = a promo label in Domains & TLDs, or a first-year price at least 10% under renewal. Leave empty to always use the headline.">
                <input className="input" value={slide.offerTld} maxLength={30} placeholder=".com" onChange={(e) => set({ offerTld: e.target.value.trim() })} />
              </F>
              <F label="Button label"><input className="input" value={slide.ctaLabel} maxLength={40} placeholder="Claim your .com" onChange={(e) => set({ ctaLabel: e.target.value })} /></F>
              <F label="Button link"><input className="input" value={slide.ctaHref} placeholder="/domains-registration" onChange={(e) => set({ ctaHref: e.target.value.trim() })} /></F>
              <F label="Fine print" className="sm:col-span-2" hint="Hidden automatically when one of its prices is not available.">
                <input className="input" value={slide.finePrint} maxLength={200} placeholder=".com renews at {renew:.com}/yr." onChange={(e) => set({ finePrint: e.target.value })} />
              </F>
              <F label="Background">
                <select className="input" value={slide.media} onChange={(e) => set({ media: e.target.value as any })}>
                  <option value="gradient">Brand gradient</option><option value="image">Image</option><option value="video">Video (muted, looping)</option>
                </select>
              </F>
              {slide.media === 'gradient' ? (
                <>
                  <F label="Gradient"><select className="input" value={slide.gradient} onChange={(e) => set({ gradient: e.target.value as any })}>{Object.entries(GRADIENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
                  <F label="Illustration"><select className="input" value={slide.art} onChange={(e) => set({ art: e.target.value as any })}>{Object.entries(ARTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
                </>
              ) : (
                <F label={slide.media === 'video' ? 'Poster image URL' : 'Image URL'} hint="Portrait works best (about 800×1100). Upload to /hp/img/ or paste an https:// link.">
                  <input className="input" value={slide.media === 'video' ? slide.posterUrl : slide.imageUrl} placeholder="/hp/img/… or https://…" onChange={(e) => set(slide.media === 'video' ? { posterUrl: e.target.value.trim() } : { imageUrl: e.target.value.trim() })} />
                </F>
              )}
              {slide.media === 'video' && <F label="Video URL (MP4)" hint="Plays muted and looped. Visitors with reduced motion or data saver see the poster only."><input className="input" value={slide.videoUrl} placeholder="https://…/hero.mp4" onChange={(e) => set({ videoUrl: e.target.value.trim() })} /></F>}
              <F label={`Darkening over the background: ${slide.scrim}%`} hint="Raise it if the white text is hard to read on a photo.">
                <input type="range" min={0} max={90} step={5} value={slide.scrim} onChange={(e) => set({ scrim: +e.target.value })} className="w-full" />
              </F>
              <F label="Start (Dubai time, optional)"><input className="input" type="datetime-local" value={slide.start} onChange={(e) => set({ start: e.target.value })} /></F>
              <F label="End (Dubai time, optional)"><input className="input" type="datetime-local" value={slide.end} onChange={(e) => set({ end: e.target.value })} /></F>
            </div>
          </section>
        )}

        {touched && errors.length > 0 && <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert"><ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary">Save mobile hero</button>
          {dirty && <span className="text-sm text-amber-700">Unsaved changes</span>}
        </div>
      </div>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <section className="card p-5">
          <h2 className="mb-3 text-[14px] font-semibold text-slate-900">Phone preview</h2>
          {slide && pv ? (
            <>
              <div className="relative mx-auto overflow-hidden rounded-[20px] bg-slate-900" style={{ width: 300, height: 410, background: slide.media === 'gradient' ? BG[slide.gradient] : '#16212b' }}>
                {img && <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute inset-0" style={{ background: `linear-gradient(180deg,rgba(13,21,27,${(slide.scrim / 100) * 0.45}) 0%,rgba(13,21,27,${slide.scrim / 100}) 100%)` }} />
                <div className="absolute inset-0 flex flex-col items-center justify-end px-5 pb-16 text-center text-white">
                  <p className="mb-4 max-w-[15ch] text-[28px] font-extrabold leading-[1.08] tracking-tight">{pv.title || <span className="opacity-60">No headline</span>}</p>
                  {slide.ctaLabel && <span className="rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-900">{slide.ctaLabel}</span>}
                  {pv.fine && <p className="mt-3 text-xs text-white/85">{pv.fine}</p>}
                </div>
              </div>
              {pv.note && <p className="mt-3 text-xs leading-relaxed text-slate-500">{pv.note}</p>}
              <p className="mt-2 text-xs leading-relaxed text-slate-400">Prices shown in {prices.currency}; visitors see their own currency. Open the homepage on a phone (or a narrow window) to see the real card.</p>
            </>
          ) : <p className="text-sm text-slate-500">Add a slide to preview it.</p>}
        </section>
      </aside>
    </form>
  );
}
