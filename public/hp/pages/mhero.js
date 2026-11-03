/* Phone hero carousel ([data-mhero], lib/theme/mobile-hero.ts). Autoplay every data-interval ms; paused while the tab
   is hidden, the card is off-screen, a finger is on it, focus is inside it, or the visitor pressed pause. Swipe, dots,
   prev/next and the arrow keys move it. Videos play only when motion is allowed and Save-Data is off (poster otherwise). */
(function () {
  var D = document, W = window;
  var reduce = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var save = !!(navigator.connection && navigator.connection.saveData);
  [].forEach.call(D.querySelectorAll("[data-mhero]"), function (hero) {
    var track = hero.querySelector(".hp-mhero__track"), slides = [].slice.call(hero.querySelectorAll(".hp-mslide"));
    var dots = [].slice.call(hero.querySelectorAll(".hp-mdot")), toggle = hero.querySelector('[data-mh="toggle"]');
    var n = slides.length, cur = 0, timer = 0, DUR = +hero.getAttribute("data-interval") || 6000;
    var stopped = reduce || n < 2, touching = false, focused = false, inview = true;
    function hydrate(s) {
      if (!s || s._mh) return; s._mh = 1;
      [].forEach.call(s.querySelectorAll("source[data-srcset]"), function (x) { x.srcset = x.getAttribute("data-srcset"); x.removeAttribute("data-srcset"); });
      [].forEach.call(s.querySelectorAll("img[data-src]"), function (i) { i.src = i.getAttribute("data-src"); i.removeAttribute("data-src"); });
    }
    function video(s, on) {
      var v = s && s.querySelector("video[data-src]"); if (!v) return;
      if (on && !reduce && !save) {
        if (!v.src) { v.src = v.getAttribute("data-src"); v.addEventListener("playing", function () { s.classList.add("is-playing"); }); }
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      } else if (!on && v.src) v.pause();
    }
    function paused() { return stopped || touching || focused || !inview || D.hidden; }
    function schedule() {
      clearTimeout(timer); timer = 0;
      track.setAttribute("aria-live", stopped || focused ? "polite" : "off");
      if (!paused()) timer = setTimeout(function () { go(cur + 1); }, DUR);
    }
    function go(i) {
      i = (i + n) % n;
      hydrate(slides[i]); hydrate(slides[(i + 1) % n]);
      track.style.transform = "translateX(" + (-100 * i) + "%)";
      slides.forEach(function (s, k) {
        var on = k === i; s.classList.toggle("is-active", on);
        if (on) { s.removeAttribute("aria-hidden"); s.removeAttribute("inert"); } else { s.setAttribute("aria-hidden", "true"); s.setAttribute("inert", ""); }
        video(s, on);
      });
      dots.forEach(function (d, k) { if (k === i) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
      cur = i; schedule();
    }
    function setStopped(v) {
      stopped = v; hero.classList.toggle("is-stopped", v);
      if (toggle) toggle.setAttribute("aria-label", v ? "Play slideshow" : "Pause slideshow");
      schedule();
    }
    dots.forEach(function (d, k) { d.addEventListener("click", function () { go(k); }); });
    hero.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-mh]"); if (!b) return;
      var a = b.getAttribute("data-mh");
      if (a === "toggle") setStopped(!stopped); else go(cur + (a === "next" ? 1 : -1));
    });
    hero.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(cur + (e.key === "ArrowRight" ? 1 : -1)); var f = dots[cur]; if (f && D.activeElement && D.activeElement.classList.contains("hp-mdot")) f.focus(); }
    });
    hero.addEventListener("focusin", function () { focused = true; schedule(); });
    hero.addEventListener("focusout", function () { setTimeout(function () { focused = hero.contains(D.activeElement); schedule(); }, 0); });
    D.addEventListener("visibilitychange", schedule);
    if ("IntersectionObserver" in W) new IntersectionObserver(function (es) { inview = es[es.length - 1].isIntersecting; schedule(); }, { threshold: 0.35 }).observe(hero);
    var x0 = null, y0 = 0;
    hero.addEventListener("touchstart", function (e) { touching = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; schedule(); }, { passive: true });
    hero.addEventListener("touchend", function (e) {
      touching = false;
      if (x0 !== null) { var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { x0 = null; go(cur + (dx < 0 ? 1 : -1)); return; } }
      x0 = null; schedule();
    }, { passive: true });
    hero.addEventListener("touchcancel", function () { touching = false; x0 = null; schedule(); }, { passive: true });
    if (n < 2) { video(slides[0], true); return; }
    hero.classList.toggle("is-stopped", stopped);
    if (stopped && toggle) toggle.setAttribute("aria-label", "Play slideshow");
    go(0);
  });
})();
