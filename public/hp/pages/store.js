/* Business services shop: search + section filter on the hub (cards, bundles and matching plans), and the quote /
   contact-sales form on category pages (client-side checks, JSON submit to /api/store/quote, inline errors, success state).
   Without JavaScript every card is visible and the form posts normally (?quote= / ?quote_error= on return). */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";

  /* ---------------- hub filter */
  var bar = HP.$("[data-bs-filter]");
  if (bar) {
    var q = HP.$("[data-bs-q]", bar), count = HP.$("[data-bs-count]", bar), chips = HP.$$("[data-bs-sec]", bar);
    var cards = HP.$$("[data-bs-card]"), groups = HP.$$("[data-bs-group]"), plans = HP.$$("[data-bs-plan]");
    var results = HP.$("[data-bs-results]"), empty = HP.$("[data-bs-empty]"), sec = "";
    var words = function (s) { return String(s || "").toLowerCase().split(/[^a-z0-9.+&]+/).filter(function (w) { return w.length > 1; }); };
    var hit = function (el, ws) { var t = el.getAttribute("data-q") || ""; return ws.every(function (w) { return t.indexOf(w) >= 0; }); };
    var inSec = function (el) { return !sec || el.getAttribute("data-sec") === sec; };
    function apply() {
      var ws = words(q && q.value), shown = 0, planHits = 0;
      cards.forEach(function (c) { var on = inSec(c) && hit(c, ws); c.hidden = !on; if (on) shown++; });
      groups.forEach(function (g) { g.hidden = !HP.$$("[data-bs-card]", g).some(function (c) { return !c.hidden; }); });
      plans.forEach(function (p) { var on = ws.length > 0 && inSec(p) && hit(p, ws); p.hidden = !on; if (on) planHits++; });
      if (results) results.hidden = planHits === 0;
      if (empty) empty.hidden = shown + planHits > 0;
      if (count) count.textContent = ws.length || sec ? shown + (shown === 1 ? " service" : " services") + (planHits ? " and " + planHits + (planHits === 1 ? " plan" : " plans") : "") + " match" + (shown + planHits === 1 ? "es" : "") : "";
    }
    var t;
    if (q) q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(apply, 120); });
    chips.forEach(function (b) {
      b.addEventListener("click", function () {
        sec = b.getAttribute("data-bs-sec") || "";
        chips.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        apply();
      });
    });
    // deep link: /business-services?q=backup
    try { var qs = new URLSearchParams(location.search).get("q"); if (qs && q) { q.value = qs.slice(0, 80); apply(); } } catch (e) { /* old browser */ }
  }

  /* ---------------- quote form */
  var form = HP.$("[data-bs-form]"), done = HP.$("[data-bs-done]");
  if (!form || !done) return;
  if (!done.hidden && window.GHFx) window.GHFx.success(done);
  var tf = HP.$("[data-bs-t]", form); if (tf) tf.value = String(Date.now());
  var btn = HP.$("[data-bs-btn]", form), alertBox = HP.$("[data-bs-alert]", form);
  var EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i, SITE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
  function setErr(id, msg) {
    var wrap = HP.$("[data-field='" + id + "']", form); if (!wrap) return;
    var p = HP.$(".bs-err", wrap), input = HP.$("input,select,textarea", wrap);
    wrap.classList.toggle("is-err", !!msg);
    if (p) { p.textContent = msg || ""; p.hidden = !msg; }
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function check() {
    var fd = new FormData(form), errs = {}, filled = false;
    if (String(fd.get("name") || "").trim().length < 2) errs.name = "Please enter your name.";
    if (!EMAIL.test(String(fd.get("email") || "").trim())) errs.email = "Please enter a valid email address.";
    var ph = String(fd.get("phone") || "").trim(); if (ph && !/^\+?[\d\s().-]{6,30}$/.test(ph)) errs.phone = "Use digits only, with your country code (for example +971 50 000 0000).";
    var ws = String(fd.get("website") || "").trim(); if (ws && !SITE.test(ws)) errs.website = "Enter a web address like example.com, or leave it empty.";
    fd.forEach(function (v, k) { if (/^q\d$/.test(k) && String(v).trim().length >= 3) filled = true; });
    if (String(fd.get("notes") || "").trim().length < 10 && !filled && !fd.get("option")) errs.notes = "Tell us a little about what you need.";
    return errs;
  }
  var KEYS = ["name", "email", "phone", "website", "notes"];
  function show(errs) {
    KEYS.forEach(function (k) { setErr(k, errs[k]); });
    var first = KEYS.filter(function (k) { return errs[k]; })[0];
    if (first) { var el = HP.$("[data-field='" + first + "'] input, [data-field='" + first + "'] textarea", form); if (el) el.focus(); }
  }
  form.addEventListener("input", function (e) { var w = e.target.closest("[data-field]"); if (w && w.classList.contains("is-err")) setErr(w.dataset.field, check()[w.dataset.field]); });
  // failed send: the reason in plain words, "Try again" when retrying can help, WhatsApp once it keeps failing (/hp/fx.js)
  function fail(status, r, er) {
    if (!alertBox) return;
    var FX = window.GHFx, info = FX ? FX.errInfo(status, r, er) : { msg: (r && r.error) || "We could not send your request. Please try again, or contact us on WhatsApp.", retry: false };
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
    var body = {}; new FormData(form).forEach(function (v, k) { body[k] = v; });
    btn.disabled = true; btn.setAttribute("aria-busy", "true"); var lbl = HP.$("span", btn), old = lbl.textContent; lbl.textContent = "Sending…";
    var status = 0, ac = window.AbortController ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, 25000) : 0;
    fetch(form.action, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), credentials: "same-origin", signal: ac ? ac.signal : undefined })
      .then(function (r) { status = r.status; return r.json().catch(function () { return null; }); })
      .then(function (r) {
        if (r && r.ok) {
          var tk = HP.$("[data-bs-ticket]", done), line = HP.$("[data-bs-tline]", done);
          if (r.ticket && r.ticket !== "received") { tk.textContent = r.ticket; line.hidden = false; } else line.hidden = true;
          form.hidden = true; done.hidden = false; done.focus(); if (window.GHFx) window.GHFx.success(done);
          var top = done.getBoundingClientRect().top + window.pageYOffset - 120; window.scrollTo({ top: top, behavior: HP.reduce ? "auto" : "smooth" });
          if (window.dataLayer) window.dataLayer.push({ event: "generate_lead", lead_source: "quote" });
          return;
        }
        if (r && r.fields) show(r.fields);
        fail(status, r, null);
      })
      .catch(function (er) { fail(0, null, er); })
      .then(function () { clearTimeout(tm); btn.disabled = false; btn.removeAttribute("aria-busy"); lbl.textContent = old; });
  });
});
