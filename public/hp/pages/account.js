/* Customer portal behaviours: password reveal, copy-to-clipboard, busy state on submit,
   dropdown menus close on outside click / Escape. Progressive enhancement only. */
(function () {
  "use strict";
  var D = document;
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  // UI strings in the page language (frame.ts renders #ac-i18n); English keys fall back to themselves
  var I18N = {};
  try { var ie = D.getElementById("ac-i18n"); if (ie) I18N = JSON.parse(ie.textContent || "{}"); } catch (e) { /* English */ }
  function L(k, v) { var s = I18N[k] || k; if (v) for (var x in v) s = s.split("{" + x + "}").join(v[x]); return s; }

  // show / hide password
  $$("[data-ac-pw]").forEach(function (b) {
    var input = b.parentNode.querySelector("input");
    if (!input) return;
    b.addEventListener("click", function () {
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      b.setAttribute("aria-pressed", show ? "true" : "false");
      b.setAttribute("aria-label", show ? (b.getAttribute("data-hide") || "Hide password") : (b.getAttribute("data-show") || "Show password"));
      input.focus();
    });
  });

  // copy buttons
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-copy") || "", label = b.querySelector("span");
      var done = function () { b.classList.add("is-done"); if (label) label.textContent = L("Copied"); setTimeout(function () { b.classList.remove("is-done"); if (label) label.textContent = L("Copy"); }, 1600); };
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
  // initDns runs again after the assistant adds a record and the #dns card is swapped for the fresh one (GHAcct.initDns).
  var dnsClose = null;
  D.addEventListener("keydown", function (e) { if (dnsClose && e.key === "Escape" && D.activeElement && D.activeElement.closest && D.activeElement.closest(".ac-dns__panel")) dnsClose(""); });
  function initDns(dns) {
    if (!dns) return;
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
    dnsClose = closeAll;
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
  initDns(D.querySelector(".ac-dns"));
  window.GHAcct = { initDns: initDns };

  // Renewal centre (/account/renewals): selection bar totals, per-group "select all", button counts.
  var rw = D.querySelector("[data-rw]"), bar = rw && rw.querySelector("[data-rw-bar]");
  if (rw && bar) {
    var sumEl = bar.querySelector("[data-rw-sum]"), cur = (sumEl && sumEl.getAttribute("data-cur")) || "USD";
    var fmt = function (n) { try { return new Intl.NumberFormat(D.documentElement.lang === "ar" ? "ar-AE-u-nu-" + (D.cookie.indexOf("gh_digits=arab") >= 0 ? "arab" : "latn") : "en-US", { style: "currency", currency: cur }).format(n); } catch (e) { return n.toFixed(2) + " " + cur; } };
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
      var itEl = bar.querySelector("[data-rw-items]"); itEl.textContent = n === 1 ? (itEl.getAttribute("data-one") || "item") : (itEl.getAttribute("data-many") || "items");
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

/* Command palette (Ctrl/⌘+K), domain portfolio, installable app (service worker, install prompt, iOS sheet) and web push
   settings. Progressive enhancement: every feature has a server-rendered fallback. */
(function () {
  "use strict";
  var D = document, W = window;
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  var I18N = {};
  try { var ie = D.getElementById("ac-i18n"); if (ie) I18N = JSON.parse(ie.textContent || "{}"); } catch (e) { /* English */ }
  function L(k, v) { var s = I18N[k] || k; if (v) for (var x in v) s = s.split("{" + x + "}").join(v[x]); return s; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ico(n) { return '<svg class="hp-ico" aria-hidden="true" focusable="false"><use href="#i-' + esc(n) + '"/></svg>'; }
  function csrf() { var i = D.querySelector("input[name=csrf]"); return i ? i.value : ""; }
  var ac = D.querySelector("[data-ac]");
  var CID = ac ? ac.getAttribute("data-cid") || "" : "";
  var LANG = D.documentElement.lang || "en";
  function store(kind) { try { var s = W[kind]; var k = "__t"; s.setItem(k, "1"); s.removeItem(k); return s; } catch (e) { return null; } }
  var ss = store("sessionStorage"), ls = store("localStorage");
  function postSso(to, id) {
    var f = D.createElement("form"); f.method = "post"; f.action = "/account/sso"; f.hidden = true;
    var add = function (n, v) { var i = D.createElement("input"); i.type = "hidden"; i.name = n; i.value = v; f.appendChild(i); };
    add("csrf", csrf()); add("to", to); if (id) add("id", String(id));
    D.body.appendChild(f); f.submit();
  }

  // sign out clears what the palette kept in this browser
  $$("[data-ac-logout]").forEach(function (f) { f.addEventListener("submit", function () { try { if (ss) ss.removeItem("ac-pal:" + CID); if (ls) ls.removeItem("ac-recent:" + CID); } catch (e) { /* ignore */ } }); });

  /* ------------------------------------------------------------ command palette */
  var pal = D.getElementById("ac-pal");
  if (pal && typeof pal.showModal === "function") {
    var input = D.getElementById("ac-pal-q"), list = D.getElementById("ac-pal-list");
    var GROUPS = ["ai", "recent", "actions", "pages", "services", "domains", "invoices", "tickets"];
    var GL = { ai: L("Assistant"), recent: L("Recent"), actions: L("Actions"), pages: L("Pages"), services: L("Services"), domains: L("Domains"), invoices: L("Invoices"), tickets: L("Tickets") };
    // customer assistant (frame.ts sets data-ai when it is switched on): "Ask the assistant…" first when the box is empty,
    // "Ask the assistant: “query”" last when typing, so Enter on a question with no matches hands it to the assistant
    var AI = !!(ac && ac.getAttribute("data-ai") === "1");
    var data = null, loading = false, failed = false, shown = [], act = -1, opener = null;
    var mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
    if (mac) $$("[data-mod]").forEach(function (k) { k.textContent = "⌘"; });
    // pages from the sidebar, so the palette is useful before the index arrives
    var basePages = $$(".ac-nav a").map(function (a) { return { g: "pages", l: a.textContent.trim(), h: a.getAttribute("href"), ic: ((a.querySelector("use") || {}).getAttribute ? a.querySelector("use").getAttribute("href").replace("#i-", "") : "arrow") }; });
    var KEY = "ac-pal:" + CID, RKEY = "ac-recent:" + CID;
    try { var c0 = ss && JSON.parse(ss.getItem(KEY) || "null"); if (c0 && c0.lang === LANG && Date.now() - c0.at < 5 * 60000) data = c0.items; } catch (e) { /* refetch */ }
    var recent = function () { try { return (ls && JSON.parse(ls.getItem(RKEY) || "[]")) || []; } catch (e) { return []; } };
    var remember = function (it) {
      if (!ls || !it.h) return;
      var r = recent().filter(function (x) { return x.h !== it.h; });
      r.unshift({ g: "recent", l: it.l, s: it.s || "", h: it.h, ic: it.ic });
      try { ls.setItem(RKEY, JSON.stringify(r.slice(0, 6))); } catch (e) { /* full */ }
    };
    var norm = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ًͯ-ْ]/g, ""); };
    var load = function () {
      if (data || loading) return;
      loading = true;
      fetch("/account/api/palette", { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { data = j.items || []; failed = false; if (!j.partial && ss) try { ss.setItem(KEY, JSON.stringify({ at: Date.now(), lang: LANG, items: data })); } catch (e) { /* full */ } })
        .catch(function () { failed = true; })
        .then(function () { loading = false; if (pal.open) render(input.value); });
    };
    var score = function (it, q) {
      var hay = norm(it.l + " " + (it.s || "") + " " + (it.k || "")), lab = norm(it.l), toks = q.split(/\s+/).filter(Boolean), s = 0;
      for (var i = 0; i < toks.length; i++) {
        var t = toks[i];
        if (hay.indexOf(t) < 0) return 0;
        s += lab.indexOf(t) === 0 ? 4 : (" " + lab).indexOf(" " + t) >= 0 || lab.indexOf("." + t) >= 0 ? 3 : lab.indexOf(t) >= 0 ? 2 : 1;
      }
      return s;
    };
    var render = function (raw) {
      var q = norm(raw).trim(), items = data || basePages, out = [];
      if (!q) {
        out = recent().concat(items.filter(function (x) { return x.g === "actions"; }).slice(0, 4), items.filter(function (x) { return x.g === "pages"; }));
      } else {
        var sc = items.map(function (x) { return { x: x, s: score(x, q) }; }).filter(function (o) { return o.s > 0; })
          .sort(function (a, b) { return b.s - a.s; }).slice(0, 40);
        // groups ordered by their best match (a domain named "demo…" comes before "Add DNS record for demo…")
        var best = {}; sc.forEach(function (o) { best[o.x.g] = Math.max(best[o.x.g] || 0, o.s); });
        out = sc.sort(function (a, b) { return (best[b.x.g] - best[a.x.g]) || (GROUPS.indexOf(a.x.g) - GROUPS.indexOf(b.x.g)) || (b.s - a.s); }).map(function (o) { return o.x; });
      }
      var matched = out.length;
      if (AI) {
        var ai = { g: "ai", l: q ? L("Ask the assistant: “{q}”", { q: raw.trim().slice(0, 300) }) : L("Ask the assistant…"), s: L("Ask about your account in plain words"), ic: "bot", ai: q ? raw.trim().slice(0, 1500) : "" };
        out = q ? out.concat([ai]) : [ai].concat(out);
      }
      shown = out; act = out.length ? 0 : -1;
      var html = "", g = "";
      out.forEach(function (it, i) {
        if (it.g !== g) { g = it.g; html += '<li role="presentation" class="ac-pal__g">' + esc(GL[g] || g) + "</li>"; }
        html += '<li role="option" id="ac-pal-o' + i + '" data-i="' + i + '" aria-selected="' + (i === act) + '">' + ico(it.ic || "arrow") + '<span><b>' + esc(it.l) + "</b>" + (it.s ? "<small>" + esc(it.s) + "</small>" : "") + '</span><i class="ac-pal__go" aria-hidden="true">↵</i></li>';
      });
      if (!out.length) html = '<li class="ac-pal__none" role="presentation">' + esc(q ? L("No results for “{q}”", { q: raw.trim() }) : L("Loading…")) + "</li>";
      else if (q && !matched) html = '<li class="ac-pal__none" role="presentation">' + esc(L("No results for “{q}”", { q: raw.trim() })) + "</li>" + html;
      if (loading && q) html += '<li class="ac-pal__none" role="presentation">' + esc(L("Loading…")) + "</li>";
      if (failed) html += '<li class="ac-pal__none" role="presentation">' + esc(L("Could not load your account data. Pages and actions still work.")) + "</li>";
      list.innerHTML = html;
      input.setAttribute("aria-expanded", out.length ? "true" : "false");
      mark();
    };
    var mark = function () {
      $$("[role=option]", list).forEach(function (o) { o.setAttribute("aria-selected", String(Number(o.getAttribute("data-i")) === act)); });
      var cur = D.getElementById("ac-pal-o" + act);
      if (cur) { input.setAttribute("aria-activedescendant", cur.id); cur.scrollIntoView({ block: "nearest" }); } else input.removeAttribute("aria-activedescendant");
    };
    var go = function (it) {
      if (!it) return;
      if (it.g === "ai") { pal.close(); if (W.GHAcctAsk) W.GHAcctAsk(it.ai); return; }
      remember(it);
      pal.close();
      if (it.h) W.location.href = it.h;
      else if (it.a) postSso(it.a.to, it.a.id);
    };
    var open = function (e) {
      if (pal.open) return;
      opener = (e && e.currentTarget) || D.activeElement;
      $$(".ac-dd[open]").forEach(function (d) { d.open = false; });
      pal.showModal(); input.value = ""; render(""); load(); input.focus();
    };
    pal.addEventListener("close", function () { input.setAttribute("aria-expanded", "false"); if (opener && opener.focus) opener.focus(); });
    pal.addEventListener("click", function (e) {
      if (e.target === pal) { pal.close(); return; }
      var o = e.target.closest && e.target.closest("[role=option]");
      if (o) go(shown[Number(o.getAttribute("data-i"))]);
      if (e.target.closest && e.target.closest("[data-pal-close]")) pal.close();
    });
    var t0 = 0;
    input.addEventListener("input", function () { clearTimeout(t0); t0 = setTimeout(function () { render(input.value); }, 40); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!shown.length) return; act = (act + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; mark(); }
      else if (e.key === "Home" && shown.length) { act = 0; mark(); }
      else if (e.key === "End" && shown.length) { act = shown.length - 1; mark(); }
      else if (e.key === "Enter") { e.preventDefault(); go(shown[act]); }
    });
    $$("[data-ac-palette]").forEach(function (b) { b.addEventListener("click", open); });
    D.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === "k") { e.preventDefault(); if (pal.open) pal.close(); else open(); }
    });
  }

  /* ------------------------------------------------------------ domain portfolio */
  var pfw = D.querySelector("[data-pfw]");
  if (pfw) {
    var form = pfw.querySelector("[data-pf-form]"), tbody = pfw.querySelector("[data-pf] tbody"), rows = $$("[data-pf-row]", pfw);
    var bar = pfw.querySelector("[data-pf-bar]"), bulk = D.getElementById("ac-pf-bulk"), count = pfw.querySelector("[data-pf-count]"), none = pfw.querySelector("[data-pf-empty]");
    var all = pfw.querySelector("[data-pf-all]"), total = rows.length;
    var val = function (sel) { var el = form.querySelector(sel); return el ? el.value : ""; };
    var chip = function (name, value) { var el = form.querySelector('input[name="' + name + '"][value="' + value + '"]'); return !!(el && el.checked); };
    var apply = form.querySelector("[data-pf-apply]"); if (apply) apply.hidden = true;
    var filter = function () {
      var q = val("[data-pf-q]").trim().toLowerCase(), st = val("[data-pf-status]"), exp = chip("exp", "30") ? 30 : chip("exp", "90") ? 90 : 0;
      var arOff = chip("ar", "off"), nsExt = chip("ns", "ext"), n = 0;
      rows.forEach(function (r) {
        var g = r.getAttribute("data-group"), days = r.getAttribute("data-days"), ns = r.getAttribute("data-ns");
        var ok = (!q || r.getAttribute("data-name").indexOf(q) >= 0) && (!st || g === st)
          && (!exp || ((g === "active" || g === "grace") && days !== "" && Number(days) <= exp))
          && (!arOff || (r.getAttribute("data-ar") === "0" && g !== "closed"))
          && (!nsExt || ns === "external" || ns === "mixed");
        r.hidden = !ok;
        if (!ok) { var cb = r.querySelector("input[type=checkbox]"); if (cb) cb.checked = false; }
        if (ok) n++;
      });
      if (count) count.textContent = L("{n} domains shown", { n: n }) + (n !== total ? " · " + total : "");
      if (none) none.hidden = n > 0;
      $$("[data-pf-clear]", pfw).forEach(function (a) { a.hidden = !(q || st || exp || arOff || nsExt); });
      // URL keeps the view (reload / share), without a history entry per keystroke
      var p = new URLSearchParams();
      if (q) p.set("q", q); if (st) p.set("status", st); if (exp) p.set("exp", String(exp)); if (arOff) p.set("ar", "off"); if (nsExt) p.set("ns", "ext");
      var so = val("[data-pf-sort]"); if (so && so !== "expiry") p.set("sort", so);
      try { history.replaceState(null, "", "/account/domains" + (p.toString() ? "?" + p : "")); } catch (e) { /* ignore */ }
      $$("input[name=back]", pfw).forEach(function (i) { i.value = p.toString() ? "?" + p : ""; });
      sync();
    };
    var sort = function () {
      var so = val("[data-pf-sort]") || "expiry";
      var rank = { grace: 0, active: 1, pending: 2, expired: 3, closed: 4 };
      var d = function (r) { var v = r.getAttribute("data-days"); return v === "" ? 1e9 : Number(v); };
      var nm = function (r) { return r.getAttribute("data-name"); };
      rows.sort(function (a, b) {
        if (so === "name") return nm(a).localeCompare(nm(b));
        if (so === "status") return (rank[a.getAttribute("data-group")] - rank[b.getAttribute("data-group")]) || (d(a) - d(b));
        var x = d(a) - d(b) || nm(a).localeCompare(nm(b));
        return so === "expiry_desc" ? -x : x;
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
    };
    var t1 = 0;
    form.addEventListener("submit", function (e) { e.preventDefault(); filter(); });
    form.addEventListener("input", function (e) {
      var el = e.target;
      if (el.name === "exp" && el.checked) $$('input[name=exp]', form).forEach(function (o) { if (o !== el) o.checked = false; });
      if (el.name === "sort") sort();
      clearTimeout(t1); t1 = setTimeout(filter, el.type === "search" ? 120 : 0);
    });
    $$("[data-pf-clear]", pfw).forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        form.querySelector("[data-pf-q]").value = ""; form.querySelector("[data-pf-status]").value = "";
        $$("[data-pf-chip]", form).forEach(function (c) { c.checked = false; });
        filter();
      });
    });

    // selection + bulk bar
    var sel = function () { return rows.filter(function (r) { var c = r.querySelector("input[type=checkbox]"); return !r.hidden && c && c.checked; }); };
    var sync = function () {
      var s = sel(), n = s.length, vis = rows.filter(function (r) { return !r.hidden; }).length;
      bar.classList.add("is-js"); bar.classList.toggle("is-on", n > 0);
      var ne = bar.querySelector("[data-pf-n]"); if (ne) ne.textContent = n;
      $$("[data-pf-need]", bar).forEach(function (b) { b.disabled = !n || n > 50; });
      if (all) { all.hidden = false; all.checked = n > 0 && n === vis; all.indeterminate = n > 0 && n < vis; }
    };
    if (all) all.addEventListener("change", function () { rows.forEach(function (r) { var c = r.querySelector("input[type=checkbox]"); if (c && !r.hidden) c.checked = all.checked; }); sync(); });
    rows.forEach(function (r) { var c = r.querySelector("input[type=checkbox]"); if (c) c.addEventListener("change", sync); });
    var exp = bar.querySelector("[data-pf-export]");
    if (exp) {
      exp.hidden = false;
      exp.addEventListener("click", function () {
        var ids = sel().map(function (r) { return "sel=d:" + r.getAttribute("data-id"); });
        if (!ids.length) ids = rows.filter(function (r) { return !r.hidden; }).map(function (r) { return "sel=d:" + r.getAttribute("data-id"); });
        W.location.href = "/account/domains/export?" + ids.join("&");
      });
    }
    // nameserver change: confirm in a dialog listing the selected domains
    var dlg = D.getElementById("ac-pf-dlg");
    if (bulk && dlg && typeof dlg.showModal === "function") {
      var confirmed = false;
      bulk.addEventListener("submit", function (e) {
        var btn = e.submitter;
        if (!btn || btn.value !== "ns_ours" || confirmed) return;
        e.preventDefault();
        bulk.removeAttribute("data-busy"); btn.classList.remove("is-busy"); btn.removeAttribute("aria-busy");
        var names = sel().map(function (r) { return r.getAttribute("data-name"); });
        dlg.querySelector("[data-pf-dlg-h]").textContent = L("Change nameservers for {n} domains?", { n: names.length });
        dlg.querySelector("[data-pf-dlg-list]").innerHTML = names.map(function (n) { return '<li class="ac-mono">' + esc(n) + "</li>"; }).join("");
        dlg.showModal();
        dlg.querySelector("[data-pf-dlg-no]").onclick = function () { dlg.close(); };
        dlg.querySelector("[data-pf-dlg-yes]").onclick = function () {
          confirmed = true; bulk.querySelector("[data-pf-confirmed]").value = "yes"; dlg.close();
          if (bulk.requestSubmit) bulk.requestSubmit(btn); else btn.click();
        };
      });
    }

    // lazy lookups: lock, nameservers, DNS location, then TLS
    var tag = function (tone, text, ic, title) { return '<span class="ac-pf__tag ac-pf__tag--' + tone + '"' + (title ? ' title="' + esc(title) + '"' : "") + ">" + (ic ? ico(ic) : "") + esc(text) + "</span>"; };
    var active = rows.filter(function (r) { return r.getAttribute("data-active") === "1"; });
    active.sort(function (a, b) { return Number(a.hidden) - Number(b.hidden); });
    var ids = active.map(function (r) { return r.getAttribute("data-id"); });
    var byId = {}; rows.forEach(function (r) { byId[r.getAttribute("data-id")] = r; });
    var batches = function (arr, n) { var o = []; for (var i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
    var getJson = function (u) { return fetch(u, { credentials: "same-origin", headers: { accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
    var fail = function (b, sel2) { b.forEach(function (id) { var el = byId[id] && byId[id].querySelector(sel2); if (el && el.querySelector(".ac-pf__sk")) el.innerHTML = tag("muted", L("Unknown")); }); };
    var chain = Promise.resolve();
    batches(ids, 10).forEach(function (b) {
      chain = chain.then(function () {
        return getJson("/account/api/domains?f=status&ids=" + b.join(",")).then(function (j) {
          b.forEach(function (id) {
            var it = j.items && j.items[id], r = byId[id];
            if (!it || !r) return;
            r.querySelector("[data-pf-ns]").innerHTML = it.nsHtml;
            r.setAttribute("data-ns", it.nsKind || "");
            var dn = r.querySelector("[data-pf-dns]"); if (dn) dn.textContent = it.dns.label;
            var lk = it.lock.state;
            r.querySelector("[data-pf-lock]").innerHTML = tag(lk === "locked" ? "ok" : lk === "unlocked" ? "warn" : "muted", it.lock.label, lk === "locked" ? "lock" : lk === "unlocked" ? "unlock" : "");
          });
          fail(b, "[data-pf-ns]"); fail(b, "[data-pf-lock]");
        }).catch(function () { fail(b, "[data-pf-ns]"); fail(b, "[data-pf-lock]"); });
      });
    });
    chain = chain.then(function () { if (chip("ns", "ext")) filter(); });
    batches(ids, 5).forEach(function (b) {
      chain = chain.then(function () {
        return getJson("/account/api/domains?f=ssl&ids=" + b.join(",")).then(function (j) {
          b.forEach(function (id) {
            var it = j.items && j.items[id], r = byId[id];
            if (it && r) r.querySelector("[data-pf-ssl]").innerHTML = tag(it.tone, it.label, it.tone === "ok" ? "shield" : "", it.title);
          });
          fail(b, "[data-pf-ssl]");
        }).catch(function () { fail(b, "[data-pf-ssl]"); });
      });
    });
    sync();
  }

  /* ------------------------------------------------------------ installable app */
  var standalone = (W.matchMedia && W.matchMedia("(display-mode: standalone)").matches) || W.navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if ("serviceWorker" in navigator && D.body.classList.contains("ac-page")) {
    navigator.serviceWorker.register("/account-sw.js", { scope: "/account" }).catch(function () { /* still works without */ });
  }
  var deferred = null, iosSheet = D.getElementById("ac-ios");
  var installs = $$("[data-ac-install]"), iosBtns = $$("[data-ac-ios]");
  var installedUi = function () {
    installs.concat(iosBtns).forEach(function (b) { b.hidden = true; });
    $$("[data-ac-installed]").forEach(function (b) { b.hidden = false; });
    $$("[data-ac-noinstall]").forEach(function (b) { b.hidden = true; });
  };
  if (standalone) installedUi();
  else if (ios) {
    // iOS: no install prompt; the menu item and the settings button open the Add to Home Screen sheet
    installs.concat(iosBtns).forEach(function (b) { b.hidden = false; b.addEventListener("click", function () { if (iosSheet && iosSheet.showModal) iosSheet.showModal(); }); });
    $$("[data-ac-noinstall]").forEach(function (b) { b.hidden = true; });
    $$("[data-ac-install]").forEach(function (b) { if (b.closest(".ac-st")) b.hidden = true; });
  }
  W.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e;
    installs.forEach(function (b) { b.hidden = false; });
    $$("[data-ac-noinstall]").forEach(function (b) { b.hidden = true; });
  });
  installs.forEach(function (b) {
    b.addEventListener("click", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function (c) { if (c && c.outcome === "accepted") installedUi(); deferred = null; });
    });
  });
  W.addEventListener("appinstalled", installedUi);
  if (iosSheet) iosSheet.addEventListener("click", function (e) { if (e.target === iosSheet) iosSheet.close(); });

  /* ------------------------------------------------------------ after a change: point at what changed
     DNS add/edit (?hl=TYPE:name), bulk domain actions (data-fx-done ids), auto-renew switches (#rw-d-<id>). The
     one-off query keys are then dropped from the address bar so a reload does not replay the message. */
  (function () {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var hit = [];
    var hl = q.get("hl");
    if (hl && hl.indexOf(":") > 0) {
      var ty = hl.slice(0, hl.indexOf(":")).toUpperCase(), nm = hl.slice(hl.indexOf(":") + 1).toLowerCase();
      [].slice.call(D.querySelectorAll('.ac-dns__rec[data-rt="' + ty.replace(/[^A-Z]/g, "") + '"]')).forEach(function (r) {
        var rn = r.getAttribute("data-rn") || "";
        if (rn === nm || rn === nm.replace(/\.$/, "") || rn.split(".")[0] === nm) hit.push(r);
      });
    }
    var res = D.querySelector("[data-fx-done]");
    if (res) (res.getAttribute("data-fx-done") || "").split(" ").filter(Boolean).forEach(function (id) { var r = D.querySelector('[data-pf-row][data-id="' + id.replace(/\D/g, "") + '"]'); if (r) hit.push(r); });
    var ok = q.get("ok") || "";
    if (/^autorenew_(on|off)$/.test(ok) && /^#rw-[ds]-\d+$/.test(location.hash)) {
      var li = D.getElementById(location.hash.slice(1));
      if (li) { hit.push(li); var sw = li.querySelector(".ac-switch"); if (sw) sw.classList.add("is-just"); }
    }
    hit.slice(0, 50).forEach(function (r) { r.classList.add("ac-hl"); setTimeout(function () { r.classList.remove("ac-hl"); }, 2800); });
    if (hit[0] && hit[0].scrollIntoView && !location.hash) hit[0].scrollIntoView({ block: "center" });
    var drop = ["ok", "err", "hl"].filter(function (k) { return q.has(k); });
    if (drop.length && W.history && history.replaceState) {
      drop.forEach(function (k) { q.delete(k); });
      var s = q.toString();
      try { history.replaceState(history.state, "", location.pathname + (s ? "?" + s : "") + location.hash); } catch (e) { /* ignore */ }
    }
  })();

  /* ------------------------------------------------------------ web push */
  var pb = D.querySelector("[data-ac-push]");
  if (pb) {
    var key = pb.getAttribute("data-key"), stEl = pb.querySelector("[data-ac-push-state]"), tg = pb.querySelector("[data-ac-push-toggle]"), msg = pb.querySelector("[data-ac-push-msg]"), dot = pb.querySelector("[data-ac-push-dot]");
    var say = function (t) { if (!msg) return; msg.textContent = t || ""; msg.hidden = !t; if (t) msg.setAttribute("role", "alert"); };
    var oops = function () { return navigator.onLine === false ? L("You seem to be offline. Check your connection and try again.") : L("Something went wrong. Please try again."); };
    var supported = "serviceWorker" in navigator && "PushManager" in W && "Notification" in W && !!key;
    var post = function (fields) {
      var fd = new FormData(); fd.append("csrf", csrf());
      for (var k in fields) fd.append(k, fields[k]);
      return fetch("/account/settings", { method: "POST", body: fd, credentials: "same-origin", headers: { "x-ac-fetch": "1", accept: "application/json" } }).then(function (r) {
        // a stale form (403 csrf) or an expired session: a fresh page fixes it, so reload instead of a dead end
        if (r.status === 403 || r.status === 401) { W.location.reload(); throw new Error("reload"); }
        return r.json();
      });
    };
    var b64 = function (s) { var p = "=".repeat((4 - (s.length % 4)) % 4), raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
    var current = null;
    var show = function (sub) {
      current = sub;
      var on = !!sub && Notification.permission === "granted";
      stEl.textContent = on ? L("Notifications are on for this device.") : L("Notifications are off for this device.");
      if (dot) dot.className = "ac-st__dot" + (on ? " is-on" : "");
      tg.hidden = false; tg.querySelector("span").textContent = on ? L("Turn notifications off") : L("Turn notifications on");
      tg.classList.toggle("hp-btn--brand", !on); tg.classList.toggle("hp-btn--ghost", on);
    };
    if (!supported) {
      stEl.textContent = L("This browser does not support notifications.");
      if (ios && !standalone) say(L("On iPhone and iPad, install the app first (Share → Add to Home Screen), then turn notifications on from the app."));
    } else {
      navigator.serviceWorker.register("/account-sw.js", { scope: "/account" }).then(function () { return navigator.serviceWorker.ready; })
        .then(function (reg) { return reg.pushManager.getSubscription(); })
        .then(function (sub) {
          show(sub);
          if (Notification.permission === "denied") say(L("Notifications are blocked in this browser. Allow them in the site settings, then try again."));
          // keep the server copy fresh (language, owner) for a device that is already subscribed
          if (sub) post({ op: "push_subscribe", sub: JSON.stringify(sub) }).catch(function () { /* next visit */ });
        }).catch(function () { show(null); });
      tg.addEventListener("click", function () {
        say(""); tg.disabled = true;
        var done = function () { tg.disabled = false; };
        if (current && Notification.permission === "granted") {
          var ep = current.endpoint;
          current.unsubscribe().catch(function () { return true; }).then(function () { return post({ op: "push_unsubscribe", endpoint: ep }); })
            .then(function () { W.location.href = "/account/settings?ok=push_off"; }).catch(function () { say(oops()); done(); });
          return;
        }
        Notification.requestPermission().then(function (perm) {
          if (perm !== "granted") { say(L("Notifications are blocked in this browser. Allow them in the site settings, then try again.")); done(); return; }
          return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }); })
            .then(function (sub) { return post({ op: "push_subscribe", sub: JSON.stringify(sub) }).then(function (j) { if (!j.ok) throw new Error(j.key); }); })
            .then(function () { W.location.href = "/account/settings?ok=push_on"; });
        }).catch(function () { say(oops()); done(); });
      });
    }
  }
})();

