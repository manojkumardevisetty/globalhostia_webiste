// Token cost and budget arithmetic (pure). Prices are USD per million tokens and editable in Admin > AI assistant.
import type { ModelPrice } from './settings-core';

export interface TokenUsage { input: number; output: number; cacheRead: number; cacheWrite: number }
export const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function addUsage(a: TokenUsage, u: any): TokenUsage {
  return {
    input: a.input + (Number(u?.input_tokens ?? u?.input) || 0),
    output: a.output + (Number(u?.output_tokens ?? u?.output) || 0),
    cacheRead: a.cacheRead + (Number(u?.cache_read_input_tokens ?? u?.cacheRead) || 0),
    cacheWrite: a.cacheWrite + (Number(u?.cache_creation_input_tokens ?? u?.cacheWrite) || 0),
  };
}

const FALLBACK: ModelPrice = { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.1 };

/** USD for one call (or the sum of a request's calls with the same model). Unknown models are priced like Sonnet. */
export function costUsd(model: string, u: TokenUsage, prices: Record<string, ModelPrice>): number {
  const p = prices[model] || Object.entries(prices).find(([k]) => model.startsWith(k))?.[1] || FALLBACK;
  const prompt = u.input + u.cacheRead + u.cacheWrite;
  const m = p.tierAbove && p.tierMult && prompt > p.tierAbove ? p.tierMult : 1;
  const usd = (u.input * p.in + u.output * p.out + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) * m / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

export type BudgetCheck = { ok: true; monthPct: number } | { ok: false; reason: 'monthly' | 'daily' | 'zero' };

/** Stop paid calls once this month's (or today's) spend reaches the cap. A cap of 0 switches the AI off. */
export function budgetCheck(spentMonth: number, spentToday: number, caps: { monthlyBudgetUsd: number; dailyBudgetUsd: number }): BudgetCheck {
  if (caps.monthlyBudgetUsd <= 0) return { ok: false, reason: 'zero' };
  if (spentMonth >= caps.monthlyBudgetUsd) return { ok: false, reason: 'monthly' };
  if (caps.dailyBudgetUsd > 0 && spentToday >= caps.dailyBudgetUsd) return { ok: false, reason: 'daily' };
  return { ok: true, monthPct: Math.round((spentMonth / caps.monthlyBudgetUsd) * 1000) / 10 };
}

/** Rough cost per 1,000 chats for the usage page: average chat cost times 1,000. */
export const per1k = (totalUsd: number, chats: number) => (chats > 0 ? Math.round((totalUsd / chats) * 1000 * 100) / 100 : null);
