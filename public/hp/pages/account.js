/* Customer portal behaviours: password reveal, copy-to-clipboard, busy state on submit,
   dropdown menus close on outside click / Escape. Progressive enhancement only. */
(function () {
  "use strict";
  var D = document;
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }

  // show / hide password
  $$("[data-ac-pw]").forEach(function (b) {
    var input = b.parentNode.querySelector("input");
    if (!input) return;
    b.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", show ? "true" : "false");
      b.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus();
    });
  });

  // copy buttons
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-copy") || "", label = b.querySelector("span");
      var done = function () { b.classList.add("is-done"); if (label) label.textContent = "Copied"; setTimeout(function () { b.classList.remove("is-done"); if (label) label.textContent = "Copy"; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () {});
      else { var t = D.createElement("textarea"); t.value = v; t.style.position = "fixed"; t.style.opacity = "0"; D.body.appendChild(t); t.select(); try { D.execCommand("copy"); done(); } catch (e) { /* ignore */ } D.body.removeChild(t); }
    });
  });

  // busy state: prevents double submits (orders, tickets, replies)
  D.addEventListener("submit", function (e) {
    var f = e.target;
    if (!(f instanceof HTMLFormElement)) return;
    if (f.getAttribute("data-busy") === "1") { e.preventDefault(); return; }
    f.setAttribute("data-busy", "1");
    var btn = e.submitter || f.querySelector("button[type=submit]");
    if (btn) { btn.classList.add("is-busy"); btn.setAttribute("aria-busy", "true"); }
    setTimeout(function () { f.removeAttribute("data-busy"); if (btn) { btn.classList.remove("is-busy"); btn.removeAttribute("aria-busy"); } }, 8000);
  }, true);
  // restore buttons when coming back via the back/forward cache
  window.addEventListener("pageshow", function (e) { if (e.persisted) $$(".is-busy").forEach(function (b) { b.classList.remove("is-busy"); }); $$("form[data-busy]").forEach(function (f) { f.removeAttribute("data-busy"); }); });

  // dropdowns
  var dds = $$(".ac-dd");
  D.addEventListener("click", function (e) { dds.forEach(function (d) { if (d.open && !d.contains(e.target)) d.open = false; }); });
  D.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    dds.forEach(function (d) { if (d.open) { d.open = false; var s = d.querySelector("summary"); if (s) s.focus(); } });
  });
  dds.forEach(function (d) { d.addEventListener("toggle", function () { if (d.open) dds.forEach(function (o) { if (o !== d) o.open = false; }); }); });

  // DNS records editor (/account/domains/<id>#dns): open edit / delete panels in place, per-type fields, type filter.
  var dns = D.querySelector(".ac-dns");
  if (dns) {
    var HINT = {
      A: ["203.0.113.10", "IPv4 address of your server."], AAAA: ["2001:db8::10", "IPv6 address of your server."],
      CNAME: ["target.example.com", "Host name this name is an alias of. Not allowed on @."],
      MX: ["mail.example.com", "Mail server host name. Lower priority is tried first."],
      TXT: ["v=spf1 include:_spf.example.com ~all", "Text value, without surrounding quotes."],
      SRV: ["sip.example.com", "Target host. Name must look like _service._tcp."]
    };
    var closeAll = function (except) {
      $$(".ac-dns__panel", dns).forEach(function (p) { if (p.id !== except) p.hidden = true; });
      $$("[data-dns-open]", dns).forEach(function (a) { if (a.getAttribute("data-dns-open") !== except) a.setAttribute("aria-expanded", "false"); });
      $$(".ac-dns__rec.is-open", dns).forEach(function (r) { r.classList.remove("is-open"); });
    };
    $$("[data-dns-open]", dns).forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("data-dns-open"), p = D.getElementById(id);
        if (!p) return;
        e.preventDefault();
        var open = p.hidden;
        closeAll(id);
        p.hidden = !open;
        a.setAttribute("aria-expanded", open ? "true" : "false");
        var row = a.closest("tr");
        if (row) row.classList.toggle("is-open", open);
        if (open) { var f = p.querySelector("input:not([type=hidden]),button[type=submit]"); if (f) f.focus({ preventScroll: true }); }
      });
    });
    $$("[data-dns-close]", dns).forEach(function (a) {
      a.addEventListener("click", function (e) {
        var p = D.getElementById(a.getAttribute("data-dns-close"));
        if (!p) return;
        e.preventDefault();
        closeAll("");
        var row = p.previousElementSibling;
        while (row && !row.classList.contains("ac-dns__rec")) row = row.previousElementSibling;
        var b = row && row.querySelector("[data-dns-open]");
        if (b) b.focus();
      });
    });
    D.addEventListener("keydown", function (e) { if (e.key === "Escape" && D.activeElement && D.activeElement.closest && D.activeElement.closest(".ac-dns__panel")) closeAll(""); });
    // per-type fields: the add form starts as data-type="all" (without JS every field shows)
    $$(".ac-dns-form", dns).forEach(function (f) {
      var sel = f.querySelector("[data-dns-type]");
      if (!sel) return;
      var sync = function () {
        var t = sel.value;
        if (!HINT[t]) return;
        f.setAttribute("data-type", t);
        var v = f.querySelector("[data-dns-value]"), h = f.querySelector("[data-dns-help]");
        if (v) v.placeholder = HINT[t][0];
        if (h) h.textContent = HINT[t][1];
      };
      sel.addEventListener("change", sync); sync();
    });
    // type filter
    var bar = dns.querySelector("[data-dns-filter]");
    if (bar) {
      bar.hidden = false;
      $$("button", bar).forEach(function (b) {
        b.addEventListener("click", function () {
          var t = b.getAttribute("data-t");
          $$("button", bar).forEach(function (x) { var on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", on ? "true" : "false"); });
          closeAll("");
          $$(".ac-dns__rec", dns).forEach(function (r) { r.hidden = !!t && r.getAttribute("data-rt") !== t; });
        });
      });
    }
  }

  // Renewal centre (/account/renewals): selection bar totals, per-group "select all", button counts.
  var rw = D.querySelector("[data-rw]"), bar = rw && rw.querySelector("[data-rw-bar]");
  if (rw && bar) {
    var sumEl = bar.querySelector("[data-rw-sum]"), cur = (sumEl && sumEl.getAttribute("data-cur")) || "USD";
    var fmt = function (n) { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n); } catch (e) { return n.toFixed(2) + " " + cur; } };
    var boxes = $$(".ac-rwr input[type=checkbox]", rw);
    var setBtn = function (sel, n) { var b = bar.querySelector(sel); if (!b) return; var s = b.querySelector("[data-n]"); if (s) s.textContent = n; b.disabled = !n; };
    var sync = function () {
      var n = 0, amt = 0, unpriced = 0, dom = 0, svc = 0;
      boxes.forEach(function (c) {
        if (!c.checked) return;
        var row = c.closest(".ac-rwr"), a = row.getAttribute("data-amt"), inv = row.hasAttribute("data-inv");
        n++;
        if (a === "") unpriced++; else amt += parseFloat(a) || 0;
        if (!inv && row.getAttribute("data-k") === "d") dom++;
        if (!inv && row.getAttribute("data-k") === "s" && row.querySelector("[name=to][value=service_renew]")) svc++;
      });
      bar.querySelector("[data-rw-n]").textContent = n;
      bar.querySelector("[data-rw-items]").textContent = n === 1 ? "item" : "items";
      sumEl.textContent = fmt(Math.round(amt * 100) / 100);
      var up = bar.querySelector("[data-rw-unpriced]");
      if (up) { up.hidden = !unpriced; var us = up.querySelector("span"); if (us) us.textContent = unpriced; }
      setBtn("[data-rw-dom]", dom); setBtn("[data-rw-svc]", svc);
      $$(".ac-rwg", rw).forEach(function (g) {
        var all = g.querySelector("[data-rw-all]"), cs = $$(".ac-rwr input[type=checkbox]", g), on = cs.filter(function (c) { return c.checked; }).length;
        if (!all) return;
        all.checked = on === cs.length && on > 0; all.indeterminate = on > 0 && on < cs.length;
      });
    };
    boxes.forEach(function (c) { c.addEventListener("change", sync); });
    $$("[data-rw-all]", rw).forEach(function (all) {
      all.hidden = false;
      all.addEventListener("click", function (e) { e.stopPropagation(); });
      all.addEventListener("change", function () { $$(".ac-rwr input[type=checkbox]", all.closest(".ac-rwg")).forEach(function (c) { c.checked = all.checked; }); sync(); });
    });
    sync();
  }
})();
