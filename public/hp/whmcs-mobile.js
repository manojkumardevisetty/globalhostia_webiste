/* GlobalHostia client area: phone helpers for markup the CSS can't select by class (see whmcs-mobile.css).
   Loaded by the first line of public/hp/whmcs.js. Only acts at max-width 767px; pure progressive enhancement.
   - .ghm-fab on floating launchers (theme or third-party chat bubbles) so they shrink and clear the content,
     and --ghm-pad on <html> = room the tallest one needs under the page content
   - .ghm-stack on forms where a button is drawn over its input (promo code "Validate Code" and similar)
   - .ghm-scroll wrapper around tables wider than their card
   - form text below 16px raised to 16px (iOS Safari zooms the page into smaller inputs); larger text is left alone
   - .ghm-cur on a header currency label ("USD", "$ USD", "Currency") that has no known class */
(function () {
  'use strict';
  if (window.GH_MOBILE_JS) return; window.GH_MOBILE_JS = 1;
  var mq = window.matchMedia ? window.matchMedia('(max-width: 767px)') : null;
  if (!mq) return;
  var D = document, root = D.documentElement;
  function vis(el) { var cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0; }
  function overlap(a, b) { return a.left < b.right - 4 && b.left < a.right - 4 && a.top < b.bottom - 4 && b.top < a.bottom - 4; }

  function fabs() {
    var H = innerHeight, W = innerWidth, need = 0;
    var all = D.body.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.closest('.modal, .gh-wait, .ghh-pal, .ghas-sheet, .ghai-panel, [role=dialog]')) continue;
      var cs = getComputedStyle(el); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.bottom < H - 170 || r.top < H * 0.45) continue;               // only things parked at the bottom
      if (el.classList.contains('gh-wa') || el.classList.contains('ghai-launch')) { need = Math.max(need, H - r.top); continue; }
      if (r.width > 180 || r.height > 140) continue;                       // bars, banners, cookie notices
      if (!el.classList.contains('ghm-fab')) {
        el.classList.add('ghm-fab', (r.left + r.width / 2) > W / 2 ? 'ghm-fab--r' : 'ghm-fab--l');
        r = el.getBoundingClientRect();
      }
      need = Math.max(need, H - r.top);
    }
    root.style.setProperty('--ghm-pad', Math.round(Math.max(64, need) + 16) + 'px');
  }

  function stack() {
    D.querySelectorAll('#main-body form, .site-header form').forEach(function (f) {
      if (f.classList.contains('ghm-stack') || f.closest('.ghm-stack')) return;
      var ins = f.querySelectorAll('input[type=text], input[type=email], input[type=search], input:not([type])');
      var bts = f.querySelectorAll('button, .btn, input[type=submit]');
      if (ins.length !== 1 || !bts.length || !vis(ins[0])) return;
      var ri = ins[0].getBoundingClientRect();
      for (var i = 0; i < bts.length; i++) {
        if (!vis(bts[i])) continue;
        if (overlap(ri, bts[i].getBoundingClientRect())) {
          // stack the closest wrapper that holds both (the form, or an .input-group inside it)
          var w = ins[0].closest('.input-group'); (w && w.contains(bts[i]) ? w : f).classList.add('ghm-stack'); return;
        }
      }
    });
  }

  function tables() {
    D.querySelectorAll('#main-body table').forEach(function (t) {
      if (t.closest('.ghm-scroll, .table-responsive, .table-container, .dataTables_wrapper, .dataTables_scrollBody') || !vis(t)) return;
      var p = t.parentElement; if (!p) return;
      var tr = t.getBoundingClientRect(); // also wrap a table a card clips (overflow:hidden) before it reaches the viewport edge
      if (t.scrollWidth <= p.clientWidth + 2 && tr.right <= innerWidth + 1 && tr.right <= p.getBoundingClientRect().right + 1) return;
      var w = D.createElement('div'); w.className = 'ghm-scroll'; p.insertBefore(w, t); w.appendChild(t);
    });
  }

  function fonts() {
    D.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=submit]):not([type=button]):not([type=image]), select, textarea').forEach(function (el) {
      if (parseFloat(getComputedStyle(el).fontSize) < 16) el.style.setProperty('font-size', '16px', 'important');
    });
  }

  var CUR = /^(currency|[$€£₹]?\s?(usd|aed|eur|gbp|inr|sar|cad|aud|sgd|myr)|(c|a|s)\$\s?[a-z]{3}|rm\s?myr|0\d{2}\s*-\s*[a-z]{3})$/i;
  function currency() {
    if (innerWidth > 575) return;
    D.querySelectorAll('.site-header a, .site-header button, header a, header button').forEach(function (el) {
      if (el.classList.contains('ghm-cur') || el.classList.contains('btn-header-lang') || el.closest('.dropdown-menu, .navbar-collapse, .modal')) return;
      if (CUR.test((el.textContent || '').replace(/\s+/g, ' ').trim()) && vis(el)) el.classList.add('ghm-cur');
    });
  }

  function run() { if (!mq.matches || !D.body) return; try { currency(); } catch (e) {} try { fonts(); } catch (e) {} try { stack(); } catch (e) {} try { tables(); } catch (e) {} try { fabs(); } catch (e) {} }
  function start() { run(); [800, 2500, 6000, 12000].forEach(function (t) { setTimeout(run, t); }); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(run, 250); });
  if (mq.addEventListener) mq.addEventListener('change', run);
})();
