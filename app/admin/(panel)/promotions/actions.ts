'use server';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { normalize, validate, fromDubaiLocal, type Promotions } from '@/lib/promo';

const PATH = '/admin/promotions';

/** Form posts the whole config as JSON (`data`); dates arrive as Asia/Dubai local "YYYY-MM-DDTHH:mm". */
export async function savePromotions(fd: FormData) {
  const s = await requireSession('content');
  let raw: any;
  try { raw = JSON.parse(String(fd.get('data') ?? '')); } catch { fail(PATH, 'Could not read the form, please try again'); }
  for (const k of ['bar', 'popup', 'welcome'] as const) {
    const x = raw?.[k];
    if (x && typeof x === 'object') {
      for (const f of ['start', 'end'] as const) {
        const v = String(x[f] ?? '');
        if (v && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) fail(PATH, 'Dates must be in the form YYYY-MM-DD HH:MM');
        x[f] = fromDubaiLocal(v);
      }
    }
  }
  const next: Promotions = { ...normalize(raw), updatedAt: new Date().toISOString() };
  const errors = validate(next);
  if (errors.length) fail(PATH, errors.join(' · '));
  const prev = normalize((await getSettings()).promotions);
  await setSetting('promotions', next);
  await saveRevision(s, 'promotions', 'promotions', prev);
  const changed = (['bar', 'popup', 'welcome'] as const).filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
  await audit(s, 'update', 'promotions', null, { changed, enabled: { bar: next.bar.enabled, popup: next.popup.enabled, welcome: next.welcome.enabled }, before: prev, after: next });
  done(PATH, changed.length ? `Promotions saved (${changed.join(', ')}) — live on the website within a minute` : 'No changes');
}

/** Quick on/off from the status cards. */
export async function togglePromotion(fd: FormData) {
  const s = await requireSession('content');
  const k = String(fd.get('key'));
  if (k !== 'bar' && k !== 'popup' && k !== 'welcome') fail(PATH, 'Unknown promotion');
  const on = fd.get('on') === '1';
  const cur = normalize((await getSettings()).promotions);
  const next: Promotions = { ...cur, [k]: { ...cur[k], enabled: on }, updatedAt: new Date().toISOString() };
  if (on) { const errors = validate(next); if (errors.length) fail(PATH, `Cannot enable yet: ${errors.join(' · ')}`); }
  await setSetting('promotions', next);
  await audit(s, on ? 'enable' : 'disable', 'promotions', k, { key: k });
  const label = k === 'bar' ? 'Announcement bar' : k === 'popup' ? 'Pop-up' : 'Welcome offer';
  done(PATH, `${label} ${on ? 'enabled' : 'disabled'}`);
}
