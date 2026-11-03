// /ai/checkout?c=p:<slug>:<cycle>,d:<domain>&cur=AED — turns the website chat cart into one WHMCS checkout.
// Every item is re-priced from the live catalog here (the browser's numbers are never trusted). "Continue" adds the items
// to the WHMCS cart one by one (same-site requests to the client area, so its session cookie is kept) and opens the cart;
// each item also has its own add link as a fallback.
import { agentData, agentTlds } from '@/lib/agents/catalog';
import { cartLinkFor } from '@/lib/agents/shop';
import { validDomain } from '@/lib/agents/domain';
import { esc } from '@/lib/render/util';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const keys = (u.searchParams.get('c') || '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 10);
  const cookieCur = /(?:^|;\s*)gh_cur=([A-Z]{3})/.exec(req.headers.get('cookie') || '')?.[1];
  const d = await agentData(u.searchParams.get('cur') || cookieCur || null);
  const base = d.cat.base, cid = d.cat.currencyIds?.[d.currency];
  const tlds = agentTlds(d);
  const domains = keys.filter((k) => k.startsWith('d:')).map((k) => validDomain(k.slice(2))).filter(Boolean) as string[];
  const items: { label: string; detail: string; price: number | null; url: string }[] = [];
  let attach = domains[0] || null;
  for (const k of keys.filter((x) => x.startsWith('p:'))) {
    const [, slug, cycle] = k.split(':');
    const r = cartLinkFor(d, slug, cycle, attach || undefined);
    if (!r.ok) continue;
    const isHosting = /hosting|wordpress|reseller|vps|cloud|server/i.test(`${d.products.find((p) => p.slug === slug)?.category?.name || ''}`);
    if (attach && isHosting) { items.push({ label: r.name, detail: `${r.cycleLabel} · with ${attach}`, price: r.price + r.setupFee, url: r.cartUrl }); attach = null; }
    else items.push({ label: r.name, detail: r.cycleLabel, price: r.price + r.setupFee, url: cartLinkFor(d, slug, cycle).ok ? (cartLinkFor(d, slug, cycle) as any).cartUrl : r.cartUrl });
  }
  for (const dom of domains) {
    const t = tlds.filter((x) => dom.endsWith(x.tld)).sort((a, b) => b.tld.length - a.tld.length)[0];
    if (!t) continue;
    const sld = dom.slice(0, -t.tld.length);
    const attached = items.some((i) => i.detail.includes(`with ${dom}`));
    items.push({ label: dom, detail: attached ? 'Domain registration, 1 year (added with your hosting)' : 'Domain registration, 1 year', price: t.register,
      url: `${base}/cart.php?a=add&domain=register&sld=${encodeURIComponent(sld)}&tld=${encodeURIComponent(t.tld)}${cid ? `&currency=${cid}` : ''}` });
  }
  const known = items.every((i) => i.price !== null);
  const total = items.reduce((t, i) => t + (i.price || 0), 0);
  const view = `${base}/cart.php?a=view${cid ? `&currency=${cid}` : ''}`;
  const seq = items.filter((i) => !i.detail.includes('(added with your hosting)')).map((i) => i.url);
  const money = (n: number | null) => (n === null ? 'Price at checkout' : `${n.toFixed(2)} ${d.currency}`);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Your cart · GlobalHostia</title>
<style>:root{--ink:#16212b;--brand:#c5386f;--line:#e6e9ee}*{box-sizing:border-box}body{margin:0;background:#f6f7f9;color:var(--ink);font:16px/1.5 Inter,system-ui,sans-serif}main{max-width:560px;margin:40px auto;padding:0 16px}
h1{font:800 26px/1.2 Manrope,Inter,sans-serif;margin:0 0 6px}p{color:#55606b;margin:0 0 20px}ul{list-style:none;margin:0 0 16px;padding:0;background:#fff;border:1px solid var(--line);border-radius:16px}
li{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:14px 18px;border-top:1px solid var(--line)}li:first-child{border-top:0}li b{display:block}li small{color:#6b7580}li a{font-size:13px;color:var(--brand);white-space:nowrap}
.tot{display:flex;justify-content:space-between;font-weight:800;padding:0 4px 18px}button{width:100%;min-height:52px;border:0;border-radius:12px;background:var(--brand);color:#fff;font:700 17px Manrope,Inter,sans-serif;cursor:pointer}button:disabled{opacity:.7}
.note{font-size:13px;color:#6b7580;margin-top:14px}button{display:inline-flex;align-items:center;justify-content:center;gap:10px}
.spin{width:20px;height:20px;animation:r .9s linear infinite}@keyframes r{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spin{animation:none}}
.prog{min-height:1.5em;margin:10px 0 0;font-size:14px;color:#55606b;text-align:center}</style></head><body><main>
<h1>Your cart</h1><p>Prices are live from our billing system. Taxes, if any, are shown at checkout.</p>
${items.length ? `<ul>${items.map((i) => `<li><span><b>${esc(i.label)}</b><small>${esc(i.detail)}</small></span><span style="text-align:right"><b>${esc(money(i.price))}</b><a href="${esc(i.url)}">Add on its own</a></span></li>`).join('')}</ul>
<div class="tot"><span>Total today</span><span>${known ? esc(money(Math.round(total * 100) / 100)) : 'Shown at checkout'}</span></div>
<button id="go">Continue to secure checkout</button><p class="prog" id="prog" role="status" aria-live="polite"></p>
<p class="note">Your items are added to the GlobalHostia cart, then the cart opens. If anything is missing there, use "Add on its own".</p>` : '<p>Your chat cart is empty. <a href="/">Back to the website</a></p>'}
</main><script>(function(){var b=document.getElementById("go"),p=document.getElementById("prog");if(!b)return;var l=${JSON.stringify(seq)},HEX='<svg class="spin" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray="14 40" pathLength="54"/></svg>';
b.onclick=async function(){b.disabled=true;b.innerHTML=HEX+"<span>Adding your items…</span>";var miss=0;for(var i=0;i<l.length;i++){p.textContent="Adding item "+(i+1)+" of "+l.length+"…";try{await fetch(l[i],{mode:"no-cors",credentials:"include",cache:"no-store"})}catch(e){miss++}}
p.textContent=miss?"Some items could not be added. Opening your cart: use \u201cAdd on its own\u201d for anything missing.":"Opening your secure cart…";location.href=${JSON.stringify(view)}};addEventListener("pageshow",function(e){if(e.persisted){b.disabled=false;b.textContent="Continue to secure checkout";p.textContent=""}})})()</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}
