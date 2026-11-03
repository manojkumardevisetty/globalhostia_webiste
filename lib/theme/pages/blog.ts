// Blog: /blog (index + pagination), /blog/category/<slug>, /blog/<slug> (article), /blog/rss.xml.
// Posts come from lib/blog.ts (admin-managed, Markdown rendered and sanitized by lib/markdown.ts).
import type { PageCtx } from '../index';
import { esc } from '../../render/util';
import { getCatalog, productsFor, productBySlug, categoryBySlug, fromPrice, orderUrl, deriveSpecs, type Catalog, type TProduct } from '../data';
import { page } from '../shell';
import { pageHero, breadcrumbs, breadcrumbJsonLd, ctaBand, icon, hexIcon, button, link, ld, available, fromText, planCards, plansNote, sectionHead, ICON_NAMES, faqJsonLd } from '../ui';
import { getPosts, getPost, blogCategories, relatedPosts, postPath, absUrl, fmtPostDate, roadmapFrom, trustPointsFrom, blogTags, faqFromMarkdown, type BlogPost } from '../../blog';
import { renderMarkdown } from '../../markdown';

export type BlogResult = { status: number; body: string; type?: string; cache?: boolean };

const PER_PAGE = 9;
const BLOG_TITLE = 'Hosting guides and news';
const BLOG_LEAD = 'Practical guides on web hosting, domains, servers and security from the Globalhostia team in Dubai.';

const siteOf = (cat: Catalog) => String(cat.settings.site_url || 'https://globalhostia.com').replace(/\/$/, '');
const iso = (d: string) => new Date(d).toISOString();

/* ------------------------------------------------------------------ pieces */
/** Cover in the brand frame: rounded, charcoal-to-raspberry overlay, hexagon accent, gold category chip.
 *  style 'plain' keeps only the frame + chip, 'hex' crops to an elongated hexagon. */
function cover(p: BlogPost, o: { w: number; h: number; eager?: boolean; sizes?: string; chip?: boolean }) {
  const img = p.coverImage
    ? `<img src="${esc(p.coverImage)}" alt="${esc(p.coverAlt)}" width="${o.w}" height="${o.h}"${o.eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${o.sizes ? ` sizes="${esc(o.sizes)}"` : ''}>`
    // no cover: branded placeholder with the category initial (decorative)
    : `<span class="bl-ph" aria-hidden="true"><span>${esc((p.category || p.title).slice(0, 1).toUpperCase())}</span></span>`;
  const chip = o.chip !== false && p.category ? `<span class="bl-img__chip">${esc(p.category)}</span>` : '';
  return `<span class="bl-img bl-img--${p.coverStyle}">${img}<span class="bl-img__fx" aria-hidden="true"></span>${chip}</span>`;
}

const meta = (p: BlogPost) =>
  `<p class="bl-meta"><time datetime="${esc(iso(p.date))}">${esc(fmtPostDate(p.date))}</time><span aria-hidden="true">·</span><span>${p.readingMinutes} min read</span></p>`;

/** Post card (blog grid, related posts, homepage). */
export function postCard(p: BlogPost, level: 2 | 3 = 3) {
  const h = `h${level}`;
  return `<article class="bl-card" data-reveal>
  <a class="bl-card__img" href="${esc(postPath(p.slug))}" tabindex="-1" aria-hidden="true">${cover(p, { w: 640, h: 360 })}</a>
  <div class="bl-card__body">
    <${h} class="bl-card__title"><a href="${esc(postPath(p.slug))}">${esc(p.title)}</a></${h}>
    <p class="bl-card__ex">${esc(p.excerpt)}</p>
    ${meta(p)}
  </div>
</article>`;
}
const card = postCard;

function featuredCard(p: BlogPost) {
  return `<article class="bl-feat" data-reveal>
  <a class="bl-feat__img" href="${esc(postPath(p.slug))}" tabindex="-1" aria-hidden="true">${cover(p, { w: 1200, h: 675, eager: true })}</a>
  <div class="bl-feat__body">
    <p class="bl-feat__kick">${icon('star')}${p.featured ? 'Featured article' : 'Latest article'}</p>
    <h2 class="bl-feat__title"><a href="${esc(postPath(p.slug))}">${esc(p.title)}</a></h2>
    <p class="bl-feat__ex">${esc(p.excerpt)}</p>
    ${meta(p)}
    <a class="hp-btn hp-btn--brand bl-feat__cta" href="${esc(postPath(p.slug))}">Read article${icon('arrow')}</a>
  </div>
</article>`;
}

