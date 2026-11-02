/* Data centers: measure real round-trip time from the visitor's browser.
   Same-origin edge: HEAD /favicon.ico. Remote test URLs (set by the owner): no-cors GET, timed only.
   One warm-up request (DNS/TLS), then the median of 5. Nothing is shown unless it was measured. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  var box = HP.$("[data-dc-speed]");
  if (!box || !window.fetch || !window.performance) return;
  var btn = HP.$("[data-dc-run]", box), rows = HP.$$("[data-dc-edge],[data-dc-remote]", box), busy = false;

  function once(url, remote) {
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl && setTimeout(function () { ctl.abort(); }, 5000);
    var u = url + (url.indexOf("?") < 0 ? "?" : "&") + "_rtt=" + Math.random().toString(36).slice(2);
    var t0 = performance.now();
    return fetch(u, { method: remote ? "GET" : "HEAD", mode: remote ? "no-cors" : "same-origin", cache: "no-store", credentials: "omit", signal: ctl ? ctl.signal : undefined })
      .then(function () { if (timer) clearTimeout(timer); return performance.now() - t0; });
  }
  function measure(url, remote) {
    var samples = [];
    var chain = once(url, remote).catch(function () { return null; }); // warm-up
    for (var i = 0; i < 5; i++) chain = chain.then(function () { return once(url, remote).then(function (ms) { samples.push(ms); }); });
    return chain.then(function () { samples.sort(function (a, b) { return a - b; }); return { med: samples[2], min: samples[0] }; });
  }
  function grade(ms) { return ms < 60 ? ["Excellent", "is-ok"] : ms < 150 ? ["Good", "is-ok"] : ms < 300 ? ["Fair", "is-mid"] : ["Slow from here", "is-slow"]; }
  function paint(row, r) {
    var v = HP.$("[data-v]", row), s = HP.$("[data-s]", row), bar = HP.$(".dc-meter__bar i", row);
    row.classList.remove("is-ok", "is-mid", "is-slow", "is-err");
    if (!r) { v.textContent = "–"; s.textContent = "Could not reach this address from your browser."; row.classList.add("is-err"); if (bar) bar.style.transform = "scaleX(0)"; return; }
    var g = grade(r.med);
    v.textContent = Math.round(r.med);
    s.textContent = g[0] + ". Fastest sample " + Math.round(r.min) + " ms.";
    row.classList.add(g[1]);
    if (bar) bar.style.transform = "scaleX(" + Math.max(0.03, Math.min(1, r.med / 400)).toFixed(3) + ")";
    var name = row.getAttribute("data-name");
    if (name) HP.$$("[data-dc-name]").forEach(function (c) { if (c.getAttribute("data-dc-name") === name) { var o = HP.$("[data-dc-out] b", c); if (o) o.textContent = Math.round(r.med) + " ms"; } });
  }
  btn.addEventListener("click", function () {
    if (busy) return; busy = true;
    var lbl = HP.$("span", btn); btn.disabled = true; btn.setAttribute("aria-busy", "true"); lbl.textContent = "Measuring…";
    rows.forEach(function (r) { HP.$("[data-s]", r).textContent = "Measuring…"; r.classList.add("is-run"); });
    var chain = Promise.resolve();
    rows.forEach(function (row) {
      chain = chain.then(function () { return measure(row.getAttribute("data-url"), row.hasAttribute("data-dc-remote")).then(function (r) { paint(row, r); }, function () { paint(row, null); }); })
        .then(function () { row.classList.remove("is-run"); });
    });
    chain.then(function () { busy = false; btn.disabled = false; btn.removeAttribute("aria-busy"); lbl.textContent = "Run the test again"; });
  });
});
