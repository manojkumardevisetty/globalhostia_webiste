// Recording helpers: a visible cursor with a click ripple and a burned-in caption bar, injected into every page,
// slow deliberate pointer moves, and cue timing (seconds from the trimmed start) for the WebVTT files.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const { chromium } = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
export const W = 1280, H = 720;

export const OVERLAY = () => {
  const css = `#ghrec-cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none}
#ghrec-cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
.ghrec-rip{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #e0306b;background:rgba(224,48,107,.18);animation:ghrecr .6s ease-out forwards}
@keyframes ghrecr{from{transform:scale(.3);opacity:1}to{transform:scale(1.5);opacity:0}}
#ghrec-cap{position:fixed;left:50%;top:12px;transform:translateX(-50%) translateY(-10px);z-index:2147483645;pointer-events:none;max-width:860px;padding:11px 20px 11px 14px;border-radius:12px;background:rgba(13,18,33,.92);color:#fff;font:600 19px/1.35 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;gap:12px;align-items:center;opacity:0;transition:opacity .3s,transform .3s;box-shadow:0 8px 28px rgba(0,0,0,.3)}
#ghrec-cap.on{opacity:1;transform:translateX(-50%)}
#ghrec-cap b{flex:none;display:grid;place-items:center;min-width:30px;height:30px;border-radius:8px;background:#e0306b;font-size:15px}
.ghrec-hl{position:fixed;z-index:2147483644;pointer-events:none;border:3px solid #e0306b;border-radius:10px;box-shadow:0 0 0 4000px rgba(10,14,28,.18);transition:all .35s}`;
  const boot = () => {
    if (document.getElementById('ghrec-cur')) return;
    const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st);
    const c = document.createElement('div'); c.id = 'ghrec-cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 11.2-6.6.9 3.9 7.4-2.9 1.5-3.9-7.5L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const cap = document.createElement('div'); cap.id = 'ghrec-cap'; cap.setAttribute('aria-hidden', 'true'); cap.dir = 'ltr'; document.documentElement.appendChild(cap);
    const p = (window as any).__ghrecPos; if (p) c.style.transform = `translate(${p[0]}px,${p[1]}px)`;
    const cp = (window as any).__ghrecCap; if (cp) { cap.innerHTML = cp; cap.classList.add('on'); }
  };
  addEventListener('mousemove', (e) => { (window as any).__ghrecPos = [e.clientX, e.clientY]; const c = document.getElementById('ghrec-cur'); if (c) c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, true);
  addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = 'ghrec-rip'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  new MutationObserver(boot).observe(document, { childList: true, subtree: false });
};

export type Cue = { start: number; end: number; en: string; ar: string };
export class Rec {
  p: any; t0 = 0; startAt = 0; cues: Cue[] = []; pos: [number, number] = [W / 2, H / 2]; step = 0;
  constructor(p: any) { this.p = p; this.t0 = Date.now(); }
  now() { return (Date.now() - this.t0) / 1000; }
  /** call once the first real screen is painted: the video is trimmed to start here */
  begin() { this.startAt = this.now(); }
  async pause(ms: number) { await this.p.waitForTimeout(ms); }
  async cap(en: string, ar: string, hold = 1400) {
    const t = this.now() - this.startAt;
    const last = this.cues[this.cues.length - 1]; if (last && last.end > t) last.end = t;
    this.step++;
    const html = `<b>${this.step}</b><span>${en.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
    await this.p.evaluate((h: string) => { (window as any).__ghrecCap = h; const c = document.getElementById('ghrec-cap'); if (c) { c.classList.remove('on'); c.innerHTML = h; void c.offsetWidth; c.classList.add('on'); } }, html).catch(() => {});
    this.cues.push({ start: Math.max(0, t), end: t + 60, en: `${this.step}. ${en}`, ar: `${this.step}. ${ar}` });
    await this.pause(Math.max(hold, 1500));
  }
  /** keep the caption across a navigation */
  async recap() { const h = this.cues.length ? null : null; return h; }
  async moveTo(target: any, opts: { dx?: number; dy?: number; ms?: number } = {}) {
    const loc = typeof target === 'string' ? this.p.locator(target).first() : target;
    await loc.waitFor({ state: 'visible', timeout: 30000 });
    const b0 = await loc.boundingBox();
    if (b0 && (b0.y < 110 || b0.y + b0.height > H - 150)) {
      await loc.evaluate((el: any) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await this.pause(900);
    }
    await this.pause(150);
    const b = await loc.boundingBox();
    if (!b) throw new Error('no box for ' + target);
    const x = b.x + (opts.dx ?? Math.min(b.width / 2, 60)), y = b.y + (opts.dy ?? b.height / 2);
    const dist = Math.hypot(x - this.pos[0], y - this.pos[1]);
    const steps = Math.max(12, Math.min(45, Math.round(dist / 18)));
    // ease in-out along the path
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await this.p.mouse.move(this.pos[0] + (x - this.pos[0]) * e, this.pos[1] + (y - this.pos[1]) * e);
      await this.p.waitForTimeout(14);
    }
    this.pos = [x, y];
    await this.pause(opts.ms ?? 250);
    return loc;
  }
  async click(target: any, opts: { dx?: number; dy?: number; after?: number } = {}) {
    const loc = await this.moveTo(target, opts);
    await this.p.mouse.down(); await this.pause(90); await this.p.mouse.up();
    await this.pause(opts.after ?? 700);
    return loc;
  }
  async type(target: any, text: string, opts: { clear?: boolean; delay?: number } = {}) {
    const loc = await this.click(target, { after: 250 });
    if (opts.clear) { await loc.fill(''); }
    await loc.pressSequentially(text, { delay: opts.delay ?? 75 });
    await this.pause(450);
    return loc;
  }
  async select(target: any, value: string) { const loc = await this.click(target, { after: 300 }); await loc.selectOption(value); await this.pause(600); }
  async scroll(dy: number) { const n = 12; for (let i = 0; i < n; i++) { await this.p.mouse.wheel(0, dy / n); await this.p.waitForTimeout(30); } await this.pause(500); }
  async hl(target: any) { const b = await (typeof target === 'string' ? this.p.locator(target).first() : target).boundingBox(); await this.p.evaluate((r: any) => { let h = document.querySelector('.ghrec-hl') as HTMLElement; if (!h) { h = document.createElement('div'); h.className = 'ghrec-hl'; document.documentElement.appendChild(h); } Object.assign(h.style, { left: r.x - 6 + 'px', top: r.y - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' }); }, b); }
  async unhl() { await this.p.evaluate(() => document.querySelector('.ghrec-hl')?.remove()); }
  end() { const t = this.now() - this.startAt; const last = this.cues[this.cues.length - 1]; if (last) last.end = Math.min(last.end, t); return t; }
}

const vttTime = (s: number) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, ss = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(r).padStart(3, '0')}`; };
export function vtt(cues: Cue[], lang: 'en' | 'ar') {
  return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(Math.max(c.end, c.start + 1))}${lang === 'ar' ? ' align:center' : ''}\n${c[lang]}\n`).join('\n');
}
