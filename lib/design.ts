// Design Manager: compiles admin-chosen theme tokens into CSS overrides for the original theme.
import theme from '../legacy/theme-rules.json';

export type Design = {
  primary?: string; secondary?: string; dark?: string; accent?: string; danger?: string;
  bodyFont?: string; headingFont?: string; radius?: string; buttonRadius?: string;
};
export const DEFAULT_TOKENS = theme.tokens as Record<string, string>;
export const FONTS = ['Inter', 'Poppins', 'Manrope', 'Plus Jakarta Sans', 'DM Sans', 'Outfit', 'Figtree', 'Roboto', 'Open Sans', 'Montserrat', 'Cairo', 'Tajawal'];
const HEX = /^#[0-9a-f]{6}$/i;

export function compileDesign(d: Design = {}): { css: string; fontsHref: string } {
  const swaps = Object.entries(DEFAULT_TOKENS)
    .map(([k, from]) => [from.toLowerCase(), (d as any)[k]] as const)
    .filter(([from, to]) => to && HEX.test(to) && to.toLowerCase() !== from);
  const chunks: string[] = [];
  if (swaps.length) {
    const byMedia = new Map<string, string[]>();
    for (const r of theme.rules as { s: string; d: string; m: string }[]) {
      let decl = r.d, hit = false;
      for (const [from, to] of swaps) if (decl.toLowerCase().includes(from)) { decl = decl.replace(new RegExp(from, 'gi'), to); hit = true; }
      if (hit) byMedia.set(r.m, [...(byMedia.get(r.m) || []), `${r.s}{${decl}}`]);
    }
    for (const [m, rules] of byMedia) chunks.push(m ? `@media ${m}{${rules.join('')}}` : rules.join(''));
  }
  const fonts = [d.bodyFont, d.headingFont].filter((f): f is string => !!f && FONTS.includes(f) && f !== 'Inter');
  if (d.bodyFont && FONTS.includes(d.bodyFont)) chunks.push(`body,p,a,li,input,button,select,textarea{font-family:"${d.bodyFont}",sans-serif}`);
  if (d.headingFont && FONTS.includes(d.headingFont)) chunks.push(`h1,h2,h3,h4,h5,h6,.price-of-plan{font-family:"${d.headingFont}",sans-serif}`);
  const rad = (v?: string) => (v && /^\d{1,2}$/.test(v) ? `${v}px` : '');
  if (rad(d.radius)) chunks.push(`.rounded-10,.rounded-20,.card,.pricing-plan-two,.border.rounded-10{border-radius:${rad(d.radius)}!important}`);
  if (rad(d.buttonRadius)) chunks.push(`.btn,.btn-order,.btn-buy{border-radius:${rad(d.buttonRadius)}!important}`);
  const fontsHref = fonts.length ? `https://fonts.googleapis.com/css2?${[...new Set(fonts)].map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`).join('&')}&display=swap` : '';
  return { css: chunks.join('\n'), fontsHref };
}
