// Help centre "Watch how" topics: the 20 most common customer tasks, each with a short how-to video (recorded from the
// real account portal and Manage hosting panel with fictional demo data) or, for checkout and AI connector setup, an
// illustrated step-by-step walkthrough built from screenshots of our own pages.
// Plain data (no server imports): read by lib/theme/pages/help.ts, the sitemaps, /llms-full.txt (site search) and the
// recorder (scripts/help-videos/), so the burned-in captions, the WebVTT files and the steps on the page always match.
// Admin → Help videos can edit titles, summaries, steps and swap the video URLs (settings.help_overrides, lib/help/view.ts).

export type HelpGroup = 'billing' | 'domains' | 'email' | 'hosting' | 'websites' | 'account' | 'ordering' | 'ai';
export type HelpStep = { en: string; ar: string };
/** walkthrough frame: our own page, with the area to look at as percentages of the image (x, y, width, height) */
export type HelpFrame = { src: string; hl?: [number, number, number, number] };
export type HelpTopic = {
  slug: string; group: HelpGroup; kind: 'video' | 'walkthrough';
  title: string; titleAr: string;
  summary: string; summaryAr: string;
  /** where the task is done, shown as a chip */
  where: string; whereAr: string;
  /** our page where the task starts */
  start: { label: string; labelAr: string; href: string };
  steps: HelpStep[];
  keywords: string;
  related: [string, string][];
  /** walkthrough only: one frame per step (same order as steps) */
  frames?: HelpFrame[];
  /** extra note under the steps (e.g. third-party apps we do not show) */
  note?: HelpStep;
};

export const HELP_GROUPS: Record<HelpGroup, { en: string; ar: string }> = {
  billing: { en: 'Billing & renewals', ar: 'الفواتير والتجديد' },
  domains: { en: 'Domains & DNS', ar: 'النطاقات وDNS' },
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  hosting: { en: 'Hosting panel', ar: 'لوحة الاستضافة' },
  websites: { en: 'Websites & WordPress', ar: 'المواقع وووردبريس' },
  account: { en: 'Account & team', ar: 'الحساب والفريق' },
  ordering: { en: 'Ordering', ar: 'الطلب والشراء' },
  ai: { en: 'AI assistants', ar: 'المساعدات الذكية' },
};

const PORTAL = { where: 'Account portal', whereAr: 'بوابة الحساب' };
const PANEL = { where: 'Manage hosting panel', whereAr: 'لوحة إدارة الاستضافة' };
const PANEL_START = { label: 'Open your services', labelAr: 'افتح خدماتك', href: '/account/services' };
const s = (en: string, ar: string): HelpStep => ({ en, ar });

