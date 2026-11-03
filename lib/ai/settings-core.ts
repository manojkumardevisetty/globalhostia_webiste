// AI assistant settings: types, defaults and normalisation (pure; stored as one JSON value in settings.ai_settings,
// edited in Admin > AI assistant > Settings). The Anthropic key itself is never stored here: ANTHROPIC_API_KEY env only.

export type Surface = 'chat' | 'assist' | 'tickets' | 'admin';
export const SURFACES: Surface[] = ['chat', 'assist', 'tickets', 'admin'];
export const SURFACE_LABEL: Record<Surface | 'gate' | 'names' | 'content', string> = {
  chat: 'Website chat', assist: 'Customer assistant', tickets: 'Ticket automation', admin: 'Admin assistant', gate: 'Scope classifier', names: 'Domain ideas', content: 'Content engine',
};

export type ModelPrice = { in: number; out: number; cacheWrite: number; cacheRead: number; tierAbove?: number; tierMult?: number };

export interface AiSettings {
  chatModel: string;
  fastModel: string;
  effort: 'low' | 'medium' | 'high';
  monthlyBudgetUsd: number;
  dailyBudgetUsd: number;
  surfaces: Record<Surface, boolean>;
  tickets: { autoSend: boolean; threshold: number; vipClientIds: number[]; maxAgeHours: number; perRun: number };
  chat: { maxTurns: number; maxChars: number; maxTokens: number; historyTurns: number; ipDailyCalls: number; burstPerMin: number; minTypingMs: number; nameChecksPerConversation: number; turnstileSiteKey: string; turnstileSecret: string };
  assist: { maxTurns: number; maxChars: number; maxTokens: number; historyTurns: number; clientDailyCalls: number; burstPerMin: number };
  gate: { haiku: boolean; perWindow: number; windowMin: number; cooldownMin: number; dailyBlock: number; extraOff: string[]; extraOn: string[] };
  knowledge: string;
  salesDeptId: number;
  prices: Record<string, ModelPrice>;
}

export const DEFAULT_KNOWLEDGE = `Support: open a ticket in the client area (Support), email support@globalhostia.com or WhatsApp us. Urgent outages: mark the ticket High priority.
Free website migration: request it at /free-migration; our team moves the site, email and databases.
Escalation: anything about refunds, cancellations, abuse reports, legal or security issues goes to a human; do not promise outcomes.`;

export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  // USD per million tokens (5-minute cache writes). Haiku 5.5 rates multiply by 5 above 100K prompt tokens.
  'claude-sonnet-5-5': { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheWrite: 0.125, cacheRead: 0.01, tierAbove: 100_000, tierMult: 5 },
};

export const DEFAULT_AI: AiSettings = {
  chatModel: 'claude-sonnet-5-5',
  fastModel: 'claude-haiku-5-5',
  effort: 'low',
  monthlyBudgetUsd: 50,
  dailyBudgetUsd: 5,
  surfaces: { chat: true, assist: true, tickets: true, admin: true },
  tickets: { autoSend: true, threshold: 0.85, vipClientIds: [], maxAgeHours: 48, perRun: 2 },
  chat: { maxTurns: 12, maxChars: 600, maxTokens: 500, historyTurns: 6, ipDailyCalls: 30, burstPerMin: 6, minTypingMs: 800, nameChecksPerConversation: 30, turnstileSiteKey: '', turnstileSecret: '' },
  assist: { maxTurns: 30, maxChars: 1500, maxTokens: 900, historyTurns: 8, clientDailyCalls: 80, burstPerMin: 10 },
  gate: { haiku: true, perWindow: 3, windowMin: 10, cooldownMin: 30, dailyBlock: 10, extraOff: [], extraOn: [] },
  knowledge: DEFAULT_KNOWLEDGE,
  salesDeptId: 0,
  prices: DEFAULT_PRICES,
};

const num = (v: unknown, d: number, min: number, max: number) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const int = (v: unknown, d: number, min: number, max: number) => Math.round(num(v, d, min, max));
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : v === 'true' || v === 'on' ? true : v === 'false' ? false : d);
const model = (v: unknown, d: string) => (typeof v === 'string' && /^claude-[a-z0-9.-]{2,60}$/.test(v.trim()) ? v.trim() : d);
const words = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\r?\n|,/) : [])
  .map((x) => String(x).trim().toLowerCase()).filter((x) => x.length >= 2 && x.length <= 60).slice(0, 300);

