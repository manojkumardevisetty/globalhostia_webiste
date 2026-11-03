/* Globalhostia client-area enhancements (loaded by a tiny WHMCS hook, see docs).
   1) Replaces the endless horizontal store-category scroller with 5 grouped menus (Hostpen Modern style).
   2) Adds a promo banner above store listings.
   Pure progressive enhancement: if anything fails the original page stays as it was. */

/* Language (English / Arabic) for everything this file adds; WHMCS's own language decides. Signals, strongest first:
   ?language=<name> on the URL (WHMCS's switch), window.GH_LANG (printed by docs/whmcs/globalhostia_hosting_hook.php),
   <html lang="ar"> / dir="rtl", a WHMCS language cookie, else the last language seen here (localStorage).
   Arabic first loads /hp/whmcs-i18n.js (the dictionary) and then runs this file once more, so every string, constants
   included, goes through window.GH_L10N.t(). Arabic also sets dir="rtl" + lang="ar" on <html> and loads IBM Plex Sans Arabic. */
(function () {
  'use strict';
  var prev = window.GH_L10N;
  if (prev) { if (prev.wait) { prev.wait = false; prev.apply(); } return; } // second run, after the dictionary arrived
  var me = document.currentScript, src = (me && me.src) || '';
  var origin = (function () { try { return new URL(src).origin; } catch (e) { return 'https://globalhostia.com'; } })();
  var FSI = '⁨', PDI = '⁩'; // first-strong isolates keep inserted values (domains, paths, numbers) in their own direction
  function store(v) { try { if (v) localStorage.setItem('gh-lang', v); else return localStorage.getItem('gh-lang'); } catch (e) {} return null; }
  function code(name) { name = String(name || '').trim().toLowerCase(); return !name ? '' : /^(ar|arabic)([-_].*)?$/.test(name) || name === 'العربية' ? 'ar' : 'en'; }
  function detect() {
    var m = location.search.match(/[?&]language=([^&#]*)/i), hit = '';
    if (m) { try { hit = code(decodeURIComponent(m[1].replace(/\+/g, ' '))); } catch (e) {} }
    if (!hit && window.GH_LANG) hit = code(window.GH_LANG);
    if (!hit) { var h = document.documentElement; if (/^ar\b/i.test(h.getAttribute('lang') || '') || /^rtl$/i.test(h.getAttribute('dir') || '')) hit = 'ar'; }
    if (!hit) { var c = document.cookie.match(/(?:^|;\s*)(?:WHMCSLanguage|WHMCSlang|language)=([^;]+)/i); if (c) { try { hit = code(decodeURIComponent(c[1])); } catch (e) {} } }
    if (hit) { store(hit); return hit; }
    return store() === 'ar' ? 'ar' : 'en';
  }
  var lang = detect();
  var L = { lang: lang, rtl: lang === 'ar', wait: false, origin: origin };
  L.loc = L.rtl ? 'ar-AE-u-nu-latn' : undefined; // Arabic month names, Latin digits
  function dict() { var D = window.GH_I18N; return L.rtl && D && D.ar ? D : null; }
  function fill(s, p) { return p ? String(s).replace(/\{(\w+)\}/g, function (m, n) { return n in p ? (L.rtl ? FSI + p[n] + PDI : String(p[n])) : m; }) : String(s); }
  /** _t("English text with {placeholders}", { placeholders }) -> the Arabic text when the page is Arabic */
  L.t = function (k, p) { var D = dict(), s = D && typeof D.ar[k] === 'string' ? D.ar[k] : k; return fill(s, p); };
  /** _tp(n, "one form", "other form", params): English one/other; Arabic uses the plural categories stored under the other form */
  L.tp = function (n, one, other, p) {
    p = p || {}; if (!('n' in p)) p.n = L.num(n);
    var D = dict(), e = D && D.ar[other];
    if (e && typeof e === 'object') { var c = 'other'; try { c = new Intl.PluralRules('ar').select(n); } catch (x) {} return fill(e[c] || e.other, p); }
    return L.t(n === 1 ? one : other, p);
  };
  L.num = function (n, o) { try { return new Intl.NumberFormat(L.rtl ? L.loc : 'en-US', o).format(n); } catch (e) { return String(n); } };
  L.date = function (d, o) { return d.toLocaleDateString(L.loc, o); };
  L.time = function (d, o) { return d.toLocaleTimeString(L.loc, o); };
  /** messages that come from the server (toasts, check titles): exact strings and patterns from the dictionary */
  L.srv = function (msg) {
    var D = dict(); if (!D || msg == null) return msg;
    if (typeof D.ar[msg] === 'string') return D.ar[msg];
    var P = D.srv || [];
    for (var i = 0; i < P.length; i++) {
      var m = String(msg).match(new RegExp('^' + P[i][0] + '$'));
      if (m) return P[i][1].replace(/\$(\d)/g, function (x, g) { var v = m[+g] || ''; return FSI + (typeof D.ar[v] === 'string' ? D.ar[v] : v) + PDI; });
    }
    return msg;
  };
  /** the current URL with WHMCS's language switch */
  L.href = function (to) { try { var u = new URL(location.href); u.searchParams.set('language', to === 'ar' ? 'arabic' : 'english'); u.hash = ''; return u.toString(); } catch (e) { return '?language=' + (to === 'ar' ? 'arabic' : 'english'); } };
  L.remember = function (to) { store(to === 'ar' ? 'ar' : 'en'); };
  L.apply = function () {
    if (!L.rtl) return;
    var h = document.documentElement;
    if (!/^ar\b/i.test(h.getAttribute('lang') || '')) h.setAttribute('lang', 'ar');
    if (!/^rtl$/i.test(h.getAttribute('dir') || '')) h.setAttribute('dir', 'rtl');
    h.classList.add('gh-ar');
    if (document.querySelector('link[data-gh-arfont]')) return;
    var head = document.head || h;
    [['preconnect', 'https://fonts.googleapis.com'], ['preconnect', 'https://fonts.gstatic.com'], ['stylesheet', 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap']].forEach(function (x) {
      var l = document.createElement('link'); l.rel = x[0]; l.href = x[1]; if (x[0] === 'preconnect' && /gstatic/.test(x[1])) l.crossOrigin = 'anonymous'; if (x[0] === 'stylesheet') l.setAttribute('data-gh-arfont', ''); head.appendChild(l);
    });
  };
  window.GH_L10N = L;
  if (L.rtl && !(window.GH_I18N && window.GH_I18N.ar)) {
    L.wait = true; // every block below returns now and runs again once the dictionary is here
    var done = false, again = function (ok) {
      if (done) return; done = true;
      if (!ok) { L.lang = 'en'; L.rtl = false; L.loc = undefined; }
      if (!src) { L.wait = false; L.apply(); return; }
      var s2 = document.createElement('script'); s2.src = src; (document.head || document.documentElement).appendChild(s2);
    };
    var s = document.createElement('script');
    s.src = origin + '/hp/whmcs-i18n.js' + ((src.match(/\?[^#]*/) || [''])[0]);
    s.onload = function () { again(!!(window.GH_I18N && window.GH_I18N.ar)); };
    s.onerror = function () { again(false); };
    setTimeout(function () { again(!!(window.GH_I18N && window.GH_I18N.ar)); }, 6000);
    (document.head || document.documentElement).appendChild(s);
  } else L.apply();
})();

(function () {
  'use strict';
  if (window.GH_L10N.wait) return; // Arabic: runs again once the dictionary is loaded
  var L10N = window.GH_L10N, _t = L10N.t, _tp = L10N.tp;
  // works both at globalhostia.com/secure/... and at my.globalhostia.com/...
  var ORIGIN = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return 'https://globalhostia.com'; } })();
  var B = /^\/secure(\/|$)/.test(location.pathname) ? '/secure' : '';
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }

  var GROUPS = [
    { label: _t('Hosting'), icon: 'M3 5h18v6H3zM3 13h18v6H3zM7 8h.01M7 16h.01', match: /website|wordpress|shared|hosting/i, prio: 5 },
    { label: _t('VPS & Cloud'), icon: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01', match: /vps|virtual|^servers$|cloud|\bai\b|llm|forex/i, prio: 4 },
    { label: _t('Dedicated'), icon: 'M5 3h14v18H5zM9 7h6M9 11h6M9 15h6', match: /dedicated/i, prio: 1 },
    { label: _t('Remote Desktop'), icon: 'M3 4h18v12H3zM8 20h8M12 16v4', match: /\brdp\b|remote/i, prio: 2 },
    { label: _t('Security & Apps'), icon: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', match: /ssl|mcp|project|management|n8n|email|workspace/i, prio: 3 },
  ];
  var RENAME = { 'Servers': _t('Cloud VPS – Europe & USA'), "MCP's": _t('MCPs & Automation'), 'Ai/llm Hosting': _t('AI / LLM Hosting') };
  var svg = function (d) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };

  function groupedNav() {
    var scroller = document.querySelector('.order-form-menu-scroller');
    if (!scroller) return;
    var links = Array.prototype.slice.call(scroller.querySelectorAll('a.nav-link[href]'));
    if (links.length < 4) return;
    var buckets = GROUPS.map(function (g) { return { g: g, items: [] }; });
    var other = { g: { label: _t('More'), icon: 'M5 12h.01M12 12h.01M19 12h.01' }, items: [] };
    links.forEach(function (a) {
      var t = a.textContent.trim(); if (!t) return;
      var item = { text: RENAME[t] || t, href: a.getAttribute('href'), active: a.classList.contains('active') || location.pathname === a.pathname };
      var b = buckets.filter(function (x) { return x.g.match.test(t); }).sort(function (a, c) { return a.g.prio - c.g.prio; })[0] || other;
      b.items.push(item);
    });
    if (other.items.length) buckets.push(other);
    var nav = document.createElement('nav');
    nav.className = 'gh-catnav'; nav.setAttribute('aria-label', _t('Product categories'));
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
    p.innerHTML = '<div class="gh-promo__txt"><span class="gh-promo__tag">' + _t('New') + '</span><b>' + _t('Cloud VPS in Europe &amp; USA') + '</b><span>' + _t('NVMe, choose your OS, add RAM or vCPU any time. Ready in minutes.') + '</span></div>' +
      '<a class="gh-promo__btn" href="' + B + '/store/servers">' + _t('Explore servers') + '</a>';
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
  /* numbers for filtering: RAM (GB), CPU cores/vCPU, storage type, monthly price */
  function numeric(it) {
    var txt = (it.name + ' | ' + it.features.join(' | ')).replace(/,/g, '');
    var ram = 0, m, re = /(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:RAM|DDR\d|ECC|memory)/gi;
    while ((m = re.exec(txt))) ram = Math.max(ram, parseFloat(m[1]) * (/tb/i.test(m[2]) ? 1024 : 1));
    if (!ram) { m = txt.match(/(\d+)\s*GB\b(?!\s*(?:SSD|NVMe|HDD|SATA|SAS|disk|storage|bandwidth))/i); if (m) ram = +m[1]; }
    var cores = 0; m = txt.match(/(\d+)\s*(?:v?CPU|vCore|Core)s?\b/i) || txt.match(/(\d+)C\/\d+T/i); if (m) cores = +m[1];
    var mult = txt.match(/(\d+)x\s*(?:intel|amd|xeon|e5)/i) || txt.match(/\b(dual)\b/i); if (mult && cores && /c\/\d+t/i.test(txt) === false) cores *= (/dual/i.test(mult[1]) ? 2 : +mult[1]);
    var disk = /nvme/i.test(txt) ? 'NVMe' : /ssd/i.test(txt) ? 'SSD' : /hdd|sata|sas/i.test(txt) ? 'HDD' : '';
    it.ram = ram; it.cores = cores; it.disk = disk;
  }
  function chips(list) { return list.map(function (f) { return '<li>' + f.replace(/</g, '&lt;') + '</li>'; }).join(''); }
  var CAT_INFO = {
    'dedicated-servers': [_t('Dedicated servers'), _t('A whole physical machine for you: no neighbours, full hardware, unmetered ports.'), 'cpu'],
    'premiumdedicated-servers': [_t('Premium dedicated servers'), _t('Dual-Xeon and Ryzen flagships with up to 10Gbps ports for heavy workloads.'), 'cpu'],
    'servers': [_t('Cloud VPS – Europe & USA'), _t('Classic and high-performance KVM servers with NVMe. Choose your OS, add RAM or vCPU any time.'), 'server'],
    'hostiavps': [_t('Virtual private servers'), _t('Dedicated vCPU and RAM with full root access, ready in minutes.'), 'server'],
    'windows-vps': [_t('Windows VPS'), _t('Windows Server with administrator access for apps, RDP and .NET.'), 'monitor'],
    'forex-vps': [_t('Forex VPS'), _t('Always-on servers close to broker hubs for MetaTrader and EAs.'), 'pulse'],
    'windows-rdp': [_t('Windows RDP'), _t('A Windows desktop in the cloud you connect to from anywhere.'), 'monitor'],
    'ai-llm': [_t('AI / LLM servers'), _t('Run open models privately on servers sized for inference.'), 'cpu'],
    'hostia-shared': [_t('Web hosting'), _t('Fast NVMe hosting with free SSL, email and daily backups.'), 'layers'],
    'wordpress': [_t('WordPress hosting'), _t('Managed WordPress tuned for speed, with backups and updates.'), 'layers'],
    'ssl-certificates': [_t('SSL certificates'), _t('DV, OV and wildcard certificates from trusted authorities.'), 'shield'],
    'mcps': [_t('MCPs & automation'), _t('n8n and MCP engines on your own server.'), 'layers'],
    'project-management': [_t('Project management'), _t('One workspace for every project, without per-seat fees.'), 'invoice']
  };
  function catBanner() {
    var m = location.pathname.match(/\/store\/([^/]+)\/?$/); if (!m || document.querySelector('.gh-catbanner')) return;
    var info = CAT_INFO[m[1]];
    if (!info) { // a category without curated copy: use its name and description from the catalog
      storeLinks().then(function (d) {
        var c = (d.categories || []).filter(function (x) { return x.slug === m[1]; })[0];
        if (c && c.desc) { CAT_INFO[m[1]] = [c.name, c.desc, IC_FOR[c.icon] || 'server']; catBanner(); }
      });
      return;
    }
    var title = document.querySelector('#order-standard_cart h1, .emyui-cart-aws h1, h1.coodiv-text-4');
    if (!title) return;
    var b = document.createElement('div');
    b.className = 'gh-catbanner gh-catbanner--' + m[1];
    b.innerHTML = '<span class="gh-hex">' + svg(IC[info[2]] || IC.server) + '</span><div><h1>' + info[0] + '</h1><p>' + info[1] + '</p></div>';
    var wrapTitle = title.closest('.text-center, .col-12, div') || title;
    title.classList.add('gh-hidden');
    var eyebrow = wrapTitle.querySelector('.pre-title'); if (eyebrow) eyebrow.classList.add('gh-hidden');
    wrapTitle.insertBefore(b, wrapTitle.firstChild);
  }
  function enhanceListing() {
    // the store template prints one row (id="products") per 4 plans, so collect every row
    var rows = Array.prototype.slice.call(document.querySelectorAll('.emyui-ews-plans-row'));
    if (!rows.length) return;
    var row = rows[0];
    var items = [].concat.apply([], rows.map(parseCards));
    if (!items.length) return;
    fetch(SPECS_URL, { mode: 'cors' }).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (specs) {
      items.forEach(function (it) { var s = specs[it.slug]; it.features = s && s.features && s.features.length ? s.features : []; if (s) { it.region = it.region || s.location || ''; it.tier = it.tier || s.tier || ''; } numeric(it); });
      if (items.length <= 6) {
        items.forEach(function (it) {
          if (!it.features.length) return;
          var ul = it.el.querySelector('.emyui-ews-plans-features');
          if (ul && !ul.children.length) ul.innerHTML = chips(it.features);
        });
        rows.forEach(function (r) { r.classList.add('gh-cards'); });
        return;
      }
      buildList(row, items);
      rows.forEach(function (r) { r.classList.add('gh-hidden'); });
    });
  }
  function buildList(row, items) {
    var regions = uniq(items.map(function (i) { return i.region; }));
    var tiers = uniq(items.map(function (i) { return i.tier; }));
    var wrap = document.createElement('section');
    wrap.className = 'gh-plist';
    wrap.innerHTML =
      '<div class="gh-plist__bar">' +
        '<label class="gh-plist__search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span class="gh-sr">' + _t('Search plans') + '</span><input type="search" placeholder="' + esc(_t('Search {n} plans', { n: items.length })) + '" data-q></label>' +
        (tiers.length > 1 ? seg('tier', _t('Type'), tiers) : '') +
        (regions.length > 1 ? seg('region', _t('Location'), regions) : '') +
        selectFilter('ram', 'RAM', items.map(function (i) { return i.ram; }), function (v) { return v >= 1024 ? L10N.num(v / 1024) + ' TB+' : L10N.num(v) + ' GB+'; }) +
        selectFilter('cores', 'CPU', items.map(function (i) { return i.cores; }), function (v) { return _t('{n}+ cores', { n: v }); }) +
        (uniq(items.map(function (i) { return i.disk; })).length > 1 ? seg('disk', _t('Storage'), uniq(items.map(function (i) { return i.disk; }))) : '') +
        priceFilter(items) +
        '<label class="gh-plist__sort"><span>' + _t('Sort') + '</span><select data-sort><option value="price">' + _t('Price: low to high') + '</option><option value="-price">' + _t('Price: high to low') + '</option><option value="name">' + _t('Name') + '</option></select></label>' +
      '</div>' +
      '<p class="gh-plist__count" aria-live="polite"></p>' +
      '<div class="gh-plist__head" aria-hidden="true"><span>' + _t('Plan') + '</span><span>' + _t('Specifications') + '</span><span>' + _t('Price') + '</span><span></span></div>' +
      '<ol class="gh-plist__rows"></ol>';
    row.parentNode.insertBefore(wrap, row);
    row.classList.add('gh-hidden');
    var ol = wrap.querySelector('.gh-plist__rows'), state = { q: '', tier: '', region: '', disk: '', ram: 0, cores: 0, max: Infinity, sort: 'price' };
    function render() {
      var list = items.filter(function (i) {
        return (!state.tier || i.tier === state.tier) && (!state.region || i.region === state.region) && (!state.disk || i.disk === state.disk) &&
          (!state.ram || i.ram >= state.ram) && (!state.cores || i.cores >= state.cores) && (isNaN(i.price) || i.price <= state.max) &&
          (!state.q || (i.name + ' ' + i.features.join(' ')).toLowerCase().indexOf(state.q) > -1);
      }).sort(function (a, b) {
        if (state.sort === 'name') return a.name.localeCompare(b.name);
        var d = (isNaN(a.price) ? 1e9 : a.price) - (isNaN(b.price) ? 1e9 : b.price);
        return state.sort === '-price' ? -d : d;
      });
      wrap.querySelector('.gh-plist__count').textContent = _t('{a} of {b} plans', { a: list.length, b: items.length });
      ol.innerHTML = list.length ? list.map(function (i) {
        return '<li class="gh-prow">' +
          '<div class="gh-prow__name"><b>' + esc(i.name) + '</b><span>' + [i.tier, i.region].filter(Boolean).map(esc).join(' · ') + '</span></div>' +
          '<ul class="gh-prow__specs">' + (i.features.length ? chips(i.features.slice(0, 4)) : '<li>' + _t('See details') + '</li>') + '</ul>' +
          '<div class="gh-prow__price">' + (isNaN(i.price) ? '' : '<b>' + esc(i.cur) + i.price.toFixed(2) + '</b><span>' + esc(i.cycle) + '</span>') + (i.save ? '<em>' + esc(i.save.replace(/^with an?\s*/i, '')) + '</em>' : '') + '</div>' +
          '<div class="gh-prow__cta">' + (i.soldOut ? '<span class="gh-prow__oos">' + _t('Out of stock') + '</span>' : '<a class="gh-prow__btn" href="' + i.href + '">' + _t('Configure') + '</a>') + '</div></li>';
      }).join('') : '<li class="gh-plist__empty">' + _t('No plans match.') + ' <button type="button" data-reset>' + _t('Clear filters') + '</button></li>';
    }
    wrap.addEventListener('input', function (e) {
      if (e.target.matches('[data-q]')) { state.q = e.target.value.trim().toLowerCase(); render(); }
      if (e.target.matches('[data-max]')) { var v = +e.target.value; state.max = v >= +e.target.max ? Infinity : v; wrap.querySelector('[data-maxlbl]').textContent = state.max === Infinity ? _t('Any price') : _t('Up to {p}', { p: (items[0].cur || '$') + v }); render(); }
    });
    wrap.addEventListener('change', function (e) {
      if (e.target.matches('[data-sort]')) { state.sort = e.target.value; render(); }
      if (e.target.matches('[data-num]')) { state[e.target.getAttribute('data-num')] = +e.target.value; render(); }
    });
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-key]');
      if (b) { var k = b.getAttribute('data-key'); state[k] = b.getAttribute('data-val'); b.parentNode.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); render(); }
      if (e.target.matches('[data-reset]')) { state.q = state.tier = state.region = state.disk = ''; state.ram = state.cores = 0; state.max = Infinity; wrap.querySelectorAll('[data-num]').forEach(function (x) { x.value = '0'; }); var mx = wrap.querySelector('[data-max]'); if (mx) { mx.value = mx.max; wrap.querySelector('[data-maxlbl]').textContent = _t('Any price'); } wrap.querySelector('[data-q]').value = ''; wrap.querySelectorAll('[data-key]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-val') === '')); }); render(); }
    });
    render();
  }
  function seg(key, label, vals) {
    return '<div class="gh-plist__seg" role="group" aria-label="' + label + '"><button type="button" data-key="' + key + '" data-val="" aria-pressed="true">' + _t('All') + '</button>' +
      vals.map(function (v) { return '<button type="button" data-key="' + key + '" data-val="' + esc(v) + '" aria-pressed="false">' + esc(v) + '</button>'; }).join('') + '</div>';
  }
  function selectFilter(key, label, vals, fmt) {
    var steps = [2, 4, 8, 16, 24, 32, 48, 64, 128, 256, 512];
    var max = Math.max.apply(null, vals.filter(Boolean).concat([0]));
    var opts = steps.filter(function (x) { return x <= max && vals.some(function (v) { return v >= x; }) && vals.some(function (v) { return v && v < x; }); });
    if (!opts.length) return '';
    return '<label class="gh-plist__sel"><span>' + label + '</span><select data-num="' + key + '"><option value="0">' + _t('Any') + '</option>' + opts.map(function (x) { return '<option value="' + x + '">' + fmt(x) + '</option>'; }).join('') + '</select></label>';
  }
  function priceFilter(items) {
    var ps = items.map(function (i) { return i.price; }).filter(function (x) { return !isNaN(x); });
    if (ps.length < 5) return '';
    var lo = Math.floor(Math.min.apply(null, ps)), hi = Math.ceil(Math.max.apply(null, ps));
    if (hi - lo < 10) return '';
    var step = hi > 500 ? 10 : hi > 100 ? 5 : 1;
    return '<label class="gh-plist__price"><span data-maxlbl>' + _t('Any price') + '</span><input type="range" data-max min="' + lo + '" max="' + hi + '" step="' + step + '" value="' + hi + '" aria-label="' + esc(_t('Maximum monthly price')) + '"></label>';
  }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- client-area home: replace the long marketing page with a focused customer hub ---------- */
  var IC = {
    cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6.2M10 20h.01M17 20h.01',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
    move: 'M7 7h11l-3-3M17 17H6l3 3',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    chat: 'M4 5h16v11H8l-4 4z',
    book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
    pulse: 'M3 12h4l3-7 4 14 3-7h4',
    server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
    cpu: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'
  };
  function homepage() {
    var path = location.pathname.replace(/\/+$/, '');
    if (!/^(\/secure)?(\/index\.php)?$/.test(path) || /[?&](rp|m)=/.test(location.search)) return;
    var hero = document.querySelector('.hero-area-header-banner-image');
    var body = document.querySelector('#not-main-body, section#main-body');
    if (!hero || !body) return;
    var loggedIn = !!document.querySelector('a[href*="logout"]');
    var nameEl = document.querySelector('.client-name, .dropdown-toggle .username, [class*="hello"]');
    var tlds = Array.prototype.slice.call(document.querySelectorAll('.domain-checker-emyui-aws-homepage *')).map(function (e) { return e.children.length ? '' : e.textContent.trim(); }).join(' ');
    var prices = []; tlds.replace(/\.\s*([a-z]{2,10})\s+(\$[0-9.]+)/gi, function (_, t, p) { if (prices.length < 6) prices.push({ t: '.' + t, p: p }); });
    var tile = function (ic, title, text, href) { return '<a class="gh-tile" href="' + href + '"><span class="gh-hex">' + svg(IC[ic]) + '</span><b>' + title + '</b><span>' + text + '</span></a>'; };
    var cats = [
      ['server', _t('Web Hosting'), _t('NVMe hosting with free SSL'), B + '/store/hostia-shared'],
      ['layers', 'WordPress', _t('Managed, fast and secure'), B + '/store/wordpress'],
      ['server', 'Cloud VPS', _t('Europe & USA, ready in minutes'), B + '/store/servers'],
      ['cpu', _t('Dedicated Servers'), _t('Bare metal up to 10Gbps'), B + '/store/dedicated-servers'],
      ['monitor', 'Windows RDP', _t('Always-on remote desktop'), B + '/store/windows-rdp'],
      ['shield', _t('SSL Certificates'), _t('DV, OV and wildcard'), B + '/store/ssl-certificates']
    ];
    hero.outerHTML =
      '<section class="gh-hub">' +
        '<div class="gh-hub__in">' +
          '<span class="gh-hub__eyebrow">' + (loggedIn ? _t('Welcome back') : _t('GlobalHostia client area')) + '</span>' +
          '<h1>' + (loggedIn ? _t('What would you like to do today?') : _t('Everything for your website, in one place.')) + '</h1>' +
          '<p>' + _t('Find a domain, order hosting or servers, pay invoices and get help from our team.') + '</p>' +
          '<form class="gh-hub__search" action="' + B + '/cart.php" method="get" role="search">' +
            '<input type="hidden" name="a" value="add"><input type="hidden" name="domain" value="register">' +
            '<label class="gh-sr" for="gh-hub-q">' + _t('Domain name') + '</label>' +
            '<span class="gh-hub__ic">' + svg(IC.globe) + '</span><input id="gh-hub-q" name="query" placeholder="' + esc(_t('Find your perfect domain, e.g. yourbrand.com')) + '" autocomplete="off" required dir="auto">' +
            '<button type="submit">' + _t('Search') + '</button></form>' +
          (prices.length ? '<ul class="gh-hub__tlds">' + prices.map(function (x) { return '<li><b>' + esc(x.t) + '</b> ' + esc(x.p) + '</li>'; }).join('') + '</ul>' : '') +
        '</div></section>';
    var dc = document.querySelector('.domain-checker-emyui-aws-homepage'); if (dc) dc.classList.add('gh-hidden');
    body.innerHTML =
      '<div class="gh-hub-body">' +
        '<div class="gh-tiles">' +
          (loggedIn ? tile('user', _t('My services'), _t('Manage products and servers'), B + '/clientarea.php?action=services') + tile('invoice', _t('Billing'), _t('Invoices and payments'), B + '/clientarea.php?action=invoices')
                    : tile('user', _t('Sign in'), _t('Access your account'), B + '/login.php') + tile('cart', _t('Create account'), _t('Get started in a minute'), B + '/register.php')) +
          tile('globe', _t('Register a domain'), _t('Search hundreds of extensions'), B + '/cart.php?a=add&domain=register') +
          tile('move', _t('Transfer a domain'), _t('Move it to us, keep your site'), B + '/cart.php?a=add&domain=transfer') +
          tile('chat', _t('Open a ticket'), _t('24/7 help from engineers'), B + '/submitticket.php') +
          tile('book', _t('Knowledgebase'), _t('Guides and how-tos'), B + '/knowledgebase') +
        '</div>' +
        '<div class="gh-sec-head"><h2>' + _t('Order new services') + '</h2><a href="' + B + '/cart.php">' + _t('Browse all') + '</a></div>' +
        '<div class="gh-cats">' + cats.map(function (c) { return '<a class="gh-cat" href="' + c[3] + '"><span class="gh-hex">' + svg(IC[c[0]]) + '</span><b>' + c[1] + '</b><span>' + c[2] + '</span><i aria-hidden="true">' + (L10N.rtl ? '←' : '→') + '</i></a>'; }).join('') + '</div>' +
        '<aside class="gh-promo gh-promo--wide"><div class="gh-promo__txt"><span class="gh-promo__tag">' + _t('New') + '</span><b>' + _t('Cloud VPS in Europe &amp; USA') + '</b><span>' + _t('NVMe, your choice of OS, add RAM or vCPU any time. Set up automatically after payment.') + '</span></div><a class="gh-promo__btn" href="' + B + '/store/servers">' + _t('See plans') + '</a></aside>' +
        '<div class="gh-help"><div><b>' + _t('Need a hand?') + '</b><span>' + _t('Our team is available 24/7 by ticket, phone and WhatsApp.') + '</span></div><div class="gh-help__a"><a href="' + B + '/submitticket.php">' + _t('Open a ticket') + '</a><a href="' + B + '/serverstatus.php">' + _t('Network status') + '</a><a href="' + B + '/contact.php">' + _t('Contact us') + '</a></div></div>' +
      '</div>';
    document.documentElement.classList.add('gh-is-home');
    // order tiles follow the catalog: categories with products, in admin order (the list above is the offline fallback)
    storeLinks().then(function (d) {
      var list = (d.categories || []).slice(0, 6), box = document.querySelector('.gh-cats');
      if (!box || list.length < 3) return;
      box.innerHTML = list.map(function (c) { return '<a class="gh-cat" href="' + B + '/store/' + encodeURIComponent(c.slug) + '"><span class="gh-hex">' + svg(IC[IC_FOR[c.icon]] || IC.server) + '</span><b>' + esc(c.name) + '</b><span>' + esc(c.desc ? c.desc.split(/[.:;]/)[0].slice(0, 48) : _tp(c.products, '{n} plan', '{n} plans')) + '</span><i aria-hidden="true">' + (L10N.rtl ? '←' : '→') + '</i></a>'; }).join('');
    });
  }

  /* ---------- order flow ---------- */
  function domainStep() {
    var f = document.getElementById('frmProductDomain'); if (!f) return;
    document.documentElement.classList.add('gh-domstep');
    var h = document.querySelector('.emyui-cart-aws h1'); if (h && /requires a domain/i.test(h.textContent)) h.textContent = _t('Pick a domain for your plan');
    var sub = h && h.parentElement.querySelector('p'); if (sub) sub.textContent = _t('Register a new name, transfer one you own, or simply point a domain you already have to us.');
    var pre = h && h.parentElement.querySelector('.pre-title, span'); if (pre && /choose a domain/i.test(pre.textContent)) pre.textContent = _t('Step 1 · Domain');
    var L = { selregister: [_t('Register a new domain'), _t('Search and buy a new name')], seltransfer: [_t('Transfer a domain'), _t('Move a domain you own to us')], selowndomain: [_t('I already have a domain'), _t('Keep it where it is, update nameservers')] };
    Object.keys(L).forEach(function (id) {
      var r = document.getElementById(id); if (!r) return;
      var card = r.closest('.domain-productconfigiration-options-item'); if (!card) return;
      var t = card.querySelector('.title'), st = card.querySelector('.sub-title');
      if (t) t.textContent = L[id][0]; if (st) st.textContent = L[id][1];
    });
    var sync = function () { f.querySelectorAll('.domain-productconfigiration-options-item').forEach(function (c) { var i = c.querySelector('input[type=radio]'); c.classList.toggle('gh-on', !!(i && i.checked)); }); };
    sync(); f.addEventListener('click', function () { setTimeout(sync, 30); });
    if (window.jQuery) jQuery(f).on('ifChecked change', 'input[type=radio]', sync);
  }

  var MONTHS = { monthly: 1, quarterly: 3, semiannually: 6, annually: 12, biennially: 24, triennially: 36 };
  var CYCLE_NAME = { monthly: _t('Monthly'), quarterly: _t('3 months'), semiannually: _t('6 months'), annually: _t('1 year'), biennially: _t('2 years'), triennially: _t('3 years') };
  function cycles(spec) {
    var sel = document.getElementById('inputBillingcycle'); if (!sel || sel.dataset.gh) return;
    sel.dataset.gh = 1;
    var opts = [].slice.call(sel.options); if (opts.length < 2) return;
    var hdr = document.querySelector('.site-header, header'); var hm = hdr && hdr.textContent.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/);
    var cur = ((opts[0].text.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/) || [])[1]) || (hm && hm[1]) || 'USD';
    var tbl = spec && spec.prices && spec.prices[cur];
    var SYM = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    var fmt = function (n) { return SYM[cur] ? SYM[cur] + n.toFixed(2) : cur + ' ' + n.toFixed(2); };
    var parse = function (o) { var m = o.text.match(/^(.*?)\s*-\s*(.+)$/); return { k: o.value, label: CYCLE_NAME[o.value] || (m ? m[1].replace(/\s*Price$/i, '') : o.text), raw: m ? m[2] : '' }; };
    var list = opts.map(parse), mon = tbl && tbl.monthly;
    var host = sel.closest('.form-group') || sel.parentElement;
    var wrap = document.createElement('div'); wrap.className = 'gh-cycles'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', _t('Billing cycle'));
    var bestSave = 0, cards = list.map(function (o) {
      var total = tbl && tbl[o.k], m = MONTHS[o.k] || 0, save = (total && mon && m > 1) ? Math.round((1 - total / (mon * m)) * 100) : 0;
      if (save > bestSave) bestSave = save;
      return { o: o, total: total, m: m, save: save };
    });
    wrap.innerHTML = cards.map(function (c) {
      var body = c.total != null && c.m
        ? '<span>' + esc(fmt(c.total / c.m)) + '<small>' + _t('/mo') + '</small></span><i>' + (c.m > 1 ? esc(_t('Billed {p} every {cycle}', { p: fmt(c.total), cycle: c.o.label })) : _t('Billed monthly, cancel any time')) + '</i>'
        : '<span>' + esc(c.o.raw) + '</span>';
      return '<button type="button" class="gh-cycle" data-k="' + esc(c.o.k) + '" aria-pressed="' + (sel.value === c.o.k) + '"><b>' + esc(c.o.label) + '</b>' + body + (c.save >= 3 ? '<em' + (c.save === bestSave ? ' class="is-best"' : '') + '>' + _t('Save {pct}', { pct: c.save + '%' }) + '</em>' : '') + '</button>';
    }).join('');
    var head = document.createElement('div'); head.className = 'gh-cfg-label'; head.innerHTML = '<b>' + _t('Choose your billing period') + '</b>' + (bestSave ? '<span>' + _t('Save up to {pct} with a longer term', { pct: bestSave + '%' }) + '</span>' : '');
    var lbl = host.querySelector('label'); if (lbl) lbl.style.display = 'none';
    host.insertBefore(wrap, host.firstChild); host.insertBefore(head, wrap);
    var nice = host.querySelector('.nice-select'); if (nice) nice.style.display = 'none';
    sel.classList.add('gh-cycle-src');
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.gh-cycle'); if (!b) return;
      sel.value = b.dataset.k;
      wrap.querySelectorAll('.gh-cycle').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      if (window.jQuery) jQuery(sel).trigger('change'); else sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function configure() {
    var form = document.getElementById('frmConfigureProduct'); if (!form) return;
    var t = form.querySelector('.product-title'), name = t ? t.textContent.trim() : '';
    fetch(ORIGIN + '/api/store/specs?h=' + Math.floor(Date.now() / 6e5)).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (all) {
      var spec = null; for (var k in all) if (all[k].name && all[k].name.toLowerCase() === name.toLowerCase()) { spec = all[k]; break; }
      try { cycles(spec); } catch (e) {}
      var info = form.querySelector('.product-info'); if (!info || info.dataset.gh) return; info.dataset.gh = 1;
      var meta = [spec && spec.location && _t('Hosted in {place}', { place: spec.location }), spec && spec.tier].filter(Boolean);
      var top = document.createElement('div'); top.className = 'gh-cfg-top';
      top.innerHTML = (meta.length ? '<div class="gh-cfg-meta">' + meta.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>' : '') +
        (spec && spec.tagline ? '<p class="gh-cfg-tag">' + esc(spec.tagline) + '</p>' : '');
      if (t) t.after(top);
      var have = (info.textContent || '').toLowerCase(); var specCount = info.querySelectorAll('.list-info, li').length; var feats = specCount >= 3 ? [] : (spec && spec.allFeatures || []).filter(function (f) { return f.length > 3 && have.indexOf(f.toLowerCase()) < 0; });
      if (feats.length) {
        var d = document.createElement('div'); d.className = 'gh-cfg-feats';
        d.innerHTML = '<b>' + _t('Everything included') + '</b><ul>' + feats.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>';
        info.appendChild(d);
      }
      var trust = document.createElement('ul'); trust.className = 'gh-cfg-trust';
      trust.innerHTML = '<li>' + _t('Set up automatically after payment') + '</li><li>' + _t('24/7 support by ticket and WhatsApp') + '</li><li>' + _t('Upgrade or add resources any time') + '</li>';
      info.appendChild(trust);
    });
  }

  function cartView() {
    if (!/cart\.php/.test(location.pathname) || !/a=view/.test(location.search) || document.getElementById('frmCheckout')) return;
    var f = document.getElementById('frmEstimateTaxes') || (document.querySelector('#inputState, select[name=country]') || {}).form;
    if (f && f.id !== 'frmCheckout' && !f.closest('details')) {
      var box = f.closest('.estimate-taxes, .bg-default-2, .card, .panel') || f, d = document.createElement('details'); d.className = 'gh-taxes';
      d.innerHTML = '<summary>' + _t('Estimate taxes') + '</summary>'; box.parentNode.insertBefore(d, box); d.appendChild(box);
      var t = box.querySelector('h1,h2,h3,h4,.title'); if (t && /estimate taxes/i.test(t.textContent)) t.style.display = 'none';
    }
  }

  function checkout() {
    var form = document.getElementById('frmCheckout'); if (!form || form.dataset.gh || !/cart\.php/.test(location.pathname) || !/a=checkout/.test(location.search)) return; form.dataset.gh = 1;
    var grid = document.createElement('div'); grid.className = 'gh-co';
    var aside = document.createElement('aside'); aside.className = 'gh-co__aside'; aside.innerHTML = '<div class="gh-co__card"><h3>' + _t('Your order') + '</h3><div class="gh-co__sum">' + _t('Loading summary…') + '</div><ul class="gh-co__trust"><li>' + _t('Secure, encrypted checkout') + '</li><li>' + _t('Set up automatically after payment') + '</li><li>' + _t('24/7 support by ticket and WhatsApp') + '</li></ul></div>';
    form.parentNode.insertBefore(grid, form); grid.appendChild(form); grid.appendChild(aside);
    fetch(B + '/cart.php?a=view', { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html'), sum = doc.getElementById('orderSummary'), items = [];
      doc.querySelectorAll('.view-cart-items .item, .secondary-cart-body .item').forEach(function (it) {
        var n = it.querySelector('.item-title, .item-group, strong, h3, h4'); var dmn = it.querySelector('.item-domain'); var p = it.querySelector('.item-price span, .item-price, .price');
        if (n) items.push('<li><b>' + esc(n.textContent.trim()) + '</b>' + (dmn ? '<span>' + esc(dmn.textContent.trim()) + '</span>' : '') + (p ? '<i>' + esc(p.textContent.trim().split('\n')[0]) + '</i>' : '') + '</li>');
      });
      var box = aside.querySelector('.gh-co__sum');
      if (sum) { sum.querySelectorAll('script, .btn, a.btn, #checkout, form').forEach(function (x) { x.remove(); }); var hh = sum.querySelector('h2, .summary-header'); if (hh) hh.remove(); box.innerHTML = (items.length ? '<ul class="gh-co__items">' + items.join('') + '</ul>' : '') + sum.innerHTML; }
      else box.textContent = '';
    }).catch(function () { aside.querySelector('.gh-co__sum').textContent = ''; });
  }

  function storeMega() {
    var li = document.getElementById('Primary_Navbar-Store'); if (!li) return;
    var ul = li.querySelector('ul.dropdown-menu'); if (!ul || ul.dataset.gh) return; ul.dataset.gh = 1;
    var links = [].slice.call(ul.querySelectorAll('a.dropdown-item')).map(function (a) { return { t: a.textContent.trim(), h: a.getAttribute('href') }; });
    var all = links.filter(function (l) { return /browse/i.test(l.t); })[0];
    var cols = [
      { label: _t('Hosting'), d: _t('Websites, WordPress & AI'), icon: GROUPS[0].icon, m: /website|wordpress|shared|hosting/i },
      { label: _t('VPS & Cloud'), d: _t('Root access, NVMe, any OS'), icon: GROUPS[1].icon, m: /vps|virtual|^servers$|cloud|forex/i },
      { label: _t('Dedicated & RDP'), d: _t('Bare metal and remote desktops'), icon: GROUPS[2].icon, m: /dedicated|\brdp\b|remote/i },
      { label: _t('Security & Apps'), d: _t('SSL, MCPs and tools'), icon: GROUPS[4].icon, m: /ssl|mcp|project|management|n8n|email|workspace/i },
      { label: _t('Domains'), d: _t('Register or transfer'), icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', m: /domain/i }
    ];
    cols.forEach(function (c) { c.items = []; });
    var order = [4, 2, 3, 1, 0];
    links.forEach(function (l) { if (l === all) return; for (var i = 0; i < order.length; i++) { var c = cols[order[i]]; if (c.m.test(l.t)) { c.items.push(l); return; } } cols[3].items.push(l); });
    var nice = function (t) { return RENAME[t] || t.replace(/^Ai\/llm/i, 'AI / LLM').replace(/^AI\/LLM/, 'AI / LLM'); };
    ul.classList.add('gh-mega');
    ul.innerHTML = '<li class="gh-mega__in"><div class="gh-mega__cols">' + cols.filter(function (c) { return c.items.length; }).map(function (c) {
      return '<div class="gh-mega__col"><div class="gh-mega__head"><span class="gh-hex">' + svg(c.icon) + '</span><div><b>' + c.label + '</b><small>' + c.d + '</small></div></div><ul>' +
        c.items.map(function (l) { return '<li><a href="' + esc(l.h) + '">' + esc(nice(l.t)) + '</a></li>'; }).join('') + '</ul></div>';
    }).join('') + '</div><div class="gh-mega__foot"><span>' + _t('Not sure what you need? Our engineers help you choose, 24/7.') + '</span>' +
      (all ? '<a class="gh-mega__all" href="' + esc(all.h) + '">' + _t('Browse all products →') + '</a>' : '') + '</div></li>';
  }

  function compare() {
    if (!document.querySelector('#DomainSearchResults, #spotlightTlds, .domain-suggestion')) return;
    var pageCur = ((document.body.innerText.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/) || [])[1]) || 'USD';
    var curSel = document.querySelector('.currency-selector, [class*="currency"]'); if (curSel) { var mm = curSel.textContent.match(/\b([A-Z]{3})\b/); if (mm) pageCur = mm[1]; }
    fetch(ORIGIN + '/api/store/tlds?currency=' + pageCur).then(function (r) { return r.json(); }).then(function (d) {
      var items = d.items || {};
      var cc = d.currency || 'USD', sym = { USD: '$', EUR: '€', GBP: '£', INR: '₹' }[cc]; var fmt = function (n) { return sym ? sym + n.toFixed(2) : cc + ' ' + n.toFixed(2); };
      var badge = function (tld) {
        var it = items[tld]; if (!it || !it.ref || !it.renew) return '';
        var save = Math.round((1 - it.renew / it.ref.renew) * 100);
        if (save < 5) return '<span class="gh-cmp gh-cmp--plain">' + _t('Renews {p}/yr', { p: fmt(it.renew) }) + '</span>';
        return '<span class="gh-cmp" title="' + esc(_t('Typical renewal price at major registrars, checked {date}', { date: d.compareChecked })) + '">' + _t('Renews {p}/yr', { p: fmt(it.renew) }) + ' <s>' + _t('Others {p}', { p: fmt(it.ref.renew) }) + '</s> <b>' + _t('Save {pct}', { pct: save + '%' }) + '</b></span>';
      };
      var run = function () {
        document.querySelectorAll('.domain-suggestion').forEach(function (row) {
          if (row.dataset.ghc) return; var ext = row.querySelector('.extension'); if (!ext || !ext.textContent.trim()) return;
          row.dataset.ghc = 1; var b = badge(ext.textContent.trim().toLowerCase()); if (b) { var dm = document.createElement('span'); dm.className = 'gh-cmp-wrap'; dm.innerHTML = b; ext.after(dm); }
        });
        document.querySelectorAll('.spotlight-tld').forEach(function (c) {
          if (c.dataset.ghc) return; var n = c.querySelector('.spotlight-tld-name'); if (!n) return;
          c.dataset.ghc = 1; var b = badge(n.textContent.trim().toLowerCase()); if (b) c.insertAdjacentHTML('beforeend', b.replace('gh-cmp', 'gh-cmp gh-cmp--card'));
        });
      };
      run(); new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 150); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
    }).catch(function () {});
  }

  function suggestPager() {
    var TOP = ['.com', '.ae', '.net', '.co', '.io', '.ai', '.org', '.online', '.store', '.shop', '.tech', '.app', '.dev', '.cloud', '.site', '.xyz', '.info', '.biz', '.in', '.uk', '.co.uk', '.us', '.eu', '.de', '.live'];
    var STEP = 8;
    var run = function () {
      var box = document.getElementById('domainSuggestions'); if (!box) return;
      var rows = [].slice.call(box.querySelectorAll('.domain-suggestion.clone')).filter(function (r) { return r.querySelector('.extension') && r.querySelector('.extension').textContent.trim(); });
      if (!rows.length) return;
      rows.forEach(function (r) { if (!/block/.test(r.style.display)) r.style.display = 'block'; });
      // drop duplicates: same full domain twice, the searched domain itself, and exact-name TLDs already shown as cards above
      var seen = {}, spot = {}, pq = ((document.querySelector('#primaryIndividualResult [data-domain], #primaryLookupResult [data-domain]') || { getAttribute: function () { return ''; } }).getAttribute('data-domain') || '').toLowerCase();
      document.querySelectorAll('.spotlight-tld-name').forEach(function (n) { spot[n.textContent.trim().toLowerCase()] = 1; });
      var qn = pq.split('.')[0];
      rows = rows.filter(function (r) {
        var d = ((r.querySelector('.domain') || {}).textContent || '').trim().toLowerCase(), e = r.querySelector('.extension').textContent.trim().toLowerCase(), full = d + e;
        var dup = seen[full] || full === pq || (d === qn && spot[e]);
        seen[full] = 1; r.classList.toggle('gh-dup', !!dup); return !dup;
      });
      if (!rows.length) return;
      var sig = rows.length + ':' + (box.dataset.ghshow || STEP); if (box.dataset.ghsig === sig) return; box.dataset.ghsig = sig;
      var q = ((document.querySelector('#primaryIndividualResult [data-domain], #primaryLookupResult [data-domain]') || {}).getAttribute ? document.querySelector('#primaryIndividualResult [data-domain], #primaryLookupResult [data-domain]').getAttribute('data-domain') : '').split('.')[0].toLowerCase();
      var rank = function (r) { var t = r.querySelector('.extension').textContent.trim().toLowerCase(), i = TOP.indexOf(t), d = (r.querySelector('.domain') || {}).textContent; return (i < 0 ? 100 : i) + (q && d && d.trim().toLowerCase() !== q ? 200 : 0); };
      var parent = rows[0].parentNode;
      rows.sort(function (a, b) { return rank(a) - rank(b); }).forEach(function (r) { parent.appendChild(r); });
      var shown = +(box.dataset.ghshow || STEP);
      rows.forEach(function (r, i) { r.classList.toggle('gh-more-hide', i >= shown); r.classList.toggle('gh-rec', i === 0); });
      var first = rows[0];
      if (first && !first.querySelector('.gh-rec-tag')) { box.querySelectorAll('.gh-rec-tag').forEach(function (x) { x.remove(); }); first.insertAdjacentHTML('afterbegin', '<span class="gh-rec-tag">' + _t('Recommended') + '</span>'); }
      var native = document.querySelector('#btnMoreSuggestions, .more-suggestions, [id*="MoreSuggestions"]');
      if (native) native.classList.add('gh-hidden');
      var btn = box.parentNode.querySelector('.gh-more');
      if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'gh-more'; box.after(btn);
        btn.addEventListener('click', function () {
          box.dataset.ghshow = (+(box.dataset.ghshow || STEP)) + STEP;
          box.dataset.ghsig = ''; setTimeout(run, 60);
        }); }
      var left = rows.length - shown;
      btn.hidden = left <= 0;
      btn.textContent = _t('Show {n} more extensions ({left} left)', { n: Math.min(STEP, left), left: left });
    };
    new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 120); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  function domainPage() {
    var hero = document.querySelector('.domain-registiration-hero'); if (!hero) return;
    var h = hero.querySelector('h1'); if (h && /find your new domain/i.test(h.textContent)) { h.textContent = _t('Find the perfect domain'); var p = h.parentElement.querySelector('p'); if (p) p.textContent = _t('Search any name and we show what is free, across 300+ extensions, with honest renewal prices.'); }
    if (h && /transfer/i.test(h.textContent) && h.textContent.length > 60) { h.textContent = _t('Transfer your domain to us'); }
    document.querySelectorAll('h1,h2,h3').forEach(function (x) { if (/generating suggestions for you/i.test(x.textContent)) x.textContent = _t('More extensions for your name'); });
    var fill = function () {
      var r = document.getElementById('primaryIndividualResult'); if (!r || r.dataset.gh) return;
      var b = r.querySelector('[data-domain]'); if (!b) return;
      var avail = r.classList.contains('domain-available');
      var p = r.querySelector('p'); if (p && /click on the link below/i.test(p.textContent)) p.style.display = 'none';
      var hd = document.createElement('div'); hd.className = 'gh-avail'; hd.innerHTML = '<bdi dir="ltr">' + esc(b.getAttribute('data-domain')) + '</bdi>' + (avail ? '<small>' + _t('Available — register it before someone else does') + '</small>' : '');
      r.insertBefore(hd, r.firstChild); r.dataset.gh = 1;
    };
    new MutationObserver(function () { clearTimeout(fill.t); fill.t = setTimeout(fill, 120); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  function promos() {
    if (document.querySelector('script[src*="/hp/promo.js"]')) return;
    var sc = document.createElement('script'); sc.src = ORIGIN + '/hp/promo.js'; sc.defer = true; sc.setAttribute('data-surface', 'clientarea'); document.body.appendChild(sc);
  }
  function blogHub() {
    var body = document.querySelector('.gh-hub-body'); if (!body) return;
    fetch(ORIGIN + '/api/blog/latest?limit=3').then(function (r) { return r.json(); }).then(function (posts) {
      if (!posts || !posts.length) return;
      var html = '<div class="gh-sec-head"><h2>' + _t('From our blog') + '</h2><a href="' + ORIGIN + '/blog">' + _t('All articles') + '</a></div><div class="gh-blog">' + posts.map(function (p) {
        return '<a class="gh-post" href="' + esc(p.url) + '">' + (p.coverImage ? '<img src="' + esc(p.coverImage) + '" alt="" loading="lazy">' : '') + '<div><span>' + esc(p.category || _t('Guide')) + ' · ' + _t('{n} min read', { n: p.readingMinutes || 3 }) + '</span><b>' + esc(p.title) + '</b><p>' + esc(p.excerpt || '') + '</p></div></a>';
      }).join('') + '</div>';
      var help = body.querySelector('.gh-help'); var box = document.createElement('section'); box.innerHTML = html;
      body.insertBefore(box, help || null);
    }).catch(function () {});
  }

  function whatsapp() {
    if (document.querySelector('.gh-wa')) return;
    var a = document.createElement('a'); a.className = 'gh-wa'; a.target = '_blank'; a.rel = 'noopener';
    a.href = 'https://wa.me/971507341578?text=' + encodeURIComponent(_t('Hi GlobalHostia, I need help with: {page}', { page: document.title }).replace(/[\u2066-\u2069]/g, ''));
    a.setAttribute('aria-label', _t('Chat with us on WhatsApp'));
    a.innerHTML = '<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.3 14.3 0 0 0 5.5 4.8c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.6-.4z"/></svg><span>WhatsApp</span>';
    document.body.appendChild(a);
  }

  function clientFixes() {
    // domains table: the template labels the auto-renew column "Next Due Date" twice
    var dt = document.getElementById('tableDomainsList');
    if (dt) { var ths = dt.querySelectorAll('thead th'), seen = 0; ths.forEach(function (th) { if (/next due date/i.test(th.textContent)) { seen++; if (seen === 2) th.textContent = _t('Auto renew'); } }); }
    // friendly empty states
    document.querySelectorAll('.dataTables_empty').forEach(function (td) {
      if (td.dataset.gh) return; td.dataset.gh = 1;
      var tickets = /supporttickets/.test(location.pathname);
      var services = /action=services/.test(location.search), domains = /action=domains/.test(location.search), inv = /action=invoices/.test(location.search);
      var cta = tickets ? [_t('Open a ticket'), B + '/submitticket.php', _t('No tickets yet. Our engineers reply 24/7 by ticket and WhatsApp.')]
        : services ? [_t('Browse plans'), B + '/cart.php', _t('You have no services yet.')]
        : domains ? [_t('Find a domain'), B + '/cart.php?a=add&domain=register', _t('You have no domains yet.')]
        : inv ? ['', '', _t('No invoices here.')] : null;
      if (cta) td.innerHTML = '<div class="gh-empty"><b>' + esc(cta[2]) + '</b>' + (cta[0] ? '<a class="btn btn-primary" href="' + cta[1] + '">' + esc(cta[0]) + '</a>' : '') + '</div>';
    });
  }

  function connectLinks() {
    var SITE = 'https://globalhostia.com';
    var path = location.pathname, q = location.search;
    var loggedIn = !!document.querySelector('a[href*="logout"]');
    // standalone sign-in page → the new account portal (the cart's own "Already registered?" login stays)
    if (!loggedIn && /^(\/secure)?\/(login(\.php)?|clientarea\.php)$/.test(path) && !/cart/.test(document.referrer || '') && !/[?&](goto|redirect)=/.test(q)) {
      location.replace(SITE + '/account/login'); return;
    }
    var MAP = [
      [/clientarea\.php$/, '', SITE + '/account'],
      [/clientarea\.php$/, 'action=services', SITE + '/account/services'],
      [/clientarea\.php$/, 'action=domains', SITE + '/account/domains'],
      [/clientarea\.php$/, 'action=invoices', SITE + '/account/invoices'],
      [/supporttickets\.php$/, '', SITE + '/account/support'],
      [/clientarea\.php$/, 'action=details', SITE + '/account/profile'],
    ];
    document.querySelectorAll('header a[href], .site-header a[href], .footer-emyui-aws a[href]').forEach(function (a) {
      var h = a.getAttribute('href') || ''; if (!h || h.charAt(0) === '#' || /^javascript/i.test(h)) return;
      var u; try { u = new URL(h, location.href); } catch (e) { return; }
      if (u.host !== location.host) return;
      var txt = a.textContent.trim().toLowerCase();
      if (/^(\/secure)?\/(index\.php)?$/.test(u.pathname) && (txt === 'home' || a.closest('.brand-logo, .site-brand, .navbar-brand, [class*="logo"]'))) { a.href = loggedIn ? SITE + '/account' : SITE + '/'; return; }
      if (/contact\.php$/.test(u.pathname)) { a.href = SITE + '/contact'; return; }
      if (/(\/login(\.php)?)$/.test(u.pathname)) { a.href = SITE + '/account/login'; return; }
      for (var i = 0; i < MAP.length; i++) {
        var m = MAP[i]; if (m[0].test(u.pathname) && (u.search.replace(/^\?/, '') === m[1])) { a.href = m[2]; return; }
      }
    });
    // logged-in WHMCS dashboard → the new dashboard
    if (loggedIn && /clientarea\.php$/.test(path) && !q) {
      var bar = document.createElement('div'); bar.className = 'gh-newportal';
      bar.innerHTML = '<span>' + _t('Your account has a new home.') + '</span><a href="' + SITE + '/account">' + _t('Open the new dashboard →') + '</a>';
      document.body.insertBefore(bar, document.body.firstChild);
    }
  }

  /* live store data (offers + categories) from the catalog, fetched once per page */
  var linksP;
  function storeLinks() {
    if (!linksP) linksP = fetch(ORIGIN + '/api/store/links?h=' + Math.floor(Date.now() / 6e5)).then(function (r) { return r.json(); }).catch(function () { return { offers: {}, categories: [] }; });
    return linksP;
  }
  var IC_FOR = { globe: 'globe', wp: 'layers', users: 'user', server: 'server', cpu: 'cpu', monitor: 'monitor', chart: 'pulse', flow: 'layers', spark: 'cpu', lock: 'shield', mail: 'chat', at: 'globe', grid: 'invoice', box: 'layers' };

  function cartOffers() {
    if (!/cart\.php/.test(location.pathname) || !/a=view/.test(location.search)) return;
    var items = [].slice.call(document.querySelectorAll('.secondary-cart-body .item, .view-cart-items .item, .emyui-cart-aws .row'));
    var text = (document.querySelector('.secondary-cart-body') || document.body).innerText.toLowerCase();
    var hdr = document.querySelector('.site-header, header'); var hm = hdr && hdr.textContent.match(/\b(USD|AED|INR|GBP|EUR|SAR|CAD|AUD|SGD|MYR)\b/); var cur = hm ? hm[1] : 'USD';
    var SYM = { USD: '$', EUR: '€', GBP: '£', INR: '₹' }; var fmt = function (n) { return SYM[cur] ? SYM[cur] + n.toFixed(2) : cur + ' ' + n.toFixed(2); };
    var hasHosting = /hostia|hosting|wordpress|vps|server|rdp/.test(text), hasDomain = /domain registration|domain transfer/.test(text), hasSsl = /ssl/.test(text);
    // offers come from the catalog (Admin → Site links → cart offers, else the cheapest SSL / hosting plan): no pids here
    storeLinks().then(function (d) {
      var pick = function (p) { return p && p.pid && p.prices && p.prices[cur] ? p : null; };
      var price = function (p) { var t = p.prices[cur]; return t.monthly != null ? fmt(t.monthly) + '/mo' : t.annually != null ? fmt(t.annually) + '/yr' : ''; };
      var offers = [];
      var ssl = pick(d.offers && d.offers.ssl);
      if (hasHosting && !hasSsl && ssl) offers.push({ t: _t('Add a trusted SSL certificate'), d: _t('Green padlock and the business trust boost for checkout pages.'), p: price(ssl), h: B + '/cart.php?a=add&pid=' + ssl.pid, tag: _t('Security') });
      var lite = pick(d.offers && d.offers.hosting);
      if (hasDomain && !hasHosting && lite) offers.push({ t: _t('Add website hosting'), d: _t('Put your new domain online today: NVMe hosting, free SSL and email included.'), p: price(lite), h: B + '/cart.php?a=add&pid=' + lite.pid, tag: _t('Bundle') });
      if (hasHosting && !hasDomain) offers.push({ t: _t('Add a matching domain'), d: _t('Register your name alongside the plan, we connect everything automatically.'), p: '', h: B + '/cart.php?a=add&domain=register', tag: _t('Bundle') });
      if (/monthly/.test(text)) offers.push({ t: _t('Switch to yearly and save'), d: _t('Longer terms cost less per month and lock your price. Edit the item and pick 1, 2 or 3 years.'), p: '', h: '', tag: _t('Save'), edit: true });
      if (!offers.length) return;
      var box = document.createElement('section'); box.className = 'gh-offers';
      box.innerHTML = '<h3>' + _t('Complete your setup') + '</h3><div class="gh-offers__grid">' + offers.map(function (o) {
        return '<div class="gh-offer"><span class="gh-offer__tag">' + esc(o.tag) + '</span><b>' + esc(o.t) + '</b><p>' + esc(o.d) + '</p><div class="gh-offer__foot">' + (o.p ? '<span>' + esc(o.p) + '</span>' : '<span></span>') +
          (o.edit ? '<a class="gh-offer__btn" href="#" data-edit>' + _t('Edit billing') + '</a>' : '<a class="gh-offer__btn" href="' + esc(o.h) + '">' + (o.p ? esc(_t('Add for {p}', { p: o.p })) : _t('Add')) + '</a>') + '</div></div>';
      }).join('') + '</div>';
      var anchor = document.querySelector('.secondary-cart-body .empty-cart, #btnEmptyCart, .secondary-cart-body > .row:last-child') || document.querySelector('.secondary-cart-body');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
      var ed = box.querySelector('[data-edit]'); if (ed) ed.addEventListener('click', function (e) { e.preventDefault(); var a = document.querySelector('a[href*="a=confproduct"]'); if (a) location.href = a.href; });
    }).catch(function () {});
  }

  function cartIcons() {
    document.querySelectorAll('.item-in-cart').forEach(function (it) {
      var t = (it.textContent || '').toLowerCase();
      it.classList.toggle('gh-item-domain', /domain (registration|transfer|renewal)/.test(t));
      it.classList.toggle('gh-item-ssl', /ssl/.test(t));
    });
  }

  function brokerCta() {
    var SYM = { USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'AED ', SAR: 'SAR ', CAD: 'C$', AUD: 'A$', SGD: 'S$', MYR: 'RM ' };
    var pageCur = function () { var m = document.body.innerText.match(/\d[\d,.]*\s(USD|AED|EUR|GBP|INR|SAR|CAD|AUD|SGD|MYR)\b/); return m ? m[1] : 'USD'; };
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var fee = null;
    var loadFee = function (cb) { if (fee) return cb(fee); fetch(ORIGIN + '/api/store/broker?currency=' + pageCur()).then(function (r) { return r.json(); }).then(function (d) { fee = d; cb(d); }).catch(function () { cb(null); }); };
    var money = function (cur, n) { var sy = SYM[cur] || cur + ' '; return sy + L10N.num(Number(n), { maximumFractionDigits: 2 }); };
    // best available alternative = first visible suggestion row with an add button
    var alt = function () {
      var rows = [].slice.call(document.querySelectorAll('.domain-suggestion, #domainSuggestions li, .suggested-domains .row, [class*="suggestion"]'));
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i]; if (r.offsetParent === null) continue;
        var btn = r.querySelector('button.btn-add-to-cart, .btn-add-to-cart, button[data-domain], .btn:not([disabled])'); if (!btn || btn.offsetParent === null) continue;
        var d = (btn.getAttribute('data-domain') || (r.textContent.match(/[a-z0-9-]+\.[a-z.]{2,}/i) || [])[0] || '').toLowerCase(); if (!d) continue;
        var pr = r.querySelector('.price, [class*="price"]'); var price = pr ? pr.textContent.replace(/\s+/g, ' ').trim() : '';
        return { dom: d, price: price, btn: btn };
      }
      return null;
    };
    var run = function () {
      document.querySelectorAll('.domain-unavailable, .domain-checker-unavailable').forEach(function (el) {
        if (el.dataset.ghb || !/block|flex/.test(getComputedStyle(el).display) || el.offsetParent === null) return;
        var res = el.closest('.domain-lookup-primary-results, #primaryLookupResult, #DomainSearchResults') || el.parentNode;
        var b = res && res.querySelector('[data-domain]'); var txt = (el.textContent.match(/[a-z0-9-]+\.[a-z.]{2,}/i) || [])[0];
        var dom = ((b && b.getAttribute('data-domain')) || txt || ((document.querySelector('#inputDomain, input[name=domain], #registersld') || {}).value || '')).toLowerCase().trim();
        el.dataset.ghb = 1;
        // the searched name is taken: the .com/.net/.org bundle would mislead, hide it
        var bun = document.getElementById('domainBundle'); if (bun) bun.style.display = 'none';
        var wrap = document.createElement('div'); wrap.className = 'gh-tk';
        var href = ORIGIN + '/domain-broker' + (dom ? '?domain=' + encodeURIComponent(dom) : '');
        var AV = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#fbe8ef"/><circle cx="32" cy="25" r="11" fill="#c5386f"/><path d="M12 54c3-10 11-15 20-15s17 5 20 15" fill="#c5386f"/><path d="M26 41l6 7 6-7" fill="#fdd700"/></svg>';
        wrap.innerHTML = '<div class="gh-tk__card gh-tk__taken">' +
          '<div class="gh-tk__top"><span class="gh-tk__tag">' + _t('Domain taken') + '</span><span class="gh-tk__anon">' + _t('Owner never learns who you are') + '</span></div>' +
          '<div class="gh-tk__dom"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 18.4 18.4 5.6"/></svg>' + (dom ? '<bdi dir="ltr">' + esc(dom) + '</bdi>' : _t('This domain')) + '</div>' +
          '<p class="gh-tk__lead">' + _t('We might be able to get it for you.') + ' <a href="#" data-gh-how>' + _t('See how it works') + '</a></p>' +
          '<div class="gh-tk__fee"><span class="gh-tk__ph" data-gh-ph>' + AV + '</span><div class="gh-tk__feetx"><small data-gh-who>' + _t('Your broker · GlobalHostia broker desk') + '</small><b><span data-gh-fee>…</span> <i>' + _t('broker service fee') + '</i></b><em data-gh-fee-note></em></div></div>' +
          '<ul class="gh-tk__ticks"><li>' + _t('Anonymous approach') + '</li><li>' + _t('Payment held in escrow') + '</li><li>' + _t('No deal, no commission') + '</li></ul>' +
          '<ol class="gh-tk__steps" hidden><li>' + _t('<b>Tell us your budget</b> for the domain') + '</li><li>' + _t('<b>We contact the owner</b> anonymously') + '</li><li>' + _t('<b>We negotiate</b> and hold payment in escrow') + '</li><li>' + _t('<b>The domain moves</b> to your account') + '</li></ol>' +
          '<div class="gh-tk__act"><a class="gh-tk__buy" href="' + href + '">' + _t('Buy it now') + '</a><button type="button" class="gh-tk__more" data-gh-more aria-expanded="false">' + _t('See more') + ' <span aria-hidden="true">▾</span></button></div></div>' +
          '<div class="gh-tk__card gh-tk__alt" hidden><span class="gh-tk__tag gh-tk__tag--alt">' + _t('Great alternative') + '</span><div class="gh-tk__altdom" data-gh-alt dir="ltr"></div><div class="gh-tk__altprice"><b data-gh-altp></b> <span>' + _t('first year') + '</span></div><div class="gh-tk__altren" data-gh-altr></div><button type="button" class="gh-tk__add">' + _t('Make it yours') + '</button><div class="gh-tk__more2" data-gh-more2></div></div>';
        res.insertBefore(wrap, res.firstChild);
        res.classList.add('gh-tk-on');
        var steps = wrap.querySelector('.gh-tk__steps'), moreBtn = wrap.querySelector('[data-gh-more]');
        var toggle = function (e) { if (e) e.preventDefault(); var open = steps.hidden; steps.hidden = !open; moreBtn.setAttribute('aria-expanded', String(open)); moreBtn.firstChild.nodeValue = (open ? _t('See less') : _t('See more')) + ' '; };
        moreBtn.onclick = toggle; wrap.querySelector('[data-gh-how]').onclick = function (e) { e.preventDefault(); if (steps.hidden) toggle(); };
        loadFee(function (d) {
          var f = wrap.querySelector('[data-gh-fee]'), n = wrap.querySelector('[data-gh-fee-note]');
          if (!d) { f.textContent = _t('From {p}', { p: '$79' }); return; }
          f.textContent = money(d.currency, d.fee);
          n.textContent = _t('+ {pct} only if we buy it for you (minimum {min})', { pct: d.pct + '%', min: money(d.currency, d.minCommission) });
          if (d.team && d.team.length) { var pick = d.team[Math.floor(Math.random() * d.team.length)]; d.name = pick.name; d.title = pick.title; d.photo = pick.photo; }
          if (d.name) wrap.querySelector('[data-gh-who]').textContent = d.name + (d.title ? ', ' + d.title : '');
          if (d.photo && /^https:\/\//.test(d.photo)) { var im = new Image(); im.alt = ''; im.src = d.photo; im.onload = function () { var ph = wrap.querySelector('[data-gh-ph]'); ph.innerHTML = ''; ph.appendChild(im); }; }
        });
        var renewOf = function (row) { var m = row && row.textContent.match(/Renews\s+([^\s/]+)\s*\/\s*yr/i); return m ? m[1] : ''; };
        var tries = 0, fill = function () {
          var a = alt(); var card = wrap.querySelector('.gh-tk__alt');
          if (!a) { if (++tries < 20) setTimeout(fill, 600); return; }
          var parts = a.dom.split('.'); var sld = parts.shift();
          card.querySelector('[data-gh-alt]').innerHTML = esc(sld) + '<span>.' + esc(parts.join('.')) + '</span>';
          card.querySelector('[data-gh-altp]').textContent = a.price.replace(/\s*[A-Z]{3}$/, '');
          var row = a.btn.closest('.domain-suggestion'); var rn = renewOf(row);
          card.querySelector('[data-gh-altr]').textContent = rn ? _t('Renews at {p} / year', { p: rn }) : '';
          card.querySelector('.gh-tk__add').onclick = function () { a.btn.click(); this.textContent = _t('Added'); this.disabled = true; };
          // two more available alternatives
          var more = [].slice.call(document.querySelectorAll('.domain-suggestion')).filter(function (r) { var b2 = r.querySelector('.btn-add-to-cart'); return r.offsetParent !== null && b2 && b2 !== a.btn && b2.offsetParent !== null; }).slice(0, 2);
          var box = card.querySelector('[data-gh-more2]');
          more.forEach(function (r) {
            var b2 = r.querySelector('.btn-add-to-cart'); var d2 = (b2.getAttribute('data-domain') || '').toLowerCase(); var p2 = r.querySelector('.price'); if (!d2) return;
            var it = document.createElement('div'); it.className = 'gh-tk__mini';
            it.innerHTML = '<span><b dir="ltr">' + esc(d2) + '</b><small>' + esc(p2 ? p2.textContent.replace(/\s+/g, ' ').trim() : '') + '</small></span><button type="button">' + _t('Add') + '</button>';
            it.querySelector('button').onclick = function () { b2.click(); this.textContent = _t('Added'); this.disabled = true; };
            box.appendChild(it);
          });
          card.hidden = false;
        };
        fill();
      });
    };
    run(); new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 200); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  // spotlight cards with no result after lookup (taken) get a clear label + broker link; header "001" currency id → code
  function spotTaken() {
    var q = ((document.querySelector('#inputDomain, input[name=domain], input[name=query]') || {}).value || new URLSearchParams(location.search).get('query') || '').trim().toLowerCase();
    var sld = q.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0];
    var vis = function (e) { return e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
    var run = function () {
      document.querySelectorAll('.spotlight-tld').forEach(function (c) {
        var nm0 = c.querySelector('.spotlight-tld-name'); var t0 = nm0 ? nm0.textContent.trim().toLowerCase() : '';
        var qtld = (q.match(/\.[a-z.]{2,}$/) || [''])[0];
        var primaryTaken = !!document.querySelector('.gh-tk') || [].some.call(document.querySelectorAll('.domain-unavailable, .domain-checker-unavailable'), vis);
        if (qtld && t0 === qtld && primaryTaken) {
          c.classList.add('gh-force-taken');
          if (!c.dataset.ght && sld) { c.dataset.ght = 1; c.insertAdjacentHTML('beforeend', '<span class="gh-taken">' + _t('Taken') + '</span><a class="gh-taken-link" href="' + ORIGIN + '/domain-broker?domain=' + encodeURIComponent(sld + qtld) + '">' + _t('Try our broker →') + '</a>'); }
          return;
        }
        var add = [].some.call(c.querySelectorAll('.btn-add-to-cart, button.btn:not(.unavailable):not(.invalid):not([disabled]), .price'), function (e) { return vis(e) && e.textContent.trim() && !/unavailable|taken/i.test(e.className + e.textContent); });
        var old = c.querySelectorAll('.gh-taken, .gh-taken-link');
        if (add) { [].forEach.call(old, function (e) { e.remove(); }); delete c.dataset.ght; return; }
        var un = [].some.call(c.querySelectorAll('.unavailable, [class*="unavailable"], .btn[disabled]'), vis);
        if (!un || c.dataset.ght) return;
        var nm = c.querySelector('.spotlight-tld-name'); var tld = ((nm && nm.textContent) || c.textContent).match(/\.[a-z.]{2,}/i); if (!tld || !sld) return;
        c.dataset.ght = 1; var dom = sld + tld[0].toLowerCase();
        c.insertAdjacentHTML('beforeend', '<span class="gh-taken">' + _t('Taken') + '</span><a class="gh-taken-link" href="' + ORIGIN + '/domain-broker?domain=' + encodeURIComponent(dom) + '">' + _t('Try our broker →') + '</a>');
      });
    };
    [1500, 4000, 7000, 10000, 15000, 22000].forEach(function (t) { setTimeout(run, t); });
  }

  // WHMCS untranslated keys + "001 - USD" currency label + domain pricing rows on mobile
  function textFixes() {
    var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n, kill = [];
    while ((n = tw.nextNode())) {
      var v = n.nodeValue;
      if (/\bdomainavailable2\b/.test(v)) { n.nodeValue = v.replace(/\s*\bdomainavailable2\b\s*/g, ' '); continue; }
      if (/^\s*0\d{2}(\s*-\s*[A-Z]{3})?\s*$/.test(v)) {
        var pe = n.parentElement; if (!pe || (pe.getBoundingClientRect().top > 300 && !/-\s*[A-Z]{3}/.test(v) && !(pe.closest('footer, [class*="footer"]')))) continue;
        var m = v.match(/[A-Z]{3}/); var code = m ? m[0] : ((document.body.innerHTML.match(/\d[\d,.]*\s(USD|AED|EUR|GBP|INR|SAR|CAD|AUD|SGD|MYR)\b/) || [])[1] || '');
        n.nodeValue = v.replace(/0\d{2}(\s*-\s*[A-Z]{3})?/, code || _t('Currency'));
      }
    }
  }
  function footerCredit() {
    [].forEach.call(document.querySelectorAll('footer p, footer div, [class*="footer"] p, [class*="footer"] .col, [class*="footer"] [class*="col-"]'), function (el) {
      if (el.children.length > 4 || !/coodiv|lots? of coffee/i.test(el.textContent) || el.dataset.ghc) return;
      el.dataset.ghc = 1; el.textContent = _t('© {year} GlobalHostia. All rights reserved.', { year: new Date().getFullYear() });
    });
  }
  // Compact footer: replace the 6-column WHMCS footer with a 2-row GlobalHostia footer
  function footerCompact() {
    var f = document.querySelector('.footer-emyui-aws'); if (!f || f.querySelector('.gh-foot')) return;
    var sec = f.querySelector('.footer-section'); if (!sec) return;
    var logo = f.querySelector('.left-side-footer-logo img'), phone = (f.querySelector('.footer-top-section span') || {}).textContent || '';
    var legal = [].filter.call(f.querySelectorAll('.left-side-footer-logo a'), function (a) { return /legal|privacy|cookie|terms/i.test(a.textContent); });
    var seen = {}, groups = [].map.call(f.querySelectorAll('.footer-top > .row:first-child > div'), function (col) {
      var h = col.querySelector('h1,h2,h3,h4,h5,h6,.footer-title, strong'); var links = [];
      [].forEach.call(col.querySelectorAll('a[href]'), function (a) { var t = a.textContent.trim(), k = t.toLowerCase(); if (!t || seen[k]) return; seen[k] = 1; links.push([t, a.getAttribute('href')]); });
      return { t: h ? h.textContent.trim() : '', l: links };
    }).filter(function (g) { return g.l.length; });
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var tel = phone.replace(/[^\d+]/g, ''), wa = tel.replace(/\D/g, '');
    var d = document.createElement('div'); d.className = 'gh-foot';
    d.innerHTML = '<div class="gh-foot__help"><span class="gh-foot__q">' + _t('Need help? We’re here 24/7.') + '</span>' +
      (tel ? '<a href="tel:' + esc(tel) + '" dir="ltr">' + esc(phone.trim()) + '</a>' : '') +
      (wa ? '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">' + _t('WhatsApp') + '</a>' : '') +
      '<a href="submitticket.php">' + _t('Open a ticket') + '</a></div>' +
      '<div class="gh-foot__main"><a class="gh-foot__logo" href="https://globalhostia.com/">' + (logo ? '<img src="' + esc(logo.getAttribute('src')) + '" alt="GlobalHostia">' : 'GlobalHostia') + '</a>' +
      '</div><nav class="gh-foot__groups" aria-label="' + esc(_t('Footer')) + '">' + groups.map(function (g) { return '<div><b>' + esc(g.t) + '</b>' + g.l.map(function (n) { return '<a href="' + esc(n[1]) + '">' + esc(n[0]) + '</a>'; }).join('') + '</div>'; }).join('') + '</nav>' +
      '<div class="gh-foot__base"><span>' + esc(_t('© {year} GlobalHostia. All rights reserved.', { year: new Date().getFullYear() })) + '</span><span class="gh-foot__legal">' +
      legal.map(function (a) { return '<a href="' + esc(a.getAttribute('href')) + '">' + esc(a.textContent.trim()) + '</a>'; }).join('') + langLink('gh-foot__lang') + '</span></div>';
    sec.style.display = 'none'; sec.parentNode.insertBefore(d, sec);
  }
  // white-label the control-panel login button: "Log in to DirectAdmin/cPanel/Plesk" -> "Open advanced console"
  function consoleBtn() {
    [].forEach.call(document.querySelectorAll('input[type=submit], input[type=button], button, a.btn'), function (b) {
      var t = (b.value || b.textContent || '').trim();
      if (!/^log ?in to (directadmin|cpanel|plesk|webmail)$/i.test(t) || b.dataset.ghc2) return;
      b.dataset.ghc2 = 1; var label = /webmail/i.test(t) ? _t('Open webmail') : _t('Open advanced console');
      if (b.tagName === 'INPUT') b.value = label; else b.textContent = label;
      b.classList.add('gh-console-btn'); b.title = _t('Full hosting control panel for advanced settings');
    });
  }
  // Gravatar avatars: our logo as the default instead of Gravatar's blue icon; a "Change photo" link in the account menu
  function avatars() {
    var def = encodeURIComponent('https://globalhostia.com/icon-192.png');
    [].forEach.call(document.querySelectorAll('img[src*="gravatar.com/avatar/"]'), function (im) {
      if (im.dataset.gha) return; im.dataset.gha = 1;
      var base = im.getAttribute('src').split('?')[0];
      im.src = base + '?s=160&d=' + def; im.classList.add('gh-avatar');
    });
    // the account menu: the dropdown with the logout link (matched by URL, so it works in every WHMCS language)
    var menu = document.querySelector('.client-avatar') && [].find.call(document.querySelectorAll('.dropdown-menu'), function (m) { return !!m.querySelector('a[href*="logout"]') && (/Account Details|Your Profile/i.test(m.textContent) || !!m.querySelector('a[href*="action=details"], a[href*="user/profile"], a[href*="account/profile"]')); });
    if (menu && !menu.querySelector('.gh-photo-link')) {
      var head = [].find.call(menu.querySelectorAll('*'), function (e) { return e.querySelector && e.querySelector('img.gh-avatar, .client-avatar img') && e.textContent.trim().length < 60; });
      var a = document.createElement('a'); a.className = 'gh-photo-link'; a.href = 'https://gravatar.com/profile'; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = _t('Change photo');
      if (head) head.appendChild(a);
    }
    langMenu(menu || [].find.call(document.querySelectorAll('.dropdown-menu'), function (m) { return !!m.querySelector('a[href*="logout"]'); }));
  }
  /* language switch (English / العربية): WHMCS's own ?language=<name> on the current URL, which needs
     "Allow clients to choose language" (Setup > General Settings > Localisation) */
  function langLink(cls) {
    var to = L10N.rtl ? 'en' : 'ar';
    return '<a class="' + cls + '" href="' + esc(L10N.href(to)) + '" lang="' + to + '" hreflang="' + to + '" data-gh-lang="' + to + '">' + (to === 'ar' ? 'العربية' : 'English') + '</a>';
  }
  function langMenu(menu) {
    if (!menu || menu.querySelector('.gh-lang-item')) return;
    var out = menu.querySelector('a[href*="logout"]'), li = document.createElement(menu.tagName === 'UL' ? 'li' : 'div');
    li.className = 'gh-lang-item';
    li.innerHTML = '<span class="gh-lang-item__l" aria-hidden="true">' + svg(IC.globe) + '</span>' + langLink('dropdown-item gh-lang-link');
    var at = out && (out.closest('li') && menu.contains(out.closest('li')) ? out.closest('li') : out);
    if (at && at.parentNode) at.parentNode.insertBefore(li, at); else menu.appendChild(li);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-gh-lang]'); if (!a) return;
    L10N.remember(a.getAttribute('data-gh-lang'));
  });
  function tldRows() {
    var tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = tw.nextNode())) {
      if (!/New Price/i.test(n.nodeValue)) continue;
      var el = n.parentElement, guard = 0;
      while (el && guard++ < 6 && !(/Transfer/i.test(el.textContent) && /Ren/i.test(el.textContent))) el = el.parentElement;
      if (el && el.children.length >= 3 && el.children.length <= 6 && !el.classList.contains('gh-tldrow')) el.classList.add('gh-tldrow');
    }
  }
  // results showing: make the dark search banner compact so the results sit higher (less scrolling)
  function compactHero() {
    var inp = document.querySelector('#inputDomain'); if (!inp) return;
    var hasResults = /[?&]query=/.test(location.search) || document.querySelector('#DomainSearchResults, #primaryLookupResult');
    if (!hasResults) return;
    var el = inp.parentNode, hero = null;
    for (var i = 0; el && el !== document.body && i < 10; i++, el = el.parentNode) {
      var cs = getComputedStyle(el), m = cs.backgroundColor.match(/\d+/g), dark = m && (m[3] === undefined || +m[3] > 0) && (+m[0] + +m[1] + +m[2]) < 200;
      if ((dark || cs.backgroundImage !== 'none') && el.offsetHeight > 260) { hero = el; break; }
    }
    if (!hero) return;
    hero.classList.add('gh-hero-compact');
  }
  function searchBox() {
    document.querySelectorAll('#inputDomain, input[name="domain"][type="text"], input[name="query"][type="text"]').forEach(function (inp) {
      var g = inp.parentNode, n = 0; while (g && n < 3 && !g.querySelector('button, .btn, [type=submit]')) { g = g.parentNode; n++; }
      if (!g || g.tagName === 'FORM' && g.querySelectorAll('input[type=text]').length > 1) return;
      if (g.querySelectorAll('button, .btn, [type=submit]').length > 2) return; g.classList.add('gh-searchbox');
    });
  }
  function bundleGlass() {
    var run = function () { document.querySelectorAll('#domainBundle, .domain-bundle-card').forEach(function (card) {
      card.querySelectorAll('*').forEach(function (el) {
        if (/^(A|BUTTON)$/.test(el.tagName) || el.closest('a,button')) return;
        var m = getComputedStyle(el).backgroundColor.match(/\d+/g); if (!m || (m[3] !== undefined && +m[3] === 0)) return;
        if (+m[0] >= 248 && +m[1] >= 248 && +m[2] >= 248) { el.style.setProperty('background', 'rgba(255,255,255,.07)', 'important'); el.style.setProperty('border', '1px solid rgba(255,255,255,.14)', 'important'); el.style.setProperty('box-shadow', 'none', 'important'); }
      }); }); };
    run(); setTimeout(run, 1200); setTimeout(run, 4000);
  }
  function curLabel() {
    var code = ''; var m = document.body.innerHTML.match(/\d[\d,.]*\s(USD|AED|EUR|GBP|INR|SAR|CAD|AUD|SGD|MYR)\b/); if (m) code = m[1];
    var map = { USD: '$ USD', AED: 'AED', EUR: '€ EUR', GBP: '£ GBP', INR: '₹ INR', SAR: 'SAR', CAD: 'C$ CAD', AUD: 'A$ AUD', SGD: 'S$ SGD', MYR: 'RM MYR' };
    document.querySelectorAll('a, button, span, div, li').forEach(function (el) {
      if (el.children.length > 3) return; var r = el.getBoundingClientRect(); if (r.top > 260 || r.width > 260) return;
      var t = el.textContent.trim(); if (!/^0\d{2}$/.test(t)) return;
      var tn = [].find.call(el.childNodes, function (n) { return n.nodeType === 3 && /0\d{2}/.test(n.nodeValue); }) || el;
      var lbl = map[code] || code || _t('Currency');
      if (tn.nodeType === 3) tn.nodeValue = tn.nodeValue.replace(/0\d{2}/, lbl); else el.textContent = lbl;
    });
  }

  ready(function () { try { footerCredit(); footerCompact(); consoleBtn(); setTimeout(consoleBtn, 1500); } catch (e) {} try { avatars(); setTimeout(avatars, 1200); } catch (e) {} try { curLabel(); setTimeout(curLabel, 1500); textFixes(); setTimeout(textFixes, 1500); setTimeout(textFixes, 4000); tldRows(); setTimeout(tldRows, 2500); } catch (e) {} try { bundleGlass(); } catch (e) {} try { searchBox(); } catch (e) {} try { compactHero(); setTimeout(compactHero, 800); } catch (e) {} try { if (document.querySelector('.spotlight-tld')) spotTaken(); } catch (e) {} try { if (document.querySelector('#DomainSearchResults, #primaryLookupResult, .domain-checker-container')) brokerCta(); } catch (e) {} try { cartIcons(); } catch (e) {} try { cartOffers(); } catch (e) {} try { connectLinks(); } catch (e) {} try { setTimeout(clientFixes, 600); setTimeout(clientFixes, 2000); } catch (e) {} try { whatsapp(); } catch (e) {} try { promos(); } catch (e) {} try { domainPage(); } catch (e) {} try { suggestPager(); } catch (e) {} try { compare(); } catch (e) {} try { storeMega(); } catch (e) {} try { domainStep(); } catch (e) {} try { configure(); } catch (e) {} try { cartView(); } catch (e) {} try { checkout(); } catch (e) {} try { homepage(); } catch (e) {} try { blogHub(); } catch (e) {} try { groupedNav(); } catch (e) {} try { promo(); } catch (e) {} try { catBanner(); } catch (e) {} try { enhanceListing(); } catch (e) {} });
})();

