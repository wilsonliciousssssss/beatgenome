/* BeatGenome service worker (V53) - network-first with offline fallback */
var CACHE = "beatgenome-v75";
var CORE = [
  "./", "./index.html",
  "./assets/styles.css?v=75", "./assets/data.js?v=75", "./assets/layout-manager.js?v=75",
  "./assets/app.js?v=75", "./assets/audio-profiles.js?v=75", "./assets/audio-engine.js?v=75",
  "./assets/audio-ui.js?v=75", "./assets/about-me.jpg?v=75",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png", "./assets/icons/apple-touch-icon.png?v=75"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        if (hit) return hit;
        if (e.request.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
