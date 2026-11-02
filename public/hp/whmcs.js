/* Globalhostia client-area enhancements (loaded by a tiny WHMCS hook, see docs).
   1) Replaces the endless horizontal store-category scroller with 5 grouped menus (Hostpen Modern style).
   2) Adds a promo banner above store listings.
   Pure progressive enhancement: if anything fails the original page stays as it was. */
(function () {
  'use strict';
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }

  var GROUPS = [
    { label: 'Hosting', icon: 'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01', match: /website|wordpress|shared|hosting/i, prio: 5 },
    { label: 'VPS & Cloud', icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', match: /vps|virtual|^servers$|cloud|\bai\b|llm|forex/i, prio: 4 },
    { label: 'Dedicated', icon: 'M5 3h14v18H5zM9 7h6M9 11h6M9 15h6', match: /dedicated/i, prio: 1 },
    { label: 'Remote Desktop', icon: 'M3 4h18v12H3zM8 20h8M12 16v4', match: /rdp|remote/i, prio: 2 },
    { label: 'Security & Apps', icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', match: /ssl|mcp|project|management|n8n|email|workspace/i, prio: 3 },
  ];
  var RENAME = { 'Servers': 'Cloud VPS – Europe & USA', "MCP's": 'MCPs & Automation', 'Ai/llm Hosting': 'AI / LLM Hosting' };
  var svg = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };

  function groupedNav() {
    var scroller = document.querySelector('.order-form-menu-scroller');
    if (!scroller) return;
    var links = Array.prototype.slice.call(scroller.querySelectorAll('a.nav-link[href]'));
    if (links.length < 4) return;
    var buckets = GROUPS.map(function (g) { return { g: g, items: [] }; });
    var other = { g: { label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01' }, items: [] };
    links.forEach(function (a) {
      var t = a.textContent.trim(); if (!t) return;
      var item = { text: RENAME[t] || t, href: a.getAttribute('href'), active: a.classList.contains('active') || location.pathname === a.pathname };
      var b = buckets.filter(function (x) { return x.g.match.test(t); }).sort(function (a, c) { return a.g.prio - c.g.prio; })[0] || other;
      b.items.push(item);
    });
    if (other.items.length) buckets.push(other);
    var nav = document.createElement('nav');
    nav.className = 'gh-catnav'; nav.setAttribute('aria-label', 'Product categories');
    nav.innerHTML = buckets.filter(function (b) { return b.items.length; }).map(function (b, i) {
      var act = b.items.some(function (x) { return x.active; });
      return '<div class="gh-catnav__grp' + (act ? ' is-active' : '') + '"><button type="button" class="gh-catnav__btn" aria-expanded="false" aria-controls="gh-cat-' + i + '">' + svg(b.g.icon) + '<span>' + b.g.label + '</span><i aria-hidden="true"></i></button>' +
        '<ul class="gh-catnav__menu" id="gh-cat-' + i + '" role="list">' + b.items.map(function (x) {
          return '<li><a href="' + x.href + '"' + (x.active ? ' aria-current="page"' : '') + '>' + x.text + '</a></li>';
        }).join('') + '</ul></div>';
    }).join('');
    scroller.parentNode.insertBefore(nav, scroller);
    scroller.classList.add('gh-hidden');
    function closeAll(except) { nav.querySelectorAll('.gh-catnav__grp.is-open').forEach(function (g) { if (g !== except) { g.classList.remove('is-open'); g.querySelector('button').setAttribute('aria-expanded', 'false'); } }); }
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.gh-catnav__btn'); if (!btn) return;
      var g = btn.parentNode, open = !g.classList.contains('is-open');
      closeAll(g); g.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) closeAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  }

  function promo() {
    if (!/\/store\/|cart\.php(\?(a=|gid=)|$)/.test(location.pathname + location.search) || /a=(confproduct|confdomains|checkout|view|complete)/.test(location.search)) return;
    var host = document.querySelector('.gh-catnav') || document.querySelector('#order-standard_cart');
    if (!host || document.querySelector('.gh-promo')) return;
    var p = document.createElement('aside');
    p.className = 'gh-promo';
    p.innerHTML = '<div class="gh-promo__txt"><span class="gh-promo__tag">New</span><b>Cloud VPS in Europe &amp; USA</b><span>NVMe, choose your OS, add RAM or vCPU any time. Ready in minutes.</span></div>' +
      '<a class="gh-promo__btn" href="/secure/store/servers">Explore servers</a>';
    host.parentNode.insertBefore(p, host.nextSibling);
  }

  /* ---------- product listing: specs on every card; big categories become a filterable, sortable list ---------- */
  var SPECS_URL = 'https://globalhostiawebiste.vercel.app/api/store/specs';
  function parseCards(row) {
    return Array.prototype.slice.call(row.querySelectorAll('.emyui-ews-plans-group')).map(function (el) {
      var a = el.querySelector('a.btn-order-now, a.emyui-ews-plans-add-cart');
      var href = a ? a.getAttribute('href') : '#';
      var slug = (href.match(/\/store\/[^/]+\/([^/?#]+)/) || [])[1] || '';
      var priceEl = el.querySelector('.emyui-ews-plans-group-price-tag');
      var price = priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : NaN;
      var cycle = ((el.querySelector('.emyui-ews-plans-price-algo small') || {}).textContent || '').trim();
      var cur = ((el.querySelector('.emyui-ews-plans-price-algo span') || {}).textContent || '$').trim();
      var save = ((el.querySelector('.save-tag') || {}).textContent || '').trim();
      var name = ((el.querySelector('h5') || {}).textContent || '').trim();
      var region = /\b(usa|us)\b/i.test(name) ? 'USA' : /europe|france|germany|uk|netherlands/i.test(name) ? 'Europe' : '';
      var tier = /^(swift|velocity|turbo|boost|mega)\b/i.test(name) ? 'High performance' : /^(basic|standard|pro|advanced|elite)\b/i.test(name) ? 'Classic' : /ryzen|xeon|e5-|dedicated/i.test(name) ? 'Dedicated' : '';
      return { el: el, href: href, slug: slug, price: price, cycle: cycle, cur: cur, save: save, name: name, region: region, tier: tier, soldOut: !a || /out of stock/i.test(el.textContent) };
    });
  }
  function chips(list) { return list.map(function (f) { return '<li>' + f.replace(/</g, '&lt;') + '</li>'; }).join(''); }
  function enhanceListing() {
    var row = document.querySelector('#products.emyui-ews-plans-row, #order-standard_cart #products');
    if (!row) return;
    var items = parseCards(row);
    if (!items.length) return;
    fetch(SPECS_URL, { mode: 'cors' }).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (specs) {
      items.forEach(function (it) { var s = specs[it.slug]; it.features = s && s.features && s.features.length ? s.features : []; if (s) { it.region = it.region || s.location || ''; it.tier = it.tier || s.tier || ''; } });
      if (items.length <= 6) {
        items.forEach(function (it) {
          if (!it.features.length) return;
          var ul = it.el.querySelector('.emyui-ews-plans-features');
          if (ul && !ul.children.length) ul.innerHTML = chips(it.features);
        });
        row.classList.add('gh-cards');
        return;
      }
      buildList(row, items);
    });
  }
  function buildList(row, items) {
    var regions = uniq(items.map(function (i) { return i.region; }));
    var tiers = uniq(items.map(function (i) { return i.tier; }));
    var wrap = document.createElement('section');
    wrap.className = 'gh-plist';
    wrap.innerHTML =
      '<div class="gh-plist__bar">' +
        '<label class="gh-plist__search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="gh-sr">Search plans</span><input type="search" placeholder="Search ' + items.length + ' plans" data-q></label>' +
        (tiers.length > 1 ? seg('tier', 'Type', tiers) : '') +
        (regions.length > 1 ? seg('region', 'Location', regions) : '') +
        '<label class="gh-plist__sort"><span>Sort</span><select data-sort><option value="price">Price: low to high</option><option value="-price">Price: high to low</option><option value="name">Name</option></select></label>' +
      '</div>' +
      '<p class="gh-plist__count" aria-live="polite"></p>' +
      '<div class="gh-plist__head" aria-hidden="true"><span>Plan</span><span>Specifications</span><span>Price</span><span></span></div>' +
      '<ol class="gh-plist__rows"></ol>';
    row.parentNode.insertBefore(wrap, row);
    row.classList.add('gh-hidden');
    var ol = wrap.querySelector('.gh-plist__rows'), state = { q: '', tier: '', region: '', sort: 'price' };
    function render() {
      var list = items.filter(function (i) {
        return (!state.tier || i.tier === state.tier) && (!state.region || i.region === state.region) &&
          (!state.q || (i.name + ' ' + i.features.join(' ')).toLowerCase().indexOf(state.q) > -1);
      }).sort(function (a, b) {
        if (state.sort === 'name') return a.name.localeCompare(b.name);
        var d = (isNaN(a.price) ? 1e9 : a.price) - (isNaN(b.price) ? 1e9 : b.price);
        return state.sort === '-price' ? -d : d;
      });
      wrap.querySelector('.gh-plist__count').textContent = list.length + ' of ' + items.length + ' plans';
      ol.innerHTML = list.length ? list.map(function (i) {
        return '<li class="gh-prow">' +
          '<div class="gh-prow__name"><b>' + esc(i.name) + '</b><span>' + [i.tier, i.region].filter(Boolean).map(esc).join(' · ') + '</span></div>' +
          '<ul class="gh-prow__specs">' + (i.features.length ? chips(i.features.slice(0, 4)) : '<li>See details</li>') + '</ul>' +
          '<div class="gh-prow__price">' + (isNaN(i.price) ? '' : '<b>' + esc(i.cur) + i.price.toFixed(2) + '</b><span>' + esc(i.cycle) + '</span>') + (i.save ? '<em>' + esc(i.save.replace(/^with an?\s*/i, '')) + '</em>' : '') + '</div>' +
          '<div class="gh-prow__cta">' + (i.soldOut ? '<span class="gh-prow__oos">Out of stock</span>' : '<a class="gh-prow__btn" href="' + i.href + '">Configure</a>') + '</div></li>';
      }).join('') : '<li class="gh-plist__empty">No plans match. <button type="button" data-reset>Clear filters</button></li>';
    }
    wrap.addEventListener('input', function (e) { if (e.target.matches('[data-q]')) { state.q = e.target.value.trim().toLowerCase(); render(); } });
    wrap.addEventListener('change', function (e) { if (e.target.matches('[data-sort]')) { state.sort = e.target.value; render(); } });
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-key]');
      if (b) { var k = b.getAttribute('data-key'); state[k] = b.getAttribute('data-val'); b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); render(); }
      if (e.target.matches('[data-reset]')) { state.q = state.tier = state.region = ''; wrap.querySelector('[data-q]').value = ''; wrap.querySelectorAll('[data-key]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-val') === '')); }); render(); }
    });
    render();
  }
  function seg(key, label, vals) {
    return '<div class="gh-plist__seg" role="group" aria-label="' + label + '"><button type="button" data-key="' + key + '" data-val="" aria-pressed="true">All</button>' +
      vals.map(function (v) { return '<button type="button" data-key="' + key + '" data-val="' + esc(v) + '" aria-pressed="false">' + esc(v) + '</button>'; }).join('') + '</div>';
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  ready(function () { try { groupedNav(); } catch (e) {} try { promo(); } catch (e) {} try { enhanceListing(); } catch (e) {} });
})();
