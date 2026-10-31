import 'server-only';
import { ROUTES, PRODUCT_ROUTE, type RouteDef } from './routes';

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
};

/** Returns themed HTML, or null when this URL isn't part of the theme (caller falls back to the original theme). */
export async function renderTheme(segs: string[], c: { path: string; preview: boolean; query: URLSearchParams }) {
  const isProduct = segs[0] === 'p' && segs.length === 2;
  const slug = isProduct ? segs[1].toLowerCase() : segs.length ? segs.join('/').toLowerCase() : 'index';
  const route = isProduct ? PRODUCT_ROUTE : ROUTES[slug];
  if (!route || !MODULES[route.kind]) return null;
  const mod = await MODULES[route.kind]();
  return mod.default({ slug, path: c.path, preview: c.preview, query: c.query, route });
}
