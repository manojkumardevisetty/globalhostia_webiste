'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { normalizeSpam, senderEntry } from '@/lib/ai/spam-core';
import { spamConfig, saveSpamConfig, restoreSpam, confirmSpam, removeSpamSender, addSpamSender, weeklySummary } from '@/lib/ai/spam';
import { checkTickets } from '@/lib/support-notify';

const BACK = '/admin/assistant/spam';
const idOk = (v: string) => /^[\w-]{6,64}$/.test(v);

export async function saveSpam(fd: FormData) {
  const s = await requireSession('settings');
  const cur = await spamConfig();
  const v = normalizeSpam({
    ...cur,
    enabled: fd.get('enabled') === 'on', mode: str(fd, 'mode'), closeAt: str(fd, 'closeAt'), flagAt: str(fd, 'flagAt'),
    spamDeptId: str(fd, 'spamDeptId'), closeStatus: str(fd, 'closeStatus'),
    phrases: String(fd.get('phrases') || ''), blockSenders: String(fd.get('blockSenders') || ''), allowSenders: String(fd.get('allowSenders') || ''),
    autoBlock: fd.get('autoBlock') === 'on', whmcsBlock: fd.get('whmcsBlock') === 'on', weeklyEmail: fd.get('weeklyEmail') === 'on',
    perRun: str(fd, 'perRun'), maxAgeHours: str(fd, 'maxAgeHours'),
  });
  if (Number(str(fd, 'flagAt')) > Number(str(fd, 'closeAt'))) fail(BACK, 'The flag threshold must be below the auto-close threshold.');
  await saveSpamConfig(v);
  await audit(s, 'update', 'ai_spam', null, { enabled: v.enabled, mode: v.mode, closeAt: v.closeAt, flagAt: v.flagAt, spamDeptId: v.spamDeptId, closeStatus: v.closeStatus, phrases: v.phrases.length, block: v.blockSenders.length, allow: v.allowSenders.length });
  done(BACK, 'Spam filter settings saved');
}

export async function restoreTicket(fd: FormData) {
  const s = await requireSession('commerce');
  const id = str(fd, 'id');
  if (!idOk(id)) fail(BACK, 'Decision not found');
  let r!: Awaited<ReturnType<typeof restoreSpam>>;
  try { r = await restoreSpam(id, s.email); } catch (e: any) { fail(BACK, `Not restored: ${e?.message || e}`); }
  await audit(s, 'ai_spam_restore', 'support', String(r.ticketId), { decision: id, email: r.email, was: r.action });
  done(BACK, `Ticket #${r.tid || r.ticketId} restored${r.action === 'close' ? ' and reopened' : ''}; ${r.email || 'the sender'} is on the allowlist now.`);
}

export async function confirmTicket(fd: FormData) {
  const s = await requireSession('commerce');
  const id = str(fd, 'id');
  if (!idOk(id)) fail(BACK, 'Decision not found');
  let r!: Awaited<ReturnType<typeof confirmSpam>>;
  try { r = await confirmSpam(id, s.email); } catch (e: any) { fail(BACK, `Not closed: ${e?.message || e}`); }
  await audit(s, 'ai_spam_confirm', 'support', String(r.ticketId), { decision: id, email: r.email });
  done(BACK, `Ticket #${r.tid || r.ticketId} closed as spam. No reply was sent.`);
}

export async function removeSender(fd: FormData) {
  const s = await requireSession('settings');
  const id = str(fd, 'id');
  if (!idOk(id)) fail(BACK, 'Entry not found');
  await removeSpamSender(id);
  await audit(s, 'ai_spam_sender_remove', 'ai_spam', id, {});
  done(BACK, 'Removed from the list');
}

export async function addSender(fd: FormData) {
  const s = await requireSession('settings');
  const value = senderEntry(str(fd, 'value'));
  const list = str(fd, 'list') === 'allow' ? 'allow' : 'block';
  if (!value) fail(BACK, 'Enter an email address or a domain (example.com).');
  await addSpamSender({ value, kind: value.includes('@') ? 'email' : 'domain', list, source: 'owner', label: list === 'allow' ? 'legit' : 'junk' });
  await audit(s, 'ai_spam_sender_add', 'ai_spam', value, { list });
  done(BACK, `${value} added to the ${list === 'allow' ? 'allowlist' : 'blocklist'}`);
}

export async function runNow() {
  const s = await requireSession('commerce');
  const r = await checkTickets('admin-spam');
  await audit(s, 'ai_spam_run', 'ai_spam', null, { ok: r.ok });
  done(BACK, r.ok ? 'Checked the waiting tickets. New decisions are listed below.' : `Check finished with an error: ${r.error || r.skipped}`);
}

export async function sendWeekly() {
  const s = await requireSession('settings');
  const r: any = await weeklySummary(true);
  await audit(s, 'ai_spam_weekly_test', 'ai_spam', null, r);
  if (r?.ok === false) fail(BACK, `Not sent: ${r.error}`);
  done(BACK, 'Weekly summary sent to the owner email (Support settings).');
}
