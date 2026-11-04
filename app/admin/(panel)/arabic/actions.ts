'use server';
import { requireSession, audit, saveRevision } from '@/lib/session';
import { done, fail, str, bust } from '@/lib/admin';
import { getSettings, setSetting } from '@/lib/settings';
import { AR_DEFS, AR_SETTINGS_KEY, normalizeCopy, overrideKey, type ArCopy, type ArOverrides } from '@/lib/i18n/ar-pages';

const PATH = '/admin/arabic';
const back = (k: string) => `${PATH}?p=${encodeURIComponent(k)}`;

/** "icon | heading | text" per line → points; "question || answer" per line → FAQs. */
function parsePoints(t: string) {
  return t.split(/\r?\n/).map((l) => l.split('|').map((x) => x.trim())).filter((x) => x.length >= 3 && x[1] && x[2]).map(([icon, h, ...p]) => ({ icon: icon || 'check', h, p: p.join(' | ') }));
}
function parseFaqs(t: string) {
  return t.split(/\r?\n/).map((l) => l.split('||').map((x) => x.trim())).filter((x) => x.length >= 2 && x[0] && x[1]).map(([q, ...a]) => ({ q, a: a.join(' ') }));
}

export async function saveArabicPage(fd: FormData) {
  const s = await requireSession('content');
  const key = str(fd, 'page');
  const def = AR_DEFS.find((d) => overrideKey(d) === key);
  if (!def) fail(PATH, 'Unknown page');
  const raw: Partial<ArCopy> = {
    title: str(fd, 'title'), seoTitle: str(fd, 'seoTitle'), meta: str(fd, 'meta'), kicker: str(fd, 'kicker'), lead: str(fd, 'lead'), crumb: str(fd, 'crumb'),
    keywords: str(fd, 'keywords').split(/[,،\n]/).map((x) => x.trim()).filter(Boolean),
    pointsTitle: str(fd, 'pointsTitle'), points: parsePoints(String(fd.get('points') ?? '')),
    faqTitle: str(fd, 'faqTitle'), faqs: parseFaqs(String(fd.get('faqs') ?? '')),
    ctaTitle: str(fd, 'ctaTitle'), ctaText: str(fd, 'ctaText'), enabled: fd.get('enabled') === 'on',
  };
  const copy = normalizeCopy(raw, def!.copy);
  if (copy.seoTitle.length > 60) fail(back(key), `The SEO title is ${copy.seoTitle.length} characters; keep it to 60 or fewer.`);
  if (copy.meta.length < 70 || copy.meta.length > 160) fail(back(key), `The meta description is ${copy.meta.length} characters; keep it between 70 and 160.`);
  if (/\d+[.,]\d{2}\s*(AED|SAR|USD|\$|درهم|ريال)|(AED|SAR|USD|\$)\s*\d/.test([copy.title, copy.lead, copy.meta, ...copy.faqs.map((f) => f.a), ...copy.points.map((p) => p.p)].join(' ')))
    fail(back(key), 'Please do not type prices in the copy: the page adds live prices from the billing system.');
  const settings = await getSettings();
  const prev: ArOverrides = settings[AR_SETTINGS_KEY] && typeof settings[AR_SETTINGS_KEY] === 'object' ? settings[AR_SETTINGS_KEY] : {};
  const next: ArOverrides = { ...prev, [key]: copy };
  await saveRevision(s, AR_SETTINGS_KEY, key, prev[key] || null);
  await setSetting(AR_SETTINGS_KEY, next);
  await audit(s, 'update', AR_SETTINGS_KEY, key, { enabled: copy.enabled });
  bust();
  done(back(key), 'Arabic page saved: live within a minute');
}

/** Back to the built-in copy for one page (the edited version stays in the revision history). */
export async function resetArabicPage(fd: FormData) {
  const s = await requireSession('content');
  const key = str(fd, 'page');
  const settings = await getSettings();
  const prev: ArOverrides = settings[AR_SETTINGS_KEY] && typeof settings[AR_SETTINGS_KEY] === 'object' ? { ...settings[AR_SETTINGS_KEY] } : {};
  if (prev[key]) await saveRevision(s, AR_SETTINGS_KEY, key, prev[key]);
  delete prev[key];
  await setSetting(AR_SETTINGS_KEY, prev);
  await audit(s, 'reset', AR_SETTINGS_KEY, key);
  bust();
  done(back(key), 'Default Arabic copy restored');
}
