'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { normalizeRatings, reviewUrl } from '@/lib/cx/ratings-core';
import { loadRatingsConfig, saveRatingsConfig, setEnabled, runRatings, sendTestRequest } from '@/lib/cx/ratings-engine';

const P = '/admin/ratings';

export async function setRatingsSwitch(fd: FormData) {
  const s = await requireSession('settings');
  const on = str(fd, 'on') === '1';
  await setEnabled(on);
  await audit(s, on ? 'ratings_on' : 'ratings_off', 'ratings', null);
  done(P, on ? 'Rating requests are ON. Tickets closed from now on get one “How did we do?” email; tickets that were already closed are never asked.' : 'Rating requests are OFF. Ratings already given stay visible here and on the tickets.');
}

export async function saveRatingsSettings(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadRatingsConfig();
  const g = str(fd, 'google'), tp = str(fd, 'trustpilot');
  if (g && !reviewUrl(g, 'google')) fail(`${P}?tab=settings`, 'Google review link: use the https link from your Google Business Profile (“Ask for reviews” → share link, e.g. https://g.page/r/…/review).');
  if (tp && !reviewUrl(tp, 'trustpilot')) fail(`${P}?tab=settings`, 'Trustpilot link: use your https://www.trustpilot.com/evaluate/… or /review/… page.');
  const next = normalizeRatings({ ...cfg, googleUrl: g, trustpilotUrl: tp, excludeDepts: str(fd, 'exclude'), maxAgeDays: Number(str(fd, 'max_age')) });
  await saveRatingsConfig(next);
  await audit(s, 'update', 'ratings', 'settings', next);
  done(`${P}?tab=settings`, 'Rating settings saved');
}

export async function sendRatingTest(fd: FormData) {
  const s = await requireSession('commerce');
  const lang = str(fd, 'lang') === 'ar' ? 'ar' : 'en';
  let r: Awaited<ReturnType<typeof sendTestRequest>>;
  try { r = await sendTestRequest(lang); } catch (e: any) { fail(`${P}?tab=email`, `Test not sent: ${e?.message || e}`); }
  await audit(s, 'ratings_test', 'ratings', null, { lang, to: r.to });
  done(`${P}?tab=email&pl=${lang}`, `Test request sent to ${r.to} via ${r.via === 'smtp' ? 'SMTP' : 'WHMCS'}. Its score buttons open the rating page in demo mode.`);
}

export async function runRatingsNow() {
  const s = await requireSession('commerce');
  const r = await runRatings('admin', { deadlineMs: 45_000 });
  await audit(s, 'ratings_run', 'ratings', null, r);
  if (r.stopped) fail(`${P}?tab=requests`, `Not run: ${r.stopped}`);
  if (!r.ok) fail(`${P}?tab=requests`, `Run failed: ${r.error || 'see logs'}`);
  done(`${P}?tab=requests`, `Checked ${r.polled} closed ticket(s): ${r.queued} new to ask, ${r.sent} request(s) sent, ${r.failed} failed.`);
}
