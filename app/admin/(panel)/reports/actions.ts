'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { normalizeReport, MONTH_RE } from '@/lib/cx/report-core';
import { loadReportConfig, saveReportConfig, runReports, sendTest } from '@/lib/cx/report-engine';

const P = '/admin/reports';

export async function setReportSwitch(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadReportConfig();
  const on = str(fd, 'on') === '1';
  await saveReportConfig({ ...cfg, enabled: on });
  await audit(s, on ? 'site_report_on' : 'site_report_off', 'reports', null);
  done(P, on ? 'Monthly site report emails are ON. The next ones go out from the 1st of next month (Dubai time).' : 'Monthly site report emails are OFF. Customers can still see their report in the portal.');
}

export async function saveReportSettings(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadReportConfig();
  const next = normalizeReport({ ...cfg, windowDays: Number(str(fd, 'window_days')), perRun: Number(str(fd, 'per_run')), productTips: bool(fd, 'product_tips') });
  await saveReportConfig(next);
  await audit(s, 'update', 'reports', 'settings', next);
  done(`${P}?tab=settings`, 'Site report settings saved');
}

export async function sendReportTest(fd: FormData) {
  const s = await requireSession('commerce');
  const cid = Number(str(fd, 'cid')), month = str(fd, 'm'), lang = str(fd, 'lang') === 'ar' ? 'ar' : str(fd, 'lang') === 'en' ? 'en' : undefined;
  const back = `${P}?tab=preview&cid=${cid || ''}&m=${encodeURIComponent(month)}`;
  if (!(cid > 0) || !MONTH_RE.test(month)) fail(back, 'Choose a client ID and a month first');
  let r: Awaited<ReturnType<typeof sendTest>>;
  try { r = await sendTest(cid, month, lang); } catch (e: any) { fail(back, `Test not sent: ${e?.message || e}`); }
  await audit(s, 'site_report_test', 'reports', String(cid), { month, to: r.to, via: r.via });
  done(back, `Test report for client #${cid} (${month}) sent to ${r.to} via ${r.via === 'smtp' ? 'SMTP' : 'WHMCS'}.`);
}

export async function runReportsNow() {
  const s = await requireSession('commerce');
  const r = await runReports('admin', { deadlineMs: 50_000 });
  await audit(s, 'site_report_run', 'reports', null, r);
  if (r.stopped) fail(`${P}?tab=log`, `Not run: ${r.stopped === 'outside-window' ? 'reports are only sent during the window at the start of the month' : r.stopped}`);
  if (!r.ok) fail(`${P}?tab=log`, `Run failed: ${r.error || 'see logs'}`);
  done(`${P}?tab=log`, `Run finished for ${r.month}: ${r.sent} sent, ${r.failed} failed, ${r.due ?? 0} due of ${r.queued ?? 0} customers.`);
}
