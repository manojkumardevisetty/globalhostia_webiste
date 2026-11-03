// DEV ONLY (AI_MOCK=1, never production): canned content-engine answers so the idea → draft → review → publish flow,
// the quality checks and the English/Arabic article pages can be exercised without an API key. lib/ai/mock.ts routes
// content-engine prompts here. The sample article follows the engine's editorial rules (no statistics, prices or brands).

export const MOCK_IDEAS = {
  ideas: [
    { title: 'Arabic and English website checklist for GCC online shops', primaryKeyword: 'bilingual website checklist', secondaryKeywords: ['arabic english website', 'rtl checkout', 'hreflang gcc'], intent: 'informational', audienceCountry: 'GCC', target: 'cat:hostia-shared', slug: 'bilingual-website-checklist-gcc', priority: 72, rationale: 'GCC shops need both languages; practical checklist.' },
    { title: 'How to plan website maintenance windows for UAE businesses', primaryKeyword: 'website maintenance window', secondaryKeywords: ['planned downtime', 'maintenance page', 'friday maintenance uae'], intent: 'informational', audienceCountry: 'AE', target: 'cat:hostiavps', slug: 'website-maintenance-window-uae', priority: 58, rationale: 'Owners ask when to schedule updates around the UAE week.' },
  ],
};

