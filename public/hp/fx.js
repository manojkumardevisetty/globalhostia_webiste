/* GlobalHostia feedback kit (window.GHFx): friendly error messages and small success animations, shared by the
   marketing pages and the account portal (loaded by lib/theme/shell.ts on every theme page; styles in /hp/fx.css).
   - errInfo(status, body, err): what happened + what to do, never a raw code (mirrors lib/ux/errors.ts)
   - showError(box, info, {retry}): fills a role=alert box with the message, a "Try again" button and, for failures
     that keep happening or are on our side, a WhatsApp / contact link
   - fieldErrors(form, errs, map): aria-invalid + message per field, focus on the first one
   - success(el), pop(el), bump(el), toast(msg, kind), spinner(label)
   Motion is transform/opacity (plus a one-off SVG stroke draw); prefers-reduced-motion shows the final state at once.
   Strings: English, or the portal's dictionary (#ac-i18n) when the page has one. */
(function () {
  "use strict";
  var W = window, D = document;
  if (W.GHFx) return;
  var I18N = {};
  try { var ie = D.getElementById("ac-i18n"); if (ie) I18N = JSON.parse(ie.textContent || "{}"); } catch (e) { /* English */ }
  var L = function (k, v) { var s = I18N[k] || k; if (v) for (var x in v) s = s.split("{" + x + "}").join(v[x]); return s; };
  var reduce = function () { try { return W.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /*<err-map>*/
  var COPY = {
    network: "You seem to be offline. Check your connection and try again.",
    timeout: "This is taking longer than usual. Please try again in a moment.",
    rate: "Too many attempts in a short time. Please wait a minute, then try again.",
    auth: "Your session expired. Reload the page and sign in again to continue.",
    forbidden: "This action is not allowed from this page. Reload the page and try again.",
    validation: "Please check the highlighted fields and try again.",
    notfound: "We could not find what you were looking for. It may have been moved or removed.",
    unavailable: "This service is busy right now. Your websites and email keep running. Please try again in a few minutes.",
    server: "Something went wrong on our side. Please try again in a minute."
  };
  var RETRY = { network: 1, timeout: 1, rate: 1, unavailable: 1, server: 1 };
  function kindOf(status, code) {
    var c = String(code || "").toLowerCase();
    if (c === "network" || c === "offline") return "network";
    if (c === "timeout" || c === "panel_timeout" || c === "aborterror" || c === "timeouterror") return "timeout";
    if (c === "expired" || c === "unauthorized" || c === "csrf") return "auth";
    if (c === "rate_limited" || c === "rate") return "rate";
    if (c === "invalid" || c === "validation") return "validation";
    if (c === "panel_unreachable" || c === "not_configured") return "unavailable";
    if (!status) return "network";
    if (status === 408 || status === 504) return "timeout";
    if (status === 429) return "rate";
    if (status === 401 || status === 419 || status === 440) return "auth";
    if (status === 403) return "forbidden";
    if (status === 404 || status === 410) return "notfound";
    if (status === 400 || status === 409 || status === 413 || status === 422) return "validation";
    if (status === 502 || status === 503) return "unavailable";
    return "server";
  }
  /** a server sentence is shown only when it reads like one of ours (short, no codes, no internal names) */
  function usable(m) {
    m = String(m || "").trim();
    return m.length > 8 && m.length < 260 && /[a-z]{3}/i.test(m) && !/\b(WHMCS|DirectAdmin|WHM|Vercel|Neon|Postgres|stack|undefined|null|NaN|Exception|ECONN|ETIMEDOUT|ENOTFOUND)\b|\bat \S+:\d+|<\/?[a-z]/i.test(m) && !/^\s*\d{3}\b/.test(m);
  }
  /** status: HTTP status (0 = no response); body: parsed JSON or null; err: the thrown error (fetch/abort) */
  function errInfo(status, body, err) {
    body = body || {};
    var code = (err && (err.name === "AbortError" || err.name === "TimeoutError")) ? "timeout" : (typeof body.error === "string" && /^[a-z_]+$/.test(body.error) ? body.error : body.code);
    if (!status && W.navigator && W.navigator.onLine === false) code = "offline";
    var kind = kindOf(status, code);
    var own = typeof body.error === "string" && !/^[a-z_]+$/.test(body.error) ? body.error : body.message;
    // our own APIs answer 4xx/429/503 with a sentence written for customers: keep it; anything else gets the standard copy
    var msg = status && usable(own) && kind !== "network" && kind !== "timeout" ? own : L(COPY[kind]);
    return { kind: kind, msg: msg, retry: !!RETRY[kind], status: status || 0 };
  }
  /*</err-map>*/

  function wa() {
    var a = D.querySelector('a[href^="https://wa.me/"], a[href^="https://api.whatsapp.com/"]');
    return a ? a.getAttribute("href") : "";
  }
  var fails = 0;
  /** fill an alert box (role=alert) with the message, a retry button and a help link */
  function showError(box, info, o) {
    if (!box) return;
    o = o || {};
    fails++;
    var help = o.help !== false && (fails >= 2 || info.kind === "server" || info.kind === "unavailable");
    var link = wa();
    box.innerHTML = '<span class="ghfx-err__ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>' +
      '<span class="ghfx-err__tx"><span>' + esc(info.msg) + '</span>' +
      ((info.retry && o.retry) || help ? '<span class="ghfx-err__act">' +
        (info.retry && o.retry ? '<button type="button" class="ghfx-btn" data-ghfx-retry>' + esc(L("Try again")) + "</button>" : "") +
        (help ? (link ? '<a class="ghfx-link" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(L("Still stuck? Message us on WhatsApp")) + "</a>"
          : '<a class="ghfx-link" href="/contact">' + esc(L("Still stuck? Contact our team")) + "</a>") : "") +
        "</span>" : "") + "</span>";
    box.classList.add("ghfx-err");
    if (!box.getAttribute("role")) box.setAttribute("role", "alert");
    box.hidden = false;
    var r = box.querySelector("[data-ghfx-retry]");
    if (r) r.addEventListener("click", function () { box.hidden = true; o.retry(); });
  }
  function ok() { fails = 0; }

  /** errs: { field: message }; find(name) returns the input (default: [name=…] in the form) */
  function fieldErrors(form, errs, find) {
    var first = null;
    find = find || function (n) { return form.querySelector('[name="' + n + '"]'); };
    Object.keys(errs || {}).forEach(function (k) {
      var el = find(k); if (!el) return;
      el.setAttribute("aria-invalid", "true");
      if (!first) first = el;
    });
    if (first) try { first.focus({ preventScroll: false }); } catch (e) { first.focus(); }
    return first;
  }

  /* ---------------- success: hexagon draws in, fills, the check strokes on */
  var HEX = "M32 4 56.2 18v28L32 60 7.8 46V18z";
  function checkSvg(size) {
    var id = "ghfx-g" + Math.random().toString(36).slice(2, 7);
    return '<svg class="ghfx-check" viewBox="0 0 64 64" width="' + (size || 64) + '" height="' + (size || 64) + '" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e14c7f"/><stop offset="1" stop-color="#a6225f"/></linearGradient></defs>' +
      '<path class="ghfx-check__fill" d="' + HEX + '" fill="url(#' + id + ')"/>' +
      '<path class="ghfx-check__hex" d="' + HEX + '" pathLength="100" fill="none" stroke="#c5386f" stroke-width="3" stroke-linejoin="round"/>' +
      '<path class="ghfx-check__tick" d="M21 33.5 28.5 41 44 25" pathLength="100" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g class="ghfx-check__sp"><path d="M32 0l3 1.7v3.5L32 7l-3-1.8V1.7z" fill="#fdd700"/><path d="M60 28l3 1.7v3.5L60 35l-3-1.8v-3.5z" fill="#c5386f"/><path d="M6 50l2.4 1.4v2.8L6 55.6l-2.4-1.4v-2.8z" fill="#fdd700"/></g></svg>';
  }
  /** play the hexagon check at the top of a success panel (once per panel) */
  function success(el, o) {
    if (!el) return;
    o = o || {};
    var mk = el.querySelector(".ghfx-check");
    if (!mk) {
      var wrap = D.createElement("span"); wrap.className = "ghfx-mark" + (o.small ? " ghfx-mark--sm" : ""); wrap.innerHTML = checkSvg(o.small ? 40 : 64);
      var slot = el.querySelector("[data-ghfx-slot]") || el;
      var old = slot.querySelector(":scope > .hp-hexi, :scope > svg.hp-ico");
      if (old && old.parentNode) old.parentNode.replaceChild(wrap, old); else slot.insertBefore(wrap, slot.firstChild);
      mk = wrap.firstChild;
    }
    mk.classList.remove("is-on"); void mk.getBoundingClientRect(); mk.classList.add("is-on");
    ok();
  }
  function replay(el, cls) { if (!el || reduce()) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(function () { el.classList.remove(cls); }, 700); }
  var pop = function (el) { replay(el, "ghfx-pop"); };
  var bump = function (el) { replay(el, "ghfx-bump"); };

  /* ---------------- toast with a small hexagon pulse */
  function toast(msg, kind) {
    var box = D.querySelector(".ghfx-toasts");
    if (!box) { box = D.createElement("div"); box.className = "ghfx-toasts"; box.setAttribute("aria-live", "polite"); D.body.appendChild(box); }
    var t = D.createElement("div");
    t.className = "ghfx-toast ghfx-toast--" + (kind === "err" ? "err" : "ok");
    t.setAttribute("role", kind === "err" ? "alert" : "status");
    t.innerHTML = '<span class="ghfx-toast__mk" aria-hidden="true"></span><span>' + esc(msg) + '</span><button type="button" aria-label="' + esc(L("Close")) + '">&times;</button>';
    t.querySelector("button").onclick = function () { t.remove(); };
    box.appendChild(t);
    setTimeout(function () { t.classList.add("is-out"); setTimeout(function () { t.remove(); }, 300); }, kind === "err" ? 8000 : 4500);
    return t;
  }
  /** hexagon spinner markup (decorative; pair it with visible text) */
  function spinner(cls) { return '<span class="ghfx-spin' + (cls ? " " + cls : "") + '" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-dasharray="14 40" pathLength="54"/></svg></span>'; }
  /** flash a row (table row or list item) once */
  function flash(el) { if (!el) return; el.classList.remove("ghfx-row"); void el.offsetWidth; el.classList.add("ghfx-row"); setTimeout(function () { el.classList.remove("ghfx-row"); }, 2600); }

  W.GHFx = { errInfo: errInfo, kindOf: kindOf, showError: showError, ok: ok, fieldErrors: fieldErrors, success: success, checkSvg: checkSvg, pop: pop, bump: bump, toast: toast, spinner: spinner, flash: flash, wa: wa, L: L };
})();
