/* GlobalHostia website assistant. Loaded after the page is idle (lib/theme/shell.ts); talks to /api/ai/chat (SSE).
   Plan cards, domain chips and the chat cart come from server-side tools with live catalog prices; the cart is re-priced
   again at /ai/checkout. Conversation and cart live in sessionStorage only.
   Layout: desktop = full-height side panel (Expand toggles a large centred view, remembered per visitor); phones = full
   screen that follows the visual viewport so the composer stays above the keyboard. Ctrl+K / Cmd+K opens it expanded. */
(function () {
  "use strict";
  if (window.__ghai) return; window.__ghai = 1;
  var CFG = window.GH_AI || {};
  var KEY = "ghai.v1", MAXC = 600;
  var d = document;
  var st = load() || { msgs: [], cart: [], conv: rid(), pass: "" };
  var busy = false, typedAt = 0, lastFocus = null, cards = {}, queued = "", ctl = null;
  var EXP_KEY = "ghai.expand", IDLE_MS = 75000;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var expanded = lsGet(EXP_KEY) === "1";
  function phone() { return matchMedia("(max-width:640px)").matches; }
  /* keyboard hint: Mac / iPadOS with a keyboard -> Cmd K, Windows / Linux / ChromeOS -> Ctrl K, touch-only phones and tablets -> none */
  var KBD = (function () {
    var ua = navigator.userAgent || "", plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
    var fine = matchMedia("(any-pointer:fine)").matches, coarse = matchMedia("(pointer:coarse)").matches;
    if (/Android|iPhone|iPod/i.test(ua) || /Android|iOS/i.test(plat)) return "";
    var apple = /Mac|iPad/i.test(plat) || /Macintosh|iPad/.test(ua);
    if (coarse && !fine) return "";
    return apple ? "\u2318K" : "Ctrl K";
  })();

  function rid() { var a = new Uint8Array(9); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify({ msgs: st.msgs.slice(-40), cart: st.cart, conv: st.conv, pass: st.pass })); } catch (e) {} }
  function el(tag, attrs, kids) {
    var n = d.createElement(tag);
    for (var k in attrs || {}) { var v = attrs[k]; if (v == null || v === false) continue; if (k === "text") n.textContent = v; else if (k === "html") n.innerHTML = v; else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? d.createTextNode(c) : c); });
    return n;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n, cur) { if (n == null || isNaN(n)) return "Price at checkout"; var v = Number(n).toFixed(2); return cur === "USD" ? "$" + v : v + " " + (cur || ""); }
  var HEX = '<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5z" fill="#c5386f"/><path d="M20 8.6 29.9 14.3v11.4L20 31.4l-9.9-5.7V14.3z" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.4"/><circle cx="14.6" cy="20" r="2.1" fill="#fff"/><circle cx="20" cy="20" r="2.1" fill="#fff"/><circle cx="25.4" cy="20" r="2.1" fill="#fff"/></svg>';
  function hex() { return el("span", { class: "ghai-hex", html: HEX }); }
  var ICON = {
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* minimal Markdown: escape, then links (http(s) or site paths), bold, lists, paragraphs */
  function md(src) {
    var lines = esc(src).split(/\n/), out = [], list = null;
    function inline(s) {
      return s.replace(/\[([^\]]{1,200})\]\(((?:https?:\/\/|\/)[^\s)]{1,500})\)/g, function (_, t, u) { var ext = /^https?:/.test(u) && u.indexOf(location.host) < 0; return '<a href="' + u + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + t + "</a>"; })
        .replace(/\*\*([^*]{1,200})\*\*/g, "<b>$1</b>")
        .replace(/(^|[\s(])(https:\/\/[^\s<)]{4,300})/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    }
    lines.forEach(function (l) {
      var m = l.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
      if (m) { var t = m[1] ? "ol" : "ul"; if (!list || list.t !== t) { if (list) out.push("</" + list.t + ">"); list = { t: t }; out.push("<" + t + ">"); } out.push("<li>" + inline(m[2]) + "</li>"); return; }
      if (list) { out.push("</" + list.t + ">"); list = null; }
      if (l.trim()) out.push("<p>" + inline(l) + "</p>");
    });
    if (list) out.push("</" + list.t + ">");
    return out.join("");
  }

  /* ---------------------------------------------------------------- DOM */
  var launch = el("button", { class: "ghai-launch ghai", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", title: KBD ? "Ask our AI (" + KBD + ")" : null, "aria-keyshortcuts": KBD ? "Control+K Meta+K" : null, onclick: function () { open(); } },
    [hex(), el("span", { class: "ghai-launch__t", text: "Ask our AI" }), KBD ? el("span", { class: "ghai-tip", "aria-hidden": "true" }, ["Open chat ", el("kbd", { text: KBD })]) : null]);
  var log = el("div", { class: "ghai-log", role: "log", "aria-live": "polite", "aria-label": "Conversation" });
  var input = el("textarea", { class: "ghai-input", rows: "1", maxlength: String(MAXC), placeholder: "Ask about hosting, domains or email…", "aria-label": "Your message", dir: "auto" });
  var hp = el("input", { class: "ghai-hp", type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
  var sendBtn = el("button", { class: "ghai-send", type: "submit", "aria-label": "Send", html: ICON.send });
  var count = el("span", { class: "ghai-count", "aria-live": "off" });
  var note = el("p", { class: "ghai-note", role: "status", hidden: true });
  var form = el("form", { class: "ghai-form", onsubmit: function (e) { e.preventDefault(); send(); } }, [hp, input, sendBtn]);
  var cartBox = el("details", { class: "ghai-cart", hidden: true });
  var expBtn = el("button", { class: "ghai-hbtn ghai-exp", type: "button", onclick: function () { setExpanded(!expanded, true); input.focus(); } });
  var scrim = el("div", { class: "ghai-scrim", hidden: true, onclick: function () { close(); } });
  var panel = el("div", { class: "ghai-panel ghai", role: "dialog", "aria-modal": "true", "aria-label": "GlobalHostia assistant", hidden: true }, [
    el("div", { class: "ghai-head" }, [hex(), el("div", { class: "ghai-title" }, [el("b", { text: "GlobalHostia AI" }), el("span", {}, [el("i"), "AI · live prices", KBD ? el("kbd", { class: "ghai-kbd", title: "Keyboard shortcut", text: KBD }) : null])]),
      el("button", { class: "ghai-hbtn ghai-human", type: "button", title: "Talk to a person", "aria-label": "Talk to a person", onclick: function () { handoffForm(); } }, [el("span", { class: "ghai-human__i", html: ICON.person }), el("span", { class: "ghai-human__t", text: "Talk to a person" })]),
      expBtn,
      el("button", { class: "ghai-hbtn", type: "button", "aria-label": "Close assistant", title: "Close (Esc)", html: ICON.close, onclick: close })]),
    log, cartBox, note, form,
    el("div", { class: "ghai-foot" }, [el("span", { text: "AI can make mistakes. Prices are live." }), el("button", { class: "ghai-new", type: "button", text: "New chat", onclick: reset }), count])
  ]);
  input.addEventListener("input", function () { if (!typedAt) typedAt = Date.now(); input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; var n = input.value.length; count.textContent = n > MAXC - 100 ? n + "/" + MAXC : ""; });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    var f = [].filter.call(panel.querySelectorAll('button:not([disabled]),a[href],textarea,input:not(.ghai-hp),select,summary'), function (x) { return x.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  d.body.appendChild(scrim);
  d.body.appendChild(launch); d.body.appendChild(panel);

  function setExpanded(v, remember) {
    expanded = !!v; if (remember) lsSet(EXP_KEY, expanded ? "1" : "0");
    panel.classList.toggle("is-expanded", expanded);
    expBtn.innerHTML = expanded ? ICON.collapse : ICON.expand;
    expBtn.setAttribute("aria-label", expanded ? "Exit full view" : "Expand to full view");
    expBtn.title = expanded ? "Exit full view" : "Expand";
    expBtn.setAttribute("aria-pressed", expanded ? "true" : "false");
    scrim.hidden = panel.hidden || !expanded || phone();
    lock();
  }
  function lock() { d.documentElement.classList.toggle("ghai-lock", !panel.hidden && (phone() || expanded)); }
  /* phones: size the sheet to the visual viewport, so the composer sits above the on-screen keyboard */
  var vv = window.visualViewport;
  function fit() {
    if (panel.hidden || !vv || !phone()) { panel.style.removeProperty("--ghai-vh"); panel.style.removeProperty("--ghai-top"); return; }
    panel.style.setProperty("--ghai-vh", Math.round(vv.height) + "px");
    panel.style.setProperty("--ghai-top", Math.round(vv.offsetTop) + "px");
    if (d.activeElement === input) scroll();
  }
  if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }
  addEventListener("resize", function () { if (!panel.hidden) { fit(); setExpanded(expanded); } });
  function open(o) {
    o = o || {};
    if (o.expand && !phone()) setExpanded(true, false);
    if (panel.hidden) {
      lastFocus = d.activeElement; panel.hidden = false; launch.hidden = true; launch.setAttribute("aria-expanded", "true");
      if (!log.childNodes.length) restore();
      var wa = d.querySelector(".hp-wa"); if (wa) wa.classList.add("is-dodge");
    }
    setExpanded(expanded); fit();
    setTimeout(function () { input.focus({ preventScroll: true }); scroll(); }, 30);
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true; scrim.hidden = true; launch.hidden = false; launch.setAttribute("aria-expanded", "false"); lock();
    var wa = d.querySelector(".hp-wa"); if (wa) wa.classList.remove("is-dodge");
    (lastFocus && lastFocus.focus && d.contains(lastFocus) ? lastFocus : launch).focus({ preventScroll: true });
  }
  /* Ctrl+K / Cmd+K: open expanded with the input focused; again (or Esc) closes. Leaves editors that own the key alone. */
  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== "k" || e.defaultPrevented) return;
    var t = e.target;
    if (t && t !== input && (t.isContentEditable || (t.closest && t.closest("[data-own-shortcuts],.ac-pal,.CodeMirror,.monaco-editor")))) return;
    e.preventDefault();
    if (!panel.hidden && (expanded || phone()) && d.activeElement === input) close(); else open({ expand: true });
  }
  if (window.__ghaiKey) { removeEventListener("keydown", window.__ghaiKey, true); window.__ghaiKey = null; }
  addEventListener("keydown", onKey, true);
  function reset() { if (ctl) try { ctl.abort(); } catch (e) {} queued = ""; showNote(""); st = { msgs: [], cart: [], conv: rid(), pass: st.pass }; save(); log.innerHTML = ""; renderCart(); intro(); input.focus(); }
  function showNote(t) { note.textContent = t; note.hidden = !t; }
  function scroll() { log.scrollTop = log.scrollHeight; }

  function intro() {
    bubble("ai", "Hi! I can find the right hosting plan, check domain names and build your cart with live prices. What are you working on?");
    chips(["Which hosting plan do I need?", "Is mybrand.com available?", "Migrate my site for free?"]);
  }
  function restore() {
    if (!st.msgs.length) { intro(); renderCart(); return; }
    st.msgs.forEach(function (m) { bubble(m.role === "user" ? "me" : "ai", m.content); (m.ui || []).forEach(ui); });
    renderCart(); scroll();
  }
  function bubble(who, text) {
    var b = el("div", { class: "ghai-bub", dir: "auto" });
    if (who === "me") b.textContent = text; else b.innerHTML = md(text);
    var row = el("div", { class: "ghai-msg ghai-msg--" + who }, who === "ai" ? [hex(), b] : [b]);
    log.appendChild(row); scroll();
    return b;
  }
  function chips(list) {
    var box = el("div", { class: "ghai-chips" });
    list.forEach(function (t) {
      box.appendChild(el("button", { class: "ghai-chip", type: "button", text: t, dir: "auto", onclick: function () {
        if (/talk to support|talk to a person|التحدث مع الدعم/i.test(t)) return handoffForm();
        typedAt = Date.now() - 5000; send(t);
      } }));
    });
    log.appendChild(box); scroll();
  }

  /* ---------------------------------------------------------------- UI events from tools */
  function planCard(p) {
    var cur = p.currency, sel = null, priceEl = el("strong", { text: money(p.price, cur) }), perEl = el("span", { text: p.cycleLabel ? "/ " + p.cycleLabel.toLowerCase() : "" });
    var renew = el("div", { class: "ghai-renew", text: p.renew != null ? "Renews at " + money(p.renew, cur) + (p.cycleLabel ? " " + p.cycleLabel.toLowerCase() : "") + (p.setupFee ? " · setup " + money(p.setupFee, cur) : "") : "" });
    var chosen = { cycle: p.cycle, price: p.price, setupFee: p.setupFee, label: p.cycleLabel };
    if (p.cycles && p.cycles.length > 1) {
      sel = el("select", { class: "ghai-sel", "aria-label": "Billing period for " + p.name, onchange: function () {
        var c = p.cycles.filter(function (x) { return x.cycle === sel.value; })[0]; if (!c) return;
        chosen = { cycle: c.cycle, price: c.price, setupFee: c.setupFee, label: c.label };
        priceEl.textContent = money(c.price, cur); perEl.textContent = "/ " + c.label.toLowerCase();
        renew.textContent = "Renews at " + money(c.price, cur) + " " + c.label.toLowerCase() + (c.setupFee ? " · setup " + money(c.setupFee, cur) : "");
      } });
      p.cycles.forEach(function (c) { sel.appendChild(el("option", { value: c.cycle, selected: c.cycle === p.cycle, text: c.label + " · " + money(c.price, cur) })); });
    }
    var add = el("button", { class: "ghai-btn ghai-btn--sm", type: "button", text: "Add to cart", onclick: function () {
      addItem({ key: "p:" + p.slug + ":" + chosen.cycle, kind: "product", slug: p.slug, cycle: chosen.cycle, label: p.name, detail: chosen.label || "", price: chosen.price, setupFee: chosen.setupFee || 0, currency: cur });
      add.textContent = "Added"; add.disabled = true; setTimeout(function () { add.textContent = "Add to cart"; add.disabled = false; }, 1800);
    } });
    return el("article", { class: "ghai-card" + (/best/i.test(p.badge || "") ? " ghai-card--best" : "") }, [
      p.badge ? el("span", { class: "ghai-badge", text: p.badge }) : null,
      el("h5", { text: p.name }), p.category ? el("div", { class: "ghai-cat", text: p.category + (p.location ? " · " + p.location : "") }) : null,
      p.specs && p.specs.length ? el("ul", { class: "ghai-specs" }, p.specs.map(function (s) { return el("li", {}, [el("b", { text: s.k + ": " }), s.v]); })) : null,
      el("div", { class: "ghai-price" }, [priceEl, perEl]), renew,
      p.why ? el("p", { class: "ghai-why", text: p.why }) : null,
      el("div", { class: "ghai-row" }, [add, sel, p.url ? el("a", { class: "ghai-btn ghai-btn--ghost ghai-btn--sm", href: p.url, target: "_blank", rel: "noopener", text: "Details" }) : null])
    ]);
  }
  function ui(e) {
    if (!e || !e.type) return;
    if (e.type === "chips") return chips(e.items || []);
    if (e.type === "cart_add") { addItem(e.item, true); return; }
    var box = el("div", { class: "ghai-cards" });
    if (e.title) box.appendChild(el("h4", { text: e.title }));
    if (e.type === "plans") (e.items || []).forEach(function (p) { box.appendChild(planCard(p)); });
    else if (e.type === "domains") {
      var wrap = el("div", { class: "ghai-doms" });
      (e.items || []).forEach(function (x) {
        wrap.appendChild(el("div", { class: "ghai-dom" + (x.available ? "" : " ghai-dom--taken") }, [
          el("span", {}, [el("b", { text: x.domain }), el("small", { text: x.available ? (x.premium ? "Premium · " : "") + money(x.register, x.currency) + " first year · renews " + money(x.renew, x.currency) : "Already registered" })]),
          x.available ? el("button", { class: "ghai-btn ghai-btn--sm", type: "button", text: "Add", "aria-label": "Add " + x.domain + " to cart", onclick: function (ev) { addItem({ key: "d:" + x.domain, kind: "domain", domain: x.domain, label: x.domain, detail: "Domain, 1 year", price: x.register, setupFee: 0, currency: x.currency }); ev.target.textContent = "Added"; ev.target.disabled = true; if (window.GHFx) window.GHFx.pop(ev.target); } }) : null
        ]));
      });
      box.appendChild(wrap);
    } else if (e.type === "premium") {
      // premium domains for sale (search_premium_domains): link to the listing page, no add-to-cart (request + invoice flow)
      var pw = el("div", { class: "ghai-doms" });
      (e.items || []).forEach(function (x) {
        pw.appendChild(el("div", { class: "ghai-dom" }, [
          el("span", {}, [el("b", { text: x.domain }), el("small", { text: x.price == null ? "Premium · make an offer" : "Premium · " + money(x.price, x.currency) + " one-time" })]),
          el("a", { class: "ghai-btn ghai-btn--sm", href: x.url, text: "View" })
        ]));
      });
      box.appendChild(pw);
      if (e.more) box.appendChild(el("a", { class: "ghai-link", href: e.more, text: "All premium domains" }));
    } else if (e.type === "broker") {
      box.appendChild(el("article", { class: "ghai-card ghai-broker" }, [el("h5", { text: e.domain + " is taken" }), el("p", { text: "Our domain broker can contact the owner and negotiate for you. Service fee " + money(e.fee, e.currency) + "." }),
        el("div", { class: "ghai-row" }, [el("a", { class: "ghai-btn ghai-btn--sm", href: e.url, text: "Ask the broker" })])]));
    } else if (e.type === "bundle") {
      var t = el("table", { class: "ghai-lines" });
      (e.lines || []).forEach(function (l) { t.appendChild(el("tr", {}, [el("td", { text: l.label }), el("td", { text: l.price == null ? "At checkout" : money(l.price + (l.setup || 0), e.currency) })])); });
      t.appendChild(el("tfoot", {}, [el("tr", {}, [el("td", { text: "Total" }), el("td", { text: e.total == null ? "At checkout" : money(e.total, e.currency) })])]));
      box.appendChild(el("article", { class: "ghai-card" }, [el("span", { class: "ghai-badge", text: "Bundle" }), t]));
    } else if (e.type === "handoff") {
      box.appendChild(el("article", { class: "ghai-card" }, [el("h5", { text: "Our team has your request" }), el("p", { class: "ghai-why", text: e.ticket ? "Reference #" + e.ticket + ". We reply by email, usually within business hours." : "Message us on WhatsApp and we will pick it up." }),
        e.whatsapp ? el("div", { class: "ghai-row" }, [el("a", { class: "ghai-btn ghai-btn--sm", href: e.whatsapp, target: "_blank", rel: "noopener", text: "Continue on WhatsApp" })]) : null]));
    } else return;
    log.appendChild(box); scroll();
  }

  /* ---------------------------------------------------------------- cart */
  function addItem(it) {
    if (!it || !it.key) return;
    st.cart = st.cart.filter(function (x) { return x.key !== it.key && !(it.kind === "product" && x.slug === it.slug); });
    st.cart.push(it); save(); renderCart();
    var sm = cartBox.querySelector("summary"); if (sm && window.GHFx) window.GHFx.bump(sm);
    if (window.GHFx && !cartBox.dataset.live) { cartBox.dataset.live = 1; cartBox.setAttribute("aria-live", "polite"); }
  }
  function renderCart() {
    cartBox.innerHTML = "";
    if (!st.cart.length) { cartBox.hidden = true; return; }
    cartBox.hidden = false;
    var cur = st.cart[0].currency, total = 0, known = true;
    st.cart.forEach(function (x) { if (x.price == null) known = false; else total += Number(x.price) + Number(x.setupFee || 0); });
    var href = "/ai/checkout?c=" + encodeURIComponent(st.cart.map(function (x) { return x.key; }).join(",")) + (cur ? "&cur=" + cur : "");
    cartBox.appendChild(el("summary", {}, [el("b", { text: "Cart · " + st.cart.length + (st.cart.length === 1 ? " item" : " items") }), el("span", { text: known ? money(Math.round(total * 100) / 100, cur) + " today" : "Total at checkout" }),
      el("a", { class: "ghai-btn ghai-btn--sm", href: href, text: "Checkout", onclick: function (e) { e.stopPropagation(); } })]));
    var ul = el("ul");
    st.cart.forEach(function (x) {
      ul.appendChild(el("li", {}, [el("span", {}, [el("b", { text: x.label }), x.detail ? " · " + x.detail : ""]), el("span", {}, [money(x.price, x.currency), el("button", { class: "ghai-x", type: "button", "aria-label": "Remove " + x.label, text: "×", onclick: function () { st.cart = st.cart.filter(function (y) { return y.key !== x.key; }); save(); renderCart(); } })])]));
    });
    cartBox.appendChild(ul);
  }

  /* ---------------------------------------------------------------- hand-off */
  function handoffForm() {
    if (panel.hidden) open();
    var err = el("p", { class: "ghai-err", role: "alert" });
    var f = el("form", { class: "ghai-hand", onsubmit: async function (e) {
      e.preventDefault(); var b = f.querySelector("button"); b.disabled = true; err.textContent = "";
      try {
        var r = await fetch("/api/ai/handoff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.n.value, email: f.e.value, phone: f.p.value, summary: f.m.value, messages: st.msgs.map(strip), page: location.pathname, hp: hp.value }) });
        var j = await r.json().catch(function () { return {}; });
        if (!r.ok || !j.ok) throw new Error(j.error || "Please try again.");
        f.parentNode.removeChild(f); ui({ type: "handoff", ticket: j.ticket, whatsapp: j.whatsapp });
      } catch (x) { err.textContent = x.message; b.disabled = false; }
    } }, [
      el("label", {}, ["Name", el("input", { name: "n", required: true, autocomplete: "name", maxlength: "80" })]),
      el("label", {}, ["Email", el("input", { name: "e", type: "email", required: true, autocomplete: "email", maxlength: "160" })]),
      el("label", {}, ["WhatsApp / phone (optional)", el("input", { name: "p", type: "tel", autocomplete: "tel", maxlength: "30" })]),
      el("label", {}, ["How can we help?", el("textarea", { name: "m", rows: "2", maxlength: "600", dir: "auto" })]),
      err, el("button", { class: "ghai-btn", type: "submit", text: "Send to our team" })
    ]);
    log.appendChild(el("div", { class: "ghai-cards" }, [el("article", { class: "ghai-card" }, [el("h5", { text: "Talk to a person" }), el("p", { class: "ghai-renew", text: "We send this chat to our sales team; they reply by email or WhatsApp." }), f])]));
    scroll(); setTimeout(function () { f.n.focus(); }, 30);
  }
  function strip(m) { return { role: m.role, content: m.content }; }

  /* ---------------------------------------------------------------- errors: what happened + a way forward */
  function errText(status) {
    if (window.GHFx) return window.GHFx.errInfo(status, null, null).msg;
    return !status ? "You seem to be offline. Check your connection and try again." : status === 429 ? "Too many messages in a short time. Please wait a minute, then try again." : "Something went wrong on our side. Please try again in a minute.";
  }
  function failBubble(msg, retryText) {
    var b = bubble("ai", msg + " ");
    b.parentNode.classList.add("ghai-msg--err");
    var row = el("div", { class: "ghai-row" }, [
      retryText ? el("button", { class: "ghai-btn ghai-btn--sm", type: "button", text: "Try again", onclick: function () { if (busy) return; row.remove(); submit(retryText, null, true); } }) : null,
      el("button", { class: "ghai-btn ghai-btn--ghost ghai-btn--sm", type: "button", text: "Talk to a person", onclick: function () { row.remove(); handoffForm(); } })]);
    b.appendChild(row); scroll();
  }

  /* ---------------------------------------------------------------- send */
  /** Composer / chip entry point: while an answer is still coming, the message waits and goes out right after it. */
  function send(text) {
    var fromBox = text == null;
    text = String(fromBox ? input.value : text).trim();
    if (!text) return;
    if (busy) {
      queued = text; showNote("Sending when the current answer finishes…");
      if (fromBox) { input.value = ""; input.style.height = ""; }
      return;
    }
    submit(text);
  }
  function typingRow() { return el("div", { class: "ghai-msg ghai-msg--ai ghai-wait" }, [hex(), el("div", { class: "ghai-bub" }, [el("span", { class: "ghai-typing", role: "img", "aria-label": "Assistant is typing" }, [el("i"), el("i"), el("i")])])]); }
  async function submit(text, turnstile, again, typedMs) {
    text = String(text || "").trim();
    if (!text || busy) return;
    if (text.length > MAXC) { bubble("ai", "Please keep messages under " + MAXC + " characters."); return; }
    busy = true; sendBtn.disabled = true; showNote("");
    if (again) { st.msgs.push({ role: "user", content: text }); save(); }
    else if (!turnstile) { bubble("me", text); st.msgs.push({ role: "user", content: text }); save(); if (input.value.trim() === text) { input.value = ""; input.style.height = ""; count.textContent = ""; } }
    var typed = typedMs != null ? typedMs : typedAt ? Date.now() - typedAt : 0, sentAt = Date.now(); typedAt = 0;
    var wait = typingRow();
    var waitOn = function () { log.appendChild(wait); scroll(); }; // always the last row while we wait for more
    var waitOff = function () { if (wait.parentNode) wait.remove(); };
    waitOn();
    var reply = { role: "assistant", content: "", ui: [] }, b = null, tools = null, handled = false, done = false, erred = false, resend = 0;
    var c = ctl = window.AbortController ? new AbortController() : null, idle = 0, timedOut = false;
    var poke = function () { clearTimeout(idle); idle = setTimeout(function () { timedOut = true; if (c) c.abort(); }, IDLE_MS); };
    poke();
    try {
      var r = await fetch("/api/ai/chat", { method: "POST", signal: c ? c.signal : undefined, headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({
        messages: st.msgs.map(strip), page: location.pathname, currency: CFG.cur || "", cart: st.cart.map(function (x) { return { key: x.key }; }), conv: st.conv, hp: hp.value, typedMs: typed, pass: st.pass || undefined, turnstile: turnstile }) });
      var ct = r.headers.get("content-type") || "";
      if (ct.indexOf("text/event-stream") < 0 || !r.body) {
        handled = true;
        var j = await r.json().catch(function () { return {}; });
        waitOff(); st.msgs.pop(); save();
        if (j.error === "challenge" && j.siteKey) { st.msgs.push({ role: "user", content: text }); save(); busy = false; return challenge(j.siteKey, text); }
        if (j.error === "offline") return offline(j);
        // first message sent faster than a person types (pasted): wait a moment and send it again, no error shown
        if (j.error === "slow_down" && typedMs == null) { resend = typed + (Date.now() - sentAt) + 1000; waitOn(); return; }
        // our own answers (too long) carry a sentence; rate limits, proxy pages and 5xx get plain words + retry
        if (j.error === "too_long") bubble("ai", j.message || errText(r.status)); else failBubble(j.message || errText(r.status), text);
        return;
      }
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = "";
      for (;;) {
        var x = await rd.read(); if (x.done) break;
        poke();
        buf += dec.decode(x.value, { stream: true });
        var parts = buf.split("\n\n"); buf = parts.pop();
        parts.forEach(function (p) {
          var ev = (p.match(/^event: (.*)$/m) || [])[1], data = (p.match(/^data: (.*)$/m) || [])[1];
          if (!ev || data == null) return; // ": ping" keep-alives and partial events
          var o; try { o = JSON.parse(data); } catch (e) { return; }
          if (ev === "text") { if (!o.t) return; if (!b) { waitOff(); b = bubble("ai", ""); } reply.content += o.t; b.innerHTML = md(reply.content); scroll(); }
          else if (ev === "tool") { b = null; if (!tools) tools = el("div", { class: "ghai-tool", text: "Checking live prices…" }); log.appendChild(tools); waitOn(); }
          else if (ev === "ui") { b = null; reply.ui.push(o); ui(o); waitOn(); }
          else if (ev === "meta") { if (o.pass) st.pass = o.pass; }
          else if (ev === "error") { erred = true; waitOff(); b = null; if (!reply.content && !reply.ui.length) { handled = true; st.msgs.pop(); failBubble(o.message || "Something went wrong on our side.", text); } else failBubble(o.message || "Something went wrong on our side.", null); }
          else if (ev === "done") done = true;
        });
      }
      waitOff();
      var empty = !reply.content && !reply.ui.length;
      if (!erred && empty) { handled = true; st.msgs.pop(); failBubble("Sorry, no answer came back that time. Please try again.", text); }
      else if (!erred && !done) failBubble("The answer was cut off before it finished.", null);
    } catch (e) {
      waitOff();
      var none = !reply.content && !reply.ui.length;
      if (none) { handled = true; st.msgs.pop(); }
      failBubble(timedOut ? "The assistant is taking too long to answer." : navigator.onLine === false ? errText(0) : "The connection dropped before the answer finished.", none ? text : null);
    }
    finally {
      clearTimeout(idle); if (ctl === c) ctl = null;
      waitOff(); if (tools && tools.parentNode) tools.remove();
      if (!handled) { if (reply.content || reply.ui.length) st.msgs.push(reply); else st.msgs.pop(); }
      save();
      if (resend) { log.appendChild(wait); setTimeout(function () { wait.remove(); busy = false; submit(text, null, true, resend); }, 1000); return; }
      busy = false; sendBtn.disabled = false;
      if (queued) { var q = queued; queued = ""; showNote(""); setTimeout(function () { submit(q); }, 0); }
    }
  }
  function offline(j) {
    var b = bubble("ai", (j.message || "The assistant is offline right now.") + " ");
    var row = el("div", { class: "ghai-row" }, [j.whatsapp ? el("a", { class: "ghai-btn ghai-btn--sm", href: j.whatsapp, target: "_blank", rel: "noopener", text: "WhatsApp us" }) : null,
      el("a", { class: "ghai-btn ghai-btn--ghost ghai-btn--sm", href: "mailto:" + (j.email || "support@globalhostia.com"), text: "Email support" }), el("a", { class: "ghai-btn ghai-btn--ghost ghai-btn--sm", href: j.contact || "/contact", text: "Contact page" })]);
    b.appendChild(row); scroll();
  }
  function challenge(siteKey, text) {
    var box = el("div", { class: "ghai-cards" }, [el("article", { class: "ghai-card" }, [el("p", { class: "ghai-renew", text: "Quick check that you are human:" }), el("div", { id: "ghai-ts" })])]);
    log.appendChild(box); scroll();
    var go = function () { window.turnstile.render("#ghai-ts", { sitekey: siteKey, callback: function (tok) { box.remove(); submit(text, tok); } }); };
    if (window.turnstile) go(); else { var s = el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", async: true }); s.onload = go; d.head.appendChild(s); }
  }

  if ((CFG.open && CFG.open !== "expand") || /[?&]assistant=open/.test(location.search)) open();
  if (CFG.open === "expand") open({ expand: true });
  window.GHChat = { open: open, close: close, expand: function () { open({ expand: true }); }, ask: function (t) { open(); typedAt = Date.now() - 5000; send(t); } };
})();
