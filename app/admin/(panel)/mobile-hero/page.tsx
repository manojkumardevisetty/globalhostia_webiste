import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Flash, fmtDate } from '@/components/ui';
import { toDubaiLocal } from '@/lib/promo';
import { normalize } from '@/lib/mobile-hero';
import { getCatalog, pricedTlds, currencyPrefix } from '@/lib/theme/data';
import { priceCtx } from '@/lib/theme/mobile-hero';
import HeroForm, { type Prices } from './HeroForm';
import { resetMobileHero } from './actions';

export const metadata = { title: 'Mobile hero' };

export default async function MobileHeroAdmin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('content');
  const sp = await searchParams;
  const [settings, cat] = await Promise.all([getSettings(), getCatalog()]);
  const h = normalize(settings.mobile_hero);
  const initial = { ...h, slides: h.slides.map((x) => ({ ...x, start: toDubaiLocal(x.start), end: toDubaiLocal(x.end) })) };
  // live prices (default currency) so the preview resolves tokens exactly as the website does
  const ctx = priceCtx(cat);
  const prices: Prices = {
    currency: cat.currency, prefix: currencyPrefix(cat) || '$',
    tlds: Object.fromEntries(pricedTlds(cat).map((t) => [t.tld.toLowerCase(), { register: t.register, renew: t.renew, transfer: t.transfer, promo: t.promo || '' }])),
    from: Object.fromEntries(['hosting', 'email', 'vps', 'dedicated', ...cat.categories.map((c) => c.slug)].map((k) => [k, ctx.from(k)])),
  };
  return (
    <>
      <PageHeader title="Mobile hero" desc={<>The carousel card at the top of the homepage on phones (up to 767px wide), under the dark header and the domain search bar. Desktop keeps the full-width hero. Prices in headlines come from the synced WHMCS pricing via tokens, so they always match checkout.{h.updatedAt ? <> Last saved {fmtDate(h.updatedAt)}.</> : null}</>}
        actions={<form action={resetMobileHero}><button className="btn btn-secondary h-10">Restore default slides</button></form>} />
      <Flash sp={sp} />
      <HeroForm initial={initial} prices={prices} />
    </>
  );
}
