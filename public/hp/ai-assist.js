/* GlobalHostia customer assistant widget (framework-agnostic). Two ways to use it:
     inline:  var a = GHAssist.mount(element, { auth: { type: "hosting", token: function () { return currentToken; } } });
     sheet:   var s = GHAssist.sheet({ auth: { type: "portal", csrf: "…" }, lang: "ar", context: function () { return {…}; } });
              s.open("optional question");   // side sheet on desktop, full screen on phones; Esc closes, focus is trapped
   Talks to /api/ai/assist (SSE). Changes are proposals: the customer confirms them here and the widget calls the existing
   authenticated endpoint (hosting API with the panel token, or the account portal form with its CSRF token). Proposal
   requests are checked against a fixed list of endpoints before anything is sent (requestFor).
   Used by the account portal (public/hp/pages/account.js) and the Manage hosting panel (public/hp/whmcs.js), both of which
   load it only when the customer first opens the assistant. Full mount API: docs/ai/INTEGRATION.md. */
(function (root) {
  "use strict";
  var D = root.document;
  var ORIGIN = (function () { try { return new URL(D.currentScript.src).origin; } catch (e) { try { return root.location.origin; } catch (e2) { return ""; } } })();
  var HEX = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5z" fill="#c5386f"/><path d="M20 8.6 29.9 14.3v11.4L20 31.4l-9.9-5.7V14.3z" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4"/><circle cx="14.6" cy="20" r="2.1" fill="#fff"/><circle cx="20" cy="20" r="2.1" fill="#fff"/><circle cx="25.4" cy="20" r="2.1" fill="#fff"/></svg>';
  var MK_OK = '<span class="ghas-mk ghas-mk--ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><path class="ghas-mk__fill" d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9z"/><path class="ghas-mk__hex" d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9z" pathLength="100"/><path class="ghas-mk__tick" d="m8 12.3 2.8 2.8L16.3 9.6" pathLength="100"/></svg></span>';
  var MK_ERR = '<span class="ghas-mk ghas-mk--err" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" focusable="false"><path class="ghas-mk__fill" d="M12 1.8 20.8 6.9v10.2L12 22.2 3.2 17.1V6.9z"/><path class="ghas-mk__bang" d="M12 7.5v5.5M12 16.3v.2"/></svg></span>';
  var ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ---------------------------------------------------------------- strings (English / Arabic) */
  var STR = {
    en: {
      title: "Ask GlobalHostia", sub: "Looks things up on your account. Changes need your confirmation.", conversation: "Conversation with the assistant",
      placeholder: "Ask about your domains, email or invoices…", label: "Your message", send: "Send", close: "Close assistant", newChat: "New chat",
      hello: "Hi! I can check your services, domains, DNS, email, SSL and invoices, and prepare changes for you to confirm. What do you need?",
      checking: "Checking your account…", typing: "The assistant is writing", foot: "AI can make mistakes. Check details before you confirm.",
      cancel: "Cancel", cancelled: "Cancelled. Nothing was changed.", working: "Working…", done: "Done.", fill: "Fill in the field above first.",
      failed: "That did not work. Please try again.", notAccepted: "That change was not accepted. Open the page to see the details.",
      portalOnly: "This change has to be made in your account area.", panelOnly: "This change has to be made in Manage hosting.", blocked: "This action is not allowed here.",
      offline: "You seem to be offline. Check your connection and try again.", dropped: "The connection dropped before the answer finished. Please ask again.",
      rate: "Too many messages in a short time. Please wait a minute, then try again.", expired: "Your session expired. Reload the page and try again.",
      unavailable: "The assistant is not available right now. Please try again in a minute, or open a support ticket.", empty: "Done.",
      dnsAdded: "Record added. Most resolvers see the change within the record’s TTL.", ticketOpened: "Ticket #{n} opened. We will reply by email.", viewTicket: "View ticket",
      mailboxPassword: "Password for the new mailbox", nothing: "Nothing changes until you confirm."
    },
    ar: {
      title: "اسأل GlobalHostia", sub: "يطّلع على حسابك. أي تغيير يحتاج إلى تأكيدك.", conversation: "المحادثة مع المساعد",
      placeholder: "اسأل عن نطاقاتك أو بريدك أو فواتيرك…", label: "رسالتك", send: "إرسال", close: "إغلاق المساعد", newChat: "محادثة جديدة",
      hello: "مرحباً! يمكنني فحص خدماتك ونطاقاتك وسجلات DNS والبريد وشهادات SSL والفواتير، وتجهيز التغييرات لتؤكدها بنفسك. بماذا أساعدك؟",
      checking: "جارٍ فحص حسابك…", typing: "المساعد يكتب", foot: "قد يخطئ الذكاء الاصطناعي. راجع التفاصيل قبل التأكيد.",
      cancel: "إلغاء", cancelled: "تم الإلغاء. لم يتغيّر شيء.", working: "جارٍ التنفيذ…", done: "تم.", fill: "املأ الحقل أعلاه أولاً.",
      failed: "لم ينجح ذلك. حاول مرة أخرى.", notAccepted: "لم يُقبل هذا التغيير. افتح الصفحة لمعرفة التفاصيل.",
      portalOnly: "يجب إجراء هذا التغيير من منطقة حسابك.", panelOnly: "يجب إجراء هذا التغيير من إدارة الاستضافة.", blocked: "هذا الإجراء غير مسموح هنا.",
      offline: "يبدو أنك غير متصل بالإنترنت. تحقق من الاتصال وحاول مرة أخرى.", dropped: "انقطع الاتصال قبل اكتمال الإجابة. اسأل مرة أخرى.",
      rate: "رسائل كثيرة في وقت قصير. انتظر دقيقة ثم حاول مرة أخرى.", expired: "انتهت جلستك. أعد تحميل الصفحة وحاول مرة أخرى.",
      unavailable: "المساعد غير متاح الآن. حاول بعد دقيقة أو افتح تذكرة دعم.", empty: "تم.",
      dnsAdded: "تمت إضافة السجل. ترى معظم الخوادم التغيير خلال مدة TTL الخاصة به.", ticketOpened: "تم فتح التذكرة #{n}. سنرد عليك بالبريد الإلكتروني.", viewTicket: "عرض التذكرة",
      mailboxPassword: "كلمة مرور صندوق البريد الجديد", nothing: "لن يتغيّر شيء حتى تؤكد."
    }
  };
  var CARD = {
    en: { "dns.add": ["Add {type} record", "Add record"], "email.create": ["Create mailbox", "Create mailbox"], "ssl.issue": ["Issue free SSL", "Issue certificate"], "ticket.open": ["Open a ticket", "Open ticket"] },
    ar: { "dns.add": ["إضافة سجل {type}", "إضافة السجل"], "email.create": ["إنشاء صندوق بريد", "إنشاء الصندوق"], "ssl.issue": ["إصدار شهادة SSL مجانية", "إصدار الشهادة"], "ticket.open": ["فتح تذكرة دعم", "فتح التذكرة"] }
  };
  var ROWS_AR = { Domain: "النطاق", Type: "النوع", Name: "الاسم", Value: "القيمة", TTL: "TTL", Priority: "الأولوية", Address: "العنوان", Quota: "الحصة", "Include www": "تضمين www", Yes: "نعم", No: "لا", Department: "القسم", Subject: "الموضوع", Message: "الرسالة" };
  /* starter chips per page (portal) and per tab (hosting panel). Every chip is a clear account question, so the scope
     filter (lib/ai/gate.ts) lets it through without a classifier call; tests/ai-assist.test.mts checks that. */
  var CHIPS = {
    en: {
      dashboard: ["What needs my attention on my account?", "Explain my latest invoice", "Which of my services renew soon?"],
      domains: ["Which domains expire soon?", "Which domains have auto-renew off?", "Why isn't my domain working?"],
      domain: ["Why isn't {d} working?", "Add MX records for Google Workspace", "Is the SSL certificate on {d} OK?"],
      services: ["Is my site healthy?", "Which of my services renew soon?", "Why is my email going to spam?"],
      service: ["Is my site healthy?", "Why is my email going to spam?", "What are my email settings for {d}?"],
      invoices: ["Why was I charged on my last invoice?", "Which invoices are unpaid?", "Explain my latest invoice"],
      invoice: ["Explain this invoice", "Why was I charged on this invoice?", "Which invoices are unpaid?"],
      renewals: ["Which renewals are due in the next 30 days?", "Which domains have auto-renew off?", "How much are my upcoming renewals?"],
      support: ["What is the status of my tickets?", "Open a ticket: my website is slow", "Why is my email going to spam?"],
      other: ["What needs my attention on my account?", "Is my site healthy?", "Which invoices are unpaid?"],
      "hosting:dns": ["Add MX records for Google Workspace", "Why isn't {d} working?", "Check the DNS records of {d}"],
      "hosting:email": ["Create a mailbox on {d}", "Why is my email going to spam?", "What are my email settings for {d}?"],
      "hosting:forwarders": ["Create a mailbox on {d}", "Why is my email going to spam?", "What are my email settings for {d}?"],
      "hosting:ssl": ["Issue a free SSL for {d}", "Is the SSL certificate on {d} OK?", "Is my site healthy?"],
      "hosting:health": ["Is my site healthy?", "Why isn't {d} working?", "Why is my email going to spam?"],
      hosting: ["Is my site healthy?", "Add MX records for Google Workspace", "Issue a free SSL for {d}"]
    },
    ar: {
      dashboard: ["ما الذي يحتاج إلى انتباهي في حسابي؟", "اشرح لي آخر فاتورة", "ما الخدمات التي يحين تجديدها قريباً؟"],
      domains: ["ما النطاقات التي تنتهي قريباً؟", "ما النطاقات التي أُوقف تجديدها التلقائي؟", "لماذا لا يعمل النطاق؟"],
      domain: ["لماذا لا يعمل النطاق {d}؟", "أضف سجلات MX لـ Google Workspace", "هل شهادة SSL على {d} سليمة؟"],
      services: ["هل موقعي يعمل بشكل سليم؟", "ما الخدمات التي يحين تجديدها قريباً؟", "لماذا يذهب بريدي إلى الرسائل المزعجة؟"],
      service: ["هل موقعي يعمل بشكل سليم؟", "لماذا يذهب بريدي إلى الرسائل المزعجة؟", "ما إعدادات البريد للنطاق {d}؟"],
      invoices: ["لماذا تم خصم هذا المبلغ في آخر فاتورة؟", "ما الفواتير غير المدفوعة؟", "اشرح لي آخر فاتورة"],
      invoice: ["اشرح لي هذه الفاتورة", "لماذا تم خصم هذا المبلغ في هذه الفاتورة؟", "ما الفواتير غير المدفوعة؟"],
      renewals: ["ما التجديدات المستحقة خلال 30 يوماً؟", "ما النطاقات التي أُوقف تجديدها التلقائي؟", "كم تبلغ تكلفة التجديدات القادمة؟"],
      support: ["ما حالة تذاكر الدعم الخاصة بي؟", "افتح تذكرة: موقعي بطيء", "لماذا يذهب بريدي إلى الرسائل المزعجة؟"],
      other: ["ما الذي يحتاج إلى انتباهي في حسابي؟", "هل موقعي يعمل بشكل سليم؟", "ما الفواتير غير المدفوعة؟"],
      "hosting:dns": ["أضف سجلات MX لـ Google Workspace", "لماذا لا يعمل النطاق {d}؟", "افحص سجلات DNS للنطاق {d}"],
      "hosting:email": ["أنشئ صندوق بريد على {d}", "لماذا يذهب بريدي إلى الرسائل المزعجة؟", "ما إعدادات البريد للنطاق {d}؟"],
      "hosting:forwarders": ["أنشئ صندوق بريد على {d}", "لماذا يذهب بريدي إلى الرسائل المزعجة؟", "ما إعدادات البريد للنطاق {d}؟"],
      "hosting:ssl": ["أصدر شهادة SSL مجانية للنطاق {d}", "هل شهادة SSL على {d} سليمة؟", "هل موقعي يعمل بشكل سليم؟"],
      "hosting:health": ["هل موقعي يعمل بشكل سليم؟", "لماذا لا يعمل النطاق {d}؟", "لماذا يذهب بريدي إلى الرسائل المزعجة؟"],
      hosting: ["هل موقعي يعمل بشكل سليم؟", "أضف سجلات MX لـ Google Workspace", "أصدر شهادة SSL مجانية للنطاق {d}"]
    }
  };
  /** chips without a domain fall back to wording that does not need one */
  var NO_D = { en: { "Why isn't {d} working?": "Why isn't my domain working?", "Is the SSL certificate on {d} OK?": "Is my SSL certificate OK?", "What are my email settings for {d}?": "What are my email settings?", "Check the DNS records of {d}": "Check my DNS records", "Create a mailbox on {d}": "Create a new mailbox", "Issue a free SSL for {d}": "Issue a free SSL certificate" },
    ar: { "لماذا لا يعمل النطاق {d}؟": "لماذا لا يعمل النطاق؟", "هل شهادة SSL على {d} سليمة؟": "هل شهادة SSL سليمة؟", "ما إعدادات البريد للنطاق {d}؟": "ما إعدادات البريد لديّ؟", "افحص سجلات DNS للنطاق {d}": "افحص سجلات DNS الخاصة بي", "أنشئ صندوق بريد على {d}": "أنشئ صندوق بريد جديد", "أصدر شهادة SSL مجانية للنطاق {d}": "أصدر شهادة SSL مجانية" } };

  function langOf(l) { return l === "ar" ? "ar" : "en"; }
  function strings(l) { return STR[langOf(l)]; }
  function fill(s, v) { for (var k in v || {}) s = s.split("{" + k + "}").join(v[k]); return s; }
  /** Starter questions for a page (portal: page name; hosting panel: "hosting" + tab), with the current domain filled in. */
  function chipsFor(page, tab, domain, lang) {
    var L = langOf(lang), set = CHIPS[L], list = (page === "hosting" && set["hosting:" + tab]) || set[page] || set.other;
    return list.map(function (c) { return c.indexOf("{d}") < 0 ? c : domain ? fill(c, { d: domain }) : NO_D[L][c] || c.replace(/\s*\{d\}/g, ""); });
  }

  /* ---------------------------------------------------------------- DOM helpers */
  function el(tag, attrs, kids) {
    var n = D.createElement(tag);
    for (var k in attrs || {}) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "text") n.textContent = v; else if (k === "html") n.innerHTML = v; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? D.createTextNode(c) : c); });
    return n;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  /** minimal Markdown: escape first, then links (http(s) or site paths, resolved against linkBase), bold, code, lists */
  function md(src, linkBase) {
    var out = [], list = null;
    function inline(s) {
      return s.replace(/\[([^\]]{1,200})\]\(((?:https?:\/\/|\/)[^\s)]{1,500})\)/g, function (_, t, u) {
        var href = u.charAt(0) === "/" && linkBase ? linkBase + u : u, ext = /^https?:/.test(href) && href.indexOf(root.location ? root.location.host : "") < 0;
        return '<a href="' + href + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + t + "</a>";
      }).replace(/\*\*([^*]{1,200})\*\*/g, "<b>$1</b>").replace(/`([^`]{1,200})`/g, '<code dir="ltr">$1</code>');
    }
    esc(src).split(/\n/).forEach(function (l) {
      var m = l.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
      if (m) { var t = m[1] ? "ol" : "ul"; if (!list || list !== t) { if (list) out.push("</" + list + ">"); list = t; out.push("<" + t + ">"); } out.push("<li>" + inline(m[2]) + "</li>"); return; }
      if (list) { out.push("</" + list + ">"); list = null; }
      if (l.trim()) out.push("<p>" + inline(l) + "</p>");
    });
    if (list) out.push("</" + list + ">");
    return out.join("");
  }
  async function tokenOf(auth) { var t = auth && auth.token; return typeof t === "function" ? await t() : t; }

  /* ---------------------------------------------------------------- proposals -> existing endpoints */
  var HOSTING_PATH = /^\/api\/hosting\/(dns|email|ssl)$/, PORTAL_PATH = /^\/account\/domains\/\d{1,10}\/dns$/, ACTION_PATH = "/api/ai/assist/action";
  var KIND_PATH = { "dns.add": [/^\/api\/hosting\/dns$/, PORTAL_PATH], "email.create": [/^\/api\/hosting\/email$/], "ssl.issue": [/^\/api\/hosting\/ssl$/], "ticket.open": [/^\/api\/ai\/assist\/action$/] };
  function bad(msg) { var e = new Error(msg); e.code = "blocked"; return e; }
  /** Only the values the card declared as inputs (the password the customer typed), as strings. */
  function inputsOf(p, inputs) { var o = {}; (p.inputs || []).forEach(function (f) { if (inputs && inputs[f.name] != null) o[f.name] = String(inputs[f.name]); }); return o; }
  /**
   * The request a confirmed proposal sends: one of the fixed endpoints, with this widget's credentials.
   * Throws for anything else (unknown kind, path, auth or surface). Synchronous and side-effect free (tests call it).
   *   hosting   POST <apiBase>/api/hosting/{dns|email|ssl}  JSON, Authorization: GH-Hosting <token> (added by execute)
   *   portal    POST /account/domains/<id>/dns               form + csrf, same-origin cookie
   *   assist    POST <apiBase>/api/ai/assist/action          JSON {token}, cookie (portal) or panel token (hosting)
   */
  function requestFor(p, inputs, o) {
    o = o || {};
    var T = strings(o.lang), rq = p && p.request, auth = o.auth || {}, base = o.apiBase || ORIGIN;
    if (!rq || rq.method !== "POST" || typeof rq.path !== "string" || !KIND_PATH[p.kind] || !KIND_PATH[p.kind].some(function (re) { return re.test(rq.path); })) throw bad(T.blocked);
    var extra = inputsOf(p, inputs);
    if (rq.auth === "portal") {
      if (auth.type !== "portal") throw bad(T.portalOnly);
      if (!PORTAL_PATH.test(rq.path)) throw bad(T.blocked);
      var body = new URLSearchParams();
      Object.keys(rq.form || {}).forEach(function (k) { body.append(k, String(rq.form[k])); });
      Object.keys(extra).forEach(function (k) { body.append(k, extra[k]); });
      body.append("csrf", auth.csrf || "");
      return { kind: "form", url: rq.path, init: { method: "POST", body: body, credentials: "same-origin", headers: { accept: "text/html" } } };
    }
    if (rq.auth === "hosting") {
      if (auth.type !== "hosting") throw bad(T.panelOnly);
      if (!HOSTING_PATH.test(rq.path)) throw bad(T.blocked);
      return { kind: "json", section: rq.path.split("/").pop(), token: true, url: base + rq.path,
        init: { method: "POST", mode: "cors", credentials: "omit", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({}, rq.json, extra)) } };
    }
    if (rq.auth === "assist") {
      if (rq.path !== ACTION_PATH || auth.type !== "portal" && auth.type !== "hosting") throw bad(T.blocked);
      var hosting = auth.type === "hosting";
      return { kind: "json", token: hosting, url: (hosting ? base : "") + rq.path,
        init: { method: "POST", credentials: hosting ? "omit" : "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: rq.json && rq.json.token }) } };
    }
    throw bad(T.blocked);
  }
  /** Manage hosting section a proposal targets ("dns" | "email" | "ssl"), else null. */
  function hostingSection(p) { var m = p && p.request && p.request.auth === "hosting" && HOSTING_PATH.exec(p.request.path || ""); return m ? m[1] : null; }
  function errFromHtml(html) {
    try { var doc = new DOMParser().parseFromString(html, "text/html"), a = doc.querySelector("#dns [role=alert], .ac-alert--err, .ac-flash--err"); return a ? a.textContent.replace(/\s+/g, " ").trim() : ""; } catch (e) { return ""; }
  }

  /** Default Confirm handler: sends the proposal's request to the existing endpoint with this widget's credentials. */
  async function execute(p, inputs, o) {
    o = o || {};
    var T = strings(o.lang), q = requestFor(p, inputs, o);
    if (q.token) q.init.headers.authorization = "GH-Hosting " + (await tokenOf(o.auth));
    var r = await fetch(q.url, q.init);
    if (q.kind === "form") {
      var html = await r.text().catch(function () { return ""; });
      if (r.ok && !/[?&]err=/.test(r.url)) return { ok: true, message: T.dnsAdded, url: r.url, html: html };
      throw new Error(errFromHtml(html) || T.notAccepted);
    }
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok || j.error) throw new Error(r.status === 401 ? T.expired : j.message || T.failed);
    if (p.kind === "ticket.open" && j.ticket) return { ok: true, message: fill(T.ticketOpened, { n: j.ticket }), ticket: j.ticket, url: j.url };
    return { ok: true, message: j.message || T.done };
  }

  /* ---------------------------------------------------------------- inline assistant */
  var seq = 0;
  function mount(host, o) {
    o = o || {};
    if (!host) throw new Error("GHAssist.mount: element required");
    var L = langOf(o.lang), T = strings(L), rtl = L === "ar";
    var endpoint = o.endpoint || ORIGIN + "/api/ai/assist";
    var linkBase = o.linkBase || "";
    var msgs = [], busy = false, ctx = o.context || {};
    var uid = "ghas" + (++seq);
    var ctxOf = function () { var c = typeof ctx === "function" ? ctx() : ctx; return Object.assign({}, c || {}, { lang: L }); };
    var log = el("div", { class: "ghas-log", role: "log", "aria-live": "polite", "aria-relevant": "additions text", "aria-label": T.conversation, tabindex: "0" });
    var live = el("p", { class: "ghas-sr", role: "status", "aria-live": "polite" });
    var input = el("textarea", { class: "ghas-input", id: uid + "-in", rows: "1", maxlength: "1500", dir: "auto", "aria-label": T.label, placeholder: o.placeholder || T.placeholder });
    var btn = el("button", { class: "ghas-send", type: "submit", "aria-label": T.send, html: ICON.send });
    var form = el("form", { class: "ghas-form", onsubmit: function (e) { e.preventDefault(); ask(input.value); } }, [input, btn]);
    var head = el("header", { class: "ghas-head" }, [el("span", { class: "ghas-hex", html: HEX }), el("div", { class: "ghas-ttl" }, [el("b", { id: uid + "-t", text: o.title || T.title }), el("small", { text: T.sub })])].concat(o.actions ? [el("div", { class: "ghas-acts" }, o.actions)] : []));
    var box = el("section", { class: "ghas", dir: rtl ? "rtl" : "ltr", lang: L, "aria-labelledby": uid + "-t" }, [head, log, live, form, el("p", { class: "ghas-foot", text: T.foot })]);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
    input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
    host.appendChild(box);
    intro();

    function scroll() { log.scrollTop = log.scrollHeight; }
    function intro() {
      log.innerHTML = "";
      bubble("ai", o.hello || T.hello);
      chips(typeof o.suggestions === "function" ? o.suggestions(ctxOf()) : o.suggestions || chipsFor((ctxOf().page) || "other", ctxOf().tab, ctxOf().domain, L));
    }
    function bubble(who, text) {
      var b = el("div", { class: "ghas-bub", dir: "auto" });
      if (who === "me") b.textContent = text; else b.innerHTML = md(text, linkBase);
      log.appendChild(el("div", { class: "ghas-msg ghas-msg--" + who }, who === "ai" ? [el("span", { class: "ghas-hex ghas-hex--sm", html: HEX }), b] : [b])); scroll(); return b;
    }
    function chips(list) {
      if (!list || !list.length) return;
      var box2 = el("div", { class: "ghas-chips" });
      list.forEach(function (t) { box2.appendChild(el("button", { class: "ghas-chip", type: "button", dir: "auto", text: t, onclick: function () { ask(t); } })); });
      log.appendChild(box2); scroll();
    }
    function cardText(p) {
      var c = CARD[L][p.kind], row = function (k) { var r = (p.rows || []).filter(function (x) { return x.k === k; })[0]; return r ? r.v : ""; };
      if (!c) return { title: p.title, confirm: p.confirmLabel || T.done };
      return { title: L === "en" ? p.title || fill(c[0], { type: row("Type") }) : fill(c[0], { type: row("Type") }), confirm: L === "en" ? p.confirmLabel || c[1] : c[1] };
    }
    function proposal(p) {
      var tx = cardText(p), inputs = {}, uidp = uid + "-p" + (++seq);
      var fields = (p.inputs || []).map(function (f, i) {
        var id = uidp + "-f" + i;
        var inp = el("input", { id: id, type: f.type === "password" ? "password" : "text", dir: "ltr", autocomplete: f.type === "password" ? "new-password" : "off", required: true, minlength: f.type === "password" ? "8" : null });
        inp.addEventListener("input", function () { inputs[f.name] = inp.value; });
        return el("div", { class: "ghas-fld" }, [el("label", { for: id, text: L === "ar" && f.name === "password" ? T.mailboxPassword : f.label }), inp]);
      });
      var status = el("p", { class: "ghas-status", role: "status" });
      var ok = el("button", { class: "ghas-btn", type: "button", text: tx.confirm });
      var no = el("button", { class: "ghas-btn ghas-btn--ghost", type: "button", text: T.cancel });
      var rows = [].concat.apply([], (p.rows || []).map(function (r) {
        var k = L === "ar" ? ROWS_AR[r.k] || r.k : r.k, v = L === "ar" && (r.v === "Yes" || r.v === "No") ? ROWS_AR[r.v] : r.v;
        var tech = /^(Domain|Type|Name|Value|TTL|Priority|Address)$/.test(r.k);
        return [el("dt", { text: k }), el("dd", { text: v, dir: tech ? "ltr" : "auto", class: tech ? "is-tech" : null })];
      }));
      var card = el("article", { class: "ghas-card", "aria-labelledby": uidp + "-h" }, [el("h5", { id: uidp + "-h", text: tx.title }), L === "en" && p.summary ? el("p", { text: p.summary, dir: "auto" }) : null,
        el("dl", {}, rows), fields.length ? el("div", { class: "ghas-fields" }, fields) : null, el("p", { class: "ghas-note", text: T.nothing }), status, el("div", { class: "ghas-row" }, [ok, no])]);
      no.onclick = function () { card.classList.add("is-done"); ok.disabled = no.disabled = true; status.textContent = T.cancelled; };
      ok.onclick = async function () {
        if ((p.inputs || []).some(function (f) { return !inputs[f.name]; })) { status.textContent = T.fill; var f0 = card.querySelector("input"); if (f0) f0.focus(); return; }
        ok.disabled = no.disabled = true; card.classList.remove("is-err"); card.setAttribute("aria-busy", "true"); status.textContent = T.working;
        try {
          var r = o.onAction ? await o.onAction(p, inputs) : await execute(p, inputs, o);
          card.classList.add("is-done", "is-ok"); card.removeAttribute("aria-busy");
          status.innerHTML = MK_OK + "<span>" + esc((r && r.message) || T.done) + "</span>";
          if (r && r.ticket && r.url) status.appendChild(el("a", { class: "ghas-link", href: (linkBase || "") + r.url, target: linkBase ? "_blank" : null, rel: linkBase ? "noopener" : null, text: T.viewTicket }));
          var note = card.querySelector(".ghas-note"); if (note) note.remove();
          if (o.onDone) try { o.onDone(p, r || {}); } catch (e) { /* the host page's refresh must not break the card */ }
        } catch (e) {
          card.removeAttribute("aria-busy"); card.classList.add("is-err");
          status.innerHTML = MK_ERR + "<span>" + esc((e && e.message) || T.failed) + "</span>";
          ok.disabled = no.disabled = e && e.code === "blocked";
        }
        fields.forEach(function (f) { var i = f.querySelector("input"); if (i) i.value = ""; }); inputs = {};
      };
      log.appendChild(card); scroll();
    }
    async function ask(text) {
      text = String(text || "").trim(); if (!text || busy) return;
      busy = true; btn.disabled = true;
      [].forEach.call(log.querySelectorAll(".ghas-chips"), function (c) { c.remove(); });
      bubble("me", text); msgs.push({ role: "user", content: text }); input.value = ""; input.style.height = "";
      var wait = el("div", { class: "ghas-msg ghas-msg--ai ghas-wait" }, [el("span", { class: "ghas-hex ghas-hex--sm", html: HEX }), el("div", { class: "ghas-bub" }, [el("span", { class: "ghas-typing", role: "img", "aria-label": T.typing }, [el("i"), el("i"), el("i")])])]);
      log.appendChild(wait); scroll();
      var b = null, reply = "", tool = null, ui = 0, failed = false, erred = false;
      var drop = function () { if (wait.parentNode) wait.remove(); if (tool && tool.parentNode) tool.remove(); };
      var say = function (t) { drop(); bubble("ai", t); };
      try {
        var headers = { "content-type": "application/json", accept: "text/event-stream" };
        if (o.auth && o.auth.type === "hosting") headers.authorization = "GH-Hosting " + (await tokenOf(o.auth));
        var r = await fetch(endpoint, { method: "POST", headers: headers, credentials: o.auth && o.auth.type === "portal" ? "same-origin" : "omit", body: JSON.stringify({ messages: msgs, context: ctxOf() }) });
        if ((r.headers.get("content-type") || "").indexOf("text/event-stream") < 0) {
          var j = await r.json().catch(function () { return {}; });
          failed = true; msgs.pop();
          say(r.status === 401 || r.status === 403 ? T.expired : j.message && L === "en" ? j.message : r.status === 429 ? T.rate : T.unavailable);
          return;
        }
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
        for (;;) {
          var x = await rd.read(); if (x.done) break;
          buf += dec.decode(x.value, { stream: true }); var parts = buf.split("\n\n"); buf = parts.pop();
          parts.forEach(function (part) {
            var ev = (part.match(/^event: (.*)$/m) || [])[1], data = (part.match(/^data: (.*)$/m) || [])[1]; if (!ev || data == null) return;
            var v; try { v = JSON.parse(data); } catch (e) { return; }
            if (ev === "text") { if (!b) { drop(); b = bubble("ai", ""); b.setAttribute("aria-busy", "true"); } reply += v.t; b.innerHTML = md(reply, linkBase); scroll(); }
            else if (ev === "tool") { if (!tool) { tool = el("p", { class: "ghas-tool", text: T.checking }); log.insertBefore(tool, wait.parentNode ? wait : null); live.textContent = T.checking; scroll(); } }
            else if (ev === "ui") { drop(); if (b) b.removeAttribute("aria-busy"); b = null; ui++; if (v.type === "proposal") proposal(v); else if (v.type === "chips") chips(v.items || []); }
            else if (ev === "error") { erred = true; if (b) b.removeAttribute("aria-busy"); say(v.message || T.failed); b = null; }
          });
        }
        if (reply || ui) msgs.push({ role: "assistant", content: reply || "(shown a card)" }); else if (erred) { failed = true; msgs.pop(); } else { say(T.empty); msgs.push({ role: "assistant", content: T.empty }); }
      } catch (e) { failed = true; msgs.pop(); say(root.navigator && root.navigator.onLine === false ? T.offline : T.dropped); }
      finally { drop(); if (b) b.removeAttribute("aria-busy"); live.textContent = ""; busy = false; btn.disabled = false; if (o.onAnswer) try { o.onAnswer(!failed); } catch (e) { /* ignore */ } }
    }
    return {
      ask: ask,
      setContext: function (c) { ctx = c || {}; },
      reset: function () { msgs = []; intro(); },
      focus: function () { input.focus(); },
      destroy: function () { box.remove(); },
      element: box, input: input,
    };
  }

  /* ---------------------------------------------------------------- side sheet (desktop) / full screen (phones) */
  function sheet(o) {
    o = o || {};
    var L = langOf(o.lang), T = strings(L), rtl = L === "ar", lastFocus = null, closing = 0;
    var wrap = el("div", { class: "ghas-sheet", dir: rtl ? "rtl" : "ltr", lang: L, hidden: true });
    var panel = el("div", { class: "ghas-panel", role: "dialog", "aria-modal": "true" });
    var newBtn = el("button", { class: "ghas-ibtn", type: "button", "aria-label": T.newChat, title: T.newChat, html: ICON.reset, onclick: function () { m.reset(); m.focus(); } });
    var closeBtn = el("button", { class: "ghas-ibtn", type: "button", "aria-label": T.close, title: T.close, html: ICON.close, onclick: function () { close(); } });
    wrap.appendChild(el("div", { class: "ghas-scrim", onclick: function () { close(); } }));
    wrap.appendChild(panel);
    D.body.appendChild(wrap);
    var m = mount(panel, Object.assign({}, o, { actions: [newBtn, closeBtn] }));
    panel.setAttribute("aria-labelledby", m.element.getAttribute("aria-labelledby"));
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== "Tab") return;
      var f = [].filter.call(panel.querySelectorAll('button:not([disabled]),a[href],textarea,input:not([disabled]),select,[tabindex="0"]'), function (x) { return x.offsetParent !== null || x === D.activeElement; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && D.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && D.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    var small = function () { return root.matchMedia && root.matchMedia("(max-width:640px)").matches; };
    function isOpen() { return !wrap.hidden && wrap.classList.contains("is-open"); }
    function open(q) {
      clearTimeout(closing);
      if (!isOpen()) {
        lastFocus = D.activeElement;
        wrap.hidden = false; void wrap.offsetWidth; wrap.classList.add("is-open");
        D.documentElement.classList.add(small() ? "ghas-lock" : "ghas-on");
        if (o.onOpen) o.onOpen();
      }
      setTimeout(function () { m.focus(); }, 30);
      if (q) m.ask(q);
    }
    function close() {
      if (wrap.hidden) return;
      wrap.classList.remove("is-open");
      D.documentElement.classList.remove("ghas-lock", "ghas-on");
      closing = setTimeout(function () { wrap.hidden = true; }, 240);
      if (o.onClose) o.onClose();
      var back = lastFocus && D.contains(lastFocus) ? lastFocus : null;
      if (back && back.focus) back.focus({ preventScroll: true });
    }
    return { open: open, close: close, isOpen: isOpen, toggle: function () { if (isOpen()) close(); else open(); }, ask: function (q) { open(q); }, setContext: m.setContext, reset: m.reset, element: wrap, assistant: m,
      destroy: function () { close(); wrap.remove(); } };
  }

  root.GHAssist = { mount: mount, sheet: sheet, execute: execute, requestFor: requestFor, hostingSection: hostingSection, chipsFor: chipsFor, strings: STR, chips: CHIPS, version: "2" };
})(typeof window !== "undefined" ? window : globalThis);
