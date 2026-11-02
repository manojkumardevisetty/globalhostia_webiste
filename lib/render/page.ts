// Assembles a complete HTML document for a CMS page: shared blocks + ordered sections.
import 'server-only';
import { and, eq, inArray, asc, or, isNull, lte, ne } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { db, schema } from '../db';
import { getSettings, type Settings } from '../settings';
import { renderProducts, type RProduct, type RCategory } from './products';
import { domainSearchForm, domainResults, tldTable, faq } from './domains';
import { esc, tokens } from './util';
import { compileDesign } from '../design';
import { ICON_LINKS, ROBOTS_NOINDEX, NOINDEX_SLUGS, siteJsonLd, verificationMeta, ogImageUrl, siteUrl } from '../seo';

async function loadPage(slug: string, preview: boolean) {
  const [page] = await db.select().from(schema.pages).where(eq(schema.pages.slug, slug)).limit(1);
  if (!page) return null;
  const now = new Date();
  if (!preview && (page.status !== 'PUBLISHED' || (page.publishAt && page.publishAt > now))) return null;
  const secs = await db.select().from(schema.sections).where(eq(schema.sections.pageId, page.id)).orderBy(asc(schema.sections.sortOrder));
  const keys = [page.headBlock, page.bodyStartBlock, page.headerBlock, page.footerBlock, page.bodyEndBlock].filter(Boolean);
  const blocks = Object.fromEntries((await db.select().from(schema.blocks).where(inArray(schema.blocks.key, keys))).map((b) => [b.key, b.html]));

  // products for dynamic sections
  const catSlugs = [...new Set(secs.filter((s) => s.type === 'products').flatMap((s) => (s.data.categories as string[]) || (s.data.category ? [s.data.category] : [])))];
  let cats: RCategory[] = [], prods: RProduct[] = [];
  if (catSlugs.length) {
    cats = await db.select().from(schema.categories).where(and(inArray(schema.categories.slug, catSlugs), preview ? undefined : eq(schema.categories.visible, true)));
    if (cats.length) {
      const rows = await db.select().from(schema.products).where(and(
        inArray(schema.products.categoryId, cats.map((c) => c.id)),
        preview ? ne(schema.products.status, 'ARCHIVED') : eq(schema.products.status, 'PUBLISHED'),
        eq(schema.products.whmcsRetired, false),
        preview ? undefined : or(isNull(schema.products.publishAt), lte(schema.products.publishAt, now)),
      )).orderBy(asc(schema.products.sortOrder), asc(schema.products.name));
      const prices = rows.length ? await db.select().from(schema.productPrices).where(inArray(schema.productPrices.productId, rows.map((r) => r.id))) : [];
      const cur = (await getSettings()).currency || 'USD';
      const headline = (id: string) => { const p = prices.filter((x) => x.productId === id && x.currency === cur); const m = p.find((x) => x.cycle === 'monthly') || p[0]; return m ? parseFloat(String(m.price)) / Math.max(1, ({ quarterly: 3, semiannually: 6, annually: 12, biennially: 24, triennially: 36 } as Record<string, number>)[m.cycle] || 1) : 1e9; };
      // admin sort order first, then cheapest first (natural pricing ladder)
      prods = rows.map((r) => ({ ...r, features: r.features || [], attributes: r.attributes || {}, prices: prices.filter((p) => p.productId === r.id) }))
        .sort((a, b) => a.sortOrder - b.sortOrder || headline(a.id) - headline(b.id));
    }
  }
  const needTlds = secs.some((s) => ['domain_results', 'tld_pricing'].includes(s.type));
  const tlds = needTlds ? await db.select().from(schema.tlds) : [];
  return { page, secs, blocks, cats, prods, tlds };
}

const cachedPage = unstable_cache((slug: string) => loadPage(slug, false), ['page', process.env.VERCEL_GIT_COMMIT_SHA || 'dev'], { tags: ['site'], revalidate: 3600 });

