'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { normalizeUsage, METRICS } from '@/lib/cx/usage-core';
import { loadUsageConfig, saveUsageConfig, runUsageAlerts } from '@/lib/cx/usage';

const P = '/admin/usage-alerts';

/** Customer alerts on / off (the portal meters and the Upgrade button work either way). */
export async function setAlerts(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadUsageConfig();
  const on = str(fd, 'on') === '1';
  await saveUsageConfig({ ...cfg, enabled: on });
  await audit(s, on ? 'usage_alerts_on' : 'usage_alerts_off', 'usage_alerts', null);
  done(P, on ? 'Usage alerts are ON: the daily run emails customers whose hosting crosses a threshold.' : 'Usage alerts are OFF. Customers still see their usage and can upgrade in the portal.');
}

export async function saveSettings(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadUsageConfig();
  const warn = Number(str(fd, 'warn')), critical = Number(str(fd, 'critical'));
  if (!(warn >= 50 && warn <= 98) || !(critical > warn && critical <= 100)) fail(`${P}?tab=settings`, 'Thresholds: warning between 50 and 98 %, critical above the warning and at most 100 %.');
  const metrics = Object.fromEntries(METRICS.map((k) => [k, bool(fd, `m_${k}`)]));
  const copy = {
    en: { subject: str(fd, 'en_subject'), subjectCritical: str(fd, 'en_subject_crit'), intro: str(fd, 'en_intro') },
    ar: { subject: str(fd, 'ar_subject'), subjectCritical: str(fd, 'ar_subject_crit'), intro: str(fd, 'ar_intro') },
  };
  const next = normalizeUsage({ ...cfg, warn, critical, email: bool(fd, 'email'), push: bool(fd, 'push'), checklist: bool(fd, 'checklist'), metrics, copy });
  await saveUsageConfig(next);
  await audit(s, 'update', 'usage_alerts', 'settings', next);
  done(`${P}?tab=settings`, 'Usage alert settings saved');
}

export async function runNow(fd: FormData) {
  const s = await requireSession('commerce');
  const dry = str(fd, 'dry') === '1';
  const r = await runUsageAlerts('admin', { deadlineMs: 50_000, dry });
  await audit(s, 'usage_alerts_run', 'usage_alerts', null, r);
  if (r.stopped) fail(P, `Not run: ${r.stopped}`);
  if (!r.ok) fail(P, `Run failed: ${r.error || 'see logs'}`);
  done(P, `${dry ? 'Dry run' : 'Run'} finished: ${r.services} hosting service(s), ${r.measured} read from the panel, ${r.alerts} alert(s) ${dry ? 'would be sent' : 'sent'}${r.deadline ? '. Time budget reached: the rest follow in the next run' : ''}.`);
}
