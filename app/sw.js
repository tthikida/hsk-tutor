// Offline support: app shell is precached; stroke data and audio are cached the first time they're used.
const VERSION = "v10";
const SHELL = ["./", "index.html", "styles.css?v=10", "js/app.js?v=10", "js/srs.js?v=10", "js/store.js?v=10", "js/sync.js?v=10",
  "vendor/hanzi-writer.min.js", "data/hsk1.json", "data/charlevels.json", "data/pinyin.json", "data/mascot.json", "manifest.webmanifest", "icon.svg", "icon-180.png"];

// "reload"/"no-cache" make the worker check GitHub for new code instead of trusting the browser's HTTP cache
self.addEventListener("install", e => {
  e.waitUntil(caches.open(`shell-${VERSION}`).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k.startsWith("shell-") && k !== `shell-${VERSION}`).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const path = url.pathname;
  // the audio list changes while clips are being generated: network first
  if (path.endsWith("/audio/index.json")) {
    e.respondWith(fetch(e.request.url, { cache: "no-cache" }).then(r => { const copy = r.clone(); caches.open("hsk-audio").then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request)));
    return;
  }
  const bucket = path.includes("/audio/") ? "hsk-audio" : path.includes("/data/strokes/") ? "hsk-strokes" : `shell-${VERSION}`;
  // app code: network first so updates show up; everything else: cache first
  const networkFirst = bucket.startsWith("shell-");
  e.respondWith((async () => {
    const cache = await caches.open(bucket);
    if (networkFirst) {
      try { const r = await fetch(e.request.url, { cache: "no-cache" }); if (r.ok) cache.put(e.request, r.clone()); return r; }
      catch { return (await cache.match(e.request)) || (await caches.match(e.request, { ignoreSearch: true })); }
    }
    const hit = await cache.match(e.request);
    if (hit) return hit;
    const r = await fetch(e.request);
    if (r.ok) cache.put(e.request, r.clone());
    return r;
  })());
});

// Bao's reminders: pushed by the scheduled GitHub job (tools/remind.mjs)
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch { d = { body: e.data ? e.data.text() : "Study time." }; }
  const jobs = [self.registration.showNotification(d.title || "Bao 包子", {
    body: d.body, icon: "icon-180.png", badge: "icon-180.png", tag: "bao", renotify: true, data: { url: "./" },
  })];
  if (typeof d.badge === "number" && self.navigator.setAppBadge) jobs.push(d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge());
  e.waitUntil(Promise.all(jobs).catch(() => {}));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws =>
    ws.length ? ws[0].focus() : self.clients.openWindow(e.notification.data?.url || "./")));
});
