// Arabic for the shared chrome that the English helpers print (site shell, mega menus, footer, plan cards, cycle
// switch, domain search, empty states …), applied to an Arabic page after it is rendered: text nodes and a few
// attributes (aria-label, placeholder, title, alt) are matched against an exact-phrase dictionary and a short list of
// patterns. Product names, plan features from WHMCS and anything unknown stay as they are (technical English).
// Also: <html lang="ar" dir="rtl">, og:locale, internal links → their /ar equivalents, and the language switcher.
// Pure module: tests/arabic.test.mts.
import { AR_DEFS, arPathOf, arDefForEn, arDefForThemeSlug, hreflangLinks, enabledArDefs } from './ar-pages';

/* ------------------------------------------------------------------ dictionary (exact phrases, whitespace-normalised) */
export const AR_DICT: Record<string, string> = {
  // utility bar, header, drawer
  'Skip to content': 'انتقل إلى المحتوى', 'Client login': 'دخول العملاء', 'Sign up': 'إنشاء حساب', 'Submit a ticket': 'افتح تذكرة دعم',
  'Currency': 'العملة', 'Currency ': 'العملة ', 'Language': 'اللغة', 'Open menu': 'فتح القائمة', 'Close menu': 'إغلاق القائمة', 'Menu': 'القائمة', 'Main': 'الرئيسية', 'Mobile': 'القائمة',
  'Globalhostia home': 'الصفحة الرئيسية لـ GlobalHostia', 'Deals and domain prices': 'العروض وأسعار النطاقات', 'Help center': 'مركز المساعدة', 'Your account': 'حسابك', 'Cart': 'السلة',
  // mega menus (default menu, lib/theme/menu.ts)
  'Hosting': 'الاستضافة', 'Servers': 'الخوادم', 'Domains': 'النطاقات', 'Security': 'الأمان', 'Business tools': 'أدوات الأعمال', 'Business': 'الأعمال', 'Support': 'الدعم', 'Company': 'الشركة', 'Help': 'المساعدة', 'Email': 'البريد الإلكتروني', 'AI': 'الذكاء الاصطناعي',
  'Website hosting': 'استضافة المواقع', 'Web Hosting': 'استضافة المواقع', 'WordPress Hosting': 'استضافة WordPress', 'Shared and reseller': 'المشتركة والموزعون', 'Shared Hosting': 'الاستضافة المشتركة',
  'Reseller (cPanel)': 'استضافة الموزعين (cPanel)', 'Get started': 'ابدأ', 'Plan finder': 'اختيار الخطة', 'Free migration': 'نقل مجاني', 'Virtual servers': 'الخوادم الافتراضية',
  'VPS': 'خوادم VPS', 'Windows RDP': 'Windows RDP', 'All cloud servers': 'جميع الخوادم السحابية', 'Forex VPS': 'Forex VPS', 'Dedicated and specialised': 'المخصصة والمتخصصة', 'Dedicated Servers': 'الخوادم المخصصة',
  'AI / LLM Hosting': 'استضافة نماذج الذكاء الاصطناعي', 'n8n Automation': 'أتمتة n8n', 'Domain names': 'أسماء النطاقات', 'Register a domain': 'سجّل نطاقاً', 'Transfer a domain': 'انقل نطاقاً',
  'Domain pricing': 'أسعار النطاقات', '.ae domains': 'نطاقات .ae', 'Premium domains': 'النطاقات المميزة', 'Domain broker': 'وسيط النطاقات', 'SSL certificates': 'شهادات SSL', 'SSL Certificates': 'شهادات SSL',
  'Domain validated (DV)': 'التحقق من النطاق (DV)', 'More protection': 'حماية إضافية', 'Wildcard SSL': 'Wildcard SSL', 'Organisation validated (OV)': 'التحقق من المنشأة (OV)',
  'NVMe hosting in the USA, Malaysia and Singapore.': 'استضافة NVMe في الولايات المتحدة وماليزيا وسنغافورة.', 'WordPress installed, updated and backed up for you.': 'نثبّت WordPress ونحدّثه ونأخذ نسخاً احتياطية له.',
  'Lite, Ultra and Infinity plans with free SSL.': 'خطط Lite وUltra وInfinity مع SSL مجانية.', 'Host your own clients under your brand.': 'استضف عملاءك باسم علامتك التجارية.',
  'Four questions, one recommendation from our live plans.': 'أربعة أسئلة وتوصية واحدة من خططنا الحالية.', 'We move your site, databases and email for you.': 'ننقل موقعك وقواعد بياناتك وبريدك نيابة عنك.',
  'Linux and Windows VPS with full root access.': 'خوادم VPS بنظام Linux وWindows مع صلاحيات root كاملة.', 'Always-on Windows desktop in the cloud.': 'سطح مكتب Windows سحابي يعمل دائماً.',
  'Compare VPS, dedicated and RDP plans.': 'قارن خطط VPS والمخصصة وRDP.', 'Always-on servers for trading platforms.': 'خوادم تعمل دائماً لمنصات التداول.',
  'Bare metal from Xeon to Ryzen 9, up to 10Gbps.': 'خوادم فعلية من Xeon إلى Ryzen 9 بسرعة تصل إلى 10Gbps.', 'Servers sized for running language models.': 'خوادم بمواصفات مناسبة لتشغيل النماذج اللغوية.',
  'Self-hosted n8n on NVMe servers.': 'n8n على خوادمك بأقراص NVMe.', 'Search extensions and register in minutes.': 'ابحث في الامتدادات وسجّل خلال دقائق.', 'Move your domain to us at no cost.': 'انقل نطاقك إلينا دون تكلفة.',
  'Registration, renewal and transfer prices.': 'أسعار التسجيل والتجديد والنقل.', 'The UAE country domain for local businesses.': 'نطاق الإمارات للأعمال المحلية.', 'Short, brandable names for sale, price upfront.': 'أسماء قصيرة للبيع بسعر معلن.',
  'Want a taken domain? We negotiate it for you.': 'تريد نطاقاً محجوزاً؟ نتفاوض عليه نيابة عنك.', 'Domain, wildcard and organisation validated.': 'شهادات النطاق وWildcard والمنشأة.', 'Issued in minutes, secures your site fast.': 'تصدر خلال دقائق وتؤمّن موقعك بسرعة.',
  'One domain plus unlimited subdomains.': 'نطاق واحد مع نطاقات فرعية غير محدودة.', 'Your company name in the certificate.': 'اسم شركتك في الشهادة.',
  'Business Email': 'البريد الإلكتروني للأعمال', 'Business email': 'البريد الإلكتروني للأعمال', 'Google Workspace': 'Google Workspace', 'Business services': 'خدمات الأعمال', 'Project management': 'إدارة المشاريع', 'Website builder': 'منشئ المواقع',
  'Sell your domain': 'بِع نطاقك', 'AI connectors': 'موصلات الذكاء الاصطناعي', 'Connect Claude or ChatGPT': 'اربط Claude أو ChatGPT', 'New': 'جديد', 'Soon': 'قريباً', 'Popular': 'الأكثر طلباً', 'Recommended': 'موصى به', 'Most popular': 'الأكثر طلباً', 'Best value': 'أفضل قيمة',
  'From ': 'تبدأ من ', 'Starting at': 'تبدأ من', 'View all': 'عرض الكل', 'Compare plans': 'قارن الخطط', 'See plans': 'شاهد الخطط', 'Learn more': 'اعرف المزيد',
  // mega-menu featured panels and the remaining default menu groups
  'New: manage your hosting from Claude & ChatGPT': 'جديد: أدِر استضافتك من Claude و ChatGPT', 'Manage your hosting from Claude and ChatGPT': 'أدِر استضافتك من Claude و ChatGPT',
  'Manage hosting, DNS and email from Claude or ChatGPT.': 'أدِر الاستضافة وDNS والبريد من Claude أو ChatGPT.',
  'Free SSL included': 'شهادة SSL مجانية مشمولة', 'Web hosting': 'استضافة المواقع', 'From': 'تبدأ من', 'NVMe storage, free SSL, daily backups and engineers on call around the clock.': 'تخزين NVMe وشهادة SSL مجانية ونسخ احتياطي يومي ومهندسون متاحون على مدار الساعة.',
  'See all hosting plans': 'اعرض جميع خطط الاستضافة', 'Dedicated servers': 'الخوادم المخصصة', 'Bare-metal servers with 5 IPv4 addresses each, from Xeon to Ryzen 9.': 'خوادم فعلية مع 5 عناوين IPv4 لكل خادم، من Xeon إلى Ryzen 9.',
  'Compare dedicated servers': 'قارن الخوادم المخصصة', 'First-year prices': 'أسعار السنة الأولى', 'Search a domain': 'ابحث عن نطاق', 'Encryption your visitors can see': 'تشفير يراه زوارك',
  '256-bit encryption, wide browser recognition and free reissues on every certificate.': 'تشفير 256-bit وتوافق واسع مع المتصفحات وإعادة إصدار مجانية لكل شهادة.', 'Compare certificates': 'قارن الشهادات',
  'Work and collaboration': 'العمل والتعاون', 'Project Management workspace': 'مساحة عمل لإدارة المشاريع', 'Kanban boards, time tracking and a client portal.': 'لوحات Kanban وتتبع الوقت وبوابة للعملاء.',
  'Email, calendar and storage on your domain.': 'بريد وتقويم وتخزين على نطاقك.', 'Developers': 'المطورون', 'Hosted MCP servers on NVMe VPS.': 'خوادم MCP مستضافة على VPS بأقراص NVMe.',
  'Unlimited workflows on your own server.': 'سير عمل غير محدود على خادمك.', 'Your own workspace address': 'عنوان مساحة عمل خاص بك', 'Run projects on your own domain with your logo, client roles and daily backups.': 'أدِر مشاريعك على نطاقك بشعارك وأدوار العملاء ونسخ احتياطي يومي.',
  'See workspace plans': 'اعرض خطط مساحة العمل', 'Self-service': 'الخدمة الذاتية', 'Guides for hosting, domains, email and billing.': 'أدلة للاستضافة والنطاقات والبريد والفوترة.', 'Knowledgebase': 'قاعدة المعرفة',
  'Browse every article by product.': 'تصفّح المقالات حسب المنتج.', 'Hosting guides, how-tos and news.': 'أدلة الاستضافة والشروحات والأخبار.', 'Service health': 'حالة الخدمات', 'Status page': 'صفحة الحالة',
  'Live status of every datacenter and service.': 'الحالة المباشرة لكل مركز بيانات وخدمة.', 'Our locations and a live speed test from your browser.': 'مواقعنا واختبار سرعة مباشر من متصفحك.', 'Incident history': 'سجل الأعطال',
  'Past incidents and how they were resolved.': 'الأعطال السابقة وكيف عولجت.', 'Contact': 'اتصل بنا', 'Sales, billing and technical support.': 'المبيعات والفوترة والدعم الفني.', 'Engineers on call, 24/7': 'مهندسون متاحون على مدار الساعة',
  'Call, email or open a ticket at any hour.': 'اتصل أو راسلنا أو افتح تذكرة في أي ساعة.', 'Phone': 'الهاتف', 'Website': 'الموقع الإلكتروني', 'WhatsApp number': 'رقم واتساب', '(optional)': '(اختياري)',
  'Send me hosting deals and guides by email or WhatsApp. I can unsubscribe at any time.': 'أرسلوا لي عروض الاستضافة والأدلة بالبريد أو واتساب، ويمكنني إلغاء الاشتراك في أي وقت.',
  'Hosting for…': 'استضافة لـ…', 'Locations': 'المواقع', 'Domains A–Z': 'النطاقات من A إلى Z', 'In the UAE': 'في الإمارات', 'Web hosting in Dubai': 'استضافة المواقع في دبي', 'VPS hosting UAE': 'خوادم VPS في الإمارات',
  'Windows RDP UAE': 'Windows RDP في الإمارات', 'Choosing hosting in the UAE': 'اختيار الاستضافة في الإمارات', 'WhatsApp us': 'راسلنا على واتساب', 'WhatsApp us: chat with us on WhatsApp (opens in a new tab)': 'راسلنا على واتساب (يفتح في علامة تبويب جديدة)',
  'Not included:': 'غير مشمول:',
  // frequent WHMCS feature lines
  'Fast NVMe Storage and Real 24/7 Technical Support.': 'تخزين NVMe سريع ودعم فني حقيقي على مدار الساعة.', 'Fast SSD Storage and Real 24/7 Technical Support.': 'تخزين SSD سريع ودعم فني حقيقي على مدار الساعة.',
  'Unlimited Space': 'مساحة غير محدودة', 'Unlimited Database': 'قواعد بيانات غير محدودة', 'Anti-spam': 'مكافحة البريد المزعج', 'Calendar sync': 'مزامنة التقويم', 'Free reissues': 'إعادة إصدار مجانية',
  'Fast issuance in minutes': 'إصدار سريع خلال دقائق', 'Wildcard support': 'دعم Wildcard', 'Unlimited subdomains': 'نطاقات فرعية غير محدودة', 'Organization Validation': 'التحقق من المنشأة', 'Domain Validated (DV) certificate': 'شهادة التحقق من النطاق (DV)',
  '256-bit encryption': 'تشفير 256-bit', '99.9% browser recognition': 'توافق مع 99.9% من المتصفحات',
  // footer
  'Contact us': 'تواصل معنا', 'Sales and technical support, every hour of every day.': 'المبيعات والدعم الفني، في كل ساعة من كل يوم.', 'Call us': 'اتصل بنا', 'Email us': 'راسلنا بالبريد',
  'Chat on WhatsApp': 'تحدث عبر واتساب', 'Message us on WhatsApp': 'راسلنا على واتساب', 'Footer': 'تذييل الصفحة', 'Terms': 'الشروط', 'Privacy': 'الخصوصية', 'Cookie settings': 'إعدادات ملفات الارتباط', 'Cookies': 'ملفات الارتباط',
  'Prices shown live from our billing system.': 'الأسعار معروضة مباشرة من نظام الفوترة.', 'Back to top': 'العودة إلى الأعلى', 'Bitcoin': 'Bitcoin',
  'Products': 'المنتجات', 'Resources': 'المصادر', 'Legal': 'قانوني', 'About us': 'من نحن', 'About': 'من نحن', 'Blog': 'المدونة', 'Network': 'الشبكة', 'Our network': 'شبكتنا', 'System status': 'حالة الأنظمة', 'Status': 'الحالة',
  'Data centers': 'مراكز البيانات', 'Help Center': 'مركز المساعدة', 'Knowledge base': 'قاعدة المعرفة', 'Privacy policy': 'سياسة الخصوصية', 'Terms & conditions': 'الشروط والأحكام', 'Terms of service': 'شروط الخدمة', 'Guides': 'الأدلة', 'Compare': 'مقارنات',
  'Get hosting deals & guides': 'احصل على عروض الاستضافة والأدلة', 'Occasional offers and practical hosting tips. No spam.': 'عروض من حين لآخر ونصائح عملية في الاستضافة، دون رسائل مزعجة.', 'Sign me up': 'اشترك',
  'Your email': 'بريدك الإلكتروني', 'Email address': 'البريد الإلكتروني', 'Subscribe': 'اشترك', 'Thanks! You are on the list.': 'شكراً، تم تسجيلك في القائمة.',
  // plan cards (lib/theme/ui.ts)
  'Order now': 'اطلب الآن', 'Order Now': 'اطلب الآن', 'View details': 'عرض التفاصيل', 'See price': 'اعرض السعر', 'See price and order': 'اعرض السعر واطلب', 'Order': 'اطلب', 'Free': 'مجاناً', 'No charge': 'بدون رسوم',
  'Confirmed live in the order form': 'يُؤكَّد مباشرة في نموذج الطلب', '+VAT 5% where applicable': '+ ضريبة القيمة المضافة 5% حيثما تنطبق', 'Billing period': 'دورة الفوترة', 'Choose an option': 'اختر خياراً',
  'Monthly': 'شهري', 'Quarterly': 'ربع سنوي', '6 months': '6 أشهر', 'Yearly': 'سنوي', '2 years': 'سنتان', '3 years': '3 سنوات',
  '/ month': '/ شهر', '/ quarter': '/ 3 أشهر', '/ 6 months': '/ 6 أشهر', '/ year': '/ سنة', '/ 2 years': '/ سنتان', '/ 3 years': '/ 3 سنوات', 'one-time': 'دفعة واحدة',
  'Billed monthly': 'يُدفع شهرياً', 'Billed every 3 months': 'يُدفع كل 3 أشهر', 'Billed every 6 months': 'يُدفع كل 6 أشهر', 'Billed yearly': 'يُدفع سنوياً', 'Billed every 2 years': 'يُدفع كل سنتين', 'Billed every 3 years': 'يُدفع كل 3 سنوات', 'One-time payment': 'دفعة واحدة',
  'Plan': 'الخطة', 'Price': 'السعر', 'Plans': 'الخطط', 'Search plans': 'ابحث في الخطط', 'Sort plans': 'ترتيب الخطط', 'Recommended order': 'الترتيب المقترح', 'Price: low to high': 'السعر: من الأقل إلى الأعلى', 'Price: high to low': 'السعر: من الأعلى إلى الأقل', 'Name': 'الاسم',
  'No plans match. Clear the search or filters to see every plan.': 'لا توجد خطط مطابقة. امسح البحث أو عوامل التصفية لعرض جميع الخطط.', 'Show more plans': 'اعرض المزيد من الخطط', 'Not included: ': 'غير مشمول: ',
  'Hosting location': 'موقع الاستضافة', 'Talk to sales': 'تحدث مع المبيعات', 'Plans are being updated': 'يجري تحديث الخطط', 'Other': 'أخرى',
  // spec labels (lib/render/specs.ts)
  'Processor': 'المعالج', 'Memory': 'الذاكرة', 'Storage': 'التخزين', 'Bandwidth': 'نقل البيانات', 'IP addresses': 'عناوين IP', 'Websites': 'المواقع', 'Email accounts': 'حسابات البريد', 'Location': 'الموقع', 'Operating system': 'نظام التشغيل',
  'Validation': 'نوع التحقق', 'Domains covered': 'النطاقات المشمولة', 'Warranty': 'الضمان', 'Issuance': 'مدة الإصدار', 'Mailboxes': 'صناديق البريد', 'Storage per mailbox': 'التخزين لكل صندوق', 'Backup retention': 'مدة الاحتفاظ بالنسخ', 'Malware scanning': 'فحص البرمجيات الخبيثة',
  // domain search
  'Domain name': 'اسم النطاق', 'Search': 'بحث', 'Extensions': 'الامتدادات', 'Extension to add when you type a name without one': 'الامتداد المضاف عند كتابة اسم بدون امتداد', 'Search multiple domains': 'ابحث عن عدة نطاقات',
  'Type the name you want, for example yourbrand': 'اكتب الاسم الذي تريده، مثلاً yourbrand', 'Find your domain': 'ابحث عن نطاقك',
  // misc helpers
  'Breadcrumb': 'مسار التنقل', 'Close': 'إغلاق', 'Previous': 'السابق', 'Next': 'التالي', 'Copy': 'نسخ', 'Copied': 'تم النسخ', 'Loading…': 'جارٍ التحميل…',
  'Accepted payment methods: Visa, Mastercard, American Express, Discover, JCB, Maestro and Bitcoin': 'طرق الدفع المقبولة: Visa وMastercard وAmerican Express وDiscover وJCB وMaestro وBitcoin',
  'Ask our AI assistant': 'اسأل المساعد الذكي', 'Theme preview · switch back to the current site': 'معاينة التصميم · العودة إلى الموقع الحالي',
};

