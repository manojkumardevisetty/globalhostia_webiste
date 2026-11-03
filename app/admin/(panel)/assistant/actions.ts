'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { aiSettings, saveAiSettings } from '@/lib/ai/server';
import { normalizeAi } from '@/lib/ai/settings-core';
import { sendDraft } from '@/lib/ai/tickets';

const on = (fd: FormData, k: string) => fd.get(k) === 'on';
const n = (fd: FormData, k: string) => str(fd, k);

export async function saveAi(fd: FormData) {
  const s = await requireSession('settings');
  const cur = await aiSettings(true);
  const secret = n(fd, 'chat.turnstileSecret');
  const raw = {
    chatModel: n(fd, 'chatModel'), fastModel: n(fd, 'fastModel'), effort: n(fd, 'effort'),
    monthlyBudgetUsd: n(fd, 'monthlyBudgetUsd'), dailyBudgetUsd: n(fd, 'dailyBudgetUsd'),
    surfaces: { chat: on(fd, 'surfaces.chat'), assist: on(fd, 'surfaces.assist'), tickets: on(fd, 'surfaces.tickets'), admin: on(fd, 'surfaces.admin') },
    tickets: { autoSend: on(fd, 'tickets.autoSend'), threshold: n(fd, 'tickets.threshold'), vipClientIds: n(fd, 'tickets.vipClientIds'), maxAgeHours: n(fd, 'tickets.maxAgeHours'), perRun: n(fd, 'tickets.perRun') },
    chat: {
      maxTurns: n(fd, 'chat.maxTurns'), maxChars: n(fd, 'chat.maxChars'), maxTokens: n(fd, 'chat.maxTokens'), historyTurns: n(fd, 'chat.historyTurns'), ipDailyCalls: n(fd, 'chat.ipDailyCalls'),
      burstPerMin: n(fd, 'chat.burstPerMin'), minTypingMs: n(fd, 'chat.minTypingMs'), nameChecksPerConversation: n(fd, 'chat.nameChecksPerConversation'),
      turnstileSiteKey: n(fd, 'chat.turnstileSiteKey'), turnstileSecret: fd.get('chat.turnstileClear') === 'on' ? '' : secret || cur.chat.turnstileSecret,
    },
    assist: { maxTurns: n(fd, 'assist.maxTurns'), maxChars: n(fd, 'assist.maxChars'), maxTokens: n(fd, 'assist.maxTokens'), historyTurns: n(fd, 'assist.historyTurns'), clientDailyCalls: n(fd, 'assist.clientDailyCalls'), burstPerMin: n(fd, 'assist.burstPerMin') },
    gate: { haiku: on(fd, 'gate.haiku'), perWindow: n(fd, 'gate.perWindow'), windowMin: n(fd, 'gate.windowMin'), cooldownMin: n(fd, 'gate.cooldownMin'), dailyBlock: n(fd, 'gate.dailyBlock'), extraOff: String(fd.get('gate.extraOff') || ''), extraOn: String(fd.get('gate.extraOn') || '') },
    knowledge: String(fd.get('knowledge') || ''),
    salesDeptId: n(fd, 'salesDeptId'),
    prices: Object.fromEntries(['claude-sonnet-5-5', 'claude-haiku-5-5', n(fd, 'chatModel'), n(fd, 'fastModel')].filter((m, i, l) => m && l.indexOf(m) === i && fd.has(`price.${m}.in`)).map((m) => [m, {
      ...cur.prices[m], in: n(fd, `price.${m}.in`), out: n(fd, `price.${m}.out`), cacheWrite: n(fd, `price.${m}.cacheWrite`), cacheRead: n(fd, `price.${m}.cacheRead`),
    }])),
  };
  if (raw.chat.turnstileSiteKey && !raw.chat.turnstileSecret) fail('/admin/assistant/settings', 'Turnstile needs both the site key and the secret key.');
  const v = normalizeAi(raw);
  await saveAiSettings(v);
  await audit(s, 'update', 'ai_settings', null, { surfaces: v.surfaces, autoSend: v.tickets.autoSend, threshold: v.tickets.threshold, budget: v.monthlyBudgetUsd, models: [v.chatModel, v.fastModel] });
  done('/admin/assistant/settings', 'AI settings saved');
}

export async function killAll() {
  const s = await requireSession('settings');
  const cur = await aiSettings(true);
  await saveAiSettings({ ...cur, surfaces: { chat: false, assist: false, tickets: false, admin: cur.surfaces.admin }, tickets: { ...cur.tickets, autoSend: false } });
  await audit(s, 'ai_kill_switch', 'ai_settings', null, {});
  done('/admin/assistant/settings', 'Customer-facing AI switched off (website chat, customer assistant, ticket automation).');
}

/** Admin > Support > ticket: send the AI draft (edited or not) as the admin. */
export async function sendAiDraft(fd: FormData) {
  const s = await requireSession('commerce');
  const run = str(fd, 'run');
  const ticket = str(fd, 'ticket');
  const message = String(fd.get('message') ?? '').trim();
  const back = `/admin/support/${ticket}`;
  if (!/^[\w-]{6,64}$/.test(run) || !/^\d{1,10}$/.test(ticket)) fail('/admin/support', 'Draft not found');
  if (message.length < 2 || message.length > 20000) fail(back, 'The reply is empty or too long.');
  try { await sendDraft(run, message, s.email); } catch (e: any) { fail(back, `Not sent: ${e.message}`); }
  await audit(s, 'ai_draft_sent', 'support', ticket, { run });
  done(back, 'AI draft sent as your reply. The customer gets the usual WHMCS email.');
}