export const HELP_TOPICS: HelpTopic[] = [
  /* ------------------------------------------------------------------ billing */
  { slug: 'pay-an-invoice', group: 'billing', kind: 'video', ...PORTAL,
    title: 'Pay an invoice', titleAr: 'دفع فاتورة',
    summary: 'Find an unpaid invoice in Billing and pay it on the secure invoice page.',
    summaryAr: 'اعثر على الفاتورة غير المدفوعة في قسم الفواتير وادفعها من صفحة الفاتورة الآمنة.',
    start: { label: 'Open Billing', labelAr: 'افتح الفواتير', href: '/account/invoices' },
    steps: [
      s('Open Billing from the menu in your account.', 'افتح «الفواتير» من قائمة حسابك.'),
      s('Choose Unpaid to see only the invoices that are due.', 'اختر «غير مدفوعة» لعرض الفواتير المستحقة فقط.'),
      s('Click Pay next to the invoice you want to pay.', 'اضغط «ادفع» بجانب الفاتورة التي تريد دفعها.'),
      s('The invoice opens in our secure client area. Choose a payment method and confirm.', 'تُفتح الفاتورة في منطقة العملاء الآمنة. اختر طريقة الدفع وأكّد.'),
    ],
    keywords: 'pay invoice bill payment due unpaid card paypal billing receipt',
    related: [['Renew your services', '/help/renew-services'], ['Billing in your account', '/account/invoices']] },
  { slug: 'renew-services', group: 'billing', kind: 'video', ...PORTAL,
    title: 'Renew services and domains', titleAr: 'تجديد الخدمات والنطاقات',
    summary: 'Use the Renewals centre to renew overdue and upcoming services and domains on one invoice.',
    summaryAr: 'استخدم مركز التجديد لتجديد الخدمات والنطاقات المتأخرة والقادمة في فاتورة واحدة.',
    start: { label: 'Open Renewals', labelAr: 'افتح التجديدات', href: '/account/renewals' },
    steps: [
      s('Open Renewals in your account.', 'افتح «التجديدات» في حسابك.'),
      s('Check what is overdue and what renews in the next 30 and 90 days.', 'راجع ما هو متأخر وما يتجدد خلال 30 و90 يوماً.'),
      s('Tick the services and domains you want to renew.', 'حدّد الخدمات والنطاقات التي تريد تجديدها.'),
      s('Click Renew in the bar at the bottom, then pay everything you ticked on one invoice.', 'اضغط «تجديد» في الشريط أسفل الصفحة، ثم ادفع كل ما حدّدته في فاتورة واحدة.'),
    ],
    keywords: 'renew renewal expiring overdue suspended auto-renew extend service domain',
    related: [['Pay an invoice', '/help/pay-an-invoice'], ['Change nameservers', '/help/change-nameservers']] },

  /* ------------------------------------------------------------------ domains */
  { slug: 'add-a-dns-record', group: 'domains', kind: 'video', ...PORTAL,
    title: 'Add a DNS record', titleAr: 'إضافة سجل DNS',
    summary: 'Add an A, CNAME, MX, TXT or SRV record to a domain from your account.',
    summaryAr: 'أضف سجل A أو CNAME أو MX أو TXT أو SRV إلى نطاقك من حسابك.',
    start: { label: 'Open Domains', labelAr: 'افتح النطاقات', href: '/account/domains' },
    steps: [
      s('Open Domains and choose the domain.', 'افتح «النطاقات» واختر النطاق.'),
      s('Scroll to DNS records and open Add a record.', 'انتقل إلى سجلات DNS وافتح «إضافة سجل».'),
      s('Choose the record type, then enter the name and the value.', 'اختر نوع السجل، ثم أدخل الاسم والقيمة.'),
      s('Click Add record. It appears in the list and is usually live within minutes.', 'اضغط «إضافة سجل». يظهر في القائمة ويعمل عادة خلال دقائق.'),
    ],
    keywords: 'dns record txt cname mx a record verification google workspace spf dkim zone',
    related: [['Change nameservers', '/help/change-nameservers'], ['Connect a domain to hosting', '/help/connect-a-domain']] },
  { slug: 'change-nameservers', group: 'domains', kind: 'video', ...PORTAL,
    title: 'Change nameservers', titleAr: 'تغيير خوادم الأسماء',
    summary: 'Point a domain to GlobalHostia or another DNS provider by changing its nameservers.',
    summaryAr: 'وجّه نطاقك إلى GlobalHostia أو مزوّد DNS آخر بتغيير خوادم الأسماء.',
    start: { label: 'Open Domains', labelAr: 'افتح النطاقات', href: '/account/domains' },
    steps: [
      s('Open Domains and choose the domain.', 'افتح «النطاقات» واختر النطاق.'),
      s('Replace the nameservers with the ones you were given.', 'استبدل خوادم الأسماء بالخوادم التي حصلت عليها.'),
      s('Click Save nameservers.', 'اضغط «حفظ خوادم الأسماء».'),
      s('Changes usually take effect within a few hours, and up to 24 hours worldwide.', 'تسري التغييرات عادة خلال ساعات قليلة، وقد تستغرق حتى 24 ساعة حول العالم.'),
    ],
    keywords: 'nameservers ns1 ns2 point domain dns cloudflare delegate propagation',
    related: [['Connect a domain to hosting', '/help/connect-a-domain'], ['Add a DNS record', '/help/add-a-dns-record'], ['Nameserver guide', '/guides/change-nameservers']] },
  { slug: 'connect-a-domain', group: 'domains', kind: 'video', ...PANEL,
    title: 'Connect a domain to your hosting', titleAr: 'ربط نطاق باستضافتك',
    summary: 'Use the Connect helper in Manage hosting to point a domain at your hosting and watch it go live.',
    summaryAr: 'استخدم أداة الربط في إدارة الاستضافة لتوجيه نطاقك إلى استضافتك ومتابعة تفعيله.',
    start: PANEL_START,
    steps: [
      s('Open Manage hosting. The overview lists domains that are not connected yet.', 'افتح «إدارة الاستضافة». تعرض النظرة العامة النطاقات غير المربوطة بعد.'),
      s('Click Connect next to the domain.', 'اضغط «ربط» بجانب النطاق.'),
      s('Follow the steps: switch the nameservers, or add the A and www records shown.', 'اتبع الخطوات: غيّر خوادم الأسماء أو أضف سجلي A وwww الظاهرين.'),
      s('The helper checks again every 30 seconds and ticks each step when it is live.', 'تعيد الأداة الفحص كل 30 ثانية وتؤشّر على كل خطوة عند تفعيلها.'),
    ],
    keywords: 'connect domain point domain to hosting website not working a record www propagation',
    related: [['Change nameservers', '/help/change-nameservers'], ['Issue a free SSL certificate', '/help/issue-ssl-certificate']] },
  { slug: 'sell-a-domain', group: 'domains', kind: 'video', ...PORTAL,
    title: 'List a domain for sale', titleAr: 'عرض نطاق للبيع',
    summary: 'List a domain from your account in our premium domains marketplace and set your price.',
    summaryAr: 'اعرض نطاقاً من حسابك في سوق النطاقات المميزة وحدّد سعرك.',
    start: { label: 'Open Sell domains', labelAr: 'افتح بيع النطاقات', href: '/account/sell' },
    steps: [
      s('Open Sell domains and click List a domain.', 'افتح «بيع النطاقات» واضغط «اعرض نطاقاً».'),
      s('Choose the domain from your account.', 'اختر النطاق من حسابك.'),
      s('Set the price, the lowest offer you accept and a short description.', 'حدّد السعر وأقل عرض تقبله ووصفاً قصيراً.'),
      s('Accept the terms and continue. The listing goes live after review and the listing fee.', 'وافق على الشروط وتابع. يظهر العرض بعد المراجعة ودفع رسوم الإدراج.'),
    ],
    keywords: 'sell domain list for sale marketplace price offers broker escrow',
    related: [['Sell your domain', '/sell-domains'], ['Premium domains', '/premium-domains']] },

  /* ------------------------------------------------------------------ email */
  { slug: 'set-up-email', group: 'email', kind: 'video', ...PANEL,
    title: 'Create a mailbox and set it up on your phone or Outlook', titleAr: 'إنشاء بريد وإعداده على الهاتف أو Outlook',
    summary: 'Create an email address on your domain, then follow the setup helper for iPhone, Android, Outlook or Thunderbird.',
    summaryAr: 'أنشئ عنوان بريد على نطاقك ثم اتبع مساعد الإعداد لأجهزة iPhone وAndroid وOutlook وThunderbird.',
    start: PANEL_START,
    steps: [
      s('In Manage hosting, open Mailboxes and click New mailbox.', 'في «إدارة الاستضافة» افتح «صناديق البريد» واضغط «صندوق بريد جديد».'),
      s('Enter the name and a strong password, then click Create.', 'أدخل الاسم وكلمة مرور قوية ثم اضغط «إنشاء».'),
      s('Click Set up on device next to the new mailbox.', 'اضغط «إعداد على جهاز» بجانب صندوق البريد الجديد.'),
      s('Pick your app: iPhone gets a one-tap profile, Android and Outlook get exact server settings.', 'اختر تطبيقك: يحصل iPhone على ملف إعداد بلمسة واحدة، ويحصل Android وOutlook على إعدادات الخوادم بدقة.'),
    ],
    keywords: 'email mailbox create outlook iphone android gmail imap smtp settings phone mail app',
    related: [['Business email setup guide', '/guides/business-email-setup'], ['Add a DNS record', '/help/add-a-dns-record']] },

  /* ------------------------------------------------------------------ hosting panel */
  { slug: 'issue-ssl-certificate', group: 'hosting', kind: 'video', ...PANEL,
    title: 'Issue a free SSL certificate', titleAr: 'إصدار شهادة SSL مجانية',
    summary: 'Turn on HTTPS for a domain with a free Let’s Encrypt certificate.',
    summaryAr: 'فعّل HTTPS لنطاقك بشهادة Let’s Encrypt مجانية.',
    start: PANEL_START,
    steps: [
      s('In Manage hosting, open SSL.', 'في «إدارة الاستضافة» افتح «SSL».'),
      s('Find the domain marked Not secure. Keep Include www ticked.', 'ابحث عن النطاق المعلَّم «غير آمن». أبقِ خيار تضمين www محدداً.'),
      s('Click Issue free SSL and wait a few seconds.', 'اضغط «إصدار SSL مجاني» وانتظر بضع ثوانٍ.'),
      s('The domain now shows Secure, with the expiry date. It renews automatically.', 'يظهر النطاق الآن «آمن» مع تاريخ الانتهاء، ويتجدد تلقائياً.'),
    ],
    keywords: 'ssl https certificate lets encrypt padlock not secure free ssl',
    related: [['SSL certificates', '/ssl-certificate'], ['Install SSL guide', '/guides/install-ssl']] },
  { slug: 'upload-files', group: 'hosting', kind: 'video', ...PANEL,
    title: 'Upload files with the file manager', titleAr: 'رفع الملفات بمدير الملفات',
    summary: 'Open the file manager, go to your website folder and upload a file.',
    summaryAr: 'افتح مدير الملفات وانتقل إلى مجلد موقعك وارفع ملفاً.',
    start: PANEL_START,
    steps: [
      s('In Manage hosting, open File manager.', 'في «إدارة الاستضافة» افتح «مدير الملفات».'),
      s('Pick the website. Its public_html folder opens.', 'اختر الموقع، فيُفتح مجلد public_html الخاص به.'),
      s('Click Upload and choose the file (up to 4 MB; use FTP for bigger files).', 'اضغط «رفع» واختر الملف (حتى 4 ميغابايت، واستخدم FTP للملفات الأكبر).'),
      s('The file appears in the list when the upload finishes.', 'يظهر الملف في القائمة عند انتهاء الرفع.'),
    ],
    keywords: 'file manager upload files public_html ftp html website files',
    related: [['Move a website to Globalhostia', '/guides/move-website-to-hostia'], ['Free migration', '/free-migration']] },
  { slug: 'create-a-database', group: 'hosting', kind: 'video', ...PANEL,
    title: 'Create a MySQL database', titleAr: 'إنشاء قاعدة بيانات MySQL',
    summary: 'Create a database and its user for a website or app.',
    summaryAr: 'أنشئ قاعدة بيانات ومستخدماً لها لموقعك أو تطبيقك.',
    start: PANEL_START,
    steps: [
      s('In Manage hosting, open Databases and click New database.', 'في «إدارة الاستضافة» افتح «قواعد البيانات» واضغط «قاعدة بيانات جديدة».'),
      s('Enter the database name and the user name. The account prefix is added for you.', 'أدخل اسم قاعدة البيانات واسم المستخدم. تُضاف بادئة الحساب تلقائياً.'),
      s('Click Generate for a strong password (save it), then Create database.', 'اضغط «توليد» للحصول على كلمة مرور قوية (احفظها)، ثم «إنشاء قاعدة البيانات».'),
      s('Connect your app with host localhost and the new name, user and password.', 'اربط تطبيقك بالمضيف localhost والاسم والمستخدم وكلمة المرور الجديدة.'),
    ],
    keywords: 'mysql database create user password localhost wordpress app',
    related: [['Install WordPress', '/help/install-wordpress'], ['Upload files', '/help/upload-files']] },
  { slug: 'change-php-version', group: 'hosting', kind: 'video', ...PANEL,
    title: 'Change the PHP version', titleAr: 'تغيير إصدار PHP',
    summary: 'Switch the PHP version a website runs on.',
    summaryAr: 'غيّر إصدار PHP الذي يعمل عليه موقعك.',
    start: PANEL_START,
    steps: [
      s('In Manage hosting, open PHP version.', 'في «إدارة الاستضافة» افتح «إصدار PHP».'),
      s('Choose the domain, then the version you need.', 'اختر النطاق ثم الإصدار الذي تحتاجه.'),
      s('Click Switch version.', 'اضغط «تبديل الإصدار».'),
      s('Open your website and check that it still works.', 'افتح موقعك وتأكد من أنه يعمل بشكل سليم.'),
    ],
    keywords: 'php version 8.3 8.2 upgrade php wordpress compatibility',
    related: [['Install WordPress', '/help/install-wordpress'], ['Restore a backup', '/help/restore-a-backup']] },
  { slug: 'restore-a-backup', group: 'hosting', kind: 'video', ...PANEL,
    title: 'Restore a backup', titleAr: 'استعادة نسخة احتياطية',
    summary: 'Restore your websites, email and databases from one of the daily backups.',
    summaryAr: 'استعد مواقعك وبريدك وقواعد بياناتك من إحدى النسخ الاحتياطية اليومية.',
    start: PANEL_START,
    steps: [
      s('In Manage hosting, open Backups.', 'في «إدارة الاستضافة» افتح «النسخ الاحتياطية».'),
      s('Find the backup from before the problem started.', 'ابحث عن النسخة السابقة لبدء المشكلة.'),
      s('Click Restore and confirm. Files changed since then are replaced.', 'اضغط «استعادة» وأكّد. تُستبدل الملفات التي تغيّرت منذ ذلك الحين.'),
      s('You get an email when the restore finishes. Use Create backup first if you want a copy of today.', 'ستصلك رسالة عند انتهاء الاستعادة. أنشئ نسخة احتياطية أولاً إن أردت حفظ نسخة اليوم.'),
    ],
    keywords: 'backup restore undo deleted files daily backup recover',
    related: [['Upload files', '/help/upload-files'], ['Open a support ticket', '/help/open-a-support-ticket']] },

  /* ------------------------------------------------------------------ websites */
  { slug: 'install-wordpress', group: 'websites', kind: 'video', ...PANEL,
    title: 'Install WordPress and make a staging copy', titleAr: 'تثبيت ووردبريس وإنشاء نسخة تجريبية',
    summary: 'Install WordPress in one click, then make a staging copy to test changes safely.',
    summaryAr: 'ثبّت ووردبريس بنقرة واحدة، ثم أنشئ نسخة تجريبية لاختبار التغييرات بأمان.',
    start: PANEL_START,
    steps: [
      s('In Manage hosting, open WordPress and click Install WordPress.', 'في «إدارة الاستضافة» افتح «ووردبريس» واضغط «تثبيت ووردبريس».'),
      s('Choose the domain, enter the site title and admin email, then install.', 'اختر النطاق وأدخل عنوان الموقع وبريد المدير، ثم ثبّت.'),
      s('When it is ready, use Log in to WP admin. No password needed.', 'عند الجاهزية استخدم «الدخول إلى لوحة ووردبريس» دون كلمة مرور.'),
      s('To test changes, open the site menu and choose Create staging copy.', 'لاختبار التغييرات افتح قائمة الموقع واختر «إنشاء نسخة تجريبية».'),
    ],
    keywords: 'wordpress install one click staging wp admin login softaculous blog',
    related: [['WordPress hosting', '/wordpress-hosting'], ['Install WordPress guide', '/guides/install-wordpress']] },

  /* ------------------------------------------------------------------ account */
  { slug: 'open-a-support-ticket', group: 'account', kind: 'video', ...PORTAL,
    title: 'Open and reply to a support ticket', titleAr: 'فتح تذكرة دعم والرد عليها',
    summary: 'Open a ticket with the right service attached, then follow and reply to it.',
    summaryAr: 'افتح تذكرة مع إرفاق الخدمة المعنية، ثم تابعها وردّ عليها.',
    start: { label: 'Open Support', labelAr: 'افتح الدعم', href: '/account/support' },
    steps: [
      s('Open Support and click New ticket.', 'افتح «الدعم» واضغط «تذكرة جديدة».'),
      s('Choose the department and the service it is about.', 'اختر القسم والخدمة المعنية.'),
      s('Write a short subject and what you see, then submit.', 'اكتب عنواناً قصيراً ووصفاً لما تراه، ثم أرسل.'),
      s('Open the ticket any time to read replies and answer in the reply box.', 'افتح التذكرة في أي وقت لقراءة الردود والإجابة في مربع الرد.'),
    ],
    keywords: 'support ticket help open ticket reply technical billing department',
    related: [['Contact us', '/contact'], ['System status', '/status-page']] },
  { slug: 'give-team-access', group: 'account', kind: 'video', ...PORTAL,
    title: 'Give a teammate access', titleAr: 'منح زميل صلاحية الوصول',
    summary: 'Invite a developer or accountant to your account with only the access they need.',
    summaryAr: 'ادعُ مطوراً أو محاسباً إلى حسابك بالصلاحيات التي يحتاجها فقط.',
    start: { label: 'Open Team access', labelAr: 'افتح صلاحيات الفريق', href: '/account/team' },
    steps: [
      s('Open Team access from your account menu.', 'افتح «صلاحيات الفريق» من قائمة حسابك.'),
      s('Enter your teammate’s email address.', 'أدخل البريد الإلكتروني لزميلك.'),
      s('Choose an access level, such as Developer or Billing only.', 'اختر مستوى الصلاحية مثل «مطوّر» أو «الفواتير فقط».'),
      s('Send the invite. You can change or remove their access at any time.', 'أرسل الدعوة. يمكنك تعديل صلاحياته أو إزالتها في أي وقت.'),
    ],
    keywords: 'team access invite user developer accountant permissions sub account',
    related: [['Open a support ticket', '/help/open-a-support-ticket'], ['Switch to Arabic', '/help/switch-language']] },
  { slug: 'switch-language', group: 'account', kind: 'video', ...PORTAL,
    title: 'Switch your account to Arabic', titleAr: 'تحويل حسابك إلى العربية',
    summary: 'Use your account in Arabic (right to left) or English, and switch back at any time.',
    summaryAr: 'استخدم حسابك بالعربية (من اليمين إلى اليسار) أو بالإنجليزية، وبدّل متى شئت.',
    start: { label: 'Open your account', labelAr: 'افتح حسابك', href: '/account' },
    steps: [
      s('Open the account menu at the top right.', 'افتح قائمة الحساب أعلى الصفحة.'),
      s('Choose العربية. Your account switches to Arabic, right to left.', 'اختر «العربية». يتحول حسابك إلى العربية من اليمين إلى اليسار.'),
      s('Your choice is remembered on this device.', 'يُحفظ اختيارك على هذا الجهاز.'),
      s('To switch back, open the same menu and choose English.', 'للعودة افتح القائمة نفسها واختر «English».'),
    ],
    keywords: 'language arabic english rtl switch language العربية',
    related: [['Give a teammate access', '/help/give-team-access']] },

  /* ------------------------------------------------------------------ ordering (illustrated walkthroughs) */
  { slug: 'register-a-domain', group: 'ordering', kind: 'walkthrough', where: 'Website and checkout', whereAr: 'الموقع وصفحة الدفع',
    title: 'Register a domain', titleAr: 'تسجيل نطاق',
    summary: 'Search for a name, add it to your cart and check out. The renewal price is shown before you pay.',
    summaryAr: 'ابحث عن اسم وأضفه إلى السلة وأكمل الدفع. يظهر سعر التجديد قبل الدفع.',
    start: { label: 'Search for a domain', labelAr: 'ابحث عن نطاق', href: '/domains-registration' },
    steps: [
      s('Open Domain registration and type the name you want.', 'افتح «تسجيل النطاقات» واكتب الاسم الذي تريده.'),
      s('Check the results: the first-year and renewal prices are shown for each extension.', 'راجع النتائج: يظهر سعر السنة الأولى وسعر التجديد لكل امتداد.'),
      s('Add the domain to your cart and review it. Add hosting or email if you need them.', 'أضف النطاق إلى السلة وراجعه. أضف الاستضافة أو البريد إن احتجت.'),
      s('Check out and pay. The domain appears under Domains in your account.', 'أكمل الطلب وادفع. يظهر النطاق ضمن «النطاقات» في حسابك.'),
    ],
    frames: [{ src: 'register-a-domain-1' }, { src: 'register-a-domain-2' }, { src: 'register-a-domain-3' }, { src: 'register-a-domain-4' }],
    keywords: 'register domain buy domain search name .com .ae price checkout',
    related: [['Domain registration', '/domains-registration'], ['Domain prices', '/domains-registration#pricing'], ['Transfer a domain', '/help/transfer-a-domain']] },
  { slug: 'buy-hosting', group: 'ordering', kind: 'walkthrough', where: 'Website and checkout', whereAr: 'الموقع وصفحة الدفع',
    title: 'Buy a hosting plan', titleAr: 'شراء خطة استضافة',
    summary: 'Compare plans, choose a billing period, attach a domain and check out.',
    summaryAr: 'قارن الخطط واختر مدة الفوترة واربط نطاقاً ثم أكمل الطلب.',
    start: { label: 'Compare hosting plans', labelAr: 'قارن خطط الاستضافة', href: '/web-hosting' },
    steps: [
      s('Open Web hosting and compare the plans. Renewal prices are shown upfront.', 'افتح «استضافة المواقع» وقارن الخطط. تظهر أسعار التجديد مسبقاً.'),
      s('Choose a plan and click its order button.', 'اختر خطة واضغط زر الطلب الخاص بها.'),
      s('Pick a billing period and register, transfer or use a domain you already own.', 'اختر مدة الفوترة وسجّل نطاقاً أو انقله أو استخدم نطاقاً تملكه.'),
      s('Review the cart and check out. Your hosting is set up automatically after payment.', 'راجع السلة وأكمل الطلب. تُجهَّز استضافتك تلقائياً بعد الدفع.'),
    ],
    frames: [{ src: 'buy-hosting-1' }, { src: 'buy-hosting-2' }, { src: 'buy-hosting-3' }, { src: 'buy-hosting-4' }],
    keywords: 'buy hosting order plan shared hosting checkout cart billing cycle',
    related: [['Web hosting', '/web-hosting'], ['Plan finder', '/plan-finder'], ['Free migration', '/free-migration']] },
  { slug: 'transfer-a-domain', group: 'ordering', kind: 'walkthrough', where: 'Website and checkout', whereAr: 'الموقع وصفحة الدفع',
    title: 'Transfer a domain to GlobalHostia', titleAr: 'نقل نطاق إلى GlobalHostia',
    summary: 'Unlock the domain at your current registrar, get the EPP code and start the transfer.',
    summaryAr: 'افتح قفل النطاق لدى المسجّل الحالي واحصل على رمز EPP ثم ابدأ النقل.',
    start: { label: 'Start a transfer', labelAr: 'ابدأ النقل', href: '/domains-registration' },
    steps: [
      s('At your current registrar, unlock the domain and copy its EPP (authorisation) code.', 'لدى المسجّل الحالي افتح قفل النطاق وانسخ رمز EPP (رمز التفويض).'),
      s('On our domain page, choose Transfer and enter the domain name.', 'في صفحة النطاقات لدينا اختر «نقل» وأدخل اسم النطاق.'),
      s('Add it to your cart, enter the EPP code and check out. The transfer price includes a year of renewal.', 'أضفه إلى السلة وأدخل رمز EPP وأكمل الطلب. يشمل سعر النقل تجديد سنة.'),
      s('Approve the transfer email. Most transfers finish within 5 to 7 days.', 'وافق على رسالة النقل. تكتمل معظم عمليات النقل خلال 5 إلى 7 أيام.'),
    ],
    frames: [{ src: 'transfer-a-domain-1' }, { src: 'transfer-a-domain-2' }, { src: 'transfer-a-domain-3' }, { src: 'transfer-a-domain-4' }],
    keywords: 'transfer domain epp auth code move domain registrar unlock',
    related: [['Domain registration', '/domains-registration'], ['Change nameservers', '/help/change-nameservers']] },

  /* ------------------------------------------------------------------ AI */
  { slug: 'connect-ai-assistant', group: 'ai', kind: 'walkthrough', where: 'Claude or ChatGPT, and your account', whereAr: 'Claude أو ChatGPT وحسابك',
    title: 'Manage your hosting from Claude or ChatGPT', titleAr: 'إدارة استضافتك من Claude أو ChatGPT',
    summary: 'Add the GlobalHostia connector to your AI assistant, approve it once, and manage or disconnect it from your account.',
    summaryAr: 'أضف موصل GlobalHostia إلى مساعدك الذكي ووافق عليه مرة واحدة، ثم أدره أو افصله من حسابك.',
    start: { label: 'Open AI connectors', labelAr: 'افتح موصلات الذكاء الاصطناعي', href: '/connectors' },
    steps: [
      s('Open AI connectors on our site and copy the connector address.', 'افتح صفحة «موصلات الذكاء الاصطناعي» في موقعنا وانسخ عنوان الموصل.'),
      s('In Claude or ChatGPT, add a custom connector and paste the address (see the steps on the connectors page).', 'في Claude أو ChatGPT أضف موصلاً مخصصاً والصق العنوان (راجع الخطوات في صفحة الموصلات).'),
      s('Sign in to GlobalHostia when asked and approve the access on our page.', 'سجّل الدخول إلى GlobalHostia عند الطلب ووافق على الصلاحية في صفحتنا.'),
      s('See or disconnect connected apps any time under Connected apps in your account.', 'اعرض التطبيقات المتصلة أو افصلها في أي وقت من «التطبيقات المتصلة» في حسابك.'),
    ],
    frames: [{ src: 'connect-ai-assistant-1' }, { src: 'connect-ai-assistant-2' }, { src: 'connect-ai-assistant-3' }, { src: 'connect-ai-assistant-4' }],
    note: s('We only show our own pages here. Claude and ChatGPT change their menus from time to time, so follow their current help for adding a custom connector.', 'نعرض هنا صفحاتنا فقط. تغيّر Claude وChatGPT قوائمها من حين لآخر، لذا اتبع تعليماتها الحالية لإضافة موصل مخصص.'),
    keywords: 'claude chatgpt ai connector mcp assistant connected apps disconnect oauth',
    related: [['AI connectors', '/connectors'], ['Connected apps', '/account/apps'], ['MCP documentation', '/docs/mcp']] },
];

export const HELP_SLUGS = HELP_TOPICS.map((t) => t.slug);
export const helpPath = (slug: string) => `/help/${slug}`;
/** media file URLs for a topic (public/help/videos/, public/help/frames/) */
export const helpMedia = (slug: string) => ({
  mp4: `/help/videos/${slug}.mp4`, webm: `/help/videos/${slug}.webm`, poster: `/help/videos/${slug}.jpg`,
  vttEn: `/help/videos/${slug}.en.vtt`, vttAr: `/help/videos/${slug}.ar.vtt`,
});
export const frameUrl = (src: string) => `/help/frames/${src}.jpg`;