// Support alerts: nudge the site to email the owner after a ticket is opened or replied to.
// Self-contained (append-only); the server rate-limits and de-duplicates, the beacon carries no data.
(function () {
  try {
    if (window.GH_L10N && window.GH_L10N.wait) return;
    if (!/(submitticket|viewticket)\.php/i.test(location.pathname)) return;
    var origin = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return 'https://globalhostia.com'; } })();
    var ping = function () { try { if (navigator.sendBeacon) navigator.sendBeacon(origin + '/api/support/ping'); else fetch(origin + '/api/support/ping', { method: 'POST', keepalive: true, mode: 'no-cors' }); } catch (e) {} };
    if (/viewticket\.php/i.test(location.pathname) || /[?&]step=3\b/.test(location.search)) ping();
    document.addEventListener('submit', function (e) { if (e.target && e.target.querySelector && e.target.querySelector('textarea')) ping(); }, true);
  } catch (e) {}
})();

// Manage hosting: Overview + grouped tools (Domains, Email, Files, Databases, Advanced) on the service details page.
// Shown only when the WHMCS hook (docs/whmcs/globalhostia_hosting_hook.php) printed window.GH_HOSTING for an Active
// DirectAdmin / cPanel / Plesk service owned by the signed-in client. Talks to ORIGIN/api/hosting/* with that token in
// the Authorization header (no cookies). The panel's own "Login to DirectAdmin" button is left in place as a fallback.
// Strings go through _t() (English source text = dictionary key, Arabic in /hp/whmcs-i18n.js); Ctrl/⌘+K opens a command palette.
(function () {
  'use strict';
  if (window.GH_L10N.wait) return;
  var L10N = window.GH_L10N, _t = L10N.t, _tp = L10N.tp, RTL = L10N.rtl;
  var ORIGIN = (function () { try { return new URL(document.currentScript.src).origin; } catch (e) { return 'https://globalhostia.com'; } })();
  var API = ORIGIN + '/api/hosting/';
  function ready(f) { if (document.readyState !== 'loading') f(); else document.addEventListener('DOMContentLoaded', f); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /** a technical value (domain, address, path, IP) that keeps left-to-right order inside Arabic text */
  function ltr(s) { return '<bdi dir="ltr">' + esc(s) + '</bdi>'; }
  /*<err-map>*/
  // API failure -> what happened + what to do (mirrors lib/ux/errors.ts and /hp/fx.js). The server's own sentence is kept
  // only for input problems, rate limits and "not available on this panel"; everything else gets the standard copy.
  var ERR_COPY = {
    network: N_('You seem to be offline. Check your connection and try again.'),
    timeout: N_('This is taking longer than usual. Please try again in a moment.'),
    rate: N_('Too many attempts in a short time. Please wait a minute, then try again.'),
    auth: N_('Your session expired. Reload the page and sign in again to continue.'),
    forbidden: N_('This action is not allowed from this page. Reload the page and try again.'),
    validation: N_('Please check the highlighted fields and try again.'),
    notfound: N_('We could not find what you were looking for. It may have been moved or removed.'),
    unavailable: N_('This service is busy right now. Your websites and email keep running. Please try again in a few minutes.'),
    server: N_('Something went wrong on our side. Please try again in a minute.')
  };
  function ghErr(status, code, msg) {
    var c = String(code || '').toLowerCase(), k;
    if (c === 'network' || c === 'offline') k = 'network';
    else if (c === 'timeout' || c === 'panel_timeout') k = 'timeout';
    else if (c === 'expired' || c === 'unauthorized') k = 'auth';
    else if (c === 'rate_limited') k = 'rate';
    else if (c === 'invalid' || c === 'panel') k = 'validation';
    else if (c === 'panel_unreachable' || c === 'not_configured') k = 'unavailable';
    else if (!status) k = 'network';
    else if (status === 408 || status === 504) k = 'timeout';
    else if (status === 429) k = 'rate';
    else if (status === 401) k = 'auth';
    else if (status === 403) k = 'forbidden';
    else if (status === 404 || status === 410) k = 'notfound';
    else if (status === 400 || status === 409 || status === 413 || status === 422) k = 'validation';
    else if (status === 501 && c === 'unsupported') k = 'validation';
    else if (status === 502 || status === 503) k = 'unavailable';
    else k = 'server';
    var own = typeof msg === 'string' && msg.length > 3 && msg.length < 300 && !/\b(WHMCS|DirectAdmin|WHM|Vercel|Neon|Postgres)\b|\bat \S+:\d+/.test(msg) ? msg : '';
    var keep = own && (k === 'validation' || k === 'rate' || c === 'panel_timeout' || c === 'panel_unreachable');
    return { kind: k, msg: keep ? own : _t(ERR_COPY[k]), retry: k === 'network' || k === 'timeout' || k === 'rate' || k === 'unavailable' || k === 'server' };
  }
  /*</err-map>*/
  var I = {
    dns: 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2c2.8 3 4 6.5 4 10s-1.2 7-4 10c-2.8-3-4-6.5-4-10s1.2-7 4-10z',
    email: 'M3 5h18v14H3zM3 6l9 7 9-7',
    files: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
    databases: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    ssl: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
    backups: 'M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8M3 3v5h5M12 7v5l3 3',
    plus: 'M12 5v14M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    key: 'M15 7a4 4 0 11-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0115 7z', down: 'M12 4v12M6 10l6 6 6-6M4 20h16', chevron: 'm6 9 6 6 6-6', up: 'M12 20V8M6 14l6-6 6 6M4 4h16',
    folder: 'M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z', file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7', fwd: 'M4 12h14M13 6l6 6-6 6', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
    x: 'M6 6l12 12M18 6L6 18', overview: 'M4 18a8 8 0 1116 0M12 18l4-6', subdomains: 'M6 3v12a3 3 0 003 3h9M14 14l4 4-4 4',
    aliases: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1', redirects: 'M4 12h14M13 6l6 6-6 6',
    php: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14', forwarders: 'M4 6h11M4 12h7M4 18h11M15 9l4 3-4 3', autoresponders: 'M9 7L4 12l5 5M4 12h11a5 5 0 015 5v2',
    spam: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l6 0', ftp: 'M4 8h16v12H4zM8 4h8M12 11v6M9 14l3 3 3-3', protect: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4M12 15v2',
    cron: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2', wordpress: 'M12 3a9 9 0 100 18 9 9 0 000-18zM6 8l3.5 10L12 11l2.5 7L18 8', rename: 'M9 4h6M9 20h6M12 4v16M4 9l-2 3 2 3M20 9l2 3-2 3', ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6', gauge: 'M4 18a8 8 0 1116 0M12 18l4-6',
    health: 'M3 12h4l2-5 4 10 2-5h6', copy: 'M9 9h11v11H9zM5 15V4h11', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.5-3.5', clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
    bolt: 'M13 3L5 14h6l-1 7 8-11h-6z'
  };
  // icons that point somewhere: mirrored in right-to-left layouts
  var FLIP = { fwd: 1, redirects: 1, ext: 1, forwarders: 1, autoresponders: 1 };
  function ic(n, sz) { return '<svg viewBox="0 0 24 24" width="' + (sz || 16) + '" height="' + (sz || 16) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"' + (FLIP[n] ? ' class="ghh-flip"' : '') + '><path d="' + I[n] + '"/></svg>'; }
  // [group label, [[view, label, capability section, sub-cap]]]; labels are English (N_ marks them for the dictionary), shown through _t()
  function N_(s) { return s; } // hoisted: ERR_COPY above uses it
  var NAV = [
    ['', [['overview', N_('Overview'), 'overview'], ['health', N_('Site health'), 'health']]],
    [N_('Domains'), [['dns', 'DNS', 'dns'], ['subdomains', N_('Subdomains'), 'subdomains'], ['aliases', N_('Aliases'), 'aliases'], ['redirects', N_('Redirects'), 'redirects'], ['ssl', 'SSL', 'ssl'], ['php', N_('PHP version'), 'php']]],
    [N_('Email'), [['email', N_('Mailboxes'), 'email', 'list'], ['forwarders', N_('Forwarders'), 'email', 'forwarders'], ['autoresponders', N_('Autoresponders'), 'autoresponders'], ['spam', N_('Spam filter'), 'spam']]],
    [N_('Files'), [['files', N_('File manager'), 'files'], ['ftp', N_('FTP accounts'), 'ftp'], ['protect', N_('Protected folders'), 'protect']]],
    [N_('Data'), [['databases', N_('Databases'), 'databases']]],
    [N_('Advanced'), [['cron', N_('Cron jobs'), 'cron'], ['backups', N_('Backups'), 'backups'], ['wordpress', 'WordPress', 'wordpress']]]
  ];
  var DOMAIN_VIEWS = { health: 1, dns: 1, subdomains: 1, aliases: 1, redirects: 1, php: 1, email: 1, forwarders: 1, autoresponders: 1, spam: 1, ftp: 1, protect: 1 };
  var bytes = function (n) { n = +n || 0; return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB'; };
  var when = function (s) { if (!s) return ''; var d = new Date(s); return isNaN(d) ? esc(s) : L10N.date(d, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + L10N.time(d, { hour: '2-digit', minute: '2-digit' }); };
  function genPass() {
    var a = 'abcdefghijkmnpqrstuvwxyz', A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', d = '23456789', s = '!#%+=_-', all = a + A + d + s, out = [], r = new Uint32Array(16);
    (window.crypto || window.msCrypto).getRandomValues(r);
    out.push(a[r[0] % a.length], A[r[1] % A.length], d[r[2] % d.length], s[r[3] % s.length]);
    for (var i = 4; i < 16; i++) out.push(all[r[i] % all.length]);
    for (var j = out.length - 1; j > 0; j--) { var k = r[j] % (j + 1), t = out[j]; out[j] = out[k]; out[k] = t; }
    return out.join('');
  }

  /* tiny QR encoder (byte mode, error correction M, versions 1-20; after Nayuki's reference implementation, MIT) -> SVG */
  var QR = (function () {
    var ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
    var BLK = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
    function rawMods(v) { var r = (16 * v + 128) * v + 64; if (v >= 2) { var na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; } return r; }
    function dataCw(v) { return Math.floor(rawMods(v) / 8) - ECC[v] * BLK[v]; }
    function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
    function divisor(deg) { var r = [], i, j, root = 1; for (i = 0; i < deg - 1; i++) r.push(0); r.push(1); for (i = 0; i < deg; i++) { for (j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; }
    function rem(data, div) { var r = div.map(function () { return 0; }); data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= mul(c, f); }); }); return r; }
    function alignPos(v) { if (v === 1) return []; var n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, r = [6]; for (var pos = v * 4 + 10; r.length < n; pos -= step) r.splice(1, 0, pos); return r; }
    function maskBit(k, x, y) { return [(x + y) % 2, y % 2, x % 3, (x + y) % 3, (Math.floor(x / 3) + Math.floor(y / 2)) % 2, x * y % 2 + x * y % 3, (x * y % 2 + x * y % 3) % 2, ((x + y) % 2 + x * y % 3) % 2][k] === 0; }
    function encode(text) {
      var bytes = [].slice.call(new TextEncoder().encode(text)), v, bits = [], i;
      for (v = 1; v <= 20; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCw(v) * 8) break;
      if (v > 20) return null;
      var push = function (val, n) { for (var j = n - 1; j >= 0; j--) bits.push((val >>> j) & 1); };
      push(4, 4); push(bytes.length, v < 10 ? 8 : 16); bytes.forEach(function (b) { push(b, 8); });
      var cap = dataCw(v) * 8; push(0, Math.min(4, cap - bits.length)); push(0, (8 - bits.length % 8) % 8);
      for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
      var data = []; for (i = 0; i < bits.length; i += 8) { var b8 = 0; for (var j = 0; j < 8; j++) b8 = (b8 << 1) | bits[i + j]; data.push(b8); }
      var nb = BLK[v], ecl = ECC[v], raw = Math.floor(rawMods(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), dv = divisor(ecl), blocks = [], k = 0;
      for (i = 0; i < nb; i++) { var dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length; var e = rem(dat, dv); if (i < nShort) dat.push(0); blocks.push(dat.concat(e)); }
      var cw = []; for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (bl, jj) { if (i !== shortLen - ecl || jj >= nShort) cw.push(bl[i]); });
      var size = v * 4 + 17, m = [], fn = [], y, x;
      for (y = 0; y < size; y++) { m.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
      var set = function (xx, yy, d) { m[yy][xx] = d; fn[yy][xx] = true; };
      for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
      [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = c[0] + dx, yy = c[1] + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } });
      var al = alignPos(v), na = al.length;
      for (i = 0; i < na; i++) for (j = 0; j < na; j++) { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue; for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) set(al[i] + ax, al[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1); }
      var bit = function (n, b) { return ((n >>> b) & 1) !== 0; };
      var format = function (mask) {
        var d = (0 << 3) | mask, r = d; for (var q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537); var fb = ((d << 10) | r) ^ 0x5412;
        for (q = 0; q <= 5; q++) set(8, q, bit(fb, q)); set(8, 7, bit(fb, 6)); set(8, 8, bit(fb, 7)); set(7, 8, bit(fb, 8)); for (q = 9; q < 15; q++) set(14 - q, 8, bit(fb, q));
        for (q = 0; q < 8; q++) set(size - 1 - q, 8, bit(fb, q)); for (q = 8; q < 15; q++) set(8, size - 15 + q, bit(fb, q)); set(8, size - 8, true);
      };
      format(0);
      if (v >= 7) { var vr = v; for (i = 0; i < 12; i++) vr = (vr << 1) ^ ((vr >>> 11) * 0x1F25); var vb = (v << 12) | vr; for (i = 0; i < 18; i++) { var t = bit(vb, i), a = size - 11 + i % 3, b2 = Math.floor(i / 3); set(a, b2, t); set(b2, a, t); } }
      var n = 0;
      for (var right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) { x = right - j; y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert; if (!fn[y][x] && n < cw.length * 8) { m[y][x] = bit(cw[n >>> 3], 7 - (n & 7)); n++; } } }
      var flip = function (k2) { for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (!fn[y][x] && maskBit(k2, x, y)) m[y][x] = !m[y][x]; };
      var penalty = function () { // runs of 5+ and 2x2 blocks plus dark/light balance (finder-like rule left out: any mask decodes)
        var p = 0, dark = 0;
        for (y = 0; y < size; y++) { var rc = 1, cc = 1; for (x = 0; x < size; x++) { if (m[y][x]) dark++; if (x) { if (m[y][x] === m[y][x - 1]) { rc++; if (rc === 5) p += 3; else if (rc > 5) p++; } else rc = 1; if (m[x][y] === m[x - 1][y]) { cc++; if (cc === 5) p += 3; else if (cc > 5) p++; } else cc = 1; } if (x && y && m[y][x] === m[y][x - 1] && m[y][x] === m[y - 1][x] && m[y][x] === m[y - 1][x - 1]) p += 3; } }
        return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      };
      var best = 0, bestP = Infinity;
      for (var k3 = 0; k3 < 8; k3++) { flip(k3); format(k3); var pp = penalty(); if (pp < bestP) { bestP = pp; best = k3; } flip(k3); }
      flip(best); format(best);
      return m;
    }
    return function (text) {
      var m = encode(text); if (!m) return '';
      var s = m.length, q = 4, d = '';
      for (var y = 0; y < s; y++) for (var x = 0; x < s; x++) if (m[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
      return '<svg class="ghh-qr" viewBox="0 0 ' + (s + 2 * q) + ' ' + (s + 2 * q) + '" role="img" aria-label="' + _t('QR code with the mail settings') + '" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#16212b"/></svg>';
    };
  })();

  function mount(G) {
    if (document.querySelector('.ghh')) return;
    var anchor = null;
    // after the card that holds the panel's own login button, else before the tabbed service details, else top of content
    var btn = [].slice.call(document.querySelectorAll('a, button, input[type=submit]')).filter(function (b) { return b.classList.contains('gh-console-btn') || /login to (directadmin|cpanel|plesk|control panel)|log in to (directadmin|cpanel|plesk)/i.test(b.textContent || b.value || ''); })[0];
    if (btn) { anchor = btn.closest('.card, .panel, .module-client-area, .product-details, section') || btn.parentNode; }
    var host = document.createElement('section');
    host.className = 'ghh'; host.setAttribute('aria-labelledby', 'ghh-title');
    if (RTL) { host.setAttribute('dir', 'rtl'); host.setAttribute('lang', 'ar'); }
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor.nextSibling);
    else {
      var t = document.querySelector('.product-details-tab-container, #tabOverview, .tab-content, .product-details, #main-body .container, #main-body, main');
      if (!t) return;
      if (t.matches('#main-body .container, #main-body, main')) t.insertBefore(host, t.firstChild); else t.parentNode.insertBefore(host, t);
    }
    app(host, G);
  }

  function app(root, G) {
    var S = { tab: null, session: null, domain: '', path: '/', cache: {} };
    var PC = {}; // command palette: account items fetched on first open, kept for this page view (cleared per section on changes)
    var MAC = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    root.innerHTML =
      '<header class="ghh__head"><span class="ghh__mark" aria-hidden="true">' + ic('gauge', 20) + '</span><div class="ghh__ttl"><h2 id="ghh-title">' + _t('Manage hosting') + '</h2><p class="ghh__sub" data-sub>' + _t('Connecting to your hosting account') + '</p></div>' +
      '<div class="ghh__dom" data-dom hidden><label for="ghh-dom">' + _t('Domain') + '</label><select id="ghh-dom" data-domsel></select></div>' +
      '<button type="button" class="ghh-kbtn" data-pal aria-haspopup="dialog" aria-keyshortcuts="' + (MAC ? 'Meta+K' : 'Control+K') + '" title="' + esc(_t('Search tools, domains, mailboxes and DNS records')) + '">' + ic('search', 16) + '<span class="ghh-kbtn__t">' + _t('Search') + '</span><kbd aria-hidden="true">' + (MAC ? '⌘ K' : 'Ctrl K') + '</kbd></button></header>' +
      '<div class="ghh__wrap"><nav class="ghh__nav" aria-label="' + esc(_t('Hosting tools')) + '" data-tabs></nav>' +
      '<div class="ghh__body" id="ghh-panel" tabindex="-1" data-body aria-live="polite"></div></div>' +
      '<div class="ghh__toasts" aria-live="polite" aria-atomic="false" data-toasts></div>';
    var $ = function (s) { return root.querySelector(s); };
    var body = $('[data-body]');
    body.innerHTML = skel(4);

    function api(section, q, opts) {
      opts = opts || {};
      var url = API + section + (q ? '?' + new URLSearchParams(q) : '');
      var init = { method: opts.method || 'GET', headers: { authorization: 'Bearer ' + G.token }, credentials: 'omit', mode: 'cors', cache: 'no-store' };
      if (opts.json) { init.method = 'POST'; init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.json); }
      if (opts.form) { init.method = 'POST'; init.body = opts.form; }
      // no answer in time (uploads and backups get longer): a clear "taking longer than usual" instead of an endless spinner
      var ac = window.AbortController ? new AbortController() : null, tm = 0;
      if (ac) { init.signal = ac.signal; tm = setTimeout(function () { ac.abort(); }, opts.form ? 180000 : 45000); }
      var boom = function (status, code, msg) { var info = ghErr(status, code, msg), e = new Error(info.msg); e.code = code === 'unauthorized' ? 'expired' : code || info.kind; e.kind = info.kind; e.status = status; e.retry = info.retry; return e; };
      return fetch(url, init).then(function (r) {
        clearTimeout(tm);
        if (opts.raw && r.ok) return r;
        return r.json().catch(function () { return { error: r.ok ? 'server' : '', message: '' }; }).then(function (d) {
          if (!r.ok || d.error === 'server') throw boom(r.status, d.error, L10N.srv(d.message));
          if (init.method === 'POST') Object.keys(PC).forEach(function (k) { if (k.indexOf(section + ':') === 0) delete PC[k]; });
          if (init.method === 'POST') S.fails = 0;
          return d;
        });
      }, function (x) { clearTimeout(tm); throw boom(0, x && x.name === 'AbortError' ? 'timeout' : navigator.onLine === false ? 'offline' : 'network'); });
    }
    function toast(msg, kind, extra) {
      var box = $('[data-toasts]'), el = document.createElement('div');
      el.className = 'ghh-toast ghh-toast--' + (kind || 'ok'); el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      el.innerHTML = '<span class="ghh-toast__mk" aria-hidden="true"></span><span>' + esc(L10N.srv(msg)) + (extra ? ' ' + extra : '') + '</span><button type="button" aria-label="' + esc(_t('Dismiss')) + '">' + ic('x', 14) + '</button>';
      el.querySelector('button').onclick = function () { el.remove(); };
      box.appendChild(el); setTimeout(function () { el.classList.add('is-out'); setTimeout(function () { el.remove(); }, 300); }, kind === 'err' ? 7000 : 4200);
    }
    function fail(e, where) {
      if (e && e.code === 'expired') return expired();
      S.fails = (S.fails || 0) + 1;
      if (where) where.innerHTML = errBox(e && e.message, e);
      else toast(e && e.message || _t('Something went wrong'), 'err', helpLink(e));
    }
    /* after two failures in a row, or when the problem is on our side: a way to reach a person */
    function helpLink(e) {
      if (!((S.fails || 0) >= 2 || (e && (e.kind === 'server' || e.kind === 'unavailable')))) return '';
      var wa = document.querySelector('a[href^="https://wa.me/"], a[href^="https://api.whatsapp.com/"]');
      return wa ? '<a class="ghh-help" href="' + esc(wa.getAttribute('href')) + '" target="_blank" rel="noopener">' + _t('Still stuck? Message us on WhatsApp') + '</a>'
        : '<a class="ghh-help" href="submitticket.php">' + _t('Still stuck? Open a support ticket') + '</a>';
    }
    function expired() {
      body.innerHTML = '<div class="ghh-state"><span class="ghh-state__hex">' + ic('refresh', 22) + '</span><h3>' + _t('Your session timed out') + '</h3><p>' + _t('For your security the hosting tools sign out after 10 minutes. Reload the page to continue where you left off.') + '</p><button type="button" class="ghh-btn ghh-btn--pri" data-reload>' + _t('Reload page') + '</button></div>';
      body.querySelector('[data-reload]').onclick = function () { location.reload(); };
    }
    function errBox(m, e) {
      var title = e && e.kind === 'network' ? _t('You are offline') : e && e.kind === 'timeout' ? _t('Still waiting for your server') : e && e.kind === 'unavailable' ? _t('Your hosting server is not answering') : _t('That did not work');
      return '<div class="ghh-state ghh-state--err" role="alert"><span class="ghh-state__hex">' + ic('alert', 22) + '</span><h3>' + title + '</h3><p>' + esc(m || _t('Please try again in a moment.')) + '</p>' +
        (!e || e.retry !== false ? '<button type="button" class="ghh-btn" data-retry>' + ic('refresh') + ' ' + _t('Try again') + '</button>' : '') + helpLink(e) + '</div>';
    }
    function empty(icon, title, text, cta) { return '<div class="ghh-state"><span class="ghh-state__hex">' + ic(icon, 22) + '</span><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (cta || '') + '</div>'; }
    function skel(n) { var s = '<div class="ghh-skel" aria-busy="true" aria-label="' + esc(_t('Loading')) + '">'; for (var i = 0; i < n; i++) s += '<div class="ghh-skel__row"><i></i><i></i><i></i></div>'; return s + '</div>'; }
    function can(sec, f) { var c = S.session && S.session.caps[sec]; return !!(c && c.indexOf(f) >= 0); }
    function bar(title, sub, actions) { return '<div class="ghh-bar"><div><h3>' + esc(title) + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="ghh-bar__act">' + (actions || '') + '</div></div>'; }
    function busy(b, on) { if (!b) return; b.disabled = on; b.classList.toggle('is-busy', on); }
    function retryOn(el, fn) { var r = el.querySelector('[data-retry]'); if (r) r.onclick = fn; }
    var B_ = function (s) { return '<b>' + ltr(s) + '</b>'; }; // bold technical value inside a sentence
    /* the row that holds `text` flashes once when the list redraws after an add (DNS record, mailbox, database…) */
    function hlNext(text) {
      text = String(text || '').trim().toLowerCase(); if (!text || !window.MutationObserver) return;
      var until = Date.now() + 8000, mo = new MutationObserver(function () {
        if (Date.now() > until) return mo.disconnect();
        var rows = body.querySelectorAll('tbody tr, ul > li');
        for (var i = 0; i < rows.length; i++) if (!rows[i].closest('form') && rows[i].textContent.toLowerCase().indexOf(text) >= 0) {
          mo.disconnect(); var r = rows[i]; r.classList.add('ghh-hl'); setTimeout(function () { r.classList.remove('ghh-hl'); }, 2800);
          if (r.scrollIntoView) r.scrollIntoView({ block: 'nearest' }); return;
        }
      });
      mo.observe(body, { childList: true, subtree: true });
    }

    /* inline confirm: replaces the action cell until confirmed or cancelled */
    function confirmIn(cell, text, label, run, rebind) {
      var keep = cell.innerHTML, re = function () { cell.innerHTML = keep; (rebind || bindAll)(); };
      cell.innerHTML = '<div class="ghh-confirm" role="group" aria-label="' + esc(_t('Confirm')) + '"><span>' + esc(text) + '</span><button type="button" class="ghh-btn ghh-btn--sm" data-no>' + _t('Cancel') + '</button><button type="button" class="ghh-btn ghh-btn--sm ghh-btn--danger" data-yes>' + esc(label) + '</button></div>';
      var no = cell.querySelector('[data-no]'), yes = cell.querySelector('[data-yes]');
      yes.focus();
      no.onclick = re;
      yes.onclick = function () { busy(yes, true); no.disabled = true; run(re); };
      cell.onkeydown = function (e) { if (e.key === 'Escape') no.click(); };
    }
    var bindAll = function () {};

    /* inline form panel above a list */
    function formPanel(slot, title, fields, submitLabel, onSubmit) {
      slot.innerHTML = '<form class="ghh-form" novalidate><div class="ghh-form__head"><h4>' + esc(title) + '</h4><button type="button" class="ghh-icon" data-close aria-label="' + esc(_t('Close')) + '">' + ic('x') + '</button></div><div class="ghh-form__grid">' + fields + '</div>' +
        '<p class="ghh-form__err" id="ghh-ferr-' + Math.random().toString(36).slice(2, 7) + '" role="alert" hidden></p><div class="ghh-form__foot"><button type="button" class="ghh-btn" data-close>' + _t('Cancel') + '</button><button class="ghh-btn ghh-btn--pri" type="submit">' + esc(submitLabel) + '</button></div></form>';
      var f = slot.querySelector('form'), err = f.querySelector('.ghh-form__err');
      [].forEach.call(f.querySelectorAll('[data-close]'), function (b) { b.onclick = function () { slot.innerHTML = ''; }; });
      [].forEach.call(f.querySelectorAll('[data-gen]'), function (b) { b.onclick = function () { var i = f.querySelector('[name="' + b.getAttribute('data-gen') + '"]'); i.value = genPass(); i.type = 'text'; i.select(); }; });
      f.onkeydown = function (e) { if (e.key === 'Escape') slot.innerHTML = ''; };
      f.onsubmit = function (e) {
        e.preventDefault(); err.hidden = true;
        var sb = f.querySelector('[type=submit]'); busy(sb, true);
        var data = {}; [].forEach.call(f.elements, function (el) { if (el.name) data[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
        [].forEach.call(f.querySelectorAll('[aria-invalid]'), function (x) { x.removeAttribute('aria-invalid'); });
        // required fields first: the browser's own check is off (novalidate), so name the empty field and focus it
        var miss = [].filter.call(f.querySelectorAll('[required]'), function (x) { return !x.closest('[hidden]') && !String(x.value || '').trim(); })[0];
        if (miss) { busy(sb, false); miss.setAttribute('aria-invalid', 'true'); miss.setAttribute('aria-describedby', err.id); err.textContent = _t('Fill in {field}.', { field: (f.querySelector('label[for="' + miss.id + '"]') || {}).textContent || _t('this field') }); err.hidden = false; miss.focus(); return; }
        onSubmit(data).then(function () { slot.innerHTML = ''; }, function (e2) {
          busy(sb, false); if (e2 && e2.code === 'expired') return expired();
          err.innerHTML = esc(e2 && e2.message || _t('Failed')) + (e2 && e2.retry ? ' ' + helpLink(e2) : ''); err.hidden = false;
          if (e2 && e2.kind === 'validation') { var bad = f.querySelector('input:not([type=hidden]), select, textarea'); [].some.call(f.querySelectorAll('[name]'), function (x) { var l = f.querySelector('label[for="' + x.id + '"]'); if (l && e2.message.toLowerCase().indexOf(l.textContent.trim().toLowerCase()) >= 0) { bad = x; return true; } return false; }); if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.setAttribute('aria-describedby', err.id); bad.focus(); } }
        });
      };
      var first = f.querySelector('input:not([type=hidden]), select, textarea'); if (first) first.focus();
      slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function fld(name, label, o) {
      o = o || {};
      var id = 'ghh-f-' + name + '-' + Math.random().toString(36).slice(2, 7);
      // values people type here are technical (addresses, hosts, paths, commands): left-to-right even in Arabic
      var dir = o.options || o.plain ? '' : ' dir="' + (o.area && !o.code ? 'auto' : 'ltr') + '"';
      var input = o.options ? '<select id="' + id + '" name="' + name + '">' + o.options.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === o.value ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'
        : o.area ? '<textarea id="' + id + '" name="' + name + '" rows="3"' + dir + (o.required ? ' required' : '') + '>' + esc(o.value || '') + '</textarea>'
        : '<input id="' + id + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + esc(o.value == null ? '' : o.value) + '"' + dir + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.required ? ' required' : '') + (o.min != null ? ' min="' + o.min + '"' : '') + ' autocomplete="' + (o.type === 'password' ? 'new-password' : 'off') + '" spellcheck="false">';
      var addon = o.suffix ? '<span class="ghh-addon" dir="ltr">' + esc(o.suffix) + '</span>' : o.prefix ? '<span class="ghh-addon ghh-addon--pre" dir="ltr">' + esc(o.prefix) + '</span>' : '';
      var gen = o.type === 'password' ? '<button type="button" class="ghh-btn ghh-btn--sm" data-gen="' + name + '">' + _t('Generate') + '</button>' : '';
      // the input row keeps left-to-right order (prefix, value, suffix) so "info" + "@shop.com" reads as one address
      return '<div class="ghh-fld' + (o.wide ? ' ghh-fld--wide' : '') + '" data-f="' + name + '"' + (o.hidden ? ' hidden' : '') + '><label for="' + id + '">' + esc(label) + '</label><div class="ghh-in' + (o.prefix ? ' has-pre' : '') + (o.prefix || o.suffix ? ' ghh-in--ltr' : '') + '">' + (o.prefix ? addon : '') + input + (o.suffix ? addon : '') + gen + '</div>' + (o.hint ? '<small>' + esc(o.hint) + '</small>' : '') + '</div>';
    }

    /* ------------------------------------------------------------ boot */
    api('session').then(function (s) {
      S.session = s;
      S.domain = s.domains.indexOf(s.domain) >= 0 ? s.domain : s.domains[0] || '';
      $('[data-sub]').innerHTML = ltr(s.domain || s.username) + (s.server ? ' <span aria-hidden="true">·</span> ' + esc(s.server) : '');
      var sel = $('[data-domsel]');
      [].forEach.call(document.querySelectorAll('.ghh .nice-select'), function (n) { n.remove(); });
      sel.innerHTML = s.domains.map(function (d) { return '<option' + (d === S.domain ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('');
      sel.onchange = function () { S.domain = sel.value; S.cache = {}; show(S.tab); };
      ghDrop(sel);
      var vis = function (it) { var c = s.caps[it[2]]; return !!(c && c.length && (!it[3] || c.indexOf(it[3]) >= 0)); };
      var groups = NAV.map(function (g) { return [g[0], g[1].filter(vis)]; }).filter(function (g) { return g[1].length; });
      var tabs = [].concat.apply([], groups.map(function (g) { return g[1].map(function (t) { return t.concat([g[0]]); }); }));
      S.tabs = tabs;
      var tl = $('[data-tabs]');
      tl.innerHTML = groups.map(function (g) {
        return '<div class="ghh-nav__grp"' + (g[0] ? ' role="group" aria-label="' + esc(_t(g[0])) + '"' : '') + '>' + (g[0] ? '<span class="ghh-nav__h" aria-hidden="true">' + esc(_t(g[0])) + '</span>' : '') +
          g[1].map(function (t) { return '<button type="button" class="ghh-nav__it" id="ghh-tab-' + t[0] + '" aria-controls="ghh-panel" aria-current="false" data-tab="' + t[0] + '">' + ic(t[0], 16) + '<span>' + esc(_t(t[1])) + '</span></button>'; }).join('') + '</div>';
      }).join('');
      tl.onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) show(b.getAttribute('data-tab')); };
      tl.onkeydown = function (e) {
        var bs = [].slice.call(tl.querySelectorAll('[data-tab]')), i = bs.indexOf(document.activeElement);
        if (i < 0) return;
        // the rail is vertical on desktop; in the horizontal pill bar "next" is to the left in right-to-left layouts
        var fwd = e.key === 'ArrowDown' || e.key === (RTL ? 'ArrowLeft' : 'ArrowRight'), back = e.key === 'ArrowUp' || e.key === (RTL ? 'ArrowRight' : 'ArrowLeft');
        var n = fwd ? i + 1 : back ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : null;
        if (n === null) return; e.preventDefault(); n = (n + bs.length) % bs.length; bs[n].focus();
      };
      var want; try { want = sessionStorage.getItem('gh-hosting-tab-' + G.sid); } catch (e) {}
      if (/^#hosting-/.test(location.hash)) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      show(tabs.some(function (t) { return t[0] === want; }) ? want : tabs[0] ? tabs[0][0] : null);
    }, function (e) {
      if (e && e.code === 'expired') return expired();
      body.innerHTML = errBox(e && e.message); retryOn(body, function () { root.remove(); mount(G); });
    });

    function show(tab, focus) {
      if (!tab) { body.innerHTML = empty('shield', _t('No tools available'), _t('This hosting panel does not offer any self-service tools here yet. Use the control panel button instead.')); return; }
      S.tab = tab;
      [].forEach.call(root.querySelectorAll('[data-tab]'), function (b) { var on = b.getAttribute('data-tab') === tab; b.setAttribute('aria-current', on ? 'page' : 'false'); if (on && b.scrollIntoView && b.parentNode.parentNode.scrollWidth > b.parentNode.parentNode.clientWidth) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
      body.setAttribute('aria-labelledby', 'ghh-tab-' + tab);
      $('[data-dom]').hidden = !DOMAIN_VIEWS[tab] || S.session.domains.length < 2;
      try { sessionStorage.setItem('gh-hosting-tab-' + G.sid, tab); } catch (e) {} // no URL hash: the theme's own tabs read it and blank the page
      bindAll = function () {};
      ({ overview: overview, health: health, dns: dns, subdomains: subdomains, aliases: aliases, redirects: redirects, php: php, email: email, forwarders: email, autoresponders: autoresponders, spam: spam,
        files: files, ftp: ftp, protect: protect, databases: databases, cron: cron, ssl: ssl, backups: backups, wordpress: wordpress })[tab]();
      if (focus) body.focus({ preventScroll: true });
    }

    /* ------------------------------------------------------------ command palette (Ctrl/⌘+K or the header search button) */
    var pal = null, palIn = null, palList = null, palAct = 0, palRes = [], palBack = null, palPending = 0;
    var RKEY = 'gh-hosting-recent-' + G.sid;
    var tabOn = function (v) { return !!root.querySelector('[data-tab="' + v + '"]'); };
    /** wait for an element of the current view (forms and rows render after their data arrives) */
    function whenEl(sel, fn) { var tab = S.tab, n = 0; (function look() { if (S.tab !== tab) return; var el = body.querySelector(sel); if (el) return fn(el); if (++n < 50) setTimeout(look, 100); })(); }
    /** highlight the row / card that contains a value and focus its first control */
    function spot(text, sel, focusSel) {
      var tab = S.tab, n = 0;
      (function look() {
        if (S.tab !== tab) return;
        var hit = [].filter.call(body.querySelectorAll(sel || 'tbody tr, .ghh-card, .ghh-fwd li'), function (e) { return e.textContent.indexOf(text) >= 0; })[0];
        if (!hit) { if (++n < 50) setTimeout(look, 100); return; }
        hit.classList.add('ghh-hl'); hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
        var f = hit.querySelector(focusSel || 'button, a[href]'); if (f) f.focus({ preventScroll: true });
        setTimeout(function () { hit.classList.remove('ghh-hl'); }, 2600);
      })();
    }
    function go(tab, d, after) { if (d && d !== S.domain) setDomain(d); show(tab, true); if (after) after(); }
    function clickWhen(sel) { return function () { whenEl(sel, function (b) { b.click(); }); }; }
    function palStatic() {
      var out = [], ds = (S.session && S.session.domains) || [], cur = S.domain;
      (S.tabs || []).forEach(function (t) { out.push({ id: 'tab:' + t[0], g: 'sec', label: _t(t[1]), sub: t[4] ? _t(t[4]) : _t('Hosting'), icon: t[0], kw: t[1] + ' ' + t[0], run: function () { show(t[0], true); } }); });
      var per = function (d) {
        if (can('dns', 'add') && tabOn('dns')) out.push({ id: 'act:dns:' + d, g: 'act', label: _t('Add DNS record'), sub: d, icon: 'plus', kw: 'add dns record a cname mx txt', run: function () { go('dns', d, clickWhen('[data-add]')); } });
        if (can('email', 'create') && tabOn('email')) out.push({ id: 'act:mbx:' + d, g: 'act', label: _t('Create mailbox on {d}', { d: d }), sub: _t('Email'), icon: 'email', kw: 'create new mailbox email account ' + d, run: function () { go('email', d, clickWhen('[data-add]')); } });
        if (can('ssl', 'issue') && tabOn('ssl')) out.push({ id: 'act:ssl:' + d, g: 'act', label: _t('Issue SSL for {d}', { d: d }), sub: _t('Free Let\'s Encrypt certificate'), icon: 'ssl', kw: 'issue ssl https certificate lets encrypt ' + d, run: function () { show('ssl', true); spot(d, '.ghh-ssl', '[data-issue]'); } });
        if (tabOn('health')) {
          out.push({ id: 'act:health:' + d, g: 'act', label: _t('Check health of {d}', { d: d }), sub: _t('Site health'), icon: 'health', kw: 'check site health ' + d, run: function () { go('health', d); } });
          out.push({ id: 'act:connect:' + d, g: 'act', label: _t('Connect domain {d}', { d: d }), sub: _t('Nameservers or DNS records'), icon: 'aliases', kw: 'connect domain point nameservers ' + d, run: function () { openConnect(d); } });
        }
        if (tabOn('files')) out.push({ id: 'act:files:' + d, g: 'act', label: _t('Open file manager for {d}', { d: d }), sub: 'public_html', icon: 'files', kw: 'open file manager files upload ' + d, run: function () { S.pathSet = 1; S.path = '/domains/' + d + '/public_html'; go('files', d); } });
      };
      per(cur); ds.forEach(function (d) { if (d !== cur) per(d); });
      if (can('subdomains', 'add') && tabOn('subdomains')) out.push({ id: 'act:sub', g: 'act', label: _t('New subdomain'), sub: cur, icon: 'subdomains', kw: 'new subdomain add', run: function () { go('subdomains', cur, clickWhen('[data-add]')); } });
      if (tabOn('forwarders')) out.push({ id: 'act:fwd', g: 'act', label: _t('New forwarder'), sub: cur, icon: 'forwarders', kw: 'new email forwarder forward', run: function () { go('forwarders', cur, clickWhen('[data-addf]')); } });
      if (can('databases', 'create') && tabOn('databases')) out.push({ id: 'act:db', g: 'act', label: _t('New database'), sub: 'MySQL', icon: 'databases', kw: 'new mysql database create', run: function () { go('databases', null, clickWhen('[data-add]')); } });
      if (can('ftp', 'create') && tabOn('ftp')) out.push({ id: 'act:ftp', g: 'act', label: _t('New FTP account'), sub: cur, icon: 'ftp', kw: 'new ftp account login', run: function () { go('ftp', cur, clickWhen('[data-add]')); } });
      if (can('cron', 'add') && tabOn('cron')) out.push({ id: 'act:cron', g: 'act', label: _t('New cron job'), sub: _t('Cron jobs'), icon: 'cron', kw: 'new cron job schedule', run: function () { go('cron', null, clickWhen('[data-add]')); } });
      if (can('backups', 'create') && tabOn('backups')) out.push({ id: 'act:backup', g: 'act', label: _t('Create backup'), sub: _t('Backups'), icon: 'backups', kw: 'create backup', run: function () { go('backups', null, function () { whenEl('[data-new]', function (b) { b.focus(); }); }); } });
      if (ds.length > 1) ds.forEach(function (d) { out.push({ id: 'dom:' + d, g: 'dom', label: d, ltr: 1, sub: d === cur ? _t('Selected domain') : _t('Switch to this domain'), icon: 'dns', kw: 'domain switch', run: function () { go(DOMAIN_VIEWS[S.tab] ? S.tab : 'dns', d); } }); });
      return out;
    }
    // account items fetched on first open: [cache key, section, query, group, items(response, domain)]
    function palSources() {
      var ds = ((S.session && S.session.domains) || []).slice(0, 8), src = [], d0 = S.domain;
      if (tabOn('dns')) src.push(['dns:' + d0, 'dns', { domain: d0 }, 'dns', function (r) { return (r.records || []).map(function (x) { var nm = x.name === '@' ? d0 : x.name + '.' + d0; return { id: 'rec:' + d0 + ':' + x.id, g: 'dns', label: x.type + '  ' + nm, ltr: 1, sub: x.value, icon: 'dns', kw: 'dns record', run: function () { if (!x.readonly) S.pend = { dnsEdit: x.id, domain: d0 }; go('dns', d0, x.readonly ? function () { spot(x.value); } : null); } }; }); }]);
      if (can('email', 'list') && tabOn('email')) ds.forEach(function (d) { src.push(['email:' + d, 'email', { domain: d }, 'mbx', function (r) { return (r.mailboxes || []).map(function (m) { return { id: 'mbx:' + m.email, g: 'mbx', label: m.email, ltr: 1, sub: _t('Mailbox'), icon: 'email', kw: 'mailbox email', run: function () { go('email', d); spot(m.email); } }; }); }]); });
      if (tabOn('databases')) src.push(['databases:', 'databases', null, 'db', function (r) { return (r.databases || []).map(function (db) { return { id: 'db:' + db.name, g: 'db', label: db.name, ltr: 1, sub: db.users.length ? db.users.join(', ') : _t('Database'), icon: 'databases', kw: 'mysql database ' + db.users.join(' '), run: function () { go('databases'); spot(db.name, '.ghh-card'); } }; }); }]);
      if (tabOn('ftp')) ds.forEach(function (d) { src.push(['ftp:' + d, 'ftp', { domain: d }, 'ftp', function (r) { return (r.accounts || []).map(function (x) { return { id: 'ftp:' + x.login, g: 'ftp', label: x.login, ltr: 1, sub: x.path || '/', icon: 'ftp', kw: 'ftp account', run: function () { go('ftp', d); spot(x.login); } }; }); }]); });
      if (tabOn('subdomains')) ds.forEach(function (d) { src.push(['subdomains:' + d, 'subdomains', { domain: d }, 'sub', function (r) { return (r.subdomains || []).map(function (x) { return { id: 'sub:' + x + '.' + d, g: 'sub', label: x + '.' + d, ltr: 1, sub: _t('Subdomain'), icon: 'subdomains', kw: 'subdomain', run: function () { go('subdomains', d); spot(x + '.' + d); } }; }); }]); });
      return src;
    }
    function palLoad() {
      palSources().forEach(function (s) {
        if (PC[s[0]]) return;
        palPending++;
        PC[s[0]] = { items: [], p: api(s[1], s[2]).then(function (r) { PC[s[0]].items = s[4](r); }, function () { delete PC[s[0]]; }).then(function () { palPending--; if (pal && !pal.hidden) palRender(true); }) };
      });
    }
    function palAll() { var out = palStatic(), seen = {}; palSources().forEach(function (s) { if (PC[s[0]]) out = out.concat(PC[s[0]].items); }); return out.filter(function (x) { if (seen[x.id]) return false; seen[x.id] = 1; return true; }); }
    var GROUPS = { rec: N_('Recent'), act: N_('Actions'), sec: N_('Sections'), dom: N_('Domains'), mbx: N_('Mailboxes'), dns: N_('DNS records'), db: N_('Databases'), ftp: N_('FTP accounts'), sub: N_('Subdomains') };
    var ORDER = ['rec', 'sec', 'act', 'dom', 'mbx', 'dns', 'db', 'ftp', 'sub'];
    // case, Arabic diacritics and letter variants do not matter when searching
    function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[⁦-⁩ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي'); }
    function recent(add) {
      var r = []; try { r = JSON.parse(sessionStorage.getItem(RKEY) || '[]') || []; } catch (e) {}
      if (add) { r = [add].concat(r.filter(function (x) { return x !== add; })).slice(0, 6); try { sessionStorage.setItem(RKEY, JSON.stringify(r)); } catch (e) {} }
      return r;
    }
    function palRender(keep) {
      var q = norm(palIn.value.trim()), toks = q.split(/\s+/).filter(Boolean), all = palAll(), list = [];
      var prevId = keep && palRes[palAct] ? palRes[palAct].id : null;
      if (!toks.length) {
        var byId = {}; all.forEach(function (x) { byId[x.id] = x; });
        recent().forEach(function (id) { if (byId[id]) list.push({ it: byId[id], g: 'rec' }); });
        all.filter(function (x) { return x.g === 'sec'; }).forEach(function (x) { list.push({ it: x, g: 'sec' }); });
        all.filter(function (x) { return x.g === 'act'; }).slice(0, 6).forEach(function (x) { list.push({ it: x, g: 'act' }); });
      } else {
        var cap = {};
        all.map(function (x) {
          var lab = norm(x.label), hay = lab + ' ' + norm(x.sub) + ' ' + norm(x.kw) + ' ' + norm(_t(GROUPS[x.g]));
          if (!toks.every(function (t) { return hay.indexOf(t) >= 0; })) return null;
          return { it: x, g: x.g, s: (lab.indexOf(q) === 0 ? 0 : lab.indexOf(q) > 0 ? 1 : 2) + ORDER.indexOf(x.g) / 100 };
        }).filter(Boolean).sort(function (a, b) { return a.s - b.s; }).forEach(function (r) { cap[r.g] = (cap[r.g] || 0) + 1; if (cap[r.g] <= 8) list.push(r); });
      }
      // groups in order of their best match (a DNS record named MX beats actions that only mention MX), then the usual order
      var best = {}; list.forEach(function (r) { var v = r.s == null ? 0 : Math.floor(r.s); if (!(r.g in best) || v < best[r.g]) best[r.g] = v; });
      list.sort(function (a, b) { return (best[a.g] - best[b.g]) || (ORDER.indexOf(a.g) - ORDER.indexOf(b.g)) || ((a.s || 0) - (b.s || 0)); });
      palRes = list.map(function (r) { return r.it; });
      palAct = 0; if (prevId) palRes.forEach(function (x, i) { if (x.id === prevId) palAct = i; });
      var html = '', g = null, gi = 0;
      list.forEach(function (r, i) {
        if (r.g !== g) { if (g) html += '</div>'; g = r.g; gi++; html += '<div role="group" aria-labelledby="ghh-pg-' + gi + '"><div class="ghh-pal__h" id="ghh-pg-' + gi + '" role="presentation">' + esc(_t(GROUPS[g])) + '</div>'; }
        var x = r.it;
        html += '<div class="ghh-pal__it" role="option" id="ghh-po-' + i + '" data-k="' + i + '" aria-selected="false"><span class="ghh-pal__ic">' + ic(r.g === 'rec' ? 'clock' : x.icon in I ? x.icon : 'bolt', 16) + '</span><span class="ghh-pal__tx"><b' + (x.ltr ? ' dir="ltr"' : '') + '>' + esc(x.label) + '</b>' + (x.sub ? '<small' + (x.ltr || /^[\x20-\x7e]+$/.test(x.sub) ? ' dir="ltr"' : '') + '>' + esc(x.sub) + '</small>' : '') + '</span>' + ic('redirects', 14) + '</div>';
      });
      if (g) html += '</div>';
      if (!list.length) html = '<p class="ghh-pal__empty">' + (palPending ? _t('Searching your account…') : esc(_t('Nothing found for “{q}”', { q: palIn.value.trim() }))) + '</p>';
      else if (palPending) html += '<p class="ghh-pal__more" aria-hidden="true">' + _t('Searching your account…') + '</p>';
      palList.innerHTML = html;
      pal.querySelector('[data-pal-count]').textContent = list.length ? _tp(list.length, '{n} result', '{n} results') : _t('No results');
      palMove(0);
    }
    function palMove(d) {
      if (!palRes.length) { palIn.removeAttribute('aria-activedescendant'); return; }
      palAct = (palAct + d + palRes.length) % palRes.length;
      [].forEach.call(palList.querySelectorAll('[role=option]'), function (o) { var on = +o.getAttribute('data-k') === palAct; o.setAttribute('aria-selected', String(on)); o.classList.toggle('is-act', on); if (on && d) o.scrollIntoView({ block: 'nearest' }); });
      palIn.setAttribute('aria-activedescendant', 'ghh-po-' + palAct);
    }
    function palRun(i) { var x = palRes[i]; if (!x) return; recent(x.id); palClose(false); x.run(); }
    function palBuild() {
      pal = document.createElement('div'); pal.className = 'ghh-pal'; pal.hidden = true;
      pal.innerHTML = '<div class="ghh-pal__scrim" data-pal-close></div><div class="ghh-pal__box" role="dialog" aria-modal="true" aria-labelledby="ghh-pal-t">' +
        '<h2 class="ghh-sr" id="ghh-pal-t">' + _t('Search hosting tools') + '</h2>' +
        '<div class="ghh-pal__bar">' + ic('search', 18) + '<input type="text" role="combobox" aria-expanded="true" aria-controls="ghh-pal-list" aria-autocomplete="list" aria-labelledby="ghh-pal-t" placeholder="' + esc(_t('Search tools, domains, mailboxes, DNS…')) + '" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">' +
        '<button type="button" class="ghh-pal__x" data-pal-close aria-label="' + esc(_t('Close search')) + '"><span class="ghh-pal__esc">Esc</span>' + ic('x', 16) + '</button></div>' +
        '<div class="ghh-pal__list" id="ghh-pal-list" role="listbox" aria-label="' + esc(_t('Results')) + '"></div>' +
        '<div class="ghh-pal__foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> ' + _t('to move') + '</span><span><kbd>Enter</kbd> ' + _t('to open') + '</span><span><kbd>Esc</kbd> ' + _t('to close') + '</span></div>' +
        '<p class="ghh-sr" aria-live="polite" data-pal-count></p></div>';
      root.appendChild(pal);
      palIn = pal.querySelector('input'); palList = pal.querySelector('[role=listbox]');
      palIn.oninput = function () { palRender(); };
      pal.addEventListener('click', function (e) { if (e.target.closest('[data-pal-close]')) return palClose(); var o = e.target.closest('[role=option]'); if (o) palRun(+o.getAttribute('data-k')); });
      palList.addEventListener('mousemove', function (e) { var o = e.target.closest('[role=option]'); if (o && +o.getAttribute('data-k') !== palAct) { palAct = +o.getAttribute('data-k'); palMove(0); } });
      pal.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return palClose(); }
        if (e.key === 'Tab') { e.preventDefault(); var x = pal.querySelector('.ghh-pal__x'); (document.activeElement === palIn ? x : palIn).focus(); return; } // keep focus inside the dialog
        if (e.target !== palIn) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); palMove(e.key === 'ArrowDown' ? 1 : -1); }
        else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); palMove(e.key === 'PageDown' ? Math.min(5, palRes.length - 1 - palAct) : -Math.min(5, palAct)); }
        else if (e.key === 'Enter') { e.preventDefault(); palRun(palAct); }
      });
    }
    function palOpen() {
      if (!S.session) return;
      if (!pal) palBuild();
      if (!pal.hidden) { palIn.focus(); palIn.select(); return; }
      palBack = document.activeElement;
      pal.hidden = false; document.documentElement.classList.add('ghh-pal-on');
      palIn.value = ''; palRender(); palIn.focus(); palLoad();
    }
    function palClose(back) {
      if (!pal || pal.hidden) return;
      pal.hidden = true; document.documentElement.classList.remove('ghh-pal-on');
      if (back !== false && palBack && document.contains(palBack)) palBack.focus({ preventScroll: true });
    }
    $('[data-pal]').onclick = palOpen;
    // Ctrl+K (⌘K on a Mac) only while this panel is on the page; elsewhere the browser keeps its own shortcut
    function palKey(e) {
      if (!document.body.contains(root)) { document.removeEventListener('keydown', palKey, true); return; }
      if (e.key !== 'k' && e.key !== 'K' || e.altKey || e.shiftKey || !(MAC ? e.metaKey : e.ctrlKey) || !S.session) return;
      e.preventDefault(); e.stopPropagation();
      if (pal && !pal.hidden) palClose(); else palOpen();
    }
    document.addEventListener('keydown', palKey, true);

    /* ------------------------------------------------------------ copy buttons (any [data-copy] in the panel) */
    function copyBtn(text, label) { return '<button type="button" class="ghh-copy" data-copy="' + esc(text) + '" aria-label="' + esc(_t('Copy {what}', { what: label || text })) + '">' + ic('copy', 14) + '<span>' + _t('Copy') + '</span></button>'; }
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-copy]'); if (!b || !root.contains(b)) return;
      var t = b.getAttribute('data-copy'), done = function () { b.classList.add('is-done'); b.querySelector('span').textContent = _t('Copied'); setTimeout(function () { b.classList.remove('is-done'); b.querySelector('span').textContent = _t('Copy'); }, 1600); };
      var legacy = function () { var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (er) { toast(_t('Copy failed. Select the text and copy it by hand.'), 'err'); } ta.remove(); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, legacy); else legacy();
    });
    function downloadBlob(blob, name) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
    function openConsole() {
      var b = [].slice.call(document.querySelectorAll('.gh-console-btn, a, button, input[type=submit]')).filter(function (x) { return !root.contains(x) && (x.classList.contains('gh-console-btn') || /open advanced console|log ?in to (directadmin|cpanel|plesk)/i.test(x.value || x.textContent || '')); })[0];
      if (b) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.classList.add('gh-pulse'); setTimeout(function () { b.classList.remove('gh-pulse'); }, 2400); toast(_t('Use "Open advanced console" to open the full control panel.')); }
      else toast(_t('Open the advanced console from the service page to change this setting.'), 'err');
    }

    /* ------------------------------------------------------------ Site health */
    var HEX = function (st) { return '<span class="ghh-hx ghh-hx--' + st + '" aria-hidden="true">' + (st === 'ok' ? '<i></i>' : '!') + '</span>'; };
    var ST_LABEL = { ok: _t('OK'), warn: _t('Needs attention'), fail: _t('Problem') };
    function ring(score, sz) {
      sz = sz || 112; var r = sz / 2 - 8, c = 2 * Math.PI * r, col = score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'fail';
      return '<span class="ghh-ring ghh-ring--' + col + '" style="width:' + sz + 'px;height:' + sz + 'px" role="img" aria-label="' + esc(_t('Health score {n} out of 100', { n: score })) + '"><svg viewBox="0 0 ' + sz + ' ' + sz + '" aria-hidden="true"><circle cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" class="ghh-ring__bg"/><circle cx="' + sz / 2 + '" cy="' + sz / 2 + '" r="' + r + '" class="ghh-ring__fg" stroke-dasharray="' + (c * score / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + sz / 2 + ' ' + sz / 2 + ')"/></svg><b>' + score + '</b></span>';
    }
    function healthSkel() { return '<div class="ghh-hsum ghh-hsum--skel" aria-busy="true" aria-label="' + esc(_t('Running checks')) + '"><span class="ghh-ring ghh-ring--skel"></span><div><i></i><i></i></div></div>' + skel(5); }
    S.health = {};
    function health() {
      var d = S.domain, many = (S.session.domains || []).length > 1;
      if (S.openConnect) { var cd = S.openConnect; S.openConnect = null; return connectWizard(cd); }
      body.innerHTML = bar(_t('Site health'), _t('Live checks of {d}: DNS, website, SSL, email and storage. Results are kept for 5 minutes.', { d: B_(d) }), (many ? '<button type="button" class="ghh-btn" data-all>' + ic('dns') + ' ' + _t('Check all domains') + '</button>' : '') + '<button type="button" class="ghh-btn ghh-btn--pri" data-re>' + ic('refresh') + ' ' + _t('Re-check') + '</button>') + domChips(d, _t('Domain')) + '<div data-list>' + healthSkel() + '</div>';
      var list = body.querySelector('[data-list]'), rep = null;
      bindChips(body, function (x) { setDomain(x); show('health'); });
      var load = function (fresh) {
        list.innerHTML = healthSkel();
        api('health', fresh ? { domain: d, fresh: 1 } : { domain: d }).then(function (r) { rep = r; S.health[d] = r; render(); }, function (e) { fail(e, list); retryOn(list, function () { load(); }); });
      };
      var render = function () {
        var n = rep.issues, fails = 0; rep.sections.forEach(function (s) { s.items.forEach(function (i) { if (i.status === 'fail') fails++; }); });
        var head = n ? _tp(n, '{n} thing needs attention', '{n} things need attention') : _t('Everything looks good');
        var txt = n ? (fails ? esc(_tp(fails, '{n} problem to fix first. Use the Fix buttons where shown, the rest needs a change at your domain or in your site.', '{n} problems to fix first. Use the Fix buttons where shown, the rest needs a change at your domain or in your site.')) : esc(_t('No hard problems, a few improvements are recommended.'))) : _t('{d} is online, secure and set up for email.', { d: ltr(d) });
        list.innerHTML = '<div class="ghh-hsum">' + ring(rep.score) + '<div><h4>' + esc(head) + '</h4><p>' + txt + '</p><span class="ghh-muted">' + _t('Checked {when}', { when: when(rep.checkedAt) }) + '</span></div></div>' +
          rep.sections.map(function (s) {
            var bad = s.items.filter(function (i) { return i.status !== 'ok'; }).length;
            return '<section class="ghh-hsec" aria-label="' + esc(L10N.srv(s.title)) + '"><h4 class="ghh-hsec__h">' + esc(L10N.srv(s.title)) + '<span>' + esc(_t('{a} of {b} need attention', { a: bad, b: s.items.length })) + '</span></h4><ul class="ghh-hlist">' + s.items.map(function (it) {
              var fx = it.fix ? '<button type="button" class="ghh-btn ghh-btn--sm' + (it.status === 'fail' ? ' ghh-btn--pri' : '') + '" data-fix="' + esc(it.id) + '">' + (it.fix.kind === 'tab' || it.fix.kind === 'console' ? ic('ext', 13) + ' ' : it.fix.kind === 'connect' ? ic('aliases', 13) + ' ' : '') + esc(L10N.srv(it.fix.label)) + '</button>' : '';
              var man = it.manual ? '<div class="ghh-rec"><span class="ghh-type ghh-type--txt">' + esc(it.manual.type) + '</span><code>' + esc(it.manual.name === '@' ? d : it.manual.name + '.' + d) + '</code><code class="ghh-rec__v">' + esc(it.manual.value) + '</code>' + copyBtn(it.manual.value, _t('{name} value', { name: it.manual.name })) + '<small>' + _t('Add this record where your DNS is hosted.') + '</small></div>' : '';
              return '<li class="ghh-hrow ghh-hrow--' + it.status + '" data-id="' + esc(it.id) + '">' + HEX(it.status) + '<div class="ghh-hrow__tx"><b>' + esc(L10N.srv(it.title)) + '<span class="ghh-sr"> (' + ST_LABEL[it.status] + ')</span></b><p dir="auto">' + esc(L10N.srv(it.detail)) + '</p>' + man + '</div><div class="ghh-act ghh-hrow__act" data-fixcell>' + fx + '</div></li>';
            }).join('') + '</ul></section>';
          }).join('');
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-fix]'), function (b) {
          b.onclick = function () {
            var id = b.getAttribute('data-fix'), it = null; rep.sections.forEach(function (s) { s.items.forEach(function (i) { if (i.id === id) it = i; }); });
            if (!it) return; var f = it.fix, cell = b.closest('[data-fixcell]');
            if (f.kind === 'tab') return show(f.tab, true);
            if (f.kind === 'console') return openConsole();
            if (f.kind === 'connect') return connectWizard(d);
            if (f.kind === 'dns') return confirmIn(cell, _t('Add TXT {name}?', { name: f.record.name === '@' ? d : f.record.name + '.' + d }), _t('Add record'), function (back) {
              api('dns', null, { json: { op: 'add', domain: d, record: f.record } }).then(function (r) { toast(r.message); load(true); }, function (e) { fail(e); back(); });
            });
            if (f.kind === 'ssl') return confirmIn(cell, _t('Request a free Let\'s Encrypt certificate for {d} and www?', { d: d }), L10N.srv(f.label), function (back) {
              api('ssl', null, { json: { op: 'issue', domain: d, www: true } }).then(function (r) { toast(r.message); back(); setTimeout(function () { if (S.tab === 'health' && S.domain === d) load(true); }, 9000); }, function (e) { fail(e); back(); });
            });
          };
        });
      };
      body.querySelector('[data-re]').onclick = function () { load(true); };
      var all = body.querySelector('[data-all]');
      if (all) all.onclick = function () {
        busy(all, true); list.innerHTML = healthSkel();
        api('health', { all: 1 }).then(function (r) {
          busy(all, false);
          r.results.forEach(function (x) { S.health[x.domain] = x; });
          list.innerHTML = '<h4 class="ghh-h4" style="margin-top:0!important">' + _t('All domains') + '</h4><div class="ghh-hall">' + r.results.map(function (x) {
            return '<button type="button" class="ghh-hall__it" data-pick="' + esc(x.domain) + '">' + ring(x.score, 56) + '<span><b>' + ltr(x.domain) + '</b><small>' + esc((x.issues ? _tp(x.issues, '{n} to look at', '{n} to look at') : _t('All good')) + (x.connected ? '' : ' · ' + _t('not connected'))) + '</small></span>' + ic('redirects', 14) + '</button>';
          }).join('') + '</div>' + (r.more ? '<p class="ghh-note">' + esc(_tp(r.more, '{n} more domain not shown; pick it from the Domain list.', '{n} more domains not shown; pick them from the Domain list.')) + '</p>' : '');
          [].forEach.call(list.querySelectorAll('[data-pick]'), function (b) { b.onclick = function () { setDomain(b.getAttribute('data-pick')); show('health'); }; });
        }, function (e) { busy(all, false); fail(e, list); retryOn(list, function () { load(); }); });
      };
      load();
    }

    /* ------------------------------------------------------------ Connect my domain */
    var connectTimer = null;
    function connectWizard(d) {
      if (connectTimer) { clearInterval(connectTimer); connectTimer = null; }
      setDomain(d); S.tab = 'health';
      body.innerHTML = '<button type="button" class="ghh-link" data-back>' + ic('up', 14) + ' ' + _t('Back to site health') + '</button>' + bar(_t('Connect {d}', { d: d }), _t('Point {d} at this hosting so your website and email work here. Choose one of the two ways below.', { d: B_(d) }), '') + '<div data-list>' + skel(4) + '</div>';
      body.querySelector('[data-back]').onclick = function () { stop(); show('health'); };
      var list = body.querySelector('[data-list]'), st = null, started = Date.now(), live, mailOn = false;
      var stop = function () { if (connectTimer) { clearInterval(connectTimer); connectTimer = null; } };
      var LIVE = function () { return live ? ' · ' + _t('checking again every 30 s') : ''; };
      // provider steps come from the server in English; the server IP and our nameservers are set in bold
      var steps = function (arr) { return '<ol class="ghh-steps">' + arr.map(function (s) { return '<li><span dir="auto">' + esc(L10N.srv(s)).replace(/the server IP/g, '<b>' + esc(st.serverIp || 'the server IP') + '</b>').replace(/(two GlobalHostia nameservers)/g, '<b>$1</b>') + '</span></li>'; }).join('') + '</ol>'; };
      var rec = function (type, name, value, extra) { return '<tr><td data-l="' + esc(_t('Type')) + '"><span class="ghh-type ghh-type--' + type.toLowerCase() + '">' + type + '</span></td><td data-l="' + esc(_t('Name')) + '"><code>' + esc(name) + '</code></td><td data-l="' + esc(_t('Value')) + '"><code>' + esc(value) + '</code>' + (extra ? ' <span class="ghh-pill ghh-pill--muted">' + esc(extra) + '</span>' : '') + '</td><td class="ghh-act">' + copyBtn(value, type + ' ' + name) + '</td></tr>'; };
      var records = function () {
        var ip = st.serverIp || '';
        return '<div class="ghh-tw ghh-tw--recs"><table class="ghh-t"><thead><tr><th scope="col">' + _t('Type') + '</th><th scope="col">' + _t('Name') + '</th><th scope="col">' + _t('Value') + '</th><th scope="col"><span class="ghh-sr">' + _t('Copy') + '</span></th></tr></thead><tbody>' +
          rec('A', '@', ip) + rec('CNAME', 'www', d) +
          (mailOn ? rec('A', 'mail', ip) + rec('MX', '@', 'mail.' + d, _t('priority {n}', { n: 10 })) + rec('TXT', '@', 'v=spf1 a mx ip4:' + ip + ' ~all') : '') + '</tbody></table></div>';
      };
      var progress = function () {
        return '<ul class="ghh-live__steps">' + st.steps.map(function (s) { return '<li class="' + (s.ok ? 'is-ok' : '') + '">' + HEX(s.ok ? 'ok' : 'warn') + '<span><b>' + esc(L10N.srv(s.label)) + '<span class="ghh-sr"> (' + (s.ok ? _t('done') : _t('waiting')) + ')</span></b><small dir="auto">' + esc(L10N.srv(s.detail)) + '</small></span></li>'; }).join('') + '</ul>';
      };
      var render = function () {
        var p = st.provider, reg = st.registrarProvider, nsProv = reg && p.id === 'cloudflare' ? reg : p;
        var who = _t('DNS for {d} is hosted at {provider}', { d: ltr(d), provider: '<b>' + esc(p.id === 'generic' ? (st.current.ns[0] || _t('an unknown provider')).replace(/^[^.]+\./, '') : p.name) + '</b>' });
        var done = st.connected;
        list.innerHTML =
          '<div class="ghh-cxinfo">' + ic('dns', 16) + '<span>' + who + (st.registrar ? '. ' + _t('Registrar: {name}', { name: '<b>' + esc(st.registrar) + '</b>' }) : '') + '. ' + _t('Server IP: {ip}', { ip: '<b>' + (st.serverIp ? ltr(st.serverIp) : esc(_t('unknown'))) + '</b>' }) + (st.serverIp ? ' ' + copyBtn(st.serverIp, _t('server IP')) : '') + '</span></div>' +
          (done ? '<div class="ghh-cxok" role="status"><span class="ghh-state__hex">' + ic('shield', 22) + '</span><div><h4>' + _t('{d} is connected', { d: ltr(d) }) + '</h4><p>' + (st.steps[3].ok ? _t('Your site is live here with HTTPS.') : _t('The domain points here. Issue a free SSL certificate so visitors get the padlock.')) + ' ' + _t('Some visitors may still see the old site for a while until their internet provider refreshes its DNS cache.') + '</p>' +
            (!st.steps[3].ok && can('ssl', 'issue') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-ssl>' + ic('shield', 15) + ' ' + _t('Issue free SSL') + '</button>' : '') + '</div></div>' : '') +
          '<div class="ghh-cx">' +
          '<article class="ghh-cx__opt ghh-cx__opt--rec"><header><span class="ghh-pill ghh-pill--ok"><i class="ghh-hexdot"></i>' + _t('Recommended') + '</span><h4>' + _t('Use GlobalHostia nameservers') + '</h4><p>' + _t('We manage all DNS for you: website, email, SSL and the fixes in Site health work automatically.') + '</p></header>' +
          '<ul class="ghh-nslist">' + st.nameservers.map(function (n) { return '<li><code>' + esc(n) + '</code>' + copyBtn(n) + '</li>'; }).join('') + '</ul>' +
          steps(nsProv.ns) + (nsProv.url ? '<a class="ghh-btn ghh-btn--sm" href="' + esc(nsProv.url) + '" target="_blank" rel="noopener">' + ic('ext', 13) + ' ' + _t('Open {name}', { name: esc(nsProv.name) }) + '</a>' : '') +
          '<p class="ghh-note">' + _t('Takes effect in 1 to 4 hours as a rule, occasionally up to 24 hours. Any records you created at the old provider are not copied: email elsewhere (e.g. Google Workspace) needs its MX records added again in the DNS tab.') + '</p></article>' +
          '<article class="ghh-cx__opt"><header><span class="ghh-pill ghh-pill--muted">' + _t('Keep current DNS') + '</span><h4>' + (p.id === 'generic' ? _t('Add records at your DNS provider') : _t('Add records at {name}', { name: esc(p.name) })) + '</h4><p>' + _t('Your DNS stays where it is; only the website (and optionally email) moves here.') + '</p></header>' +
          '<div data-recs>' + records() + '</div><label class="ghh-check ghh-cx__mail"><input type="checkbox" data-mail' + (mailOn ? ' checked' : '') + '> ' + _t('I also want email for {d} here', { d: ltr(d) }) + '</label>' +
          steps(p.dns) + (p.url ? '<a class="ghh-btn ghh-btn--sm" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + ic('ext', 13) + ' ' + _t('Open {name}', { name: esc(p.name) }) + '</a>' : '') +
          '<p class="ghh-note">' + _t('Record changes usually show within minutes to an hour, depending on how long the old record was cached (its TTL), and up to 24 hours at the most.') + '</p></article></div>' +
          '<section class="ghh-live" aria-live="polite"><header><h4>' + _t('Live check') + '</h4><span class="ghh-muted" data-when>' + _t('Checked {when}', { when: when(st.checkedAt) }) + LIVE() + '</span><button type="button" class="ghh-btn ghh-btn--sm" data-now>' + ic('refresh', 14) + ' ' + _t('Check now') + '</button></header>' + progress() + '</section>';
        list.querySelector('[data-mail]').onchange = function (e) { mailOn = e.target.checked; list.querySelector('[data-recs]').innerHTML = records(); };
        list.querySelector('[data-now]').onclick = function () { check(this); };
        var sb = list.querySelector('[data-ssl]');
        if (sb) sb.onclick = function () { busy(sb, true); api('ssl', null, { json: { op: 'issue', domain: d, www: true } }).then(function (r) { busy(sb, false); toast(r.message); }, function (e) { busy(sb, false); fail(e); }); };
      };
      var check = function (btn) {
        if (btn) busy(btn, true);
        api('connect', { domain: d }).then(function (r) {
          var first = !st; st = r;
          if (first) render(); else { var ls = list.querySelector('.ghh-live'); if (ls && !!list.querySelector('.ghh-cxok') === r.connected) { ls.querySelector('.ghh-live__steps').outerHTML = progress(); ls.querySelector('[data-when]').textContent = _t('Checked {when}', { when: when(r.checkedAt).replace(/<[^>]+>/g, '') }) + LIVE(); } else render(); }
          if (r.connected && r.steps[3].ok) stop();
          if (btn && document.body.contains(btn)) busy(btn, false);
        }, function (e) { if (btn && document.body.contains(btn)) busy(btn, false); if (!st) { fail(e, list); retryOn(list, function () { check(); }); } else if (btn) fail(e); });
      };
      live = true;
      connectTimer = setInterval(function () {
        if (S.tab !== 'health' || !body.contains(list) || Date.now() - started > 10 * 60000) { live = false; stop(); var w = list.querySelector('[data-when]'); if (w) w.textContent = w.textContent.replace(' · ' + _t('checking again every 30 s'), ''); return; }
        check();
      }, 30000);
      check();
    }
    function openConnect(d) { S.openConnect = d; show('health', true); }

    /* ------------------------------------------------------------ Overview extras: health card + unconnected domains */
    function overviewExtras(slot) {
      var d = S.domain;
      slot.innerHTML = '<div class="ghh-ovx"><button type="button" class="ghh-hcard is-loading" data-go-health>' + '<span class="ghh-ring ghh-ring--skel" style="width:56px;height:56px"></span><span><b>' + _t('Site health') + '</b><small>' + _t('Checking {d}…', { d: ltr(d) }) + '</small></span>' + ic('redirects', 14) + '</button><div data-unc></div></div>';
      var card = slot.querySelector('[data-go-health]');
      card.onclick = function () { show('health', true); };
      var paint = function (r) {
        card.classList.remove('is-loading');
        if (!r || typeof r.score !== 'number') { card.querySelector('small').textContent = _t('Open Site health to run the checks'); return; }
        card.innerHTML = ring(r.score, 56) + '<span><b>' + esc(r.issues ? _tp(r.issues, 'Health: {n} issue', 'Health: {n} issues') : _t('Health: all good')) + '</b><small>' + _t('{d} · open Site health', { d: ltr(r.domain) }) + '</small></span>' + ic('redirects', 14);
        card.setAttribute('aria-label', _t('Site health for {d}: score {score}, {state}. Open Site health', { d: r.domain, score: r.score, state: r.issues ? _tp(r.issues, '{n} issue', '{n} issues') : _t('all good') }));
      };
      if (S.health[d]) paint(S.health[d]);
      else api('health', { domain: d }).then(function (r) { S.health[d] = r; paint(r); }, function () { card.classList.remove('is-loading'); card.querySelector('small').textContent = _t('Open Site health to run the checks'); });
      api('connect', { op: 'scan' }).then(function (r) {
        if (!r.domains || !r.domains.length) return;
        var box = slot.querySelector('[data-unc]');
        box.innerHTML = '<div class="ghh-alert ghh-alert--soft ghh-unc">' + ic('alert', 18) + '<div><b>' + esc(_tp(r.domains.length, '{n} domain is not connected to this hosting yet', '{n} domains are not connected to this hosting yet')) + '</b><span>' + _t('Their website does not open from this server. Connect them in a few steps.') + '</span><ul>' +
          r.domains.map(function (x) { return '<li><code>' + esc(x.domain) + '</code><button type="button" class="ghh-btn ghh-btn--sm ghh-btn--pri" data-connect="' + esc(x.domain) + '">' + ic('aliases', 13) + ' ' + _t('Connect') + '</button></li>'; }).join('') + '</ul></div></div>';
        [].forEach.call(box.querySelectorAll('[data-connect]'), function (b) { b.onclick = function () { openConnect(b.getAttribute('data-connect')); }; });
      }, function () {});
    }

    /* ------------------------------------------------------------ Email setup helper */
    function mailSettingsCard(slot, d) {
      api('mailsetup', { domain: d }).then(function (s) {
        if (!s || !s.incoming) { slot.innerHTML = ''; return; }
        var row = function (lbl, val, extra, copy) { return '<div><dt>' + esc(lbl) + '</dt><dd><code>' + esc(val) + '</code>' + (extra ? ' <span class="ghh-pill ghh-pill--muted">' + esc(extra) + '</span>' : '') + (copy ? copyBtn(val, lbl) : '') + '</dd></div>'; };
        slot.innerHTML = '<details class="ghh-ms"' + (S.msOpen ? ' open' : '') + '><summary><span class="ghh-ficon ghh-ficon--db">' + ic('email', 16) + '</span><span><b>' + _t('Email settings') + '</b><small>' + _t('For Outlook, Apple Mail, Gmail and other apps') + '</small></span>' + ic('chevron', 16) + '</summary>' +
          '<div class="ghh-ms__grid"><dl><h5>' + _t('Incoming (IMAP)') + '</h5>' + row(_t('Server'), s.incoming.imap.host, '', true) + row(_t('Port'), String(s.incoming.imap.port), 'SSL/TLS') + '</dl>' +
          '<dl><h5>' + _t('Incoming (POP3)') + '</h5>' + row(_t('Server'), s.incoming.pop3.host, '', true) + row(_t('Port'), String(s.incoming.pop3.port), 'SSL/TLS') + '</dl>' +
          '<dl><h5>' + _t('Outgoing (SMTP)') + '</h5>' + row(_t('Server'), s.outgoing.host, '', true) + row(_t('Port'), String(s.outgoing.port), 'SSL/TLS') + row(_t('or port'), String(s.outgoing.alt.port), 'STARTTLS') + '</dl>' +
          '<dl><h5>' + _t('Sign in') + '</h5><div><dt>' + _t('Username') + '</dt><dd>' + _t('Your full email address') + '</dd></div><div><dt>' + _t('Password') + '</dt><dd>' + _t('The mailbox password') + '</dd></div><div><dt>' + _t('Webmail') + '</dt><dd><a href="' + esc(s.webmail) + '" target="_blank" rel="noopener" dir="ltr">' + esc(s.webmail.replace(/^https:\/\//, '')) + ' ' + ic('ext', 12) + '</a>' + copyBtn(s.webmail, _t('webmail address')) + '</dd></div></dl></div>' +
          (s.altHost ? '<p class="ghh-note">' + _t('If your mail app warns about the certificate for {host}, use {alt} as the incoming and outgoing server instead.', { host: ltr(s.incoming.imap.host), alt: '<code>' + esc(s.altHost) + '</code>' }) + '</p>' : '') + '</details>';
        slot.querySelector('details').ontoggle = function () { S.msOpen = this.open; };
      }, function () { slot.innerHTML = ''; });
    }
    var DEVICES = [['apple', _t('iPhone / Mac')], ['android', _t('Android / Gmail')], ['outlook', 'Outlook'], ['thunderbird', 'Thunderbird']];
    function deviceSetup(slot, d, m) {
      slot.innerHTML = '<div class="ghh-form ghh-dev">' + skel(2) + '</div>';
      api('mailsetup', { domain: d, user: m.user }).then(function (s) {
        if (!s || !s.incoming) { slot.innerHTML = ''; return toast(_t('Mail settings are not available right now.'), 'err'); }
        var tab = S.devTab || 'apple';
        var steps = function (a) { return '<ol class="ghh-steps">' + a.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>'; };
        var I1 = '<b>' + ltr(s.incoming.imap.host) + '</b>', O1 = '<b>' + ltr(s.outgoing.host) + '</b>', U = '<b>' + ltr(s.username) + '</b>';
        var b = function (x) { return '<b>' + x + '</b>'; }; // a menu or button name, as the app shows it
        var pane = {
          apple: '<div class="ghh-dev__cols"><div><p>' + _t('Download a profile that sets up {user} in Apple Mail. It does not contain your password: your iPhone or Mac asks for it while installing.', { user: U }) + '</p><button type="button" class="ghh-btn ghh-btn--pri" data-prof>' + ic('down') + ' ' + _t('Download profile') + '</button></div><div><h5>iPhone / iPad</h5>' + steps([
              _t('Open this page on the iPhone in Safari and tap {download} (or AirDrop the file to it).', { download: b(_t('Download profile')) }),
              _t('Open {settings} and tap {downloaded} near the top.', { settings: b(_t('Settings')), downloaded: b(_t('Profile Downloaded')) }),
              _t('Tap {install}, enter your passcode, then the mailbox password when asked.', { install: b(_t('Install')) })]) + '<h5>Mac</h5>' + steps([
              _t('Double-click the downloaded file.'),
              _t('Open {settings}, then {privacy}, {profiles} (or search "Profiles").', { settings: b(_t('System Settings')), privacy: b(_t('Privacy & Security')), profiles: b(_t('Profiles')) }),
              _t('Double-click the profile, click {install} and enter the mailbox password.', { install: b(_t('Install')) })]) + '</div></div>',
          android: '<div class="ghh-dev__cols"><div>' + steps([
              _t('Open the {gmail} app, tap your picture, then {add}, {other}.', { gmail: b('Gmail'), add: b(_t('Add another account')), other: b(_t('Other')) }),
              _t('Enter {user} and tap {manual}, then {imap}.', { user: U, manual: b(_t('Manual setup')), imap: b(_t('Personal (IMAP)')) }),
              _t('Enter the mailbox password.'),
              _t('Incoming server: {host}, port {port}, security {sec}.', { host: I1, port: b('993'), sec: b('SSL/TLS') }),
              _t('Outgoing server: {host}, port {port}, security {sec}. Keep "Require sign-in" on.', { host: O1, port: b('465'), sec: b('SSL/TLS') }),
              _t('Tap Next and choose how often to sync.')]) + '</div><figure class="ghh-qrbox">' + QR(s.qrText) + '<figcaption>' + _t('Scan with your phone camera to see these settings on the phone.') + '</figcaption></figure></div>',
          outlook: steps([
              _t('Open Outlook. In classic Outlook choose {file}, {add}; in new Outlook choose {settings}, {accounts}, {add}.', { file: b(_t('File')), add: b(_t('Add account')), settings: b(_t('Settings')), accounts: b(_t('Accounts')) }),
              _t('Enter {user}, open {adv} and tick {manual} (new Outlook: choose {imap} when asked).', { user: U, adv: b(_t('Advanced options')), manual: b(_t('Let me set up my account manually')), imap: b('IMAP') }),
              _t('Choose {imap}. Incoming mail: {host}, port {port}, encryption {sec}.', { imap: b('IMAP'), host: I1, port: b('993'), sec: b('SSL/TLS') }),
              _t('Outgoing mail: {host}, port {port}, encryption {sec}.', { host: O1, port: b('465'), sec: b('SSL/TLS') }),
              _t('Enter the mailbox password and click {connect}.', { connect: b(_t('Connect')) }),
              _t('Outlook for Mac: {outlook}, {settings}, {accounts}, {plus}, {newacc}, then the same servers.', { outlook: b('Outlook'), settings: b(_t('Settings')), accounts: b(_t('Accounts')), plus: b('+'), newacc: b(_t('New account')) })]),
          thunderbird: '<p>' + _t('Thunderbird sets itself up: choose {settings}, {actions}, {add}, enter your name, {user} and the mailbox password, and click {cont}. It finds the servers on its own.', { settings: b(_t('Account Settings')), actions: b(_t('Account Actions')), add: b(_t('Add Mail Account')), user: U, cont: b(_t('Continue')) }) + '</p>' +
            '<p class="ghh-note">' + _t('If it asks you to confirm, pick IMAP {imap} port 993 SSL/TLS and SMTP {smtp} port 465 SSL/TLS, with the full address as the username.', { imap: I1, smtp: O1 }) + '</p>'
        };
        slot.innerHTML = '<div class="ghh-form ghh-dev"><div class="ghh-form__head"><h4>' + ic('email', 16) + ' ' + _t('Set up {user} on a device', { user: ltr(s.username) }) + '</h4><button type="button" class="ghh-icon" data-close aria-label="' + esc(_t('Close')) + '">' + ic('x') + '</button></div>' +
          '<div class="ghh-seg" role="tablist" aria-label="' + esc(_t('Device')) + '">' + DEVICES.map(function (x) { return '<button type="button" role="tab" id="ghh-dt-' + x[0] + '" aria-controls="ghh-dp" aria-selected="' + (x[0] === tab) + '" tabindex="' + (x[0] === tab ? 0 : -1) + '" data-dev="' + x[0] + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>' +
          '<div class="ghh-dev__pane" id="ghh-dp" role="tabpanel" aria-labelledby="ghh-dt-' + tab + '">' + pane[tab] + '</div></div>';
        var box = slot.querySelector('.ghh-dev');
        box.querySelector('[data-close]').onclick = function () { slot.innerHTML = ''; };
        box.onkeydown = function (e) { if (e.key === 'Escape') slot.innerHTML = ''; };
        var tl = box.querySelector('[role=tablist]');
        tl.onclick = function (e) { var bt = e.target.closest('[data-dev]'); if (bt) { S.devTab = bt.getAttribute('data-dev'); deviceSetupRender(); } };
        tl.onkeydown = function (e) { var bs = [].slice.call(tl.children), i = bs.indexOf(document.activeElement); if (i < 0) return; var n = e.key === (RTL ? 'ArrowLeft' : 'ArrowRight') ? i + 1 : e.key === (RTL ? 'ArrowRight' : 'ArrowLeft') ? i - 1 : null; if (n === null) return; e.preventDefault(); n = (n + bs.length) % bs.length; S.devTab = bs[n].getAttribute('data-dev'); deviceSetupRender(); var nb = slot.querySelector('[data-dev="' + S.devTab + '"]'); if (nb) nb.focus(); };
        var deviceSetupRender = function () { var t = S.devTab; [].forEach.call(tl.children, function (bt) { var on = bt.getAttribute('data-dev') === t; bt.setAttribute('aria-selected', String(on)); bt.tabIndex = on ? 0 : -1; }); var p = box.querySelector('[role=tabpanel]'); p.setAttribute('aria-labelledby', 'ghh-dt-' + t); p.innerHTML = pane[t]; bindProf(); };
        var bindProf = function () {
          var pb = box.querySelector('[data-prof]'); if (!pb) return;
          pb.onclick = function () { busy(pb, true); api('mailsetup', { domain: d, user: m.user, format: 'mobileconfig' }, { raw: true }).then(function (r) { return r.blob(); }).then(function (bl) { busy(pb, false); downloadBlob(bl, m.user + '@' + d + '.mobileconfig'); toast(_t('Profile downloaded')); }, function (e) { busy(pb, false); fail(e); }); };
        };
        bindProf();
        slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, function (e) { slot.innerHTML = ''; fail(e); });
    }

    /* ------------------------------------------------------------ DNS */
    function dns() {
      var d = S.domain;
      body.innerHTML = bar(_t('DNS records'), _t('Records for {d}. Changes usually spread worldwide within an hour.', { d: B_(d) }), can('dns', 'add') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add>' + ic('plus') + ' ' + _t('Add record') + '</button>' : '') + '<div data-slot></div><div data-list>' + skel(5) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), recs = [];
      var load = function () {
        list.innerHTML = skel(5);
        api('dns', { domain: d }).then(function (r) {
          recs = r.records; render();
          var p = S.pend; S.pend = null; // opened from the command palette: edit that record
          if (p && p.dnsEdit && p.domain === d) { var x = recs.filter(function (y) { return y.id === p.dnsEdit; })[0]; if (x && !x.readonly) { recForm(x); spot(x.value); } }
        }, function (e) { fail(e, list); retryOn(list, load); });
      };
      var recForm = function (rec) {
        var t = rec ? rec.type : 'A';
        var flds = fld('type', _t('Type'), { options: [['A', _t('A (IPv4 address)')], ['AAAA', _t('AAAA (IPv6 address)')], ['CNAME', _t('CNAME (alias)')], ['MX', _t('MX (mail server)')], ['TXT', _t('TXT (text, SPF, verification)')], ['SRV', _t('SRV (service)')]], value: t }) +
          fld('name', _t('Name'), { value: rec ? rec.name : '', placeholder: _t('@ for {d}', { d: d }).replace(/[⁦-⁩]/g, ''), suffix: '.' + d, hint: _t('Use @ for the domain itself, or e.g. www, mail, _sip._tcp') }) +
          fld('value', _t('Value'), { value: rec ? rec.value : '', required: true, wide: true }) +
          fld('priority', _t('Priority'), { type: 'number', min: 0, value: rec && rec.priority != null ? rec.priority : 10, hidden: true }) +
          fld('weight', _t('Weight'), { type: 'number', min: 0, value: rec && rec.weight != null ? rec.weight : 0, hidden: true }) +
          fld('port', _t('Port'), { type: 'number', min: 1, value: rec && rec.port != null ? rec.port : '', hidden: true }) +
          fld('ttl', _t('TTL (seconds)'), { type: 'number', min: 60, value: rec ? rec.ttl : 3600 });
        formPanel(slot, rec ? _t('Edit {type} record', { type: rec.type }) : _t('Add a DNS record'), flds, rec ? _t('Save record') : _t('Add record'), function (v) {
          var payload = { op: rec ? 'edit' : 'add', domain: d, record: v }; if (rec) payload.id = rec.id;
          return api('dns', null, { json: payload }).then(function (r) { toast(r.message); hlNext(v.value); load(); });
        });
        var f = slot.querySelector('form'), ty = f.querySelector('[name=type]');
        var hints = { A: '203.0.113.10', AAAA: '2001:db8::10', CNAME: 'target.example.com', MX: 'mail.' + d, TXT: 'v=spf1 include:_spf.example.com ~all', SRV: 'sip.' + d };
        var VL = { A: _t('IPv4 address'), AAAA: _t('IPv6 address'), CNAME: _t('Points to'), MX: _t('Mail server'), TXT: _t('Text'), SRV: _t('Target host') };
        var sync = function () {
          var x = ty.value;
          f.querySelector('[data-f=priority]').hidden = !(x === 'MX' || x === 'SRV');
          f.querySelector('[data-f=weight]').hidden = f.querySelector('[data-f=port]').hidden = x !== 'SRV';
          f.querySelector('[data-f=value] label').textContent = VL[x];
          f.querySelector('[name=value]').placeholder = hints[x];
        };
        ty.onchange = sync; sync();
      };
      var render = function () {
        if (!recs.length) { list.innerHTML = empty('dns', _t('No records yet'), _t('Add an A record to point {d} at a server, or an MX record for email.', { d: d }), can('dns', 'add') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add2>' + ic('plus') + ' ' + _t('Add record') + '</button>' : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = function () { recForm(null); }; return; }
        var order = { A: 1, AAAA: 2, CNAME: 3, MX: 4, TXT: 5, SRV: 6, NS: 7 };
        recs.sort(function (a, b) { return (order[a.type] - order[b.type]) || a.name.localeCompare(b.name); });
        list.innerHTML = '<div class="ghh-tw"><table class="ghh-t"><thead><tr><th scope="col">' + _t('Type') + '</th><th scope="col">' + _t('Name') + '</th><th scope="col">' + _t('Value') + '</th><th scope="col">TTL</th><th scope="col"><span class="ghh-sr">' + _t('Actions') + '</span></th></tr></thead><tbody>' +
          recs.map(function (r, i) {
            var val = (r.type === 'MX' ? '<span class="ghh-pill ghh-pill--muted">' + esc(r.priority) + '</span> ' : r.type === 'SRV' ? '<span class="ghh-pill ghh-pill--muted">' + esc(r.priority + ' ' + r.weight + ' ' + r.port) + '</span> ' : '') + '<code>' + esc(r.value) + '</code>';
            return '<tr><td data-l="' + esc(_t('Type')) + '"><span class="ghh-type ghh-type--' + esc(r.type.toLowerCase()) + '">' + esc(r.type) + '</span></td><td data-l="' + esc(_t('Name')) + '"><code>' + esc(r.name === '@' ? d : r.name + '.' + d) + '</code></td><td data-l="' + esc(_t('Value')) + '" class="ghh-wrap">' + val + '</td><td data-l="TTL" class="ghh-nw">' + esc(r.ttl) + '</td>' +
              '<td class="ghh-act" data-i="' + i + '">' + (r.readonly ? '<span class="ghh-muted">' + _t('Managed') + '</span>' : (can('dns', 'edit') ? '<button type="button" class="ghh-icon" data-edit aria-label="' + esc(_t('Edit {what}', { what: r.type + ' ' + r.name })) + '">' + ic('edit') + '</button>' : '') + (can('dns', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(_t('Delete {what}', { what: r.type + ' ' + r.name })) + '">' + ic('trash') + '</button>' : '')) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-edit]'), function (b) { b.onclick = function () { recForm(recs[+b.closest('[data-i]').getAttribute('data-i')]); }; });
        [].forEach.call(list.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () {
            var cell = b.closest('[data-i]'), r = recs[+cell.getAttribute('data-i')];
            confirmIn(cell, _t('Delete this {type} record?', { type: r.type }), _t('Delete'), function (back) { api('dns', null, { json: { op: 'delete', domain: d, id: r.id } }).then(function (x) { toast(x.message); load(); }, function (e) { fail(e); back(); }); });
          };
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = function () { recForm(null); };
      load();
    }

    /* ------------------------------------------------------------ Email */
    // domain chips: every domain on the account, one tap to switch (keeps the header picker in sync)
    function domChips(cur, label) {
      var ds = (S.session && S.session.domains) || []; if (ds.length < 2) return '';
      return '<div class="ghh-chips" role="group" aria-label="' + esc(label) + '"><span>' + esc(label) + '</span>' + ds.map(function (x) { return '<button type="button" dir="ltr" data-dom="' + esc(x) + '"' + (x === cur ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(x) + '</button>'; }).join('') + '</div>';
    }
    function bindChips(el, pick) {
      [].forEach.call(el.querySelectorAll('[data-dom]'), function (b) { b.onclick = function () { pick(b.getAttribute('data-dom')); }; });
    }
    function setDomain(d) { S.domain = d; S.cache = {}; var sel = $('[data-domsel]'); if (sel) { sel.value = d; if (sel._ghSync) sel._ghSync(); } }
    function ghDrop(sel) {
      if (sel._ghSync) { sel._ghSync(); return; }
      var wrap = document.createElement('div'); wrap.className = 'ghh-dd';
      var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ghh-dd__btn'; btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
      var list = document.createElement('ul'); list.className = 'ghh-dd__list'; list.setAttribute('role', 'listbox'); list.hidden = true; list.tabIndex = -1;
      // keep the widget out of any <label>: a label forwards clicks to its first control (the hidden select), so only some clicks opened the menu
      var lab0 = sel.closest('label');
      if (lab0) { lab0.parentNode.insertBefore(wrap, lab0.nextSibling); var t = document.createElement('span'); t.className = lab0.className; t.textContent = lab0.textContent.trim(); lab0.parentNode.replaceChild(t, lab0); t.onclick = function () { btn.click(); }; }
      else sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(sel); wrap.appendChild(btn); wrap.appendChild(list); sel.classList.add('ghh-dd__native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-label', (lab0 ? lab0.textContent.trim() : _t('Choose')) + ': ' + (sel.options[sel.selectedIndex] || {}).text);
      var act = 0;
      var sync = function () {
        var o = sel.options[sel.selectedIndex]; btn.innerHTML = '<span dir="ltr">' + esc(o ? o.text : '') + '</span>' + ic('chevron', 14);
        list.innerHTML = [].map.call(sel.options, function (op, i) { return '<li role="option" dir="ltr" data-i="' + i + '" aria-selected="' + (i === sel.selectedIndex) + '"' + (i === act ? ' class="act"' : '') + '>' + esc(op.text) + '</li>'; }).join('');
      };
      var close = function () { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open'); };
      var open = function () { act = sel.selectedIndex; sync(); list.hidden = false; btn.setAttribute('aria-expanded', 'true'); wrap.classList.add('open'); list.focus(); };
      var pick = function (i) { if (i !== sel.selectedIndex) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change')); } close(); sync(); btn.focus(); };
      btn.onclick = function (e) { e.preventDefault(); e.stopPropagation(); list.hidden ? open() : close(); };
      list.onclick = function (e) { var li = e.target.closest('li'); if (li) pick(+li.getAttribute('data-i')); };
      list.onkeydown = function (e) {
        var n = sel.options.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = (act + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; sync(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(act); }
        else if (e.key === 'Escape' || e.key === 'Tab') { close(); btn.focus(); }
      };
      document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
      sel._ghSync = sync; sync();
    }
    function email() {
      var d = S.domain, fw = S.tab === 'forwarders';
      body.innerHTML = fw ? bar(_t('Forwarders'), _t('Send mail for an address on {d} on to another inbox.', { d: B_(d) }), '<button type="button" class="ghh-btn ghh-btn--pri" data-addf>' + ic('plus') + ' ' + _t('New forwarder') + '</button>') + domChips(d, _t('Domain')) + '<div data-fslot></div><div data-flist>' + skel(2) + '</div>'
        : bar(_t('Mailboxes'), _t('Email accounts on {d}.', { d: B_(d) }), can('email', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add>' + ic('plus') + ' ' + _t('New mailbox') + '</button>' : '') + domChips(d, _t('Domain')) + '<div data-ms></div><div data-slot></div><div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), boxes = [], fwds = [];
      if (body.querySelector('[data-ms]')) mailSettingsCard(body.querySelector('[data-ms]'), d);
      var flist = body.querySelector('[data-flist]'), fslot = body.querySelector('[data-fslot]');
      bindChips(body, function (x) { setDomain(x); show(S.tab); });
      var load = function () {
        if (!list) { /* forwarders view */ }
        else if (!can('email', 'list')) { list.innerHTML = empty('email', _t('Create and manage mailboxes'), _t('Your panel does not list mailboxes here; you can still create them, change passwords and quotas.')); }
        else api('email', { domain: d }).then(function (r) { boxes = r.mailboxes; render(); }, function (e) { fail(e, list); retryOn(list, load); });
        if (flist) api('email', { domain: d, op: 'forwarders' }).then(function (r) { fwds = r.forwarders; renderF(); }, function (e) { fail(e, flist); retryOn(flist, load); });
      };
      var newBox = function () {
        formPanel(slot, _t('New mailbox'), fld('user', _t('Address'), { required: true, suffix: '@' + d, placeholder: 'info' }) + fld('password', _t('Password'), { type: 'password', required: true, hint: _t('8+ characters with upper and lower case and a digit') }) + fld('quota', _t('Quota'), { type: 'number', min: 0, value: 1024, suffix: 'MB', hint: _t('0 = unlimited') }), _t('Create mailbox'), function (v) {
          return api('email', null, { json: { op: 'create', domain: d, user: v.user, password: v.password, quota: +v.quota || 0 } }).then(function (r) { toast(r.message); hlNext(v.user + '@' + d); load(); });
        });
      };
      var render = function () {
        if (!boxes.length) { list.innerHTML = empty('email', _t('No mailboxes yet'), _t('Create an address like {addr} and read it in any mail app.', { addr: 'info@' + d }), can('email', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add2>' + ic('plus') + ' ' + _t('New mailbox') + '</button>' : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = newBox; return; }
        list.innerHTML = '<div class="ghh-tw"><table class="ghh-t"><thead><tr><th scope="col">' + _t('Address') + '</th><th scope="col">' + _t('Usage') + '</th><th scope="col"><span class="ghh-sr">' + _t('Actions') + '</span></th></tr></thead><tbody>' + boxes.map(function (m, i) {
          var pct = m.quotaMb ? Math.min(100, Math.round(m.usedMb / m.quotaMb * 100)) : 0;
          return '<tr><td data-l="' + esc(_t('Address')) + '"><b class="ghh-strong">' + esc(m.email) + '</b>' + (m.suspended ? ' <span class="ghh-pill ghh-pill--warn">' + _t('Suspended') + '</span>' : '') + '</td>' +
            '<td data-l="' + esc(_t('Usage')) + '"><div class="ghh-use"><div class="ghh-meter' + (pct > 85 ? ' is-high' : '') + '" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + esc(_t('Mailbox usage')) + '"><i style="width:' + (m.quotaMb ? pct : 4) + '%"></i></div><span>' + esc(m.quotaMb ? _t('{used} MB of {quota} MB', { used: L10N.num(m.usedMb), quota: L10N.num(m.quotaMb) }) : _t('{used} MB of unlimited', { used: L10N.num(m.usedMb) })) + '</span></div></td>' +
            '<td class="ghh-act" data-i="' + i + '"><button type="button" class="ghh-btn ghh-btn--sm" data-setup>' + ic('down', 14) + ' ' + _t('Set up on device') + '</button>' + (can('email', 'password') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-pw>' + ic('key', 14) + ' ' + _t('Password') + '</button>' : '') + (can('email', 'quota') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-q>' + _t('Quota') + '</button>' : '') + (can('email', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(_t('Delete {what}', { what: m.email })) + '">' + ic('trash') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
        bindAll();
      };
      var renderF = function () {
        if (!fwds.length) { flist.innerHTML = empty('forwarders', _t('No forwarders yet'), _t('Forward {addr} to your personal inbox, or to several people at once.', { addr: 'sales@' + d })); return; }
        flist.innerHTML = '<ul class="ghh-fwd">' + fwds.map(function (f, i) {
          return '<li><b dir="ltr">' + esc(f.email) + '</b><span class="ghh-arrow" aria-hidden="true">' + ic('fwd', 14) + '</span><span class="ghh-chips">' + f.to.map(function (t, j) { return '<span class="ghh-chip"><bdi dir="ltr">' + esc(t) + '</bdi><button type="button" data-fi="' + i + '" data-fj="' + j + '" aria-label="' + esc(_t('Remove forwarding to {addr}', { addr: t })) + '">' + ic('x', 12) + '</button></span>'; }).join('') + '</span></li>';
        }).join('') + '</ul>';
        [].forEach.call(flist.querySelectorAll('[data-fi]'), function (b) {
          b.onclick = function () {
            var f = fwds[+b.getAttribute('data-fi')], to = f.to[+b.getAttribute('data-fj')], li = b.closest('li');
            confirmIn(li, _t('Stop forwarding {from} to {to}?', { from: f.email, to: to }), _t('Remove'), function (back) { api('email', null, { json: { op: 'removeForwarder', domain: d, user: f.user, to: to } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }, renderF);
          };
        });
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-i]'), function (cell) {
          var m = boxes[+cell.getAttribute('data-i')], pw = cell.querySelector('[data-pw]'), q = cell.querySelector('[data-q]'), del = cell.querySelector('[data-del]'), su = cell.querySelector('[data-setup]');
          if (su) su.onclick = function () { deviceSetup(slot, d, m); };
          if (pw) pw.onclick = function () { formPanel(slot, _t('New password for {what}', { what: m.email }), fld('password', _t('New password'), { type: 'password', required: true }), _t('Change password'), function (v) { return api('email', null, { json: { op: 'password', domain: d, user: m.user, password: v.password } }).then(function (r) { toast(r.message); }); }); };
          if (q) q.onclick = function () { formPanel(slot, _t('Quota for {what}', { what: m.email }), fld('quota', _t('Quota'), { type: 'number', min: 0, value: m.quotaMb, suffix: 'MB', hint: _t('0 = unlimited') }), _t('Save quota'), function (v) { return api('email', null, { json: { op: 'quota', domain: d, user: m.user, quota: +v.quota || 0 } }).then(function (r) { toast(r.message); load(); }); }); };
          if (del) del.onclick = function () { confirmIn(cell, _t('Delete {what} and all its mail?', { what: m.email }), _t('Delete'), function (back) { api('email', null, { json: { op: 'delete', domain: d, user: m.user } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = newBox;
      var addf = body.querySelector('[data-addf]');
      if (addf) addf.onclick = function () { formPanel(fslot, _t('New forwarder'), fld('user', _t('Forward mail for'), { required: true, suffix: '@' + d, placeholder: 'sales' }) + fld('to', _t('To address'), { type: 'email', required: true, placeholder: 'you@gmail.com' }), _t('Add forwarder'), function (v) { return api('email', null, { json: { op: 'addForwarder', domain: d, user: v.user, to: v.to } }).then(function (r) { toast(r.message); hlNext(v.user + '@' + d); load(); }); }); };
      load();
    }

    /* ------------------------------------------------------------ Files */
    var EDIT = /\.(txt|html?|css|js|mjs|json|xml|php\d?|phtml|md|ini|conf|htaccess|env|ya?ml|csv|svg|py|rb|pl|sh|log|sql|tpl|twig|vue|ts|tsx|jsx)$|^\.(htaccess|user\.ini|htpasswd)$/i;
    function files() {
      var lim = S.session.limits || { transferBytes: 4194304, editBytes: 1048576 };
      var acts = (can('files', 'upload') ? '<label class="ghh-btn ghh-btn--pri ghh-upload">' + ic('up') + ' ' + _t('Upload') + '<input type="file" data-up multiple></label>' : '') + (can('files', 'mkdir') ? '<button type="button" class="ghh-btn" data-mk>' + ic('folder') + ' ' + _t('New folder') + '</button>' : '');
      if (!S.pathSet) { S.pathSet = 1; if (S.domain) S.path = '/domains/' + S.domain + '/public_html'; }
      var webs = ((S.session && S.session.domains) || []);
      body.innerHTML = bar(_t('File manager'), esc(_t('Browse and edit the files in your hosting account. Uploads up to {size}; use FTP for larger files.', { size: bytes(lim.transferBytes) })), acts) + (webs.length ? '<div class="ghh-chips" role="group" aria-label="' + esc(_t('Websites')) + '"><span>' + _t('Websites') + '</span>' + webs.map(function (x) { return '<button type="button" dir="ltr" data-web="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '<button type="button" data-web="">' + _t('All files') + '</button></div>' : '') + '<nav class="ghh-crumbs" aria-label="' + esc(_t('Folder path')) + '" data-crumbs dir="ltr"></nav><div data-slot></div><div data-list>' + skel(6) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), ents = [];
      var crumbs = function () {
        var parts = S.path.split('/').filter(Boolean), acc = '';
        body.querySelector('[data-crumbs]').innerHTML = '<button type="button" data-go="/">' + ic('folder', 14) + ' <span dir="auto">' + _t('Home') + '</span></button>' + parts.map(function (p, i) { acc += '/' + p; return '<span aria-hidden="true">/</span>' + (i === parts.length - 1 ? '<b aria-current="page">' + esc(p) + '</b>' : '<button type="button" data-go="' + esc(acc) + '">' + esc(p) + '</button>'); }).join('');
        [].forEach.call(body.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { S.path = b.getAttribute('data-go'); load(); }; });
      };
      var load = function () {
        crumbs(); slot.innerHTML = ''; list.innerHTML = skel(6);
        [].forEach.call(body.querySelectorAll('[data-web]'), function (b) { var w = b.getAttribute('data-web'), tgt = w ? '/domains/' + w + '/public_html' : '/'; b.classList.toggle('on', S.path === tgt || (w && S.path.indexOf('/domains/' + w + '/') === 0)); b.onclick = function () { if (w) setDomain(w); S.path = tgt; load(); }; });
        api('files', { op: 'list', path: S.path }).then(function (r) { ents = S.path === '/' ? r.entries.filter(function (e) { return !/^\.(cagefs|cl\.|clwpos|jb-|php|softaculous|spamassassin|trash|cpanel|cache|config|local|npm|bash_|wp-cli)/.test(e.name); }) : r.entries; render(); }, function (e) { fail(e, list); retryOn(list, load); });
      };
      var render = function () {
        var up = S.path !== '/' ? '<tr class="ghh-up"><td colspan="4"><button type="button" class="ghh-link" data-parent>' + ic('up', 14) + ' ' + _t('Up one level') + '</button></td></tr>' : '';
        if (!ents.length) { list.innerHTML = (up ? '<div class="ghh-tw"><table class="ghh-t"><tbody>' + up + '</tbody></table></div>' : '') + empty('files', _t('This folder is empty'), _t('Upload files or create a folder to get started.')); }
        else list.innerHTML = '<div class="ghh-tw"><table class="ghh-t ghh-t--files"><thead><tr><th scope="col">' + _t('Name') + '</th><th scope="col">' + _t('Size') + '</th><th scope="col">' + _t('Modified') + '</th><th scope="col"><span class="ghh-sr">' + _t('Actions') + '</span></th></tr></thead><tbody>' + up +
          ents.map(function (f, i) {
            var isDir = f.type === 'dir' || f.type === 'link', canEdit = !isDir && EDIT.test(f.name) && f.size <= lim.editBytes && can('files', 'read');
            return '<tr><td data-l="' + esc(_t('Name')) + '">' + (isDir ? '<button type="button" class="ghh-fname" data-open="' + i + '"><span class="ghh-ficon ghh-ficon--dir">' + ic('folder', 16) + '</span><bdi dir="ltr">' + esc(f.name) + '</bdi></button>' : '<span class="ghh-fname"><span class="ghh-ficon">' + ic('file', 16) + '</span><bdi dir="ltr">' + esc(f.name) + '</bdi></span>') + '</td>' +
              '<td data-l="' + esc(_t('Size')) + '" class="ghh-nw">' + (isDir ? '<span class="ghh-muted">' + (f.type === 'link' ? _t('Link') : _t('Folder')) + '</span>' : '<bdi dir="ltr">' + bytes(f.size) + '</bdi>') + '</td><td data-l="' + esc(_t('Modified')) + '">' + when(f.modified) + '</td>' +
              '<td class="ghh-act" data-i="' + i + '">' + (canEdit && can('files', 'write') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-ed>' + ic('edit', 14) + ' ' + _t('Edit') + '</button>' : '') + (!isDir && can('files', 'download') && f.size <= lim.transferBytes ? '<button type="button" class="ghh-icon" data-dl aria-label="' + esc(_t('Download {what}', { what: f.name })) + '">' + ic('down') + '</button>' : '') +
              (can('files', 'rename') ? '<button type="button" class="ghh-icon" data-rn aria-label="' + esc(_t('Rename {what}', { what: f.name })) + '" title="' + esc(_t('Rename')) + '">' + ic('rename') + '</button>' : '') + (can('files', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(_t('Delete {what}', { what: f.name })) + '">' + ic('trash') + '</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        var pb = list.querySelector('[data-parent]'); if (pb) pb.onclick = function () { S.path = S.path.replace(/\/[^\/]+$/, '') || '/'; load(); };
        bindAll();
      };
      var full = function (n) { return (S.path === '/' ? '' : S.path) + '/' + n; };
      var editor = function (f) {
        slot.innerHTML = '<div class="ghh-editor">' + skel(3) + '</div>';
        api('files', { op: 'read', path: full(f.name) }).then(function (r) {
          slot.innerHTML = '<form class="ghh-editor"><div class="ghh-form__head"><h4>' + ic('file', 16) + ' ' + ltr(full(f.name)) + '</h4><button type="button" class="ghh-icon" data-close aria-label="' + esc(_t('Close editor')) + '">' + ic('x') + '</button></div>' +
            '<label class="ghh-sr" for="ghh-code">' + _t('File contents') + '</label><textarea id="ghh-code" spellcheck="false" wrap="off" dir="ltr"></textarea><p class="ghh-form__err" role="alert" hidden></p>' +
            '<div class="ghh-form__foot"><span class="ghh-muted" data-sz dir="ltr"></span><button type="button" class="ghh-btn" data-close>' + _t('Close') + '</button><button type="submit" class="ghh-btn ghh-btn--pri">' + _t('Save file') + '</button></div></form>';
          var fm = slot.querySelector('form'), ta = fm.querySelector('textarea'), dirty = false;
          ta.value = r.content; fm.querySelector('[data-sz]').textContent = bytes(r.size);
          ta.oninput = function () { dirty = true; };
          ta.onkeydown = function (e) { if (e.key === 'Tab' && !e.shiftKey && !e.altKey) { e.preventDefault(); var s0 = ta.selectionStart; ta.setRangeText('  ', s0, ta.selectionEnd, 'end'); dirty = true; } if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); fm.requestSubmit ? fm.requestSubmit() : fm.onsubmit(e); } };
          [].forEach.call(fm.querySelectorAll('[data-close]'), function (b) { b.onclick = function () { if (dirty && !b._sure) { b._sure = 1; b.textContent = _t('Discard changes?'); return; } slot.innerHTML = ''; }; });
          fm.onsubmit = function (e) {
            e.preventDefault(); var sb = fm.querySelector('[type=submit]'), er = fm.querySelector('.ghh-form__err'); busy(sb, true); er.hidden = true;
            api('files', null, { json: { op: 'write', path: full(f.name), content: ta.value } }).then(function (x) { busy(sb, false); dirty = false; toast(x.message); }, function (e2) { busy(sb, false); if (e2.code === 'expired') return expired(); er.textContent = e2.message; er.hidden = false; });
          };
          ta.focus(); slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, function (e) { slot.innerHTML = ''; fail(e); });
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-open]'), function (b) { b.onclick = function () { S.path = full(ents[+b.getAttribute('data-open')].name); load(); }; });
        [].forEach.call(list.querySelectorAll('[data-i]'), function (cell) {
          var f = ents[+cell.getAttribute('data-i')], q = function (s) { return cell.querySelector(s); };
          if (q('[data-ed]')) q('[data-ed]').onclick = function () { editor(f); };
          if (q('[data-dl]')) q('[data-dl]').onclick = function () {
            var b = q('[data-dl]'); busy(b, true);
            api('files', { op: 'download', path: full(f.name) }, { raw: true }).then(function (r) { return r.blob(); }).then(function (blob) {
              busy(b, false); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
            }, function (e) { busy(b, false); fail(e); });
          };
          if (q('[data-rn]')) q('[data-rn]').onclick = function () { formPanel(slot, _t('Rename {what}', { what: f.name }), fld('to', _t('New name'), { value: f.name, required: true }), _t('Rename'), function (v) { return api('files', null, { json: { op: 'rename', path: S.path, from: f.name, to: v.to } }).then(function (r) { toast(r.message); load(); }); }); };
          if (q('[data-del]')) q('[data-del]').onclick = function () { confirmIn(cell, f.type === 'dir' ? _t('Delete folder {name} and everything in it?', { name: f.name }) : _t('Delete {what}?', { what: f.name }), _t('Delete'), function (back) { api('files', null, { json: { op: 'delete', path: S.path, names: [f.name] } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
        });
      };
      var mk = body.querySelector('[data-mk]');
      if (mk) mk.onclick = function () { formPanel(slot, _t('New folder in {path}', { path: S.path }), fld('name', _t('Folder name'), { required: true }), _t('Create folder'), function (v) { return api('files', null, { json: { op: 'mkdir', path: S.path, name: v.name } }).then(function (r) { toast(r.message); load(); }); }); };
      var upIn = body.querySelector('[data-up]');
      if (upIn) upIn.onchange = function () {
        var fl = [].slice.call(upIn.files || []); upIn.value = '';
        var big = fl.filter(function (x) { return x.size > lim.transferBytes; });
        if (big.length) toast(_t('{names}: larger than {size}. Use FTP for big files.', { names: big.map(function (x) { return x.name; }).join(', '), size: bytes(lim.transferBytes) }), 'err');
        fl = fl.filter(function (x) { return x.size <= lim.transferBytes; });
        var lbl = body.querySelector('.ghh-upload'); lbl.classList.add('is-busy');
        (function next() {
          var x = fl.shift();
          if (!x) { lbl.classList.remove('is-busy'); return load(); }
          var fd = new FormData(); fd.append('op', 'upload'); fd.append('path', S.path); fd.append('file', x, x.name);
          api('files', null, { form: fd }).then(function (r) { toast(r.message); next(); }, function (e) { fail(e); next(); });
        })();
      };
      load();
    }

    /* ------------------------------------------------------------ Databases */
    function databases() {
      body.innerHTML = bar(_t('MySQL databases'), _t('Databases for your websites and apps. Connect with host {host}.', { host: '<code>localhost</code>' }), can('databases', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add>' + ic('plus') + ' ' + _t('New database') + '</button>' : '') + '<div data-slot></div><div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), dbs = [], prefix = '';
      var load = function () { list.innerHTML = skel(3); api('databases').then(function (r) { dbs = r.databases; prefix = r.prefix; render(); }, function (e) { fail(e, list); retryOn(list, load); }); };
      var create = function () {
        formPanel(slot, _t('New database'), fld('name', _t('Database name'), { required: true, prefix: prefix, placeholder: 'shop' }) + fld('user', _t('Database user'), { required: true, prefix: prefix, placeholder: 'shop' }) + fld('password', _t('Password'), { type: 'password', required: true, wide: true, hint: _t('Save it now: it cannot be shown again.') }), _t('Create database'), function (v) {
          return api('databases', null, { json: { op: 'create', name: v.name, user: v.user, password: v.password } }).then(function (r) { toast(r.message); hlNext(prefix + v.name); load(); });
        });
      };
      var render = function () {
        if (!dbs.length) { list.innerHTML = empty('databases', _t('No databases yet'), _t('WordPress and most web apps need one MySQL database and a user.'), can('databases', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-add2>' + ic('plus') + ' ' + _t('New database') + '</button>' : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = create; return; }
        list.innerHTML = '<div class="ghh-cards">' + dbs.map(function (db, i) {
          return '<article class="ghh-card" data-db="' + i + '"><header><span class="ghh-ficon ghh-ficon--db">' + ic('databases', 16) + '</span><h4 dir="ltr">' + esc(db.name) + '</h4>' + (db.sizeMb != null ? '<span class="ghh-muted" dir="ltr">' + esc(db.sizeMb) + ' MB</span>' : '') +
            '<div class="ghh-act" data-dbact>' + (can('databases', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-deldb aria-label="' + esc(_t('Delete database {name}', { name: db.name })) + '">' + ic('trash') + '</button>' : '') + '</div></header>' +
            '<ul class="ghh-users">' + (db.users.length ? db.users.map(function (u, j) {
              return '<li data-u="' + j + '"><span>' + ic('user', 14) + ' <code>' + esc(u) + '</code></span><span class="ghh-act">' + (can('databases', 'password') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-upw>' + ic('key', 14) + ' ' + _t('Password') + '</button>' : '') + (can('databases', 'users') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-udel aria-label="' + esc(_t('Remove user {name}', { name: u })) + '">' + ic('x') + '</button>' : '') + '</span></li>';
            }).join('') : '<li class="ghh-muted">' + _t('No users can reach this database yet.') + '</li>') + '</ul>' +
            (can('databases', 'users') ? '<button type="button" class="ghh-link" data-uadd>' + ic('plus', 14) + ' ' + _t('Add user') + '</button>' : '') + '</article>';
        }).join('') + '</div>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-db]'), function (card) {
          var db = dbs[+card.getAttribute('data-db')], q = function (s) { return card.querySelector(s); };
          if (q('[data-deldb]')) q('[data-deldb]').onclick = function () { confirmIn(q('[data-dbact]'), _t('Delete {name} and all its tables?', { name: db.name }), _t('Delete'), function (back) { api('databases', null, { json: { op: 'delete', name: db.name } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
          if (q('[data-uadd]')) q('[data-uadd]').onclick = function () { formPanel(slot, _t('Add a user to {name}', { name: db.name }), fld('user', _t('User name'), { required: true, prefix: prefix }) + fld('password', _t('Password'), { type: 'password', required: true }), _t('Add user'), function (v) { return api('databases', null, { json: { op: 'addUser', db: db.name, user: v.user, password: v.password } }).then(function (r) { toast(r.message); load(); }); }); };
          [].forEach.call(card.querySelectorAll('[data-u]'), function (li) {
            var u = db.users[+li.getAttribute('data-u')], pw = li.querySelector('[data-upw]'), del = li.querySelector('[data-udel]');
            if (pw) pw.onclick = function () { formPanel(slot, _t('New password for {what}', { what: u }), fld('password', _t('New password'), { type: 'password', required: true }), _t('Change password'), function (v) { return api('databases', null, { json: { op: 'password', db: db.name, user: u, password: v.password } }).then(function (r) { toast(r.message); }); }); };
            if (del) del.onclick = function () { confirmIn(li, _t('Remove {user} from {db}?', { user: u, db: db.name }), _t('Remove'), function (back) { api('databases', null, { json: { op: 'removeUser', db: db.name, user: u } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); }); };
          });
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = create;
      load();
    }

    /* ------------------------------------------------------------ shared: simple list views */
    function addBtn(label, attr) { return '<button type="button" class="ghh-btn ghh-btn--pri" ' + (attr || 'data-add') + '>' + ic('plus') + ' ' + esc(label) + '</button>'; }
    function table(cols, rows) {
      return '<div class="ghh-tw"><table class="ghh-t"><thead><tr>' + cols.map(function (c) { return '<th scope="col">' + (c ? esc(c) : '<span class="ghh-sr">' + _t('Actions') + '</span>') + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }
    function delCell(i, label) { return '<td class="ghh-act" data-i="' + i + '"><button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(label) + '">' + ic('trash') + '</button></td>'; }
    var DL = function (k) { return ' data-l="' + esc(_t(k)) + '"'; }; // label shown above a cell when tables turn into cards on phones
    /** Generic list view: cfg = { section, title, sub, addLabel, emptyIcon, emptyTitle, emptyText, query, pick(r), render(items) -> rows[], cols, form() -> [title, fields, submit], submit(v) -> json, del(item) -> [question, json], canAdd, canDel } */
    function listView(cfg) {
      body.innerHTML = bar(cfg.title, cfg.sub, cfg.canAdd ? addBtn(cfg.addLabel) : '') + (cfg.extraTop || '') + '<div data-slot></div><div data-list>' + skel(3) + '</div>' + (cfg.after || '');
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), items = [];
      var load = function () {
        list.innerHTML = skel(3);
        api(cfg.section, cfg.query || null).then(function (r) { items = cfg.pick(r); render(); }, function (e) { if (cfg.onError) return cfg.onError(e, list, open); fail(e, list); retryOn(list, load); });
      };
      var open = function () { var f = cfg.form(); formPanel(slot, f[0], f[1], f[2], function (v) { return api(cfg.section, null, { json: cfg.submit(v) }).then(function (r) { toast(r.message); var k = Object.keys(v).filter(function (x) { return !/pass/i.test(x) && typeof v[x] === 'string' && v[x].trim(); })[0]; if (k) hlNext(v[k]); load(); }); }); if (cfg.afterForm) cfg.afterForm(slot.querySelector('form')); };
      var render = function () {
        if (!items.length) { list.innerHTML = empty(cfg.emptyIcon, cfg.emptyTitle, cfg.emptyText, cfg.canAdd ? addBtn(cfg.addLabel, 'data-add2') : ''); var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = open; return; }
        list.innerHTML = table(cfg.cols, cfg.render(items));
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () {
            var cell = b.closest('[data-i]'), it = items[+cell.getAttribute('data-i')], q = cfg.del(it);
            confirmIn(cell, q[0], q[2] || _t('Delete'), function (back) { api(cfg.section, null, { json: q[1] }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); });
          };
        });
        if (cfg.bind) cfg.bind(list, items, slot, load);
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = open;
      load();
      return { load: load };
    }
    var mb = function (n) { return n >= 1024 ? (n / 1024).toFixed(n >= 10240 ? 0 : 1) + ' GB' : (Math.round(n * 10) / 10) + ' MB'; };

    /* ------------------------------------------------------------ Overview */
    function overview() {
      body.innerHTML = bar(_t('Overview'), esc(_t('Your hosting plan usage at a glance.')), '<button type="button" class="ghh-btn" data-re>' + ic('refresh') + ' ' + _t('Refresh') + '</button>') + '<div data-list>' + skel(4) + '</div>';
      var list = body.querySelector('[data-list]');
      var load = function () {
        list.innerHTML = skel(4);
        api('overview').then(function (r) {
          var meta = [r.plan ? [_t('Plan'), r.plan] : null, r.ip ? [_t('IP address'), r.ip] : null, [_t('Username'), S.session.username], S.session.server ? [_t('Server'), S.session.server] : null].filter(Boolean);
          var big = r.items.filter(function (x) { return x.unit === 'MB' || x.key === 'inode'; }), small = r.items.filter(function (x) { return !(x.unit === 'MB' || x.key === 'inode'); });
          var card = function (x, lg) {
            var pct = x.limit ? Math.min(100, Math.round(x.used / x.limit * 100)) : 0, fmt = x.unit === 'MB' ? mb : function (n) { return L10N.num(Math.round(n)); };
            var TAB = { quota: 'files', inode: 'files', vdomains: 'dns', nsubdomains: 'subdomains', domainptr: 'aliases', nemails: 'email', nemailf: 'forwarders', nemailr: 'autoresponders', mysql: 'databases', ftp: 'ftp' }, to = TAB[x.key] && root.querySelector('[data-tab=' + TAB[x.key] + ']') ? TAB[x.key] : '';
            var label = L10N.srv(x.label);
            return '<div class="ghh-stat' + (lg ? ' ghh-stat--lg' : '') + (pct >= 90 ? ' is-high' : '') + (to ? ' ghh-stat--go" data-go-tab="' + to + '" role="button" tabindex="0" aria-label="' + esc(_t('{label}: open', { label: label })) : '') + '"><span class="ghh-stat__l">' + esc(label) + '</span><b dir="ltr">' + esc(fmt(x.used)) + '</b><span class="ghh-stat__of">' + (x.limit ? esc(_t('of {n}', { n: fmt(x.limit) })) : _t('Unlimited')) + '</span>' +
              '<div class="ghh-meter" role="meter" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + (x.limit ? Math.max(pct, 2) : 2) + '%"></i></div>' + (x.limit ? '<span class="ghh-stat__pct">' + esc(_t('{pct} used', { pct: pct + '%' })) + '</span>' : '') + '</div>';
          };
          var quick = [['email', _t('Create a mailbox')], ['dns', _t('Edit DNS records')], ['files', _t('Open file manager')], ['backups', _t('Make a backup')]].filter(function (q) { return root.querySelector('[data-tab=' + q[0] + ']'); });
          list.innerHTML = (r.suspended ? '<div class="ghh-alert" role="alert">' + ic('alert', 18) + '<span>' + _t('This hosting account is suspended. Contact support to restore it.') + '</span></div>' : '') +
            '<dl class="ghh-meta">' + meta.map(function (m) { return '<div><dt>' + esc(m[0]) + '</dt><dd dir="auto">' + esc(m[1]) + '</dd></div>'; }).join('') + '</dl><div data-ovx></div>' +
            (big.length ? '<div class="ghh-stats ghh-stats--lg">' + big.map(function (x) { return card(x, true); }).join('') + '</div>' : '') +
            (small.length ? '<div class="ghh-stats">' + small.map(function (x) { return card(x); }).join('') + '</div>' : '') +
            (quick.length ? '<h4 class="ghh-h4">' + _t('Quick actions') + '</h4><div class="ghh-quick">' + quick.map(function (q) { return '<button type="button" class="ghh-quick__it" data-go-tab="' + q[0] + '"><span class="ghh-ficon ghh-ficon--db">' + ic(q[0], 16) + '</span>' + esc(q[1]) + '<i aria-hidden="true">' + ic('redirects', 14) + '</i></button>'; }).join('') + '</div>' : '');
          [].forEach.call(list.querySelectorAll('[data-go-tab]'), function (b) { b.onclick = function () { show(b.getAttribute('data-go-tab'), true); }; b.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.onclick(); } }; });
          if (root.querySelector('[data-tab=health]')) overviewExtras(list.querySelector('[data-ovx]'));
        }, function (e) { fail(e, list); retryOn(list, load); });
      };
      body.querySelector('[data-re]').onclick = load;
      load();
    }

    /* ------------------------------------------------------------ Subdomains, aliases, redirects */
    function subdomains() {
      var d = S.domain;
      listView({ section: 'subdomains', query: { domain: d }, title: _t('Subdomains'), sub: _t('Extra sites like {example}, each with its own folder.', { example: B_('shop.' + d) }), addLabel: _t('New subdomain'), canAdd: can('subdomains', 'add'),
        emptyIcon: 'subdomains', emptyTitle: _t('No subdomains yet'), emptyText: _t('Create {a} or {b} for a separate site.', { a: 'blog.' + d, b: 'shop.' + d }), cols: [_t('Subdomain'), _t('Folder'), ''],
        pick: function (r) { return r.subdomains; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td' + DL('Subdomain') + '><b class="ghh-strong">' + esc(x + '.' + d) + '</b></td><td' + DL('Folder') + '><code>domains/' + esc(d) + '/public_html/' + esc(x) + '</code></td>' + (can('subdomains', 'delete') ? delCell(i, _t('Delete {what}', { what: x + '.' + d })) : '<td></td>') + '</tr>'; }); },
        form: function () { return [_t('New subdomain'), fld('label', _t('Subdomain'), { required: true, suffix: '.' + d, placeholder: 'shop', wide: true }), _t('Create subdomain')]; },
        submit: function (v) { return { op: 'add', domain: d, label: v.label }; },
        del: function (x) { return [_t('Delete {what}? Its files stay in your account.', { what: x + '.' + d }), { op: 'delete', domain: d, label: x, contents: false }]; } });
    }
    function aliases() {
      var d = S.domain;
      listView({ section: 'aliases', query: { domain: d }, title: _t('Domain aliases'), sub: _t('Other domains that show the same website as {d}. Point the alias domain\'s DNS to this server first.', { d: B_(d) }), addLabel: _t('Add alias'), canAdd: can('aliases', 'add'),
        emptyIcon: 'aliases', emptyTitle: _t('No aliases yet'), emptyText: _t('Make {alias} open the same site as {d}.', { alias: d.replace(/\.[^.]+$/, '') + '.net', d: d }), cols: [_t('Domain'), _t('Type'), ''],
        pick: function (r) { return r.aliases; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td' + DL('Domain') + '><b class="ghh-strong">' + esc(x.name) + '</b></td><td' + DL('Type') + '>' + (x.type === 'alias' ? '<span class="ghh-pill ghh-pill--ok">' + _t('Alias (same site)') + '</span>' : '<span class="ghh-pill ghh-pill--muted">' + _t('Redirect to {d}', { d: ltr(d) }) + '</span>') + '</td>' + (can('aliases', 'delete') ? delCell(i, _t('Remove {what}', { what: x.name })) : '<td></td>') + '</tr>'; }); },
        form: function () { return [_t('Add a domain alias'), fld('name', _t('Alias domain'), { required: true, placeholder: 'example.net' }) + fld('alias', _t('Behaviour'), { options: [['yes', _t('Show the same website')], ['no', _t('Redirect visitors to {d}', { d: d })]], value: 'yes' }), _t('Add alias')]; },
        submit: function (v) { return { op: 'add', domain: d, name: v.name, alias: v.alias !== 'no' }; },
        del: function (x) { return [_t('Remove alias {name}?', { name: x.name }), { op: 'delete', domain: d, name: x.name }, _t('Remove')]; } });
    }
    function redirects() {
      var d = S.domain;
      listView({ section: 'redirects', query: { domain: d }, title: _t('Redirects'), sub: _t('Send visitors from an old address on {d} to a new one.', { d: B_(d) }), addLabel: _t('New redirect'), canAdd: can('redirects', 'add'),
        emptyIcon: 'redirects', emptyTitle: _t('No redirects yet'), emptyText: _t('Moved a page? Redirect {path} to its new address so links and search rankings keep working.', { path: '/old-page' }), cols: [_t('From'), _t('To'), _t('Type'), ''],
        pick: function (r) { return r.redirects; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td' + DL('From') + '><code>' + esc(d + x.path) + '</code></td><td' + DL('To') + ' class="ghh-wrap"><code>' + esc(x.to) + '</code></td><td' + DL('Type') + '><span class="ghh-pill ghh-pill--muted">' + esc(x.type === '301' ? _t('{code} permanent', { code: x.type }) : _t('{code} temporary', { code: x.type })) + '</span></td>' + (can('redirects', 'delete') ? delCell(i, _t('Delete redirect {path}', { path: x.path })) : '<td></td>') + '</tr>'; }); },
        form: function () { return [_t('New redirect'), fld('path', _t('From path'), { required: true, prefix: d, placeholder: '/old-page' }) + fld('to', _t('To address'), { required: true, type: 'url', placeholder: 'https://' + d + '/new-page' }) + fld('type', _t('Type'), { options: [['301', _t('301 Permanent (best for SEO)')], ['302', _t('302 Temporary')], ['303', _t('303 See other')]], value: '301', wide: true }), _t('Add redirect')]; },
        submit: function (v) { return { op: 'add', domain: d, path: v.path.charAt(0) === '/' ? v.path : '/' + v.path, to: v.to, type: v.type }; },
        del: function (x) { return [_t('Delete the redirect from {path}?', { path: x.path }), { op: 'delete', domain: d, path: x.path }]; } });
    }

    /* ------------------------------------------------------------ PHP */
    function php() {
      var d = S.domain;
      body.innerHTML = bar(_t('PHP version'), _t('Choose the PHP version {d} runs on. Check your site after switching.', { d: B_(d) }), '') + '<div data-list>' + skel(2) + '</div>';
      var list = body.querySelector('[data-list]');
      var load = function () {
        list.innerHTML = skel(2);
        api('php', { domain: d }).then(function (r) {
          if (!r.options.length) { list.innerHTML = empty('php', _t('Only one PHP version'), _t('This server offers a single PHP version for {d}.', { d: d })); return; }
          list.innerHTML = '<form class="ghh-php" data-f><fieldset><legend class="ghh-sr">' + _t('PHP version for {d}', { d: esc(d) }) + '</legend><div class="ghh-choices">' + r.options.map(function (o) {
            var on = o.id === r.current;
            return '<label class="ghh-choice' + (on ? ' is-on' : '') + '"><input type="radio" name="php" value="' + esc(o.id) + '"' + (on ? ' checked' : '') + (can('php', 'set') ? '' : ' disabled') + '><span class="ghh-choice__mk" aria-hidden="true"></span><span class="ghh-choice__tx"><b dir="ltr">' + esc(o.label) + '</b>' + (on ? '<em>' + _t('Current') + '</em>' : '') + '</span></label>';
          }).join('') + '</div></fieldset>' + (can('php', 'set') ? '<div class="ghh-form__foot"><button type="submit" class="ghh-btn ghh-btn--pri" disabled>' + _t('Switch version') + '</button></div>' : '') + '</form>';
          var f = list.querySelector('form'), sb = f.querySelector('[type=submit]');
          f.onchange = function () { [].forEach.call(f.querySelectorAll('.ghh-choice'), function (l) { l.classList.toggle('is-on', l.querySelector('input').checked); }); if (sb) sb.disabled = (f.php.value || '') === r.current; };
          f.onsubmit = function (e) { e.preventDefault(); busy(sb, true); api('php', null, { json: { op: 'set', domain: d, id: f.php.value } }).then(function (x) { toast(x.message); load(); }, function (er) { busy(sb, false); fail(er); }); };
        }, function (e) { fail(e, list); retryOn(list, load); });
      };
      load();
    }

    /* ------------------------------------------------------------ Autoresponders + vacation */
    function autoresponders() {
      var d = S.domain, vac = can('autoresponders', 'vacation');
      body.innerHTML = bar(_t('Autoresponders'), _t('Automatic replies for addresses on {d}.', { d: B_(d) }), can('autoresponders', 'create') ? addBtn(_t('New autoresponder')) : '') + '<div data-slot></div><div data-list>' + skel(2) + '</div>' +
        (vac ? '<div class="ghh-sep"></div>' + bar(_t('Vacation messages'), esc(_t('Replies that run only between two dates, then switch off by themselves.')), addBtn(_t('New vacation message'), 'data-addv')) + '<div data-vslot></div><div data-vlist>' + skel(2) + '</div>' : '');
      var list = body.querySelector('[data-list]'), slot = body.querySelector('[data-slot]'), vlist = body.querySelector('[data-vlist]'), vslot = body.querySelector('[data-vslot]'), A = [], V = [];
      var load = function () {
        api('autoresponders', { domain: d }).then(function (r) { A = r.autoresponders; V = r.vacations || []; render(); }, function (e) { fail(e, list); retryOn(list, load); if (vlist) vlist.innerHTML = ''; });
      };
      var newA = function () { formPanel(slot, _t('New autoresponder'), fld('user', _t('For address'), { required: true, suffix: '@' + d, placeholder: 'info' }) + fld('cc', _t('Send a copy to (optional)'), { type: 'email', placeholder: 'you@example.com' }) + fld('text', _t('Reply message'), { area: true, required: true, wide: true }), _t('Save autoresponder'), function (v) { return api('autoresponders', null, { json: { op: 'create', domain: d, user: v.user, cc: v.cc, text: v.text } }).then(function (r) { toast(r.message); load(); }); }); };
      var today = new Date().toISOString().slice(0, 10), week = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      var newV = function () { formPanel(vslot, _t('New vacation message'), fld('user', _t('For address'), { required: true, suffix: '@' + d, placeholder: 'info', wide: true }) + fld('start', _t('From'), { type: 'date', value: today, required: true }) + fld('end', _t('Until'), { type: 'date', value: week, required: true }) + fld('text', _t('Message'), { area: true, required: true, wide: true, value: _t('Thanks for your email. I am away and will reply when I am back.') }), _t('Save vacation message'), function (v) { return api('autoresponders', null, { json: { op: 'vacation', domain: d, user: v.user, start: v.start, end: v.end, text: v.text } }).then(function (r) { toast(r.message); load(); }); }); };
      var render = function () {
        list.innerHTML = A.length ? table([_t('Address'), _t('Copy sent to'), ''], A.map(function (x, i) { return '<tr><td' + DL('Address') + '><b class="ghh-strong">' + esc(x.email) + '</b></td><td' + DL('Copy to') + '>' + (x.cc ? '<bdi dir="ltr">' + esc(x.cc) + '</bdi>' : '<span class="ghh-muted">' + _t('No copy') + '</span>') + '</td>' + (can('autoresponders', 'delete') ? '<td class="ghh-act" data-i="' + i + '" data-k="a"><button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(_t('Delete autoresponder {addr}', { addr: x.email })) + '">' + ic('trash') + '</button></td>' : '<td></td>') + '</tr>'; }))
          : empty('autoresponders', _t('No autoresponders'), _t('Reply instantly to everyone who writes to {addr}, for example with your opening hours.', { addr: 'support@' + d }), can('autoresponders', 'create') ? addBtn(_t('New autoresponder'), 'data-add2') : '');
        var a2 = list.querySelector('[data-add2]'); if (a2) a2.onclick = newA;
        if (vlist) vlist.innerHTML = V.length ? table([_t('Address'), _t('Active'), ''], V.map(function (x, i) { return '<tr><td' + DL('Address') + '><b class="ghh-strong">' + esc(x.email) + '</b></td><td' + DL('Active') + '>' + (x.start ? esc(_t('{start} to {end}', { start: x.start, end: x.end || '' })) : '<span class="ghh-muted">' + _t('Scheduled') + '</span>') + '</td><td class="ghh-act" data-i="' + i + '" data-k="v"><button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(_t('Delete vacation message {addr}', { addr: x.email })) + '">' + ic('trash') + '</button></td></tr>'; }))
          : '<p class="ghh-note">' + _t('No vacation messages scheduled.') + '</p>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(body.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () {
            var cell = b.closest('[data-i]'), isV = cell.getAttribute('data-k') === 'v', x = (isV ? V : A)[+cell.getAttribute('data-i')];
            confirmIn(cell, isV ? _t('Delete the vacation message for {addr}?', { addr: x.email }) : _t('Delete the autoresponder for {addr}?', { addr: x.email }), _t('Delete'), function (back) { api('autoresponders', null, { json: { op: isV ? 'removeVacation' : 'delete', domain: d, user: x.user } }).then(function (r) { toast(r.message); load(); }, function (e) { fail(e); back(); }); });
          };
        });
      };
      var add = body.querySelector('[data-add]'); if (add) add.onclick = newA;
      var addv = body.querySelector('[data-addv]'); if (addv) addv.onclick = newV;
      load();
    }

    /* ------------------------------------------------------------ Spam */
    function spam() {
      var d = S.domain;
      body.innerHTML = bar(_t('Spam filter'), _t('SpamAssassin settings for mail to {d}.', { d: B_(d) }), '') + '<div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]');
      var load = function () {
        list.innerHTML = skel(3);
        api('spam', { domain: d }).then(function (r) {
          if (!r.available) { list.innerHTML = empty('spam', _t('Spam filter not available'), _t('SpamAssassin is not enabled for this account. Ask support to switch it on.')); return; }
          var where = [['inbox', _t('Deliver to the inbox, marked as spam')], ['spamfolder', _t('Move to a shared spam folder')], ['userspamfolder', _t('Move to each mailbox\'s Junk folder')], ['delete', _t('Delete it')]];
          list.innerHTML = '<form class="ghh-panel" data-f novalidate>' +
            '<label class="ghh-switch"><input type="checkbox" name="enabled"' + (r.enabled ? ' checked' : '') + '><span class="ghh-switch__t" aria-hidden="true"></span><span><b>' + _t('Filter spam') + '</b><small>' + _t('Score every incoming message and act on likely spam.') + '</small></span></label>' +
            '<div class="ghh-form__grid" data-opts>' +
            fld('threshold', _t('Spam score threshold'), { type: 'number', min: 1, value: r.threshold, hint: _t('Lower catches more spam but risks real mail. 5 is a good default.') }) +
            fld('where', _t('When a message is spam'), { options: where, value: r.where }) +
            fld('highScore', _t('Very high score'), { type: 'number', min: 1, value: r.highScore, hint: _t('Messages above this score can be deleted outright.') }) +
            '<div class="ghh-fld"><span class="ghh-lbl">&nbsp;</span><label class="ghh-check"><input type="checkbox" name="highScoreBlock"' + (r.highScoreBlock ? ' checked' : '') + '> ' + _t('Delete mail above the very high score') + '</label></div>' +
            '</div><p class="ghh-form__err" role="alert" hidden></p>' + (can('spam', 'set') ? '<div class="ghh-form__foot"><button type="submit" class="ghh-btn ghh-btn--pri">' + _t('Save settings') + '</button></div>' : '') + '</form>';
          var f = list.querySelector('form'), opts = f.querySelector('[data-opts]'), err = f.querySelector('.ghh-form__err');
          var sync = function () { opts.classList.toggle('is-off', !f.enabled.checked); [].forEach.call(opts.querySelectorAll('input,select'), function (x) { x.disabled = !f.enabled.checked; }); };
          f.enabled.onchange = sync; sync();
          var thr = f.querySelector('[name=threshold]'); if (thr) thr.step = '0.5';
          f.onsubmit = function (e) {
            e.preventDefault(); var sb = f.querySelector('[type=submit]'); busy(sb, true); err.hidden = true;
            api('spam', null, { json: { op: 'set', domain: d, settings: { enabled: f.enabled.checked, threshold: +thr.value, where: f.querySelector('[name=where]').value, highScore: +f.querySelector('[name=highScore]').value, highScoreBlock: f.highScoreBlock.checked } } })
              .then(function (x) { busy(sb, false); toast(x.message); }, function (er) { busy(sb, false); if (er.code === 'expired') return expired(); err.textContent = er.message; err.hidden = false; });
          };
        }, function (e) { fail(e, list); retryOn(list, load); });
      };
      load();
    }

    /* ------------------------------------------------------------ FTP */
    function ftp() {
      var d = S.domain;
      listView({ section: 'ftp', query: { domain: d }, title: _t('FTP accounts'), sub: _t('Logins for FileZilla and other FTP apps. Server: {host}, port 21.', { host: '<code>ftp.' + esc(d) + '</code>' }), addLabel: _t('New FTP account'), canAdd: can('ftp', 'create'),
        emptyIcon: 'ftp', emptyTitle: _t('No extra FTP accounts'), emptyText: _t('Give a designer or developer access to just one folder of your site.'), cols: [_t('Login'), _t('Folder'), ''],
        pick: function (r) { return r.accounts; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td' + DL('Login') + '><b class="ghh-strong">' + esc(x.login) + '</b></td><td' + DL('Folder') + '><code>' + esc(x.path || '/') + '</code></td><td class="ghh-act" data-i="' + i + '">' + (can('ftp', 'password') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-pw>' + ic('key', 14) + ' ' + _t('Password') + '</button>' : '') + (can('ftp', 'delete') ? '<button type="button" class="ghh-icon ghh-icon--danger" data-del aria-label="' + esc(_t('Delete {what}', { what: x.login })) + '">' + ic('trash') + '</button>' : '') + '</td></tr>'; }); },
        form: function () { return [_t('New FTP account'), fld('user', _t('User name'), { required: true, suffix: '@' + d, placeholder: 'designer' }) + fld('password', _t('Password'), { type: 'password', required: true }) + fld('dirType', _t('Access to'), { options: [['@domain', _t('The website folder (public_html)')], ['@ftp', _t('The public FTP folder')], ['custom', _t('A specific folder')]], value: '@domain' }) + fld('dir', _t('Folder'), { prefix: '~', placeholder: '/domains/' + d + '/public_html/uploads', hidden: true }), _t('Create account')]; },
        afterForm: function (f) { var t = f.querySelector('[name=dirType]'), box = f.querySelector('[data-f=dir]'); t.onchange = function () { box.hidden = t.value !== 'custom'; }; },
        submit: function (v) { return { op: 'create', domain: d, user: v.user, password: v.password, dir: v.dirType === 'custom' ? v.dir || '/' : v.dirType }; },
        del: function (x) { return [_t('Delete FTP login {login}? Files stay.', { login: x.login }), { op: 'delete', domain: d, user: x.user }]; },
        bind: function (list, items, slot) { [].forEach.call(list.querySelectorAll('[data-pw]'), function (b) { b.onclick = function () { var x = items[+b.closest('[data-i]').getAttribute('data-i')]; formPanel(slot, _t('New password for {what}', { what: x.login }), fld('password', _t('New password'), { type: 'password', required: true, wide: true }), _t('Change password'), function (v) { return api('ftp', null, { json: { op: 'password', domain: d, user: x.user, password: v.password } }).then(function (r) { toast(r.message); }); }); }; }); } });
    }

    /* ------------------------------------------------------------ Protected folders */
    function protect() {
      var d = S.domain, base = '/domains/' + d + '/public_html';
      listView({ section: 'protect', title: _t('Protected folders'), sub: esc(_t('Ask for a user name and password before anyone can open a folder of your website.')), addLabel: _t('Protect a folder'), canAdd: can('protect', 'add'),
        emptyIcon: 'protect', emptyTitle: _t('No protected folders'), emptyText: _t('Lock a staging site or an admin area with a password.'), cols: [_t('Folder'), _t('Login prompt'), _t('Users'), ''],
        pick: function (r) { return r.folders; },
        onError: function (e, list) { list.innerHTML = '<div class="ghh-alert ghh-alert--soft">' + ic('alert', 18) + '<span>' + esc(_t('Existing protected folders could not be listed ({reason}). You can still protect a folder.', { reason: e.message })) + '</span></div>'; },
        render: function (xs) { return xs.map(function (x, i) { return '<tr><td' + DL('Folder') + '><code>' + esc(x.path) + '</code></td><td' + DL('Prompt') + ' dir="auto">' + esc(x.realm || '') + '</td><td' + DL('Users') + '>' + (x.users.length ? '<bdi dir="ltr">' + esc(x.users.join(', ')) + '</bdi>' : '<span class="ghh-muted">' + _t('None') + '</span>') + '</td>' + (can('protect', 'delete') ? delCell(i, _t('Remove protection from {path}', { path: x.path })) : '<td></td>') + '</tr>'; }); },
        form: function () { return [_t('Protect a folder on {d}', { d: d }), fld('sub', _t('Folder'), { prefix: 'public_html/', placeholder: 'admin', required: true, wide: true, hint: _t('The folder must already exist. Use / for the whole site.') }) + fld('realm', _t('Login prompt'), { value: _t('Members only'), required: true, plain: true }) + fld('user', _t('User name'), { required: true }) + fld('password', _t('Password'), { type: 'password', required: true, wide: true }), _t('Protect folder')]; },
        submit: function (v) { var sub = String(v.sub || '').replace(/^\/+|\/+$/g, ''); return { op: 'add', path: base + (sub ? '/' + sub : ''), realm: v.realm, user: v.user, password: v.password }; },
        del: function (x) { return [_t('Remove password protection from {path}?', { path: x.path }), { op: 'delete', path: x.path }, _t('Remove')]; } });
    }

    /* ------------------------------------------------------------ Cron */
    var PRESETS = [['', _t('Choose a common schedule')], ['*/5 * * * *', _t('Every 5 minutes')], ['*/15 * * * *', _t('Every 15 minutes')], ['0 * * * *', _t('Every hour')], ['0 3 * * *', _t('Every day at 03:00')], ['0 3 * * 1', _t('Every Monday at 03:00')], ['0 3 1 * *', _t('First day of each month at 03:00')]];
    function cronText(j) {
      var k = [j.minute, j.hour, j.dayofmonth, j.month, j.dayofweek].join(' ');
      var p = PRESETS.filter(function (x) { return x[0] === k; })[0];
      return p ? p[1] : '';
    }
    function cron() {
      var FIELDS = [['minute', _t('Minute'), '0-59'], ['hour', _t('Hour'), '0-23'], ['dayofmonth', _t('Day'), '1-31'], ['month', _t('Month'), '1-12'], ['dayofweek', _t('Weekday'), _t('0-7, 0 = Sun')]];
      listView({ section: 'cron', title: _t('Cron jobs'), sub: esc(_t('Run a script on a schedule (server time), for example WordPress tasks or backups. Commands run as your hosting user.')), addLabel: _t('New cron job'), canAdd: can('cron', 'add'),
        emptyIcon: 'cron', emptyTitle: _t('No cron jobs'), emptyText: _t('Schedule a PHP script, e.g. {cmd}', { cmd: '/usr/local/bin/php ~/domains/site/public_html/cron.php' }), cols: [_t('Schedule'), _t('Command'), ''],
        pick: function (r) { return r.jobs; },
        render: function (xs) { return xs.map(function (j, i) { var t = cronText(j); return '<tr><td' + DL('Schedule') + '><code class="ghh-cron">' + esc([j.minute, j.hour, j.dayofmonth, j.month, j.dayofweek].join(' ')) + '</code>' + (t ? '<small class="ghh-muted ghh-block">' + esc(t) + '</small>' : '') + '</td><td' + DL('Command') + ' class="ghh-wrap"><code>' + esc(j.command) + '</code></td>' + (can('cron', 'delete') ? delCell(i, _t('Delete cron job')) : '<td></td>') + '</tr>'; }); },
        form: function () {
          return [_t('New cron job'), fld('preset', _t('Schedule'), { options: PRESETS, value: '', wide: true }) + '<div class="ghh-cronf ghh-fld--wide">' + FIELDS.map(function (f) { return fld(f[0], f[1], { value: '*', required: true, hint: f[2] }); }).join('') + '</div>' + fld('command', _t('Command'), { required: true, wide: true, placeholder: '/usr/local/bin/php /home/' + S.session.username + '/domains/' + S.domain + '/public_html/cron.php' }), _t('Add cron job')];
        },
        afterForm: function (f) { var pr = f.querySelector('[name=preset]'); pr.onchange = function () { if (!pr.value) return; pr.value.split(' ').forEach(function (v, i) { f.querySelector('[name=' + FIELDS[i][0] + ']').value = v; }); }; },
        submit: function (v) { return { op: 'add', minute: v.minute, hour: v.hour, dayofmonth: v.dayofmonth, month: v.month, dayofweek: v.dayofweek, command: v.command }; },
        del: function (j) { return [_t('Delete this cron job?'), { op: 'delete', id: j.id }]; } });
    }

    /* ------------------------------------------------------------ WordPress */
    function wordpress() {
      listView({ section: 'wordpress', title: _t('WordPress sites'), sub: esc(_t('WordPress installations found on this account.')), canAdd: false,
        emptyIcon: 'wordpress', emptyTitle: _t('No WordPress sites found'), emptyText: _t('Install WordPress from the WordPress manager in your control panel, then it appears here.'), cols: [_t('Site'), _t('Version'), _t('Folder')],
        pick: function (r) { return r.sites; },
        render: function (xs) { return xs.map(function (w) { return '<tr><td' + DL('Site') + '>' + (/^https?:\/\//.test(w.url) ? '<a class="ghh-strong" href="' + esc(w.url) + '" target="_blank" rel="noopener"><bdi dir="ltr">' + esc(w.url.replace(/^https?:\/\//, '')) + '</bdi> ' + ic('ext', 13) + '</a>' : esc(w.url)) + '</td><td' + DL('Version') + '>' + (w.version ? '<span class="ghh-pill ghh-pill--muted">' + esc(w.version) + '</span>' : '') + '</td><td' + DL('Folder') + '><code>' + esc(w.path) + '</code></td></tr>'; }); },
        form: function () { return ['', '', '']; }, submit: function () { return {}; }, del: function () { return ['', {}]; } });
    }

    /* ------------------------------------------------------------ SSL */
    function ssl() {
      body.innerHTML = bar(_t('SSL certificates'), esc(_t('Live HTTPS check of each domain on this account.')), '<button type="button" class="ghh-btn" data-re>' + ic('refresh') + ' ' + _t('Check again') + '</button>') + '<div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), rows = [], canIssue = false;
      var load = function () { list.innerHTML = skel(3); api('ssl').then(function (r) { rows = r.status; canIssue = r.canIssue; render(); }, function (e) { fail(e, list); retryOn(list, load); }); };
      var render = function () {
        if (!rows.length) { list.innerHTML = empty('ssl', _t('No domains found'), _t('Add a domain to your hosting account first.')); return; }
        list.innerHTML = '<div class="ghh-cards">' + rows.map(function (s, i) {
          var ok = s.https && s.daysLeft > 14, warn = s.https && s.daysLeft <= 14;
          var badge = ok ? '<span class="ghh-pill ghh-pill--ok"><i class="ghh-hexdot"></i>' + _t('Secure') + '</span>' : warn ? '<span class="ghh-pill ghh-pill--warn">' + _t('Expires soon') + '</span>' : '<span class="ghh-pill ghh-pill--bad">' + _t('Not secure') + '</span>';
          return '<article class="ghh-card ghh-ssl" data-i="' + i + '"><header><span class="ghh-ficon ' + (ok ? 'ghh-ficon--ok' : 'ghh-ficon--bad') + '">' + ic('ssl', 16) + '</span><h4 dir="ltr">' + esc(s.domain) + '</h4>' + badge + '</header>' +
            '<dl>' + (s.issuer ? '<div><dt>' + _t('Issuer') + '</dt><dd dir="auto">' + esc(s.issuer) + '</dd></div>' : '') + (s.validTo ? '<div><dt>' + _t('Valid until') + '</dt><dd>' + L10N.date(new Date(s.validTo), { day: 'numeric', month: 'short', year: 'numeric' }) + (s.daysLeft != null ? ' <span class="ghh-muted">(' + esc(_tp(s.daysLeft, '{n} day', '{n} days')) + ')</span>' : '') + '</dd></div>' : '') + (s.error ? '<div><dt>' + _t('Status') + '</dt><dd>' + esc(L10N.srv(s.error)) + '</dd></div>' : '') + '</dl>' +
            (canIssue ? '<div class="ghh-ssl__go" data-go><label class="ghh-check"><input type="checkbox" data-www checked> ' + _t('Include {host}', { host: ltr('www.' + s.domain) }) + '</label><button type="button" class="ghh-btn ' + (ok ? '' : 'ghh-btn--pri') + '" data-issue>' + ic('shield', 15) + ' ' + (s.https ? _t('Renew now') : _t('Issue free SSL')) + '</button></div>' : '') + '</article>';
        }).join('') + '</div>';
        [].forEach.call(list.querySelectorAll('[data-issue]'), function (b) {
          b.onclick = function () {
            var card = b.closest('[data-i]'), s = rows[+card.getAttribute('data-i')];
            busy(b, true);
            api('ssl', null, { json: { op: 'issue', domain: s.domain, www: card.querySelector('[data-www]').checked } }).then(function (r) { busy(b, false); toast(r.message); setTimeout(load, 8000); }, function (e) { busy(b, false); fail(e); });
          };
        });
      };
      body.querySelector('[data-re]').onclick = load;
      load();
    }

    /* ------------------------------------------------------------ Backups */
    function backups() {
      body.innerHTML = bar(_t('Backups'), esc(_t('Copies of your websites, email and databases stored in your account.')), can('backups', 'create') ? '<button type="button" class="ghh-btn ghh-btn--pri" data-new>' + ic('backups') + ' ' + _t('Create backup') + '</button>' : '') + '<div data-list>' + skel(3) + '</div>';
      var list = body.querySelector('[data-list]'), items = [];
      var load = function () { list.innerHTML = skel(3); api('backups').then(function (r) { items = r.backups; render(); }, function (e) { fail(e, list); retryOn(list, load); }); };
      var render = function () {
        if (!items.length) { list.innerHTML = empty('backups', _t('No backups yet'), _t('Create one before big changes such as a theme switch or plugin update.')); return; }
        list.innerHTML = '<div class="ghh-tw"><table class="ghh-t"><thead><tr><th scope="col">' + _t('Backup') + '</th><th scope="col">' + _t('Size') + '</th><th scope="col">' + _t('Created') + '</th><th scope="col"><span class="ghh-sr">' + _t('Actions') + '</span></th></tr></thead><tbody>' + items.map(function (b, i) {
          return '<tr><td' + DL('Backup') + '><span class="ghh-fname"><span class="ghh-ficon">' + ic('backups', 16) + '</span><code>' + esc(b.name) + '</code></span></td><td' + DL('Size') + ' class="ghh-nw">' + (b.size ? '<bdi dir="ltr">' + bytes(b.size) + '</bdi>' : '') + '</td><td' + DL('Created') + '>' + when(b.created) + '</td>' +
            '<td class="ghh-act" data-i="' + i + '">' + (can('backups', 'restore') ? '<button type="button" class="ghh-btn ghh-btn--sm" data-rs>' + _t('Restore') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
        bindAll();
      };
      bindAll = function () {
        [].forEach.call(list.querySelectorAll('[data-rs]'), function (b) {
          b.onclick = function () { var cell = b.closest('[data-i]'), it = items[+cell.getAttribute('data-i')]; confirmIn(cell, _t('Restore {name}? Current files, email and databases are replaced.', { name: it.name }), _t('Restore'), function (back) { api('backups', null, { json: { op: 'restore', name: it.name } }).then(function (r) { toast(r.message); back(); }, function (e) { fail(e); back(); }); }); };
        });
      };
      var nb = body.querySelector('[data-new]');
      if (nb) nb.onclick = function () { busy(nb, true); api('backups', null, { json: { op: 'create' } }).then(function (r) { busy(nb, false); toast(r.message); setTimeout(load, 15000); }, function (e) { busy(nb, false); fail(e); }); };
      load();
    }
  }

  ready(function () {
    try {
      if (!/productdetails/.test(location.search) && !/\/services\/\d+/.test(location.pathname)) return;
      var tries = 0;
      (function wait() { if (window.GH_HOSTING && window.GH_HOSTING.token) mount(window.GH_HOSTING); else if (++tries < 10) setTimeout(wait, 300); })();
    } catch (e) {}
  });
})();

// Feedback on the WHMCS pages we skin: purchase celebration (order complete, invoice turned Paid) with a "what happens
// next" card and one GA4 purchase event per order, a hexagon wait screen while the payment page opens, checkout errors
// linked to their fields, ticket confirmation, domain added to cart, and roles on WHMCS's own alerts.
// Selectors follow WHMCS's standard templates (standard_cart complete.tpl / viewinvoice.tpl / ticketconfirmation.tpl);
// every step does nothing when its element is missing. Motion: transform / opacity; reduced motion shows the end state.
(function () {
  'use strict';
  if (!window.GH_L10N || window.GH_L10N.wait) return;
  var L10N = window.GH_L10N, _t = L10N.t;
  var D = document, W = window, P = location.pathname, Q = location.search;
  var reduce = false; try { reduce = W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function ready(f) { if (D.readyState !== 'loading') f(); else D.addEventListener('DOMContentLoaded', f); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var ss = (function () { try { var s = W.sessionStorage, k = '__gh'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; } })();
  var once = function (k) { if (!ss) return true; if (ss.getItem(k)) return false; ss.setItem(k, '1'); return true; };
  var HEX = 'M60 8 105 34v52L60 112 15 86V34z';
  var live = function (msg) { var r = D.getElementById('gh-live'); if (!r) { r = D.createElement('div'); r.id = 'gh-live'; r.className = 'gh-sr'; r.setAttribute('aria-live', 'polite'); D.body.appendChild(r); } r.textContent = ''; setTimeout(function () { r.textContent = msg; }, 60); };

  /* ---------------- purchase burst + "what happens next" card */
  function burst() {
    var p = '', C = ['#c5386f', '#fdd700', '#e14c7f', '#fdd700'];
    for (var i = 0; i < 12; i++) p += '<i class="gh-ok__p" style="--a:' + (i * 30 + (i % 2 ? 12 : 0)) + 'deg;--d:' + (62 + (i % 3) * 14) + 'px;--c:' + C[i % 4] + ';--s:' + (6 + (i % 3) * 3) + 'px;--t:' + (0.55 + (i % 4) * 0.04).toFixed(2) + 's"></i>';
    return '<div class="gh-ok__burst" aria-hidden="true">' + p + '<svg class="gh-ok__hex" viewBox="0 0 120 120" width="120" height="120" focusable="false"><defs><linearGradient id="gh-ok-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e14c7f"/><stop offset=".6" stop-color="#c5386f"/><stop offset="1" stop-color="#8f1c52"/></linearGradient></defs>' +
      '<path class="gh-ok__fill" d="' + HEX + '" fill="url(#gh-ok-g)"/><path class="gh-ok__line" d="' + HEX + '" pathLength="100"/><path class="gh-ok__tick" d="M40 62 54 76 82 46" pathLength="100"/></svg></div>';
  }
  function card(o) {
    var steps = o.steps.map(function (s, i) { return '<li><span class="gh-ok__n" aria-hidden="true">' + (i + 1) + '</span><div><b>' + esc(s[0]) + '</b><p>' + esc(s[1]) + '</p>' + (s[2] ? '<a href="' + esc(s[2]) + '">' + esc(s[3]) + '</a>' : '') + '</div></li>'; }).join('');
    var meta = o.meta.filter(Boolean).map(function (m) { return '<span>' + m + '</span>'; }).join('');
    return '<section class="gh-ok ' + (reduce ? 'is-still' : 'is-on') + '" role="status" aria-labelledby="gh-ok-h" tabindex="-1">' + burst() +
      '<div class="gh-ok__card"><h2 id="gh-ok-h">' + esc(o.title) + '</h2>' + (meta ? '<p class="gh-ok__meta">' + meta + '</p>' : '') + (o.lead ? '<p class="gh-ok__lead">' + esc(o.lead) + '</p>' : '') +
      '<h3>' + esc(_t('What happens next')) + '</h3><ol class="gh-ok__steps">' + steps + '</ol></div></section>';
  }
  /* GA4 / GTM: one "purchase" per order or invoice (sessionStorage guard), only where a tag is already on the page */
  function purchase(id, value, currency, invoiceId) {
    if (!id || !once('gh-purchase:' + id)) return;
    if (invoiceId && ss) ss.setItem('gh-purchase-inv:' + invoiceId, '1');
    var ev = { transaction_id: String(id) };
    if (value != null && !isNaN(value)) { ev.value = Number(value); if (currency) ev.currency = String(currency).toUpperCase(); }
    try {
      if (typeof W.gtag === 'function') W.gtag('event', 'purchase', ev);
      else if (W.dataLayer && W.dataLayer.push) W.dataLayer.push({ event: 'purchase', ecommerce: ev });
    } catch (e) {}
  }
  function money(txt) {
    var m = String(txt || '').replace(/\s+/g, ' ').match(/([A-Z]{3})?\s*([$€£₹]|AED|USD|EUR|GBP|INR|SAR)?\s*([\d.,]+\d)\s*([A-Z]{3})?/);
    if (!m) return null;
    var cur = m[1] || m[4] || ({ '$': 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR' })[m[2]] || m[2] || '';
    var n = m[3].replace(/,(?=\d{3}\b)/g, '').replace(/,/g, '.');
    return { value: parseFloat(n), currency: cur, text: String(txt).replace(/\s+/g, ' ').trim() };
  }
  function play(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) {} }

  function orderComplete() {
    var box = D.querySelector('#order-standard_cart .order-confirmation, .order-confirmation');
    if (!/cart\.php/i.test(P) || !(/[?&]a=complete\b/.test(Q) || box) || D.querySelector('.gh-ok')) return;
    var G = W.GH_ORDER || {}; // optional: printed by the WHMCS hook on the complete page ({ number, amount, currency, invoiceId, paid })
    var root = D.querySelector('#order-standard_cart') || D.querySelector('#main-body .container, #main-body, main');
    if (!root) return;
    var txt = (box && box.textContent) || root.textContent || '';
    var num = G.number || G.id || ((box && box.querySelector('span, strong')) || {}).textContent || (txt.match(/(?:order number|رقم الطلب)[^\d]{0,12}(\d{3,})/i) || [])[1] || '';
    num = String(num).trim().replace(/[^\w-]/g, '');
    var invA = root.querySelector('a[href*="viewinvoice.php?id="]');
    var inv = G.invoiceId || (invA ? (invA.getAttribute('href').match(/id=(\d+)/) || [])[1] : '');
    var unpaid = G.paid === false || (G.paid !== true && !!root.querySelector('.alert-warning a[href*="viewinvoice.php"]'));
    var amt = G.amount != null ? { value: +G.amount, currency: G.currency || '', text: G.amountText || (G.currency ? G.amount + ' ' + G.currency : String(G.amount)) } : null;
    var meta = [num ? _t('Order #{n}', { n: esc(num) }) : '', amt ? esc(_t('Total {amount}', { amount: amt.text })) : ''];
    var html = card({
      title: unpaid ? _t('Order placed: one step left') : _t('Order confirmed'), meta: meta,
      lead: unpaid ? _t('Pay the invoice to start the set-up. Your order is saved.') : _t('Thank you. Your order is in and we are setting it up now.'),
      steps: [
        unpaid && inv ? [_t('Pay invoice #{n}', { n: inv }).replace(/[⁦-⁩]/g, ''), _t('Set-up starts automatically as soon as the payment arrives.'), 'viewinvoice.php?id=' + inv, _t('Pay now')]
          : [_t('Check your email'), _t('Your order confirmation and receipt are on their way to the email address on your account.')],
        [_t('Set up your service or domain'), _t('Hosting is created automatically. Manage it, connect your domain and add email from your account.'), 'clientarea.php?action=services', _t('Go to my services')],
        [_t('Get help any time'), _t('Our engineers answer 24/7 by ticket and WhatsApp, including free help moving your website.'), 'submitticket.php', _t('Open a support ticket')]
      ]
    });
    var h = root.querySelector('.header-lined, h1');
    var host = D.createElement('div'); host.innerHTML = html; var sec = host.firstChild;
    if (h && h.parentNode) h.parentNode.insertBefore(sec, h.nextSibling); else root.insertBefore(sec, root.firstChild);
    if (h) h.classList.add('gh-sr-h'); // the card's heading says it; the page title stays for screen readers
    if (box) box.classList.add('gh-hidden');
    requestAnimationFrame(function () { play(sec); });
    if (num) purchase('order-' + num, amt && amt.value, amt && amt.currency, inv);
  }

  function invoicePaid() {
    if (!/viewinvoice\.php/i.test(P)) return;
    var id = (Q.match(/[?&]id=(\d+)/) || [])[1]; if (!id) return;
    var st = D.querySelector('.invoice-status');
    var paid = !!(st && (st.querySelector('.paid') || /\bpaid\b|مدفوعة/i.test(st.textContent) && !/unpaid|غير مدفوعة/i.test(st.textContent)));
    var key = 'gh-inv-unpaid:' + id;
    if (!paid) { if (ss) ss.setItem(key, '1'); payWait(); return; }
    // celebrate only the moment it turns Paid: back from the payment page, or seen unpaid earlier in this visit
    var turned = /[?&]paymentsuccess=true/i.test(Q) || (ss && ss.getItem(key));
    if (!turned || D.querySelector('.gh-ok')) return;
    if (ss) ss.removeItem(key);
    var c = D.querySelector('.invoice-container'); if (!c) return;
    var tot = null; [].some.call(c.querySelectorAll('.total-row, tr'), function (r) { if (/total/i.test(r.textContent) && !/sub\s*total/i.test(r.textContent)) { var cells = r.querySelectorAll('td, th'); tot = money(cells.length ? cells[cells.length - 1].textContent : r.textContent); return !!tot; } return false; });
    var host = D.createElement('div');
    host.innerHTML = card({
      title: _t('Payment received'), meta: [_t('Invoice #{n}', { n: esc(id) }), tot ? esc(_t('Paid {amount}', { amount: tot.text })) : ''],
      lead: _t('Thank you. Your payment is confirmed and your services are being activated or renewed.'),
      steps: [
        [_t('Check your email'), _t('Your receipt is on its way. You can also download this invoice as a PDF below.')],
        [_t('Set up your service or domain'), _t('New services are created automatically within a few minutes. Renewals are already extended.'), 'clientarea.php?action=services', _t('Go to my services')],
        [_t('Get help any time'), _t('Our engineers answer 24/7 by ticket and WhatsApp.'), 'submitticket.php', _t('Open a support ticket')]
      ]
    });
    var sec = host.firstChild; c.insertBefore(sec, c.firstChild);
    requestAnimationFrame(function () { play(sec); });
    if (!(ss && ss.getItem('gh-purchase-inv:' + id))) purchase('invoice-' + id, tot && tot.value, tot && tot.currency);
  }

  /* ---------------- waiting for the payment page / order: hexagon spinner + progress text instead of a blank wait */
  function waitScreen(title) {
    var el = D.querySelector('.gh-wait'); if (el) return el;
    el = D.createElement('div'); el.className = 'gh-wait'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="gh-wait__box"><svg class="gh-wait__hex" viewBox="0 0 48 48" width="56" height="56" aria-hidden="true" focusable="false"><path d="M24 3 42.2 13.5v21L24 45 5.8 34.5v-21z" fill="none" stroke="rgba(197,56,111,.18)" stroke-width="4" stroke-linejoin="round"/><path class="gh-wait__arc" d="M24 3 42.2 13.5v21L24 45 5.8 34.5v-21z" fill="none" stroke="#c5386f" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" pathLength="120" stroke-dasharray="30 90"/></svg>' +
      '<b class="gh-wait__t"></b><p class="gh-wait__p"></p><button type="button" class="gh-wait__x" hidden>' + esc(_t('Hide this message')) + '</button></div>';
    D.body.appendChild(el);
    el.querySelector('.gh-wait__t').textContent = title;
    el.querySelector('.gh-wait__p').textContent = _t('Please keep this page open.');
    var x = el.querySelector('.gh-wait__x'); x.onclick = function () { el.remove(); };
    var steps = [[6000, _t('Still working. Secure payment pages can take up to 30 seconds to open.')], [20000, _t('This is taking longer than usual. Check your email for a receipt before paying again, or message us on WhatsApp.')]];
    steps.forEach(function (s) { setTimeout(function () { if (!el.isConnected) return; el.querySelector('.gh-wait__p').textContent = s[1]; if (s[0] > 10000) x.hidden = false; }, s[0]); });
    W.addEventListener('pageshow', function (e) { if (e.persisted && el.isConnected) el.remove(); });
    return el;
  }
  function payWait() {
    var c = D.querySelector('.invoice-container'); if (!c || c.dataset.ghWait) return; c.dataset.ghWait = '1';
    D.addEventListener('submit', function (e) {
      var f = e.target; if (e.defaultPrevented || !f || !c.contains(f) || f.target === '_blank') return;
      if (f.querySelector('select[name=gateway]') && !f.querySelector('[type=submit], button:not([type=button])')) return; // the gateway switcher reloads the page
      setTimeout(function () { if (!e.defaultPrevented) waitScreen(_t('Opening the secure payment page…')); }, 0);
    });
  }
  function checkoutWait() {
    var f = D.getElementById('frmCheckout'); if (!f || f.dataset.ghWait) return; f.dataset.ghWait = '1';
    D.addEventListener('submit', function (e) { if (e.target !== f) return; setTimeout(function () { if (!e.defaultPrevented) waitScreen(_t('Placing your order…')); }, 0); });
  }

  /* ---------------- checkout / cart errors: one announced summary, each problem linked to its field */
  var FIELD = [
    [/first name|الاسم الأول/i, '#inputFirstName'], [/last name|اسم العائلة/i, '#inputLastName'], [/e-?mail|البريد/i, '#inputEmail'],
    [/address|العنوان/i, '#inputAddress1'], [/city|المدينة/i, '#inputCity'], [/state|region|المنطقة|الولاية/i, '#stateselect, #inputState'],
    [/post ?code|zip|الرمز البريدي/i, '#inputPostcode'], [/phone|الهاتف/i, '#inputPhone'], [/password|كلمة المرور/i, '#inputNewPassword1, #inputPassword'],
    [/terms|الشروط/i, '#accepttos'], [/country|الدولة/i, '#inputCountry'], [/payment method|طريقة الدفع/i, 'input[name=paymentmethod]'],
    [/company|الشركة/i, '#inputCompanyName']
  ];
  function formErrors() {
    if (!/cart\.php|register\.php|clientarea\.php|submitticket\.php|pwreset|password/i.test(P + Q)) return;
    [].forEach.call(D.querySelectorAll('.checkout-error-feedback, #order-standard_cart .alert-danger, .login-form .alert-danger, .logincontainer .alert-danger, form .alert-danger'), function (a, n) {
      if (a.dataset.gh || a.offsetParent === null) return; a.dataset.gh = '1';
      a.setAttribute('role', 'alert'); a.tabIndex = -1; if (!a.id) a.id = 'gh-err-' + n;
      var first = null;
      [].forEach.call(a.querySelectorAll('li'), function (li) {
        var hit = FIELD.filter(function (f) { return f[0].test(li.textContent); })[0], el = hit && D.querySelector(hit[1]);
        if (!el) return;
        el.setAttribute('aria-invalid', 'true');
        var ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean); if (ids.indexOf(a.id) < 0) ids.push(a.id); el.setAttribute('aria-describedby', ids.join(' '));
        var b = D.createElement('button'); b.type = 'button'; b.className = 'gh-errlink'; b.textContent = _t('Fix this');
        b.onclick = function () { el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); setTimeout(function () { el.focus(); }, reduce ? 0 : 350); };
        li.appendChild(D.createTextNode(' ')); li.appendChild(b);
        el.addEventListener('input', function () { el.removeAttribute('aria-invalid'); }, { once: true });
        if (!first) first = el;
      });
      if (n === 0) { a.scrollIntoView({ block: 'center', behavior: 'auto' }); try { a.focus({ preventScroll: true }); } catch (e) {} }
    });
  }

  /* ---------------- WHMCS's own alerts: roles, a hexagon mark on success, ticket confirmation */
  function alerts() {
    [].forEach.call(D.querySelectorAll('.alert-danger:not([role]), .alert-warning:not([role])'), function (a) { a.setAttribute('role', 'alert'); });
    [].forEach.call(D.querySelectorAll('.alert-success'), function (a) {
      if (a.dataset.gh || a.closest('.gh-ok')) return; a.dataset.gh = '1';
      if (!a.getAttribute('role')) a.setAttribute('role', 'status');
      var mk = D.createElement('span'); mk.className = 'gh-okmk'; mk.setAttribute('aria-hidden', 'true'); a.insertBefore(mk, a.firstChild); a.classList.add('gh-alert-ok');
    });
    if (/submitticket\.php/i.test(P) && /[?&]step=3\b/.test(Q) && !D.querySelector('.gh-tk-done')) {
      var root = D.querySelector('#main-body .container, #main-body, main'); if (!root) return;
      var a = root.querySelector('a[href*="viewticket.php"]'), tid = a ? (a.textContent.match(/#?\s*([A-Z0-9-]{4,})/i) || [])[1] : '';
      var el = D.createElement('div'); el.className = 'gh-tk-done ' + (reduce ? 'is-still' : 'is-on'); el.setAttribute('role', 'status');
      el.innerHTML = '<svg class="gh-tk-done__mk" viewBox="0 0 120 120" width="64" height="64" aria-hidden="true" focusable="false"><path class="gh-ok__fill" d="' + HEX + '" fill="#c5386f"/><path class="gh-ok__line" d="' + HEX + '" pathLength="100"/><path class="gh-ok__tick" d="M40 62 54 76 82 46" pathLength="100"/></svg>' +
        '<div><h2>' + esc(_t('Ticket opened')) + '</h2><p>' + (tid ? _t('Your ticket number is {n}.', { n: '<b>' + esc(tid) + '</b>' }) + ' ' : '') + esc(_t('Our engineers reply by email and here in your account, usually within the hour.')) + '</p></div>';
      var h = root.querySelector('.header-lined, h1'); if (h && h.parentNode) h.parentNode.insertBefore(el, h.nextSibling); else root.insertBefore(el, root.firstChild);
    }
  }

  /* ---------------- domain search: available result pops, "add to cart" pops, cart badge bumps */
  function cartFx() {
    var bump = function (el) { if (!el || reduce) return; el.classList.remove('gh-bump'); void el.offsetWidth; el.classList.add('gh-bump'); setTimeout(function () { el.classList.remove('gh-bump'); }, 600); };
    var badges = D.querySelectorAll('#cartItemCount, .cart-item-count, .gh-cart-count, a[href*="cart.php?a=view"] .badge');
    if (W.MutationObserver) [].forEach.call(badges, function (b) { var last = b.textContent; new MutationObserver(function () { if (b.textContent !== last) { last = b.textContent; bump(b); } }).observe(b, { childList: true, characterData: true, subtree: true }); });
    var av = D.querySelector('#primaryLookupResult .domain-available, .domain-checker-available');
    if (av && W.MutationObserver) { var seen = false, chk = function () { if (!seen && av.offsetParent !== null) { seen = true; bump(av); } }; chk(); new MutationObserver(chk).observe(av, { attributes: true, attributeFilter: ['style', 'class'] }); }
    D.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.btn-add-to-cart, .domain-add-to-cart, [data-domain].btn');
      if (!b || !W.MutationObserver) return;
      var dom = b.getAttribute('data-domain') || '', t0 = b.textContent, stop = setTimeout(function () { mo.disconnect(); }, 8000);
      var mo = new MutationObserver(function () {
        if (b.textContent === t0 && !/checkout|added/i.test(b.className)) return;
        mo.disconnect(); clearTimeout(stop); bump(b); b.classList.add('gh-added');
        if (dom) live(_t('{d} is in your cart.', { d: dom }));
      });
      mo.observe(b, { attributes: true, childList: true, subtree: true, characterData: true });
    }, true);
  }

  ready(function () {
    try { orderComplete(); } catch (e) {}
    try { invoicePaid(); } catch (e) {}
    try { checkoutWait(); } catch (e) {}
    try { formErrors(); setTimeout(formErrors, 1200); } catch (e) {}
    try { alerts(); } catch (e) {}
    try { cartFx(); } catch (e) {}
  });
})();

// Renewal carts (WHMCS standard_cart: /service-renewals, domain renewals cart.php?gid=renewals / a=renewals): two
// top-aligned columns, each service or domain as a brand card (name, muted host name, due date with its "renewing in"
// pill, price, pink Add to Cart that turns into an added state with the hexagon check), an order summary that says
// what to do instead of a big $0.00, and an empty state. Plus: any page title whose colour matches its own background
// (dark on the dark title bar) is made legible. Markup follows WHMCS 8.13 standard_cart; each step is skipped when its
// element is missing.
(function () {
  'use strict';
  if (!window.GH_L10N || window.GH_L10N.wait) return;
  var _t = window.GH_L10N.t, D = document, W = window;
  var reduce = false; try { reduce = W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function ready(f) { if (D.readyState !== 'loading') f(); else D.addEventListener('DOMContentLoaded', f); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var HEXP = 'M12 2.2 20.5 7.1v9.8L12 21.8 3.5 16.9V7.1z';
  var ICON = { server: 'M7 8h10M7 12h10M7 16h6', globe: 'M5 12h14M12 5c2 2.2 3 4.6 3 7s-1 4.8-3 7c-2-2.2-3-4.6-3-7s1-4.8 3-7z' };
  var hexIc = function (k) { return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="' + HEXP + '" fill="currentColor" opacity=".14"/><path d="' + HEXP + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="' + ICON[k] + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'; };
  var checkIc = '<svg class="gh-rn__ok" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="' + HEXP + '" fill="currentColor"/><path d="m8 12.3 2.8 2.8 5.2-5.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/></svg>';
  var MONEY = /(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?[A-Z]{3})?|\d[\d,]*(?:\.\d+)?\s?(?:USD|AED|EUR|GBP|INR|SAR))/g;
  var live = function (msg) { var r = D.getElementById('gh-live'); if (!r) { r = D.createElement('div'); r.id = 'gh-live'; r.className = 'gh-sr'; r.setAttribute('aria-live', 'polite'); D.body.appendChild(r); } r.textContent = ''; setTimeout(function () { r.textContent = msg; }, 60); };

  /* ---------------- page titles: never the same colour as the bar behind them */
  function lum(c) { var m = String(c).match(/[\d.]+/g); if (!m || (m[3] !== undefined && +m[3] === 0)) return null; var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]); }
  function titleContrast() {
    [].forEach.call(D.querySelectorAll('#main-body h1, #main-body h2, .header-lined h1, .page-header h1, .main-content h1'), function (h) {
      if (h.closest('.gh-ok, .ghh, .gh-tk-done') || !h.offsetParent) return;
      var e = h, bg = null; while (e && e.nodeType === 1) { bg = lum(getComputedStyle(e).backgroundColor); if (bg !== null) break; e = e.parentElement; }
      if (bg === null) bg = 1;
      var fg = lum(getComputedStyle(h).color); if (fg === null) return;
      var ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      if (ratio < 3) h.style.setProperty('color', bg < 0.4 ? '#fff' : '#16212b', 'important');
    });
  }

  /* ---------------- renewal cards */
  function card(it) {
    if (it.dataset.gh) return; it.dataset.gh = '1';
    var domain = it.classList.contains('domain-renewal');
    var h3 = it.querySelector('h3, h4'), pill = it.querySelector('.label, .badge'), p = it.querySelector('p'), btn = it.querySelector('.btn-add-renewal-to-cart, button[type=button], .btn');
    var form = it.querySelector('form, select'); if (form && form.tagName === 'SELECT') form = form.closest('form') || form;
    if (!h3 || !btn) return;
    // "Windows RDP - <span>pokerpro</span>": product name bold, host name muted on its own line
    var host = h3.querySelector('span');
    if (host) { host.className += ' gh-rn__host'; [].forEach.call(h3.childNodes, function (n) { if (n.nodeType === 3) n.nodeValue = n.nodeValue.replace(/\s*[-–]\s*$/, ''); }); }
    // the renewal price, shown on the card's right (from the "Renewal Period" line, or the selected domain term)
    var price = '';
    if (p) { var all = p.textContent.match(MONEY); if (all) price = all[all.length - 1].trim(); }
    var sel = it.querySelector('select');
    var fromSel = function () { if (!sel || !sel.options[sel.selectedIndex]) return ''; var m = sel.options[sel.selectedIndex].text.match(MONEY); return m ? m[m.length - 1].trim() : ''; };
    if (sel) price = fromSel() || price;
    var days = pill ? +((pill.textContent.match(/\d+/) || [])[0] || 99) : 99;
    if (pill) pill.className += ' gh-rn__pill' + (days <= 7 ? ' is-urgent' : days <= 14 ? ' is-soon' : '');
    var main = D.createElement('div'); main.className = 'gh-rn__main';
    var side = D.createElement('div'); side.className = 'gh-rn__side';
    var ic = D.createElement('span'); ic.className = 'gh-rn__ic'; ic.innerHTML = hexIc(domain ? 'globe' : 'server');
    var due = D.createElement('div'); due.className = 'gh-rn__due';
    main.appendChild(h3); if (p) { p.className += ' gh-rn__meta'; due.appendChild(p); } if (pill) due.appendChild(pill); main.appendChild(due); if (form) main.appendChild(form);
    var pr = D.createElement('b'); pr.className = 'gh-rn__price'; pr.textContent = price; if (!price) pr.hidden = true;
    side.appendChild(pr); side.appendChild(btn);
    [].forEach.call(it.querySelectorAll('.pull-right, .float-right'), function (x) { if (!x.textContent.trim()) x.remove(); });
    it.innerHTML = ''; it.appendChild(ic); it.appendChild(main); it.appendChild(side); it.classList.add('gh-rn');
    if (sel) sel.addEventListener('change', function () { var v = fromSel(); if (v) { pr.textContent = v; pr.hidden = false; } });
    // WHMCS marks the button .checkout (and shows its "added" text) once the item is in the cart
    btn.classList.add('gh-rn__btn');
    var name = (h3.textContent || '').replace(/\s+/g, ' ').trim();
    var mark = function () {
      if (!btn.classList.contains('checkout') || it.classList.contains('is-added')) return;
      it.classList.add('is-added'); btn.insertAdjacentHTML('afterbegin', checkIc);
      if (!reduce) { it.classList.add('gh-rn--pop'); setTimeout(function () { it.classList.remove('gh-rn--pop'); }, 700); }
      live(_t('{name} added to your cart.', { name: name }));
    };
    if (W.MutationObserver) new MutationObserver(mark).observe(btn, { attributes: true, attributeFilter: ['class'] });
    btn.addEventListener('click', function () { if (!btn.classList.contains('checkout')) btn.classList.add('is-busy'); setTimeout(function () { btn.classList.remove('is-busy'); }, 6000); });
    mark();
  }

  /* ---------------- order summary: "Add a service to renew" instead of a large $0.00 */
  function summary(domain) {
    var s = D.getElementById('orderSummary'); if (!s) return;
    var amt = s.querySelector('.total-due-today .amt, #totalDueToday, .amt');
    var zero = !amt || !/[1-9]/.test(amt.textContent.replace(/\.0+\b/g, ''));
    s.classList.toggle('gh-sum-empty', zero);
    var msg = s.querySelector('.gh-sum-msg');
    if (zero && !msg) {
      msg = D.createElement('p'); msg.className = 'gh-sum-msg';
      msg.innerHTML = '<span aria-hidden="true">' + hexIc(domain ? 'globe' : 'server') + '</span><span>' + esc(domain ? _t('Add a domain to renew') : _t('Add a service to renew')) + '<small>' + esc(_t('Your total appears here as you add items.')) + '</small></span>';
      var box = s.querySelector('.summary-container, #producttotal') || s; box.parentNode.insertBefore(msg, box);
    } else if (!zero && msg) msg.remove();
    var vc = s.querySelector('a[href*="a=view"], .btn-checkout, #checkout');
    if (vc) { vc.classList.add('gh-sum-btn'); vc.classList.toggle('is-ready', !zero); }
  }

  function emptyState(host, domain) {
    if (!host || host.querySelector('.gh-rn-empty')) return;
    [].forEach.call((host.closest('.secondary-cart-body') || host).querySelectorAll('.alert-info, .alert-warning'), function (a) { a.classList.add('gh-hidden'); }); // our card says it
    var el = D.createElement('div'); el.className = 'gh-rn-empty';
    el.innerHTML = '<span class="gh-rn__ic">' + hexIc(domain ? 'globe' : 'server') + '</span><h2>' + esc(_t('Nothing to renew right now')) + '</h2><p>' +
      esc(domain ? _t('Domains you can renew early appear here before they expire. Domains with auto-renew on renew by themselves.') : _t('Services appear here when they are close to their due date. Your active services keep renewing on their normal schedule.')) +
      '</p><div class="gh-rn-empty__a"><a class="btn btn-primary" href="clientarea.php?action=' + (domain ? 'domains' : 'services') + '">' + esc(domain ? _t('View my domains') : _t('View my services')) + '</a>' +
      (domain ? '' : '<a class="btn btn-default" href="cart.php?gid=renewals">' + esc(_t('Renew a domain')) + '</a>') + '</div>';
    host.insertBefore(el, host.firstChild);
  }

  function renewals() {
    var root = D.getElementById('order-standard_cart'); if (!root) return;
    var items = root.querySelectorAll('.service-renewal, .domain-renewal');
    var list = root.querySelector('#serviceRenewals, #domainRenewals, .service-renewals, .domain-renewals');
    var url = location.pathname + location.search;
    if (!items.length && !list && !/service-renewals|domain-renewals|gid=renewals|a=renewals/i.test(url)) return;
    var domain = !!root.querySelector('.domain-renewal, #domainRenewals') || /domain-renewals|gid=renewals|a=renewals/i.test(url);
    D.documentElement.classList.add('gh-renew');
    [].forEach.call(items, card);
    if (!items.length) emptyState(list || root.querySelector('.secondary-cart-body'), domain);
    summary(domain);
    var s = D.getElementById('orderSummary');
    if (s && W.MutationObserver) { var busy = false; new MutationObserver(function () { if (busy) return; busy = true; summary(domain); busy = false; }).observe(s, { childList: true, subtree: true, characterData: true }); }
  }

  ready(function () {
    try { renewals(); } catch (e) {}
    try { titleContrast(); setTimeout(titleContrast, 1500); } catch (e) {}
  });
})();
