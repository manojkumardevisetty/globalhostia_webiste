'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { BAR_STYLES, DEFAULT_WELCOME, barHtml, fromDubaiLocal, normalize, richText, status, validate, contentId, type PromoBar, type PromoPopup, type Status } from '@/lib/promo';
import { savePromotions } from './actions';

type State = { bar: PromoBar; popup: PromoPopup; welcome: PromoPopup };
type PopKey = 'popup' | 'welcome';

const STATUS: Record<Status, [string, string]> = { live: ['Live', 'bg-emerald-50 text-emerald-700 ring-emerald-600/15'], scheduled: ['Scheduled', 'bg-brand-50 text-brand-700 ring-brand-500/20'], ended: ['Ended', 'bg-slate-100 text-slate-600 ring-slate-500/15'], off: ['Off', 'bg-slate-100 text-slate-600 ring-slate-500/15'] };
const X = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const COPY = <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>;
const ARROW = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

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
const Where = ({ value, onChange }: { value: string; onChange: (v: any) => void }) => (
  <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="website">Website only</option><option value="clientarea">Client area only (WHMCS)</option><option value="both">Website and client area</option>
  </select>
);

/** Same markup promo.js renders, in a contained frame. */
function PopupPreview({ p, sheet }: { p: PromoPopup; sheet: boolean }) {
  const paras = p.body.split(/\n{2,}/).filter((x) => x.trim());
  return (
    <div className={`ghp-pop ghp-pop--preview is-open${p.imageUrl ? ' ghp-pop--media' : ''}${sheet ? ' ghp-pop--sheet' : ''}`}>
      <div className="ghp-pop__scrim" />
      <div className="ghp-pop__dlg" role="group" aria-label="Pop-up preview">
        <button type="button" className="ghp-pop__x" aria-label="Close (preview)" tabIndex={-1}>{X}</button>
        {p.imageUrl && <div className="ghp-pop__media"><img src={p.imageUrl} alt={p.imageAlt} /></div>}
        <div className="ghp-pop__body">
          <h2 className="ghp-pop__title">{p.title || 'Title'}</h2>
          {paras.length > 0 && <div className="ghp-pop__text">{paras.map((x, i) => <p key={i} dangerouslySetInnerHTML={{ __html: richText(x.trim()) }} />)}</div>}
          {p.coupon && <div className="ghp-code"><div><span className="ghp-code__lbl">Coupon code</span><span className="ghp-code__val">{p.coupon}</span></div><button type="button" className="ghp-code__btn" tabIndex={-1}>{COPY}<span>Copy</span></button></div>}
          <div className="ghp-pop__actions">
            {p.ctaLabel && p.ctaUrl && <a className="ghp-cta" href={p.ctaUrl} tabIndex={-1} onClick={(e) => e.preventDefault()}>{p.ctaLabel}{ARROW}</a>}
            <button type="button" className="ghp-later" tabIndex={-1}>No thanks</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PromoForm({ initial, coupons, whmcs }: { initial: State; coupons: string[]; whmcs: boolean }) {
  const [st, setSt] = useState<State>(initial);
  const [tab, setTab] = useState<PopKey>(initial.welcome.enabled && !initial.popup.enabled ? 'welcome' : 'popup');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showPop, setShowPop] = useState(true);
  const [touched, setTouched] = useState(false);
  const dirty = JSON.stringify(st) !== JSON.stringify(initial);

  const setBar = (patch: Partial<PromoBar>) => setSt((s) => ({ ...s, bar: { ...s.bar, ...patch } }));
  const setPop = (k: PopKey, patch: Partial<PromoPopup>) => setSt((s) => ({ ...s, [k]: { ...s[k], ...patch } }));

  // validation runs on the same normalised shape the server stores
  const asStored = useMemo(() => {
    const conv = <T extends { start: string; end: string }>(x: T) => { try { return { ...x, start: fromDubaiLocal(x.start), end: fromDubaiLocal(x.end) }; } catch { return { ...x, start: 'bad', end: '' }; } };
    return normalize({ bar: conv(st.bar), popup: conv(st.popup), welcome: conv(st.welcome) });
  }, [st]);
  const errors = validate(asStored);
  const statusOf = (k: keyof State) => status(asStored[k]);
  const pill = (s: Status) => <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset ${STATUS[s][1]}`}>{STATUS[s][0]}</span>;
  const unknownCoupon = (c: string) => whmcs && coupons.length > 0 && c && !coupons.includes(c.toUpperCase());

  const bar = st.bar, pop = st[tab];
  const previewBar = useMemo(() => barHtml({ ...asStored.bar, id: contentId('b', asStored.bar), start: '', end: '', message: asStored.bar.message || 'Your announcement appears here' }), [asStored.bar]);

  const popupFields = (k: PopKey) => {
    const p = st[k];
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Title" className="sm:col-span-2"><input className="input" value={p.title} maxLength={90} onChange={(e) => setPop(k, { title: e.target.value })} /></F>
        <F label="Body text" className="sm:col-span-2" hint="Wrap words in **double asterisks** for bold. Leave an empty line between paragraphs.">
          <textarea className="input" rows={4} maxLength={600} value={p.body} onChange={(e) => setPop(k, { body: e.target.value })} />
        </F>
        <F label="Image URL (optional)" hint="Shown at 16:9 above the text. Use /image/… or https://"><input className="input" value={p.imageUrl} placeholder="/hp/img/…" onChange={(e) => setPop(k, { imageUrl: e.target.value.trim() })} /></F>
        <F label="Image description (alt text)"><input className="input" value={p.imageAlt} disabled={!p.imageUrl} onChange={(e) => setPop(k, { imageAlt: e.target.value })} /></F>
        <F label="Button label"><input className="input" value={p.ctaLabel} maxLength={40} placeholder="See hosting plans" onChange={(e) => setPop(k, { ctaLabel: e.target.value })} /></F>
        <F label="Button link"><input className="input" value={p.ctaUrl} placeholder="/web-hosting or https://…" onChange={(e) => setPop(k, { ctaUrl: e.target.value.trim() })} /></F>
        <F label="Coupon code (optional)" hint={unknownCoupon(p.coupon) ? <span className="text-amber-700">This code was not found in WHMCS promotions, it will not work at checkout.</span> : 'Shown with a copy button. Create the coupon in WHMCS first.'}>
          <input className="input font-mono uppercase" list="ghp-coupons" value={p.coupon} maxLength={40} onChange={(e) => setPop(k, { coupon: e.target.value.toUpperCase().replace(/\s+/g, '') })} />
        </F>
        <F label="Show on"><Where value={p.where} onChange={(v) => setPop(k, { where: v })} /></F>
        <F label="When to show">
          <select className="input" value={p.trigger} onChange={(e) => setPop(k, { trigger: e.target.value as any })}>
            <option value="delay">After a few seconds</option><option value="exit">When leaving the page (desktop); after N seconds on mobile</option><option value="scroll">After scrolling part of the page</option>
          </select>
        </F>
        {p.trigger === 'scroll'
          ? <F label="Scroll depth (%)"><input className="input" type="number" min={5} max={100} value={p.scroll} onChange={(e) => setPop(k, { scroll: +e.target.value })} /></F>
          : <F label={p.trigger === 'exit' ? 'Seconds before showing on mobile' : 'Seconds after page load'}><input className="input" type="number" min={0} max={600} value={p.delay} onChange={(e) => setPop(k, { delay: +e.target.value })} /></F>}
        <F label="Who sees it">
          <select className="input" value={p.audience} onChange={(e) => setPop(k, { audience: e.target.value as any })} disabled={k === 'welcome'}>
            <option value="all">All visitors</option><option value="new">First-time visitors only</option>
          </select>
        </F>
        <F label="Show at most once every (days)" hint="0 = once per visit"><input className="input" type="number" min={0} max={365} value={p.frequencyDays} onChange={(e) => setPop(k, { frequencyDays: +e.target.value })} /></F>
        <F label="Start (Dubai time, optional)"><input className="input" type="datetime-local" value={p.start} onChange={(e) => setPop(k, { start: e.target.value })} /></F>
        <F label="End (Dubai time, optional)"><input className="input" type="datetime-local" value={p.end} onChange={(e) => setPop(k, { end: e.target.value })} /></F>
        <F label="Never show on these pages (one per line)" className="sm:col-span-2" hint="/cart also covers /cart/…; end with * for a prefix; without a leading slash it matches anywhere in the address (e.g. cart.php for the client area).">
          <textarea className="input font-mono text-xs" rows={4} value={p.exclude.join('\n')} onChange={(e) => setPop(k, { exclude: e.target.value.split('\n') })} />
        </F>
      </div>
    );
  };

  return (
    <form action={savePromotions} onSubmit={(e) => { setTouched(true); if (errors.length) e.preventDefault(); }} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <link rel="stylesheet" href="/hp/promo.css" precedence="default" />
      <input type="hidden" name="data" value={JSON.stringify({ ...st, popup: { ...st.popup, exclude: st.popup.exclude.filter((x) => x.trim()) }, welcome: { ...st.welcome, exclude: st.welcome.exclude.filter((x) => x.trim()) } })} />
      <datalist id="ghp-coupons">{coupons.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="min-w-0 space-y-6">
        {/* A — announcement bar */}
        <section className="card">
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <h2 className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">Announcement bar {pill(statusOf('bar'))}</h2>
            <Toggle on={bar.enabled} onChange={(v) => setBar({ enabled: v })} label={bar.enabled ? 'Enabled' : 'Disabled'} />
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <F label="Message" className="sm:col-span-2" hint={`${bar.message.length}/240 · keep it to one short line; **bold** is supported`}>
              <input className="input" value={bar.message} maxLength={240} placeholder="**Spring sale:** save on annual hosting plans" onChange={(e) => setBar({ message: e.target.value })} />
            </F>
            <F label="Link label"><input className="input" value={bar.linkLabel} maxLength={40} placeholder="See plans" onChange={(e) => setBar({ linkLabel: e.target.value })} /></F>
            <F label="Link URL"><input className="input" value={bar.linkUrl} placeholder="/web-hosting or https://…" onChange={(e) => setBar({ linkUrl: e.target.value.trim() })} /></F>
            <F label="Coupon code (optional)" hint={unknownCoupon(bar.coupon) ? <span className="text-amber-700">Not found in WHMCS promotions.</span> : 'Shown as a chip visitors can tap to copy.'}>
              <input className="input font-mono uppercase" list="ghp-coupons" value={bar.coupon} maxLength={40} onChange={(e) => setBar({ coupon: e.target.value.toUpperCase().replace(/\s+/g, '') })} />
            </F>
            <F label="Style">
              <div className="flex gap-2" role="radiogroup" aria-label="Bar style">
                {Object.entries(BAR_STYLES).map(([k, label]) => (
                  <button key={k} type="button" role="radio" aria-checked={bar.style === k} onClick={() => setBar({ style: k as any })}
                    className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border text-xs font-semibold transition ${bar.style === k ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-300'}`}>
                    <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: k === 'brand' ? '#c5386f' : k === 'charcoal' ? '#23313d' : '#fdd700' }} />{label}
                  </button>))}
              </div>
            </F>
            <F label="Show on"><Where value={bar.where} onChange={(v) => setBar({ where: v })} /></F>
            <F label="Visitors can close it" hint={bar.dismissible ? 'Remembered on their device; 0 days = until they come back next time' : 'The bar stays visible on every page'}>
              <div className="flex items-center gap-3">
                <Toggle on={bar.dismissible} onChange={(v) => setBar({ dismissible: v })} label={bar.dismissible ? 'Yes, hide for' : 'No'} />
                {bar.dismissible && <><input className="input w-20" type="number" min={0} max={365} value={bar.dismissDays} aria-label="Days to stay hidden" onChange={(e) => setBar({ dismissDays: +e.target.value })} /><span className="text-sm text-slate-500">days</span></>}
              </div>
            </F>
            <F label="Start (Dubai time, optional)"><input className="input" type="datetime-local" value={bar.start} onChange={(e) => setBar({ start: e.target.value })} /></F>
            <F label="End (Dubai time, optional)"><input className="input" type="datetime-local" value={bar.end} onChange={(e) => setBar({ end: e.target.value })} /></F>
          </div>
        </section>

        {/* B + C — pop-ups */}
        <section className="card">
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Pop-ups">
              {(['popup', 'welcome'] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {k === 'popup' ? 'Pop-up ad' : 'Welcome offer'} {pill(statusOf(k))}
                </button>))}
            </div>
            <Toggle on={pop.enabled} onChange={(v) => setPop(tab, { enabled: v })} label={pop.enabled ? 'Enabled' : 'Disabled'} />
          </div>
          <div className="p-5" role="tabpanel">
            {tab === 'welcome' && (
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                <p className="max-w-xl">Ready-made pop-up for <b>first-time visitors only</b>. It shows once (then again after the days below) and never on cart, checkout or sign-in pages. Add a coupon only after creating it in WHMCS. When both pop-ups are on, a new visitor sees this one first; nobody sees more than one pop-up per visit.</p>
                <button type="button" className="btn btn-secondary h-9" onClick={() => setPop('welcome', { ...DEFAULT_WELCOME, enabled: st.welcome.enabled, coupon: st.welcome.coupon })}>Reset preset text</button>
              </div>
            )}
            {popupFields(tab)}
          </div>
        </section>

        {touched && errors.length > 0 && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
            <b>Please fix before saving:</b><ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl bg-white/90 px-1 py-3 backdrop-blur">
          <button className="btn btn-primary">Save promotions</button>
          <button type="button" className="btn btn-secondary" disabled={!dirty} onClick={() => setSt(initial)}>Discard changes</button>
          <span className="text-xs text-slate-500">{dirty ? 'Unsaved changes' : 'All changes saved'}{errors.length > 0 ? ` · ${errors.length} issue${errors.length > 1 ? 's' : ''} to fix` : ''}</span>
        </div>
      </div>

      {/* live preview */}
      <div className="min-w-0">
        <section className="card xl:sticky xl:top-24">
          <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <h2 className="text-[14px] font-semibold text-slate-900">Live preview</h2>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showPop} onChange={(e) => setShowPop(e.target.checked)} /> {tab === 'welcome' ? 'Welcome offer' : 'Pop-up'}</label>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {(['desktop', 'mobile'] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`h-8 rounded-md px-3 text-xs font-semibold ${device === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{d === 'desktop' ? 'Desktop' : 'Mobile'}</button>)}
              </div>
            </div>
          </div>
          <div className="bg-slate-100 p-4">
            <div className={`relative mx-auto overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 ${device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'}`} style={{ height: device === 'mobile' ? 700 : 560 }}>
              {(bar.enabled || bar.message) && <div className={bar.enabled ? '' : 'opacity-50'} dangerouslySetInnerHTML={{ __html: previewBar }} />}
              <div aria-hidden className="bg-[#16212b] px-4 py-2 text-[10px] text-slate-400">+971 · support@ · Client login</div>
              <div aria-hidden className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><img src="/image/logo-main-black.png" alt="" className="h-5" /><span className="h-6 w-16 rounded bg-[#c5386f]" /></div>
              <div aria-hidden className="space-y-3 bg-[#16212b] px-6 py-10"><div className="h-6 w-3/4 rounded bg-white/80" /><div className="h-3 w-2/3 rounded bg-white/30" /><div className="h-3 w-1/2 rounded bg-white/30" /><div className="mt-4 h-9 w-32 rounded bg-[#c5386f]" /></div>
              <div aria-hidden className="grid grid-cols-3 gap-3 p-6">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-lg bg-slate-100" />)}</div>
              {showPop && <PopupPreview p={pop} sheet={device === 'mobile'} />}
            </div>
            {!bar.enabled && bar.message && <p className="mt-2 text-center text-xs text-slate-500">The bar is shown faded because it is disabled.</p>}
          </div>
        </section>
      </div>
    </form>
  );
}
