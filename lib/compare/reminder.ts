// Monthly reminder to re-verify the "GlobalHostia vs <host>" facts (called from the daily content-engine cron step,
// lib/content/engine.ts runContentCron). Emails the owner at most once every 30 days while any live page has a
// fact older than STALE_DAYS. The last send is kept in settings.compare_reminder_at.
import 'server-only';
import { getSettings, setSetting } from '../settings';
import { emailOwner } from '../support-notify';
import { visibleCompetitors, staleItems, checkedRange, longDate, FACT_LABEL, STALE_DAYS } from './competitors';

const MONTH = 30 * 86_400_000;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Which live pages need re-verifying, and whether a reminder is due (pure, for tests). */
export function reminderDue(settings: Record<string, unknown>, now = Date.now()) {
  const stale = visibleCompetitors(settings).map((c) => ({ c, st: staleItems(c, now) })).filter((x) => x.st.any);
  const last = Date.parse(String(settings.compare_reminder_at || '')) || 0;
  return { stale, due: stale.length > 0 && now - last >= MONTH };
}

/** Sends the email when due. Returns the number of pages listed (0 when nothing was sent). */
export async function compareReminder(now = Date.now()): Promise<number> {
  const s = await getSettings();
  const { stale, due } = reminderDue(s, now);
  if (!due) return 0;
  const site = String(s.site_url || 'https://globalhostia.com').replace(/\/$/, '');
  const rows = stale.map(({ c, st }) => `<li style="margin:0 0 8px"><b>${esc(c.name)}</b><br><span style="color:#667085;font-size:13px">${esc(st.facts.map((k) => FACT_LABEL[k]).join(', ') || 'strengths')} · oldest check ${esc(longDate(checkedRange(c).oldest))}</span></li>`).join('');
  const html = `<div style="margin:0 auto;max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#101828">
<h2 style="font-size:20px;margin:0 0 8px">Re-verify ${stale.length} comparison page${stale.length === 1 ? '' : 's'}</h2>
<p style="color:#475467;font-size:14px;margin:0 0 16px">These "GlobalHostia vs" pages show facts about other providers that were last checked more than ${STALE_DAYS} days ago. Open each source, update anything that changed, then press "Mark re-verified" (or hide the page).</p>
<ul style="padding-left:18px;font-size:14px;line-height:1.45">${rows}</ul>
<a href="${esc(site)}/admin/compare" style="display:inline-block;margin-top:12px;padding:12px 18px;background:#101828;color:#fff;text-decoration:none;border-radius:10px;font-weight:600">Review competitor pages</a>
</div>`;
  const r = await emailOwner(`Re-verify ${stale.length} comparison page${stale.length === 1 ? '' : 's'}`, html);
  if (!r.ok) return 0;
  await setSetting('compare_reminder_at', new Date(now).toISOString());
  return stale.length;
}
