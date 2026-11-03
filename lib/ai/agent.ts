// Tool-use loop and permission-checked tool runner (pure: the Anthropic client is injected, so tests use a mock).
// Every tool runs on the server. A tool declares the scope it needs (public / customer / admin) and its kind:
//   read    - looks things up, no side effects
//   propose - returns a proposed change for the UI to show with a Confirm button; it never changes anything itself
//   action  - small side effect the visitor asked for (open a sales hand-off / ticket); never allowed on read-only surfaces
import type { TokenUsage } from './pricing';

export type Scope = 'public' | 'customer' | 'admin';
export type ToolKind = 'read' | 'propose' | 'action';
export type UiEvent = { type: string; [k: string]: unknown };

export interface ToolCtx {
  surface: string;
  scopes: Scope[];
  /** admin assistant: only `read` tools may run */
  readOnly?: boolean;
  /** WHMCS client id for customer-scoped tools (from the portal session or the hosting-panel token, never from input) */
  clientId?: number;
  [k: string]: unknown;
}
export interface ToolOut { text: string; isError?: boolean; ui?: UiEvent[] }
export interface AiTool<C extends ToolCtx = ToolCtx> {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  scope: Scope;
  kind: ToolKind;
  run(input: Record<string, unknown>, ctx: C): Promise<ToolOut>;
}

/** Why a tool may not run in this context, or null when it may. */
export function denied(tool: AiTool<any> | undefined, ctx: ToolCtx): string | null {
  if (!tool) return 'unknown tool';
  if (!ctx.scopes.includes(tool.scope)) return `tool needs ${tool.scope} access`;
  if (tool.scope === 'customer' && !(Number.isInteger(ctx.clientId) && (ctx.clientId as number) > 0)) return 'not signed in';
  if (ctx.readOnly && tool.kind !== 'read') return 'read-only assistant';
  return null;
}

export async function runTool<C extends ToolCtx>(tools: AiTool<C>[], name: string, input: unknown, ctx: C): Promise<ToolOut> {
  const tool = tools.find((t) => t.name === name);
  const why = denied(tool, ctx);
  if (why) return { text: `Not allowed: ${why}.`, isError: true };
  const args = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  try {
    return await tool!.run(args, ctx);
  } catch (e: any) {
    const msg = e && typeof e.publicMessage === 'string' ? e.publicMessage : 'The lookup failed. Tell the user to try again shortly or contact support.';
    return { text: msg, isError: true };
  }
}

/** Thrown by tools for messages that are safe to show the model (validation, ownership). */
export class ToolError extends Error { publicMessage: string; constructor(m: string) { super(m); this.publicMessage = m; } }

export interface AnthropicLike {
  messages: {
    create(params: any, opts?: any): Promise<any>;
    stream?(params: any, opts?: any): AsyncIterable<any> & { finalMessage(): Promise<any> };
  };
}

export interface AgentOpts<C extends ToolCtx> {
  client: AnthropicLike;
  model: string;
  system: any[];
  tools: AiTool<C>[];
  messages: { role: 'user' | 'assistant'; content: any }[];
  ctx: C;
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high';
  thinking?: boolean;
  maxIterations?: number;
  onText?: (t: string) => void;
  onUi?: (e: UiEvent) => void;
  onTool?: (name: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** epoch ms by which the whole run must have answered (the route's maxDuration minus a margin): per-call timeouts
   *  shrink to fit, and when little time is left the next round answers without tools instead of starting another lookup */
  deadline?: number;
}
export interface AgentResult { text: string; usage: TokenUsage; tools: string[]; stop: string; iterations: number }

const isThinkingParamError = (e: any) => Number(e?.status) === 400 && /thinking|effort|output_config/i.test(String(e?.message || e?.error?.error?.message || ''));

/** One model call; streams text when possible. Retries once without thinking/effort params if the model rejects them. */
async function call(o: AgentOpts<any>, params: any): Promise<any> {
  const left = o.deadline ? o.deadline - Date.now() : Infinity;
  const opts: any = { signal: o.signal, timeout: Math.max(3000, Math.min(o.timeoutMs ?? 60_000, left)) };
  if (left < 30_000) opts.maxRetries = 0; // a retry after a slow failure would run past the deadline
  const once = async (p: any) => {
    if (o.onText && o.client.messages.stream) {
      const s = o.client.messages.stream(p, opts);
      for await (const ev of s) if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') o.onText(ev.delta.text);
      return s.finalMessage();
    }
    const m = await o.client.messages.create(p, opts);
    if (o.onText) for (const b of m.content || []) if (b.type === 'text') o.onText(b.text);
    return m;
  };
  try { return await once(params); }
  catch (e) {
    if (!isThinkingParamError(e)) throw e;
    const { thinking: _t, output_config: _o, ...rest } = params;
    return once(rest);
  }
}

export async function runAgent<C extends ToolCtx>(o: AgentOpts<C>): Promise<AgentResult> {
  const usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const used: string[] = [];
  const msgs = [...o.messages];
  const defs = o.tools.map((t, i) => ({ name: t.name, description: t.description, input_schema: t.input_schema, ...(i === o.tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const max = o.maxIterations ?? 5;
  let text = '', stop = '', i = 0;
  for (; i < max + 1; i++) {
    const left = o.deadline ? o.deadline - Date.now() : Infinity;
    if (left < 4000) { stop = 'deadline'; break; }
    // final round (iteration cap, or under ~15s left): answer with what we have, no more tools
    const last = i === max || (i > 0 && left < 15_000);
    const params: any = {
      model: o.model, max_tokens: o.maxTokens, system: o.system, messages: msgs,
      ...(defs.length ? { tools: defs, tool_choice: { type: last ? 'none' : 'auto' } } : {}),
      thinking: o.thinking ? { type: 'adaptive' } : { type: 'disabled' },
      ...(o.effort ? { output_config: { effort: o.effort } } : {}),
    };
    const m = await call(o, params);
    const u = m.usage || {};
    usage.input += u.input_tokens || 0; usage.output += u.output_tokens || 0;
    usage.cacheRead += u.cache_read_input_tokens || 0; usage.cacheWrite += u.cache_creation_input_tokens || 0;
    stop = String(m.stop_reason || '');
    const blocks: any[] = m.content || [];
    const said = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (said) text += (text && !text.endsWith('\n') ? '\n\n' : '') + said;
    if (stop === 'pause_turn') { msgs.push({ role: 'assistant', content: blocks }); continue; }
    if (stop !== 'tool_use') break;
    const calls = blocks.filter((b) => b.type === 'tool_use');
    msgs.push({ role: 'assistant', content: blocks });
    const results = [];
    for (const c of calls) {
      o.onTool?.(c.name);
      used.push(c.name);
      const r = await runTool(o.tools, c.name, c.input, o.ctx);
      for (const ev of r.ui || []) o.onUi?.(ev);
      results.push({ type: 'tool_result', tool_use_id: c.id, content: r.text.slice(0, 24_000), ...(r.isError ? { is_error: true } : {}) });
    }
    msgs.push({ role: 'user', content: results });
  }
  return { text: text.trim(), usage, tools: used, stop, iterations: i + 1 };
}

/** Keep the last `turns` user turns (and what followed them); the history always starts with a user message. */
export function trimHistory<T extends { role: string }>(msgs: T[], turns: number): T[] {
  let seen = 0, start = msgs.length;
  for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'user') { seen++; start = i; if (seen >= turns) break; } }
  return msgs.slice(start);
}
