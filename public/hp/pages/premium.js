/* Premium domains: live filters, sort and paging on /premium-domains (the server already filters ?q=&tld=… without JS),
   and the purchase request form on /premium-domains/<domain> (JSON submit to /api/premium-request, inline errors). */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- listing ---------------- */
  var form = $("[data-pd-form]"), box = $("[data-pd-results]");
  if (form && box) {
    var cards = $$("[data-pd]", box), none = $("[data-pd-none]"), count = $("[data-pd-count]"), pager = $("[data-pd-pager]");
    var PER = 24, pageNo = 1;
    form.classList.add("is-live");
    var val = function (n) { var el = form.elements[n]; return el ? String(el.value || "").trim() : ""; };
    var lenOk = function (n, l) { return !l || (l === "1-4" ? n <= 4 : l === "5-6" ? n >= 5 && n <= 6 : l === "7-9" ? n >= 7 && n <= 9 : l === "10+" ? n >= 10 : true); };
    var price = function (c) { var p = c.getAttribute("data-p"), m = c.getAttribute("data-mo"); return p !== "" ? +p : m !== "" ? +m : Infinity; };
    var apply = function (keepPage) {
      var q = val("q").toLowerCase().replace(/[^a-z0-9.-]/g, ""), tld = val("tld"), len = val("len"), cat = val("cat"), sort = val("sort") || "featured";
      var min = parseFloat(val("min")), max = parseFloat(val("max"));
      var list = cards.filter(function (c) {
        var d = c.getAttribute("data-d"), p = c.getAttribute("data-p"), mo = +(c.getAttribute("data-mo") || 0);
        if (q && d.indexOf(q) < 0) return false;
        if (tld && c.getAttribute("data-tld") !== tld) return false;
        if (!lenOk(+c.getAttribute("data-len"), len)) return false;
        if (cat && (" " + c.getAttribute("data-c") + " ").indexOf(" " + cat + " ") < 0) return false;
        if (!isNaN(min) && (p !== "" ? +p : mo) < min) return false;
        if (!isNaN(max) && (p !== "" ? +p > max : mo > max)) return false;
        return true;
      });
      var cmp = {
        featured: function (a, b) { return (+b.getAttribute("data-f") - +a.getAttribute("data-f")) || (+b.getAttribute("data-o") - +a.getAttribute("data-o")) || price(a) - price(b); },
        "price-asc": function (a, b) { return price(a) - price(b); },
        "price-desc": function (a, b) { var x = a.getAttribute("data-p"), y = b.getAttribute("data-p"); return (y === "" ? -1 : +y) - (x === "" ? -1 : +x); },
        length: function (a, b) { return +a.getAttribute("data-len") - +b.getAttribute("data-len"); },
        az: function () { return 0; }
      }[sort] || function () { return 0; };
      list.sort(function (a, b) { return cmp(a, b) || a.getAttribute("data-d").localeCompare(b.getAttribute("data-d")); });
      // layout follows the number of matches: feature spread (1-3), cards (4-24), compact list with pages (25+)
      var lay = list.length <= 3 ? "feature" : list.length <= 24 ? "grid" : "list";
      box.className = "pd-results pd-results--" + lay;
      cards.forEach(function (c) { c.hidden = true; c.classList.toggle("pd-card--feature", lay === "feature"); });
      var pages = lay === "list" ? Math.ceil(list.length / PER) : 1;
      if (!keepPage || pageNo > pages) pageNo = 1;
      list.forEach(function (c, i) { box.appendChild(c); c.hidden = lay === "list" && (i < (pageNo - 1) * PER || i >= pageNo * PER); });
      if (none) none.hidden = list.length > 0;
      box.hidden = !list.length;
      if (count) count.innerHTML = "<b class=\"num\">" + list.length + "</b> " + (list.length === 1 ? "name" : "names");
      if (pager) {
        pager.hidden = pages < 2; pager.innerHTML = "";
        for (var p = 1; p <= pages; p++) {
          var b = document.createElement("button"); b.type = "button"; b.textContent = String(p); b.setAttribute("aria-label", "Page " + p);
          if (p === pageNo) b.setAttribute("aria-current", "page");
          b.addEventListener("click", (function (n) { return function () { pageNo = n; apply(true); box.scrollIntoView({ behavior: "smooth", block: "start" }); }; })(p));
          pager.appendChild(b);
        }
      }
      try { // shareable URL without reloading
        var u = new URL(location.href);
        ["q", "tld", "min", "max", "len", "cat", "sort"].forEach(function (k) { var v = val(k); if (v && !(k === "sort" && v === "featured")) u.searchParams.set(k, v); else u.searchParams.delete(k); });
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) { /* old browser */ }
    };
    var tm;
    form.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(function () { apply(false); }, 160); });
    form.addEventListener("change", function () { apply(false); });
    form.addEventListener("submit", function (e) { e.preventDefault(); apply(false); });
    var reset = $("[data-pd-reset]");
    if (reset) reset.addEventListener("click", function (e) { e.preventDefault(); form.reset(); $$("input", form).forEach(function (i) { i.value = ""; }); apply(false); });
    apply(false);
  }

  /* ---------------- request form ---------------- */
  var rf = $("[data-pd-req]"), done = $("[data-pd-done]");
  if (done && !done.hidden && window.GHFx) window.GHFx.success(done);
  if (!rf || !done) return;
  var t = $("[data-pd-t]", rf); if (t) t.value = String(Date.now());
  var offer = $("[data-pd-offer]", rf), alertBox = $("[data-pd-alert]", rf), btn = $("[data-pd-btn]", rf);
  var sync = function () { var c = $("input[name=intent]:checked", rf); if (offer) offer.hidden = !c || c.value !== "offer"; };
  $$("[data-pd-radio]", rf).forEach(function (r) { r.addEventListener("change", sync); });
  $$("[data-pd-intent]").forEach(function (a) {
    a.addEventListener("click", function () {
      var r = $("input[name=intent][value=" + a.getAttribute("data-pd-intent") + "]", rf); if (r) { r.checked = true; sync(); }
      setTimeout(function () { var el = a.getAttribute("data-pd-intent") === "offer" ? $("#pd-offer", rf) : $("#pd-name", rf); if (el) el.focus({ preventScroll: true }); }, 350);
    });
  });
  sync();
  var EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i;
  function setErr(id, msg) {
    var p = $("#pd-" + id + "-err", rf), input = $("[name='" + id + "']", rf); if (!p) return;
    var wrap = p.parentNode; if (wrap) wrap.classList.toggle("is-bad", !!msg);
    p.textContent = msg || ""; p.hidden = !msg;
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function check() {
    var fd = new FormData(rf), e = {};
    if (fd.get("intent") === "offer") { var o = String(fd.get("offer") || "").replace(/[,\s]/g, ""); if (!/^\d+(\.\d{1,2})?$/.test(o) || +o <= 0) e.offer = "Enter your offer as a number, for example 2500."; }
    if (String(fd.get("name") || "").trim().length < 2) e.name = "Please enter your name.";
    if (!EMAIL.test(String(fd.get("email") || "").trim())) e.email = "Please enter a valid email address.";
    var ph = String(fd.get("phone") || "").trim(); if (ph && !/^\+?[\d\s()-]{6,30}$/.test(ph)) e.phone = "Use digits only, with your country code (for example +971 50 000 0000).";
    if (!fd.get("consent")) e.consent = "Please confirm we may contact you about this domain.";
    return e;
  }
  function show(errs) {
    ["offer", "name", "email", "phone", "consent"].forEach(function (k) { setErr(k, errs[k]); });
    var first = Object.keys(errs)[0]; if (first) { var el = $("[name='" + first + "']", rf); if (el) el.focus(); }
  }
  rf.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var errs = check(); show(errs);
    if (Object.keys(errs).length) return;
    var body = {}; new FormData(rf).forEach(function (v, k) { body[k] = v; });
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    if (alertBox) alertBox.hidden = true;
    fetch(rf.action, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Unexpected reply. Please try again." }; }); })
      .then(function (d) {
        if (d.ok) {
          rf.hidden = true; done.hidden = false;
          var line = $("[data-pd-refline]", done), ref = $("[data-pd-ref]", done);
          if (d.ref && d.ref !== "received" && ref) { ref.textContent = d.ref; line.hidden = false; }
          done.focus(); if (window.GHFx) window.GHFx.success(done);
          return;
        }
        if (d.fields) show(d.fields);
        if (alertBox) { alertBox.textContent = d.error || "Something went wrong. Please try again."; alertBox.hidden = false; }
      })
      .catch(function () { if (alertBox) { alertBox.textContent = "Network error. Please check your connection and try again."; alertBox.hidden = false; } })
      .then(function () { btn.disabled = false; btn.removeAttribute("aria-busy"); });
  });
});
