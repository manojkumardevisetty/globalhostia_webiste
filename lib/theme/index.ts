import 'server-only';
import { ROUTES, PRODUCT_ROUTE, BLOG_ROUTE, dynamicRoute, type RouteDef } from './routes';

export type PageCtx = { slug: string; path: string; preview: boolean; query: URLSearchParams; route: RouteDef };
type PageFn = (ctx: PageCtx) => Promise<string | null>;

const MODULES: Record<string, () => Promise<{ default: PageFn }>> = {
  home: () => import('./pages/home'),
  hosting: () => import('./pages/hosting'),
  wordpress: () => import('./pages/wordpress'),
  reseller: () => import('./pages/reseller'),
  email: () => import('./pages/email'),
  vps: () => import('./pages/vps'),
  cloud: () => import('./pages/cloud'),
  dedicated: () => import('./pages/dedicated'),
  forex: () => import('./pages/forex'),
  ai: () => import('./pages/ai'),
  ssl: () => import('./pages/ssl'),
  domains: () => import('./pages/domains'),
  n8n: () => import('./pages/n8n'),
  projects: () => import('./pages/projects'),
  product: () => import('./pages/product'),
  auth: () => import('./pages/auth'),
  contact: () => import('./pages/contact'),
  content: () => import('./pages/content'),
  servers: () => import('./pages/servers'),
  blog: () => import('./pages/blog'),
  planfinder: () => import('./pages/planfinder'),
  migration: () => import('./pages/migration'),
  aedomains: () => import('./pages/aedomains'),
  datacenters: () => import('./pages/datacenters'),
  uae: () => import('./pages/uae'),
  learn: () => import('./pages/learn'),
  vs: () => import('./pages/vs'),
  tld: () => import('./pages/tld'),
  location: () => import('./pages/location'),
  usecase: () => import('./pages/usecase'),
  broker: () => import('./pages/broker'),
  category: () => import('./pages/category'),
  store: () => import('./pages/store'),
  premium: () => import('./pages/premium'),
  sell: () => import('./pages/sell'),
  ar: () => import('./pages/ar'),
};

/** Returns themed HTML, or null when this URL isn't part of the theme (caller falls back to the original theme). */
export async function renderTheme(segs: string[], c: { path: string; preview: boolean; query: URLSearchParams }) {
  const isProduct = segs[0] === 'p' && segs.length === 2;
  const slug = isProduct ? segs[1].toLowerCase() : segs.length ? segs.join('/').toLowerCase() : 'index';
  const route = isProduct ? PRODUCT_ROUTE : ROUTES[slug] || dynamicRoute(segs);
  if (!route || !MODULES[route.kind]) return null;
  const mod = await MODULES[route.kind]();
  return mod.default({ slug, path: c.path, preview: c.preview, query: c.query, route });
}

/** /blog/* — always rendered by the theme (status 404 for unknown or unpublished posts). */
export async function renderBlogRoute(segs: string[], c: { path: string; preview: boolean; query: URLSearchParams }) {
  const { renderBlog } = await import('./pages/blog');
  return renderBlog(segs.slice(1), { slug: segs.join('/').toLowerCase(), path: c.path, preview: c.preview, query: c.query, route: BLOG_ROUTE });
}
