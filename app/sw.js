// Offline support: app shell is precached; stroke data and audio are cached the first time they're used.
const VERSION = "v16";
const SHELL = ["./", "index.html", "styles.css?v=16", "js/app.js?v=16", "js/srs.js?v=16", "js/store.js?v=16", "js/sync.js?v=16", "js/grade.js?v=16", "js/bao.js?v=16",
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
  const isAudioList = path.endsWith("/audio/index.json");
  const bucket = isAudioList ? "hsk-audio" : path.includes("/audio/") ? "hsk-audio" : path.includes("/data/strokes/") ? "hsk-strokes" : `shell-${VERSION}`;
  // The page, unstamped data files and the audio list: answer instantly from the phone's copy and
  // refresh that copy in the background, so launching never waits on the network. New app code
  // arrives through a new service worker (sw.js changes with every version), and the page reloads
  // itself onto it at launch (see app.js).
  if (bucket.startsWith("shell-") && !url.search || isAudioList) {
    const net = caches.open(bucket).then(cache => fetch(e.request.url, { cache: "no-cache" })
      .then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }));
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match(e.request).then(hit => hit || net).catch(() => Response.error()));
    return;
  }
  // stamped app code (?v=N never changes once published), stroke data and audio clips: cache first
  e.respondWith((async () => {
    const cache = await caches.open(bucket);
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
