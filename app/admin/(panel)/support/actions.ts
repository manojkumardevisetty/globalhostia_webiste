'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { whmcs } from '@/lib/whmcs';
import { checkTickets, sendTestNotification, supportSettings } from '@/lib/support-notify';

export async function replyTicket(fd: FormData) {
  const s = await requireSession('commerce');
  const id = parseInt(str(fd, 'id'), 10);
  const back = `/admin/support/${id}`;
  if (!id) fail('/admin/support', 'Ticket not found');
  const message = String(fd.get('message') ?? '').trim();
  if (message.length < 2) fail(back, 'Write a reply before sending.');
  if (message.length > 20000) fail(back, 'Reply is too long (max 20,000 characters).');
  const status = str(fd, 'status');
  const cfg = await supportSettings();
  if (!cfg.adminUsername) fail(back, 'Set the WHMCS admin username in Support settings first, so the reply is sent as you.');
  try {
    await whmcs('AddTicketReply', { ticketid: id, message, adminusername: cfg.adminUsername, markdown: false, status: status && status !== 'keep' ? status : undefined });
  } catch (e: any) { fail(back, `WHMCS did not accept the reply: ${e.message}`); }
  await audit(s, 'ticket_reply', 'support', String(id));
  done(back, 'Reply sent — the customer gets the usual WHMCS email.');
}

export async function setTicketStatus(fd: FormData) {
  const s = await requireSession('commerce');
  const id = parseInt(str(fd, 'id'), 10);
  const status = str(fd, 'status');
  const back = `/admin/support/${id}`;
  if (!id || !status || status.length > 60) fail('/admin/support', 'Choose a status');
  try { await whmcs('UpdateTicket', { ticketid: id, status }); } catch (e: any) { fail(back, `Status not changed: ${e.message}`); }
  await audit(s, 'ticket_status', 'support', String(id), { status });
  done(back, `Status set to ${status}`);
}

export async function saveSupportSettings(fd: FormData) {
  const s = await requireSession('settings');
  const cid = str(fd, 'support_notify_clientid');
  if (!/^\d{1,9}$/.test(cid) || Number(cid) < 1) fail('/admin/support', 'Notify client ID must be a WHMCS client ID number, e.g. 1');
  const admin = str(fd, 'support_admin_username');
  if (admin && !/^[\w.@+-]{1,64}$/.test(admin)) fail('/admin/support', 'Admin username: letters, digits and . _ @ + - only (your WHMCS admin login name)');
  await setSetting('support_notify_clientid', Number(cid));
  await setSetting('support_admin_username', admin);
  await audit(s, 'update', 'support_settings', null, { clientId: Number(cid), admin });
  done('/admin/support', 'Support settings saved');
}

export async function sendTest() {
  const s = await requireSession('commerce');
  let cid = 0;
  try { cid = await sendTestNotification(); } catch (e: any) { fail('/admin/support', `Test email failed: ${e.message}`); }
  await audit(s, 'test_notification', 'support', String(cid));
  done('/admin/support', `Test email sent to WHMCS client #${cid}. Check that inbox (and spam).`);
}

export async function checkNow() {
  const s = await requireSession('commerce');
  const r = await checkTickets('admin-manual');
  await audit(s, 'check_tickets', 'support', null, r);
  if (r.skipped === 'busy') done('/admin/support', 'A check is already running — try again in a few seconds.');
  if (!r.ok) fail('/admin/support', `Check failed: ${r.error || r.skipped}`);
  done('/admin/support', `Checked ${r.checked ?? 0} waiting tickets · ${r.notified ?? 0} email(s) sent${r.failed ? ` · ${r.failed} failed` : ''}`);
}
