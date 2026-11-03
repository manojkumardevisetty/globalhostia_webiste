// Local/dev stand-in for the Anthropic client (AI_MOCK=1, never in production): deterministic tool calls and streamed text,
// so the chat UI, tools, SSE and logging can be exercised without an API key. Tests use their own mocks.
import type { AnthropicLike } from './agent';

function reply(params: any) {
  const msgs = params.messages || [];
  const last = msgs[msgs.length - 1];
  const usage = { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
  // gate / classifier / name ideas (cheap model)
  if (params.max_tokens <= 5) return { content: [{ type: 'text', text: 'ON' }], stop_reason: 'end_turn', usage };
  if (String(params.system?.[0]?.text || '').startsWith('Generate short, brandable')) return { content: [{ type: 'text', text: '["bakehaus","crumbly","dubaibakes","ovenlane","sweetcrust","doughdesk"]' }], stop_reason: 'end_turn', usage };
  if (params.output_config?.format) return { content: [{ type: 'text', text: '{"category":"how-to","simple":true,"sentiment":"neutral","urgency":"normal","language":"en","confidence":0.9,"summary":"How to set up email"}' }], stop_reason: 'end_turn', usage };
  const tools: string[] = (params.tools || []).map((t: any) => t.name);
  if (Array.isArray(last?.content) && last.content[0]?.type === 'tool_result') {
    return { content: [{ type: 'text', text: 'Here are my suggestions. The **best pick** fits a growing site; choose the alternative if you want more room. Add one to your cart below.' }], stop_reason: 'end_turn', usage };
  }
  const text = String(typeof last?.content === 'string' ? last.content : '').toLowerCase();
  const dom = text.match(/\b[a-z0-9-]+\.(com|ae|net|org|store|online)\b/);
  if (dom && tools.includes('check_domain')) return { content: [{ type: 'tool_use', id: 'tu1', name: 'check_domain', input: { domain: dom[0] } }], stop_reason: 'tool_use', usage };
  if (/name|idea|bakery|brand/.test(text) && tools.includes('suggest_domains')) return { content: [{ type: 'tool_use', id: 'tu1', name: 'suggest_domains', input: { business: text } }], stop_reason: 'tool_use', usage };
  if (tools.includes('recommend_plan')) return { content: [{ type: 'tool_use', id: 'tu1', name: 'recommend_plan', input: { need: text || 'website' } }], stop_reason: 'tool_use', usage };
  if (tools.includes('business_stats')) return { content: [{ type: 'text', text: 'Read-only demo answer: connect ANTHROPIC_API_KEY for live figures.' }], stop_reason: 'end_turn', usage };
  return { content: [{ type: 'text', text: 'Draft: go to Manage hosting > Email and create the mailbox, then use the settings card to set up your phone.' }], stop_reason: 'end_turn', usage };
}

export function mockClient(): AnthropicLike {
  return {
    messages: {
      async create(params: any) { return reply(params); },
      stream(params: any) {
        const m = reply(params);
        const words = m.content.filter((b: any) => b.type === 'text').flatMap((b: any) => b.text.split(/(?<= )/));
        return {
          async *[Symbol.asyncIterator]() { for (const w of words) { await new Promise((r) => setTimeout(r, 15)); yield { type: 'content_block_delta', delta: { type: 'text_delta', text: w } }; } },
          finalMessage: async () => m,
        };
      },
    },
  };
}