export const MOCK_DRAFT = {
  h1: 'SPF, DKIM and DMARC explained: keep business email out of spam',
  metaTitle: 'SPF, DKIM and DMARC explained for business email',
  metaDescription: 'What SPF, DKIM and DMARC do, how to publish each DNS record, and how to move to a DMARC policy that keeps your business email out of spam.',
  slug: 'spf-dkim-dmarc-explained',
  excerpt: 'Three DNS records decide whether receiving servers trust email from your domain. Here is what SPF, DKIM and DMARC do and how to set them up in order.',
  intro: 'SPF, DKIM and DMARC are three DNS records that tell receiving mail servers which systems may send email for your domain and whether a message really came from you. Publish SPF and DKIM for every service that sends on your behalf, then add a DMARC policy and tighten it step by step, and your invoices and replies are far less likely to land in spam.',
  sections: [
    { heading: 'Why business email lands in spam', body: `Mailbox providers decide where a message goes by looking at many signals. Some are about the content, but the first question is simpler: **is this message really from the domain in the From address?**

Without authentication, anyone can put your domain in the From line. Receiving servers know this, so unauthenticated mail from a business domain is treated with suspicion. Typical symptoms are:

- quotes and invoices that customers say they never received;
- replies that arrive in the recipient's junk folder;
- website contact-form notifications that disappear;
- bounce messages that mention "authentication" or "policy".

SPF, DKIM and DMARC answer the authenticity question. They are not the whole story (content, reputation and recipient behaviour still matter), but without them even a perfectly written email starts at a disadvantage.` },
    { heading: 'What SPF does', body: `**SPF (Sender Policy Framework)** is a single TXT record on your domain that lists the servers allowed to send email for it. When a message arrives, the receiving server checks the sending server's IP address against that list.

A simple SPF record looks like this:

\`\`\`
v=spf1 include:_spf.yourmailprovider.example ip4:203.0.113.10 ~all
\`\`\`

- \`include:\` adds the sending servers of a service you use (your mailbox provider, a newsletter tool, your billing system).
- \`ip4:\` adds one server, such as the web server that sends contact-form messages.
- \`~all\` (soft fail) or \`-all\` (fail) tells receivers what to do with everything else.

### SPF rules that trip people up

1. **Only one SPF record per domain.** Two \`v=spf1\` records make SPF fail. Merge them into one.
2. **Ten DNS lookups at most.** Every \`include\` counts, and nested includes count too. Remove services you no longer use.
3. **SPF checks the envelope sender, not the visible From address.** That is why DMARC is needed to connect the two.` },
    { heading: 'What DKIM does', body: `**DKIM (DomainKeys Identified Mail)** adds a digital signature to each message. The sending service signs the email with a private key; the matching public key is published in your DNS, usually as a TXT or CNAME record under a name like \`selector._domainkey.yourdomain.com\`.

The receiving server fetches the public key and checks the signature. If the message was changed on the way, or was not signed by a server holding your key, the check fails.

To set it up:

1. In each service that sends email for you, open the domain or authentication settings and turn on DKIM.
2. Copy the record name and value the service gives you.
3. Add it to your DNS zone exactly as shown (selectors differ per service, so several DKIM records can live side by side).
4. Return to the service and press verify. DNS changes can take a while to be visible everywhere.

DKIM keeps working when a message is forwarded, which is why it is the more reliable of the two signals for DMARC.` },
    { heading: 'How DMARC ties SPF and DKIM together', body: `**DMARC (Domain-based Message Authentication, Reporting and Conformance)** is a TXT record at \`_dmarc.yourdomain.com\`. It does three things:

- **Alignment:** it requires that SPF or DKIM passes *for the same domain* that appears in the visible From address.
- **Policy:** it tells receivers what to do with messages that fail: nothing, quarantine (spam folder) or reject.
- **Reporting:** it asks receivers to send you reports about who is sending email using your domain.

A first DMARC record usually starts in monitoring mode:

\`\`\`
v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com
\`\`\`

| Tag | What it means |
|---|---|
| \`p=none\` | Monitor only: deliver as usual and send reports |
| \`p=quarantine\` | Put failing messages in spam |
| \`p=reject\` | Refuse failing messages |
| \`rua=\` | Where aggregate reports are sent |
| \`pct=\` | Apply the policy to part of the failing mail while you test |

The specification is published as [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489) if you want the full detail.` },
    { heading: 'Setting up SPF, DKIM and DMARC step by step', body: `Work in this order so you never block your own email:

1. **List every sender.** Your mailboxes, the website (contact forms, order emails), the billing or CRM system, newsletter tools and any device that emails reports.
2. **Publish one SPF record** that includes all of them. Check that it stays within ten lookups.
3. **Turn on DKIM** in every service that supports it and add each record.
4. **Publish DMARC with \`p=none\`** and a reporting address.
5. **Read the reports for a few weeks.** Look for legitimate services that fail alignment and fix them.
6. **Move to \`p=quarantine\`**, optionally with \`pct\` to start gradually.
7. **Move to \`p=reject\`** once the reports show only your own services passing.

If your domain and email are hosted with us, the DNS editor in the client area holds these records, and [our business email plans](/google-workspace) show the exact values to publish. Moving from another provider? The guide to [setting up business email on your domain](/guides/business-email-setup) covers the MX records as well.` },
    { heading: 'Checking that your records work', body: `After publishing, test before you tighten the policy:

- **Send a message to a mailbox you control at a large provider** and open the original message or headers. Look for \`spf=pass\`, \`dkim=pass\` and \`dmarc=pass\`.
- **Look up the records** with a DNS lookup tool or the \`dig\` command, for example \`dig TXT _dmarc.yourdomain.com\`.
- **Read DMARC aggregate reports.** They are XML files; a report viewer makes them readable and shows which IP addresses send as your domain.

Common fixes:

| Symptom | Likely cause |
|---|---|
| SPF "permerror" | Two SPF records, or more than ten lookups |
| DKIM "fail" on one service | Record copied with a typo or extra quotes |
| DMARC fails while SPF passes | The service sends with its own domain in the envelope: enable DKIM for your domain there |
| Contact-form mail fails | The web server is not in SPF, or the form sends "from" the visitor's address |` },
  ],
  faq: [
    { q: 'Do I need all three records?', a: 'Yes. SPF and DKIM each prove part of the story, and DMARC is what makes receivers act on them for your visible From address. Many large mailbox providers now expect all three from businesses that send regularly.' },
    { q: 'Will a DMARC reject policy stop my own emails?', a: 'It can, if a legitimate service is not authenticated yet. That is why you start with p=none, read the reports, fix every sender and only then move to quarantine and reject.' },
    { q: 'How long do DNS changes take?', a: 'Often minutes, but it depends on the TTL of the record and caching along the way. If a check still fails, wait for the TTL to pass and test again before changing anything else.' },
    { q: 'Can I have more than one DKIM record?', a: 'Yes. Each sending service uses its own selector, so several DKIM records can exist side by side. You can only have one SPF record and one DMARC record per domain.' },
    { q: 'Does this help with emails from my website?', a: 'Yes. Website forms and shop notifications should send through an authenticated mailbox or service on your domain, so they pass SPF and DKIM like the rest of your email.' },
  ],
  takeaways: [
    'SPF lists the servers allowed to send for your domain; keep it to one record and ten lookups.',
    'DKIM signs each message so receivers can verify it was not altered or forged.',
    'DMARC connects both to your visible From address and tells receivers what to do with failures.',
    'Start DMARC at p=none, read the reports, then move to quarantine and reject.',
  ],
  cta: 'Want email on your own domain with these records ready to publish? Compare [our business email plans](/google-workspace).',
};

