/* Blog article behaviours: copy-link button and table-of-contents highlight (no layout animation). */
(function () {
  'use strict';
  // copy link
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy');
      var box = b.closest('.bl-share');
      var msg = box && box.querySelector('.bl-share__ok');
      var done = function (ok) { if (msg) { msg.textContent = ok ? 'Link copied' : 'Copy failed'; setTimeout(function () { msg.textContent = ''; }, 2500); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
      else {
        try { var t = document.createElement('textarea'); t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); done(document.execCommand('copy')); t.remove(); } catch (e) { done(false); }
      }
    });
  });

  // TOC: mark the section currently being read
  var links = Array.prototype.slice.call(document.querySelectorAll('.bl-toc:not(.bl-toc--m) a[href^="#"]'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  var byId = {};
  links.forEach(function (a) { byId[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
  var heads = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);
  var visible = new Set();
  var set = function (id) { links.forEach(function (a) { a.classList.toggle('is-on', a === byId[id]); if (a === byId[id]) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); };
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
    var cur = null;
    if (visible.size) cur = heads.filter(function (h) { return visible.has(h); })[0];
    else { // between headings: last heading above the viewport
      for (var i = 0; i < heads.length; i++) if (heads[i].getBoundingClientRect().top < 120) cur = heads[i];
    }
    if (cur) set(cur.id);
  }, { rootMargin: '-90px 0px -55% 0px' });
  heads.forEach(function (h) { io.observe(h); });

  // the mobile TOC closes after a jump
  document.querySelectorAll('.bl-toc--m a').forEach(function (a) { a.addEventListener('click', function () { var d = a.closest('details'); if (d) d.open = false; }); });
})();
