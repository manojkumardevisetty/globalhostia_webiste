// Products offered in the WHMCS cart ("Complete your setup", public/hp/whmcs.js via /api/store/links).
import { fromPrice, type Catalog, type TProduct } from './data';
import { available } from './ui';

/** Admin-chosen product (Admin → Site links), else the cheapest orderable product of the family. */
export function offerProduct(cat: Catalog, family: string, chosen: string): TProduct | null {
  const ok = (p?: TProduct) => !!p && !!p.whmcsPid;
  const pick = chosen ? cat.products.find((p) => p.slug === chosen) : undefined;
  if (ok(pick)) return pick!;
  // a zero or missing price is a placeholder (free/unconfigured in WHMCS), never an offer
  const per = (p: TProduct) => fromPrice(p, cat.currency)?.amount ?? 0;
  const ps = available(cat.products.filter((p) => p.type === family && ok(p) && per(p) > 0));
  return [...ps].sort((a, b) => per(a) - per(b))[0] || null;
}