/* Customer assistant ("Ask GlobalHostia"): floating button, account-menu item and the palette action open a side sheet
   (full screen on phones). /hp/ai-assist.js + .css load on first use only. The page tells the assistant what is on
   screen (frame.ts data-ai-*: page, domain id, service id); the server re-checks every id against this account.
   Confirmed changes go to the existing portal forms with this page's CSRF token; the DNS card is then refreshed in place. */
(function () {
  "use strict";
  var D = document, W = window;
  var ac = D.querySelector('[data-ac][data-ai="1"]');
  if (!ac) return;
  var I18N = {};
  try { var ie = D.getElementById("ac-i18n"); if (ie) I18N = JSON.parse(ie.textContent || "{}"); } catch (e) { /* English */ }
  function L(k) { return I18N[k] || k; }
  function csrf() { var i = D.querySelector("input[name=csrf]"); return i ? i.value : ""; }
  var fab = D.querySelector(".ac-ask"), sheet = null, loading = null;
  var attr = function (k) { return ac.getAttribute("data-ai-" + k) || ""; };
  function load() {
    if (W.GHAssist && W.GHAssist.sheet) return Promise.resolve();
    if (loading) return loading;
    var get = function (tag, attrs) {
      return new Promise(function (res, rej) {
        var n = D.createElement(tag);
        for (var k in attrs) n[k] = attrs[k];
        n.onload = res; n.onerror = rej;
        D.head.appendChild(n);
      });
    };
    loading = Promise.all([get("link", { rel: "stylesheet", href: attr("css") }), get("script", { src: attr("js"), async: true })])
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function context() {
    var c = { page: attr("page") || "other" }, n;
    if (attr("domain")) c.domain = attr("domain");
    if ((n = Number(attr("domain-id")))) c.domainId = n;
    if ((n = Number(attr("service-id")))) c.serviceId = n;
    if ((n = Number(attr("invoice-id")))) c.invoiceId = n;
    return c;
  }
  /** after a confirmed change: swap in the fresh section from the page the form redirected to */
  function refresh(p, r) {
    if (p.kind === "dns.add" && r && r.html) {
      try {
        var doc = new DOMParser().parseFromString(r.html, "text/html"), fresh = doc.getElementById("dns"), cur = D.getElementById("dns");
        if (fresh && cur) { var node = D.importNode(fresh, true); cur.parentNode.replaceChild(node, cur); if (W.GHAcct) W.GHAcct.initDns(node); }
      } catch (e) { /* the record is saved; the list updates on the next page load */ }
    } else if (p.kind === "ticket.open" && /^\/account\/support\/?$/.test(location.pathname)) {
      fetch(location.pathname, { credentials: "same-origin" }).then(function (x) { return x.text(); }).then(function (h) {
        var doc = new DOMParser().parseFromString(h, "text/html"), fresh = doc.querySelector(".ac-content"), cur = D.querySelector(".ac-content");
        if (fresh && cur) cur.innerHTML = fresh.innerHTML;
      }).catch(function () { /* keep the list */ });
    }
  }
  function ask(q) {
    load().then(function () {
      if (!sheet) sheet = W.GHAssist.sheet({
        auth: { type: "portal", csrf: csrf() }, lang: D.documentElement.lang === "ar" ? "ar" : "en", context: context, onDone: refresh,
        onOpen: function () { if (fab) fab.hidden = true; }, onClose: function () { if (fab) fab.hidden = false; }
      });
      sheet.open(q || "");
    }, function () {
      var msg = L("The assistant could not load. Please try again.");
      if (W.GHFx && W.GHFx.toast) W.GHFx.toast(msg, "err"); else W.alert(msg);
    });
  }
  W.GHAcctAsk = ask;
  [].forEach.call(D.querySelectorAll("[data-ac-ask]"), function (b) {
    b.hidden = false;
    b.addEventListener("click", function () { var dd = b.closest(".ac-dd"); if (dd) dd.open = false; ask(""); });
  });
  if (/[?&]assistant=open\b/.test(location.search)) ask("");
})();
