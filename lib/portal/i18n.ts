// Customer portal i18n: English (source) + Modern Standard Arabic. English strings are the keys; lib/portal/i18n-ar.ts
// holds the Arabic dictionary. The locale is bound per request with AsyncLocalStorage (route handler → withLocale),
// so the view functions call t() without threading a parameter through every helper.
// Pure module (node:async_hooks only), so tests can import it directly.
//
//   t('Domains')                                  → 'النطاقات' when Arabic is active
//   t('Invoice #{n}', { n: 5001 })                → placeholders {name} are replaced (values are inserted as given)
//   tn(3, '{n} day left', '{n} days left')        → plural: English one/other, Arabic CLDR categories
//
// Rules: keys are plain string literals (tests/i18n.test.mts scans the sources for t('…') / tn(…) and checks that every
// key has an Arabic entry). t() never escapes: callers keep passing the result through esc() exactly as before; strings
// with markup (<b>, <a>) are trusted dictionary text and their variables must be escaped by the caller.
import { AsyncLocalStorage } from 'node:async_hooks';

export type Lang = 'en' | 'ar';
export type Digits = 'latn' | 'arab';
export const LANG_COOKIE = 'gh_lang';
export const DIGITS_COOKIE = 'gh_digits';
export const LANGS: Lang[] = ['en', 'ar'];
/** WHMCS client language names (UpdateClient language=…) for each portal language. */
export const WHMCS_LANG: Record<Lang, string> = { en: 'english', ar: 'arabic' };

type ArEntry = string | { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string };
type Ctx = { lang: Lang; digits: Digits };
const als = new AsyncLocalStorage<Ctx>();

export const parseLang = (v: unknown): Lang => (v === 'ar' ? 'ar' : 'en');
export const parseDigits = (v: unknown): Digits => (v === 'arab' ? 'arab' : 'latn');

/** Run `fn` with this locale active (route handlers wrap GET/POST in it). */
export function withLocale<T>(c: { lang: Lang; digits?: Digits }, fn: () => T): T {
  return als.run({ lang: c.lang, digits: c.digits || 'latn' }, fn);
}
export const lang = (): Lang => als.getStore()?.lang || 'en';
export const digits = (): Digits => als.getStore()?.digits || 'latn';
export const isRtl = () => lang() === 'ar';
/** BCP 47 tag for Intl date / number formatting. Arabic keeps Latin digits unless the user chose Arabic-Indic. */
export const intlTag = () => (lang() === 'ar' ? `ar-AE-u-nu-${digits()}` : 'en-GB');
/** Money: en-US style in English ($25.20), ar-AE in Arabic (25.20 US$), always with the currency code from billing. */
export const moneyTag = () => (lang() === 'ar' ? `ar-AE-u-nu-${digits()}` : 'en-US');

const interp = (s: string, v?: Record<string, string | number>) =>
  v ? s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m)) : s;

/** Plain number in the active numbering system. */
export const fmtNum = (n: number) => (lang() === 'ar' ? new Intl.NumberFormat(intlTag()).format(n) : String(n));

function lookup(key: string): ArEntry | undefined {
  return lang() === 'ar' ? AR[key] : undefined;
}

/** Translate a UI string. Unknown keys fall back to English (never empty). */
export function t(key: string, vars?: Record<string, string | number>): string {
  const e = lookup(key);
  const s = typeof e === 'string' ? e : e && typeof e === 'object' ? e.other : key;
  return interp(s, vars ? numVars(vars) : vars);
}

/** Plural-aware translation. {n} is the count. Arabic entries keyed by `other` may give zero/one/two/few/many/other. */
export function tn(n: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const v = numVars({ n, ...(vars || {}) });
  const e = lookup(other);
  if (e !== undefined) {
    if (typeof e === 'string') return interp(e, v);
    const cat = new Intl.PluralRules('ar').select(n) as keyof typeof e;
    return interp((e[cat] as string | undefined) ?? e.other, v);
  }
  return interp(n === 1 ? one : other, v);
}

/** Numbers passed as variables follow the numbering system (Arabic-Indic when chosen). */
function numVars(v: Record<string, string | number>) {
  if (lang() !== 'ar' || digits() !== 'arab') return v;
  const o: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v)) o[k] = typeof x === 'number' ? fmtNum(x) : x;
  return o;
}

/** Billing-system status words shown in pills and filters (Active, Unpaid, …). */
export const tStatus = (s: string) => t(s);

/** Keys translated from data (billing statuses, cycles, months…): checked by tests/i18n.test.mts like literal t() keys. */
export const DYNAMIC_KEYS = [
  'Active', 'Pending', 'Suspended', 'Terminated', 'Cancelled', 'Fraud', 'Completed', 'Paid', 'Unpaid', 'Overdue', 'Refunded', 'Collections', 'Payment Pending',
  'Draft', 'Expired', 'Grace', 'Redemption', 'Transferred Away', 'Pending Transfer', 'Pending Registration', 'Open', 'Answered', 'Awaiting reply', 'Closed',
  'In progress', 'On hold', 'Unknown', 'Low', 'Medium', 'High', 'Free', 'One-time', 'Monthly', 'Quarterly', 'Semi-Annually', 'Annually', 'Biennially', 'Triennially',
  'Every 6 months', 'Yearly', 'Every 2 years', 'Every 3 years', '—', 'Domain registration',
  // DNS plan messages (lib/hosting/dns-plan.ts, lib/portal/dns.ts)
  'We could not load your hosting services right now.', 'We could not check your DNS settings right now.', 'The DNS server for this domain is not available right now.',
  'We could not reach your hosting server to find this domain.', 'Too many requests. Wait a minute and reload the page.', 'We could not load your DNS settings right now.',
  'DNS editing is not available on this server.', 'We could not read the DNS records right now.', 'another provider',
  // not-found / error subjects (route.ts notFound / failed)
  'page', 'service', 'domain', 'invoice', 'ticket', 'your services', 'this service', 'your domains', 'this domain', 'your invoices', 'this invoice', 'your tickets', 'this ticket', 'your profile',
] as const;

/**
 * Strings account.js needs (palette, portfolio, install / push UI). Rendered into the page as JSON by the frame.
 * Keys are English; values are the active translation.
 */
export const CLIENT_KEYS = [
  'Search your account', 'Search pages, services, domains, invoices…', 'No results for “{q}”', 'Recent', 'Pages', 'Services', 'Domains', 'Invoices', 'Tickets', 'Actions',
  'Loading…', 'Could not load your account data. Pages and actions still work.', 'to navigate', 'to open', 'to close',
  'Pay all unpaid invoices', 'Renew domains', 'Add DNS record for {d}', 'Open Manage hosting for {s}', 'Open a support ticket', 'Install the app', 'Switch language', 'Sign out',
  'Selected: {n}', '{n} domains shown', 'Checking…', 'Valid', 'Expires in {n} days', 'Expired', 'No certificate', 'Not checked', 'Locked', 'Unlocked', 'Unknown',
  'GlobalHostia', 'External', 'Mixed', 'Managed by us', 'Hosting account', 'Not set up', 'Off',
  'Notifications are blocked in this browser. Allow them in the site settings, then try again.', 'This browser does not support notifications.',
  'Notifications are on for this device.', 'Notifications are off for this device.', 'Saved.', 'Something went wrong. Please try again.', 'Test notification sent.',
  'Install GlobalHostia', 'Installed', 'Invoice #{n}', 'Due {d}', 'Expires {d}', 'Copied', 'Copy',
  'Turn notifications on', 'Turn notifications off', 'Change nameservers for {n} domains?', 'Ticket #{n}',
  'On iPhone and iPad, install the app first (Share → Add to Home Screen), then turn notifications on from the app.', 'Tickets',
  // feedback kit (public/hp/fx.js reads these from the page's dictionary; English copy mirrors lib/ux/errors.ts)
  'You seem to be offline. Check your connection and try again.', 'This is taking longer than usual. Please try again in a moment.',
  'Too many attempts in a short time. Please wait a minute, then try again.', 'Your session expired. Reload the page and sign in again to continue.',
  'This action is not allowed from this page. Reload the page and try again.', 'Please check the highlighted fields and try again.',
  'We could not find what you were looking for. It may have been moved or removed.',
  'This service is busy right now. Your websites and email keep running. Please try again in a few minutes.',
  'Something went wrong on our side. Please try again in a minute.', 'Try again', 'Close',
  'Still stuck? Message us on WhatsApp', 'Still stuck? Contact our team',
  // customer assistant entry points (palette action; the assistant's own strings live in public/hp/ai-assist.js)
  'Ask the assistant…', 'Ask the assistant: “{q}”', 'Assistant', 'Ask about your account in plain words', 'The assistant could not load. Please try again.',
] as const;

export function clientStrings(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of CLIENT_KEYS) o[k] = t(k);
  return o;
}