export const MOCK_ARABIC = {
  title: 'شرح SPF وDKIM وDMARC: كيف تُبعد بريد شركتك عن مجلد الرسائل غير المرغوب فيها',
  metaTitle: 'شرح SPF وDKIM وDMARC لبريد الأعمال',
  metaDescription: 'ما الذي تفعله سجلات SPF وDKIM وDMARC، وكيف تنشر كل سجل في DNS، وكيف تنتقل تدريجيًا إلى سياسة DMARC تحمي بريد شركتك.',
  excerpt: 'ثلاثة سجلات DNS تحدد ما إذا كانت خوادم البريد تثق برسائل نطاقك. إليك ما يفعله كل سجل وكيف تُعِدّه بالترتيب الصحيح.',
  body: `سجلات SPF وDKIM وDMARC هي ثلاثة سجلات DNS تخبر خوادم البريد المستقبِلة بالأنظمة المسموح لها بالإرسال باسم نطاقك، وبما إذا كانت الرسالة قد صدرت منك فعلًا. انشر SPF وDKIM لكل خدمة ترسل باسمك، ثم أضف سياسة DMARC وشدّدها خطوة بخطوة، وستقل كثيرًا احتمالات وصول فواتيرك وردودك إلى مجلد الرسائل غير المرغوب فيها.

## لماذا تصل رسائل الشركات إلى مجلد الرسائل غير المرغوب فيها

يقرر مزوّدو البريد مكان كل رسالة اعتمادًا على إشارات كثيرة. بعضها يتعلق بالمحتوى، لكن السؤال الأول أبسط من ذلك: **هل هذه الرسالة صادرة فعلًا من النطاق الظاهر في حقل المرسِل؟**

من دون مصادقة يستطيع أي شخص أن يضع نطاقك في حقل المرسِل، والخوادم المستقبِلة تعرف ذلك، لذلك تُعامَل الرسائل غير الموثَّقة بحذر. ومن الأعراض الشائعة:

- عروض أسعار وفواتير يقول العملاء إنها لم تصلهم؛
- ردود تصل إلى مجلد الرسائل غير المرغوب فيها لدى المستلم؛
- إشعارات نماذج التواصل في الموقع التي تختفي؛
- رسائل ارتداد تذكر "authentication" أو "policy".

تجيب سجلات SPF وDKIM وDMARC عن سؤال المصداقية. لا تضمن هذه السجلات وحدها الوصول إلى صندوق الوارد، لكن غيابها يضع حتى أفضل رسالة في موقف ضعيف.

## ما الذي يفعله SPF

**SPF** هو سجل TXT واحد في نطاقك يسرد الخوادم المسموح لها بإرسال البريد باسمه. عند وصول رسالة، يتحقق الخادم المستقبِل من عنوان IP للخادم المرسِل مقارنةً بهذه القائمة.

مثال على سجل SPF بسيط:

\`\`\`
v=spf1 include:_spf.yourmailprovider.example ip4:203.0.113.10 ~all
\`\`\`

- \`include:\` يضيف خوادم الإرسال لخدمة تستخدمها، مثل مزوّد البريد أو أداة النشرات البريدية أو نظام الفوترة.
- \`ip4:\` يضيف خادمًا واحدًا، مثل خادم الموقع الذي يرسل رسائل نموذج التواصل.
- \`~all\` أو \`-all\` يحدد للخوادم المستقبِلة ما تفعله بأي مصدر آخر.

### أخطاء شائعة في SPF

1. **سجل SPF واحد فقط لكل نطاق.** وجود سجلين يبدأان بـ \`v=spf1\` يُفشل التحقق، لذا ادمجهما في سجل واحد.
2. **عشرة استعلامات DNS كحد أقصى.** كل \`include\` يُحتسب، وكذلك ما بداخله. احذف الخدمات التي لم تعد تستخدمها.
3. **يتحقق SPF من عنوان المرسِل في الظرف وليس العنوان الظاهر.** ولهذا نحتاج إلى DMARC لربط الاثنين.

## ما الذي يفعله DKIM

يضيف **DKIM** توقيعًا رقميًا إلى كل رسالة. توقّع خدمة الإرسال الرسالة بمفتاح خاص، ويُنشر المفتاح العام المقابل في DNS عادةً تحت اسم مثل \`selector._domainkey.yourdomain.com\`.

يجلب الخادم المستقبِل المفتاح العام ويتحقق من التوقيع. إذا تغيّرت الرسالة في الطريق، أو لم يوقّعها خادم يملك مفتاحك، يفشل التحقق.

خطوات الإعداد:

1. فعّل DKIM من إعدادات النطاق في كل خدمة ترسل البريد باسمك.
2. انسخ اسم السجل وقيمته كما تعرضهما الخدمة.
3. أضف السجل إلى منطقة DNS تمامًا كما هو، ويمكن أن تتعايش عدة سجلات DKIM لأن لكل خدمة محددًا خاصًا بها.
4. عُد إلى الخدمة واضغط زر التحقق، مع العلم أن انتشار تغييرات DNS قد يستغرق بعض الوقت.

## كيف يربط DMARC بين SPF وDKIM

**DMARC** هو سجل TXT في \`_dmarc.yourdomain.com\` ويؤدي ثلاث مهام:

- **المطابقة:** يشترط نجاح SPF أو DKIM للنطاق نفسه الظاهر في حقل المرسِل.
- **السياسة:** يحدد ما تفعله الخوادم بالرسائل التي تفشل: لا شيء، أو نقلها إلى الرسائل غير المرغوب فيها، أو رفضها.
- **التقارير:** يطلب من الخوادم إرسال تقارير عن الجهات التي ترسل باسم نطاقك.

يبدأ أول سجل DMARC عادةً بوضع المراقبة:

\`\`\`
v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com
\`\`\`

| الوسم | المعنى |
|---|---|
| \`p=none\` | مراقبة فقط مع إرسال التقارير |
| \`p=quarantine\` | نقل الرسائل الفاشلة إلى الرسائل غير المرغوب فيها |
| \`p=reject\` | رفض الرسائل الفاشلة |
| \`rua=\` | العنوان الذي تُرسل إليه التقارير المجمّعة |

المواصفة الكاملة منشورة في [RFC 7489](https://www.rfc-editor.org/rfc/rfc7489).

## خطوات الإعداد بالترتيب

اتبع هذا الترتيب حتى لا تحجب بريدك بنفسك:

1. **اكتب قائمة بكل جهة ترسل باسمك:** صناديق البريد، والموقع، ونظام الفوترة أو إدارة العملاء، وأدوات النشرات البريدية.
2. **انشر سجل SPF واحدًا** يتضمنها جميعًا، وتأكد من بقائه ضمن عشرة استعلامات.
3. **فعّل DKIM** في كل خدمة تدعمه وأضف سجلاتها.
4. **انشر DMARC بقيمة \`p=none\`** مع عنوان لاستقبال التقارير.
5. **راجع التقارير لبضعة أسابيع** وأصلح أي خدمة مشروعة تفشل في المطابقة.
6. **انتقل إلى \`p=quarantine\`** ثم إلى **\`p=reject\`** عندما تُظهر التقارير أن خدماتك وحدها تنجح.

إذا كان نطاقك وبريدك مستضافين لدينا، فستجد هذه السجلات في محرر DNS داخل لوحة العميل، وتعرض [خطط البريد الإلكتروني للأعمال](/google-workspace) القيم المطلوبة بدقة.

## كيف تتأكد من أن السجلات تعمل

- **أرسل رسالة إلى صندوق بريد تملكه** لدى مزوّد كبير، وافتح ترويسات الرسالة، وابحث عن \`spf=pass\` و\`dkim=pass\` و\`dmarc=pass\`.
- **استعلم عن السجلات** بأداة بحث DNS أو بالأمر \`dig TXT _dmarc.yourdomain.com\`.
- **اقرأ تقارير DMARC المجمّعة** بأداة عرض تجعل ملفات XML مفهومة.

> هل تريد بريدًا على نطاقك مع سجلات جاهزة للنشر؟ قارن [خطط البريد الإلكتروني للأعمال](/google-workspace).

## الأسئلة الشائعة

### هل أحتاج إلى السجلات الثلاثة؟

نعم. يثبت كل من SPF وDKIM جزءًا من الصورة، بينما يجعل DMARC الخوادم تتصرف بناءً عليهما بالنسبة إلى العنوان الظاهر في حقل المرسِل.

### هل يمكن أن تمنع سياسة الرفض رسائلي أنا؟

نعم، إذا كانت هناك خدمة مشروعة غير موثّقة بعد. لذلك ابدأ بقيمة p=none وراجع التقارير وأصلح كل جهة مرسِلة قبل التشديد.

### كم تستغرق تغييرات DNS؟

غالبًا دقائق، لكن ذلك يعتمد على قيمة TTL للسجل والتخزين المؤقت. إذا استمر الفشل فانتظر انقضاء TTL ثم أعد الاختبار.

### هل يمكن وجود أكثر من سجل DKIM؟

نعم، لكل خدمة محدد خاص بها. أما SPF وDMARC فسجل واحد فقط لكل منهما في النطاق.
`,
  takeaways: [
    'يحدد SPF الخوادم المسموح لها بالإرسال باسم نطاقك، فاحرص على سجل واحد وعشرة استعلامات كحد أقصى.',
    'يوقّع DKIM كل رسالة حتى تتحقق الخوادم من أنها لم تُزوَّر أو تُعدَّل.',
    'يربط DMARC بين الاثنين والعنوان الظاهر ويحدد ما يحدث للرسائل الفاشلة.',
    'ابدأ بسياسة p=none، وراجع التقارير، ثم انتقل إلى quarantine وreject.',
  ],
};

export const MOCK_SECTION = `Receiving servers check whether a message really comes from the domain in the From address before they weigh anything else. When that check fails or is missing, even a routine invoice can be filtered.

Signs that authentication is the problem:

- customers say quotes or invoices never arrived;
- replies land in the recipient's junk folder;
- contact-form notifications from your website go missing;
- bounce messages mention "authentication" or "policy".

Fix authentication first. Content and sending habits matter too, but they cannot make up for a domain that receivers cannot verify.`;

/** Canned answer for a content-engine prompt, or null when the prompt is not one of ours. */
export function mockContentReply(params: any): string | null {
  const sys = String(params.system?.[0]?.text || '');
  if (sys.startsWith('You plan SEO articles')) return JSON.stringify(MOCK_IDEAS);
  if (sys.startsWith('You write SEO articles')) return JSON.stringify(MOCK_DRAFT);
  if (sys.startsWith('You localise')) return JSON.stringify(MOCK_ARABIC);
  if (sys.startsWith('You are a strict fact-and-compliance reviewer')) return JSON.stringify({ issues: [] });
  if (sys.startsWith('You rewrite one section')) return MOCK_SECTION;
  return null;
}
