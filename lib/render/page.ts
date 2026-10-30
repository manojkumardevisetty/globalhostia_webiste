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
      prods = rows.map((r) => ({ ...r, features: r.features || [], attributes: r.attributes || {}, prices: prices.filter((p) => p.productId === r.id) }));
    }
  }
  const needTlds = secs.some((s) => ['domain_results', 'tld_pricing'].includes(s.type));
  const tlds = needTlds ? await db.select().from(schema.tlds) : [];
  return { page, secs, blocks, cats, prods, tlds };
}

const cachedPage = unstable_cache((slug: string) => loadPage(slug, false), ['page'], { tags: ['site'], revalidate: 3600 });

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
  const seo = `<title>${esc(title)}</title>
<meta name="description" content="${esc(page.seoDescription)}" />${page.seoKeywords ? `\n<meta name="keywords" content="${esc(page.seoKeywords)}" />` : ''}
<link rel="canonical" href="${esc(url)}" />
<meta property="og:url" content="${esc(url)}" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(page.seoDescription)}" />${page.ogImage ? `<meta property="og:image" content="${esc(page.ogImage)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(title)}" /><meta name="twitter:description" content="${esc(page.seoDescription)}" />
${slug === 'index' ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: s.site_name, url: s.site_url, telephone: s.phone, email: s.email, legalName: s.company }).replace(/</g, '\\u003c')}</script>` : ''}`;
  const T = (h?: string) => tokens(h || '', vars);
  const design = compileDesign(s.design || {});
  const previewBar = opts.preview ? `<div class="gh-preview-bar"><span>Preview — ${esc(page.status)}${page.status !== 'PUBLISHED' ? ' (not public)' : ''}. Hidden sections are outlined.</span><a href="/admin/pages/${page.id}">Back to editor →</a></div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
${T(blocks[page.headBlock])}
${seo}
${T(page.headExtra)}
<link rel="stylesheet" href="/gh/site.css" />
${design.fontsHref ? `<link rel="stylesheet" href="${esc(design.fontsHref)}" />` : ''}${design.css ? `<style id="gh-design">${design.css}</style>` : ''}
${s.custom_head || ''}${s.custom_css ? `<style id="gh-custom">${s.custom_css}</style>` : ''}
</head>
<body${page.bodyClass ? ` class="${esc(page.bodyClass)}"` : ''}>
${T(blocks[page.bodyStartBlock])}
<div class="${esc(page.wrapperClass)}">
${T(blocks[page.headerBlock])}
${parts.map(T).join('\n')}
${T(blocks[page.footerBlock])}
</div>
${T(blocks[page.bodyEndBlock])}
<script src="/gh/products.js" defer></script>
${previewBar}
</body>
</html>`;
}