/** Datacenter / plan locations as WHMCS spells them → Arabic. */
const LOC: Record<string, string> = {
  USA: 'الولايات المتحدة', 'United States': 'الولايات المتحدة', US: 'الولايات المتحدة', Malaysia: 'ماليزيا', Singapore: 'سنغافورة', Germany: 'ألمانيا', France: 'فرنسا', 'United Kingdom': 'المملكة المتحدة', UK: 'المملكة المتحدة',
  Netherlands: 'هولندا', India: 'الهند', Brazil: 'البرازيل', Canada: 'كندا', Japan: 'اليابان', Australia: 'أستراليا', Europe: 'أوروبا', Finland: 'فنلندا', Poland: 'بولندا', UAE: 'الإمارات', Dubai: 'دبي', 'Hong Kong': 'هونغ كونغ',
};
export const arLocation = (l: string) => LOC[l.trim()] || l;
for (const [k, v] of Object.entries(LOC)) AR_DICT[k] ??= v;

/** Default trust claims (lib/theme/growth.ts TRUST_DEFAULTS) in Arabic: [bold part, rest]. Shown only while the English
 *  claim is on and unchanged from its default wording. */
export const AR_TRUST: Record<string, [string, string]> = {
  'price-lock': ['تثبيت السعر', 'سعر التجديد لا يرتفع أبداً'],
  'money-back': ['استرداد خلال 30 يوماً', 'على الاستضافة المشتركة'],
  migration: ['نقل الموقع مجاناً', ''],
  support: ['مهندسون على مدار الساعة', 'عبر التذاكر وواتساب'],
  payments: ['ادفع بالبطاقة أو بالعملات الرقمية', ''],
};

