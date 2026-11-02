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
})();
