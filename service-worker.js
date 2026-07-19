// 오늘 뭐 먹지 — 서비스 워커 (오프라인 캐시)
const CACHE = "todayeat-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // 실시간 API(/api/)는 캐시하지 않고 항상 네트워크로.
  if (new URL(req.url).pathname.startsWith("/api/")) {
    e.respondWith(fetch(req).catch(() => new Response('{"items":[]}', { headers: { "Content-Type": "application/json" } })));
    return;
  }
  // 그 외: 캐시 우선 → 없으면 네트워크 → 저장. 실패 시 앱 셸로 폴백.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
