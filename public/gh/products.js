/* GlobalHostia dynamic product sections: sort / filter / search / paginate. No dependencies. */
(function () {
  function items(c) { return Array.prototype.slice.call(c.querySelectorAll(':scope > .gh-item')); }
  function setup(bar) {
    var c = document.getElementById(bar.getAttribute('data-target'));
    if (!c) return;
    var all = items(c), size = parseInt(c.getAttribute('data-page-size') || '0', 10), page = 0;
    var pager = document.querySelector('.gh-pager[data-target="' + c.id + '"]');
    bar.querySelectorAll('[data-gh="filter"]').forEach(function (s) {
      var k = 'data-attr-' + s.getAttribute('data-attr').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      var vals = {}; all.forEach(function (i) { var v = i.getAttribute(k); if (v) vals[v] = 1; });
      Object.keys(vals).sort().forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); });
      if (Object.keys(vals).length < 2) s.style.display = 'none';
      s.setAttribute('data-key', k);
    });
    function apply() {
      var q = (bar.querySelector('[data-gh="search"]') || {}).value || '';
      var sort = (bar.querySelector('[data-gh="sort"]') || {}).value || '';
      var fs = Array.prototype.slice.call(bar.querySelectorAll('[data-gh="filter"]'));
      var list = all.filter(function (i) {
        if (q && (i.getAttribute('data-name') || '').indexOf(q.toLowerCase()) < 0) return false;
        return fs.every(function (s) { return !s.value || i.getAttribute(s.getAttribute('data-key')) === s.value; });
      });
      var p = function (i) { var v = parseFloat(i.getAttribute('data-price')); return isNaN(v) ? 1e9 : v; };
      if (sort === 'price-asc') list.sort(function (a, b) { return p(a) - p(b); });
      else if (sort === 'price-desc') list.sort(function (a, b) { return p(b) - p(a); });
      else if (sort === 'name') list.sort(function (a, b) { return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name')); });
      all.forEach(function (i) { i.style.display = 'none'; });
      var pages = size ? Math.max(1, Math.ceil(list.length / size)) : 1;
      if (page >= pages) page = 0;
      list.forEach(function (i, n) { c.appendChild(i); if (!size || (n >= page * size && n < (page + 1) * size)) i.style.display = ''; });
      var empty = c.querySelector('.gh-empty');
      if (!list.length && !empty) { empty = document.createElement(c.tagName === 'TBODY' ? 'tr' : 'div'); empty.className = 'gh-empty col-12 text-center py-10 coodiv-text-9'; empty.innerHTML = c.tagName === 'TBODY' ? '<td colspan="8" class="text-center py-10">No plans match your filters.</td>' : 'No plans match your filters.'; c.appendChild(empty); }
      if (empty) empty.style.display = list.length ? 'none' : '';
      if (pager) {
        pager.innerHTML = '';
        if (pages > 1) for (var n = 0; n < pages; n++) (function (n) {
          var b = document.createElement('button'); b.type = 'button'; b.textContent = n + 1;
          b.className = 'btn btn-sm mx-1 ' + (n === page ? 'btn-primary' : 'btn-outline-primary');
          b.onclick = function () { page = n; apply(); c.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
          pager.appendChild(b);
        })(n);
      }
    }
    bar.addEventListener('input', function () { page = 0; apply(); });
    bar.addEventListener('change', function () { page = 0; apply(); });
    apply();
  }
  function init() {
    document.querySelectorAll('.gh-toolbar').forEach(setup);
    document.querySelectorAll('.gh-items[data-page-size]').forEach(function (c) {
      if (+c.getAttribute('data-page-size') && !document.querySelector('.gh-toolbar[data-target="' + c.id + '"]')) {
        var bar = document.createElement('div'); bar.className = 'gh-toolbar d-none'; bar.setAttribute('data-target', c.id); c.parentNode.insertBefore(bar, c); setup(bar);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
