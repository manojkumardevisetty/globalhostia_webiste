/* Auth pages: pause the brand-panel network animation off-screen; focus the email field on sign-in. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  HP.$$(".au-brand").forEach(function (el) { HP.pauseOff(el); });
  var email = HP.$("#au-email");
  if (email && window.matchMedia("(min-width: 1024px)").matches && !location.hash) { try { email.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
});
