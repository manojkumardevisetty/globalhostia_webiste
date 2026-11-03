// Branded 404 for the public site (status set by app/[[...slug]]/route.ts). Hero with the hexagon texture, a search
// box over every page in the menus (filters instantly in the browser, works without JavaScript as a plain list),
// "were you looking for" guesses from the words in the broken URL, popular links and help links.
import { esc } from '../../render/util';
import type { PageCtx } from '../index';
import { page } from '../shell';
import { getCatalog, type Catalog } from '../data';
import { getMenu, footerColumns } from '../menu';
import { icon, hexIcon, type IconName } from '../ui';

type Link = { label: string; href: string };

const POPULAR: (Link & { icon: IconName; text: string })[] = [
  { label: 'Web hosting', href: '/web-hosting', icon: 'layers', text: 'Fast hosting with free SSL and daily backups.' },
  { label: 'Register a domain', href: '/domains-registration', icon: 'globe', text: 'Search names and see first-year and renewal prices.' },
  { label: 'VPS servers', href: '/vps-hosting', icon: 'cloud', text: 'Root access, NVMe storage, six locations.' },
  { label: 'Help center', href: '/help-center', icon: 'headset', text: 'Guides for hosting, email, DNS and billing.' },
];

/** every menu + footer link, de-duplicated (internal pages only) */
export function siteLinks(cat: Catalog): Link[] {
  const seen = new Set<string>(), out: Link[] = [];
  const add = (l: Link) => { const h = String(l.href || ''); if (!h.startsWith('/') || h.startsWith('//') || seen.has(h)) return; seen.add(h); out.push({ label: l.label, href: h }); };
  for (const col of footerColumns(getMenu(cat))) for (const l of col.links) add(l);
  for (const l of [...POPULAR, { label: 'Contact us', href: '/contact' }, { label: 'Free website migration', href: '/free-migration' }, { label: 'My account', href: '/account' }, { label: 'Blog', href: '/blog' }]) add(l);
  return out;
}

/** links whose label or URL share a word with the broken path ("/wordpres-hosting" → WordPress hosting) */
export function guesses(path: string, links: Link[], max = 3): Link[] {
  const words = decodeURIComponent(path).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['html', 'php', 'www', 'the', 'and', 'page'].includes(w));
  if (!words.length) return [];
  const score = (l: Link) => {
    const hay = `${l.label} ${l.href}`.toLowerCase();
    return words.reduce((s, w) => s + (hay.includes(w) ? 2 : hay.includes(w.slice(0, Math.max(4, w.length - 2))) ? 1 : 0), 0);
  };
  return links.map((l) => ({ l, s: score(l) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.l);
}

export async function renderNotFound(ctx: PageCtx): Promise<string> {
  const cat = await getCatalog();
  const links = siteLinks(cat);
  const guess = guesses(ctx.path, links);
  const body = `<section class="hp-hero hp-hero--page is-solo nf-hero" data-network aria-labelledby="nf-h">
  <div class="hp-hero__hex" aria-hidden="true"></div>
  <div class="hp-container">
    <div class="hp-hero__copy">
      <span class="hp-kicker"><i aria-hidden="true"></i>Error 404</span>
      <h1 id="nf-h">We could not find that page</h1>
      <p class="hp-lead">The link may be old, or the page has moved. Search below, or pick one of the popular pages.</p>
    </div>
  </div>
</section>
<section class="hp-section nf" aria-label="Find a page"><div class="hp-container">
  ${guess.length ? `<div class="nf-guess" role="status"><b>Were you looking for</b><ul>${guess.map((g) => `<li><a class="hp-link" href="${esc(g.href)}">${esc(g.label)}${icon('arrow')}</a></li>`).join('')}</ul></div>` : ''}
  <form class="nf-search" role="search" action="/help-center" method="get" data-nf-search>
    <label for="nf-q">Search pages</label>
    <div class="nf-search__f">${icon('search')}<input class="hp-input" id="nf-q" name="q" type="search" autocomplete="off" placeholder="For example: WordPress, VPS, email, SSL" aria-controls="nf-list" aria-describedby="nf-count"></div>
    <p class="nf-count" id="nf-count" aria-live="polite"></p>
  </form>
  <ul class="nf-list" id="nf-list" data-nf-list>${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('')}</ul>
  <p class="nf-none" data-nf-none hidden>No page matches that. Try another word, <a href="/help-center">browse the help center</a> or <a href="/contact">ask our team</a>.</p>
  <h2 class="nf-h2">Popular pages</h2>
  <div class="nf-pop">${POPULAR.map((p) => `<a class="nf-card" href="${esc(p.href)}">${hexIcon(p.icon)}<span><b>${esc(p.label)}</b><small>${esc(p.text)}</small></span></a>`).join('')}</div>
  <p class="nf-help">Followed a link from our website? <a href="/contact">Tell us</a> and we will fix it. Looking for your services? <a href="/account">Sign in to your account</a>.</p>
</div></section>
<script>(function(){var f=document.querySelector("[data-nf-search]"),q=f&&f.querySelector("input"),ls=document.querySelectorAll("[data-nf-list] li"),none=document.querySelector("[data-nf-none]"),c=document.getElementById("nf-count");if(!q)return;
var run=function(){var v=q.value.trim().toLowerCase(),n=0;ls.forEach(function(li){var hit=!v||li.textContent.toLowerCase().indexOf(v)>-1||li.firstChild.getAttribute("href").indexOf(v.replace(/\\s+/g,"-"))>-1;li.hidden=!hit;if(hit)n++});none.hidden=n>0;c.textContent=v?(n===1?"1 page found":n+" pages found"):""};
q.addEventListener("input",run);f.addEventListener("submit",function(e){var first=[].filter.call(ls,function(li){return!li.hidden})[0];if(q.value.trim()&&first){e.preventDefault();location.href=first.firstChild.getAttribute("href")}})})()</script>`;
  return page({ ctx, catalog: cat, path: ctx.path, title: 'Page not found', description: 'This page could not be found.', noindex: true, css: ['notfound'], body, bodyClass: 'nf-page' });
}
