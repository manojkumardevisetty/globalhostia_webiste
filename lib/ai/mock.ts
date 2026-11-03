// Local/dev stand-in for the Anthropic client (AI_MOCK=1, never in production): deterministic tool calls and streamed text,
// so the chat UI, tools, SSE and logging can be exercised without an API key. Tests use their own mocks.
import type { AnthropicLike } from './agent';
import { mockContentReply } from './mock-content';

function reply(params: any) {
  const content = mockContentReply(params);
  if (content !== null) return { content: [{ type: 'text', text: content }], stop_reason: 'end_turn', usage: { input_tokens: 7000, output_tokens: 4200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
  const msgs = params.messages || [];
  const last = msgs[msgs.length - 1];
  const usage = { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
  // gate / classifier / name ideas (cheap model)
  if (params.max_tokens <= 5) return { content: [{ type: 'text', text: 'ON' }], stop_reason: 'end_turn', usage };
  if (String(params.system?.[0]?.text || '').startsWith('Generate short, brandable')) return { content: [{ type: 'text', text: '["bakehaus","crumbly","dubaibakes","ovenlane","sweetcrust","doughdesk"]' }], stop_reason: 'end_turn', usage };
  if (params.output_config?.format) return { content: [{ type: 'text', text: '{"category":"how-to","simple":true,"sentiment":"neutral","urgency":"normal","language":"en","confidence":0.9,"summary":"How to set up email"}' }], stop_reason: 'end_turn', usage };
  const tools: string[] = (params.tools || []).map((t: any) => t.name);
  const a = assistReply(params, msgs, tools, usage);
  if (a) return a;
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

/** Customer assistant (account portal / hosting panel): proposals for DNS / mailbox / SSL / ticket, reads for the rest. */
function assistReply(params: any, msgs: any[], tools: string[], usage: any) {
  if (!tools.includes('propose_dns_record')) return null;
  const sys = (params.system || []).map((b: any) => b.text || '').join('\n');
  const ar = /interface is in Arabic/.test(sys);
  const dom = (/Current domain: ([a-z0-9.-]+)/.exec(sys) || [])[1] || '';
  const say = (en: string, arT: string) => ({ content: [{ type: 'text', text: ar ? arT : en }], stop_reason: 'end_turn', usage });
  const use = (name: string, input: Record<string, unknown>) => ({ content: [{ type: 'tool_use', id: `tu-${name}`, name, input }], stop_reason: 'tool_use', usage });
  const last = msgs[msgs.length - 1];
  if (Array.isArray(last?.content) && last.content[0]?.type === 'tool_result') {
    const prev = msgs[msgs.length - 2];
    const name = (Array.isArray(prev?.content) ? prev.content.find((b: any) => b.type === 'tool_use')?.name : '') || '';
    if (last.content[0].is_error) return say(`I could not prepare that: ${String(last.content[0].content || '').slice(0, 200)}`, `تعذّر تجهيز ذلك: ${String(last.content[0].content || '').slice(0, 200)}`);
    if (name.startsWith('propose_')) return say('I prepared the change for you. **Nothing changes until you confirm** it in the card.', 'جهّزت التغيير لك. **لن يتغيّر شيء حتى تؤكده** في البطاقة.');
    return say('Here is what I found on your account:\n- **1 unpaid invoice** (#5001, $25.20, due in 2 days). [Open billing](/account/invoices)\n- **demo-brand.net** expires in 5 days and renews automatically.\n- Everything else looks fine.',
      'إليك ما وجدته في حسابك:\n- **فاتورة واحدة غير مدفوعة** (#5001، 25.20$، تستحق خلال يومين). [فتح الفواتير](/account/invoices)\n- النطاق **demo-brand.net** ينتهي خلال 5 أيام ويتجدد تلقائياً.\n- كل شيء آخر يبدو سليماً.');
  }
  const text = String(typeof last?.content === 'string' ? last.content : '').toLowerCase();
  const need = () => say('Which domain do you mean? Open the domain first, or tell me its name.', 'أي نطاق تقصد؟ افتح صفحة النطاق أولاً أو اكتب اسمه.');
  if (/\bmx\b|workspace|google/.test(text)) return dom ? use('propose_dns_record', { domain: dom, type: 'MX', name: '@', value: 'smtp.google.com', priority: 1, ttl: 3600 }) : need();
  if (/mailbox|صندوق/.test(text)) return dom ? use('propose_mailbox', { domain: dom, user: 'info', quota_mb: 1024 }) : need();
  if (/\bssl\b|شهادة/.test(text) && /issue|اصدر|أصدر|free|مجاني/.test(text)) return dom ? use('propose_ssl', { domain: dom, www: true }) : need();
  if (/ticket|تذكرة/.test(text)) return use('propose_ticket', { subject: 'Website is slow', message: 'My website has been loading slowly since yesterday. Please check the server.', department: 'Technical' });
  if (/health|healthy|site|working|موقع|يعمل/.test(text) && dom) return use('site_health', { domain: dom });
  return use('list_invoices', {});
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
