'use client';
import { useState } from 'react';

/** Live preview of the saved page (drafts included) in a desktop or phone-sized frame. */
export default function Preview({ src }: { src: string }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [k, setK] = useState(0);
  const w = device === 'mobile' ? 390 : 1280;
  const scale = device === 'mobile' ? 1 : 0.42;
  return (
    <section className="card xl:sticky xl:top-24">
      <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-[14px] font-semibold text-slate-900">Preview <span className="font-normal text-slate-500">(last saved version)</span></h2>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost h-8 px-2 text-xs" onClick={() => setK((x) => x + 1)}>Reload</button>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['desktop', 'mobile'] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} className={`h-8 rounded-md px-3 text-xs font-semibold ${device === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{d === 'desktop' ? 'Desktop' : 'Mobile'}</button>)}
          </div>
          <a className="btn btn-secondary h-8 px-3 text-xs" href={src} target="_blank">Open</a>
        </div>
      </div>
      <div className="overflow-hidden bg-slate-100 p-4">
        <div className="mx-auto overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200" style={{ width: w * scale, height: 760 }}>
          <iframe key={`${device}-${k}`} src={src} title="Landing page preview" style={{ width: w, height: 760 / scale, transform: `scale(${scale})`, transformOrigin: '0 0', border: 0 }} />
        </div>
      </div>
    </section>
  );
}
