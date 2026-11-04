// In-memory SpamStore for the spam filter tests (tests/ai-spam*.test.mts).
import type { Decision, SenderRow, SpamStore } from '../lib/ai/spam-core.ts';

export function memStore() {
  const rows: Decision[] = [];
  const senders: SenderRow[] = [];
  let n = 0;
  const store: SpamStore = {
    async claim(d) { if (rows.some((r) => r.ticketId === d.ticketId && r.activity === d.activity)) return null; const id = `dec${++n}xxxx`; rows.push({ id, ...d, email: '', domain: '', name: '', subject: '', label: '', confidence: null, reason: '', source: '', action: 'pending', state: 'active', prevStatus: '', prevDept: 0, hints: [], reviewedBy: '' }); return id; },
    async save(id, p) { Object.assign(rows.find((r) => r.id === id)!, p); },
    async get(id) { return rows.find((r) => r.id === id) || null; },
    async confirmed(by, v) { return new Set(rows.filter((r) => (by === 'email' ? r.email : r.domain) === v && r.action === 'close' && (r.state === 'active' || r.state === 'confirmed')).map((r) => r.ticketId)).size; },
    async senders() { return [...senders]; },
    async addSender(r) { if (!senders.some((s) => s.value === r.value && s.list === r.list)) senders.push(r); },
    async removeSender(v, l) { const i = senders.findIndex((s) => s.value === v && s.list === l); if (i >= 0) senders.splice(i, 1); },
  };
  return { store, rows, senders };
}