export async function renderPage(slug: string, opts: { preview: boolean; query: URLSearchParams; ip: string; path: string }) {
  const data = opts.preview ? await loadPage(slug, true) : await cachedPage(slug);
  if (!data) return null;
  const s = await getSettings();
  const { page, secs, blocks, cats, prods, tlds } = data;
  const base = (s.whmcs_base_url || process.env.WHMCS_BASE_URL || 'https://globalhostia.com/secure').replace(/\/$/, '');
  const vars: Record<string, string> = {
    site_name: s.site_name, phone: s.phone, email: s.email, company: s.company, year: String(new Date().getFullYear()),
    whmcs_url: base, cart_url: `${base}/cart.php`, login_url: `${base}/clientarea.php`, register_url: `${base}/register.php`,
  };
  const pctx = { currency: s.currency || 'USD', defaultCycle: s.default_cycle || 'auto', orderLabel: s.order_button_label || 'Order Now', cartBase: base };
  const q = (opts.query.get('domain') || '').slice(0, 80);

  const parts: string[] = [];
  for (const sec of secs) {
    if (!sec.visible && !opts.preview) continue;
    let h = '';
    switch (sec.type) {
      case 'html': h = sec.html; break;
      case 'products': {
        const slugs: string[] = sec.data.categories || (sec.data.category ? [sec.data.category] : []);
        const sc = slugs.map((x) => cats.find((c) => c.slug === x)).filter(Boolean) as RCategory[];
        h = renderProducts(sec.data, sec.id, sc, prods, pctx) ?? sec.data.fallbackHtml ?? '';
        break;
      }
      case 'domain_search': h = domainSearchForm(sec.data.action || opts.path, sec.data, q); break;
      case 'domain_results': h = await domainResults(q, tlds as any, s.domain_suggest_tlds || [], opts.ip, sec.data); break;
      case 'tld_pricing': h = tldTable(tlds as any, sec.data); break;
      case 'faq': h = faq(sec.data); break;
    }
    if (!sec.visible) h = `<div style="outline:2px dashed #f59e0b;opacity:.55" title="Hidden section (preview only)">${h}</div>`;
    parts.push(opts.preview ? `<!-- section ${sec.id} (${esc(sec.type)}) -->\n${h}` : h);
  }

  const url = `${(s.site_url || '').replace(/\/$/, '')}${slug === 'index' ? '/' : '/' + slug}`;
  const title = page.seoTitle || page.title;
  const ogImg = page.ogImage || (slug === 'index' ? `${siteUrl(s)}/og/default.png` : ogImageUrl(siteUrl(s), page.title || title));
  const seo = `<title>${esc(title)}</title>
<meta name="description" content="${esc(page.seoDescription)}" />${page.seoKeywords ? `\n<meta name="keywords" content="${esc(page.seoKeywords)}" />` : ''}
<link rel="canonical" href="${esc(url)}" />
${NOINDEX_SLUGS.has(slug) ? `<meta name="robots" content="${ROBOTS_NOINDEX}" />\n` : ''}<meta property="og:type" content="website" /><meta property="og:locale" content="en_AE" /><meta property="og:url" content="${esc(url)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(page.seoDescription)}" /><meta property="og:image" content="${esc(ogImg)}" />
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" /><meta name="twitter:description" content="${esc(page.seoDescription)}" /><meta name="twitter:image" content="${esc(ogImg)}" />
`;
  const previewBar = opts.preview ? `<div class="gh-preview-bar"><span>Preview — ${esc(page.status)}${page.status !== 'PUBLISHED' ? ' (not public)' : ''}. Hidden sections are outlined.</span><a href="/admin/pages/${page.id}">Back to editor →</a></div>` : '';
  return shell({ page, blocks, s, vars, seo, body: parts.join('\n'), extra: previewBar, look: opts.query.get('look') || undefined });
}

export function siteVars(s: Settings) {
  const base = (s.whmcs_base_url || process.env.WHMCS_BASE_URL || 'https://globalhostia.com/secure').replace(/\/$/, '');
  return {
    base,
    vars: { site_name: s.site_name, phone: s.phone, email: s.email, company: s.company, year: String(new Date().getFullYear()),
      whmcs_url: base, cart_url: `${base}/cart.php`, login_url: `${base}/clientarea.php`, register_url: `${base}/register.php` } as Record<string, string>,
  };
}

/** Wraps body HTML in the site's real head / header / footer blocks of a given page record. */
/** Animated section background: 'off' | 'auto' (palette picked per page) | palette name. */
export const AMBIENT = ['brand', 'ocean', 'dusk', 'mint', 'violet', 'sunrise'] as const;
function ambient(v: unknown, key: string): number | null {
  if (v === 'off' || v === false) return null;
  const i = AMBIENT.indexOf(v as any);
  if (i >= 0) return i;
  let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % AMBIENT.length;
}

export function shell(o: { page: { headBlock: string; bodyStartBlock: string; headerBlock: string; footerBlock: string; bodyEndBlock: string; headExtra: string; bodyClass: string; wrapperClass: string };
  blocks: Record<string, string>; s: Settings; vars: Record<string, string>; seo: string; body: string; extra?: string; ambKey?: string; look?: string }) {
  const { page, blocks, s, vars } = o;
  const amb = ambient(s.design?.ambient, o.ambKey || (page as any).slug || 'index');
  // site "look" layer on top of the original theme: from Design settings, or ?look=a|b|c to preview one
  const look = ['a', 'b', 'c', 'off'].includes(o.look || '') ? o.look : (s.design?.look || 'off');
  const T = (h?: string) => tokens(h || '', vars);
  const design = compileDesign(s.design || {});
  return `<!DOCTYPE html>
<html lang="en"${amb === null ? '' : ` data-gh-amb="${amb}"`}${look !== 'off' ? ` class="gh-look gh-look-${look}"` : ''}>
<head>
${T(blocks[page.headBlock])}
${o.seo}
${verificationMeta(s)}${ICON_LINKS}
${siteJsonLd(s, siteVars(s).base)}
${T(page.headExtra)}
<link rel="stylesheet" href="/gh/site.css" />
${s.design?.polish === false ? '' : '<link rel="stylesheet" href="/gh/polish.css" />'}${look !== 'off' ? '<link rel="stylesheet" href="/gh/look.css" />' : ''}
${design.fontsHref ? `<link rel="stylesheet" href="${esc(design.fontsHref)}" />` : ''}${design.css ? `<style id="gh-design">${design.css}</style>` : ''}
${s.custom_head || ''}${s.custom_css ? `<style id="gh-custom">${s.custom_css}</style>` : ''}
</head>
<body${page.bodyClass ? ` class="${esc(page.bodyClass)}"` : ''}>
${T(blocks[page.bodyStartBlock])}
<div class="${esc(page.wrapperClass)}">
${T(blocks[page.headerBlock])}
${T(o.body)}
${T(blocks[page.footerBlock])}
</div>
${T(blocks[page.bodyEndBlock])}
<script src="/gh/products.js" defer></script>
${o.extra || ''}
</body>
</html>`;
}
