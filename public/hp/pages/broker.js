/* Domain broker request form: client-side checks, JSON submit to /api/broker-request, inline errors, success state
   with the fee payment link. Without JavaScript the form posts normally and the page shows ?ref= / ?error=. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  var form = HP.$("[data-br-form]"), done = HP.$("[data-br-done]");
  if (!form || !done) return;
  if (!done.hidden && window.GHFx) window.GHFx.success(done);
  var t = HP.$("[data-br-t]", form); if (t) t.value = String(Date.now());
  try {
    var qs = new URLSearchParams(location.search), keep = {};
    try { keep = JSON.parse(sessionStorage.getItem("gh_utm") || "{}"); } catch (e) { keep = {}; }
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) {
      var el = HP.$("input[name='" + k + "']", form), v = qs.get(k) || keep[k] || "";
      if (el) el.value = v.slice(0, 120);
    });
    var r = HP.$("input[name='referrer']", form); if (r) r.value = (document.referrer || "").slice(0, 300);
  } catch (e) { /* old browser: UTM fields stay empty */ }

  var btn = HP.$("[data-br-btn]", form), alertBox = HP.$("[data-br-alert]", form);
  var EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i, DOMAIN = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i;
  var AMT = /^\d+(\.\d{1,2})?$/;
  var num = function (v) { v = String(v || "").replace(/[,\s]/g, ""); return v === "" ? null : AMT.test(v) ? Number(v) : NaN; };
  var host = function (v) { return String(v || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""); };

  function setErr(id, msg) {
    var p = HP.$("#br-" + id + "-err", form); if (!p) return;
    var wrap = id === "budget_min" ? HP.$("[data-field='budget_min']", form) : HP.$("[data-field='" + id + "']", form);
    var input = HP.$("#br-" + id, form) || HP.$("[name='" + id + "']", form);
    if (wrap) wrap.classList.toggle("is-err", !!msg);
    if (id === "budget_max") { var bi = HP.$("#br-budget_max", form); if (bi && bi.parentNode) bi.parentNode.classList.toggle("is-err", !!msg); }
    p.textContent = msg || ""; p.hidden = !msg;
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function check() {
    var fd = new FormData(form), errs = {};
    if (!DOMAIN.test(host(fd.get("domain")))) errs.domain = "Enter the full domain you want, for example yourbrand.com.";
    var mn = num(fd.get("budget_min")), mx = num(fd.get("budget_max"));
    if (mn !== null && (isNaN(mn) || mn < 0)) errs.budget_min = "Enter a number, or leave it empty.";
    if (mx === null || isNaN(mx) || mx <= 0) errs.budget_max = "Enter the most you would pay for the domain.";
    else if (mx > 100000000) errs.budget_max = "Please enter a realistic maximum budget.";
    else if (mn !== null && !isNaN(mn) && mn > mx) errs.budget_min = "The minimum cannot be higher than the maximum.";
    if (String(fd.get("name") || "").trim().length < 2) errs.name = "Please enter your name.";
    if (!EMAIL.test(String(fd.get("email") || "").trim())) errs.email = "Please enter a valid email address.";
    var ph = String(fd.get("phone") || "").trim(); if (ph && !/^\+?[\d\s()-]{6,30}$/.test(ph)) errs.phone = "Use digits only, with your country code (for example +971 50 000 0000).";
    if (!fd.get("consent")) errs.consent = "Please confirm you have read how the fees work.";
    return errs;
  }
  var KEYS = ["domain", "budget_min", "budget_max", "name", "email", "phone", "consent"];
  function show(errs) {
    KEYS.forEach(function (k) { setErr(k, errs[k]); });
    var first = KEYS.filter(function (k) { return errs[k]; })[0];
    if (first) { var el = HP.$("#br-" + first, form) || HP.$("[name='" + first + "']", form); if (el) el.focus(); }
  }
  form.addEventListener("input", function (e) {
    var n = e.target.name; if (KEYS.indexOf(n) < 0) return;
    var errs = check(); if (HP.$("#br-" + n + "-err", form) && !HP.$("#br-" + n + "-err", form).hidden) setErr(n, errs[n]);
    if (n === "budget_max" || n === "budget_min") { setErr("budget_min", errs.budget_min && !HP.$("#br-budget_min-err", form).hidden ? errs.budget_min : ""); }
  });
  form.addEventListener("change", function (e) { if (e.target.name === "consent") setErr("consent", check().consent); });
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
    var fd = new FormData(form), body = {};
    fd.forEach(function (v, k) { body[k] = v; });
    body.domain = host(body.domain);
    btn.disabled = true; btn.setAttribute("aria-busy", "true"); var lbl = HP.$("span", btn), old = lbl.textContent; lbl.textContent = "Sending your request…";
    var status = 0, ac = window.AbortController ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, 25000) : 0;
    fetch(form.action, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), credentials: "same-origin", signal: ac ? ac.signal : undefined })
      .then(function (r) { status = r.status; return r.json().catch(function () { return null; }); })
      .then(function (r) {
        if (r && r.ok) {
          var ref = HP.$("[data-br-ref]", done), line = HP.$("[data-br-refline]", done);
          if (r.ref && r.ref !== "received") { ref.textContent = r.ref; line.hidden = false; } else line.hidden = true;
          var pw = HP.$("[data-br-paywrap]", done), wait = HP.$("[data-br-wait]", done), pay = HP.$("[data-br-pay]", done);
          if (r.payUrl && pay) { pay.href = r.payUrl; pw.hidden = false; wait.hidden = true; } else { pw.hidden = true; wait.hidden = false; }
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
