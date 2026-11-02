// Regenerates favicons, PWA icons and the OG logo from the real hexagon logo.
// Usage: node scripts/generate-seo-assets.mjs   (needs `sharp`, which ships with Next.js)
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const SRC = 'public/image/favicon/favicon.png';      // 756x756 hexagon "G" mark
const WORDMARK = 'public/image/logo-main-white.png';  // white wordmark for dark backgrounds
const CHARCOAL = '#23313d';
const out = (p) => `public/${p}`;

const mark = await sharp(SRC).trim().toBuffer();       // drop the transparent padding
const png = async (size, pad, bg) => {
  const inner = await sharp(mark).resize(Math.round(size * (1 - pad * 2)), Math.round(size * (1 - pad * 2)), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: inner, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer();
};
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

// Transparent icons (browser tabs, Android). Tiny sizes use less padding so the mark stays legible.
const ico = {};
for (const s of [16, 32, 48]) ico[s] = await png(s, s <= 32 ? 0.02 : 0.04, clear);
await writeFile(out('favicon-16x16.png'), ico[16]);
await writeFile(out('favicon-32x32.png'), ico[32]);
await writeFile(out('icon-192.png'), await png(192, 0.06, clear));
await writeFile(out('icon-512.png'), await png(512, 0.06, clear));
// Apple touch icon: solid background (iOS fills transparency with black).
await writeFile(out('apple-touch-icon.png'), await png(180, 0.14, '#ffffff'));
// Maskable: mark inside the 80% safe zone on a solid brand background.
await writeFile(out('icon-maskable-512.png'), await png(512, 0.22, CHARCOAL));

// favicon.ico with embedded PNG frames (16/32/48), supported by every current browser.
const frames = [16, 32, 48].map((s) => ({ s, b: ico[s] }));
const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(frames.length, 4);
let offset = 6 + 16 * frames.length;
const dir = frames.map(({ s, b }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s % 256, 0); e.writeUInt8(s % 256, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(b.length, 8); e.writeUInt32LE(offset, 12);
  offset += b.length; return e;
});
await writeFile(out('favicon.ico'), Buffer.concat([head, ...dir, ...frames.map((f) => f.b)]));

// Logo used inside generated Open Graph images (bundled with the /og route).
await mkdir('lib/og', { recursive: true });
await writeFile('lib/og/logo-white.png', await sharp(WORDMARK).trim().resize({ width: 440 }).png({ compressionLevel: 9 }).toBuffer());
await writeFile('lib/og/mark.png', await png(360, 0, clear));
console.log('SEO assets written');
