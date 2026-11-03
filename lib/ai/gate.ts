// Scope gate for the website chat and the customer assistant: decides, before any paid model call, whether a message is
// about GlobalHostia (hosting, domains, email, SSL, servers, websites, the customer's account, billing, support).
//   1. deterministic rules (this file, zero cost): clear off-topic -> canned line; clear on-topic -> model;
//   2. anything ambiguous -> a tiny Haiku ON/OFF classifier (lib/ai/run.ts), only ON reaches Sonnet;
//   3. strikes: repeated off-topic messages put the visitor on a cooldown (no model calls at all) or block them for the day.
// Pure module (no imports) so tests/ai-gate.test.mts can load it directly.

export type GateKind = 'on' | 'off' | 'ambiguous' | 'greeting';
export interface GateVerdict { kind: GateKind; reason: string }
export interface GateLists { extraOff?: string[]; extraOn?: string[] }

/* ------------------------------------------------------------------ off-topic signals */
// Latin-script rules use word boundaries; Arabic / Devanagari / Urdu terms are plain substrings (\b does not work there).
const OFF_RE: [string, RegExp][] = [
  ['commodity-prices', /\b(gold|silver|platinum|palladium|oil|crude|petrol|diesel|gas)\s+(price|prices|rate|rates|today|now|per\s+(gram|ounce|tola))\b|\b(price|rate|cost)\s+of\s+(gold|silver|oil|petrol|crude)\b|\b(gold|silver)\s+(karat|carat|22k|24k|18k)\b|\b(22|24|18)\s*(k|karat|carat)\s+gold\b/i],
  ['crypto', /\b(btc|bitcoin|eth|ethereum|crypto(currency|currencies)?|dogecoin|doge|solana|xrp|ripple|usdt|tether|binance|altcoins?|memecoins?|shiba|cardano|litecoin|nft)\b/i],
  ['markets', /\b(stock|stocks|share\s+price|nasdaq|dow\s+jones|s&p\s*500|nifty|sensex|tadawul|dfm\s+index|trading\s+signals?|exchange\s+rate|(usd|aed|inr|eur|gbp|pkr|sar)\s+to\s+(usd|aed|inr|eur|gbp|pkr|sar))\b/i],
  ['forex-advice', /\b(forex|fx)\s+(signals?|tips|advice|prediction|strategy)\b|\bshould\s+i\s+(buy|sell|invest)\b/i],
  ['shopping', /\b(shirts?|t-?shirts?|shoes?|sneakers|dress(es)?|clothes|clothing|jeans|abaya|kandura|perfumes?|wrist\s?watch(es)?|smart\s?watch(es)?|iphone|samsung\s+galaxy|mobile\s+phone\s+deals?|furniture|groceries|grocery|supermarket|restaurants?|food\s+delivery|pizza|burger|cars?\s+for\s+sale|used\s+cars?|buy\s+a\s+(car|house|flat|apartment|villa)|apartment\s+for\s+rent|flat\s+for\s+rent|gift\s+ideas?)\b/i],
  ['homework', /\b(homework|essay|assignment|thesis|dissertation|exam\s+(question|answer)s?|solve\s+(this|the|my)\s+(equation|math|problem)|math\s+problem|algebra|calculus|physics\s+question|chemistry\s+question)\b/i],
  ['creative', /\b(jokes?|poems?|poetry|song\s+lyrics|lyrics|riddles?|limerick|haiku\s+about|story\s+about|bedtime\s+story|write\s+(me\s+)?(a|an)\s+(story|poem|song|essay|letter|cv|resume|cover\s+letter|speech))\b/i],
  ['translation', /\btranslate\s+(this|the following|into|to|from)\b|\btranslation\s+of\b/i],
  ['advice', /\b(doctor|medicine|medical|symptoms?|diagnos(is|e)|pregnan(t|cy)|diet\s+plan|lose\s+weight|lawyer|divorce|custody|lawsuit|sue\s+(my|him|her)|immigration|work\s+visa|tourist\s+visa|visa\s+application|tax\s+advice|investment\s+advice|personal\s+loan|mortgage)\b/i],
  ['news', /\b(latest\s+news|news\s+today|headlines|breaking\s+news|election\s+results?|who\s+won\s+the\s+election)\b/i],
  ['weather', /\b(weather|temperature\s+(today|tomorrow|in)|forecast\s+for|will\s+it\s+rain)\b/i],
  ['sports', /\b(football|soccer|cricket|ipl|nba|nfl|fifa|world\s+cup|premier\s+league|la\s+liga|champions\s+league|match\s+score|live\s+score|messi|ronaldo|kohli|f1\s+race|formula\s+1)\b/i],
  ['celebrities', /\b(celebrit(y|ies)|actor|actress|bollywood|hollywood|movies?|netflix|tv\s+shows?|series\s+to\s+watch|singer|kardashian|taylor\s+swift|shah\s+rukh)\b/i],
  ['general', /\b(capital\s+of|how\s+old\s+is|recipes?|how\s+to\s+cook|horoscope|zodiac|astrology|dating|girlfriend|boyfriend|relationship\s+advice|meaning\s+of\s+life|tell\s+me\s+about\s+yourself|what\s+is\s+love)\b/i],
  ['coding', /\b(leetcode|hackerrank|write\s+(a|me\s+a|an)\s+(python|java|c\+\+|c#|javascript|js|rust|go)\s+(program|script|function|code|class)|data\s+structures?\s+and\s+algorithms|bubble\s+sort|binary\s+tree|fibonacci)\b/i],
  ['chatbot-misuse', /\b(act\s+as\s+(a|an|my)\b|pretend\s+(to\s+be|you\s+are)|role\s?play|jailbreak|dan\s+mode|developer\s+mode|chatgpt|gpt-?\d|ignore\s+(all|any|previous|prior|the\s+above|your)\s+(instructions|rules)|(reveal|show|print|repeat|what\s+is|what's)\s+(me\s+)?(your\s+)?(system\s+prompt|hidden\s+instructions|initial\s+instructions))\b/i],
  // Hindi / Urdu in Latin letters
  ['hi-ur-latin', /\b(sona|sone\s+ka\s+(bhav|rate|bhaav)|sone\s+ki\s+(keemat|qeemat|kimat)|chandi\s+ka\s+(bhav|rate)|aaj\s+ka\s+(bhav|rate)|bitcoin\s+ka\s+(rate|bhav)|mausam|barish|chutkula|chutkule|shayari|gaana|gaane|kahani\s+sunao|kapde|kapray|joote|jootay|naukri|rishta|khana\s+banana|cricket\s+score|match\s+kaun\s+jeeta)\b/i],
];
const OFF_SUBSTR: [string, string[]][] = [
  ['ar-prices', ['سعر الذهب', 'أسعار الذهب', 'اسعار الذهب', 'الذهب اليوم', 'سعر الفضة', 'الفضة', 'سعر النفط', 'سعر البنزين', 'جرام الذهب', 'عيار 21', 'عيار 24']],
  ['ar-crypto', ['بيتكوين', 'بتكوين', 'البيتكوين', 'عملات رقمية', 'العملات الرقمية', 'كريبتو', 'إيثريوم', 'ايثريوم']],
  ['ar-markets', ['الأسهم', 'الاسهم', 'البورصة', 'سعر الصرف', 'سعر الدولار', 'الدولار مقابل', 'تداول الأسهم']],
  ['ar-shopping', ['قميص', 'قمصان', 'ملابس', 'حذاء', 'أحذية', 'عطر', 'عطور', 'عباية', 'مطعم', 'مطاعم', 'بيتزا', 'سيارة للبيع', 'شقة للإيجار']],
  ['ar-general', ['الطقس', 'درجة الحرارة', 'كرة القدم', 'مباراة', 'نتيجة المباراة', 'نكتة', 'نكت', 'قصيدة', 'شعر عن', 'واجب منزلي', 'الواجب', 'مقال عن', 'وصفة', 'طبخ', 'فيلم', 'مسلسل', 'أخبار اليوم', 'اخبار اليوم', 'برج الحظ', 'الأبراج', 'ترجم ', 'ترجمة النص']],
  ['ar-advice', ['طبيب', 'دواء', 'أعراض', 'محامي', 'طلاق', 'تأشيرة']],
  ['hi-devanagari', ['सोना', 'सोने का भाव', 'सोने की कीमत', 'चांदी', 'बिटकॉइन', 'मौसम', 'क्रिकेट', 'चुटकुला', 'शायरी', 'कहानी', 'गाना', 'कपड़े', 'नौकरी']],
  ['ur-arabic-script', ['سونا', 'سونے کی قیمت', 'سونے کا ریٹ', 'چاندی', 'موسم', 'کرکٹ', 'لطیفہ', 'شاعری', 'کہانی', 'گانا', 'کپڑے']],
];

/* ------------------------------------------------------------------ on-topic signals */
const ON_RE = /\b(host|hosting|hosted|domains?|dns|nameservers?|name\s+servers?|a\s+record|mx\s+record|cname|txt\s+record|e-?mails?|mail|mailbox(es)?|inbox|outlook|gmail\s+setup|smtp|imap|pop3|webmail|spf|dkim|dmarc|ssl|tls|https|certificates?|wordpress|woocommerce|wp-admin|websites?|site|web\s?page|landing\s+page|server|servers|vps|rdp|dedicated|cloud|reseller|cpanel|directadmin|plesk|whm|invoices?|bill|billing|payment|paid|pay|renew|renewal|renewals|expire[ds]?|expiry|tickets?|support|migrat(e|ion|ing)|transfer|backups?|restore|uptime|downtime|offline|bandwidth|storage|disk|inodes?|ram|cpu|ftp|sftp|ssh|database|mysql|mariadb|php|htaccess|redirect|subdomains?|cdn|cache|seo|cart|checkout|order|orders|plans?|packages?|upgrade|downgrade|refund|cancel|cancellation|account|client\s+area|login|log\s+in|password\s+reset|globalhostia|global\s+hostia|mt4|mt5|metatrader|forex\s+vps|n8n|node\.?js|laravel|python\s+hosting|ecommerce|e-commerce|online\s+store|business\s+email|g\s?suite|workspace|404|500\s+error|error\s+50\d|not\s+loading|slow\s+site|whois|registrar|tld|\.ae|uae\s+domain)\b/i;
const ON_SUBSTR = ['استضافة', 'الاستضافة', 'نطاق', 'دومين', 'الدومين', 'موقع', 'الموقع', 'بريد', 'ايميل', 'إيميل', 'خادم', 'سيرفر', 'السيرفر', 'شهادة', 'ووردبريس', 'وردبريس', 'فاتورة', 'الفاتورة', 'تجديد', 'تذكرة', 'الدعم', 'نقل الموقع', 'حجز', 'باقة', 'الباقة', 'خطة', 'حسابي', 'كلمة المرور',
  'होस्टिंग', 'डोमेन', 'वेबसाइट', 'ईमेल', 'सर्वर', 'ہوسٹنگ', 'ڈومین', 'ویب سائٹ', 'ای میل', 'سرور'];
/** A domain name in the message (mybrand.com, my-shop.ae, brand.co.uk). */
const DOMAIN_RE = /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:[a-z]{2,24})(?:\.[a-z]{2,3})?\b/i;
const NOT_DOMAINS = /\b(e\.g|i\.e|etc|vs|a\.m|p\.m)\b/i;

const GREETING = /^\s*(hi+|hello+|hey+|hiya|yo|salam|salaam|assalam(u|o)?\s*alaikum|as-?salamu\s+alaykum|marhaba|good\s+(morning|afternoon|evening|day)|namaste|namaskar|hola|bonjour|مرحبا|مرحباً|السلام عليكم|سلام|اهلا|أهلا|هلا|صباح الخير|مساء الخير|नमस्ते|آداب)[\s!.,?،]*(there|team|globalhostia)?[\s!.,?،]*$/i;
const ACK = /^\s*(yes|yeah|yep|ok(ay)?|sure|no|nope|thanks?|thank\s+you|thx|great|perfect|cool|nice|got\s+it|and\s+\w+\??|what\s+about\s+.{1,30}|how\s+much\??|which\s+one\??|the\s+(first|second|third|cheapest|cheaper)( one)?|monthly|yearly|annually|\d+(\.\d+)?\s*(gb|tb|months?|years?|sites?|websites?|usd|aed|\$)?|نعم|لا|شكرا|شكراً|تمام|حسنا|حسناً|ok\s+thanks)[\s!.?,،]*$/i;

const norm = (s: string) => s.normalize('NFKC').replace(/[ً-ْـ]/g, '').replace(/\s+/g, ' ').trim();
const termRe = (t: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu');

export function offHits(text: string, extra: string[] = []): string[] {
  const t = norm(text);
  const hits = OFF_RE.filter(([, re]) => re.test(t)).map(([k]) => k);
  for (const [k, list] of OFF_SUBSTR) if (list.some((w) => t.includes(w))) hits.push(k);
  for (const w of extra) if (w && termRe(w.trim()).test(t)) hits.push(`custom:${w.trim()}`);
  return [...new Set(hits)];
}

export function onHits(text: string, extra: string[] = []): string[] {
  const t = norm(text);
  const hits: string[] = [];
  const m = t.match(ON_RE);
  if (m) hits.push(m[0].toLowerCase());
  if (DOMAIN_RE.test(t) && !NOT_DOMAINS.test(t.match(DOMAIN_RE)?.[0] || '')) hits.push('domain-name');
  for (const w of ON_SUBSTR) if (t.includes(w)) { hits.push(w); break; }
  for (const w of extra) if (w && termRe(w.trim()).test(t)) hits.push(`custom:${w.trim()}`);
  return hits;
}

/**
 * Deterministic verdict for one user message. `hasContext` = the conversation already has an assistant reply,
 * so very short follow-ups ("yes", "the second one", "annually") count as on-topic without a classifier call.
 */
export function prefilter(text: string, o: GateLists & { hasContext?: boolean } = {}): GateVerdict {
  const t = norm(text);
  if (!t) return { kind: 'off', reason: 'empty' };
  if (GREETING.test(t)) return { kind: 'greeting', reason: 'greeting' };
  const off = offHits(t, o.extraOff), on = onHits(t, o.extraOn);
  if (off.includes('chatbot-misuse')) return { kind: 'off', reason: 'chatbot-misuse' };
  if (off.length && !on.length) return { kind: 'off', reason: off.join(',') };
  if (on.length && !off.length) return { kind: 'on', reason: on.join(',') };
  if (on.length && off.length) return { kind: 'ambiguous', reason: `mixed:${off.join(',')}` };
  if (o.hasContext && (ACK.test(t) || t.length <= 40)) return { kind: 'on', reason: 'follow-up' };
  return { kind: 'ambiguous', reason: 'no-signal' };
}

/* ------------------------------------------------------------------ canned replies */
export type Lang = 'en' | 'ar';
export const isArabic = (s: string) => /[؀-ۿ]/.test(s) && !/[ٹڈڑںھہے]/.test(s); // Urdu-only letters -> English line
export const langOf = (s: string): Lang => (isArabic(s) ? 'ar' : 'en');

export const CANNED: Record<Lang, { off: string; greeting: string; chips: string[] }> = {
  en: {
    off: 'I can help with GlobalHostia hosting, domains, email and your account.',
    greeting: 'Hi! I can help with GlobalHostia hosting, domains, email and your account. What do you need?',
    chips: ['Find a hosting plan', 'Check a domain', 'Talk to support'],
  },
  ar: {
    off: 'يمكنني المساعدة في الاستضافة والنطاقات والبريد وحسابك لدى GlobalHostia.',
    greeting: 'مرحباً! يمكنني المساعدة في الاستضافة والنطاقات والبريد وحسابك لدى GlobalHostia. كيف أساعدك؟',
    chips: ['اختيار باقة استضافة', 'التحقق من نطاق', 'التحدث مع الدعم'],
  },
};
export const parseOnOff = (s: string): 'on' | 'off' | null => (/\bON\b/i.test(s) && !/\bOFF\b/i.test(s) ? 'on' : /\bOFF\b/i.test(s) ? 'off' : null);

/* ------------------------------------------------------------------ strikes */
export interface StrikeCfg { perWindow: number; windowMs: number; cooldownMs: number; dailyMax: number }
export const DEFAULT_STRIKES: StrikeCfg = { perWindow: 3, windowMs: 10 * 60_000, cooldownMs: 30 * 60_000, dailyMax: 10 };
export type StrikeState = { state: 'ok' } | { state: 'cooldown' | 'blocked'; until: number };

/** `strikes`: times (ms) of off-topic messages from this visitor. Blocked for the day at dailyMax in 24h; cooldown after perWindow in windowMs. */
export function strikeState(strikes: number[], now: number, c: StrikeCfg = DEFAULT_STRIKES): StrikeState {
  const s = strikes.filter((t) => t <= now && now - t < 86_400_000).sort((a, b) => a - b);
  if (s.length >= c.dailyMax) return { state: 'blocked', until: s[s.length - c.dailyMax] + 86_400_000 };
  for (let i = s.length - 1; i >= c.perWindow - 1; i--) {
    if (s[i] - s[i - c.perWindow + 1] <= c.windowMs) {
      if (now - s[i] < c.cooldownMs) return { state: 'cooldown', until: s[i] + c.cooldownMs };
      break; // the latest trigger has expired; older ones are older still
    }
  }
  return { state: 'ok' };
}