/* ------------------------------------------------------------------ products for a post */
const H = ['hosting-usa', 'hostia-shared', 'hosting-singapore'];
const D = ['dedicated-servers', 'premiumdedicated-servers'];
/** topic words → catalog categories (first matches win, at most two groups) */
const TOPICS: [RegExp, string[]][] = [
  [/wordpress|woocommerce/, ['wordpress-hosting', ...H]],
  [/forex|trading|metatrader|\bmt[45]\b|expert advisor/, ['forex-vps', 'windows-rdp']],
  [/\brdp\b|remote desktop|windows server/, ['windows-rdp', 'linux-rdp']],
  [/dedicated|bare[- ]?metal/, D],
  [/\bvps\b|virtual private server|cloud server|docker|n8n|linux/, ['hostiavps']],
  [/\bllm\b|\bai\b|machine learning|inference/, ['ai-llm']],
  [/reseller|agency|white[- ]label/, ['cpanel-reseller']],
  [/e-?mail|mailbox|workspace/, ['business-email']],
  [/\bssl\b|https|certificate/, ['ssl-certificates']],
  [/shared hosting|web hosting|website|domain|dns|nameserver|hosting/, H],
];
type Group = { key: string; label: string; products: TProduct[] };

function productGroups(cat: Catalog, post: BlogPost): Group[] {
  const per = (p: TProduct) => fromPrice(p, cat.currency)?.amount ?? 1e9;
  // cheapest first, but one card per plan line before repeating it in another location ("Lite", "Lite USA"…)
  const base = (p: TProduct) => p.name.replace(/\s+(USA|US|UK|EU|MY|SG|Malaysia|Singapore|Europe|Germany|India)$/i, '').toLowerCase();
  const sort = (ps: TProduct[]) => {
    const byPrice = available(ps).sort((a, b) => per(a) - per(b) || a.sortOrder - b.sortOrder);
    const seen = new Set<string>(); const first: TProduct[] = [], rest: TProduct[] = [];
    for (const p of byPrice) (seen.has(base(p)) ? rest : (seen.add(base(p)), first)).push(p);
    return [...first, ...rest];
  };
  const catName = (slug: string) => categoryBySlug(cat, slug)?.name || slug;
  const groups: Group[] = [];
  const add = (key: string, label: string, ps: TProduct[]) => {
    const seen = new Set(groups.flatMap((g) => g.products.map((p) => p.id)));
    const list = ps.filter((p) => !seen.has(p.id));
    if (list.length) groups.push({ key, label, products: list });
  };
  if (post.relatedProducts.length) {
    const singles: TProduct[] = [];
    for (const ref of post.relatedProducts) {
      const [kind, slug] = ref.split(':');
      if (kind === 'cat') add(slug, catName(slug), sort(productsFor(cat, [slug])));
      else { const p = productBySlug(cat, slug); if (p) singles.push(p); }
    }
    if (singles.length) groups.unshift({ key: 'picked', label: 'Our picks', products: singles.filter((p, i, a) => a.indexOf(p) === i) });
  } else {
    const text = `${post.category} ${post.tags.join(' ')} ${post.title}`.toLowerCase();
    for (const [re, slugs] of TOPICS) {
      if (groups.length >= 2) break;
      if (!re.test(text)) continue;
      const ps = sort(productsFor(cat, slugs));
      const first = slugs.find((sl) => productsFor(cat, [sl]).length) || slugs[0];
      add(first, slugs === H ? 'Web hosting' : catName(first), ps);
    }
    if (!groups.length) add('hosting', 'Web hosting', sort(productsFor(cat, H)));
  }
  return groups.map((g) => ({ ...g, products: g.products.slice(0, 4) }));
}

/** First pick of each group, then the rest, for the compact mid-article block. */
function topPicks(groups: Group[], n: number) {
  const out: TProduct[] = [];
  for (let i = 0; out.length < n && groups.some((g) => g.products[i]); i++) for (const g of groups) if (g.products[i] && out.length < n) out.push(g.products[i]);
  return out;
}

