/* Free migration form: client-side checks, JSON submit to /api/free-migration, inline errors, success state.
   Without JavaScript the form posts normally and the page shows the result from ?ticket= / ?error=. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  var form = HP.$("[data-mg-form]"), done = HP.$("[data-mg-done]");
  if (!form || !done) return;
  if (!done.hidden && window.GHFx) window.GHFx.success(done);
  var t = HP.$("[data-mg-t]", form); if (t) t.value = String(Date.now());
  var btn = HP.$("[data-mg-btn]", form), alertBox = HP.$("[data-mg-alert]", form);
  // the Arabic page (/ar/free-migration, <html lang="ar">) gets Arabic messages
  var AR = document.documentElement.lang === "ar", T = function (en, ar) { return AR ? ar : en; };
  var EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i, SITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

  function setErr(id, msg) {
    var wrap = HP.$("[data-field='" + id + "']", form); if (!wrap) return;
    var p = HP.$(".mg-err", wrap), input = HP.$("input,select,textarea", wrap);
    wrap.classList.toggle("is-err", !!msg);
    if (p) { p.textContent = msg || ""; p.hidden = !msg; }
    if (input && id !== "what") input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function check() {
    var fd = new FormData(form), errs = {};
    if (String(fd.get("name") || "").trim().length < 2) errs.name = T("Please enter your name.", "يرجى إدخال اسمك.");
    if (!EMAIL.test(String(fd.get("email") || "").trim())) errs.email = T("Please enter a valid email address.", "يرجى إدخال بريد إلكتروني صحيح.");
    var ph = String(fd.get("phone") || "").trim(); if (ph && !/^\+?[\d\s()-]{6,30}$/.test(ph)) errs.phone = T("Use digits only, with your country code (for example +971 50 000 0000).", "استخدم الأرقام فقط مع رمز الدولة (مثلاً \u200e+971 50 000 0000).");
    if (!SITE.test(String(fd.get("site") || "").trim())) errs.site = T("Please enter the address of the site to move, for example example.com.", "يرجى إدخال عنوان الموقع المراد نقله، مثلاً example.com.");
    if (!fd.getAll("what").length) errs.what = T("Choose at least one thing to move.", "اختر عنصراً واحداً على الأقل لنقله.");
    return errs;
  }
  function show(errs) {
    ["name", "email", "phone", "site", "what"].forEach(function (k) { setErr(k, errs[k]); });
    var first = Object.keys(errs)[0];
    if (first) { var el = HP.$("[data-field='" + first + "'] input, [data-field='" + first + "'] select", form); if (el) el.focus(); }
  }
  form.addEventListener("input", function (e) { var w = e.target.closest("[data-field]"); if (w && w.classList.contains("is-err")) { var errs = check(); setErr(w.dataset.field, errs[w.dataset.field]); } });
  form.addEventListener("change", function (e) { if (e.target.name === "what") setErr("what", check().what); });
  // failed send: the reason in plain words, "Try again" when retrying can help, WhatsApp once it keeps failing (/hp/fx.js)
  function fail(status, r, er) {
    if (!alertBox) return;
    var FX = window.GHFx, info = FX ? FX.errInfo(status, r, er) : { msg: (r && r.error) || T("We could not send your request. Please try again, or contact us on WhatsApp.", "تعذّر إرسال طلبك. يرجى المحاولة مرة أخرى، أو التواصل معنا على واتساب."), retry: false };
    if (r && r.fields && FX) info.retry = false; // field problems: fixing the fields is the next step, not a retry
    if (FX) FX.showError(alertBox, info, { retry: function () { if (form.requestSubmit) form.requestSubmit(); else btn.click(); } });
    else { alertBox.textContent = info.msg; alertBox.hidden = false; }
    if (!(r && r.fields)) alertBox.scrollIntoView({ block: "nearest", behavior: HP.reduce ? "auto" : "smooth" });
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (alertBox) alertBox.hidden = true;
    var errs = check();
    if (Object.keys(errs).length) { show(errs); return; }
    var fd = new FormData(form), body = {};
    fd.forEach(function (v, k) { if (k === "what") (body.what = body.what || []).push(v); else body[k] = v; });
    btn.disabled = true; btn.setAttribute("aria-busy", "true"); var lbl = HP.$("span", btn), old = lbl.textContent; lbl.textContent = T("Sending your request…", "جارٍ إرسال طلبك…");
    var status = 0, ac = window.AbortController ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, 25000) : 0;
    fetch(form.action, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), credentials: "same-origin", signal: ac ? ac.signal : undefined })
      .then(function (r) { status = r.status; return r.json().catch(function () { return null; }); })
      .then(function (r) {
        if (r && r.ok) {
          var tk = HP.$("[data-mg-ticket]", done), line = HP.$("[data-mg-tline]", done);
          if (r.ticket && r.ticket !== "received") { tk.textContent = r.ticket; line.hidden = false; } else line.hidden = true;
          form.hidden = true; done.hidden = false; done.focus(); if (window.GHFx) window.GHFx.success(done);
          var top = done.getBoundingClientRect().top + window.pageYOffset - 120; window.scrollTo({ top: top, behavior: HP.reduce ? "auto" : "smooth" });
          return;
        }
        if (r && r.fields) show(r.fields);
        fail(status, r, null);
      })
      .catch(function (er) { fail(0, null, er); })
      .then(function () { clearTimeout(tm); btn.disabled = false; btn.removeAttribute("aria-busy"); lbl.textContent = old; });
  });
});
