/* GlobalHostia product sections: category tabs, monthly/yearly switch, search/sort/filter, pages. No dependencies. */
(function () {
  function $all(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function tabs(section) {
    var list = section.querySelector('.gh-tabs'); if (!list) return;
    var btns = $all(list, '[role=tab]');
    function select(b, focus) {
      btns.forEach(function (x) { var on = x === b; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
        var pane = document.getElementById(x.getAttribute('aria-controls')); if (pane) pane.hidden = !on; });
      if (focus) b.focus();
    }
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { select(b); });
      b.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : -1;
        if (j < 0) return; e.preventDefault(); select(btns[(j + btns.length) % btns.length], true);
      });
    });
  }

  function cycle(section) {
    var g = section.querySelector('.gh-cycle'); if (!g) return;
    $all(g, 'button').forEach(function (b) {
      b.addEventListener('click', function () {
        var view = b.getAttribute('data-cycle');
        $all(g, 'button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
        $all(section, '[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== view; });
        $all(section, '[data-monthly]').forEach(function (a) { var u = a.getAttribute('data-' + view); if (u) a.href = u; });
      });
    });
  }

  function toolbar(bar) {
    var c = document.getElementById(bar.getAttribute('data-target')); if (!c) return;
    var all = $all(c, '.gh-item'), size = parseInt(c.getAttribute('data-page-size') || '0', 10), page = 0;
    var pager = document.querySelector('.gh-pager[data-target="' + c.id + '"]');
    var count = bar.querySelector('.gh-count');
    $all(bar, '[data-gh=filter]').forEach(function (s) {
      var k = 'data-attr-' + s.getAttribute('data-attr'), vals = {};
      all.forEach(function (i) { var v = i.getAttribute(k); if (v) vals[v] = 1; });
      Object.keys(vals).sort().forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); });
      s.setAttribute('data-key', k);
      if (Object.keys(vals).length < 2) s.parentNode.style.display = 'none';
    });
    function price(i) { var v = parseFloat(i.getAttribute('data-price')); return isNaN(v) ? 1e12 : v; }
    function apply() {
      var q = ((bar.querySelector('[data-gh=search]') || {}).value || '').trim().toLowerCase();
      var sort = (bar.querySelector('[data-gh=sort]') || {}).value || '';
      var fs = $all(bar, '[data-gh=filter]');
      var list = all.filter(function (i) {
        if (q && (i.getAttribute('data-name') || '').indexOf(q) < 0 && i.textContent.toLowerCase().indexOf(q) < 0) return false;
        return fs.every(function (s) { return !s.value || i.getAttribute(s.getAttribute('data-key')) === s.value; });
      });
      if (sort === 'price-asc') list.sort(function (a, b) { return price(a) - price(b); });
      else if (sort === 'price-desc') list.sort(function (a, b) { return price(b) - price(a); });
      else if (sort === 'name') list.sort(function (a, b) { return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'), undefined, { numeric: true }); });
      else list.sort(function (a, b) { return all.indexOf(a) - all.indexOf(b); });
      var pages = size ? Math.max(1, Math.ceil(list.length / size)) : 1; if (page >= pages) page = 0;
      all.forEach(function (i) { i.hidden = true; });
      list.forEach(function (i, n) { c.appendChild(i); if (!size || (n >= page * size && n < (page + 1) * size)) i.hidden = false; });
      var empty = c.querySelector('.gh-empty');
      if (!empty) { empty = document.createElement('div'); empty.className = 'gh-empty'; empty.textContent = 'No plans match these filters. Clear a filter to see more.'; c.appendChild(empty); }
      empty.hidden = list.length > 0;
      if (count) count.textContent = list.length === all.length ? all.length + ' plans' : list.length + ' of ' + all.length + ' plans';
      if (pager) {
        pager.innerHTML = '';
        if (pages > 1) for (var n = 0; n < pages; n++) (function (n) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = n + 1; b.setAttribute('aria-label', 'Page ' + (n + 1));
          if (n === page) b.setAttribute('aria-current', 'page');
          b.onclick = function () { page = n; apply(); c.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
          pager.appendChild(b);
        })(n);
      }
    }
    bar.addEventListener('input', function () { page = 0; apply(); });
    bar.addEventListener('change', function () { page = 0; apply(); });
    apply();
  }

  function pagerOnly(c) {
    if (!+c.getAttribute('data-page-size') || document.querySelector('.gh-toolbar[data-target="' + c.id + '"]')) return;
    var bar = document.createElement('div'); bar.className = 'gh-toolbar'; bar.hidden = true; bar.setAttribute('data-target', c.id);
    c.parentNode.insertBefore(bar, c); toolbar(bar);
  }

  function init() {
    $all(document, '.gh-products').forEach(function (s) { tabs(s); cycle(s); });
    $all(document, '.gh-toolbar').forEach(toolbar);
    $all(document, '.gh-items[data-page-size]').forEach(pagerOnly);
    $all(document, '.gh-opt input').forEach(function (r) {
      r.addEventListener('change', function () { var b = document.getElementById('gh-buy-btn'); if (b && r.checked) b.href = r.value; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