function recoBlock(cat: Catalog, picks: TProduct[]) {
  if (!picks.length) return '';
  const cards = picks.map((p) => {
    const specs = deriveSpecs(p.features, p.attributes);
    const keys = [specs.cpu, specs.ram, specs.storage].filter(Boolean) as string[];
    const feats = (keys.length >= 2 ? keys : p.features.filter((f) => f.trim() && !f.trim().startsWith('-')).slice(0, 3));
    const price = fromText(p, cat.currency);
    return `<li class="bl-pick">
      <p class="bl-pick__cat">${esc(categoryOf(cat, p))}</p>
      <h3 class="bl-pick__name"><a href="/p/${esc(p.slug)}">${esc(p.name)}</a></h3>
      ${feats.length ? `<ul class="bl-pick__feat">${feats.map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}
      <div class="bl-pick__foot">
        <p class="bl-pick__price">${price ? `<span>From</span> <b class="num">${esc(price)}</b>` : `<a href="${esc(orderUrl(p, cat.base))}">See price</a>`}</p>
        <a class="hp-btn hp-btn--brand bl-pick__btn" href="${esc(orderUrl(p, cat.base))}" aria-label="Order ${esc(p.name)}">Order</a>
      </div>
    </li>`;
  }).join('');
  return `<aside class="bl-reco" aria-labelledby="bl-reco-h">
  <div class="bl-reco__head"><p class="bl-reco__kick">${icon('star')}Recommended for this topic</p><h2 id="bl-reco-h" class="bl-reco__h">Put this guide into practice</h2></div>
  <ul class="bl-picks bl-picks--n${picks.length}">${cards}</ul>
  <p class="bl-reco__note">${icon('info')}Prices from our billing system, in ${esc(cat.currency)}.</p>
</aside>`;
}
const categoryOf = (cat: Catalog, p: TProduct) => cat.categories.find((c) => c.id === p.categoryId)?.name || 'Plan';

/** Insert the recommendation block after the 2nd H2 section (before the 3rd H2), else before the last H2, else at the end. */
function withReco(html: string, block: string) {
  if (!block) return html;
  const at: number[] = []; const re = /<h2 /g; let m: RegExpExecArray | null;
  while ((m = re.exec(html))) at.push(m.index);
  const i = at.length >= 3 ? at[2] : at.length === 2 ? at[1] : -1;
  return i < 0 ? html + block : html.slice(0, i) + block + html.slice(i);
}

function plansSection(cat: Catalog, groups: Group[]) {
  const all = groups.flatMap((g) => g.products);
  if (!all.length) return '';
  const names: Record<string, string> = {};
  const keyOf = new Map<string, string>();
  for (const g of groups) for (const p of g.products) { keyOf.set(p.id, g.key); names[g.key] = g.label; }
  const tagged = all.map((p) => ({ ...p, categoryId: keyOf.get(p.id) || p.categoryId }));
  const cards = planCards(tagged, { currency: cat.currency, base: cat.base, id: 'bl-plans', highlight: 'auto',
    ...(groups.length > 1 ? { groupBy: 'category', categoryNames: names, groupLabel: 'Plan type' } : {}) });
  return `<section class="hp-section hp-section--tint bl-plans" aria-labelledby="bl-plans-h"><div class="hp-container">
    ${sectionHead({ id: 'bl-plans-h', title: 'Plans that fit', lead: 'Hand-picked for this article. Every plan comes with engineers on call around the clock.' })}
    ${cards}
    ${plansNote(cat.currency)}
  </div></section>`;
}

/* ------------------------------------------------------------------ roadmap + trust */
const ROAD_LABEL: Record<string, string> = { planned: 'Planned', in_progress: 'In progress', launched: 'Launched' };
const ROAD_ICON: Record<string, string> = { planned: 'calendar', in_progress: 'refresh', launched: 'check' };
function roadmapSection(cat: Catalog, o: { tint?: boolean } = {}) {
  const items = roadmapFrom(cat.settings.roadmap);
  if (!items.length) return '';
  return `<section class="hp-section bl-road${o.tint ? ' hp-section--tint' : ''}" aria-labelledby="bl-road-h"><div class="hp-container">
    ${sectionHead({ id: 'bl-road-h', title: 'What’s coming next', lead: 'New services and improvements our team is working on.' })}
    <ol class="bl-road__list bl-road__list--n${Math.min(items.length, 4)}">${items.map((it) => `<li class="bl-road__item is-${it.status}" data-reveal>
      <span class="bl-road__dot" aria-hidden="true">${icon(ROAD_ICON[it.status])}</span>
      <div class="bl-road__card">
        <p class="bl-road__meta"><span class="bl-road__status">${ROAD_LABEL[it.status]}</span>${it.eta ? `<span class="bl-road__eta">${icon('clock')}${esc(it.eta)}</span>` : ''}</p>
        <h3>${esc(it.title)}</h3>
        ${it.description ? `<p>${esc(it.description)}</p>` : ''}
      </div>
    </li>`).join('')}</ol>
  </div></section>`;
}

function trustStrip(cat: Catalog) {
  const pts = trustPointsFrom(cat.settings.trust_points);
  const ICONS = ['headset', 'bolt', 'globe', 'shield', 'archive', 'lock', 'drive', 'transfer'];
  return `<section class="bl-trust hp-on-dark" aria-labelledby="bl-trust-h"><div class="hp-container">
    <h2 id="bl-trust-h">What you get with ${esc(cat.settings.site_name || 'Globalhostia')}</h2>
    <ul class="bl-trust__list">${pts.map((t, i) => `<li>${hexIcon(t.icon && ICON_NAMES.includes(t.icon) ? t.icon : ICONS[i % ICONS.length])}<div><b>${esc(t.title)}</b>${t.text ? `<span>${esc(t.text)}</span>` : ''}</div></li>`).join('')}</ul>
  </div></section>`;
}

function chips(cats: ReturnType<typeof blogCategories>, active?: string) {
  if (!cats.length) return '';
  const a = (label: string, href: string, on: boolean, n?: number) =>
    `<li><a class="bl-cat${on ? ' is-on' : ''}" href="${esc(href)}"${on ? ' aria-current="page"' : ''}>${esc(label)}${n !== undefined ? `<span class="num">${n}</span>` : ''}</a></li>`;
  return `<nav class="bl-cats" aria-label="Blog categories"><ul>${a('All articles', '/blog', !active)}${cats.map((c) => a(c.name, `/blog/category/${c.slug}`, active === c.slug, c.count)).join('')}</ul></nav>`;
}

function pager(cur: number, pages: number, base: string) {
  if (pages <= 1) return '';
  const href = (n: number) => (n <= 1 ? base : `${base}?page=${n}`);
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - cur) <= 1) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
  return `<nav class="bl-pager" aria-label="Pagination">
  ${cur > 1 ? `<a class="bl-pager__step" href="${esc(href(cur - 1))}" rel="prev">${icon('left')}<span>Newer</span></a>` : '<span class="bl-pager__step is-off" aria-hidden="true">' + icon('left') + '<span>Newer</span></span>'}
  <ol>${nums.map((n) => n === '…' ? '<li><span class="bl-pager__gap">…</span></li>' : n === cur ? `<li><span class="bl-pager__n is-on" aria-current="page"><span class="sr-only">Page </span>${n}</span></li>` : `<li><a class="bl-pager__n" href="${esc(href(n))}"><span class="sr-only">Page </span>${n}</a></li>`).join('')}</ol>
  ${cur < pages ? `<a class="bl-pager__step" href="${esc(href(cur + 1))}" rel="next"><span>Older</span>${icon('right')}</a>` : '<span class="bl-pager__step is-off" aria-hidden="true"><span>Older</span>' + icon('right') + '</span>'}
</nav>`;
}

function empty(o: { category?: boolean }) {
  return `<div class="hp-empty bl-empty">${hexIcon('pen')}<h2>${o.category ? 'No articles in this category yet' : 'Our first articles are on the way'}</h2>
  <p>${o.category ? 'Browse all articles, or find step-by-step answers in the help center.' : 'We are writing guides on hosting, domains and servers. In the meantime, the help center has answers to the most common questions.'}</p>
  <div class="hp-actions">${o.category ? button({ label: 'All articles', href: '/blog' }) : ''}${button({ label: 'Visit the help center', href: '/help-center', variant: o.category ? 'ghost' : 'brand' })}</div></div>`;
}

const cta = () => ctaBand({ id: 'blog-cta', title: 'Ready to put this into practice?', text: 'Fast NVMe hosting, VPS and dedicated servers with engineers on call around the clock.',
  primary: { label: 'See hosting plans', href: '/web-hosting' }, secondary: { label: 'Talk to our team', href: '/contact' } });

/* ------------------------------------------------------------------ index / category */
async function listing(ctx: PageCtx, categorySlug?: string, tagSlug?: string): Promise<BlogResult> {
  const [cat, all] = await Promise.all([getCatalog(), getPosts()]);
  const site = siteOf(cat);
  const cats = blogCategories(all);
  const tag = tagSlug ? blogTags(all).find((t) => t.slug === tagSlug) : undefined;
  if (tagSlug && !tag) return notFound(ctx, cat);
  const current = categorySlug ? cats.find((c) => c.slug === categorySlug) : tag ? { ...tag, name: `#${tag.name}` } : undefined;
  if (categorySlug && !current) return notFound(ctx, cat);
  const posts = tag ? all.filter((p) => p.tagLinks.some((t) => t.slug === tag.slug)) : current ? all.filter((p) => p.categorySlug === current.slug) : all;
  const base = tag ? `/blog/tag/${tag.slug}` : current ? `/blog/category/${current.slug}` : '/blog';
  const pageNo = Math.max(1, parseInt(ctx.query.get('page') || '1', 10) || 1);

  // page 1: a featured post (newest featured, else newest) above the grid
  const feat = pageNo === 1 && posts.length ? posts.find((p) => p.featured) || posts[0] : undefined;
  const rest = posts.filter((p) => p !== feat);
  const pages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  if (pageNo > pages) return notFound(ctx, cat);
  const slice = rest.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE);

  const crumbs = current ? [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: current.name }] : [{ label: 'Home', href: '/' }, { label: 'Blog' }];
  const title = current ? current.name : BLOG_TITLE;
  const lead = tag ? `${tag.count} article${tag.count === 1 ? '' : 's'} tagged “${tag.name}” from the Globalhostia team.` : current ? `${current.count} article${current.count === 1 ? '' : 's'} on ${current.name.toLowerCase()} from the Globalhostia team.` : BLOG_LEAD;
  const hero = pageHero({ eyebrow: tag ? 'Blog tag' : current ? 'Blog category' : 'Globalhostia blog', title, lead, crumbs, network: false, id: 'blog-top' });

  const grid = slice.length ? `<div class="bl-grid bl-grid--n${Math.min(slice.length, 3)}">${slice.map((p) => card(p, feat ? 3 : 2)).join('')}</div>` : '';
  const body = posts.length ? `${feat ? featuredCard(feat) : ''}
    ${grid ? `${feat ? '<h2 class="bl-more-h">More articles</h2>' : ''}${grid}` : ''}
    ${pager(pageNo, pages, base)}` : empty({ category: !!current });

  const main = `${hero}
<section class="hp-section bl-list" aria-label="Articles"><div class="hp-container">
  <div class="bl-toolbar">${chips(cats, tag ? undefined : current?.slug)}<a class="bl-rss" href="/blog/rss.xml">${icon('rss')}RSS feed</a></div>
  ${body}
</div></section>
${roadmapSection(cat, { tint: true })}
${cta()}`;

  const path = base + (pageNo > 1 ? `?page=${pageNo}` : '');
  const listLd = ld({ '@context': 'https://schema.org', '@type': 'Blog', name: `${cat.settings.site_name || 'Globalhostia'} blog`, url: site + base, description: lead,
    blogPost: [...(feat ? [feat] : []), ...slice].map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: site + postPath(p.slug), datePublished: iso(p.date), ...(p.coverImage ? { image: absUrl(site, p.coverImage) } : {}) })) });
  const html = await page({
    ctx, catalog: cat, path, title: current ? `${current.name} articles` + (pageNo > 1 ? ` (page ${pageNo})` : '') : 'Blog' + (pageNo > 1 ? ` (page ${pageNo})` : ''),
    description: lead, css: ['blog'], js: ['blog'], jsonLd: [listLd, breadcrumbJsonLd(crumbs.map((c, i) => (i === crumbs.length - 1 ? { label: c.label, href: base } : c)), site)],
    headExtra: `<link rel="alternate" type="application/rss+xml" title="${esc(cat.settings.site_name || 'Globalhostia')} blog" href="${esc(site)}/blog/rss.xml">`,
    preload: feat?.coverImage ? [feat.coverImage] : undefined, bodyClass: 'bl-page', body: main,
    noindex: (tag && tag.count < 3) || !posts.length ? true : undefined, // thin tag pages and empty listings stay out of the index
  });
  return { status: 200, body: html };
}

