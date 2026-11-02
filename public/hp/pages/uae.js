/* UAE landing pages: pause the looping hero visuals (console cursor, desktop status) off-screen / in hidden tabs,
   and highlight the current section in the guide's table of contents. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  HP.$$(".ua-con,.ua-desk").forEach(function (el) { HP.pauseOff(el); });
  var toc = HP.$(".ua-toc");
  if (!toc || !("IntersectionObserver" in window)) return;
  var links = HP.$$("a[href^='#']", toc), map = {};
  links.forEach(function (a) { var t = document.getElementById(a.getAttribute("href").slice(1)); if (t) map[t.id] = a; });
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting || !map[e.target.id]) return;
      links.forEach(function (a) { a.removeAttribute("aria-current"); });
      map[e.target.id].setAttribute("aria-current", "true");
    });
  }, { rootMargin: "-30% 0px -60% 0px" });
  Object.keys(map).forEach(function (id) { io.observe(document.getElementById(id)); });
});
