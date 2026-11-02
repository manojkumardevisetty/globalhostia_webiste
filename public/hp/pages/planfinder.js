/* Plan finder: four questions, one at a time, then a recommendation from the embedded live catalog snapshot.
   Products/prices come from #pf-data (server-rendered from the database); nothing is computed or invented here
   except which of those plans to show. Answers are kept in the URL hash so a result can be shared. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  var root = HP.$("[data-pf]"), src = document.getElementById("pf-data");
  if (!root || !src) return;
  var DATA; try { DATA = JSON.parse(src.textContent); } catch (e) { return; }
  var P = DATA.products || [], LABEL = DATA.labels || {}, PAGE = DATA.pages || {};
  var form = HP.$("[data-pf-form]", root), qs = HP.$$(".pf-q", root), ids = qs.map(function (q) { return q.dataset.q; });
  var back = HP.$("[data-pf-back]", root), next = HP.$("[data-pf-next]", root), bar = HP.$(".pf-prog__bar", root);
  var res = HP.$("[data-pf-res]", root), cards = HP.$("[data-pf-cards]", root), why = HP.$("[data-pf-why]", root);
  var locWrap = HP.$("[data-pf-locwrap]", root), locBox = HP.$("[data-pf-locs]", root);
  var step = 0, answers = {}, loc = "", pointer = false;

  root.classList.add("is-js");
  function val(id) { var c = form.querySelector("input[name='" + id + "']:checked"); return c ? c.value : ""; }
  function labelOf(id) { var c = form.querySelector("input[name='" + id + "']:checked"); return c ? c.closest(".pf-opt").querySelector("b").textContent : ""; }

  function show(i, focus) {
    step = Math.max(0, Math.min(ids.length - 1, i));
    qs.forEach(function (q, k) { q.hidden = k !== step; });
    form.hidden = false; res.hidden = true;
    back.hidden = step === 0;
    next.firstChild.nodeValue = step === ids.length - 1 ? "See my plan" : "Next";
    next.disabled = !val(ids[step]);
    if (bar) bar.style.transform = "scaleX(" + (step / ids.length) + ")";
    if (focus) { qs[step].setAttribute("tabindex", "-1"); qs[step].focus({ preventScroll: true }); }
  }
  function sync() {
    ids.forEach(function (id) {
      answers[id] = val(id);
      var b = HP.$("[data-goto='" + id + "']", root);
      if (b) { b.textContent = labelOf(id) || "Not answered"; b.disabled = !answers[id]; }
    });
    next.disabled = !val(ids[step]);
  }

  /* ---------------- scoring ---------------- */
  var TIER = { shared: 0, wp: 1, reseller: 2, automation: 3, vps: 4, forex: 4, rdp: 4, ai: 6, dedicated: 7 };
  function ladder(a) {
    var tr = +a.traffic, sites = +a.sites, b = a.build, web = (b === "wp" || b === "store") ? ["wp", "shared"] : ["shared", "wp"];
    if (b === "trade") return ["forex", "rdp", "vps", "dedicated"];
    if (b === "app") return tr >= 3 ? ["dedicated", "vps"] : ["vps", "automation", "dedicated"];
    if (tr >= 3) return ["dedicated", "vps"];
    if (tr >= 2) return ["vps", "dedicated"].concat(web);
    if (sites >= 21) return ["reseller", "vps"].concat(web);
    if (b === "store" && tr >= 1 && a.budget === "high") return ["vps"].concat(web, ["dedicated"]);
    return web.concat(["vps", "dedicated"]);
  }
  var family = function (n) { return n.replace(/\s+(USA|US|MY|SG|UK|EU|Malaysia|Singapore|Europe|Germany|France|Netherlands|Finland|Canada)$/i, "").trim(); };
  function poolFor(type, a, location, loose) {
    var need = loose ? 1 : +a.sites || 1, web = type === "shared" || type === "wp" || type === "reseller";
    var list = P.filter(function (p) { return p.t === type && (!location || p.l === location) && (!web || !p.w || p.w >= need); });
    list.sort(function (x, y) { return (x.a == null ? 1e9 : x.a) - (y.a == null ? 1e9 : y.a); });
    if (location) return list;
    var seen = {}; // one per plan family (same plan in several datacenters) — the cheapest
    return list.filter(function (p) { var k = family(p.n); if (seen[k]) return false; seen[k] = 1; return true; });
  }
  function size(a) {
    var s = (+a.traffic / 3) * 0.45 + ({ "1": 0, "2": 1, "6": 2, "21": 3 }[a.sites] || 0) / 3 * 0.2 + ({ low: 0, mid: 0.5, high: 1 }[a.budget] || 0) * 0.35;
    return a.budget === "low" ? Math.min(s, 0.34) : s;
  }
  function recommend(a) {
    var types = ladder(a).filter(function (t, i, l) { return l.indexOf(t) === i; });
    var first = null, pool = [], idx = 0;
    // strict pass respects website limits; if nothing fits, fall back to the largest plans we have
    for (var pass = 0; pass < 2 && !first; pass++) {
      for (var i = 0; i < types.length; i++) {
        pool = poolFor(types[i], a, loc ? loc : "", pass === 1);
        if (!pool.length && loc) pool = poolFor(types[i], a, "", pass === 1);
        if (pool.length) { first = types[i]; if (pass === 1) a = Object.assign({}, a, { budget: "high" }); break; }
      }
    }
    if (!first) return null;
    idx = Math.round(size(a) * (pool.length - 1));
    var out = [{ p: pool[idx], tag: "Best match" }];
    var up = pool[idx + 1], down = pool[idx - 1];
    if (up) out.push({ p: up, tag: "More headroom" }); else if (down) out.push({ p: down, tag: "Lower cost" });
    var rest = types.slice(types.indexOf(first) + 1);
    for (var j = 0; j < rest.length && out.length < 3; j++) {
      var alt = poolFor(rest[j], a, "");
      if (alt.length) {
        var pick = TIER[rest[j]] > TIER[first] ? alt[0] : alt[Math.min(alt.length - 1, idx)];
        out.push({ p: pick, tag: TIER[rest[j]] > TIER[first] ? "Room to grow" : "Also a fit" });
      }
    }
    if (out.length < 3 && up && down) out.push({ p: down, tag: "Lower cost" });
    return { type: first, items: out, pool: pool };
  }

  var WHY = {
    shared: "Shared web hosting handles this comfortably and includes free SSL, email and automatic backups.",
    wp: "WordPress hosting is tuned for WordPress, with updates and backups looked after for you.",
    reseller: "Reseller hosting gives every client site its own control panel account under your brand.",
    vps: "A VPS reserves CPU and memory for you alone and gives you root access, so busy sites and apps are not slowed by neighbours.",
    dedicated: "At this scale a dedicated server gives you a whole machine, with no resources shared with anyone.",
    rdp: "An RDP server is an always-on Windows desktop you can reach from any device.",
    forex: "A forex VPS keeps MetaTrader and your Expert Advisors running around the clock, even when your own computer is off.",
    automation: "An automation server runs n8n and your bots all day without tying up your own machine.",
    ai: "An AI server is sized for running language models privately."
  };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function card(it, top) {
    var p = it.p, a = el("article", "pf-card" + (top ? " is-top" : ""));
    var head = el("div", "pf-card__head");
    head.appendChild(el("span", "pf-card__tag", it.tag));
    head.appendChild(el("span", "pf-card__type", LABEL[p.t] || ""));
    a.appendChild(head);
    var h = el("h3", null); var hl = el("a", null, p.n); hl.href = p.d; h.appendChild(hl); a.appendChild(h);
    if (p.sp) a.appendChild(el("p", "pf-card__spec", p.sp));
    var meta = [p.l ? "Datacenter: " + p.l : "", p.os ? p.os : ""].filter(Boolean).join(" · ");
    if (meta) a.appendChild(el("p", "pf-card__meta", meta));
    var pr = el("p", "pf-card__price num");
    if (p.p) { pr.appendChild(el("b", null, p.p)); a.appendChild(pr); a.appendChild(el("p", "pf-card__renew", "Renews at the same price")); }
    else { pr.appendChild(el("b", null, "See price")); a.appendChild(pr); a.appendChild(el("p", "pf-card__renew", "Confirmed live in the order form")); }
    var acts = el("div", "pf-card__acts");
    var o = el("a", "hp-btn " + (top ? "hp-btn--brand" : "hp-btn--ghost"), p.p ? "Order now" : "See price and order"); o.href = p.u; o.setAttribute("aria-label", (p.p ? "Order now: " : "See price and order: ") + p.n);
    var d = el("a", "hp-link", "View details"); d.href = p.d; d.setAttribute("aria-label", "View details: " + p.n);
    acts.appendChild(o); acts.appendChild(d); a.appendChild(acts);
    return a;
  }
  function locChips(type, a) {
    var all = P.filter(function (p) { return p.t === type && p.l; }).map(function (p) { return p.l; });
    var ls = all.filter(function (l, i) { return all.indexOf(l) === i; }).sort();
    locBox.textContent = "";
    if (ls.length < 2) { locWrap.hidden = true; return; }
    locWrap.hidden = false;
    [""].concat(ls).forEach(function (l) {
      var b = el("button", "pf-chip", l || "Any location"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(l === loc)); b.dataset.loc = l;
      locBox.appendChild(b);
    });
  }
  function finish(focus) {
    sync();
    if (ids.some(function (id) { return !answers[id]; })) { show(ids.findIndex(function (id) { return !answers[id]; }), true); return; }
    var r = recommend(answers);
    form.hidden = true; res.hidden = false;
    if (bar) bar.style.transform = "scaleX(1)";
    cards.textContent = "";
    if (!r) {
      why.textContent = "We could not find a published plan that fits these answers right now. Our team can recommend one for you.";
      var c = el("a", "hp-btn hp-btn--brand", "Talk to our team"); c.href = "/contact"; cards.appendChild(c);
      locWrap.hidden = true;
    } else {
      var B = { site: "a website", wp: "a WordPress site", store: "an online store", app: "an app, API or bot", trade: "a trading setup or remote desktop" };
      var T = ["under 10,000 visits", "10,000 to 100,000 visits", "100,000 to 1 million visits", "more than 1 million visits"];
      var S = { "1": "one site or project", "2": "2 to 5 sites", "6": "6 to 20 sites", "21": "more than 20 sites" };
      var lead = "You are building " + B[answers.build] + " with " + T[+answers.traffic] + " a month across " + S[answers.sites] + ". ";
      why.textContent = lead + (WHY[r.type] || "");
      if (PAGE[r.type]) { why.appendChild(document.createTextNode(" ")); var m = el("a", "hp-link pf-more", "See all " + (LABEL[r.type] || "plans").toLowerCase() + " plans"); m.href = PAGE[r.type]; why.appendChild(m); }
      r.items.forEach(function (it, i) { cards.appendChild(card(it, i === 0)); });
      locChips(r.type, answers);
    }
    try { history.replaceState(null, "", "#a=" + ids.map(function (id) { return answers[id]; }).join(",") + (loc ? "," + encodeURIComponent(loc) : "")); } catch (e) {}
    if (focus) { res.focus({ preventScroll: true }); var top = res.getBoundingClientRect().top + window.pageYOffset - 110; if (window.pageYOffset > top) window.scrollTo({ top: top, behavior: HP.reduce ? "auto" : "smooth" }); }
  }

  /* ---------------- events ---------------- */
  form.addEventListener("pointerdown", function () { pointer = true; });
  form.addEventListener("keydown", function () { pointer = false; });
  form.addEventListener("change", function () {
    sync();
    if (pointer && step < ids.length - 1) setTimeout(function () { show(step + 1, true); }, HP.reduce ? 0 : 220);
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!val(ids[step])) return;
    if (step < ids.length - 1) show(step + 1, true); else finish(true);
  });
  back.addEventListener("click", function () { show(step - 1, true); });
  root.addEventListener("click", function (e) {
    var g = e.target.closest && e.target.closest("[data-goto]");
    if (g && !g.disabled) { show(ids.indexOf(g.dataset.goto), true); return; }
    if (e.target.closest && e.target.closest("[data-pf-restart]")) {
      form.reset(); loc = ""; sync(); try { history.replaceState(null, "", location.pathname + location.search); } catch (x) {}
      show(0, true); return;
    }
    var c = e.target.closest && e.target.closest(".pf-chip");
    if (c) { loc = c.dataset.loc || ""; finish(false); var again = HP.$(".pf-chip[aria-checked=true]", locBox); if (again) again.focus(); }
  });

  /* restore from #a=build,traffic,sites,budget[,location] */
  var m = /#a=([^&]+)/.exec(location.hash);
  if (m) {
    var parts = m[1].split(",");
    ids.forEach(function (id, i) { var r = parts[i] && form.querySelector("input[name='" + id + "'][value='" + parts[i].replace(/[^a-z0-9]/gi, "") + "']"); if (r) r.checked = true; });
    if (parts[4]) loc = decodeURIComponent(parts[4]);
    sync();
    if (ids.every(function (id) { return answers[id]; })) { finish(false); return; }
  }
  sync(); show(0, false);
});