/* ============================================================== Arabic (Modern Standard Arabic) */
// Brand and product names stay in Latin script. Keep placeholders ({n}, {d}, …) and markup identical to the English key.
export const AR: Record<string, ArEntry> = {
  // ---- frame, navigation, menus
  'Dashboard': 'لوحة التحكم', 'Home': 'الرئيسية', 'Products & Services': 'المنتجات والخدمات', 'Products': 'المنتجات', 'Domains': 'النطاقات',
  'Renewals': 'التجديدات', 'Billing': 'الفواتير', 'Support': 'الدعم', 'Profile': 'الملف الشخصي', 'Team access': 'صلاحيات الفريق', 'Team': 'الفريق',
  'App & notifications': 'التطبيق والإشعارات', 'Settings': 'الإعدادات', 'Web hosting': 'استضافة المواقع', 'VPS servers': 'خوادم VPS',
  'Dedicated servers': 'الخوادم المخصصة', 'Register a domain': 'تسجيل نطاق', 'SSL certificates': 'شهادات SSL', 'Business email': 'بريد الأعمال',
  'Ask GlobalHostia': 'اسأل GlobalHostia', 'Ask the assistant': 'اسأل المساعد', 'Ask the assistant…': 'اسأل المساعد…', 'Ask the assistant: “{q}”': 'اسأل المساعد: «{q}»',
  'Assistant': 'المساعد', 'Ask about your account in plain words': 'اسأل عن حسابك بكلمات بسيطة', 'The assistant could not load. Please try again.': 'تعذّر تحميل المساعد. حاول مرة أخرى.',
  'My account': 'حسابي', 'Customer #{n}': 'العميل رقم {n}', 'Search': 'بحث', 'Search your account': 'ابحث في حسابك', 'Buy more': 'شراء المزيد',
  'Account menu for {name}': 'قائمة الحساب الخاصة بـ {name}', 'Install app': 'تثبيت التطبيق', 'Change password': 'تغيير كلمة المرور',
  'Advanced settings': 'الإعدادات المتقدمة', 'Sign out': 'تسجيل الخروج', 'Account': 'الحساب', 'Your account': 'حسابك', 'Account sections': 'أقسام الحساب',
  'Account sections (mobile)': 'أقسام الحساب (الجوال)', 'Need a hand?': 'هل تحتاج إلى مساعدة؟', 'Our engineers answer tickets around the clock.': 'يرد مهندسونا على التذاكر على مدار الساعة.',
  'Open a ticket': 'فتح تذكرة', 'Close': 'إغلاق', 'Results': 'النتائج', 'to navigate': 'للتنقل', 'to open': 'للفتح', 'to close': 'للإغلاق',
  'Search pages, services, domains, invoices…': 'ابحث في الصفحات والخدمات والنطاقات والفواتير…',
  'Install GlobalHostia on your iPhone or iPad': 'ثبّت GlobalHostia على iPhone أو iPad',
  'Open this page in <strong>Safari</strong>.': 'افتح هذه الصفحة في متصفح <strong>Safari</strong>.',
  'Tap the <strong>Share</strong> button at the bottom of the screen.': 'اضغط على زر <strong>المشاركة</strong> أسفل الشاشة.',
  'Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.': 'اختر <strong>إضافة إلى الشاشة الرئيسية</strong>، ثم اضغط <strong>إضافة</strong>.',
  'GlobalHostia then opens full screen from your home screen, like any other app.': 'بعدها يفتح GlobalHostia بملء الشاشة من شاشتك الرئيسية مثل أي تطبيق آخر.',
  'Got it': 'حسنًا',
  // ---- flash messages
  'Nameservers updated. Changes can take up to 24 hours to spread across the internet.': 'تم تحديث خوادم الأسماء. قد يستغرق انتشار التغييرات عبر الإنترنت حتى 24 ساعة.',
  'Ticket opened. Our team will reply by email and here in your account.': 'تم فتح التذكرة. سيرد فريقنا عبر البريد الإلكتروني وهنا في حسابك.',
  'Reply sent.': 'تم إرسال الرد.', 'Profile saved.': 'تم حفظ الملف الشخصي.', 'Your session form expired. Please try again.': 'انتهت صلاحية النموذج. يُرجى المحاولة مرة أخرى.',
  'We could not open that page right now. Please try again in a moment.': 'تعذّر فتح هذه الصفحة الآن. يُرجى المحاولة بعد قليل.',
  'Auto-renew is on. The domain renews automatically before it expires.': 'التجديد التلقائي مفعّل. يتجدد النطاق تلقائيًا قبل انتهاء صلاحيته.',
  'Auto-renew is off. Renew the domain yourself before it expires to keep it.': 'التجديد التلقائي متوقف. جدّد النطاق بنفسك قبل انتهاء صلاحيته للاحتفاظ به.',
  'Auto-renew could not be changed right now. Please try again or contact support.': 'تعذّر تغيير التجديد التلقائي الآن. يُرجى المحاولة مرة أخرى أو التواصل مع الدعم.',
  'Auto-renew can only be changed while the domain is active or in its grace period.': 'لا يمكن تغيير التجديد التلقائي إلا عندما يكون النطاق نشطًا أو في فترة السماح.',
  'Too many changes in a short time. Please wait a few minutes and try again.': 'تغييرات كثيرة خلال وقت قصير. يُرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى.',
  'Select at least one domain to renew.': 'اختر نطاقًا واحدًا على الأقل لتجديده.',
  'That change could not be saved. Please try again or contact support.': 'تعذّر حفظ هذا التغيير. يُرجى المحاولة مرة أخرى أو التواصل مع الدعم.',
  'Language updated.': 'تم تحديث اللغة.', 'Invitation sent. It stays pending until the person accepts it from the email.': 'تم إرسال الدعوة. تبقى معلّقة حتى يقبلها الشخص من البريد الإلكتروني.',
  'Permissions updated.': 'تم تحديث الصلاحيات.', 'Access removed.': 'تمت إزالة الوصول.', 'Only the account owner can manage team access.': 'يمكن لمالك الحساب فقط إدارة صلاحيات الفريق.',
  'Select at least one domain first.': 'اختر نطاقًا واحدًا على الأقل أولًا.', 'Your notification choices are saved.': 'تم حفظ اختياراتك للإشعارات.',
  'Test notification sent.': 'تم إرسال إشعار تجريبي.', 'No device received the test. Turn notifications on for this device first.': 'لم يستلم أي جهاز الإشعار التجريبي. فعّل الإشعارات على هذا الجهاز أولًا.',
  'Something went wrong. Please try again.': 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.', 'Notifications are not available yet. Please check back soon.': 'الإشعارات غير متاحة بعد. يُرجى المحاولة لاحقًا.',
  'Notifications are on for this device.': 'الإشعارات مفعّلة على هذا الجهاز.', 'Notifications are off for this device.': 'الإشعارات متوقفة على هذا الجهاز.', 'Saved.': 'تم الحفظ.',
  // ---- feedback kit (fx.js), flash help links, DNS server errors
  'You seem to be offline. Check your connection and try again.': 'يبدو أنك غير متصل بالإنترنت. تحقّق من اتصالك ثم حاول مرة أخرى.',
  'This is taking longer than usual. Please try again in a moment.': 'يستغرق هذا وقتًا أطول من المعتاد. يُرجى المحاولة مرة أخرى بعد قليل.',
  'Too many attempts in a short time. Please wait a minute, then try again.': 'محاولات كثيرة خلال وقت قصير. يُرجى الانتظار دقيقة ثم المحاولة مرة أخرى.',
  'Your session expired. Reload the page and sign in again to continue.': 'انتهت جلستك. أعد تحميل الصفحة وسجّل الدخول مرة أخرى للمتابعة.',
  'This action is not allowed from this page. Reload the page and try again.': 'هذا الإجراء غير مسموح من هذه الصفحة. أعد تحميل الصفحة ثم حاول مرة أخرى.',
  'Please check the highlighted fields and try again.': 'يُرجى مراجعة الحقول المحددة ثم المحاولة مرة أخرى.',
  'We could not find what you were looking for. It may have been moved or removed.': 'تعذّر العثور على ما تبحث عنه. ربما تم نقله أو إزالته.',
  'This service is busy right now. Your websites and email keep running. Please try again in a few minutes.': 'هذه الخدمة مشغولة الآن. مواقعك وبريدك يعملان كالمعتاد. يُرجى المحاولة مرة أخرى بعد بضع دقائق.',
  'Something went wrong on our side. Please try again in a minute.': 'حدث خطأ من جهتنا. يُرجى المحاولة مرة أخرى بعد دقيقة.',
  'Still stuck? Message us on WhatsApp': 'ما زالت المشكلة قائمة؟ راسلنا عبر واتساب', 'Still stuck? Contact our team': 'ما زالت المشكلة قائمة؟ تواصل مع فريقنا',
  'Reload the page': 'أعد تحميل الصفحة',
  'The DNS server took too long to answer. Please try again in a moment.': 'استغرق خادم DNS وقتًا طويلًا للرد. يُرجى المحاولة مرة أخرى بعد قليل.',
  'check the values and try again': 'تحقّق من القيم ثم حاول مرة أخرى',
  // ---- kit, shared
  'Free': 'مجاني', 'One-time': 'لمرة واحدة', '—': '—', "We couldn't load {what} right now": 'تعذّر تحميل {what} الآن',
  'Our billing system did not respond. Your services are not affected. Try again in a moment.': 'لم يستجب نظام الفوترة. خدماتك لم تتأثر. حاول مرة أخرى بعد قليل.',
  'Try again': 'إعادة المحاولة', 'Not found': 'غير موجود', "We couldn't find that {x}": 'تعذّر العثور على {x}',
  'It may have been removed, or it belongs to a different account.': 'ربما تمت إزالته، أو أنه يتبع حسابًا آخر.', 'Go back': 'رجوع',
  'page': 'هذه الصفحة', 'service': 'هذه الخدمة', 'domain': 'هذا النطاق', 'invoice': 'هذه الفاتورة', 'ticket': 'هذه التذكرة',
  'your services': 'خدماتك', 'this service': 'هذه الخدمة', 'your domains': 'نطاقاتك', 'this domain': 'هذا النطاق', 'your invoices': 'فواتيرك',
  'this invoice': 'هذه الفاتورة', 'your tickets': 'تذاكرك', 'this ticket': 'هذه التذكرة', 'your profile': 'ملفك الشخصي', 'your products': 'منتجاتك',
  'your renewals': 'تجديداتك', 'the ticket form': 'نموذج التذكرة',
  // statuses, cycles, priorities
  'Active': 'نشط', 'Pending': 'قيد الانتظار', 'Suspended': 'موقوف', 'Terminated': 'منتهٍ', 'Cancelled': 'ملغى', 'Fraud': 'احتيال', 'Completed': 'مكتمل',
  'Paid': 'مدفوعة', 'Unpaid': 'غير مدفوعة', 'Overdue': 'متأخرة', 'Refunded': 'مستردة', 'Collections': 'قيد التحصيل', 'Payment Pending': 'بانتظار الدفع', 'Draft': 'مسودة',
  'Expired': 'منتهي الصلاحية', 'Grace': 'فترة السماح', 'Redemption': 'فترة الاسترداد', 'Transferred Away': 'تم نقله', 'Pending Transfer': 'نقل قيد الانتظار',
  'Pending Registration': 'تسجيل قيد الانتظار', 'Open': 'مفتوحة', 'Answered': 'تم الرد', 'Awaiting reply': 'بانتظار ردك', 'Closed': 'مغلقة', 'In progress': 'قيد المعالجة',
  'On hold': 'معلّقة', 'Unknown': 'غير معروف', 'Low': 'منخفضة', 'Medium': 'متوسطة', 'High': 'عالية', 'Monthly': 'شهري', 'Quarterly': 'ربع سنوي',
  'Semi-Annually': 'نصف سنوي', 'Annually': 'سنوي', 'Biennially': 'كل سنتين', 'Triennially': 'كل ثلاث سنوات', 'Every 6 months': 'كل 6 أشهر', 'Yearly': 'سنويًا',
  'Every 2 years': 'كل سنتين', 'Every 3 years': 'كل 3 سنوات', 'Domain registration': 'تسجيل نطاق',
  // ---- dashboard
  'No renewal': 'لا يوجد تجديد', 'Due today': 'مستحقة اليوم', 'Service': 'الخدمة', 'Renews': 'يتجدد', 'Renew': 'تجديد', 'Manage': 'إدارة',
  'Good morning': 'صباح الخير', 'Good afternoon': 'مساء الخير', 'Good evening': 'مساء الخير', '{n} overdue': '{n} متأخرة', 'All paid up': 'لا توجد مستحقات',
  'Active services': 'الخدمات النشطة', '{n} in total': 'الإجمالي {n}', 'Amount due': 'المبلغ المستحق', 'Open tickets': 'التذاكر المفتوحة',
  'Here is your account at a glance.': 'إليك نظرة سريعة على حسابك.', 'Everything is running. Nothing needs your attention today.': 'كل شيء يعمل. لا شيء يحتاج إلى انتباهك اليوم.',
  'Your account is ready. Add your first service to get started.': 'حسابك جاهز. أضف خدمتك الأولى للبدء.', 'Renew and pay now': 'جدّد وادفع الآن',
  'Pay all due now': 'ادفع كل المستحقات الآن', 'Pay now': 'ادفع الآن', 'Renew and pay': 'جدّد وادفع', 'My Products': 'منتجاتي', 'No products yet': 'لا توجد منتجات بعد',
  'Hosting, servers and SSL certificates you order appear here with their status and renewal dates.': 'تظهر هنا الاستضافة والخوادم وشهادات SSL التي تطلبها مع حالتها ومواعيد تجديدها.',
  'Browse hosting': 'تصفح الاستضافة', 'View all': 'عرض الكل', 'View all {n}': 'عرض الكل ({n})', 'Invoices due': 'فواتير مستحقة', 'Invoice #{n}': 'الفاتورة رقم {n}',
  'Overdue since {d}': 'متأخرة منذ {d}', 'Due {d}': 'تستحق في {d}', 'Pay': 'ادفع', "You're all paid up.": 'لا توجد عليك مستحقات.', 'Recent tickets': 'أحدث التذاكر',
  'Ticket': 'تذكرة', 'updated {d}': 'آخر تحديث {d}', 'No open tickets.': 'لا توجد تذاكر مفتوحة.', 'New ticket': 'تذكرة جديدة', 'Add a service': 'إضافة خدمة',
  'Add a server or a domain': 'أضف خادمًا أو نطاقًا', 'VPS and dedicated servers, domains and SSL, all managed from this same account.': 'خوادم VPS والخوادم المخصصة والنطاقات وشهادات SSL، تُدار كلها من هذا الحساب نفسه.',
  'Find a domain': 'ابحث عن نطاق',
  // ---- renewals card / usage
  'Domain': 'النطاق', 'Auto-renew off': 'التجديد التلقائي متوقف', 'No charge': 'بدون رسوم', 'Pay invoice': 'ادفع الفاتورة', 'Invoice issued before the due date': 'تصدر الفاتورة قبل تاريخ الاستحقاق',
  'Was due {d}': 'كانت مستحقة في {d}', 'Expires {d}': 'ينتهي في {d}', 'Renews {d}': 'يتجدد في {d}', 'Invoice #{n} unpaid': 'الفاتورة رقم {n} غير مدفوعة',
  'Next renewals': 'التجديدات القادمة', "We couldn't load your services right now, so they are not listed here.": 'تعذّر تحميل خدماتك الآن، لذلك لا تظهر هنا.',
  "We couldn't load your domains right now, so they are not listed here.": 'تعذّر تحميل نطاقاتك الآن، لذلك لا تظهر هنا.', "We couldn't check for unpaid invoices.": 'تعذّر التحقق من الفواتير غير المدفوعة.',
  'Open billing': 'افتح الفواتير', 'Pay all due': 'ادفع كل المستحقات', 'Unpaid invoices': 'الفواتير غير المدفوعة', 'overdue': 'متأخرة',
  '{n} more renew in the next {d} days.': '{n} عناصر أخرى تتجدد خلال الأيام الـ {d} القادمة.', 'Nothing renews in the next {d} days.': 'لا شيء يتجدد خلال الأيام الـ {d} القادمة.',
  'Renew all domains ({n})': 'تجديد كل النطاقات ({n})', 'You review the cart and pay in the secure checkout.': 'تراجع السلة وتدفع في صفحة الدفع الآمنة.', 'Next {d} days': 'الأيام الـ {d} القادمة',
  'Not reported': 'غير متوفر', 'used · Unlimited': 'مستخدم · غير محدود', 'Limit reached': 'تم بلوغ الحد', 'Almost full': 'ممتلئ تقريبًا', 'Getting full': 'يقترب من الامتلاء', 'Healthy': 'جيد',
  '{u} of {l} used ({p}%)': 'تم استخدام {u} من {l} ({p}%)', 'of {l}': 'من {l}', '{x} used': 'استخدام {x}', 'Hosting': 'الاستضافة',
  'Usage figures appear after the first daily sync from the server.': 'تظهر أرقام الاستخدام بعد أول مزامنة يومية من الخادم.', 'Disk space': 'مساحة القرص', 'Bandwidth': 'نقل البيانات',
  'You have reached a plan limit.': 'لقد بلغت أحد حدود باقتك.', 'You are using {p}% of a plan limit.': 'أنت تستخدم {p}% من أحد حدود باقتك.', 'Upgrade to keep your site fast and online.': 'رقِّ باقتك ليبقى موقعك سريعًا ومتاحًا.',
  'Upgrade': 'ترقية', 'Updated {d}': 'آخر تحديث {d}', 'Hosting usage': 'استخدام الاستضافة', 'All {n}': 'الكل ({n})', 'Usage': 'الاستخدام', 'Renew all expiring ({n})': 'تجديد كل ما ينتهي قريبًا ({n})',
  // ---- renewal centre
  'Next 30 days': 'خلال 30 يومًا', '31–90 days': 'من 31 إلى 90 يومًا', 'Later': 'لاحقًا', 'Expires today': 'ينتهي اليوم', 'Tomorrow': 'غدًا',
  'Price on renewal': 'السعر عند التجديد', 'Current price': 'السعر الحالي', 'Renew & pay': 'جدّد وادفع', 'Renew early': 'جدّد مبكرًا', 'Get help': 'احصل على المساعدة',
  'Auto-renew for {d} is on. Turn off': 'التجديد التلقائي لـ {d} مفعّل. إيقافه', 'Auto-renew for {d} is off. Turn on': 'التجديد التلقائي لـ {d} متوقف. تفعيله',
  'Turn auto-renew off': 'إيقاف التجديد التلقائي', 'Turn auto-renew on': 'تفعيل التجديد التلقائي', 'Auto-renew on': 'التجديد التلقائي مفعّل', 'Select {x}': 'تحديد {x}',
  '+ {n} priced at renewal': '+ {n} يُحدَّد سعرها عند التجديد', 'Select all: {x}': 'تحديد الكل: {x}', 'with no invoice yet': 'دون فاتورة بعد',
  'Renew now to avoid suspension.': 'جدّد الآن لتجنّب الإيقاف.', 'Renew & pay now': 'جدّد وادفع الآن', 'Could not check': 'تعذّر التحقق', 'Pay all unpaid invoices': 'ادفع كل الفواتير غير المدفوعة',
  "We couldn't check for unpaid invoices, so open invoices may not be shown.": 'تعذّر التحقق من الفواتير غير المدفوعة، لذلك قد لا تظهر الفواتير المفتوحة.',
  'paid together in one secure checkout': 'تُدفع معًا في عملية دفع آمنة واحدة', 'Nothing to renew in the next 90 days': 'لا شيء للتجديد خلال الأيام الـ 90 القادمة',
  'Your next renewals are further out. You can see them under Later below.': 'تجديداتك القادمة أبعد من ذلك. يمكنك رؤيتها تحت «لاحقًا» أدناه.',
  'Services and domains you order appear here with their renewal dates and amounts.': 'تظهر هنا الخدمات والنطاقات التي تطلبها مع مواعيد تجديدها ومبالغها.',
  'Selected renewals': 'التجديدات المحددة', 'Selected:': 'المحدد:', 'item': 'عنصر', 'items': 'عناصر', 'priced at renewal': 'يُحدَّد سعرها عند التجديد', 'selected': 'المحددة',
  'domains': 'النطاقات', 'Renew services': 'تجديد الخدمات', 'early': 'مبكرًا', 'Pay all unpaid': 'ادفع كل غير المدفوع',
  'Several domains open the renewal cart, which lists every renewable domain: keep the ones you selected and check out.': 'عدة نطاقات تفتح سلة التجديد التي تعرض كل النطاقات القابلة للتجديد: أبقِ النطاقات التي اخترتها ثم أكمل الدفع.',
  'You review the renewal and pay in the secure checkout.': 'تراجع التجديد وتدفع في صفحة الدفع الآمنة.', 'Early service renewal is offered for eligible plans only.': 'التجديد المبكر للخدمات متاح للباقات المؤهلة فقط.',
  'Everything on your account that renews, with dates and amounts from your billing records.': 'كل ما يتجدد في حسابك، مع المواعيد والمبالغ من سجلات الفوترة.',
  // ---- services
  'Current': 'الحالية', 'All': 'الكل', 'Filter services': 'تصفية الخدمات', 'Nothing to show with this filter': 'لا يوجد ما يُعرض بهذا التصفية',
  'Switch to "All" to see cancelled and expired services.': 'انتقل إلى «الكل» لرؤية الخدمات الملغاة والمنتهية.', 'Hosting, VPS and dedicated servers you order appear here.': 'تظهر هنا الاستضافة وخوادم VPS والخوادم المخصصة التي تطلبها.',
  'All services': 'كل الخدمات', 'Current services': 'الخدمات الحالية', 'Copy {x}': 'نسخ {x}', 'Copy': 'نسخ', 'Copied': 'تم النسخ', 'Your server': 'خادمك',
  'Provisioned and active': 'مُجهّز ونشط', 'Service status: {s}': 'حالة الخدمة: {s}', 'IP address': 'عنوان IP', 'Assigned at setup': 'يُخصَّص عند الإعداد',
  'Operating system': 'نظام التشغيل', 'Location': 'الموقع', 'Username': 'اسم المستخدم', 'Power controls': 'التحكم في التشغيل', 'Start': 'تشغيل', 'Reboot': 'إعادة التشغيل',
  'Shut down': 'إيقاف التشغيل', 'Open console': 'فتح وحدة التحكم',
  'Power actions and the live console open in your secure server console, where you confirm each action.': 'تُفتح أوامر التشغيل ووحدة التحكم المباشرة في لوحة الخادم الآمنة، حيث تؤكد كل إجراء.',
  'Overview': 'نظرة عامة', 'Product': 'المنتج', 'Domain / hostname': 'النطاق / اسم المضيف', 'Dedicated IP': 'عنوان IP مخصص', 'Assigned IPs': 'عناوين IP المخصصة',
  'Password': 'كلمة المرور', 'Hidden for your security': 'مخفية حفاظًا على أمانك', 'Ordered on': 'تاريخ الطلب', 'Show login details': 'عرض بيانات الدخول',
  'Opens in your secure client area.': 'تُفتح في منطقة العملاء الآمنة.', 'Configuration': 'الإعدادات', 'Status': 'الحالة', 'Billing cycle': 'دورة الفوترة',
  'Recurring amount': 'المبلغ المتكرر', 'First payment': 'الدفعة الأولى', 'Next due date': 'تاريخ الاستحقاق القادم', 'Payment method': 'طريقة الدفع', 'Renew or pay': 'جدّد أو ادفع',
  'Upgrade or downgrade': 'ترقية أو تخفيض', 'Change plan and pay only the difference.': 'غيّر الباقة وادفع الفرق فقط.', 'Change plan': 'تغيير الباقة', 'DNS records': 'سجلات DNS',
  'Edit records for {d}.': 'عدّل سجلات {d}.', 'Manage DNS': 'إدارة DNS', 'Get help with this service': 'احصل على مساعدة بشأن هذه الخدمة', 'Opens a ticket linked to it.': 'يفتح تذكرة مرتبطة بها.',
  'Request cancellation': 'طلب الإلغاء', 'Choose immediate or end-of-term cancellation.': 'اختر الإلغاء الفوري أو عند نهاية المدة.', 'Request': 'طلب', 'Open control panel': 'فتح لوحة التحكم',
  'Hosting, servers and certificates on your account.': 'الاستضافة والخوادم والشهادات في حسابك.',
  // ---- invoices
  'Filter invoices': 'تصفية الفواتير', 'Balance due': 'الرصيد المستحق', 'Date': 'التاريخ', 'Due': 'الاستحقاق', 'Total': 'الإجمالي', 'View': 'عرض',
  'Invoice': 'الفاتورة', 'Actions': 'الإجراءات', 'No invoices with this status': 'لا توجد فواتير بهذه الحالة', 'No invoices yet': 'لا توجد فواتير بعد',
  'Invoices for your orders and renewals appear here.': 'تظهر هنا فواتير طلباتك وتجديداتك.', 'Invoices': 'الفواتير', 'Issued': 'تاريخ الإصدار', 'Billed to': 'صادرة باسم',
  'Description': 'الوصف', 'Amount': 'المبلغ', 'No line items.': 'لا توجد بنود.', 'Subtotal': 'المجموع الفرعي', 'Credit applied': 'الرصيد المطبق', 'Tax': 'الضريبة', 'Tax 2': 'الضريبة 2',
  'Pay this invoice': 'ادفع هذه الفاتورة', 'Payment': 'الدفع',
  'Pay securely by card or another supported method. Your card details are handled by our payment provider, never by this website.': 'ادفع بأمان بالبطاقة أو بوسيلة أخرى مدعومة. يتولى مزوّد الدفع لدينا بيانات بطاقتك، ولا يتعامل معها هذا الموقع أبدًا.',
  'Paid on {d}': 'دُفعت في {d}', 'This invoice is {s}.': 'حالة هذه الفاتورة: {s}.', 'Payment method: {m}': 'طريقة الدفع: {m}', 'Download PDF': 'تنزيل PDF',
  'Invoices, payments and receipts.': 'الفواتير والمدفوعات والإيصالات.',
  // ---- support
  'Filter tickets': 'تصفية التذاكر', 'opened {d}': 'فُتحت في {d}', 'Last update {d}': 'آخر تحديث {d}', 'No tickets yet': 'لا توجد تذاكر بعد', 'No open tickets': 'لا توجد تذاكر مفتوحة',
  'Questions about a service, a bill or anything technical? Our engineers reply around the clock.': 'لديك سؤال عن خدمة أو فاتورة أو أي أمر تقني؟ يرد مهندسونا على مدار الساعة.',
  'Tickets': 'التذاكر', 'Tell us what you need': 'أخبرنا بما تحتاج', 'Department': 'القسم', 'Choose a department': 'اختر قسمًا', 'Priority': 'الأولوية',
  'Related service': 'الخدمة المرتبطة', '(optional)': '(اختياري)', 'None': 'لا شيء', 'Subject': 'الموضوع', 'Message': 'الرسالة',
  'Include the domain or IP address, what you expected and what happened. Never share passwords in a ticket.': 'اذكر النطاق أو عنوان IP، وما كنت تتوقعه وما حدث فعلًا. لا تشارك كلمات المرور في التذكرة أبدًا.',
  'Open ticket': 'فتح التذكرة', 'Cancel': 'إلغاء', 'Faster answers': 'للحصول على ردود أسرع', 'Server not responding?': 'الخادم لا يستجيب؟',
  'Choose the related service so our engineers can check it straight away.': 'اختر الخدمة المرتبطة ليتمكن مهندسونا من فحصها فورًا.', 'Billing questions': 'أسئلة الفوترة',
  'Pick the billing department and include the invoice number.': 'اختر قسم الفوترة واذكر رقم الفاتورة.', 'Urgent outage': 'انقطاع عاجل',
  'Set priority to High. We monitor tickets around the clock.': 'اضبط الأولوية على «عالية». نتابع التذاكر على مدار الساعة.', 'You': 'أنت', 'Globalhostia support': 'دعم Globalhostia',
  'This ticket is closed. Replying here reopens it.': 'هذه التذكرة مغلقة. الرد هنا يعيد فتحها.', 'Conversation': 'المحادثة', 'No messages.': 'لا توجد رسائل.',
  'Reopen with a reply': 'أعد فتحها بالرد', 'Reply': 'الرد', 'Your reply': 'ردك', 'Write your reply': 'اكتب ردك', 'Send reply': 'إرسال الرد', 'Ticket details': 'تفاصيل التذكرة',
  'Opened': 'تاريخ الفتح', 'Last update': 'آخر تحديث', 'Ticket #{n}': 'التذكرة رقم {n}', 'Tickets with our engineers, answered around the clock.': 'تذاكر مع مهندسينا، يُرد عليها على مدار الساعة.',
  'Write a reply before sending.': 'اكتب ردًا قبل الإرسال.', 'Your reply could not be sent right now. It is kept below; try again in a moment.': 'تعذّر إرسال ردك الآن. تم الاحتفاظ به أدناه؛ حاول مرة أخرى بعد قليل.',
  'We could not open your ticket right now. Your message is kept below; try again in a moment.': 'تعذّر فتح تذكرتك الآن. تم الاحتفاظ برسالتك أدناه؛ حاول مرة أخرى بعد قليل.',
  'Choose a department.': 'اختر قسمًا.', 'Add a short subject (at least 3 characters).': 'أضف موضوعًا قصيرًا (3 أحرف على الأقل).', 'Keep the subject under 150 characters.': 'اجعل الموضوع أقل من 150 حرفًا.',
  'Describe the issue in a few words (at least 10 characters).': 'صِف المشكلة ببضع كلمات (10 أحرف على الأقل).', 'Choose one of your services.': 'اختر إحدى خدماتك.',
  // ---- profile
  'Enter your first name.': 'أدخل اسمك الأول.', 'Enter your last name.': 'أدخل اسم العائلة.', 'Use digits, spaces and an optional + country code.': 'استخدم الأرقام والمسافات مع رمز الدولة + اختياريًا.',
  'Enter your street address.': 'أدخل عنوان الشارع.', 'Enter your city.': 'أدخل مدينتك.', 'Use letters, digits, spaces or hyphens.': 'استخدم الحروف أو الأرقام أو المسافات أو الشرطات.',
  'Choose your country.': 'اختر بلدك.', 'Check the highlighted fields and try again.': 'راجع الحقول المحددة ثم حاول مرة أخرى.', 'Contact': 'بيانات التواصل', 'First name': 'الاسم الأول',
  'Last name': 'اسم العائلة', 'Company': 'الشركة', 'Phone': 'الهاتف', 'Billing address': 'عنوان الفوترة', 'Street address': 'عنوان الشارع', 'City': 'المدينة',
  'State / emirate': 'الولاية / الإمارة', 'Postcode': 'الرمز البريدي', 'Country': 'الدولة', 'Save changes': 'حفظ التغييرات', 'Your address appears on future invoices.': 'يظهر عنوانك على الفواتير القادمة.',
  'Sign-in and security': 'تسجيل الدخول والأمان', 'Email address': 'البريد الإلكتروني', 'Set': 'مُعيَّنة', 'Two-step verification': 'التحقق بخطوتين', 'On': 'مفعّل', 'Off': 'متوقف',
  'Change email': 'تغيير البريد الإلكتروني', 'These open in your secure client area, where you confirm the change.': 'تُفتح هذه في منطقة العملاء الآمنة، حيث تؤكد التغيير.', 'Your details': 'بياناتك',
  'Your contact details and sign-in settings.': 'بيانات التواصل وإعدادات تسجيل الدخول.', 'Your changes could not be saved right now. Please try again in a moment.': 'تعذّر حفظ تغييراتك الآن. يُرجى المحاولة بعد قليل.',
  // ---- sign in / reset
  'That email and password combination did not match an account. Check both and try again.': 'لا يطابق هذا البريد الإلكتروني وكلمة المرور أي حساب. تحقق منهما وحاول مرة أخرى.',
  'Too many sign-in attempts. Wait 15 minutes, then try again or reset your password.': 'محاولات دخول كثيرة. انتظر 15 دقيقة ثم حاول مرة أخرى أو أعد تعيين كلمة المرور.',
  'Sign-in is temporarily unavailable. Please try again in a few minutes.': 'تسجيل الدخول غير متاح مؤقتًا. يُرجى المحاولة بعد بضع دقائق.', 'Your sign-in form expired. Please try again.': 'انتهت صلاحية نموذج الدخول. يُرجى المحاولة مرة أخرى.',
  'Forgot password?': 'نسيت كلمة المرور؟', 'Show password': 'إظهار كلمة المرور', 'Hide password': 'إخفاء كلمة المرور', 'Sign in': 'تسجيل الدخول', 'Globalhostia account': 'حساب Globalhostia',
  'Encrypted with HTTPS. Your password is never stored on this website.': 'اتصال مشفّر عبر HTTPS. لا تُخزَّن كلمة مرورك على هذا الموقع أبدًا.', 'Products and servers': 'المنتجات والخوادم',
  'Status, IP addresses, renewal dates and one-click access to your control panel.': 'الحالة وعناوين IP ومواعيد التجديد والدخول إلى لوحة التحكم بنقرة واحدة.',
  'Expiry dates, auto-renew and nameservers you can change yourself.': 'تواريخ الانتهاء والتجديد التلقائي وخوادم أسماء يمكنك تغييرها بنفسك.', 'Billing and support': 'الفوترة والدعم',
  'Invoices, secure payment and tickets answered around the clock.': 'الفواتير والدفع الآمن وتذاكر يُرد عليها على مدار الساعة.',
  'Your account uses two-step verification. <a href="{u}">Continue on our secure sign-in page</a> to enter your code.': 'يستخدم حسابك التحقق بخطوتين. <a href="{u}">تابع إلى صفحة الدخول الآمنة</a> لإدخال الرمز.',
  'You have signed out.': 'لقد سجّلت الخروج.', 'Everything you host, in one place.': 'كل ما تستضيفه في مكان واحد.',
  'Manage services, pay invoices and talk to our engineers from your account.': 'أدر خدماتك وادفع فواتيرك وتواصل مع مهندسينا من حسابك.',
  'Use the email address and password on your Globalhostia account.': 'استخدم البريد الإلكتروني وكلمة المرور الخاصين بحسابك في Globalhostia.', 'Forgot your password?': 'نسيت كلمة المرور؟',
  'Create an account': 'إنشاء حساب', 'You stay signed in for up to 8 hours on this device. Use <b>Sign out</b> in the account menu on shared computers.': 'تبقى مسجّل الدخول حتى 8 ساعات على هذا الجهاز. استخدم <b>تسجيل الخروج</b> من قائمة الحساب على الأجهزة المشتركة.',
  'Check your email': 'تحقق من بريدك الإلكتروني', 'that address': 'هذا العنوان',
  'If <b>{e}</b> is on an account, we have sent a link to reset your password. It can take a few minutes. Check your spam folder too.': 'إذا كان <b>{e}</b> مسجلًا في حساب، فقد أرسلنا رابطًا لإعادة تعيين كلمة المرور. قد يستغرق ذلك بضع دقائق. تحقق من مجلد الرسائل غير المرغوب فيها أيضًا.',
  'Back to sign in': 'العودة إلى تسجيل الدخول', 'Send another link': 'إرسال رابط آخر', 'Contact support': 'التواصل مع الدعم', 'Reset your password': 'إعادة تعيين كلمة المرور',
  "Enter the email address on your account and we'll send you a link to choose a new password.": 'أدخل البريد الإلكتروني المسجل في حسابك وسنرسل لك رابطًا لاختيار كلمة مرور جديدة.',
  'Enter a valid email address.': 'أدخل بريدًا إلكترونيًا صحيحًا.', 'Your form expired. Please try again.': 'انتهت صلاحية النموذج. يُرجى المحاولة مرة أخرى.', 'Send reset link': 'إرسال رابط إعادة التعيين',
  'Reset password': 'إعادة تعيين كلمة المرور', 'Locked out? You will be back in shortly.': 'لا تستطيع الدخول؟ ستعود قريبًا.', 'We email a one-time link so only you can choose a new password.': 'نرسل رابطًا لمرة واحدة عبر البريد الإلكتروني حتى تختار أنت وحدك كلمة مرور جديدة.',
  'Reset link by email': 'رابط إعادة التعيين عبر البريد', 'Sent to the address on your account within a few minutes.': 'يُرسل إلى عنوان بريد حسابك خلال بضع دقائق.', 'Choose a new password': 'اختر كلمة مرور جديدة',
  'Pick a strong password you do not use anywhere else.': 'اختر كلمة مرور قوية لا تستخدمها في أي مكان آخر.', 'Still stuck?': 'ما زلت تواجه مشكلة؟',
  'Our support team can verify your identity and help you back in.': 'يمكن لفريق الدعم التحقق من هويتك ومساعدتك على العودة إلى حسابك.',
  // ---- DNS editor
  '5 minutes': '5 دقائق', '30 minutes': '30 دقيقة', '1 hour': 'ساعة واحدة', '4 hours': '4 ساعات', '1 day': 'يوم واحد', 'IPv4 address of your server.': 'عنوان IPv4 لخادمك.',
  'IPv6 address of your server.': 'عنوان IPv6 لخادمك.', 'Host name this name is an alias of. Not allowed on @.': 'اسم المضيف الذي يُعد هذا الاسم بديلًا له. غير مسموح على @.',
  'Mail server host name. Lower priority is tried first.': 'اسم مضيف خادم البريد. تُجرَّب الأولوية الأقل أولًا.', 'Text value, without surrounding quotes.': 'قيمة نصية، دون علامات اقتباس حولها.',
  'Target host. Name must look like _service._tcp.': 'المضيف الهدف. يجب أن يكون الاسم بصيغة ‎_service._tcp.', 'Type': 'النوع', 'Name': 'الاسم', 'Use @ for {z} itself, or a name like www.': 'استخدم @ لـ {z} نفسه، أو اسمًا مثل www.',
  'Value': 'القيمة', 'Weight': 'الوزن', 'Port': 'المنفذ', 'port {p} · weight {w}': 'المنفذ {p} · الوزن {w}', 'Managed by GlobalHostia': 'تديره GlobalHostia', 'Protected': 'محمي',
  'Edit': 'تعديل', 'Delete': 'حذف', 'Delete record': 'حذف السجل', 'Keep it': 'الإبقاء عليه', 'Copy value': 'نسخ القيمة', 'TTL': 'مدة البقاء (TTL)',
  'Delete the <b>{t}</b> record for <b class="ac-mono">{n}</b>? Services using it stop resolving once caches expire.': 'حذف سجل <b>{t}</b> الخاص بـ <b class="ac-mono">{n}</b>؟ تتوقف الخدمات التي تستخدمه عن العمل بعد انتهاء صلاحية الذاكرة المؤقتة.',
  'Adds MX smtp.google.com and an SPF record.': 'يضيف سجل MX ‏smtp.google.com وسجل SPF.', 'MX {m}. Check the exact value in your Microsoft 365 admin center.': 'سجل MX ‏{m}. تحقق من القيمة الدقيقة في مركز إدارة Microsoft 365.',
  'Sets A records for {z} and www.{z}, replacing the current ones.': 'يضبط سجلات A لـ {z} و www.{z} بدلًا من السجلات الحالية.', 'Adds a TXT record. Existing records are kept.': 'يضيف سجل TXT. تبقى السجلات الحالية كما هي.',
  'Gmail MX record and SPF for your domain.': 'سجل MX لـ Gmail وسجل SPF لنطاقك.', 'Outlook MX, SPF and Autodiscover.': 'سجلات MX وSPF وAutodiscover لـ Outlook.', 'Point to an IP': 'التوجيه إلى عنوان IP',
  'Your domain and www to a server address.': 'نطاقك و www إلى عنوان خادم.', 'Verification TXT': 'سجل TXT للتحقق', 'Prove ownership to Google, Microsoft, Meta and others.': 'أثبت ملكيتك لدى Google وMicrosoft وMeta وغيرها.',
  'Server IP address': 'عنوان IP للخادم', 'Verification value': 'قيمة التحقق', 'Apply {x}': 'تطبيق {x}',
  'We point <b>{d}</b> to {ns}. Records kept by your current DNS host (for example email MX) are not copied, so check you have what you need below first.': 'سنوجّه <b>{d}</b> إلى {ns}. لا تُنسخ السجلات الموجودة لدى مزوّد DNS الحالي (مثل سجلات MX للبريد)، لذا تأكد أولًا من وجود ما تحتاجه أدناه.',
  'Switch nameservers': 'تبديل خوادم الأسماء', 'On your hosting plan': 'ضمن باقة الاستضافة',
  'Record added. Most resolvers see the change within the record’s TTL.': 'تمت إضافة السجل. تلاحظ معظم الخوادم التغيير خلال مدة TTL الخاصة بالسجل.', 'Record updated.': 'تم تحديث السجل.', 'Record deleted.': 'تم حذف السجل.',
  'Template applied. Your records are updated below.': 'تم تطبيق القالب. سجلاتك محدثة أدناه.', 'DNS management is on. Your zone was created with our standard records.': 'إدارة DNS مفعّلة. أُنشئت منطقتك بسجلاتنا القياسية.',
  'Nameservers switched to GlobalHostia DNS. The change can take a few hours to reach every network.': 'تم تحويل خوادم الأسماء إلى GlobalHostia DNS. قد يستغرق وصول التغيير إلى كل الشبكات بضع ساعات.',
  'DNS records can be managed once the domain is active.': 'يمكن إدارة سجلات DNS بعد تفعيل النطاق.', 'DNS settings are unavailable right now': 'إعدادات DNS غير متاحة الآن', 'Your domain keeps working.': 'يستمر نطاقك في العمل.',
  'DNS for this domain is linked to another account': 'DNS لهذا النطاق مرتبط بحساب آخر', 'This can happen after a domain moves between accounts. Our team can move it to you.': 'قد يحدث ذلك بعد نقل النطاق بين الحسابات. يمكن لفريقنا نقله إليك.',
  'Your DNS is managed by {w}': 'تتم إدارة DNS لديك لدى {w}', 'another provider': 'مزوّد آخر', 'Records for {z} are edited there. These are the nameservers it uses today:': 'تُعدَّل سجلات {z} هناك. هذه خوادم الأسماء التي يستخدمها حاليًا:',
  'Prefer to manage DNS here? We create your zone with standard records first, then switch the nameservers in one step.': 'تفضّل إدارة DNS هنا؟ ننشئ منطقتك بالسجلات القياسية أولًا، ثم نبدّل خوادم الأسماء في خطوة واحدة.',
  'Use GlobalHostia DNS': 'استخدام GlobalHostia DNS', 'To manage DNS here, our team needs to prepare your zone first.': 'لإدارة DNS هنا، يحتاج فريقنا إلى تجهيز منطقتك أولًا.', 'Ask support': 'اسأل الدعم',
  'Some of this domain’s nameservers are not ours. Set only GlobalHostia nameservers above so every visitor gets the same records.': 'بعض خوادم الأسماء لهذا النطاق ليست تابعة لنا. اضبط خوادم GlobalHostia فقط أعلاه ليحصل كل زائر على السجلات نفسها.',
  'We could not read this domain’s nameservers from the registry just now.': 'تعذّرت قراءة خوادم الأسماء لهذا النطاق من السجل الآن.', 'Turn on DNS management': 'تفعيل إدارة DNS',
  '{z} uses GlobalHostia nameservers but has no DNS zone yet, so it does not resolve. Turning it on creates the zone with our standard records (website, www and mail), then you can edit every record here.': 'يستخدم {z} خوادم أسماء GlobalHostia لكن ليست له منطقة DNS بعد، لذلك لا يعمل. التفعيل ينشئ المنطقة بسجلاتنا القياسية (الموقع و www والبريد)، ثم يمكنك تعديل كل سجل هنا.',
  'Ask support to turn it on': 'اطلب من الدعم تفعيلها', 'These records are not live yet.': 'هذه السجلات غير فعّالة بعد.',
  '{z} uses some nameservers at another provider, so the internet still reads its DNS there.': 'يستخدم {z} بعض خوادم الأسماء لدى مزوّد آخر، لذلك ما زالت الإنترنت تقرأ سجلاته من هناك.',
  '{z} uses nameservers at another provider, so the internet still reads its DNS there.': 'يستخدم {z} خوادم أسماء لدى مزوّد آخر، لذلك ما زالت الإنترنت تقرأ سجلاته من هناك.',
  'We could not read your DNS records': 'تعذّرت قراءة سجلات DNS الخاصة بك', 'Show record types': 'عرض أنواع السجلات', 'Add a record': 'إضافة سجل', 'A, AAAA, CNAME, MX, TXT and SRV': 'A و AAAA و CNAME و MX و TXT و SRV',
  'Add record': 'إضافة السجل', 'New records are usually visible within minutes.': 'تظهر السجلات الجديدة عادةً خلال دقائق.', 'This zone has no records yet. Add one above or apply a template.': 'لا توجد سجلات في هذه المنطقة بعد. أضف سجلًا أعلاه أو طبّق قالبًا.',
  'Live on {ns}': 'فعّالة على {ns}', 'Zone for {z}': 'منطقة {z}', 'Quick setup': 'إعداد سريع', 'Nameserver (NS) and SOA records are managed by GlobalHostia and cannot be changed here.': 'تدير GlobalHostia سجلات خوادم الأسماء (NS) وSOA ولا يمكن تغييرها هنا.',
  'DNS can be managed once the domain is active.': 'يمكن إدارة DNS بعد تفعيل النطاق.', 'Too many changes in a short time. Try again in {n} seconds.': 'تغييرات كثيرة خلال وقت قصير. حاول مرة أخرى بعد {n} ثانية.',
  'We could not reach the DNS server right now. Please try again.': 'تعذّر الوصول إلى خادم DNS الآن. يُرجى المحاولة مرة أخرى.', 'The DNS server refused the change: {m}': 'رفض خادم DNS التغيير: {m}',
  'That change could not be saved. Please try again.': 'تعذّر حفظ هذا التغيير. يُرجى المحاولة مرة أخرى.', 'DNS management cannot be turned on for this domain here. Please contact support.': 'لا يمكن تفعيل إدارة DNS لهذا النطاق هنا. يُرجى التواصل مع الدعم.',
  'We cannot switch this domain to GlobalHostia DNS automatically. Please contact support.': 'لا يمكننا تحويل هذا النطاق إلى GlobalHostia DNS تلقائيًا. يُرجى التواصل مع الدعم.',
  'The registry did not accept the nameserver change. Your DNS zone is ready; please try again in a moment.': 'لم يقبل السجل تغيير خوادم الأسماء. منطقة DNS جاهزة؛ يُرجى المحاولة بعد قليل.',
  'DNS for this domain is not managed here yet.': 'لا تتم إدارة DNS لهذا النطاق هنا بعد.', 'DNS editing is not available on this server.': 'تعديل DNS غير متاح على هذا الخادم.',
  'That record no longer exists. The list below is up to date.': 'لم يعد هذا السجل موجودًا. القائمة أدناه محدّثة.', 'Nameserver records are managed by GlobalHostia and cannot be changed here.': 'تدير GlobalHostia سجلات خوادم الأسماء ولا يمكن تغييرها هنا.',
  'Unknown action.': 'إجراء غير معروف.', 'We could not load your hosting services right now.': 'تعذّر تحميل خدمات الاستضافة الخاصة بك الآن.', 'We could not check your DNS settings right now.': 'تعذّر التحقق من إعدادات DNS الآن.',
  'The DNS server for this domain is not available right now.': 'خادم DNS لهذا النطاق غير متاح الآن.', 'We could not reach your hosting server to find this domain.': 'تعذّر الوصول إلى خادم الاستضافة للعثور على هذا النطاق.',
  'Too many requests. Wait a minute and reload the page.': 'طلبات كثيرة. انتظر دقيقة ثم أعد تحميل الصفحة.', 'We could not load your DNS settings right now.': 'تعذّر تحميل إعدادات DNS الآن.',
  'We could not read the DNS records right now.': 'تعذّرت قراءة سجلات DNS الآن.',
  // ---- domain detail
  'Nameserver {n}': 'خادم الأسماء {n}', "We couldn't read the current nameservers from the registry. You can still set new ones below.": 'تعذّرت قراءة خوادم الأسماء الحالية من السجل. لا يزال بإمكانك تعيين خوادم جديدة أدناه.',
  'Save nameservers': 'حفظ خوادم الأسماء', 'Changes usually take effect within a few hours, and up to 24 hours worldwide.': 'تسري التغييرات عادةً خلال بضع ساعات، وقد تصل إلى 24 ساعة حول العالم.',
  'Nameservers can be changed once the domain is active.': 'يمكن تغيير خوادم الأسماء بعد تفعيل النطاق.', 'Domain details': 'تفاصيل النطاق', 'Registered': 'تاريخ التسجيل', 'Expires': 'تاريخ الانتهاء',
  'Auto-renew': 'التجديد التلقائي', 'Renewal price': 'سعر التجديد', 'ID protection': 'حماية الهوية', 'Renew domain': 'تجديد النطاق', 'More settings': 'إعدادات أخرى',
  'A, AAAA, CNAME, MX, TXT and SRV records.': 'سجلات A و AAAA و CNAME و MX و TXT و SRV.', 'Contact information': 'بيانات جهات الاتصال', 'Registrant, admin and technical contacts.': 'جهات اتصال المسجِّل والإدارة والدعم الفني.',
  'Transfer code and lock': 'رمز النقل والقفل', 'Get the EPP code or change the registrar lock.': 'احصل على رمز EPP أو غيّر قفل المسجِّل.', 'Nameservers': 'خوادم الأسماء',
  'Enter a nameserver. Domains need at least two.': 'أدخل خادم أسماء. تحتاج النطاقات إلى خادمين على الأقل.', 'Enter a hostname like ns1.example.com (no http:// or spaces).': 'أدخل اسم مضيف مثل ns1.example.com (دون http://‎ أو مسافات).',
  'This nameserver is already listed above.': 'خادم الأسماء هذا مدرج بالفعل أعلاه.',
  'The registry did not accept these nameservers. Check that each one exists and is spelled correctly, then try again.': 'لم يقبل السجل خوادم الأسماء هذه. تأكد من وجود كل منها ومن صحة كتابته، ثم حاول مرة أخرى.',
  // ---- domain portfolio
  'Lock at the registry': 'القفل لدى السجل', 'Unlock at the registry': 'فك القفل لدى السجل', 'Use GlobalHostia nameservers': 'استخدام خوادم أسماء GlobalHostia',
  'not available for this domain status': 'غير متاح في حالة هذا النطاق الحالية', 'the registry or billing system refused the change': 'رفض السجل أو نظام الفوترة التغيير', 'not found on your account': 'غير موجود في حسابك',
  'the change did not apply': 'لم يُطبَّق التغيير', 'no DNS zone here yet: turn on DNS on the domain page first': 'لا توجد منطقة DNS هنا بعد: فعّل DNS من صفحة النطاق أولًا', 'too many changes, try again later': 'تغييرات كثيرة، حاول لاحقًا',
  'Lock': 'القفل', 'SSL': 'SSL', 'Mixed': 'مختلطة', 'External': 'خارجية', 'Your domains': 'نطاقاتك', 'No domains yet': 'لا توجد نطاقات بعد',
  'Search for the perfect name, or transfer a domain you already own.': 'ابحث عن الاسم المثالي، أو انقل نطاقًا تملكه بالفعل.', 'Expiring in 30 days': 'تنتهي خلال 30 يومًا', 'Renew to keep them': 'جدّدها للاحتفاظ بها',
  'Nothing urgent': 'لا شيء عاجل', 'Expiring in 90 days': 'تنتهي خلال 90 يومًا', 'Including the next 30 days': 'تشمل الأيام الـ 30 القادمة', 'Renew these yourself': 'جدّدها بنفسك', 'All renew automatically': 'كلها تتجدد تلقائيًا',
  'Search domains': 'ابحث في النطاقات', 'All statuses': 'كل الحالات', 'Grace / redemption': 'السماح / الاسترداد', 'Cancelled or transferred': 'ملغاة أو منقولة', 'Sort by': 'الترتيب حسب',
  'Expiry: soonest first': 'الانتهاء: الأقرب أولًا', 'Expiry: latest first': 'الانتهاء: الأبعد أولًا', 'Name: A to Z': 'الاسم: من A إلى Z', 'Quick filters': 'تصفية سريعة',
  'Expiring ≤ 30 days': 'تنتهي خلال ≤ 30 يومًا', 'Expiring ≤ 90 days': 'تنتهي خلال ≤ 90 يومًا', 'External nameservers': 'خوادم أسماء خارجية', 'Apply': 'تطبيق', 'Clear filters': 'مسح عوامل التصفية',
  'Select all shown domains': 'تحديد كل النطاقات المعروضة', 'No domains match these filters.': 'لا توجد نطاقات تطابق عوامل التصفية هذه.', 'Export CSV': 'تصدير CSV', 'Register another': 'سجّل نطاقًا آخر',
  'Bulk actions': 'إجراءات جماعية', 'Up to {n} domains at a time.': 'حتى {n} نطاقًا في كل مرة.', 'Unlock': 'فك القفل', 'Renew selected': 'تجديد المحدد', 'Use GlobalHostia nameservers?': 'استخدام خوادم أسماء GlobalHostia؟',
  'We switch each selected domain to the GlobalHostia nameservers of the hosting account or DNS zone it already has here. Domains without a DNS zone here are skipped, so nothing stops resolving.': 'نحوّل كل نطاق محدد إلى خوادم أسماء GlobalHostia الخاصة بحساب الاستضافة أو منطقة DNS الموجودة له هنا. يتم تخطي النطاقات التي لا تملك منطقة DNS هنا، حتى لا يتوقف أي منها عن العمل.',
  'Records kept at your current DNS host (for example email MX) are not copied. The change can take a few hours to reach every network.': 'لا تُنسخ السجلات الموجودة لدى مزوّد DNS الحالي (مثل سجلات MX للبريد). قد يستغرق وصول التغيير إلى كل الشبكات بضع ساعات.',
  'Your domain portfolio: renewals, auto-renew, registrar lock, nameservers and SSL.': 'محفظة نطاقاتك: التجديدات والتجديد التلقائي وقفل المسجِّل وخوادم الأسماء وSSL.',
  'Valid': 'صالحة', 'Expires in {n} days': 'تنتهي خلال {n} يوم', 'Not trusted': 'غير موثوقة', 'No certificate': 'لا توجد شهادة', 'Not checked': 'لم يتم الفحص', 'Hosting account': 'حساب الاستضافة',
  'Managed by us': 'نديره نحن', 'DNS': 'DNS', 'Locked': 'مقفل', 'Unlocked': 'غير مقفل', 'Checking…': 'جارٍ التحقق…', 'Not set up': 'غير مُعَدّ', 'GlobalHostia': 'GlobalHostia',
  'Change nameservers for {n} domains?': 'تغيير خوادم الأسماء لـ {n} من النطاقات؟', 'Selected: {n}': 'المحدد: {n}',
  // ---- team
  'Account profile': 'ملف الحساب', 'Contacts': 'جهات الاتصال', 'View services': 'عرض الخدمات', 'Manage services': 'إدارة الخدمات', 'Control panel sign-in': 'الدخول إلى لوحة التحكم',
  'View domains': 'عرض النطاقات', 'Manage domains': 'إدارة النطاقات', 'Invoices and payments': 'الفواتير والمدفوعات', 'Quotes': 'عروض الأسعار', 'Support tickets': 'تذاكر الدعم',
  'Affiliates': 'برنامج الشركاء', 'Email history': 'سجل الرسائل', 'Place orders': 'تقديم الطلبات', 'Services': 'الخدمات', 'Developer': 'مطوّر', 'Full access': 'وصول كامل', 'Custom': 'مخصص',
  'Services and domains, control panel sign-in and tickets. No billing.': 'الخدمات والنطاقات والدخول إلى لوحة التحكم والتذاكر. دون الفوترة.',
  'Invoices, payments, quotes and billing emails. No technical access.': 'الفواتير والمدفوعات وعروض الأسعار ورسائل الفوترة. دون وصول تقني.',
  'Everything the owner can do, except managing team access.': 'كل ما يستطيع المالك فعله، باستثناء إدارة صلاحيات الفريق.', 'Choose exactly what this person can see and do.': 'اختر بدقة ما يمكن لهذا الشخص رؤيته وفعله.',
  'Access level': 'مستوى الوصول', 'Custom permissions': 'صلاحيات مخصصة', 'Ticked boxes apply when "Custom" is selected.': 'تُطبَّق الخانات المحددة عند اختيار «مخصص».', 'Owner': 'المالك',
  'Permissions not available': 'الصلاحيات غير متاحة', 'No access': 'دون وصول', "We couldn't load your team right now": 'تعذّر تحميل فريقك الآن', 'You can still manage users in the secure client area.': 'لا يزال بإمكانك إدارة المستخدمين في منطقة العملاء الآمنة.',
  'Open user management': 'فتح إدارة المستخدمين', 'Change access': 'تغيير الوصول', 'Save access': 'حفظ الوصول', 'Remove': 'إزالة',
  'Remove <b>{x}</b> from this account? They can no longer sign in to it. Their own login stays, and you can invite them again later.': 'إزالة <b>{x}</b> من هذا الحساب؟ لن يتمكن من الدخول إليه بعد الآن. يبقى حسابه الشخصي للدخول، ويمكنك دعوته مجددًا لاحقًا.',
  'Remove access': 'إزالة الوصول', 'you': 'أنت', 'People with access': 'الأشخاص الذين لديهم وصول', 'Only you can sign in to this account.': 'أنت وحدك من يمكنه الدخول إلى هذا الحساب.',
  'Some permissions could not be read here. Open user management to see them.': 'تعذّرت قراءة بعض الصلاحيات هنا. افتح إدارة المستخدمين لرؤيتها.', 'Manage team access': 'إدارة صلاحيات الفريق',
  'Only the account owner can invite people or change access.': 'يمكن لمالك الحساب فقط دعوة الأشخاص أو تغيير صلاحياتهم.', 'Invite someone': 'دعوة شخص', 'Send invitation': 'إرسال الدعوة',
  'They get an email to accept. If they have no login yet, they create one.': 'يصله بريد إلكتروني لقبول الدعوة. إذا لم يكن لديه حساب دخول، ينشئ واحدًا.', 'Pending invitations': 'الدعوات المعلّقة',
  'Invitations that have not been accepted yet, and resending or cancelling them, are managed in the secure client area.': 'تُدار الدعوات التي لم تُقبل بعد، وإعادة إرسالها أو إلغاؤها، في منطقة العملاء الآمنة.',
  'Manage invitations': 'إدارة الدعوات', 'How access works': 'كيف يعمل الوصول', 'Their own login': 'حساب دخول خاص بكل شخص', 'Each person signs in with their own email and password, never yours.': 'يسجّل كل شخص الدخول ببريده الإلكتروني وكلمة مروره، وليس ببياناتك أبدًا.',
  'Only what you allow': 'فقط ما تسمح به', 'Developers see services and domains, not invoices. Billing contacts see invoices, not servers.': 'يرى المطوّرون الخدمات والنطاقات دون الفواتير. ويرى مسؤولو الفوترة الفواتير دون الخوادم.',
  'Remove at any time': 'الإزالة في أي وقت', 'Removing access takes effect at their next page load.': 'تسري إزالة الوصول عند تحميلهم للصفحة التالية.',
  'People who can sign in to this account, and what each of them can do.': 'الأشخاص الذين يمكنهم الدخول إلى هذا الحساب، وما يمكن لكل منهم فعله.',
  'Team access could not be changed right now. Please try again in a moment.': 'تعذّر تغيير صلاحيات الفريق الآن. يُرجى المحاولة بعد قليل.', 'This person already has access to your account.': 'هذا الشخص لديه وصول إلى حسابك بالفعل.',
  'Choose at least one permission.': 'اختر صلاحية واحدة على الأقل.', 'Choose an access level.': 'اختر مستوى الوصول.',
  'The invitation could not be sent. The person may already have a pending invitation. Please try again or manage invitations in the client area.': 'تعذّر إرسال الدعوة. ربما لدى هذا الشخص دعوة معلّقة بالفعل. يُرجى المحاولة مرة أخرى أو إدارة الدعوات في منطقة العملاء.',
  // ---- settings, app, notifications
  'Support ticket replies': 'الردود على تذاكر الدعم', 'New and overdue invoices': 'الفواتير الجديدة والمتأخرة', 'Domains expiring within 7 days': 'النطاقات التي تنتهي خلال 7 أيام', 'Service suspended': 'إيقاف خدمة',
  'When our team answers one of your tickets.': 'عندما يرد فريقنا على إحدى تذاكرك.', 'When an invoice is issued, and when one becomes overdue.': 'عند إصدار فاتورة، وعندما تتأخر إحداها.',
  'A reminder a week before a domain expires.': 'تذكير قبل أسبوع من انتهاء النطاق.', 'If a service is suspended, so you can restore it quickly.': 'إذا أُوقفت خدمة، لتتمكن من استعادتها بسرعة.',
  'Install the app': 'تثبيت التطبيق', 'Open your account from the home screen or dock, full screen, with notifications. Nothing to download from an app store.': 'افتح حسابك من الشاشة الرئيسية أو شريط التطبيقات بملء الشاشة ومع الإشعارات، دون تنزيل أي شيء من متجر التطبيقات.',
  'How to install on iPhone or iPad': 'طريقة التثبيت على iPhone أو iPad', 'Installed on this device': 'مثبّت على هذا الجهاز',
  'In Chrome or Edge, use the install icon in the address bar. On iPhone or iPad, use Share → Add to Home Screen in Safari.': 'في Chrome أو Edge، استخدم أيقونة التثبيت في شريط العنوان. على iPhone أو iPad، استخدم المشاركة ← إضافة إلى الشاشة الرئيسية في Safari.',
  'Notifications': 'الإشعارات', 'Checking this device…': 'جارٍ التحقق من هذا الجهاز…', 'No device receives notifications yet.': 'لا يستقبل أي جهاز الإشعارات بعد.', 'Turn notifications on': 'تفعيل الإشعارات',
  'Turn notifications off': 'إيقاف الإشعارات', 'Notify me about': 'أرسل لي إشعارات بشأن', 'Save choices': 'حفظ الاختيارات', 'Send a test notification': 'إرسال إشعار تجريبي',
  'Turn notifications on for this device first.': 'فعّل الإشعارات على هذا الجهاز أولًا.', 'Language and numbers': 'اللغة والأرقام', 'Language': 'اللغة', 'Digits in Arabic': 'الأرقام في العربية',
  'Latin digits (0123)': 'أرقام لاتينية (0123)', 'Arabic-Indic digits (٠١٢٣)': 'أرقام عربية مشرقية (٠١٢٣)',
  'Amounts keep their currency code. Your choice is also saved to your billing profile, so emails and invoices use the same language.': 'تحتفظ المبالغ برمز العملة. يُحفظ اختيارك أيضًا في ملف الفوترة، لتصلك الرسائل والفواتير باللغة نفسها.',
  'Save': 'حفظ', 'Good to know': 'معلومات مفيدة', 'Private by design': 'الخصوصية أولًا',
  'Notifications show a short summary, such as an invoice number or a domain name. Full details open after you sign in.': 'تعرض الإشعارات ملخصًا قصيرًا، مثل رقم فاتورة أو اسم نطاق. تظهر التفاصيل الكاملة بعد تسجيل الدخول.',
  'Per device': 'لكل جهاز', 'Turn notifications on in each browser or phone where you want them.': 'فعّل الإشعارات في كل متصفح أو هاتف تريد استقبالها عليه.', 'Email stays on': 'البريد الإلكتروني يبقى مفعّلًا',
  'You still get the usual emails for invoices and tickets.': 'ستظل تصلك رسائل البريد المعتادة للفواتير والتذاكر.', 'Email preferences': 'تفضيلات البريد الإلكتروني',
  'Install GlobalHostia as an app, choose notifications and set your language.': 'ثبّت GlobalHostia كتطبيق، واختر الإشعارات، واضبط لغتك.',
  'Notifications are blocked in this browser. Allow them in the site settings, then try again.': 'الإشعارات محظورة في هذا المتصفح. اسمح بها من إعدادات الموقع ثم حاول مرة أخرى.',
  'This browser does not support notifications.': 'هذا المتصفح لا يدعم الإشعارات.', 'Install GlobalHostia': 'تثبيت GlobalHostia', 'Installed': 'مثبّت',
  'On iPhone and iPad, install the app first (Share → Add to Home Screen), then turn notifications on from the app.': 'على iPhone و iPad، ثبّت التطبيق أولًا (المشاركة ← إضافة إلى الشاشة الرئيسية)، ثم فعّل الإشعارات من داخل التطبيق.',
  // push messages
  'New reply on ticket #{n}': 'رد جديد على التذكرة رقم {n}', 'Our support team replied to your ticket.': 'رد فريق الدعم على تذكرتك.', 'New invoice #{n}': 'فاتورة جديدة رقم {n}',
  '{a} due {d}.': '{a} تستحق في {d}.', 'Invoice #{n} is overdue': 'الفاتورة رقم {n} متأخرة', '{a} was due {d}. Pay now to avoid interruption.': '{a} كانت مستحقة في {d}. ادفع الآن لتجنّب انقطاع الخدمة.',
  '{d} expires soon': 'ينتهي {d} قريبًا', 'Service suspended: {s}': 'تم إيقاف الخدمة: {s}', '{d} is suspended. Pay any open invoice or contact support to restore it.': 'تم إيقاف {d}. ادفع أي فاتورة مفتوحة أو تواصل مع الدعم لاستعادتها.',
  'Pay any open invoice or contact support to restore it.': 'ادفع أي فاتورة مفتوحة أو تواصل مع الدعم لاستعادتها.', 'GlobalHostia notifications are on': 'إشعارات GlobalHostia مفعّلة',
  'This is a test. You will be notified like this about the topics you chose.': 'هذا إشعار تجريبي. ستصلك إشعارات مثله بشأن المواضيع التي اخترتها.',
  // palette
  'Recent': 'الأخيرة', 'Pages': 'الصفحات', 'No results for “{q}”': 'لا توجد نتائج لـ «{q}»', 'Loading…': 'جارٍ التحميل…',
  'Could not load your account data. Pages and actions still work.': 'تعذّر تحميل بيانات حسابك. الصفحات والإجراءات ما زالت تعمل.', 'Renew domains': 'تجديد النطاقات',
  'Add DNS record for {d}': 'إضافة سجل DNS لـ {d}', 'Open Manage hosting for {s}': 'فتح إدارة الاستضافة لـ {s}', 'Open a support ticket': 'فتح تذكرة دعم', 'Switch language': 'تغيير اللغة',
  // ---- plurals (Arabic CLDR categories: zero, one, two, few = 3–10, many = 11–99, other)
  '{n} days overdue': { zero: 'متأخر منذ اليوم', one: 'متأخر يومًا واحدًا', two: 'متأخر يومين', few: 'متأخر {n} أيام', many: 'متأخر {n} يومًا', other: 'متأخر {n} يوم' },
  'in {n} days': { zero: 'اليوم', one: 'خلال يوم واحد', two: 'خلال يومين', few: 'خلال {n} أيام', many: 'خلال {n} يومًا', other: 'خلال {n} يوم' },
  '{n} days left': { zero: 'لم يتبقَّ وقت', one: 'يتبقى يوم واحد', two: 'يتبقى يومان', few: 'تتبقى {n} أيام', many: 'يتبقى {n} يومًا', other: 'يتبقى {n} يوم' },
  'Expired {n} days ago': { one: 'انتهى قبل يوم واحد', two: 'انتهى قبل يومين', few: 'انتهى قبل {n} أيام', many: 'انتهى قبل {n} يومًا', other: 'انتهى قبل {n} يوم' },
  'expired {n} days ago': { one: 'انتهى قبل يوم واحد', two: 'انتهى قبل يومين', few: 'انتهى قبل {n} أيام', many: 'انتهى قبل {n} يومًا', other: 'انتهى قبل {n} يوم' },
  '{n} invoices': { zero: 'لا فواتير', one: 'فاتورة واحدة', two: 'فاتورتان', few: '{n} فواتير', many: '{n} فاتورة', other: '{n} فاتورة' },
  '{n} unpaid invoices': { zero: 'لا فواتير غير مدفوعة', one: 'فاتورة واحدة غير مدفوعة', two: 'فاتورتان غير مدفوعتين', few: '{n} فواتير غير مدفوعة', many: '{n} فاتورة غير مدفوعة', other: '{n} فاتورة غير مدفوعة' },
  '{n} items': { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '{n} عناصر', many: '{n} عنصرًا', other: '{n} عنصر' },
  '{n} records': { zero: 'لا سجلات', one: 'سجل واحد', two: 'سجلان', few: '{n} سجلات', many: '{n} سجلًا', other: '{n} سجل' },
  '{n} years': { one: 'سنة واحدة', two: 'سنتان', few: '{n} سنوات', many: '{n} سنة', other: '{n} سنة' },
  '{n} yrs': { one: 'سنة', two: 'سنتان', few: '{n} سنوات', many: '{n} سنة', other: '{n} سنة' },
  '{n} services overdue': { one: 'خدمة واحدة متأخرة', two: 'خدمتان متأخرتان', few: '{n} خدمات متأخرة', many: '{n} خدمة متأخرة', other: '{n} خدمة متأخرة' },
  '{n} services are overdue': { one: 'خدمة واحدة متأخرة', two: 'خدمتان متأخرتان', few: '{n} خدمات متأخرة', many: '{n} خدمة متأخرة', other: '{n} خدمة متأخرة' },
  '{n} services are overdue — renew now to avoid suspension.': { one: 'خدمة واحدة متأخرة — جدّدها الآن لتجنّب الإيقاف.', two: 'خدمتان متأخرتان — جدّدهما الآن لتجنّب الإيقاف.', few: '{n} خدمات متأخرة — جدّدها الآن لتجنّب الإيقاف.', many: '{n} خدمة متأخرة — جدّدها الآن لتجنّب الإيقاف.', other: '{n} خدمة متأخرة — جدّدها الآن لتجنّب الإيقاف.' },
  'You have {n} items that need attention.': { one: 'لديك عنصر واحد يحتاج إلى انتباهك.', two: 'لديك عنصران يحتاجان إلى انتباهك.', few: 'لديك {n} عناصر تحتاج إلى انتباهك.', many: 'لديك {n} عنصرًا يحتاج إلى انتباهك.', other: 'لديك {n} عنصر يحتاج إلى انتباهك.' },
  '{n} domains shown': { zero: 'لا توجد نطاقات معروضة', one: 'نطاق واحد معروض', two: 'نطاقان معروضان', few: '{n} نطاقات معروضة', many: '{n} نطاقًا معروضًا', other: '{n} نطاق معروض' },
  '{n} domains updated': { one: 'تم تحديث نطاق واحد', two: 'تم تحديث نطاقين', few: 'تم تحديث {n} نطاقات', many: 'تم تحديث {n} نطاقًا', other: 'تم تحديث {n} نطاق' },
  '{n} already set': { one: 'نطاق واحد مضبوط مسبقًا', two: 'نطاقان مضبوطان مسبقًا', few: '{n} نطاقات مضبوطة مسبقًا', many: '{n} نطاقًا مضبوطًا مسبقًا', other: '{n} نطاق مضبوط مسبقًا' },
  '{n} active': { zero: 'لا نطاقات نشطة', one: 'نطاق واحد نشط', two: 'نطاقان نشطان', few: '{n} نطاقات نشطة', many: '{n} نطاقًا نشطًا', other: '{n} نطاق نشط' },
  'people': { zero: 'أشخاص', one: 'شخص', two: 'شخصان', few: 'أشخاص', many: 'شخصًا', other: 'شخص' },
  'Notifications are on for {n} devices on your account.': { one: 'الإشعارات مفعّلة على جهاز واحد في حسابك.', two: 'الإشعارات مفعّلة على جهازين في حسابك.', few: 'الإشعارات مفعّلة على {n} أجهزة في حسابك.', many: 'الإشعارات مفعّلة على {n} جهازًا في حسابك.', other: 'الإشعارات مفعّلة على {n} جهاز في حسابك.' },
  'Replaces {n} existing MX records on {z} and its SPF record.': { one: 'يستبدل سجل MX الحالي على {z} وسجل SPF الخاص به.', two: 'يستبدل سجلَي MX الحاليين على {z} وسجل SPF الخاص به.', few: 'يستبدل {n} سجلات MX حالية على {z} وسجل SPF الخاص به.', many: 'يستبدل {n} سجلًا من سجلات MX على {z} وسجل SPF الخاص به.', other: 'يستبدل {n} سجل MX على {z} وسجل SPF الخاص به.' },
  'MX {m}, replacing {n} MX records. Check the exact value in your Microsoft 365 admin center.': { one: 'سجل MX ‏{m} بدلًا من سجل MX واحد. تحقق من القيمة الدقيقة في مركز إدارة Microsoft 365.', two: 'سجل MX ‏{m} بدلًا من سجلَي MX. تحقق من القيمة الدقيقة في مركز إدارة Microsoft 365.', few: 'سجل MX ‏{m} بدلًا من {n} سجلات MX. تحقق من القيمة الدقيقة في مركز إدارة Microsoft 365.', many: 'سجل MX ‏{m} بدلًا من {n} سجلًا. تحقق من القيمة الدقيقة في مركز إدارة Microsoft 365.', other: 'سجل MX ‏{m} بدلًا من {n} سجل MX. تحقق من القيمة الدقيقة في مركز إدارة Microsoft 365.' },
  'It expires in {n} days. Renew it to keep your website and email working.': { zero: 'ينتهي اليوم. جدّده ليستمر موقعك وبريدك في العمل.', one: 'ينتهي خلال يوم واحد. جدّده ليستمر موقعك وبريدك في العمل.', two: 'ينتهي خلال يومين. جدّده ليستمر موقعك وبريدك في العمل.', few: 'ينتهي خلال {n} أيام. جدّده ليستمر موقعك وبريدك في العمل.', many: 'ينتهي خلال {n} يومًا. جدّده ليستمر موقعك وبريدك في العمل.', other: 'ينتهي خلال {n} يوم. جدّده ليستمر موقعك وبريدك في العمل.' },
};