/** Patterns for strings with numbers or names inside (applied after the exact dictionary). */
const UNIT_AR: Record<string, string> = { month: 'شهر', quarter: '3 أشهر', '6 months': '6 أشهر', year: 'سنة', '2 years': 'سنتان', '3 years': '3 سنوات' };
export const AR_PATTERNS: [RegExp, string | ((...m: string[]) => string)][] = [
  [/^Renews at (.+?) \/ (month|quarter|6 months|year|2 years|3 years) · \+VAT 5% where applicable$/, (_, p, u) => `يُجدَّد بسعر ${p} / ${UNIT_AR[u]} · + ضريبة القيمة المضافة 5% حيثما تنطبق`],
  [/^Renews at (.+?) \/ (month|quarter|6 months|year|2 years|3 years)$/, (_, p, u) => `يُجدَّد بسعر ${p} / ${UNIT_AR[u]}`],
  [/^Order now: (.+)$/, 'اطلب الآن: $1'], [/^View details: (.+)$/, 'عرض التفاصيل: $1'], [/^See price and order: (.+)$/, 'اعرض السعر واطلب: $1'], [/^(?:See price|Order): (.+)$/, 'اطلب: $1'],
  [/^Show all (\d+) features$/, 'اعرض جميع المزايا ($1)'], [/^Search (\d+) plans$/, 'ابحث في $1 خطة'], [/^(\d+) plans$/, '$1 خطة'], [/^Filter by (.+)$/, 'تصفية حسب $1'], [/^Any (.+)$/, 'أي $1'],
  [/^save up to (\d+)%$/, 'وفّر حتى $1%'],
  [/^Prices shown live from our billing system, in ([A-Z]{3})\.$/, 'الأسعار معروضة مباشرة من نظام الفوترة، بعملة $1.'],
  [/^First-year prices in ([A-Z]{3})\. The renewal price is shown before you pay\.$/, 'أسعار السنة الأولى بعملة $1. يظهر سعر التجديد قبل الدفع.'],
  [/^Call us(?: on|:) (.+)$/, 'اتصل بنا: $1'], [/^© (\d{4}) (.+?) · GlobalHostia, Dubai, UAE\.$/, '© $1 $2 · GlobalHostia، دبي، الإمارات العربية المتحدة.'],
  [/^(.+) accepted$/, 'نقبل $1'],
  // plan meta line "Billed yearly, about $X a month, save 12%, plus $Y setup"
  [/^((?:Billed [a-z0-9 ]+|One-time payment)(?:, .+)?)$/, (_, s) => s.split(', ').map((part) => AR_DICT[part]
    || part.replace(/^about (.+) a month$/, 'حوالي $1 شهرياً').replace(/^save (\d+)%$/, 'وفّر $1%').replace(/^plus (.+) setup$/, 'إضافة إلى $1 رسوم إعداد')).join('، ')],
  // common WHMCS feature lines
  [/^(\d[\d.,]*\s?[GT]B) of Space$/i, 'مساحة $1'], [/^(\d[\d.,]*\s?[GT]B|Unlimited) Bandwidth$/i, (_, v) => `نقل بيانات ${/unlimited/i.test(v) ? 'غير محدود' : v}`],
  [/^(\d+|Unlimited) Email Id'?s$/i, (_, v) => `${/unlimited/i.test(v) ? 'غير محدود من' : v} حسابات البريد`], [/^(\d+|Unlimited) Websites?$/i, (_, v) => `${/unlimited/i.test(v) ? 'مواقع غير محدودة' : `${v} موقع`}`],
  [/^Free SSL( Certificate)?$/i, 'شهادة SSL مجانية'], [/^Daily Backups?$/i, 'نسخ احتياطي يومي'], [/^Weekly Backups?$/i, 'نسخ احتياطي أسبوعي'], [/^24\/7 Support$/i, 'دعم على مدار الساعة'], [/^Free Domain$/i, 'نطاق مجاني'],
  [/^(\d+) vCPU Cores?$/i, '$1 أنوية vCPU'], [/^Full Root Access$/i, 'صلاحيات root كاملة'], [/^(\d+) cores$/i, '$1 أنوية'],
  [/^(\d+) Databases?$/i, '$1 قواعد بيانات'], [/^(\d[\d.,]*\s?[GT]B) mailbox$/i, 'صندوق بريد $1'], [/^\$([\d,]+) warranty$/i, 'ضمان بقيمة $$$1'],
  // "$2.99 / month" style prices (menus, from-lines)
  [/^(\S*\d[\d.,]*) \/ (month|quarter|6 months|year|2 years|3 years)$/, (_, p, u) => `${p} / ${UNIT_AR[u]}`],
];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Translate one string (exact phrase, then patterns); unknown text comes back unchanged. */
export function trAr(s: string): string {
  const t = norm(s);
  if (!t || !/[A-Za-z]/.test(t)) return s;
  const lead = s.match(/^\s*/)![0], tail = s.match(/\s*$/)![0];
  const hit = AR_DICT[t];
  if (hit !== undefined) return lead + hit + tail;
  for (const [re, to] of AR_PATTERNS) {
    if (re.test(t)) return lead + (typeof to === 'string' ? t.replace(re, to) : t.replace(re, to as (...m: string[]) => string)) + tail;
  }
  return s;
}

/* ------------------------------------------------------------------ html pass */
const ATTRS = /\b(aria-label|placeholder|title|alt)="([^"]*)"/g;
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const reesc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reescAttr = (s: string) => reesc(s).replace(/"/g, '&quot;');

/** Translate text nodes + attributes of a fragment that holds no <script>/<style>. */
function pass(frag: string, links: Map<string, string>) {
  // sentinels so text right after a skipped <svg>/<code> block (or before the next one) is matched too
  return ('>' + frag + '<')
    .replace(/<([a-z][a-z0-9-]*)\b([^<>]*)>/gi, (tag, name: string, attrs: string) => {
      let a = attrs.replace(ATTRS, (m, k, v) => { const t = trAr(unesc(v)); return t === unesc(v) ? m : `${k}="${reescAttr(t)}"`; });
      // internal links → the Arabic equivalent (same anchor), when one is live
      if (name.toLowerCase() === 'a' && !a.includes('data-lang-switch')) a = a.replace(/\bhref="(\/[^"#?]*)(#[^"]*)?"/, (m, p: string, h = '') => { const to = links.get(p === '' ? '/' : p.replace(/\/$/, '') || '/'); return to ? `href="${to}${h}"` : m; });
      // domain search typing animation (theme.js): Arabic prefix instead of "Try "
      if (/\bdata-typing="/.test(a) && !/data-typing-prefix=/.test(a)) a += ' data-typing-prefix="جرّب: "';
      return `<${name}${a}>`;
    })
    .replace(/>([^<>]+)</g, (m, text: string) => { const raw = unesc(text); const t = trAr(raw); return t === raw ? m : `>${reesc(t)}<`; })
    .slice(1, -1);
}

/**
 * Localise a rendered Arabic page: chrome strings → Arabic, html lang/dir, og:locale, links to Arabic equivalents
 * (`links`: English path → Arabic path), and the language switcher pointing back to the English page (`enPath`).
 */
export function arabizeHtml(html: string, o: { links: Map<string, string>; enPath: string }) {
  let out = html
    .replace(/<html lang="en"([^>]*)>/, '<html lang="ar" dir="rtl"$1>')
    .replace('<meta property="og:locale" content="en_AE">', '<meta property="og:locale" content="ar_AE">');
  // language switcher (utility bar, drawer, footer) → English version of this page
  out = switcher(out, { href: o.enPath, label: 'English', lang: 'en', title: 'View this page in English' });
  // translate outside <script>, <style>, <svg>, <code>, <pre>, <textarea>
  const parts = out.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<svg\b[\s\S]*?<\/svg>|<code\b[\s\S]*?<\/code>|<pre\b[\s\S]*?<\/pre>|<textarea\b[\s\S]*?<\/textarea>)/i);
  // ".ae", ".com" inside Arabic sentences of the body: isolate them left-to-right (else the dot jumps: "ae.")
  let body = false;
  return parts.map((p, i) => {
    if (i % 2) return p;
    let t = pass(p, o.links);
    const at = body ? 0 : t.indexOf('<body');
    if (at < 0) return t;
    body = true;
    return t.slice(0, at) + ('>' + t.slice(at) + '<').replace(/>([^<>]*[\u0600-\u06ff][^<>]*)</g, (_m, x: string) => `>${isolateTlds(x)}<`).slice(1, -1);
  }).join('');
}

/** Wrap domain extensions in Arabic text in Unicode isolates (LRI … PDI). */
export const isolateTlds = (t: string) => t.replace(/(^|[\s(،:])(\.[a-z]{2,24}(?:\.[a-z]{2,10})?)(?=[\s،.؟:)]|$)/gi, '$1\u2066$2\u2069');

/** Replace the shell's static "Language English" pill and add switch links to the drawer and the footer legal line.
 *  Every replacement is a no-op when the shell markup it looks for is not there. */
export function switcher(html: string, o: { href: string; label: string; lang: 'ar' | 'en'; title: string }) {
  const a = (cls: string, inner: string) => `<a class="${cls}" href="${o.href}" hreflang="${o.lang}" lang="${o.lang}" title="${reescAttr(o.title)}" data-lang-switch>${inner}</a>`;
  return html
    .replace(/<span class="hp-u-item hp-u-lang">(<svg[\s\S]*?<\/svg>)[^<]*<b>[^<]*<\/b><\/span>/, (_m, svg) => a('hp-u-item hp-u-lang', `${svg}<b>${o.label}</b>`))
    .replace(/(<div class="hp-drawer__contact">)/, `<div class="hp-drawer__cur hp-drawer__lang">${a('hp-link', o.label)}</div>$1`)
    .replace(/(<p class="hp-legal">[\s\S]*?)(<br>)/, (_m, head, br) => `${head} · ${a('hp-legal__lang', o.label)}${br}`);
}

/**
 * English page with an Arabic equivalent: hreflang en/ar/x-default in <head> and the switcher linking to /ar/….
 * Pages without an Arabic version get a switcher to /ar (no hreflang). Only self-canonical, indexable pages get
 * hreflang (a noindex or canonicalised page must not join a pair).
 */
export function withArabicSwitch(html: string, o: { path: string; site: string; overrides: unknown }) {
  if (!html.includes('<html lang="en"')) return html;
  const live = enabledArDefs(o.overrides);
  if (!live.length) return html;
  const p = o.path === '' ? '/' : o.path.replace(/\/$/, '') || '/';
  const def = live.find((d) => d.en === p.toLowerCase());
  const home = live.find((d) => d.slug === '');
  const target = def ? arPathOf(def) : home ? arPathOf(home) : arPathOf(live[0]);
  let out = switcher(html, { href: target, label: 'العربية', lang: 'ar', title: def ? 'اعرض هذه الصفحة بالعربية' : 'الموقع بالعربية' });
  const canon = out.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const self = canon === `${o.site}${p === '/' ? '/' : p}`;
  if (def && self && !/<meta name="robots" content="noindex/.test(out) && !out.includes('hreflang="ar" href=')) {
    out = out.replace('</head>', `${hreflangLinks(o.site, def)}<meta property="og:locale:alternate" content="ar_AE">\n</head>`);
  }
  return out;
}

export { AR_DEFS, arDefForEn, arDefForThemeSlug };
