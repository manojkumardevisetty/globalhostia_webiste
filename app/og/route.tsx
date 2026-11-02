// Branded Open Graph image: /og?title=...&kicker=...  (1200x630 PNG, cached at the edge).
// The static fallback public/og/default.png is a snapshot of /og with no parameters.
import { ImageResponse } from 'next/og';

export const runtime = 'edge';

const W = 1200, H = 630;
const clean = (v: string | null, max: number) => (v || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// Low-opacity hexagon outline tile (logo motif).
const HEX = `<svg xmlns="http://www.w3.org/2000/svg" width="84" height="146" viewBox="0 0 84 146"><g fill="none" stroke="#ffffff" stroke-opacity=".09" stroke-width="1.5"><path d="M42 1 83 24.5V71.5L42 95 1 71.5V24.5Z"/><path d="M42 95V146M0 120 42 95 84 120"/></g></svg>`;
const HEX_BG = `url("data:image/svg+xml;utf8,${encodeURIComponent(HEX)}")`;

let assets: Promise<[ArrayBuffer, ArrayBuffer, string, string]> | null = null;
const toData = (b: ArrayBuffer) => {
  let s = ''; const u = new Uint8Array(b);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
};
function load() {
  assets ??= Promise.all([
    fetch(new URL('../../lib/og/manrope-latin-800-normal.woff', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('../../lib/og/inter-latin-500-normal.woff', import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL('../../lib/og/logo-white.png', import.meta.url)).then((r) => r.arrayBuffer()).then(toData),
    fetch(new URL('../../lib/og/mark.png', import.meta.url)).then((r) => r.arrayBuffer()).then(toData),
  ]);
  return assets;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const title = clean(q.get('title'), 90) || 'Web hosting, VPS & dedicated servers';
  const kicker = clean(q.get('kicker'), 40);
  const sub = clean(q.get('sub'), 60) || 'Dubai · Europe · USA · Asia';
  const [manrope, inter, logo, mark] = await load();
  const size = title.length <= 26 ? 76 : title.length <= 44 ? 64 : title.length <= 64 ? 54 : 46;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', fontFamily: 'Inter', color: '#ffffff',
        backgroundColor: '#16212b', backgroundImage: 'linear-gradient(135deg, #16212b 0%, #23313d 58%, #2a2536 100%)' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', backgroundImage: HEX_BG, backgroundRepeat: 'repeat', backgroundSize: '84px 146px' }} />
        <div style={{ position: 'absolute', right: -160, top: -120, width: 760, height: 760, display: 'flex', borderRadius: 9999,
          backgroundImage: 'radial-gradient(circle, rgba(197,56,111,.38) 0%, rgba(197,56,111,0) 66%)' }} />
        <img src={mark} width={330} height={330} alt="" style={{ position: 'absolute', right: 84, top: 150 }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', width: 800, height: H }}>
          <img src={logo} width={264} height={47} alt="" style={{ objectFit: 'contain', objectPosition: 'left' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kicker ? (
              <div style={{ display: 'flex', alignSelf: 'flex-start', marginBottom: 26, padding: '8px 18px', borderRadius: 999, backgroundColor: '#c5386f',
                fontSize: 22, letterSpacing: 2, textTransform: 'uppercase' }}>{kicker}</div>
            ) : null}
            <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 800, fontSize: size, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 760 }}>{title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 56, height: 6, borderRadius: 3, backgroundColor: '#fdd700', marginRight: 22, display: 'flex' }} />
            <div style={{ display: 'flex', fontSize: 28, color: '#c9d2dc' }}>{sub}</div>
          </div>
        </div>
        <div style={{ position: 'absolute', right: 72, bottom: 64, display: 'flex', fontSize: 24, color: '#9aa7b4' }}>globalhostia.com</div>
      </div>
    ),
    {
      width: W, height: H,
      fonts: [
        { name: 'Manrope', data: manrope, weight: 800, style: 'normal' },
        { name: 'Inter', data: inter, weight: 500, style: 'normal' },
      ],
      headers: { 'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' },
    },
  );
}
