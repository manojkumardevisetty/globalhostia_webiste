/* GlobalHostia account app (PWA) service worker, scope /account.
   Caches ONLY public static files (theme CSS/JS, fonts, images, icons) and the offline page.
   Account pages and every /account response (HTML, JSON, CSV) always go to the network and are never stored:
   they are private to the signed-in customer. Also shows web push notifications. */
"use strict";
var VERSION = "gh-account-v2"; // v2: offline page in the shared error-page style
var SHELL = ["/pwa-offline.htm", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("gh-account-") === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isStatic(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.indexOf("/account") === 0) return false; // never cache anything under /account
  return /^\/hp\/.+\.(css|js|woff2|png|jpg|jpeg|webp|svg|avif)$/.test(url.pathname) ||
    /^\/(icon-192|icon-512|icon-maskable-512|apple-touch-icon|favicon-32x32|favicon-16x16)\.png$/.test(url.pathname) || url.pathname === "/favicon.ico";
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (req.mode === "navigate") {
    // network only; when offline, the static offline page (no account data)
    if (url.origin === self.location.origin && url.pathname.indexOf("/account") === 0) {
      e.respondWith(fetch(req).catch(function () { return caches.match("/pwa-offline.htm"); }));
    }
    return;
  }
  if (!isStatic(url)) return;
  // static files: cache first, refreshed in the background (versioned URLs change on every deploy)
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        var cc = res.headers.get("cache-control") || "";
        if (res.ok && res.type === "basic" && !/private|no-store/.test(cc)) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "GlobalHostia", body: e.data ? e.data.text() : "" }; }
  var url = typeof d.url === "string" && d.url.indexOf("/account") === 0 ? d.url : "/account";
  e.waitUntil(self.registration.showNotification(d.title || "GlobalHostia", {
    body: d.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: d.tag || undefined, renotify: !!d.tag, data: { url: url },
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/account";
  if (url.indexOf("/account") !== 0) url = "/account";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (new URL(c.url).pathname.indexOf("/account") === 0 && "focus" in c) { c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
