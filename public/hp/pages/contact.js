/* Contact page: pause the routing animation off-screen / in hidden tabs. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  HP.$$(".ct-route").forEach(function (el) { HP.pauseOff(el); });
});