/* ------------------------------------------------------------------ article */
function shareLinks(url: string, title: string) {
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  const items: [string, string, string][] = [
    ['xlogo', 'Share on X', `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
    ['linkedin', 'Share on LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['facebook', 'Share on Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['whatsapp', 'Share on WhatsApp', `https://wa.me/?text=${t}%20${u}`],
    ['mail', 'Share by email', `mailto:?subject=${t}&body=${u}`],
  ];
  return `<div class="bl-share"><span class="bl-share__h">Share</span><ul>${items.map(([ic, label, href]) =>
    `<li><a href="${esc(href)}"${href.startsWith('mailto:') ? '' : ' target="_blank" rel="noopener noreferrer"'} aria-label="${esc(label)}" title="${esc(label)}">${icon(ic)}</a></li>`).join('')}
    <li><button type="button" data-copy="${esc(url)}" aria-label="Copy link" title="Copy link">${icon('copy')}</button></li></ul><span class="bl-share__ok" role="status" aria-live="polite"></span></div>`;
}

function toc(items: { id: string; text: string }[], o: { mobile?: boolean } = {}) {
  if (items.length < 2) return '';
  const list = `<ol>${items.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ol>`;
  return o.mobile
    ? `<details class="bl-toc bl-toc--m"><summary>${icon('menu')}In this article<span class="num">${items.length} sections</span>${icon('chev')}</summary>${list}</details>`
    : `<nav class="bl-toc" aria-label="In this article"><p class="bl-aside-h">In this article</p>${list}</nav>`;
}

function ctaBox(cat: Catalog, picks: TProduct[]) {
  const rows = picks.slice(0, 2).map((p) => {
    const price = fromText(p, cat.currency);
    return `<li><a href="/p/${esc(p.slug)}">${icon('server')}<span><b>${esc(p.name)}</b>${price ? `<span class="bl-cta__from">from <b class="num">${esc(price)}</b></span>` : ''}</span>${icon('arrow')}</a></li>`;
  }).join('');
  return `<aside class="bl-ctabox" aria-labelledby="bl-cta-a">
  <p class="bl-ctabox__kick">${icon('server')}Globalhostia</p>
  <h2 id="bl-cta-a">Host it with engineers on call 24/7</h2>
  <p>Free SSL, daily backups and automatic setup. We help you move in.</p>
  ${rows ? `<ul>${rows}</ul>` : `<ul><li><a href="/web-hosting">${icon('globe')}<span><b>Web hosting</b></span>${icon('arrow')}</a></li></ul>`}
</aside>`;
}

async function article(ctx: PageCtx, slug: string): Promise<BlogResult> {
  const [cat, all, post] = await Promise.all([getCatalog(), getPosts(), getPost(slug, ctx.preview)]);
  if (!post) return notFound(ctx, cat);
  const site = siteOf(cat);
  const url = site + postPath(post.slug);
  const { html: bodyHtml, toc: tocItems } = renderMarkdown(post.body);
  const live = post.status === 'PUBLISHED' && (!post.publishAt || Date.parse(post.publishAt) <= Date.now());
  const crumbs = [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, ...(post.category ? [{ label: post.category, href: `/blog/category/${post.categorySlug}` }] : []), { label: post.title }];
  const related = relatedPosts(all, post, 3);
  const updated = Date.parse(post.updatedAt) - Date.parse(post.date) > 86400000;
  const author = post.author || 'Globalhostia Team';
  const initials = author.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  const image = absUrl(site, post.ogImage || post.coverImage);

  const groups = productGroups(cat, post);
  const faqs = faqFromMarkdown(post.body);
  const picks = topPicks(groups, 3);

  const banner = live ? '' : `<div class="bl-preview" role="status">${icon('eye')}<span><b>Preview.</b> ${post.status === 'PUBLISHED' && post.publishAt ? `Scheduled for ${esc(fmtPostDate(post.publishAt))}.` : `This post is ${esc(post.status.toLowerCase())}.`} Only signed-in admins can see this page.</span></div>`;

  const brief = post.excerpt || post.takeaways.length ? `<aside class="bl-brief" aria-labelledby="bl-brief-h">
      <p class="bl-brief__kick">${icon('book')}<span id="bl-brief-h">What this article explains</span></p>
      ${post.excerpt ? `<p class="bl-brief__lead">${esc(post.excerpt)}</p>` : ''}
      ${post.takeaways.length ? `<p class="bl-brief__h">Key takeaways</p><ul class="bl-brief__list">${post.takeaways.map((t) => `<li>${icon('check')}<span>${esc(t)}</span></li>`).join('')}</ul>` : ''}
    </aside>` : '';

  const head = `<header class="bl-hero"><div class="hp-container">
    ${banner}
    ${breadcrumbs(crumbs, { light: true })}
    <div class="bl-hero__grid${brief ? '' : ' is-solo'}">
      <div class="bl-hero__main">
        ${post.category ? `<a class="bl-hero__cat" href="/blog/category/${esc(post.categorySlug)}">${esc(post.category)}</a>` : ''}
        <h1 class="bl-title">${esc(post.title)}</h1>
        <div class="bl-byline">
          <span class="bl-avatar" aria-hidden="true">${esc(initials || 'G')}</span>
          <div><p class="bl-author">${esc(author)}</p>
          <p class="bl-meta"><time datetime="${esc(iso(post.date))}">${esc(fmtPostDate(post.date))}</time><span aria-hidden="true">·</span><span>${post.readingMinutes} min read</span>${updated ? `<span aria-hidden="true">·</span><span>Updated <time datetime="${esc(iso(post.updatedAt))}">${esc(fmtPostDate(post.updatedAt))}</time></span>` : ''}</p></div>
        </div>
      </div>
      ${brief}
    </div>
  </div></header>`;

  const coverFig = post.coverImage ? `<div class="hp-container"><figure class="bl-cover">${cover(post, { w: 1600, h: 900, eager: true, sizes: '(min-width: 1440px) 1360px, 100vw' })}</figure></div>` : '';

  const tags = post.tagLinks.length ? `<ul class="bl-tags" aria-label="Tags">${post.tagLinks.map((t) => `<li><a href="/blog/tag/${esc(t.slug)}">${esc(t.name)}</a></li>`).join('')}</ul>` : '';
  const bodySec = `<div class="hp-container bl-layout">
    <div class="bl-main">
      ${toc(tocItems, { mobile: true })}
      <div class="bl-prose">${withReco(bodyHtml, recoBlock(cat, picks))}</div>
      <footer class="bl-foot">${tags}${shareLinks(url, post.title)}</footer>
    </div>
    <aside class="bl-aside" aria-label="Article tools">
      <div class="bl-aside__sticky">${toc(tocItems)}${shareLinks(url, post.title)}${ctaBox(cat, picks)}</div>
    </aside>
  </div>`;

  const rel = related.length ? `<section class="hp-section bl-related" aria-labelledby="rel-h"><div class="hp-container">
    <div class="bl-related__head"><h2 id="rel-h" class="hp-hline">Keep reading</h2>${link('All articles', '/blog')}</div>
    <div class="bl-grid">${related.map((p) => card(p)).join('')}</div>
  </div></section>` : '';

  const main = `<div class="bl-readbar" aria-hidden="true"><span></span></div><article class="bl-article">${head}${coverFig}<div class="bl-body">${bodySec}</div></article>${plansSection(cat, groups)}${trustStrip(cat)}${roadmapSection(cat)}${rel}`;

  const postLd = ld({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title.slice(0, 110), description: post.seoDescription || post.excerpt,
    ...(image ? { image: [image] } : {}), datePublished: iso(post.date), dateModified: iso(post.updatedAt),
    author: { '@type': post.author ? 'Person' : 'Organization', name: author }, publisher: { '@type': 'Organization', '@id': `${site}/#organization`, name: 'GlobalHostia', url: `${site}/`, logo: { '@type': 'ImageObject', url: `${site}/image/logo-main-black.png` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.canonical || url }, url, wordCount: post.body.split(/\s+/).length, ...(post.category ? { articleSection: post.category } : {}), ...(post.keywords.length ? { keywords: post.keywords.join(', ') } : {}),
  });
  const headExtra = [
    `<meta property="article:published_time" content="${esc(iso(post.date))}">`, `<meta property="article:modified_time" content="${esc(iso(post.updatedAt))}">`,
    post.category ? `<meta property="article:section" content="${esc(post.category)}">` : '', ...post.tags.map((t) => `<meta property="article:tag" content="${esc(t)}">`),
    `<link rel="alternate" type="application/rss+xml" title="${esc(cat.settings.site_name || 'Globalhostia')} blog" href="${esc(site)}/blog/rss.xml">`,
  ].join('');

  const html = await page({
    ctx, catalog: cat, path: postPath(post.slug), title: post.seoTitle || post.title, description: post.seoDescription || post.excerpt,
    canonical: post.canonical || undefined, ogType: 'article', ogImage: image || undefined, headExtra, noindex: !live,
    css: ['blog'], js: ['blog'], jsonLd: [postLd, ...(faqs.length ? [faqJsonLd(faqs)] : []), breadcrumbJsonLd(crumbs.map((c, i) => (i === crumbs.length - 1 ? { label: c.label, href: postPath(post.slug) } : c)), site)],
    preload: post.coverImage ? [post.coverImage] : undefined, bodyClass: 'bl-page bl-page--article', body: main,
  });
  return { status: 200, body: html, cache: live };
}

/* ------------------------------------------------------------------ 404 + rss */
async function notFound(ctx: PageCtx, cat?: Catalog): Promise<BlogResult> {
  cat = cat || await getCatalog();
  const body = `${pageHero({ eyebrow: 'Blog', title: 'We could not find that article', lead: 'It may have been moved or unpublished. Browse the latest articles or search the help center.', crumbs: [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog' }, { label: 'Not found' }], ctas: [{ label: 'All articles', href: '/blog' }, { label: 'Help center', href: '/help-center', variant: 'ghost' }], network: false })}`;
  const html = await page({ ctx, catalog: cat, path: ctx.path, title: 'Article not found', description: 'This article could not be found.', css: ['blog'], noindex: true, body });
  return { status: 404, body: html, cache: false };
}

const xml = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function rss(): Promise<BlogResult> {
  const [cat, posts] = await Promise.all([getCatalog(), getPosts()]);
  const site = siteOf(cat);
  const name = String(cat.settings.site_name || 'Globalhostia');
  const items = posts.slice(0, 30).map((p) => {
    const img = absUrl(site, p.coverImage);
    return `<item><title>${xml(p.title)}</title><link>${xml(site + postPath(p.slug))}</link><guid isPermaLink="true">${xml(site + postPath(p.slug))}</guid><pubDate>${new Date(p.date).toUTCString()}</pubDate>${p.category ? `<category>${xml(p.category)}</category>` : ''}<description>${xml(p.excerpt)}</description>${img ? `<enclosure url="${xml(img)}" length="0" type="image/${/\.png$/i.test(img) ? 'png' : /\.webp$/i.test(img) ? 'webp' : 'jpeg'}"/>` : ''}</item>`;
  }).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xml(name)} blog</title>
<link>${xml(site)}/blog</link>
<description>${xml(BLOG_LEAD)}</description>
<language>en</language>
<atom:link href="${xml(site)}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${posts[0] ? `<lastBuildDate>${new Date(posts[0].date).toUTCString()}</lastBuildDate>` : ''}
${items}
</channel>
</rss>`;
  return { status: 200, body, type: 'application/rss+xml; charset=utf-8', cache: true };
}

/** Route /blog/* (segments after "blog"). */
export async function renderBlog(rest: string[], ctx: PageCtx): Promise<BlogResult> {
  const r = rest.map((s) => s.toLowerCase());
  if (r.length === 0) return listing(ctx);
  if (r.length === 1 && r[0] === 'rss.xml') return rss();
  if (r.length === 2 && r[0] === 'category') return listing(ctx, r[1]);
  if (r.length === 2 && r[0] === 'tag') return listing(ctx, undefined, r[1]);
  if (r.length === 1 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(r[0])) return article(ctx, r[0]);
  return notFound(ctx);
}

/** Theme-module signature (used if /blog is ever listed in ROUTES). */
export default async function render(ctx: PageCtx): Promise<string | null> {
  const out = await renderBlog(ctx.slug.split('/').slice(1), ctx);
  return out.status === 200 ? out.body : null;
}
