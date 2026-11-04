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
    if (reset) reset.addEventListener("click", function (e) { e.preventDefault(); form.reset(); $$("input", form).forEach(function (i) { i.value = ""; }); $$("select[data-pd-f]", form).forEach(function (s) { s.dispatchEvent(new Event("change")); }); apply(false); });
    apply(false);
    enhanceSelects(form);
  }

  /* ---------------- compact dropdowns (replace the native list, which can fill the whole screen) ---------------- */
  function enhanceSelects(root) {
    var POPULAR = [".com", ".ai", ".io", ".net", ".co", ".ae", ".org", ".app"];
    var uid = 0;
    $$("select[data-pd-f]", root).forEach(function (sel) {
      if (sel.getAttribute("data-pd-dd")) return;
      sel.setAttribute("data-pd-dd", "1");
      var id = "pddd" + (++uid), many = sel.options.length > 10;
      var wrap = document.createElement("div"); wrap.className = "pd-dd";
      var btn = document.createElement("button"); btn.type = "button"; btn.className = "pd-dd__btn hp-select";
      btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", id);
      // name = the visible label + the chosen value ("Extension All extensions"), so speech users can say what they see (WCAG 2.5.3)
      var lab = sel.closest("label"), labEl = lab && lab.querySelector("span"); btn.id = id + "-b";
      if (labEl) { labEl.id = labEl.id || id + "-l"; btn.setAttribute("aria-labelledby", labEl.id + " " + btn.id); }
      var pop = document.createElement("div"); pop.className = "pd-dd__pop"; pop.hidden = true;
      var search = null;
      if (many) { search = document.createElement("input"); search.type = "search"; search.className = "pd-dd__q"; search.placeholder = "Search…"; search.setAttribute("aria-label", "Search options"); pop.appendChild(search); }
      var list = document.createElement("ul"); list.className = "pd-dd__list"; list.id = id; list.setAttribute("role", "listbox"); pop.appendChild(list);
      var opts = [].slice.call(sel.options).map(function (o) { return { v: o.value, t: o.textContent }; });
      if (many) {
        var first = opts.filter(function (o) { return !o.v; }), pop1 = [], rest = [];
        opts.forEach(function (o) { if (!o.v) return; (POPULAR.indexOf(o.v) >= 0 ? pop1 : rest).push(o); });
        pop1.sort(function (a, b) { return POPULAR.indexOf(a.v) - POPULAR.indexOf(b.v); });
        opts = first.concat(pop1.map(function (o) { return { v: o.v, t: o.t, popular: true }; }), rest);
      }
      var items = [], act = -1;
      var render = function (q) {
        list.innerHTML = ""; items = [];
        q = (q || "").toLowerCase().replace(/^\./, "");
        var shownSep = false;
        opts.forEach(function (o) {
          if (q && o.t.toLowerCase().replace(/^\./, "").indexOf(q) < 0) return;
          if (!q && many && !o.popular && o.v && !shownSep) { var sep = document.createElement("li"); sep.className = "pd-dd__sep"; sep.setAttribute("role", "presentation"); sep.textContent = "All extensions"; list.appendChild(sep); shownSep = true; }
          var li = document.createElement("li"); li.setAttribute("role", "option"); li.className = "pd-dd__opt"; li.textContent = o.t; li.dataset.v = o.v;
          li.setAttribute("aria-selected", String(sel.value === o.v)); li.id = id + "-" + items.length;
          li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(o.v); });
          list.appendChild(li); items.push(li);
        });
        if (!items.length) { var none = document.createElement("li"); none.className = "pd-dd__none"; none.textContent = "No match"; list.appendChild(none); }
        act = Math.max(0, items.findIndex(function (li) { return li.dataset.v === sel.value; })); mark();
      };
      var mark = function () { items.forEach(function (li, i) { li.classList.toggle("is-act", i === act); }); var a = items[act]; if (a) { (search || btn).setAttribute("aria-activedescendant", a.id); a.scrollIntoView({ block: "nearest" }); } };
      var label = function () { var o = sel.options[sel.selectedIndex]; btn.textContent = o ? o.textContent : ""; };
      var open = function () { if (!pop.hidden) return; closeAll(); pop.hidden = false; btn.setAttribute("aria-expanded", "true"); wrap.classList.add("is-open"); if (search) { search.value = ""; } render(""); (search || list).focus && (search ? search.focus() : null); };
      var close = function (focus) { if (pop.hidden) return; pop.hidden = true; btn.setAttribute("aria-expanded", "false"); wrap.classList.remove("is-open"); if (focus) btn.focus(); };
      wrap._close = close;
      var choose = function (v) { if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); } label(); close(true); };
      var key = function (e) {
        if (e.key === "ArrowDown") { e.preventDefault(); if (pop.hidden) return open(); act = Math.min(items.length - 1, act + 1); mark(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); act = Math.max(0, act - 1); mark(); }
        else if (e.key === "Enter") { if (!pop.hidden && items[act]) { e.preventDefault(); choose(items[act].dataset.v); } }
        else if (e.key === "Escape") { if (!pop.hidden) { e.preventDefault(); close(true); } }
        else if (e.key === "Tab") close(false);
      };
      btn.addEventListener("click", function () { pop.hidden ? open() : close(false); });
      btn.addEventListener("keydown", key);
      if (search) { search.addEventListener("input", function () { render(search.value); }); search.addEventListener("keydown", key); }
      sel.addEventListener("change", label);
      sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(btn); wrap.appendChild(pop); wrap.appendChild(sel);
      sel.classList.add("pd-dd__native"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
      label();
    });
    function closeAll() { $$(".pd-dd.is-open", root).forEach(function (w) { w._close && w._close(false); }); }
    document.addEventListener("mousedown", function (e) { if (!e.target.closest || !e.target.closest(".pd-dd")) closeAll(); });
    root.addEventListener("reset", function () { setTimeout(function () { $$("select[data-pd-f]", root).forEach(function (s) { s.dispatchEvent(new Event("change")); }); }, 0); });
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