/** Merge a stored (possibly partial or older) value onto the defaults, clamping every number to a sane range. */
export function normalizeAi(raw: unknown): AiSettings {
  const r: any = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_AI;
  const prices: Record<string, ModelPrice> = { ...DEFAULT_PRICES };
  if (r.prices && typeof r.prices === 'object') for (const [k, p] of Object.entries<any>(r.prices)) {
    if (!/^claude-[a-z0-9.-]{2,60}$/.test(k) || !p || typeof p !== 'object') continue;
    const base = prices[k] || DEFAULT_PRICES['claude-sonnet-5-5'];
    prices[k] = { in: num(p.in, base.in, 0, 1000), out: num(p.out, base.out, 0, 1000), cacheWrite: num(p.cacheWrite, base.cacheWrite, 0, 1000), cacheRead: num(p.cacheRead, base.cacheRead, 0, 1000),
      ...(p.tierAbove || base.tierAbove ? { tierAbove: int(p.tierAbove, base.tierAbove || 0, 0, 10_000_000), tierMult: num(p.tierMult, base.tierMult || 1, 1, 100) } : {}) };
  }
  return {
    chatModel: model(r.chatModel, d.chatModel),
    fastModel: model(r.fastModel, d.fastModel),
    effort: ['low', 'medium', 'high'].includes(r.effort) ? r.effort : d.effort,
    monthlyBudgetUsd: num(r.monthlyBudgetUsd, d.monthlyBudgetUsd, 0, 100_000),
    dailyBudgetUsd: num(r.dailyBudgetUsd, d.dailyBudgetUsd, 0, 10_000),
    surfaces: Object.fromEntries((Object.keys(d.surfaces) as Surface[]).map((k) => [k, bool(r.surfaces?.[k], d.surfaces[k])])) as Record<Surface, boolean>,
    tickets: {
      autoSend: bool(r.tickets?.autoSend, d.tickets.autoSend),
      threshold: num(r.tickets?.threshold, d.tickets.threshold, 0.5, 1),
      vipClientIds: (Array.isArray(r.tickets?.vipClientIds) ? r.tickets.vipClientIds : String(r.tickets?.vipClientIds || '').split(/[\s,]+/))
        .map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, 500),
      maxAgeHours: int(r.tickets?.maxAgeHours, d.tickets.maxAgeHours, 1, 720),
      perRun: int(r.tickets?.perRun, d.tickets.perRun, 1, 10),
    },
    chat: {
      maxTurns: int(r.chat?.maxTurns, d.chat.maxTurns, 1, 50),
      maxChars: int(r.chat?.maxChars, d.chat.maxChars, 100, 4000),
      maxTokens: int(r.chat?.maxTokens, d.chat.maxTokens, 150, 4000),
      historyTurns: int(r.chat?.historyTurns, d.chat.historyTurns, 1, 20),
      ipDailyCalls: int(r.chat?.ipDailyCalls, d.chat.ipDailyCalls, 1, 10_000),
      burstPerMin: int(r.chat?.burstPerMin, d.chat.burstPerMin, 1, 120),
      minTypingMs: int(r.chat?.minTypingMs, d.chat.minTypingMs, 0, 10_000),
      nameChecksPerConversation: int(r.chat?.nameChecksPerConversation, d.chat.nameChecksPerConversation, 0, 200),
      turnstileSiteKey: typeof r.chat?.turnstileSiteKey === 'string' ? r.chat.turnstileSiteKey.trim().slice(0, 100) : '',
      turnstileSecret: typeof r.chat?.turnstileSecret === 'string' ? r.chat.turnstileSecret.trim().slice(0, 200) : '',
    },
    assist: {
      maxTurns: int(r.assist?.maxTurns, d.assist.maxTurns, 1, 100),
      maxChars: int(r.assist?.maxChars, d.assist.maxChars, 100, 8000),
      maxTokens: int(r.assist?.maxTokens, d.assist.maxTokens, 150, 4000),
      historyTurns: int(r.assist?.historyTurns, d.assist.historyTurns, 1, 30),
      clientDailyCalls: int(r.assist?.clientDailyCalls, d.assist.clientDailyCalls, 1, 10_000),
      burstPerMin: int(r.assist?.burstPerMin, d.assist.burstPerMin, 1, 120),
    },
    gate: {
      haiku: bool(r.gate?.haiku, d.gate.haiku),
      perWindow: int(r.gate?.perWindow, d.gate.perWindow, 1, 50),
      windowMin: int(r.gate?.windowMin, d.gate.windowMin, 1, 1440),
      cooldownMin: int(r.gate?.cooldownMin, d.gate.cooldownMin, 1, 1440),
      dailyBlock: int(r.gate?.dailyBlock, d.gate.dailyBlock, 1, 1000),
      extraOff: words(r.gate?.extraOff),
      extraOn: words(r.gate?.extraOn),
    },
    knowledge: typeof r.knowledge === 'string' ? r.knowledge.slice(0, 12_000) : d.knowledge,
    salesDeptId: int(r.salesDeptId, 0, 0, 1e9),
    prices,
  };
}

/** Settings as shown to admins: the Turnstile secret is never sent back to the browser. */
export const redactSettings = (s: AiSettings) => ({ ...s, chat: { ...s.chat, turnstileSecret: s.chat.turnstileSecret ? '••••' + s.chat.turnstileSecret.slice(-4) : '' } });
