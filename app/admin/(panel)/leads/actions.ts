'use server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { setSetting } from '@/lib/settings';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/leads';

const back = (fd: FormData, fallback: string) => { const b = str(fd, 'back'); return /^\/admin\/leads(\/[\w-]+)?(\?[^\s]*)?$/.test(b) ? b : fallback; };

/** Status change (list row or detail page). */
export async function setLeadStatus(fd: FormData) {
  const s = await requireSession('commerce');
  const id = str(fd, 'id'), status = str(fd, 'status') as LeadStatus;
  const to = back(fd, '/admin/leads');
  if (!LEAD_STATUSES.includes(status)) fail(to, 'Unknown status');
  const [cur] = await db.select({ status: schema.leads.status, email: schema.leads.email }).from(schema.leads).where(eq(schema.leads.id, id));
  if (!cur) fail('/admin/leads', 'Lead not found');
  if (cur.status === status) done(to, 'No changes');
  await db.update(schema.leads).set({ status, updatedAt: new Date() }).where(eq(schema.leads.id, id));
  await audit(s, 'status', 'lead', id, { from: cur.status, to: status, email: cur.email });
  done(to, `Lead marked ${status}`);
}

/** Status + notes from the detail page. */
export async function saveLead(fd: FormData) {
  const s = await requireSession('commerce');
  const id = str(fd, 'id');
  const to = `/admin/leads/${encodeURIComponent(id)}`;
  const status = str(fd, 'status') as LeadStatus;
  const notes = String(fd.get('notes') ?? '').replace(/\r\n/g, '\n').trim().slice(0, 5000);
  const name = str(fd, 'name').slice(0, 80);
  if (!LEAD_STATUSES.includes(status)) fail(to, 'Unknown status');
  const [cur] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  if (!cur) fail('/admin/leads', 'Lead not found');
  const changed: Record<string, unknown> = {};
  if (cur.status !== status) changed.status = { from: cur.status, to: status };
  if (cur.notes !== notes) changed.notes = { from: cur.notes.slice(0, 500), to: notes.slice(0, 500) };
  if (cur.name !== name) changed.name = { from: cur.name, to: name };
  if (!Object.keys(changed).length) done(to, 'No changes');
  await db.update(schema.leads).set({ status, notes, name, updatedAt: new Date() }).where(eq(schema.leads.id, id));
  await audit(s, 'update', 'lead', id, { email: cur.email, ...changed });
  done(to, 'Lead saved');
}

/** Permanently delete a lead (e.g. on an erasure request). */
export async function deleteLead(fd: FormData) {
  const s = await requireSession('commerce');
  const id = str(fd, 'id');
  const [cur] = await db.select({ email: schema.leads.email, source: schema.leads.source }).from(schema.leads).where(eq(schema.leads.id, id));
  if (!cur) fail('/admin/leads', 'Lead not found');
  await db.delete(schema.leads).where(eq(schema.leads.id, id));
  await audit(s, 'delete', 'lead', id, { source: cur.source, email_domain: cur.email.split('@')[1] || '' });
  done('/admin/leads', 'Lead deleted');
}

/** Footer sign-up form on/off (settings.lead_footer). */
export async function setFooterForm(fd: FormData) {
  const s = await requireSession('commerce');
  const on = str(fd, 'on') === '1';
  await setSetting('lead_footer', on);
  await audit(s, on ? 'enable' : 'disable', 'settings', 'lead_footer');
  done('/admin/leads', `Footer sign-up form ${on ? 'shown' : 'hidden'} on the website`);
}
