'use server';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { fromDubaiLocal } from '@/lib/promo';
import { normalize, validate, DEFAULT_MOBILE_HERO, type MobileHero } from '@/lib/mobile-hero';

const PATH = '/admin/mobile-hero';

/** The form posts the whole config as JSON (`data`); slide dates arrive as Asia/Dubai local "YYYY-MM-DDTHH:mm". */
export async function saveMobileHero(fd: FormData) {
  const s = await requireSession('content');
  let raw: any;
  try { raw = JSON.parse(String(fd.get('data') ?? '')); } catch { fail(PATH, 'Could not read the form, please try again'); }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.slides)) fail(PATH, 'Could not read the form, please try again');
  for (const x of raw.slides) {
    if (!x || typeof x !== 'object') continue;
    for (const f of ['start', 'end'] as const) {
      const v = String(x[f] ?? '');
      if (v && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) fail(PATH, 'Dates must be in the form YYYY-MM-DD HH:MM');
      x[f] = fromDubaiLocal(v);
    }
  }
  const next: MobileHero = { ...normalize(raw), updatedAt: new Date().toISOString() };
  const errors = validate(next);
  if (errors.length) fail(PATH, errors.join(' · '));
  const prev = normalize((await getSettings()).mobile_hero);
  await setSetting('mobile_hero', next);
  await saveRevision(s, 'mobile_hero', 'mobile_hero', prev);
  await audit(s, 'update', 'mobile_hero', null, { slides: next.slides.length, enabled: next.enabled, before: prev, after: next });
  done(PATH, 'Mobile hero saved — live on phones within a minute');
}

/** Put the three seeded slides back (the previous version stays in the revision history). */
export async function resetMobileHero() {
  const s = await requireSession('content');
  const prev = normalize((await getSettings()).mobile_hero);
  await setSetting('mobile_hero', { ...DEFAULT_MOBILE_HERO, updatedAt: new Date().toISOString() });
  await saveRevision(s, 'mobile_hero', 'mobile_hero', prev);
  await audit(s, 'reset', 'mobile_hero', null, { before: prev });
  done(PATH, 'Default slides restored');
}
