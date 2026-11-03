// Support-ticket automation policy (pure; unit-tested in tests/ai-policy.test.mts).
// Owner's rule: auto-reply only to simple ones. A drafted answer is sent to the customer automatically ONLY when
//   category is how-to (or technical marked simple) AND confidence >= threshold AND no billing / refund / cancellation /
//   abuse / legal / security wording AND the customer is not VIP AND auto-send is on AND we have not auto-replied on this
//   ticket before AND the customer did not ask for a human. Everything else becomes an internal note + admin draft.
// Tickets are never closed by the assistant.

export const CATEGORIES = ['how-to', 'technical', 'billing', 'abuse', 'cancellation', 'sales', 'outage', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const SENTIMENTS = ['positive', 'neutral', 'negative', 'angry'] as const;
export const URGENCIES = ['low', 'normal', 'high', 'critical'] as const;

export interface Classification {
  category: Category; simple: boolean; sentiment: (typeof SENTIMENTS)[number]; urgency: (typeof URGENCIES)[number];
  language: string; confidence: number; summary: string;
}

export const CLASSIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['category', 'simple', 'sentiment', 'urgency', 'language', 'confidence', 'summary'],
  properties: {
    category: { type: 'string', enum: [...CATEGORIES] },
    simple: { type: 'boolean', description: 'true when a short written answer fully solves it without staff access or account changes' },
    sentiment: { type: 'string', enum: [...SENTIMENTS] },
    urgency: { type: 'string', enum: [...URGENCIES] },
    language: { type: 'string', description: 'ISO 639-1 code of the customer message, e.g. en, ar, hi' },
    confidence: { type: 'number', description: '0 to 1: how sure you are of the category and that the answer is simple' },
    summary: { type: 'string', description: 'one sentence, max 160 characters' },
  },
} as const;

/** Coerce whatever the classifier returned into a safe Classification (anything odd lowers confidence to 0). */
export function parseClassification(raw: unknown): Classification {
  let o: any = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { o = {}; } }
  o = o && typeof o === 'object' ? o : {};
  const ok = CATEGORIES.includes(o.category);
  const conf = Number(o.confidence);
  return {
    category: ok ? o.category : 'other',
    simple: o.simple === true,
    sentiment: SENTIMENTS.includes(o.sentiment) ? o.sentiment : 'neutral',
    urgency: URGENCIES.includes(o.urgency) ? o.urgency : 'normal',
    language: typeof o.language === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(o.language) ? o.language.slice(0, 8) : 'en',
    confidence: ok && Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0,
    summary: String(o.summary || '').slice(0, 200),
  };
}

/** Words that always route to a person (English, Arabic, Hindi/Urdu in Latin letters). */
export const RISK_RE = new RegExp([
  'refund', 'money\\s*back', 'charge\\s*back', 'chargeback', 'charged\\s+twice', 'double\\s+charged', 'overcharg', 'invoice', 'billing', 'payment', 'paid\\b', 'pay\\b',
  'credit\\s+card', 'debit\\s+card', 'bank\\s+transfer', 'discount', 'coupon', 'price\\s+match',
  'cancel', 'terminat', 'close\\s+my\\s+account', 'delete\\s+my\\s+(account|data)', 'downgrade',
  'abuse', 'spam\\s+complaint', 'phishing', 'malware', 'virus', 'blacklist', 'dmca', 'copyright', 'trademark', 'takedown',
  'legal', 'lawyer', 'attorney', 'court', 'police', 'lawsuit', 'sue\\b', 'gdpr', 'complaint', 'fraud', 'scam',
  'hack', 'hacked', 'breach', 'compromis', 'stolen', 'ddos', 'unauthori[sz]ed', 'security\\s+(issue|incident|vulnerab)', 'vulnerab',
  'password', '2fa', 'two.factor', 'otp', 'ownership', 'transfer\\s+(my\\s+)?(account|ownership)', 'epp', 'auth\\s*code',
  'استرداد', 'استرجاع', 'فاتورة', 'دفع', 'إلغاء', 'الغاء', 'اختراق', 'محامي', 'شكوى', 'احتيال', 'كلمة المرور', 'كلمة السر',
  'paisa\\s+wapas', 'refund\\s+chahiye', 'cancel\\s+karo', 'hack\\s+ho',
].join('|'), 'i');

export const riskHits = (text: string) => [...new Set((text.match(new RegExp(RISK_RE.source, 'gi')) || []).map((x) => x.toLowerCase().trim()))];

/** "human", "agent", "real person" ... (the auto-reply footer invites customers to reply "human"). */
export const wantsHuman = (text: string) => /\b(human|real\s+person|a\s+person|agent|staff|someone\s+from\s+(your\s+)?team|call\s+me|manager)\b|إنسان|موظف|شخص حقيقي|insaan|banda\s+chahiye/i.test(text);

export interface TicketFacts {
  cls: Classification;
  /** customer's latest message + subject */
  text: string;
  draft: string;
  isVip: boolean;
  priorAutoReplies: number;
  autoSendOn: boolean;
  threshold: number;
  hasAdminUser: boolean;
}
export type TicketDecision = { action: 'auto_send' | 'draft'; reasons: string[] };

export function decideTicket(f: TicketFacts): TicketDecision {
  const why: string[] = [];
  const simpleCat = f.cls.category === 'how-to' || (f.cls.category === 'technical' && f.cls.simple);
  if (!f.autoSendOn) why.push('auto-send is off');
  if (!simpleCat) why.push(`category ${f.cls.category}${f.cls.category === 'technical' ? ' (not simple)' : ''}`);
  if (f.cls.confidence < f.threshold) why.push(`confidence ${f.cls.confidence.toFixed(2)} < ${f.threshold}`);
  const risk = riskHits(f.text);
  if (risk.length) why.push(`sensitive words: ${risk.slice(0, 5).join(', ')}`);
  const draftRisk = riskHits(f.draft).filter((w) => !risk.includes(w));
  if (draftRisk.length) why.push(`draft mentions: ${draftRisk.slice(0, 3).join(', ')}`);
  if (f.isVip) why.push('VIP customer');
  if (f.priorAutoReplies > 0) why.push('already auto-replied on this ticket');
  if (wantsHuman(f.text)) why.push('customer asked for a human');
  if (f.cls.urgency === 'critical' || f.cls.urgency === 'high') why.push(`urgency ${f.cls.urgency}`);
  if (f.cls.sentiment === 'angry' || f.cls.sentiment === 'negative') why.push(`sentiment ${f.cls.sentiment}`);
  if (f.draft.trim().length < 40) why.push('draft too short');
  if (!f.hasAdminUser) why.push('no WHMCS admin username set');
  return why.length ? { action: 'draft', reasons: why } : { action: 'auto_send', reasons: [`${f.cls.category}, confidence ${f.cls.confidence.toFixed(2)}`] };
}

export const AUTO_SIGNATURE = (lang: string) => lang.startsWith('ar')
  ? '\n\n— مساعد GlobalHostia\nاكتب "human" في ردك للتواصل مع فريقنا.'
  : "\n\n— GlobalHostia Assistant\nReply 'human' to reach our team.";

/* ---------------------------------------------------------------- PII-safe logging */
/** Masks passwords, API keys / tokens, card numbers and long secrets before anything is written to a log. */
export function redact(s: string): string {
  return String(s ?? '')
    .replace(/(pass(word|wd)?|pwd|secret|token|api[_ -]?key|auth[_ -]?code|epp)(\s*[:=]\s*|\s+is\s+)\S+/gi, '$1$3[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, '[key]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[card]')
    .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, '[secret]');
}
