/* CinoCode Service Worker — V23
 * Amaç: PWA kurulabilirliği + temel çevrimdışı kabuk.
 * Bilinçli kapsam dışı (V24): çevrimdışı sohbet, çevrimdışı AI, çevrimdışı veritabanı.
 */
const CACHE_VERSION = "cinocode-v23-1";
const PRECACHE_URLS = [
  "cinocode_chat.html",
  "manifest.json",
  "assets/css/main.css",
  "assets/js/main.js",
  "assets/js/auth-core.js",
  "assets/js/tts-core.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // Tek bir dosya eksikse kurulumun tamamen çökmemesi için tek tek ekliyoruz.
      .then((cache) => Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isCacheableStatic(url) {
  return /\.(css|js|png|svg|woff2?|ico)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Aynı origin dışına ve serverless fonksiyonlara asla karışma:
  // API anahtarı taşıyan/kişiselleştirilmiş yanıtlar önbelleğe alınmamalı.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/.netlify/")) return;

  // HTML gezinmeleri: ağ önce, çevrimdışıysa önbellekten kabuk.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("cinocode_chat.html")))
    );
    return;
  }

  // Statik varlıklar: önbellek önce, arkada tazele.
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
  }
});
