'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str, bool } from '@/lib/admin';
import { normalizeHealth, stageList, CHECKS, TEMPLATE_RE } from '@/lib/health/core';
import { loadHealthConfig, saveHealthConfig, runHealth, baseline } from '@/lib/health/engine';

const P = '/admin/health';

/** Kill switch (checks + alerts) and the alerts switch. Switching alerts on can baseline what is already open. */
export async function setSwitch(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadHealthConfig();
  const which = str(fd, 'which'), on = str(fd, 'on') === '1';
  if (which === 'enabled') {
    await saveHealthConfig({ ...cfg, enabled: on });
    await audit(s, on ? 'health_on' : 'health_off', 'health', null);
    done(P, on ? 'Domain health checks are ON.' : 'Kill switch: no checks and no alerts until you switch them on again.');
  }
  if (which === 'alerts') {
    let n = 0;
    if (on && bool(fd, 'baseline')) n = await baseline();
    await saveHealthConfig({ ...cfg, alerts: on });
    await audit(s, on ? 'health_alerts_on' : 'health_alerts_off', 'health', null, { baselined: n });
    done(P, on ? `Customer alerts are ON.${n ? ` ${n} problem(s) that were already open are treated as known: customers only hear about new or worse problems.` : ''}` : 'Customer alerts are OFF. Checks keep running; the portal still shows the results.');
  }
  fail(P, 'Unknown switch');
}

export async function saveSettings(fd: FormData) {
  const s = await requireSession('settings');
  const cfg = await loadHealthConfig();
  const tpl = str(fd, 'wa_template');
  if (tpl && !TEMPLATE_RE.test(tpl)) fail(`${P}?tab=settings`, 'WhatsApp template name: lowercase letters, digits and _ only (as approved in Meta)');
  const checks = Object.fromEntries(CHECKS.map((k) => [k, bool(fd, `check_${k}`)]));
  const next = normalizeHealth({
    ...cfg, checks, resolvedNotice: bool(fd, 'resolved'), push: bool(fd, 'push'),
    sslDays: stageList(str(fd, 'ssl_days'), cfg.sslDays, 0, 60), domainDays: stageList(str(fd, 'domain_days'), cfg.domainDays, 0, 120),
    recheckHours: Number(str(fd, 'recheck_hours')), concurrency: Number(str(fd, 'concurrency')), perRun: Number(str(fd, 'per_run')),
    timeouts: { dns: Number(str(fd, 't_dns')), tls: Number(str(fd, 't_tls')), http: Number(str(fd, 't_http')) },
    sources: { addon: bool(fd, 'src_addon'), alias: bool(fd, 'src_alias') },
    whatsapp: { enabled: bool(fd, 'wa_on'), template: tpl },
  });
  if (next.whatsapp.enabled && !next.whatsapp.template) fail(`${P}?tab=settings`, 'WhatsApp needs the approved template name (see the suggested text below).');
  await saveHealthConfig(next);
  await audit(s, 'update', 'health', 'settings', next);
  done(`${P}?tab=settings`, 'Domain health settings saved');
}

export async function runNow(fd: FormData) {
  const s = await requireSession('commerce');
  const sync = str(fd, 'sync') === '1';
  const r = await runHealth('admin', { deadlineMs: 50_000, limit: Number(str(fd, 'limit')) || 60, sync: sync || undefined });
  await audit(s, 'health_run', 'health', null, r);
  if (r.stopped) fail(P, `Not run: ${r.stopped}`);
  if (!r.ok) fail(P, `Run failed: ${r.error || 'see logs'}`);
  done(P, `Run finished: ${r.checked} domain(s) checked${r.synced ? ` (list updated: +${r.synced.added} / -${r.synced.removed})` : ''}, ${r.issues.critical} urgent and ${r.issues.warning} warning issue(s) found, ${r.alerts} alert(s) sent${r.deadline ? '. Time budget reached: the rest follow in the next runs' : ''}.`);
}
