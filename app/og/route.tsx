// Branded Open Graph image: /og?title=…&kicker=…&price=…&lang=ar&v=…  (1200×630 PNG).
// Every page links its own card (lib/seo.ts ogImageUrl): page title, section kicker, the real "from" price on product
// pages, Arabic pages right to left in IBM Plex Sans Arabic. `v` is a hash of the design version and the parameters,
// so a versioned URL is cached as immutable; unversioned requests get a one-day cache.
// The static fallback public/og/default.png is a snapshot of /og with no parameters.
import { ImageResponse } from 'next/og';
import { visualArabicWord } from '../../lib/og/arabic-shape';

export const runtime = 'edge';

const W = 1200, H = 630;
const clean = (v: string | null, max: number) => (v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

// Low-opacity hexagon outline tile (logo motif).
const HEX = `<svg xmlns="http://www.w3.org/2000/svg" width="84" height="146" viewBox="0 0 84 146"><g fill="none" stroke="#ffffff" stroke-opacity=".09" stroke-width="1.5"><path d="M42 1 83 24.5V71.5L42 95 1 71.5V24.5Z"/><path d="M42 95V146M0 120 42 95 84 120"/></g></svg>`;
const HEX_BG = `url("data:image/svg+xml;utf8,${encodeURIComponent(HEX)}")`;

type Assets = [ArrayBuffer, ArrayBuffer, ArrayBuffer, ArrayBuffer, string, string];
let assets: Promise<Assets> | null = null;
const toData = (b: ArrayBuffer) => {
  let s = ''; const u = new Uint8Array(b);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
};
// literal URLs: the bundler copies each font / image next to the edge function only for a static new URL(…)
const buf = (u: URL) => fetch(u).then((r) => r.arrayBuffer());
function load() {
  assets ??= Promise.all([
    buf(new URL('../../lib/og/manrope-latin-800-normal.woff', import.meta.url)),
    buf(new URL('../../lib/og/inter-latin-500-normal.woff', import.meta.url)),
    // Arabic (OFL, the same family the /ar pages use): bold title, medium kicker / footer line
    buf(new URL('../../lib/og/ibm-plex-sans-arabic-arabic-700-normal.woff', import.meta.url)),
    buf(new URL('../../lib/og/ibm-plex-sans-arabic-arabic-500-normal.woff', import.meta.url)),
    buf(new URL('../../lib/og/logo-white.png', import.meta.url)).then(toData),
    buf(new URL('../../lib/og/mark.png', import.meta.url)).then(toData),
  ]) as Promise<Assets>;
  assets.catch(() => { assets = null; });
  return assets;
}

/**
 * Right-to-left text for satori, which shapes Arabic letters but lays words out left to right: each word is its own
 * box in a row-reverse wrap (first word on the right, lines wrap leftwards); consecutive Latin words (product
 * names, "Google Workspace") stay one left-to-right run, with trailing punctuation on their left (bidi neutral
 * characters take the paragraph direction: "VPS:" in an Arabic sentence reads ":VPS").
 */
function rtl(text: string, gap: number) {
  const runs: string[] = [];
  for (const w of text.split(' ').filter(Boolean)) {
    const prev = runs[runs.length - 1];
    if (prev !== undefined && !ARABIC.test(w) && !ARABIC.test(prev)) runs[runs.length - 1] = `${prev} ${w}`;
    else runs.push(w);
  }
  return runs.map((w, i) => <div key={i} style={{ display: 'flex', marginLeft: i === runs.length - 1 ? 0 : gap }}>{ARABIC.test(w) ? visualArabicWord(w) : w.replace(/^(.*?)([:;,.!?\u2026]+)$/, '$2$1')}</div>);
}
const RTL_BOX = { display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap' } as const;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const ar = q.get('lang') === 'ar' || ARABIC.test(q.get('title') || '');
  const title = clean(q.get('title'), 90) || (ar ? 'النطاقات والنطاقات المميزة والاستضافة المُدارة' : 'Domains, premium domains & managed hosting');
  const kicker = clean(q.get('kicker'), 40);
  const sub = clean(q.get('sub'), 60) || (ar ? 'دبي · أوروبا · الولايات المتحدة · آسيا' : 'Dubai · Europe · USA · Asia');
  const price = clean(q.get('price'), 24);
  const versioned = !!q.get('v');
  const [manrope, inter, plexBold, plexMed, logo, mark] = await load();
  const size = title.length <= 26 ? 76 : title.length <= 44 ? 64 : title.length <= 64 ? 54 : 46;
  // Arabic: mirrored layout (text column on the right, mark on the left), right-aligned
  const row = ar ? 'row-reverse' : 'row';
  const align = ar ? 'flex-end' : 'flex-start';
  const titleFont = ar ? 'Plex Arabic' : 'Manrope';
  const textFont = ar ? 'Plex Arabic Medium' : 'Inter';

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: row, position: 'relative', fontFamily: textFont, color: '#ffffff',
        backgroundColor: '#16212b', backgroundImage: 'linear-gradient(135deg, #16212b 0%, #23313d 58%, #2a2536 100%)' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', backgroundImage: HEX_BG, backgroundRepeat: 'repeat', backgroundSize: '84px 146px' }} />
        <div style={{ position: 'absolute', top: -120, width: 760, height: 760, display: 'flex', borderRadius: 9999, ...(ar ? { left: -160 } : { right: -160 }),
          backgroundImage: 'radial-gradient(circle, rgba(197,56,111,.38) 0%, rgba(197,56,111,0) 66%)' }} />
        <img src={mark} width={330} height={330} alt="" style={{ position: 'absolute', top: 150, ...(ar ? { left: 84 } : { right: 84 }) }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: align, padding: '64px 72px', width: 800, height: H }}>
          <img src={logo} width={264} height={47} alt="" style={{ objectFit: 'contain' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: align }}>
            {kicker ? (
              <div style={{ display: 'flex', marginBottom: 26, padding: ar ? '6px 20px 10px' : '8px 18px', borderRadius: 999, backgroundColor: '#c5386f',
                fontSize: ar ? 24 : 22, letterSpacing: ar ? 0 : 2, textTransform: ar ? 'none' : 'uppercase', ...(ar ? RTL_BOX : {}) }}>{ar ? rtl(kicker, 8) : kicker}</div>
            ) : null}
            <div style={{ display: 'flex', fontFamily: titleFont, fontWeight: 800, fontSize: ar ? Math.round(size * 0.92) : size, lineHeight: ar ? 1.35 : 1.08,
              letterSpacing: ar ? 0 : -1.5, maxWidth: 760, ...(ar ? RTL_BOX : {}) }}>{ar ? rtl(title, Math.round(size * 0.26)) : title}</div>
            {price ? (
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 28, padding: '10px 22px', borderRadius: 14, backgroundColor: 'rgba(253,215,0,.12)', border: '2px solid #fdd700', flexDirection: row }}>
                <div style={{ display: 'flex', fontSize: 24, color: '#fdd700', fontFamily: ar ? 'Plex Arabic Medium' : 'Inter', ...(ar ? { marginLeft: 12, flexDirection: 'row-reverse' as const } : { marginRight: 12 }) }}>{ar ? rtl('تبدأ من', 7) : 'From'}</div>
                <div style={{ display: 'flex', fontSize: 34, fontFamily: 'Manrope', fontWeight: 800, color: '#ffffff' }}>{price}</div>
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexDirection: row }}>
            <div style={{ width: 56, height: 6, borderRadius: 3, backgroundColor: '#fdd700', display: 'flex', ...(ar ? { marginLeft: 22 } : { marginRight: 22 }) }} />
            <div style={{ display: 'flex', fontSize: 28, color: '#c9d2dc', ...(ar ? RTL_BOX : {}) }}>{ar ? rtl(sub, 8) : sub}</div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 64, display: 'flex', fontSize: 24, color: '#9aa7b4', fontFamily: 'Inter', ...(ar ? { left: 72 } : { right: 72 }) }}>globalhostia.com</div>
      </div>
    ),
    {
      width: W, height: H,
      fonts: [
        { name: 'Manrope', data: manrope, weight: 800, style: 'normal' },
        { name: 'Inter', data: inter, weight: 500, style: 'normal' },
        { name: 'Plex Arabic', data: plexBold, weight: 800, style: 'normal' },
        { name: 'Plex Arabic Medium', data: plexMed, weight: 500, style: 'normal' },
      ],
      headers: {
        // a versioned URL never changes content (lib/seo.ts: v = hash of design version + parameters)
        'cache-control': versioned ? 'public, max-age=31536000, s-maxage=31536000, immutable' : 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      },
    },
  );
}
