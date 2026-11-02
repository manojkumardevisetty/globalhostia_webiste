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

  ready(function () { try { groupedNav(); } catch (e) {} try { promo(); } catch (e) {} });
})();
