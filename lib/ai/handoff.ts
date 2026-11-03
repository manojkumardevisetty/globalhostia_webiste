// "Talk to a human" from the website chat: stores a lead (Admin > Leads, source ai-chat), opens a Sales ticket in WHMCS
// with the transcript (guest OpenTicket, same as the free-migration form) and returns a WhatsApp link.
import 'server-only';
import { db, schema } from '../db';
import { whmcs, whmcsConfigured } from '../whmcs';
import { getSettings } from '../settings';
import { waLink } from '../theme/growth';
import { EMAIL, clean, normPhone } from '../leads';
import { redact } from './policy';
import { burst } from './server';
import type { AiSettings } from './settings-core';
import type { Msg } from './run';

export async function createHandoff(s: AiSettings, i: { name: string; email: string; phone: string; summary: string; transcript: Msg[]; page: string; ipHash: string; country: string }) {
  const email = clean(i.email, 160).toLowerCase(), name = clean(i.name, 80) || 'Website visitor', phone = normPhone(i.phone) || '';
  if (!EMAIL.test(email)) return { error: 'Ask for a valid email address.' };
  if (burst(`handoff:${i.ipHash}`, 3, 3600_000)) return { error: 'A request was already sent from this connection; the team will reply soon.' };
  const settings = await getSettings().catch(() => ({} as any));
  const summary = clean(i.summary, 600);
  const transcript = i.transcript.slice(-16).map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${redact(m.content).slice(0, 800)}`).join('\n\n');
  await db.insert(schema.leads).values({ email, name, phone, source: 'ai-chat', page: i.page.slice(0, 300), interest: summary, consent: true, ipHash: i.ipHash, country: i.country }).catch(() => {});
  let ticket = '';
  if (whmcsConfigured()) {
    try {
      let deptid = s.salesDeptId ? String(s.salesDeptId) : '';
      if (!deptid) {
        const r = await whmcs('GetSupportDepartments', { ignore_dept_assignments: true });
        const list = (Array.isArray(r.departments?.department) ? r.departments.department : r.departments?.department ? [r.departments.department] : []) as any[];
        const pick = list.find((d) => /sales|pre-?sales/i.test(d.name)) || list.find((d) => /support|tech/i.test(d.name)) || list[0];
        deptid = pick ? String(pick.id) : '';
      }
      if (deptid) {
        const r = await whmcs<{ id?: number; tid?: string }>('OpenTicket', {
          deptid, subject: `Website chat: ${summary.slice(0, 120) || 'visitor wants to talk to sales'}`, name, email, priority: 'Medium', markdown: false,
          message: [`A visitor asked the website assistant for a person.`, '', `Name: ${name}`, `Email: ${email}`, `Phone / WhatsApp: ${phone || '-'}`, `Page: ${i.page || '-'}`, `Country: ${i.country || '-'}`, '', `Summary: ${summary || '-'}`, '', '--- Chat transcript ---', transcript].join('\n'),
        });
        ticket = String(r.tid || r.id || '');
      }
    } catch (e: any) { console.warn('[ai] handoff ticket failed:', e?.message || e); }
  }
  await db.insert(schema.auditLogs).values({ userEmail: 'ai-chat', action: 'ai_handoff', entity: 'ticket', entityId: ticket || null, detail: { ip: i.ipHash, ok: !!ticket } as any }).catch(() => {});
  const whatsapp = waLink(settings, `Hello GlobalHostia, I was chatting with your website assistant${ticket ? ` (ticket #${ticket})` : ''}: ${summary}`.slice(0, 900)) || '';
  if (!ticket && !whatsapp) return { error: 'We could not reach the team right now; ask the visitor to email support@globalhostia.com.' };
  return { ticket, whatsapp };
}
