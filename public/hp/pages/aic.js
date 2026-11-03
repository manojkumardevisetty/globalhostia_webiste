/* /connectors: copy buttons for the connector URLs and the Claude Code command (lib/connector/pages.ts). */
(function () {
  document.querySelectorAll(".aic-copy-btn[data-copy]").forEach(function (b) {
    var label = b.querySelector("span"), orig = label ? label.textContent : "";
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-copy") || "";
      var done = function (ok) {
        b.classList.toggle("is-done", ok);
        if (label) label.textContent = ok ? "Copied" : "Press Ctrl+C";
        setTimeout(function () { b.classList.remove("is-done"); if (label) label.textContent = orig; }, 2000);
      };
      var fallback = function () {
        var code = b.parentNode && b.parentNode.querySelector("code");
        if (!code) return done(false);
        var r = document.createRange(); r.selectNodeContents(code);
        var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
        done(ok);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(function () { done(true); }, fallback);
      else fallback();
    });
  });
})();
