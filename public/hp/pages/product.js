/* Product detail page: billing-cycle radios update price, first-invoice total and the Order link;
   hero visual animations pause off-screen. */
(function (f) { var H = window.HP = window.HP || {}; if (H.on) H.on(f); else (H._q = H._q || []).push(f); })(function (HP) {
  "use strict";
  var D = document;
  HP.$$(".pd-vis").forEach(function (v) { HP.pauseOff(v); });

  var box = HP.$("[data-buy]");
  if (!box) return;
  var price = HP.$("[data-buy-price]", box), unit = HP.$("[data-buy-unit]", box), due = HP.$("[data-buy-due]", box), order = HP.$("[data-buy-order]", box);
  function apply(input, animate) {
    if (!input) return;
    var d = input.dataset;
    if (price) price.textContent = d.price;
    if (unit) unit.textContent = d.unit;
    if (due) due.textContent = d.due;
    if (order && d.href) order.setAttribute("href", d.href);
    // keep the hero CTA band order link in step with the chosen cycle
    HP.$$(".hp-cta .hp-btn--light").forEach(function (a) { if (/cart\.php/.test(a.getAttribute("href") || "")) a.setAttribute("href", d.href); });
    if (animate && !HP.reduce) { box.classList.remove("is-bump"); void box.offsetWidth; box.classList.add("is-bump"); }
  }
  /* configurator: OS + extra RAM / vCPU / disk from WHMCS configurable options */
  var cfg = HP.$("[data-cfgbox]", box);
  function fmt(prefix, v) { return (prefix || "$") + v.toFixed(2); }
  function priceOf(el, cycle) { try { var d = JSON.parse(el.dataset.price || el.selectedOptions[0].dataset.price); return { p: +(d.p[cycle] || 0), s: +(d.s[cycle] || 0) }; } catch (e) { return { p: 0, s: 0 }; } }
  function recalc(input, animate) {
    input = input || HP.$("input[name=pd-cycle]:checked", box);
    if (!input) return;
    apply(input, animate);
    if (!cfg) return;
    var d = input.dataset, cycle = input.value, total = +d.amt || 0, setup = +d.setupamt || 0, q = "";
    HP.$$("[data-cfg]", cfg).forEach(function (el) {
      var k = el.dataset.kind, id = el.dataset.cfg, pr;
      if (k === "qty") {
        var n = Math.max(+el.min || 0, Math.min(+el.max || 256, parseInt(el.value, 10) || 0)); el.value = n;
        pr = priceOf(el, cycle); total += pr.p * n; if (n) setup += pr.s;
        var u = el.closest(".pd-cfg__row").querySelector("[data-unitprice]"); if (u) u.textContent = pr.p ? fmt(d.prefix, pr.p) + " each" + (n ? " · +" + fmt(d.prefix, pr.p * n) : "") : "";
        q += "&configoption[" + id + "]=" + n;
      } else if (k === "yesno") {
        pr = priceOf(el, cycle); if (el.checked) { total += pr.p; setup += pr.s; }
        q += "&configoption[" + id + "]=" + (el.checked ? el.dataset.val : 0);
      } else {
        pr = priceOf(el, cycle); total += pr.p; setup += pr.s;
        q += "&configoption[" + id + "]=" + encodeURIComponent(el.value);
      }
    });
    if (price) price.textContent = fmt(d.prefix, total);
    if (due) due.textContent = fmt(d.prefix, total + setup);
    var href = d.href + q;
    if (order) order.setAttribute("href", href);
    HP.$$(".hp-cta .hp-btn--light").forEach(function (a) { if (/cart\.php/.test(a.getAttribute("href") || "")) a.setAttribute("href", href); });
  }
  box.addEventListener("change", function (e) { if (e.target && (e.target.name === "pd-cycle" || e.target.dataset.cfg)) recalc(e.target.name === "pd-cycle" ? e.target : null, true); });
  box.addEventListener("input", function (e) { if (e.target && e.target.dataset.kind === "qty") recalc(null, false); });
  box.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".pd-step__b"); if (!b) return;
    var inp = b.parentNode.querySelector("input"); inp.value = Math.max(+inp.min || 0, Math.min(+inp.max || 256, (parseInt(inp.value, 10) || 0) + (+b.dataset.d))); recalc(null, true);
  });
  recalc(null, false);
});
