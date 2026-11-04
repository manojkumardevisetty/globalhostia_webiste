/* GlobalHostia A/B tests: counts a view, a call-to-action click and an add-to-cart click on pages with a running test
   (lib/abtest/*). Does nothing unless middleware put this browser in a test (gh_abv cookie) and never on preview links (?ab=).
   The server works out the variant from the first-party cookie and drops bots, Do-Not-Track and visitors without consent.
   "Already counted" flags stay in this browser (localStorage gh_ab_done), so unique visitors are counted without any id
   being stored on the server. No personal data is sent: the event name, the page path and those flags only. */
(function () {
  'use strict';
  var W = window, D = document;
  if (W.__ghAb) return; W.__ghAb = 1;
  if (/[?&]ab=/.test(location.search)) return;
  if (!/(?:^|;\s*)gh_abv=[a-z0-9]/.test(D.cookie)) return;
  var KEY = 'gh_ab_done', on = [], sent = {};
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function mark(kind, ids) {
    if (!ids || !ids.length) return;
    var st = load(), list = st[kind] || [];
    ids.forEach(function (x) { if (list.indexOf(x) < 0) list.push(x); });
    st[kind] = list.slice(-30);
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked: counted per page view instead */ }
  }
  function send(kind, leaving) {
    if (sent[kind]) return; sent[kind] = 1;
    var body = JSON.stringify({ e: kind, p: location.pathname, done: load()[kind] || [] });
    // leaving the page (order link): the answer may never arrive, so mark the tests already known for this page now
    if (leaving) mark(kind, on.map(function (t) { return t.split('.')[0]; }));
    try {
      fetch('/api/ab/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, credentials: 'same-origin', keepalive: true })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.on) on = j.on; if (j && j.counted) mark(kind, j.counted); if (j && j.on) D.documentElement.setAttribute('data-ab', j.on.join(' ')); })
        .catch(function () {});
    } catch (e) { /* old browser */ }
  }
  var CART = /\/cart\.php\?[^#]*\b(a=add|pid=)|\/store\/[^?#]+/i;
  D.addEventListener('click', function (e) {
    var el = e.target && e.target.closest && e.target.closest('a[href], button[type="submit"], .hp-btn');
    if (!el) return;
    var href = el.getAttribute('href') ? el.href : '';
    if (href && CART.test(href)) { send('cta', true); send('cart', true); return; }
    if (el.classList.contains('hp-btn') || el.matches('button[type="submit"]')) send('cta', false);
  }, true);
  D.addEventListener('submit', function (e) {
    var f = e.target; if (f && /\/cart\.php/i.test(f.getAttribute('action') || '')) { send('cta', true); send('cart', true); }
  }, true);
  send('view', false);
})();
