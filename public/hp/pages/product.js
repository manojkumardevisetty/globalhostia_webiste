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
  box.addEventListener("change", function (e) { if (e.target && e.target.name === "pd-cycle") apply(e.target, true); });
  apply(HP.$("input[name=pd-cycle]:checked", box), false);
});
