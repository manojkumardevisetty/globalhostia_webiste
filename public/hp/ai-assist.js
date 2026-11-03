/* GlobalHostia customer assistant widget (framework-agnostic). Mount it in the account dashboard or the hosting panel:
     var a = GHAssist.mount(element, { auth: { type: "hosting", token: function () { return currentToken; } } });
   Talks to /api/ai/assist (SSE). Changes are proposals: the customer confirms them here and the widget calls the existing
   authenticated endpoint (hosting API with the panel token, or the account portal form with its CSRF token).
   Full mount API: docs/ai/INTEGRATION.md. */
(function (root) {
  "use strict";
  var ORIGIN = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return location.origin; } })();
  var HEX = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5z" fill="#c5386f"/><circle cx="14.6" cy="20" r="2.1" fill="#fff"/><circle cx="20" cy="20" r="2.1" fill="#fff"/><circle cx="25.4" cy="20" r="2.1" fill="#fff"/></svg>';

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "text") n.textContent = v; else if (k === "html") n.innerHTML = v; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function md(src) {
    var out = [], list = false;
    esc(src).split(/\n/).forEach(function (l) {
      var s = l.replace(/\[([^\]]{1,200})\]\(((?:https?:\/\/|\/)[^\s)]{1,500})\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/\*\*([^*]{1,200})\*\*/g, "<b>$1</b>").replace(/`([^`]{1,200})`/g, "<code>$1</code>");
      var m = s.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
      if (m) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + m[1] + "</li>"); return; }
      if (list) { out.push("</ul>"); list = false; }
      if (s.trim()) out.push("<p>" + s + "</p>");
    });
    if (list) out.push("</ul>");
    return out.join("");
  }
  async function tokenOf(auth) { var t = auth && auth.token; return typeof t === "function" ? await t() : t; }

  /** Default Confirm handler: sends the proposal's request to the existing endpoint with this widget's credentials. */
  async function execute(p, inputs, o) {
    var rq = p.request, auth = o.auth || {};
    if (rq.auth === "portal") {
      if (auth.type !== "portal") throw new Error("This change has to be made in the account area.");
      var body = new URLSearchParams(Object.assign({}, rq.form, inputs, { csrf: auth.csrf || "" }));
      var r = await fetch(rq.path, { method: "POST", body: body, credentials: "same-origin" });
      if (r.ok && !/[?&]err=/.test(r.url)) return { ok: true, message: "Done. Reload the page to see the change." };
      throw new Error("That change was not accepted. Open the page to see the details.");
    }
    var headers = { "content-type": "application/json" };
    if (auth.type === "hosting") headers.authorization = "GH-Hosting " + (await tokenOf(auth));
    var res = await fetch((o.apiBase || ORIGIN) + rq.path, { method: "POST", headers: headers, credentials: auth.type === "portal" ? "include" : "omit", body: JSON.stringify(Object.assign({}, rq.json, inputs)) });
    var j = await res.json().catch(function () { return {}; });
    if (!res.ok || j.error) throw new Error(j.message || "That change could not be made.");
    return { ok: true, message: j.message || "Done." };
  }

  function mount(host, o) {
    o = o || {};
    if (!host) throw new Error("GHAssist.mount: element required");
    var endpoint = o.endpoint || ORIGIN + "/api/ai/assist";
    var msgs = [], busy = false, ctx = o.context || {};
    var log = el("div", { class: "ghas-log", role: "log", "aria-live": "polite" });
    var input = el("textarea", { class: "ghas-input", rows: "1", maxlength: "1500", dir: "auto", "aria-label": "Ask the assistant", placeholder: o.placeholder || "Ask about your hosting, domains, email or invoices…" });
    var btn = el("button", { class: "ghas-send", type: "submit", "aria-label": "Send", html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    var form = el("form", { class: "ghas-form", onsubmit: function (e) { e.preventDefault(); ask(input.value); } }, [input, btn]);
    var box = el("section", { class: "ghas", "aria-label": o.title || "GlobalHostia Assistant" }, [
      el("header", { class: "ghas-head" }, [el("span", { class: "ghas-hex", html: HEX }), el("div", {}, [el("b", { text: o.title || "GlobalHostia Assistant" }), el("small", { text: "Looks things up on your account. Changes need your confirmation." })])]),
      log, form]);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
    host.appendChild(box);
    var sugg = o.suggestions || ["Why is my email going to spam?", "Is my SSL certificate OK?", "Which invoices are unpaid?"];
    var chipRow = el("div", { class: "ghas-chips" }, sugg.map(function (t) { return el("button", { class: "ghas-chip", type: "button", text: t, onclick: function () { ask(t); } }); }));
    log.appendChild(chipRow);

    function bubble(who, text) {
      var b = el("div", { class: "ghas-bub", dir: "auto" });
      if (who === "me") b.textContent = text; else b.innerHTML = md(text);
      log.appendChild(el("div", { class: "ghas-msg ghas-msg--" + who }, [b])); log.scrollTop = log.scrollHeight; return b;
    }
    function proposal(p) {
      var inputs = {}, fields = (p.inputs || []).map(function (f) {
        var i = el("input", { type: f.type === "password" ? "password" : "text", autocomplete: f.type === "password" ? "new-password" : "off", required: true, minlength: f.type === "password" ? "8" : null });
        i.addEventListener("input", function () { inputs[f.name] = i.value; });
        return el("label", {}, [f.label, i]);
      });
      var status = el("p", { class: "ghas-status", role: "status" });
      var ok = el("button", { class: "ghas-btn", type: "button", text: p.confirmLabel || "Confirm" });
      var no = el("button", { class: "ghas-btn ghas-btn--ghost", type: "button", text: "Cancel" });
      var card = el("article", { class: "ghas-card" }, [el("h5", { text: p.title }), el("p", { text: p.summary }),
        el("dl", {}, [].concat.apply([], (p.rows || []).map(function (r) { return [el("dt", { text: r.k }), el("dd", { text: r.v })]; }))), el("div", { class: "ghas-fields" }, fields), status, el("div", { class: "ghas-row" }, [ok, no])]);
      no.onclick = function () { card.classList.add("is-done"); ok.disabled = no.disabled = true; status.textContent = "Cancelled. Nothing was changed."; };
      ok.onclick = async function () {
        if ((p.inputs || []).some(function (f) { return !inputs[f.name]; })) { status.textContent = "Fill in the field above first."; return; }
        ok.disabled = no.disabled = true; status.textContent = "Working…";
        try {
          var r = o.onAction ? await o.onAction(p, inputs) : await execute(p, inputs, o);
          status.textContent = (r && r.message) || "Done."; card.classList.add("is-done");
          if (o.onDone) o.onDone(p, r);
        } catch (e) { status.textContent = e.message || "That did not work."; ok.disabled = no.disabled = false; }
        fields.forEach(function (f) { var i = f.querySelector("input"); if (i) i.value = ""; }); inputs = {};
      };
      log.appendChild(card); log.scrollTop = log.scrollHeight;
    }
    async function ask(text) {
      text = String(text || "").trim(); if (!text || busy) return;
      busy = true; btn.disabled = true; if (chipRow.parentNode) chipRow.remove();
      bubble("me", text); msgs.push({ role: "user", content: text }); input.value = "";
      var b = bubble("ai", "…"), reply = "";
      try {
        var headers = { "content-type": "application/json", accept: "text/event-stream" };
        if (o.auth && o.auth.type === "hosting") headers.authorization = "GH-Hosting " + (await tokenOf(o.auth));
        var r = await fetch(endpoint, { method: "POST", headers: headers, credentials: o.auth && o.auth.type === "portal" ? "include" : "omit", body: JSON.stringify({ messages: msgs, context: ctx }) });
        if ((r.headers.get("content-type") || "").indexOf("text/event-stream") < 0) { var j = await r.json().catch(function () { return {}; }); b.innerHTML = md(j.message || "The assistant is not available right now."); msgs.pop(); return; }
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
        for (;;) {
          var x = await rd.read(); if (x.done) break;
          buf += dec.decode(x.value, { stream: true }); var parts = buf.split("\n\n"); buf = parts.pop();
          parts.forEach(function (p) {
            var ev = (p.match(/^event: (.*)$/m) || [])[1], data = (p.match(/^data: (.*)$/m) || [])[1]; if (!ev || data == null) return;
            var v; try { v = JSON.parse(data); } catch (e) { return; }
            if (ev === "text") { reply += v.t; b.innerHTML = md(reply); log.scrollTop = log.scrollHeight; }
            else if (ev === "ui" && v.type === "proposal") proposal(v);
            else if (ev === "error") b.innerHTML = md(v.message || "Something went wrong.");
          });
        }
        if (reply) msgs.push({ role: "assistant", content: reply }); else { if (b.textContent === "…") b.textContent = "Done."; msgs.push({ role: "assistant", content: "(shown a card)" }); }
      } catch (e) { b.textContent = "Connection problem. Please try again."; msgs.pop(); }
      finally { busy = false; btn.disabled = false; }
    }
    return {
      ask: ask,
      setContext: function (c) { ctx = c || {}; },
      reset: function () { msgs = []; log.innerHTML = ""; log.appendChild(chipRow); },
      destroy: function () { box.remove(); },
      element: box,
    };
  }
  root.GHAssist = { mount: mount, execute: execute, version: "1" };
})(window);
