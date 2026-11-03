// Responsive images for the Hostpen theme: AVIF + WebP variants made by scripts/build-assets.mjs
// (public/hp/img/opt/<name>-<w>.avif|webp), served with <picture>/srcset/sizes. Images that are not in
// the manifest (uploads, external URLs) fall back to a plain <img>.
import { esc } from '../render/util';
import { IMG_MANIFEST } from './img-manifest';

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

/** Inner-page hero backdrops are drawn at 22% opacity: half the viewport's resolution is indistinguishable and
 *  halves the bytes. Use the same value in page({ preload }) so the preload matches the <picture>. */
export const HERO_BG_SIZES = '50vw';

export const imgInfo = (src: string) => IMG_MANIFEST[src.split('?')[0]] || null;

/** "…-640.avif 640w, …-960.avif 960w" for a manifest image, '' otherwise. */
export function srcsetOf(src: string, fmt: 'avif' | 'webp') {
  const m = imgInfo(src);
  return m ? m.widths.map((w) => `/hp/img/opt/${m.name}-${w}.${fmt} ${w}w`).join(', ') : '';
}

export type PictureOpts = {
  src: string;
  /** meaningful alt text; '' (default) marks the image decorative (role="presentation") */
  alt?: string;
  sizes?: string;
  className?: string;
  width?: number; height?: number;
  /** LCP image: eager + fetchpriority=high (pair it with page({ preload: [src] })) */
  priority?: boolean;
  /** no request until a script copies data-src/data-srcset into place (hero slides after the first) */
  deferred?: boolean;
  /** extra trusted attributes for the <img> */
  attrs?: string;
};

export function picture(o: PictureOpts): string {
  const m = imgInfo(o.src);
  const alt = o.alt || '';
  const w = o.width || m?.w, h = o.height || m?.h;
  const load = o.priority ? ' fetchpriority="high"' : o.deferred ? '' : ' loading="lazy"';
  const imgAttrs = `${o.className ? ` class="${esc(o.className)}"` : ''} alt="${esc(alt)}"${alt ? '' : ' role="presentation"'}${w && h ? ` width="${w}" height="${h}"` : ''}${load} decoding="async"${o.attrs ? ' ' + o.attrs : ''}`;
  if (!m) return `<img src="${esc(o.src)}"${imgAttrs}>`;
  const sizes = esc(o.sizes || '100vw');
  const set = (attr: string, v: string) => (o.deferred ? `data-${attr}="${esc(v)}"` : `${attr}="${esc(v)}"`);
  const fallback = `/hp/img/opt/${m.name}-${m.widths[Math.min(1, m.widths.length - 1)]}.webp`;
  return `<picture><source type="image/avif" ${set('srcset', srcsetOf(o.src, 'avif'))} sizes="${sizes}"><source type="image/webp" ${set('srcset', srcsetOf(o.src, 'webp'))} sizes="${sizes}">`
    + `<img ${o.deferred ? `src="${BLANK}" data-src="${esc(fallback)}"` : `src="${esc(fallback)}"`}${imgAttrs}></picture>`;
}

/** <link rel=preload> for the LCP image: responsive (AVIF srcset + sizes) for manifest images. */
export function preloadImage(src: string, sizes = '100vw', media = '') {
  const m = media ? ` media="${esc(media)}"` : '';
  return imgInfo(src)
    ? `<link rel="preload" as="image" type="image/avif" imagesrcset="${esc(srcsetOf(src, 'avif'))}" imagesizes="${esc(sizes)}"${m} fetchpriority="high">`
    : `<link rel="preload" as="image" href="${esc(src)}"${m} fetchpriority="high">`;
}
