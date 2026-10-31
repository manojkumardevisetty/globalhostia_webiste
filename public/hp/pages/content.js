/* Content pages: help-topic search (filters topic cards and FAQ answers), legal table-of-contents
   highlighting, and pausing the status pulse off-screen. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  var D = document;
  HP.$$(".cn-pulse").forEach(function (el) { HP.pauseOff(el); });

  /* ---------- help search ---------- */
  var form = HP.$("[data-topic-search]");
  if (form) {
    var input = HP.$("input", form);
    var cards = HP.$$("[data-topic]");
    var faqs = HP.$$("[data-topic-group] .hp-acc__item");
    var empty = HP.$("[data-topic-empty]"), emptyFaq = HP.$("[data-topic-empty-faq]");
    var run = function () {
      var q = (input.value || "").toLowerCase().trim(), terms = q.split(/\s+/).filter(Boolean), shown = 0, shownF = 0;
      var hit = function (t) { return terms.every(function (w) { return t.indexOf(w) >= 0; }); };
      cards.forEach(function (c) { var ok = !terms.length || hit(c.getAttribute("data-text") || ""); c.hidden = !ok; if (ok) { shown++; c.classList.add("in"); } });
      faqs.forEach(function (f) { var ok = !terms.length || hit((f.textContent || "").toLowerCase()); f.hidden = !ok; if (ok) shownF++; });
      if (empty) empty.hidden = !cards.length || shown > 0;
      if (emptyFaq) emptyFaq.hidden = !faqs.length || shownF > 0;
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault(); run();
      var first = HP.$("[data-topic]:not([hidden])") || HP.$("[data-topic-group] .hp-acc__item:not([hidden])");
      if (first) first.scrollIntoView({ behavior: HP.reduce ? "auto" : "smooth", block: "center" });
    });
    var t = 0;
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(run, 120); });
  }

  /* ---------- legal TOC: mark the section in view ---------- */
  var toc = HP.$(".cn-toc");
  if (toc && "IntersectionObserver" in window) {
    var links = HP.$$("a", toc), map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var current = null;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var a = map[e.target.id]; if (!a || a === current) return;
        if (current) current.removeAttribute("aria-current");
        a.setAttribute("aria-current", "true"); current = a;
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    HP.$$(".cn-article h2[id]").forEach(function (h) { io.observe(h); });
  }
});
