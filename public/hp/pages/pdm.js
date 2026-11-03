/* Homepage premium domains row: Pause/Play button and pause while a finger is on the row (hover and focus pause in CSS). */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function () {
  "use strict";
  var row = document.querySelector("[data-pdm]"); if (!row) return;
  var btn = row.querySelector("[data-pdm-toggle]"), vp = row.querySelector(".pdm__viewport"), held = false;
  var set = function (paused) {
    row.classList.toggle("is-paused", paused);
    if (!btn) return;
    btn.setAttribute("aria-pressed", paused ? "true" : "false");
    var u = btn.querySelector("use"); if (u) { var h = u.getAttribute("href") || ""; u.setAttribute("href", h.replace(/#i-(pause|play)$/, paused ? "#i-play" : "#i-pause")); }
    var s = btn.querySelector("span"); if (s) s.textContent = paused ? "Play" : "Pause";
  };
  if (btn) btn.addEventListener("click", function () { held = !row.classList.contains("is-paused"); set(held); });
  if (vp) {
    vp.addEventListener("touchstart", function () { row.classList.add("is-paused"); }, { passive: true });
    vp.addEventListener("touchend", function () { if (!held) setTimeout(function () { row.classList.remove("is-paused"); }, 2500); }, { passive: true });
  }
});
