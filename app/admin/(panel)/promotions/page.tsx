import { requireSession } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import { PageHeader, Card, Flash, Badge, fmtDate } from '@/components/ui';
import { whmcs, whmcsConfigured } from '@/lib/whmcs';
import { normalize, status, toDubaiLocal, type Status } from '@/lib/promo';
import PromoForm from './PromoForm';
import { togglePromotion } from './actions';

export const metadata = { title: 'Promotions' };

const TONE: Record<Status, string> = { live: 'green', scheduled: 'blue', ended: 'gray', off: 'gray' };
const LABEL: Record<Status, string> = { live: 'Live', scheduled: 'Scheduled', ended: 'Ended', off: 'Off' };

async function whmcsCoupons(): Promise<{ codes: string[]; error: string }> {
  if (!whmcsConfigured()) return { codes: [], error: '' };
  try {
    const r: any = await Promise.race([whmcs('GetPromotions'), new Promise((_, rej) => setTimeout(() => rej(new Error('WHMCS did not answer in time')), 5000))]);
    return { codes: (r.promotions?.promotion ?? []).map((p: any) => String(p.code).toUpperCase()).filter(Boolean), error: '' };
  } catch (e: any) { return { codes: [], error: e?.message || 'WHMCS error' }; }
}

export default async function Promotions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireSession('content');
  const sp = await searchParams;
  const [settings, coupons] = await Promise.all([getSettings(), whmcsCoupons()]);
  const p = normalize(settings.promotions);
  const local = <T extends { start: string; end: string }>(x: T): T => ({ ...x, start: toDubaiLocal(x.start), end: toDubaiLocal(x.end) });
  const initial = { bar: local(p.bar), popup: local(p.popup), welcome: local(p.welcome) };
  const items = [
    { key: 'bar', title: 'Announcement bar', desc: 'Thin bar above the top menu', x: p.bar },
    { key: 'popup', title: 'Pop-up ad', desc: 'Offer window for all or new visitors', x: p.popup },
    { key: 'welcome', title: 'Welcome offer', desc: 'Preset pop-up for first-time visitors', x: p.welcome },
  ] as const;
  const where = (w: string) => (w === 'both' ? 'Website + client area' : w === 'clientarea' ? 'Client area' : 'Website');

  return (
    <>
      <PageHeader title="Promotions" desc={<>Announcement bar and pop-up offers for the website and the client area. Changes go live within a minute; coupons must exist in WHMCS (Billing → Promotions) to work at checkout.{p.updatedAt ? <> Last saved {fmtDate(p.updatedAt)}.</> : null}</>} />
      <Flash sp={sp} />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {items.map(({ key, title, desc, x }) => {
          const st = status(x);
          return (
            <section key={key} className="card flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold text-slate-900">{title}</h2><Badge tone={TONE[st]}>{LABEL[st]}</Badge></div>
                <p className="mt-1 text-xs text-slate-500">{desc} · {where(x.where)}</p>
                {(x.start || x.end) && <p className="mt-1 text-xs text-slate-500">{x.start ? `From ${fmtDate(x.start)}` : ''}{x.start && x.end ? ' · ' : ''}{x.end ? `Until ${fmtDate(x.end)}` : ''}</p>}
              </div>
              <form action={togglePromotion} className="shrink-0">
                <input type="hidden" name="key" value={key} /><input type="hidden" name="on" value={x.enabled ? '0' : '1'} />
                <button className={`btn h-9 ${x.enabled ? 'btn-secondary' : 'btn-primary'}`}>{x.enabled ? 'Turn off' : 'Turn on'}</button>
              </form>
            </section>
          );
        })}
      </div>
      {coupons.error && <Card className="mb-6"><p className="text-sm text-amber-700">Could not load coupons from WHMCS ({coupons.error}). You can still type a code; make sure it exists in WHMCS.</p></Card>}
      <PromoForm initial={initial} coupons={coupons.codes} whmcs={whmcsConfigured()} />
    </>
  );
}
